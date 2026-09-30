"""Couche d'accès Supabase.

CORRECTIONS PAR RAPPORT À LA V1
-------------------------------
1. **La table `Donnees` disparaît.** Dans la v1, les quantités étaient saisies à
   la main dans `Donnees` en parallèle de `Transaction`, et les deux pouvaient
   diverger sans que rien ne le détecte. Les positions sont désormais un
   *résultat* calculé depuis les transactions. Une seule source de vérité.

2. **Les credentials en dur sont supprimés.** `take_snapshot.py` et `calc_perf.py`
   de la v1 contenaient l'URL et la clé Supabase commitées en clair dans un repo
   public. Ici, tout passe par les variables d'environnement ou les secrets
   Streamlit, et l'absence de credential est une erreur explicite.

3. **Nouvelles tables, préfixe `pf2_`.** La base est partagée avec la v1 : on ne
   touche pas aux tables existantes, on en crée de nouvelles. La v1 continue de
   fonctionner, et la migration est réversible.
"""

from __future__ import annotations

import logging
import os

import pandas as pd

log = logging.getLogger(__name__)


class SecretsManquants(Exception):
    """Les credentials Supabase ne sont pas configurés."""


# Tables de la nouvelle application.
T_TRANSACTIONS = "pf2_transactions"
T_APPORTS = "pf2_apports"
T_SNAPSHOTS = "pf2_snapshots"
T_COURS = "pf2_cours"
T_FX = "pf2_fx"
T_INFLATION = "pf2_inflation"
T_ALERTES = "pf2_alertes"

TOUTES_LES_TABLES = (
    T_TRANSACTIONS, T_APPORTS, T_SNAPSHOTS, T_COURS, T_FX, T_INFLATION, T_ALERTES,
)


def _credentials() -> tuple[str, str]:
    """Récupère les credentials. Lève `SecretsManquants` s'ils sont absents."""
    url = os.environ.get("SUPABASE_URL")
    cle = os.environ.get("SUPABASE_KEY")

    if not url or not cle:
        try:
            import streamlit as st
            url = url or st.secrets.get("SUPABASE_URL")
            cle = cle or st.secrets.get("SUPABASE_KEY")
        except Exception:
            pass

    if not url or not cle:
        raise SecretsManquants(
            "Credentials Supabase absents. Définissez SUPABASE_URL et SUPABASE_KEY "
            "en variables d'environnement (GitHub Actions) ou dans "
            ".streamlit/secrets.toml. Aucune valeur de repli n'est fournie : "
            "une application qui devine sa base de données est une application "
            "qui écrit au mauvais endroit."
        )
    return url, cle


_client = None


def client():
    """Client Supabase, mémoïsé."""
    global _client
    if _client is None:
        from supabase import create_client
        url, cle = _credentials()
        _client = create_client(url, cle)
    return _client


def reinitialiser() -> None:
    global _client
    _client = None


# ---------------------------------------------------------------------------
# Lecture / écriture générique
# ---------------------------------------------------------------------------

def lire(table: str) -> pd.DataFrame:
    """Lit une table entière."""
    rep = client().table(table).select("*").execute()
    return pd.DataFrame(rep.data or [])


def ecrire(table: str, lignes: list[dict]) -> int:
    """Insère des lignes. Retourne le nombre inséré."""
    if not lignes:
        return 0
    rep = client().table(table).insert(lignes).execute()
    return len(rep.data or [])


def remplacer(table: str, lignes: list[dict]) -> None:
    """Vide puis réinsère une table de référence (inflation, cours du jour)."""
    client().table(table).delete().neq("id", -1).execute()
    if lignes:
        ecrire(table, lignes)


def maj_ligne(table: str, id_ligne, champs: dict) -> None:
    client().table(table).update(champs).eq("id", id_ligne).execute()


def existe(table: str) -> bool:
    """Vrai si la table existe et est accessible."""
    try:
        client().table(table).select("id").limit(1).execute()
        return True
    except Exception as exc:
        log.warning("Table %s inaccessible : %s", table, exc)
        return False


def tables_presentes() -> dict[str, bool]:
    """État des tables attendues — affiché à l'utilisateur au démarrage."""
    return {t: existe(t) for t in TOUTES_LES_TABLES}


# ---------------------------------------------------------------------------
# Accès métier
# ---------------------------------------------------------------------------

def transactions() -> pd.DataFrame:
    return lire(T_TRANSACTIONS)


def apports() -> pd.DataFrame:
    return lire(T_APPORTS)


def snapshots() -> pd.DataFrame:
    df = lire(T_SNAPSHOTS)
    if df.empty:
        return df
    df["Date_DT"] = pd.to_datetime(df["Date"], dayfirst=True, errors="coerce")
    return df.dropna(subset=["Date_DT"]).sort_values("Date_DT").reset_index(drop=True)


def inflation() -> pd.DataFrame:
    return lire(T_INFLATION)


def ajouter_snapshot(ligne: dict) -> None:
    """Ajoute un snapshot daté. Évite les doublons sur la date."""
    date = ligne["Date"]
    rep = client().table(T_SNAPSHOTS).select("id").eq("Date", date).limit(1).execute()
    if rep.data:
        client().table(T_SNAPSHOTS).update(ligne).eq("id", rep.data[0]["id"]).execute()
    else:
        ecrire(T_SNAPSHOTS, [ligne])


def ajouter_alerte(titre: str, message: str, niveau: str = "info") -> None:
    ecrire(T_ALERTES, [{
        "Date": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
        "Titre": titre,
        "Message": message,
        "Niveau": niveau,
    }])
