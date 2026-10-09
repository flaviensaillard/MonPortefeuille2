"""Le direct doit être comparé au snapshot nocturne, jamais à l'avant-dernier."""
import datetime as dt

import pandas as pd
import pytest

from core import session as S


class DateFixe(dt.date):
    @classmethod
    def today(cls):
        return cls(2026, 10, 7)


@pytest.fixture
def contexte(monkeypatch):
    monkeypatch.setattr(S.dt, "date", DateFixe)
    monkeypatch.setattr(S.db, "lire", lambda table: pd.DataFrame())
    ctx = S.Contexte()
    ctx.taux_eur_usd = 1.125
    ctx.total_investi_eur = 72529.0
    ctx.total_investi_usd = 72529.0 * ctx.taux_eur_usd
    ctx.patrimoine_total_eur = 82529.0
    ctx.patrimoine_total_usd = 82529.0 * ctx.taux_eur_usd
    ctx.total_precaution_eur = 10000.0
    ctx.total_precaution_usd = 11250.0
    ctx.snapshots = pd.DataFrame([
        {"Date": pd.Timestamp("2026-10-06"), "patrimoine_investi_eur": 70084.0,
         "patrimoine_total_eur": 80084.0, "equivalent_or_oz": 70084.0 * 1.125 / 4000, "cours_or_usd": 4000.0},
        {"Date": pd.Timestamp("2026-10-07"), "patrimoine_investi_eur": 72226.23,
         "patrimoine_total_eur": 82226.23, "precaution_eur": 10000.0,
         "equivalent_or_oz": 72226.23 * 1.125 / 4000, "cours_or_usd": 4000.0},
    ])
    return ctx


@pytest.mark.parametrize("perimetre,base", [("Portefeuille investi", 72226.23), ("Patrimoine total", 82226.23)])
def test_snapshot_du_7_octobre_conserve(contexte, perimetre, base):
    originaux = contexte.snapshots.copy(deep=True)
    S._enrichir_historiques_usd(contexte)
    pd.testing.assert_frame_equal(originaux, contexte.snapshots.iloc[:2][originaux.columns])
    p = S.progression_periode(contexte, perimetre=perimetre)
    assert p["v_debut_usd"] == pytest.approx(base * 1.125, abs=0.01)
    assert p["gain_marche_eur"] == pytest.approx(302.77, abs=0.01)
    assert p["twr_per"] == pytest.approx(302.77 / base, abs=1e-7)
    assert p["apports_periode_usd"] == 0
    assert "dernier enregistrement" in p["label_periode"]
    assert len(contexte.snapshots) == 3


def test_un_seul_snapshot_suffit_avec_le_direct(contexte):
    contexte.snapshots = contexte.snapshots.tail(1).reset_index(drop=True)
    S._enrichir_historiques_usd(contexte)
    p = S.progression_periode(contexte)
    assert not p["vide"]
    assert p["gain_marche_eur"] == pytest.approx(302.77, abs=0.01)


def test_snapshot_recent_prioritaire_sur_projections(contexte, monkeypatch):
    projections = pd.DataFrame([
        {"Date": "06/10/2026", "Actifs Stratégiques": 70084 * 1.125, "Capital investi": 60000},
        {"Date": "07/10/2026", "Actifs Stratégiques": 70000 * 1.125, "Capital investi": 60000},
    ])
    monkeypatch.setattr(S.db, "lire", lambda table: projections if table == "Projections" else pd.DataFrame())
    S._enrichir_historiques_usd(contexte)
    p = S.progression_periode(contexte)
    assert p["gain_marche_eur"] == pytest.approx(302.77, abs=0.01)
    assert contexte.snapshots["capital_investi_usd"].tolist() == [60000, 60000, 60000]


def test_snapshot_ancien_direct_date_du_jour_et_apport_neutralise(contexte):
    contexte.snapshots = contexte.snapshots.tail(1).reset_index(drop=True)
    contexte.snapshots["Date"] = pd.Timestamp("2026-10-05")
    contexte.apports = pd.DataFrame([{"date": "2026-10-06", "sens": "apport", "montant_eur": 100, "montant_usd": 112.5}])
    S._enrichir_historiques_usd(contexte)
    p = S.progression_periode(contexte)
    assert contexte.snapshots["Date"].iloc[-1] == pd.Timestamp("2026-10-07")
    assert p["apports_periode_usd"] == 112.5
    assert p["gain_marche_eur"] == pytest.approx(202.77, abs=0.01)


