"""Liste des actifs.

CORRECTION PAR RAPPORT À LA V1
------------------------------
La v1 affichait une table `Donnees` saisie à la main, avec des colonnes
« verrouillées » par un cadenas. Deux problèmes : les quantités pouvaient diverger
de la table `Transaction`, et le cadenas masquait qu'une valeur était simplement
fausse plutôt que protégée.

Ici, tout est calculé depuis les transactions. Rien n'est verrouillé, parce que
rien n'est saisi.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from core import session as S
from core import ui
from core.models import POCHES_PAR_CLE

st.set_page_config(page_title="Liste des actifs", page_icon="📋", layout="wide")
st.title("📋 Liste des actifs")

ctx = S.charger()
for err in ctx.erreurs:
    st.error(err)
ui.bandeau_erreurs(ctx.echecs_cours, "cours")
if ctx.erreurs:
    st.stop()

if not ctx.actifs:
    st.info("Aucune position. Enregistrez une transaction depuis la page Rééquilibrage.")
    st.stop()

# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------
lignes = []
# `-x.valeur_eur` lève `TypeError` si une valeur manque. `valoriser()` écarte les
# actifs en échec, donc cela ne devrait pas arriver — mais si un jour un actif
# sans valeur passait, mieux vaut le voir en bas de liste qu'une page blanche.
for a in sorted(ctx.actifs, key=lambda x: -(x.valeur_eur or 0.0)):
    pos = ctx.positions.get(a.ticker)
    poche = POCHES_PAR_CLE.get(a.poche)
    lignes.append({
        "Actif": a.ticker,
        "Poche": poche.nom if poche else "Non classé",
        "Classe": a.classe.value.replace("_", " "),
        "Régime fiscal": a.regime_fiscal,
        "Qté": f"{a.quantite:,.4f}".replace(",", " "),
        "Cours": f"{a.prix:,.4f}".replace(",", " "),
        "Devise": a.devise_cotation,
        "Valeur": ui.eur(a.valeur_eur),
        "Poids (investi)": ui.pct(a.valeur_eur / ctx.total_investi_eur)
        if ctx.total_investi_eur > 0 and a.est_investi else "—",
        "PRU": ui.eur(pos.pru_eur) if pos and pos.pru_eur else "—",
        "Perf.": ui.pct((a.valeur_eur / (pos.pru_eur * a.quantite)) - 1, signe=True)
        if pos and pos.pru_eur > 0 and a.quantite else "—",
        "PV latente": ui.eur(pos.pv_latente_eur) if pos else "—",
    })

df = pd.DataFrame(lignes)
ui.tableau(df)

# ---------------------------------------------------------------------------
# Détail par poche
# ---------------------------------------------------------------------------
st.divider()
st.subheader("Par poche")

for cle, etat in ctx.etats.items():
    if not etat.actifs:
        continue
    p = etat.poche
    perimetre = {
        "investi": "Portefeuille investi",
        "precaution": "Épargne de précaution (hors allocation)",
        "courant": "Compte courant (hors allocation)",
    }.get(p.perimetre.value, p.perimetre.value)

    with st.expander(
        f"**{p.nom}** — {ui.eur(etat.valeur_eur)} · {perimetre}", expanded=False
    ):
        if p.description:
            st.caption(p.description)
        if p.perimetre.value == "investi":
            st.caption(
                f"Cible {ui.pct(p.cible)} · bande ±{p.bande * 100:.0f} pts · "
                f"réel {ui.pct(etat.poids_reel)} · écart {ui.points(etat.ecart_points)}"
            )
        lignes_poche = [{
            "Actif": a.ticker,
            "Qté": f"{a.quantite:,.4f}".replace(",", " "),
            "Valeur": ui.eur(a.valeur_eur),
            "Part de la poche": ui.pct(a.valeur_eur / etat.valeur_eur)
            if etat.valeur_eur else "—",
        } for a in etat.actifs]
        ui.tableau(pd.DataFrame(lignes_poche))

# ---------------------------------------------------------------------------
# Actifs non classés
# ---------------------------------------------------------------------------
non_classes = [a for a in ctx.actifs if a.poche == "inconnu"]
if non_classes:
    st.divider()
    st.error(
        "**Actifs non classés** : " + ", ".join(f"`{a.ticker}`" for a in non_classes)
        + ". Ils sont exclus de l'allocation car aucune poche ne les revendique. "
        "Ajoutez-les dans `core/models.py` (dictionnaire `POCHES`)."
    )
