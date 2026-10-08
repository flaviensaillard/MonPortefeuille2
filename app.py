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
from core import db, metrics, models, prices, rebalance
from core import session as S
from core import ui

if not hasattr(metrics, "calculer_rente_mensuelle_reelle") or not hasattr(db, "soldes_comptes_liquidites") or not hasattr(db, "lire_allocation_personnalisee") or not hasattr(models, "verifier_allocation_cible") or not hasattr(S, "progression_periode") or not hasattr(ui, "fleche_pct") or not hasattr(ui, "_NAV_V2"):
    importlib.reload(models)
    importlib.reload(prices)
    importlib.reload(db)
    importlib.reload(metrics)
    importlib.reload(rebalance)
    importlib.reload(ui)
    importlib.reload(S)

st.set_page_config(page_title="Tableau de bord", page_icon="📊", layout="wide")
ui.styliser_navigation()

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

perf_origine_usd = S.twr_portefeuille(ctx)
prog_origine = S.progression_periode(ctx, "Depuis le début", "Portefeuille investi") if not ctx.snapshots.empty else {"vide": True}
gain_origine_usd = prog_origine.get("gain_marche_usd", 0.0) if not prog_origine.get("vide") else 0.0
gain_origine_eur = prog_origine.get("gain_marche_eur", 0.0) if not prog_origine.get("vide") else 0.0

prog_dernier_inv = S.progression_periode(ctx, "Progression journalière", "Portefeuille investi") if not ctx.snapshots.empty else {"vide": True}
prog_dernier_tot = S.progression_periode(ctx, "Progression journalière", "Patrimoine total") if not ctx.snapshots.empty else {"vide": True}
delta_dernier_inv = (
    f"{ui.fleche_pct(prog_dernier_inv.get('twr_per', 0.0))} ({ui.usd(prog_dernier_inv.get('gain_marche_usd', 0.0), signe=True)}) depuis dernier enreg."
    if not prog_dernier_inv.get("vide") else None
)
delta_dernier_tot = (
    f"{ui.fleche_pct(prog_dernier_tot.get('twr_per', 0.0))} ({ui.usd(prog_dernier_tot.get('gain_marche_usd', 0.0), signe=True)}) depuis dernier enreg."
    if not prog_dernier_tot.get("vide") else None
)

c1, c2, c3, c4, c5 = st.columns(5)
ui.metric_usd_eur(
    c1, "Patrimoine total", ctx.patrimoine_total_usd, ctx.patrimoine_total_eur,
    delta=delta_dernier_tot,
    help="Investi + épargne de précaution + compte courant.",
)
ui.metric_usd_eur(
    c2, "Portefeuille investi", ctx.total_investi_usd, ctx.total_investi_eur,
    delta=delta_dernier_inv,
    help="Actifs stratégiques soumis à l'allocation cible. Variation en dollars depuis le dernier snapshot, change inclus ; elle peut différer de la variation en euros.",
)
ui.metric_pct(
    c3,
    "Performance depuis le début",
    perf_origine_usd,
    sous_texte_bleu=f"Gain : {ui.usd(gain_origine_usd, signe=True)} / {ui.eur(gain_origine_eur, signe=True)}" if not prog_origine.get("vide") else None,
    help="Performance cumulée (TWR) de votre portefeuille investi depuis le tout premier snapshot (avril 2023), corrigée des apports.",
)
ui.metric_usd_eur(
    c4, "Épargne de précaution", ctx.total_precaution_usd, ctx.total_precaution_eur,
    help="Réserve CHF / CNY disponible en 5 minutes. Jamais rééquilibrée.",
)
ui.metric_usd_eur(
    c5, "Cash disponible (Compte courant)", ctx.total_courant_usd, ctx.total_courant_eur,
    help="Liquidités courantes ($) incluses dans l'assiette de rééquilibrage.",
)

