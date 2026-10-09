"""Devise absente : NULL annoncé, jamais « NAN = 1 » — moteur Python
(revue 2.0.1, constat D-04 ; miroir JS dans tests/test_devise_absente.js).

Avant la 2.1.0, `core/fx.taux()` déclarait explicitement les devises vides ou
« NAN » égales à 1 : 1 000 unités d'une devise absente entraient comme
1 000 EUR, sans conversion ni bannière.

Ce qui est verrouillé ici :
- taux('NAN'), taux(''), taux(NaN pandas) et toute devise hors ISO 4217
  lèvent `FXIndisponible` — jamais 1 ;
- la même devise contre elle-même reste 1 (cas légitime) ;
- une transaction importée avec la devise « NAN » et un ticker inconnu est
  refusée avec un message qui nomme le problème ;
- une transaction importée avec la devise « NAN » mais un ticker connu de la
  table de cotation retrouve sa vraie devise (USD pour IGLN.L), pas 1.
"""

from __future__ import annotations

import pandas as pd
import pytest

from core import devises, fx, portfolio


class TestLeConvertisseurNePrendPlusJamaisNanPourUn:
    def test_devise_nan_leve(self):
        with pytest.raises(fx.FXIndisponible, match="devise absente"):
            fx.taux("NAN", "2026-01-01")

    def test_devise_vide_leve(self):
        with pytest.raises(fx.FXIndisponible, match="devise absente"):
            fx.taux("", "2026-01-01")

    def test_devise_none_leve(self):
        with pytest.raises(fx.FXIndisponible, match="devise absente"):
            fx.taux(None, "2026-01-01")

    def test_nan_pandas_leve(self):
        with pytest.raises(fx.FXIndisponible, match="devise absente"):
            fx.taux(float("nan"), "2026-01-01")

    def test_devise_hors_iso_leve(self):
        with pytest.raises(fx.FXIndisponible, match="ISO 4217"):
            fx.taux("ZZZ", "2026-01-01")

    def test_la_meme_devise_contre_elle_meme_reste_un(self):
        assert fx.taux("USD", "2026-01-01", "USD") == 1.0

    def test_est_iso_rejette_nan_et_accepte_les_codes_actifs(self):
        assert not devises.est_iso("NAN")
        assert not devises.est_iso("")
        assert not devises.est_iso(None)
        assert devises.est_iso("usd")
        assert devises.est_iso("CHF")


class TestUneTransactionImporteeAvecNan:
    def _ligne(self, devise, ticker="INCONNU.L"):
        return pd.DataFrame([{
            "Ticker": ticker, "Type": "Achat", "Date": "2025-01-10",
            "Quantité": 10.0, "Cours": 5.0, "Frais": 0.0, "Devise": devise,
        }])

    def test_nan_avec_ticker_inconnu_est_refusee_en_la_nommmant(self):
        with pytest.raises(ValueError, match="devise absente pour INCONNU.L"):
            portfolio.charger_transactions(self._ligne("NAN"))

    def test_nan_pandas_avec_ticker_inconnu_est_refusee_aussi(self):
        with pytest.raises(ValueError, match="devise absente"):
            portfolio.charger_transactions(self._ligne(float("nan")))

    def test_nan_avec_ticker_connu_retrouve_la_devise_de_cotation(self):
        tx = portfolio.charger_transactions(self._ligne("NAN", ticker="IGLN.L"))
        assert len(tx) == 1
        assert tx[0].devise == "USD", "la vraie devise de cotation doit remplacer NAN"

    def test_une_devise_valide_passe(self):
        tx = portfolio.charger_transactions(self._ligne("USD"))
        assert tx[0].devise == "USD"
