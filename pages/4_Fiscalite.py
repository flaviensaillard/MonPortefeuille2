"""Fiscalité — simulation indicative et aide au report des revenus connus.\n\nLes montants du portefeuille ne certifient ni l'ensemble des opérations du foyer,\nni le précompte RCM, ni les soultes crypto. Les repères 2074/2086 2025 suivent\nles imprimés DGFiP ; 903 = cessions déterminées par vous-même, 905 = instruments\nà terme et 913 = total du cadre. Voir docs/FORMULAIRES-FISCAUX-2.2.7.md.\n"""

from __future__ import annotations

import datetime as dt
import importlib

import pandas as pd
import streamlit as st

from core import foyer
from core import db, models
from core import fiscal_bars as fb
from core import fiscal_presentation as presentation
from core import guide_fiscal as guide
from core import session as S, tax
from core import ui

if not hasattr(fb, "verifier_maj_baremes_fiscaux") or not hasattr(fb, "generer_prompt_maj_baremes") or not hasattr(models, "verifier_allocation_cible") or not hasattr(tax, "_QF_CORRIGE_197") or not hasattr(ui, "_NAV_V2"):
    importlib.reload(models)
    importlib.reload(db)
    importlib.reload(fb)
    importlib.reload(tax)
    importlib.reload(ui)
    importlib.reload(S)

st.set_page_config(page_title="Fiscalité", page_icon="🏛️", layout="wide")
ui.styliser_navigation()
st.title("🏛️ Simulation fiscale & aide aux formulaires")
st.caption(
    "Les saisies et transactions de l'application fournissent directement vos "
    "montants connus. Les autres membres du foyer, comptes externes, précomptes, "
    "soultes et crédits d'impôt non enregistrés ne sont pas inventés. Les revenus "
    "2026 et suivants restent provisoires tant que leurs imprimés ne sont pas vérifiés."
)

ctx = S.charger()
for err in ctx.erreurs:
    st.error(err)
if ctx.erreurs:
    st.stop()

# ---------------------------------------------------------------------------
# Chargement de la configuration fiscale mémorisée dans Supabase (`Config`)
# ---------------------------------------------------------------------------
try:
    if "cfg_fiscale" not in st.session_state:
        st.session_state.cfg_fiscale = db.lire_config_fiscale()
except db.ErreurConfigFiscale as exc:
    st.error(f"Configuration fiscale illisible : {exc}. Aucun calcul n'est lancé sur des valeurs de repli.")
    st.stop()
cfg = st.session_state.cfg_fiscale


def _int_cfg(cle: str, defaut: int) -> int:
    """Donnée d'identité du foyer (sans année). Défaut neutre si absente."""
    v = foyer.as_float(cfg.get(cle))
    return defaut if v is None else int(v)


# Données annuelles : TOUJOURS celles de l'année sélectionnée (voir core/foyer.py).
# Une lacune donne le défaut neutre ; aucune valeur d'une autre année n'est lue.
def _annuel_float(cle: str, defaut: float = 0.0) -> float:
    v = foyer.as_float(foyer.valeur_annuelle(cfg, cle, annee))
    return defaut if v is None else v


def _annuel_int(cle: str, defaut: int = 0) -> int:
    v = foyer.as_float(foyer.valeur_annuelle(cfg, cle, annee))
    return defaut if v is None else int(v)


def _annuel_bool(cle: str, defaut: bool = False) -> bool:
    brut = foyer.valeur_annuelle(cfg, cle, annee)
    return defaut if brut is None else foyer.as_bool(brut)


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
    f"""<div style="background-color:rgba(30,41,59,0.75);color:#ffffff;border-radius:10px;padding:12px 16px;margin-bottom:14px;border-left:5px solid #2ecc71;font-size:0.93rem;">\n    <strong>Barèmes intégrés — Revenus {annee} (déclaration {annee + 1})</strong><br>\n    <span style="font-size:0.86rem;opacity:0.9;">\n    • <b>Tranches IR {annee}</b> : 0 % jusqu'à {bareme_ir.tranches[0]:,.0f} € · 11 % jusqu'à {bareme_ir.tranches[1]:,.0f} € · 30 % jusqu'à {bareme_ir.tranches[2]:,.0f} € · 41 % jusqu'à {bareme_ir.tranches[3]:,.0f} € · 45 % au-delà<br>\n    • <b>Décote {annee}</b> : Célibataire (base {bareme_ir.decote_base_celibataire:,.0f} €, plafond {bareme_ir.decote_plafond_celibataire:,.0f} €) · Couple (base {bareme_ir.decote_base_couple:,.0f} €, plafond {bareme_ir.decote_plafond_couple:,.0f} €)<br>\n    • <b>PFU des plus-values mobilières {annee}</b> : {fb.IR_FORFAITAIRE * 100:.1f} % IR + {ps_taux * 100:.1f} % PS = <b>{pfu_taux * 100:.1f} %</b> (revenus précomptés : taux distinct)<br>\n    • <b>Frais professionnels {annee}</b> : Barème kilométrique officiel URSSAF/DGFiP (3 à 7+ CV) · Forfait repas : <b>{repas_unit:.2f} €/repas</b>\n    </span>\n    </div>""".replace(",", " "),
    unsafe_allow_html=True,
)

etat_maj_baremes = fb.verifier_maj_baremes_fiscaux(annee)
if etat_maj_baremes.get("etat") == "sonde_indisponible":
    st.warning("⚠️ **Veille des barèmes indisponible.** " + etat_maj_baremes["message"])
elif etat_maj_baremes["disponible"]:
    st.markdown(
        f"""<a href="{etat_maj_baremes['url']}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:block;">
        <div style="background-color:rgba(245,158,11,0.18);color:#fbbf24;border-radius:10px;padding:12px 16px;margin-bottom:10px;border-left:5px solid #f59e0b;font-size:0.93rem;cursor:pointer;">
        <strong>🔔 Vérification fiscale requise</strong><br>
        <span style="font-size:0.88rem;color:#ffffff;">{etat_maj_baremes['message']}</span><br>
        <span style="text-decoration:underline;font-weight:600;color:#38bdf8;">👉 Cliquez ici pour ouvrir votre assistant Arena et mettre à jour les barèmes fiscaux ↗</span>
        </div></a>""",
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        f"""<div style="background-color:rgba(56,189,248,0.10);color:#e2e8f0;border-radius:10px;padding:10px 16px;margin-bottom:10px;border-left:5px solid #38bdf8;font-size:0.88rem;">
        ✅ <strong>État des barèmes fiscaux :</strong> {etat_maj_baremes['message']}
        </div>""",
        unsafe_allow_html=True,
    )

