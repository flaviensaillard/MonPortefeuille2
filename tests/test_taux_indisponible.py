"""Un taux manquant n'est JAMAIS remplacé par un taux de fortune.

Règle du projet : partout ou nulle part. Trois endroits où un repli fabriquait un
chiffre plausible et faux :

- `core/portfolio.py` : un titre non USD dont le taux USD manque était valorisé avec
  son taux EUR. Il est désormais exclu et signalé comme un cours manquant.
- `core/session.py` (graphique) : sans taux valide, les montants en euros sont absents
  (None), et un point du graphique qui dépend du taux n'est pas tracé (trou + mention),
  au lieu d'un point à 1,0 ou à 1,125.

Aucun appel réseau : `fx.taux`, `prices.cours` et `db` sont remplacés.
"""

from __future__ import annotations

import math

import pandas as pd
import pytest

from core import fx, prices, session as S
from core.models import Classe
from core.portfolio import Position, valoriser


# ---------------------------------------------------------------------------
# 1. Titre non USD dont le taux USD manque : exclu, signalé, reste calculé
# ---------------------------------------------------------------------------

def _position(ticker: str, devise: str, quantite: float) -> Position:
    return Position(ticker=ticker, classe=Classe.ACTION_ETF, poche="rv",
                    devise_cotation=devise, quantite=quantite)


@pytest.fixture()
def fx_cny_sans_usd(monkeypatch):
    """EUR connu pour CNY, USD introuvable pour CNY. Les cours sont fixés."""
    def taux(devise, date, contre="EUR"):
        if (devise, contre) == ("CNY", "EUR"):
            return 0.13
        if (devise, contre) == ("USD", "EUR"):
            return 0.9
        if (devise, contre) == ("CNY", "USD"):
            raise fx.FXIndisponible(devise, contre, date, "pas de taux CNY/USD")
        raise AssertionError(f"taux inattendu {devise}/{contre}")

    monkeypatch.setattr(fx, "taux", taux)
    monkeypatch.setattr(prices, "cours", lambda ticker, date=None: 10.0)
    monkeypatch.setattr(prices, "variation_recente", lambda ticker: None)


def test_titre_sans_taux_usd_n_est_pas_valorise_avec_le_taux_eur(fx_cny_sans_usd):
    positions = {
        "CN.TEST": _position("CN.TEST", "CNY", 100),   # taux USD manquant
        "US.TEST": _position("US.TEST", "USD", 5),     # saine
    }
    actifs, echecs = valoriser(positions, "2026-10-08")

    # Le titre CNY est signalé comme un cours manquant (il rejoint le bandeau)...
    assert "CN.TEST" in echecs
    # ...et n'apparaît dans aucune valorisation.
    assert [a.ticker for a in actifs] == ["US.TEST"]
    # Le reste du portefeuille continue d'être calculé, exactement.
    assert actifs[0].valeur_usd == pytest.approx(5 * 10.0 * 1.0)
    assert actifs[0].valeur_eur == pytest.approx(5 * 10.0 * 0.9)


def test_taux_usd_present_valorise_normalement(monkeypatch):
    """Garde-fou : sans panne, la valorisation USD est bien le produit cours × taux USD."""
    monkeypatch.setattr(fx, "taux", lambda d, date, c="EUR": {("CNY", "EUR"): 0.13,
                                                              ("CNY", "USD"): 0.14}[(d, c)])
    monkeypatch.setattr(prices, "cours", lambda ticker, date=None: 10.0)
    monkeypatch.setattr(prices, "variation_recente", lambda ticker: None)
    actifs, echecs = valoriser({"CN.TEST": _position("CN.TEST", "CNY", 100)}, "2026-10-08")
    assert echecs == []
    assert actifs[0].valeur_usd == pytest.approx(100 * 10.0 * 0.14)
    assert actifs[0].valeur_eur == pytest.approx(100 * 10.0 * 0.13)


# ---------------------------------------------------------------------------
# 2. Graphique : pas de 1,0 pour les euros, pas de point inventé
# ---------------------------------------------------------------------------

def _contexte_sans_or(taux: float, indisponible: bool) -> S.Contexte:
    """Snapshots sans cours de l'or : chaque point USD dépend donc du taux EUR/USD."""
    ctx = S.Contexte()
    ctx.taux_eur_usd = taux
    ctx.taux_indisponible = indisponible
    ctx.snapshots = pd.DataFrame({
        "Date": ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
        "date": ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
        "patrimoine_investi_eur": [1000.0, 1100.0, 1200.0, 1300.0],
        "patrimoine_total_eur": [1000.0, 1100.0, 1200.0, 1300.0],
        "precaution_eur": [0.0, 0.0, 0.0, 0.0],
        "courant_eur": [0.0, 0.0, 0.0, 0.0],
        "equivalent_or_oz": [None, None, None, None],
        "cours_or_usd": [None, None, None, None],
    })
    ctx.apports = pd.DataFrame()
    return ctx


