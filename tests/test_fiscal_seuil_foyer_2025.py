"""Seuil sur IR global (hors PS), BOI-IR-LIQ-20-20-40, V § 80."""

import pytest

from core.tax import comparer_options_foyer, comparer_pfu_bareme, impot_revenu


def test_seuil_non_recouvrement_sur_ir_global_et_non_sur_bareme_seul():
    # 17 300 € de revenu net imposable : IR progressif net avant seuil ~14 €.
    # Une PV mobilière de 400 € ajoute 51,20 € d'IR forfaitaire : l'IR total
    # franchit 61 € ; le montant progressif ne doit pas disparaître.
    ir = impot_revenu(17300, 1, 2025)
    assert ir.impot_net == 0
    assert 0 < ir.impot_brut - ir.decote < 61
    resultat = comparer_options_foyer(17300, 1, 2025, "Célibataire", pv_titres=400)
    pfu = next(s for s in resultat["scenarios"] if not s["cocher_2op"])
    assert pfu["ir_bareme"] == pytest.approx(ir.impot_brut - ir.decote)
    assert pfu["ir_bareme"] + pfu["ir_forfaitaire"] > 61
    comparaison = comparer_pfu_bareme(400, 17300, 1, 2025)["pfu"]
    assert comparaison["ir"] == pytest.approx(pfu["ir_forfaitaire"])
    assert comparaison["ir_bareme_debloque"] == pytest.approx(pfu["ir_bareme"])
    assert comparaison["total"] == pytest.approx(comparaison["ir"] +
        comparaison["ir_bareme_debloque"] + comparaison["ps"])


def test_prelevements_sociaux_ne_comptent_pas_dans_seuil_ir():
    resultat = comparer_options_foyer(0, 1, 2025, "Célibataire", pv_titres=250)
    pfu = next(s for s in resultat["scenarios"] if not s["cocher_2op"])
    assert pfu["ir_bareme"] == 0
    assert pfu["ir_forfaitaire"] == 0  # 250 × 12,8 % = 32 €, sous 61 €
    assert pfu["ps_titres"] == pytest.approx(46.5)
