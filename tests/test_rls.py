"""RLS réel : un `anon` ne peut ni lire ni écrire, chaque utilisateur ne voit
que ses lignes (revue 2.0.1, constat S-01 — migration 004_auth_rls.sql).

Aucun Supabase live n'est nécessaire : un PostgreSQL embarqué (pgserver) rejoue
les migrations du dépôt avec une copie fidèle du contexte Supabase (schéma
`auth`, `auth.users`, `auth.uid()`, rôles `anon` / `authenticated`).

Ce qui est verrouillé ici (tout était permis avant 004) :
- SELECT `anon` : zéro ligne sur les neuf tables pf2_ ;
- INSERT/UPDATE/DELETE `anon` : refusés (42501) ;
- un utilisateur B ne lit ni ne modifie les lignes de A ;
- un utilisateur A lit/modifie/supprime ses propres lignes ;
- les RPC couplées (titre + mouvement, apport + mouvement) sont atomiques :
  un échec entre les deux écritures ne laisse AUCUNE orpheline ;
- le rejeu d'une commande idempotente ne duplique rien ;
- les RPC sont refusées à `anon` (pas de EXECUTE) ;
- une écriture sans propriétaire (service role) est refusée par le NOT NULL.
"""

from __future__ import annotations

import json
import pathlib
import uuid

import pytest

pgserver = pytest.importorskip("pgserver")
psycopg = pytest.importorskip("psycopg")

REPO = pathlib.Path(__file__).resolve().parent.parent
MIGRATIONS = REPO / "migrations"

TABLES_PF2 = (
    "pf2_transactions", "pf2_apports", "pf2_snapshots", "pf2_cours",
    "pf2_fx", "pf2_inflation", "pf2_alertes", "pf2_comptes",
    "pf2_operations_compte",
)


@pytest.fixture(scope="session")
def base(tmp_path_factory):
    """PostgreSQL embarqué + migrations du dépôt, contexte Supabase simulé."""
    datadir = str(tmp_path_factory.mktemp("pg_rls"))
    pg = pgserver.get_server(datadir)
    conn = psycopg.connect(pg.get_uri(), autocommit=True)
    cur = conn.cursor()

    # Contexte Supabase : schéma auth, utilisateurs, rôles API.
    cur.execute("create schema if not exists auth")
    cur.execute("create table if not exists auth.users (id uuid primary key, email text)")
    # Définition fidèle à celle de Supabase : tolère un claims vide/absent.
    cur.execute("""
        create or replace function auth.uid() returns uuid
        language sql stable as $$
          select nullif(
            nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
          '')::uuid
        $$
    """)
    for role in ("anon", "authenticated", "service_role"):
        cur.execute("select 1 from pg_roles where rolname = %s", (role,))
        if cur.fetchone() is None:
            cur.execute(f"create role {role} nologin")
    cur.execute("grant usage on schema public to anon, authenticated, service_role")

    # Migrations du dépôt, dans l'ordre de production.
    user_a, user_b = str(uuid.uuid4()), str(uuid.uuid4())
    cur.execute(
        "insert into auth.users (id, email) values (%s, %s), (%s, %s)",
        (user_a, "foyer-a@exemple.fr", user_b, "foyer-b@exemple.fr"),
    )
    for fichier in ("001_init.sql", "002_rls.sql", "003_comptes.sql"):
        cur.execute((MIGRATIONS / fichier).read_text(encoding="utf-8"))
    sql_004 = (MIGRATIONS / "004_auth_rls.sql").read_text(encoding="utf-8")
    assert "<VOTRE-UID>" in sql_004, "la migration doit demander l'uid du propriétaire"
    cur.execute(sql_004.replace("<VOTRE-UID>", user_a))
    cur.execute((MIGRATIONS / "005_snapshot_complet.sql").read_text(encoding="utf-8"))

    # Droits par défaut façon Supabase : les rôles API ont les droits de base,
    # les politiques RLS décident ensuite ligne par ligne.
    cur.execute("grant all on all tables in schema public to anon, authenticated, service_role")
    cur.execute("grant all on all sequences in schema public to anon, authenticated, service_role")

    yield conn, user_a, user_b
    conn.close()


