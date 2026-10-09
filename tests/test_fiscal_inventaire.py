"""Fiscalité : inventaire crypto hors application, et plus aucune valeur avalée.

Revue 2.0.1 — T-01 (repli FX vers le montant brut), T-02 (2086 sans inventaire
externe) et priorité 5 (`except Exception: pass` dans le 2086).

Avant la 2.1.0 :
- le 2086 ne voyait que les transactions suivies par l'application : un ETH
  détenu sur une autre plateforme n'entrait ni dans la valeur globale (ligne 212),
  ni dans le prix d'acquisition (ligne 220) — le dénominateur était faux ;
- une erreur de cours était avalée par `except Exception: pass` : le portefeuille
  était valorisé sans l'actif, en silence ;
- une erreur de taux faisait entrer le montant étranger BRUT comme des euros,
  dans le 2074 comme dans le 2086.

Désormais, l'inventaire externe entre dans le calcul, et tout cours ou taux
manquant rend le calcul INCOMPLET : `calcul_complet` vaut False et `indisponible`
nomme ce qui manque. Rien n'est produit à la place.
"""

from __future__ import annotations

import datetime as dt
import pathlib
import re

import pytest

from core import fx, prices, tax
from core.portfolio import Transaction

RACINE = pathlib.Path(__file__).resolve().parent.parent


def _tx(ticker, typ, jour, quantite, cours, devise="USD", frais=0.0):
    net = quantite * cours
    net = net + frais if typ == "achat" else net - frais
    return Transaction(
        ticker=ticker, type=typ, date=dt.date.fromisoformat(jour),
        quantite=quantite, cours=cours, frais=frais, devise=devise, montant_net=net,
    )


def _taux_usd_eur(monkeypatch, taux=0.5):
    def faux(devise, date, contre="EUR"):
        if devise == contre:
            return 1.0
        if devise == "USD" and contre == "EUR":
            return taux
        raise fx.FXIndisponible(devise, contre, date, "absent du test")

    monkeypatch.setattr("core.fx.taux", faux)


def _cours(monkeypatch, table):
    def faux(ticker, date=None):
        if ticker in table:
            return table[ticker]
        raise prices.CoursIndisponible(ticker, str(date or ""), "absent du test")

    monkeypatch.setattr("core.prices.cours", faux)


def _inventaire_eth(date="2025-01-01", quantite=2.0, cout=3000.0):
    return [{
        "actif": "ETH-USD", "date": dt.date.fromisoformat(date),
        "quantite": quantite, "cout_acquisition_eur": cout, "source": "Kraken",
    }]


TXS_BTC = [
    _tx("BTCUSDT", "achat", "2025-01-10", 2, 10000.0),
    _tx("BTCUSDT", "vente", "2025-06-01", 1, 12000.0),
]


class TestInventaireExterneDansLe2086:
    def test_la_position_externe_entre_dans_la_valeur_et_le_cout(self, monkeypatch):
        _taux_usd_eur(monkeypatch)
        _cours(monkeypatch, {"ETH-USD": 2000.0})
        d = tax.detail_2086_de_lannee(TXS_BTC, 2025, inventaire=_inventaire_eth())
        c = d["cessions"][0]
        # Valeur globale : 2 BTC x 6 000 € + 2 ETH x 2 000 $ x 0,5 = 14 000 €
        assert c["ligne_212"] == pytest.approx(14000.0)
        # Prix d'acquisition : 10 000 € (BTC suivi) + 3 000 € (ETH déclarés)
        assert c["ligne_220"] == pytest.approx(13000.0)
        # Fraction : 13 000 x 6 000 / 14 000 ; ligne 224 = 6 000 - fraction
        assert c["ligne_224"] == pytest.approx(6000.0 - 13000.0 * 6000.0 / 14000.0, abs=0.01)
        assert d["calcul_complet"] is True
        assert d["sources_externes"] == ["Kraken"]

    def test_un_solde_externe_absent_avant_la_vente_bloque_le_calcul(self, monkeypatch):
        """Un actif déclaré hors application doit avoir un solde à la date de vente :
        sinon sa présence avant cette date est inconnue, et le calcul s'arrête."""
        _taux_usd_eur(monkeypatch)
        _cours(monkeypatch, {"ETH-USD": 2000.0})
        d = tax.detail_2086_de_lannee(TXS_BTC, 2025, inventaire=_inventaire_eth(date="2025-09-01"))
        assert d["calcul_complet"] is False
        assert any("ETH-USD" in m for m in d["indisponible"])

    def test_un_cout_externe_manquant_bloque_le_calcul(self, monkeypatch):
        _taux_usd_eur(monkeypatch)
        _cours(monkeypatch, {"ETH-USD": 2000.0})
        d = tax.detail_2086_de_lannee(TXS_BTC, 2025, inventaire=_inventaire_eth(cout=None))
        assert d["calcul_complet"] is False
        assert any("acquisition" in m for m in d["indisponible"])

    def test_un_cours_externe_manquant_bloque_le_calcul(self, monkeypatch):
        _taux_usd_eur(monkeypatch)
        _cours(monkeypatch, {})
        d = tax.detail_2086_de_lannee(TXS_BTC, 2025, inventaire=_inventaire_eth())
        assert d["calcul_complet"] is False
        assert any("ETH-USD" in m for m in d["indisponible"])

    def test_sans_inventaire_le_resultat_reste_celui_d_avant(self, monkeypatch):
        """Non-régression : données complètes, pas d'inventaire → mêmes chiffres."""
        _taux_usd_eur(monkeypatch)
        d = tax.detail_2086_de_lannee(TXS_BTC, 2025)
        c = d["cessions"][0]
        assert c["ligne_212"] == pytest.approx(12000.0)
        assert c["ligne_224"] == pytest.approx(1000.0)
        assert d["calcul_complet"] is True
        assert d["indisponible"] == []


