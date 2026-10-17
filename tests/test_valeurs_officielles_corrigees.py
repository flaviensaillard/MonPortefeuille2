"""Valeurs officielles appliquées aux constantes historiques le 16/10/2026.

Sources DGFiP (permalien BOFiP, version par millésime des revenus) :
  revenus 2022 — BOI-IR-LIQ-20-10-20230626, -20-20-30-20230626, -20-20-20-20230626
                 (publication 26/06/2023, fin de publication 18/06/2024)
  revenus 2023 — mêmes identifiants, version 20240618 (publication 18/06/2024)
  revenus 2024 — mêmes identifiants, version 20250414 (publication 14/04/2025)
  revenus 2025 — version 20260407 (publication 07/04/2026), inchangé (R2 publiée)

Ce module vérifie le jumeau Python, son accord avec le moteur JavaScript de la
WebView, et l'absence de reconduction d'un millésime sur l'autre.
"""
import re
from pathlib import Path

import pytest

from core import fiscal_bars as fb, tax

JS = Path(__file__).resolve().parent.parent / "app/src/main/assets/www/js/fiscal.js"

# (année des revenus, tranches officielles, décote célibataire, seuil, décote couple, seuil couple)
OFFICIEL = {
    2022: ((10_777, 27_478, 78_570, 168_994), 833, 1_841, 1_378, 3_045),
    2023: ((11_294, 28_797, 82_341, 177_106), 873, 1_929, 1_444, 3_191),
    2024: ((11_497, 29_315, 83_823, 180_294), 889, 1_965, 1_470, 3_249),
}
# Plafond général du quotient familial, par demi-part supplémentaire.
QF_OFFICIEL = {2022: 1_678, 2023: 1_759, 2024: 1_791, 2025: 1_807}
# Valeurs embarquées avant la correction du 16/10/2026, conservées pour l'audit.
AVANT = {
    2022: {"decote": (846, 1_870, 1_395, 3_100), "qf": 1_759},
    2023: {"decote": (906, 2_002, 1_493, 3_300), "qf": 1_759},
    2024: {"tranches": (11_520, 29_370, 83_984, 180_648),
           "decote": (924, 2_042, 1_523, 3_365), "qf": 1_759},
}


def test_constantes_officielles_dans_le_jumeau_python():
    for annee, (tranches, dc, dc_plafond, dc_couple, dc_plafond_couple) in OFFICIEL.items():
        b = fb.bareme_de(annee)
        assert tuple(b.tranches) == tuple(float(x) for x in tranches), f"barème {annee}"
        assert (b.decote_base_celibataire, b.decote_plafond_celibataire) == (dc, dc_plafond), annee
        assert (b.decote_base_couple, b.decote_plafond_couple) == (dc_couple, dc_plafond_couple), annee
        # Cohérence interne de la décote officielle : seuil = base / 45,25 %.
        assert abs(dc / 0.4525 - dc_plafond) < 1, f"seuil célibataire {annee}"
        assert abs(dc_couple / 0.4525 - dc_plafond_couple) < 1, f"seuil couple {annee}"


def test_plafonds_qf_officiels_par_millesime():
    for annee, attendu in QF_OFFICIEL.items():
        assert fb.plafond_qf_general(annee) == attendu, annee
    # 2022 et 2024 portaient la valeur 2023 reconduite : plus aucune reconduction.
    assert len({fb.plafond_qf_general(a) for a in QF_OFFICIEL}) == len(QF_OFFICIEL)
    with pytest.raises(ValueError):
        fb.plafond_qf_general(2027)


def test_les_valeurs_corrigees_ne_sont_plus_celles_d_avant():
    for annee, avant in AVANT.items():
        b = fb.bareme_de(annee)
        if "tranches" in avant:
            assert tuple(b.tranches) != tuple(float(x) for x in avant["tranches"]), annee
        assert (b.decote_base_celibataire, b.decote_plafond_celibataire,
                b.decote_base_couple, b.decote_plafond_couple) != avant["decote"], annee
        if avant["qf"] != QF_OFFICIEL.get(annee):
            assert fb.plafond_qf_general(annee) != avant["qf"], annee


def test_provenance_affichee_par_millesime():
    for annee in (2022, 2023, 2024):
        src = fb.source_de(annee)
        assert "BOFiP" in src, annee
        assert "16/10/2026" in src, f"{annee} : date de la vérification"
        assert "non vérifiées" not in src, f"{annee} : le libellé historique est remplacé"
    # 2025 (R2 publiée) et 2026 (provisoire) ne changent pas de statut.
    assert "recoupées" in fb.source_de(2025)
    assert "provisoires" in fb.source_de(2026).lower()


