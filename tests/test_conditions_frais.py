"""Calculs sous conditions, sans données personnelles ni connexion."""
import pytest

from core import conditions_frais as cf


def test_forfait_sans_justificatifs_2025_et_participation():
    assert cf.repas_deductibles(10, 2025, mode="forfait_sans_justificatifs",
                               repas_imposes_hors_domicile=True,
                               restauration_collective_disponible=False,
                               participation_employeur_eur=0) == 54.5
    assert cf.repas_deductibles(10, 2025, mode="forfait_sans_justificatifs",
                               repas_imposes_hors_domicile=True,
                               restauration_collective_disponible=False,
                               participation_employeur_eur=20) == 34.5


def test_repas_avec_justificatifs_utilise_la_valeur_du_repas_au_foyer():
    assert cf.repas_deductibles(10, 2025, mode="justificatifs",
                               repas_imposes_hors_domicile=True,
                               depenses_justifiees_eur=120,
                               participation_employeur_eur=10) == 55.5
    assert cf.repas_deductibles(10, 2025, mode="justificatifs",
                               repas_imposes_hors_domicile=True,
                               depenses_justifiees_eur=30,
                               participation_employeur_eur=0) == 0


@pytest.mark.parametrize("opts", [
    {},
    {"repas_imposes_hors_domicile": False, "participation_employeur_eur": 0},
    {"repas_imposes_hors_domicile": True},
    {"repas_imposes_hors_domicile": True, "participation_employeur_eur": -1},
    {"repas_imposes_hors_domicile": True, "participation_employeur_eur": 0,
     "depenses_justifiees_eur": 100},
    {"repas_imposes_hors_domicile": True, "participation_employeur_eur": 0,
     "restauration_collective_disponible": True},
])
def test_forfait_inconnu_ou_non_justifie_refuse(opts):
    opts = {"mode": "forfait_sans_justificatifs",
            "restauration_collective_disponible": False, **opts}
    with pytest.raises((TypeError, ValueError)):
        cf.repas_deductibles(10, 2025, **opts)


def test_forfait_refuse_annee_non_auditee_et_nan():
    for annee in (2024, 2026):
        with pytest.raises(ValueError):
            cf.repas_deductibles(10, annee, mode="forfait_sans_justificatifs",
                                   repas_imposes_hors_domicile=True,
                                   restauration_collective_disponible=False,
                                   participation_employeur_eur=0)
    with pytest.raises(ValueError):
        cf.repas_deductibles(10, 2025, mode="justificatifs",
                               repas_imposes_hors_domicile=True,
                               depenses_justifiees_eur=float("nan"),
                               participation_employeur_eur=0)


def test_km_2025_exige_trajets_et_distance_aller():
    assert cf.km_deductibles(9120, 5, False, 2025,
                             distance_aller_km=20,
                             trajets_professionnels_confirmes=True) == pytest.approx(4650.84)
    for opts in (
        {"distance_aller_km": 20, "trajets_professionnels_confirmes": False},
        {"distance_aller_km": None, "trajets_professionnels_confirmes": True},
        {"distance_aller_km": 41, "trajets_professionnels_confirmes": True},
    ):
        with pytest.raises(ValueError):
            cf.km_deductibles(9120, 5, False, 2025, **opts)
    assert cf.km_deductibles(9120, 5, False, 2025,
                             distance_aller_km=41, trajets_professionnels_confirmes=True,
                             eloignement_justifie=True) == pytest.approx(4650.84)
