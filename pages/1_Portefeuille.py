"""Portefeuille & Opérations — Liste des actifs, Rééquilibrage et Mouvements de fonds.

Regroupe en une seule page opérationnelle les 3 gestes de gestion du portefeuille :
1. **📋 Positions & Poches** : toutes les positions calculées, PRU, plus-values latentes et détail par poche.
2. **⚖️ Rééquilibrage & Transactions** : assiette incluant le cash disponible en compte courant ($), ordres proposés et saisie d'achats/ventes.
3. **💰 Fonds & Comptes de liquidités** : soldes des 4 comptes (`USD`, `EUR`, `CHF`, `CNY`), apports/retraits/virements avec choix du compte d'arrivée ou de départ.
"""

from __future__ import annotations

import datetime as dt

import pandas as pd
import streamlit as st

from core import db, fx, prices, session as S
from core import ui
from core.models import POCHES_PAR_CLE
from core.portfolio import devise_cotation_de
from core.rebalance import generer_ordres

st.set_page_config(page_title="Portefeuille & Opérations", page_icon="💼", layout="wide")
st.title("💼 Portefeuille & Opérations")

ctx = S.charger()
for err in ctx.erreurs:
    st.error(err)
ui.bandeau_erreurs(ctx.echecs_cours, "cours")
if ctx.erreurs:
    st.stop()

tab_actifs, tab_reeq, tab_fonds = st.tabs([
    "📋 1. Liste des actifs & Poches",
    "⚖️ 2. Rééquilibrage & Transactions",
    "💰 3. Fonds & Comptes de liquidités",
])

# ===========================================================================
# ONGLET 1 : LISTE DES ACTIFS & POCHES
# ===========================================================================
with tab_actifs:
    st.subheader("📋 Vos positions en portefeuille")

    if not ctx.actifs:
        st.info("Aucune position. Enregistrez une transaction depuis l'onglet Rééquilibrage & Transactions.")
    else:
        m1, m2, m3, m4 = st.columns(4)
        ui.metric_usd_eur(
            m1, "Actifs stratégiques (investi)", ctx.total_investi_usd, ctx.total_investi_eur,
        )
        ui.metric_usd_eur(
            m2, "Cash disponible (Compte courant)", ctx.total_courant_usd, ctx.total_courant_eur,
        )
        ui.metric_usd_eur(
            m3, "Épargne de précaution", ctx.total_precaution_usd, ctx.total_precaution_eur,
        )
        ui.metric_usd_eur(
            m4, "Patrimoine total", ctx.patrimoine_total_usd, ctx.patrimoine_total_eur,
        )

        lignes_actifs = []
        for a in sorted(ctx.actifs, key=lambda x: -(getattr(x, "valeur_usd", x.valeur_eur) or 0.0)):
            pos = ctx.positions.get(a.ticker)
            poche = POCHES_PAR_CLE.get(a.poche)
            val_u = getattr(a, "valeur_usd", a.valeur_eur)
            lignes_actifs.append({
                "Actif": a.ticker,
                "Poche": poche.nom if poche else "Non classé",
                "Classe": a.classe.value.replace("_", " "),
                "Régime fiscal": a.regime_fiscal,
                "Qté": ui.quantite(a.quantite),
                "Cours": f"{a.prix:,.4f}".replace(",", " "),
                "Devise": a.devise_cotation,
                "Valeur ($ / €)": ui.usd_eur(val_u, a.valeur_eur),
                "Poids (investi)": ui.pct(val_u / ctx.total_investi_usd)
                if ctx.total_investi_usd > 0 and a.est_investi else "—",
                "PRU": ui.usd_eur(pos.pru_usd, pos.pru_eur) if pos and pos.pru_usd else "—",
                "Perf. ($)": ui.pct(pos.perf_globale_usd, decimales=2, signe=True)
                if pos and pos.perf_globale_usd is not None else "—",
                "PV latente ($ / €)": ui.usd_eur(pos.pv_latente_usd, pos.pv_latente_eur) if pos else "—",
            })

        ui.tableau(pd.DataFrame(lignes_actifs))

        st.divider()
        st.subheader("Détail par poche")

        for cle, etat in ctx.etats.items():
            if not etat.actifs:
                continue
            p = etat.poche
            perimetre = {
                "investi": "Portefeuille investi",
                "precaution": "Épargne de précaution (hors allocation)",
                "courant": "Compte courant (inclus dans l'assiette de rééquilibrage)",
            }.get(p.perimetre.value, p.perimetre.value)

            with st.expander(
                f"**{p.nom}** — {ui.usd(etat.valeur_usd)} (:blue[{ui.eur(etat.valeur_eur)}]) · {perimetre}",
                expanded=False,
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
                    "Qté": ui.quantite(a.quantite),
                    "Valeur ($ / €)": ui.usd_eur(getattr(a, "valeur_usd", a.valeur_eur), a.valeur_eur),
                    "Part de la poche": ui.pct(a.valeur_eur / etat.valeur_eur)
                    if etat.valeur_eur else "—",
                } for a in etat.actifs]
                ui.tableau(pd.DataFrame(lignes_poche))

        non_classes = [a for a in ctx.actifs if a.poche == "inconnu"]
        if non_classes:
            st.divider()
            st.error(
                "**Actifs non classés** : " + ", ".join(f"`{a.ticker}`" for a in non_classes)
                + ". Ils sont exclus de l'allocation car aucune poche ne les revendique."
            )

