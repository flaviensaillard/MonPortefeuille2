"""Sonde « mes collectes DGFiP s'écrivent-elles dans Supabase ? » — lecture seule.

Le propriétaire ne doit pas avoir à croire le code sur parole : `docs/VERIFIER-
HISTORIQUE-COLLECTES-DGFIP.sql` est une requête à coller dans Supabase SQL Editor
qui répond par des faits. Encore faut-il que cette sonde soit elle-même sûre et
juste, sinon elle rassure à tort.

Ce test la verrouille sur un PostgreSQL embarqué (aucun projet réel) :

- elle ne contient QU'UN seul `select` : aucun mot-clé d'écriture ne survit à la
  suppression des commentaires et des littéraux (une sonde qui écrirait dans la
  base du propriétaire serait pire que pas de sonde) ;
- avant la migration 013 elle dit NON, et compte 0 source DGFiP autorisée ;
- après 013 elle dit OUI et compte les 11 sources — et sa liste de sources est
  EXACTEMENT celle de la contrainte (sinon une source ajoutée plus tard serait
  silencieusement ignorée par la sonde) ;
- une collecte DGFiP écrite par l'APK fait bouger le compteur et le millésime ;
- les droits affichés sont les vrais : écriture + lecture sur l'historique de
  collecte, lecture seule sur les règles publiées, RLS sur les deux tables ;
- aucune donnée personnelle ne sort : ni user_id, ni adresse, ni montant.

Les migrations sont rejouées SANS leur `begin`/`commit` afin que chaque état
testé reste dans une transaction annulée : la base de la session pytest n'est
jamais laissée dans un état intermédiaire pour les tests suivants.
"""
from __future__ import annotations

import json
import pathlib
import re

import pytest

psycopg = pytest.importorskip("psycopg")
from test_rls import MIGRATIONS, _session, base  # noqa: F401  (fixture PostgreSQL)

REPO = pathlib.Path(__file__).resolve().parent.parent
SONDE = REPO / "docs" / "VERIFIER-HISTORIQUE-COLLECTES-DGFIP.sql"

ECRITURE = re.compile(
    r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|vacuum|"
    r"reindex|cluster|comment|call|do|copy|prepare|execute|deallocate|set|"
    r"reset|listen|notify|lock|merge|refresh|analyze|begin|commit|rollback)\b",
    re.IGNORECASE,
)

# Adresse officielle des revenus 2025, identique à celle des deux autres jeux.
URL_BOFIP_IR = ("https://bofip.impots.gouv.fr/bofip/2491-PGP.html/"
                "identifiant=BOI-IR-LIQ-20-10-20260407")


def _sans_transaction(sql: str) -> str:
    """Retire begin/commit : c'est la transaction du test qui doit décider."""
    return re.sub(r"^\s*(begin|commit)\s*;\s*$", "", sql, flags=re.MULTILINE | re.IGNORECASE)


def _sonder(cur) -> dict[str, str]:
    cur.execute(SONDE.read_text(encoding="utf-8"))
    lignes = cur.fetchall()
    assert len(lignes) == 9, "la sonde doit rendre neuf contrôles"
    return {str(controle): str(resultat) for _, controle, resultat in lignes}


def _cle(sonde: dict[str, str], debut: str) -> str:
    matches = [v for k, v in sonde.items() if k.startswith(debut)]
    assert len(matches) == 1, f"contrôle ambigu ou absent : {debut!r} → {matches}"
    return matches[0]


def test_la_sonde_est_en_lecture_seule():
    texte = SONDE.read_text(encoding="utf-8")
    # Une seule instruction : un unique point-virgule, en fin de requête.
    assert texte.count(";") == 1, "la sonde ne doit contenir qu'une instruction"
    assert texte.rstrip().endswith(";")
    # Ni commentaire ni littéral ne peut servir d'abri à un mot-clé d'écriture :
    # on les retire avant de chercher, pour ne juger que le SQL réellement exécuté.
    sans_commentaires = re.sub(r"--.*$", "", texte, flags=re.MULTILINE)
    sans_litteraux = re.sub(r"'(?:[^']|'')*'", "''", sans_commentaires)
    trouves = sorted({m.group(0).lower() for m in ECRITURE.finditer(sans_litteraux)})
    assert trouves == [], f"mot-clé d'écriture dans la sonde : {trouves}"
    # Et la sonde ne projette aucune colonne personnelle.
    assert "user_id" not in sans_litteraux.replace("'user_id'", ""), \
        "la sonde ne doit pas afficher l'identifiant du propriétaire"


