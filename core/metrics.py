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