with st.expander("🤖 Prompt à copier-coller dans l'IA pour générer le nouveau fichier des barèmes (`core/fiscal_bars.py`)", expanded=False):
    st.caption(
        "Cliquez sur l'icône de copie en haut à droite du cadre ci-dessous, puis "
        f"[ouvrez votre assistant Arena ↗]({fb.URL_ASSISTANT_MAJ_BAREMES}) et collez ce prompt :"
    )
    st.code(fb.generer_prompt_maj_baremes(annee), language="markdown")

if annee == 2026:
    st.warning("Les barèmes et la décote pour les revenus 2026 sont provisoires : déclaration 2027 à revérifier.")
st.warning("Le quotient familial ne couvre que le plafonnement général. Si vous êtes parent isolé ou bénéficiez d'une demi-part particulière, ne vous fiez pas au bilan ni à la recommandation 2OP de ce simulateur.")
st.info(
    "**Périmètres distincts :** les titres et cessions chargés ici sont ceux de votre "
    "portefeuille personnel, dont vous êtes le seul propriétaire. Votre mariage ne rend "
    "pas votre épouse codétentrice de ces titres. Le calcul de l'IR utilise en revanche "
    "les salaires saisis pour les deux déclarants du foyer. Les options 2OP/3CN et le "
    "seuil de cessions crypto s'apprécient à l'échelle du foyer : vérifiez séparément "
    "tout autre revenu ou toute autre cession éventuels du conjoint, sans en présumer l'existence."
)

# ---------------------------------------------------------------------------
# 1. Paramètres du foyer : Situation familiale & Déclaration de base (repliables)
# ---------------------------------------------------------------------------
st.divider()
st.subheader("⚙️ 1. Vos paramètres fiscaux (cliquez pour déplier et modifier)")
st.caption(
    "Vos paramètres sont chargés depuis votre base Supabase (`Config`) et "
    "sauvegardés automatiquement dès que vous les modifiez."
)

statut_defaut = cfg.get("f_statut", "Célibataire / Divorcé(e) / Veuf(ve)")
options_statut = ["Marié(e) / Pacsé(e)", "Célibataire / Divorcé(e) / Veuf(ve)"]
idx_statut = 0 if ("Mari" in statut_defaut or "Pacs" in statut_defaut) else 1
enf_defaut = _int_cfg("f_enf", 0)
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

s1_def = _annuel_float("f_s1", 0.0)
s2_def = _annuel_float("f_s2", 0.0)
int_def = _annuel_float("f_int_net", 0.0)
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
            value=_annuel_bool("f_u1", False),
        )
        if use_frais_1:
            k1_c1, k1_c2, k1_c3 = st.columns(3)
            km_1 = float(k1_c1.number_input(
                "Km annuels parcourus ✍️", min_value=0, max_value=100000,
                value=_annuel_int("f_k1", 0), step=500, key="km1",
            ))
            cv_1_init = min(max(_annuel_int("f_cv1", 0), 3), 7)
            cv_1 = int(k1_c2.selectbox(
                "Puissance fiscale (CV) ✍️", [3, 4, 5, 6, 7],
                index=[3, 4, 5, 6, 7].index(cv_1_init), key="cv1",
            ))
            repas_1 = int(k1_c3.number_input(
                "Jours repas hors domicile ✍️", min_value=0, max_value=365,
                value=_annuel_int("f_r1", 0), step=10, key="rep1",
            ))
            elec_1 = st.checkbox(
                "Véhicule 100 % électrique (+20 %)", value=_annuel_bool("f_elec1", False), key="el1",
            )
        else:
            km_1, cv_1, repas_1, elec_1 = float(_annuel_int("f_k1", 0)), _annuel_int("f_cv1", 0), _annuel_int("f_r1", 0), False

    with col_d2:
        if couple:
            st.markdown("**Déclarant 2 (Conjoint)**")
            salaire_2 = float(st.number_input(
                "Salaire net imposable — Déclarant 2 (€) → Case 1BJ ✍️",
                min_value=0.0, value=s2_def, step=500.0,
            ))
            use_frais_2 = st.checkbox(
                "Calculer les frais réels (kilomètres + repas) — Conjoint",
                value=_annuel_bool("f_u2", False),
            )
            if use_frais_2:
                k2_c1, k2_c2, k2_c3 = st.columns(3)
                km_2 = float(k2_c1.number_input(
                    "Km annuels parcourus ✍️", min_value=0, max_value=100000,
                    value=_annuel_int("f_k2", 0), step=500, key="km2",
                ))
                cv_2_init = min(max(_annuel_int("f_cv2", 0), 3), 7)
                cv_2 = int(k2_c2.selectbox(
                    "Puissance fiscale (CV) ✍️", [3, 4, 5, 6, 7],
                    index=[3, 4, 5, 6, 7].index(cv_2_init), key="cv2",
                ))
                repas_2 = int(k2_c3.number_input(
                    "Jours repas hors domicile ✍️", min_value=0, max_value=365,
                    value=_annuel_int("f_r2", 0), step=10, key="rep2",
                ))
                elec_2 = st.checkbox(
                    "Véhicule 100 % électrique (+20 %)", value=_annuel_bool("f_elec2", False), key="el2",
                )
            else:
                km_2, cv_2, repas_2, elec_2 = float(_annuel_int("f_k2", 0)), _annuel_int("f_cv2", 0), _annuel_int("f_r2", 0), False
        else:
            salaire_2, use_frais_2, km_2, cv_2, repas_2, elec_2 = 0.0, False, 0.0, 5, 0, False

    cont_frais_reels = st.container()

    st.divider()
    st.markdown("#### 🌍 Revenus d'intérêts étrangers & Comptes détenus hors de France")
    ce1, ce2 = st.columns(2)
    with ce1:
        pays_etranger = st.text_input(
            "Pays d'origine des intérêts étrangers (ex. Lituanie pour Revolut) ✍️",
            value=str(cfg.get("f_pays_etr", "")),
        )
        interets_etrangers = float(st.number_input(
            "Intérêts nets encaissés à l'étranger (€) → 2047 Ligne 250 & 2042 Case 2TR ✍️",
            min_value=0.0, value=int_def, step=10.0,
        ))
        statut_ps_interets = (st.selectbox(
            f"PS des intérêts {annee} déjà précomptés lors du versement ?",
            ["À préciser", "Oui — déjà précomptés", "Non — pas précomptés"],
            key=f"ps_interets_{annee}",
            help="Vérifiez le justificatif du versement : le pays de l'établissement ne permet pas de déduire le précompte.",
        ) if interets_etrangers > 0 else "À préciser")
        interets_ps_precomptes = {"Oui — déjà précomptés": True,
                                  "Non — pas précomptés": False}.get(statut_ps_interets)
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

