"""Scénarios DGFiP revenus 2025, indépendants de la base Supabase.

BOFiP 07/04/2026 : BOI-IR-LIQ-20-10, -20-20-20 et -20-20-30.
DGFiP : simulateur 2026 aides/gains.htm, impots.gouv.fr/les-revenus-mobiliers
et impots.gouv.fr/les-autres-charges.
"""
import pytest

from core import fiscal_bars as fb, tax


def test_decote_millesime_2025_et_2026_non_confondus():
    b = fb.bareme_de(2025)
    assert (b.decote_base_celibataire, b.decote_plafond_celibataire) == (897, 1982)
    assert (b.decote_base_couple, b.decote_plafond_couple) == (1483, 3277)
    assert b.decote_taux == 0.4525
    # Impôt brut 1 000 € : réduction 897 - (1 000 × 45,25 %) = 444,50 €,
    # arrondie à 445 € (BOI-IR-LIQ-20-20-40, IV § 50).
    revenu = 11_600 + 1000 / .11
    r = tax.impot_revenu(revenu, 1, 2025)
    assert r.impot_brut == pytest.approx(1000)
    assert r.decote == pytest.approx(445)
    # Les 2026 repris dans le code sont provisoires ; ne pas les appeler « validés ».
    assert "provisoires" in fb.source_de(2026).lower()


def test_qf_general_2025_plafonne_et_deux_millesimes_isoles():
    assert fb.plafond_qf_general(2025) == 1807
    couple = "Marié(e) / Pacsé(e)"
    avec = tax.impot_revenu(180_000, 3, 2025, couple)
    sans = tax.impot_revenu(180_000, 2, 2025, couple)
    assert sans.impot_brut - avec.impot_brut == pytest.approx(3614)
    # Corrigé le 16/10/2026 : la valeur héritée de 2023 (1 759 €) est remplacée par
    # la valeur officielle des revenus 2024, « 1 791 € par demi-part supplémentaire à
    # compter de l'imposition des revenus de l'année 2024 » (BOFiP
    # BOI-IR-LIQ-20-20-20-20250414, publication 14/04/2025).
    assert fb.plafond_qf_general(2024) == 1791
    # Chaque millésime garde son propre plafond : aucune reconduction.
    assert fb.plafond_qf_general(2022) == 1678
    assert fb.plafond_qf_general(2023) == 1759
    assert fb.plafond_qf_general(2025) == 1807
    with pytest.raises(ValueError):
        fb.plafond_qf_general(2027)


def test_titres_crypto_et_rcm_deja_precomptes_2025():
    assert fb.taux_pfu(2024) == pytest.approx(.30)
    assert fb.taux_pfu(2025) == pytest.approx(.314)
    assert fb.taux_ps_revenu_mobilier(2025, precompte=True) == pytest.approx(.172)
    assert fb.taux_ps_revenu_mobilier(2025, precompte=False) == pytest.approx(.186)
    with pytest.raises(ValueError):
        fb.taux_ps_revenu_mobilier(2025, precompte=None)
    # Exigible pour la cession de titres, même chez un courtier français.
    assert tax.comparer_pfu_bareme(1000, 60_000, 1, 2025)["pfu"]["total"] == pytest.approx(314)


def test_mix_titres_interets_ne_depend_pas_du_pays_et_evite_double_ps():
    base = dict(plus_value_nette=1000, autres_revenus=60_000, parts=1,
                annee=2025, interets_eur=1000)
    pre = tax.comparer_pfu_bareme(**base, interets_ps_precomptes=True)
    non = tax.comparer_pfu_bareme(**base, interets_ps_precomptes=False)
    assert pre["ps_titres"] == non["ps_titres"] == pytest.approx(186)
    assert pre["ps_interets"] == pytest.approx(172)
    assert non["ps_interets"] == pytest.approx(186)
    assert pre["pfu"]["total"] == pytest.approx(614)
    assert non["pfu"]["total"] == pytest.approx(628)
    assert pre["ps_deja_precomptes"] == pytest.approx(172)
    assert non["ps_deja_precomptes"] == 0
    assert pre["bareme"]["csg_deductible"] == pytest.approx(68)
    assert pre["bareme"]["csg_deductible_apres_paiement_estimee"] == pytest.approx(68)
    assert non["bareme"]["csg_deductible"] == 0
    assert non["bareme"]["csg_deductible_apres_paiement_estimee"] == pytest.approx(136)
    with pytest.raises(ValueError, match="précomptés"):
        tax.comparer_pfu_bareme(**base)  # aucun pays ne vaut preuve du prélèvement
    with pytest.raises(ValueError, match="précomptés"):
        tax.simuler_foyer_complet(annee=2025, statut="Célibataire", enfants=0,
            parts=1, salaire_1=60_000, utiliser_frais_reels_1=False,
            km_1=0, cv_1=5, jours_repas_1=0,
            interets_etrangers_eur=1000, pays_interets_etrangers="Lituanie")


def test_csg_sur_titres_pas_deduite_l_annee_des_revenus():
    comp = tax.comparer_pfu_bareme(1000, 60_000, 1, 2025)
    assert comp["bareme"]["csg_deductible"] == 0
    assert comp["bareme"]["csg_deductible_apres_paiement_estimee"] == pytest.approx(68)
    sans = tax.impot_revenu(60_000, 1, 2025)
    avec = tax.impot_revenu(61_000, 1, 2025)
    assert comp["bareme"]["ir_marginal"] == pytest.approx(avec.impot_net - sans.impot_net)
