"""Fiscalité — Simulateur complet & déclaration pré-remplie case par case.\n\nRestaure l'intégralité des fonctionnalités de la v1 (situation familiale,\nsalaires 1AJ/1BJ, frais réels kilométriques et repas 1AK/1BK mémorisés dans\n`Config`, intérêts étrangers 2047/2TR, formulaires 2042, 3916-bis, 2047, 2074\nlignes 511-524 / 905 / 913 / Cadres 11-12 et 2086 lignes 211-224, taux de PAS\nfoyer et individualisés) tout en sélectionnant automatiquement les barèmes\nofficiels de l'année des revenus (IR, décote, barème kilométrique URSSAF,\nforfait repas URSSAF, PFU & prélèvements sociaux, CSG déductible à 6,8 %).\n"""

from __future__ import annotations

import datetime as dt

import pandas as pd
import streamlit as st

from core import db
from core import fiscal_bars as fb
from core import guide_fiscal as guide
from core import session as S, tax
from core import ui

st.set_page_config(page_title="Fiscalité", page_icon="🏛️", layout="wide")
st.title("🏛️ Simulateur Fiscal & Déclaration Pré-remplie")
st.caption(
    "Tous les barèmes officiels (impôt sur le revenu, décote, barème "
    "kilométrique URSSAF, forfait repas, PFU et prélèvements sociaux) sont "
    "chargés automatiquement selon l'année choisie. Chaque formulaire et "
    "chaque case vous donne directement le chiffre exact à recopier sur "
    "impots.gouv.fr."
)

ctx = S.charger()
for err in ctx.erreurs:
    st.error(err)
if ctx.erreurs:
    st.stop()

# ---------------------------------------------------------------------------
# Chargement de la configuration fiscale mémorisée dans Supabase (`Config`)
# ---------------------------------------------------------------------------
if "cfg_fiscale" not in st.session_state:
    st.session_state.cfg_fiscale = db.lire_config_fiscale()
cfg = st.session_state.cfg_fiscale


def _float_cfg(cle: str, defaut: float) -> float:
    try:
        return float(str(cfg.get(cle, defaut)).replace(",", ".").replace(" ", ""))
    except Exception:
        return defaut


def _int_cfg(cle: str, defaut: int) -> int:
    try:
        return int(float(str(cfg.get(cle, defaut)).replace(",", ".").replace(" ", "")))
    except Exception:
        return defaut


def _bool_cfg(cle: str, defaut: bool = False) -> bool:
    val = str(cfg.get(cle, str(defaut))).strip().lower()
    return val in ("true", "1", "oui", "yes")


# ---------------------------------------------------------------------------
# Choix de l'année des revenus & bandeau des barèmes officiels automatiques
# ---------------------------------------------------------------------------
annee_courante = dt.date.today().year
annee_defaut = annee_courante - 1 if (annee_courante - 1) in fb.BAREMES else annee_courante
annees_options = sorted(fb.annees_disponibles(), reverse=True)
idx_annee = annees_options.index(annee_defaut) if annee_defaut in annees_options else 0

annee = st.selectbox(
    "📅 Année des revenus à déclarer",
    options=annees_options,
    index=idx_annee,
    help="Les revenus de l'année N sont déclarés au printemps N+1. Tous les "
         "barèmes (tranches IR, décote, forfait repas, PFU, PS) s'adaptent "
         "automatiquement à l'année sélectionnée.",
)

try:
    bareme_ir = fb.bareme_de(annee)
    repas_unit = fb.forfait_repas_de(annee)
    ps_taux = fb.taux_ps(annee)
    pfu_taux = fb.taux_pfu(annee)
except ValueError as exc:
    st.error(str(exc))
    st.stop()

st.markdown(
    f"""<div style="background-color:rgba(30,41,59,0.75);color:#ffffff;border-radius:10px;padding:12px 16px;margin-bottom:14px;border-left:5px solid #2ecc71;font-size:0.93rem;">\n    <strong>🟢 Barèmes fiscaux automatiques — Revenus {annee} (déclaration {annee + 1})</strong><br>\n    <span style="font-size:0.86rem;opacity:0.9;">\n    • <b>Tranches IR {annee}</b> : 0 % jusqu'à {bareme_ir.tranches[0]:,.0f} € · 11 % jusqu'à {bareme_ir.tranches[1]:,.0f} € · 30 % jusqu'à {bareme_ir.tranches[2]:,.0f} € · 41 % jusqu'à {bareme_ir.tranches[3]:,.0f} € · 45 % au-delà<br>\n    • <b>Décote {annee}</b> : Célibataire (base {bareme_ir.decote_base_celibataire:,.0f} €, plafond {bareme_ir.decote_plafond_celibataire:,.0f} €) · Couple (base {bareme_ir.decote_base_couple:,.0f} €, plafond {bareme_ir.decote_plafond_couple:,.0f} €)<br>\n    • <b>PFU (Flat Tax) {annee}</b> : {fb.IR_FORFAITAIRE * 100:.1f} % IR + {ps_taux * 100:.1f} % PS = <b>{pfu_taux * 100:.1f} %</b> (CSG déductible au barème : 6,8 %)<br>\n    • <b>Frais professionnels {annee}</b> : Barème kilométrique officiel URSSAF/DGFiP (3 à 7+ CV) · Forfait repas : <b>{repas_unit:.2f} €/repas</b>\n    </span>\n    </div>""".replace(",", " "),
    unsafe_allow_html=True,
)

