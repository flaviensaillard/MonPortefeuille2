"""Indicateurs de performance.

CORRECTIONS PAR RAPPORT À LA V1
-------------------------------
1. **Le TWR était un simple cumprod d'un ratio Dietz mensuel.** Acceptable en
   ordre de grandeur, mais il suppose que les apports arrivent en fin de période.
   On chaîne désormais les rendements de sous-période, ce qui est la définition
   standard du TWR.

2. **Aucune performance n'était mesurée en or.** Or Gave tient l'or pour l'étalon
   de valeur, pas pour un placement : « l'or montera tant que les monnaies ne
   redeviendront pas des réserves de valeur ». La v1 collectait pourtant une
   colonne `Montant Or` à chaque apport… et ne s'en servait jamais.

3. **Aucun rendement pondéré par les flux (IRR).** Le TWR répond à « qu'a fait la
   stratégie », l'IRR répond à « qu'ai-je gagné, moi, avec mon calendrier
   d'apports ». Les deux sont nécessaires et ne disent pas la même chose.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import numpy as np


# ---------------------------------------------------------------------------
# Rendements de sous-période et TWR
# ---------------------------------------------------------------------------

def rendements_periode(
    valeurs: list[float],
    flux: list[float] | None = None,
) -> list[float]:
    """Rendement de chaque sous-période, corrigé des flux externes.

    `valeurs[i]` = valeur du portefeuille à la fin de la période i.
    `flux[i]`    = flux externe sur la période i (apport positif, retrait négatif),
                   supposé survenir à la fin de la période.

    r_i = (V_i - V_{i-1} - F_i) / V_{i-1}
    """
    n = len(valeurs)
    if n < 2:
        return []
    flux = flux or [0.0] * n
    if len(flux) != n:
        raise ValueError("valeurs et flux doivent avoir la même longueur")

    sortie = []
    for i in range(1, n):
        v_prec = valeurs[i - 1]
        if v_prec <= 0:
            # Portefeuille vide ou négatif : pas de rendement calculable.
            sortie.append(0.0)
            continue
        r = (valeurs[i] - v_prec - flux[i]) / v_prec
        sortie.append(r)
    return sortie


def twr(rendements: list[float]) -> float:
    """Time-Weighted Return : chaînage géométrique des rendements de sous-période."""
    if not rendements:
        return 0.0
    prod = 1.0
    for r in rendements:
        prod *= (1.0 + r)
    return prod - 1.0


def twr_depuis(valeurs: list[float], flux: list[float] | None = None) -> float:
    """TWR cumulé sur toute la série."""
    return twr(rendements_periode(valeurs, flux))


def annualiser(twr_total: float, jours: int) -> float:
    """Annualise un TWR cumulé. `jours` = nombre de jours de la période."""
    if jours <= 0:
        raise ValueError("La durée doit être positive")
    annees = jours / 365.25
    if annees <= 0:
        return 0.0
    return (1.0 + twr_total) ** (1.0 / annees) - 1.0


# ---------------------------------------------------------------------------
# Rendement réel et rendement en or
# ---------------------------------------------------------------------------

def rendement_reel(nominal: float, inflation: float) -> float:
    """Rendement réel par la relation de Fisher.

    (1 + réel) = (1 + nominal) / (1 + inflation)
    """
    return (1.0 + nominal) / (1.0 + inflation) - 1.0


def pouvoir_achat(montant_futur: float, inflation: float, annees: int) -> float:
    """Valeur aujourd'hui d'un montant futur, déflaté."""
    if annees < 0:
        raise ValueError("Le nombre d'années ne peut pas être négatif")
    return montant_futur / ((1.0 + inflation) ** annees)


def rendement_en_or(
    valeur_debut: float,
    valeur_fin: float,
    or_debut: float,
    or_fin: float,
) -> float:
    """Performance exprimée en onces d'or — l'étalon de Gave.

    On ne demande pas « combien d'euros ai-je gagnés » mais « combien d'onces
    d'or puis-je acheter en plus qu'au début ».

    Lève `ValueError` si un cours de l'or est nul ou négatif : mieux vaut une
    erreur qu'un rendement en or calculé sur un prix inventé.
    """
    if or_debut <= 0 or or_fin <= 0:
        raise ValueError(
            "Cours de l'or invalide. Le rendement en or exige un prix réel, "
            "pas une valeur de repli."
        )
    if valeur_debut < 0:
        raise ValueError("La valeur de départ ne peut pas être négative")
    onces_debut = valeur_debut / or_debut
    onces_fin = valeur_fin / or_fin
    if onces_debut <= 0:
        return 0.0
    return onces_fin / onces_debut - 1.0


# ---------------------------------------------------------------------------
# Rendement pondéré par les flux (IRR / MWR)
# ---------------------------------------------------------------------------

def irr(flux: list[tuple[dt.date, float]]) -> float | None:
    """Taux de rendement interne d'une série de flux datés.

    `flux` = liste de (date, montant), montant négatif pour un apport
    (sortie de poche) et positif pour un retrait (rentrée).

    Retourne le taux annualisé, ou None s'il n'y a pas de solution.
    """
    if len(flux) < 2:
        return None

    flux = sorted(flux, key=lambda x: x[0])
    t0 = flux[0][0]

    def van(taux: float) -> float:
        total = 0.0
        for date, montant in flux:
            annees = (date - t0).days / 365.25
            total += montant / ((1.0 + taux) ** annees)
        return total

    # Recherche par bissection sur une plage large mais réaliste.
    bas, haut = -0.95, 10.0
    try:
        f_bas, f_haut = van(bas), van(haut)
    except (OverflowError, ZeroDivisionError):
        return None

    if f_bas * f_haut > 0:
        return None  # pas de changement de signe : pas de solution unique

    for _ in range(200):
        milieu = (bas + haut) / 2.0
        try:
            f_milieu = van(milieu)
        except (OverflowError, ZeroDivisionError):
            return None
        if abs(f_milieu) < 1e-9:
            return milieu
        if f_bas * f_milieu <= 0:
            haut, f_haut = milieu, f_milieu
        else:
            bas, f_bas = milieu, f_milieu
    return (bas + haut) / 2.0


# ---------------------------------------------------------------------------
# Risque
# ---------------------------------------------------------------------------

def volatilite(rendements: list[float], periodicite: int = 252) -> float:
    """Volatilité annualisée à partir de rendements périodiques."""
    if len(rendements) < 2:
        return 0.0
    return float(np.std(rendements, ddof=1) * np.sqrt(periodicite))


def sharpe(rendements: list[float], taux_sans_risque: float = 0.0,
           periodicite: int = 252) -> float | None:
    """Ratio de Sharpe annualisé.

    Sans objet sur un portefeuille permanent : sa raison d'être est la corrélation
    négative entre poches, pas un couple rendement/risque favorable. On le
    calcule quand même, mais il ne doit jamais être le critère de décision.
    """
    vol = volatilite(rendements, periodicite)
    if vol == 0:
        return None
    moyenne = float(np.mean(rendements))
    rf_periode = (1.0 + taux_sans_risque) ** (1.0 / periodicite) - 1.0
    return (moyenne - rf_periode) / vol * np.sqrt(periodicite)


def correlation(a: list[float], b: list[float]) -> float | None:
    """Corrélation entre deux séries de rendements de même longueur."""
    if len(a) != len(b) or len(a) < 3:
        return None
    sa, sb = float(np.std(a)), float(np.std(b))
    if sa == 0 or sb == 0:
        return None
    return float(np.corrcoef(a, b)[0, 1])


# ---------------------------------------------------------------------------
# Synthèse
# ---------------------------------------------------------------------------

@dataclass
class Bilan:
    """Synthèse d'une période de performance."""

    twr_cumule: float
    twr_annualise: float | None
    rendement_reel: float | None
    rendement_en_or: float | None
    irr: float | None
    volatilite: float
    jours: int

    @property
    def annees(self) -> float:
        return self.jours / 365.25


