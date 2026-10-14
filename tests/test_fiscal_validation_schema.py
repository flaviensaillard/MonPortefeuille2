"""Migration 011 proposée, testée en PostgreSQL embarqué, jamais sur Supabase."""
from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from test_rls import MIGRATIONS, _session, base  # noqa: F401


def test_migration_preserve_r1_refuse_activation_non_validee_et_isole_comptes(base):
    conn, utilisateur_a, utilisateur_b = base
    cur = conn.cursor()
    cur.execute((MIGRATIONS / "009_collectes_fiscales.sql").read_text())
    cur.execute((MIGRATIONS / "010_fiscal_annees.sql").read_text())

    # Propriétaire fictif isolé des données de la fixture ; aucune identité réelle.
    uid = str(uuid4())
    params = {"bareme": {}, "prelevements_sociaux": .172, "ir_forfaitaire": .128,
              "abattement_10": {}, "forfait_repas": 5, "bareme_km": {}}
    cur.execute("insert into auth.users(id) values (%s)", (uid,))
    for annee in (2025, 2026):
        cur.execute(
            "insert into public.pf2_fiscal_annees"
            "(user_id, annee_revenus, revision, parametres, origine, source_ref) "
            "values (%s,%s,1,%s,'reprise_code_non_verifiee','historique')",
            (uid, annee, json.dumps(params)),
        )

    sql = (MIGRATIONS / "011_fiscal_validation.sql").read_text()
    cur.execute(sql)
    cur.execute(sql)  # idempotent, sans homologuer ni activer R1
    cur.execute(
        "select annee_revenus, revision, statut_validation, actif from public.pf2_fiscal_annees "
        "where user_id=%s order by annee_revenus", (uid,),
    )
    assert cur.fetchall() == [
        (2025, 1, "historique_non_verifie", False),
        (2026, 1, "historique_non_verifie", False),
    ]

    with pytest.raises(psycopg.errors.CheckViolation):
        cur.execute(
            "insert into public.pf2_fiscal_annees "
            "(user_id, annee_revenus, revision, parametres, origine, source_ref, actif) "
            "values (%s, 2025, 2, %s, 'nouvelle_publication', 'test', true)",
            (uid, json.dumps(params)),
        )
    cur.execute(
        "insert into public.pf2_fiscal_annees "
        "(user_id, annee_revenus, revision, parametres, origine, source_ref, "
        "statut_validation, perimetre_validation) "
        "values (%s, 2025, 2, %s, 'nouvelle_publication', 'test', 'brouillon', %s)",
        (uid, json.dumps(params), json.dumps({"couverture": "aucune_pour_activation"})),
    )
    cur.execute("select actif from public.pf2_fiscal_annees where user_id=%s and annee_revenus=2025 and revision=2", (uid,))
    assert cur.fetchone() == (False,)
    with pytest.raises(psycopg.errors.CheckViolation):
        cur.execute("update public.pf2_fiscal_annees set actif=true where user_id=%s and annee_revenus=2025 and revision=2", (uid,))

    # Test d'intégrité technique seulement, PAS validation fiscale : même un
    # responsable autorisé ne peut garder deux révisions actives en 2025.
    cur.execute(
        "update public.pf2_fiscal_annees set statut_validation='valide_pour_perimetre', "
        "perimetre_validation=%s, actif=true where user_id=%s and annee_revenus=2025 and revision=2",
        (json.dumps({"couverture": "integrale_parametres_utilises"}), uid),
    )
    with pytest.raises(psycopg.errors.UniqueViolation):
        cur.execute(
            "insert into public.pf2_fiscal_annees "
            "(user_id, annee_revenus, revision, parametres, origine, source_ref, "
            "statut_validation, perimetre_validation, actif) "
            "values (%s, 2025, 3, %s, 'nouvelle_publication', 'test', "
            "'valide_pour_perimetre', %s, true)",
            (uid, json.dumps(params), json.dumps({"couverture": "integrale_parametres_utilises"})),
        )
    cur.execute("select actif from public.pf2_fiscal_annees where user_id=%s and annee_revenus=2026", (uid,))
    assert cur.fetchone() == (False,)

    _session(cur, "authenticated", utilisateur_a)
    cur.execute("select count(*) from public.pf2_fiscal_annees where user_id=%s", (uid,))
    assert cur.fetchone() == (0,)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("update public.pf2_fiscal_annees set actif=true where user_id=%s", (uid,))
    conn.execute("rollback")

    cur.execute("delete from public.pf2_fiscal_annees where user_id=%s", (uid,))
    cur.execute("delete from auth.users where id=%s", (uid,))
