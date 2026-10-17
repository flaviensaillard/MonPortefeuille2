"""2.2.8 : montants Streamlit par titre/case, autres segments préservés.

Transactions fictives uniquement ; aucune donnée de la base du propriétaire.
"""

from datetime import date
from pathlib import Path

import pytest

from core import fiscal_presentation as p, tax
from core.portfolio import Transaction


def tx(ticker, sens, jour, qte, cours, frais=0, devise="EUR"):
    net = qte * cours + frais if sens == "achat" else qte * cours - frais
    return Transaction(ticker, sens, date.fromisoformat(jour), qte, cours, frais, devise, net)


def test_903_garde_les_deux_colonnes_si_deux_ventes_du_meme_titre():
    transactions = [
        tx("XDW0.L", "achat", "2025-01-01", 2, 100),
        tx("XDW0.L", "vente", "2025-04-01", 1, 150),  # +50
        tx("XDW0.L", "vente", "2025-06-01", 1, 80),   # -20
    ]
    resultat = tax.detail_2074_de_lannee(transactions, 2025)
    assert p.calculable(resultat)
    a, = p.titres_par_actif(resultat["par_actif"])
    assert a["actif"] == "XDW0.L" and a["cessions"] == 2
    assert a["ligne_516"] == pytest.approx(230)
    assert a["ligne_518"] == pytest.approx(230)
    assert a["ligne_523"] == pytest.approx(200)
    assert a["ligne_524"] == pytest.approx(30)
    assert a["903_PV"] == resultat["ligne_903_pv"] == 50
    assert a["903_MV"] == resultat["ligne_903_mv"] == 20
    assert [v["ligne_512"] for v in resultat["par_actif"]] == ["2025-04-01", "2025-06-01"]
    assert p.titres_par_actif([]) == []


def test_synthese_crypto_est_intermediaire_et_ne_fabrique_pas_52():
    transactions = [
        tx("BTCUSDT", "achat", "2025-01-01", 2, 100),
        tx("BTCUSDT", "vente", "2025-04-01", 1, 200),
        tx("BTCUSDT", "vente", "2025-06-01", 1, 150),
    ]
    resultat = tax.detail_2086_de_lannee(transactions, 2025)
    assert p.calculable(resultat)
    a, = p.crypto_par_actif(resultat["cessions"])
    assert a["actif"] == "BTCUSDT" and a["cessions"] == 2
    assert a["ligne_218"] == pytest.approx(resultat["total_cessions_218"])
    assert a["ligne_224"] == pytest.approx(resultat["plus_value_globale_224"])
    assert a["ligne_224"] == pytest.approx(150)
    assert p.crypto_par_actif([]) == []
    # 224 n'est que le déclarant, 51/52 appartiennent au foyer entier.
    assert "ligne_52" not in resultat and "ligne_52" not in a


@pytest.mark.parametrize("annee", [2025, 2026])
def test_salaires_restent_calculables_sans_simulation_partielle_du_foyer(annee):
    ds = [
        {"salaire": 32473, "reels": True, "km": 9120, "cv": 5,
         "repas": 180, "electrique": False},
        {"salaire": 29772, "reels": True, "km": 12000, "cv": 6,
         "repas": 190, "electrique": True},
    ]
    s = p.salaires_confirmes(annee, ds)
    sim = tax.simuler_foyer_complet(
        annee=annee, statut="Marié(e) / Pacsé(e)", enfants=1, parts=2.5,
        salaire_1=ds[0]["salaire"], utiliser_frais_reels_1=True,
        km_1=ds[0]["km"], cv_1=ds[0]["cv"], jours_repas_1=ds[0]["repas"],
        salaire_2=ds[1]["salaire"], utiliser_frais_reels_2=True,
        km_2=ds[1]["km"], cv_2=ds[1]["cv"], jours_repas_2=ds[1]["repas"],
        electrique_2=True,
    )
    assert s[0]["salaire"] == sim["case_1aj"]
    assert s[0]["frais"] == sim["case_1ak"]
    assert s[1]["salaire"] == sim["case_1bj"]
    assert s[1]["frais"] == sim["case_1bk"]
    assert s[0]["abattement_10"] == sim["abattement_10_1"]
    assert s[1]["abattement_10"] == sim["abattement_10_2"]


def test_vente_invalide_bloque_son_segment_sans_effacer_l_autre():
    transactions = [
        tx("XDW0.L", "achat", "2025-01-01", 1, 100),
        tx("XDW0.L", "vente", "2025-03-01", 1, 150),
        tx("XDW0.L", "vente", "2025-07-01", 1, 160),  # impossible
        tx("BTCUSDT", "achat", "2025-01-01", 1, 100),
        tx("BTCUSDT", "vente", "2025-06-01", 1, 500),
    ]
    titres = tax.detail_2074_de_lannee(transactions, 2025)
    crypto = tax.detail_2086_de_lannee(transactions, 2025)
    assert titres["ventes_excedentaires"] and not p.calculable(titres)
    assert titres["ligne_903_pv"] == 50, "cette valeur est partielle : ne pas l'afficher comme case"
    assert p.calculable(crypto) and crypto["plus_value_globale_224"] == 400
    # Une vente de 2026 ne bloque pas le guide des revenus 2025.
    transactions[-3] = tx("XDW0.L", "vente", "2026-07-01", 1, 160)
    titres_2025 = tax.detail_2074_de_lannee(transactions, 2025)
    assert p.calculable(titres_2025) and titres_2025["ligne_903_pv"] == 50