if annee in fb.PS_ANNEE_INCERTAINE:
    st.info("ℹ️ " + fb.PS_ANNEE_INCERTAINE[annee])

# ---------------------------------------------------------------------------
# 1. Paramètres du foyer : Situation familiale & Déclaration de base (repliables)
# ---------------------------------------------------------------------------
st.divider()
st.subheader("⚙️ 1. Vos paramètres fiscaux (cliquez pour déplier et modifier)")
st.caption(
    "Vos paramètres sont chargés depuis votre base Supabase (`Config`) et "
    "sauvegardés automatiquement dès que vous les modifiez."
)

statut_defaut = cfg.get("f_statut", "Marié(e) / Pacsé(e)")
options_statut = ["Marié(e) / Pacsé(e)", "Célibataire / Divorcé(e) / Veuf(ve)"]
idx_statut = 0 if ("Mari" in statut_defaut or "Pacs" in statut_defaut) else 1
enf_defaut = _int_cfg("f_enf", 2)
parts_defaut = fb.parts_fiscales_auto(options_statut[idx_statut], enf_defaut)

with st.expander(
    f"👨‍👩‍👧‍👦 Situation familiale ({options_statut[idx_statut]} · {enf_defaut} enfant(s) · {parts_defaut:g} part(s))",
    expanded=False,
):
    c_sit1, c_sit2, c_sit3 = st.columns(3)
    statut = c_sit1.radio("Situation matrimoniale ✍️", options_statut, index=idx_statut)
    enfants = int(c_sit2.number_input(
        "Enfants à charge ✍️", min_value=0, max_value=10,
        value=enf_defaut, step=1,
    ))
    parts_calculees = fb.parts_fiscales_auto(statut, enfants)
    parts = float(c_sit3.number_input(
        "Nombre de parts (Quotient familial) ✍️",
        min_value=0.5, max_value=10.0, step=0.5,
        value=float(parts_calculees),
        help="Calculé automatiquement selon votre situation et vos enfants (2 parts pour un couple + 0,5 pour chacun des 2 premiers enfants + 1 dès le 3e).",
    ))

couple = "Mari" in statut or "Pacs" in statut

s1_def = _float_cfg("f_s1", 32473.0)
s2_def = _float_cfg("f_s2", 29772.0)
int_def = _float_cfg("f_int_net", 200.0)
resume_base = f"1AJ : {s1_def:,.0f} €".replace(",", " ")
if couple and s2_def > 0:
    resume_base += f" · 1BJ : {s2_def:,.0f} €".replace(",", " ")
if int_def > 0:
    resume_base += f" · Intérêts étrangers : {int_def:,.0f} €".replace(",", " ")

with st.expander(
    f"📝 Déclaration de base ({resume_base} · Frais réels & Comptes hors de France)",
    expanded=False,
):
    st.markdown("#### 💼 Salaires nets imposables & Frais professionnels (Frais réels vs Abattement 10 %)")
    col_d1, col_d2 = st.columns(2)

    with col_d1:
        st.markdown("**Déclarant 1 (Vous)**")
        salaire_1 = float(st.number_input(
            "Salaire net imposable — Déclarant 1 (€) → Case 1AJ ✍️",
            min_value=0.0, value=s1_def, step=500.0,
        ))
        use_frais_1 = st.checkbox(
            "Calculer mes frais réels (kilomètres + repas) — Vous",
            value=_bool_cfg("f_u1", True),
        )
        if use_frais_1:
            k1_c1, k1_c2, k1_c3 = st.columns(3)
            km_1 = float(k1_c1.number_input(
                "Km annuels parcourus ✍️", min_value=0, max_value=100000,
                value=_int_cfg("f_k1", 9120), step=500, key="km1",
            ))
            cv_1_init = min(max(_int_cfg("f_cv1", 5), 3), 7)
            cv_1 = int(k1_c2.selectbox(
                "Puissance fiscale (CV) ✍️", [3, 4, 5, 6, 7],
                index=[3, 4, 5, 6, 7].index(cv_1_init), key="cv1",
            ))
            repas_1 = int(k1_c3.number_input(
                "Jours repas hors domicile ✍️", min_value=0, max_value=365,
                value=_int_cfg("f_r1", 240), step=10, key="rep1",
            ))
            elec_1 = st.checkbox(
                "Véhicule 100 % électrique (+20 %)", value=_bool_cfg("f_elec1", False), key="el1",
            )
        else:
            km_1, cv_1, repas_1, elec_1 = float(_int_cfg("f_k1", 0)), _int_cfg("f_cv1", 5), _int_cfg("f_r1", 0), False

    with col_d2:
        if couple:
            st.markdown("**Déclarant 2 (Conjoint)**")
            salaire_2 = float(st.number_input(
                "Salaire net imposable — Déclarant 2 (€) → Case 1BJ ✍️",
                min_value=0.0, value=s2_def, step=500.0,
            ))
            use_frais_2 = st.checkbox(
                "Calculer les frais réels (kilomètres + repas) — Conjoint",
                value=_bool_cfg("f_u2", True),
            )
            if use_frais_2:
                k2_c1, k2_c2, k2_c3 = st.columns(3)
                km_2 = float(k2_c1.number_input(
                    "Km annuels parcourus ✍️", min_value=0, max_value=100000,
                    value=_int_cfg("f_k2", 9120), step=500, key="km2",
                ))
                cv_2_init = min(max(_int_cfg("f_cv2", 5), 3), 7)
                cv_2 = int(k2_c2.selectbox(
                    "Puissance fiscale (CV) ✍️", [3, 4, 5, 6, 7],
                    index=[3, 4, 5, 6, 7].index(cv_2_init), key="cv2",
                ))
                repas_2 = int(k2_c3.number_input(
                    "Jours repas hors domicile ✍️", min_value=0, max_value=365,
                    value=_int_cfg("f_r2", 200), step=10, key="rep2",
                ))
                elec_2 = st.checkbox(
                    "Véhicule 100 % électrique (+20 %)", value=_bool_cfg("f_elec2", False), key="el2",
                )
            else:
                km_2, cv_2, repas_2, elec_2 = float(_int_cfg("f_k2", 0)), _int_cfg("f_cv2", 5), _int_cfg("f_r2", 0), False
        else:
            salaire_2, use_frais_2, km_2, cv_2, repas_2, elec_2 = 0.0, False, 0.0, 5, 0, False

    st.divider()
    st.markdown("#### 🌍 Revenus d'intérêts étrangers & Comptes détenus hors de France")
    ce1, ce2 = st.columns(2)
    with ce1:
        pays_etranger = st.text_input(
            "Pays d'origine des intérêts étrangers (ex. Lituanie pour Revolut) ✍️",
            value=str(cfg.get("f_pays_etr", "Lituanie")),
        )
        interets_etrangers = float(st.number_input(
            "Intérêts nets encaissés à l'étranger (€) → 2047 Ligne 250 & 2042 Case 2TR ✍️",
            min_value=0.0, value=int_def, step=10.0,
        ))
    with ce2:
        st.markdown("**Comptes à l'étranger à déclarer (Formulaire 3916 / 3916-bis & Case 8UU)**")
        defauts_comptes = guide.comptes_par_defaut()
        choisis: list[str] = []
        for libelle in defauts_comptes:
            if st.checkbox(libelle, value=True, key=f"ctr_{libelle[:20]}"):
                choisis.append(libelle)
        autre_compte = st.text_input(
            "Autre compte à l'étranger (ex. Revolut Ltd, Lituanie)",
            value="Compte courant Revolut — Revolut Bank UAB, Lituanie" if interets_etrangers > 0 else "",
            help="Séparez plusieurs comptes par des points-virgules.",
        )
        if autre_compte.strip():
            choisis.extend(x.strip() for x in autre_compte.split(";") if x.strip())

