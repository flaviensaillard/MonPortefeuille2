"""MonPortefeuille 2 — Tableau de bord.

Ce que cette page corrige par rapport à la v1 :

- La **performance est donnée en onces d'or**, pas seulement en devises fiduciaires.
  C'est l'étalon de Gave : « l'or montera tant que les monnaies ne redeviendront pas des
  réserves de valeur ».

- L'**épargne de précaution est affichée séparément** du portefeuille investi, tandis
  que le **cash disponible (compte courant en $)** est intégré à l'assiette de
  rééquilibrage pour être réinvesti vers les poches sous-pondérées.

- Un **graphique de progression interactif** permet de suivre l'évolution en temps réel
  (par défaut en **progression journalière**, ou mensuelle, depuis le début du mois,
  depuis le début de l'année, depuis l'origine, ou sur une période choisie).
"""

from __future__ import annotations

import datetime as dt

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import importlib
from core import db, metrics, prices, rebalance
from core import session as S
from core import ui

import inspect
if not hasattr(metrics, "calculer_rente_mensuelle_reelle") or not hasattr(db, "soldes_comptes_liquidites") or not hasattr(S, "progression_periode") or "signe" not in inspect.signature(ui.metric_usd_eur).parameters:
    importlib.reload(db)
    importlib.reload(metrics)
    importlib.reload(rebalance)
    importlib.reload(ui)
    importlib.reload(S)

st.set_page_config(page_title="Mon Portefeuille", page_icon="📊", layout="wide")

st.title("📊 Tableau de bord")

col_titre, col_rafraichir = st.columns([5, 1])
with col_rafraichir:
    if st.button("🔄 Rafraîchir", width="stretch",
                 help="Relecture depuis Supabase. À utiliser après un import ou un mouvement."):
        S.vider_cache()
        st.rerun()

ctx = S.charger()

if ctx.importe_le:
    st.caption(f"Données importées le {ctx.importe_le[:16].replace('T', ' ')} — "
               f"si cette date est antérieure à votre dernier import, "
               f"cliquez sur 🔄 Rafraîchir.")

for err in ctx.erreurs:
    st.error(err)

ui.appareil({"tables": not ctx.tables_absentes})
ui.bandeau_erreurs(ctx.echecs_cours, "cours")
ui.bandeau_erreurs(ctx.echecs_fx, "taux de change")

if ctx.anomalies_transactions:
    tickers_concernes = sorted({
        mot for a in ctx.anomalies_transactions for mot in a.split()
        if any(mot == t.ticker for t in ctx.transactions)
    })
    with st.expander(
        f"⚠️ {len(ctx.anomalies_transactions)} transaction(s) incohérente(s) "
        f"dans vos données", expanded=True
    ):
        st.warning(
            "Ces lignes ont été ignorées dans le calcul des positions. "
            "Vos chiffres sont donc partiels — corrigez-les dans la v1 "
            "puis relancez l'import."
        )
        for a in ctx.anomalies_transactions:
            st.markdown(f"- {a}")

        if tickers_concernes:
            st.markdown("---")
            st.markdown(
                "**Ce que contient votre base pour ce(s) titre(s).** "
                "Une vente ne peut aboutir que si un achat la précède, et en "
                "quantité suffisante. Comparez les dates."
            )
            detail = pd.DataFrame([{
                "Ticker": t.ticker,
                "Sens": t.type,
                "Date": t.date.strftime("%d/%m/%Y"),
                "Quantité": t.quantite,
                "Cours": t.cours,
                "Devise": t.devise,
            } for t in sorted(
                (t for t in ctx.transactions if t.ticker in tickers_concernes),
                key=lambda t: (t.date, 0 if t.est_achat else 1),
            )])
            st.dataframe(detail, hide_index=True, width="stretch")

if ctx.erreurs:
    st.stop()

# ---------------------------------------------------------------------------
# Patrimoine
# ---------------------------------------------------------------------------
st.caption(f"Au {dt.date.today().strftime('%d/%m/%Y')}")

