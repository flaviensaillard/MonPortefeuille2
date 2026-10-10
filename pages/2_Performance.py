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


import importlib
import pandas as pd
import streamlit as st

from core import db, metrics, models, session as S
from core import dates
from core import ui

if not hasattr(ui, "_NAV_V2") or not hasattr(ui, "metric_pct") or not hasattr(ui, "metric_points") or not hasattr(models, "verifier_allocation_cible") or not hasattr(db, "lire_allocation_personnalisee"):
    importlib.reload(models)
    importlib.reload(db)
    importlib.reload(ui)
    importlib.reload(S)

st.set_page_config(page_title="Performance", page_icon="📈", layout="wide")
ui.styliser_navigation()
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

# Série en DOLLARS ($) issue de `session.serie_performance(ctx)` :
# utilise `Actifs Stratégiques` et les variations de `Capital investi` de
# `Projections` (puis `flux_par_date` pour toute période postérieure).
snaps, valeurs, flux, valorisations = S.serie_performance(ctx)
if len(valeurs) < 2:
    st.info("Il faut au moins deux snapshots exploitables pour calculer une performance.")
    st.stop()

# 2.1.0 (revue F-07) : TWR EXACT. Chaque flux doit être encadré par une
# valorisation juste avant lui ; un intervalle dont le flux n'est pas
# valorisé n'est PAS calculé — il est annoncé plus bas, jamais remplacé par
# la convention « flux en fin de période ».
dates_serie = [d.date() for d in snaps["Date"]]
flux_jour = S.flux_par_date(ctx.apports, snaps.attrs.get("col_ap", "montant_eur"))
rendements_stricts, non_calcules = metrics.rendements_stricts(
    dates_serie, valeurs, flux_jour, valorisations
)
# 2.2.0 (constat A2) : le TWR GLOBAL n'est affiché que si TOUS les intervalles
# sont calculés. Un chaînage partiel n'est jamais présenté comme un total.
twr_total, _ = metrics.twr_exact(dates_serie, valeurs, flux_jour, valorisations)
# Rendements de sous-période calculés : servent à la VOLATILITÉ (statistique sur
# les intervalles mesurés), jamais à un total.
rendements = [r for r in rendements_stricts if r is not None]

jours = (snaps["Date"].iloc[-1] - snaps["Date"].iloc[0]).days
jours_calcules = sum(
    (dates_serie[i + 1] - dates_serie[i]).days
    for i, r in enumerate(rendements_stricts) if r is not None
)
twr_ann = (
    metrics.annualiser(twr_total, (dates_serie[-1] - dates_serie[0]).days)
    if (twr_total is not None and (dates_serie[-1] - dates_serie[0]).days > 0)
    else None
)

if non_calcules:
    st.error(
        f"**TWR global non calculé** : {len(non_calcules)} intervalle(s) ne sont "
        "pas calculables, et un total partiel ne serait pas un total."
    )
    for nc in non_calcules:
        st.warning(
            f"Intervalle du {nc['de']:%d/%m/%Y} au {nc['a']:%d/%m/%Y} "
            f"(flux {nc['flux']:+,.2f}) : {nc.get('raison', '')}."
        )
    st.caption(
        "Depuis la 2.2.0, la valorisation manquante est reconstruite depuis le "
        "snapshot précédent lorsqu'il existe. Ici, aucun snapshot antérieur ne "
        "permet de la déterminer."
    )

# 2.2.0 (constat A1) : une valorisation reconstruite (snapshot précédent) n'est
# pas une mesure : elle est signalée avec ses dates.
_reconstruits = sorted(
    f for f, e in (snaps.attrs.get("valorisations_detail") or {}).items()
    if e.get("origine") == "reconstruite"
)
if _reconstruits:
    st.info(
        f"{len(_reconstruits)} apport(s) valorisé(s) par le snapshot précédent "
        "(valeur reconstruite, approximation : portefeuille supposé inchangé entre "
        "ce snapshot et l'apport) : " + ", ".join(
            f"{f:%d/%m/%Y}" for f in _reconstruits
        ) + "."
    )

# ---------------------------------------------------------------------------
# Le TWR n'est juste que si les flux sont enregistrés
# ---------------------------------------------------------------------------
# Un TWR neutralise les versements — à condition de les connaître. Quand aucun
# apport n'est enregistré, le calcul se réduit à « fin / début » et l'épargne
# apparaît comme du rendement. On ne peut pas savoir qu'un versement a été
# oublié, mais on peut repérer le cas où c'est le plus probable, et le dire.
for alerte in metrics.controle_apports(valeurs, flux, jours, devise="$"):
    st.error("⚠️ " + alerte)