# ---------------------------------------------------------------------------
# Enregistrement EXPLICITE des données de l'année (2.1.0 — T-07)
# ---------------------------------------------------------------------------
# Plus d'écriture automatique : une valeur par défaut ne doit jamais devenir une donnée.
params_foyer = {
    "f_statut": statut, "f_enf": enfants, "f_parts": parts, "f_pays_etr": pays_etranger,
    "f_s1": salaire_1, "f_s2": salaire_2, "f_int_net": interets_etrangers,
    "f_u1": use_frais_1, "f_k1": int(km_1), "f_cv1": cv_1, "f_r1": repas_1, "f_elec1": elec_1,
    "f_u2": use_frais_2, "f_k2": int(km_2), "f_cv2": cv_2, "f_r2": repas_2, "f_elec2": elec_2,
}
st.divider()
st.subheader(f"💾 Données de l'année {annee}")
confirmee_saisie = st.checkbox(
    f"Je confirme que ces montants et options sont ceux de l'année {annee}, et non ceux d'une autre année.",
    value=foyer.est_confirmee(cfg, annee),
    key=f"confirme_{annee}",
)
if st.button(f"Enregistrer les données de {annee}", key=f"enregistrer_{annee}", type="primary"):
    try:
        db.sauver_config_fiscale(foyer.modifs_sauvegarde(params_foyer, annee, confirmee_saisie))
    except db.ErreurConfigFiscale as exc:
        st.error(f"Enregistrement refusé : {exc}")
    else:
        st.session_state.cfg_fiscale = db.lire_config_fiscale()
        st.rerun()

# ---------------------------------------------------------------------------
# Inventaire crypto hors application (formulaire 2086 — T-02)
# ---------------------------------------------------------------------------
COLONNES_INVENTAIRE = ["id", "date", "actif", "quantite", "cout_acquisition_eur", "source"]
with st.expander("🪙 Crypto-actifs détenus hors de l'application (2086, valeur globale)", expanded=False):
    st.caption(
        "Une ligne = un solde de référence hors application : la quantité détenue à cette "
        "date (plateforme, wallet…) et le prix d'acquisition cumulé de cette position. "
        "Un actif déclaré sans solde à la date d'une vente bloque le calcul : déclarez un "
        "solde à une date antérieure (quantité 0 si rien n'était détenu)."
    )
    try:
        inv_brut = db.inventaire_crypto()
    except Exception as exc:
        st.error(f"Inventaire crypto illisible : {exc}")
        st.stop()
    if inv_brut is None or inv_brut.empty:
        vue_inv = pd.DataFrame(columns=COLONNES_INVENTAIRE)
    else:
        vue_inv = inv_brut[COLONNES_INVENTAIRE].copy()
        vue_inv["date"] = pd.to_datetime(vue_inv["date"]).dt.date
    edite_inv = st.data_editor(
        vue_inv,
        key="editeur_inventaire_crypto",
        num_rows="dynamic",
        hide_index=True,
        column_config={
            "id": st.column_config.NumberColumn("id", disabled=True),
            "date": st.column_config.DateColumn("Date du solde", required=True),
            "actif": st.column_config.TextColumn("Actif (ticker)", required=True),
            "quantite": st.column_config.NumberColumn("Quantité", min_value=0.0, required=True),
            "cout_acquisition_eur": st.column_config.NumberColumn(
                "Prix d'acquisition cumulé (€)", min_value=0.0, required=True),
            "source": st.column_config.TextColumn("Plateforme / wallet"),
        },
    )
    if st.button("Enregistrer l'inventaire crypto", key="enregistrer_inventaire"):
        apres: list[dict] = []
        for _, r in edite_inv.iterrows():
            if pd.isna(r["date"]) or not str(r["actif"] or "").strip():
                continue
            cout = r["cout_acquisition_eur"]
            ligne = {
                "date": pd.Timestamp(r["date"]).date().isoformat(),
                "actif": str(r["actif"]).strip(),
                "quantite": float(r["quantite"]),
                "cout_acquisition_eur": None if pd.isna(cout) else float(cout),
                "source": "" if pd.isna(r["source"]) else str(r["source"]).strip(),
            }
            if not pd.isna(r["id"]):
                ligne["id"] = int(r["id"])
            apres.append(ligne)
        avant = [{"id": int(i)} for i in vue_inv["id"].dropna()]
        a_ecrire, a_supprimer = foyer.diff_inventaire(avant, apres)
        try:
            db.enregistrer_inventaire_crypto(a_ecrire, a_supprimer)
        except Exception as exc:
            st.error(f"Inventaire refusé : {exc}")
        else:
            st.rerun()


def _lignes_inventaire(df) -> list[dict]:
    """Inventaire tel qu'attendu par le moteur fiscal : un manquant reste manquant."""
    if df is None or df.empty:
        return []
    lignes = []
    for r in df.to_dict("records"):
        cout = r.get("cout_acquisition_eur")
        source = r.get("source")
        lignes.append({
            "actif": r.get("actif"),
            "date": r.get("date"),
            "quantite": r.get("quantite"),
            "cout_acquisition_eur": None if pd.isna(cout) else cout,
            "source": "" if pd.isna(source) else source,
        })
    return lignes


# ---------------------------------------------------------------------------
# Le formulaire et la simulation ne s'affichent qu'avec des données ENREGISTRÉES,
# CONFIRMÉES pour l'année choisie. Rien n'est repris d'une autre année.
# ---------------------------------------------------------------------------
lacunes_annee = foyer.lacunes(cfg, annee)
if lacunes_annee:
    st.warning(
        f"**Aucune donnée complète enregistrée pour {annee}** (manquantes : "
        f"{', '.join(lacunes_annee)}). Les valeurs d'une autre année ne sont PAS reprises."
    )
    reprise = foyer.reprise_sans_millesime(cfg, annee)
    if reprise and st.button(f"Reprendre les anciennes valeurs sans année, pour {annee}", key=f"reprise_{annee}"):
        db.sauver_config_fiscale(reprise)
        st.session_state.cfg_fiscale = db.lire_config_fiscale()
        st.rerun()
    st.info(
        "Saisissez les données de cette année, enregistrez-les et confirmez-les. "
        "Les anciennes valeurs sans année ne servent qu'en cas de reprise explicite ci-dessus."
    )
    st.stop()
if not foyer.est_confirmee(cfg, annee):
    st.info(f"Confirmez les données de {annee} (case ci-dessus) pour afficher les formulaires et la simulation.")
    st.stop()

