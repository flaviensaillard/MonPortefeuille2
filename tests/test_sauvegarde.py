"""Sauvegarde chiffrée et restauration testée (2.2.0, C).

Verrous :
- le fichier chiffré ne contient ni les données ni la phrase en clair ;
- la restauration rend EXACTEMENT les lignes (nombre, contenu, sommes) ;
- toute altération (contenu, en-tête, octet chiffré, mauvaise phrase) est refusée ;
- une table obligatoire manquante ou illisible annule la sauvegarde (pas d'archive partielle) ;
- une table optionnelle absente est déclarée, jamais tue ;
- phrase trop courte refusée ;
- la restauration CSV conserve le nombre de lignes et les colonnes.

Ces modules sont nouveaux en 2.2.0 : la version 2.1.1 ne produit aucune
sauvegarde, donc ces tests échouent sur elle par construction.
"""
from __future__ import annotations

import csv
import re
import datetime as dt
import json
import os
import sys
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE))

from core import sauvegarde  # noqa: E402
from core.sauvegarde import ErreurRestauration, ErreurSauvegarde  # noqa: E402
from jobs import restauration, sauvegarde as job_sauvegarde  # noqa: E402

PHRASE = "phrase-de-test-longue-42"
CANARI = "CANARI-PF2-7f3a9c"  # texte unique : ne doit JAMAIS apparaître en clair
MAINTENANT = dt.datetime(2026, 10, 10, 20, 0, tzinfo=dt.timezone.utc)


def _donnees_realistes() -> dict[str, list[dict]]:
    """Petit grand livre réaliste : snapshots quotidiens, apports, opérations, Config."""
    snapshots = []
    valeur = 10000.0
    jour = dt.date(2026, 10, 1)
    for i in range(10):
        valeur += 25.5 if i % 2 else -12.0
        snapshots.append({"date": (jour + dt.timedelta(days=i)).isoformat(),
                          "valeur_totale": round(valeur, 2), "poche": "PEA", "note": CANARI if i == 0 else None})
    return {
        "pf2_transactions": [
            {"id": 1, "date": "2026-01-05", "ticker": "CW8.PA", "montant": -1200.0, "quantite": 10},
            {"id": 2, "date": "2026-03-02", "ticker": "CW8.PA", "montant": 300.5, "quantite": -2},
        ],
        "pf2_apports": [{"id": 1, "date": "2026-02-01", "montant": 500.0, "devise": "EUR"}],
        "pf2_operations_compte": [{"id": 1, "compte": "Livret", "montant": 1000.0, "date": "2026-01-02"}],
        "pf2_comptes": [{"id": 1, "nom": "Livret", "solde": 1000.0}],
        "pf2_snapshots": snapshots,
        "Config": [{"Clé": "f_parts", "Valeur": "2.0"}, {"Clé": "f_enf", "Valeur": "1"}],
    }


def _normalise(tables):
    return json.loads(json.dumps(tables, ensure_ascii=False, default=str))


# --- format et restauration -------------------------------------------------

def test_restauration_rend_exactement_les_lignes():
    tables = _donnees_realistes()
    blob = sauvegarde.chiffrer(sauvegarde.construire(tables, genere_le="2026-10-10T22:00:00+02:00"), PHRASE)
    restaure = sauvegarde.restaurer(sauvegarde.dechiffrer(blob, PHRASE))
    assert restaure == _normalise(tables)


def test_comptes_de_lignes_et_soldes_sont_conserves():
    tables = _donnees_realistes()
    document = sauvegarde.dechiffrer(
        sauvegarde.chiffrer(sauvegarde.construire(tables, genere_le="x"), PHRASE), PHRASE)
    restaure = sauvegarde.restaurer(document)
    for nom, lignes in tables.items():
        assert len(restaure[nom]) == len(lignes), nom
    assert sauvegarde.synthese(restaure) == document["synthese"]
    assert document["synthese"]["pf2_transactions"]["sommes"]["montant"] == pytest.approx(-899.5)
    assert document["synthese"]["pf2_comptes"]["sommes"]["solde"] == pytest.approx(1000.0)
    assert document["synthese"]["pf2_snapshots"]["lignes"] == 10


def test_sommes_de_controle_par_table_et_globale_concordent():
    document = sauvegarde.construire(_donnees_realistes(), genere_le="x")
    assert sauvegarde.verifier(document) == []
    assert set(document["tables"]) == set(_donnees_realistes())
    assert all(len(b["sha256"]) == 64 for b in document["tables"].values())


def test_format_invariant_de_l_ordre_des_cles():
    a = sauvegarde.construire({"pf2_transactions": [{"b": 1, "a": 2}], "pf2_apports": [], "pf2_snapshots": [], "Config": []}, genere_le="x")
    b = sauvegarde.construire({"pf2_transactions": [{"a": 2, "b": 1}], "pf2_apports": [], "pf2_snapshots": [], "Config": []}, genere_le="x")
    assert a["sha256_global"] == b["sha256_global"]