# Sauvegarde automatique dans `Config` si l'utilisateur a modifié un paramètre
nouveaux_params = {
    "f_statut": statut,
    "f_enf": str(enfants),
    "f_parts": str(parts),
    "f_s1": str(salaire_1),
    "f_s2": str(salaire_2),
    "f_u1": use_frais_1,
    "f_k1": str(int(km_1)),
    "f_cv1": str(cv_1),
    "f_r1": str(repas_1),
    "f_elec1": elec_1,
    "f_u2": use_frais_2,
    "f_k2": str(int(km_2)),
    "f_cv2": str(cv_2),
    "f_r2": str(repas_2),
    "f_elec2": elec_2,
    "f_int_net": str(interets_etrangers),
    "f_pays_etr": pays_etranger,
}
if any(str(cfg.get(k)) != str( "true" if v is True else ("false" if v is False else v) ) for k, v in nouveaux_params.items()):
    for k, v in nouveaux_params.items():
        cfg[k] = "true" if v is True else ("false" if v is False else str(v))
    db.sauver_config_fiscale(nouveaux_params)

# ---------------------------------------------------------------------------
# Calculs complets : 2074 (Actions/ETF), 2086 (Crypto), 2042 & Simulation Foyer
# ---------------------------------------------------------------------------
d2074 = tax.detail_2074_de_lannee(ctx.transactions, annee)
d2086 = tax.detail_2086_de_lannee(ctx.transactions, annee)
sim = tax.simuler_foyer_complet(
    annee=annee,
    statut=statut,
    enfants=enfants,
    parts=parts,
    salaire_1=salaire_1,
    utiliser_frais_reels_1=use_frais_1,
    km_1=km_1,
    cv_1=cv_1,
    jours_repas_1=repas_1,
    electrique_1=elec_1,
    salaire_2=salaire_2,
    utiliser_frais_reels_2=use_frais_2,
    km_2=km_2,
    cv_2=cv_2,
    jours_repas_2=repas_2,
    electrique_2=elec_2,
    interets_etrangers_eur=interets_etrangers,
    pays_interets_etrangers=pays_etranger,
    bilan_pv_actions_eur=d2074["bilan_net"],
    bilan_pv_crypto_imposable_eur=d2086["case_3an"],
)

# Affichage immédiat du résultat Frais réels vs Abattement 10 % sous les deux colonnes
res_f1, res_f2 = st.columns(2)
with res_f1:
    if sim["retenir_frais_reels_1"]:
        st.success(
            f"✅ **Vous — Frais réels retenus : {ui.eur(sim['frais_reels_1'], 0)}** "
            f"(plus avantageux que l'abattement 10 % de {ui.eur(sim['abattement_10_1'], 0)}, "
            f"soit **+{ui.eur(sim['frais_reels_1'] - sim['abattement_10_1'], 0)}** de déduction supplémentaire).\n\n"
            f"👉 **Inscrivez `{sim['case_1ak']} €` en case `1AK`** ({sim['frais_km_formule_1']} · {sim['frais_repas_formule_1']})."
        )
    else:
        st.info(
            f"ℹ️ **Vous — Abattement automatique de 10 % retenu : {ui.eur(sim['abattement_10_1'], 0)}** "
            f"(frais réels : {ui.eur(sim['frais_reels_1'], 0)}). **Laissez la case `1AK` vide.**"
        )
