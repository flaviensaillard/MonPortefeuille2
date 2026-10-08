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
    Perimetre,
    POCHES_PAR_CLE,
    allocation_par_defaut,
    appliquer_allocation_personnalisee,
    bande_actif,
    cible_actif,
    poche_de,
    reinitialiser_allocation_par_defaut,
    slug_poche,
    verifier_allocation_cible,
)
from core.portfolio import classe_de, devise_cotation_de


def test_ri_pa_est_hors_perimetre():
    """RI.PA (Pernod Ricard) est détenu chez un AUTRE courtier que Swissquote.

    Il doit donc rester hors périmètre : suivi, affiché à part, et jamais
    compté dans les totaux. Sans poche « hors », il retombait dans le
    patrimoine investi — d'où l'écart de 3 409 $ entre la tuile et la somme
    des cartes.
    """
    p = poche_de("RI.PA")
    assert p is not None
    assert p.cle == "hors"
    assert p.perimetre == Perimetre.HORS
    assert "RI.PA" not in {
        t for poche in POCHES if poche.perimetre == Perimetre.INVESTI
        for t in poche.membres
    }


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


def test_or_et_bitcoin_dans_leurs_poches_respectives():
    """L'or (IGLN.L) va dans 'Réserve de valeur physique' (15 %) et Bitcoin
    (BTCUSDT) va dans 'Réserve de valeur numérique' (5 %)."""
    reinitialiser_allocation_par_defaut()
    p_or = poche_de("IGLN.L")
    p_btc = poche_de("BTCUSDT")
    assert p_or is not None and p_or.cle == "rv_physique"
    assert p_or.nom == "Réserve de valeur physique"
    assert abs(p_or.cible - 0.15) < 1e-6
    assert p_btc is not None and p_btc.cle == "rv_numerique"
    assert p_btc.nom == "Réserve de valeur numérique"
    assert abs(p_btc.cible - 0.05) < 1e-6


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
    # On augmente IGLN.L de 15 % à 25 % -> total = 110 % (> 100 %)
    for a in cfg["actifs"]:
        if a["ticker"] == "IGLN.L":
            a["cible"] = 0.25
    etat = verifier_allocation_cible(cfg)
    assert etat["depasse_100"] is True
    assert etat["equilibre_100"] is False
    assert abs(etat["total_pct"] - 110.0) < 1e-4
    assert abs(etat["ecart_100_pct"] - 10.0) < 1e-4
    assert "Alerte" in etat["message"]
    assert "110.0 %" in etat["message"]


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


def test_modification_fenetre_de_derive_actif():
    """Vérifie que l'utilisateur peut changer la fenêtre de dérive d'un actif
    (ex. ±2 pts pour BTCUSDT et ±5 pts pour IGLN.L) et que la bande de la poche
    se met immédiatement à jour."""
    try:
        cfg = allocation_par_defaut()
        for a in cfg["actifs"]:
            if a["ticker"] == "BTCUSDT":
                a["bande_pct"] = 2.0
            elif a["ticker"] == "IGLN.L":
                a["bande_pct"] = 5.0
        appliquer_allocation_personnalisee(cfg)
        assert abs(bande_actif("BTCUSDT") - 0.02) < 1e-6
        assert abs(POCHES_PAR_CLE["rv_numerique"].bande - 0.02) < 1e-6
        assert abs(bande_actif("IGLN.L") - 0.05) < 1e-6
        assert abs(POCHES_PAR_CLE["rv_physique"].bande - 0.05) < 1e-6
    finally:
        reinitialiser_allocation_par_defaut()