c1, c2, c3, c4 = st.columns(4)
ui.metric_usd_eur(
    c1, "Patrimoine total", ctx.patrimoine_total_usd, ctx.patrimoine_total_eur,
    help="Investi + épargne de précaution + compte courant.",
)
ui.metric_usd_eur(
    c2, "Portefeuille investi", ctx.total_investi_usd, ctx.total_investi_eur,
    help="Actifs stratégiques soumis à l'allocation cible.",
)
ui.metric_usd_eur(
    c3, "Épargne de précaution", ctx.total_precaution_usd, ctx.total_precaution_eur,
    help="Réserve CHF / CNY disponible en 5 minutes. Jamais rééquilibrée.",
)
ui.metric_usd_eur(
    c4, "Cash disponible (Compte courant)", ctx.total_courant_usd, ctx.total_courant_eur,
    help="Liquidités courantes ($) incluses dans l'assiette de rééquilibrage.",
)

# ---------------------------------------------------------------------------
# Progression & Évolution dynamique du portefeuille
# ---------------------------------------------------------------------------
st.divider()
st.subheader("📈 Progression & Évolution du portefeuille")

if not ctx.snapshots.empty:
    col_per, col_assiette = st.columns([3.5, 1.5])
    with col_per:
        mode_periode = st.radio(
            "Période d'analyse",
            options=[
                "Progression journalière",
                "Progression mensuelle",
                "Depuis le début du mois",
                "Depuis le début de l'année",
                "Depuis le début",
                "Période choisie",
            ],
            index=0,
            horizontal=True,
        )
    with col_assiette:
        perimetre_graphe = st.radio(
            "Périmètre",
            options=["Portefeuille investi", "Patrimoine total"],
            index=0,
            horizontal=True,
        )

    date_deb_sel = None
    date_fin_sel = None
    if mode_periode == "Période choisie":
        info_bornes = S.progression_periode(ctx, "Depuis le début", perimetre_graphe)
        if not info_bornes.get("vide"):
            d_min = info_bornes["d_min"]
            d_max = info_bornes["d_max"]
            d_def_debut = max(d_min, d_max - dt.timedelta(days=30))
            cd1, cd2 = st.columns(2)
            date_deb_sel = cd1.date_input("Du", value=d_def_debut, min_value=d_min, max_value=d_max)
            date_fin_sel = cd2.date_input("Au", value=d_max, min_value=d_min, max_value=d_max)

    prog = S.progression_periode(
        ctx,
        mode_periode=mode_periode,
        perimetre=perimetre_graphe,
        date_deb=date_deb_sel,
        date_fin=date_fin_sel,
    )

    if not prog.get("vide"):
        st.caption(f"📌 **Période analysée :** {prog['label_periode']}")
        p1, p2, p3, p4 = st.columns(4)
        ui.metric_usd_eur(
            p1, f"Gain de marché ({mode_periode})", prog["gain_marche_usd"], prog["gain_marche_eur"],
            signe=True,
            help="Gain ou perte purement généré par le marché sur la période (hors apports/retraits).",
        )
        p2.metric(
            "Performance (TWR) sur la période",
            ui.pct(prog["twr_per"], decimales=2, signe=True),
            delta=f"Variation brute : {ui.pct(prog['pct_brut'], decimales=2, signe=True)}",
            help="Rendement pondéré par le temps (neutralise l'effet des apports).",
        )
        ui.metric_usd_eur(
            p3, "Variation totale de valeur", prog["delta_val_usd"], prog["delta_val_eur"],
            signe=True,
            help=f"Passage de {ui.usd(prog['v_debut_usd'])} à {ui.usd(prog['v_fin_usd'])} sur la période.",
        )
        ui.metric_usd_eur(
            p4, "Apports nets sur la période", prog["apports_periode_usd"], prog["apports_periode_eur"],
            signe=True,
            help="Total des apports moins les retraits enregistrés durant cette période.",
        )

        df_graphe = prog["df_graphe"]
        col_val_usd = prog["col_val_usd"]
        fig_prog = go.Figure()
        fig_prog.add_trace(go.Scatter(
            x=df_graphe["date_dt"],
            y=df_graphe[col_val_usd],
            name=f"{perimetre_graphe} ($)",
            mode="lines+markers" if len(df_graphe) <= 45 else "lines",
            line=dict(color="#58a6ff", width=2.8),
            fill="tozeroy",
            fillcolor="rgba(88, 166, 255, 0.10)",
            hovertemplate="%{x|%d/%m/%Y}<br><b>$ %{y:,.2f}</b><extra></extra>",
        ))
        if "capital_investi_usd" in df_graphe.columns and perimetre_graphe == "Portefeuille investi":
            fig_prog.add_trace(go.Scatter(
                x=df_graphe["date_dt"],
                y=df_graphe["capital_investi_usd"],
                name="Capital investi cumulé ($)",
                mode="lines",
                line=dict(color="#8b949e", width=1.8, dash="dot"),
                hovertemplate="%{x|%d/%m/%Y}<br>Capital investi : $ %{y:,.2f}<extra></extra>",
            ))
        vals_y = pd.concat([
            df_graphe[col_val_usd].dropna(),
            df_graphe["capital_investi_usd"].dropna() if ("capital_investi_usd" in df_graphe.columns and perimetre_graphe == "Portefeuille investi") else pd.Series(dtype=float),
        ])
        y_min = float(vals_y.min()) * 0.96 if not vals_y.empty else 0.0
        y_max = float(vals_y.max()) * 1.03 if not vals_y.empty else 100.0
        fig_prog.update_layout(
            height=370,
            margin=dict(l=20, r=20, t=20, b=20),
            yaxis_title="Dollars ($)",
            yaxis=dict(range=[y_min, y_max], tickprefix="$ "),
            legend=dict(orientation="h", y=1.10),
            hovermode="x unified",
        )
        st.plotly_chart(fig_prog, width="stretch")
