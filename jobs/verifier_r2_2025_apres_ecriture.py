"""Contrôle lecture seule APRES une éventuelle écriture R2 explicitement autorisée.

Ne crée, modifie ni active aucune ligne. Exige le rapport anonymisé d'avant
écriture, produit par verifier_revision_fiscale_2025.py le jour de la sauvegarde.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from jobs import ligne_r2_2025_hors_ligne as proposition  # noqa: E402
from jobs import verifier_revision_fiscale_2025 as verification  # noqa: E402


def comparer_apres(lignes: list[dict], rapport_avant: dict) -> dict:
    if not isinstance(rapport_avant, dict) or rapport_avant.get("problemes") != [] or \
            rapport_avant.get("revision_2_confirmable_sous_reserve") is not True:
        raise ValueError("Le rapport indépendant d'avant écriture est absent ou invalide.")
    attendues = rapport_avant.get("empreintes_lignes_pour_controle_apres_ecriture")
    if not isinstance(attendues, list) or len(attendues) != 5 or \
            {(r.get("annee_revenus"), r.get("revision")) for r in attendues} != \
            {(annee, 1) for annee in verification.ANNEES_HISTORIQUES}:
        raise ValueError("Les cinq empreintes historiques d'avant écriture sont incomplètes.")
    problemes = []
    base = {(l.get("annee_revenus"), l.get("revision")): l for l in lignes}
    attendu_cles = {(annee, 1) for annee in verification.ANNEES_HISTORIQUES} | {(2025, 2)}
    if len(lignes) != 6 or len(base) != 6 or set(base) != attendu_cles:
        problemes.append("Nombre, années ou numéros de révision inattendus après écriture.")
    for avant in attendues:
        cle = (avant["annee_revenus"], avant["revision"])
        ligne = base.get(cle)
        if ligne is None or verification._empreinte(ligne) != avant["empreinte_ligne"]:
            problemes.append(f"La révision historique {cle[0]}/{cle[1]} a changé depuis la sauvegarde.")
    # Le JSONB rend les tuples Python du barème comme listes JSON.
    attendu = json.loads(json.dumps(proposition.proposer()["colonnes_proposees_sans_user_id"]))
    r2 = base.get((2025, 2))
    if not isinstance(r2, dict):
        problemes.append("R2 2025 absente.")
    else:
        for champ, valeur in attendu.items():
            if r2.get(champ) != valeur:
                problemes.append("R2 : champ inattendu " + champ + ".")
        if not r2.get("user_id") or any(
            l.get("user_id") != r2["user_id"] for l in lignes
        ):
            problemes.append("La R2 n'appartient pas au même compte que les R1.")
    return {
        "lecture_seule": True,
        "ligne_r2_2025_conforme": not problemes,
        "problemes": problemes,
        "limite": "Concordance de ligne et des R1 uniquement ; ni avis fiscal ni preuve d'installation de l'APK."
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rapport-avant", type=Path, required=True,
                        help="Rapport anonymisé fraîchement produit avant l'insertion autorisée.")
    parser.add_argument("--lire-supabase", action="store_true",
                        help="Obligatoire pour toute lecture distante ; aucune écriture possible.")
    args = parser.parse_args()
    if not args.lire_supabase:
        parser.error("Lecture distante non implicite : préciser --lire-supabase.")
    try:
        from jobs import cle_service
        from core import db
        avant = json.loads(args.rapport_avant.read_text(encoding="utf-8"))
        cle_service.configurer()
        uid = db.proprietaire_service()
        if not uid:
            raise ValueError("Identifiant propriétaire non configuré.")
        lignes = verification.lire_revisions(db.client(), uid)
        rapport = comparer_apres(lignes, avant)
    except Exception as exc:
        print(f"Contrôle après écriture interrompu ({type(exc).__name__}).", file=sys.stderr)
        return 1
    print(json.dumps(rapport, ensure_ascii=False, indent=2))
    return 0 if rapport["ligne_r2_2025_conforme"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
