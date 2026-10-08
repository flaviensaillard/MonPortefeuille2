"""La cotation du moment doit être vérifiée avant d'être affichée.

Cas réels constatés le 08/10/2026 :
- XJSE.SW : Yahoo sert un « cours du moment » figé au 06/12/2023, +22,5 %
  au-dessus du marché réel — à rejeter ;
- IGLN.L, XDW0.L, FLXC.L : la série publique troue la séance de la veille,
  mais les métadonnées portent la variation du jour CALCULÉE PAR YAHOO
  (même référence que le courtier) — à utiliser en priorité.
"""

from __future__ import annotations

import datetime as dt
import types

import pytest

from core import prices


class _FakeFastInfo:
    def __init__(self, dernier: float, veille: float):
        self._dernier, self._veille = dernier, veille

    @property
    def last_price(self) -> float:
        return self._dernier

    @property
    def previous_close(self) -> float:
        return self._veille


class _FakeTicker:
    """Remplace `yf.Ticker` : aucune requête réseau."""

    meta: dict = {}
    dernier: float = 0.0
    veille: float = 0.0

    def __init__(self, symbole: str):
        self.symbole = symbole
        self.fast_info = _FakeFastInfo(_FakeTicker.dernier, _FakeTicker.veille)

    def get_history_metadata(self) -> dict:
        return dict(_FakeTicker.meta)


@pytest.fixture()
def yf_factice(monkeypatch):
    def _installer(meta: dict, dernier: float, veille: float) -> None:
        _FakeTicker.meta = meta
        _FakeTicker.dernier = dernier
        _FakeTicker.veille = veille
        module = types.SimpleNamespace(Ticker=lambda s: _FakeTicker(s))
        monkeypatch.setattr(prices, "yf", module, raising=True)

    prices._cache_var.clear()
    prices._cache_devise.clear()
    return _installer


def test_cours_fossile_rejete(yf_factice):
    """Un « cours du moment » daté de 2023 ne doit jamais être utilisé (XJSE.SW)."""
    fossile = dt.datetime(2023, 12, 6, 17, 55, tzinfo=dt.timezone.utc).timestamp()
    yf_factice(
        {"regularMarketTime": int(fossile), "regularMarketChangePercent": 0.0},
        dernier=1297.45, veille=1059.0,
    )
    assert prices.cotation_du_moment("XJSE.SW") is None
    assert prices.variation_recente("XJSE.SW") is None


def test_cours_divergent_rejete(yf_factice):
    """Un cours 30 % au-dessus de la clôture précédente est une donnée fausse."""
    maintenant = dt.datetime.now(dt.timezone.utc).timestamp()
    yf_factice(
        {"regularMarketTime": int(maintenant), "regularMarketChangePercent": 30.0},
        dernier=130.0, veille=100.0,
    )
    assert prices.cotation_du_moment("PIEGE.L") is None


def test_cas_normal_la_variation_yahoo_prime(yf_factice):
    """Cours crédible : la variation publiée par Yahoo est celle du courtier.

    IGLN.L le 08/10/2026 : la série trouait la séance de la veille, ce qui
    donnait −0,94 % au lieu de +0,41 %.
    """
    maintenant = dt.datetime.now(dt.timezone.utc).timestamp()
    yf_factice(
        {"regularMarketTime": int(maintenant), "regularMarketChangePercent": 0.4141},
        dernier=80.0275, veille=80.63,
    )
    assert prices.cotation_du_moment("IGLN.L") == pytest.approx(80.0275)
    assert prices.variation_recente("IGLN.L") == pytest.approx(0.004141)


def test_sans_pct_la_variation_vient_des_deux_cotations(yf_factice):
    maintenant = dt.datetime.now(dt.timezone.utc).timestamp()
    yf_factice(
        {"regularMarketTime": int(maintenant)},
        dernier=81.2, veille=80.6,
    )
    assert prices.cotation_du_moment("NORMAL.L") == pytest.approx(81.2)
    assert prices.variation_recente("NORMAL.L") == pytest.approx(81.2 / 80.6 - 1)


def test_crypto_tolere_un_grand_ecart(yf_factice):
    maintenant = dt.datetime.now(dt.timezone.utc).timestamp()
    yf_factice(
        {"regularMarketTime": int(maintenant)},
        dernier=150.0, veille=100.0,
    )
    assert prices.cotation_du_moment("BTC-USD") == pytest.approx(150.0)
    assert prices.variation_recente("BTC-USD") == pytest.approx(0.5)
