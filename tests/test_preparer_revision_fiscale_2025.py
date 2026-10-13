"""Un brouillon vérifiable, non publiable, ne doit jamais toucher Supabase."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

import pytest

from core import fiscal_bars as fb
from jobs import preparer_revision_fiscale_2025 as prep

RACINE = Path(__file__).resolve().parents[1]
SCRIPT = RACINE / "jobs" / "preparer_revision_fiscale_2025.py"


def test_inventaire_isole_2025_et_ne_ressemble_pas_a_une_ligne_inserable():
    b = prep.construire_brouillon()
    assert b["annee_revenus"] == 2025
    assert b["revision_envisagee_sous_reserve_de_lecture_en_base"] == 2
    assert b["etat"] == "incomplet_ne_pas_publier_ni_activer"
    assert b["type"] == "inventaire_local_non_inserable"
    assert not {"user_id", "revision", "parametres", "origine", "source_ref"} & b.keys()
    assert all("2026" not in str(item) for item in b["parametres_candidats"].keys())
    assert "or_physique" not in b["parametres_candidats"]
    assert "exclu" in b["etat_par_regle"]["or_physique"]
    assert b["etat_par_regle"]["pas"].startswith("estimation_sur_salaires")


def test_chiffres_corriges_et_valeurs_precomptees_distingues():
    params = prep.construire_brouillon()["parametres_candidats"]
    assert params["bareme"]["decote_base_couple"] == 1483
    assert params["bareme"]["decote_plafond_couple"] == 3277
    assert params["quotient_familial"]["plafond_general_par_demi_part"] == 1807
    assert params["prelevements_sociaux"] == .186
    assert params["prelevements_sociaux_par_categorie"] == {
        "plus_values_titres": .186,
        "plus_values_crypto_privees": .186,
        "rcm_precomptes_en_2025": .172,
        "rcm_non_precomptes": .186,
    }
    assert params["options_fiscales"]["trois_cn_crypto_independante"] is True
    assert params["options_fiscales"]["trois_cn_disponible_pour_cessions_depuis"] == 2023
    assert set(("bareme", "prelevements_sociaux", "ir_forfaitaire", "abattement_10",
                "forfait_repas", "bareme_km")) <= params.keys()


def test_candidat_se_bloque_en_cas_de_derive_des_constantes():
    with patch.dict(fb.PS_PAR_ANNEE, {2025: .172}):
        with pytest.raises(RuntimeError, match="Constante locale modifiée"):
            prep.construire_brouillon()


def test_cli_hors_ligne_refuse_appliquer_et_les_autres_annees():
    env = {**os.environ, "SUPABASE_KEY": "FAUX_SECRET_NON_UTILISE"}
    p = subprocess.run([sys.executable, str(SCRIPT)], cwd=RACINE, env=env,
                       capture_output=True, text=True, check=True)
    b = json.loads(p.stdout)
    assert b["annee_revenus"] == 2025 and "FAUX_SECRET_NON_UTILISE" not in p.stdout
    assert not p.stderr
    simulation = subprocess.run([
        sys.executable, str(SCRIPT), "--simuler-ligne", "--aucun-autre-rcm-2025",
        "--aucune-autre-cession-crypto-2025",
    ], cwd=RACINE, env=env, capture_output=True, text=True, check=True)
    document = json.loads(simulation.stdout)
    assert document["portee_calcul_2025"]["franchise_crypto_evaluable_sur_les_cessions_chargees"] is True
    assert document["champs_ligne_envisagee"]["annee_revenus"] == 2025
    assert document["champs_ligne_envisagee"]["source_ref"] is None
    assert "FAUX_SECRET_NON_UTILISE" not in simulation.stdout
    for args in (["--appliquer"], ["--annee", "2026"], ["--aucun-autre-rcm-2025"]):
        refus = subprocess.run([sys.executable, str(SCRIPT), *args], cwd=RACINE,
                               env=env, capture_output=True, text=True)
        assert refus.returncode != 0
        assert not refus.stdout
        assert "FAUX_SECRET_NON_UTILISE" not in refus.stderr