def _contexte_avec_or(taux_affichage: float, indisponible: bool) -> S.Contexte:
    """Snapshots AVEC cours de l'or : les dollars se calculent sans taux de change."""
    ctx = S.Contexte()
    ctx.taux_eur_usd = taux_affichage
    ctx.taux_indisponible = indisponible
    ctx.snapshots = pd.DataFrame({
        "Date": ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
        "date": ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
        "patrimoine_investi_eur": [1000.0, 1100.0, 1200.0, 1300.0],
        "patrimoine_total_eur": [1000.0, 1100.0, 1200.0, 1300.0],
        "precaution_eur": [0.0, 0.0, 0.0, 0.0],
        "courant_eur": [0.0, 0.0, 0.0, 0.0],
        "equivalent_or_oz": [0.5, 0.5, 0.5, 0.5],
        "cours_or_usd": [2000.0, 2100.0, 2200.0, 2300.0],
    })
    ctx.apports = pd.DataFrame()
    return ctx


@pytest.fixture()
def db_vide(monkeypatch):
    """Pas de table Projections ni Historique : chemin de repli, sans réseau."""
    monkeypatch.setattr(S.db, "lire", lambda table: pd.DataFrame())


def test_point_du_graphique_sans_taux_est_absent_et_annonce(db_vide):
    ctx = _contexte_sans_or(taux=1.0, indisponible=True)
    S._enrichir_historiques_usd(ctx)

    # Aucun point USD inventé : les quatre dates dépendent du taux manquant.
    assert ctx.snapshots["patrimoine_investi_usd"].isna().all()
    assert [d.strftime("%Y-%m-%d") for d in ctx.dates_sans_taux] == [
        "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]


def test_taux_1_0_n_est_jamais_utilise_pour_les_euros(db_vide):
    """Régression : sans taux, les euros ne valent PAS les dollars (ancien repli 1,0).

    Les dollars viennent de l'or (cours × onces) et sont exacts sans taux. Les euros,
    eux, dépendent du taux : ils doivent être absents, pas égaux aux dollars.
    """
    ctx = _contexte_avec_or(taux_affichage=1.0, indisponible=True)
    S._enrichir_historiques_usd(ctx)
    prog = S.progression_periode(ctx, "Depuis le début", "Portefeuille investi")
    assert prog["taux_indisponible"] is True
    # Dollars exacts : 0,5 oz × cours de l'or de chaque jour, sans taux.
    assert prog["delta_val_usd"] == pytest.approx(0.5 * 2300 - 0.5 * 2000)
    # Euros absents, jamais égaux aux dollars.
    assert prog["delta_val_eur"] is None
    assert prog["gain_marche_eur"] is None
    assert prog["apports_periode_eur"] is None


def test_sans_aucun_point_calculable_la_courbe_est_vide_et_annoncee(db_vide):
    """Ni or ni taux : aucun point USD. Pas de crash, pas de courbe inventée."""
    ctx = _contexte_sans_or(taux=0.0, indisponible=True)
    S._enrichir_historiques_usd(ctx)
    prog = S.progression_periode(ctx, "Depuis le début", "Portefeuille investi")
    assert prog["vide"] is True
    assert prog["taux_indisponible"] is True


def test_progression_avec_taux_valide_inchangee(db_vide):
    """Garde-fou : avec un taux réel, les euros sont exactement dollars / taux."""
    ctx = _contexte_sans_or(taux=1.125, indisponible=False)
    S._enrichir_historiques_usd(ctx)
    prog = S.progression_periode(ctx, "Depuis le début", "Portefeuille investi")
    assert prog["taux_indisponible"] is False
    assert prog["dates_sans_taux"] == []
    assert prog["delta_val_eur"] == pytest.approx(prog["delta_val_usd"] / 1.125)


def test_graphique_trou_au_lieu_de_point_faux(db_vide):
    """Un point qui exige le taux est retiré de la courbe ; les autres restent exacts.

    Le 02/10 n'a pas de cours de l'or : sa valeur en dollars dépend du taux. Taux
    manquant : pas de point à 1 237,50 (1 100 × 1,125) ni à 1 100, un trou annoncé.
    """
    ctx = S.Contexte()
    ctx.taux_eur_usd = 1.125            # valeur d'affichage seulement
    ctx.taux_indisponible = True
    ctx.snapshots = pd.DataFrame({
        "Date": ["2026-10-01", "2026-10-02", "2026-10-03"],
        "date": ["2026-10-01", "2026-10-02", "2026-10-03"],
        "patrimoine_investi_eur": [1000.0, 1100.0, 1200.0],
        "patrimoine_total_eur": [1000.0, 1100.0, 1200.0],
        "precaution_eur": [0.0, 0.0, 0.0],
        "courant_eur": [0.0, 0.0, 0.0],
        "equivalent_or_oz": [0.5, None, 0.5],
        "cours_or_usd": [2000.0, None, 2200.0],
    })
    ctx.apports = pd.DataFrame()
    S._enrichir_historiques_usd(ctx)

    assert ctx.snapshots.loc[1, "patrimoine_investi_usd"] is None or math.isnan(
        ctx.snapshots.loc[1, "patrimoine_investi_usd"])
    prog = S.progression_periode(ctx, "Depuis le début", "Portefeuille investi")
    dates_courbe = [d.strftime("%Y-%m-%d") for d in prog["df_graphe"]["date_dt"]]
    assert dates_courbe == ["2026-10-01", "2026-10-03"]
    assert [d.strftime("%Y-%m-%d") for d in prog["dates_sans_taux"]] == ["2026-10-02"]
    assert prog["df_graphe"]["patrimoine_investi_usd"].tolist() == pytest.approx([1000.0, 1100.0])


# ---------------------------------------------------------------------------
# 3. Tableau de bord (app.py) : mention, « — » et trou, sans exception
# ---------------------------------------------------------------------------
#
# Exécuté dans un sous-processus : des pages exécutées hors runtime Streamlit par
# d'autres tests (test_execution_pages) laissent un formulaire ouvert dans le processus,
# ce qui fait échouer AppTest selon l'ordre. Un processus propre isole ce test.

_SCRIPT_TABLEAU = """
import json, pathlib, sys
racine, tests = sys.argv[1], sys.argv[2]
sys.path[:0] = [racine, tests]
import pandas as pd
import test_taux_indisponible as T
from core import session as S
from streamlit.testing.v1 import AppTest

ctx = T._contexte_tableau_sans_taux()
S.charger = lambda *a, **k: ctx
vides = {"lire": pd.DataFrame(), "tables_requises_manquantes": [], "transactions": [],
         "comptes_liquidites": [], "operations_compte": [], "lire_allocation_personnalisee": None,
         "soldes_comptes_liquidites": {}}
for nom, valeur in vides.items():
    setattr(S.db, nom, (lambda v=valeur: (lambda *a, **k: v))())

at = AppTest.from_file(str(pathlib.Path(racine) / "app.py"), default_timeout=90)
at.run()
print(json.dumps({
    "exceptions": [e.value for e in at.exception],
    "legendes": [c.value for c in at.caption] + [w.value for w in at.warning],
    "blocs": [m.value for m in at.markdown],
}))
"""


def _contexte_tableau_sans_taux() -> S.Contexte:
    ctx = _contexte_avec_or(taux_affichage=1.0, indisponible=True)
    # Un point sans or : sa valeur en dollars dépend du taux, donc un trou.
    ctx.snapshots.loc[1, "equivalent_or_oz"] = None
    ctx.snapshots.loc[1, "cours_or_usd"] = None
    S._enrichir_historiques_usd(ctx)
    ctx.total_investi_usd = ctx.total_investi_eur = 1150.0
    ctx.patrimoine_total_usd = ctx.patrimoine_total_eur = 1150.0
    return ctx


def test_tableau_de_bord_taux_indisponible_s_affiche_sans_erreur():
    import json
    import pathlib
    import subprocess
    import sys

    racine = pathlib.Path(__file__).resolve().parent.parent
    res = subprocess.run(
        [sys.executable, "-c", _SCRIPT_TABLEAU, str(racine), str(pathlib.Path(__file__).parent)],
        capture_output=True, text=True, timeout=600,
    )
    assert res.returncode == 0, res.stderr[-2000:]
    sortie = json.loads(res.stdout.strip().splitlines()[-1])

    assert not sortie["exceptions"], sortie["exceptions"]
    legendes = " | ".join(sortie["legendes"])
    assert "taux indisponible" in legendes
    assert "non tracé" in legendes
    # Cartes du graphique : « — » des deux côtés, jamais un euro dérivé.
    import re
    blocs = [b for b in sortie["blocs"] if "Gain de marché" in b or "Variation totale de valeur" in b]
    assert blocs, "cartes du graphique introuvables"
    for bloc in blocs:
        # La valeur affichée (pas l'infobulle, qui cite les dollars exacts) : « — » seul.
        valeur = re.search(r"font-size:1\.75rem[^>]*>(.*?)</div>", bloc)
        assert valeur and valeur.group(1) == "—", bloc[:300]
