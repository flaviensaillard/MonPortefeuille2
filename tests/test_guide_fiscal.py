"""Le guide de déclaration : quel formulaire, quelle case, quel montant.

Ces tests verrouillent trois choses que la page Fiscalité avait perdues :

1. **Le guide existe.** Il ne se contente plus de calculer l'impôt — il dit où
   l'inscrire. Un montant juste dans une case inconnue ne sert à rien.

2. **Le guide s'affiche même sans cession.** C'est le point le plus important :
   `st.stop()` tuait la page dès qu'il n'y avait aucune cession, donc
   précisément les années où il faut quand même déclarer un compte à
   l'étranger, ou sauver une moins-value. Ces tests exercent le cas « aucune
   cession » au même titre que les autres.

3. **Les taux sont ceux de la loi, pas ceux d'une soustraction.** Le PFU valait
   30,8 % : `0,308 - 0,172 = 0,136` d'IR au lieu de 12,8 %. Pour 2026, il vaut
   31,4 % (LFSS 2026, art. 12).
"""

from __future__ import annotations

import pytest

from core import fiscal_bars as fb
from core import guide_fiscal as guide


class _FauxResultat:
    """Un `ResultatFiscal` réduit à ce que le guide consomme."""

    def __init__(self, plus_value_brute, plus_value_imposable,
                 detail=None, total_cessions=None, exonere_par_franchise=None):
        self.regime = "test"
        self.plus_value_brute = plus_value_brute
        self.plus_value_imposable = plus_value_imposable
        self.detail = detail or []
        self.total_cessions = total_cessions
        self.exonere_par_franchise = exonere_par_franchise


def _guide(**kw):
    return guide.construire_guide(
        annee=kw.pop("annee", 2026),
        resultats=kw.pop("resultats", {}),
        comptes_etrangers=kw.pop("comptes_etrangers", []),
        comparaison=kw.pop("comparaison", None),
    )


def _cases(etapes, formulaire):
    """Toutes les cases portant ce numéro de FORMULAIRE, où qu'elles vivent.

    On cherche par formulaire de la case, pas par étape : une étape « 2086 »
    porte des cases qui partent en « 2042-C » (3AN/3BN), et la case 8UU vit
    dans l'étape « 3916-bis ».
    """
    return [c for e in etapes for c in e.cases if c.formulaire == formulaire]


def _montant(etapes, formulaire, numero):
    for c in _cases(etapes, formulaire):
        if c.numero == numero:
            return c.montant
    raise AssertionError(f"case {numero} absente de {formulaire}")


# ---------------------------------------------------------------------------
# Le cas que la page ne savait plus traiter : aucune cession
# ---------------------------------------------------------------------------

class TestAucuneCession:
    def test_le_guide_n_est_pas_vide_si_un_compte_est_a_l_etranger(self):
        """Une année sans vente n'est PAS une année sans obligation.

        La 3916-bis se dépose tous les ans, même sans une seule opération. La
        page précédente appelait `st.stop()` avant d'afficher quoi que ce soit.
        """
        etapes = _guide(comptes_etrangers=guide.comptes_par_defaut())
        assert etapes, "le guide a disparu alors qu'un compte est à l'étranger"
        assert etapes[0].formulaire == "3916-bis"

    def test_un_formulaire_3916_par_compte(self):
        comptes = guide.comptes_par_defaut()
        etapes = _guide(comptes_etrangers=comptes)
        cases = [c for c in _cases(etapes, "3916-bis") if c.libelle.startswith("Compte")]
        assert len(cases) == len(comptes)

    def test_la_case_8uu_est_rappelee(self):
        """L'oubli de la case à cocher coûte 1 500 € par compte et par an,
        même quand tous les revenus sont correctement déclarés."""
        etapes = _guide(comptes_etrangers=guide.comptes_par_defaut())
        assert _montant(etapes, "2042", "8UU") is None
        assert any(c.numero == "8UU" for c in _cases(etapes, "2042"))

    def test_aucun_compte_aucune_etape(self):
        assert _guide(comptes_etrangers=[]) == []

    def test_la_case_8uu_vit_dans_l_etape_3916(self):
        """La 8UU est une case de la 2042, mais c'est le 3916-bis qui la
        commande : la ranger dans une etape « 2042 » ferait perdre le lien."""
        etapes = _guide(comptes_etrangers=guide.comptes_par_defaut())
        assert any(c.numero == "8UU" for c in etapes[0].cases)


