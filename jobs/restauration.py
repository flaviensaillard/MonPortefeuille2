# -*- coding: utf-8 -*-
"""Restauration contrôlée d'une sauvegarde `.pf2` (2.2.0, C).

Usage :
    SAUVEGARDE_CLE=... python jobs/restauration.py sauvegardes/pf2-2026-10-10.pf2 [--csv DOSSIER]

Étapes, dans l'ordre, chacune bloquante :
1. si `<fichier>.sha256` existe, son empreinte doit correspondre au fichier ;
2. déchiffrement (phrase incorrecte ou fichier altéré = arrêt) ;
3. contrôle d'intégrité : nombre de lignes, somme de contrôle de chaque table,
   somme globale, synthèse (nombre de lignes et sommes des montants) ;
4. affichage du bilan par table ;
5. avec --csv : une copie CSV par table (format portable, hors application).

Ce script NE réécrit PAS dans Supabase : une restauration en base est une
décision à prendre à la main, table par table.
"""
from __future__ import annotations

import csv
import json
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import sauvegarde  # noqa: E402

log = logging.getLogger("restauration")


def restaurer_fichier(chemin: Path, phrase: str, csv_dossier: Path | None = None) -> dict[str, list[dict]]:
    chemin = Path(chemin)
    empreinte = chemin.with_name(chemin.name + ".sha256")
    if empreinte.exists():
        attendu = empreinte.read_text(encoding="ascii").split()[0]
        if sauvegarde.sha256_octets(chemin.read_bytes()) != attendu:
            raise sauvegarde.ErreurRestauration(
                f"empreinte du fichier différente de {empreinte.name} : copie corrompue")
    document = sauvegarde.dechiffrer(chemin.read_bytes(), phrase)
    tables = sauvegarde.restaurer(document)
    if csv_dossier is not None:
        _ecrire_csv(tables, csv_dossier)
    return tables


def _valeur_csv(valeur):
    if isinstance(valeur, (dict, list)):
        return json.dumps(valeur, ensure_ascii=False, sort_keys=True)
    return "" if valeur is None else valeur


def _ecrire_csv(tables: dict[str, list[dict]], dossier: Path) -> None:
    dossier.mkdir(parents=True, exist_ok=True)
    for nom, lignes in tables.items():
        colonnes: list[str] = []
        for ligne in lignes:
            for col in ligne:
                if col not in colonnes:
                    colonnes.append(col)
        with open(dossier / f"{nom}.csv", "w", newline="", encoding="utf-8") as f:
            ecrivain = csv.DictWriter(f, fieldnames=colonnes)
            ecrivain.writeheader()
            for ligne in lignes:
                ecrivain.writerow({k: _valeur_csv(v) for k, v in ligne.items()})


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if not argv:
        print("usage : restauration.py FICHIER.pf2 [--csv DOSSIER]", file=sys.stderr)
        return 2
    csv_dossier = None
    if "--csv" in argv:
        i = argv.index("--csv")
        if i + 1 >= len(argv):
            print("--csv exige un dossier", file=sys.stderr)
            return 2
        csv_dossier = Path(argv[i + 1])
    phrase = os.environ.get("SAUVEGARDE_CLE", "")
    try:
        tables = restaurer_fichier(Path(argv[0]), phrase, csv_dossier)
    except sauvegarde.ErreurSauvegarde as exc:
        log.error("%s", exc)
        return 1
    for nom, lignes in tables.items():
        log.info("%-24s %6d lignes", nom, len(lignes))
    log.info("Intégrité vérifiée : %d tables, sommes de contrôle et synthèse concordantes.", len(tables))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