def test_apport_du_jour_pas_compte_deux_fois(contexte):
    contexte.apports = pd.DataFrame([{"date": "2026-10-07", "sens": "apport", "montant_eur": 100, "montant_usd": 112.5}])
    S._enrichir_historiques_usd(contexte)
    _, _, flux, _valo = S.serie_performance(contexte)
    assert flux == [0, 112.5, 0]


def test_conversion_usd_historique_et_pas_taux_du_jour(contexte):
    contexte.snapshots = contexte.snapshots.tail(1).reset_index(drop=True)
    contexte.snapshots["equivalent_or_oz"] = 72226.23 * 1.12 / 4000
    S._enrichir_historiques_usd(contexte)
    p = S.progression_periode(contexte)
    assert p["v_debut_usd"] == pytest.approx(72226.23 * 1.12, abs=0.01)
    assert p["v_fin_usd"] == pytest.approx(72529 * 1.125, abs=0.01)
    # Le rendement USD inclut le change, il n'est pas le ratio brut en EUR.
    assert p["twr_per"] == pytest.approx((72529 * 1.125) / (72226.23 * 1.12) - 1, abs=1e-7)


def test_sans_cours_live_ne_pas_effacer_le_snapshot(contexte):
    contexte.total_investi_usd = 0
    S._enrichir_historiques_usd(contexte)
    assert len(contexte.snapshots) == 2
    assert contexte.snapshots.iloc[-1]["patrimoine_investi_eur"] == 72226.23


def test_pas_de_doublon_live_apres_reenrichissement(contexte):
    S._enrichir_historiques_usd(contexte)
    S._enrichir_historiques_usd(contexte)
    assert len(contexte.snapshots) == 3
    assert S.progression_periode(contexte)["gain_marche_eur"] == pytest.approx(302.77, abs=0.01)


def test_un_seul_snapshot_sans_live_ne_plante_pas(contexte):
    contexte.snapshots = contexte.snapshots.tail(1).reset_index(drop=True)
    contexte.total_investi_usd = 0
    S._enrichir_historiques_usd(contexte)
    assert S.progression_periode(contexte)["gain_marche_usd"] == 0


def test_snapshot_sans_or_utilise_le_repli_de_change(contexte):
    contexte.snapshots = contexte.snapshots.drop(columns=["equivalent_or_oz", "cours_or_usd"])
    S._enrichir_historiques_usd(contexte)
    assert S.progression_periode(contexte)["gain_marche_eur"] == pytest.approx(302.77, abs=0.01)


def test_ordre_de_lecture_supabase_sans_importance(contexte):
    contexte.snapshots = contexte.snapshots.iloc[::-1]
    S._enrichir_historiques_usd(contexte)
    assert S.progression_periode(contexte)["gain_marche_eur"] == pytest.approx(302.77, abs=0.01)


# ---------------------------------------------------------------------------
# Les achats et ventes de titres sont des transferts INTERNES
# ---------------------------------------------------------------------------
# Le cas réel du 07/10/2026 : 68 FLXC.L achetés pour 1 943,91 $, saisis APRÈS
# le snapshot du 06/10 et avant celui du 07/10. L'application affichait
# +2,85 % (+2 246 $) pour la journée parce qu'elle comparait le direct à
# l'avant-dernier enregistrement ; le courtier, lui, annonçait -0,69 %.
#
# Ici : la bonne référence est le 07/10 (81 267,52 $), la journée vaut
# -312,52 $ (-0,38 %), et un achat saisi après la référence s'ajoute aux
# apports du périmètre INVESTI sans jamais toucher au patrimoine total.
from core.portfolio import Transaction, flux_titres_internes, montant_net_usd

SNAPSHOTS_07 = pd.DataFrame([
    {"Date": pd.Timestamp("2026-10-06"), "patrimoine_investi_eur": 70115.82,
     "patrimoine_investi_usd": 78708.86, "patrimoine_total_usd": 90000.00,
     "cree_le": "2026-10-06T18:05:00Z"},
    {"Date": pd.Timestamp("2026-10-07"), "patrimoine_investi_eur": 72226.63,
     "patrimoine_investi_usd": 81267.52, "patrimoine_total_usd": 93432.15,
     "cree_le": "2026-10-07T18:05:00Z"},
    {"Date": pd.Timestamp("2026-10-07"), "_live": True,
     "patrimoine_investi_eur": 72462.00, "patrimoine_investi_usd": 80955.00,
     "patrimoine_total_usd": 93110.52},
])


