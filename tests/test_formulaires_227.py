"""2074 2025 : par cession, frais séparés, report 903 et miroir Android.

Source DGFiP : imprimé 2074 N°11905*26, cadre 510 (512, 514–524) puis
cadre 900 ligne 903 col. PV/MV ; 905 = instruments à terme, 913 = total du cadre.
Aucune donnée personnelle ni appel réseau (toutes les transactions en EUR).
"""
import datetime as dt
from pathlib import Path
import pytest
from core import tax
from core.portfolio import Transaction


def operation(sens, date, quantite, cours, frais):
    net = quantite * cours + frais if sens == 'achat' else quantite * cours - frais
    return Transaction('XDW0.L', sens, dt.date.fromisoformat(date),
                       quantite, cours, frais, 'EUR', net)


def test_deux_cessions_dates_reelles_frais_et_report_903():
    txs = [
        operation('achat', '2025-01-10', 10, 100, 10),
        operation('achat', '2025-02-10', 10, 200, 20),
        operation('vente', '2025-06-10', 5, 250, 5),
        operation('vente', '2025-09-20', 5, 260, 10),
    ]
    r = tax.detail_2074_de_lannee(txs, 2025)
    assert r['calcul_complet'] is True
    assert len(r['par_actif']) == 2, 'une colonne 510 par cession, pas par ticker'
    a, b = r['par_actif']
    assert a['ligne_512'] == '2025-06-10'
    assert b['ligne_512'] == '2025-09-20'
    assert a['ligne_516'] == pytest.approx(1250)
    assert a['ligne_517'] == pytest.approx(5)
    assert a['ligne_518'] == pytest.approx(1245)
    assert a['ligne_521'] == pytest.approx(750)
    assert a['ligne_522'] == pytest.approx(7.5)
    assert a['ligne_523'] == pytest.approx(757.5)
    assert a['ligne_524'] == pytest.approx(487.5)
    assert b['ligne_516'] == pytest.approx(1300)
    assert b['ligne_517'] == pytest.approx(10)
    assert b['ligne_518'] == pytest.approx(1290)
    assert b['ligne_522'] == pytest.approx(7.5)
    assert b['ligne_524'] == pytest.approx(532.5)
    assert r['ligne_903_pv'] == pytest.approx(1020)
    assert r['ligne_903_mv'] == pytest.approx(0)
    assert r['case_3vg'] == pytest.approx(1020)
    assert r['case_3vh'] == 0
    assert 'ligne_905' not in r and 'ligne_913' not in r, 'noms trompeurs interdits'
    assert r['abattementsNonVerifies'] is False
    assert sum(l['Col H — Gain imposable (E − F − G) (€)'] for l in r['cadre_11']) == pytest.approx(1020)


def test_stock_moins_values_ancien_vers_cadres_10_11_12():
    txs = [
        operation('achat', '2024-01-10', 10, 100, 0),
        operation('vente', '2024-06-10', 10, 80, 0),  # -200 sur 2024
        operation('achat', '2025-01-10', 10, 100, 0),
        operation('vente', '2025-06-10', 10, 110, 0),  # +100 sur 2025
    ]
    r = tax.detail_2074_de_lannee(txs, 2025)
    assert r['cadre_10'] == [{'annee': 2024, 'montant': 200.0}]
    assert r['ligne_1164'] == pytest.approx(100)
    assert r['cadre_12'] == [{'annee': 2024, 'montant': 100.0}]
    assert r['case_3vg'] == 0
    assert r['case_3vh'] == 0


def test_moins_value_nette_de_l_annee_alimente_cadre_12():
    txs = [operation('achat', '2025-01-10', 10, 100, 0),
           operation('vente', '2025-06-10', 10, 80, 0)]
    r = tax.detail_2074_de_lannee(txs, 2025)
    assert r['ligne_903_mv'] == pytest.approx(200)
    assert r['case_3vh'] == pytest.approx(200)
    assert r['cadre_11'] == []
    assert r['cadre_12'] == [{'annee': 2025, 'montant': 200.0}]


def test_page_streamlit_ne_retombe_pas_sur_les_anciens_reports():
    """L'écran Streamlit et l'APK ne doivent pas diverger sur les deux formulaires."""
    src = (Path(__file__).resolve().parent.parent / 'pages/4_Fiscalite.py').read_text(encoding='utf-8')
    assert "d2074['ligne_905']" not in src and 'd2074["ligne_905"]' not in src
    assert "d2074['ligne_913']" not in src and 'd2074["ligne_913"]' not in src
    assert 'Ligne `905` (Total des plus-values)' not in src
    assert 'Ligne `913` (Total des moins-values)' not in src
    assert "903/PV {ui.eur(d2074['ligne_903_pv'])}" in src
    assert "903/MV {ui.eur(d2074['ligne_903_mv'])}" in src
    assert '913 est le total du cadre 900 ; 905 concerne' in src
    assert 'Frais de cession :** `0 €`' not in src
    assert 'Frais d\'acquisition :** `0 €`' not in src
    assert 'Soulte reçue ou versée :** `0 €`' not in src
    assert 'Soultes reçues en cas d\'échanges antérieurs :** `0 €`' not in src
    assert 'ligne 52 du foyer complet' in src
    assert 'total_cessions_218' in src, 'le seuil du 2086 porte sur le net des frais'
