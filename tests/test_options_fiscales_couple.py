"""Options 2OP et 3CN d'un couple : scénarios 2025, sans données Supabase.

DGFiP, notice 2086 revenus 2025 : 3CN est globale pour les actifs numériques
mais indépendante de 2OP (revenus et gains mobiliers). Voir également la page
« Les revenus mobiliers » pour le précompte 2025 et l'option globale 2OP.
"""
import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from core import guide_fiscal, tax

COUPLE = "Marié(e) / Pacsé(e)"


def _options(revenu=18_000, parts=2, titres=0, crypto=0, interets=0, precompte=None):
    return tax.comparer_options_foyer(revenu, parts, 2025, COUPLE,
        pv_titres=titres, pv_crypto=crypto, interets=interets,
        interets_ps_precomptes=precompte)


@pytest.mark.parametrize("titres,crypto,choix", [
    (15_000, 100, (True, False)),     # 2OP sans 3CN
    (100, 15_000, (False, True)),     # 3CN sans 2OP
    (100, 100, (False, False)),      # IR global sous 61 € : égalité, défaut sans options
])
def test_les_options_sont_independantes(titres, crypto, choix):
    r = _options(titres=titres, crypto=crypto)
    assert len(r["scenarios"]) == 4
    assert (r["retenu"]["cocher_2op"], r["retenu"]["cocher_3cn"]) == choix
    assert r["scenarios"][0]["impot_total_foyer"] - r["retenu"]["impot_total_foyer"] == pytest.approx(r["economie_vs_pfu"])
    assert all(s["ps_titres"] == pytest.approx(titres * .186) and
               s["ps_crypto"] == pytest.approx(crypto * .186) for s in r["scenarios"])


def test_les_marges_separees_donnent_le_mauvais_choix_en_presence_de_crypto():
    r = _options(revenu=20_000, titres=100, crypto=20_000)
    defaut, cn_seule, op_seule, ensemble = r["scenarios"]
    # Comparées séparément au défaut, les deux options semblent avantageuses.
    assert op_seule["impot_total_foyer"] < defaut["impot_total_foyer"]
    assert cn_seule["impot_total_foyer"] < defaut["impot_total_foyer"]
    # Ensemble, l'IR progressif franchit une limite : mieux vaut 3CN seule.
    assert ensemble["impot_total_foyer"] > cn_seule["impot_total_foyer"]
    assert r["retenu"] is cn_seule
    assert r["retenu"]["impot_total_foyer"] == pytest.approx(4952.62)


def test_ps_precomptes_comptes_une_fois_et_total_annuel_distinct_du_restant():
    r = _options(revenu=50_000, parts=3, titres=1000, crypto=1000,
                 interets=1000, precompte=True)
    assert len(r["scenarios"]) == 4
    for s in r["scenarios"]:
        assert (s["ps_titres"], s["ps_interets"], s["ps_crypto"]) == pytest.approx((186, 172, 186))
        assert s["ps_total"] == pytest.approx(544)
        assert s["ps_deja_precomptes"] == pytest.approx(172)
        assert s["ps_restants"] == pytest.approx(372)
        assert s["csg_deductible_annee"] == pytest.approx(68 if s["cocher_2op"] else 0)
    sans = _options(revenu=50_000, parts=3, titres=1000, crypto=1000,
                    interets=1000, precompte=False)
    assert sans["retenu"]["ps_total"] == pytest.approx(558)
    assert sans["retenu"]["ps_restants"] == pytest.approx(558)
    with pytest.raises(ValueError, match="précomptés"):
        _options(revenu=50_000, titres=1000, interets=1000)


def test_pas_de_3cn_si_crypto_non_imposable_et_pas_de_2op_si_titres_absents():
    assert len(_options(titres=1000)["scenarios"]) == 2
    crypto = _options(crypto=1000)
    assert len(crypto["scenarios"]) == 2
    assert all(not s["cocher_2op"] for s in crypto["scenarios"])
    aucun = _options()
    assert len(aucun["scenarios"]) == 1
    assert aucun["retenu"]["impot_total_foyer"] == pytest.approx(
        tax.impot_revenu(18_000, 2, 2025, COUPLE).impot_net)


def test_option_3cn_n_existe_pas_pour_les_cessions_2022():
    o = tax.comparer_options_foyer(18_000, 2, 2022, COUPLE,
                                   pv_titres=100, pv_crypto=15_000)
    assert len(o["scenarios"]) == 2  # 2OP seulement ; crypto au PFU
    assert o["assiette_3cn"] == 0
    assert all(not s["cocher_3cn"] for s in o["scenarios"])
    assert all(s["ps_crypto"] == pytest.approx(15_000 * .172) for s in o["scenarios"])


