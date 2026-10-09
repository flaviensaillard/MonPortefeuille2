"""Saisie d'un cours de référence à la main (couche 2 de la valorisation, 2.1.0).

Usage (avec SUPABASE_URL, SUPABASE_KEY et SUPABASE_USER_ID dans l'environnement) :

    python -m jobs.saisir_cours_reference XJSE.SW 6.0138 EUR 2026-10-10

Le cours est enregistré dans la table `Config` (clé `cours_ref:TICKER`) et n'est
utilisé que s'il a 7 jours au plus. Au-delà, la saisie est REFUSÉE, et un cours
plus ancien ne serait de toute façon pas pris en compte par la valorisation.

Ce n'est pas un cours du jour : il ne va jamais dans le cache `pf2_cours` du robot.
"""

from __future__ import annotations

import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import db, prices  # noqa: E402


def main(argv: list[str]) -> int:
    if len(argv) not in (3, 4):
        print(__doc__)
        return 2
    ticker, cours, devise = argv[0], argv[1], argv[2]
    date_iso = argv[3] if len(argv) == 4 else dt.date.today().isoformat()
    try:
        valeur = db.sauver_cours_de_reference(ticker, float(cours.replace(",", ".")), devise, date_iso)
    except ValueError as exc:
        print(f"Saisie refusée : {exc}. Rien n'a été enregistré.")
        return 1
    except Exception as exc:  # écriture ou lecture impossible
        print(f"Écriture impossible : {exc}. Rien n'a été enregistré.")
        return 1
    print(
        f"Cours de référence enregistré : {ticker.upper()} = {valeur['cours']} {valeur['devise']} "
        f"au {valeur['date']}. Valable {prices.DUREE_REFERENCE_MAX_JOURS} jours au plus."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
