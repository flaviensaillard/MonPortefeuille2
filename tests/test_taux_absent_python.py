"""Taux EUR/USD absent : aucun repli fabriqué dans les calculs Python.

Principe : « Un repli silencieux qui fabrique un chiffre plausible est pire qu'une
absence affichée. » Chaque test vérifie qu'un taux absent produit une absence
(« — », None, exclusion annoncée) et jamais un chiffre calculé avec 1,0 ou 1,125.
"""
from __future__ import annotations

import datetime as dt
from types import SimpleNamespace

import pytest

from core import db, metrics, rebalance, ui
from core.fx import FXIndisponible


# ---------------------------------------------------------------------------
# 1. Affichage : un montant en euros sans taux s'affiche « — », pas « 100 € »
# ---------------------------------------------------------------------------

def test_affichage_usd_eur_sans_taux_montre_tiret_pour_les_euros():
    ui.definir_taux_eur_usd(None)
    assert ui.usd_eur(100.0) == "100,00 $ / —"


def test_affichage_taux_absent_efface_le_taux_de_la_veille():
    # Un taux du jour précédent ne doit pas servir d'équivalent si le taux du jour manque.
    ui.definir_taux_eur_usd(0.9)
    ui.definir_taux_eur_usd(None)
    assert ui.usd_eur(100.0) == "100,00 $ / —"
    ui.definir_taux_eur_usd(None)


def test_affichage_avec_taux_valide_convertit():
    ui.definir_taux_eur_usd(1.2)   # convention du projet : dollars pour un euro
    try:
        assert ui.usd_eur(90.0) == "90,00 $ / 75,00 €"
    finally:
        ui.definir_taux_eur_usd(None)


# ---------------------------------------------------------------------------
# 2. Retraite : la rente en euros est None sans taux, les dollars restent calculés
# ---------------------------------------------------------------------------

def test_rente_sans_taux_n_a_aucun_montant_en_euros():
    r = metrics.calculer_rente_mensuelle_reelle(
        capital_usd=100_000.0, apports_cumules_usd=50_000.0,
        rendement_annuel=0.05, taux_eur_usd=None,
    )
    champs_eur = [v for k, v in r.items() if k.endswith("_eur")]
    assert champs_eur, "la rente doit exposer des champs en euros"
    assert all(v is None for v in champs_eur), f"montants en euros sans taux : {champs_eur}"
    assert any(v is not None for k, v in r.items() if k.endswith("_usd")), \
        "les montants en dollars ne dépendent pas du taux : ils doivent rester calculés"


def test_rente_avec_taux_valide_donne_des_euros():
    r = metrics.calculer_rente_mensuelle_reelle(
        capital_usd=100_000.0, apports_cumules_usd=50_000.0,
        rendement_annuel=0.05, taux_eur_usd=0.9,
    )
    champs_eur = [v for k, v in r.items() if k.endswith("_eur") and v is not None]
    assert champs_eur, "avec un taux valide, les montants en euros doivent exister"


# ---------------------------------------------------------------------------
# 3. Ajustement de solde : refusé sans taux, aucune écriture
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("taux", [None, 0, -1.0])
def test_ajuster_solde_sans_taux_refuse_et_n_ecrit_rien(monkeypatch, taux):
    def client_interdit():
        raise AssertionError("aucune écriture ne doit être tentée sans taux")
    monkeypatch.setattr(db, "client", client_interdit)
    with pytest.raises(ValueError, match="taux EUR/USD indisponible"):
        db.ajuster_solde_compte("EUR", 10.0, taux_usd=taux)


# ---------------------------------------------------------------------------
# 4. Ordre de rééquilibrage : pas de quantité sans cours de change
# ---------------------------------------------------------------------------

def _ecart(actif_taux):
    from core.rebalance import EcartPoche
    actif = SimpleNamespace(ticker="CW8", valeur_eur=6000.0, prix=100.0, dernier_taux=actif_taux)
    return EcartPoche(
        poche_cle="rv", poche_nom="Actions", poids_reel=0.6, poids_cible=0.5, bande=0.05,
        valeur_eur=6000.0, valeur_cible_eur=5000.0, actifs=[actif],
    )


def test_ordre_sans_cours_de_change_n_a_pas_de_quantite():
    ordres, _ = rebalance.generer_ordres([_ecart(actif_taux=None)])
    assert ordres, "l'ordre existe, mais sans quantité"
    assert all(o.quantite is None for o in ordres)
    assert all("cours de change indisponible" in o.motif for o in ordres)


def test_ordre_avec_cours_de_change_a_une_quantite():
    ordres, _ = rebalance.generer_ordres([_ecart(actif_taux=0.9)])
    assert ordres and all(o.quantite is not None and o.quantite > 0 for o in ordres)


# ---------------------------------------------------------------------------
# 5. Alerte crypto : sans taux, ni « sous le seuil » ni « dépassez » ne sont écrits
# ---------------------------------------------------------------------------

def test_alerte_seuil_crypto_sans_taux_n_affirme_ni_sous_ni_sur_le_seuil(monkeypatch):
    from jobs import fiscal_alerts as fa
    from core.models import Classe

    annee = dt.date.today().year
    cession = SimpleNamespace(
        est_vente=True, date=dt.date(annee, 3, 1), ticker="BTC-USD",
        devise="USD", montant_net=120.0,
    )
    ecrites: list[tuple[str, str]] = []

    def taux(devise, date, contre="EUR"):
        if devise == "USD" and contre == "EUR":
            raise FXIndisponible(devise, contre, date, "pas de taux USD/EUR")
        return 0.9

    monkeypatch.setattr(fa, "charger_transactions", lambda _df: [cession])
    monkeypatch.setattr(fa.db, "transactions", lambda: None)
    monkeypatch.setattr(fa, "classe_de", lambda ticker: Classe.CRYPTO)
    monkeypatch.setattr(fa.fx, "taux", taux)
    monkeypatch.setattr(fa.db, "ajouter_alerte", lambda titre, message, **k: ecrites.append((titre, message)))

    fa.main()

    seuil = [m for t, m in ecrites if "Seuil crypto" in t]
    assert len(seuil) == 1, f"une seule alerte de seuil attendue : {ecrites}"
    message = seuil[0]
    assert "indisponible" in message
    assert "SOUS le seuil" not in message and "DÉPASSEZ" not in message, \
        "une affirmation de seuil sans taux est un chiffre fabriqué"
