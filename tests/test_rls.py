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
- une écriture sans propriétaire (service role) est refusée par le NOT NULL ;
- les cinq tables v1 (Config, Donnees, Historique, Projections, Transaction) :
  anon sans aucun droit, politiques héritées supprimées, propriétaire obligatoire
  (migration 008) ;
- 004 et 008 refusent un marqueur <VOTRE-UID> non remplacé.
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
    cur.execute((MIGRATIONS / "006_twr_valorisation_flux.sql").read_text(encoding="utf-8"))
    cur.execute((MIGRATIONS / "007_inventaire_crypto.sql").read_text(encoding="utf-8"))

    # Tables v1 (hors dépôt, créées par la v1 en production) : elles existent
    # AVANT la migration 008, avec une ligne sans propriétaire qu'elle doit rattacher.
    cur.execute('create table if not exists public."Config" (id bigserial primary key, "Clé" text, "Valeur" text)')
    cur.execute('create table if not exists public."Donnees" (id bigserial primary key, "Ticker" text, "Quantité" text)')
    cur.execute('create table if not exists public."Historique" (id bigserial primary key, "Date" text, "Montant $" text)')
    cur.execute('create table if not exists public."Projections" (id bigserial primary key, "Date" text)')
    cur.execute('create table if not exists public."Transaction" (id bigserial primary key, "Ticker" text)')
    cur.execute("insert into public.\"Config\" (\"Clé\", \"Valeur\") values ('f_pre_existant', 'v1')")
    # Politique publique héritée de la v1 (nom quelconque, inconnu de 008) : 008
    # doit la SUPPRIMER, sans la connaître par son nom.
    cur.execute('alter table public."Config" enable row level security')
    cur.execute(
        'create policy acces_public_heritage on public."Config" '
        'for all to public using (true) with check (true)'
    )

    # Droits par défaut façon Supabase : les rôles API ont les droits de base,
    # les politiques RLS décident ensuite ligne par ligne.
    cur.execute("grant all on all tables in schema public to anon, authenticated, service_role")
    cur.execute("grant all on all sequences in schema public to anon, authenticated, service_role")
    # Migration 008 : protection des tables v1, APRÈS les droits par défaut
    # (qu'elle doit retirer à anon).
    sql_008 = (MIGRATIONS / "008_v1_proprietaire.sql").read_text(encoding="utf-8")
    assert "<VOTRE-UID>" in sql_008, "la migration 008 doit demander l'uid du propriétaire"
    cur.execute(sql_008.replace("<VOTRE-UID>", user_a))

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
# TWR exact : la valorisation juste avant chaque apport est enregistrée
# (revue F-07 — migration 006_twr_valorisation_flux.sql)
# ---------------------------------------------------------------------------
class TestValorisationAvantFlux:
    def test_les_colonnes_de_valorisation_existent(self, base):
        conn, _, _ = base
        cur = conn.cursor()
        cur.execute(
            "select column_name from information_schema.columns "
            "where table_name = 'pf2_apports' and column_name in "
            "('valeur_avant_eur', 'valeur_avant_usd')"
        )
        assert {r[0] for r in cur.fetchall()} == {"valeur_avant_eur", "valeur_avant_usd"}

    def test_l_apport_enregistre_la_valeur_avant(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        _session(cur, "authenticated", user_a)
        cur.execute(
            "insert into pf2_comptes (id, nom, devise, type) "
            "values ('c-twr', 'Courant TWR', 'EUR', 'disponible')"
        )
        cur.execute(
            "select pf2_enregistrer_apport("
            "'2026-02-01', 'apport', 500, null, null, 'Courant TWR', null, "
            "'c-twr', 500, 'depot', '2026-02-01', null, 58000.5, 63250.25)"
        )
        res = cur.fetchone()[0]
        assert res["ok"] is True and res["apport_id"]
        cur.execute(
            "select valeur_avant_eur, valeur_avant_usd from pf2_apports where id = %s",
            (res["apport_id"],),
        )
        eur, usd = cur.fetchone()
        assert float(eur) == pytest.approx(58000.5)
        assert float(usd) == pytest.approx(63250.25)
        conn.execute("rollback")

    def test_l_appel_sans_valorisation_reste_valide(self, base):
        """Apports antérieurs à la 2.1.0 et robots : la valorisation est NULL."""
        conn, user_a, _ = base
        cur = conn.cursor()
        _session(cur, "authenticated", user_a)
        cur.execute(
            "select pf2_enregistrer_apport('2026-02-02', 'apport', 200)"
        )
        res = cur.fetchone()[0]
        assert res["ok"] is True
        cur.execute(
            "select valeur_avant_eur is null and valeur_avant_usd is null "
            "from pf2_apports where id = %s",
            (res["apport_id"],),
        )
        assert cur.fetchone()[0] is True
        conn.execute("rollback")

    def test_la_modification_met_a_jour_la_valorisation(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        _session(cur, "authenticated", user_a)
        cur.execute(
            "select pf2_enregistrer_apport('2026-02-03', 'apport', 300, null, null, "
            "null, null, null, null, null, null, null, 1000, 1100)"
        )
        ap_id = cur.fetchone()[0]["apport_id"]
        cur.execute(
            "select pf2_modifier_apport(%s, '2026-02-03', 'apport', 350, null, null, "
            "null, null, null, null, null, null, null, 2000, 2200)",
            (ap_id,),
        )
        assert cur.fetchone()[0]["ok"] is True
        cur.execute(
            "select montant_eur, valeur_avant_eur, valeur_avant_usd "
            "from pf2_apports where id = %s",
            (ap_id,),
        )
        montant, eur, usd = cur.fetchone()
        assert float(montant) == pytest.approx(350)
        assert float(eur) == pytest.approx(2000)
        assert float(usd) == pytest.approx(2200)
        conn.execute("rollback")

    def test_l_ancienne_signature_a_disparu(self, base):
        """DROP puis CREATE : pas de surcharge qui ferait de l'ombre au RPC."""
        conn, _, _ = base
        cur = conn.cursor()
        cur.execute(
            "select pronargs from pg_proc where proname in "
            "('pf2_enregistrer_apport', 'pf2_modifier_apport')"
        )
        arities = sorted(r[0] for r in cur.fetchall())
        assert arities == [14, 15], arities


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


# ---------------------------------------------------------------------------
# Inventaire crypto hors application (revue 2.0.1 — T-02, migration 007)
# Chaque solde est une donnée personnelle : même protection que les autres pf2_.
# ---------------------------------------------------------------------------
class TestInventaireCrypto:
    def test_anon_ne_lit_aucune_position(self, base):
        conn, _, _ = base
        cur = conn.cursor()
        _session(cur, "anon")
        cur.execute("select count(*) from pf2_inventaire_crypto")
        assert cur.fetchone()[0] == 0
        conn.execute("rollback")

    def test_anon_ne_peut_pas_ecrire(self, base):
        conn, _, _ = base
        cur = conn.cursor()
        _session(cur, "anon")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute(
                "insert into pf2_inventaire_crypto (date, actif, quantite, cout_acquisition_eur) "
                "values ('2025-01-01', 'ETH-USD', 1, 1)"
            )
        conn.execute("rollback")

    def test_le_proprietaire_est_renseigne_et_la_position_lui_appartient(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        _session(cur, "authenticated", user_a)
        cur.execute(
            "insert into pf2_inventaire_crypto (date, actif, quantite, cout_acquisition_eur, source) "
            "values ('2025-01-01', 'ETH-USD', 2, 3000, 'Kraken') returning id, user_id"
        )
        ligne_id, proprietaire = cur.fetchone()
        assert str(proprietaire) == user_a
        conn.execute("commit")

        _session(cur, "authenticated", "00000000-0000-4000-8000-00000000000b")
        cur.execute("select count(*) from pf2_inventaire_crypto where id = %s", (ligne_id,))
        assert cur.fetchone()[0] == 0
        cur.execute("delete from pf2_inventaire_crypto where id = %s", (ligne_id,))
        assert cur.rowcount == 0
        conn.execute("rollback")

        _session(cur, "authenticated", user_a)
        cur.execute("delete from pf2_inventaire_crypto where id = %s", (ligne_id,))
        conn.execute("commit")

    def test_une_quantite_negative_est_refusee(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        _session(cur, "authenticated", user_a)
        with pytest.raises(psycopg.errors.CheckViolation):
            cur.execute(
                "insert into pf2_inventaire_crypto (date, actif, quantite, cout_acquisition_eur) "
                "values ('2025-01-01', 'ETH-USD', -1, 1)"
            )
        conn.execute("rollback")


# ---------------------------------------------------------------------------
# Tables v1 encore lues par l'application (revue 2.0.1, S-01 étendu — migration 008)
# ---------------------------------------------------------------------------
TABLES_V1 = ("Config", "Donnees", "Historique", "Projections", "Transaction")


class TestTablesV1:
    def test_anon_ne_lit_aucune_ligne_v1(self, base):
        """008 retire à anon le droit de lecture : la requête est refusée (42501),
        ce qui est plus strict que « zéro ligne » (la RLS seule)."""
        conn, _, _ = base
        cur = conn.cursor()
        for table in TABLES_V1:
            _session(cur, "anon")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                cur.execute(f'select count(*) from public."{table}"')
            conn.execute("rollback")

    def test_anon_n_a_plus_aucun_droit_sur_les_tables_v1(self, base):
        conn, _, _ = base
        cur = conn.cursor()
        for table in TABLES_V1:
            cur.execute(
                "select has_table_privilege('anon', %s, 'select') "
                "or has_table_privilege('anon', %s, 'insert')",
                (f'public."{table}"', f'public."{table}"'),
            )
            assert cur.fetchone()[0] is False, table

    def test_la_politique_publique_heritee_est_supprimee(self, base):
        """Seules les quatre politiques v1_*, réservées à l'utilisateur connecté,
        subsistent : l'accès public hérité de la v1 a disparu."""
        conn, _, _ = base
        cur = conn.cursor()
        for table in TABLES_V1:
            cur.execute(
                "select policyname from pg_policies "
                "where schemaname = 'public' and tablename = %s order by policyname",
                (table,),
            )
            noms = [r[0] for r in cur.fetchall()]
            assert noms == [
                "v1_delete_proprietaire", "v1_insert_proprietaire",
                "v1_select_proprietaire", "v1_update_proprietaire",
            ], table
            cur.execute(
                "select relrowsecurity from pg_class where oid = to_regclass(%s)",
                (f'public."{table}"',),
            )
            assert cur.fetchone()[0] is True, f"RLS inactive sur {table}"

    def test_la_ligne_preexistante_est_rattachee_au_proprietaire(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        cur.execute("select user_id::text from public.\"Config\" where \"Clé\" = 'f_pre_existant'")
        assert cur.fetchone()[0] == user_a

    def test_le_proprietaire_ecrit_et_relit_ses_lignes(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        _session(cur, "authenticated", user_a)
        cur.execute(
            "insert into public.\"Config\" (\"Clé\", \"Valeur\") "
            "values ('f_test_a', '1') returning user_id::text"
        )
        assert cur.fetchone()[0] == user_a
        cur.execute("select count(*) from public.\"Config\" where \"Clé\" = 'f_test_a'")
        assert cur.fetchone()[0] == 1
        conn.execute("rollback")

    def test_un_autre_utilisateur_ne_voit_ni_ne_modifie_les_lignes(self, base):
        conn, user_a, user_b = base
        cur = conn.cursor()
        _session(cur, "authenticated", user_a)
        cur.execute(
            "insert into public.\"Config\" (\"Clé\", \"Valeur\") "
            "values ('f_prive_a', 'secret') returning id"
        )
        ligne_id = cur.fetchone()[0]
        conn.execute("commit")

        _session(cur, "authenticated", user_b)
        cur.execute("select count(*) from public.\"Config\" where id = %s", (ligne_id,))
        assert cur.fetchone()[0] == 0
        cur.execute("update public.\"Config\" set \"Valeur\" = 'pirate' where id = %s", (ligne_id,))
        assert cur.rowcount == 0
        conn.execute("rollback")

        _session(cur, "authenticated", user_a)
        cur.execute("delete from public.\"Config\" where id = %s", (ligne_id,))
        conn.execute("commit")

    def test_une_ecriture_serveur_sans_proprietaire_est_refusee(self, base):
        """Robot ou Streamlit sans SUPABASE_USER_ID : la base refuse, sans repli.
        Comme le service role de Supabase (BYPASSRLS), l'écriture serveur s'exécute
        hors RLS : seule la contrainte NOT NULL la retient."""
        conn, _, _ = base
        cur = conn.cursor()
        with pytest.raises(psycopg.errors.NotNullViolation):
            cur.execute("insert into public.\"Historique\" (\"Date\") values ('01/01/2026')")

    def test_la_migration_est_rejouable_et_ignore_une_table_absente(self, base):
        conn, user_a, _ = base
        cur = conn.cursor()
        sql = (MIGRATIONS / "008_v1_proprietaire.sql").read_text(encoding="utf-8")
        sql = sql.replace("<VOTRE-UID>", user_a)
        cur.execute("begin")
        try:
            cur.execute('drop table public."Transaction"')
            cur.execute(sql)          # table absente : ignorée, pas d'erreur
        finally:
            conn.execute("rollback")  # même en cas d'échec : pas de transaction orpheline
        cur.execute(sql)              # rejeu complet sur la base réelle : sans erreur


# ---------------------------------------------------------------------------
# Garde du propriétaire : un script sans uid valide ne s'exécute pas
# ---------------------------------------------------------------------------
class TestGardeDuUid:
    """Checklist de mise en service, étape 4 : le marqueur <VOTRE-UID> non
    remplacé arrête 004 et 008, même quand il n'y a aucune ligne à rattacher.
    Sans cela, un script oublié passerait en silence sur une base vide."""

    @pytest.mark.parametrize("fichier", ["004_auth_rls.sql", "008_v1_proprietaire.sql"])
    def test_le_marqueur_non_remplace_est_refuse(self, base, fichier):
        conn, _, _ = base
        cur = conn.cursor()
        sql = (MIGRATIONS / fichier).read_text(encoding="utf-8")
        assert "<VOTRE-UID>" in sql
        cur.execute("begin")
        try:
            with pytest.raises(psycopg.errors.RaiseException, match="uid du propriétaire"):
                cur.execute(sql)
        finally:
            conn.execute("rollback")