with res_f2:
    if couple and salaire_2 > 0:
        if sim["retenir_frais_reels_2"]:
            st.success(
                f"✅ **Conjoint — Frais réels retenus : {ui.eur(sim['frais_reels_2'], 0)}** "
                f"(plus avantageux que l'abattement 10 % de {ui.eur(sim['abattement_10_2'], 0)}, "
                f"soit **+{ui.eur(sim['frais_reels_2'] - sim['abattement_10_2'], 0)}** de déduction supplémentaire).\n\n"
                f"👉 **Inscrivez `{sim['case_1bk']} €` en case `1BK`** ({sim['frais_km_formule_2']} · {sim['frais_repas_formule_2']})."
            )
        else:
            st.info(
                f"ℹ️ **Conjoint — Abattement automatique de 10 % retenu : {ui.eur(sim['abattement_10_2'], 0)}** "
                f"(frais réels : {ui.eur(sim['frais_reels_2'], 0)}). **Laissez la case `1BK` vide.**"
            )

# ---------------------------------------------------------------------------
# 2. VOS FORMULAIRES DE DÉCLARATION (FERMÉS PAR DÉFAUT — CLIQUEZ POUR DÉPLOYER)
# ---------------------------------------------------------------------------
st.divider()
st.subheader(f"📁 2. Vos formulaires de déclaration {annee + 1} (revenus {annee})")
st.caption(
    "Chaque volet ci-dessous correspond à un formulaire officiel d'impots.gouv.fr. "
    "Cliquez sur un formulaire pour voir les cases exactes et les montants à y recopier."
)

# --- VOLET 1 : FORMULAIRE 2042 & 2042-C (DÉCLARATION PRINCIPALE) ---
resume_2042 = f"1AJ : {sim['case_1aj']:,} €".replace(",", " ")
if sim["case_1ak"] is not None:
    resume_2042 += f" · 1AK : {sim['case_1ak']:,} €".replace(",", " ")
if couple and sim["case_1bj"]:
    resume_2042 += f" · 1BJ : {sim['case_1bj']:,} €".replace(",", " ")
if couple and sim["case_1bk"] is not None:
    resume_2042 += f" · 1BK : {sim['case_1bk']:,} €".replace(",", " ")
if d2074["case_3vg"] > 0:
    resume_2042 += f" · 3VG : {round(d2074['case_3vg']):,} €".replace(",", " ")
elif d2074["case_3vh"] > 0:
    resume_2042 += f" · 3VH : {round(d2074['case_3vh']):,} €".replace(",", " ")

with st.expander(f"📁 Formulaire 2042 & 2042-C (Déclaration Principale — {resume_2042})", expanded=False):
    cases_2042 = []
    if sim["case_1aj"] > 0:
        cases_2042.append({
            "Case": "1AJ",
            "Rubrique": "Traitements et salaires — Déclarant 1",
            "À inscrire": f"{sim['case_1aj']:,} €".replace(",", " "),
            "Indication": "Vérifier le montant pré-rempli par l'employeur.",
        })
    cases_2042.append({
        "Case": "1AK",
        "Rubrique": "Frais réels — Déclarant 1",
        "À inscrire": f"{sim['case_1ak']:,} €".replace(",", " ") if sim["case_1ak"] is not None else "LAISSER VIDE",
        "Indication": sim["note_1ak"] if sim["case_1ak"] is not None else f"Abattement 10 % ({ui.eur(sim['abattement_10_1'], 0)}) plus avantageux.",
    })
    if couple and sim["case_1bj"]:
        cases_2042.append({
            "Case": "1BJ",
            "Rubrique": "Traitements et salaires — Déclarant 2",
            "À inscrire": f"{sim['case_1bj']:,} €".replace(",", " "),
            "Indication": "Vérifier le montant pré-rempli par l'employeur.",
        })
        cases_2042.append({
            "Case": "1BK",
            "Rubrique": "Frais réels — Déclarant 2",
            "À inscrire": f"{sim['case_1bk']:,} €".replace(",", " ") if sim["case_1bk"] is not None else "LAISSER VIDE",
            "Indication": sim["note_1bk"] if sim["case_1bk"] is not None else f"Abattement 10 % ({ui.eur(sim['abattement_10_2'], 0)}) plus avantageux.",
        })
    if sim["case_2tr"]:
        cases_2042.append({
            "Case": "2TR",
            "Rubrique": "Intérêts et produits de placement à revenu fixe",
            "À inscrire": f"{sim['case_2tr']:,} €".replace(",", " "),
            "Indication": "Reporté depuis la ligne 252 du formulaire 2047.",
        })
    if sim["arbitrage"] is not None:
        cases_2042.append({
            "Case": "2OP",
            "Rubrique": "Option globale pour le barème progressif",
            "À inscrire": "☑️ À COCHER ABSOLUMENT" if sim["cocher_2op"] else "⬜ LAISSER DÉCOCHÉE",
            "Indication": f"{sim['arbitrage']['choix']} plus avantageux (économie : {ui.eur(sim['arbitrage']['gain'])}).",
        })
    if d2074["case_3vg"] > 0:
        cases_2042.append({
            "Case": "3VG",
            "Rubrique": "Plus-value nette imposable de cession de valeurs mobilières",
            "À inscrire": f"{round(d2074['case_3vg']):,} €".replace(",", " "),
            "Indication": f"Calcul exact : {ui.eur(d2074['ligne_905'])} − {ui.eur(d2074['ligne_913'])} = {ui.eur(d2074['case_3vg'])}.",
        })
    elif d2074["case_3vh"] > 0:
        cases_2042.append({
            "Case": "3VH",
            "Rubrique": "Moins-value nette reportable (10 ans)",
            "À inscrire": f"{round(d2074['case_3vh']):,} €".replace(",", " "),
            "Indication": "Inscrire en POSITIF (sans signe moins).",
        })
    if d2086["cessions"]:
        if d2086["exonere_305"]:
            cases_2042.append({
                "Case": "3AN / 3BN",
                "Rubrique": "Plus ou moins-value sur actifs numériques",
                "À inscrire": "LAISSER VIDE (Exonéré ≤ 305 €)",
                "Indication": f"Total des cessions = {ui.eur(d2086['total_cessions_213'])} ≤ 305 €.",
            })
        elif d2086["case_3an"] > 0:
            cases_2042.append({
                "Case": "3AN",
                "Rubrique": "Plus-value imposable sur actifs numériques",
                "À inscrire": f"{round(d2086['case_3an']):,} €".replace(",", " "),
                "Indication": f"Total des cessions ({ui.eur(d2086['total_cessions_213'])}) > 305 €.",
            })
        elif d2086["case_3bn"] > 0:
            cases_2042.append({
                "Case": "3BN",
                "Rubrique": "Moins-value sur actifs numériques",
                "À inscrire": f"{round(d2086['case_3bn']):,} €".replace(",", " "),
                "Indication": "Inscrire en POSITIF en case 3BN.",
            })
    if choisis:
        cases_2042.append({
            "Case": "8UU",
            "Rubrique": "Comptes ouverts, détenus, utilisés ou clos à l'étranger",
            "À inscrire": "☑️ À COCHER",
            "Indication": f"{len(choisis)} compte(s) déclaré(s) sur l'annexe 3916 / 3916-bis.",
        })

    ui.tableau(pd.DataFrame(cases_2042))

    if sim["case_1ak"] is not None:
        st.markdown("**Note explicative à copier-coller pour la case `1AK` (Déclarant 1) :**")
        st.code(sim["note_1ak"], language="text")
    if couple and sim["case_1bk"] is not None:
        st.markdown("**Note explicative à copier-coller pour la case `1BK` (Déclarant 2) :**")
        st.code(sim["note_1bk"], language="text")

