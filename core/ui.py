"""Helpers d'interface partagés.

CORRECTION PAR RAPPORT À LA V1
------------------------------
La v1 verrouillait des colonnes avec un cadenas (« 🔒 ») sans expliquer pourquoi,
et masquait ses erreurs de récupération de données. Ici, une donnée manquante est
toujours visible, et le verrouillage n'existe pas : on affiche ce qui est calculé.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st


def bandeau_erreurs(echecs: list[str], contexte: str = "") -> None:
    """Affiche les données qui n'ont pas pu être récupérées.

    La v1 remplaçait un taux de change manquant par 1,05 et un cours manquant par
    zéro, sans le signaler. Résultat : des performances flatteuses construites sur
    des chiffres inventés. Une erreur visible vaut mieux qu'un chiffre faux.
    """
    if not echecs:
        return
    detail = f" ({contexte})" if contexte else ""
    st.error(
        f"**{len(echecs)} donnée(s) indisponible(s)**{detail} : "
        + ", ".join(f"`{e}`" for e in echecs)
        + "\n\nLes calculs ci-dessous sont incomplets. Aucune valeur de repli n'a "
        "été substituée — c'est volontaire."
    )


def eur(montant: float | None, decimales: int = 2) -> str:
    if montant is None:
        return "—"
    return f"{montant:,.{decimales} f}".replace(",", " ").replace(".", ",") + " €"


def pct(part: float | None, decimales: int = 1, signe: bool = False) -> str:
    if part is None:
        return "—"
    val = part * 100
    return f"{val:+.{decimales}f} %" if signe else f"{val:.{decimales}f} %"


def points(ecart: float, decimales: int = 1) -> str:
    """Écart en points de pourcentage, toujours signé."""
    return f"{ecart:+,.{decimales}f} pts"


def couleur_ecart(ecart_points: float, bande_points: float) -> str:
    a = abs(ecart_points)
    if a <= bande_points:
        return "normal"
    if a <= bande_points * 2:
        return "attention"
    return "critique"


def metrique(label: str, valeur: str, aide: str = "", delta: str | None = None) -> None:
    st.metric(label=label, value=valeur, delta=delta, help=aide or None)


def tableau(df: pd.DataFrame, **kwargs) -> None:
    """DataFrame sans l'index, en pleine largeur."""
    st.dataframe(df, use_container_width=True, hide_index=True, **kwargs)


def section(titre: str, aide: str = "") -> None:
    st.subheader(titre, help=aide or None)


def encadre(texte: str, niveau: str = "info") -> None:
    fn = {"info": st.info, "attention": st.warning, "critique": st.error}.get(niveau, st.info)
    fn(texte)


def appareil(etat: dict) -> None:
    """Affiche l'état de connectivité aux sources."""
    manquantes = [k for k, v in etat.items() if not v]
    if not manquantes:
        return
    st.caption(
        "⚠️ Tables Supabase absentes : " + ", ".join(f"`{m}`" for m in manquantes)
        + " — exécutez `migrations/001_init.sql`."
    )
