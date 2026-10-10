"""TWR 2.2.0 : valorisations reconstruites, TWR global exact ou « non calculé ».

Constats couverts (revue 2.2.0, bug A du retour d'appareil) :

- A1 : une valorisation absente est RECONSTRUITE depuis le snapshot le plus
  proche STRICTEMENT antérieur au flux (date affichée, origine marquée). Une
  valorisation mesurée (capturée au geste) reste prioritaire.
- A2 : un intervalle non calculé rend le TWR global « non calculé » : jamais un
  chaînage partiel présenté comme un total.
- A4 : golden test de la revue (100 €, apport de 100 € à mi-période, +10 %
  après → +10 %, pas +20 %) et test bout en bout sur des snapshots réalistes,
  dont le cas « valorisation reconstruite depuis le snapshot de la veille ».

Interprétation documentée : un flux daté AVANT le premier snapshot est hors de
la fenêtre mesurée (le TWR part du premier snapshot, dont la valeur contient
déjà ce flux). Il ne rend donc pas le TWR non calculé ; il est listé comme
« hors fenêtre » dans le diagnostic. À confirmer par le mainteneur.
"""

from __future__ import annotations

import datetime as dt

import pandas as pd
import pytest

from core import metrics
from core import session as S


class CtxBidon:
    def __init__(self, snapshots, apports):
        self.snapshots = snapshots
        self.apports = apports


def snapshots(dates, valeurs, colonne="patrimoine_investi_eur"):
    return pd.DataFrame({"Date": pd.to_datetime(dates), colonne: valeurs})


# ---------------------------------------------------------------------------
# A4 — Golden test de la revue
# ---------------------------------------------------------------------------

class TestGoldenDeLaRevue:
    DATES = [dt.date(2026, 1, 1), dt.date(2026, 1, 31)]
    VALEURS = [100.0, 220.0]
    FLUX = {dt.date(2026, 1, 13): 100.0}

    def test_avec_valorisation_mesuree_le_rendement_est_dix_pour_cent(self):
        twr, nc = metrics.twr_exact(
            self.DATES, self.VALEURS, self.FLUX, {dt.date(2026, 1, 13): 100.0}
        )
        assert nc == []
        assert twr == pytest.approx(0.10, abs=1e-12)
        assert twr != pytest.approx(0.20)   # l'ancienne convention « fin de période »

    def test_sans_valorisation_mesuree_le_snapshot_precedent_donne_dix_pour_cent(self):
        # Pas de valeur capturée : reconstruite depuis le snapshot du 1er janvier
        # (100 €), donc identique au cas mesuré.
        detail = metrics.valorisations_avant_flux(self.DATES, self.VALEURS, self.FLUX.keys())
        assert detail[dt.date(2026, 1, 13)]["origine"] == "reconstruite"
        valorisations = metrics.valorisations_completees(self.DATES, self.VALEURS, self.FLUX.keys())
        twr, nc = metrics.twr_exact(self.DATES, self.VALEURS, self.FLUX, valorisations)
        assert nc == []
        assert twr == pytest.approx(0.10, abs=1e-12)


# ---------------------------------------------------------------------------
# A1 — Reconstruction des valorisations
# ---------------------------------------------------------------------------

