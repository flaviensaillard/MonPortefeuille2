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
# Une seule implementation du decoupage des flux, partagee avec la page
# d'accueil et la projection retraite. Voyez `session.flux_par_date`.
flux_jour = S.flux_par_date(ctx.apports)


flux = [flux_jour.get(d.date(), 0.0) for d in snaps["Date"]]

valeurs = snaps["patrimoine_investi_eur"].astype(float).tolist()

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
          help="Time-Weighted Return : neutralise l'effet de vos apports.")
c2.metric("TWR annualisé", ui.pct(twr_ann, signe=True),
          help=f"Sur {jours} jours ({jours / 365.25:.1f} ans).")
c3.metric("Volatilité annualisée", ui.pct(metrics.volatilite(rendements), signe=True),
          help="Écart-type des rendements de sous-période annualisé.")

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
d0, d1 = snaps["Date"].iloc[0].date(), snaps["Date"].iloc[-1].date()
# Pondere par les jours, pas par le nombre de lignes : voir
# `metrics.inflation_cumulee`, ou le defaut est documente.
infl_periode = metrics.inflation_cumulee(inflation, d0, d1)
perf_reel = (1.0 + perf_eur) / infl_periode - 1.0 if infl_periode > 0 else None

# 3. En onces d'or — corrigee des apports, comme les deux autres lectures.
# `oz_final / oz_initial` avait le meme defaut que `fin / debut` : il montait
# avec vos versements.
perf_or = S.twr_en_or_portefeuille(ctx)

d1, d2, d3 = st.columns(3)
d1.metric("En euros", ui.pct(perf_eur, signe=True))
d2.metric("En euros réels", ui.pct(perf_reel, signe=True) if perf_reel is not None else "—",
          help="Déflaté par l'inflation officielle.")
d3.metric("En onces d'or", ui.pct(perf_or, signe=True) if perf_or is not None else "—",
          help="L'étalon de Gave.")

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
          help="Tient compte de votre calendrier d'apports réel.")
c2.metric("Écart TWR / IRR",
          ui.points((taux_irr - twr_ann) * 100, 2) if taux_irr is not None else "—",
          help="Positif : vos apports ont été bien placés. Négatif : vous avez "
               "alimenté le portefeuille au mauvais moment.")

# ---------------------------------------------------------------------------
# Par année
# ---------------------------------------------------------------------------
st.divider()
st.subheader("Par année")

snaps["Annee"] = snaps["Date"].dt.year

# Le rendement de chaque sous-période, corrigé des flux. `rendements_periode`
# renvoie n-1 valeurs pour n valeurs : la i-ème est le rendement qui MÈNE à la
# ligne i. On la range donc dans la ligne d'arrivée.
snaps["Rendement"] = [0.0] + metrics.rendements_periode(valeurs, flux)

# Rendement de chaque annee = chainage des sous-periodes qui se terminent
# dans cette annee. C'est la definition standard, et la seule qui neutralise
# les apports. Le calcul precedent faisait `derniere / premiere - 1` : il
# comptait vos versements comme du rendement.
rendements_annuels = metrics.twr_par_annee(
    [d.date() for d in snaps["Date"]], snaps["Rendement"].tolist()
)

lignes = []
for annee, perf in rendements_annuels.items():
    infl = inflation.get(annee)
    reel = (1 + perf) / (1 + infl) - 1.0 if infl is not None else None
    lignes.append({
        "Année": int(annee),
        "Performance": ui.pct(perf, signe=True),
        "Inflation": ui.pct(infl, signe=True) if infl is not None else "⚠️ non renseignée",
        "Réelle": ui.pct(reel, signe=True) if reel is not None else "—",
    })

if lignes:
    ui.tableau(pd.DataFrame(lignes))

    annees_sans_inflation = [
        a for a in sorted({int(x) for x in snaps["Annee"]}) if a not in inflation
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