# ===========================================================================
# ONGLET 2 : RÉÉQUILIBRAGE & TRANSACTIONS
# ===========================================================================
with tab_reeq:
    st.subheader("💵 Assiette de rééquilibrage (Actifs + Cash disponible)")

    a1, a2, a3, a4 = st.columns(4)
    ui.metric_usd_eur(
        a1, "Actifs stratégiques", ctx.total_investi_usd, ctx.total_investi_eur,
        help="Valeur actuelle de vos 4 poches investies.",
    )
    ui.metric_usd_eur(
        a2, "Cash disponible (Compte courant)", ctx.total_courant_usd, ctx.total_courant_eur,
        help="Liquidités présentes sur vos comptes courants (USD / EUR), prêtes à être investies.",
    )
    apport_simule_usd = a4.number_input(
        "➕ Simuler un apport supplémentaire ($)",
        min_value=0.0,
        value=0.0,
        step=100.0,
        format="%.2f",
        help="Permet de simuler immédiatement les ordres d'achat si vous prévoyez d'ajouter du cash en plus du solde actuel.",
    )
    apport_simule_eur = apport_simule_usd / ctx.taux_eur_usd if ctx.taux_eur_usd else 0.0

    assiette_usd = ctx.total_investi_usd + ctx.total_courant_usd + apport_simule_usd
    assiette_eur = ctx.total_investi_eur + ctx.total_courant_eur + apport_simule_eur

    ui.metric_usd_eur(
        a3, "Assiette totale cible", assiette_usd, assiette_eur,
        help="Actifs stratégiques + Cash disponible en compte courant + Apport simulé éventuel.",
    )

    cash_a_deployer_usd = ctx.total_courant_usd + apport_simule_usd
    cash_a_deployer_eur = ctx.total_courant_eur + apport_simule_eur
    if cash_a_deployer_usd > 0:
        st.info(
            f"💡 **Cash disponible inclus dans le calcul :** **{ui.usd_eur(cash_a_deployer_usd, cash_a_deployer_eur)}** "
            f"(dont {ui.usd_eur(ctx.total_courant_usd, ctx.total_courant_eur)} sur le compte courant"
            + (f" + {ui.usd_eur(apport_simule_usd, apport_simule_eur)} simulés" if apport_simule_usd > 0 else "")
            + "). Les cibles et les ajustements ci-dessous tiennent compte de ce cash pour l'affecter aux poches sous-pondérées."
        )

    st.divider()
    st.subheader("Diagnostic par poche")

    if apport_simule_usd > 0:
        ctx.total_courant_usd += apport_simule_usd
        ctx.total_courant_eur += apport_simule_eur

    if not ctx.ecarts:
        st.info("Aucune poche investie.")
    else:
        lignes_ec = []
        for e in ctx.ecarts:
            lignes_ec.append({
                "Poche": e.poche_nom,
                "Cible": ui.pct(e.poids_cible),
                "Réel (sur assiette)": ui.pct(e.poids_reel),
                "Écart": ui.points(e.ecart_points),
                "Bande": f"±{e.bande * 100:.0f} pts",
                "Valeur actuelle ($ / €)": ui.usd_eur(e.valeur_usd, e.valeur_eur),
                "Valeur cible ($ / €)": ui.usd_eur(e.valeur_cible_usd, e.valeur_cible_eur),
                "Ajustement ($ / €)": ui.usd_eur(e.ecart_usd, e.ecart_eur),
                "État": "🔴 Hors bande" if e.hors_bande else "🟢 Dans la bande",
            })
        ui.tableau(pd.DataFrame(lignes_ec))

        hors = ctx.besoins_reequilibrage
        if hors:
            st.warning(
                f"**{len(hors)} poche(s) hors bande.** "
                + " · ".join(f"{e.poche_nom} ({ui.points(e.ecart_points)})" for e in hors)
            )
        else:
            st.success("Toutes les poches sont dans leur bande de tolérance.")

        ordres, a_surveiller = generer_ordres(ctx.ecarts, seuil_min_eur=250.0)

        if ordres:
            st.divider()
            st.subheader("Ordres proposés")
            st.caption(
                "Répartis au prorata de la valeur de chaque actif dans sa poche. "
                "Le seuil de 250 € évite de payer des frais de courtage supérieurs à la "
                "correction obtenue."
            )
            ui.tableau(pd.DataFrame([{
                "Actif": o.ticker,
                "Sens": "🟢 Achat" if o.sens == "achat" else "🔴 Vente",
                "Montant ($ / €)": ui.usd_eur(o.montant_usd, o.montant_eur),
                "Quantité": ui.quantite(o.quantite),
                "Poche": o.poche,
                "Motif": o.motif,
            } for o in ordres]))

        if a_surveiller:
            st.info(
                "**Écart hors bande mais sous le seuil de rentabilité** (frais > correction) : "
                + ", ".join(f"{e.poche_nom} ({ui.points(e.ecart_points)})" for e in a_surveiller)
                + ". À traiter au prochain apport plutôt que par un ordre dédié."
            )

    st.divider()
    st.subheader("Enregistrer une transaction (Achat / Vente)")

    with st.expander("➕ Nouvelle transaction", expanded=False):
        st.caption(
            "Saisissez le cours dans la **devise de cotation du titre**. "
            "Ne le convertissez jamais à la main."
        )

        with st.form("nouvelle_transaction", clear_on_submit=True):
            c1, c2, c3 = st.columns(3)
            date_tx = c1.date_input("Date", value=dt.date.today())
            tickers_connus = sorted({t.ticker for t in ctx.transactions})
            ticker = c2.selectbox("Actif", options=tickers_connus + ["➕ Nouveau…"])
            if ticker == "➕ Nouveau…":
                ticker = c2.text_input("Nouveau ticker")
            sens = c3.radio("Sens", ["Achat", "Vente"], horizontal=True)

            c4, c5, c6 = st.columns(3)
            quantite = c4.number_input("Quantité", min_value=0.0, format="%.6f")
            cours = c5.number_input("Cours unitaire", min_value=0.0, format="%.6f")
            frais = c6.number_input("Frais", min_value=0.0, format="%.2f", value=0.0)

            devise_connue = devise_cotation_de(ticker) if ticker else None
            devise_defaut = devise_connue or "USD"
            cd1, cd2, cd3 = st.columns(3)
            devise = cd1.selectbox(
                "Devise de cotation", ["USD", "EUR", "CHF", "JPY", "GBP", "CNY"],
                index=max(0, ["USD", "EUR", "CHF", "JPY", "GBP", "CNY"].index(devise_defaut))
                if devise_defaut in ["USD", "EUR", "CHF", "JPY", "GBP", "CNY"] else 0,
            )
            source = cd2.selectbox("Source", ["swissquote", "revolut", "manuel"])
            compte_cash = cd3.selectbox(
                "Compte de liquidités à débiter / créditer",
                [
                    "💵 Compte courant USD ($)",
                    "💵 Compte courant EUR (€)",
                    "Ne pas modifier les soldes cash",
                ],
                index=0,
            )

            soumis = st.form_submit_button("🔨 Enregistrer")

            if soumis:
                problemes = []
                if not ticker or ticker == "➕ Nouveau…":
                    problemes.append("Ticker manquant.")
                if quantite <= 0:
                    problemes.append("La quantité doit être positive.")
                if cours <= 0:
                    problemes.append("Le cours doit être positif.")

                devise_attendue = devise_cotation_de(ticker) if ticker else None
                if ticker and devise_attendue and devise != devise_attendue:
                    st.warning(
                        f"`{ticker}` est coté en **{devise_attendue}** mais vous "
                        f"avez saisi **{devise}**. Vérifiez la devise avant de continuer."
                    )

                if problemes:
                    for p in problemes:
                        st.error(p)
                else:
                    try:
                        taux_vers_eur = fx.taux(devise, date_tx.isoformat(), "EUR")
                        taux_vers_usd = fx.taux(devise, date_tx.isoformat(), "USD")
                    except fx.FXIndisponible as exc:
                        st.error(
                            f"Transaction non enregistrée : {exc}. "
                            "Aucune valeur de repli n'a été utilisée."
                        )
                    else:
                        ligne = {
                            "ticker": ticker.upper().strip(),
                            "sens": sens.lower(),
                            "date": date_tx.isoformat(),
                            "quantite": quantite,
                            "cours": cours,
                            "frais": frais,
                            "devise": devise,
                            "source": source,
                        }
                        try:
                            db.ecrire(db.T_TRANSACTIONS, [ligne])
                            montant_devise = quantite * cours + (frais if sens == "Achat" else -frais)
                            signe_cash = -1.0 if sens == "Achat" else 1.0
                            if "USD" in compte_cash:
                                delta_usd = signe_cash * (montant_devise * taux_vers_usd)
                                db.ajuster_solde_compte("USD", delta_usd, "💵 Cash", 1.0)
                            elif "EUR" in compte_cash:
                                delta_eur = signe_cash * (montant_devise * taux_vers_eur)
                                db.ajuster_solde_compte("EUR", delta_eur, "💵 Cash", ctx.taux_eur_usd)
                            st.success(f"✅ {sens} de {quantite} {ticker.upper()} enregistré.")
                            S.vider_cache()
                            st.rerun()
                        except Exception as exc:
                            st.error(f"Écriture échouée : {exc}")

    st.divider()
    st.info(
        "**Règle de Gave à vérifier avant chaque transaction :** "
        "« N'ayez aucun contrat (cash ou obligation) dans la zone euro. »"
    )

