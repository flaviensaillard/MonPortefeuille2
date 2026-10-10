"""TWR exact : valorisation avant/après chaque flux (revue 2.0.1, F-07).

Avant la 2.1.0, `rendements_periode` calculait
`r_i = (V_i − V_{i−1} − F_i) / V_{i−1}` en supposant chaque flux survenu EN
FIN d'intervalle. Scénario de la revue : 100 € au départ, 100 € versés au
milieu de l'intervalle, puis +10 % après le versement, clôture à 220 €.
L'ancienne formule rend (220 − 100 − 100)/100 = +20 %, alors que le rendement
chaîné avant/après flux est +10 %.

Le moteur strict (`metrics.rendements_stricts`) exige une valorisation juste
AVANT chaque flux :
- un intervalle SANS flux est exact quelle que soit sa longueur (V_i/V_{i−1}) ;
- un intervalle dont chaque flux est valorisé est chaîné exactement ;
- un intervalle dont un flux n'est PAS valorisé n'est pas calculé : il est
  listé dans `non_calcules`, jamais remplacé par une convention de fin de
  période.

Miroir JS : app/src/main/assets/www/js/metrics.js (rendementsStricts), testé
dans tests/test_twr_strict.js.
"""

from __future__ import annotations

import datetime as dt

import pytest

from core import metrics


class TestTWRStrict:
    def test_le_scenario_de_la_revue_est_exact_quand_le_flux_est_valorise(self):
        # 100 € au départ, 100 € versés au milieu (valorisation juste avant le
        # versement : 100 €, rien n'a bougé avant), puis +10 % après : 220 €.
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 31)]
        valeurs = [100.0, 220.0]
        flux_jour = {dt.date(2026, 1, 13): 100.0}
        avant = {dt.date(2026, 1, 13): 100.0}
        rendements, non_calcules = metrics.rendements_stricts(dates, valeurs, flux_jour, avant)
        assert non_calcules == []
        assert rendements == [pytest.approx(0.10)]
        twr, nc = metrics.twr_strict(dates, valeurs, flux_jour, avant)
        assert twr == pytest.approx(0.10)
        assert nc == []

    def test_sans_valorisation_le_point_n_est_pas_calcule(self):
        # L'ancienne formule aurait rendu +20 % en silence. Le moteur strict
        # refuse : le point est listé, aucun chiffre n'est inventé.
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 31)]
        valeurs = [100.0, 220.0]
        flux_jour = {dt.date(2026, 1, 13): 100.0}
        rendements, non_calcules = metrics.rendements_stricts(dates, valeurs, flux_jour)
        assert rendements == [None]
        assert len(non_calcules) == 1
        assert non_calcules[0]["de"] == dt.date(2026, 1, 1)
        assert non_calcules[0]["a"] == dt.date(2026, 1, 31)
        assert non_calcules[0]["flux"] == pytest.approx(100.0)
        twr, nc = metrics.twr_strict(dates, valeurs, flux_jour)
        # 2.2.0 (constat A2) : un intervalle non calculé rend le TWR GLOBAL
        # non calculé. Avant : 0.0, présenté comme un total.
        assert twr is None
        assert len(nc) == 1
        assert nc[0]["raison"]     # la raison est toujours fournie

    def test_un_intervalle_sans_flux_est_exact_quelle_que_soit_sa_longueur(self):
        dates = [dt.date(2026, 1, 31), dt.date(2026, 3, 31)]
        valeurs = [1000.0, 1210.0]
        rendements, non_calcules = metrics.rendements_stricts(dates, valeurs, {})
        assert rendements == [pytest.approx(0.21)]
        assert non_calcules == []

    def test_deux_flux_valorises_dans_le_meme_intervalle_sont_chaines(self):
        # 100 → +100 (avant = 100, après = 200) → le marché fait +10 % → 220
        # → +50 (avant = 220, après = 270) → le marché fait +0 % → 270.
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 31)]
        valeurs = [100.0, 270.0]
        flux_jour = {dt.date(2026, 1, 10): 100.0, dt.date(2026, 1, 20): 50.0}
        avant = {dt.date(2026, 1, 10): 100.0, dt.date(2026, 1, 20): 220.0}
        rendements, non_calcules = metrics.rendements_stricts(dates, valeurs, flux_jour, avant)
        assert non_calcules == []
        assert rendements == [pytest.approx(0.10)]

    def test_un_retrait_valorise_est_chaines_comme_un_flux_negatif(self):
        # 300, retrait de 100 juste avant valorisé à 300, puis −10 % : 180.
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 31)]
        valeurs = [300.0, 180.0]
        flux_jour = {dt.date(2026, 1, 15): -100.0}
        avant = {dt.date(2026, 1, 15): 300.0}
        rendements, non_calcules = metrics.rendements_stricts(dates, valeurs, flux_jour, avant)
        assert non_calcules == []
        assert rendements == [pytest.approx(-0.10)]

    def test_un_seul_flux_non_valorise_ne_condamne_que_son_intervalle(self):
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 2), dt.date(2026, 1, 3)]
        valeurs = [100.0, 260.0, 286.0]
        flux_jour = {dt.date(2026, 1, 2): 100.0}      # non valorisé
        avant = {}
        rendements, non_calcules = metrics.rendements_stricts(dates, valeurs, flux_jour, avant)
        assert rendements[0] is None                  # intervalle du flux : non calculé
        assert rendements[1] == pytest.approx(0.10)   # 260 → 286 sans flux : exact
        assert len(non_calcules) == 1
        # 2.2.0 (constat A2) : le seul intervalle exact ne fait PAS un total.
        # Avant : 0.10, chaînage partiel présenté comme le TWR.
        twr, nc = metrics.twr_strict(dates, valeurs, flux_jour, avant)
        assert twr is None
        assert len(nc) == 1

    def test_flux_du_premier_jour_n_appartient_a_aucun_intervalle(self):
        # Déjà dans la valeur de départ : aucun effet, comme flux_par_periode.
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 31)]
        valeurs = [100.0, 110.0]
        flux_jour = {dt.date(2026, 1, 1): 500.0}
        rendements, non_calcules = metrics.rendements_stricts(dates, valeurs, flux_jour)
        assert rendements == [pytest.approx(0.10)]
        assert non_calcules == []

    def test_une_valorisation_absente_pour_un_jour_a_plusieurs_flux(self):
        # Deux apports le même jour : la valorisation « avant » ne peut pas être
        # attribuée sans ambiguïté → l'appelant ne doit pas en fournir, et le
        # moteur marque l'intervalle non calculé.
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 31)]
        valeurs = [100.0, 330.0]
        flux_jour = {dt.date(2026, 1, 13): 200.0}
        rendements, non_calcules = metrics.rendements_stricts(dates, valeurs, flux_jour, {})
        assert rendements == [None]
        assert len(non_calcules) == 1


