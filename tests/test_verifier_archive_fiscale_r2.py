"""Sauvegarde post-R2 : lecture seule et comparaison à la référence pré-écriture."""

from copy import deepcopy
from pathlib import Path

import pytest

from core import sauvegarde
from jobs import etat_archive_fiscale, verifier_archive_fiscale_r2
from tests.test_verifier_r2_2025_apres_ecriture import echantillon

PHRASE = "phrase-de-test-fiscale"


def archive(tmp_path: Path, lignes: list[dict]) -> Path:
    tables = {"Config": [], "pf2_transactions": [], "pf2_apports": [], "pf2_snapshots": [],
              "pf2_fiscal_annees": [{**ligne, "cree_le": "2026-10-13T00:00:00Z"}
                                     for ligne in lignes]}
    document = sauvegarde.construire(tables, genere_le="2026-10-13T12:00+02:00")
    chemin = tmp_path / "post-r2.pf2"
    chemin.write_bytes(sauvegarde.chiffrer(document, PHRASE))
    return chemin


def test_mode_lecture_et_archive_identiques_au_rapport_pre_ecriture(tmp_path):
    lignes, rapport_avant = echantillon()
    assert etat_archive_fiscale.etat(archive(tmp_path, lignes[:5]), PHRASE) == "avant"
    chemin = archive(tmp_path, lignes)
    assert etat_archive_fiscale.etat(chemin, PHRASE) == "apres"
    rapport = verifier_archive_fiscale_r2.controler_archive(chemin, PHRASE, rapport_avant)
    assert rapport["ligne_r2_2025_conforme"] is True
    assert verifier_archive_fiscale_r2.controler_archive(chemin, PHRASE, rapport_avant, rapport) == rapport
    with pytest.raises(ValueError, match="distante"):
        verifier_archive_fiscale_r2.controler_archive(chemin, PHRASE, rapport_avant,
                                                     {**rapport, "ligne_r2_2025_conforme": False})


def test_refus_archive_corrompue_ou_r1_changee(tmp_path):
    lignes, rapport_avant = echantillon()
    with pytest.raises(sauvegarde.ErreurSauvegarde):
        verifier_archive_fiscale_r2.controler_archive(archive(tmp_path, lignes), "mauvaise phrase", rapport_avant)
    modifie = deepcopy(lignes)
    modifie[0]["parametres"]["bareme"]["tranches"] = [9]
    with pytest.raises(ValueError, match="pré-écriture"):
        verifier_archive_fiscale_r2.controler_archive(archive(tmp_path, modifie), PHRASE, rapport_avant)
    assert etat_archive_fiscale.etat(archive(tmp_path, modifie[:5]), PHRASE) == "avant"
    with pytest.raises(ValueError, match="inattendus"):
        etat_archive_fiscale.etat(archive(tmp_path, modifie[:4]), PHRASE)