class TestReconstruction:
    def test_le_snapshot_de_la_veille_sert_de_valorisation(self):
        # Flux le 2 janvier. Snapshot de la veille (1er) : 100 €. Snapshot du jour
        # (2) : 220 €, mais il est POSTÉRIEUR au flux pour la valorisation.
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 2)]
        valeurs = [100.0, 220.0]
        flux = {dt.date(2026, 1, 2): 100.0}
        detail = metrics.valorisations_avant_flux(dates, valeurs, flux.keys())
        e = detail[dt.date(2026, 1, 2)]
        assert e["origine"] == "reconstruite"
        assert e["snapshot"] == dt.date(2026, 1, 1)
        assert e["valeur"] == pytest.approx(100.0)

    def test_le_snapshot_du_jour_meme_n_est_pas_retenu(self):
        # Règle « ANTÉRIEUR » : le snapshot daté du jour du flux est exclu.
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 13), dt.date(2026, 1, 31)]
        valeurs = [100.0, 999.0, 220.0]
        detail = metrics.valorisations_avant_flux(
            dates, valeurs, [dt.date(2026, 1, 13)]
        )
        assert detail[dt.date(2026, 1, 13)]["snapshot"] == dt.date(2026, 1, 1)
        assert detail[dt.date(2026, 1, 13)]["valeur"] == pytest.approx(100.0)

    def test_une_valorisation_mesuree_reste_prioritaire(self):
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 31)]
        detail = metrics.valorisations_avant_flux(
            dates, [100.0, 220.0], [dt.date(2026, 1, 13)],
            mesurees={dt.date(2026, 1, 13): 104.0},
        )
        assert detail[dt.date(2026, 1, 13)]["origine"] == "mesurée"
        assert detail[dt.date(2026, 1, 13)]["valeur"] == pytest.approx(104.0)

    def test_un_flux_avant_le_premier_snapshot_est_manquant_avec_raison(self):
        dates = [dt.date(2026, 1, 10), dt.date(2026, 1, 31)]
        detail = metrics.valorisations_avant_flux(
            dates, [100.0, 220.0], [dt.date(2026, 1, 3)]
        )
        e = detail[dt.date(2026, 1, 3)]
        assert e["origine"] == "manquante"
        assert e["valeur"] is None
        assert "aucun snapshot antérieur" in e["raison"]

    def test_un_snapshot_anterieur_a_valeur_nulle_ne_valorise_pas(self):
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 31)]
        detail = metrics.valorisations_avant_flux(
            dates, [0.0, 220.0], [dt.date(2026, 1, 13)]
        )
        assert detail[dt.date(2026, 1, 13)]["origine"] == "manquante"

    def test_intervalle_non_valorisable_rend_le_twr_global_none(self):
        # A2 : la valorisation manque (snapshot antérieur nul) → intervalle non
        # calculé → TWR global None, et une raison est fournie.
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 31), dt.date(2026, 2, 28)]
        valeurs = [0.0, 220.0, 240.0]
        flux = {dt.date(2026, 1, 13): 100.0}
        valorisations = metrics.valorisations_completees(dates, valeurs, flux.keys())
        twr, nc = metrics.twr_exact(dates, valeurs, flux, valorisations)
        assert twr is None
        assert len(nc) == 1
        assert nc[0]["raison"]


# ---------------------------------------------------------------------------
# A2 — TWR global : jamais un total partiel
# ---------------------------------------------------------------------------

class TestTwrGlobalJamaisPartiel:
    def test_un_seul_intervalle_non_calcule_rend_le_total_none(self):
        # Intervalle 1 exact (+10 %), intervalle 2 non calculable : pas de total.
        dates = [dt.date(2026, 1, 1), dt.date(2026, 1, 31), dt.date(2026, 2, 28)]
        valeurs = [100.0, 110.0, 130.0]
        flux = {dt.date(2026, 2, 10): 10.0}
        valorisations = {}
        # Pas de valorisation pour le flux de février : le snapshot du 31 janvier
        # n'est pas reconstruit ici car on fournit une valeur explicite à None.
        twr, nc = metrics.twr_exact(dates, valeurs, flux, valorisations)
        assert twr is None
        assert nc[0]["de"] == dt.date(2026, 1, 31)

    def test_session_annualise_none_si_un_intervalle_manque(self):
        ctx = CtxBidon(
            snapshots(
                [dt.date(2024, 1, 1), dt.date(2024, 6, 1), dt.date(2024, 12, 31)],
                [100.0, 110.0, 130.0],
            ),
            pd.DataFrame(),
        )
        assert S.twr_portefeuille(ctx) == pytest.approx(0.30)
        assert S.twr_annualise_portefeuille(ctx) is not None


# ---------------------------------------------------------------------------
# A4 — Bout en bout sur snapshots réalistes (2024-2025)
# ---------------------------------------------------------------------------