# ---------------------------------------------------------------------------
# Variation des actifs : celle du jour, comme le courtier (flèche ↗ / ↘ + %)
# ---------------------------------------------------------------------------
# Le pourcentage d'une ligne est le cours du moment comparé à la clôture
# précédente — exactement la « variation journalière » du courtier. Ce n'est pas
# la variation depuis le dernier enregistrement : celle-ci ne concerne que les
# tuiles de patrimoine, plus haut, et son repère y est écrit en toutes lettres.
actifs_investis_tb = [a for a in ctx.actifs if a.est_investi]
if actifs_investis_tb:
    st.divider()
    st.subheader("📌 Vos actifs — variation du jour (comme votre courtier)")
    cols_actifs = st.columns(len(actifs_investis_tb))
    for idx_ac, a in enumerate(actifs_investis_tb):
        var_a = a.variation_pct if a.variation_pct is not None else ctx.variations_actifs.get(a.ticker, 0.0)
        txt_fl = ui.fleche_pct(var_a, decimales=2)
        coul_fl = ui._couleur_variation(var_a)
        poche_obj = models.POCHES_PAR_CLE.get(a.poche)
        nom_poche = poche_obj.nom if poche_obj else a.poche
        cols_actifs[idx_ac].markdown(
            f"<div style='padding:10px 12px;border:1px solid rgba(250,250,250,0.12);border-radius:8px;background:rgba(17,24,39,0.35);margin-bottom:0.5rem;'>"
            f"<div style='font-size:0.82rem;color:rgba(250,250,250,0.75);font-weight:600;'>{a.ticker} · {nom_poche}</div>"
            f"<div style='font-size:1.45rem;font-weight:700;color:{coul_fl};line-height:1.25;margin:4px 0;'>{txt_fl}</div>"
            f"{ui.html_usd_eur(a.valeur_usd, a.valeur_eur, taille_usd='0.95rem', taille_eur='0.82rem')}"
            f"<div style='font-size:0.78rem;color:rgba(250,250,250,0.6);margin-top:3px;'>Cours : {a.prix:,.2f} {a.devise_cotation}</div>"
            f"</div>",
            unsafe_allow_html=True,
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
                "Depuis 1 an",
                "Depuis le début",
                "Période choisie",
            ],
            index=5,
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
        # Taux indisponible : les cartes montrent « — » des deux côtés (une valeur en
        # dollars seule ferait dériver l'euro du taux de remplacement de l'affichage).
        sans_taux = bool(prog.get("taux_indisponible"))
        p1, p2, p3, p4 = st.columns(4)
        ui.metric_usd_eur(
            p1, f"Gain de marché ({mode_periode})", None if sans_taux else prog["gain_marche_usd"], prog["gain_marche_eur"],
            signe=True,
            help="Gain ou perte purement généré par le marché sur la période (hors apports/retraits).",
        )
        ui.metric_pct(
            p2,
            "Performance (TWR) sur la période",
            prog["twr_per"],
            delta=f"Variation brute : {ui.pct(prog['pct_brut'], decimales=2, signe=True)}",
            help="Rendement pondéré par le temps sur la période sélectionnée (neutralise l'effet des apports).",
        )
        ui.metric_usd_eur(
            p3, "Variation totale de valeur", None if sans_taux else prog["delta_val_usd"], prog["delta_val_eur"],
            signe=True,
            help=f"Passage de {ui.usd(prog['v_debut_usd'])} à {ui.usd(prog['v_fin_usd'])} sur la période.",
        )
        ui.metric_usd_eur(
            p4, "Apports nets sur la période", None if sans_taux else prog["apports_periode_usd"], prog["apports_periode_eur"],
            signe=True,
            help="Total des apports moins les retraits enregistrés durant cette période.",
        )

        df_graphe = prog["df_graphe"]
        col_val_usd = prog["col_val_usd"]
        # Point sans taux : jamais un point inventé. On trace un trou (y vide) à sa date.
        x_courbe = list(df_graphe["date_dt"])
        y_courbe = list(df_graphe[col_val_usd])
        for d_trou in prog.get("dates_sans_taux", []):
            x_courbe.append(d_trou)
            y_courbe.append(None)
        if prog.get("dates_sans_taux"):
            ordre = sorted(range(len(x_courbe)), key=lambda i: x_courbe[i])
            x_courbe = [x_courbe[i] for i in ordre]
            y_courbe = [y_courbe[i] for i in ordre]
        if prog.get("taux_indisponible"):
            st.caption(
                "⚠️ taux indisponible : contre-valeurs en euros non calculées"
                + (f" ; {len(prog['dates_sans_taux'])} point(s) du graphique non tracé(s) (trou)."
                   if prog.get("dates_sans_taux") else ".")
            )
        fig_prog = go.Figure()
        fig_prog.add_trace(go.Scatter(
            x=x_courbe,
            y=y_courbe,
            name=f"{perimetre_graphe} ($)",
            mode="lines+markers" if len(df_graphe) <= 45 else "lines",
            line=dict(color=ui._couleur_variation(prog["gain_marche_usd"]), width=2.8),
            fill="tozeroy",
            fillcolor=(
                "rgba(46, 204, 113, 0.12)" if prog["gain_marche_usd"] > 1e-6
                else ("rgba(231, 76, 60, 0.12)" if prog["gain_marche_usd"] < -1e-6 else "rgba(56, 189, 248, 0.10)")
            ),
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
    elif prog.get("taux_indisponible"):
        st.warning("⚠️ taux indisponible : aucun point de cette période ne peut être tracé en dollars.")
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
    ui.metric_pct(
        g3, "Performance en or (depuis le début)", perf_or,
        delta=f"Portefeuille en $ : {ui.pct(perf_usd, decimales=2, signe=True)}" if perf_usd is not None else None,
        help="Depuis le premier snapshot. Le delta rappelle la performance de votre portefeuille en dollars ($).",
    )
elif perf_usd is not None:
    ui.metric_pct(g3, "Performance ($)", perf_usd)
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
etat_alloc_tb = getattr(ctx, "etat_allocation", None) or models.verifier_allocation_cible()
if etat_alloc_tb.get("depasse_100"):
    st.error(etat_alloc_tb["message"])
elif etat_alloc_tb.get("inferieur_100"):
    st.warning(etat_alloc_tb["message"])

assiette_reeq_usd = ctx.total_investi_usd + ctx.total_courant_usd
assiette_reeq_eur = ctx.total_investi_eur + ctx.total_courant_eur
st.caption(
    f"Assiette de rééquilibrage (Portefeuille investi + Cash disponible en compte courant) : "
    f"**{ui.usd_eur(assiette_reeq_usd, assiette_reeq_eur)}** "
    f"(dont **{ui.usd_eur(ctx.total_courant_usd, ctx.total_courant_eur)}** de cash disponible prêt à être investi)."
)

lignes = []
for e in ctx.ecarts:
    tot_p_u = sum(getattr(ac, "valeur_usd", ac.valeur_eur) for ac in e.actifs)
    var_poche = (
        sum(
            getattr(ac, "valeur_usd", ac.valeur_eur)
            * (ac.variation_pct if ac.variation_pct is not None else ctx.variations_actifs.get(ac.ticker, 0.0))
            for ac in e.actifs
        ) / tot_p_u
        if tot_p_u > 0 else None
    )
    lignes.append({
        "Poche": e.poche_nom,
        "Depuis dernier enreg.": ui.fleche_pct(var_poche) if var_poche is not None else "—",
        "Cible": ui.pct(e.poids_cible),
        "Réel": ui.pct(e.poids_reel),
        "Écart": ui.points(e.ecart_points),
        "Bande": f"±{e.bande * 100:.1f} pts".replace(".0 pts", " pts"),
        "Valeur ($ / €)": ui.usd_eur(e.valeur_usd, e.valeur_eur),
        "État": "🔴 hors bande" if e.hors_bande else "🟢 dans la bande",
    })

if lignes:
    df = ui.tableau(pd.DataFrame(lignes))

    hors = ctx.besoins_reequilibrage
    if hors:
        st.warning(
            f"**{len(hors)} poche(s) hors bande.** Voir l'onglet **💼 Portefeuille & Opérations (⚖️ 2. Rééquilibrage & Transactions)** pour "
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
            "poche_rv_eur": "Réserve de valeur (Physique + Numérique)",
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
                r.get("patrimoine_investi_usd", r.get("patrimoine_investi_eur")),
                r.get("patrimoine_investi_eur"),
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
