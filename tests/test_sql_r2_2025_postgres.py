"""Exécute le SQL de proposition sur PostgreSQL EMBARQUÉ seulement, jamais Supabase."""

from uuid import uuid4

import pytest

pgserver = pytest.importorskip("pgserver")
psycopg = pytest.importorskip("psycopg")

from jobs.preparer_sql_r2_2025 import MARQUEUR_UID, sql_hors_ligne
from jobs.preparer_revision_fiscale_2025 import SOURCE_REVISION_1


@pytest.fixture()
def base(tmp_path):
    pg = pgserver.get_server(str(tmp_path / "postgres_r2"))
    with psycopg.connect(pg.get_uri(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("create schema auth")
            cur.execute("create table auth.users (id uuid primary key)")
            cur.execute("create function auth.uid() returns uuid language sql stable as $$select null::uuid$$")
            for role in ("anon", "authenticated", "service_role"):
                cur.execute("select 1 from pg_roles where rolname=%s", (role,))
                if cur.fetchone() is None:
                    cur.execute(f"create role {role} nologin")
            cur.execute("create table public.pf2_fiscal_collectes (user_id uuid, annee_revenus int, source text, primary key(user_id,annee_revenus,source))")
            for nom in ("010_fiscal_annees.sql", "011_fiscal_validation.sql"):
                with open(__import__("pathlib").Path(__file__).resolve().parents[1] / "migrations" / nom, encoding="utf-8") as fichier:
                    cur.execute(fichier.read())
            uids = [str(uuid4()), str(uuid4())]
            for uid in uids:
                cur.execute("insert into auth.users (id) values (%s)", (uid,))
                for annee in range(2022, 2027):
                    cur.execute("""insert into public.pf2_fiscal_annees
                        (user_id,annee_revenus,revision,parametres,origine,source_ref)
                        values (%s,%s,1,%s::jsonb,'reprise_code_non_verifiee',%s)""",
                        (uid, annee, '{"bareme":{},"prelevements_sociaux":0.172,"ir_forfaitaire":0.128,"abattement_10":{},"forfait_repas":5.45,"bareme_km":{}}', SOURCE_REVISION_1))
        yield conn, uids


def test_insertion_atomique_un_seul_compte_r1_inchangees(base):
    conn, (cible, autre) = base
    with conn.cursor() as cur:
        cur.execute("select user_id,annee_revenus,revision,parametres::text,actif from public.pf2_fiscal_annees order by 1,2,3")
        avant = cur.fetchall()
        sql = sql_hors_ligne().replace(MARQUEUR_UID, cible)
        cur.execute(sql)
        cur.execute("select user_id,annee_revenus,revision,parametres::text,actif from public.pf2_fiscal_annees order by 1,2,3")
        apres = cur.fetchall()
        assert len(apres) == len(avant) + 1
        assert [ligne for ligne in apres if ligne[2] == 1] == avant
        r2 = [ligne for ligne in apres if ligne[2] == 2]
        assert len(r2) == 1 and str(r2[0][0]) == cible
        assert (r2[0][1], r2[0][4]) == (2025, True)
        assert all(str(ligne[0]) != autre for ligne in r2)
        with pytest.raises(psycopg.Error):
            cur.execute(sql)  # pas de réexécution silencieuse
        conn.rollback()
        cur.execute("select count(*) from public.pf2_fiscal_annees")
        assert cur.fetchone()[0] == 11


def test_uid_inconnu_ou_r1_active_refuses_sans_ecriture(base):
    conn, (cible, _) = base
    with conn.cursor() as cur:
        with pytest.raises(psycopg.Error):
            cur.execute(sql_hors_ligne().replace(MARQUEUR_UID, str(uuid4())))
        conn.rollback()
        cur.execute("update public.pf2_fiscal_annees set statut_validation='brouillon' where user_id=%s and annee_revenus=2025", (cible,))
        with pytest.raises(psycopg.Error):
            cur.execute(sql_hors_ligne().replace(MARQUEUR_UID, cible))
        conn.rollback()
        cur.execute("select count(*) from public.pf2_fiscal_annees")
        assert cur.fetchone()[0] == 10
