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
_cache_var: dict[str, float] = {}

# Histoire entiere par ticker, chargee en UNE requete. Indexee sur le ticker
# d'origine, comme `_cache` : c'est celui qui figure dans les donnees.
# Reconstituer 500 jours fait alors 500 recherches en memoire, pas 500 appels.
_series: dict[str, object] = {}
_cache_devise: dict[str, str | None] = {}

# Symbole retenu pour l'or. Yahoo a supprimé le spot (`XAUUSD=X`, `XAU=X` et
# `XAUUSD` renvoient tous « Quote not found »), donc on prend le contrat
# front-month du COMEX. Ce n'est PAS le spot : il porte un écart basis et une
# échéance. C'était précisément ce que la v1 refusait, faute de mieux — mais le
# mieux n'existe plus sur Yahoo, et l'absence de cours de l'or est pire qu'un
# cours approché à moins de 1 %.
TICKER_OR = "GC=F"

# Yahoo a retiré des symboles qu'on utilisait. On ne renomme PAS les tickers dans
# le code : ils sont déjà dans la base de l'utilisateur, issus de sa saisie et de
# l'import de la v1. Les renommer ici obligerait à réimporter toutes ses
# transactions. On les traduit donc au moment de l'appel.
ALIAS_YAHOO: dict[str, str] = {
    # Notation Binance, qui n'a jamais existé sur Yahoo. `BTC-USD` est le bon
    # symbole et renvoie bien un cours.
    "BTCUSDT": "BTC-USD",
}


def vider_cache() -> None:
    _cache.clear()
    _cache_var.clear()
    _cache_devise.clear()


def variation_recente(ticker: str) -> float | None:
    """Retourne la variation relative (en fraction, ex. +0.0081 pour +0,81 %)
    du dernier cours par rapport à la clôture précédente."""
    return _cache_var.get(str(ticker).upper().strip())


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
        tk = yf.Ticker(ALIAS_YAHOO.get(ticker, ticker))
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


def serie(ticker: str):
    """Toute l'histoire de cloture d'un titre, en une seule requete Yahoo.

    Pourquoi
    --------
    `cours()` appelait Yahoo une fois par date. Reconstiturer un historique de
    500 jours sur 5 titres, c'etait 2 500 requetes : le robot aurait mis des
    heures et se serait fait blacklister. On charge donc la serie une fois, et
    chaque journee devient une recherche en memoire.

    La serie est nettoyee (`dropna`) : Yahoo renvoie une ligne de queue sans
    cours pour IGLN.L, XDW0.L, FLXC.L et RI.PA, et NaN traverse tous les tests
    usuels. Le fuseau est retire au moment de la recherche, par
    `dates.dernier_avant`.
    """
    ticker = str(ticker).upper().strip()
    if ticker in _series:
        return _series[ticker]

    symbole = ALIAS_YAHOO.get(ticker, ticker)
    try:
        # `auto_adjust=False` est explicite : depuis yfinance 0.2.51 (puis la
        # branche 1.x), `True` est devenu le défaut. La série serait alors
        # « ajustée » (dividendes réinvestis) : chaque cours daté descend de
        # tous les dividendes détachés depuis, et ne correspond plus au cours
        # affiché par le courtier ni par Yahoo lui-même.
        h = yf.Ticker(symbole).history(period="max", auto_adjust=False)
    except Exception as exc:
        raise CoursIndisponible(ticker, "", str(exc)) from exc

    fermetures = h["Close"].dropna() if not h.empty else h["Close"]
    _series[ticker] = fermetures
    return fermetures



def _seuil_ecart(symbole: str) -> float:
    """Écart maximal toléré entre cotation du moment et dernière clôture.

    Une action ou un ETF ne saute pas de 20 % entre deux séances ; une crypto,
    si. Au-delà du seuil, la cotation est réputée fausse (métadonnées fossiles
    chez Yahoo — cas XJSE.SW qui sert un cours figé au 06/12/2023).
    """
    haut = symbole.endswith(("-USD", "-USDT")) or "USDT" in symbole
    return 0.75 if haut else 0.20


