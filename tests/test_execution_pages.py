"""Exécution complète de bout en bout de `app.py` et des 4 pages `pages/*.py`.

Pourquoi ce test existe :
L'analyse statique (AST / pyflakes) ne vérifie pas les signatures d'appel
(`TypeError` sur un argument nommé ou positionnel) ni les accès aux clés de
dictionnaire au moment de l'exécution. Ce test exécute réellement le code de
`app.py` et des 4 pages avec un contexte réaliste.
"""

from __future__ import annotations

import datetime as dt
import pathlib
import runpy
from unittest.mock import patch

import pandas as pd

from core import session as S
from core.models import Actif, POCHES_INVESTIES
from core.portfolio import EtatPoche, Position, Transaction, classe_de


def _contexte_realiste() -> S.Contexte:
    ctx = S.Contexte()
    ctx.taux_eur_usd = 1.15
    ctx.total_investi_usd = 79200.0
    ctx.total_investi_eur = 79200.0 / 1.15
    ctx.total_precaution_usd = 12200.0
    ctx.total_precaution_eur = 12200.0 / 1.15
    ctx.total_courant_usd = 7.39
    ctx.total_courant_eur = 7.39 / 1.15
    ctx.patrimoine_total_usd = ctx.total_investi_usd + ctx.total_precaution_usd + ctx.total_courant_usd
    ctx.patrimoine_total_eur = ctx.patrimoine_total_usd / 1.15
    ctx.cours_or = 4038.0
    ctx.equivalent_or_oz = ctx.total_investi_usd / ctx.cours_or

    poche0 = POCHES_INVESTIES[0]
    actif = Actif(
        ticker="IGLN.L",
        classe=classe_de("IGLN.L"),
        devise_cotation="USD",
        poche=poche0.cle,
        quantite=200.0,
        prix=75.0,
        valeur_eur=15000.0 / 1.15,
        valeur_usd=15000.0,
    )
    ctx.actifs = [actif]
    ctx.positions = {
        "IGLN.L": Position(
            ticker="IGLN.L",
            classe=classe_de("IGLN.L"),
            poche=poche0.cle,
            devise_cotation="USD",
            quantite=200.0,
            cout_total_eur=10000.0,
            pru_eur=50.0,
            cout_total_usd=11500.0,
            pru_usd=57.5,
            prix=75.0,
            valeur_eur=15000.0 / 1.15,
            pv_latente_eur=(15000.0 / 1.15) - 10000.0,
            valeur_usd=15000.0,
            pv_latente_usd=3500.0,
        )
    }
    ctx.etats = {
        poche0.cle: EtatPoche(
            poche=poche0,
            valeur_eur=15000.0 / 1.15,
            valeur_usd=15000.0,
            poids_reel=15000.0 / ctx.total_investi_usd,
            poids_cible=poche0.cible,
            actifs=[actif],
        )
    }
    ctx.transactions = [
        Transaction(
            ticker="IGLN.L",
            type="Achat",
            date=dt.date(2024, 1, 15),
            quantite=250.0,
            cours=46.0,
            frais=5.0,
            devise="USD",
            montant_net=250.0 * 46.0 + 5.0,
            id=1,
            source="swissquote",
        ),
        Transaction(
            ticker="IGLN.L",
            type="Vente",
            date=dt.date(2025, 6, 10),
            quantite=50.0,
            cours=62.0,
            frais=5.0,
            devise="USD",
            montant_net=50.0 * 62.0 - 5.0,
            id=2,
            source="swissquote",
        ),
    ]
    ctx.snapshots = pd.DataFrame([
        {
            "Date": pd.Timestamp("2024-12-31"),
            "date": "2024-12-31",
            "patrimoine_investi_usd": 57986.0,
            "patrimoine_total_usd": 69850.0,
            "capital_investi_usd": 50122.0,
            "patrimoine_investi_eur": 50422.0,
            "patrimoine_total_eur": 60739.0,
            "precaution_usd": 11864.0,
            "precaution_eur": 10316.0,
            "equivalent_or_oz": 22.1,
            "cours_or_usd": 2623.0,
        },
        {
            "Date": pd.Timestamp("2025-12-31"),
            "date": "2025-12-31",
            "patrimoine_investi_usd": 73229.0,
            "patrimoine_total_usd": 82563.0,
            "capital_investi_usd": 56707.0,
            "patrimoine_investi_eur": 63677.0,
            "patrimoine_total_eur": 71793.0,
            "precaution_usd": 9334.0,
            "precaution_eur": 8116.0,
            "equivalent_or_oz": 21.5,
            "cours_or_usd": 3406.0,
        },
        {
            "Date": pd.Timestamp("2026-10-02"),
            "date": "2026-10-02",
            "patrimoine_investi_usd": 78880.0,
            "patrimoine_total_usd": 91080.0,
            "capital_investi_usd": 59629.92,
            "patrimoine_investi_eur": 68591.0,
            "patrimoine_total_eur": 79200.0,
            "precaution_usd": 12200.0,
            "precaution_eur": 10608.0,
            "equivalent_or_oz": 19.6,
            "cours_or_usd": 4024.0,
        },
        {
            "Date": pd.Timestamp("2026-10-03"),
            "date": "2026-10-03",
            "patrimoine_investi_usd": 79200.0,
            "patrimoine_total_usd": 91407.39,
            "capital_investi_usd": 59629.92,
            "patrimoine_investi_eur": 68869.57,
            "patrimoine_total_eur": 79484.69,
            "precaution_usd": 12200.0,
            "precaution_eur": 10608.0,
            "equivalent_or_oz": 19.61,
            "cours_or_usd": 4038.0,
        },
    ])
    ctx.apports = pd.DataFrame([
        {
            "id": 10,
            "date": "2025-03-15",
            "sens": "apport",
            "montant_eur": 1000.0,
            "montant_usd": 1100.0,
            "montant_or": 0.35,
            "cours_or": 3142.0,
            "compte": "swissquote_usd",
            "reference": "usd:1100.00",
        }
    ])
    ctx.inflation = pd.DataFrame([
        {"Annee": 2024, "Inflation": 2.0},
        {"Annee": 2025, "Inflation": 0.94},
        {"Annee": 2026, "Inflation": 1.4},
    ])
    return ctx


