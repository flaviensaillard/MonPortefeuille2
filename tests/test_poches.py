"""Appartenance des tickers aux poches.

Défaut de production : FLXC.L (Franklin FTSE China) était classé dans la poche
« Énergie » à côté de XDW0.L, et la poche « Asie / Chine » ne contenait que
RI.PA — un titre que l'utilisateur ne détient pas. Résultat à l'écran :
« Asie / Chine » à 0 %, ce qui est illisible alors qu'on détient 800 parts d'un
ETF chinois. La leçon : une classe d'actifs n'est pas une devinette, elle se
vérifie contre le nom du titre.
"""

from __future__ import annotations

from core.models import (
    Classe,
    POCHES,
    POCHES_PAR_CLE,
    allocation_par_defaut,
    appliquer_allocation_personnalisee,
    cible_actif,
    poche_de,
    reinitialiser_allocation_par_defaut,
    slug_poche,
    verifier_allocation_cible,
)
from core.portfolio import classe_de, devise_cotation_de


def test_flxc_est_dans_la_poche_asie():
    """FLXC.L = Franklin FTSE China UCITS ETF (ISIN IE00BHZRR147)."""
    assert poche_de("FLXC.L") is not None
    assert poche_de("FLXC.L").cle == "asie"


def test_flxc_n_est_pas_dans_energie():
    assert "FLXC.L" not in poche_de("XDW0.L").membres
    energie = next(p for p in POCHES if p.cle == "energie")
    assert energie.membres == ["XDW0.L"]


def test_poche_asie_non_vide():
    """Une poche sans membre détenu affiche 0 % — d'où le message absurde."""
    asie = next(p for p in POCHES if p.cle == "asie")
    assert asie.membres, "la poche Asie ne doit jamais être vide"
    assert "FLXC.L" in asie.membres


def test_toutes_les_poches_investies_ont_un_membre():
    for poche in POCHES:
        if poche.cible > 0:
            assert poche.membres, f"poche {poche.cle} : cible > 0 sans membre"


def test_chaque_ticker_appartient_a_au_plus_une_poche():
    vus: dict[str, str] = {}
    for poche in POCHES:
        for ticker in poche.membres:
            assert ticker not in vus, (
                f"{ticker} est dans {vus[ticker]} ET {poche.cle} : "
                "il serait compté deux fois dans l'allocation"
            )
            vus[ticker] = poche.cle


def test_allocation_par_defaut_equilibree_a_100_pct():
    reinitialiser_allocation_par_defaut()
    etat = verifier_allocation_cible()
    assert etat["equilibre_100"] is True
    assert etat["depasse_100"] is False
    assert etat["inferieur_100"] is False
    assert abs(etat["total_pct"] - 100.0) < 1e-4
    assert etat["message"] == ""


def test_alerte_allocation_depasse_100_pct():
    cfg = allocation_par_defaut()
    # On augmente IGLN.L de 10 % à 25 % -> total = 115 % (> 100 %)
    for a in cfg["actifs"]:
        if a["ticker"] == "IGLN.L":
            a["cible"] = 0.25
    etat = verifier_allocation_cible(cfg)
    assert etat["depasse_100"] is True
    assert etat["equilibre_100"] is False
    assert abs(etat["total_pct"] - 115.0) < 1e-4
    assert abs(etat["ecart_100_pct"] - 15.0) < 1e-4
    assert "Alerte" in etat["message"]
    assert "115.0 %" in etat["message"]


def test_ajout_nouvel_actif_et_nouvelle_poche():
    try:
        cfg = allocation_par_defaut()
        cle_suisse = slug_poche("Actions suisses")
        assert cle_suisse == "actions_suisses"
        cfg["poches"].append({
            "cle": cle_suisse,
            "nom": "Actions suisses",
            "bande": 0.05,
            "description": "Valeurs défensives en CHF",
        })
        # On réduit XDW0.L de 30 % à 20 % et on ajoute NESN.SW à 10 %
        for a in cfg["actifs"]:
            if a["ticker"] == "XDW0.L":
                a["cible"] = 0.20
        cfg["actifs"].append({
            "ticker": "NESN.SW",
            "nom": "Nestlé SA",
            "poche": cle_suisse,
            "cible": 0.10,
            "classe": "action",
            "devise": "CHF",
        })
        appliquer_allocation_personnalisee(cfg)
        assert poche_de("NESN.SW") is not None
        assert poche_de("NESN.SW").cle == "actions_suisses"
        assert abs(POCHES_PAR_CLE["actions_suisses"].cible - 0.10) < 1e-6
        assert abs(POCHES_PAR_CLE["energie"].cible - 0.20) < 1e-6
        assert abs(cible_actif("NESN.SW") - 0.10) < 1e-6
        assert classe_de("NESN.SW") == Classe.ACTION_ETF
        assert devise_cotation_de("NESN.SW") == "CHF"
        etat = verifier_allocation_cible(cfg)
        assert etat["equilibre_100"] is True
        assert etat["depasse_100"] is False
    finally:
        reinitialiser_allocation_par_defaut()