def test_moteur_js_et_jumeau_python_concordent():
    texte = JS.read_text(encoding="utf-8")
    for annee, (tranches, dc, dc_plafond, dc_couple, dc_plafond_couple) in OFFICIEL.items():
        ligne = re.search(
            rf"^\s*{annee}: \{{ tranches: \[([^\]]+)\][^}}]*dc: (\d+), dcPlafond: (\d+), "
            rf"dcCouple: (\d+), dcPlafondCouple: (\d+) \}},", texte, re.M)
        assert ligne, f"constantes JS des revenus {annee} introuvables"
        js_tranches = tuple(int(x) for x in ligne.group(1).split(","))
        assert js_tranches == tranches, f"barème {annee} : JS ≠ Python"
        assert tuple(int(ligne.group(i)) for i in range(2, 6)) == (
            dc, dc_plafond, dc_couple, dc_plafond_couple), f"décote {annee} : JS ≠ Python"
    qf = re.search(r"var PLAFOND_QF_GENERAL = \{([^}]+)\};", texte)
    assert qf, "plafond QF JS introuvable"
    js_qf = {int(a): int(b) for a, b in re.findall(r"(\d{4}): (\d+)", qf.group(1))}
    for annee, attendu in QF_OFFICIEL.items():
        assert js_qf[annee] == attendu == fb.plafond_qf_general(annee), annee
    # 2026 reste provisoire des deux côtés : aucune valeur officielle inventée.
    assert js_qf[2026] == 1807 and fb.plafond_qf_general(2026) == 1807


def test_calcul_avec_les_valeurs_officielles_et_millesimes_isoles():
    # Décote 2024 bornée par le plafond officiel de 889 € (célibataire).
    r = tax.impot_revenu(11_497 + 1000 / .11, 1, 2024)
    assert r.impot_brut == pytest.approx(1000)
    # 889 - (1 000 × 45,25 %) = 436,50 €. L'arrondi à l'euro ne s'applique qu'à
    # compter des revenus 2025 : pour 2024 la valeur exacte est conservée.
    assert r.decote == pytest.approx(889 - 1000 * 0.4525)
    assert r.decote < 889
    # Avec les valeurs d'avant la correction (924 €), la décote aurait été 471,50 € :
    # l'écart corrigé est bien celui documenté au §5.3.
    assert (924 - 1000 * 0.4525) - r.decote == pytest.approx(35)
    # Un revenu sous la première tranche officielle ne paie rien.
    assert tax.impot_revenu(11_400, 1, 2024).impot_net == pytest.approx(0)
    assert tax.impot_revenu(11_200, 1, 2023).impot_net == pytest.approx(0)
    # Le plafonnement du quotient familial 2024 retient 1 791 € par demi-part.
    couple = "Marié(e) / Pacsé(e)"
    avec = tax.impot_revenu(180_000, 3, 2024, couple)
    sans = tax.impot_revenu(180_000, 2, 2024, couple)
    assert sans.impot_brut - avec.impot_brut == pytest.approx(2 * 1791)
    # Millésimes voisins non reconduits : chaque année garde ses propres seuils.
    premiers_seuils = [fb.bareme_de(a).tranches[0] for a in (2022, 2023, 2024, 2025)]
    assert premiers_seuils == [10_777.0, 11_294.0, 11_497.0, 11_600.0]
    assert len(set(premiers_seuils)) == 4, 'aucune reconduction d’un millésime sur l’autre'
    with pytest.raises(ValueError):
        fb.bareme_de(2027)


def test_revenus_2025_inchanges():
    """La R2 des revenus 2025 est publiée et activée : rien ne bouge."""
    b = fb.bareme_de(2025)
    assert tuple(b.tranches) == (11_600.0, 29_579.0, 84_577.0, 181_917.0)
    assert (b.decote_base_celibataire, b.decote_plafond_celibataire) == (897, 1982)
    assert (b.decote_base_couple, b.decote_plafond_couple) == (1483, 3277)
    assert fb.plafond_qf_general(2025) == 1807
    assert fb.taux_ps(2025) == pytest.approx(.186)
    assert fb.taux_pfu(2025) == pytest.approx(.314)
