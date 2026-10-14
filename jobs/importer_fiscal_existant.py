"""Reprise NON VÉRIFIÉE des paramètres fiscaux du code 2.2.1 dans Supabase.

Aucune estimation nouvelle ; aucune année existante remplacée. Une loi rectificative
future devra créer une révision suivante, sans détruire la précédente.
Exécuter 009 puis 010 avant --appliquer. Simulation par défaut.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict
import os
import sys
from uuid import UUID

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core import fiscal_bars as fb  # noqa: E402

TABLE = "pf2_fiscal_annees"
SOURCE = (
    "https://github.com/flaviensaillard/MonPortefeuille2/blob/"
    "a583e55b98a94ecc86a7cf75615ad4a32ae327ff/core/fiscal_bars.py"
)


def parametres_du_code(annee: int) -> dict:
    """Copie les chiffres du moteur EXISTANT, sans leur conférer un statut officiel."""
    if annee not in fb.BAREMES:
        raise ValueError(f"Année absente du code : {annee}")
    # Aucun appel à forfait_repas_de : cette fonction peut réutiliser la
    # dernière année. La migration refuse cette extrapolation silencieuse.
    if any(annee not in table for table in (
        fb.PS_PAR_ANNEE, fb.FORFAIT_REPAS_PAR_ANNEE,
        fb.PLANCHER_ABATTEMENT_10_PAR_ANNEE,
        fb.PLAFOND_ABATTEMENT_10_PAR_ANNEE,
    )):
        raise ValueError(f"Paramètres incomplets pour {annee}")
    return {
        "bareme": asdict(fb.BAREMES[annee]),
        "prelevements_sociaux": fb.PS_PAR_ANNEE[annee],
        "ir_forfaitaire": fb.IR_FORFAITAIRE,
        "csg_deductible": fb.CSG_DEDUCTIBLE,
        "abattement_10": {
            "plancher": fb.PLANCHER_ABATTEMENT_10_PAR_ANNEE[annee],
            "plafond": fb.PLAFOND_ABATTEMENT_10_PAR_ANNEE[annee],
        },
        "forfait_repas": fb.FORFAIT_REPAS_PAR_ANNEE[annee],
        "bareme_km": {str(cv): list(valeurs) for cv, valeurs in fb.BAREME_KM_VOITURE.items()},
        "franchise_crypto": fb.CRYPTO_FRANCHISE_CESSIONS,
        "or_physique": {
            "taxe_forfaitaire": fb.OR_PHYS_TFMP,
            "plus_value_ir": fb.OR_PHYS_PV_IR,
            "plus_value_ps": fb.OR_PHYS_PV_PS,
            "annees_exoneration": fb.OR_PHYS_ABATTEMENT_MAX,
        },
        "incertitude_ps": fb.PS_ANNEE_INCERTAINE.get(annee),
        "mention_source_code_non_verifiee": fb.source_de(annee),
        "avertissement": "Reprise du code 2.2.1, non revérifiée auprès des textes officiels.",
    }


def importer(client, proprietaire: str, appliquer: bool = False) -> tuple[list[int], list[int]]:
    """Reprise historique ; refuse toute écriture après changement du code source."""
    # La clé service_role contourne RLS : l'uid doit être explicite et valide.
    proprietaire = str(UUID(proprietaire))
    # La révision 1 importée provient du commit SOURCE (décote 898/1986,
    # 1486/3284 et PS 17,2 % en 2025). Après l'audit, ces valeurs diffèrent :
    # ne jamais déposer un nouveau jeu sous la provenance du commit ancien.
    # Les corrections de 2025 devront passer par une NOUVELLE révision dédiée.
    if (
        fb.BAREMES[2025].decote_base_celibataire != 898.0
        or fb.BAREMES[2025].decote_plafond_celibataire != 1986.0
        or fb.BAREMES[2025].decote_base_couple != 1486.0
        or fb.BAREMES[2025].decote_plafond_couple != 3284.0
        or fb.PS_PAR_ANNEE[2025] != 0.172
    ):
        raise RuntimeError("Import initial figé au commit source : les constantes ont changé. Créer une révision fiscale corrigée, ne pas relancer la simulation ni --appliquer.")
    nouvelles, deja = [], []
    for annee in sorted(fb.BAREMES):
        params = parametres_du_code(annee)
        rows = (client.table(TABLE).select("revision")
                .eq("user_id", proprietaire).eq("annee_revenus", annee)
                .limit(1).execute().data or [])
        if rows:
            deja.append(annee)
            continue
        if appliquer:
            # Point d'écriture centralisé : vérifie aussi SUPABASE_USER_ID et
            # refuse une ligne attribuée à un autre propriétaire avant l'envoi.
            from core import db
            db.ecrire(TABLE, [{
                "user_id": proprietaire,
                "annee_revenus": annee,
                "revision": 1,
                "parametres": params,
                "origine": "reprise_code_non_verifiee",
                "source_ref": SOURCE,
            }])
        nouvelles.append(annee)
    return nouvelles, deja


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--appliquer", action="store_true", help="Écrire uniquement les années absentes")
    mode.add_argument("--dry-run", action="store_true", help="Lire sans écrire (défaut)")
    args = parser.parse_args()
    from core import db
    from jobs import cle_service
    try:
        cle_service.configurer()
    except cle_service.CleServiceManquante as exc:
        parser.error(str(exc))
    uid = db.proprietaire_service()
    if not uid:
        parser.error("SUPABASE_USER_ID absent : aucune lecture/écriture engagée")
    try:
        nouvelles, deja = importer(db.client(), uid, appliquer=args.appliquer)
    except Exception as exc:
        print(f"Migration impossible : {exc}", file=sys.stderr)
        return 1
    print(f"Années déjà présentes, inchangées : {deja or 'aucune'}")
    print(f"Années {'insérées' if args.appliquer else 'à insérer (simulation)'} : {nouvelles or 'aucune'}")
    print("Origine : code 2.2.1 NON REVÉRIFIÉ. Aucun calcul fiscal basculé sur Supabase.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