# ---------------------------------------------------------------------------
# Plus-values de valeurs mobilières
# ---------------------------------------------------------------------------

class TestValeursMobilieres:
    def test_plus_value_va_en_3vg(self):
        r = _FauxResultat(2_000.0, 2_000.0, detail=[1, 2, 3])
        etapes = _guide(resultats={"pv_titres": r})
        assert _montant(etapes, "2042-C", "3VG") == pytest.approx(2_000.0)

    def test_moins_value_va_en_3vh_en_positif(self):
        """La case 3VH attend un montant positif. Un moins-value non déclarée
        est une moins-value perdue : le fisc ne reconstruit pas l'historique."""
        r = _FauxResultat(-800.0, 0.0)
        etapes = _guide(resultats={"pv_titres": r})
        assert _montant(etapes, "2042-C", "3VH") == pytest.approx(800.0)

    def test_le_2074_cmv_est_exige_des_qu_il_y_a_un_montant(self):
        r = _FauxResultat(2_000.0, 2_000.0)
        etapes = _guide(resultats={"pv_titres": r})
        toutes = [c for e in etapes for c in e.cases]
        assert any(c.formulaire == "2074-CMV" for c in toutes)

    def test_la_2047_est_exigee_pour_des_titres_etrangers(self):
        """Les titres sont chez Swissquote : la plus-value est de source
        étrangère, la 2047 est le chemin obligé vers la 3VG."""
        r = _FauxResultat(2_000.0, 2_000.0)
        etapes = _guide(resultats={"pv_titres": r},
                        comptes_etrangers=guide.comptes_par_defaut())
        assert any(e.formulaire == "2047" for e in etapes)


# ---------------------------------------------------------------------------
# Crypto — la franchise, pas l'abattement
# ---------------------------------------------------------------------------

class TestCrypto:
    def test_au_dessus_du_seuil_tout_est_imposable(self):
        r = _FauxResultat(500.0, 500.0, detail=[1], total_cessions=1_000.0,
                          exonere_par_franchise=False)
        etapes = _guide(resultats={"pv_crypto": r})
        assert _montant(etapes, "2042-C", "3AN") == pytest.approx(500.0)
        # Aucun abattement ne doit apparaitre : le seuil declenche, il ne retire rien.
        texte = " ".join(c.comment for c in _cases(etapes, "2042-C"))
        assert "AUCUN abattement" in texte

    def test_sous_le_seuil_rien_a_reporter_mais_la_2086_reste_due(self):
        r = _FauxResultat(200.0, 0.0, detail=[1], total_cessions=200.0,
                          exonere_par_franchise=True)
        etapes = _guide(resultats={"pv_crypto": r})
        assert any(e.formulaire == "2086" for e in etapes), "la 2086 a disparu"
        # Le gain existe mais reste exonere : la case 3AN est citee pour dire
        # qu'il n'y a RIEN a y mettre, et elle n'est pas obligatoire.
        case = next(c for c in _cases(etapes, "2042-C") if c.numero == "3AN")
        assert case.montant is None
        assert case.obligatoire is False

    def test_moins_value_va_en_3bn_en_positif(self):
        r = _FauxResultat(-300.0, 0.0, total_cessions=900.0,
                          exonere_par_franchise=False)
        etapes = _guide(resultats={"pv_crypto": r})
        assert _montant(etapes, "2042-C", "3BN") == pytest.approx(300.0)


# ---------------------------------------------------------------------------
# Les taux
# ---------------------------------------------------------------------------

