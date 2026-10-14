"""Aucun formulaire n'affirme certifiés des frais réels non qualifiés."""
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]


def test_page_python_n_ordonne_pas_de_reporter_les_frais_non_qualifies():
    page = (RACINE / "pages/4_Fiscalite.py").read_text(encoding="utf-8")
    assert "Simulation non certifiée" in page or "simulation non certifiée" in page
    assert "ne recopiez pas ces montants sans contrôle" in page
    assert "Inscrivez `{sim['case_1ak']}" not in page
    assert "Inscrivez `{sim['case_1bk']}" not in page


def test_vue_apk_expose_les_conditions_des_frais_reels():
    js = (RACINE / "app/src/main/assets/www/js/fiscal.js").read_text(encoding="utf-8")
    assert "Simulation non certifiée : vérifiez trajets éligibles" in js
    assert "Case ' + caseNom + ' : inscrivez" not in js