def cotation_du_moment(ticker: str) -> float | None:
    """Dernier cours publié par Yahoo pour `ticker`, une fois vérifié.

    La variation du jour associée (chiffre CALCULÉ PAR YAHOO, même référence
    que le courtier — ou à défaut cours du moment contre clôture précédente)
    est posée dans le cache de `variation_recente`.

    DEUX GARDE-FOUS, pour ne pas propager une donnée Yahoo fausse :
    - la séance du cours doit être récente : XJSE.SW renvoie un
      `regularMarketPrice` figé au 06/12/2023 (+22,5 % au-dessus du marché) ;
    - le cours doit être cohérent avec la clôture précédente : au-delà du
      seuil, la cotation est réputée fossile.

    Retourne `None` si Yahoo ne répond rien d'exploitable ou de crédible :
    l'appelant garde alors le comportement historique (dernières clôtures de
    la série), et la variation du jour vient des métadonnées Yahoo quand il
    en publie une.
    """
    symbole = ALIAS_YAHOO.get(str(ticker).upper().strip(), str(ticker).upper().strip())
    try:
        tk = yf.Ticker(symbole)
        fi = tk.fast_info
        dernier = float(getattr(fi, "last_price", None) or 0.0)
        veille = float(getattr(fi, "previous_close", None) or 0.0)
        # Les métadonnées de la même réponse portent la séance du cours et la
        # variation du jour CALCULÉE PAR YAHOO (même référence que le
        # courtier). Déjà chargées par `fast_info` : pas de requête de plus.
        meta: dict = {}
        try:
            meta = tk.get_history_metadata() or {}
        except Exception:
            meta = {}
    except Exception as exc:
        log.info("Cotation du moment indisponible pour %s : %s", ticker, exc)
        return None
    if dernier <= 0 or dernier != dernier:
        return None

    # Garde-fou 1 : une séance trop ancienne est un cours fossile.
    ts = meta.get("regularMarketTime")
    if ts:
        try:
            seance = dt.datetime.fromtimestamp(int(ts), dt.timezone.utc).date()
            if (dt.date.today() - seance).days > 5:
                log.info(
                    "Cotation du moment de %s rejetée : séance du %s (fossile)",
                    ticker, seance.isoformat(),
                )
                return None
        except (ValueError, TypeError, OSError, OverflowError):
            pass

    if veille > 0 and veille == veille:
        # Garde-fou 2 : cohérence cours/clôture précédente.
        if abs(dernier / veille - 1.0) > _seuil_ecart(symbole):
            log.info(
                "Cotation du moment de %s rejetée : %.4f vs clôture %.4f",
                ticker, dernier, veille,
            )
            return None
        variation = (dernier / veille) - 1.0
    else:
        variation = None

    # La variation PUBLIÉE PAR YAHOO prime : elle compare le cours du moment à
    # la clôture OFFICIELLE de la veille, même quand la série publique troue
    # cette séance (IGLN.L, XDW0.L, FLXC.L).
    pct = meta.get("regularMarketChangePercent", meta.get("fulldayChangePercent"))
    try:
        pct_f = float(pct) if pct is not None else None
    except (TypeError, ValueError):
        pct_f = None
    if pct_f is not None and pct_f == pct_f and abs(pct_f) <= _seuil_ecart(symbole) * 100:
        variation = pct_f / 100.0

    _cache_var[ticker] = variation
    return dernier


