"""Import de l'historique mensuel de la v1 — `importer_snapshots()`.

Pourquoi ce fichier existe
--------------------------
La table `Historique` de la v1 porte les valuations mensuelles depuis 2023.
`importer_v1.py` n'en extrayait que les mouvements de trésorerie : les trois ans
et demi de valorisation n'avaient aucune destination, et un portefeuille suivi
depuis 2023 repartait de zéro côté graphiques.

Ces tests vérifient surtout que **rien n'est inventé** : la répartition par poche
n'existe pas dans la v1, donc elle reste NULL plutôt que devinée, et une ligne
écartée est toujours signalée.
"""

from __future__ import annotations

import pandas as pd
import pytest

from jobs import importer_v1 as imp

COLONNES_V1 = ["Date", "Capital investi", "Actifs Stratégiques", "Total Global", "id"]

# Deux valuations le même jour : la v1 peut porter une saisie puis une re-saisie.
LIGNES = [
    {"Date": "01/04/2023", "Capital investi": 10905, "Actifs Stratégiques": 10905,
     "Total Global": 33668, "id": 1},
    {"Date": "30/04/2023", "Capital investi": 10978, "Actifs Stratégiques": 11101,
     "Total Global": 33791, "id": 2},
    # Une date avec son heure : la v1 en produit.
    {"Date": "11/05/2026 12:38:33", "Capital investi": 58378.92,
     "Actifs Stratégiques": 80555.353049, "Total Global": 100885.623608, "id": 46},
    # Deux lignes le même jour, valeurs différentes.
    {"Date": "04/06/2026", "Capital investi": 58378.92,
     "Actifs Stratégiques": 78430.569202, "Total Global": 98457.991551, "id": 73},
    {"Date": "04/06/2026", "Capital investi": 58378.92,
     "Actifs Stratégiques": 78336.930560, "Total Global": 98426.765209, "id": 74},
]


@pytest.fixture
def _v1(monkeypatch):
    """Remplace `lire_v1` et neutralise l'écriture."""
    ecritures = []

    def table(nom):
        def delete():
            def eq(*a):
                def execute():
                    return type("R", (), {"data": []})()
                return type("D", (), {"execute": staticmethod(execute)})()
            return type("E", (), {"eq": staticmethod(eq)})()
        def upsert(ligne, on_conflict=None):
            ecritures.append(ligne)
            return type("U", (), {"execute": staticmethod(lambda: None)})()
        return type("T", (), {
            "delete": staticmethod(delete),
            "upsert": staticmethod(upsert),
        })()

    client = type("C", (), {"table": staticmethod(table)})()
    monkeypatch.setattr(imp.db, "client", lambda: client)
    monkeypatch.setattr(imp, "lire_v1", lambda t: pd.DataFrame(LIGNES))
    return ecritures


# --------------------------------------------------------------------------
def test_toutes_les_dates_sont_lues(_v1, caplog):
    """180 lignes réelles en comptaient une avec son heure : elle doit passer."""
    with caplog.at_level("WARNING"):
        n = imp.importer_snapshots(dry_run=False)
    assert n == 4, "4 dates uniques sur 5 lignes (un doublon écarté)"
    dates = {e["date"] for e in _v1}
    assert "2026-05-11" in dates, "la date avec heure doit être importée"


def test_la_repartition_par_poche_reste_null(_v1):
    """La v1 ne connaît pas les poches : on n'invente pas."""
    imp.importer_snapshots(dry_run=False)
    for ligne in _v1:
        for cle in ("poche_rv_eur", "poche_energie_eur", "poche_asie_eur",
                    "poche_jgb_eur"):
            assert cle not in ligne, f"{cle} serait inventée"


def test_la_precaution_est_l_ecart(_v1):
    """La v1 ne distingue pas précaution et courant : l'écart va en précaution."""
    imp.importer_snapshots(dry_run=False)
    premiere = next(e for e in _v1 if e["date"] == "2023-04-01")
    assert premiere["precaution_eur"] == pytest.approx(33668.0 - 10905.0)
    assert premiere["courant_eur"] == 0.0


def test_le_doublon_est_signale(_v1, caplog):
    """Une ligne écartée doit être dite, jamais silencieuse."""
    with caplog.at_level("WARNING"):
        imp.importer_snapshots(dry_run=False)
    messages = " ".join(r.message for r in caplog.records)
    assert "2026-06-04" in messages, "le doublon doit apparaître dans les logs"


def test_le_dry_run_n_ecrit_rien(_v1):
    n = imp.importer_snapshots(dry_run=True)
    assert n == 4
    assert _v1 == [], "le dry-run ne doit rien écrire"


def test_les_lignes_de_tresorerie_sont_ignorees(monkeypatch, _v1):
    """Une ligne portant `Type` = Ajout/Retrait n'est pas une valorisation."""
    lignes = LIGNES + [
        {"Date": "15/06/2026", "Type": "Ajout", "Montant €": 500,
         "Actifs Stratégiques": None, "Total Global": None, "id": 80},
    ]
    monkeypatch.setattr(imp, "lire_v1", lambda t: pd.DataFrame(lignes))
    n = imp.importer_snapshots(dry_run=False)
    assert n == 4, "la ligne de trésorerie ne doit pas devenir un snapshot"


def test_table_vide(monkeypatch):
    monkeypatch.setattr(imp, "lire_v1", lambda t: pd.DataFrame())
    assert imp.importer_snapshots(dry_run=False) == 0


def test_les_colonnes_de_performance_ne_sont_pas_importees(monkeypatch, _v1):
    """pf2 calcule le TWR à la demande ; il ne le stocke jamais."""
    lignes = [{**LIGNES[0], "Score TWR %": 1.5, "Evolution cumulée %": 208.7}]
    monkeypatch.setattr(imp, "lire_v1", lambda t: pd.DataFrame(lignes))
    imp.importer_snapshots(dry_run=False)
    for ligne in _v1:
        assert "Score TWR %" not in ligne
        assert "Evolution cumulée %" not in ligne