# --- Les sauts non expliqués, jour par jour ---
# DÉFAUT QUI A PRODUIT +26,2 % AU LIEU DE +4,10 %.
#
# Le 02/02/2026, la valeur investie passe de 55 639,93 € à 64 808,82 € alors que
# 200 € de flux sont enregistrés ce jour-là. Le TWR compte les 9 169 € restants
# comme du rendement : +16,5 % en une séance sur un portefeuille de quatre ETF.
#
# Le contrôle ci-dessus ne pouvait pas l'attraper : il ne se déclenche que
# lorsqu'AUCUN flux n'existe sur la période. Ici il y en a 38 — sur d'autres
# jours. Le trou est localisé, pas global.
sauts = metrics.sauts_non_expliques(
    [d.date() for d in snaps["Date"]], valeurs, flux
)

if sauts:
    st.divider()
    st.subheader("⚠️ Mouvements sans flux enregistré")
    st.caption(
        "Ces mouvements ne sont pas de la performance. Le chiffre plus haut les "
        "compte comme telle, donc il est trop flatteur. Corrigez-les, et il "
        "deviendra juste."
    )

    for saut in sauts:
        st.error(metrics.anomalie_saut(saut, devise="$"))

    flux_corrige = metrics.flux_corrige_des_sauts(flux, sauts)
    rendements_corriges = metrics.rendements_periode(valeurs, flux_corrige)
    twr_corrige = metrics.twr(rendements_corriges)
    twr_brut_legacy = metrics.twr(metrics.rendements_periode(valeurs, flux))

    c1, c2 = st.columns(2)
    c1.metric("Estimation avec les sauts comptés tels quels",
              ui.pct(twr_brut_legacy, signe=True),
              help="Diagnostic : convention d'origine, à titre de comparaison seulement.")
    c2.metric("Estimation une fois ces mouvements enregistrés",
              ui.pct(twr_corrige, signe=True),
              delta=ui.points((twr_corrige - twr_brut_legacy) * 100, 2),
              help="Ce que vous auriez gagné si ces mouvements avaient été "
                   "saisis comme des apports.")

    st.info(
        "**Comment corriger.** Chaque saut est un mouvement réel qui n'a pas "
        "été saisi : un virement depuis le livret CHF, une position ajoutée à "
        "la main, ou un versement oublié. Déclarez-le comme un **apport** à sa "
        "date dans **💼 Portefeuille & Opérations (onglet 💰 3. Fonds & Comptes de liquidités)**, et le chiffre se corrige tout seul. "
        "Pour ce portefeuille, c'est environ **"
        f"{ui.usd_eur(sum(s['residuel'] for s in sauts))}** à répartir sur "
        f"{len(sauts)} date(s)."
    )

# --- Les flux que la valeur n'a pas suivis ---
# Le miroir exact du bloc ci-dessus : là, la valeur montait sans flux ; ici, un
# flux est enregistré et la valeur ne suit pas. Le cas réel trouvé dans
# l'historique v1 : un apport de 10 800 € le 29/04/2024, et une valeur qui
# augmente de 23 € ce mois-là. Sans ce contrôle, 2024 s'affiche à −24,9 %.
fantomes = metrics.fluxs_sans_effet(
    [d.date() for d in snaps["Date"]], valeurs, flux
)

if fantomes:
    st.divider()
    st.subheader("⚠️ Apports que la valeur n'a pas suivis")
    st.caption(
        "Un versement est enregistré, mais la valeur du portefeuille ne bouge "
        "pas d'autant. C'est l'inverse du cas précédent, et le résultat est le "
        "même : le chiffre plus haut est faux."
    )

    for f in fantomes:
        st.error(metrics.anomalie_flux_sans_effet(f, devise="$"))

        # Nommer les versements de la période. Sans ça, le message donne un
        # montant et deux bornes, et il faut aller chercher soi-même : sur le cas
        # réel, la ligne fautive est datée du 29/04/2024 quand la période se
        # termine le 30/04. Autant la montrer.
        debut_p = f.get("date_avant")
        fin_p = f.get("date")
        if debut_p is not None and fin_p is not None and not ctx.apports.empty:
            ap = ctx.apports.copy()
            ap["_d"] = dates.parser(ap["date"])
            dedans = ap[(ap["_d"].dt.date > debut_p) & (ap["_d"].dt.date <= fin_p)]
            if not dedans.empty:
                detail = " · ".join(
                    f"**{ui.jour(r['_d'])}** — "
                    f"{'apport' if str(r['sens']).lower().startswith('app') else 'retrait'} "
                    f"de {ui.usd_eur(float(r['montant_usd']) if pd.notna(r.get('montant_usd')) else (float(r['montant_eur']) * ctx.taux_eur_usd if ctx.taux_eur_usd else None), float(r['montant_eur']))}"
                    for _, r in dedans.sort_values("_d").iterrows()
                )
                st.caption(f"Versements enregistrés sur cette période : {detail}")

    st.info(
        "**Deux causes possibles, et une seule est dans vos données.** Soit le "
        "versement n'a jamais eu lieu — une ligne saisie deux fois, ou une date "
        "erronée —, soit il a eu lieu, mais la valorisation de ce mois-là a été "
        "oubliée. Regardez votre relevé à cette date : la réponse y est en "
        "trente secondes. C'est la seule chose que je ne peux pas deviner."
    )

