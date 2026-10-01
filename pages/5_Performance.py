"""Performance.

CORRECTIONS PAR RAPPORT À LA V1
-------------------------------
1. **Le TWR était un cumprod de ratios Dietz mensuels**, ce qui suppose que les
   apports arrivent en fin de période. On chaîne ici les rendements de
   sous-période, définition standard du TWR.

2. **Aucune performance n'était mesurée en or.** C'était pourtant la seule qui
   compte pour Gave, et la v1 collectait déjà les données pour la calculer.

3. **Aucun rendement pondéré par les flux (IRR).** Le TWR répond à « qu'a fait la
   stratégie », l'IRR à « qu'ai-je gagné avec mon calendrier d'apports ». Les deux
   sont nécessaires.

4. **L'inflation 2026 valait 0,00 %** dans la v1, ce qui rendait la performance
   réelle de l'année en cours égale à la nominale.
"""

from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd
import streamlit as st

from core import metrics, session as S
from core import dates
from core import ui

st.set_page_config(page_title="Performance", page_icon="📈", layout="wide")
st.title("📈 Performance")

ctx = S.charger()
for err in ctx.erreurs:
    st.error(err)
ui.bandeau_erreurs(ctx.echecs_cours, "cours")
if ctx.erreurs:
    st.stop()

if ctx.snapshots.empty or len(ctx.snapshots) < 2:
    st.info("Il faut au moins deux snapshots pour calculer une performance.")
    st.stop()

snaps = ctx.snapshots.copy()
snaps["Date"] = dates.parser(snaps["Date"])
snaps = snaps.dropna(subset=["Date"]).sort_values("Date").reset_index(drop=True)

# ---------------------------------------------------------------------------
# Flux externes : apports et retraits du jour
# ---------------------------------------------------------------------------
apports = ctx.apports.copy()
flux_par_date: dict = {}
if not apports.empty:
    apports["Date_DT"] = pd.to_datetime(apports["date"], errors="coerce")
    for _, r in apports.iterrows():
        if pd.isna(r["Date_DT"]):
            continue
        signe = 1.0 if r["sens"] == "apport" else -1.0
        flux_par_date[r["Date_DT"].date()] = flux_par_date.get(r["Date_DT"].date(), 0.0) \
            + signe * float(r["montant_eur"])

valeurs = snaps["patrimoine_investi_eur"].astype(float).tolist()
flux = [flux_par_date.get(d.date(), 0.0) for d in snaps["Date"]]

rendements = metrics.rendements_periode(valeurs, flux)
twr_total = metrics.twr(rendements)

jours = (snaps["Date"].iloc[-1] - snaps["Date"].iloc[0]).days
twr_ann = metrics.annualiser(twr_total, jours)

# ---------------------------------------------------------------------------
# Indicateurs principaux
# ---------------------------------------------------------------------------
st.subheader("Ce que la stratégie a produit")

c1, c2, c3 = st.columns(3)
c1.metric("TWR cumulé", ui.pct(twr_total, signe=True),
          aide="Time-Weighted Return : neutralise l'effet de vos apports.")
c2.metric("TWR annualisé", ui.pct(twr_ann, signe=True),
          aide=f"Sur {jours} jours ({jours / 365.25:.1f} ans).")
c3.metric("Volatilité annualisée", ui.pct(metrics.volatilite(rendements), signe=True),
          aide="Écart-type des rendements de sous-période annualisé.")

# ---------------------------------------------------------------------------
# Les trois lectures de la même performance
# ---------------------------------------------------------------------------
st.divider()
st.subheader("Trois lectures de la même période")
st.caption(
    "Une performance n'a de sens que rapportée à un étalon. Gave en retient un : "
    "l'or. « L'or montera tant que les monnaies ne redeviendront pas des réserves "
    "de valeur. »"
)

# 1. En euros.
perf_eur = twr_total

# 2. En euros réels (pouvoir d'achat).
inflation = S.inflation_dict(ctx)
annees = [d.year for d in snaps["Date"]]
infl_periode = 1.0
for a in sorted(set(annees)):
    if a in inflation:
        nb = sum(1 for x in annees if x == a)
        infl_periode *= (1.0 + inflation[a]) ** (nb / 12.0)
