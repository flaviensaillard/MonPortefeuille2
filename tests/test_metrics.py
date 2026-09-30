"""Tests des indicateurs de performance.

Ces tests verrouillent les corrections apportées à la v1 : TWR par sous-périodes,
rendement réel de Fisher, rendement en or, IRR.
"""

from __future__ import annotations

import datetime as dt
import math

import pytest

from core import metrics


class TestTWR:
    def test_aucun_flux(self):
        # 100 -> 110 -> 121 : +10 % puis +10 %, TWR = 21 %.
        r = metrics.rendements_periode([100.0, 110.0, 121.0])
        assert metrics.twr(r) == pytest.approx(0.21)

    def test_avec_apport_neutralise(self):
        # 100 -> apport 50 -> 160. Le gain réel est 10 sur 100.
        # r = (160 - 150 - 50) / 100 = 0.60... non :
        # valeurs = [100, 160], flux = [0, 50]
        # r = (160 - 100 - 50) / 100 = 0.10
        r = metrics.rendements_periode([100.0, 160.0], [0.0, 50.0])
        assert r == pytest.approx([0.10])

    def test_retrait_est_un_flux_negatif(self):
        # 100 -> retrait 20 -> 90. Le marché a perdu 10 sur 100 ?
        # r = (90 - 100 - (-20)) / 100 = 0.10
        r = metrics.rendements_periode([100.0, 90.0], [0.0, -20.0])
        assert r == pytest.approx([0.10])

    def test_serie_vide(self):
        assert metrics.twr([]) == 0.0

    def test_chainage_multi_periode(self):
        # 10 %, puis -5 % : TWR = 1,10 * 0,95 - 1 = 4,5 %
        assert metrics.twr([0.10, -0.05]) == pytest.approx(0.045)


class TestRendementReel:
    def test_fisher(self):
        # 5 % nominal, 2 % inflation -> ~2,94 % réel
        assert metrics.rendement_reel(0.05, 0.02) == pytest.approx(1.05 / 1.02 - 1)

    def test_zero_inflation(self):
        assert metrics.rendement_reel(0.05, 0.0) == pytest.approx(0.05)

    def test_deflation(self):
        # Inflation négative : le réel dépasse le nominal.
        assert metrics.rendement_reel(0.05, -0.02) == pytest.approx(1.05 / 0.98 - 1)


class TestRendementEnOr:
    def test_gain_en_onces(self):
        # Capital 100 -> 110, or 2000 -> 2200.
        # onces : 0,05 -> 0,05. Performance nulle.
        assert metrics.rendement_en_or(100, 110, 2000, 2200) == pytest.approx(0.0)

    def test_perte_malgre_gain_en_euros(self):
        # Capital 100 -> 105, or 2000 -> 2500.
        # onces : 0,050 -> 0,042. Perte de 16 %.
        perf = metrics.rendement_en_or(100, 105, 2000, 2500)
        assert perf == pytest.approx(-0.16)

    def test_refuse_un_cour_invalide(self):
        # La v1 remplaçait un cours manquant par 2 000 $ et calculait quand même.
        with pytest.raises(ValueError):
            metrics.rendement_en_or(100, 110, 0, 2000)
        with pytest.raises(ValueError):
            metrics.rendement_en_or(100, 110, 2000, -1)


class TestIRR:
    def test_un_seul_apport_pas_de_solution(self):
        assert metrics.irr([(dt.date(2020, 1, 1), -100)]) is None

    def test_doublement_simple(self):
        # 100 investis, 200 récupérés un an plus tard : IRR ≈ 100 %.
        flux = [(dt.date(2020, 1, 1), -100.0), (dt.date(2021, 1, 1), 200.0)]
        r = metrics.irr(flux)
        assert r is not None
        assert r == pytest.approx(1.0, abs=0.01)

    def test_periode_incomplete(self):
        flux = [(dt.date(2020, 1, 1), -100.0), (dt.date(2020, 7, 1), 110.0)]
        r = metrics.irr(flux)
        assert r is not None
        # 110 contre 100 sur 182 jours (0,498 an) donne 21,08 % annualisé :
        # 1,1^(1/0,498) - 1. Le décompte réel des jours compte.
        assert r == pytest.approx(0.2108, abs=0.001)


class TestAnnualisation:
    def test_douze_mois(self):
        # +21 % sur exactement un an reste +21 % annualisé.
        assert metrics.annualiser(0.21, 365) == pytest.approx(0.21, abs=0.001)

    def test_deux_ans(self):
        # +21 % sur deux ans = ~10 % par an.
        assert metrics.annualiser(0.21, 730) == pytest.approx(0.10, abs=0.002)

    def test_duree_nulle_leve(self):
        with pytest.raises(ValueError):
            metrics.annualiser(0.21, 0)