def achat_flxc(cree_le=None, date=None, devise="USD", montant=1943.91):
    return Transaction(
        ticker="FLXC.L", type="achat", date=date or dt.date(2026, 10, 7),
        quantite=68.0, cours=28.355, frais=15.77, devise=devise,
        montant_net=montant, cree_le=cree_le,
    )


class ContexteTransfert:
    """Assez de `Contexte` pour `progression_periode`."""

    def __init__(self, transactions=None, snapshots=None):
        self.taux_eur_usd = 1.125
        self.snapshots = (snapshots if snapshots is not None else SNAPSHOTS_07).copy()
        self.apports = pd.DataFrame(columns=["date", "sens", "montant_eur", "montant_usd"])
        self.transactions = transactions or []


def test_la_reference_est_le_dernier_snapshot_pas_lavant_dernier():
    ctx = ContexteTransfert()
    p = S.progression_periode(ctx, "Progression journalière", "Portefeuille investi")
    assert p["v_debut_usd"] == pytest.approx(81267.52, abs=0.01)
    assert p["gain_marche_usd"] == pytest.approx(-312.52, abs=0.02)
    assert p["twr_per"] == pytest.approx(-312.52 / 81267.52, rel=1e-6)


def test_achat_avant_la_reference_ne_compte_pas_deux_fois():
    """L'achat du 06/10 au soir figure déjà dans le snapshot du 07/10."""
    ctx = ContexteTransfert([achat_flxc(cree_le=dt.datetime(2026, 10, 6, 21, 30))])
    p = S.progression_periode(ctx, "Progression journalière", "Portefeuille investi")
    assert p["apports_periode_usd"] == pytest.approx(0.0)
    assert p["gain_marche_usd"] == pytest.approx(-312.52, abs=0.02)


def test_achat_apres_la_reference_est_un_apport_du_perimetre_investi():
    snaps = SNAPSHOTS_07.copy()
    # Le direct inclut l'achat de 1 943,91 $ : sans correction il serait compté
    # comme un gain de marché.
    snaps.loc[2, "patrimoine_investi_usd"] = 80955.00 + 1943.91
    snaps.loc[2, "patrimoine_investi_eur"] = 72462.00 + 1727.92
    ctx = ContexteTransfert([achat_flxc(cree_le=dt.datetime(2026, 10, 7, 20, 30))], snaps)

    p = S.progression_periode(ctx, "Progression journalière", "Portefeuille investi")
    assert p["apports_periode_usd"] == pytest.approx(1943.91, abs=0.02)
    assert p["gain_marche_usd"] == pytest.approx(-312.52, abs=0.05)

    # Le patrimoine total ne bouge pas : le transfert reste à l'intérieur.
    total = S.progression_periode(ctx, "Progression journalière", "Patrimoine total")
    assert total["apports_periode_usd"] == pytest.approx(0.0)


def test_vente_apres_la_reference_se_deduit():
    vente = Transaction(
        ticker="FLXC.L", type="vente", date=dt.date(2026, 10, 7), quantite=10.0,
        cours=28.0, frais=5.0, devise="USD", montant_net=275.0,
        cree_le=dt.datetime(2026, 10, 7, 20, 30),
    )
    assert flux_titres_internes([vente], dt.date(2026, 10, 7),
                                "2026-10-07T18:05:00Z") == pytest.approx(-275.0)


def test_sans_horodatage_repli_prudent_sur_la_date():
    reference, cree = dt.date(2026, 10, 7), None
    meme_jour = achat_flxc(date=dt.date(2026, 10, 7), cree_le=None)
    apres = achat_flxc(date=dt.date(2026, 10, 8), cree_le=None)
    assert flux_titres_internes([meme_jour], reference, cree) == 0.0
    assert flux_titres_internes([apres], reference, cree) == pytest.approx(1943.91)


def test_montant_en_dollars_sans_passage_reseau():
    assert montant_net_usd(achat_flxc()) == pytest.approx(1943.91)


def test_retrait_du_tableau_apports_est_bien_negatif():
    """Les montants sont stockés positifs : c'est `sens` qui porte le signe."""
    ctx = ContexteTransfert()
    ctx.apports = pd.DataFrame([
        {"date": "2026-10-07", "sens": "retrait", "montant_eur": 1000.0,
         "montant_usd": 1125.0},
    ])
    # Convention verrouillée : un retrait daté du 07/10 est négatif, et il est
    # rattaché à la période qui se termine au snapshot du 07/10.
    assert S.flux_par_date(ctx.apports, "montant_usd") == {dt.date(2026, 10, 7): -1125.0}
    flux = S.serie_performance(ctx)[2]
    assert -1125.0 in [round(f, 2) for f in flux]
