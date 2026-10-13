"""Inventaire local EXHAUSTIF des feuilles JSON du candidat fiscal 2025.

Les URLs sont des références de revue, pas des attestations de validité du
calcul. N'accède pas à Supabase et n'autorise aucune publication. Ajouter ou
retirer une feuille sans revoir son périmètre fait échouer le contrôle.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from jobs.preparer_revision_fiscale_2025 import SOURCES, parametres_2025  # noqa: E402

# Correspondance explicite : toute nouvelle valeur doit être examinée. Les
# tableaux (tranches, taux, coefficients/km) sont une seule feuille chacun.
GROUPES = {
    "bareme": (
        "bareme.annee", "bareme.tranches", "bareme.taux",
    ),
    "decote": (
        "bareme.decote_base_celibataire", "bareme.decote_plafond_celibataire",
        "bareme.decote_base_couple", "bareme.decote_plafond_couple", "bareme.decote_taux",
    ),
    "ps_titres": (
        "prelevements_sociaux", "prelevements_sociaux_par_categorie.plus_values_titres",
        "ir_forfaitaire",
    ),
    "ps_crypto": ("prelevements_sociaux_par_categorie.plus_values_crypto_privees",),
    "ps_rcm": (
        "prelevements_sociaux_par_categorie.rcm_precomptes_en_2025",
        "prelevements_sociaux_par_categorie.rcm_non_precomptes",
    ),
    "qf_general": (
        "quotient_familial.plafond_general_par_demi_part",
        "quotient_familial.plafonds_particuliers_modelises",
    ),
    "seuil_ir": ("seuil_non_recouvrement_ir",),
    "csg": (
        "csg_deductible", "calendrier_csg.deduction_selon_annee_paiement",
        "calendrier_csg.rcm_precomptes_deduction_possible_en_2025_si_bareme",
        "calendrier_csg.csg_payee_ulterieurement_non_deduite_du_revenu_2025",
    ),
    "option_2op": ("options_fiscales.deux_op_globale_titres_et_rcm",),
    "options": (
        "options_fiscales.trois_cn_crypto_independante", "franchise_crypto",
    ),
    "option_3cn_debut": ("options_fiscales.trois_cn_disponible_pour_cessions_depuis",),
    "frais": (
        "abattement_10.taux", "regles_km.seuils_distance_km",
        "regles_km.majoration_electrique",
        "bareme_km.3", "bareme_km.4", "bareme_km.5", "bareme_km.6", "bareme_km.7",
    ),
    "abattement_10": ("abattement_10.plancher", "abattement_10.plafond"),
    "repas": ("forfait_repas",),
}


def chemins_feuilles(data: dict, prefixe: str = "") -> set[str]:
    if not isinstance(data, dict) or not data:
        raise ValueError("Paramètres fiscaux vides ou mal formés.")
    resultats: set[str] = set()
    for cle, valeur in data.items():
        if not isinstance(cle, str) or not cle or "." in cle:
            raise ValueError("Clé fiscale mal formée.")
        chemin = f"{prefixe}.{cle}" if prefixe else cle
        if isinstance(valeur, dict):
            resultats.update(chemins_feuilles(valeur, chemin))
        elif valeur is None or isinstance(valeur, list) and not valeur:
            raise ValueError("Valeur fiscale manquante.")
        else:
            resultats.add(chemin)
    return resultats


def verifier(params: dict) -> dict:
    chemins = chemins_feuilles(params)
    sources: dict[str, str] = {}
    for groupe, cles in GROUPES.items():
        source = SOURCES[groupe]
        if not source.startswith("https://"):
            raise ValueError("Référence de revue invalide.")
        for cle in cles:
            if cle in sources:
                raise ValueError("Paramètre fiscal sourcé plusieurs fois.")
            sources[cle] = source
    manquants = chemins - sources.keys()
    superflus = sources.keys() - chemins
    if manquants or superflus:
        raise ValueError(f"Inventaire incomplet : non sourcés {sorted(manquants)} ; absents {sorted(superflus)}")
    return {
        "annee_revenus": 2025,
        "parametres_inventories": sorted(chemins),
        "sources_par_parametre": {cle: sources[cle] for cle in sorted(chemins)},
        "pret_a_ecrire": False,
        "limite": "Les références de revue ne prouvent ni la validité juridique ni l'intégration au moteur."
    }


if __name__ == "__main__":
    print(json.dumps(verifier(parametres_2025()), ensure_ascii=False, indent=2))