else:
    st.info("Aucun historique de snapshots disponible.")

# ---------------------------------------------------------------------------
# L'étalon de Gave
# ---------------------------------------------------------------------------
st.divider()
st.subheader("🪙 La mesure qui compte", help="Performance exprimée en onces d'or, l'étalon de valeur de Charles Gave.")

g1, g2, g3 = st.columns(3)
if ctx.cours_or:
    g1.metric("Cours de l'or", f"{ctx.cours_or:,.0f} $/oz",
              help=f"Contrat à terme {prices.TICKER_OR} (COMEX) : Yahoo ne fournit plus le spot.")
else:
    g1.metric("Cours de l'or", "—")

if ctx.equivalent_or_oz is not None:
    g2.metric("Portefeuille investi en or", f"{ctx.equivalent_or_oz:,.2f} oz",
              help="Combien d'onces d'or votre portefeuille investi achète aujourd'hui.")
else:
    g2.metric("Portefeuille investi en or", "—")

perf_or = None
if not ctx.snapshots.empty and "equivalent_or_oz" in ctx.snapshots.columns:
    perf_or = S.twr_en_or_portefeuille(ctx)

perf_usd = S.twr_portefeuille(ctx)
if perf_or is not None:
    g3.metric("Performance en or", ui.pct(perf_or, signe=True),
              delta=ui.pct(perf_usd, signe=True) if perf_usd is not None else None,
              help="Depuis le premier snapshot. Le delta compare à la performance en dollars ($).")
elif perf_usd is not None:
    g3.metric("Performance ($)", ui.pct(perf_usd, decimales=2, signe=True))
else:
    g3.metric("Performance", "—", help="Aucun snapshot enregistré.")

if perf_or is not None and perf_or < 0:
    st.info(
        f"💡 **Lecture de la performance en or ({ui.pct(perf_or, decimales=2, signe=True)}) :** "
        f"Depuis avril 2023, votre portefeuille a progressé de **{ui.pct(perf_usd, decimales=2, signe=True)} en dollars ($)**, "
        f"mais sur la même période l'once d'or a plus que doublé (**+103,9 %**, passant de ~1 986 $/oz à ~{ctx.cours_or:,.0f} $/oz). "
        f"Comme votre portefeuille est diversifié en 4 poches (et non investi à 100 % en or), sa valeur exprimée en onces d'or pures affiche "
        f"`(1 {perf_usd:+.4f}) / (1 + 1,039) − 1 = {ui.pct(perf_or, decimales=2, signe=True)}`."
        if (perf_usd is not None and ctx.cours_or) else
        f"**Performance relative face au 100 % Or : {ui.pct(perf_or, decimales=2, signe=True)}.**"
    )

# ---------------------------------------------------------------------------
# Allocation par poche (incluant le cash disponible du compte courant)
# ---------------------------------------------------------------------------
st.divider()
st.subheader("⚖️ Allocation par poche")
assiette_reeq_usd = ctx.total_investi_usd + ctx.total_courant_usd
assiette_reeq_eur = ctx.total_investi_eur + ctx.total_courant_eur
st.caption(
    f"Assiette de rééquilibrage (Portefeuille investi + Cash disponible en compte courant) : "
    f"**{ui.usd_eur(assiette_reeq_usd, assiette_reeq_eur)}** "
    f"(dont **{ui.usd_eur(ctx.total_courant_usd, ctx.total_courant_eur)}** de cash disponible prêt à être investi)."
)

