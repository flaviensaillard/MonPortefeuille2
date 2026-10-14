"""Notice DGFiP 2086 revenus 2025 : quotient hors frais, ligne 51 nette."""
import pytest

from core import tax
from core.portfolio import Transaction


def transaction(ticker, typ, date, quantite, cours, frais=0):
    from datetime import date as Date
    return Transaction(ticker=ticker, type=typ, date=Date.fromisoformat(date),
                       quantite=quantite, cours=cours, frais=frais, devise="EUR",
                       montant_net=quantite * cours + (frais if typ == "achat" else -frais))


def test_2086_frais_distincts_du_quotient_et_du_seuil(monkeypatch):
    monkeypatch.setattr("core.fx.taux", lambda *_args: 1)
    monkeypatch.setattr("core.prices.cours", lambda *_args: 500)
    txs = [transaction("BTC-USD", "achat", "2025-01-01", 2, 500),
           transaction("BTC-USD", "vente", "2025-08-01", 1, 320, 20)]
    inventaire = [{"actif": "ETH-USD", "date": txs[0].date, "quantite": 1,
                   "cout_acquisition_eur": 500, "source": "test"}]
    d = tax.detail_2086_de_lannee(txs, 2025, inventaire=inventaire)
    c = d["cessions"][0]
    assert c["ligne_212"] == 1140
    assert c["ligne_213"] == 320
    assert c["ligne_214"] == 20
    assert c["ligne_217"] == 320
    assert c["ligne_218"] == 300
    assert c["fraction_capital"] == pytest.approx(1500 * 320 / 1140, abs=0.01)
    assert c["ligne_224"] == pytest.approx(300 - 1500 * 320 / 1140, abs=0.01)
    assert d["total_cessions_213"] == 320
    assert d["total_cessions_218"] == 300
    assert d["exonere_305"] is True
    assert d["case_3bn"] == 0
