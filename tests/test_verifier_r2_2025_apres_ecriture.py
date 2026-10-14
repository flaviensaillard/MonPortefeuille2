"""Comparaison exacte des six lignes après écriture, sans réseau réel."""

import json
from copy import deepcopy
from uuid import uuid4

import pytest

from jobs import ligne_r2_2025_hors_ligne as proposition
from jobs import verifier_r2_2025_apres_ecriture as apres
from jobs import verifier_revision_fiscale_2025 as avant


def echantillon():
    uid = str(uuid4())
    r1 = [{"user_id": uid, "annee_revenus": an, "revision": 1,
           "origine": "reprise_code_non_verifiee", "source_ref": "https://example.org/historique",
           "parametres": {"bareme": {"tranches": [1, 2]}},
           "statut_validation": "historique_non_verifie", "perimetre_validation": {}, "actif": False}
          for an in avant.ANNEES_HISTORIQUES]
    rapport = {"problemes": [], "revision_2_confirmable_sous_reserve": True,
               "empreintes_lignes_pour_controle_apres_ecriture": [
                   {"annee_revenus": x["annee_revenus"], "revision": 1,
                    "empreinte_ligne": avant._empreinte(x)} for x in r1]}
    r2 = json.loads(json.dumps(proposition.proposer()["colonnes_proposees_sans_user_id"]))
    r2["user_id"] = uid
    return r1 + [r2], rapport


def test_ligne_exacte_et_historiques_inalteres():
    lignes, rapport = echantillon()
    sortie = apres.comparer_apres(lignes, rapport)
    assert sortie["ligne_r2_2025_conforme"] is True
    assert sortie["lecture_seule"] is True
    assert "user_id" not in str(sortie)


@pytest.mark.parametrize("modifier", [
    lambda l: l[5].update(actif=False),
    lambda l: l[5]["parametres"].update(forfait_repas=9),
    lambda l: l[5].update(source_ref="https://example.org/erreur"),
    lambda l: l[0].update(actif=True),
    lambda l: l[5].update(user_id=str(uuid4())),
    lambda l: l.pop(2),
    lambda l: l.append(deepcopy(l[0])),
])
def test_derives_refusees(modifier):
    lignes, rapport = echantillon()
    modifier(lignes)
    sortie = apres.comparer_apres(lignes, rapport)
    assert sortie["ligne_r2_2025_conforme"] is False
    assert sortie["problemes"]


def test_rapport_initial_incomplet_refuse():
    lignes, rapport = echantillon()
    with pytest.raises(ValueError, match="rapport"):
        apres.comparer_apres(lignes, {})
    rapport["empreintes_lignes_pour_controle_apres_ecriture"].pop()
    with pytest.raises(ValueError, match="cinq empreintes"):
        apres.comparer_apres(lignes, rapport)
