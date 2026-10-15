"""Migration 013 : l'historique des collectes DGFiP s'écrit réellement dans
`pf2_fiscal_collectes`, sans élargir aucun autre droit.

Jusqu'ici la table n'acceptait que deux sources OpenFisca (009 puis 012) et deux
adresses figées : les collectes DGFiP produites par le bouton de l'APK restaient
donc uniquement dans le localStorage de l'appareil. Ce test rejoue 009 → 010 →
011 → 012 → 013 sur un PostgreSQL embarqué (aucun projet Supabase réel) et
verrouille :

- les onze sources DGFiP lues par l'application sont acceptées, chacune avec
  l'adresse officielle réellement lue (BOFiP, aides du simulateur, brochures et
  notices PDF) ;
- une adresse d'un autre hôte, un chemin inventé, ou une source hors liste est
  refusée (23514) : la contrainte reste un garde-fou, pas une formalité ;
- les sources OpenFisca historiques restent acceptées : aucune ligne existante
  ne devient orpheline ;
- la table reste append-only pour l'APK : UPDATE et DELETE refusés (42501), une
  rectification du même millésime passe par la révision suivante ;
- la RLS n'est pas élargie : un compte ne lit pas les lignes d'un autre, `anon`
  n'a toujours aucun droit, et `pf2_fiscal_annees` (règles publiées, R2) reste
  en écriture `service_role` uniquement ;
- la migration 013 est rejouable sans perte.

Aucune donnée personnelle n'est insérée : `valeurs` ne porte que des paramètres
publics (barème, décote, plafond, taux, forfaits) et les références du document.
"""
from __future__ import annotations

import json

import pytest

psycopg = pytest.importorskip("psycopg")
from test_rls import MIGRATIONS, _session, base  # noqa: F401  (fixture PostgreSQL)

# Sources DGFiP autorisées par 013, avec l'adresse officielle réellement lue par
# les lecteurs de l'APK (vérifiées le 16/10/2026). Une seule ligne par source :
# ce test ne rejoue pas une collecte complète, il prouve que la contrainte
# accepte exactement ce que l'application écrit — et rien d'autre.
SOURCES_DGFIP = {
    "dgfip_bofip_ir":
        "https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20260407",
    "dgfip_bofip_decote":
        "https://bofip.impots.gouv.fr/bofip/2495-PGP.html/identifiant=BOI-IR-LIQ-20-20-30-20260407",
    "dgfip_bofip_qf":
        "https://bofip.impots.gouv.fr/bofip/2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20260407",
    "dgfip_frais":
        "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/frais.htm",
    "dgfip_frais_repas":
        "https://www.impots.gouv.fr/particulier/frais-de-repas",
    "dgfip_regimes_titres":
        "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/gains.htm",
    "dgfip_brochure_rcm":
        "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/08-RCM_121a136.pdf",
    "dgfip_brochure_charges":
        "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/12-charges_ded_rev_225a236.pdf",
    "dgfip_brochure_plus_values":
        "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/09-plus_values_137a156.pdf",
    "dgfip_notice_2086":
        "https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf",
    "dgfip_nouveautes":
        "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf",
}

OPENFISCA = (
    "openfisca_bareme_ir",
    "https://api.fr.openfisca.org/latest/parameter/impot_revenu/bareme_ir_depuis_1945/bareme",
)

INSERT = ("insert into pf2_fiscal_collectes "
          "(annee_revenus, source, valeurs, source_url, revision) "
          "values (%s, %s, %s, %s, %s)")


def _rejouer(cur, *fichiers):
    for nom in fichiers:
        cur.execute((MIGRATIONS / nom).read_text(encoding="utf-8"))


def _refus(cur, conn, sql, params, sqlstate):
    """Exécute `sql` en attendant un refus, puis remet la session en état.

    La transaction courante porte le rôle API posé par `_session` : après une
    erreur PostgreSQL elle est avortée, il faut donc la refermer avant de
    poursuivre. Le refus est vérifié par code d'erreur, pas par message.
    """
    with pytest.raises(psycopg.Error) as exc:
        cur.execute(sql, params)
    assert exc.value.sqlstate == sqlstate
    conn.execute("rollback")


