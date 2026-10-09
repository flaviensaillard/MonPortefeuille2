"""Ventes excédentaires : rejetées partout, 2074 et 2086 inclus
(revue 2.0.1, constat 6 ; miroir JS dans tests/test_ventes_excedentaires.js).

Avant la 2.1.0, le portefeuille refusait une vente supérieure à la position
détenue, mais le calcul fiscal la laissait passer : le 2074 déduisait un prix
d'acquisition calculé sur la quantité VENDUE (y compris les titres jamais
détenus) et le 2086 clampait silencieusement les quantités. Scénario de la
revue : 10 titres acquis, vente saisie de 12.

Ce qui est verrouillé ici :
- un validateur partagé (`core.portfolio.erreur_vente_excedentaire`) refuse la
  vente excédentaire avec les mêmes conventions d'ordre que le portefeuille
  (à date égale, les achats passent avant les ventes) ;
- `detail_2074_de_lannee` écarte la vente excédentaire, annonce l'écart et ne
  produit aucun chiffre dessus ;
- `detail_2086_de_lannee` fait de même pour les actifs numériques ;
- une vente dans la limite de la position passe sans être inquiétée.
"""

from __future__ import annotations

import datetime as dt

import pytest

from core import tax
from core.portfolio import Transaction, erreur_vente_excedentaire


def _tx(ticker: str, typ: str, jour: str, quantite: float, cours: float,
        devise: str = "EUR", frais: float = 0.0, id: int | None = None) -> Transaction:
    net = quantite * cours + (frais if typ == "achat" else -frais)
    return Transaction(
        ticker=ticker, type=typ, date=dt.date.fromisoformat(jour),
        quantite=quantite, cours=cours, frais=frais, devise=devise,
        montant_net=net, id=id,
    )


def _faux_fx(taux: float = 1.0):
    return lambda devise, date, contre="EUR": taux


class TestLeValidateurPartage:
    def test_une_vente_superieure_a_la_position_est_refusee(self):
        txs = [_tx("CW8.L", "achat", "2025-01-10", 10, 100.0)]
        vente = _tx("CW8.L", "vente", "2025-06-01", 12, 110.0)
        message = erreur_vente_excedentaire(txs, vente)
        assert message is not None
        assert "CW8.L" in message

    def test_une_vente_dans_la_position_passe(self):
        txs = [_tx("CW8.L", "achat", "2025-01-10", 10, 100.0)]
        assert erreur_vente_excedentaire(txs, _tx("CW8.L", "vente", "2025-06-01", 10, 110.0)) is None

    def test_un_achat_du_meme_jour_fournit_des_lots(self):
        # Convention du portefeuille : à date égale, l'achat précède la vente.
        txs = [_tx("CW8.L", "achat", "2025-06-01", 10, 100.0)]
        assert erreur_vente_excedentaire(txs, _tx("CW8.L", "vente", "2025-06-01", 10, 110.0)) is None

    def test_une_vente_du_meme_jour_retire_des_lots_par_prudence(self):
        txs = [
            _tx("CW8.L", "achat", "2025-01-10", 10, 100.0),
            _tx("CW8.L", "vente", "2025-06-01", 8, 110.0),
        ]
        vente2 = _tx("CW8.L", "vente", "2025-06-01", 5, 110.0)
        assert erreur_vente_excedentaire(txs, vente2) is not None  # 10 − 8 = 2 < 5

    def test_un_achat_posterieur_ne_compte_pas(self):
        txs = [_tx("CW8.L", "achat", "2025-09-01", 10, 100.0)]
        assert erreur_vente_excedentaire(txs, _tx("CW8.L", "vente", "2025-06-01", 5, 110.0)) is not None

    def test_les_autres_titres_ne_comptent_pas(self):
        txs = [_tx("AIR.PA", "achat", "2025-01-10", 10, 100.0)]
        assert erreur_vente_excedentaire(txs, _tx("CW8.L", "vente", "2025-06-01", 1, 110.0)) is not None

    def test_la_ligne_en_cours_de_modification_peut_etre_ecartee(self):
        txs = [
            _tx("CW8.L", "achat", "2025-01-10", 10, 100.0),
            _tx("CW8.L", "vente", "2025-06-01", 8, 110.0, id=7),
        ]
        # On remonte la quantité de la vente existante (id 7) à 10 : elle doit
        # être jugée SANS se retirer elle-même ses 8 lots.
        modifiee = _tx("CW8.L", "vente", "2025-06-01", 10, 110.0, id=7)
        assert erreur_vente_excedentaire(txs, modifiee, id_exclu=7) is None


class TestLe2074RejetteLaVenteExcedentaire:
    def test_la_vente_excedentaire_ne_produit_aucun_chiffre(self, monkeypatch):
        monkeypatch.setattr("core.fx.taux", _faux_fx(1.0))
        txs = [
            _tx("CW8.L", "achat", "2025-01-10", 10, 100.0),
            _tx("CW8.L", "vente", "2025-06-01", 12, 110.0),   # 12 vendus, 10 détenus
        ]
        d = tax.detail_2074_de_lannee(txs, 2025)
        assert d["operations"] == [], "aucune ligne ne doit être calculée sur l'excédent"
        assert d["ventes_excedentaires"], "l'écart doit être annoncé"
        assert d["bilan_net"] == 0
        assert d["case_3vg"] == 0 and d["case_3vh"] == 0

    def test_une_vente_normale_passe_sans_etre_inquietee(self, monkeypatch):
        monkeypatch.setattr("core.fx.taux", _faux_fx(1.0))
        txs = [
            _tx("CW8.L", "achat", "2025-01-10", 10, 100.0),
            _tx("CW8.L", "vente", "2025-06-01", 10, 110.0),
        ]
        d = tax.detail_2074_de_lannee(txs, 2025)
        assert d["ventes_excedentaires"] == []
        assert len(d["operations"]) == 1
        assert d["bilan_net"] == pytest.approx(100.0)   # 1 100 − 1 000

    def test_la_vente_sans_aucun_lot_est_rejetee_et_annoncee(self, monkeypatch):
        monkeypatch.setattr("core.fx.taux", _faux_fx(1.0))
        txs = [_tx("CW8.L", "vente", "2025-06-01", 5, 110.0)]
        d = tax.detail_2074_de_lannee(txs, 2025)
        assert d["operations"] == []
        assert d["ventes_excedentaires"], "une vente sans lot doit être annoncée"


class TestLe2086RejetteLaVenteExcedentaire:
    def test_une_vente_crypto_excedentaire_est_ecartee(self, monkeypatch):
        monkeypatch.setattr("core.fx.taux", _faux_fx(1.0))
        txs = [
            _tx("BTCUSDT", "achat", "2025-01-10", 1, 10000.0, devise="USD"),
            _tx("BTCUSDT", "vente", "2025-06-01", 2, 11000.0, devise="USD"),
        ]
        d = tax.detail_2086_de_lannee(txs, 2025)
        assert d["cessions"] == [], "la cession fictive ne doit pas entrer au 2086"
        assert d["ventes_excedentaires"], "l'écart doit être annoncé"

    def test_une_vente_crypto_dans_la_position_passe(self, monkeypatch):
        monkeypatch.setattr("core.fx.taux", _faux_fx(1.0))
        txs = [
            _tx("BTCUSDT", "achat", "2025-01-10", 2, 10000.0, devise="USD"),
            _tx("BTCUSDT", "vente", "2025-06-01", 1, 11000.0, devise="USD"),
        ]
        d = tax.detail_2086_de_lannee(txs, 2025)
        assert d["ventes_excedentaires"] == []
        assert len(d["cessions"]) == 1