# --- VOLET 2 : FORMULAIRE 2047 (REVENUS ÉTRANGERS) ---
titre_2047 = (
    f"Ligne 250 / 2TR : {round(interets_etrangers):,} € ({pays_etranger})".replace(",", " ")
    if interets_etrangers > 0 else "Aucun intérêt étranger saisi"
)
with st.expander(f"📁 Formulaire 2047 (Revenus encaissés à l'étranger — {titre_2047})", expanded=False):
    st.markdown("📍 **Chemin sur impots.gouv.fr :** Étape 3 → Cocher *« Revenus encaissés à l'étranger par un contribuable domicilié en France »* → Annexe **2047**.")
    st.markdown("#### 🔹 Rubrique 2 : Revenus des valeurs et capitaux mobiliers imposables en France (Intérêts Revolut, etc.)")
    if interets_etrangers <= 0:
        st.info("Aucun intérêt étranger saisi : rien à remplir dans la Rubrique 2 de la 2047.")
    else:
        st.markdown("- **Lignes `232` à `238` :** `Laissez totalement VIDE` *(aucun crédit d'impôt conventionnel sur ces intérêts)*")
        st.markdown(f"- **Ligne `250` (Intérêts n'ouvrant pas droit à crédit d'impôt) :** Pays : `{pays_etranger}` | Montant : **`{ui.eur(interets_etrangers)}`**")
        st.markdown(f"- **Ligne `251` (Total) :** **`{ui.eur(interets_etrangers)}`**")
        st.markdown(f"- **Ligne `252` (Total à reporter en case `2TR` de la 2042) :** **`{round(interets_etrangers):,} €`**".replace(",", " "))

    st.markdown("#### 🔹 Cadre 3 : Plus-values de cession de valeurs mobilières de source étrangère (Swissquote)")
    if d2074["case_3vg"] > 0:
        st.markdown(
            f"- **Cadre 3 (Plus-values imposables en France) :** Pays : `Luxembourg / Suisse (Swissquote)` | "
            f"Plus-value nette : **`{round(d2074['case_3vg']):,} €`** *(reportée en case **`3VG`** de la 2042-C)*.".replace(",", " ")
        )
    else:
        st.info("Aucune plus-value nette imposable de valeurs mobilières à reporter au Cadre 3 cette année.")