# ---------------------------------------------------------------------------
# Calculs complets : 2074 (Actions/ETF), 2086 (Crypto), 2042 & Simulation Foyer
# ---------------------------------------------------------------------------
d2074 = tax.detail_2074_de_lannee(ctx.transactions, annee)
d2086 = tax.detail_2086_de_lannee(ctx.transactions, annee, inventaire=_lignes_inventaire(inv_brut))

# 2.1.0 (revue, constat 6) : les ventes supérieures à la position détenue sont
# écartées des formulaires et annoncées — jamais chiffrées en silence.
_excedents = list(d2074.get("ventes_excedentaires", [])) + list(d2086.get("ventes_excedentaires", []))
if _excedents:
    st.warning(
        "**Vente(s) supérieure(s) à la position détenue — écartée(s) du calcul fiscal.** "
        "Aucun chiffre n'a été calculé dessus.\n\n" + "\n\n".join(f"- {m}" for m in _excedents)
    )

bilan_calculable = presentation.calculable(d2074) and presentation.calculable(d2086)
precompte_connu = interets_etrangers <= 0 or interets_ps_precomptes is not None
messages_bilan = []
if not bilan_calculable:
    messages_bilan.extend(d2074["indisponible"] + d2086["indisponible"])
    messages_bilan.append(
        "**Bilan d'impôt indisponible** : cours, position ou cession manquante. "
        "Aucun 903/224 partiel n'est proposé ; les autres catégories restent visibles."
    )
if not precompte_connu:
    messages_bilan.append(
        "**Bilan d'impôt indisponible** : précisez si les PS de vos intérêts "
        "ont été précomptés. Le pays du courtier ne suffit pas à le déterminer."
    )

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
    interets_ps_precomptes=interets_ps_precomptes,
    bilan_pv_actions_eur=d2074["bilan_net"],
    bilan_pv_crypto_imposable_eur=d2086["case_3an"],
) if bilan_calculable and precompte_connu else None

# L'IR n'est pas calculé avec un faux 0 pour forcer le passage. En revanche
# 1AJ/1AK/1BJ/1BK peuvent être déterminées depuis les saisies CONFIRMÉES.
salaires = presentation.salaires_confirmes(annee, [
    {"salaire": salaire_1, "reels": use_frais_1, "km": km_1,
     "cv": cv_1, "repas": repas_1, "electrique": elec_1},
    *([{"salaire": salaire_2, "reels": use_frais_2, "km": km_2,
        "cv": cv_2, "repas": repas_2, "electrique": elec_2}] if couple else []),
]) if sim is None else []

with cont_frais_reels:
    if sim is None:
        st.info("Frais réels 1AK/1BK calculables depuis les saisies confirmées ci-dessous ; "
                "comparaison IR et recommandation 2OP/3CN suspendues.")
    else:
        if use_frais_1 or use_frais_2:
            st.warning(
                "Frais réels : simulation non certifiée. Vérifiez que les trajets sont professionnels "
                "et la règle des 40 km, ainsi que les conditions des repas (hors domicile imposé, "
                "cantine, justificatifs, participation employeur). Le forfait de repas ne s'applique "
                "pas automatiquement à tous les repas ; ne recopiez pas ces montants sans contrôle."
            )
        res_f1, res_f2 = st.columns(2)
        with res_f1:
            if sim["retenir_frais_reels_1"]:
                st.warning(
                    f"⚠️ **Vous — Frais réels estimés : {ui.eur(sim['frais_reels_1'], 0)}** "
                    f"(plus avantageux que l'abattement 10 % de {ui.eur(sim['abattement_10_1'], 0)}, "
                    f"soit **+{ui.eur(sim['frais_reels_1'] - sim['abattement_10_1'], 0)}** de déduction supplémentaire).\n\n"
                    f"Montant indicatif `{sim['case_1ak']} €` pour la case `1AK`, à contrôler avant déclaration "
                    f"({sim['frais_km_formule_1']} · {sim['frais_repas_formule_1']})."
                )
            else:
                st.info(
                    f"ℹ️ **Vous — Abattement automatique de 10 % retenu : {ui.eur(sim['abattement_10_1'], 0)}** "
                        f"(frais réels estimés : {ui.eur(sim['frais_reels_1'], 0)}). **Vérifiez la case `1AK` avant déclaration.**"
                )
        with res_f2:
            if couple and salaire_2 > 0:
                if sim["retenir_frais_reels_2"]:
                    st.warning(
                        f"⚠️ **Conjoint — Frais réels estimés : {ui.eur(sim['frais_reels_2'], 0)}** "
                        f"(plus avantageux que l'abattement 10 % de {ui.eur(sim['abattement_10_2'], 0)}, "
                        f"soit **+{ui.eur(sim['frais_reels_2'] - sim['abattement_10_2'], 0)}** de déduction supplémentaire).\n\n"
                        f"Montant indicatif `{sim['case_1bk']} €` pour la case `1BK`, à contrôler avant déclaration "
                        f"({sim['frais_km_formule_2']} · {sim['frais_repas_formule_2']})."
                    )
                else:
                    st.info(
                        f"ℹ️ **Conjoint — Abattement automatique de 10 % retenu : {ui.eur(sim['abattement_10_2'], 0)}** "
                            f"(frais réels estimés : {ui.eur(sim['frais_reels_2'], 0)}). **Vérifiez la case `1BK` avant déclaration.**"
                    )

# ---------------------------------------------------------------------------
# 2. VOS FORMULAIRES DE DÉCLARATION (FERMÉS PAR DÉFAUT — CLIQUEZ POUR DÉPLOYER)
# ---------------------------------------------------------------------------
st.divider()
st.subheader(f"📁 2. Vos formulaires de déclaration {annee + 1} (revenus {annee})")
st.caption(
    "Revenus 2025 : imprimés DGFiP publiés pour la déclaration 2026. Les montants "
    "enregistrés dans l'application s'affichent directement ; seuls les éléments "
    "absents (foyer, précompte, soultes ou comptes externes) restent à préciser. "
    "Une année non vérifiée affiche des estimations NON reportables, sans cases 2025."
)

