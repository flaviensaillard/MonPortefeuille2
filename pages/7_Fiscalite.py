"""Fiscalité.

CORRECTIONS PAR RAPPORT À LA V1
-------------------------------
1. **Un seul jeu de barèmes pour tous les exercices.** La v1 lisait
   `st.session_state.config` et appliquait les mêmes seuils à une plus-value de
   2025 et à une de 2026. Ici, le barème est choisi par **année de cession**.

2. **L'endpoint `api.gouv.fr/impots/bareme/{year}` n'existe pas.** Le `try`
   échouait en silence et l'app retombait sur sa table interne en annonçant une
   fiabilité « Officielle ». Ici, les barèmes sont une table datée et sourcée, et
   la fiabilité affichée est honnête.

3. **L'or ETC et l'or physique étaient confondus.** Tout partait au régime des
   valeurs mobilières. L'article 150 VI (or physique : TFMP 11,5 % du brut, ou PV
   dégressive avec exonération à 22 ans) est désormais calculé.

4. **L'abattement de 305 € sur la plus-value crypto manquait.**

5. **La comparaison PFU / barème abdiquait** (« Col F/G (Abattement) : À calculer »)
   et oubliait la CSG déductible de 6,8 %.
"""

from __future__ import annotations

import datetime as dt

import pandas as pd
import streamlit as st

from core import fiscal_bars as fb
from core import session as S, tax
from core import dates
from core import ui
from core.models import Classe

st.set_page_config(page_title="Fiscalité", page_icon="🏛️", layout="wide")
st.title("🏛️ Fiscalité")

ctx = S.charger()
for err in ctx.erreurs:
    st.error(err)
if ctx.erreurs:
    st.stop()

# ---------------------------------------------------------------------------
# Identité fiscale
# ---------------------------------------------------------------------------
with st.expander("👤 Identité fiscale", expanded=True):
    c1, c2, c3 = st.columns(3)
    statut = c1.selectbox(
        "Statut", ["Marié(e) / Pacsé(e)", "Célibataire", "Veuf(ve)", "Divorcé(e)"],
    )
    parts = c2.number_input(
        "Parts fiscales", min_value=0.5, max_value=6.0, step=0.5, value=3.0,
        help="Couple = 2. +0,5 pour le 1er enfant, +0,5 pour le 2e, +1 du 3e.",
    )
    autres_revenus = c3.number_input(
        "Autres revenus imposables (€)", min_value=0.0, step=1000.0, value=0.0,
        help="Salaires et autres revenus, hors plus-values de l'année choisie.",
    )

annee = st.selectbox(
    "Année d'imposition", options=list(range(dt.date.today().year, 2021, -1)),
    help="Le barème retenu est celui de cette année, pas celui d'aujourd'hui.",
)

st.caption(f"Barème {annee} — source : {fb.source_de(annee)}")

# ---------------------------------------------------------------------------
# Reconstituer les cessions de l'année depuis les transactions
# ---------------------------------------------------------------------------
cessions = tax.cessions_de_lannee(ctx.transactions, ctx.positions, annee)


if not any(cessions.values()):
    st.info(
        f"Aucune cession enregistrée en {annee}. La page liste les plus-values "
        "réalisées, pas les plus-values latentes."
    )
    st.stop()

# ---------------------------------------------------------------------------
# Calcul par régime
# ---------------------------------------------------------------------------
anomalies: list[str] = []
resultat = tax.calculer(cessions, annee, autres_revenus, parts, statut, anomalies)

if anomalies:
    st.warning(
        "**Calcul incomplet.** " + " ".join(anomalies) +
        " Le chiffre affiché ne porte donc pas sur toutes vos cessions."
    )

st.divider()
st.subheader(f"Résultat pour {annee}")

for r in resultat["regimes"]:
    with st.container():
        st.markdown(f"#### Régime {r['regime']}")
        c1, c2, c3 = st.columns(3)
        c1.metric("Plus-value brute", ui.eur(r.get("pv_brute", 0.0)))
        if "abattement" in r:
            c2.metric("Abattement", ui.eur(r["abattement"]),
                      help="305 € pour les actifs numériques (art. 150 VH bis).")
        else:
            c2.metric("Cessions", r.get("nb_cessions", 0))
        c3.metric("Impôt dû", ui.eur(r.get("total_du", 0.0)))
        st.caption(f"Taux effectif : {ui.pct(r.get('taux_effectif', 0.0))} — {r.get('detail', '')}")
        st.divider()

