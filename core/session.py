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
    # Date du dernier import, lue dans `cree_le`. Sert a voir d'un coup
    # d'oeil si l'application regarde des donnees fraiches : un serveur qui
    # tourne sur une vieille version du code affiche une date anterieure au
    # dernier import, et le bandeau d'anomalie survit a sa correction.
    importe_le: str | None = None

    @property
    def ecarts(self):
        return diagnostiquer(self.etats, self.total_investi_eur)

    @property
    def besoins_reequilibrage(self):
        return [e for e in self.ecarts if e.hors_bande]


def _inflation_par_annee(df: pd.DataFrame) -> dict[int, float]:
    """Inflation annuelle, en fraction (2 % -> 0.02).

    DÉFAUT CORRIGÉ. Cette fonction faisait `if df.empty or "Annee" not in
    df.columns: return {}`. Elle confondait « pas de données » et « données que
    je ne sais pas lire » : `db.inflation()` rendait `annee`/`inflation` en
    minuscules, la colonne `Annee` était donc absente, et la fonction retournait
    un dictionnaire vide — pour toujours, et sans le dire.

    C'était le pire des deux mondes : la performance réelle de chaque année
    s'affichait « non calculable » alors que les chiffres étaient en base.

    Maintenant : une table ABSENTE ou VIDE reste silencieuse (au démarrage,
    c'est normal) ; une table PLEINE dont aucune ligne n'est exploitable lève.
    """
    if df is None or df.empty:
        return {}

    if "Annee" not in df.columns or "Inflation" not in df.columns:
        # `db.inflation()` fait le pont de noms et leve deja si c'est
        # impossible. Si on arrive ici, c'est que la table a ete lue par un
        # autre chemin — un test, un robot. On le dit.
        raise ValueError(
            f"Table d'inflation illisible : colonnes {list(df.columns)}. "
            "Attendu : Annee et Inflation. La performance reelle ne peut pas "
            "etre calculee — mieux vaut une erreur visible qu'un zero."
        )

    out: dict[int, float] = {}
    lignes_ignorees = 0
    for _, r in df.iterrows():
        try:
            out[int(r["Annee"])] = float(r["Inflation"]) / 100.0
        except (TypeError, ValueError):
            lignes_ignorees += 1
            continue

    if not out and lignes_ignorees:
        raise ValueError(
            f"{lignes_ignorees} ligne(s) d'inflation presentes, aucune "
            "exploitable. Les colonnes Annee/Inflation sont peut-etre "
            "inversees — verifiez la table pf2_inflation."
        )
    return out


def _date_dernier_import(df) -> str | None:
    """Date la plus recente de la colonne `cree_le`, ou None si absente.

    Volontairement tolerant : une table sans `cree_le` (ou vide) ne doit pas
    empecher l'application de demarrer.
    """
    try:
        if df is None or df.empty or "cree_le" not in getattr(df, "columns", []):
            return None
        valeurs = pd.to_datetime(df["cree_le"], errors="coerce").dropna()
        if valeurs.empty:
            return None
        return str(valeurs.max())
    except Exception:
        return None



# ---------------------------------------------------------------------------
# Le TWR du portefeuille — une seule implementation, trois appelants
# ---------------------------------------------------------------------------
# `derniere_valeur / premiere_valeur - 1` a ete ecrit a trois endroits :
# `Contexte.perf_globale_pct` (affiche sur la page d'accueil), le tableau
# annuel de `pages/5_Performance.py`, et le CAGR historique qui preremplit le
# scenario A de `pages/6_Retraite.py`. Les trois comptaient les VERSEMENTS
# comme du rendement.
#
# Sur le portefeuille reel — 10 905 EUR en avril 2023, 79 394 EUR en octobre
# 2026, alimente chaque mois — le calcul donnait +628 % cumule, soit **76 % par
# an** apres annualisation. C'est ce chiffre qui preremplissait la projection de
# retraite. La realite est un TWR de l'ordre de 10 a 15 %.
#
# Une seule fonction, testee, et plus aucun appelant ne peut reintroduire le
# defaut sans faire echouer `tests/test_twr_portefeuille.py`.


def flux_par_date(apports: pd.DataFrame) -> dict:
    """Apports et retraits, dates par jour.

    `apports` doit avoir les colonnes `date`, `sens`, `montant_eur`.
    Retourne `{date: montant signe}`, un apport etant positif.
    """
    if apports is None or apports.empty:
        return {}
    if not {"date", "sens", "montant_eur"} <= set(apports.columns):
        return {}
    dates = pd.to_datetime(apports["date"], errors="coerce")
    signes = apports["sens"].astype(str).str.strip().str.lower().map(
        {"apport": 1.0, "ajout": 1.0, "retrait": -1.0}
    )
    montants = pd.to_numeric(apports["montant_eur"], errors="coerce")
    sortie: dict = {}
    for d, s, m in zip(dates, signes, montants):
        if pd.isna(d) or s is None or pd.isna(m):
            continue
        jour = d.date()
        sortie[jour] = sortie.get(jour, 0.0) + s * float(m)
    return sortie


