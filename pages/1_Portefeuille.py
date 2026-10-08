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

import importlib
from core import db, fx, metrics, models, prices, rebalance, session as S
from core import ui
from core.models import POCHES_PAR_CLE
from core.portfolio import devise_cotation_de

if not hasattr(db, "soldes_comptes_liquidites") or not hasattr(db, "lire_allocation_personnalisee") or not hasattr(models, "verifier_allocation_cible") or not hasattr(models, "bande_actif") or not hasattr(db, "modifier_transaction") or not hasattr(metrics, "calculer_rente_mensuelle_reelle") or not hasattr(ui, "fleche_pct") or not hasattr(ui, "_NAV_V2"):
    importlib.reload(models)
    importlib.reload(prices)
    importlib.reload(db)
    importlib.reload(metrics)
    importlib.reload(rebalance)
    importlib.reload(ui)
    importlib.reload(S)

from core.rebalance import generer_ordres

st.set_page_config(page_title="Portefeuille & Opérations", page_icon="💼", layout="wide")
ui.styliser_navigation()
st.title("💼 Portefeuille & Opérations")

ctx = S.charger()
for err in ctx.erreurs:
    st.error(err)
ui.bandeau_erreurs(ctx.echecs_cours, "cours")
if ctx.erreurs:
    st.stop()

cfg_alloc = getattr(ctx, "allocation_cfg", None) or db.lire_allocation_personnalisee()
etat_alloc = models.verifier_allocation_cible(cfg_alloc)
if etat_alloc["depasse_100"]:
    st.error(etat_alloc["message"])
elif etat_alloc["inferieur_100"]:
    st.warning(etat_alloc["message"])