def test_toutes_les_pages_s_executent_sans_erreur():
    """Exécute `app.py` et chacune des 4 pages de bout en bout."""
    racine = pathlib.Path(__file__).resolve().parent.parent
    fichiers = [
        racine / "app.py",
        racine / "pages" / "1_Portefeuille.py",
        racine / "pages" / "2_Performance.py",
        racine / "pages" / "3_Retraite.py",
        racine / "pages" / "4_Fiscalite.py",
    ]
    ctx = _contexte_realiste()
    with (
        patch("core.session.charger", return_value=ctx),
        patch("core.db.soldes_comptes_liquidites", return_value={
            "USD": {"ticker": "USD", "quantite": 7.39},
            "EUR": {"ticker": "EUR", "quantite": 0.0},
            "CHF": {"ticker": "CHF", "quantite": 8694.44},
            "CNY": {"ticker": "CNY", "quantite": 12290.0},
        }),
        patch("core.db.lire_config_fiscale", return_value={
            "f_statut": "Marié(e) / Pacsé(e)",
            "f_enf": "2",
            "f_parts": "3.0",
            "f_s1": "32473",
            "f_s2": "29772",
            "f_u1": "true",
            "f_k1": "9120",
            "f_cv1": "5",
            "f_r1": "240",
            "f_elec1": "false",
            "f_u2": "true",
            "f_k2": "9120",
            "f_cv2": "5",
            "f_r2": "200",
            "f_elec2": "false",
            "f_int_net": "200",
            "f_pays_etr": "Lituanie",
        }),
        patch("core.db.sauver_config_fiscale", return_value=None),
        patch("core.fx.taux", return_value=1.15),
    ):
        for f in fichiers:
            runpy.run_path(str(f), run_name="__main__")
