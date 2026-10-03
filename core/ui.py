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


# Taux EUR -> USD courant (ex. 1,125 : 1 € = 1,125 $), rafraîchi par
# `session.charger()`. Permet à `usd_eur(montant_usd)` d'afficher l'indication
# en euros même quand seul le montant en dollars lui est passé.
_TAUX_EUR_USD: float = 1.125


def definir_taux_eur_usd(taux: float | None) -> None:
    """Enregistre le taux EUR -> USD courant pour l'indication en euros."""
    global _TAUX_EUR_USD
    val = _nombre(taux)
    if val is not None and val > 0:
        _TAUX_EUR_USD = val


def usd(montant: float | None, decimales: int = 2, signe: bool = False) -> str:
    """Formate un montant en dollars, à la française (ex. « 79 007,00 $ »)."""
    valeur = _nombre(montant)
    if valeur is None:
        return "—"
    fmt = f"+,.{decimales}f" if signe else f",.{decimales}f"
    return f"{valeur:{fmt}}".replace(",", " ").replace(".", ",") + " $"


def usd_eur(
    montant_usd: float | None,
    montant_eur: float | None = None,
    taux_eur_usd: float | None = None,
    decimales: int = 2,
    signe: bool = False,
) -> str:
    """Formate un montant en dollars avec son indication en euros (« X $ / Y € »).

    Convention de l'utilisateur (identique à `afficher_montant_double` dans la
    v1) : tout est compté en dollars ($), avec l'équivalent en euros (€) affiché
    à côté à titre indicatif.
    """
    v_usd = _nombre(montant_usd)
    if v_usd is None:
        return "—"
    v_eur = _nombre(montant_eur)
    if v_eur is None:
        t = _nombre(taux_eur_usd) or _TAUX_EUR_USD
        v_eur = (v_usd / t) if (t and t > 0) else v_usd
    fmt = f"+,.{decimales}f" if signe else f",.{decimales}f"
    s_usd = f"{v_usd:{fmt}}".replace(",", " ").replace(".", ",") + " $"
    s_eur = f"{v_eur:{fmt}}".replace(",", " ").replace(".", ",") + " €"
    return f"{s_usd} / {s_eur}"


def eur(montant: float | None, decimales: int = 2, signe: bool = False) -> str:
    """Formate un montant en euros, à la française."""
    valeur = _nombre(montant)
    if valeur is None:
        return "—"
    fmt = f"+,.{decimales}f" if signe else f",.{decimales}f"
    return f"{valeur:{fmt}}".replace(",", " ").replace(".", ",") + " €"


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


def jour(valeur, defaut: str = "—") -> str:
    """Une date au format français : 30/04/2024.

    Pourquoi ça existe : les messages de diagnostic affichaient l'ISO
    (`2024-04-30`), et une date en ISO se lit mal quand elle n'est pas triée —
    on la survole au lieu de la lire. Le reste de l'application parle déjà en
    jj/mm/aaaa ; les alertes doivent parler la même langue que les tableaux.

    Accepte un `date`, un `datetime`, un `Timestamp` ou une chaîne ISO.
    Ne lève jamais : une date illisible rend `defaut`.
    """
    if valeur is None:
        return defaut
    try:
        if hasattr(valeur, "strftime") and not isinstance(valeur, str):
            return valeur.strftime("%d/%m/%Y")
        t = pd.Timestamp(str(valeur))
        if pd.isna(t):
            return defaut
        return t.strftime("%d/%m/%Y")
    except Exception:
        return defaut


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




def html_usd_eur(
    montant_usd: float | None,
    montant_eur: float | None = None,
    taux_eur_usd: float | None = None,
    decimales: int = 2,
    taille_usd: str = "1.0rem",
    taille_eur: str = "0.88rem",
    signe: bool = False,
) -> str:
    """Retourne le bloc HTML à deux lignes : montant $ en blanc au-dessus,
    montant € en bleu (#38bdf8) en dessous."""
    v_usd = _nombre(montant_usd)
    if v_usd is None:
        return "<span style='color:#888;'>—</span>"
    v_eur = _nombre(montant_eur)
    if v_eur is None:
        t = _nombre(taux_eur_usd) or _TAUX_EUR_USD
        v_eur = (v_usd / t) if (t and t > 0) else v_usd
    fmt = f"+,.{decimales}f" if signe else f",.{decimales}f"
    s_usd = f"{v_usd:{fmt}}".replace(",", " ").replace(".", ",") + " $"
    s_eur = f"{v_eur:{fmt}}".replace(",", " ").replace(".", ",") + " €"
    return (
        f"<div style='color:#ffffff;font-weight:600;font-size:{taille_usd};line-height:1.2;'>{s_usd}</div>"
        f"<div style='color:#38bdf8;font-weight:500;font-size:{taille_eur};line-height:1.2;margin-top:2px;'>{s_eur}</div>"
    )