# ===========================================================================
# ONGLET 3 : FONDS & COMPTES DE LIQUIDITÉS
# ===========================================================================
with tab_fonds:
    st.subheader("🏦 Soldes actuels de vos comptes de liquidités")

    soldes_natifs = db.soldes_comptes_liquidites()
    jour_iso = dt.date.today().isoformat()

    COMPTES_META = [
        ("USD", "💵 Compte courant USD ($)", "💵 Cash", "Swissquote / Courtage — inclus dans le rééquilibrage"),
        ("EUR", "💵 Compte courant EUR (€)", "💵 Cash", "Compte courant € — inclus dans le rééquilibrage"),
        ("CHF", "🏦 Réserve CHF", "🏦 Cash réserve", "Épargne de précaution — hors rééquilibrage"),
        ("CNY", "🏦 Réserve CNY", "🏦 Cash réserve", "Épargne de précaution — hors rééquilibrage"),
    ]

    cols_c = st.columns(4)
    for idx, (code_dev, libelle, type_c, desc_c) in enumerate(COMPTES_META):
        q_natif = float(soldes_natifs.get(code_dev, {}).get("quantite", 0.0))
        try:
            t_usd = 1.0 if code_dev == "USD" else fx.taux(code_dev, jour_iso, "USD")
            t_eur = 1.0 if code_dev == "EUR" else fx.taux(code_dev, jour_iso, "EUR")
        except Exception:
            t_usd = 1.0
            t_eur = 1.0 / ctx.taux_eur_usd if ctx.taux_eur_usd else 1.0
        val_u = q_natif * t_usd
        val_e = q_natif * t_eur
        with cols_c[idx]:
            ui.metric_usd_eur(cols_c[idx], libelle, val_u, val_e, help=desc_c)
            st.caption(f"Solde en devise : **{q_natif:,.2f} {code_dev}**".replace(",", " "))

    st.divider()
    with st.expander("➕ Nouveau mouvement de fonds", expanded=True):
        type_op = st.radio(
            "Nature de l'opération",
            options=[
                "↗ Apport de capital (entrée de fonds externes)",
                "↘ Retrait de capital (sortie de fonds vers l'extérieur)",
                "↔ Virement interne entre deux comptes du portefeuille",
            ],
            horizontal=True,
        )

        OPTIONS_COMPTES = {
            "💵 Compte courant USD ($ — Swissquote / Cash disponible)": ("USD", "💵 Cash", "swissquote_usd"),
            "💵 Compte courant EUR (€ — Cash disponible)": ("EUR", "💵 Cash", "courant_eur"),
            "🏦 Réserve CHF (Épargne de précaution CHF)": ("CHF", "🏦 Cash réserve", "reserve_chf"),
            "🏦 Réserve CNY (Épargne de précaution CNY)": ("CNY", "🏦 Cash réserve", "reserve_cny"),
        }

        with st.form("nouveau_mouvement_fonds", clear_on_submit=True):
            c1, c2, c3 = st.columns(3)
            date_mvt = c1.date_input("Date du mouvement", value=dt.date.today())
            montant = c2.number_input("Montant saisi", min_value=0.0, format="%.2f", step=100.0)
            devise_saisie = c3.selectbox("Devise du montant saisi", ["EUR", "USD", "CHF", "CNY"], index=0)

            if type_op.startswith("↔"):
                ca, cb = st.columns(2)
                compte_source_lbl = ca.selectbox(
                    "Compte débité (d'où partent les fonds)",
                    list(OPTIONS_COMPTES.keys()),
                    index=1,
                )
                compte_cible_lbl = cb.selectbox(
                    "Compte crédité (où arrivent les fonds)",
                    list(OPTIONS_COMPTES.keys()),
                    index=0,
                )
                maj_solde = True
            else:
                est_apport = type_op.startswith("↗")
                ca, cb = st.columns([2, 1])
                compte_cible_lbl = ca.selectbox(
                    "Dans quel compte les fonds arrivent-ils ?" if est_apport else "De quel compte les fonds repartent-ils ?",
                    list(OPTIONS_COMPTES.keys()),
                    index=0,
                )
                maj_solde = cb.checkbox(
                    "Mettre à jour le solde du compte",
                    value=True,
                    help="Ajoute (ou retire) automatiquement ce montant au solde du compte sélectionné dans Donnees.",
                )
                compte_source_lbl = compte_cible_lbl

            soumis = st.form_submit_button("✅ Enregistrer le mouvement")

            if soumis:
                if montant <= 0:
                    st.error("Le montant doit être strictement positif.")
                elif type_op.startswith("↔") and compte_source_lbl == compte_cible_lbl:
                    st.error("Veuillez choisir deux comptes différents pour un virement interne.")
                else:
                    d_iso = date_mvt.isoformat()
                    try:
                        taux_vers_eur = 1.0 if devise_saisie == "EUR" else fx.taux(devise_saisie, d_iso, "EUR")
                        taux_vers_usd = 1.0 if devise_saisie == "USD" else fx.taux(devise_saisie, d_iso, "USD")
                        montant_eur = montant * taux_vers_eur
                        montant_usd = montant * taux_vers_usd
                        cours_or = prices.cours_or(d_iso)
                        onces = montant_usd / cours_or
                    except (fx.FXIndisponible, prices.CoursIndisponible) as exc:
                        st.error(
                            f"Mouvement non enregistré : {exc}. "
                            "Aucune valeur de repli n'a été utilisée."
                        )
                    else:
                        try:
                            if type_op.startswith("↔"):
                                dev_src, typ_src, _ = OPTIONS_COMPTES[compte_source_lbl]
                                dev_dst, typ_dst, _ = OPTIONS_COMPTES[compte_cible_lbl]
                                t_src = 1.0 if devise_saisie == dev_src else fx.taux(devise_saisie, d_iso, dev_src)
                                t_dst = 1.0 if devise_saisie == dev_dst else fx.taux(devise_saisie, d_iso, dev_dst)
                                t_src_usd = 1.0 if dev_src == "USD" else fx.taux(dev_src, d_iso, "USD")
                                t_dst_usd = 1.0 if dev_dst == "USD" else fx.taux(dev_dst, d_iso, "USD")
                                db.ajuster_solde_compte(dev_src, -(montant * t_src), typ_src, t_src_usd)
                                db.ajuster_solde_compte(dev_dst, +(montant * t_dst), typ_dst, t_dst_usd)
                                st.success(
                                    f"✅ Virement interne de {ui.usd_eur(montant_usd, montant_eur)} effectué "
                                    f"de **{dev_src}** vers **{dev_dst}**."
                                )
                            else:
                                est_apport = type_op.startswith("↗")
                                dev_cpt, typ_cpt, slug_cpt = OPTIONS_COMPTES[compte_cible_lbl]
                                t_cpt = 1.0 if devise_saisie == dev_cpt else fx.taux(devise_saisie, d_iso, dev_cpt)
                                t_cpt_usd = 1.0 if dev_cpt == "USD" else fx.taux(dev_cpt, d_iso, "USD")
                                delta_cpt = (montant * t_cpt) * (1.0 if est_apport else -1.0)

                                db.ecrire(db.T_APPORTS, [{
                                    "date": d_iso,
                                    "sens": "apport" if est_apport else "retrait",
                                    "montant_eur": round(montant_eur, 2),
                                    "montant_or": round(onces, 6),
                                    "cours_or": round(cours_or, 2),
                                    "compte": slug_cpt,
                                }])
                                db.ajouter_historique_v1(
                                    date_mvt.strftime("%d/%m/%Y"),
                                    "apport" if est_apport else "retrait",
                                    montant_usd,
                                    montant_eur,
                                    onces,
                                )
                                if maj_solde:
                                    db.ajuster_solde_compte(dev_cpt, delta_cpt, typ_cpt, t_cpt_usd)

                                lib_sens = "Apport" if est_apport else "Retrait"
                                st.success(
                                    f"✅ {lib_sens} de {ui.usd_eur(montant_usd, montant_eur)} enregistré "
                                    f"sur **{compte_cible_lbl}** ({onces:.4f} oz d'or au cours du jour)."
                                )
                            S.vider_cache()
                            st.rerun()
                        except Exception as exc:
                            st.error(f"Écriture échouée : {exc}")

    st.divider()
    st.subheader("📜 Historique des apports et retraits de capital")

    LIBELLES_COMPTES = {
        "swissquote_usd": "💵 Compte courant USD ($)",
        "swissquote": "💵 Compte courant USD ($)",
        "courant_eur": "💵 Compte courant EUR (€)",
        "revolut": "💵 Compte courant EUR (€)",
        "reserve_chf": "🏦 Réserve CHF",
        "livret_chf": "🏦 Réserve CHF",
        "reserve_cny": "🏦 Réserve CNY",
        "import_v1": "📦 Historique v1",
    }

    if ctx.apports.empty:
        st.info("Aucun apport enregistré.")
    else:
        df = ctx.apports.copy()
        df["Date_DT"] = pd.to_datetime(df["date"], errors="coerce")
        df = df.sort_values("Date_DT", ascending=False)
        ui.tableau(pd.DataFrame([{
            "Date": pd.to_datetime(r["date"]).strftime("%d/%m/%Y"),
            "Sens": "↗ Apport" if r["sens"] == "apport" else "↘ Retrait",
            "Montant ($ / €)": ui.usd_eur(
                float(r["montant_usd"]) if pd.notna(r.get("montant_usd")) else float(r["montant_eur"]) * ctx.taux_eur_usd,
                float(r["montant_eur"]),
            ),
            "Équivalent or": f"{float(r['montant_or']):.4f} oz" if pd.notna(r.get("montant_or")) else "—",
            "Cours or": f"{float(r['cours_or']):,.0f} $/oz" if pd.notna(r.get("cours_or")) else "—",
            "Compte": LIBELLES_COMPTES.get(str(r.get("compte") or ""), str(r.get("compte") or "—")),
        } for _, r in df.iterrows()]))

        apports_nets_eur = sum(
            float(r["montant_eur"]) * (1 if r["sens"] == "apport" else -1)
            for _, r in df.iterrows()
        )
        apports_nets_usd = sum(
            (float(r["montant_usd"]) if pd.notna(r.get("montant_usd")) else float(r["montant_eur"]) * ctx.taux_eur_usd)
            * (1 if r["sens"] == "apport" else -1)
            for _, r in df.iterrows()
        )
        ui.metric_usd_eur(st, "Apports nets cumulés", apports_nets_usd, apports_nets_eur)
