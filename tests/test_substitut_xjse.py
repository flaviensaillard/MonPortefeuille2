"""XJSE.SW sans cotation vivante : substitut, référence saisie, puis échec explicite.

Contexte (constat 2.1.0, « XJSE.SW sans cotation vivante »)
-----------------------------------------------------------
XJSE.SW (Xtrackers II Japan Government Bond UCITS ETF 1C) est détenu. Yahoo ne
publie plus de cours vivant pour ce listing : le « cours du moment » est figé au
06/12/2023 et rejeté par les garde-fous de `core/prices.py`. Le même fonds est
coté vivant à Xetra sous XJSE.DE, en EUR.

Trois couches, dans cet ordre, pour la VALORISATION (pas pour le cache nocturne) :

1. XJSE.SW lui-même, s'il redevient vivant (JPY, chemin existant) ;
2. substitut XJSE.DE (EUR), avec les mêmes garde-fous de fraîcheur de séance
   et de cohérence que tout autre cours ;
3. cours de référence saisi à la main, daté de 7 jours au plus ;
4. au-delà : échec explicite. Le snapshot devient partiel et une alerte est
   écrite (comportement existant, message enrichi).

Chaque test de couche doit être ROUGE sur l'ancien code.
"""

from __future__ import annotations

import datetime as dt
import types

import pandas as pd
import pytest

from core import db, fx, prices
from core.models import Classe
from core.portfolio import Position, valoriser

AUJOURDHUI = dt.date.today()
MAINTENANT = dt.datetime.now(dt.timezone.utc).timestamp()
FOSSILE_2023 = dt.datetime(2023, 12, 6, 17, 55, tzinfo=dt.timezone.utc).timestamp()


class _FastInfo:
    def __init__(self, dernier: float, veille: float):
        self.last_price = dernier
        self.previous_close = veille


class _Listing:
    """Un listing Yahoo factice : cours vivant ou non, séance fossile ou non."""

    # symbole -> (dernier, veille, meta)
    listings: dict[str, tuple[float, float, dict]] = {}

    def __init__(self, symbole: str):
        self.symbole = symbole
        dernier, veille, meta = _Listing.listings.get(symbole, (0.0, 0.0, {}))
        self.fast_info = _FastInfo(dernier, veille)
        self._meta = dict(meta)

    def get_history_metadata(self) -> dict:
        return dict(self._meta)

    def history(self, **_kw) -> pd.DataFrame:
        # Aucun historique récent pour XJSE.SW : la série 5 jours est vide.
        return pd.DataFrame({"Close": []})


VIVANT_DE = {"regularMarketTime": int(MAINTENANT), "regularMarketChangePercent": 0.42}
FOSSILE = {"regularMarketTime": int(FOSSILE_2023), "regularMarketChangePercent": 0.0}


@pytest.fixture(autouse=True)
def _etat_propre(monkeypatch):
    prices.vider_cache()
    prices._series.clear()
    _Listing.listings = {}
    monkeypatch.setattr(prices, "yf", types.SimpleNamespace(Ticker=lambda s: _Listing(s)))

    taux = {("EUR", "EUR"): 1.0, ("EUR", "USD"): 1.10, ("JPY", "EUR"): 1 / 180.0, ("JPY", "USD"): 1 / 165.0}
    monkeypatch.setattr(fx, "taux", lambda devise, jour, contre="EUR": taux[(devise, contre)])
    yield
    prices.vider_cache()
    prices._series.clear()


def _position_xjse(quantite: float = 10.0) -> dict[str, Position]:
    return {
        "XJSE.SW": Position(
            ticker="XJSE.SW", classe=Classe.OBLIGATION_ETF, poche="jgb",
            quantite=quantite, devise_cotation="JPY",
        )
    }


def _ref(cours: float, jours: int) -> dict:
    return {"XJSE.SW": {"cours": cours, "devise": "EUR",
                        "date": (AUJOURDHUI - dt.timedelta(days=jours)).isoformat()}}


# ---------------------------------------------------------------------------
# Couche 1 — substitut XJSE.DE
# ---------------------------------------------------------------------------

class TestCouche1Substitut:
    def test_xjse_sw_fossile_valorise_par_xjse_de_en_euros(self):
        _Listing.listings = {
            "XJSE.SW": (1297.45, 1059.0, FOSSILE),
            "XJSE.DE": (6.0138, 5.9887, VIVANT_DE),
        }
        actifs, echecs = valoriser(_position_xjse(10.0))

        assert echecs == [], "le substitut vivant doit éviter tout échec"
        assert len(actifs) == 1
        a = actifs[0]
        assert a.prix == pytest.approx(6.0138)
        # Le cours est en EUR : la valeur doit valoir 10 × 6,0138 €, pas 10 × 6,0138 × 180.
        assert a.devise_cotation == "EUR"
        assert a.valeur_eur == pytest.approx(60.138)

    def test_la_fiche_annonce_le_substitut(self):
        _Listing.listings = {
            "XJSE.SW": (1297.45, 1059.0, FOSSILE),
            "XJSE.DE": (6.0138, 5.9887, VIVANT_DE),
        }
        c = prices.cotation_actuelle("XJSE.SW")
        assert c.source == "substitut"
        assert c.devise == "EUR"
        assert c.note == "cours via XJSE.DE · EUR"

    def test_substitut_fossile_n_est_pas_utilise(self):
        """Même garde-fou de fraîcheur pour le substitut que pour tout autre cours."""
        _Listing.listings = {
            "XJSE.SW": (1297.45, 1059.0, FOSSILE),
            "XJSE.DE": (6.0138, 5.9887, FOSSILE),
        }
        with pytest.raises(prices.CoursIndisponible):
            prices.cotation_actuelle("XJSE.SW")


