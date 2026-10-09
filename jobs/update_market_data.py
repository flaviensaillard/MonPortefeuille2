"""Mise à jour des cours et des taux de change — exécuté par GitHub Actions.

Écrit dans les tables de cache `pf2_cours` et `pf2_fx`. L'application lit ce cache
plutôt que d'appeler Yahoo à chaque rendu : c'est plus rapide, et ça évite de
dépendre de Yahoo pour afficher un tableau de bord.

CORRECTION PAR RAPPORT À LA V1
------------------------------
La v1 appelait Yahoo à chaque rendu de page, avec `st.cache_data(ttl=3600)` et un
repli à 1,05 en cas d'échec. Un cache d'une heure sur une page qui se recharge
toutes les 15 minutes (`st_autorefresh`), c'est un appel réseau par affichage pour
rien — et un taux inventé quand le réseau tombe.
"""

from __future__ import annotations

import datetime as dt
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import db, fx, prices  # noqa: E402
from core.models import POCHES  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("market")

DEVISES = ["EUR", "USD", "CHF", "JPY", "CNY", "GBP"]

# Les devises sont membres de poches (`precaution`, `courant`) mais ne sont pas
# des titres : elles n'ont pas de « cours » chez Yahoo, seulement un taux de
# change — ce que traite la boucle plus bas. Les inclure ici faisait écrire,
# chaque nuit, une alerte « Cours manquants : CHF, CNY, EUR, USD ». Fausse, et
# surtout elle noie les vraies alertes.
DEVISES_MEMBRES = set(DEVISES)


def tickers_a_coter() -> list[str]:
    """Les membres de poches qui sont de vrais titres cotés."""
    return sorted({t for p in POCHES for t in p.membres if t not in DEVISES_MEMBRES})


def main() -> int:
    aujourdhui = dt.date.today().isoformat()
    tickers = tickers_a_coter()

    # --- Cours ---
    # Le cache ne reçoit que des cours VIVANTS (listing natif ou substitut) : un cours
    # de référence saisi à la main est daté d'un autre jour et ne doit pas être écrit
    # comme un cours du jour. Il n'est donc pas passé ici.
    from core.portfolio import DEVISES_COTATION

    lignes_cours, echecs = [], []
    sans_devise = []
    for t in tickers:
        try:
            c = prices.cotation_actuelle(t)
        except prices.CoursIndisponible as exc:
            log.warning("Cours indisponible : %s", exc)
            echecs.append(t)
            continue
        if c.source not in ("yahoo", "substitut"):
            echecs.append(t)
            continue

        # --- Devise du COURS ----------------------------------------------------
        # Celle du listing qui a fourni le cours (XJSE.DE : EUR, pas le JPY de
        # XJSE.SW). À défaut, Yahoo sur le ticker. `DEVISES_COTATION` ne sert que de
        # repli. Et on ne devine JAMAIS : une devise inconnue fait écarter la ligne.
        devise = c.devise or prices.devise_de(t) or DEVISES_COTATION.get(t)
        if not devise:
            sans_devise.append(t)
            continue
        if c.source == "substitut":
            log.info("%s : cours du substitut %s (%s).", t, c.symbole, devise)
        lignes_cours.append({"ticker": t, "date": aujourdhui, "cours": c.valeur, "devise": devise})

    if sans_devise:
        log.warning(
            "Devise de cotation introuvable pour %s : cours non écrits. "
            "Ajoutez ces tickers à DEVISES_COTATION (core/portfolio.py).",
            ", ".join(sans_devise),
        )
        db.ajouter_alerte(
            "Devise de cotation inconnue",
            f"Tickers sans devise : {', '.join(sans_devise)}. Leurs cours n'ont "
            f"pas été enregistrés, pour éviter une valorisation fausse.",
            niveau="attention",
        )

    if lignes_cours:
        try:
            db.remplacer(db.T_COURS, lignes_cours)
            log.info("%d cours écrits.", len(lignes_cours))
        except Exception as exc:
            log.error("Écriture des cours échouée : %s", exc)
            return 1

    # --- Taux de change ---
    lignes_fx = []
    for d in DEVISES:
        try:
            t = fx.taux(d, aujourdhui, "EUR")
            lignes_fx.append({"devise": d, "contre": "EUR", "date": aujourdhui, "taux": t})
        except fx.FXIndisponible as exc:
            log.warning("FX indisponible : %s", exc)

    if lignes_fx:
        try:
            db.remplacer(db.T_FX, lignes_fx)
            log.info("%d taux de change écrits.", len(lignes_fx))
        except Exception as exc:
            log.error("Écriture des FX échouée : %s", exc)
            return 1

    if echecs:
        db.ajouter_alerte(
            "Cours manquants",
            f"Tickers sans cours : {', '.join(echecs)}.",
            niveau="attention",
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