lignes = []
for e in ctx.ecarts:
    lignes.append({
        "Poche": e.poche_nom,
        "Cible": ui.pct(e.poids_cible),
        "Réel": ui.pct(e.poids_reel),
        "Écart": ui.points(e.ecart_points),
        "Bande": f"±{e.bande * 100:.0f} pts",
        "Valeur ($ / €)": ui.usd_eur(e.valeur_usd, e.valeur_eur),
        "État": "🔴 hors bande" if e.hors_bande else "🟢 dans la bande",
    })

if lignes:
    df = ui.tableau(pd.DataFrame(lignes))

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
if ctx.total_precaution_usd > 0 or ctx.total_precaution_eur > 0:
    st.divider()
    st.subheader("🏦 Épargne de précaution")
    mois = 6
    pc1, pc2 = st.columns(2)
    ui.metric_usd_eur(
        pc1, "Disponible en 5 minutes", ctx.total_precaution_usd, ctx.total_precaution_eur,
    )
    ui.metric_usd_eur(
        pc2, f"Budget mensuel sur {mois} mois",
        ctx.total_precaution_usd / mois, ctx.total_precaution_eur / mois, decimales=0,
    )


# ---------------------------------------------------------------------------
# Rente mensuelle actuelle (si départ à la retraite aujourd'hui)
# ---------------------------------------------------------------------------
st.divider()
st.subheader(
    "🏖️ Rente mensuelle actuelle (si retraite aujourd'hui)",
    help="Calculée exactement sur le même principe que la page Retraite : on ne retire que le rendement réel au-dessus de l'inflation afin de préserver 100 % du pouvoir d'achat de votre capital, et l'impôt (PFU) ne frappe que la part de plus-value.",
)

# Capital investi + cash disponible et apports nets cumulés à ce jour
cap_retraite_auj_usd = ctx.total_investi_usd + ctx.total_courant_usd
apports_cum_auj_usd = cap_retraite_auj_usd
if not ctx.snapshots.empty and "capital_investi_usd" in ctx.snapshots.columns:
    s_cap = ctx.snapshots["capital_investi_usd"].dropna()
    s_cap_pos = s_cap[s_cap > 0]
    if not s_cap_pos.empty:
        apports_cum_auj_usd = float(s_cap_pos.iloc[-1])

cagr_hist = S.twr_annualise_portefeuille(ctx)
rend_hist = cagr_hist if (cagr_hist is not None and cagr_hist > 0) else 0.08
infl_ref = 0.02
taux_pfu_ref = 0.314  # PFU 31,4 % (12,8 % IR + 18,6 % PS)

rente_auj_hist = metrics.calculer_rente_mensuelle_reelle(
    capital_usd=cap_retraite_auj_usd,
    apports_cumules_usd=apports_cum_auj_usd,
    rendement_annuel=rend_hist,
    inflation_annuelle=infl_ref,
    taux_imposition_pv=taux_pfu_ref,
    taux_eur_usd=ctx.taux_eur_usd,
)
rente_auj_8pct = metrics.calculer_rente_mensuelle_reelle(
    capital_usd=cap_retraite_auj_usd,
    apports_cumules_usd=apports_cum_auj_usd,
    rendement_annuel=0.08,
    inflation_annuelle=infl_ref,
    taux_imposition_pv=taux_pfu_ref,
    taux_eur_usd=ctx.taux_eur_usd,
)