# ---------------------------------------------------------------------------
# Couche 2 — cours de référence saisi à la main, 7 jours au plus
# ---------------------------------------------------------------------------

class TestCouche2Reference:
    def test_reference_recente_prend_le_relais(self):
        # Ni XJSE.SW ni XJSE.DE ne sont vivants.
        _Listing.listings = {"XJSE.SW": (1297.45, 1059.0, FOSSILE)}
        actifs, echecs = valoriser(_position_xjse(10.0), references=_ref(6.0, jours=3))

        assert echecs == []
        a = actifs[0]
        assert a.prix == pytest.approx(6.0)
        assert a.devise_cotation == "EUR"
        assert a.valeur_eur == pytest.approx(60.0)
        assert "référence" in a.note_cours

    def test_reference_de_huit_jours_est_refusee(self):
        """Limite de 7 jours : au-delà, la référence ne vaut plus rien (couche 3)."""
        _Listing.listings = {"XJSE.SW": (1297.45, 1059.0, FOSSILE)}
        actifs, echecs = valoriser(_position_xjse(), references=_ref(6.0, jours=8))
        assert echecs == ["XJSE.SW"]
        assert actifs == []

    def test_lecture_des_references_depuis_config(self, monkeypatch):
        df = pd.DataFrame([
            {"Clé": "cours_ref:XJSE.SW", "Valeur":
             '{"cours": 6.0, "devise": "EUR", "date": "2026-10-08"}'},
            {"Clé": "pf2_allocation_json", "Valeur": "{}"},
        ])
        monkeypatch.setattr(db, "lire", lambda table: df)
        refs = db.cours_de_reference()
        assert refs == {"XJSE.SW": {"cours": 6.0, "devise": "EUR", "date": "2026-10-08"}}

    def test_saisie_refusee_si_date_trop_ancienne_ou_cours_nul(self):
        with pytest.raises(ValueError):
            db.valider_cours_de_reference("XJSE.SW", 6.0, "EUR",
                                          (AUJOURDHUI - dt.timedelta(days=8)).isoformat(),
                                          aujourdhui=AUJOURDHUI)
        with pytest.raises(ValueError):
            db.valider_cours_de_reference("XJSE.SW", 0.0, "EUR", AUJOURDHUI.isoformat(),
                                          aujourdhui=AUJOURDHUI)
        with pytest.raises(ValueError):
            db.valider_cours_de_reference("XJSE.SW", 6.0, "EUR",
                                          (AUJOURDHUI + dt.timedelta(days=1)).isoformat(),
                                          aujourdhui=AUJOURDHUI)


# ---------------------------------------------------------------------------
# Couche 3 — échec explicite : le snapshot devient partiel, et on le dit
# ---------------------------------------------------------------------------

class TestCouche3Echec:
    def test_sans_substitut_ni_reference_l_echec_nomme_les_couches(self):
        _Listing.listings = {"XJSE.SW": (1297.45, 1059.0, FOSSILE)}
        actifs, echecs = valoriser(_position_xjse(), references={})

        assert echecs == ["XJSE.SW"]
        assert actifs == []
        with pytest.raises(prices.CoursIndisponible) as info:
            prices.cotation_actuelle("XJSE.SW", references={})
        message = str(info.value)
        assert "XJSE.DE" in message, "l'échec doit dire que le substitut a été tenté"
        assert "référence" in message, "l'échec doit dire qu'aucune référence n'existe"


# ---------------------------------------------------------------------------
# Robot nocturne : la devise écrite dans pf2_cours suit le cours, pas la position
# ---------------------------------------------------------------------------

class TestRobotEcritLaDeviseDuCours:
    def test_pf2_cours_recoit_eur_et_6_0138_pour_xjse_sw(self, monkeypatch):
        import jobs.update_market_data as job

        _Listing.listings = {
            "XJSE.SW": (1297.45, 1059.0, FOSSILE),
            "XJSE.DE": (6.0138, 5.9887, VIVANT_DE),
        }
        monkeypatch.setattr(job, "tickers_a_coter", lambda: ["XJSE.SW"])
        monkeypatch.setattr(job.fx, "taux", lambda d, j, c="EUR": 1.0)
        ecrits: list = []
        monkeypatch.setattr(job.db, "remplacer", lambda table, lignes, **kw: ecrits.append((table, lignes)))
        monkeypatch.setattr(job.db, "ajouter_alerte", lambda *a, **kw: None)

        assert job.main() == 0
        cours = [l for table, lignes in ecrits if table == job.db.T_COURS for l in lignes]
        assert cours, "le substitut vivant doit être écrit dans le cache"
        assert cours[0]["ticker"] == "XJSE.SW"
        assert cours[0]["cours"] == pytest.approx(6.0138)
        assert cours[0]["devise"] == "EUR"


def test_la_fiche_affiche_la_mention_du_cours():
    """La fiche (app.py) doit annoncer l'origine du cours quand elle n'est pas le listing natif."""
    import pathlib

    source = (pathlib.Path(__file__).resolve().parent.parent / "app.py").read_text(encoding="utf-8")
    assert "note_cours" in source, "la fiche doit afficher la mention « cours via XJSE.DE · EUR »"