# ---------------------------------------------------------------------------
# Choix PFU / barème
# ---------------------------------------------------------------------------
if "comparaison" in resultat:
    comp = resultat["comparaison"]
    st.subheader("PFU ou barème progressif ?")

    c1, c2 = st.columns(2)
    with c1:
        st.markdown("**Flat Tax (PFU)**")
        st.metric("IR (12,8 %)", ui.eur(comp["pfu"]["ir"]))
        st.metric("Prélèvements sociaux (17,2 %)", ui.eur(comp["pfu"]["ps"]))
        st.metric("Total", ui.eur(comp["pfu"]["total"]))
    with c2:
        st.markdown("**Barème progressif**")
        st.metric("IR marginal", ui.eur(comp["bareme"]["ir_marginal"]))
        st.metric("Prélèvements sociaux", ui.eur(comp["bareme"]["ps"]))
        st.metric("CSG déductible", ui.eur(-comp["bareme"]["csg_deductible"]),
                  help="6,8 % de la CSG viennent en déduction du revenu imposable.")
        st.metric("Total", ui.eur(comp["bareme"]["total"]))

    if comp["choix"] == "Barème progressif":
        st.success(
            f"✅ **Le barème progressif est plus avantageux** — vous économisez "
            f"{ui.eur(comp['gain'])}. TMI retenue : {ui.pct(comp['tmi'])}."
        )
    else:
        st.success(
            f"✅ **La Flat Tax est plus avantageuse** — vous économisez "
            f"{ui.eur(comp['gain'])}."
        )

    st.info(
        "L'option est **globale et annuelle** : elle porte sur l'ensemble des "
        "plus-values et gains de l'année, et se choisit au moment de la déclaration. "
        "Ce calcul ne concerne que les plus-values de valeurs mobilières et d'actifs "
        "numériques."
    )

# ---------------------------------------------------------------------------
# Détail des cessions
# ---------------------------------------------------------------------------
st.divider()
st.subheader("Détail des cessions")

lignes = []
for classe, lst in cessions.items():
    for l in lst:
        pv = l["prix_cession_eur"] - l["pru_eur"] * l["quantite"]
        lignes.append({
            "Actif": l["actif"],
            "Classe": classe.value.replace("_", " "),
            "Régime": fb.REGIMES_FISCAUX.get(classe, "—") if hasattr(fb, "REGIMES_FISCAUX") else "—",
            "Date": l["date"].strftime("%d/%m/%Y"),
            "Quantité": f"{l['quantite']:,.4f}".replace(",", " "),
            "PRU (€)": ui.eur(l["pru_eur"]),
            "Prix de cession (€)": ui.eur(l["prix_cession_eur"]),
            "Plus-value (€)": ui.eur(pv),
        })

if lignes:
    ui.tableau(pd.DataFrame(lignes))
    total_pv = sum(
        l["prix_cession_eur"] - l["pru_eur"] * l["quantite"]
        for lst in cessions.values() for l in lst
    )
    st.metric("Plus-value totale de l'année", ui.eur(total_pv))

# ---------------------------------------------------------------------------
# Avertissement
# ---------------------------------------------------------------------------
st.divider()
st.warning(
    "**Ce module produit une estimation, pas une déclaration.** Les taux et seuils "
    "proviennent de sources publiques concordantes ; seule la documentation "
    "administrative (BOFiP) fait foi. Les points à recouper avant déclaration :\n"
    "- le barème et la décote de l'année ;\n"
    "- le plafonnement du quotient familial ;\n"
    "- la qualification fiscale exacte d'un ETC or (IGLN.L) ;\n"
    "- le barème d'abattement de l'or physique."
)

# ---------------------------------------------------------------------------
# Alertes fiscales — ce que la v1 ne faisait pas
# ---------------------------------------------------------------------------
st.divider()
st.subheader("🔔 Points de vigilance")

vigilance = []

if not ctx.snapshots.empty:
    snaps = ctx.snapshots.copy()
    snaps["Date"] = dates.parser(snaps["Date"])
    snaps = snaps.dropna(subset=["Date"]).sort_values("Date")
    if len(snaps) >= 2:
        jours = (snaps["Date"].iloc[-1] - snaps["Date"].iloc[0]).days
        if jours > 0:
            gain = float(snaps["patrimoine_investi_eur"].iloc[-1]) - \
                float(snaps["patrimoine_investi_eur"].iloc[0])
            if gain > 0:
                vigilance.append(
                    f"**PFU vs barème** : votre plus-value latente atteint "
                    f"{ui.eur(gain)}. Au PFU (30,8 %), une cession totale coûterait "
                    f"{ui.eur(gain * 0.308)}. Étaler les cessions sur plusieurs "
                    "exercices peut réduire la note — ou l'inverse selon votre TMI."
                )

annees_restantes = 22 - ((dt.date.today() - dt.date(2025, 3, 18)).days / 365.25)
if annees_restantes > 0:
    vigilance.append(
        f"**Or physique** : si vous déteniez votre or sous forme physique depuis "
        f"mars 2025, l'exonération totale interviendrait dans environ "
        f"{annees_restantes:.0f} ans. Votre ETC (IGLN.L) n'y a pas droit — c'est "
        "une différence de régime, pas de durée."
    )

if classe_de("BTCUSDT") == Classe.CRYPTO and any(
    c == Classe.CRYPTO for c in cessions
):
    vigilance.append(
        "**Crypto** : l'abattement de 305 € s'applique à la plus-value globale "
        "annuelle, pas cession par cession. Pensez à regrouper vos déclarations."
    )

for v in vigilance:
    st.info(v)

if not vigilance:
    st.caption("Aucun point de vigilance particulier pour l'instant.")
