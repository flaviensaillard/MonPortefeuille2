"""Complétude des snapshots (revue 2.0.1, constats D-01, D-02, F-20).

Ce qui est verrouillé ici (rouge sur l'ancien code) :
- D-02 : un portefeuille entièrement en liquidités produit QUAND MÊME un point
  (investi = 0) — avant la 2.1.0, le robot rentrait bredouille ;
- D-01 : une valorisation partielle (cours manquant) est écrite MAIS marquée
  `complet = false` avec la liste des manquants — avant, elle entrait dans
  l'historique sans aucun marqueur ;
- l'absence du cours de l'or n'abandonne plus le snapshot : l'indicateur or
  reste NULL et le point est marqué incomplet ;
- `db.snapshots()` écarte les points partiels des séries — avant, ils
  alimentaient le TWR comme des points normaux ;
- une alerte « Snapshot partiel » accompagne chaque point incomplet.
"""

from __future__ import annotations

import datetime as dt

import pandas as pd
import pytest

from core import db, fx, portfolio, prices
from jobs import daily_snapshot


# ---------------------------------------------------------------------------
# Faux monde : pas de Supabase, tout est singé au niveau module.
# ---------------------------------------------------------------------------
class MondeSimule:
    def __init__(self):
        self.snapshots_ecrits: list[dict] = []
        self.alertes: list[dict] = []
        self.transactions = pd.DataFrame()
        self.liquidites: dict = {}
        self.cours_disponibles = {"IGLN.L": 40.5}
        self.or_disponible = True
        self.eur_usd_disponible = True

    def installer(self, monkeypatch):
        monde = self

        monkeypatch.setattr(db, "tables_requises_manquantes", lambda: [])
        monkeypatch.setattr(db, "transactions", lambda: monde.transactions)
        monkeypatch.setattr(db, "soldes_comptes_liquidites", lambda: dict(monde.liquidites))
        monkeypatch.setattr(db, "ajouter_snapshot", lambda ligne: monde.snapshots_ecrits.append(dict(ligne)))
        monkeypatch.setattr(db, "ajouter_alerte", monde._alerter)
        # AUCUN contact réseau ni Supabase, même quand le réseau répond : sans
        # ces deux verrous, `daily_snapshot` relisait les cours vivants de
        # Yahoo (`prices.cotation_du_moment`) et les cours de référence de
        # Supabase en direct. Hors ligne il retombait sur la simulation et le
        # test passait ; en CI (connectée) Yahoo lui servait un vrai cours et
        # `test_un_cours_manquant_marque_le_snapshot_incomplet` échouait.
        monkeypatch.setattr(db, "cours_de_reference", lambda: {})
        monkeypatch.setattr(db, "lire_allocation_personnalisee", lambda: None)
        monkeypatch.setattr(prices, "cotation_du_moment", lambda ticker: None)

        def faux_cours(ticker, date=None):
            if ticker == "GC=F":
                if monde.or_disponible:
                    return 2650.0
                raise prices.CoursIndisponible(ticker, "cours or simulé indisponible")
            if ticker in monde.cours_disponibles:
                return monde.cours_disponibles[ticker]
            raise prices.CoursIndisponible(ticker, "cours simulé indisponible")

        def faux_taux(devise, date, contre="EUR"):
            if devise == contre:
                return 1.0
            if contre == "USD" and devise == "EUR" and not monde.eur_usd_disponible:
                raise fx.FXIndisponible(devise, contre, str(date), "taux simulé indisponible")
            return {"EUR": 1.0, "USD": 1.1, "CHF": 0.95}.get(devise, 1.0)

        monkeypatch.setattr(prices, "cours", faux_cours)
        monkeypatch.setattr(prices, "cours_or", lambda date=None: faux_cours("GC=F", date))
        monkeypatch.setattr(fx, "taux", faux_taux)
        monkeypatch.setattr(portfolio, "prices", prices)
        monkeypatch.setattr(portfolio, "fx", fx)

    def _alerter(self, titre, message, niveau="info"):
        self.alertes.append({"titre": titre, "message": message, "niveau": niveau})


def _transactions_igln() -> pd.DataFrame:
    return pd.DataFrame([{
        "Ticker": "IGLN.L", "Type": "Achat", "Date": "2025-01-10",
        "Quantité": 100.0, "Cours": 34.2, "Frais": 9.9, "Devise": "USD",
    }])


@pytest.fixture()
def monde(monkeypatch):
    m = MondeSimule()
    m.installer(monkeypatch)
    return m


