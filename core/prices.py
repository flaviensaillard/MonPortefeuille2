"""Cours — sans aucun repli silencieux.

CORRECTION PAR RAPPORT À LA V1
------------------------------
La v1 écrivait `_fx_cache[key] = 1.0` en cas d'échec, et
`fast_info.get('lastPrice', 2000.0)` pour l'or. Deux conséquences :
- un titre dont le cours n'était pas trouvé valait 0, et disparaissait
  silencieusement de la valorisation ;
- l'or valait 2 000 $ l'once quoi qu'il arrive, ce qui faussait la colonne
  « Montant Or » de l'historique des apports.

Règle ici : `CoursIndisponible` est levée. L'appelant agrège les échecs et
affiche un bandeau listant les titres concernés.
"""

from __future__ import annotations

import datetime as dt
import logging

import pandas as pd
import yfinance as yf

log = logging.getLogger(__name__)


class CoursIndisponible(Exception):
    """Un cours n'a pas pu être obtenu."""

    def __init__(self, ticker: str, date: str = "", cause: str = ""):
        self.ticker = ticker
        self.date = date
        self.cause = cause
        super().__init__(
            f"Cours indisponible pour {ticker}"
            + (f" au {date}" if date else "")
            + (f" ({cause})" if cause else "")
        )


_cache: dict[tuple[str, str], float] = {}


def vider_cache() -> None:
    _cache.clear()


def cours(ticker: str, date: str | None = None) -> float:
    """Cours de clôture d'un titre.

    `date` au format ISO ou jj/mm/aaaa. Si None, dernier cours connu.
    Lève `CoursIndisponible`.
    """
    ticker = str(ticker).upper().strip()
    if not ticker:
        raise CoursIndisponible(ticker, str(date), "ticker vide")

    cle_date = ""
    if date is not None:
        d = pd.to_datetime(date, dayfirst=True, errors="coerce")
        if pd.isna(d):
            raise CoursIndisponible(ticker, str(date), "date illisible")
        cle_date = d.strftime("%Y-%m-%d")

    cle = (ticker, cle_date)
    if cle in _cache:
        return _cache[cle]

    try:
        tk = yf.Ticker(ticker)
        if cle_date:
            h = tk.history(
                start=(pd.Timestamp(cle_date) - pd.Timedelta(days=7)).strftime("%Y-%m-%d"),
                end=(pd.Timestamp(cle_date) + pd.Timedelta(days=2)).strftime("%Y-%m-%d"),
            )
            if h.empty:
                raise CoursIndisponible(ticker, cle_date, "série vide")
            serie = h["Close"]
            serie = serie[serie.index <= pd.Timestamp(cle_date) + pd.Timedelta(days=1)]
            if serie.empty:
                raise CoursIndisponible(ticker, cle_date, "aucun cours antérieur")
            valeur = float(serie.iloc[-1])
        else:
            h = tk.history(period="5d")
            if h.empty:
                raise CoursIndisponible(ticker, "", "série vide")
            valeur = float(h["Close"].iloc[-1])
    except CoursIndisponible:
        raise
    except Exception as exc:
        raise CoursIndisponible(ticker, cle_date, str(exc)) from exc

    if valeur <= 0:
        raise CoursIndisponible(ticker, cle_date, f"cours non positif ({valeur})")

    _cache[cle] = valeur
    return valeur


def cours_actuels(tickers: list[str]) -> tuple[dict[str, float], list[str]]:
    """Cours du jour pour plusieurs titres.

    Retourne `(cours, echecs)` — les tickers en échec sont listés, pas masqués.
    """
    trouves: dict[str, float] = {}
    echecs: list[str] = []
    for t in tickers:
        try:
            trouves[t] = cours(t)
        except CoursIndisponible as exc:
            log.warning("Cours indisponible : %s", exc)
            echecs.append(t)
    return trouves, echecs


def cours_or(date: str | None = None) -> float:
    """Cours de l'or en USD l'once.

    Utilise `XAUUSD=X` (spot) et non `GC=F` (contrat à terme) : la v1 se servait
    du future pour convertir les apports en onces, ce qui introduit un écart
    basis et une échéance.
    """
    return cours("XAUUSD=X", date)
