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

from . import dates

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
_cache_devise: dict[str, str | None] = {}


def vider_cache() -> None:
    _cache.clear()
    _cache_devise.clear()


def devise_de(ticker: str) -> str | None:
    """Devise de cotation réellement rapportée par Yahoo, ou `None`.

    C'est la source la plus fiable qui existe : celle du marché de cotation
    lui-même. On renvoie `None` quand Yahoo ne la donne pas — l'absence d'une
    information vaut mieux qu'une information fausse, parce qu'une devise
    erronée corrompt toute la valorisation de la position.
    """
    ticker = str(ticker).upper().strip()
    if not ticker:
        return None
    if ticker in _cache_devise:
        return _cache_devise[ticker]

    devise: str | None = None
    try:
        tk = yf.Ticker(ticker)
        try:
            # `fast_info` interroge le point d'entrée des cotations : peu
            # coûteux, et il porte la devise.
            devise = str(getattr(tk.fast_info, "currency", "") or "").upper() or None
        except Exception:
            devise = None
        if not devise:
            # Repli sur `info`, plus lent (une requête de plus) mais fiable.
            devise = str((tk.info or {}).get("currency", "") or "").upper() or None
    except Exception as exc:
        log.warning("Devise de cotation de %s indisponible : %s", ticker, exc)
        devise = None

    _cache_devise[ticker] = devise
    return devise


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
        d = dates.parser(date)
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
            # Au plus tard à la date demandée, jamais au lendemain : prendre le
            # cours du jour suivant serait un biais d'anticulation.
            serie = dates.dernier_avant(h["Close"], pd.Timestamp(cle_date))
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
