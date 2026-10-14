"""L'ETC or du portefeuille ne déclenche jamais les formulaires de métal physique."""
import datetime as dt

import pytest

from core import models, portfolio, tax
from core.models import Classe


def test_etc_igln_passe_par_2074_et_non_par_or_physique():
    try:
        cfg = models.allocation_par_defaut()
        ligne = next(a for a in cfg["actifs"] if a["ticker"] == "IGLN.L")
        ligne["classe"] = "or_physique"  # ancien paramétrage incohérent avec le ticker
        models.appliquer_allocation_personnalisee(cfg)
        assert portfolio.classe_de(" IGLN.L ") == Classe.OR
        txs = [
            portfolio.Transaction("IGLN.L", "achat", dt.date(2025, 1, 10), 10, 50, 0, "EUR", 500),
            portfolio.Transaction("IGLN.L", "vente", dt.date(2025, 6, 10), 10, 70, 0, "EUR", 700),
        ]
        d = tax.detail_2074_de_lannee(txs, 2025)
        assert d["calcul_complet"] is True
        assert d["case_3vg"] == pytest.approx(200)
        assert d["operations"][0]["actif"] == "IGLN.L"
        assert tax.detail_2086_de_lannee(txs, 2025)["cessions"] == []
        resultat = tax.calculer({portfolio.classe_de("IGLN.L"): [
            {"actif": "IGLN.L", "date": dt.date(2025, 6, 10), "quantite": 10,
             "pru_eur": 50, "prix_cession_eur": 700},
        ]}, 2025, statut="Marié(e) / Pacsé(e)", parts=2)
        assert [r["regime"] for r in resultat["regimes"]] == ["150-0 A"]
        assert resultat["pv_titres"].total_du == pytest.approx(62.8)
    finally:
        models.reinitialiser_allocation_par_defaut()


def test_or_physique_d_un_autre_actif_reste_distinct_et_non_certifie():
    try:
        cfg = models.allocation_par_defaut()
        cfg["actifs"].append({"ticker": "LINGOT_TEST", "poche": "rv_physique",
                              "classe": "or_physique", "devise": "EUR", "cible_pct": 0})
        models.appliquer_allocation_personnalisee(cfg)
        assert portfolio.classe_de("LINGOT_TEST") == Classe.OR_PHYSIQUE
    finally:
        portfolio.CLASSES.pop("LINGOT_TEST", None)
        models.reinitialiser_allocation_par_defaut()


def test_migration_libelle_ancien_defaut_sans_toucher_aux_noms_personnalises():
    try:
        cfg = models.allocation_par_defaut()
        cfg["poches"][0]["nom"] = "Réserve de valeur physique"
        cfg["poches"][0]["description"] = "Or (ETC). Réserve de valeur physique face à la dépréciation monétaire."
        models.appliquer_allocation_personnalisee(cfg)
        assert models.poche_de("IGLN.L").nom == "Exposition à l’or (ETC)"
        cfg["poches"][0]["nom"] = "Mon panier or"
        models.appliquer_allocation_personnalisee(cfg)
        assert models.poche_de("IGLN.L").nom == "Mon panier or"
    finally:
        models.reinitialiser_allocation_par_defaut()