# --- altérations refusées ---------------------------------------------------

def test_contenu_altere_est_detecte_et_refuse():
    document = sauvegarde.construire(_donnees_realistes(), genere_le="x")
    document["tables"]["pf2_transactions"]["lignes"][0]["montant"] = -1.0
    anomalies = sauvegarde.verifier(document)
    assert any("pf2_transactions" in a and "altéré" in a for a in anomalies)
    with pytest.raises(ErreurRestauration):
        sauvegarde.restaurer(document)


def test_ligne_supprimee_est_detectee_par_le_nombre():
    document = sauvegarde.construire(_donnees_realistes(), genere_le="x")
    document["tables"]["pf2_snapshots"]["lignes"].pop()
    anomalies = sauvegarde.verifier(document)
    assert any("pf2_snapshots" in a and "lignes" in a for a in anomalies)


def test_mauvaise_phrase_est_refusee():
    blob = sauvegarde.chiffrer(sauvegarde.construire(_donnees_realistes(), genere_le="x"), PHRASE)
    with pytest.raises(ErreurSauvegarde, match="phrase incorrecte"):
        sauvegarde.dechiffrer(blob, "autre-phrase-tres-longue")


def test_octet_chiffre_modifie_est_refuse():
    blob = bytearray(sauvegarde.chiffrer(sauvegarde.construire(_donnees_realistes(), genere_le="x"), PHRASE))
    blob[-5] ^= 0x01
    with pytest.raises(ErreurSauvegarde):
        sauvegarde.dechiffrer(bytes(blob), PHRASE)


def test_fichier_tronque_ou_inconnu_est_refuse():
    blob = sauvegarde.chiffrer(sauvegarde.construire(_donnees_realistes(), genere_le="x"), PHRASE)
    with pytest.raises(ErreurSauvegarde, match="tronqué"):
        sauvegarde.dechiffrer(blob[:len(sauvegarde.MAGIC) + 10], PHRASE)
    with pytest.raises(ErreurSauvegarde, match="non reconnu"):
        sauvegarde.dechiffrer(b"AUTRE-FORMAT" + blob, PHRASE)


def test_phrase_trop_courte_refusee_partout():
    tables = _donnees_realistes()
    with pytest.raises(ErreurSauvegarde, match="trop courte"):
        sauvegarde.chiffrer(sauvegarde.construire(tables, genere_le="x"), "court")
    with pytest.raises(ErreurSauvegarde, match="trop courte"):
        sauvegarde.produire(lambda nom: tables[nom], "", genere_le="x")


# --- pas de sauvegarde partielle -------------------------------------------

def test_table_obligatoire_absente_annule_la_construction():
    tables = _donnees_realistes()
    del tables["pf2_snapshots"]
    with pytest.raises(ErreurSauvegarde, match="pf2_snapshots"):
        sauvegarde.construire(tables, genere_le="x")


def test_lecture_obligatoire_en_echec_annule_tout():
    tables = _donnees_realistes()

    def lecteur(nom):
        if nom == "pf2_apports":
            raise RuntimeError("réseau coupé")
        return tables[nom]

    with pytest.raises(ErreurSauvegarde, match="pf2_apports"):
        sauvegarde.produire(lecteur, PHRASE, genere_le="x")


def test_table_optionnelle_absente_est_declaree():
    tables = _donnees_realistes()

    def lecteur(nom):
        if nom == "pf2_comptes":
            raise LookupError(nom)
        return tables[nom]

    _, document = sauvegarde.produire(lecteur, PHRASE, genere_le="x")
    assert document["absentes"] == ["pf2_comptes"]
    assert "pf2_comptes" not in document["tables"]


def test_table_optionnelle_en_erreur_annule_au_lieu_de_disparaitre():
    tables = _donnees_realistes()

    def lecteur(nom):
        if nom == "pf2_operations_compte":
            raise RuntimeError("500")
        return tables[nom]

    with pytest.raises(ErreurSauvegarde):
        sauvegarde.produire(lecteur, PHRASE, genere_le="x")


# --- confidentialité des fichiers ------------------------------------------

def test_fichier_chiffre_ne_contient_ni_donnees_ni_phrase():
    tables = _donnees_realistes()
    blob = sauvegarde.chiffrer(sauvegarde.construire(tables, genere_le="x"), PHRASE)
    assert CANARI.encode() not in blob
    assert b"pf2_transactions" not in blob
    assert PHRASE.encode() not in blob


def test_deux_chiffrements_different_sel_et_nonce():
    document = sauvegarde.construire(_donnees_realistes(), genere_le="x")
    assert sauvegarde.chiffrer(document, PHRASE) != sauvegarde.chiffrer(document, PHRASE)


