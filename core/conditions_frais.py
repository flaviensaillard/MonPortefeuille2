"""Conditions des frais réels salariés : calculs explicites, aucun profil implicite.

Ces fonctions sont des préalables de modélisation, PAS le moteur de l'APK ni
une homologation des renseignements saisis. Elles ne lisent aucune donnée.
Pour 2025 : aide officielle à la déclaration 2026, frais professionnels.
"""
from __future__ import annotations

import math

from . import fiscal_bars as fb


def _montant(x: float, nom: str) -> float:
    try:
        valeur = float(x)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{nom} : montant invalide.") from exc
    if not math.isfinite(valeur) or valeur < 0:
        raise ValueError(f"{nom} : montant invalide.")
    return valeur


def repas_deductibles(
    jours: int, annee: int, *, mode: str,
    repas_imposes_hors_domicile: bool,
    restauration_collective_disponible: bool | None = None,
    depenses_justifiees_eur: float | None = None,
    participation_employeur_eur: float | None = None,
) -> float:
    """Forfait sans justificatifs détaillés OU coût documenté diminué du repas au foyer.

    `mode='forfait_sans_justificatifs'` ne s'applique pas par défaut à une
    cantine. `mode='justificatifs'` couvre aussi la restauration collective
    quand le prix payé est connu. La participation employeur doit être connue,
    même si elle vaut explicitement zéro. Les déclarations hors 2025 restent
    à auditer avant d'être prises en charge par cette fonction.
    """
    if annee != 2025 or type(jours) is not int or not 0 <= jours <= 365:
        raise ValueError("Année ou nombre de repas non pris en charge.")
    if repas_imposes_hors_domicile is not True:
        raise ValueError("Les repas imposés hors domicile doivent être confirmés.")
    if participation_employeur_eur is None:
        raise ValueError("Participation de l'employeur inconnue.")
    participation = _montant(participation_employeur_eur, "Participation de l'employeur")
    forfait = fb.forfait_repas_de(annee)
    if mode == "forfait_sans_justificatifs":
        if restauration_collective_disponible is not False:
            raise ValueError("Sans justificatifs : absence de restauration collective à confirmer.")
        if depenses_justifiees_eur is not None:
            raise ValueError("Ne pas mélanger forfait et dépenses justifiées.")
        frais = jours * forfait
    elif mode == "justificatifs":
        if depenses_justifiees_eur is None:
            raise ValueError("Prix des repas justifiés manquant.")
        frais = max(0.0, _montant(depenses_justifiees_eur, "Prix des repas") - jours * forfait)
    else:
        raise ValueError("Mode de déduction des repas inconnu.")
    return round(max(0.0, frais - participation), 2)


def km_deductibles(
    km_annuels: float, cv: int, electrique: bool, annee: int, *,
    distance_aller_km: float | None,
    trajets_professionnels_confirmes: bool,
    eloignement_justifie: bool = False,
) -> float:
    """Barème voiture sous réserve des trajets justifiés et de la limite de 40 km.

    Au-delà de 40 km à l'aller sans motif particulier, il manque le nombre
    de trajets pour plafonner la distance annuelle : aucun montant n'est rendu.
    """
    if annee != 2025 or trajets_professionnels_confirmes is not True:
        raise ValueError("Trajets professionnels 2025 non confirmés.")
    km = _montant(km_annuels, "Kilomètres annuels")
    if distance_aller_km is None:
        raise ValueError("Distance aller domicile-travail inconnue.")
    aller = _montant(distance_aller_km, "Distance aller")
    if aller > 40 and eloignement_justifie is not True:
        raise ValueError("Au-delà de 40 km, justificatif ou plafonnement requis.")
    return fb.frais_kilometriques(km, cv, electrique, annee=annee)[0]