def test_collectes_dgfip_ecrites_et_gardees_sous_verrous(base):
    conn, utilisateur_a, utilisateur_b = base
    cur = conn.cursor()

    # 009 → 012 : état de production actuel, avant l'élargissement DGFiP.
    _rejouer(cur, "009_collectes_fiscales.sql", "010_fiscal_annees.sql",
             "011_fiscal_validation.sql", "012_collecte_parametres_fiscaux.sql")

    # Avant 013, une source DGFiP est refusée : c'est le constat qui motive la
    # migration. Revenus 2024 (jamais utilisé par test_fiscal_sql.py, qui écrit
    # 2025) pour éviter toute collision de clé primaire entre tests.
    _session(cur, "authenticated", utilisateur_a)
    _refus(cur, conn, INSERT,
           (2024, "dgfip_bofip_ir", json.dumps({"bareme": {"tranches": [11497]}}),
            SOURCES_DGFIP["dgfip_bofip_ir"], 1), "23514")

    # ------------------------------------------------------------------ 013
    sql_013 = (MIGRATIONS / "013_collectes_dgfip.sql").read_text(encoding="utf-8")
    cur.execute(sql_013)
    cur.execute(sql_013)  # rejouable : ni erreur, ni perte

    # Les onze sources DGFiP passent, chacune avec son adresse officielle.
    _session(cur, "authenticated", utilisateur_a)
    for source, url in SOURCES_DGFIP.items():
        cur.execute(INSERT, (2024, source, json.dumps({"document": {"url": url}}), url, 1))
    conn.execute("commit")

    # La source OpenFisca historique reste acceptée : aucune ligne orpheline.
    _session(cur, "authenticated", utilisateur_a)
    cur.execute(INSERT, (2024, OPENFISCA[0], json.dumps({"tranches": [11497]}), OPENFISCA[1], 1))
    conn.execute("commit")

    _session(cur, "authenticated", utilisateur_a)
    cur.execute("select count(*) from pf2_fiscal_collectes where annee_revenus = 2024")
    assert cur.fetchone()[0] == len(SOURCES_DGFIP) + 1
    conn.execute("rollback")

    # ------------------------------------------------- adresses refusées
    # Un hôte tiers, un chemin inventé, un permalien sans version datée, une
    # brochure d'une autre arborescence : rien de cela n'entre dans la table.
    adresses_refusees = [
        ("dgfip_bofip_ir", "https://bofip.impots.gouv.fr.evil.example/bofip/2491-PGP.html"),
        ("dgfip_bofip_ir", "https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10"),
        ("dgfip_bofip_ir", "http://bofip.impots.gouv.fr/doctrine/BOI-IR-LIQ-20-10"),
        ("dgfip_frais", "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/gains.htm"),
        ("dgfip_frais", "https://www.impots.gouv.fr/particulier/frais-de-repas"),
        ("dgfip_regimes_titres", "https://simulateur-ir-ifi.impots.gouv.fr/aides/gains.htm"),
        ("dgfip_brochure_rcm", "https://www.impots.gouv.fr/brochure/ir_2026/pdf_som/08-RCM_121a136.pdf"),
        ("dgfip_brochure_rcm", "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/08-RCM_121a136.htm"),
        ("dgfip_notice_2086", "https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/notice.pdf"),
        ("dgfip_nouveautes", "https://bofip.impots.gouv.fr/doctrine/BOI-IR-LIQ-20-10"),
    ]
    for source, url in adresses_refusees:
        _session(cur, "authenticated", utilisateur_a)
        _refus(cur, conn, INSERT, (2023, source, json.dumps({"document": {"url": url}}), url, 1),
               "23514")

    # Une source hors liste est refusée, y compris avec une adresse DGFiP valide.
    _session(cur, "authenticated", utilisateur_a)
    _refus(cur, conn, INSERT,
           (2023, "openfisca_parametres", json.dumps({"a": 1}), SOURCES_DGFIP["dgfip_frais"], 1),
           "23514")
    _session(cur, "authenticated", utilisateur_a)
    _refus(cur, conn, INSERT,
           (2023, "dgfip_inconnu", json.dumps({"a": 1}), SOURCES_DGFIP["dgfip_frais"], 1), "23514")

    # -------------------------------------------------------- append-only
    # Une rectification du même millésime crée la révision 2 ; modifier ou
    # supprimer la révision 1 reste impossible pour l'APK.
    _session(cur, "authenticated", utilisateur_a)
    cur.execute(INSERT, (2024, "dgfip_bofip_ir",
                         json.dumps({"bareme": {"tranches": [11500]}}),
                         SOURCES_DGFIP["dgfip_bofip_ir"], 2))
    conn.execute("commit")

    _session(cur, "authenticated", utilisateur_a)
    _refus(cur, conn,
           "update pf2_fiscal_collectes set valeurs = %s where annee_revenus = 2024",
           (json.dumps({"bareme": {"tranches": [0]}}),), "42501")
    _session(cur, "authenticated", utilisateur_a)
    _refus(cur, conn,
           "delete from pf2_fiscal_collectes where annee_revenus = 2024", (), "42501")

    _session(cur, "authenticated", utilisateur_a)
    cur.execute("select revision from pf2_fiscal_collectes "
                "where annee_revenus = 2024 and source = 'dgfip_bofip_ir' order by revision")
    assert [ligne[0] for ligne in cur.fetchall()] == [1, 2]
    conn.execute("rollback")

    # ------------------------------------------------------------- RLS
    # Le compte B ne lit aucune ligne de A, et ne peut pas écrire une ligne au
    # nom de A. `anon` n'a toujours aucun droit. 013 n'a touché ni aux grants ni
    # aux politiques.
    _session(cur, "authenticated", utilisateur_b)
    cur.execute("select count(*) from pf2_fiscal_collectes")
    assert cur.fetchone()[0] == 0
    conn.execute("rollback")

    _session(cur, "authenticated", utilisateur_b)
    _refus(cur, conn,
           "insert into pf2_fiscal_collectes "
           "(user_id, annee_revenus, source, valeurs, source_url, revision) "
           "values (%s, 2024, 'dgfip_bofip_ir', %s, %s, 3)",
           (utilisateur_a, json.dumps({"a": 1}), SOURCES_DGFIP["dgfip_bofip_ir"]), "42501")

    _session(cur, "anon")
    _refus(cur, conn, "select count(*) from pf2_fiscal_collectes", (), "42501")

    # ------------------------------------- pf2_fiscal_annees inchangée
    # 013 n'élargit pas la table des règles publiées : l'APK ne publie toujours
    # aucune révision, la R2 reste écrite par service_role.
    parametres = {"bareme": {}, "prelevements_sociaux": {}, "ir_forfaitaire": 0.128,
                  "abattement_10": {}, "forfait_repas": 5, "bareme_km": {}}
    _session(cur, "authenticated", utilisateur_a)
    _refus(cur, conn,
           "insert into pf2_fiscal_annees "
           "(user_id, annee_revenus, revision, parametres, origine, source_ref) "
           "values (%s, 2024, 1, %s, 'nouvelle_publication', 'test')",
           (utilisateur_a, json.dumps(parametres)), "42501")

    # Écriture serveur : comme le `service_role` de Supabase (BYPASSRLS), elle
    # s'exécute hors RLS — ici en superutilisateur, hors de toute session API
    # (convention déjà utilisée par test_fiscal_sql.py et test_rls.py). Elle
    # prouve que 013 n'a rien retiré au chemin de publication des règles.
    cur.execute("insert into pf2_fiscal_annees "
                "(user_id, annee_revenus, revision, parametres, origine, source_ref) "
                "values (%s, 2024, 1, %s, 'reprise_code_non_verifiee', 'test')",
                (utilisateur_a, json.dumps(parametres)))
    conn.execute("commit")

    # Et l'APK connectée ne lit toujours que ce que le serveur a publié.
    _session(cur, "authenticated", utilisateur_a)
    cur.execute("select count(*) from pf2_fiscal_annees where annee_revenus = 2024")
    assert cur.fetchone()[0] == 1
    conn.execute("rollback")