# --- job : fichiers, empreinte, restauration de bout en bout ---------------

def _lecteur(tables):
    def lire(nom):
        if nom not in tables:
            raise LookupError(nom)
        return tables[nom]
    return lire


def test_job_ecrit_fichier_et_empreinte_sans_la_phrase(tmp_path):
    chemin, document = job_sauvegarde.produire_fichier(
        _lecteur(_donnees_realistes()), PHRASE, tmp_path, MAINTENANT)
    assert chemin.name == "pf2-2026-10-10.pf2"
    empreinte = (tmp_path / "pf2-2026-10-10.pf2.sha256").read_text(encoding="ascii")
    assert empreinte.split()[0] == sauvegarde.sha256_octets(chemin.read_bytes())
    assert PHRASE not in empreinte
    assert not list(tmp_path.glob("*.tmp"))


def test_echec_de_lecture_ne_laisse_aucun_fichier(tmp_path):
    def lecteur(nom):
        if nom == "Config":
            raise RuntimeError("panne")
        return _donnees_realistes()[nom]

    with pytest.raises(ErreurSauvegarde):
        job_sauvegarde.produire_fichier(lecteur, PHRASE, tmp_path, MAINTENANT)
    assert list(tmp_path.iterdir()) == []


def test_restauration_de_bout_en_bout_avec_csv(tmp_path):
    tables = _donnees_realistes()
    chemin, _ = job_sauvegarde.produire_fichier(_lecteur(tables), PHRASE, tmp_path, MAINTENANT)
    dossier_csv = tmp_path / "csv"
    restaure = restauration.restaurer_fichier(chemin, PHRASE, dossier_csv)
    assert restaure == _normalise(tables)
    for nom, lignes in tables.items():
        with open(dossier_csv / f"{nom}.csv", encoding="utf-8", newline="") as f:
            lus = list(csv.DictReader(f))
        assert len(lus) == len(lignes), nom
    with open(dossier_csv / "pf2_transactions.csv", encoding="utf-8", newline="") as f:
        premiere = next(csv.DictReader(f))
    assert float(premiere["montant"]) == -1200.0


def test_copie_corrompue_detectee_par_empreinte(tmp_path):
    chemin, _ = job_sauvegarde.produire_fichier(_lecteur(_donnees_realistes()), PHRASE, tmp_path, MAINTENANT)
    donnees = bytearray(chemin.read_bytes())
    donnees[40] ^= 0x01
    chemin.write_bytes(bytes(donnees))
    with pytest.raises(ErreurRestauration, match="copie corrompue"):
        restauration.restaurer_fichier(chemin, PHRASE)


def test_cli_restauration_refuse_sans_phrase_valable(tmp_path, monkeypatch):
    chemin, _ = job_sauvegarde.produire_fichier(_lecteur(_donnees_realistes()), PHRASE, tmp_path, MAINTENANT)
    monkeypatch.setenv("SAUVEGARDE_CLE", "mauvaise-phrase-xx")
    assert restauration.main([str(chemin)]) == 1
    monkeypatch.setenv("SAUVEGARDE_CLE", PHRASE)
    assert restauration.main([str(chemin)]) == 0


def test_cli_sauvegarde_sans_phrase_ne_produit_rien(tmp_path, monkeypatch):
    monkeypatch.delenv("SAUVEGARDE_CLE", raising=False)
    monkeypatch.setenv("SAUVEGARDE_DOSSIER", str(tmp_path))
    assert job_sauvegarde.main() == 2
    assert list(tmp_path.iterdir()) == []


def test_workflow_chiffre_controle_puis_publie_et_ne_journalise_jamais_la_phrase():
    # Analyse textuelle (pas de PyYAML : la CI n'installe que requirements.txt).
    texte = (RACINE / ".github/workflows/sauvegarde.yml").read_text(encoding="utf-8")
    i_export = texte.index("run: python jobs/sauvegarde.py")
    # Ancre sur la commande réelle de l'étape (le commentaire d'en-tête la cite aussi).
    i_controle = texte.index('python jobs/restauration.py "$fichier"')
    i_publi = texte.index("uses: actions/upload-artifact")
    assert i_export < i_controle < i_publi, "export, puis restauration de contrôle, puis publication"
    assert "retention-days: 90" in texte
    # La phrase n'est jamais imprimée ni écrite dans un fichier de sortie.
    for interdit in ("echo $SAUVEGARDE_CLE", 'echo "$SAUVEGARDE_CLE', "${SAUVEGARDE_CLE}", "tee "):
        assert interdit not in texte, interdit
    # Ni passée à une action tierce, ni dans un `with:`.
    blocs_with = re.findall(r"with:\n(?:\s{10}.*\n)+", texte)
    assert not any("SAUVEGARDE_CLE" in b for b in blocs_with)
