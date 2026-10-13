"""Précondition HORS BASE de la migration 011 : archive chiffrée + lecture identiques.

N'effectue aucune requête réseau ni écriture Supabase. Le rapport `--rapport`
provient d'une lecture seule toute récente du même run de sauvegarde. Ne
journalise ni user_id, ni paramètres personnels, ni phrase de chiffrement.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from jobs import restauration  # noqa: E402
from jobs import verifier_revision_fiscale_2025 as lecture  # noqa: E402

CHAMPS_PROJETES = ("user_id", "annee_revenus", "revision", "parametres", "origine", "source_ref")
ATTENDUS = {(annee, 1) for annee in (2022, 2023, 2024, 2025, 2026)}


def controler_archive(chemin: Path, phrase: str) -> dict:
    """Archive entière intégralement restaurée ; table fiscale obligatoire ici."""
    tables = restauration.restaurer_fichier(chemin, phrase)
    lignes = tables.get("pf2_fiscal_annees")
    if not isinstance(lignes, list) or len(lignes) != len(ATTENDUS):
        raise ValueError("Archive fiscale absente ou nombre de lignes inattendu ; migration arrêtée.")
    if any(not isinstance(l, dict) or not all(k in l for k in CHAMPS_PROJETES) for l in lignes):
        raise ValueError("Archive fiscale incomplète ; migration arrêtée.")
    try:
        proprietaires = {str(UUID(l["user_id"])) for l in lignes}
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("Propriétaire fiscal invalide dans l'archive ; migration arrêtée.") from exc
    if len(proprietaires) != 1 or any(l["user_id"] not in proprietaires for l in lignes):
        raise ValueError("Plusieurs propriétaires fiscaux dans l'archive ; migration arrêtée.")
    if {(l["annee_revenus"], l["revision"]) for l in lignes} != ATTENDUS:
        raise ValueError("Années ou révisions fiscales inattendues dans l'archive ; migration arrêtée.")
    # La restauration vérifie déjà AES-GCM, hashes des tables et synthèse.
    # La projection retire `cree_le` absent de la requête SELECT actuelle ; les
    # empreintes doivent être comparables à celles de la lecture vivante.
    rapport = lecture.comparer_lignes([{k: l[k] for k in CHAMPS_PROJETES} for l in lignes])
    if rapport["problemes"] or not rapport["revision_2_confirmable_sous_reserve"]:
        raise ValueError("Historique fiscal sauvegardé différent de R1 attendue ; migration arrêtée.")
    return rapport


def verifier_lecture_identique(archive: dict, lecture_vivante: dict) -> None:
    """Refuse toute dérive de la table fiscale entre la sauvegarde et la lecture."""
    if (lecture_vivante.get("problemes") != []
            or lecture_vivante.get("revision_2_confirmable_sous_reserve") is not True
            or lecture_vivante.get("ecriture_autorisee") is not False
            or lecture_vivante.get("annees_autres_revisions_lues") != archive["annees_autres_revisions_lues"]
            or lecture_vivante.get("empreintes_lignes_pour_controle_apres_ecriture")
            != archive["empreintes_lignes_pour_controle_apres_ecriture"]):
        raise ValueError("La lecture fiscale ne correspond pas à la sauvegarde restaurée ; migration arrêtée.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Archive .pf2 locale créée par le même run")
    parser.add_argument("--rapport", type=Path, help="Rapport anonymisé de lecture fiscale du même run")
    args = parser.parse_args()
    try:
        rapport_archive = controler_archive(args.archive, os.environ.get("SAUVEGARDE_CLE", ""))
        if args.rapport:
            rapport_vivant = json.loads(args.rapport.read_text(encoding="utf-8"))
            verifier_lecture_identique(rapport_archive, rapport_vivant)
    except Exception as exc:
        # Aucun identifiant, chiffre fiscal, nom de fichier ou secret en log.
        print(f"Contrôle archive fiscale 011 refusé ({type(exc).__name__}).", file=sys.stderr)
        return 1
    print("Archive fiscale restaurée : 5 lignes R1 (2022–2026), propriétaire unique, empreintes validées.")
    if args.rapport:
        print("Lecture fiscale distante : identique à la sauvegarde restaurée. Aucune migration exécutée.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