r1, r2, r3, r4 = st.columns(4)
ui.metric_usd_eur(
    r1,
    f"Rente nette / mois (Scénario A : {rend_hist*100:.1f} %/an)",
    rente_auj_hist["rente_nette_usd"],
    rente_auj_hist["rente_nette_eur"],
    help=f"Avec le rendement annualisé historique de votre portefeuille ({rend_hist*100:.2f} %/an), inflation {infl_ref*100:.1f} %/an (rendement réel {rente_auj_hist['rendement_reel']*100:.2f} %/an) et PFU {taux_pfu_ref*100:.1f} % sur la part de plus-value ({rente_auj_hist['part_pv']*100:.1f} %).",
)
ui.metric_usd_eur(
    r2,
    f"Rente brute / mois (Scénario A : {rend_hist*100:.1f} %/an)",
    rente_auj_hist["rente_brute_usd"],
    rente_auj_hist["rente_brute_eur"],
    help=f"Avant impôt sur la part de plus-value (impôt mensuel estimé : {ui.usd_eur(rente_auj_hist['impot_usd'], rente_auj_hist['impot_eur'])}).",
)
ui.metric_usd_eur(
    r3,
    "Rente nette / mois (Scénario B : 8,0 %/an)",
    rente_auj_8pct["rente_nette_usd"],
    rente_auj_8pct["rente_nette_eur"],
    help="Avec le scénario de référence à 8,0 %/an nominal et 2,0 %/an d'inflation (rendement réel 5,88 %/an), net de PFU sur la part de plus-value.",
)
ui.metric_usd_eur(
    r4,
    "Plus-value latente dans le capital",
    rente_auj_hist["plus_value_usd"],
    rente_auj_hist["plus_value_eur"],
    help=f"Part de plus-value dans chaque retrait : {ui.pct(rente_auj_hist['part_pv'])} (Capital : {ui.usd(cap_retraite_auj_usd)} − Apports : {ui.usd(apports_cum_auj_usd)}).",
)


# ---------------------------------------------------------------------------
# Suivi détaillé : Allocation dans le temps & Historique des snapshots
# ---------------------------------------------------------------------------
st.divider()
with st.expander("📋 Historique des snapshots & Évolution des poches dans le temps", expanded=False):
    if ctx.snapshots.empty:
        st.info("Aucun snapshot enregistré.")
    else:
        df_s = ctx.snapshots.copy()
        df_s["Date_DT"] = pd.to_datetime(df_s["date"], errors="coerce")
        df_s = df_s.dropna(subset=["Date_DT"]).sort_values("Date_DT")

        POCHES_HIST = {
            "poche_rv_eur": "Réserve de valeur",
            "poche_energie_eur": "Énergie",
            "poche_asie_eur": "Asie / Chine",
            "poche_jgb_eur": "Obligations japonaises",
        }
        presentes = [c for c in POCHES_HIST if c in df_s.columns and df_s[c].notna().any()]
        if len(presentes) >= 2:
            st.markdown("#### Évolution de la répartition par poche")
            import plotly.express as px
            part = df_s[presentes].div(df_s[presentes].sum(axis=1), axis=0).fillna(0.0) * 100.0
            part["Date"] = df_s["Date_DT"].values
            fig_poches = px.area(
                part,
                x="Date",
                y=presentes,
                labels={"value": "Part du portefeuille (%)", "variable": ""},
                color_discrete_map={
                    "poche_rv_eur": "#f1c40f",
                    "poche_energie_eur": "#e74c3c",
                    "poche_asie_eur": "#e67e22",
                    "poche_jgb_eur": "#3498db",
                },
            )
            fig_poches.for_each_trace(lambda t: t.update(name=POCHES_HIST.get(t.name, t.name)))
            fig_poches.update_layout(yaxis_ticksuffix=" %", height=320)
            st.plotly_chart(fig_poches, width="stretch")

        st.markdown(f"#### Journal complet des snapshots ({len(df_s)} relevés)")
        df_desc = df_s.sort_values("Date_DT", ascending=False)
        ui.tableau(pd.DataFrame([{
            "Date": r["Date_DT"].strftime("%d/%m/%Y"),
            "Capital investi ($ / €)": ui.usd_eur(r.get("capital_investi_usd"), r.get("capital_investi_eur"))
            if pd.notna(r.get("capital_investi_usd")) else "—",
            "Portefeuille investi ($ / €)": ui.usd_eur(
                r.get("valeur_investie_usd", r.get("patrimoine_investi_eur")),
                r.get("valeur_investie_eur", r.get("patrimoine_investi_eur")),
            ),
            "Patrimoine total ($ / €)": ui.usd_eur(
                r.get("patrimoine_total_usd", r.get("patrimoine_total_eur")),
                r.get("patrimoine_total_eur"),
            ),
            "Précaution ($ / €)": ui.usd_eur(
                r.get("precaution_usd", r.get("precaution_eur")),
                r.get("precaution_eur"),
            ),
            "Or (oz)": f"{float(r['equivalent_or_oz']):.2f}" if pd.notna(r.get("equivalent_or_oz")) else "—",
        } for _, r in df_desc.iterrows()]))