if annee != 2025:
    for message in messages_bilan:
        st.error(message)
    st.warning(
        f"**Formulaires de la déclaration {annee + 1} non vérifiés ici pour les revenus {annee}.** "
        "Les numéros de cases des revenus 2025 ne sont PAS transposés. Les montants "
        "ci-dessous sont des estimations sur les seules transactions connues de cette "
        "année : NON reportables, IFU, comptes et foyer à vérifier."
    )
    if presentation.calculable(d2074):
        with st.expander(f"Titres {annee} · estimation NON reportable (sans numéros de cases)", expanded=False):
            if d2074["par_actif"]:
                ui.tableau(pd.DataFrame([{
                    "Titre": g["actif"], "Ventes": g["cessions"],
                    "Prix brut": ui.eur(g["ligne_516"]), "Frais": ui.eur(g["ligne_517"]),
                    "Prix net": ui.eur(g["ligne_518"]), "Coût": ui.eur(g["ligne_523"]),
                    "Résultat connu": ui.eur(g["ligne_524"]),
                    "Gains des ventes": ui.eur(g["903_PV"]),
                    "Pertes des ventes": ui.eur(g["903_MV"]),
                } for g in presentation.titres_par_actif(d2074["par_actif"])]))
                st.caption("Dates réelles et résultats par vente :")
                for op in d2074["par_actif"]:
                    st.markdown(f"{op['actif']} · {op['ligne_512']} : "
                                f"{ui.eur(op['ligne_524'])} (estimation, non reportable)")
            else:
                st.info("Aucune vente de titre détectée dans ce portefeuille pour cette année.")
    else:
        st.error("Titres non chiffrables : " + " ; ".join(
            d2074["indisponible"] + d2074["ventes_excedentaires"]))
    if presentation.calculable(d2086):
        with st.expander(f"Crypto {annee} · estimation NON reportable (foyer/soultes inconnus)", expanded=False):
            if d2086["cessions"]:
                ui.tableau(pd.DataFrame([{
                    "Actif": g["actif"], "Ventes": g["cessions"],
                    "Prix brut": ui.eur(g["ligne_213"]), "Frais": ui.eur(g["ligne_214"]),
                    "Prix net si aucune soulte": ui.eur(g["ligne_218"]),
                    "Résultat intermédiaire": ui.eur(g["ligne_224"]),
                } for g in presentation.crypto_par_actif(d2086["cessions"])]))
                for op in d2086["cessions"]:
                    st.markdown(f"{op['actif']} · {op['ligne_211']} : "
                                f"{ui.eur(op['ligne_224'])} (estimation non reportable)")
            else:
                st.info("Aucune vente crypto détectée dans ce portefeuille pour cette année.")
    else:
        st.error("Crypto non chiffrable : " + " ; ".join(
            d2086["indisponible"] + d2086["ventes_excedentaires"]))
    st.caption("Comptes à l'étranger, IFU et justificatifs du foyer : vérifier "
               "les obligations et les imprimés de l'année concernée. Aucun numéro "
               "de formulaire futur n'est déduit de ceux des revenus 2025.")