# ---------------------------------------------------------------------------
# Deux calculs qui vivaient dans la page et n'étaient testables nulle part
# ---------------------------------------------------------------------------
# Les deux défauts ci-dessous ont vécu des mois dans `pages/5_Performance.py`
# sans qu'aucun test ne les voie, parce qu'ils étaient enfouis dans du code
# Streamlit. On les remonte ici, où ils sont mesurables.

def inflation_cumulee(
    inflation: dict[int, float],
    d0: dt.date,
    d1: dt.date,
) -> float:
    """Facteur d'inflation cumulé sur `[d0, d1]`, pondéré par le TEMPS.

    `inflation[annee]` est un taux annuel **déjà en fraction** (0,049 pour 4,9 %).

    Le défaut que ceci remplace : le facteur était calculé en élevant chaque
    année à la puissance « nombre de snapshots dans l'année / 12 ». Exact pour
    des données mensuelles ; absurde dès que le robot quotidien tourne. Une
    année de 250 lignes donnait une inflation à la puissance 20 au lieu de 1 —
    sur trois ans, +70 % au lieu de +8 %.

    On pondère donc par la fraction de jours réellement passée dans chaque
    année. Une année sans donnée est **sautée**, pas remplacée par 0 % : la
    performance réelle sera alors incomplète, et l'appelant doit le dire.
    """
    if d1 <= d0:
        return 1.0
    facteur = 1.0
    for annee in sorted(set([d0.year, d1.year]) | set(inflation)):
        if annee not in inflation:
            continue
        debut = max(d0, dt.date(annee, 1, 1))
        fin = min(d1, dt.date(annee + 1, 1, 1))
        jours = (fin - debut).days
        if jours <= 0:
            continue
        # L'exposant est le nombre d'ANNEES passees dans `annee` (1 pour une
        # annee pleine, 0,5 pour une demi-annee), pas la fraction de la periode
        # totale. Confondre les deux donnerait la moyenne geometrique des taux
        # au lieu du facteur cumule : sur trois ans a 2 %, 1,02 au lieu de
        # 1,061 — et la performance reelle serait sur-estimee de 6 points.
        facteur *= (1.0 + inflation[annee]) ** (jours / 365.25)
    return facteur