tab_actifs, tab_reeq, tab_fonds, tab_alloc = st.tabs([
    "📋 1. Liste des actifs & Poches",
    "⚖️ 2. Rééquilibrage & Transactions",
    "💰 3. Fonds & Comptes de liquidités",
    "🎯 4. Allocation cible & Nouvel actif",
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
                "Depuis dernier enreg.": ui.fleche_pct(a.variation_pct)
                if a.est_investi else "—",
                "Valeur ($ / €)": ui.usd_eur(val_u, a.valeur_eur),
                "Poids (investi)": ui.pct(val_u / ctx.total_investi_usd)
                if ctx.total_investi_usd > 0 and a.est_investi else "—",
                "Cible actif": ui.pct(models.cible_actif(a.ticker))
                if a.est_investi and models.cible_actif(a.ticker) > 0 else "—",
                "Fenêtre dérive": f"±{models.bande_actif(a.ticker) * 100:.1f} pts".replace(".0 pts", " pts")
                if a.est_investi else "—",
                "PRU": ui.usd_eur(pos.pru_usd, pos.pru_eur) if pos and pos.pru_usd else "—",
                "Perf. ($)": ui.pct(pos.perf_globale_usd, decimales=2, signe=True)
                if pos and pos.perf_globale_usd is not None else "—",
                "PV latente ($ / €)": ui.usd_eur(pos.pv_latente_usd, pos.pv_latente_eur, signe=True) if pos else "—",
            })

        ui.tableau(pd.DataFrame(lignes_actifs))

        st.divider()
        st.subheader("Détail par poche")

        for cle, etat in ctx.etats.items():
            if not etat.actifs and etat.poche.perimetre.value != "investi":
                continue
            p = etat.poche
            perimetre = {
                "investi": "Portefeuille investi",
                "precaution": "Épargne de précaution (hors allocation)",
                "courant": "Compte courant (inclus dans l'assiette de rééquilibrage)",
                "hors": "Hors périmètre (autre courtier — non compté)",
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
                if etat.actifs:
                    lignes_poche = [{
                        "Actif": a.ticker,
                        "Qté": ui.quantite(a.quantite),
                        "Valeur ($ / €)": ui.usd_eur(getattr(a, "valeur_usd", a.valeur_eur), a.valeur_eur),
                        "Part de la poche": ui.pct(a.valeur_eur / etat.valeur_eur)
                        if etat.valeur_eur else "—",
                    } for a in etat.actifs]
                    ui.tableau(pd.DataFrame(lignes_poche))
                else:
                    membres_txt = ", ".join(
                        f"`{m}` ({models.cible_actif(m) * 100:.1f} %)" for m in p.membres
                    ) if p.membres else "Aucun actif rattaché"
                    st.info(
                        f"Aucune part encore détenue dans cette poche. "
                        f"Actif(s) cible(s) rattaché(s) : {membres_txt}."
                    )

        hors = [a for a in ctx.actifs if a.poche == "hors"]
        if hors:
            st.divider()
            st.warning(
                "**Hors périmètre — non comptés** : "
                + ", ".join(f"`{a.ticker}`" for a in hors)
                + ". Titres détenus chez un autre courtier, ou absents de "
                "l'allocation : suivis, mais exclus des totaux et de l'allocation. "
                "Pour les compter, ajoutez-les à votre allocation."
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

    orig_courant_usd = ctx.total_courant_usd
    orig_courant_eur = ctx.total_courant_eur
    if apport_simule_usd > 0:
        ctx.total_courant_usd = orig_courant_usd + apport_simule_usd
        ctx.total_courant_eur = orig_courant_eur + apport_simule_eur

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
                "Bande": f"±{e.bande * 100:.1f} pts".replace(".0 pts", " pts"),
                "Valeur actuelle ($ / €)": ui.usd_eur(e.valeur_usd, e.valeur_eur),
                "Valeur cible ($ / €)": ui.usd_eur(e.valeur_cible_usd, e.valeur_cible_eur),
                "Ajustement ($ / €)": ui.usd_eur(e.ecart_usd, e.ecart_eur, signe=True),
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
        ctx.total_courant_usd = orig_courant_usd
        ctx.total_courant_eur = orig_courant_eur

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
            poches_sans_pos = [e for e in a_surveiller if not e.actifs and abs(e.ecart_eur) >= 250.0]
            sous_seuil = [e for e in a_surveiller if e.actifs or abs(e.ecart_eur) < 250.0]
            if poches_sans_pos:
                details_nv = []
                for e in poches_sans_pos:
                    p_obj = POCHES_PAR_CLE.get(e.poche_cle)
                    membres_str = ", ".join(f"`{m}`" for m in (p_obj.membres if p_obj else [])) or "actif à définir"
                    details_nv.append(
                        f"**{e.poche_nom}** (cible {ui.pct(e.poids_cible)} · à investir : "
                        f"**{ui.usd_eur(abs(getattr(e, 'ecart_usd', e.ecart_eur)), abs(e.ecart_eur))}** sur {membres_str})"
                    )
                st.info(
                    "🆕 **Poche(s) cible(s) sans position encore détenue** : "
                    + " ; ".join(details_nv)
                    + ". Enregistrez votre premier achat ci-dessous pour initier la ligne."
                )
            if sous_seuil:
                st.info(
                    "**Écart hors bande mais sous le seuil de rentabilité** (frais > correction) : "
                    + ", ".join(f"{e.poche_nom} ({ui.points(e.ecart_points)})" for e in sous_seuil)
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
            tickers_cfg = {str(a.get("ticker", "")).upper().strip() for a in cfg_alloc.get("actifs", []) if a.get("ticker")}
            tickers_connus = sorted({t.ticker for t in ctx.transactions} | tickers_cfg)
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
            DEVISES_LISTE = ["USD", "EUR", "CHF", "JPY", "GBP", "CNY", "CAD", "AUD", "HKD", "SGD", "NOK", "SEK", "DKK"]
            LIBELLES_DEV = {
                "USD": "USD ($ — Dollar américain)",
                "EUR": "EUR (€ — Euro)",
                "CHF": "CHF (Franc suisse)",
                "JPY": "JPY (¥ — Yen japonais)",
                "GBP": "GBP (£ — Livre sterling)",
                "CNY": "CNY (¥ — Yuan chinois)",
                "CAD": "CAD (CA$ — Dollar canadien)",
                "AUD": "AUD (A$ — Dollar australien)",
                "HKD": "HKD (HK$ — Dollar de Hong Kong)",
                "SGD": "SGD (S$ — Dollar de Singapour)",
                "NOK": "NOK (kr — Couronne norvégienne)",
                "SEK": "SEK (kr — Couronne suédoise)",
                "DKK": "DKK (kr — Couronne danoise)",
            }
            devise = cd1.selectbox(
                "Devise de cotation",
                DEVISES_LISTE,
                format_func=lambda code: LIBELLES_DEV.get(code, code),
                index=max(0, DEVISES_LISTE.index(devise_defaut))
                if devise_defaut in DEVISES_LISTE else 0,
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

    # --- Édition et suppression des transactions (achats / ventes) ---
    if ctx.transactions:
        tx_triees = sorted(
            ctx.transactions,
            key=lambda t: (t.date, getattr(t, "id", 0) or 0),
            reverse=True,
        )
        tx_editables = [t for t in tx_triees if getattr(t, "id", None) is not None]

        with st.expander("✏️ Modifier ou supprimer un achat / une vente (erreur de saisie)", expanded=False):
            if not tx_editables:
                st.info("Aucune transaction modifiable avec identifiant trouvée en base.")
            else:
                options_tx = {}
                for t in tx_editables:
                    sens_lbl = "🟢 Achat" if t.est_achat else "🔴 Vente"
                    lbl = (
                        f"#{t.id} — {t.date.strftime('%d/%m/%Y')} · {sens_lbl} · "
                        f"{ui.quantite(t.quantite)} {t.ticker} @ {t.cours:,.4f} {t.devise} "
                        f"(frais : {t.frais:,.2f} {t.devise})".replace(",", " ")
                    )
                    options_tx[lbl] = t

                choix_tx_lbl = st.selectbox(
                    "Sélectionnez la transaction à modifier ou supprimer",
                    list(options_tx.keys()),
                )
                tx_sel = options_tx[choix_tx_lbl]

                with st.form(f"editer_transaction_{tx_sel.id}"):
                    ec1, ec2, ec3 = st.columns(3)
                    date_edit = ec1.date_input("Date", value=tx_sel.date)
                    ticker_edit = ec2.text_input("Actif (Ticker)", value=tx_sel.ticker)
                    sens_edit = ec3.radio(
                        "Sens",
                        ["Achat", "Vente"],
                        index=0 if tx_sel.est_achat else 1,
                        horizontal=True,
                    )

                    ec4, ec5, ec6 = st.columns(3)
                    qte_edit = ec4.number_input(
                        "Quantité", min_value=0.0, value=float(tx_sel.quantite), format="%.6f"
                    )
                    cours_edit = ec5.number_input(
                        "Cours unitaire", min_value=0.0, value=float(tx_sel.cours), format="%.6f"
                    )
                    frais_edit = ec6.number_input(
                        "Frais", min_value=0.0, value=float(tx_sel.frais), format="%.2f"
                    )

                    ecd1, ecd2 = st.columns(2)
                    dev_actuelle = str(tx_sel.devise or "USD").upper()
                    liste_dev_edit = DEVISES_LISTE if dev_actuelle in DEVISES_LISTE else [dev_actuelle] + DEVISES_LISTE
                    dev_edit = ecd1.selectbox(
                        "Devise de cotation",
                        liste_dev_edit,
                        format_func=lambda code: LIBELLES_DEV.get(code, code),
                        index=liste_dev_edit.index(dev_actuelle),
                    )
                    sources_dispo = ["swissquote", "revolut", "manuel", "import_v1"]
                    src_actuelle = str(getattr(tx_sel, "source", None) or "manuel")
                    if src_actuelle not in sources_dispo:
                        sources_dispo.append(src_actuelle)
                    src_edit = ecd2.selectbox(
                        "Source",
                        sources_dispo,
                        index=sources_dispo.index(src_actuelle),
                    )

                    b_save, b_del = st.columns(2)
                    btn_sauver_tx = b_save.form_submit_button("💾 Enregistrer les modifications")
                    btn_suppr_tx = b_del.form_submit_button("🗑️ Supprimer cette transaction")

                    if btn_sauver_tx:
                        if not ticker_edit.strip():
                            st.error("Le ticker ne peut pas être vide.")
                        elif qte_edit <= 0 or cours_edit <= 0:
                            st.error("La quantité et le cours unitaire doivent être strictement positifs.")
                        else:
                            try:
                                db.modifier_transaction(
                                    int(tx_sel.id),
                                    {
                                        "ticker": ticker_edit.upper().strip(),
                                        "sens": sens_edit.lower(),
                                        "date": date_edit.isoformat(),
                                        "quantite": float(qte_edit),
                                        "cours": float(cours_edit),
                                        "frais": float(frais_edit),
                                        "devise": dev_edit,
                                        "source": src_edit,
                                    },
                                )
                                st.success(f"✅ Transaction #{tx_sel.id} mise à jour.")
                                S.vider_cache()
                                st.rerun()
                            except Exception as exc:
                                st.error(f"Échec de la modification : {exc}")

                    if btn_suppr_tx:
                        try:
                            db.supprimer_transaction(int(tx_sel.id))
                            st.success(f"🗑️ Transaction #{tx_sel.id} supprimée.")
                            S.vider_cache()
                            st.rerun()
                        except Exception as exc:
                            st.error(f"Échec de la suppression : {exc}")

        with st.expander(f"📜 Historique des achats et ventes de titres ({len(tx_triees)} opérations)", expanded=False):
            ui.tableau(pd.DataFrame([{
                "Date": t.date.strftime("%d/%m/%Y"),
                "Actif": t.ticker,
                "Sens": "🟢 Achat" if t.est_achat else "🔴 Vente",
                "Quantité": ui.quantite(t.quantite),
                "Cours": f"{t.cours:,.4f}".replace(",", " "),
                "Frais": f"{t.frais:,.2f}".replace(",", " "),
                "Devise": t.devise,
                "Montant net": f"{t.montant_net:,.2f} {t.devise}".replace(",", " "),
                "Source": getattr(t, "source", None) or "—",
            } for t in tx_triees]))

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
        if isinstance(soldes_natifs, list):
            soldes_natifs = {str(x.get("ticker", "")).upper(): x for x in soldes_natifs if isinstance(x, dict)}
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
            "💵 Compte courant GBP (£ — Livre sterling)": ("GBP", "💵 Cash", "courant_gbp"),
            "💵 Compte courant JPY (¥ — Yen japonais)": ("JPY", "💵 Cash", "courant_jpy"),
            "💵 Compte courant CAD (CA$ — Dollar canadien)": ("CAD", "💵 Cash", "courant_cad"),
            "💵 Compte courant AUD (A$ — Dollar australien)": ("AUD", "💵 Cash", "courant_aud"),
            "💵 Compte courant HKD (HK$ — Dollar de Hong Kong)": ("HKD", "💵 Cash", "courant_hkd"),
            "💵 Compte courant SGD (S$ — Dollar de Singapour)": ("SGD", "💵 Cash", "courant_sgd"),
            "💵 Compte courant NOK (kr — Couronne norvégienne)": ("NOK", "💵 Cash", "courant_nok"),
            "💵 Compte courant SEK (kr — Couronne suédoise)": ("SEK", "💵 Cash", "courant_sek"),
            "💵 Compte courant DKK (kr — Couronne danoise)": ("DKK", "💵 Cash", "courant_dkk"),
            "🏦 Réserve GBP (£ — Épargne de précaution)": ("GBP", "🏦 Cash réserve", "reserve_gbp"),
            "🏦 Réserve JPY (¥ — Épargne de précaution)": ("JPY", "🏦 Cash réserve", "reserve_jpy"),
        }
        DEVISES_FONDS = ["EUR", "USD", "CHF", "JPY", "GBP", "CNY", "CAD", "AUD", "HKD", "SGD", "NOK", "SEK", "DKK"]
        LIBELLES_DEV_FONDS = {
            "EUR": "EUR (€ — Euro)",
            "USD": "USD ($ — Dollar américain)",
            "CHF": "CHF (Franc suisse)",
            "JPY": "JPY (¥ — Yen japonais)",
            "GBP": "GBP (£ — Livre sterling)",
            "CNY": "CNY (¥ — Yuan chinois)",
            "CAD": "CAD (CA$ — Dollar canadien)",
            "AUD": "AUD (A$ — Dollar australien)",
            "HKD": "HKD (HK$ — Dollar de Hong Kong)",
            "SGD": "SGD (S$ — Dollar de Singapour)",
            "NOK": "NOK (kr — Couronne norvégienne)",
            "SEK": "SEK (kr — Couronne suédoise)",
            "DKK": "DKK (kr — Couronne danoise)",
        }

        with st.form("nouveau_mouvement_fonds", clear_on_submit=True):
            c1, c2, c3 = st.columns(3)
            date_mvt = c1.date_input("Date du mouvement", value=dt.date.today())
            montant = c2.number_input("Montant saisi", min_value=0.0, format="%.2f", step=100.0)
            devise_saisie = c3.selectbox(
                "Devise du montant saisi",
                DEVISES_FONDS,
                format_func=lambda code: LIBELLES_DEV_FONDS.get(code, code),
                index=0,
            )

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
                                    "reference": f"usd:{montant_usd:.2f}",
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
        "courant_gbp": "💵 Compte courant GBP (£)",
        "courant_jpy": "💵 Compte courant JPY (¥)",
        "courant_cad": "💵 Compte courant CAD (CA$)",
        "courant_aud": "💵 Compte courant AUD (A$)",
        "courant_hkd": "💵 Compte courant HKD (HK$)",
        "courant_sgd": "💵 Compte courant SGD (S$)",
        "courant_nok": "💵 Compte courant NOK (kr)",
        "courant_sek": "💵 Compte courant SEK (kr)",
        "courant_dkk": "💵 Compte courant DKK (kr)",
        "reserve_gbp": "🏦 Réserve GBP (£)",
        "reserve_jpy": "🏦 Réserve JPY (¥)",
        "import_v1": "📦 Historique v1",
    }

    if ctx.apports.empty:
        st.info("Aucun apport enregistré.")
    else:
        df = ctx.apports.copy()
        df["Date_DT"] = pd.to_datetime(df["date"], errors="coerce")
        df = df.sort_values("Date_DT", ascending=False)

        with st.expander("✏️ Modifier ou supprimer un apport / retrait (erreur de saisie)", expanded=False):
            lignes_ap_edit = [r for _, r in df.iterrows() if pd.notna(r.get("id"))]
            if not lignes_ap_edit:
                st.info("Aucun apport modifiable avec identifiant trouvé en base.")
            else:
                options_ap = {}
                for r in lignes_ap_edit:
                    ap_id = int(r["id"])
                    d_fr = pd.to_datetime(r["date"]).strftime("%d/%m/%Y") if pd.notna(r.get("date")) else "—"
                    sens_lbl = "↗ Apport" if str(r.get("sens")).lower() == "apport" else "↘ Retrait"
                    m_e = float(r.get("montant_eur") or 0.0)
                    m_u = float(r["montant_usd"]) if pd.notna(r.get("montant_usd")) else m_e * ctx.taux_eur_usd
                    cpt_lbl = LIBELLES_COMPTES.get(str(r.get("compte") or ""), str(r.get("compte") or "—"))
                    lbl_ap = f"#{ap_id} — {d_fr} · {sens_lbl} · {ui.usd_eur(m_u, m_e)} ({cpt_lbl})"
                    options_ap[lbl_ap] = r

                choix_ap_lbl = st.selectbox(
                    "Sélectionnez l'apport ou le retrait à modifier ou supprimer",
                    list(options_ap.keys()),
                )
                r_sel = options_ap[choix_ap_lbl]
                ap_id_sel = int(r_sel["id"])
                d_actuelle = pd.to_datetime(r_sel["date"]).date() if pd.notna(r_sel.get("date")) else dt.date.today()
                est_apport_actuel = str(r_sel.get("sens")).lower() == "apport"
                m_eur_actuel = float(r_sel.get("montant_eur") or 0.0)
                m_usd_actuel = (
                    float(r_sel["montant_usd"])
                    if pd.notna(r_sel.get("montant_usd"))
                    else round(m_eur_actuel * ctx.taux_eur_usd, 2)
                )

                with st.form(f"editer_apport_{ap_id_sel}"):
                    ac1, ac2, ac3, ac4 = st.columns(4)
                    date_ap_edit = ac1.date_input("Date du mouvement", value=d_actuelle)
                    sens_ap_edit = ac2.radio(
                        "Sens",
                        ["↗ Apport", "↘ Retrait"],
                        index=0 if est_apport_actuel else 1,
                        horizontal=True,
                    )
                    montant_ap_edit = ac3.number_input(
                        "Montant corrigé",
                        min_value=0.0,
                        value=round(m_usd_actuel, 2),
                        format="%.2f",
                        step=50.0,
                    )
                    dev_ap_edit = ac4.selectbox(
                        "Devise du montant corrigé",
                        DEVISES_FONDS,
                        format_func=lambda code: LIBELLES_DEV_FONDS.get(code, code),
                        index=DEVISES_FONDS.index("USD"),
                    )

                    slug_actuel = str(r_sel.get("compte") or "swissquote_usd")
                    slugs_options = {v[2]: k for k, v in OPTIONS_COMPTES.items()}
                    lbl_cpt_defaut = slugs_options.get(slug_actuel, list(OPTIONS_COMPTES.keys())[0])
                    compte_ap_edit_lbl = st.selectbox(
                        "Compte associé",
                        list(OPTIONS_COMPTES.keys()),
                        index=list(OPTIONS_COMPTES.keys()).index(lbl_cpt_defaut),
                    )

                    ba1, ba2 = st.columns(2)
                    btn_sauver_ap = ba1.form_submit_button("💾 Enregistrer les modifications de l'apport")
                    btn_suppr_ap = ba2.form_submit_button("🗑️ Supprimer cet apport / retrait")

                    if btn_sauver_ap:
                        if montant_ap_edit <= 0:
                            st.error("Le montant corrigé doit être strictement positif.")
                        else:
                            d_iso_edit = date_ap_edit.isoformat()
                            try:
                                t_eur_edit = 1.0 if dev_ap_edit == "EUR" else fx.taux(dev_ap_edit, d_iso_edit, "EUR")
                                t_usd_edit = 1.0 if dev_ap_edit == "USD" else fx.taux(dev_ap_edit, d_iso_edit, "USD")
                                m_eur_nv = montant_ap_edit * t_eur_edit
                                m_usd_nv = montant_ap_edit * t_usd_edit
                                cours_or_nv = prices.cours_or(d_iso_edit)
                                onces_nv = m_usd_nv / cours_or_nv
                            except (fx.FXIndisponible, prices.CoursIndisponible) as exc:
                                st.error(f"Modification impossible : {exc}.")
                            else:
                                _, _, slug_nv = OPTIONS_COMPTES[compte_ap_edit_lbl]
                                try:
                                    db.modifier_apport(
                                        ap_id_sel,
                                        {
                                            "date": d_iso_edit,
                                            "sens": "apport" if sens_ap_edit.startswith("↗") else "retrait",
                                            "montant_eur": round(m_eur_nv, 2),
                                            "montant_or": round(onces_nv, 6),
                                            "cours_or": round(cours_or_nv, 2),
                                            "compte": slug_nv,
                                            "reference": f"usd:{m_usd_nv:.2f}",
                                        },
                                    )
                                    st.success(f"✅ Mouvement #{ap_id_sel} mis à jour ({ui.usd_eur(m_usd_nv, m_eur_nv)}).")
                                    S.vider_cache()
                                    st.rerun()
                                except Exception as exc:
                                    st.error(f"Échec de la modification : {exc}")

                    if btn_suppr_ap:
                        try:
                            db.supprimer_apport(ap_id_sel)
                            st.success(f"🗑️ Mouvement #{ap_id_sel} supprimé.")
                            S.vider_cache()
                            st.rerun()
                        except Exception as exc:
                            st.error(f"Échec de la suppression : {exc}")

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

# ===========================================================================
# ONGLET 4 : ALLOCATION CIBLE & NOUVEL ACTIF
# ===========================================================================
with tab_alloc:
    st.subheader("🎯 Allocation cible des actifs & Gestion des poches")
    st.caption(
        "Modifiez ici la répartition cible (%) de chacun de vos actifs, ajoutez un nouvel actif "
        "et rattachez-le à une poche existante ou créez une nouvelle poche stratégique. "
        "La cible de chaque poche est automatiquement égale à la somme des cibles des actifs qui la composent."
    )

    poches_cfg = [dict(p) for p in cfg_alloc.get("poches", [])]
    actifs_cfg = [dict(a) for a in cfg_alloc.get("actifs", [])]
    poches_map_nom = {p["cle"]: p["nom"] for p in poches_cfg}
    cles_poches = [p["cle"] for p in poches_cfg]

    valeurs_reelles_par_ticker = {
        a.ticker: (getattr(a, "valeur_usd", a.valeur_eur) / ctx.total_investi_usd * 100.0)
        if (ctx.total_investi_usd > 0 and a.est_investi) else 0.0
        for a in ctx.actifs
    }

    st.markdown("#### 1. Modifier l'allocation cible (%) et la fenêtre de dérive (± pts) de vos actifs")

    nouvelles_cibles_pct: dict[str, float] = {}
    nouvelles_bandes_actif_pct: dict[str, float] = {}
    nouvelles_poches_actif: dict[str, str] = {}
    bandes_poche_map = {
        p["cle"]: models._lire_bande_pct_poche(p) for p in poches_cfg
    }

    ent1, ent2, ent3, ent4, ent5 = st.columns([2.1, 2.0, 1.1, 1.3, 1.3])
    ent1.markdown("**Actif (Ticker & Libellé)**")
    ent2.markdown("**Poche stratégique**")
    ent3.markdown("**Poids réel**")
    ent4.markdown("**Allocation cible (%)**")
    ent5.markdown("**Fenêtre dérive (± pts)**")

    for idx_a, a_item in enumerate(actifs_cfg):
        tk = str(a_item.get("ticker", "")).upper().strip()
        nom_a = str(a_item.get("nom") or tk)
        poche_actuelle = str(a_item.get("poche") or (cles_poches[0] if cles_poches else "rv_physique"))
        if poche_actuelle not in cles_poches and cles_poches:
            poche_actuelle = cles_poches[0]
        cible_actuelle_pct = round(models._lire_cible_pct_actif(a_item), 2)
        def_bande_a = bandes_poche_map.get(poche_actuelle, 3.0 if poche_actuelle.startswith("rv") else 5.0)
        bande_actuelle_pct = round(models._lire_bande_pct_actif(a_item, defaut_pct=def_bande_a), 1)
        poids_reel_pct = valeurs_reelles_par_ticker.get(tk, 0.0)

        ca1, ca2, ca3, ca4, ca5 = st.columns([2.1, 2.0, 1.1, 1.3, 1.3])
        ca1.markdown(f"**`{tk}`** — {nom_a}")
        nouvelles_poches_actif[tk] = ca2.selectbox(
            f"Poche ({tk})",
            options=cles_poches,
            index=cles_poches.index(poche_actuelle) if poche_actuelle in cles_poches else 0,
            format_func=lambda c: poches_map_nom.get(c, c),
            key=f"alloc_poche_{tk}_{idx_a}",
            label_visibility="collapsed",
        )
        ca3.markdown(f"`{poids_reel_pct:.1f} %`")
        nouvelles_cibles_pct[tk] = ca4.number_input(
            f"Cible % ({tk})",
            min_value=0.0,
            max_value=100.0,
            value=float(cible_actuelle_pct),
            step=0.5,
            format="%.1f",
            key=f"alloc_cible_{tk}_{idx_a}",
            label_visibility="collapsed",
        )
        nouvelles_bandes_actif_pct[tk] = ca5.number_input(
            f"Fenêtre dérive ± pts ({tk})",
            min_value=0.5,
            max_value=25.0,
            value=float(bande_actuelle_pct),
            step=0.5,
            format="%.1f",
            key=f"alloc_bande_actif_{tk}_{idx_a}",
            label_visibility="collapsed",
            help="Fenêtre de dérive autorisée autour de la cible (ex. ±2,0 pts, ±3,0 pts, ±5,0 pts).",
        )

    total_cible_live = round(sum(nouvelles_cibles_pct.values()), 2)
    ecart_100_live = round(total_cible_live - 100.0, 2)

    if total_cible_live > 100.0 + 1e-4:
        st.error(
            f"🚨 **Alerte : la répartition cible totale de vos actifs représente {total_cible_live:.1f} % "
            f"(soit +{ecart_100_live:.1f} % au-dessus de 100 %) !** "
            "Veuillez réduire l'allocation d'un ou plusieurs actifs pour revenir à 100,0 %."
        )
    elif total_cible_live < 100.0 - 1e-4:
        st.warning(
            f"⚠️ **Attention : la répartition cible totale de vos actifs représente {total_cible_live:.1f} % "
            f"(il manque {abs(ecart_100_live):.1f} % pour atteindre 100,0 %).**"
        )
    else:
        st.success(f"✅ **Répartition cible totale équilibrée : {total_cible_live:.1f} %**")

    with st.expander("⚖️ Récapitulatif par poche (cibles & fenêtres de dérive)", expanded=False):
        nouvelles_bandes_pct: dict[str, float] = {}
        lignes_recap_poches = []
        for p_item in poches_cfg:
            cle_p = p_item["cle"]
            cible_poche_live = sum(
                nouvelles_cibles_pct.get(str(a_it["ticker"]).upper().strip(), 0.0)
                for a_it in actifs_cfg
                if nouvelles_poches_actif.get(str(a_it["ticker"]).upper().strip()) == cle_p
            )
            actifs_de_la_poche = [
                str(a_it["ticker"]).upper().strip()
                for a_it in actifs_cfg
                if nouvelles_poches_actif.get(str(a_it["ticker"]).upper().strip()) == cle_p
            ]
            if actifs_de_la_poche:
                w_tot = sum(nouvelles_cibles_pct.get(tk_p, 0.0) for tk_p in actifs_de_la_poche)
                if w_tot > 0:
                    b_p_live = sum(
                        nouvelles_cibles_pct.get(tk_p, 0.0) * nouvelles_bandes_actif_pct.get(tk_p, 5.0)
                        for tk_p in actifs_de_la_poche
                    ) / w_tot
                else:
                    b_p_live = sum(
                        nouvelles_bandes_actif_pct.get(tk_p, 5.0) for tk_p in actifs_de_la_poche
                    ) / len(actifs_de_la_poche)
            else:
                b_p_live = round(models._lire_bande_pct_poche(p_item), 1)
            nouvelles_bandes_pct[cle_p] = round(b_p_live, 1)
            lignes_recap_poches.append({
                "Poche": p_item["nom"],
                "Actifs rattachés": ", ".join(actifs_de_la_poche) if actifs_de_la_poche else "—",
                "Cible poche (%)": f"{cible_poche_live:.1f} %",
                "Fenêtre de dérive": f"±{nouvelles_bandes_pct[cle_p]:.1f} pts",
            })
        ui.tableau(pd.DataFrame(lignes_recap_poches))

    b_save_col, b_reset_col = st.columns([2, 1])
    if b_save_col.button("💾 Enregistrer la nouvelle allocation cible", type="primary", use_container_width=True):
        for a_it in actifs_cfg:
            tk = str(a_it["ticker"]).upper().strip()
            c_pct = round(nouvelles_cibles_pct.get(tk, 0.0), 4)
            b_a_pct = round(nouvelles_bandes_actif_pct.get(tk, 5.0), 2)
            a_it["cible_pct"] = c_pct
            a_it["cible"] = round(c_pct / 100.0, 6)
            a_it["bande_pct"] = b_a_pct
            a_it["bande"] = round(b_a_pct / 100.0, 4)
            a_it["poche"] = nouvelles_poches_actif.get(tk, a_it.get("poche"))
        for p_it in poches_cfg:
            cle_p = p_it["cle"]
            b_pct = round(nouvelles_bandes_pct.get(cle_p, models._lire_bande_pct_poche(p_it)), 2)
            p_it["bande_pct"] = b_pct
            p_it["bande"] = round(b_pct / 100.0, 4)
        nouvelle_cfg = {"poches": poches_cfg, "actifs": actifs_cfg}
        db.sauver_allocation_personnalisee(nouvelle_cfg)
        models.appliquer_allocation_personnalisee(nouvelle_cfg)
        etat_apres = models.verifier_allocation_cible(nouvelle_cfg)
        if etat_apres["depasse_100"]:
            st.warning(etat_apres["message"])
        else:
            st.success("✅ Nouvelle allocation cible et fenêtres de dérive enregistrées et appliquées.")
        S.vider_cache()
        st.rerun()

    if b_reset_col.button("🔄 Réinitialiser l'allocation par défaut (15/5/30/30/20)", use_container_width=True):
        cfg_def = models.allocation_par_defaut()
        db.sauver_allocation_personnalisee(cfg_def)
        models.reinitialiser_allocation_par_defaut()
        st.success("✅ Allocation par défaut restaurée.")
        S.vider_cache()
        st.rerun()

    st.divider()
    st.markdown("#### 2. ➕ Ajouter un nouvel actif (et choisir ou créer sa poche)")
    st.caption(
        "Ajoutez ici un nouveau titre, ETF, cryptomonnaie ou métal précieux à votre plan d'allocation. "
        "Vous pouvez le rattacher à une poche existante ou créer directement une nouvelle poche."
    )

    na1, na2, na3, na3b = st.columns([1.3, 1.9, 1.1, 1.1])
    nv_ticker = na1.text_input("Ticker de l'actif (ex. NESN.SW, TTE.PA, PAXG-USD)", key="nv_actif_ticker").upper().strip()
    nv_nom = na2.text_input("Nom / Libellé de l'actif (ex. Nestlé SA, TotalEnergies)", key="nv_actif_nom").strip()
    nv_cible_pct = na3.number_input(
        "Allocation cible (%)",
        min_value=0.0,
        max_value=100.0,
        value=0.0,
        step=0.5,
        format="%.1f",
        key="nv_actif_cible_pct",
    )
    nv_bande_pct = na3b.number_input(
        "Fenêtre dérive (± pts)",
        min_value=0.5,
        max_value=25.0,
        value=5.0,
        step=0.5,
        format="%.1f",
        key="nv_actif_bande_pct",
        help="Fenêtre de dérive autorisée autour de la cible (ex. ±2,0 pts, ±5,0 pts).",
    )

    CLASSES_OPTIONS = {
        "action": "Action / ETF Actions (PFU 150-0 A)",
        "obligation": "Obligation / ETF Obligataire (PFU 150-0 A)",
        "or_papier": "Or papier / ETC (PFU 150-0 A)",
        "crypto": "Cryptomonnaie (Art. 150 VH bis — 2086)",
        "or_physique": "Or physique (Art. 150 VI)",
    }
    DEVISES_COTATION_OPTIONS = ["USD", "EUR", "CHF", "JPY", "GBP", "CNY", "CAD", "AUD", "HKD", "SGD", "NOK", "SEK", "DKK"]

    na4, na5, na6 = st.columns([1.6, 1.2, 2.0])
    nv_classe = na4.selectbox(
        "Classe fiscale de l'actif",
        options=list(CLASSES_OPTIONS.keys()),
        format_func=lambda k: CLASSES_OPTIONS[k],
        key="nv_actif_classe",
    )
    nv_devise = na5.selectbox(
        "Devise de cotation",
        options=DEVISES_COTATION_OPTIONS,
        index=0,
        key="nv_actif_devise",
    )
    OPTIONS_POCHE_NV = cles_poches + ["__NOUVELLE_POCHE__"]
    choix_poche_nv = na6.selectbox(
        "Poche de rattachement",
        options=OPTIONS_POCHE_NV,
        format_func=lambda c: "➕ Créer une nouvelle poche…" if c == "__NOUVELLE_POCHE__" else poches_map_nom.get(c, c),
        key="nv_actif_choix_poche",
    )

    nv_poche_nom = ""
    nv_poche_bande_pct = 5.0
    nv_poche_desc = ""
    if choix_poche_nv == "__NOUVELLE_POCHE__":
        np1, np2 = st.columns([2.0, 2.5])
        nv_poche_nom = np1.text_input("Nom de la nouvelle poche (ex. Actions suisses)", key="nv_poche_nom").strip()
        nv_poche_bande_pct = float(nv_bande_pct)
        nv_poche_desc = np2.text_input("Description de la poche (optionnel)", key="nv_poche_desc").strip()

    total_apres_ajout_pct = round(total_cible_live + float(nv_cible_pct), 2)
    if nv_cible_pct > 0 and total_apres_ajout_pct > 100.0 + 1e-4:
        st.error(
            f"🚨 **Alerte : avec cet actif à {nv_cible_pct:.1f} %, la répartition cible totale atteindra "
            f"{total_apres_ajout_pct:.1f} % (soit +{total_apres_ajout_pct - 100.0:.1f} % au-dessus de 100 %) !** "
            "Pensez à réduire d'autant la cible des autres actifs ci-dessus."
        )
    elif nv_cible_pct > 0:
        st.info(
            f"💡 **Aperçu après ajout :** la répartition cible totale passera de **{total_cible_live:.1f} %** "
            f"à **{total_apres_ajout_pct:.1f} %**."
        )

    if st.button("➕ Ajouter cet actif au portefeuille", type="primary"):
        if not nv_ticker:
            st.error("Veuillez saisir le ticker du nouvel actif (ex. `NESN.SW` ou `TTE.PA`).")
        elif any(str(a_it.get("ticker", "")).upper().strip() == nv_ticker for a_it in actifs_cfg):
            st.error(f"L'actif `{nv_ticker}` fait déjà partie de votre plan d'allocation ci-dessus.")
        elif choix_poche_nv == "__NOUVELLE_POCHE__" and not nv_poche_nom:
            st.error("Veuillez saisir le nom de la nouvelle poche à créer.")
        else:
            if choix_poche_nv == "__NOUVELLE_POCHE__":
                cle_cible_poche = models.slug_poche(nv_poche_nom)
                if not any(p_it["cle"] == cle_cible_poche for p_it in poches_cfg):
                    poches_cfg.append({
                        "cle": cle_cible_poche,
                        "nom": nv_poche_nom,
                        "bande_pct": round(float(nv_poche_bande_pct), 2),
                        "bande": round(float(nv_poche_bande_pct) / 100.0, 4),
                        "description": nv_poche_desc,
                    })
            else:
                cle_cible_poche = choix_poche_nv

            for a_it in actifs_cfg:
                tk_ex = str(a_it["ticker"]).upper().strip()
                if tk_ex in nouvelles_cibles_pct:
                    c_pct = round(nouvelles_cibles_pct[tk_ex], 4)
                    a_it["cible_pct"] = c_pct
                    a_it["cible"] = round(c_pct / 100.0, 6)
                if tk_ex in nouvelles_bandes_actif_pct:
                    b_a_pct = round(nouvelles_bandes_actif_pct[tk_ex], 2)
                    a_it["bande_pct"] = b_a_pct
                    a_it["bande"] = round(b_a_pct / 100.0, 4)
                if tk_ex in nouvelles_poches_actif:
                    a_it["poche"] = nouvelles_poches_actif[tk_ex]

            actifs_cfg.append({
                "ticker": nv_ticker,
                "nom": nv_nom or nv_ticker,
                "poche": cle_cible_poche,
                "cible_pct": round(float(nv_cible_pct), 4),
                "cible": round(float(nv_cible_pct) / 100.0, 6),
                "bande_pct": round(float(nv_bande_pct), 2),
                "bande": round(float(nv_bande_pct) / 100.0, 4),
                "classe": nv_classe,
                "devise": nv_devise,
            })
            nouvelle_cfg = {"poches": poches_cfg, "actifs": actifs_cfg}
            db.sauver_allocation_personnalisee(nouvelle_cfg)
            models.appliquer_allocation_personnalisee(nouvelle_cfg)
            st.success(
                f"✅ Actif **`{nv_ticker}`** ({nv_nom or nv_ticker}) ajouté dans la poche "
                f"**{nv_poche_nom if choix_poche_nv == '__NOUVELLE_POCHE__' else poches_map_nom.get(cle_cible_poche, cle_cible_poche)}** "
                f"avec une cible de **{nv_cible_pct:.1f} %**."
            )
            S.vider_cache()
            st.rerun()

    if len(actifs_cfg) > 1:
        with st.expander("🗑️ Retirer un actif du plan d'allocation", expanded=False):
            tickers_supprimables = [str(a_it["ticker"]).upper().strip() for a_it in actifs_cfg]
            tk_a_retirer = st.selectbox(
                "Actif à retirer du plan d'allocation",
                options=tickers_supprimables,
                format_func=lambda t: f"{t} — {models.NOMS_ACTIFS.get(t, t)} ({models.cible_actif(t) * 100:.1f} %)",
                key="alloc_retirer_ticker",
            )
            if st.button("🗑️ Retirer cet actif du plan d'allocation", type="secondary"):
                actifs_restants = [
                    a_it for a_it in actifs_cfg
                    if str(a_it.get("ticker", "")).upper().strip() != tk_a_retirer
                ]
                poches_utilisees = {str(a_it.get("poche")) for a_it in actifs_restants}
                cles_defaut = {p.cle for p in models.POCHES_INVESTIES_DEFAUT}
                poches_restantes = [
                    p_it for p_it in poches_cfg
                    if p_it["cle"] in poches_utilisees or p_it["cle"] in cles_defaut
                ]
                nouvelle_cfg = {"poches": poches_restantes, "actifs": actifs_restants}
                db.sauver_allocation_personnalisee(nouvelle_cfg)
                models.appliquer_allocation_personnalisee(nouvelle_cfg)
                st.success(f"🗑️ Actif `{tk_a_retirer}` retiré du plan d'allocation.")
                S.vider_cache()
                st.rerun()