def cours(ticker: str, date: str | None = None) -> float:
    """Cours de clôture d'un titre.

    `date` au format ISO ou jj/mm/aaaa. Si None, dernier cours connu.
    Lève `CoursIndisponible`.
    """
    ticker = str(ticker).upper().strip()
    if not ticker:
        raise CoursIndisponible(ticker, str(date), "ticker vide")
    # Traduction d'un ticker que Yahoo ne connaît plus. Le cache reste indexé sur
    # le ticker d'origine : c'est celui qui figure dans les données de l'utilisateur.
    demande, symbole = ticker, ALIAS_YAHOO.get(ticker, ticker)
    if symbole != demande:
        log.info("Ticker %s → %s sur Yahoo", demande, symbole)

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
        if cle_date:
            # Une seule requete pour toute l'histoire, puis recherche dedans.
            # Un appel par date rendait la reconstitution de l'historique
            # impraticable : 5 titres x 500 jours, c'est 2 500 requetes.
            fermetures = serie(demande)
            if fermetures.empty:
                raise CoursIndisponible(ticker, cle_date, "serie vide")
            # Au plus tard a la date demandee, jamais au lendemain : prendre le
            # cours du jour suivant serait un biais d'anticipation.
            filtrees = dates.dernier_avant(fermetures, pd.Timestamp(cle_date))
            if filtrees.empty:
                raise CoursIndisponible(ticker, cle_date, "aucun cours anterieur")
            valeur = float(filtrees.iloc[-1])
        else:
            # Cotation du moment d'abord : elle porte AUSSI la clôture
            # précédente, donc la variation du jour telle que le courtier
            # l'affiche. Repli sur la série si Yahoo ne la donne pas.
            valeur = cotation_du_moment(ticker)
            if valeur is not None:
                # La variation du jour, elle, a déjà été posée dans le cache
                # par `cotation_du_moment` : c'est le chiffre CALCULÉ PAR
                # YAHOO (même référence que le courtier) quand il en publie
                # une, sinon cours du moment contre clôture précédente.
                _cache[cle] = valeur
                return float(valeur)

            tk = yf.Ticker(symbole)
            h = tk.history(period="5d", auto_adjust=False)
            if h.empty:
                raise CoursIndisponible(ticker, "", "série vide")
            # Yahoo renvoie une ligne de queue sans cours (séance non ouverte,
            # ou boucle-trou) pour IGLN.L, XDW0.L, FLXC.L, RI.PA. Prendre le
            # dernier élément brut donne NaN, et NaN traverse tous les tests
            # usuels — voir le garde-fou plus bas.
            fermetures = h["Close"].dropna()
            if fermetures.empty:
                raise CoursIndisponible(ticker, "", "aucune clôture exploitable")
            valeur = float(fermetures.iloc[-1])
            if len(fermetures) >= 2 and float(fermetures.iloc[-2]) > 0:
                _cache_var[ticker] = (valeur / float(fermetures.iloc[-2])) - 1.0
    except CoursIndisponible:
        raise
    except Exception as exc:
        raise CoursIndisponible(ticker, cle_date, str(exc)) from exc

    # `valeur <= 0` ne suffit PAS : toute comparaison avec NaN est fausse, donc un
    # NaN passerait ce test et se propagerait dans toute la valorisation — chaque
    # montant affiché deviendrait « nan », et le total investi aussi. Il faut
    # tester NaN explicitement.
    if valeur != valeur or valeur in (float("inf"), float("-inf")) or valeur <= 0:
        raise CoursIndisponible(ticker, cle_date, f"cours inexploitable ({valeur})")

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

    Yahoo a retiré le spot (`XAUUSD=X`), qui renvoyait « Quote not found ». On
    passe donc par `TICKER_OR`, le contrat front-month du COMEX. C'est un future
    et non le spot : il porte un écart basis (typiquement moins de 1 %) et une
    échéance. Le dire vaut mieux que le masquer, parce que la v1 refusait
    explicitement ce choix — mais le spot n'étant plus disponible, un cours
    approché vaut mieux qu'aucun cours, qui ferait disparaître l'équivalent-or.
    """
    return cours(TICKER_OR, date)