# --- VOLET 3 : FORMULAIRE 2074 (ACTIONS, ETF, ETC) ---
titre_2074 = (
    f"{len(d2074['operations'])} cession(s) · Bilan : {ui.eur(d2074['bilan_net'])}"
    if d2074["operations"] else f"Aucune cession en {annee}"
)
with st.expander(f"📁 Formulaire 2074 / 2074-CMV (Plus-values Actions, ETF, ETC — {titre_2074})", expanded=False):
    if not d2074["operations"]:
        st.info(f"Aucune cession d'actions, d'ETF ou d'ETC détectée en {annee}.")
    else:
        st.markdown("#### 🔹 1. Synthèse du Formulaire 2074")
        if d2074["ligne_905"] > 0:
            st.markdown(f"- **Ligne `905` (Total des plus-values) :** **`{ui.eur(d2074['ligne_905'])}`**")
        if d2074["ligne_913"] > 0:
            st.markdown(f"- **Ligne `913` (Total des moins-values) :** **`{ui.eur(d2074['ligne_913'])}`**")
        st.markdown(f"- **Bilan net annuel (`905 − 913`) :** **`{ui.eur(d2074['bilan_net'])}`** → Case **`{'3VG' if d2074['bilan_net'] >= 0 else '3VH'}`** : **`{round(abs(d2074['bilan_net'])):,} €`**".replace(",", " "))

        st.divider()
        st.markdown("#### 🔹 2. Cadre 5 (ou 3) : Détail des cessions de valeurs mobilières (Lignes `511` à `524` par titre)")
        for a_info in d2074["par_actif"]:
            with st.container(border=True):
                st.markdown(f"**👉 Déclaration globale pour `{a_info['actif']}` ({a_info['nb_operations']} vente(s) en {annee})**")
                st.markdown(f"- **`511` — Désignation du titre et de l'intermédiaire :** `{a_info['ligne_511']}`")
                st.markdown(f"- **`512` — Date de la cession :** `{a_info['ligne_512']}`")
                st.markdown(f"- **`514` — Valeur unitaire de cession :** `{ui.eur(a_info['ligne_514'], 4)}`")
                st.markdown(f"- **`515` — Nombre de titres cédés :** `{ui.quantite(a_info['ligne_515'])}`")
                st.markdown(f"- **`516` (ou `513`) — Prix de cession global :** `{ui.eur(a_info['ligne_516'])}`")
                st.markdown("- **`517` — Frais de cession :** `0 €` *(déjà déduits du montant net)*")
                st.markdown(f"- **`518` — Prix de cession net :** `{ui.eur(a_info['ligne_518'])}`")
                st.markdown(f"- **`520` — Prix d'acquisition unitaire (PRU CUMP) :** `{ui.eur(a_info['ligne_520'], 4)}`")
                st.markdown(f"- **`521` (ou `519`) — Prix d'acquisition global :** `{ui.eur(a_info['ligne_521'])}`")
                st.markdown("- **`522` — Frais d'acquisition :** `0 €` *(déjà inclus dans le PRU)*")
                st.markdown(f"- **`523` — Prix de revient total :** `{ui.eur(a_info['ligne_523'])}`")
                signe_pv = "+" if a_info["ligne_524"] >= 0 else ""
                st.info(f"**`524` — Résultat pour `{a_info['actif']}` :** **{signe_pv}{ui.eur(a_info['ligne_524'])}**")

        st.divider()
        st.markdown("#### 🧭 3. Le GPS Fiscal : Cadres 11 et 12 de la 2074 (Imputation des moins-values)")
        if d2074["bilan_net"] < 0:
            st.warning(
                f"**Diagnostic :** Vous êtes en **perte nette globale** sur l'année ({ui.eur(d2074['bilan_net'])}).\n\n"
                f"1. Laissez le **Cadre 11** de la 2074 totalement **VIDE**.\n"
                f"2. Allez au **Cadre 12** (*« Suivi des moins-values reportables au 31/12/{annee} »*).\n"
                f"3. Sur la ligne de l'année **{annee}**, inscrivez : **`{round(d2074['case_3vh']):,} €`** (et reportez ce même montant en case **`3VH`** de la 2042-C).".replace(",", " ")
            )
        elif d2074["bilan_net"] > 0 and d2074["ligne_913"] > 0:
            st.success(
                f"**Diagnostic :** Vous êtes en **gain net** sur l'année (**+{ui.eur(d2074['bilan_net'])}**), "
                f"mais vous avez subi des moins-values (**{ui.eur(d2074['ligne_913'])}**) sur certains titres qu'il faut imputer sur vos plus-values :\n\n"
                "1. ⚠️ **Laissez le Bloc `1132` totalement VIDE.**\n"
                "2. 👉 **Remplissez le Bloc `1133` exactement avec les colonnes ci-dessous :**"
            )
            df_c11 = pd.DataFrame([{
                "Titre (Bloc 1133)": r["Titre (Bloc 1133)"],
                "Col A (Gain)": ui.eur(r["Col A — Gain (€)"]),
                "Col B (Perte imputée)": ui.eur(r["Col B — Perte de l'année imputée (€)"]),
                "Col C (A − B)": ui.eur(r["Col C — Solde (A − B) (€)"]),
                "Col D (Pertes antérieures)": ui.eur(r["Col D — Pertes antérieures (€)"]),
                "Col E (Gain net C − D)": ui.eur(r["Col E — Gain net imposable (C − D) (€)"]),
                "Col F/G (Abattement)": "0,00 € (titres acquis après 2018)",
            } for r in d2074["cadre_11"]])
            ui.tableau(df_c11)
        elif d2074["bilan_net"] > 0 and d2074["ligne_913"] == 0:
            st.success(
                f"**Diagnostic :** Vous êtes en **gain net** (**+{ui.eur(d2074['bilan_net'])}**) et vous n'avez subi **aucune moins-value** boursière en {annee}.\n\n"
                "- Dans le **Cadre 11**, remplissez uniquement la **Colonne A** (ainsi que les **Colonnes C et E** avec le même montant).\n"
                "- **Colonnes F et G (Abattement pour durée de détention) :** `0 €` (les ETF/ETC et titres acquis après le 01/01/2018 n'ouvrent pas droit à abattement).\n"
                f"- Reportez **`{round(d2074['case_3vg']):,} €`** en case **`3VG`** de la 2042-C.".replace(",", " ")
            )

        st.divider()
        st.markdown(f"#### 🔎 4. Détail des {len(d2074['operations'])} opérations de vente {annee} date par date")
        ui.tableau(pd.DataFrame([{
            "Actif": op["actif"],
            "Date de vente": op["date"].strftime("%d/%m/%Y"),
            "Quantité vendue": ui.quantite(op["quantite"]),
            "PRU d'acquisition (€)": ui.eur(op["pru_unitaire_eur"], 4),
            "Coût d'acquisition (€)": ui.eur(op["acq_globale_eur"]),
            "Prix de cession net (€)": ui.eur(op["cession_globale_eur"]),
            "Plus-value (€)": ui.eur(op["plus_value_eur"]),
        } for op in d2074["operations"]]))

