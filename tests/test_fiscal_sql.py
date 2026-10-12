"""Migration 009 -> 010 contre PostgreSQL embarqué, avec rôles/RLS Supabase.

La migration ne doit ni perdre l'ancienne collecte ni exposer les données
fiscales d'un propriétaire à un autre. Aucun accès au projet réel.
"""
from __future__ import annotations

import json

import pytest

psycopg = pytest.importorskip("psycopg")
from test_rls import MIGRATIONS, _session, base  # noqa: F401  (fixture PostgreSQL)


def test_revision_et_isolation_apres_migration_rejouee(base):
    conn, utilisateur_a, utilisateur_b = base
    cur = conn.cursor()
    cur.execute((MIGRATIONS / "009_collectes_fiscales.sql").read_text(encoding="utf-8"))
    url = "https://api.fr.openfisca.org/latest/parameter/impot_revenu/bareme_ir_depuis_1945/bareme"

    # Ligne créée avant 010 : la clé primaire initiale ne comportait pas revision.
    _session(cur, "authenticated", utilisateur_a)
    cur.execute(
        "insert into pf2_fiscal_collectes (annee_revenus, source, valeurs, source_url) "
        "values (2025, 'openfisca_bareme_ir', %s, %s)",
        (json.dumps({"tranches": [11497], "taux": [0.11]}), url),
    )
    conn.execute("commit")

    sql = (MIGRATIONS / "010_fiscal_annees.sql").read_text(encoding="utf-8")
    cur.execute(sql)
    cur.execute(sql)  # la seconde exécution est sans perte

    _session(cur, "authenticated", utilisateur_a)
    cur.execute("select revision from pf2_fiscal_collectes where annee_revenus = 2025")
    assert cur.fetchall() == [(1,)]
    cur.execute(
        "insert into pf2_fiscal_collectes (annee_revenus, source, valeurs, source_url, revision) "
        "values (2025, 'openfisca_bareme_ir', %s, %s, 2)",
        (json.dumps({"tranches": [11500], "taux": [0.11]}), url),
    )
    conn.execute("commit")

    parametres = {"bareme": {}, "prelevements_sociaux": {}, "ir_forfaitaire": 0.128,
                  "abattement_10": {}, "forfait_repas": 5, "bareme_km": {}}
    cur.execute(
        "insert into pf2_fiscal_annees "
        "(user_id, annee_revenus, revision, parametres, origine, source_ref) "
        "values (%s, 2025, 1, %s, 'reprise_code_non_verifiee', 'test')",
        (utilisateur_a, json.dumps(parametres)),
    )

    _session(cur, "authenticated", utilisateur_b)
    for table in ("pf2_fiscal_collectes", "pf2_fiscal_annees"):
        cur.execute(f"select count(*) from {table}")
        assert cur.fetchone()[0] == 0
    conn.execute("rollback")

    _session(cur, "anon")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("select * from pf2_fiscal_annees")
    conn.execute("rollback")

    _session(cur, "authenticated", utilisateur_a)
    cur.execute("select revision from pf2_fiscal_collectes order by revision")
    assert cur.fetchall() == [(1,), (2,)]
    cur.execute("select revision from pf2_fiscal_annees")
    assert cur.fetchall() == [(1,)]
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute(
            "insert into pf2_fiscal_annees "
            "(annee_revenus, revision, parametres, origine, source_ref, user_id) "
            "values (2025, 2, %s, 'nouvelle_publication', 'test', %s)",
            (json.dumps(parametres), utilisateur_a),
        )
    conn.execute("rollback")