with st.expander("🔍 Traçabilité — ce sur quoi porte ce calcul", expanded=False):
    t1, t2, t3, t4 = st.columns(4)
    t1.metric("Snapshots", len(snaps))
    t2.metric("Période", f"{(jours / 365.25):.1f} ans")
    cap_total = (
        float(snaps["capital_investi_usd"].dropna().iloc[-1])
        if "capital_investi_usd" in snaps.columns and snaps["capital_investi_usd"].notna().any()
        else sum(abs(f) for f in flux)
    )
    ui.metric_usd_eur(t3, "Capital investi", cap_total)
    annees_couvertes = sorted({int(a) for a in snaps["Date"].dt.year})
    inflation_dict = S.inflation_dict(ctx)
    manquantes = [a for a in annees_couvertes if a not in inflation_dict]
    t4.metric("Inflation connue", f"{len(annees_couvertes) - len(manquantes)}/{len(annees_couvertes)} ans")

    if not ctx.apports.empty:
        st.caption(
            f"{len(ctx.apports)} ligne(s) dans pf2_apports, "
            f"du {dates.parser(ctx.apports['date']).min().date()} "
            f"au {dates.parser(ctx.apports['date']).max().date()}."
        )
    else:
        st.caption(
            "**pf2_apports est vide.** Le TWR ne peut pas corriger vos "
            "versements : il les compte comme du rendement. C'est la cause la "
            "plus fréquente d'un chiffre trop flatteur."
        )
        st.caption(
            "Lancez « Import des données v1 » (onglet Actions) avec "
            "`dry_run = false`, puis « Diagnostic » pour vérifier."
        )

# ---------------------------------------------------------------------------
# Indicateurs principaux
# ---------------------------------------------------------------------------
st.subheader("Ce que la stratégie a produit")