# --- VOLET 4 : FORMULAIRE 2086 (CRYPTOMONNAIES) ---
titre_2086 = (
    f"{len(d2086['cessions'])} cession(s) · Total cédé : {ui.eur(d2086['total_cessions_213'])} · Bilan : {ui.eur(d2086['plus_value_globale_224'])}"
    if d2086["cessions"] else f"Aucune cession en {annee}"
)
with st.expander(f"📁 Formulaire 2086 (Cryptomonnaies — Art. 150 VH bis — {titre_2086})", expanded=False):
    if not d2086["cessions"]:
        st.info(f"Aucune cession de cryptomonnaie détectée en {annee}.")
    else:
        st.markdown(
            f"**Synthèse {annee} :** **{len(d2086['cessions'])} cession(s)** · "
            f"Total des prix de cession (cumul lignes `213`) = **`{ui.eur(d2086['total_cessions_213'])}`** · "
            f"Résultat net global (cumul lignes `224`) = **`{ui.eur(d2086['plus_value_globale_224'])}`**."
        )
        if d2086["exonere_305"]:
            st.success(
                f"✅ **Franchise de 305 € (CGI art. 150 VH bis) :** Le total de vos prix de cession en {annee} "
                f"(`{ui.eur(d2086['total_cessions_213'])}`) ne dépasse pas **305 €**. Vous êtes **exonéré** : "
                "laissez les cases `3AN` et `3BN` vides, mais remplissez quand même l'annexe **2086** ci-dessous."
            )
        elif d2086["case_3an"] > 0:
            st.info(
                f"👉 Reportez **`{round(d2086['case_3an']):,} €`** en case **`3AN`** de la déclaration 2042-C.".replace(",", " ")
            )
        elif d2086["case_3bn"] > 0:
            st.info(
                f"👉 Reportez **`{round(d2086['case_3bn']):,} €`** (en positif) en case **`3BN`** de la déclaration 2042-C.".replace(",", " ")
            )

        for idx_c, c in enumerate(d2086["cessions"], start=1):
            with st.container(border=True):
                st.markdown(
                    f"**🪙 Cession #{idx_c} — Vente du `{c['ligne_211']}` (`{ui.quantite(c['quantite'], 8)} {c['actif']}`)**"
                )
                st.markdown(f"- **`211` — Date de la cession :** `{c['ligne_211']}`")
                st.markdown(f"- **`212` — Valeur globale du portefeuille d'actifs numériques à la date de cession :** `{round(c['ligne_212']):,} €` *(exact : {ui.eur(c['ligne_212'])})*".replace(",", " "))
                st.markdown(f"- **`213` — Prix de cession :** `{round(c['ligne_213']):,} €` *(exact : {ui.eur(c['ligne_213'])})*".replace(",", " "))
                st.markdown("- **`214` — Frais de cession :** `0 €` *(déjà déduits du montant net)*")
                st.markdown(f"- **`215` — Prix de cession net des frais :** `{round(c['ligne_215']):,} €` *(exact : {ui.eur(c['ligne_215'])})*".replace(",", " "))
                st.markdown("- **`216` — Soulte reçue ou versée :** `0 €`")
                st.markdown(f"- **`217` — Prix de cession net des soultes :** `{round(c['ligne_217']):,} €` *(exact : {ui.eur(c['ligne_217'])})*".replace(",", " "))
                st.markdown(f"- **`218` — Prix de cession net des frais et soultes :** `{round(c['ligne_218']):,} €` *(exact : {ui.eur(c['ligne_218'])})*".replace(",", " "))
                st.markdown(f"- **`220` — Prix total d'acquisition du portefeuille :** `{round(c['ligne_220']):,} €` *(exact : {ui.eur(c['ligne_220'])})*".replace(",", " "))
                st.markdown(f"- **`221` — Fractions de capital initial déduites lors des cessions antérieures :** `{round(c['ligne_221']):,} €` *(exact : {ui.eur(c['ligne_221'])})*".replace(",", " "))
                st.markdown("- **`222` — Soultes reçues en cas d'échanges antérieurs :** `0 €`")
                st.markdown(f"- **`223` — Prix total d'acquisition net (`220 − 221`) :** `{round(c['ligne_223']):,} €` *(exact : {ui.eur(c['ligne_223'])})*".replace(",", " "))
                signe_c = "+" if c["ligne_224"] >= 0 else ""
                st.info(
                    f"**`224` — Plus-value ou moins-value de la cession (`213 − 223 × 213 / 212`) :** "
                    f"**{signe_c}{round(c['ligne_224']):,} €** *(exact : {signe_c}{ui.eur(c['ligne_224'])})*".replace(",", " ")
                )