perf_reel = (1.0 + perf_eur) / infl_periode - 1.0 if infl_periode > 0 else None

# 3. En onces d'or.
perf_or = None
if "equivalent_or_oz" in snaps.columns and snaps["equivalent_or_oz"].notna().all():
    oz0 = float(snaps["equivalent_or_oz"].iloc[0])
    oz1 = float(snaps["equivalent_or_oz"].iloc[-1])
    if oz0 > 0:
        perf_or = oz1 / oz0 - 1.0

d1, d2, d3 = st.columns(3)
d1.metric("En euros", ui.pct(perf_eur, signe=True))
d2.metric("En euros réels", ui.pct(perf_reel, signe=True) if perf_reel is not None else "—",
          aide="Déflaté par l'inflation officielle.")
d3.metric("En onces d'or", ui.pct(perf_or, signe=True) if perf_or is not None else "—",
          aide="L'étalon de Gave.")

if perf_or is not None and perf_or < perf_eur:
    st.warning(
        f"Votre portefeuille a gagné {ui.pct(perf_eur, signe=True)} en euros mais "
        f"**{ui.pct(perf_or, signe=True)} en or**. La monnaie a fait le travail à "
        "votre place : en étalon de valeur réel, vous avez perdu."
    )

# ---------------------------------------------------------------------------
# Rendement pondéré par les flux
# ---------------------------------------------------------------------------
st.divider()
st.subheader("Ce que vous, personnellement, avez gagné")

flux_irr = []
for i, d in enumerate(snaps["Date"]):
    if i == 0:
        flux_irr.append((d.date(), -valeurs[0]))
    elif i == len(valeurs) - 1:
        flux_irr.append((d.date(), valeurs[-1]))
    else:
        flux_irr.append((d.date(), -flux[i]))

taux_irr = metrics.irr(flux_irr)
c1, c2 = st.columns(2)
c1.metric("IRR (rendement pondéré)", ui.pct(taux_irr, signe=True) if taux_irr is not None else "—",
          aide="Tient compte de votre calendrier d'apports réel.")
c2.metric("Écart TWR / IRR",
          ui.points((taux_irr - twr_ann) * 100, 2) if taux_irr is not None else "—",
          aide="Positif : vos apports ont été bien placés. Négatif : vous avez "
               "alimenté le portefeuille au mauvais moment.")

# ---------------------------------------------------------------------------
# Par année
# ---------------------------------------------------------------------------
st.divider()
st.subheader("Par année")

snaps["Annee"] = snaps["Date"].dt.year
par_annee = snaps.groupby("Annee").agg(
    debut=("patrimoine_investi_eur", "first"),
    fin=("patrimoine_investi_eur", "last"),
).reset_index()

lignes = []
for _, r in par_annee.iterrows():
    if r["debut"] <= 0:
        continue
    perf = r["fin"] / r["debut"] - 1.0
    infl = inflation.get(int(r["Annee"]))
    reel = (1 + perf) / (1 + infl) - 1.0 if infl is not None else None
    lignes.append({
        "Année": int(r["Annee"]),
        "Performance": ui.pct(perf, signe=True),
        "Inflation": ui.pct(infl, signe=True) if infl is not None else "⚠️ non renseignée",
        "Réelle": ui.pct(reel, signe=True) if reel is not None else "—",
    })

if lignes:
    ui.tableau(pd.DataFrame(lignes))

    annees_sans_inflation = [
        int(r["Annee"]) for _, r in par_annee.iterrows() if int(r["Annee"]) not in inflation
    ]
    if annees_sans_inflation:
        st.warning(
            "**Années sans inflation renseignée** : "
            + ", ".join(str(a) for a in annees_sans_inflation)
            + ". La performance réelle de ces années ne peut pas être calculée. "
            "La v1 masquait ce trou en remplissant avec 0 %."
        )
else:
    st.info("Pas assez de données pour un détail annuel.")
