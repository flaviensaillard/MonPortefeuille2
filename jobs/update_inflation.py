"""Mise à jour de l'inflation annuelle.

CORRECTION PAR RAPPORT À LA V1
------------------------------
La v1 avait une ligne 2026 à **0,00 %** dans sa table `Inflation`, et
`calculer_performances_annuelles` faisait `fillna({'Inflation (%)': 0.0})`.
Résultat : la performance réelle de l'année en cours était égale à la performance
nominale. Une année sans donnée doit être une année SANS donnée, pas une année à
zéro pour cent.

Ce robot renseigne les années manquantes. Les années sans valeur restent absentes
de la table, et l'application le dit.
"""

from __future__ import annotations

import datetime as dt
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import db  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("inflation")

# Inflation française annuelle (indice des prix à la consommation), en %.
# Source : INSEE. À compléter au fil des ans — ne jamais inventer une valeur.
INFLATION_FR = {
    2021: 1.6,
    2022: 5.2,
    2023: 4.9,
    2024: 2.0,
    2025: 0.9,
}


def main() -> int:
    annee_courante = dt.date.today().year

    try:
        existantes = db.inflation()
    except Exception as exc:
        log.error("Lecture de l'inflation échouée : %s", exc)
        return 1

    deja = set()
    if not existantes.empty and "annee" in existantes.columns:
        deja = {int(a) for a in existantes["annee"].dropna()}

    a_ecrire = [
        {"annee": a, "inflation": v, "source": "INSEE"}
        for a, v in sorted(INFLATION_FR.items())
        if a not in deja
    ]

    # L'année en cours n'est renseignée que si elle est terminée.
    if annee_courante in INFLATION_FR and annee_courante not in deja:
        if dt.date.today().month >= 12:
            a_ecrire.append({
                "annee": annee_courante,
                "inflation": INFLATION_FR[annee_courante],
                "source": "INSEE",
            })

    if not a_ecrire:
        log.info("Inflation déjà à jour.")
    else:
        try:
            db.ecrire(db.T_INFLATION, a_ecrire)
            log.info("%d année(s) d'inflation écrites : %s",
                     len(a_ecrire), [l["annee"] for l in a_ecrire])
        except Exception as exc:
            log.error("Écriture de l'inflation échouée : %s", exc)
            return 1

    toutes = sorted(set(INFLATION_FR) | deja)
    manquantes = [a for a in range(min(toutes), annee_courante + 1) if a not in toutes]
    if manquantes:
        log.warning(
            "Années sans inflation : %s. La performance réelle de ces années ne "
            "sera pas calculable — c'est voulu, mieux vaut un trou visible qu'un "
            "0 % qui ment.", manquantes,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
