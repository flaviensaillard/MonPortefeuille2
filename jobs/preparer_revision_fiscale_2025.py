"""Inventaire LOCAL d'une éventuelle révision fiscale 2 pour les revenus 2025.

Ne crée PAS une ligne pf2_fiscal_annees : ni client Supabase, ni clé, ni
--appliquer. Le brouillon signale les paramètres non audités et n'est pas une
publication validée. L'état réel de la révision 1 doit encore être relu en base.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import fiscal_bars as fb  # noqa: E402

ANNEE = 2025
SOURCE_REVISION_1 = (
    "https://github.com/flaviensaillard/MonPortefeuille2/blob/"
    "a583e55b98a94ecc86a7cf75615ad4a32ae327ff/core/fiscal_bars.py"
)
SOURCES = {
    "bareme": "https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20260407",
    "decote": "https://bofip.impots.gouv.fr/bofip/2495-PGP.html/identifiant=BOI-IR-LIQ-20-20-30-20260407",
    "qf_general": "https://bofip.impots.gouv.fr/bofip/2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20260407",
    "ps_titres": "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/gains.htm",
    "ps_rcm": "https://www.impots.gouv.fr/particulier/les-revenus-mobiliers",
    "ps_crypto": "https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques",
    "options": "https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf",
    "csg": "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/12-charges_ded_rev_225a236.pdf",
    "abattement_10": "https://bofip.impots.gouv.fr/bofip/10855-PGP.html/identifiant=BOI-BAREME-000035-20260217",
    "frais": "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/frais.htm",
    "repas": "https://www.impots.gouv.fr/particulier/frais-de-repas",
    "seuil_ir": "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/21-calcul_impot_369a382.pdf",
    "or_physique_option": "https://bofip.impots.gouv.fr/bofip/4161-PGP.html/identifiant=BOI-RPPM-PVBMC-20-20-20140401",
    "or_physique_taxe": "https://bofip.impots.gouv.fr/bofip/4151-PGP.html/identifiant=BOI-RPPM-PVBMC-20-10-20181231",
    "pas_couple": "https://bofip.impots.gouv.fr/bofip/11256-PGP.html/identifiant=BOI-IR-PAS-20-20-20-20250507",
}

# Référence documentaire tirée du commit d'import initial (NON pas une lecture
# de Supabase). Ces assertions évitent de produire un "diff" trompeur si le
# moteur local est à nouveau modifié sans refaire la vérification.
DIFFERENCES_ATTENDUES = {
    "bareme.decote_base_celibataire": (898.0, 897.0),
    "bareme.decote_plafond_celibataire": (1986.0, 1982.0),
    "bareme.decote_base_couple": (1486.0, 1483.0),
    "bareme.decote_plafond_couple": (3284.0, 3277.0),
    "prelevements_sociaux": (0.172, 0.186),
    "quotient_familial.plafond_general_par_demi_part": (None, 1807.0),
    "prelevements_sociaux_par_categorie.rcm_precomptes_en_2025": (None, 0.172),
    "prelevements_sociaux_par_categorie.rcm_non_precomptes": (None, 0.186),
}


def parametres_2025() -> dict:
    """Recopie du moteur actuel avec les champs manquants de la révision 1.

    Le schéma JSONB accepte ces clés, mais certains champs sont encore non
    certifiés : ne pas convertir ce dictionnaire en ligne publiable.
    """
    return {
        "bareme": asdict(fb.bareme_de(ANNEE)),
        "prelevements_sociaux": fb.taux_ps(ANNEE),  # compatibilité : titres/crypto, PAS taux universel
        "prelevements_sociaux_par_categorie": {
            "plus_values_titres": fb.taux_ps(ANNEE),
            "plus_values_crypto_privees": fb.taux_ps(ANNEE),
            "rcm_precomptes_en_2025": fb.taux_ps_revenu_mobilier(ANNEE, precompte=True),
            "rcm_non_precomptes": fb.taux_ps_revenu_mobilier(ANNEE, precompte=False),
        },
        "quotient_familial": {
            "plafond_general_par_demi_part": fb.plafond_qf_general(ANNEE),
            "plafonds_particuliers_modelises": False,
        },
        "ir_forfaitaire": fb.IR_FORFAITAIRE,
        "seuil_non_recouvrement_ir": 61.0,  # actuellement codé dans core/tax.py et fiscal.js ; à auditer
        "csg_deductible": fb.CSG_DEDUCTIBLE,
        "calendrier_csg": {
            "deduction_selon_annee_paiement": True,
            "rcm_precomptes_deduction_possible_en_2025_si_bareme": True,
            "csg_payee_ulterieurement_non_deduite_du_revenu_2025": True,
        },
        "options_fiscales": {
            "deux_op_globale_titres_et_rcm": True,
            "trois_cn_crypto_independante": True,
            "trois_cn_disponible_pour_cessions_depuis": 2023,
        },
        "abattement_10": {
            "taux": 0.10,  # actuellement codé dans core/fiscal_bars.py et fiscal.js
            "plancher": fb.PLANCHER_ABATTEMENT_10_PAR_ANNEE[ANNEE],
            "plafond": fb.PLAFOND_ABATTEMENT_10_PAR_ANNEE[ANNEE],
        },
        "forfait_repas": fb.FORFAIT_REPAS_PAR_ANNEE[ANNEE],
        "bareme_km": {str(cv): list(valeurs) for cv, valeurs in fb.BAREME_KM_VOITURE.items()},
        "regles_km": {"seuils_distance_km": [5000, 20000], "majoration_electrique": 0.20},
        "franchise_crypto": fb.CRYPTO_FRANCHISE_CESSIONS,
        "or_physique": {
            "taxe_forfaitaire": fb.OR_PHYS_TFMP,
            "plus_value_ir": fb.OR_PHYS_PV_IR,
            "plus_value_ps": fb.OR_PHYS_PV_PS,
            "annees_exoneration": fb.OR_PHYS_ABATTEMENT_MAX,
            "abattement_annuel_apres_deux_ans": 0.05,
            "option_2092_et_justificatifs_requis": True,
            "calcul_automatique_du_regime_utilisable": False,
        },
    }


def _valeur(params: dict, chemin: str):
    resultat = params
    for cle in chemin.split("."):
        resultat = resultat[cle]
    return resultat


def construire_brouillon() -> dict:
    """Simulation hors ligne ; aucun identifiant utilisateur ni statut publié."""
    params = parametres_2025()
    for chemin, (ancien, nouveau) in DIFFERENCES_ATTENDUES.items():
        if _valeur(params, chemin) != nouveau:
            raise RuntimeError(f"Constante locale modifiée : {chemin} ; réauditer avant de préparer la révision.")
    racine = Path(__file__).resolve().parents[1]
    empreintes = {
        chemin: hashlib.sha256((racine / chemin).read_bytes()).hexdigest()
        for chemin in ("core/fiscal_bars.py", "core/tax.py", "app/src/main/assets/www/js/fiscal.js")
    }
    return {
        "type": "inventaire_local_non_inserable",
        "annee_revenus": ANNEE,
        "revision_envisagee_sous_reserve_de_lecture_en_base": 2,
        "etat": "incomplet_ne_pas_publier_ni_activer",
        "reference_historique_code_revision_1": SOURCE_REVISION_1,
        "empreintes_sha256_fichiers_locaux": empreintes,
        "parametres_candidats": params,
        "ecarts_connus_contre_code_revision_1_non_confirmes_en_base": [
            {"champ": chemin, "ancienne_valeur": ancien, "valeur_candidate": nouveau}
            for chemin, (ancien, nouveau) in DIFFERENCES_ATTENDUES.items()
        ],
        "sources_officielles_consultees": SOURCES,
        "etat_par_regle": {
            "bareme.tranches": "recoupe_BOFiP_revenus_2025",
            "bareme.decote": "recoupee_BOFiP_revenus_2025",
            "bareme.seuil_non_recouvrement_ir": "61_euros_confirme_brochure_DGFiP_2025_arrondis_complets_non_audites",
            "quotient_familial.plafond_general": "recoupe_BOFiP_revenus_2025",
            "quotient_familial.plafonds_particuliers": "non_modelises",
            "prelevements_sociaux.par_categorie": "recoupes_DGFiP_pour_titres_crypto_et_RCM_saisis_seulement",
            "ir_forfaitaire": "recoupe_DGFiP_pour_titres_crypto_et_RCM_saisis",
            "csg_deductible_calendrier": "recoupe_DGFiP_sous_conditions",
            "abattement_10.plancher_plafond": "recoupe_BOFiP_revenus_2025",
            "abattement_10.taux": "non_audite_independamment",
            "forfait_repas": "montant_recoupe_DGFiP_conditions_personnelles_non_validees",
            "bareme_km": "coefficients_recoupes_conditions_et_portee_non_exhaustives",
            "regles_km": "tranches_et_maj_electrique_recoupees_BOFiP_conditions_personnelles_non_exhaustives",
            "franchise_crypto": "seuil_confirme_DGFiP_conditions_a_verifier_selon_foyer",
            "options_2op_3cn": "testees_pour_foyer_marie_sur_seules_assiettes_saisies",
            "or_physique": "taux_partiellement_recoupes_mais_choix_automatique_du_minimum_incorrect_option_2092_justificatifs_requis",
            "pas": "algorithme_simplifie_non_equivalent_aux_formules_DGFiP_pour_foyer_marie_non_parametre_dans_ce_brouillon",
            "autres_revenus_du_capital": "non_modelises",
        },
        "controles_restants": [
            "Relire en lecture seule les lignes 2025 existantes et confirmer revision 1, propriétaire et contenu avant tout numéro de révision.",
            "Corriger le choix automatique du minimum sur l'or physique (option 2092 et justificatifs requis) et recouper ses taux PS 2025, ainsi que les autres catégories à taux dérogatoire.",
            "Revoir le PAS du couple selon les formules administratives (revenus communs, crédits et arrondis) ou le laisser explicitement en estimation non activable.",
            "Documenter les plafonds QF particuliers : non modélisés ; le foyer marié standard utilise seulement le plafond général.",
            "Recouper frais kilométriques, conditions des frais de repas et champ des revenus éligibles à 2OP avant une activation générale.",
            "Figer le code candidat dans un commit traçable ; la révision 1 ne décrit pas les valeurs corrigées.",
            "Avant écriture : sauvegarde chiffrée récente avec tables fiscales, restauration de contrôle, simulation de la ligne 2025 et autorisation explicite.",
            "Après éventuelle écriture : relire et comparer exactement la nouvelle ligne, vérifier 2022–2024/2026 inchangées ; activer les calculs séparément.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--annee", type=int, choices=[ANNEE], default=ANNEE,
                        help="Seul 2025 est préparé ; les autres années sont hors périmètre.")
    args = parser.parse_args()
    assert args.annee == ANNEE
    try:
        brouillon = construire_brouillon()
    except (KeyError, RuntimeError, ValueError) as exc:
        print(f"Préparation annulée : {exc}", file=sys.stderr)
        return 1
    print(json.dumps(brouillon, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