class TestLancienneConventionEstSignaleeFausse:
    """Le test historique validait la convention de fin de période :
    10 000 € + 1 000 € versés le 13/01, portefeuille à 11 550 € fin janvier,
    et il trouvait +5,5 % « justes ». Ce chiffre dépend du moment du versement
    dans le mois ; sans valorisation au moment du flux, il n'est PAS calculable.
    """

    def test_le_versement_du_13_n_est_calculable_que_s_valorisation(self):
        dates = [dt.date(2025, 12, 31), dt.date(2026, 1, 31)]
        valeurs = [10000.0, 11550.0]
        flux_jour = {dt.date(2026, 1, 13): 1000.0}
        rendements, non_calcules = metrics.rendements_stricts(dates, valeurs, flux_jour)
        assert rendements == [None]
        assert len(non_calcules) == 1

    def test_le_versement_du_13_valorise_donne_le_vrai_rendement(self):
        # Le marché n'a pas bougé avant le versement (avant = 10 000), puis
        # +5 % sur 11 000 : 11 550. Le rendement exact est +5 %.
        dates = [dt.date(2025, 12, 31), dt.date(2026, 1, 31)]
        valeurs = [10000.0, 11550.0]
        flux_jour = {dt.date(2026, 1, 13): 1000.0}
        avant = {dt.date(2026, 1, 13): 10000.0}
        rendements, non_calcules = metrics.rendements_stricts(dates, valeurs, flux_jour, avant)
        assert non_calcules == []
        assert rendements == [pytest.approx(0.05)]
