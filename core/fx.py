"""Taux de change — sans aucun repli silencieux.

CORRECTION PAR RAPPORT À LA V1
------------------------------
La v1 renvoyait `1.05` pour EUR/USD et `1.0` pour toute autre devise quand Yahoo
était indisponible. Conséquence : une panne réseau rendait toutes les conversions
fausses d'environ 5 %, sans le moindre signal à l'écran. Un portefeuille pouvait
afficher une performance flatteuse construite sur un taux inventé.

Règle ici : si la donnée n'est pas disponible, on lève `FXIndisponible`.
L'appelant décide quoi faire — afficher un bandeau, bloquer le calcul —
mais jamais fabriquer un chiffre.
"""

from __future__ import annotations

import datetime as dt
import logging

import pandas as pd
import yfinance as yf

from . import dates  # noqa: F401  (comparaisons de dates tolérantes au fuseau)

log = logging.getLogger(__name__)


class FXIndisponible(Exception):
    """Un taux de change n'a pas pu être obtenu."""

    def __init__(self, devise: str, contre: str, date: str, cause: str = ""):
        self.devise = devise
        self.contre = contre
        self.date = date
        self.cause = cause
        super().__init__(
            f"Taux de change {devise}/{contre} indisponible au {date}"
            + (f" ({cause})" if cause else "")
        )


# Cache mémoire : (devise, contre, date) -> taux. Vit la durée du process.
_cache: dict[tuple[str, str, str], float] = {}


def vider_cache() -> None:
    _cache.clear()


def _ticker_fx(devise: str, contre: str) -> str:
    if devise == contre:
        return ""
    # Yahoo inverse certaines paires rares : on demande EUR/JPY et non JPY/EUR.
    if devise == "EUR":
        return f"{contre}{devise}=X"
    return f"{devise}{contre}=X"


def taux(devise: str, date: str, contre: str = "EUR") -> float:
    """Taux de change `devise` -> `contre` au jour `date` (ISO ou jj/mm/aaaa).

    Lève `FXIndisponible` si le taux est introuvable.
    """
    devise = str(devise).upper().strip()
    contre = str(contre).upper().strip()

    if devise == contre or devise in ("", "NAN"):
        return 1.0

    d = dates.parser(date)
    if pd.isna(d):
        raise FXIndisponible(devise, contre, str(date), "date illisible")

    cle = (devise, contre, d.strftime("%Y-%m-%d"))
    if cle in _cache:
        return _cache[cle]

    symbole = _ticker_fx(devise, contre)
    if not symbole:
        _cache[cle] = 1.0
        return 1.0

    try:
        if d >= pd.Timestamp.now() - pd.Timedelta(days=1):
            h = yf.Ticker(symbole).history(period="5d")
            if h.empty:
                raise FXIndisponible(devise, contre, str(date), "série vide")
            brut = float(h["Close"].iloc[-1])
        else:
            h = yf.Ticker(symbole).history(
                start=(d - pd.Timedelta(days=7)).strftime("%Y-%m-%d"),
                end=(d + pd.Timedelta(days=2)).strftime("%Y-%m-%d"),
            )
            if h.empty:
                raise FXIndisponible(devise, contre, str(date), "série vide")
            # Dernier cours connu au plus tard à la date demandée — et pas un
            # jour de plus. La version précédente ajoutait `+ 1 jour` au seuil,
            # ce qui faisait utiliser le taux du LENDEMAIN pour une opération
            # datée : un biais d'anticipation, qui flatte légèrement la
            # performance et contredit ce commentaire.
            #
            # `dates.dernier_avant` et non `serie[serie.index <= ...]` : l'index
            # de Yahoo porte un fuseau horaire, la comparaison directe lève un
            # TypeError. Voyez core/dates.py.
            serie = dates.dernier_avant(h["Close"], d)
            if serie.empty:
                raise FXIndisponible(devise, contre, str(date), "aucun cours antérieur")
            brut = float(serie.iloc[-1])
    except FXIndisponible:
        raise
    except Exception as exc:  # réseau, throttle, ticker inconnu
        raise FXIndisponible(devise, contre, str(date), str(exc)) from exc

    if brut <= 0:
        raise FXIndisponible(devise, contre, str(date), f"taux non positif ({brut})")

    _cache[cle] = brut
    return brut


def taux_actuels(devises: list[str], contre: str = "EUR") -> dict[str, float]:
    """Taux du jour pour plusieurs devises. Lève `FXIndisponible` au premier échec."""
    return {dv: taux(dv, dt.date.today().isoformat(), contre) for dv in devises}


def convertir(montant: float, devise: str, date: str, contre: str = "EUR") -> float:
    """Convertit un montant. Lève `FXIndisponible` si le taux manque."""
    return montant * taux(devise, date, contre)
