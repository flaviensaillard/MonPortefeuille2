"""Contrôle local de l'archive APRÈS R2, contre le rapport d'avant écriture.

Aucune écriture ni accès distant. Pour le workflow : vérifie l'archive chiffrée
restaurée et, facultativement, le résultat de la lecture distante indépendante.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from jobs import restauration  # noqa: E402
from jobs.verifier_archive_fiscale_011 import CHAMPS_PROJETES  # noqa: E402
from jobs.verifier_r2_2025_apres_ecriture import comparer_apres  # noqa: E402


def lignes_archive(chemin: Path, phrase: str) -> list[dict]:
    lignes = restauration.restaurer_fichier(chemin, phrase).get("pf2_fiscal_annees")
    if not isinstance(lignes, list) or len(lignes) != 6 or any(
        not isinstance(l, dict) or not all(c in l for c in CHAMPS_PROJETES)
        for l in lignes
    ):
        raise ValueError("Archive fiscale R2 absente ou incomplète.")
    return [{c: l[c] for c in CHAMPS_PROJETES} for l in lignes]


def controler_archive(chemin: Path, phrase: str, rapport_avant: dict, rapport_distant: dict | None = None) -> dict:
    rapport = comparer_apres(lignes_archive(chemin, phrase), rapport_avant)
    if not rapport["ligne_r2_2025_conforme"]:
        raise ValueError("R2 ou R1 de l'archive différentes du rapport pré-écriture.")
    if rapport_distant is not None and rapport_distant != rapport:
        raise ValueError("Lecture fiscale distante différente de l'archive contrôlée.")
    return rapport


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--rapport-avant", type=Path, required=True)
    parser.add_argument("--rapport-distant", type=Path)
    args = parser.parse_args()
    try:
        avant = json.loads(args.rapport_avant.read_text(encoding="utf-8"))
        distant = json.loads(args.rapport_distant.read_text(encoding="utf-8")) if args.rapport_distant else None
        controler_archive(args.archive, os.environ.get("SAUVEGARDE_CLE", ""), avant, distant)
    except Exception as exc:
        print(f"Contrôle archive fiscale R2 refusé ({type(exc).__name__}).", file=sys.stderr)
        return 1
    print("Archive fiscale R2 : six lignes, R2 conforme, R1 identiques au rapport pré-écriture.")
    if args.rapport_distant:
        print("Lecture fiscale distante : identique au contrôle de la sauvegarde restaurée.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