c1, c2, c3 = st.columns(3)
ui.metric_pct(
    c1, "TWR cumulé ($)", twr_total,
    help="Time-Weighted Return en dollars ($) : neutralise l'effet de vos apports.",
)
ui.metric_pct(
    c2, "TWR annualisé ($)", twr_ann,
    help=f"Sur {jours} jours ({jours / 365.25:.1f} ans).",
)
periodicite_estimee = max(1, round(len(rendements) * 365.25 / max(jours, 1)))
c3.metric("Volatilité annualisée", ui.pct(metrics.volatilite(rendements, periodicite=periodicite_estimee), decimales=2),
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

# 1. En dollars ($).
perf_usd = twr_total

# 2. En pouvoir d'achat réel (hors inflation).
inflation = S.inflation_dict(ctx)
d0, d1 = snaps["Date"].iloc[0].date(), snaps["Date"].iloc[-1].date()
infl_periode = metrics.inflation_cumulee(inflation, d0, d1)
perf_reel = (1.0 + perf_usd) / infl_periode - 1.0 if (perf_usd is not None and infl_periode > 0) else None

# 3. En onces d'or — corrigée des apports, comme les deux autres lectures.
perf_or = S.twr_en_or_portefeuille(ctx)

d1, d2, d3 = st.columns(3)
ui.metric_pct(d1, "En dollars ($)", perf_usd)
ui.metric_pct(
    d2, "Hors inflation (réelle)", perf_reel,
    help="Déflaté par l'inflation officielle.",
)
ui.metric_pct(
    d3, "En onces d'or", perf_or,
    help="L'étalon de Gave.",
)

if perf_or is not None and perf_usd is not None and perf_or < perf_usd:
    st.warning(
        f"Votre portefeuille a gagné {ui.pct(perf_usd, decimales=2, signe=True)} en dollars mais "
        f"**{ui.pct(perf_or, decimales=2, signe=True)} en or**. La monnaie a fait le travail à "
        "votre place : en étalon de valeur réel, vous avez moins gagné qu'en nominal."
    )

# ---------------------------------------------------------------------------
# Rendement pondéré par les flux
# ---------------------------------------------------------------------------
st.divider()
st.subheader("Ce que vous, personnellement, avez gagné")

flux_irr = [(snaps["Date"].iloc[0].date(), -valeurs[0])]
for i in range(1, len(valeurs)):
    if abs(flux[i]) > 1e-6:
        flux_irr.append((snaps["Date"].iloc[i].date(), -flux[i]))
flux_irr.append((snaps["Date"].iloc[-1].date(), valeurs[-1]))

taux_irr = metrics.irr(flux_irr)
c1, c2 = st.columns(2)
ui.metric_pct(
    c1, "IRR (rendement pondéré)", taux_irr,
    help="Tient compte de votre calendrier d'apports réel.",
)
ui.metric_points(
    c2, "Écart TWR / IRR",
    (taux_irr - twr_ann) * 100 if (taux_irr is not None and twr_ann is not None) else None,
    decimales=2,
    help="Positif : vos apports ont été bien placés. Négatif : vous avez "
         "alimenté le portefeuille au mauvais moment.",
)

# ---------------------------------------------------------------------------
# Par année
# ---------------------------------------------------------------------------
st.divider()
st.subheader("Par année")

snaps["Annee"] = snaps["Date"].dt.year

# Le rendement EXACT de chaque sous-période (2.1.0, revue F-07) : None quand
# un flux de l'intervalle n'est pas valorisé — le point n'est pas calculé, il
# est annoncé, jamais remplacé par une convention de fin de période.
snaps["Rendement"] = [None] + rendements_stricts

# Rendement de chaque année = chaînage des sous-périodes exactes qui se
# terminent dans cette année. Une année qui contient un intervalle non
# calculé n'est PAS chaînée à moitié : elle est affichée « — » et signalée.
rendements_annuels = {}
annees_incompletes = set()
for i, r in enumerate(rendements_stricts):
    an = dates_serie[i + 1].year
    if an not in rendements_annuels:
        rendements_annuels[an] = None
    if r is None:
        annees_incompletes.add(an)
        rendements_annuels[an] = None
        continue
    prec = rendements_annuels[an]
    rendements_annuels[an] = r if prec is None else (1.0 + prec) * (1.0 + r) - 1.0

snaps["_val_usd"] = valeurs
bilan_par_annee = snaps.groupby("Annee").last()

lignes = []
for annee, perf in rendements_annuels.items():
    incomplet = annee in annees_incompletes
    infl = inflation.get(annee)
    reel = (1 + perf) / (1 + infl) - 1.0 if (perf is not None and infl is not None) else None
    val_fin_u = float(bilan_par_annee.loc[annee, "_val_usd"]) if annee in bilan_par_annee.index else None
    val_fin_e = (
        float(bilan_par_annee.loc[annee, "patrimoine_investi_eur"])
        if (annee in bilan_par_annee.index and "patrimoine_investi_eur" in bilan_par_annee.columns and pd.notna(bilan_par_annee.loc[annee, "patrimoine_investi_eur"]))
        else None
    )
    lignes.append({
        "Année": int(annee),
        "Performance ($)": (ui.pct(perf, decimales=2, signe=True) if perf is not None
                            else ("—" + (" ⚠️" if incomplet else ""))),
        "Inflation": ui.pct(infl, decimales=2, signe=True) if infl is not None else "⚠️ non renseignée",
        "Réelle": ui.pct(reel, decimales=2, signe=True) if reel is not None else "—",
        "Valeur bilan ($ / €)": ui.usd_eur(val_fin_u, val_fin_e) if val_fin_u is not None else "—",
    })

if lignes:
    ui.tableau(pd.DataFrame(lignes))
    st.caption(
        "Performances calculées en **dollars ($)** (hors effet de change EUR/USD), "
        "avec indication de la valeur bilan en euros."
    )
    if annees_incompletes:
        st.caption(
            "⚠️ Année(s) « — » : " + ", ".join(str(a) for a in sorted(annees_incompletes))
            + ". Un apport ou un retrait y est survenu sans valorisation du "
            "portefeuille à ce moment-là : le rendement exact de l'année ne peut "
            "pas être calculé (revue F-07). Aucun chiffre de remplacement n'est "
            "inventé ; les autres années restent exactes."
        )

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