# --- VOLET 5 : FORMULAIRE 3916 / 3916-BIS (COMPTES À L'ÉTRANGER) ---
with st.expander(f"📁 Formulaire 3916 / 3916-bis (Comptes à l'étranger — {len(choisis)} compte(s) à déclarer & Case 8UU)", expanded=False):
    st.markdown(
        "📍 **Chemin sur impots.gouv.fr :** Étape 3 → Onglet **« Divers »** → Cocher la case **`8UU`** "
        "(*« Comptes ouverts, détenus, utilisés ou clos à l'étranger »*), puis valider une fiche **3916 / 3916-bis** par compte."
    )
    if not choisis:
        st.warning("Aucun compte à l'étranger coché ci-dessus.")
    else:
        for idx_c, cpt in enumerate(choisis, start=1):
            st.markdown(f"- **Fiche #{idx_c} :** `{cpt}` — Usage : `Personnel uniquement`.")
        st.warning(
            "⚠️ **Sanction en cas d'oubli (CGI art. 1649 A & 1736) :** **1 500 € d'amende par compte et par an**, "
            "même si le compte n'a généré aucun revenu ou aucune opération dans l'année."
        )

# ---------------------------------------------------------------------------
# 4. RECOMMANDATION PFU vs BARÈME, BILAN DE L'IMPÔT & TAUX DE PAS
# ---------------------------------------------------------------------------
st.divider()
st.subheader("💡 4. Arbitrage PFU vs Barème, Bilan de votre Impôt & Taux de Prélèvement à la Source")

arb = sim["arbitrage"]
if arb is not None:
    st.markdown("#### ⚖️ Flat Tax (PFU) ou Barème Progressif (Case `2OP`) ?")
    ca1, ca2 = st.columns(2)
    with ca1:
        st.markdown(f"**Option 1 — Flat Tax (PFU {pfu_taux * 100:.1f} %)**")
        st.metric(f"Impôt sur le revenu ({fb.IR_FORFAITAIRE * 100:.1f} %)", ui.eur(arb["pfu"]["ir"]))
        st.metric(f"Prélèvements sociaux ({ps_taux * 100:.1f} %)", ui.eur(arb["pfu"]["ps"]))
        st.metric("Coût total avec la Flat Tax", ui.eur(arb["pfu"]["total"]))
    with ca2:
        st.markdown("**Option 2 — Barème Progressif (Case `2OP` cochée)**")
        st.metric("Supplément d'IR au barème (après décote)", ui.eur(arb["bareme"]["ir_marginal"]))
        st.metric(f"Prélèvements sociaux ({ps_taux * 100:.1f} %)", ui.eur(arb["bareme"]["ps"]))
        st.metric("CSG déductible (6,8 %)", ui.eur(-arb["bareme"]["csg_deductible"]))
        st.metric("Coût total avec le Barème", ui.eur(arb["bareme"]["total"]))

    if sim["cocher_2op"]:
        st.success(
            f"✅ **Recommandation : COCHEZ la case `2OP` (Barème Progressif) !** "
            f"Le barème vous coûte **{ui.eur(arb['bareme']['total'])}** contre **{ui.eur(arb['pfu']['total'])}** "
            f"au PFU, soit une économie nette de **{ui.eur(arb['gain'])}** "
            f"(grâce à votre quotient familial de `{parts}` parts et à la décote)."
        )
    else:
        st.success(
            f"✅ **Recommandation : NE COCHEZ PAS la case `2OP` (conservez la Flat Tax / PFU) !** "
            f"La Flat Tax vous coûte **{ui.eur(arb['pfu']['total'])}** contre **{ui.eur(arb['bareme']['total'])}** "
            f"au barème, soit une économie de **{ui.eur(arb['gain'])}**."
        )

st.markdown("#### 📌 Bilan complet de votre Impôt sur le Revenu")
b1, b2, b3, b4 = st.columns(4)
b1.metric(
    "Revenu net imposable (salaires)",
    ui.eur(sim["revenu_net_imposable_salaires"], 0),
    help=f"Après déduction de {ui.eur(sim['deduction_1'], 0)} (Vous) et {ui.eur(sim['deduction_2'], 0)} (Conjoint).",
)
b2.metric(
    "Impôt sur les salaires (après décote)",
    ui.eur(sim["ir_salaires"].impot_net),
    help=f"Impôt brut : {ui.eur(sim['ir_salaires'].impot_brut)} − Décote : {ui.eur(sim['ir_salaires'].decote)}.",
)
b3.metric(
    "Impôt + PS sur revenus du capital",
    ui.eur(sim["impot_capital_retenu"]),
    help="Plus-values mobilières (3VG), intérêts étrangers (2TR) et plus-values crypto imposables (3AN).",
)
b4.metric(
    "Impôt + PS total du foyer",
    ui.eur(sim["impot_total_foyer"]),
    delta=f"TMI : {sim['ir_salaires'].tmi * 100:.0f} %",
)

st.markdown("#### 👨‍👩‍👧‍👦 Taux de Prélèvement à la Source (PAS)")
p1, p2, p3 = st.columns(3)
p1.info(f"👨‍👩‍👧‍👦 **Taux de PAS du foyer (taux non personnalisé) :** **{sim['taux_pas_foyer'] * 100:.2f} %**")
if couple:
    p2.info(f"👤 **Taux individualisé estimé (Vous — 1 part) :** **{sim['taux_pas_1'] * 100:.2f} %**")
    p3.info(f"👤 **Taux individualisé estimé (Conjoint — 1 part) :** **{sim['taux_pas_2'] * 100:.2f} %**")
else:
    p2.info(f"👤 **Taux personnalisé estimé :** **{sim['taux_pas_foyer'] * 100:.2f} %**")