def _session(cur, role: str, sub: str | None = None):
    """Ouvre une transaction en tant que rôle API, avec les claims JWT voulus."""
    cur.execute("begin")
    cur.execute("select set_config('role', %s, true)", (role,))
    if sub:
        cur.execute(
            "select set_config('request.jwt.claims', %s, true)",
            (json.dumps({"sub": sub}),),
        )


# ---------------------------------------------------------------------------
# anon : aucune lecture, aucune écriture
# ---------------------------------------------------------------------------
class TestAnon:
    def test_anon_ne_lit_aucune_ligne(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        _session(cur, "anon")
        for table in TABLES_PF2:
            cur.execute(f"select count(*) from {table}")
            assert cur.fetchone()[0] == 0, f"{table} lisible par anon"
        conn.execute("rollback")

    def test_anon_ne_peut_pas_inserer(self, base):
        conn, _, _ = base
        cur = conn.cursor()
        _session(cur, "anon")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute(
                "insert into pf2_transactions (ticker, sens, date, quantite, cours, devise) "
                "values ('PIRATE.L', 'achat', '2026-01-01', 1, 1, 'EUR')"
            )
        conn.execute("rollback")

    def test_anon_ne_peut_pas_modifier_ni_supprimer(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        _session(cur, "authenticated", user_a)
        cur.execute(
            "insert into pf2_transactions (ticker, sens, date, quantite, cours, devise) "
            "values ('IGLN.L', 'achat', '2026-01-02', 1, 40, 'USD') returning id"
        )
        tx_id = cur.fetchone()[0]
        conn.execute("commit")

        _session(cur, "anon")
        cur.execute("update pf2_transactions set cours = 0 where id = %s", (tx_id,))
        assert cur.rowcount == 0
        cur.execute("delete from pf2_transactions where id = %s", (tx_id,))
        assert cur.rowcount == 0
        conn.execute("rollback")

        _session(cur, "authenticated", user_a)
        cur.execute("delete from pf2_transactions where id = %s", (tx_id,))
        conn.execute("commit")


# ---------------------------------------------------------------------------
# Séparation par utilisateur
# ---------------------------------------------------------------------------
class TestSeparationParUtilisateur:
    def test_chacun_ne_voit_que_ses_lignes(self, base):
        conn, user_a, user_b = base
        cur = conn.cursor()

        _session(cur, "authenticated", user_a)
        cur.execute(
            "insert into pf2_comptes (id, nom, devise, type) values "
            "('c-a', 'Courtage A', 'USD', 'disponible')"
        )
        conn.execute("commit")

        _session(cur, "authenticated", user_b)
        cur.execute("select count(*) from pf2_comptes")
        assert cur.fetchone()[0] == 0, "l'utilisateur B voit le compte de A"
        cur.execute("update pf2_comptes set nom = 'piraté' where id = 'c-a'")
        assert cur.rowcount == 0
        cur.execute("delete from pf2_comptes where id = 'c-a'")
        assert cur.rowcount == 0
        conn.execute("rollback")

        _session(cur, "authenticated", user_a)
        cur.execute("select count(*) from pf2_comptes where id = 'c-a'")
        assert cur.fetchone()[0] == 1
        cur.execute("delete from pf2_comptes where id = 'c-a'")
        conn.execute("commit")

    def test_une_ecriture_sans_auth_uid_est_refusee(self, base):
        """Une requête « authenticated » sans uid (jeton vide) n'écrit rien :
        la politique with check exige auth.uid() = user_id."""
        conn, _, _ = base
        cur = conn.cursor()
        _session(cur, "authenticated", None)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute(
                "insert into pf2_alertes (titre, message) values ('x', 'y')"
            )
        conn.execute("rollback")


# ---------------------------------------------------------------------------
# RPC atomiques (revue D-03) : titre + mouvement, ou rien
# ---------------------------------------------------------------------------
class TestRpcAtomiques:
    def test_transaction_et_mouvement_ecrits_ensemble(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        _session(cur, "authenticated", user_a)
        cur.execute(
            "insert into pf2_comptes (id, nom, devise, type) "
            "values ('c-rpc', 'Courtage RPC', 'USD', 'disponible')"
        )
        cur.execute(
            "select pf2_enregistrer_transaction("
            "'IGLN.L', 'achat', '2026-01-05', 10, 40.5, 0, 'USD', 'appli', "
            "null, null, 'c-rpc', -405.0, 'achat_titres', '2026-01-05')"
        )
        res = cur.fetchone()[0]
        assert res["ok"] is True and res["transaction_id"] and res["operation_id"]
        cur.execute(
            "select count(*) from pf2_operations_compte where transaction_id = %s",
            (res["transaction_id"],),
        )
        assert cur.fetchone()[0] == 1
        conn.execute("rollback")

    def test_une_panne_entre_les_ecritures_ne_laisse_aucune_orpheline(self, base):
        """Le compte n'existe pas : la seconde écriture échoue. La première
        DOIT être annulée avec elle — c'est une seule transaction PostgreSQL."""
        conn, user_a, _ = base
        cur = conn.cursor()
        _session(cur, "authenticated", user_a)
        cur.execute("select count(*) from pf2_transactions")
        avant = cur.fetchone()[0]
        with pytest.raises(psycopg.errors.RaiseException):
            cur.execute(
                "select pf2_enregistrer_transaction("
                "'IGLN.L', 'achat', '2026-01-06', 5, 41.0, 0, 'USD', 'appli', "
                "null, null, 'COMPTE_INEXISTANT', -205.0, 'achat_titres', '2026-01-06')"
            )
        conn.execute("rollback")

        _session(cur, "authenticated", user_a)
        cur.execute("select count(*) from pf2_transactions")
        assert cur.fetchone()[0] == avant, "une transaction orpheline a été écrite"
        cur.execute("select count(*) from pf2_operations_compte")
        assert cur.fetchone()[0] == 0
        conn.execute("rollback")

    def test_le_rejeu_idempotent_ne_duplique_rien(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        cle = str(uuid.uuid4())
        _session(cur, "authenticated", user_a)
        appel = (
            "select pf2_enregistrer_transaction("
            "'IGLN.L', 'achat', '2026-01-09', 2, 41.0, 0, 'USD', 'appli', "
            "null, null, null, null, null, null, null, %s::uuid)"
        )
        cur.execute(appel, (cle,))
        premier = cur.fetchone()[0]
        cur.execute(appel, (cle,))
        second = cur.fetchone()[0]
        assert premier["ok"] is True and "transaction_id" in premier
        assert second.get("deja_ecrit") is True
        cur.execute(
            "select count(*) from pf2_transactions where idempotence = %s::uuid", (cle,)
        )
        assert cur.fetchone()[0] == 1
        conn.execute("rollback")

    def test_rpc_refusee_a_anon(self, base):
        conn, _, _ = base
        cur = conn.cursor()
        _session(cur, "anon")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute(
                "select pf2_enregistrer_transaction("
                "'X', 'achat', '2026-01-07', 1, 1, 0, 'EUR')"
            )
        conn.execute("rollback")

    def test_rpc_refusee_sur_le_compte_d_autrui(self, base):
        conn, user_a, user_b = base
        cur = conn.cursor()
        _session(cur, "authenticated", user_b)
        cur.execute(
            "insert into pf2_comptes (id, nom, devise, type) "
            "values ('c-b', 'Compte B', 'EUR', 'disponible')"
        )
        conn.execute("commit")

        _session(cur, "authenticated", user_a)
        with pytest.raises(psycopg.errors.RaiseException):
            cur.execute(
                "select pf2_enregistrer_transaction("
                "'IGLN.L', 'achat', '2026-01-08', 1, 41.0, 0, 'USD', 'appli', "
                "null, null, 'c-b', -41.0, 'achat_titres', '2026-01-08')"
            )
        conn.execute("rollback")

        _session(cur, "authenticated", user_b)
        cur.execute("delete from pf2_comptes where id = 'c-b'")
        conn.execute("commit")


# ---------------------------------------------------------------------------
# Contrat service role : les robots doivent fournir le propriétaire
# ---------------------------------------------------------------------------
class TestContratServiceRole:
    def test_une_ecriture_sans_proprietaire_est_refusee(self, base):
        """Le superutilisateur (service role) contourne RLS : la garde finale
        est le NOT NULL sur user_id. Un robot qui n'indique pas le propriétaire
        échoue au lieu d'écrire une ligne apatride."""
        conn, _, _ = base
        cur = conn.cursor()
        with pytest.raises(psycopg.errors.NotNullViolation):
            cur.execute(
                "insert into pf2_snapshots "
                "(date, patrimoine_total_eur, patrimoine_investi_eur) "
                "values ('2026-03-01', 100, 100)"
            )

    def test_un_robot_qui_fournit_le_proprietaire_ecrit(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        cur.execute(
            "insert into pf2_snapshots "
            "(date, patrimoine_total_eur, patrimoine_investi_eur, user_id) "
            "values ('2026-03-02', 100, 100, %s)",
            (user_a,),
        )
        _session(cur, "authenticated", user_a)
        cur.execute("select complet from pf2_snapshots where date = '2026-03-02'")
        assert cur.fetchone()[0] is True, "un snapshot sans statut est réputé complet"
        conn.execute("rollback")
        cur.execute("delete from pf2_snapshots where date = '2026-03-02'")


# ---------------------------------------------------------------------------
# Verrou structurel : plus jamais de politique publique
# ---------------------------------------------------------------------------
def _sans_commentaires(sql: str) -> str:
    """Retire les commentaires `--` pour ne contrôler que le SQL exécutable."""
    import re
    return "\n".join(re.sub(r"--.*$", "", ligne) for ligne in sql.splitlines())


def test_la_migration_004_ne_contient_aucune_politique_publique():
    brut = (MIGRATIONS / "004_auth_rls.sql").read_text(encoding="utf-8")
    sql = _sans_commentaires(brut).lower()
    assert "using (true)" not in sql
    assert "with check (true)" not in sql
    # Les quatre gabarits de politique (select/insert/update/delete) sont
    # générés en boucle sur les neuf tables ; chaque gabarit doit porter
    # auth.uid() = user_id.
    for gabarit in ("pf2_select_proprietaire", "pf2_insert_proprietaire",
                    "pf2_update_proprietaire", "pf2_delete_proprietaire"):
        assert gabarit in sql
    assert sql.count("auth.uid() = user_id") >= 4, (
        "les gabarits de politique doivent reposer sur auth.uid() = user_id"
    )
    for table in TABLES_PF2:
        assert f"'{table}'" in sql, f"{table} absente de la boucle de politiques"
    # Les politiques ne doivent plus jamais être accordées à `anon` : aucune
    # clause « TO anon » ne subsiste (les seules mentions d'anon restantes sont
    # les REVOKE qui retirent les droits).
    assert "to anon" not in sql
    assert "anon, authenticated" not in sql


def test_les_politiques_publiques_de_002_sont_supprimees():
    sql = (MIGRATIONS / "004_auth_rls.sql").read_text(encoding="utf-8")
    for table in TABLES_PF2:
        assert f"drop policy if exists pf2_acces_public on {table}" in sql