else:
    # Revenus 2025 seulement : les saisies confirmées et les ventes connues
    # sont affichées AVANT les réserves propres aux autres membres du foyer.
    s = sim if sim is not None else {
        "case_1aj": salaires[0]["salaire"], "case_1ak": salaires[0]["frais"],
        "abattement_10_1": salaires[0]["abattement_10"],
        "note_1ak": "Frais réels calculés depuis vos saisies ; conditions kilométriques et repas à valider.",
        "case_1bj": salaires[1]["salaire"] if couple else None,
        "case_1bk": salaires[1]["frais"] if couple else None,
        "abattement_10_2": salaires[1]["abattement_10"] if couple else None,
        "note_1bk": "Frais réels calculés depuis vos saisies ; conditions kilométriques et repas à valider.",
    }
    titres_ok = presentation.calculable(d2074)
    crypto_ok = presentation.calculable(d2086)
    ventes_titres = titres_ok and bool(d2074["operations"])
    ventes_crypto = crypto_ok and bool(d2086["cessions"])

    st.markdown("#### Vos chiffres dans l'application · revenus 2025")
    st.caption("Salaires et intérêts confirmés dans la déclaration de base, cessions calculées "
               "depuis vos opérations enregistrées. Les informations réellement absentes sont "
               "signalées sous les chiffres ; aucun autre compte ou déclarant n'est présumé.")
    chiffres = st.columns(3)
    chiffres[0].metric("2042 · 1AJ", ui.eur(s["case_1aj"], 0))
    if interets_etrangers > 0:
        chiffres[1].metric("2042 · 2TR", ui.eur(interets_etrangers, 0))
    if ventes_titres:
        chiffres[2].metric("2042 C · 3VG (ces titres)", ui.eur(d2074["case_3vg"], 0))
        st.markdown(f"**2074 · 903/PV {ui.eur(d2074['ligne_903_pv'])} · "
                    f"903/MV {ui.eur(d2074['ligne_903_mv'])} · "
                    f"3VH {ui.eur(d2074['case_3vh'], 0)}** — ces titres uniquement.")
    if ventes_crypto:
        st.markdown(f"**2086 · 224 {ui.eur(d2086['plus_value_globale_224'])} · "
                    f"51 connue {ui.eur(d2086['total_cessions_218'])}** — estimation "
                    "sans soulte, pas le total du foyer.")
    st.caption("Ouvrez un imprimé ci-dessous, puis l'onglet « Cessions » pour les lignes "
               "de chaque vente. Une catégorie incomplète n'efface pas les autres chiffres.")
    for message in messages_bilan:
        st.error(message)

    # 2042 + 2042 C : afficher chaque case CHIFFRABLE, pas deux fausses cases
    # « indisponibles » à la place d'une catégorie entière.
    resume_2042 = f"1AJ {ui.eur(s['case_1aj'], 0)}"
    if ventes_titres:
        resume_2042 += f" · 3VG {ui.eur(d2074['case_3vg'], 0)} / 3VH {ui.eur(d2074['case_3vh'], 0)}"
    if ventes_crypto:
        resume_2042 += f" · crypto 224 estimée {ui.eur(d2086['plus_value_globale_224'])}"
    with st.expander(f"📁 Formulaire 2042 & 2042-C · cases issues de l'application ({resume_2042})", expanded=False):
        cases_2042 = [
            {"Case": "1AJ", "Rubrique": "Salaire du déclarant 1", "À inscrire": ui.eur(s["case_1aj"], 0)},
            {"Case": "1AK", "Rubrique": "Frais réels du déclarant 1",
             "À inscrire": ui.eur(s["case_1ak"], 0) if s["case_1ak"] is not None else "LAISSER VIDE"},
        ]
        if couple:
            cases_2042.extend([
                {"Case": "1BJ", "Rubrique": "Salaire du déclarant 2", "À inscrire": ui.eur(s["case_1bj"], 0)},
                {"Case": "1BK", "Rubrique": "Frais réels du déclarant 2",
                 "À inscrire": ui.eur(s["case_1bk"], 0) if s["case_1bk"] is not None else "LAISSER VIDE"},
            ])
        if interets_etrangers > 0:
            cases_2042.append({"Case": "2TR", "Rubrique": "Intérêts étrangers saisis",
                               "À inscrire": ui.eur(interets_etrangers, 0)})
        if ventes_titres:
            cases_2042.extend([
                {"Case": "3VG", "Rubrique": "Gain net des titres de cette application, avant abattement",
                 "À inscrire": ui.eur(d2074["case_3vg"], 0)},
                {"Case": "3VH", "Rubrique": "Perte nette des titres de cette application",
                 "À inscrire": ui.eur(d2074["case_3vh"], 0)},
            ])
        if ventes_crypto:
            for numero in ("3AN", "3BN"):
                cases_2042.append({
                    "Case": numero, "Rubrique": "Projection crypto si toutes les cessions du foyer sont ici",
                    "À inscrire": ui.eur(d2086[f"case_{numero.lower()}"])
                    + " · conditionnel (foyer / soultes / seuil 305 €)",
                })
        if sim is not None:
            options_calc = sim["options_fiscales"]
            for numero, assiette, coche in (("2OP", "assiette_2op", "cocher_2op"),
                                           ("3CN", "assiette_3cn", "cocher_3cn")):
                if options_calc[assiette] > 0:
                    cases_2042.append({
                        "Case": numero, "Rubrique": "Option simulée sur les seuls revenus saisis",
                        "À inscrire": "À envisager" if sim[coche] else "Non retenue par la simulation",
                    })
        if choisis:
            cases_2042.append({"Case": "8UU", "Rubrique": "Comptes étrangers sélectionnés",
                               "À inscrire": f"À cocher · {len(choisis)} compte(s) enregistrés"})
        ui.tableau(pd.DataFrame(cases_2042))
        if s["case_1ak"] is not None or couple and s["case_1bk"] is not None:
            st.caption("Les frais réels 1AK/1BK sont calculés depuis vos saisies : "
                       "éligibilité des trajets et repas à valider.")
        if not titres_ok:
            st.error("Titres : 3VG/3VH non calculables (pas de total 903 partiel). "
                     + " ; ".join(d2074["indisponible"] + d2074["ventes_excedentaires"]))
        if not crypto_ok:
            st.error("Crypto : 3AN/3BN non calculables (pas de total 224 partiel). "
                     + " ; ".join(d2086["indisponible"] + d2086["ventes_excedentaires"]))
        st.caption("Périmètre : les autres cessions et pertes du foyer peuvent changer 3VG/3VH. "
                   "3AN/3BN et la ligne 52 nécessitent toutes les cessions du foyer et le seuil de 305 €. "
                   "2OP (titres/intérêts) et 3CN (crypto) sont des choix distincts sur le foyer entier. "
                   "2CG/2BH/2DF dépendent du précompte ; 6DE de la CSG patrimoine payée : "
                   "l'application ne leur attribue pas zéro et ne compte pas deux fois la CSG de 2BH/2DF.")

    # 2047 : le montant des intérêts saisis est présent sans obliger à confirmer
    # une hypothèse sur le crédit d'impôt pour le VOIR.
    titre_2047 = f"252 → 2TR {ui.eur(interets_etrangers, 0)}" if interets_etrangers > 0 \
        else "aucun intérêt saisi"
    with st.expander(f"📁 Formulaire 2047 · intérêts étrangers ({titre_2047})", expanded=False):
        if interets_etrangers > 0:
            ui.tableau(pd.DataFrame([
                {"Ligne": "252 → 2TR", "Montant connu": ui.eur(interets_etrangers, 0),
                 "Portée": "Intérêts enregistrés dans l'application"},
                {"Ligne": "250", "Montant connu": ui.eur(interets_etrangers, 0),
                 "Portée": "Seulement si aucun crédit d'impôt étranger ne s'applique"},
                {"Ligne": "251", "Montant connu": ui.eur(interets_etrangers, 0),
                 "Portée": "Seulement si les lignes 238/240 du foyer sont nulles"},
            ]))
        else:
            st.info("Aucun intérêt étranger positif saisi pour cette année.")
        st.caption("Source et retenue étrangères non déduites du pays du courtier : "
                   "en cas de crédit, examiner les lignes 231–240 et le cadre 7. "
                   "Le cadre 3/30 concerne uniquement les plus-values de source étrangère.")

    # 2074 : totaux puis actifs, ventes datées et suivi des pertes dans des
    # onglets DISTINCTS. La CMV est un parcours alternatif, pas un second report.
    titre_2074 = (f"903/PV {ui.eur(d2074['ligne_903_pv'])} · 903/MV {ui.eur(d2074['ligne_903_mv'])}"
                  if ventes_titres else "total non calculable" if not titres_ok else "aucune vente")
    with st.expander(f"📁 Formulaire 2074 / 2074-CMV · titres ({titre_2074})", expanded=False):
        if not titres_ok:
            st.error("Aucun 903/3VG/3VH partiel : "
                     + " ; ".join(d2074["indisponible"] + d2074["ventes_excedentaires"]))
        elif not d2074["operations"]:
            st.info("Aucune vente de titre enregistrée dans ce portefeuille pour 2025.")
        else:
            st.markdown(f"**2074 · 903/PV {ui.eur(d2074['ligne_903_pv'])} · "
                        f"903/MV {ui.eur(d2074['ligne_903_mv'])}** — somme des ventes, "
                        "pas le solde d'un titre. 913 est le total du cadre 900 ; 905 concerne "
                        "les instruments à terme.")
            actifs, cessions, pertes = st.tabs(["Montants par titre", "Détail de chaque cession · 510",
                                                 "Pertes et parcours 2074-CMV"])
            with actifs:
                ui.tableau(pd.DataFrame([{
                    "Titre": g["actif"], "Cessions": g["cessions"],
                    "903/PV": ui.eur(g["903_PV"]), "903/MV": ui.eur(g["903_MV"]),
                    "524 net": ui.eur(g["ligne_524"]),
                } for g in presentation.titres_par_actif(d2074["par_actif"])]))
                st.caption("Synthèse de lecture, pas une colonne officielle : chaque vente "
                           "alimente séparément 903/PV ou 903/MV.")
            with cessions:
                for op in d2074["par_actif"]:
                    st.markdown(f"**{op['actif']} · {op['ligne_512']} · 524 {ui.eur(op['ligne_524'])}**")
                    lignes = [("511", op["actif"]), ("512", op["ligne_512"]),
                              ("514", ui.eur(op["ligne_514"], 4)),
                              ("515", ui.quantite(op["ligne_515"])),
                              *[(str(n), ui.eur(op[f"ligne_{n}"], 4 if n == 520 else 2)) for n in
                                (516, 517, 518, 520, 521, 522, 523, 524)]]
                    ui.tableau(pd.DataFrame([{"Ligne 510": n, "Montant de cette vente": v}
                                             for n, v in lignes]))
                st.caption("Une colonne par cession et date ; intermédiaire financier non enregistré "
                           "dans les ventes. Les lignes 520 (prix unitaire) et 514 sont affichées avec quatre décimales.")
            with pertes:
                if d2074["cadre_11"]:
                    ui.tableau(pd.DataFrame([{
                        "Titre · 1133": x["Titre (Bloc 1133)"],
                        **{f"{col} · compensation": ui.eur(x[cle]) if x[cle] is not None
                           else "Non calculable (abattement avant 2018)"
                           for col, cle in (("A", "Col A — Gain (€)"),
                                            ("B", "Col B — Perte de l'année imputée (€)"),
                                            ("C", "Col C — Solde (A − B) (€)"),
                                            ("D", "Col D — Pertes antérieures (€)"),
                                            ("E", "Col E — Gain net imposable (C − D) (€)"),
                                            ("F", "Col F — Abattement commun (€)"),
                                            ("G", "Col G — Abattement renforcé (€)"),
                                            ("H", "Col H — Gain imposable (E − F − G) (€)"))}
                    } for x in d2074["cadre_11"]]))
                    st.markdown(f"**1164 · pertes imputées connues : {ui.eur(d2074['ligne_1164'])}**")
                if d2074["abattementsNonVerifies"]:
                    st.warning("Acquisition avant 2018 : abattements F/G/H et 3SG non établis ; "
                               "option 2OP à déterminer pour le foyer.")
                for cadre, cle in ((10, "cadre_10"), (12, "cadre_12")):
                    if d2074[cle]:
                        ui.tableau(pd.DataFrame([{
                            "Cadre": cadre, "Année de la perte": x["annee"],
                            "Montant enregistré": ui.eur(x["montant"]),
                        } for x in d2074[cle]]))
                st.caption("2074-CMV : alternative UNIQUEMENT si dispensé de 2074 et si les "
                           "lignes 21/25 viennent des calculs de l'intermédiaire ; ne pas "
                           "recopier une seconde fois les mêmes ventes de la 2074.")
        if titres_ok and not d2074["operations"] and d2074["cadre_12"]:
            st.caption("Pertes antérieures connues du portefeuille : "
                       + ", ".join(f"{x['annee']} {ui.eur(x['montant'])}" for x in d2074["cadre_12"]))

    # 2086 : le total estimé 224 et les parts connues 51/52 précèdent les
    # ventes. Les champs inconnus 216/222 sont expliqués UNE seule fois.
    titre_2086 = (f"224 estimée {ui.eur(d2086['plus_value_globale_224'])} · "
                  f"51 connue {ui.eur(d2086['total_cessions_218'])}"
                  if ventes_crypto else "total non calculable" if not crypto_ok else "aucune cession")
    with st.expander(f"📁 Formulaire 2086 · crypto ({titre_2086})", expanded=False):
        if not crypto_ok:
            st.error("Aucun 224/51/3AN/3BN partiel : "
                     + " ; ".join(d2086["indisponible"] + d2086["ventes_excedentaires"]))
        elif not d2086["cessions"]:
            st.info("Aucune cession crypto enregistrée dans ce portefeuille pour 2025.")
        else:
            ui.tableau(pd.DataFrame([
                {"Ligne": "224", "Montant de l'application": ui.eur(d2086["plus_value_globale_224"]),
                 "Portée": "Résultat du déclarant estimé sans soulte"},
                {"Ligne": "51", "Montant de l'application": ui.eur(d2086["total_cessions_218"]),
                 "Portée": "Prix nets 218 connus ; partie du foyer"},
                {"Ligne": "52", "Montant de l'application": ui.eur(d2086["plus_value_globale_224"]),
                 "Portée": "Projection si foyer = application ; pas un report certifié"},
            ]))
            st.caption("Le seuil de 305 € s'évalue sur TOUS les prix nets 218 du foyer "
                       "(ligne 51), même si l'annexe reste requise sous le seuil. "
                       "3AN/3BN dépendent de la ligne 52 du foyer complet.")
            actifs, cessions = st.tabs(["Montants par crypto-actif", "Détail de chaque cession · 2086"])
            with actifs:
                ui.tableau(pd.DataFrame([{
                    "Crypto-actif": g["actif"], "Cessions": g["cessions"],
                    "218 net sans soulte": ui.eur(g["ligne_218"]),
                    "Contribution vers 224": ui.eur(g["ligne_224"]),
                } for g in presentation.crypto_par_actif(d2086["cessions"])]))
            with cessions:
                for op in d2086["cessions"]:
                    st.markdown(f"**{op['actif']} · {op['ligne_211']} · contribution estimée "
                                f"{ui.eur(op['ligne_224'])}**")
                    lignes = [("211", op["ligne_211"]),
                              *[(str(n), ui.eur(op[f"ligne_{n}"])) for n in
                                (212, 213, 214, 215, 217, 218, 220, 221, 223)]]
                    ui.tableau(pd.DataFrame([{"Ligne 2086": n, "Montant de cette vente": v}
                                             for n, v in lignes]))
                st.caption("217/218/223 et chaque contribution à 224 sont calculées si aucune soulte.")
        st.caption("Hors transactions connues : identité 2101–2103, soultes 216/222, autres "
                   "plateformes ou membres du foyer. Aucun 0 € n'est supposé pour ces champs.")

    with st.expander(f"📁 Formulaire 3916 / 3916-bis · {len(choisis)} compte(s) retenu(s) · 8UU",
                     expanded=False):
        if choisis:
            st.markdown("**Comptes répertoriés dans l'application :**")
            for compte in choisis:
                st.write("•", compte)
        else:
            st.info("Aucun compte étranger sélectionné dans la déclaration de base ; "
                    "cela ne certifie pas l'absence d'autres comptes du foyer.")
        st.caption("Un formulaire par compte : identité du titulaire (cadre 1), nature (2), "
                   "numéro, dates et coordonnées bancaires (3.1–3.2) ou PSAN crypto (4.1–4.3), "
                   "usage (5). Ces champs personnels et les comptes hors application "
                   "ne sont pas enregistrés dans les ventes.")