class TestAucunCoursNEstAvale:
    def test_un_cours_manquant_d_un_autre_actif_bloque_le_2086(self, monkeypatch):
        """Avant : `except Exception: pass` valorisait sans l'actif, en silence."""
        _taux_usd_eur(monkeypatch)
        _cours(monkeypatch, {})
        txs = [
            _tx("BTC-USD", "achat", "2025-01-05", 1, 10000.0),
            _tx("BTCUSDT", "achat", "2025-01-10", 2, 10000.0),
            _tx("BTC-USD", "vente", "2025-06-01", 1, 12000.0),
        ]
        d = tax.detail_2086_de_lannee(txs, 2025)
        assert d["calcul_complet"] is False
        assert any("BTCUSDT" in m for m in d["indisponible"])


class TestTauxAbsentNEntrePasEnEuros:
    def test_taux_absent_bloque_le_2074(self, monkeypatch):
        """Avant : le montant brut en dollars entrait comme des euros."""
        def pas_de_taux(devise, date, contre="EUR"):
            raise fx.FXIndisponible(devise, contre, date, "absent du test")

        monkeypatch.setattr("core.fx.taux", pas_de_taux)
        txs = [
            _tx("FLXC.L", "achat", "2025-01-10", 10, 100.0),
            _tx("FLXC.L", "vente", "2025-06-01", 5, 120.0),
        ]
        d = tax.detail_2074_de_lannee(txs, 2025)
        assert d["calcul_complet"] is False
        assert d["indisponible"]

    def test_taux_absent_bloque_le_2086(self, monkeypatch):
        def pas_de_taux(devise, date, contre="EUR"):
            raise fx.FXIndisponible(devise, contre, date, "absent du test")

        monkeypatch.setattr("core.fx.taux", pas_de_taux)
        d = tax.detail_2086_de_lannee(TXS_BTC, 2025)
        assert d["calcul_complet"] is False
        assert d["indisponible"]


class TestAucunExceptPass:
    """Le calcul fiscal et la configuration fiscale ne ravalent plus une erreur."""

    MOTIF = re.compile(r"except[^\n]*:\s*\n\s*pass\b")

    def test_le_fiscal_ne_contient_aucun_except_pass(self):
        fichiers = [
            RACINE / "core" / "tax.py",
            RACINE / "core" / "fiscal_bars.py",
            RACINE / "pages" / "4_Fiscalite.py",
        ]
        coupables = [f.name for f in fichiers
                     if self.MOTIF.search(f.read_text(encoding="utf-8"))]
        source_db = (RACINE / "core" / "db.py").read_text(encoding="utf-8")
        debut = source_db.index("def lire_config_fiscale")
        fin = source_db.index("def lire_allocation_personnalisee")
        if self.MOTIF.search(source_db[debut:fin]):
            coupables.append("db.py (configuration fiscale)")
        assert not coupables, "except ... pass encore présent : " + ", ".join(coupables)
