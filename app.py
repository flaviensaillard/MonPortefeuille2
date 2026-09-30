"""MonPortefeuille 2 — Tableau de bord.

Ce que cette page corrige par rapport à la v1 :

- La **performance est donnée en onces d'or**, pas seulement en euros. C'est
  l'étalon de Gave : « l'or montera tant que les monnaies ne redeviendront pas des
  réserves de valeur ». La v1 collectait une colonne `Montant Or` à chaque apport
  et ne s'en servait jamais.

- L'**épargne de précaution est affichée séparément** du portefeuille investi. La
  v1 la mélangeait dans l'assiette de rééquilibrage, ce qui faussait toutes les
  dérives.

- Aucune valeur de repli. Si un cours ou un taux manque, un bandeau le dit.
"""

from __future__ import annotations

import datetime as dt

import streamlit as st

from core import session as S
from core import ui
from core.models import Perimetre

st.set_page_config(page_title="Mon Portefeuille", page_icon="📊", layout="wide")

st.title("📊 Tableau de bord")

ctx = S.charger()

for err in ctx.erreurs:
    st.error(err)

ui.appareil({"tables": not ctx.tables_absentes})
ui.bandeau_erreurs(ctx.echecs_cours, "cours")
ui.bandeau_erreurs(ctx.echecs_fx, "taux de change")

if ctx.erreurs:
    st.stop()

# ---------------------------------------------------------------------------
# Patrimoine
# ---------------------------------------------------------------------------
st.caption(f"Au {dt.date.today().strftime('%d/%m/%Y')}")

c1, c2, c3, c4 = st.columns(4)
c1.metric("Patrimoine total", ui.eur(ctx.patrimoine_total_eur),
          aide="Investi + épargne de précaution + compte courant.")
c2.metric("Portefeuille investi", ui.eur(ctx.total_investi_eur),
          aide="Seul montant soumis à l'allocation cible.")
c3.metric("Épargne de précaution", ui.eur(ctx.total_precaution_eur),
          aide="Livret CHF, disponible en 5 minutes. Jamais rééquilibrée.")
c4.metric("Compte courant", ui.eur(ctx.total_courant_eur),
          aide="Revolut. Hors portefeuille d'investissement.")

# ---------------------------------------------------------------------------
# L'étalon de Gave
# ---------------------------------------------------------------------------
st.divider()
st.subheader("🪙 La mesure qui compte", help="Performance exprimée en onces d'or, l'étalon de valeur de Charles Gave.")

g1, g2, g3 = st.columns(3)
if ctx.cours_or:
    g1.metric("Cours de l'or", f"{ctx.cours_or:,.0f} $/oz", aide="Spot XAU/USD.")
else:
    g1.metric("Cours de l'or", "—")

if ctx.equivalent_or_oz is not None:
    g2.metric("Portefeuille investi en or", f"{ctx.equivalent_or_oz:,.2f} oz",
              aide="Combien d'onces d'or votre portefeuille investi achète aujourd'hui.")
else:
    g2.metric("Portefeuille investi en or", "—")

perf_or = None
if not ctx.snapshots.empty and "equivalent_or_oz" in ctx.snapshots.columns:
    oz0 = ctx.snapshots["equivalent_or_oz"].iloc[0]
    oz1 = ctx.snapshots["equivalent_or_oz"].iloc[-1]
    if oz0 and oz0 > 0:
        perf_or = oz1 / oz0 - 1.0

perf_eur = ctx.perf_globale_pct
if perf_or is not None:
    g3.metric("Performance en or", ui.pct(perf_or, signe=True),
              delta=ui.pct(perf_eur, signe=True) if perf_eur is not None else None,
              help="Depuis le premier snapshot. Le delta compare à la performance en euros.")
elif perf_eur is not None:
    g3.metric("Performance en euros", ui.pct(perf_eur, signe=True))
else:
    g3.metric("Performance", "—", aide="Aucun snapshot enregistré.")

if perf_or is not None and perf_or < 0:
    st.warning(
        f"**Votre portefeuille perd de l'or.** En {ui.pct(perf_or, signe=True)}, "
        "vous achetez moins d'onces qu'au début. Même si la performance en euros "
        "est positive, vous vous appauvrissez dans l'étalon qui compte."
    )

# ---------------------------------------------------------------------------
# Allocation par poche
# ---------------------------------------------------------------------------
st.divider()
st.subheader("⚖️ Allocation par poche")

lignes = []
for e in ctx.ecarts:
    lignes.append({
        "Poche": e.poche_nom,
        "Cible": ui.pct(e.poids_cible),
        "Réel": ui.pct(e.poids_reel),
        "Écart": ui.points(e.ecart_points),
        "Bande": f"±{e.poche.bande * 100:.0f} pts",
        "Valeur": ui.eur(e.valeur_eur),
        "État": "🔴 hors bande" if e.hors_bande else "🟢 dans la bande",
    })

if lignes:
    df = ui.tableau(__import__("pandas").DataFrame(lignes))

    hors = ctx.besoins_reequilibrage
    if hors:
        st.warning(
            f"**{len(hors)} poche(s) hors bande.** Voir la page Rééquilibrage pour "
            "les ordres proposés."
        )
    else:
        st.success("Toutes les poches sont dans leur bande de tolérance.")
else:
    st.info("Aucune position investie.")

# ---------------------------------------------------------------------------
# Épargne de précaution — rappel du rôle
# ---------------------------------------------------------------------------
if ctx.total_precaution_eur > 0:
    st.divider()
    st.subheader("🏦 Épargne de précaution")
    mois = 6
    st.caption(
        f"{ui.eur(ctx.total_precaution_eur)} disponibles en 5 minutes. "
        f"Soit environ {ctx.total_precaution_eur / mois:,.0f} €/mois sur {mois} mois "
        "de dépenses — à ajuster selon votre besoin réel."
    )