# ---------------------------------------------------------------------------
# D-02 — le cash seul est un patrimoine : il produit un point
# ---------------------------------------------------------------------------
def test_un_portefeuille_en_cash_seul_produit_un_point(monde):
    monde.liquidites = {
        "EUR": {"ticker": "EUR", "quantite": 5000.0, "perimetre": "courant"},
        "CHF": {"ticker": "CHF", "quantite": 8000.0, "perimetre": "precaution"},
    }
    rc = daily_snapshot.main()
    assert rc == 0
    assert len(monde.snapshots_ecrits) == 1, "aucun point écrit pour un portefeuille en cash seul"
    s = monde.snapshots_ecrits[0]
    assert s["patrimoine_investi_eur"] == 0.0
    assert s["patrimoine_total_eur"] == pytest.approx(5000.0 + 8000.0 * 0.95, abs=0.01)
    assert s["complet"] is True


def test_rien_du_tout_ne_produit_rien(monde):
    rc = daily_snapshot.main()
    assert rc == 0
    assert monde.snapshots_ecrits == []


# ---------------------------------------------------------------------------
# D-01 — le point partiel est écrit, marqué, et n'entre pas dans les séries
# ---------------------------------------------------------------------------
def test_un_cours_manquant_marque_le_snapshot_incomplet(monde):
    monde.transactions = _transactions_igln()
    monde.cours_disponibles = {}          # plus aucun cours
    rc = daily_snapshot.main()
    assert rc == 0
    assert len(monde.snapshots_ecrits) == 1
    s = monde.snapshots_ecrits[0]
    assert s["complet"] is False
    assert "IGLN.L" in (s["manquantes"] or "")
    assert any("partiel" in a["titre"].lower() or "partiel" in a["message"].lower()
               for a in monde.alertes), "le point partiel doit être alerté"


def test_une_liquidite_sans_taux_marque_le_snapshot_incomplet(monde):
    monde.liquidites = {"CNY": {"ticker": "CNY", "quantite": 1000.0, "perimetre": "courant"}}

    def taux_sans_cny(devise, date, contre="EUR"):
        if devise == "CNY":
            raise fx.FXIndisponible(devise, contre, str(date), "pas de CNY")
        return 1.0

    import core.fx as module_fx
    module_fx.taux = taux_sans_cny       # le job et le portfolio lisent via le module
    rc = daily_snapshot.main()
    assert rc == 0
    s = monde.snapshots_ecrits[0]
    assert s["complet"] is False
    assert "CNY" in (s["manquantes"] or "")


def test_l_or_absent_n_abandonne_plus_le_snapshot(monde):
    monde.transactions = _transactions_igln()
    monde.or_disponible = False
    rc = daily_snapshot.main()
    assert rc == 0, "l'absence du cours de l'or ne doit plus abandonner le snapshot"
    s = monde.snapshots_ecrits[0]
    assert s["cours_or_usd"] is None
    assert s["equivalent_or_oz"] is None
    assert s["complet"] is False
    assert s["patrimoine_investi_eur"] > 0, "la poche investie reste valorisée"


# ---------------------------------------------------------------------------
# Les points partiels n'entrent JAMAIS dans les séries
# ---------------------------------------------------------------------------
def test_db_snapshots_ecarte_les_points_partiels(monkeypatch):
    brut = pd.DataFrame([
        {"date": "2026-01-01", "patrimoine_total_eur": 100, "patrimoine_investi_eur": 100, "complet": True},
        {"date": "2026-01-02", "patrimoine_total_eur": 55, "patrimoine_investi_eur": 55, "complet": False},
        {"date": "2026-01-03", "patrimoine_total_eur": 110, "patrimoine_investi_eur": 110, "complet": True},
    ])
    monkeypatch.setattr(db, "lire", lambda table: brut.copy())
    df = db.snapshots()
    assert len(df) == 2, "le point partiel doit être écarté des séries"
    assert df["Date"].tolist() == ["2026-01-01", "2026-01-03"]


def test_db_snapshots_sans_colonne_complet_garde_tout(monkeypatch):
    """Lignes antérieures à la migration 005 : pas de colonne `complet`,
    aucune ne doit disparaître."""
    brut = pd.DataFrame([
        {"date": "2025-12-30", "patrimoine_total_eur": 90, "patrimoine_investi_eur": 90},
        {"date": "2025-12-31", "patrimoine_total_eur": 95, "patrimoine_investi_eur": 95},
    ])
    monkeypatch.setattr(db, "lire", lambda table: brut.copy())
    df = db.snapshots()
    assert len(df) == 2
