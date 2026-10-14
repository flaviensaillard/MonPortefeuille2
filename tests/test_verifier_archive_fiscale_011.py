"""Précondition hors ligne : l'archive restaurée doit couvrir R1 et la lecture."""
from __future__ import annotations

from copy import deepcopy
from uuid import uuid4

import pytest

from core import sauvegarde
from jobs import preparer_revision_fiscale_2025 as prep
from jobs import verifier_archive_fiscale_011 as controle
from jobs import verifier_revision_fiscale_2025 as lecture

PHRASE = "phrase-de-test-fiscale"


def _lignes():
    uid = str(uuid4())
    params = {"bareme": {"decote_base_celibataire": 898, "decote_plafond_celibataire": 1986,
                         "decote_base_couple": 1486, "decote_plafond_couple": 3284},
              "prelevements_sociaux": .172}
    return [{"user_id": uid, "annee_revenus": a, "revision": 1,
             "parametres": deepcopy(params), "origine": "reprise_code_non_verifiee",
             "source_ref": prep.SOURCE_REVISION_1, "cree_le": "2026-10-12T00:00:00Z",
             "statut_validation": "historique_non_verifie", "perimetre_validation": {}, "actif": False}
            for a in (2022, 2023, 2024, 2025, 2026)]


def _archive(tmp_path, lignes=None, avec_table=True):
    tables = {"Config": [], "pf2_transactions": [], "pf2_apports": [], "pf2_snapshots": []}
    if avec_table:
        tables["pf2_fiscal_annees"] = _lignes() if lignes is None else lignes
    blob = sauvegarde.chiffrer(sauvegarde.construire(tables, genere_le="2026-10-13T12:00+02:00"), PHRASE)
    chemin = tmp_path / "fiscal.pf2"
    chemin.write_bytes(blob)
    return chemin


def test_archive_et_lecture_identiques_acceptes_sans_ecriture(tmp_path):
    lignes = _lignes()
    r = controle.controler_archive(_archive(tmp_path, lignes), PHRASE)
    assert r["revision_2_confirmable_sous_reserve"] is True
    assert r["ecriture_autorisee"] is False
    assert len(r["empreintes_lignes_pour_controle_apres_ecriture"]) == 5
    # `cree_le` n'était pas sélectionné par le SELECT vivant ; seule la
    # projection commune entre archive et lecture entre dans l'empreinte.
    controle.verifier_lecture_identique(r, lecture.comparer_lignes([
        {k: v for k, v in l.items() if k != "cree_le"} for l in lignes
    ]))


def test_derives_archive_ou_lecture_bloquent(tmp_path):
    lignes = _lignes()
    chemin = _archive(tmp_path, lignes)
    r = controle.controler_archive(chemin, PHRASE)
    controle.verifier_lecture_identique(r, lecture.comparer_lignes([
        {k: v for k, v in l.items() if k != "cree_le"} for l in lignes
    ]))
    mauvais = deepcopy(r)
    mauvais["empreintes_lignes_pour_controle_apres_ecriture"][0]["empreinte_ligne"] = "modifie"
    with pytest.raises(ValueError, match="ne correspond pas"):
        controle.verifier_lecture_identique(r, mauvais)
    with pytest.raises(sauvegarde.ErreurSauvegarde):
        controle.controler_archive(chemin, "mauvaise-phrase-de-test")
    with pytest.raises(ValueError, match="absente"):
        controle.controler_archive(_archive(tmp_path, avec_table=False), PHRASE)
    with pytest.raises(ValueError, match="nombre de lignes"):
        controle.controler_archive(_archive(tmp_path, lignes[:4]), PHRASE)
    etranger = deepcopy(lignes)
    etranger[-1]["user_id"] = str(uuid4())
    with pytest.raises(ValueError, match="Plusieurs propriétaires"):
        controle.controler_archive(_archive(tmp_path, etranger), PHRASE)
    derapage = deepcopy(lignes)
    derapage[-1]["revision"] = 2
    with pytest.raises(ValueError, match="Années ou révisions"):
        controle.controler_archive(_archive(tmp_path, derapage), PHRASE)
    sans_meta = deepcopy(lignes)
    del sans_meta[0]["statut_validation"]
    with pytest.raises(ValueError, match="incomplète"):
        controle.controler_archive(_archive(tmp_path, sans_meta), PHRASE)
    active = deepcopy(lignes)
    active[3]["actif"] = True
    with pytest.raises(ValueError, match="différent"):
        controle.controler_archive(_archive(tmp_path, active), PHRASE)
