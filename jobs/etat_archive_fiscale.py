"""Oriente un contrôle de sauvegarde fiscale sans journaliser son contenu."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from jobs import restauration  # noqa: E402


def etat(chemin: Path, phrase: str) -> str:
    lignes = restauration.restaurer_fichier(chemin, phrase).get("pf2_fiscal_annees")
    if not isinstance(lignes, list):
        raise ValueError("Table fiscale absente de la sauvegarde.")
    cles = [(l.get("annee_revenus"), l.get("revision")) for l in lignes if isinstance(l, dict)]
    historique = {(annee, 1) for annee in range(2022, 2027)}
    if len(cles) == 5 and set(cles) == historique:
        return "avant"
    if len(cles) == 6 and set(cles) == historique | {(2025, 2)}:
        return "apres"
    raise ValueError("Nombre, années ou numéros de révision fiscale inattendus.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--sortie-gh", type=Path, required=True)
    args = parser.parse_args()
    try:
        mode = etat(args.archive, os.environ.get("SAUVEGARDE_CLE", ""))
        with args.sortie_gh.open("a", encoding="utf-8") as sortie:
            sortie.write(f"mode={mode}\n")
    except Exception as exc:
        print(f"Orientation du contrôle fiscal refusée ({type(exc).__name__}).", file=sys.stderr)
        return 1
    print("Contrôle fiscal de la sauvegarde : mode " + mode + ".")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