def test_la_sonde_dit_vrai_avant_et_apres_013(base):
    conn, utilisateur_a, _ = base
    cur = conn.cursor()

    # La fixture de session ne rejoue que 001 à 008 : les tables fiscales sont
    # posées ici, une bonne fois pour toutes. Les migrations sont idempotentes
    # (`create table if not exists`, `drop constraint if exists`), donc l'ordre
    # d'exécution des fichiers de tests ne change rien.
    for fichier in ("009_collectes_fiscales.sql", "010_fiscal_annees.sql",
                    "011_fiscal_validation.sql"):
        cur.execute(_sans_transaction((MIGRATIONS / fichier).read_text(encoding="utf-8")))
    conn.execute("commit")

    sql_012 = _sans_transaction(
        (MIGRATIONS / "012_collecte_parametres_fiscaux.sql").read_text(encoding="utf-8"))
    sql_013 = _sans_transaction(
        (MIGRATIONS / "013_collectes_dgfip.sql").read_text(encoding="utf-8"))

    # ------------------------------------------------------ état « avant 013 »
    # Rejouer 012 restaure les contraintes OpenFisca seules, quel que soit
    # l'ordre dans lequel les tests de la session ont tourné.
    cur.execute("begin")
    try:
        cur.execute(sql_012)
        avant = _sonder(cur)
        assert _cle(avant, "Migration 013 appliquée").startswith("NON"), \
            "sans la 013, la sonde doit dire NON et nommer le fichier à exécuter"
        assert "013_collectes_dgfip.sql" in _cle(avant, "Migration 013 appliquée")
        assert _cle(avant, "Sources DGFiP autorisées") == "0"
        assert _cle(avant, "Sources OpenFisca historiques") == "2", \
            "les sources historiques restent autorisées avant comme après"
        assert _cle(avant, "Lignes de collecte DGFiP") == "0"
        assert _cle(avant, "Millésimes de revenus historisés") == "aucun"
    finally:
        conn.execute("rollback")

    # ------------------------------------------------------ état « après 013 »
    cur.execute("begin")
    try:
        cur.execute(sql_013)
        apres = _sonder(cur)
        assert _cle(apres, "Migration 013 appliquée") == "OUI"
        assert _cle(apres, "Sources DGFiP autorisées") == "11"
        assert _cle(apres, "Sources OpenFisca historiques") == "2"

        # Droits réels de l'APK, tels que 009 et 010 les ont posés : la sonde ne
        # doit jamais annoncer plus large que la réalité.
        assert _cle(apres, "Droits de l'APK sur l'historique") == "INSERT, SELECT"
        assert _cle(apres, "Droits de l'APK sur les règles publiées") == "SELECT"
        assert _cle(apres, "Tables fiscales protégées par RLS") == "2"

        # Une collecte écrite par l'APK connectée (RLS réelle) est comptée.
        annee_sonde = 2029  # millésime que nul autre test n'utilise
        avant_insert = int(_cle(_sonder(cur), "Lignes de collecte DGFiP"))
        _session(cur, "authenticated", utilisateur_a)
        cur.execute(
            "insert into pf2_fiscal_collectes "
            "(annee_revenus, source, valeurs, source_url, revision) values (%s,%s,%s,%s,1)",
            (annee_sonde, "dgfip_bofip_ir",
             json.dumps({"bareme": {"tranches": [11700]},
                         "document": {"url": URL_BOFIP_IR, "annee_revenus": annee_sonde,
                                      "libelle": "BOFiP — barème de l'impôt"}}),
             URL_BOFIP_IR),
        )
        apres_insert = _sonder(cur)
        assert int(_cle(apres_insert, "Lignes de collecte DGFiP")) == avant_insert + 1
        assert str(annee_sonde) in _cle(apres_insert, "Millésimes de revenus historisés").split(", ")
        assert _cle(apres_insert, "Clés personnelles dans les lignes DGFiP") == "0"

        # Aucune donnée personnelle ne sort de la sonde : ni identifiant, ni
        # adresse de document, ni valeur de barème.
        rendu = " | ".join(f"{k}={v}" for k, v in apres_insert.items())
        assert utilisateur_a not in rendu
        assert "bofip.impots.gouv.fr" not in rendu
        assert "11700" not in rendu
    finally:
        conn.execute("rollback")


def test_liste_de_la_sonde_egale_liste_de_la_contrainte():
    """Parité : la sonde compte exactement les sources que la 013 autorise.

    Sans ce contrôle, une douzième source ajoutée à la migration serait ignorée
    par la sonde, qui annoncerait « 11 sur 11 » à tort.
    """
    sonde = SONDE.read_text(encoding="utf-8")
    bloc_sonde = re.search(r"with sources_attendues\(n\) as \((.*?)\n\),", sonde, re.DOTALL)
    assert bloc_sonde, "la liste des sources attendues doit être présente dans la sonde"
    dans_sonde = set(re.findall(r"'(dgfip_[a-z0-9_]+)'", bloc_sonde.group(1)))

    sql_013 = re.sub(r"--.*$", "", (MIGRATIONS / "013_collectes_dgfip.sql").read_text(encoding="utf-8"),
                     flags=re.MULTILINE)
    bloc_sql = re.search(r"pf2_fiscal_collectes_source_check check \(source in \((.*?)\)\);",
                         sql_013, re.DOTALL)
    assert bloc_sql, "la contrainte de sources doit être présente dans la migration 013"
    dans_sql = set(re.findall(r"'(dgfip_[a-z0-9_]+)'", bloc_sql.group(1)))

    assert dans_sonde == dans_sql, (
        f"sonde seule : {sorted(dans_sonde - dans_sql)} ; "
        f"migration seule : {sorted(dans_sql - dans_sonde)}")
    assert len(dans_sql) == 11