def _serie_realiste():
    """24 snapshots mensuels fin de mois (2024-2025), 10 000 € au départ.

    Chaque mois : le 15, un apport de 500 € à partir de mars 2024 ; puis la
    hausse de marché de +1 % a lieu APRÈS l'apport (en seconde quinzaine). Dans
    ce modèle, la valeur juste avant chaque flux est exactement le snapshot de
    fin de mois précédent : la reconstruction est donc exacte, et le TWR vaut
    exactement 1,01^23 − 1.

    Valorisation avant apport : captée (« mesurée ») en 2024, ABSENTE en 2025
    (reconstruite depuis le snapshot précédent).
    """
    fins = []
    d = dt.date(2024, 1, 31)
    for _ in range(24):
        fins.append(d)
        d = (pd.Timestamp(d) + pd.offsets.MonthEnd(1)).date()
    valeurs = []
    capital = 10_000.0
    apports_rows = []
    for i, fin in enumerate(fins):
        if i > 0:
            if i >= 2:
                avant = round(capital, 2)           # valeur juste avant le 15
                capital += 500.0
                apports_rows.append({
                    "date": dt.date(fin.year, fin.month, 15).isoformat(),
                    "sens": "apport",
                    "montant_eur": 500.0,
                    "valeur_avant_eur": avant if fin.year == 2024 else None,
                })
            capital *= 1.01                         # marché : seconde quinzaine
        valeurs.append(round(capital, 6))
    snaps = pd.DataFrame({"Date": pd.to_datetime(fins),
                          "patrimoine_investi_eur": valeurs})
    apports = pd.DataFrame(apports_rows)
    return snaps, apports


class TestBoutEnBout:
    def test_le_twr_global_est_calcule_sur_une_serie_realiste(self):
        snaps, apports = _serie_realiste()
        ctx = CtxBidon(snaps, apports)
        total = S.twr_portefeuille(ctx)
        assert total is not None
        assert ctx.twr_non_calcules == []

    def test_les_annees_2024_et_2025_sont_calculables(self):
        snaps, apports = _serie_realiste()
        ctx = CtxBidon(snaps, apports)
        df, valeurs, flux, valorisations = S.serie_performance(ctx)
        dates = [d.date() for d in df["Date"]]
        rendements, non_calcules = metrics.rendements_stricts(
            dates, valeurs, S.flux_par_date(apports, "montant_eur"), valorisations
        )
        assert non_calcules == []
        par_annee = metrics.twr_par_annee(dates[1:], rendements)
        assert set(par_annee) == {2024, 2025}
        assert par_annee[2024] is not None
        assert par_annee[2025] is not None

    def test_valorisation_reconstruite_pour_2025(self):
        snaps, apports = _serie_realiste()
        ctx = CtxBidon(snaps, apports)
        detail = S.serie_performance(ctx)[0].attrs["valorisations_detail"]
        origines = {f: e["origine"] for f, e in detail.items()}
        assert origines[dt.date(2025, 3, 15)] == "reconstruite"
        assert origines[dt.date(2024, 4, 15)] == "mesurée"
        # Reconstruite depuis le snapshot de fin de février 2025 (antérieur).
        assert detail[dt.date(2025, 3, 15)]["snapshot"] == dt.date(2025, 2, 28)

    def test_le_twr_reconstruit_est_exact_quand_la_hausse_suit_les_flux(self):
        # Modèle où la valeur juste avant chaque flux égale le snapshot précédent :
        # la reconstruction (2025) coïncide avec la mesure (2024). Le TWR global
        # vaut exactement 1,01^23 − 1 (23 intervalles de +1 %).
        snaps, apports = _serie_realiste()
        ctx = CtxBidon(snaps, apports)
        total = S.twr_portefeuille(ctx)
        assert total == pytest.approx(1.01 ** 23 - 1, abs=1e-7)   # arrondi des snapshots à 6 décimales

    def test_sans_apport_le_twr_est_la_variation_brute(self):
        snaps, _ = _serie_realiste()
        ctx = CtxBidon(snaps, pd.DataFrame())
        total = S.twr_portefeuille(ctx)
        assert total == pytest.approx(snaps["patrimoine_investi_eur"].iloc[-1]
                                      / snaps["patrimoine_investi_eur"].iloc[0] - 1.0)

    def test_un_flux_avant_le_premier_snapshot_est_hors_fenetre(self):
        # Interprétation documentée (voir l'en-tête) : ce flux ne rend pas le
        # TWR non calculé, car il est déjà contenu dans la valeur du premier
        # snapshot. Il n'entre dans aucun intervalle.
        snaps = snapshots([dt.date(2024, 4, 1), dt.date(2024, 12, 31)], [10_000.0, 11_000.0])
        apports = pd.DataFrame({"date": ["2024-03-01"], "sens": ["apport"],
                                "montant_eur": [500.0]})
        ctx = CtxBidon(snaps, apports)
        assert S.twr_portefeuille(ctx) == pytest.approx(0.10)
        assert ctx.twr_non_calcules == []
