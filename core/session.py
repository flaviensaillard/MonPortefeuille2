"""Contexte applicatif : charge les données une fois, calcule tout.

CORRECTION PAR RAPPORT À LA V1
------------------------------
La v1 rechargeait et recalculait à chaque rendu de page, et le robot nocturne
écrivait des colonnes TWR dans Supabase depuis un script séparé (`calc_perf.py`).
Deux sources de vérité pour la même grandeur, désynchronisables.

Ici, le TWR est calculé à la demande depuis les snapshots, jamais stocké. Le
robot ne fait qu'écrire des snapshots bruts.
"""

from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass, field

import pandas as pd
import streamlit as st

from . import db, fx, metrics, prices
from .models import Perimetre, POCHES_PAR_CLE
from .portfolio import (
    Actif,
    agreger_par_poche,
    calculer_positions,
    charger_transactions,
    valoriser,
)
from .rebalance import diagnostiquer

log = logging.getLogger(__name__)


@dataclass
class Contexte:
    """Tout ce dont les pages ont besoin, calculé une fois."""

    transactions: list = field(default_factory=list)
    positions: dict = field(default_factory=dict)
    actifs: list[Actif] = field(default_factory=list)
    etats: dict = field(default_factory=dict)
    snapshots: pd.DataFrame = field(default_factory=pd.DataFrame)
    apports: pd.DataFrame = field(default_factory=pd.DataFrame)
    inflation: pd.DataFrame = field(default_factory=pd.DataFrame)

    total_investi_eur: float = 0.0
    total_precaution_eur: float = 0.0
    total_courant_eur: float = 0.0
    patrimoine_total_eur: float = 0.0

    cours_or: float | None = None
    equivalent_or_oz: float | None = None

    echecs_cours: list[str] = field(default_factory=list)
    echecs_fx: list[str] = field(default_factory=list)
    tables_absentes: list[str] = field(default_factory=list)
    erreurs: list[str] = field(default_factory=list)
    anomalies_transactions: list[str] = field(default_factory=list)

    @property
    def ecarts(self):
        return diagnostiquer(self.etats, self.total_investi_eur)

    @property
    def besoins_reequilibrage(self):
        return [e for e in self.ecarts if e.hors_bande]

    @property
    def perf_globale_pct(self) -> float | None:
        """Performance globale depuis le début, en euros puis en onces d'or."""
        if self.snapshots.empty:
            return None
        v0 = self.snapshots["patrimoine_investi_eur"].iloc[0]
        v1 = self.snapshots["patrimoine_investi_eur"].iloc[-1]
        if v0 <= 0:
            return None
        return v1 / v0 - 1.0


def _inflation_par_annee(df: pd.DataFrame) -> dict[int, float]:
    if df.empty or "Annee" not in df.columns:
        return {}
    out = {}
    for _, r in df.iterrows():
        try:
            out[int(r["Annee"])] = float(r["Inflation"]) / 100.0
        except (TypeError, ValueError):
            continue
    return out


@st.cache_data(ttl=300, show_spinner=False)
def charger(rafraichir_cours: bool = False) -> Contexte:
    """Charge et calcule l'état complet. Mémoïsé 5 minutes."""
    ctx = Contexte()

    # --- Tables ---
    try:
        etat_tables = db.tables_presentes()
        ctx.tables_absentes = [t for t, present in etat_tables.items() if not present]
    except db.SecretsManquants as exc:
        ctx.erreurs.append(str(exc))
        return ctx
    except Exception as exc:
        ctx.erreurs.append(f"Connexion Supabase impossible : {exc}")
        return ctx

    if ctx.tables_absentes:
        ctx.erreurs.append(
            "Tables manquantes : " + ", ".join(ctx.tables_absentes)
            + ". Exécutez migrations/001_init.sql dans Supabase."
        )
        return ctx

    # --- Transactions -> positions ---
    try:
        df_tx = db.transactions()
        ctx.transactions = charger_transactions(df_tx)
        # Une transaction incohérente ne doit pas vider l'écran : on la consigne
        # et on continue, pour que vous voyiez le reste du portefeuille.
        anomalies: list[str] = []
        ctx.positions = calculer_positions(ctx.transactions, anomalies)
        ctx.anomalies_transactions = anomalies
    except ValueError as exc:
        ctx.erreurs.append(f"Transactions illisibles : {exc}")
        return ctx
    except Exception as exc:
        ctx.erreurs.append(f"Chargement des transactions : {exc}")
        return ctx

    # --- Valorisation ---
    try:
        ctx.actifs, ctx.echecs_cours = valoriser(ctx.positions)
    except fx.FXIndisponible as exc:
        ctx.echecs_fx.append(str(exc))

    # --- Agrégation par poche, sur le patrimoine INVESTI seulement ---
    perimetres: dict[str, float] = {p.value: 0.0 for p in Perimetre}
    for a in ctx.actifs:
        p = POCHES_PAR_CLE.get(a.poche)
        cle = p.perimetre.value if p else Perimetre.INVESTI.value
        perimetres[cle] += a.valeur_eur

    ctx.total_investi_eur = perimetres[Perimetre.INVESTI.value]
    ctx.total_precaution_eur = perimetres[Perimetre.PRECAUTION.value]
    ctx.total_courant_eur = perimetres[Perimetre.COURANT.value]
    ctx.patrimoine_total_eur = sum(perimetres.values())

    ctx.etats = agreger_par_poche(ctx.actifs, ctx.total_investi_eur)

    # --- Or : l'étalon de Gave ---
    try:
        ctx.cours_or = prices.cours_or()
        if ctx.cours_or and ctx.total_investi_eur > 0:
            # Equivalent en onces du patrimoine investi, converti en USD.
            taux_usd = fx.taux("EUR", dt.date.today().isoformat(), "USD")
            ctx.equivalent_or_oz = (ctx.total_investi_eur * taux_usd) / ctx.cours_or
    except (prices.CoursIndisponible, fx.FXIndisponible) as exc:
        ctx.echecs_cours.append(prices.TICKER_OR)

    # --- Historiques ---
    try:
        ctx.snapshots = db.snapshots()
        ctx.apports = db.apports()
        ctx.inflation = db.inflation()
    except Exception as exc:
        ctx.erreurs.append(f"Chargement des historiques : {exc}")

    return ctx


def inflation_dict(ctx: Contexte) -> dict[int, float]:
    return _inflation_par_annee(ctx.inflation)


def vider_cache() -> None:
    charger.clear()
    prices.vider_cache()
    fx.vider_cache()
