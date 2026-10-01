"""Helpers d'interface partagés.

CORRECTION PAR RAPPORT À LA V1
------------------------------
La v1 verrouillait des colonnes avec un cadenas (« 🔒 ») sans expliquer pourquoi,
et masquait ses erreurs de récupération de données. Ici, une donnée manquante est
toujours visible, et le verrouillage n'existe pas : on affiche ce qui est calculé.
"""

from __future__ import annotations

import math

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


def _nombre(valeur: object) -> float | None:
    """Convertit une valeur en nombre, ou `None` si c'est impossible.

    Ce helper existe à cause d'un défaut qui a vécu jusqu'en production. Une
    valeur qui arrive en texte ne lève PAS `TypeError` mais `ValueError`
    (« Unknown format code 'f' for object of type 'str' »), si bien qu'un
    garde-fou sur `None` seul donne une fausse confiance : une bonne moitié des
    entrées non numériques passaient au travers. Une valeur illisible doit
    afficher un tiret, pas faire sauter la page.

    NaN et l'infini sont traités comme illisibles, pour la même raison : ils
    traversent tous les tests usuels (`nan <= 0` est faux) et finiraient
    affichés tels quels — « nan € » dans une valorisation, ce qui est pire
    qu'un tiret, parce que ça ressemble à un vrai montant.
    """
    if valeur is None:
        return None
    if isinstance(valeur, str):
        try:
            valeur = float(valeur.replace(",", ".").replace(" ", "").replace("\u202f", ""))
        except (ValueError, AttributeError):
            return None
    try:
        nombre = float(valeur)
    except (TypeError, ValueError):
        return None
    if nombre != nombre or nombre in (float("inf"), float("-inf")):
        return None
    return nombre


def eur(montant: float | None, decimales: int = 2) -> str:
    """Formate un montant en euros, à la française.

    CORRECTION : le spécificateur était `f"{montant:,.{decimales} f}"`, avec une
    ESPACE entre la précision et le `f`. Python veut les drapeaux (signe,
    espace) AVANT la largeur et la précision :

        f"{1234.5:,.2 f}"   → ValueError: Invalid format specifier ',.2 f'

    Le défaut était là depuis le début, mais il ne s'était jamais vu : toutes les
    erreurs précédentes (taux de change, tri des transactions...) arrêtaient
    l'application avant qu'elle n'affiche le premier montant. Une fois ces
    erreurs corrigées, le plantage est remonté ici.

    On retire simplement l'espace : `,` pour les milliers, `.` pour la
    précision, puis on convertit au format français.
    """
    valeur = _nombre(montant)
    if valeur is None:
        return "—"
    return f"{valeur:,.{decimales}f}".replace(",", " ").replace(".", ",") + " €"


def quantite(valeur: float | None, chiffres: int = 6) -> str:
    """Formate une quantité d'actifs avec assez de décimales pour être lue.

    `f"{q:,.4f}"` affichait « 0,0575 » pour 0,05747 BTC — et « 0,0000 » pour une
    petite poche crypto, ce qui rendait deux positions indistinguables. Le nombre
    de décimales s'adapte donc à la grandeur : on garde `chiffres` chiffres
    significatifs. 800 reste « 800 », 0,05747 devient « 0,05747 ».
    """
    nombre = _nombre(valeur)
    if nombre is None:
        return "—"
    if nombre == 0:
        return "0"
    exposant = math.floor(math.log10(abs(nombre)))
    decimales = min(max(0, chiffres - 1 - exposant), 12)
    texte = f"{nombre:,.{decimales}f}".replace(",", " ").replace(".", ",")
    if "," in texte:                      # 800,00 -> 800
        texte = texte.rstrip("0").rstrip(",")
    return texte


def pct(part: float | None, decimales: int = 1, signe: bool = False) -> str:
    valeur = _nombre(part)
    if valeur is None:
        return "—"
    val = valeur * 100
    return f"{val:+.{decimales}f} %" if signe else f"{val:.{decimales}f} %"


def points(ecart: float, decimales: int = 1) -> str:
    """Écart en points de pourcentage, toujours signé."""
    valeur = _nombre(ecart)
    if valeur is None:
        return "—"
    return f"{valeur:+,.{decimales}f} pts"


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