def twr_par_annee(
    dates: list[dt.date],
    rendements: list[float],
) -> dict[int, float]:
    """TWR par année civile, en chaînant les rendements de sous-période.

    `dates[i]` est la date de **fin** de la sous-période dont le rendement est
    `rendements[i]`. Le rendement d'une année est le produit des sous-périodes
    qui se terminent dans cette année.

    Le défaut que ceci remplace : `dernière_valeur / première_valeur - 1`. Ce
    calcul compte les apports comme du rendement. Sur un portefeuille alimenté
    chaque mois, une stratégie à 9 % par an s'affichait à +66 %, +42 %, +32 %.
    """
    if len(dates) != len(rendements):
        raise ValueError("dates et rendements doivent avoir la même longueur")
    par_annee: dict[int, float] = {}
    for d, r in zip(dates, rendements):
        par_annee.setdefault(d.year, []).append(r)
    return {a: twr(rs) for a, rs in sorted(par_annee.items())}


# ---------------------------------------------------------------------------
# Performance en or, corrigée des flux
# ---------------------------------------------------------------------------
# L'étalon de Gave est l'or, pas l'euro. Mais « onces finales / onces initiales »
# a le même défaut que « valeur finale / valeur initiale » : si vous versez de
# l'argent, le rapport monte sans que la stratégie ait rien produit. C'était
# affiché sur la page d'accueil.
#
# La forme close, pour une sous-période :
#
#     (1 + r_or) = (1 + r_eur) / (1 + g_eur)
#
# où `g_eur` est le rendement de l'or EN EUROS. L'équivalent-or du portefeuille
# vaut `oz = V_eur / gold_eur` (diviser la valeur par le prix de l'or en euros),
# donc `g_eur = (V_i / oz_i) / (V_{i−1} / oz_{i−1}) − 1`. En substituant :
#
#     (1 + r_or) = (1 + r_eur) × (V_{i−1} / V_i) × (oz_i / oz_{i−1})
#
# PIÈGE À NE PAS REFAIRE : `r_eur` est le RENDEMENT, pas `1 + r_eur`. Écrire
# `(V_i − V_{i−1} − F_i) / V_i × oz_i / oz_{i−1}` — ce que j'avais fait — perd
# le `+1` et donne un rendement en or nul dès que l'or est stable. La
# vérification ci-dessous existe pour ça.


def rendements_en_or(
    valeurs: list[float],
    flux: list[float] | None,
    onces: list[float],
) -> list[float]:
    """Rendement de chaque sous-période, exprimé en onces d'or.

    Lève `ValueError` si une valeur d'or manque ou n'est pas positive : mieux
    vaut pas de mesure qu'une mesure inventée. Les snapshots importés de la v1
    n'ont pas d'équivalent-or, et il faut le dire plutôt que deviner.
    """
    n = len(valeurs)
    if len(onces) != n:
        raise ValueError("valeurs et onces doivent avoir la même longueur")
    if n < 2:
        return []
    flux = flux or [0.0] * n
    for o in onces:
        if o is None or o <= 0:
            raise ValueError(
                "Équivalent-or manquant ou nul. La performance en or exige un "
                "prix réel du métal à chaque date, pas une valeur de repli."
            )

    sortie = []
    for i in range(1, n):
        if valeurs[i] <= 0 or valeurs[i - 1] <= 0:
            sortie.append(0.0)
            continue
        r_eur = (valeurs[i] - valeurs[i - 1] - flux[i]) / valeurs[i - 1]
        # `+ 1.0` : c'est (1 + r_eur), pas r_eur. Sans lui, un or stable donne
        # un rendement en or nul.
        un_plus_r_or = (1.0 + r_eur) * (valeurs[i - 1] / valeurs[i]) * (onces[i] / onces[i - 1])
        sortie.append(un_plus_r_or - 1.0)
    return sortie


def twr_en_or(
    valeurs: list[float],
    flux: list[float] | None,
    onces: list[float],
) -> float:
    """Performance cumulée en onces d'or, corrigée des apports."""
    return twr(rendements_en_or(valeurs, flux, onces))
