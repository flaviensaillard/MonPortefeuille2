"""Propose la forme exacte des colonnes R2 publiques, SANS identifiant ni écriture.

Ne contient aucun accès réseau, aucune clé et aucune commande d'insertion. Une
simulation de ligne validée ne remplace NI sauvegarde post-011 NI accord explicite.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from jobs.controle_couverture_2025 import verifier  # noqa: E402
from jobs.preparer_revision_fiscale_2025 import parametres_2025  # noqa: E402

# Ces références désignent la version IMMUTABLE du code et de l'audit des
# valeurs publiques, et non les cinq R1 importées d'un commit historique.
COMMIT_CANDIDAT = "b99df7b65253726b8d64f34a76a9ec61528947ea"
SOURCE_REF = ("https://github.com/flaviensaillard/MonPortefeuille2/blob/"
              + COMMIT_CANDIDAT + "/docs/AUDIT-R2-2025.md")
EMPREINTE_PARAMETRES = "9b0539675ea204accaf10116e0b315e20b70937e8ae2596927c3b93f0079b13c"
EMPREINTE_SOURCES = "20bb4b4b1b0283b24f296e21a4ebfe4c54a069f49b060e26aa6953b2497afdac"


def empreinte(objet: dict) -> str:
    octets = json.dumps(objet, sort_keys=True, separators=(",", ":"),
                        ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(octets).hexdigest()


def proposer() -> dict:
    params = parametres_2025()
    couverture = verifier(params)
    if empreinte(params) != EMPREINTE_PARAMETRES or \
            empreinte(couverture["sources_par_parametre"]) != EMPREINTE_SOURCES or \
            len(couverture["parametres_inventories"]) != 36:
        raise ValueError("Candidat ou sources modifiés depuis le commit de référence : réauditer avant toute proposition.")
    return {
        "simulation_uniquement": True,
        "ecriture_autorisee": False,
        "action_exigee": "Sauvegarde restaurée et lecture indépendante post-011 à jour, APK compatible, accord distinct du propriétaire sur cette ligne.",
        "colonnes_proposees_sans_user_id": {
            "annee_revenus": 2025,
            "revision": 2,  # seulement si la relecture ne trouve aucune autre R2
            "origine": "nouvelle_publication",
            "source_ref": SOURCE_REF,
            "parametres": params,
            "statut_validation": "valide_pour_perimetre",
            "perimetre_validation": {
                "couverture": "integrale_parametres_utilises",
                "annee_revenus": 2025,
                "regles_exclues": [],
                "parametres_utilises": couverture["parametres_inventories"],
                "sources_par_parametre": couverture["sources_par_parametre"],
            },
            "actif": True,
        },
        "limites_hors_parametres": [
            "PAS officiel et montants personnels de frais réels non certifiés.",
            "Assiettes 2OP/2086 et cas particuliers non certifiés par les seuls taux.",
            "Or physique hors périmètre : l'APK refuse la R2 si une opération est classée métal physique.",
        ],
    }


if __name__ == "__main__":
    print(json.dumps(proposer(), ensure_ascii=False, indent=2))
