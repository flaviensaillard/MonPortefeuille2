"""Une année absente ne reçoit jamais les paramètres d'un autre millésime."""
import pytest

from core import fiscal_bars as fb, tax


@pytest.mark.parametrize("annee", [2021, 2027])
def test_pas_de_repli_du_forfait_repas_sur_la_derniere_annee(annee):
    with pytest.raises(ValueError, match="Aucun forfait repas"):
        fb.forfait_repas_de(annee)
    with pytest.raises(ValueError, match="Aucun forfait repas"):
        fb.frais_repas(100, annee)


@pytest.mark.parametrize("annee", [2021, 2027])
def test_pas_de_repli_abattement_meme_pour_salaire_nul(annee):
    with pytest.raises(ValueError, match="Aucun abattement 10 %"):
        fb.abattement_10_salaire(30000, annee)
    with pytest.raises(ValueError, match="Aucun abattement 10 %"):
        fb.abattement_10_salaire(0, annee)


def test_impot_par_part_exige_un_bareme_explicitement_fourni():
    with pytest.raises(TypeError):
        tax._impot_par_part(30000)
    with pytest.raises(ValueError, match="Barème annuel requis"):
        tax._impot_par_part(30000, None)


def test_les_millesimes_connus_restent_independants():
    assert fb.forfait_repas_de(2025) == 5.45
    assert fb.forfait_repas_de(2026) == 5.50
    assert fb.abattement_10_salaire(1000, 2025) == 509
    assert fb.abattement_10_salaire(1000, 2026) == 509