def _couleur_variation(val: float | None) -> str:
    """Retourne vert (#2ecc71) si > 0, rouge (#e74c3c) si < 0, bleu (#38bdf8) si stable (== 0)."""
    if val is None or abs(float(val)) <= 1e-6:
        return "#38bdf8"
    return "#2ecc71" if float(val) > 0 else "#e74c3c"


def _couleur_delta_texte(delta_str: str) -> str:
    """Détermine la couleur d'un texte delta : vert si positif, rouge si négatif, bleu si stable (0)."""
    s = str(delta_str).strip()
    # Chercher s'il y a un nombre non nul dans la chaîne
    import re
    m = re.search(r"([+-]?\d+(?:[.,]\d+)?)", s)
    if m:
        try:
            v = float(m.group(1).replace(",", "."))
            if abs(v) <= 1e-6:
                return "#38bdf8"
            if "-" in s[:m.start() + 1]:
                return "#e74c3c"
            return "#2ecc71" if v > 0 else "#e74c3c"
        except Exception:
            pass
    if s.startswith("-"):
        return "#e74c3c"
    if s.startswith("+"):
        return "#2ecc71"
    return "#38bdf8"


def metric_usd_eur(
    conteneur,
    label: str,
    montant_usd: float | None,
    montant_eur: float | None = None,
    delta: str | None = None,
    help: str | None = None,
    decimales: int = 2,
    signe: bool = False,
) -> None:
    """Affiche un indicateur avec le montant en dollars ($) en haut et en euros (€) en dessous.

    - Si `signe=False` (montant patrimonial statique) : $ en blanc (#ffffff) en haut, € en bleu (#38bdf8) en dessous.
    - Si `signe=True` (indicateur de variation/progression) : en vert (#2ecc71) si > 0,
      en rouge (#e74c3c) si < 0, en bleu (#38bdf8) si stable (0).
    """
    cible = conteneur if conteneur is not None else st
    v_usd = _nombre(montant_usd)
    if v_usd is None:
        bloc_val = "<div style='font-size:1.75rem;font-weight:600;color:#38bdf8;'>—</div>"
    else:
        v_eur = _nombre(montant_eur)
        if v_eur is None:
            t = _TAUX_EUR_USD
            v_eur = (v_usd / t) if (t and t > 0) else v_usd
        if signe and abs(v_usd) <= 1e-6:
            s_usd = f"{0.0:,.{decimales}f}".replace(",", " ").replace(".", ",") + " $"
            s_eur = f"{0.0:,.{decimales}f}".replace(",", " ").replace(".", ",") + " €"
        else:
            fmt = f"+,.{decimales}f" if signe else f",.{decimales}f"
            s_usd = f"{v_usd:{fmt}}".replace(",", " ").replace(".", ",") + " $"
            s_eur = f"{v_eur:{fmt}}".replace(",", " ").replace(".", ",") + " €"

        if signe:
            c_haut = _couleur_variation(v_usd)
            c_bas = "#38bdf8"
        else:
            c_haut = "#ffffff"
            c_bas = "#38bdf8"

        bloc_val = (
            f"<div style='font-size:1.7rem;font-weight:600;color:{c_haut};line-height:1.15;'>{s_usd}</div>"
            f"<div style='font-size:1.05rem;font-weight:500;color:{c_bas};line-height:1.25;margin-top:0.15rem;'>{s_eur}</div>"
        )

    delta_html = ""
    if delta:
        couleur_d = _couleur_delta_texte(str(delta))
        delta_html = (
            f"<div style='font-size:0.85rem;font-weight:500;color:{couleur_d};margin-top:0.2rem;'>"
            f"{delta}</div>"
        )

    aide_attr = ""
    aide_icone = ""
    if help:
        echappe = str(help).replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
        aide_attr = f' title="{echappe}"'
        aide_icone = f" <span title='{echappe}' style='cursor:help;opacity:0.6;font-size:0.8em;'>ⓘ</span>"

    cible.markdown(
        f"<div style='margin-bottom:0.85rem;'{aide_attr}>"
        f"<div style='font-size:0.875rem;color:rgba(250,250,250,0.75);margin-bottom:0.2rem;'>{label}{aide_icone}</div>"
        f"{bloc_val}"
        f"{delta_html}"
        f"</div>",
        unsafe_allow_html=True,
    )