class TestTaux:
    def test_2026_est_a_31_4_pour_cent(self):
        """LFSS 2026, art. 12 : CSG capital a 10,6 %, donc PS a 18,6 %."""
        assert fb.taux_pfu(2026) == pytest.approx(0.314)

    def test_2025_est_a_30_pour_cent(self):
        assert fb.taux_pfu(2025) == pytest.approx(0.300)


    def test_l_ir_n_est_pas_une_soustraction(self):
        """L'ancien code faisait `PFU_TAUX - PRELEVEMENTS_SOCIAUX` = 0,136."""
        assert fb.IR_FORFAITAIRE == pytest.approx(0.128)
        assert fb.IR_FORFAITAIRE != pytest.approx(0.308 - 0.172)


# ---------------------------------------------------------------------------
# L'option pour le barème
# ---------------------------------------------------------------------------

class TestOptionBareme:
    def test_la_2op_apparait_avec_la_comparaison(self):
        r = _FauxResultat(5_000.0, 5_000.0)
        comp = {
            "plus_value_nette": 5_000.0,
            "pfu": {"ir": 640.0, "ps": 930.0, "total": 1_570.0},
            "bareme": {"ir_marginal": 1_500.0, "ps": 930.0,
                       "csg_deductible": 340.0, "total": 2_430.0},
            "choix": "PFU",
            "gain": 860.0,
            "tmi": 0.30,
        }
        etapes = _guide(resultats={"pv_titres": r}, comparaison=comp)
        cases = _cases(etapes, "2042")
        op = next(c for c in cases if c.numero == "2OP")
        assert op.obligatoire is False, "la 2OP ne se coche que si c'est avantageux"
        assert "PFU" in op.comment

    def test_pas_de_plus_value_pas_de_2op(self):
        r = _FauxResultat(-500.0, 0.0)
        etapes = _guide(resultats={"pv_titres": r})
        assert not any(e.formulaire == "2042" for e in etapes)


# ---------------------------------------------------------------------------
# Invariants
# ---------------------------------------------------------------------------

class TestInvariants:
    def test_les_etapes_sont_numerotees_dans_l_ordre(self):
        r = _FauxResultat(2_000.0, 2_000.0, detail=[1])
        c = _FauxResultat(500.0, 500.0, total_cessions=1_000.0,
                          exonere_par_franchise=False)
        etapes = _guide(resultats={"pv_titres": r, "pv_crypto": c},
                        comptes_etrangers=guide.comptes_par_defaut())
        assert [e.ordre for e in etapes] == list(range(1, len(etapes) + 1))

    def test_chaque_etape_dit_ou_aller(self):
        """Un formulaire sans mode d'emploi ne sert a rien le jour J."""
        r = _FauxResultat(2_000.0, 2_000.0)
        c = _FauxResultat(500.0, 500.0, total_cessions=1_000.0,
                          exonere_par_franchise=False)
        etapes = _guide(resultats={"pv_titres": r, "pv_crypto": c},
                        comptes_etrangers=guide.comptes_par_defaut())
        for e in etapes:
            assert e.ou.strip(), f"{e.formulaire} sans chemin d'acces"
            assert e.raison.strip(), f"{e.formulaire} sans raison"

    def test_chaque_montant_dit_d_ou_il_vient(self):
        r = _FauxResultat(2_000.0, 2_000.0)
        etapes = _guide(resultats={"pv_titres": r})
        for e in etapes:
            for c in e.cases:
                assert c.comment.strip(), f"case {c.numero} sans explication"



