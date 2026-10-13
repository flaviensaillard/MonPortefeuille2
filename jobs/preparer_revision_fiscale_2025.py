"""Inventaire LOCAL d'une éventuelle révision fiscale 2 pour les revenus 2025.

Ne crée PAS une ligne pf2_fiscal_annees : ni client Supabase, ni clé, ni
--appliquer. Le brouillon signale les paramètres non audités et n'est pas une
publication validée. La R1 a été relue le 13/10/2026, mais toute future
écriture exigerait une nouvelle lecture et une sauvegarde récente.
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
    "titres_etc": "https://www.impots.gouv.fr/particulier/les-cessions-mobilieres",
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
        # IGLN.L est un ETC (classe OR, régime des titres), PAS un bien
        # meuble physique. Ne pas exporter des paramètres or_physique non
        # vérifiés sous prétexte qu'ils figuraient dans la révision 1.
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
        "ecarts_connus_contre_revision_1_confirmes_par_lecture_du_13_10_2026": [
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
            "options_2op_3cn": "testees_pour_foyer_marie_sur_titres_du_seul_proprietaire_et_revenus_saisis_autres_revenus_du_foyer_inconnus",
            "etc_or_igln": "classe_or_du_code_routage_titres_2074_verifie_localement_sous_reserve_de_la_qualification_du_produit",
            "or_physique": "hors_portefeuille_et_exclu_des_parametres_candidats_non_verifie_pour_d_autres_utilisateurs",
            "pas": "estimation_sur_salaires_non_equivalente_au_taux_DGFiP_non_exportee_ni_activable",
            "autres_revenus_du_capital": "non_modelises",
        },
        "controles_restants": [
            "Lecture initiale de R1 confirmée le 13/10/2026 par le propriétaire ; refaire la lecture avant toute écriture pour détecter une dérive.",
            "ETC IGLN.L : confirmer sa qualification sur le relevé du courtier ; l'or physique est exclu du périmètre et n'est pas validé par cette simulation.",
            "Revoir le PAS du couple selon les formules administratives (revenus communs, crédits et arrondis) ou le laisser explicitement en estimation non activable.",
            "Documenter les plafonds QF particuliers : non modélisés ; le foyer marié standard utilise seulement le plafond général.",
            "Recouper frais kilométriques, conditions des frais de repas et champ des revenus éligibles à 2OP avant une activation générale.",
            "Figer le code candidat dans un commit traçable ; la révision 1 ne décrit pas les valeurs corrigées.",
            "Avant écriture : sauvegarde chiffrée récente avec tables fiscales, restauration de contrôle, simulation de la ligne 2025 et autorisation explicite.",
            "Après éventuelle écriture : relire et comparer exactement la nouvelle ligne, vérifier 2022–2024/2026 inchangées ; activer les calculs séparément.",
        ],
    }


def simuler_ligne_2025(*, aucun_autre_rcm: bool = False,
                       aucune_autre_cession_crypto: bool = False,
                       aucune_autre_cession_titres: bool = False) -> dict:
    """Enveloppe R2 hors ligne, non insérable, avec confirmations ÉPHÉMÈRES.

    Les réponses concernent uniquement 2025 et ne sont pas sauvegardées dans
    le dépôt, dans la table de barèmes ou dans une configuration de l'APK.
    Aucune absence d'opérations hors portefeuille n'est supposée par défaut.
    Même sans opération externe, des actifs crypto déjà détenus ailleurs peuvent
    compter pour le calcul du 2086 : une absence de cessions n'est PAS un inventaire.
    """
    if any(type(v) is not bool for v in (
        aucun_autre_rcm, aucune_autre_cession_crypto, aucune_autre_cession_titres
    )):
        raise ValueError("Les confirmations de périmètre doivent être explicites (booléennes).")
    brouillon = construire_brouillon()
    params = brouillon["parametres_candidats"]
    assert "or_physique" not in params and "pas" not in params
    regles_exclues = ["or_physique", "pas_officiel", "rcm_du_portefeuille_non_audites",
                      "inventaire_crypto_hors_application_non_confirme"]
    if not aucune_autre_cession_titres:
        regles_exclues.append("cessions_titres_hors_portefeuille_non_confirmees")
    if not aucun_autre_rcm:
        regles_exclues.append("rcm_hors_portefeuille_non_confirmes")
    if not aucune_autre_cession_crypto:
        regles_exclues.append("cessions_crypto_hors_portefeuille_non_confirmees")
    return {
        "simulation_uniquement": True,
        "statut_validation": "incomplet_ne_pas_inserer_ni_activer",
        "perimetre_personnel_hors_parametres_fiscaux": {
            "titulaire_des_titres_de_ce_portefeuille": "proprietaire_du_compte_seul",
            "foyer_pour_la_declaration_ir": "marie_declaration_commune",
            "rcm_hors_portefeuille_2025": (
                "absence_confirmee_pour_cette_simulation" if aucun_autre_rcm else "inconnu"
            ),
            "cessions_crypto_hors_portefeuille_2025": (
                "absence_confirmee_pour_cette_simulation" if aucune_autre_cession_crypto else "inconnu"
            ),
            "cessions_titres_hors_portefeuille_2025": (
                "absence_confirmee_pour_cette_simulation" if aucune_autre_cession_titres else "inconnu_non_presume_nul"
            ),
        },
        "portee_calcul_2025": {
            "franchise_crypto_evaluable_sur_les_cessions_chargees": aucune_autre_cession_crypto,
            "assiette_2op_hors_portefeuille_sans_autres_flux_confirmes": (
                aucun_autre_rcm and aucune_autre_cession_titres
            ),
            "assiette_2op_foyer_complete_confirmee": False,
            "raison_2op": (
                "Même sans flux hors portefeuille, l'application n'inventorie pas tous les revenus "
                "mobiliers du portefeuille (p. ex. dividendes/coupons) ; choix fiscal indicatif."
                if aucun_autre_rcm and aucune_autre_cession_titres else
                "Flux hors portefeuille non confirmés ; choix fiscal indicatif."
            ),
            "plus_value_2086_complete_confirmee": False,
            "raison_2086": "Aucune cession externe ne prouve l'absence de crypto déjà détenue hors application.",
        },
        "proposition_metadonnees_apres_migration_011_non_appliquee": {
            "statut_validation": "brouillon",
            "perimetre_validation": {
                "couverture": "aucune_pour_activation",
                "annee_revenus": ANNEE,
                "regles_exclues": regles_exclues,
            },
            "actif": False,
        },
        "champs_ligne_envisagee": {
            "annee_revenus": ANNEE,
            "revision": 2,  # sous réserve de relecture immédiatement avant écriture
            "origine": "nouvelle_publication",  # valeur autorisée par le schéma, NON encore justifiée
            "source_ref": None,  # commit final figé manquant : champ NOT NULL en base
            "parametres": params,
            # user_id absent volontairement : ne jamais exposer le propriétaire.
        },
        "bloquants": [
            "source_ref et commit candidat final manquants ; user_id volontairement absent",
            "aucun statut validation/activation dans la table ni lecteur sûr dans l'APK",
            "paramètres or physique exclus ; une publication générale serait trompeuse",
            "PAS couple = estimation sur salaires, non un taux officiel activable",
            "revenus mobiliers de ce portefeuille non inventoriés exhaustivement (dividendes/coupons) ; 2OP non certifiée",
            "inventaire des cryptoactifs déjà détenus hors application non confirmé ; 2086 non certifié",
            "plafonds QF spéciaux et situations personnelles non couverts",
            "relecture/backup récents, contrôle final et accord distinct d'écriture requis",
        ] + ([] if aucun_autre_rcm else ["RCM hors portefeuille du foyer non confirmés pour 2025"])
          + ([] if aucune_autre_cession_crypto else ["Cessions crypto du foyer hors portefeuille non confirmées pour 2025"])
          + ([] if aucune_autre_cession_titres else ["Cessions de titres du foyer hors portefeuille non confirmées pour 2025"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--annee", type=int, choices=[ANNEE], default=ANNEE,
                        help="Seul 2025 est préparé ; les autres années sont hors périmètre.")
    parser.add_argument("--simuler-ligne", action="store_true",
                        help="Affiche une enveloppe incomplète de R2 (jamais insérable).")
    parser.add_argument("--aucun-autre-rcm-2025", action="store_true",
                        help="Confirmation ponctuelle hors portefeuille, non conservée.")
    parser.add_argument("--aucune-autre-cession-crypto-2025", action="store_true",
                        help="Confirmation ponctuelle hors portefeuille, non conservée.")
    parser.add_argument("--aucune-autre-cession-titres-2025", action="store_true",
                        help="Confirmation ponctuelle hors portefeuille, non conservée.")
    args = parser.parse_args()
    assert args.annee == ANNEE
    if any((args.aucun_autre_rcm_2025, args.aucune_autre_cession_crypto_2025,
            args.aucune_autre_cession_titres_2025)) and not args.simuler_ligne:
        parser.error("Les confirmations ne s'appliquent qu'à --simuler-ligne (revenus 2025).")
    try:
        sortie = (simuler_ligne_2025(aucun_autre_rcm=args.aucun_autre_rcm_2025,
                                    aucune_autre_cession_crypto=args.aucune_autre_cession_crypto_2025,
                                    aucune_autre_cession_titres=args.aucune_autre_cession_titres_2025)
                  if args.simuler_ligne else construire_brouillon())
    except (KeyError, RuntimeError, ValueError) as exc:
        print(f"Préparation annulée : {exc}", file=sys.stderr)
        return 1
    print(json.dumps(sortie, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
