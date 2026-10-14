"""La proposition d'écriture ne possède ni client réseau ni identité publiée."""

import json
from pathlib import Path

import pytest

from jobs import ligne_r2_2025_hors_ligne as ligne


def test_enveloppe_complete_figee_non_inseree():
    document = ligne.proposer()
    r = document["colonnes_proposees_sans_user_id"]
    assert document["simulation_uniquement"] is True
    assert document["ecriture_autorisee"] is False
    assert "user_id" not in r
    assert r["annee_revenus"] == 2025 and r["revision"] == 2
    assert r["source_ref"].endswith(f"/{ligne.COMMIT_CANDIDAT}/docs/AUDIT-R2-2025.md")
    assert r["actif"] is True and r["statut_validation"] == "valide_pour_perimetre"
    assert len(r["perimetre_validation"]["parametres_utilises"]) == 36
    assert set(r["perimetre_validation"]["sources_par_parametre"]) == set(
        r["perimetre_validation"]["parametres_utilises"])
    assert "or_physique" not in r["parametres"] and "pas" not in r["parametres"]
    fichier = Path(__file__).resolve().parents[1] / "docs/PROPOSITION-R2-2025.json"
    assert json.loads(fichier.read_text(encoding="utf-8")) == json.loads(json.dumps(document))


def test_changement_dune_valeur_ou_dune_source_invalide_la_proposition(monkeypatch):
    original = ligne.parametres_2025
    def fausse_valeur():
        p = original()
        p["forfait_repas"] = 9
        return p
    monkeypatch.setattr(ligne, "parametres_2025", fausse_valeur)
    with pytest.raises(ValueError, match="réauditer"):
        ligne.proposer()
    monkeypatch.setattr(ligne, "parametres_2025", original)
    origine = ligne.verifier
    def fausse_source(params):
        r = origine(params)
        r["sources_par_parametre"]["forfait_repas"] = "https://example.org/erreur"
        return r
    monkeypatch.setattr(ligne, "verifier", fausse_source)
    with pytest.raises(ValueError, match="réauditer"):
        ligne.proposer()