# ---------------------------------------------------------------------------
# 3. RECOMMANDATION PFU vs BARÈME, BILAN DE L'IMPÔT & TAUX DE PAS
# ---------------------------------------------------------------------------
st.divider()
st.subheader("💡 3. Arbitrage PFU vs Barème, Bilan de votre Impôt & Taux de Prélèvement à la Source")
if sim is None:
    st.caption("Bilan IR, options 2OP/3CN et taux de PAS non simulés tant que "
               "les données nécessaires ci-dessus manquent. Les chiffres calculés dans "
               "les imprimés ne constituent pas à eux seuls la déclaration du foyer.")
    st.stop()

arb = sim["arbitrage"]
options_calc = sim["options_fiscales"]
if options_calc["assiette_3cn"] > 0:
    st.markdown("#### ⚖️ Options distinctes 2OP (titres/intérêts) et 3CN (crypto)")
    st.caption("La 3CN est une option expresse et irrévocable sur la totalité des gains crypto privés du foyer, indépendante de la 2OP. L'impôt progressif est recalculé pour chaque combinaison, pas en additionnant deux simulations isolées.")
    st.table([{
        "2OP": "☑" if s["cocher_2op"] else "☐",
        "3CN": "☑" if s["cocher_3cn"] else "☐",
        "IR barème": ui.eur(s["ir_bareme"]),
        "IR forfaitaire": ui.eur(s["ir_forfaitaire"]),
        "PS annuels": ui.eur(s["ps_total"]),
        "Total annuel": ui.eur(s["impot_total_foyer"]),
    } for s in options_calc["scenarios"]])
    st.info(
        f"Sur les revenus saisis : 2OP {'à envisager' if sim['cocher_2op'] else 'non retenue'}, "
        f"3CN {'à envisager' if sim['cocher_3cn'] else 'non retenue'} ; "
        f"écart contre les deux régimes forfaitaires : {ui.eur(options_calc['economie_vs_pfu'])}. "
        + options_calc["limite"]
    )
    st.caption(
        "PS déjà précomptés sur intérêts : " + ui.eur(options_calc["retenu"]["ps_deja_precomptes"])
        + " (PS restant à acquitter : " + ui.eur(options_calc["retenu"]["ps_restants"])
        + "). Aucun acompte d'IR déjà retenu ni déduction future de CSG n'est reconstitué."
    )