def metric_pct(
    conteneur,
    label: str,
    valeur_fraction: float | None,
    delta: str | None = None,
    help: str | None = None,
    decimales: int = 2,
    sous_texte_bleu: str | None = None,
) -> None:
    """Affiche un indicateur de pourcentage coloré :
    - Vert (#2ecc71) si > 0 (ça monte)
    - Rouge (#e74c3c) si < 0 (ça baisse)
    - Bleu (#38bdf8) si == 0 (stable)
    """
    cible = conteneur if conteneur is not None else st
    v = _nombre(valeur_fraction)
    if v is None:
        bloc_val = "<div style='font-size:1.7rem;font-weight:600;color:#38bdf8;'>—</div>"
    else:
        c_val = _couleur_variation(v)
        txt_pct = pct(0.0 if abs(v) <= 1e-6 else v, decimales=decimales, signe=(abs(v) > 1e-6))
        sous_html = (
            f"<div style='font-size:1.0rem;font-weight:500;color:#38bdf8;line-height:1.25;margin-top:0.15rem;'>{sous_texte_bleu}</div>"
            if sous_texte_bleu else ""
        )
        bloc_val = (
            f"<div style='font-size:1.7rem;font-weight:600;color:{c_val};line-height:1.15;'>{txt_pct}</div>"
            f"{sous_html}"
        )

    delta_html = ""
    if delta:
        couleur_d = _couleur_delta_texte(str(delta))
        delta_html = (
            f"<div style='font-size:0.85rem;font-weight:500;color:{couleur_d};margin-top:0.2rem;'>"
            f"{delta}</div>"
        )

    aide_attr = ""
    aide_icone = ""
    if help:
        echappe = str(help).replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
        aide_attr = f' title="{echappe}"'
        aide_icone = f" <span title='{echappe}' style='cursor:help;opacity:0.6;font-size:0.8em;'>ⓘ</span>"

    cible.markdown(
        f"<div style='margin-bottom:0.85rem;'{aide_attr}>"
        f"<div style='font-size:0.875rem;color:rgba(250,250,250,0.75);margin-bottom:0.2rem;'>{label}{aide_icone}</div>"
        f"{bloc_val}"
        f"{delta_html}"
        f"</div>",
        unsafe_allow_html=True,
    )


def _formater_cellule_html(val: object) -> str:
    """Convertit une cellule contenant `X $ / Y €` en deux lignes :
    dollars en blanc au-dessus, euros en bleu (#38bdf8) en dessous."""
    import html as _html
    if val is None or ( isinstance(val, float) and math.isnan(val) ):
        return "—"
    txt = str(val)
    if " $ / " in txt and txt.endswith(" €"):
        part_usd, part_eur = txt.split(" / ", 1)
        return (
            f"<div style='color:#ffffff;font-weight:600;line-height:1.25;white-space:nowrap;'>"
            f"{_html.escape(part_usd)}</div>"
            f"<div style='color:#38bdf8;font-size:0.88em;font-weight:500;line-height:1.25;margin-top:2px;white-space:nowrap;'>"
            f"{_html.escape(part_eur)}</div>"
        )
    return _html.escape(txt)


def tableau(df: pd.DataFrame, **kwargs) -> None:
    """Affiche un DataFrame sans l'index, en pleine largeur.

    Dès qu'une cellule contient un montant double `X $ / Y €` (produit par
    `ui.usd_eur`), le tableau est rendu en HTML sombre afin d'afficher le
    montant en dollars en blanc au-dessus et le montant en euros en bleu
    (#38bdf8) juste en dessous, comme demandé par l'utilisateur.
    """
    import html as _html
    if df is None or df.empty:
        st.dataframe(df, use_container_width=True, hide_index=True, **kwargs)
        return

    contient_double = any(
        isinstance(v, str) and " $ / " in v and v.endswith(" €")
        for col in df.columns
        for v in df[col]
    )
    if not contient_double:
        st.dataframe(df, use_container_width=True, hide_index=True, **kwargs)
        return

    entetes = "".join(
        f"<th style='text-align:left;padding:10px 12px;border-bottom:1px solid rgba(250,250,250,0.16);"
        f"color:rgba(250,250,250,0.75);font-weight:600;font-size:0.86rem;white-space:nowrap;'>"
        f"{_html.escape(str(col)).replace(' ($ / €)', '')}</th>"
        for col in df.columns
    )
    lignes_html = []
    for _, row in df.iterrows():
        cellules = "".join(
            f"<td style='padding:8px 12px;border-bottom:1px solid rgba(250,250,250,0.08);"
            f"vertical-align:middle;font-size:0.92rem;color:#ffffff;'>"
            f"{_formater_cellule_html(row[col])}</td>"
            for col in df.columns
        )
        lignes_html.append(f"<tr>{cellules}</tr>")

    table_html = (
        "<div style='overflow-x:auto;border:1px solid rgba(250,250,250,0.12);"
        "border-radius:8px;margin-bottom:1rem;background:rgba(17,24,39,0.35);'>"
        "<table style='width:100%;border-collapse:collapse;'>"
        f"<thead><tr>{entetes}</tr></thead>"
        f"<tbody>{''.join(lignes_html)}</tbody>"
        "</table></div>"
    )
    st.markdown(table_html, unsafe_allow_html=True)


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