def twr_portefeuille(ctx: "Contexte") -> float | None:
    """TWR depuis le premier snapshot, corrigé des apports et retraits.

    Retourne `None` s'il n'y a pas assez de snapshots — jamais une valeur
    inventée. C'est la SEULE façon correcte de répondre à « qu'a produit la
    stratégie » quand on alimente le portefeuille.
    """
    snaps = ctx.snapshots
    if snaps is None or snaps.empty or len(snaps) < 2:
        return None
    if "patrimoine_investi_eur" not in snaps.columns:
        return None

    dates = _parser_dates(snaps["Date"])
    valeurs = pd.to_numeric(snaps["patrimoine_investi_eur"], errors="coerce")
    garder = dates.notna() & valeurs.notna() & (valeurs > 0)
    if int(garder.sum()) < 2:
        return None

    dates = dates[garder].tolist()
    valeurs = valeurs[garder].tolist()
    flux_jour = flux_par_date(ctx.apports)
    flux = [flux_jour.get(d.date(), 0.0) for d in dates]

    return metrics.twr_depuis(valeurs, flux)


def twr_annualise_portefeuille(ctx: "Contexte") -> float | None:
    """Le même TWR, annualisé sur la durée couverte par les snapshots."""
    snaps = ctx.snapshots
    if snaps is None or snaps.empty or len(snaps) < 2:
        return None
    dates = _parser_dates(snaps["Date"]).dropna()
    if len(dates) < 2:
        return None
    jours = (dates.iloc[-1] - dates.iloc[0]).days
    total = twr_portefeuille(ctx)
    if total is None or jours <= 0:
        return None
    return metrics.annualiser(total, jours)


def twr_en_or_portefeuille(ctx: "Contexte") -> float | None:
    """Performance en onces d'or depuis le premier snapshot, corrigée des apports.

    Même défaut, même remède que `twr_portefeuille` : « onces finales / onces
    initiales » monte dès que vous versez de l'argent. Sur le portefeuille
    réel, l'ancien calcul affichait +120 % là où la stratégie en avait produit
    16,9 %.

    Retourne `None` si l'équivalent-or manque sur une seule ligne — les
    snapshots importés de la v1 n'en ont pas, et il faut le dire plutôt que
    de fabriquer un prix de l'or.
    """
    snaps = ctx.snapshots
    if snaps is None or snaps.empty or len(snaps) < 2:
        return None
    if not {"patrimoine_investi_eur", "equivalent_or_oz"} <= set(snaps.columns):
        return None

    dates = _parser_dates(snaps["Date"])
    valeurs = pd.to_numeric(snaps["patrimoine_investi_eur"], errors="coerce")
    onces = pd.to_numeric(snaps["equivalent_or_oz"], errors="coerce")
    garder = dates.notna() & valeurs.notna() & (valeurs > 0)
    if int(garder.sum()) < 2:
        return None

    # Un equivalent-or manque-t-il sur la periode retenue ? On refuse de
    # « sauter » la ligne : la sous-periode qui l'enjambe serait calculee sur
    # deux periodes comme si c'en etait une, et le flux intermediaire serait
    # perdu. Autant le dire que mesurer de travers.
    if onces[garder].isna().any() or (onces[garder] <= 0).any():
        return None

    dates = dates[garder].tolist()
    valeurs = valeurs[garder].tolist()
    onces = onces[garder].tolist()
    flux_jour = flux_par_date(ctx.apports)
    flux = [flux_jour.get(d.date(), 0.0) for d in dates]

    try:
        return metrics.twr_en_or(valeurs, flux, onces)
    except ValueError:
        return None


def _parser_dates(serie) -> pd.Series:
    """Parse une colonne de dates en Timestamp, sans faire échouer l'appelant."""
    from . import dates
    try:
        return pd.to_datetime(dates.parser(serie))
    except Exception:
        return pd.to_datetime(serie, errors="coerce")


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
        ctx.importe_le = _date_dernier_import(df_tx)
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
    except prices.CoursIndisponible:
        # Le cours de l'or manque : c'est LUI qui manque, la conversion est
        # peut-etre valide. On le dit dans la bonne liste.
        ctx.echecs_cours.append(prices.TICKER_OR)
    except fx.FXIndisponible:
        # Le defaut separe : avant, l'echec du taux de change etait rapporte
        # comme un cours manquant. `exc` etait capture puis jete — l'exception
        # nommait pourtant la paire et la date fautives. L'utilisateur voyait
        # « GC=F » alors que le probleme etait l'EUR/USD.
        ctx.echecs_fx.append("EUR/USD (pour l'équivalent-or)")

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