elif arb is not None:
    st.markdown("#### ⚖️ Flat Tax (PFU) ou Barème Progressif (Case `2OP`) ?")
    if annee < 2023 and sim["impot_crypto"] > 0:
        st.caption("Pour les cessions de 2022, 3CN n'existait pas encore : les gains crypto restent au PFU dans ce bilan.")
    ca1, ca2 = st.columns(2)
    with ca1:
        st.markdown(f"**Option 1 — PFU (titres : {pfu_taux * 100:.1f} % ; intérêts selon précompte)**")
        st.metric(f"Impôt sur le revenu ({fb.IR_FORFAITAIRE * 100:.1f} %)", ui.eur(arb["pfu"]["ir"]))
        if arb["pfu"]["ir_bareme_debloque"]:
            st.metric("IR au barème rétabli (seuil global)", ui.eur(arb["pfu"]["ir_bareme_debloque"]))
        st.metric("PS (titres + intérêts, selon précompte)", ui.eur(arb["pfu"]["ps"]))
        st.metric("Coût total avec la Flat Tax", ui.eur(arb["pfu"]["total"]))
    with ca2:
        st.markdown("**Option 2 — Barème Progressif (Case `2OP` cochée)**")
        st.metric("Supplément d'IR au barème (après décote)", ui.eur(arb["bareme"]["ir_marginal"]))
        st.metric("PS (titres + intérêts, selon précompte)", ui.eur(arb["bareme"]["ps"]))
        st.metric(
            "CSG déductible cette année (intérêts précomptés)",
            ui.eur(arb["bareme"]["csg_deductible"]),
            help="Seule la CSG payée cette année entre dans la comparaison IR de cette année.",
        )
        st.caption(
            "CSG potentiellement déductible après paiement, non comptée dans cet arbitrage : "
            + ui.eur(arb["bareme"]["csg_deductible_apres_paiement_estimee"])
            + ". PS déjà précomptés sur intérêts : " + ui.eur(arb["ps_deja_precomptes"])
            + " (ne pas les payer une seconde fois)."
        )
        st.metric("Coût total avec le Barème", ui.eur(arb["bareme"]["total"]))

    st.caption("Comparaison sur les seuls revenus saisis : 2OP s'applique globalement à tous les revenus mobiliers et titres du foyer. Elle n'anticipe pas la déduction éventuelle de CSG lors d'un paiement ultérieur. Les PS déjà précomptés sont inclus dans le coût annuel, pas à reverser.")
    if sim["cocher_2op"]:
        st.success(
            f"ℹ️ **Sur les revenus saisis, option `2OP` à envisager (Barème Progressif).** "
            f"Le barème vous coûte **{ui.eur(arb['bareme']['total'])}** contre **{ui.eur(arb['pfu']['total'])}** "
            f"au PFU, soit une économie nette de **{ui.eur(arb['gain'])}** "
            f"(pour votre situation modélisée à `{parts}` parts ; ne tient pas compte de la CSG déductible à une date ultérieure)."
        )
    else:
        explication_decote = (
            " *(La décote peut augmenter l'impôt marginal au barème ; le calcul tient compte du millésime et de la CSG payée cette année seulement.)*"
            if (sim["ir_salaires"].decote > 0 and abs(sim["ir_salaires"].tmi - 0.11) < 1e-4)
            else ""
        )
        st.success(
            f"ℹ️ **Sur les revenus saisis, option `2OP` non retenue (PFU).** "
            f"La Flat Tax vous coûte **{ui.eur(arb['pfu']['total'])}** contre **{ui.eur(arb['bareme']['total'])}** "
            f"au barème, soit une économie de **{ui.eur(arb['gain'])}**.{explication_decote}"
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

st.markdown("#### 👨‍👩‍👧‍👦 Prélèvement à la source — estimation simplifiée")
st.caption("Calcul indicatif sur les seuls salaires saisis : les revenus communs, crédits et arrondis des articles 204 H et 204 M ne sont pas tous reconstitués. Pour un couple, le taux individualisé est le régime par défaut depuis septembre 2025, sauf option pour le taux foyer. Vérifiez les taux transmis par la DGFiP sur impots.gouv.fr.")
p1, p2, p3 = st.columns(3)
p1.info(f"👨‍👩‍👧‍👦 **Taux du foyer estimé sur salaires :** **{sim['taux_pas_foyer'] * 100:.2f} %**")
if couple:
    p2.info(f"👤 **Taux individualisé estimé (Vous) :** **{sim['taux_pas_1'] * 100:.2f} %**")
    p3.info(f"👤 **Taux individualisé estimé (Conjoint) :** **{sim['taux_pas_2'] * 100:.2f} %**")
else:
    p2.info(f"👤 **Taux estimé :** **{sim['taux_pas_foyer'] * 100:.2f} %**")