def test_page_n_affiche_plus_de_total_partiel_et_garde_les_volets_independants():
    src = (Path(__file__).resolve().parents[1] / "pages/4_Fiscalite.py").read_text()
    assert "sim = tax.simuler_foyer_complet(" in src
    assert ") if bilan_calculable and precompte_connu else None" in src
    assert 'titres_ok = presentation.calculable(d2074)' in src
    assert 'crypto_ok = presentation.calculable(d2086)' in src
    assert 'if not titres_ok:' in src and 'if not crypto_ok:' in src
    assert 'st.tabs(["Montants par titre", "Détail de chaque cession · 510"' in src
    assert 'presentation.titres_par_actif(d2074["par_actif"])' in src
    assert 'presentation.crypto_par_actif(d2086["cessions"])' in src
    assert "st.stop()" not in src.split("d2086 = tax.detail_2086_de_lannee", 1)[1].split(
        "# 2. VOS FORMULAIRES", 1)[0], "un taux manquant ne doit plus supprimer les imprimés"


def _rendu_guide(scenario: str) -> dict:
    """Un AppTest dans son propre processus : autres pages runpy sans contexte.

    Les avertissements de Streamlit vont sur stderr, seul le JSON est en sortie.
    """
    import json
    import subprocess
    import sys

    racine = Path(__file__).resolve().parents[1]
    resultat = subprocess.run(
        [sys.executable, str(racine / "tests/_fiscal_app_test_228.py"), scenario],
        cwd=racine, capture_output=True, text=True, timeout=60, check=True,
    )
    return json.loads(resultat.stdout)


@pytest.mark.parametrize("scenario", ["precompte", "fx", "titres_excedentaires",
                                      "crypto_excedentaire", "complet"])
def test_streamlit_affiche_chaque_segment_calculable_meme_sans_ir(scenario):
    """Rend vraiment la page : taxes fictives, aucune base ni appel réseau."""
    rendu = _rendu_guide(scenario)
    assert not rendu["exceptions"], rendu["exceptions"]
    formulaires = [label for label in rendu["labels"] if label.startswith("📁 Formulaire")]
    assert len(formulaires) == 5 and not any(rendu["ouverts"])
    cases = rendu["cases"]
    assert cases["1AJ"] == "30 000 €"
    assert cases["1AK"] == "LAISSER VIDE"
    assert rendu["metriques"]["2042 · 1AJ"] == "30 000 €", "chiffre avant les formulaires"
    if scenario not in ("fx", "titres_excedentaires"):
        assert "Montants par titre" in rendu["onglets"]
        assert "Détail de chaque cession · 510" in rendu["onglets"]
    if scenario != "crypto_excedentaire":
        assert "Montants par crypto-actif" in rendu["onglets"]
        assert "Détail de chaque cession · 2086" in rendu["onglets"]
    if scenario == "precompte":
        assert cases["2TR"] == rendu["metriques"]["2042 · 2TR"] == "300 €"
        assert rendu["annexes"]["2047"] == {
            "252 → 2TR": "300 €", "250": "300 €", "251": "300 €"}
        assert "2OP" not in cases, "une simulation suspendue n'est pas une fausse case"
    titre_valide = scenario not in ("fx", "titres_excedentaires")
    crypto_valide = scenario != "crypto_excedentaire"
    if titre_valide:
        assert cases["3VG"] == "50 €" and cases["3VH"] == "0 €"
        assert rendu["metriques"]["2042 C · 3VG (ces titres)"] == "50 €"
        assert any("903/PV 50,00 €" in label for label in formulaires)
        assert any("Titre" in cols for cols in rendu["colonnes"])
        assert rendu["annexes"]["vente2074"]["512"] == "2025-05-01"
        assert rendu["annexes"]["vente2074"]["524"] == "50,00 €"
    else:
        assert "vente2074" not in rendu["annexes"]
        assert "3VG" not in cases and "3VH" not in cases
        assert "2042 C · 3VG (ces titres)" not in rendu["metriques"]
        assert not any("Titre" in cols for cols in rendu["colonnes"])
    if crypto_valide:
        assert cases["3AN"].startswith("400,00 € · conditionnel")
        assert cases["3BN"].startswith("0,00 € · conditionnel")
        assert any("224 estimée 400,00 €" in label for label in formulaires)
        assert any("Crypto-actif" in cols for cols in rendu["colonnes"])
        assert rendu["annexes"]["2086"] == {"224": "400,00 €", "51": "500,00 €", "52": "400,00 €"}
        assert rendu["annexes"]["vente2086"]["211"] == "01/06/2025"
        assert rendu["annexes"]["vente2086"]["218"] == "500,00 €"
    else:
        assert "2086" not in rendu["annexes"] and "vente2086" not in rendu["annexes"]
        assert "3AN" not in cases and "3BN" not in cases
        assert not any("Crypto-actif" in cols for cols in rendu["colonnes"])
    assert not any("À compléter depuis vos justificatifs" in m for m in rendu["markdown"])
    if scenario == "complet":
        assert not any("Bilan d'impôt indisponible" in e for e in rendu["errors"])
    else:
        assert any("Bilan" in e for e in rendu["errors"])


def test_page_2026_n_emprunte_pas_les_cases_du_formulaire_2025():
    """2026 : chiffres du bon millésime, aucun numéro de case attribué."""
    rendu = _rendu_guide("futur")
    assert not rendu["exceptions"], rendu["exceptions"]
    assert not any(label.startswith("📁 Formulaire") for label in rendu["labels"])
    assert any("NON reportable" in label for label in rendu["labels"])
    assert any("Formulaires de la déclaration 2027 non vérifiés" in w
               for w in rendu["warnings"])
    assert any("2026-05-01" in m and "50,00 €" in m for m in rendu["markdown"])
    assert any("01/06/2026" in m and "400,00 €" in m for m in rendu["markdown"])
    assert not rendu["cases"]
