"""Contrôle STRICTEMENT en lecture seule des révisions fiscales du propriétaire.

À lancer UNIQUEMENT dans un environnement autorisé à joindre Supabase, avec les
secrets serveur configurés, via --lire-supabase. Aucune insertion, mise à jour,
suppression, sauvegarde ou activation. La comparaison produit un rapport
anonymisé ; une sauvegarde chiffrée et son test de restauration restent requis
avant toute future écriture. Sans --lire-supabase, aucune connexion n'est faite.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from jobs import preparer_revision_fiscale_2025 as prep  # noqa: E402

TABLE = "pf2_fiscal_annees"
CHAMPS = ("user_id,annee_revenus,revision,parametres,origine,source_ref,"
          "statut_validation,perimetre_validation,actif")
ANNEES_HISTORIQUES = (2022, 2023, 2024, 2025, 2026)
CLES_REVISION_1 = frozenset({
    "bareme", "prelevements_sociaux", "ir_forfaitaire", "csg_deductible",
    "abattement_10", "forfait_repas", "bareme_km", "franchise_crypto",
    "or_physique", "incertitude_ps", "mention_source_code_non_verifiee", "avertissement",
})
ATTENDU_CODE_SOURCE_2025 = {
    "bareme.decote_base_celibataire": 898.0,
    "bareme.decote_plafond_celibataire": 1986.0,
    "bareme.decote_base_couple": 1486.0,
    "bareme.decote_plafond_couple": 3284.0,
    "prelevements_sociaux": 0.172,
}


def _canonique(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _empreinte(obj) -> str:
    return hashlib.sha256(_canonique(obj)).hexdigest()


def _obtenir(obj: dict, chemin: str):
    for segment in chemin.split("."):
        if not isinstance(obj, dict) or segment not in obj:
            return None
        obj = obj[segment]
    return obj


def _differences(actuel, candidat, prefixe="") -> list[dict]:
    """Diff complet JSON : ajouts, suppressions et changements, sans arrondir."""
    if isinstance(actuel, dict) and isinstance(candidat, dict):
        sorties = []
        for cle in sorted(actuel.keys() | candidat.keys()):
            chemin = f"{prefixe}.{cle}" if prefixe else cle
            if cle not in actuel:
                sorties.append({"champ": chemin, "operation": "ajout", "avant": None,
                                "apres": candidat[cle]})
            elif cle not in candidat:
                # Ancien champ potentiellement inconnu : ne pas divulguer son
                # contenu dans un journal GitHub ou un artefact de contrôle.
                sorties.append({"champ": chemin, "operation": "retrait_du_brouillon",
                                "empreinte_avant": _empreinte(actuel[cle]), "apres": None})
            else:
                sorties.extend(_differences(actuel[cle], candidat[cle], chemin))
        return sorties
    # JSONB renvoie des listes, alors que les tables Python du code source
    # contiennent des tuples : même suite de valeurs ≠ changement fiscal.
    if isinstance(actuel, (list, tuple)) and isinstance(candidat, (list, tuple)):
        if len(actuel) != len(candidat):
            return [{"champ": prefixe, "operation": "changement", "avant": list(actuel), "apres": list(candidat)}]
        return [diff for i, (a, b) in enumerate(zip(actuel, candidat))
                for diff in _differences(a, b, f"{prefixe}[{i}]")]
    if actuel != candidat:
        return [{"champ": prefixe, "operation": "changement", "avant": actuel, "apres": candidat}]
    return []


def lire_revisions(client, proprietaire: str) -> list[dict]:
    """Unique requête filtrée ; aucune méthode d'écriture n'est appelée."""
    uid = str(UUID(proprietaire))  # refuser un identifiant invalide avant la requête
    response = client.table(TABLE).select(CHAMPS).eq("user_id", uid).execute()
    lignes = response.data
    if not isinstance(lignes, list):
        raise ValueError("Lecture fiscale incomplète ou réponse invalide ; aucun rapport utilisable.")
    if any(ligne.get("user_id") != uid for ligne in lignes):
        raise ValueError("La réponse comprend une ligne d'un autre propriétaire ; rapport refusé.")
    return lignes


def comparer_lignes(lignes: list[dict], candidat: dict | None = None) -> dict:
    """Rapport non publiable, sans user_id ni secrets ; ne modifie aucune ligne."""
    brouillon = candidat or prep.construire_brouillon()
    if brouillon["annee_revenus"] != 2025 or brouillon["etat"] != "incomplet_ne_pas_publier_ni_activer":
        raise ValueError("Seul le brouillon non publiable des revenus 2025 est accepté.")
    problemes = []
    references = {}
    vues = []
    clefs = set()
    for ligne in lignes:
        annee = ligne.get("annee_revenus")
        rev = ligne.get("revision")
        params = ligne.get("parametres")
        if (type(annee) is not int or type(rev) is not int or rev < 1
                or not isinstance(params, dict)
                or "statut_validation" not in ligne or "perimetre_validation" not in ligne
                or "actif" not in ligne):
            raise ValueError("Ligne fiscale ou métadonnées 011 invalides, comparaison arrêtée.")
        if (ligne["statut_validation"] != "historique_non_verifie"
                or ligne["perimetre_validation"] != {} or ligne["actif"] is not False):
            problemes.append(f"Année {annee}/révision {rev} : métadonnées de validation ou activation inattendues.")
        if (annee, rev) in clefs:
            problemes.append(f"Doublon détecté pour {annee}/révision {rev}.")
        clefs.add((annee, rev))
        vues.append({"annee_revenus": annee, "revision": rev, "empreinte_ligne": _empreinte(ligne)})
        if annee != 2025:
            references.setdefault(str(annee), []).append(rev)
    for annee in ANNEES_HISTORIQUES:
        if annee != 2025:
            revisions = sorted(references.get(str(annee), []))
            if revisions != [1]:
                problemes.append(f"Année historique {annee} : révisions lues {revisions}, attendues [1] d'après l'import initial ; examiner avant toute proposition.")
    for annee in references:
        if int(annee) not in ANNEES_HISTORIQUES:
            problemes.append(f"Année {annee} inattendue pour cet import historique ; examiner avant de poursuivre.")
    l2025 = [l for l in lignes if l["annee_revenus"] == 2025]
    # L'ordre de réponse n'est pas garanti.
    if sorted(l["revision"] for l in l2025) != [1]:
        problemes.append("Révisions 2025 lues différentes de [1] : numéro 2 non confirmé, arrêter.")
    avant = next((l for l in l2025 if l["revision"] == 1), None)
    ecarts = []
    empreinte_2025 = None
    if avant is not None:
        if avant.get("origine") != "reprise_code_non_verifiee" or avant.get("source_ref") != prep.SOURCE_REVISION_1:
            problemes.append("Origine ou source de la révision 1 2025 différente du code d'import initial.")
        inconnues = set(avant["parametres"]) - CLES_REVISION_1
        if inconnues:
            problemes.append("Révision 1 : champs inconnus du code d'import : " + ", ".join(sorted(inconnues)))
        for champ, attendu in ATTENDU_CODE_SOURCE_2025.items():
            observe = _obtenir(avant["parametres"], champ)
            if observe != attendu:
                problemes.append(f"Révision 1 : {champ} différent du code source initial (empreinte observée {_empreinte(observe)}).")
        empreinte_2025 = _empreinte(avant)
        ecarts = _differences(avant["parametres"], brouillon["parametres_candidats"])
    return {
        "annee_revenus": 2025,
        "etat": "lecture_seule_brouillon_non_publiable",
        "revision_2_confirmable_sous_reserve": not problemes,
        "ecriture_autorisee": False,  # même sans divergence : audit et sauvegarde non achevés
        "problemes": problemes,
        "empreinte_revision_1_2025": empreinte_2025,
        "annees_autres_revisions_lues": {a: sorted(r) for a, r in sorted(references.items())},
        "empreintes_lignes_pour_controle_apres_ecriture": sorted(vues, key=lambda v: (v["annee_revenus"], v["revision"])),
        "ecarts_code_2025_brouillon_vs_base": ecarts,
        "limite": "Lecture uniquement ; ni sauvegarde ni validation des règles ni insertion. Ne contient pas de ligne à écrire.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lire-supabase", action="store_true",
                        help="Lecture distante filtrée sur le propriétaire ; jamais d'écriture.")
    args = parser.parse_args()
    if not args.lire_supabase:
        parser.error("Aucune connexion implicite : préciser --lire-supabase dans un environnement autorisé.")
    try:
        from jobs import cle_service
        from core import db
        cle_service.configurer()
        uid = db.proprietaire_service()
        if not uid:
            raise ValueError("SUPABASE_USER_ID absent : aucune requête engagée.")
        lignes = lire_revisions(db.client(), uid)
        rapport = comparer_lignes(lignes)
    except Exception as exc:
        # Pas d'URL, de client HTTP ou de secrets dans les logs d'erreur.
        print(f"Contrôle en lecture seule interrompu ({type(exc).__name__}).", file=sys.stderr)
        return 1
    print(json.dumps(rapport, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if rapport["revision_2_confirmable_sous_reserve"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