def test_frais_kilometriques_et_repas_et_simulation_foyer():
    from core import fiscal_bars as fb, tax
    km_val, km_txt = fb.frais_kilometriques(9120, 5)
    assert km_val == pytest.approx(9120 * 0.357 + 1395.0)
    assert "5 CV" in km_txt and "4 650,84 €" in km_txt

    rep_val, rep_txt = fb.frais_repas(240, 2025)
    assert rep_val == pytest.approx(240 * 5.45)

    sim = tax.simuler_foyer_complet(
        annee=2025,
        statut="Marié(e) / Pacsé(e)",
        enfants=2,
        parts=3.0,
        salaire_1=32473.0,
        utiliser_frais_reels_1=True,
        km_1=9120,
        cv_1=5,
        jours_repas_1=240,
        salaire_2=29772.0,
        utiliser_frais_reels_2=True,
        km_2=9120,
        cv_2=5,
        jours_repas_2=200,
        interets_etrangers_eur=200.0,
        pays_interets_etrangers="Lituanie",
        bilan_pv_actions_eur=651.48,
        bilan_pv_crypto_imposable_eur=0.0,
    )
    assert sim["case_1aj"] == 32473
    assert sim["case_1ak"] == 5959
    assert sim["case_1bj"] == 29772
    assert sim["case_1bk"] == 5741
    assert sim["case_2tr"] == 200
    # Avec 50 545 € de revenu imposable et 3 parts, le foyer est dans la zone de
    # décote (IR brut = 1 731,95 € < plafond couple), où le taux marginal effectif
    # au barème est de 11 % × 1,4525 × (1 - 0,068) = 14,89 % > 12,8 % (PFU).
    assert sim["cocher_2op"] is False


def test_formulaires_fiscaux_fermes_par_defaut():
    """Tous les volets de formulaires dans pages/4_Fiscalite.py doivent être fermés à l'ouverture (expanded=False)."""
    import pathlib
    src = pathlib.Path("pages/4_Fiscalite.py").read_text(encoding="utf-8")
    assert "Formulaire 2042 & 2042-C" in src
    assert "Formulaire 2047" in src
    assert "Formulaire 2074 / 2074-CMV" in src
    assert "Formulaire 2086" in src
    assert "Formulaire 3916 / 3916-bis" in src
    assert "expanded=True" not in src


def test_reequilibrage_integre_cash_disponible():
    """Le diagnostic de rééquilibrage recalcule le poids réel sur (investi + cash disponible)."""
    from core.models import POCHES_INVESTIES
    from core.portfolio import EtatPoche
    from core.rebalance import diagnostiquer

    poche = POCHES_INVESTIES[0]  # cible 20 % (0.20)
    val = 8000.0 * poche.cible   # 1600 $
    etat = EtatPoche(
        poche=poche,
        valeur_eur=val,
        valeur_usd=val,
        poids_reel=1.0,  # 100 % des seuls actifs investis
        poids_cible=poche.cible,
        actifs=[],
    )
    # Si on a 1600 $ d'actifs et 6400 $ de cash disponible (assiette = 8000 $),
    # le poids réel sur l'assiette est 1600 / 8000 = 20 % (pile à la cible, écart = 0).
    ecarts = diagnostiquer({poche.cle: etat}, total_investi_eur=8000.0, total_investi_usd=8000.0)
    assert len(ecarts) == 1
    assert abs(ecarts[0].poids_reel - poche.cible) < 1e-9
    assert abs(ecarts[0].ecart_usd) < 1e-6
    assert not ecarts[0].hors_bande



def test_calculer_rente_mensuelle_reelle():
    """Vérifie le calcul de la rente mensuelle actuelle sur le principe de la retraite réelle."""
    from core import metrics

    # Capital 80 000 $, apports 60 000 $ (PV = 20 000 $, part_pv = 25 %)
    # Rendement 8 %/an, inflation 2 %/an -> r_reel = 1.08 / 1.02 - 1 = 5.8823529 %
    res = metrics.calculer_rente_mensuelle_reelle(
        capital_usd=80000.0,
        apports_cumules_usd=60000.0,
        rendement_annuel=0.08,
        inflation_annuelle=0.02,
        taux_imposition_pv=0.30,
        taux_eur_usd=1.15,
    )
    assert abs(res["part_pv"] - 0.25) < 1e-9
    r_reel_attendu = 1.08 / 1.02 - 1.0
    brute_attendue = 80000.0 * r_reel_attendu / 12.0
    impot_attendu = brute_attendue * 0.25 * 0.30
    nette_attendue = brute_attendue - impot_attendu
    assert abs(res["rente_brute_usd"] - brute_attendue) < 1e-6
    assert abs(res["impot_usd"] - impot_attendu) < 1e-6
    assert abs(res["rente_nette_usd"] - nette_attendue) < 1e-6
    assert abs(res["rente_nette_eur"] - nette_attendue / 1.15) < 1e-6