def test_guide_declaration_ne_separe_pas_les_choix_quand_crypto_presente():
    opts = _options(revenu=20_000, titres=100, crypto=20_000)
    titres = SimpleNamespace(plus_value_brute=100, plus_value_imposable=100, detail=[])
    crypto = SimpleNamespace(plus_value_brute=20_000, plus_value_imposable=20_000,
                             total_cessions=25_000, exonere_par_franchise=False, detail=[])
    etapes = guide_fiscal.construire_guide(
        annee=2025, resultats={"pv_titres": titres, "pv_crypto": crypto},
        comptes_etrangers=[], options_fiscales=opts)
    cases = {c.numero: c for e in etapes for c in e.cases if c.numero in ("2OP", "3CN")}
    assert set(cases) == {"2OP", "3CN"}
    assert cases["2OP"].obligatoire is False  # diffère de 2OP prise isolément
    assert cases["3CN"].obligatoire is True
    assert "indépendante" in cases["3CN"].comment or "distincte" in cases["3CN"].comment


@pytest.mark.skipif(not shutil.which("node"), reason="Node.js indisponible")
def test_parite_python_javascript_couple_maries_avec_precompte_et_quatre_options():
    racine = Path(__file__).resolve().parents[1]
    donnees = [
        [2025, 18_000, 2, 100, 0, None, 100],  # IR global sous 61 €
        [2025, 18_000, 2, 15_000, 0, None, 100],
        [2025, 20_000, 2, 100, 0, None, 20_000],
        [2025, 50_000, 3, 1000, 1000, True, 1000],
        [2025, 50_000, 3, 1000, 1000, False, 1000],
        [2022, 18_000, 2, 100, 0, None, 15_000],
    ]
    code_js = """
        require('./app/src/main/assets/www/js/util.js');
        require('./app/src/main/assets/www/js/fiscal.js');
        const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
        process.stdout.write(JSON.stringify(data.map(x =>
            PF.fiscal.comparerOptionsFoyer(x[1], x[2], x[0], 'Marié(e) / Pacsé(e)', x[3], x[4], x[5], x[6]))));
    """
    proc = subprocess.run(["node", "-e", code_js], input=json.dumps(donnees), text=True,
                          capture_output=True, check=True, cwd=racine)
    resultats_js = json.loads(proc.stdout)
    for (annee, revenu, parts, titres, interets, precompte, crypto), js in zip(donnees, resultats_js):
        py = tax.comparer_options_foyer(revenu, parts, annee, COUPLE,
            pv_titres=titres, interets=interets,
            interets_ps_precomptes=precompte, pv_crypto=crypto)
        assert len(js["scenarios"]) == len(py["scenarios"])
        for a, b in zip(js["scenarios"], py["scenarios"]):
            assert (a["cocher_2op"], a["cocher_3cn"]) == (b["cocher_2op"], b["cocher_3cn"])
            for cle in ("ir_bareme", "ir_forfaitaire", "ps_total", "ps_deja_precomptes",
                        "ps_restants", "csg_deductible_annee", "impot_total_foyer"):
                assert a[cle] == pytest.approx(b[cle], abs=.02), (annee, cle)
        assert (js["retenu"]["cocher_2op"], js["retenu"]["cocher_3cn"]) == (
            py["retenu"]["cocher_2op"], py["retenu"]["cocher_3cn"])


def test_bilan_foyer_retenu_coherent_avec_les_quatre_scenarios():
    sim = tax.simuler_foyer_complet(
        annee=2025, statut=COUPLE, enfants=0, parts=2,
        salaire_1=12_000, salaire_2=8_000,
        utiliser_frais_reels_1=False, km_1=0, cv_1=5, jours_repas_1=0,
        bilan_pv_actions_eur=100, bilan_pv_crypto_imposable_eur=15_000,
        interets_etrangers_eur=500, interets_ps_precomptes=True,
    )
    opts = sim["options_fiscales"]
    assert len(opts["scenarios"]) == 4
    assert (sim["cocher_2op"], sim["cocher_3cn"]) == (
        opts["retenu"]["cocher_2op"], opts["retenu"]["cocher_3cn"])
    assert sim["impot_total_foyer"] == pytest.approx(opts["retenu"]["impot_total_foyer"], abs=.01)
    assert sim["impot_capital_retenu"] == pytest.approx(opts["retenu"]["cout_capital"], abs=.01)
    assert sim["impot_crypto"] == pytest.approx(15_000 * .314)  # PFU de référence, non retenu si 3CN
