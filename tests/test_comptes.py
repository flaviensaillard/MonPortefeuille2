"""Comptes de liquidités — côté Python (cahier 2.0).

Le robot nocturne, Streamlit et les tests lisent les mêmes règles que l'application :
- le solde est la somme signée des opérations, jamais stockée ;
- une réserve va en précaution, un disponible en courant ; un compte archivé reste compté ;
- la migration ne change pas le patrimoine (même chiffres, mêmes totaux) ;
- Python n'écrit plus le cash dans `Donnees` quand les comptes existent ;
- une table optionnelle absente (comptes) n'arrête pas le robot.

Aucun appel réseau : Supabase et Yahoo sont remplacés par des faux.
"""

from __future__ import annotations

import os

import pandas as pd
import pytest

from core import db, portfolio, session
from core.models import POCHE_DE_TYPE_COMPTE, CompteCash, Perimetre, TypeCompte


COMPTES = [
    {"id": "c-usd", "nom": "Courtage USD", "devise": "USD", "type": "disponible",
     "banque": "Swissquote", "motif": None, "archive": False, "note": None},
    {"id": "c-chf", "nom": "Livret CHF", "devise": "CHF", "type": "reserve",
     "banque": "Swissquote", "motif": "Épargne de précaution", "archive": False, "note": None},
    {"id": "c-cny", "nom": "Compte CNY", "devise": "CNY", "type": "reserve",
     "banque": None, "motif": None, "archive": False, "note": None},
    {"id": "c-voy", "nom": "Voyage CNY", "devise": "CNY", "type": "disponible",
     "banque": None, "motif": "Voyage", "archive": False, "note": None},
]

OPERATIONS = [
    {"id": 1, "compte_id": "c-usd", "type": "ouverture", "montant": 7.385},
    {"id": 2, "compte_id": "c-chf", "type": "ouverture", "montant": 8694.44},
    {"id": 3, "compte_id": "c-cny", "type": "ouverture", "montant": 0},
    {"id": 4, "compte_id": "c-voy", "type": "ouverture", "montant": 5000},
    {"id": 5, "compte_id": "c-voy", "type": "depot", "montant": 250},
    {"id": 6, "compte_id": "c-voy", "type": "retrait", "montant": -100},
]


def _par_perimetre(groupes: list[dict]) -> dict[str, float]:
    total: dict[str, float] = {}
    for g in groupes:
        total[g["perimetre"]] = total.get(g["perimetre"], 0.0) + g["quantite"]
    return total


# --- Règles pures ----------------------------------------------------------

def test_solde_somme_signee_des_operations():
    soldes = portfolio.soldes_par_compte(COMPTES, OPERATIONS)
    assert soldes["c-voy"] == pytest.approx(5000 + 250 - 100)
    assert soldes["c-usd"] == pytest.approx(7.385)


def test_operation_orpheline_ignoree_pas_comptee():
    soldes = portfolio.soldes_par_compte(COMPTES, OPERATIONS + [
        {"id": 9, "compte_id": "inconnu", "type": "depot", "montant": 999},
    ])
    assert "inconnu" not in soldes
    assert sum(soldes.values()) == pytest.approx(sum(portfolio.soldes_par_compte(COMPTES, OPERATIONS).values()))


def test_reserve_va_en_precaution_disponible_en_courant():
    assert POCHE_DE_TYPE_COMPTE[TypeCompte.RESERVE] is Perimetre.PRECAUTION
    assert POCHE_DE_TYPE_COMPTE[TypeCompte.DISPONIBLE] is Perimetre.COURANT
    groupes = portfolio.grouper_liquidites(COMPTES, OPERATIONS)
    cny = {g["perimetre"]: g["quantite"] for g in groupes if g["devise"] == "CNY"}
    # Voyage CNY (disponible) : 5 150 en courant. Compte CNY (réserve) : 0, donc absent.
    assert cny == {"courant": pytest.approx(5150)}
    assert {g["perimetre"] for g in groupes if g["devise"] == "CHF"} == {"precaution"}


def test_compte_archive_reste_compte_dans_le_patrimoine():
    avant = portfolio.grouper_liquidites(COMPTES, OPERATIONS)
    archives = [dict(c, archive=True) if c["id"] == "c-voy" else c for c in COMPTES]
    apres = portfolio.grouper_liquidites(archives, OPERATIONS)
    assert _par_perimetre(apres) == pytest.approx(_par_perimetre(avant))


def test_groupe_nul_nest_pas_liste():
    groupes = portfolio.grouper_liquidites(COMPTES, [op for op in OPERATIONS if op["compte_id"] != "c-cny"])
    assert all(abs(g["quantite"]) > 1e-9 for g in groupes)


def test_compte_cash_dataclass_perimetre():
    c = CompteCash(id="x", nom="Livret", devise="CHF", type=TypeCompte.RESERVE)
    assert c.perimetre is Perimetre.PRECAUTION
    assert CompteCash(id="y", nom="C", devise="USD", type=TypeCompte.DISPONIBLE).perimetre is Perimetre.COURANT


def test_reserve_exclue_du_rebalancement():
    """Une réserve n'est pas « investie » : elle ne rentre pas dans l'assiette de rééquilibrage."""
    from core.models import POCHES_PAR_CLE
    assert POCHES_PAR_CLE["precaution"].est_investi is False
    assert POCHES_PAR_CLE["courant"].est_investi is False


# --- Migration : même patrimoine avant et après ----------------------------

def test_migration_ne_change_pas_le_patrimoine():
    """Les mêmes soldes, lus dans Donnees (v1) ou dans les comptes (2.0), donnent les
    mêmes totaux par poche : la migration est invisible dans le snapshot."""
    donnees_v1 = {
        "USD": {"ticker": "USD", "perimetre": "courant", "quantite": 7.385},
        "CHF": {"ticker": "CHF", "perimetre": "precaution", "quantite": 8694.44},
    }
    comptes = [
        {"id": "a", "nom": "Courtage USD", "devise": "USD", "type": "disponible", "archive": False},
        {"id": "b", "nom": "Livret CHF", "devise": "CHF", "type": "reserve", "archive": False},
    ]
    ops = [{"compte_id": "a", "montant": 7.385}, {"compte_id": "b", "montant": 8694.44}]
    v1 = {(v["perimetre"], v["ticker"]): v["quantite"] for v in donnees_v1.values()}
    v2 = {(g["perimetre"], g["devise"]): g["quantite"] for g in portfolio.grouper_liquidites(comptes, ops)}
    assert v2 == pytest.approx(v1)


# --- Tables : requises / optionnelles -------------------------------------

def test_table_comptes_absente_ne_bloque_pas_le_robot(monkeypatch):
    absentes = {db.T_COMPTES, db.T_OPERATIONS_COMPTE}
    monkeypatch.setattr(db, "existe", lambda t: t not in absentes)
    assert db.tables_requises_manquantes() == []


def test_table_requise_absente_bloque_le_robot(monkeypatch):
    monkeypatch.setattr(db, "existe", lambda t: t != db.T_APPORTS)
    assert db.tables_requises_manquantes() == [db.T_APPORTS]


def test_tables_presentes_liste_aussi_les_optionnelles(monkeypatch):
    monkeypatch.setattr(db, "existe", lambda t: True)
    assert db.T_COMPTES in db.tables_presentes()
    assert db.T_OPERATIONS_COMPTE in db.tables_presentes()


# --- Repli sur Donnees, puis lecture depuis les comptes ------------------

def test_liquidites_repli_sur_donnees_si_table_absente(monkeypatch):
    monkeypatch.setattr(db, "existe", lambda t: t != db.T_COMPTES)
    donnees = pd.DataFrame([
        {"id": 1, "Ticker": "USD", "Type": "💵 Cash", "Quantité": 7.385},
        {"id": 2, "Ticker": "CHF", "Type": "🏦 Cash réserve", "Quantité": "8694,44"},
    ])
    monkeypatch.setattr(db, "lire", lambda table: donnees)
    soldes = db.soldes_comptes_liquidites()
    assert soldes["USD"]["perimetre"] == "courant"
    assert soldes["CHF"]["perimetre"] == "precaution"
    assert soldes["CHF"]["quantite"] == pytest.approx(8694.44)


def test_liquidites_repli_sur_donnees_si_table_vide(monkeypatch):
    monkeypatch.setattr(db, "existe", lambda t: True)
    monkeypatch.setattr(db, "client", lambda: _client_vide())
    monkeypatch.setattr(db, "lire", lambda table: pd.DataFrame(
        [{"id": 1, "Ticker": "USD", "Type": "💵 Cash", "Quantité": 3}]))
    assert db.soldes_comptes_liquidites()["USD"]["quantite"] == pytest.approx(3)


def test_liquidites_depuis_comptes_quand_ils_existent(monkeypatch):
    monkeypatch.setattr(db, "comptes_liquidites", lambda: COMPTES)
    monkeypatch.setattr(db, "operations_compte", lambda: OPERATIONS)
    soldes = db.soldes_comptes_liquidites()
    assert soldes["USD"]["perimetre"] == "courant"
    assert soldes["CHF"]["perimetre"] == "precaution"
    # Deux poches pour CNY (réserve à 0 non listée) : une seule entrée, la courante.
    assert soldes["CNY"]["quantite"] == pytest.approx(5150)


def test_devise_avec_deux_poches_garde_deux_entrees(monkeypatch):
    comptes = COMPTES + [{"id": "c-cny2", "nom": "Réserve CNY bis", "devise": "CNY",
                          "type": "reserve", "archive": False}]
    ops = OPERATIONS + [{"id": 7, "compte_id": "c-cny2", "type": "ouverture", "montant": 300}]
    monkeypatch.setattr(db, "comptes_liquidites", lambda: comptes)
    monkeypatch.setattr(db, "operations_compte", lambda: ops)
    soldes = db.soldes_comptes_liquidites()
    assert soldes["CNY:courant"]["quantite"] == pytest.approx(5150)
    assert soldes["CNY:precaution"]["quantite"] == pytest.approx(300)
    # Le robot et la page utilisent `ticker` (la devise), jamais la clé.
    assert soldes["CNY:courant"]["ticker"] == "CNY"
    assert soldes["CNY:precaution"]["ticker"] == "CNY"


# --- Écritures : Python ne touche plus au cash quand les comptes existent ---

def test_ajuster_solde_refuse_quand_les_comptes_existent(monkeypatch):
    monkeypatch.setattr(db, "comptes_liquidites", lambda: COMPTES)

    def interdit():
        raise AssertionError("Donnees ne doit plus être écrite")
    monkeypatch.setattr(db, "client", interdit)
    with pytest.raises(db.ComptesGeresDansAppli):
        db.ajuster_solde_compte("USD", 10.0, "💵 Cash", 1.0)


def test_verifier_ecriture_cash_libre_sans_comptes(monkeypatch):
    monkeypatch.setattr(db, "comptes_liquidites", lambda: None)
    db.verifier_ecriture_cash()   # ne lève rien : mode v1


def test_table_vide_laisse_ecrire_en_mode_v1(monkeypatch):
    monkeypatch.setattr(db, "comptes_liquidites", lambda: [])
    db.verifier_ecriture_cash()


def _client_vide():
    class _Rep:
        data: list = []

    class _Q:
        def select(self, *_a):
            return self

        def execute(self):
            return _Rep()

    class _C:
        def table(self, _n):
            return _Q()
    return _C()


# --- Session : liquidités tirées des comptes, FX manquant signalé -----------

def test_session_liquidites_depuis_comptes(monkeypatch):
    monkeypatch.setattr(db, "comptes_liquidites", lambda: COMPTES)
    monkeypatch.setattr(db, "operations_compte", lambda: OPERATIONS)
    monkeypatch.setattr(session.fx, "taux", lambda dev, jour, cible: {"CHF": 1.2, "CNY": 0.14}.get(dev, 1.0))
    ctx = session.Contexte()
    session._completer_liquidites_depuis_comptes(ctx, "2026-10-08")
    par_cle = {(a.ticker, a.poche): a for a in ctx.actifs}
    assert par_cle[("CHF", "precaution")].valeur_usd == pytest.approx(8694.44 * 1.2)
    assert par_cle[("CNY", "courant")].valeur_usd == pytest.approx(5150 * 0.14)
    assert par_cle[("USD", "courant")].valeur_usd == pytest.approx(7.385)
    assert ctx.echecs_fx == []


def test_session_fx_manquant_est_signale_pas_remplace(monkeypatch):
    monkeypatch.setattr(db, "comptes_liquidites", lambda: COMPTES)
    monkeypatch.setattr(db, "operations_compte", lambda: OPERATIONS)

    def fx_absent(dev, jour, cible):
        if dev == "CHF":
            raise RuntimeError("pas de taux")
        return 1.0
    monkeypatch.setattr(session.fx, "taux", fx_absent)
    ctx = session.Contexte()
    session._completer_liquidites_depuis_comptes(ctx, "2026-10-08")
    assert not any(a.ticker == "CHF" for a in ctx.actifs)
    assert any(e.startswith("CHF/") for e in ctx.echecs_fx)


# --- Robot : une devise répartie entre deux poches reste dans le snapshot ---------

from types import SimpleNamespace  # noqa: E402

from jobs import daily_snapshot  # noqa: E402


class _FXFaux(Exception):
    pass


def _taux_faux(devise, jour, cible):
    """Comme le vrai fx.taux : une devise inconnue lève une erreur (ici « CNY:courant »)."""
    table = {("USD", "EUR"): 0.9, ("CNY", "EUR"): 0.13, ("CHF", "EUR"): 1.0,
             ("EUR", "USD"): 1.1, ("USD", "USD"): 1.0, ("CNY", "USD"): 0.14, ("CHF", "USD"): 1.2}
    if (devise, cible) not in table:
        raise daily_snapshot.fx.FXIndisponible(f"pas de taux {devise}/{cible}")
    return table[(devise, cible)]


def test_robot_snapshot_garde_la_devise_repartie(monkeypatch):
    """Régression : avec la clé « CNY:courant », la ligne CNY du disponible était écartée
    sans bruit. Le snapshot doit compter les 200 CNY du disponible et les 300 de la réserve."""
    monkeypatch.setattr(daily_snapshot.db, "tables_requises_manquantes", lambda: [])
    monkeypatch.setattr(daily_snapshot.db, "lire_allocation_personnalisee", lambda: None)
    monkeypatch.setattr(daily_snapshot.db, "transactions", lambda: [{"ticker": "IGLN.L"}])
    monkeypatch.setattr(daily_snapshot, "charger_transactions", lambda rows: rows)
    monkeypatch.setattr(daily_snapshot, "calculer_positions", lambda t, a: ["IGLN.L"])
    monkeypatch.setattr(daily_snapshot, "valoriser", lambda pos: (
        [SimpleNamespace(ticker="IGLN.L", poche="rv", valeur_eur=1000.0, valeur_usd=1100.0)], []))
    monkeypatch.setattr(daily_snapshot.prices, "cours_or", lambda: 2650.0)
    monkeypatch.setattr(daily_snapshot.fx, "taux", _taux_faux)
    # Liquidités : vrais comptes (USD disponible, CHF réserve, CNY réparti), lus par db.
    # Réserve CNY non vide : sans elle, la partie « réserve » de la régression ne serait pas testée.
    ops = OPERATIONS + [{"id": 9, "compte_id": "c-cny", "type": "ouverture", "montant": 300,
                         "date": "2026-01-01", "contrepartie": None, "groupe": None}]
    monkeypatch.setattr(db, "comptes_liquidites", lambda: COMPTES)
    monkeypatch.setattr(db, "operations_compte", lambda: ops)
    capture = {}
    monkeypatch.setattr(daily_snapshot.db, "ajouter_snapshot", lambda ligne: capture.update(ligne))
    monkeypatch.setattr(daily_snapshot.db, "ajouter_alerte", lambda *a, **k: None)

    assert daily_snapshot.main() == 0
    # Courant : USD 7,385 × 0.9 + CNY 5 150 (Voyage, disponible) × 0.13
    assert capture["courant_eur"] == pytest.approx(7.385 * 0.9 + 5150 * 0.13, abs=0.01)
    # Précaution : CHF 8 694,44 × 1.0 + CNY 300 (Réserve CNY) × 0.13
    assert capture["precaution_eur"] == pytest.approx(8694.44 * 1.0 + 300 * 0.13, abs=0.01)


# --- Affichage : résumé des comptes et opérations d'un compte -----------------------

def test_resume_comptes_actifs_puis_archives_et_soldes():
    lignes = portfolio.resume_comptes(COMPTES, OPERATIONS)
    ordre = [L["nom"] for L in lignes]
    # Disponibles d'abord, réserves ensuite (puis le reste) ; l'archivé n'est jamais en tête.
    assert ordre.index("Courtage USD") < ordre.index("Livret CHF")
    archive = [dict(c, archive=True) if c["id"] == "c-cny" else c for c in COMPTES]
    fin = portfolio.resume_comptes(archive, OPERATIONS)
    assert fin[-1]["nom"] == "Compte CNY" and fin[-1]["archive"] is True
    voyage = next(L for L in lignes if L["nom"] == "Voyage CNY")
    assert voyage["solde"] == pytest.approx(5150) and voyage["type"] == "Disponible"
    assert voyage["nb_operations"] == 3   # ouverture, dépôt, retrait


def test_resume_comptes_banque_vide_et_motif():
    lignes = portfolio.resume_comptes(COMPTES, OPERATIONS)
    voyage = next(L for L in lignes if L["nom"] == "Voyage CNY")
    assert voyage["banque"] == "Banque non renseignée"
    chf = next(L for L in lignes if L["nom"] == "Livret CHF")
    assert chf["motif"] == "Épargne de précaution" and chf["type"] == "Réserve"


def test_operations_affichage_contrepartie_de_virement():
    comptes = [
        {"id": "a", "nom": "Voyage CNY", "devise": "CNY", "type": "disponible"},
        {"id": "b", "nom": "Réserve CNY", "devise": "CNY", "type": "reserve"},
    ]
    ops = [
        {"id": 1, "compte_id": "a", "type": "virement", "montant": -300, "date": "2026-03-02",
         "contrepartie": "b", "groupe": "g", "note": None},
        {"id": 2, "compte_id": "b", "type": "virement", "montant": 300, "date": "2026-03-02",
         "contrepartie": "a", "groupe": "g", "note": None},
        {"id": 3, "compte_id": "a", "type": "ouverture", "montant": 500, "date": "2026-01-01",
         "contrepartie": None, "groupe": None, "note": None},
    ]
    lignes = portfolio.operations_compte_affichage("a", comptes, ops)
    assert [L["date"] for L in lignes] == ["2026-03-02", "2026-01-01"]   # récentes d'abord
    assert lignes[0]["contrepartie"] == "→ Réserve CNY"                   # sortie
    assert lignes[1]["contrepartie"] == "" and lignes[1]["type"] == "Solde d’ouverture"
    entree = portfolio.operations_compte_affichage("b", comptes, ops)[0]
    assert entree["contrepartie"] == "← Voyage CNY"                       # entrée


# --- Lecture seule : le message et le garde-fou -------------------------------------

def test_message_lecture_seule_dit_ou_se_gerent_les_comptes():
    assert "se gèrent dans l’application" in db.MESSAGE_LECTURE_COMPTES
    assert "se gèrent dans l’application" in db.MESSAGE_COMPTES_2_0


def test_garde_refuse_avec_le_message_et_n_ecrit_rien(monkeypatch):
    monkeypatch.setattr(db, "comptes_liquidites", lambda: COMPTES)
    with pytest.raises(db.ComptesGeresDansAppli) as exc:
        db.verifier_ecriture_cash()
    assert str(exc.value) == db.MESSAGE_COMPTES_2_0


# --- Page Portefeuille (Streamlit AppTest, sans réseau) ----------------------------

PAGE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pages", "1_Portefeuille.py")


# Un virement de 300 CNY : Voyage (disponible) -> Réserve CNY. La réserve passe à 300.
OPERATIONS_PAGE = OPERATIONS + [
    {"id": 7, "compte_id": "c-voy", "type": "virement", "montant": -300, "date": "2026-03-01",
     "contrepartie": "c-cny", "groupe": "g1", "note": None},
    {"id": 8, "compte_id": "c-cny", "type": "virement", "montant": 300, "date": "2026-03-01",
     "contrepartie": "c-voy", "groupe": "g1", "note": None},
]


def _taux_standard(devise, jour, cible):
    return 1.0 if devise == cible else 1.2


def _page_avec(monkeypatch, comptes_lus, operations_lues, taux=_taux_standard):
    from core import session as S, fx as _fx
    monkeypatch.setattr(db, "comptes_liquidites", lambda: comptes_lus)
    monkeypatch.setattr(db, "operations_compte", lambda: operations_lues)
    monkeypatch.setattr(db, "lire_allocation_personnalisee", lambda: None)
    monkeypatch.setattr(db, "lire", lambda table: pd.DataFrame())
    monkeypatch.setattr(_fx, "taux", taux)
    ctx = S.Contexte()
    ctx.taux_eur_usd = 1.125
    monkeypatch.setattr(S, "charger", lambda: ctx)
    from streamlit.testing.v1 import AppTest
    at = AppTest.from_file(PAGE, default_timeout=60)
    at.run()
    return at


def test_page_2_0_lecture_seule_et_affichage(monkeypatch):
    at = _page_avec(monkeypatch, COMPTES, OPERATIONS_PAGE)
    assert not at.exception, [e.value for e in at.exception]
    infos = [i.value for i in at.info]
    assert any("se gèrent dans l’application" in t for t in infos)
    assert any(t == "L'achat et la vente de titres se saisissent dans l'application, "
                    "pour que chaque mouvement débite le bon compte." for t in infos)
    libelles = [b.label for b in at.button]
    assert not any(l.startswith("✅ Enregistrer le mouvement") or l == "🔨 Enregistrer" for l in libelles)
    legendes = " | ".join(c.value for c in at.caption)
    assert "**300.00 CNY**" in legendes          # carte « Réserve CNY » : la réserve seule
    assert "**8 694.44 CHF**" in legendes        # carte « Réserve CHF »
    at.selectbox(key="compte_detail").set_value("c-voy").run()
    # Voyage CNY : 5 000 + 250 - 100 - 300 (virement vers « Compte CNY ») = 4 850
    assert any("→ Compte CNY" in str(df.value.to_dict()) for df in at.dataframe)
    assert any("4 850.00 CNY" in str(df.value.to_dict()) for df in at.dataframe)


def test_page_sans_comptes_garde_la_saisie_v1(monkeypatch):
    at = _page_avec(monkeypatch, [], [])
    assert not at.exception, [e.value for e in at.exception]
    infos = [i.value for i in at.info]
    assert not any("lecture seule" in t for t in infos)
    assert any("Pas encore de comptes" in t for t in infos)
    assert any("Enregistrer" in b.label for b in at.button)


# --- Taux indisponible : « — » et la mention, jamais 1,0 -----------------------------

def _taux_cny_absent(devise, jour, cible):
    if devise == "CNY":
        raise RuntimeError("taux CNY non publié")
    return _taux_standard(devise, jour, cible)


def test_page_taux_indisponible_affiche_tiret_et_mention(monkeypatch):
    """Régression : un taux manquant était remplacé par 1,0 (un CNY valait alors 1 $ au lieu
    de ~0,14 $ : une valeur surestimée d'environ 8 fois). Il faut « — » et la mention."""
    at = _page_avec(monkeypatch, COMPTES, OPERATIONS_PAGE, taux=_taux_cny_absent)
    assert not at.exception, [e.value for e in at.exception]
    legendes = " | ".join(c.value for c in at.caption)
    assert "taux indisponible : contre-valeur CNY non calculée" in legendes
    # La carte « Réserve CNY » ne montre aucun montant : ni 300 CNY converti, ni 1,0.
    bloc = next(m.value for m in at.markdown if "Réserve CNY" in m.value and "font-size:1.75rem" in m.value)
    assert ">—<" in bloc
    assert "$" not in bloc and "€" not in bloc
    # Les autres cartes ne sont pas touchées par l'échec du CNY.
    assert "**8 694.44 CHF**" in legendes
    assert not any("taux indisponible" in c.value for c in at.caption if "CHF" in c.value)


def test_robot_taux_indisponible_est_signale_pas_avale(monkeypatch):
    """Régression : la ligne au taux indisponible était écartée sans bruit. Elle doit
    déclencher une alerte nommant la devise ; le snapshot reste écrit, partiel."""
    monkeypatch.setattr(daily_snapshot.db, "tables_requises_manquantes", lambda: [])
    monkeypatch.setattr(daily_snapshot.db, "lire_allocation_personnalisee", lambda: None)
    monkeypatch.setattr(daily_snapshot.db, "transactions", lambda: [{"ticker": "IGLN.L"}])
    monkeypatch.setattr(daily_snapshot, "charger_transactions", lambda rows: rows)
    monkeypatch.setattr(daily_snapshot, "calculer_positions", lambda t, a: ["IGLN.L"])
    monkeypatch.setattr(daily_snapshot, "valoriser", lambda pos: (
        [SimpleNamespace(ticker="IGLN.L", poche="rv", valeur_eur=1000.0, valeur_usd=1100.0)], []))
    monkeypatch.setattr(daily_snapshot.prices, "cours_or", lambda: 2650.0)
    monkeypatch.setattr(daily_snapshot.fx, "taux", _taux_cny_absent)
    ops = OPERATIONS + [{"id": 9, "compte_id": "c-cny", "type": "ouverture", "montant": 300,
                         "date": "2026-01-01", "contrepartie": None, "groupe": None}]
    monkeypatch.setattr(db, "comptes_liquidites", lambda: COMPTES)
    monkeypatch.setattr(db, "operations_compte", lambda: ops)
    capture, alertes = {}, []
    monkeypatch.setattr(daily_snapshot.db, "ajouter_snapshot", lambda ligne: capture.update(ligne))
    monkeypatch.setattr(daily_snapshot.db, "ajouter_alerte",
                        lambda titre, texte, niveau=None: alertes.append((titre, texte)))

    assert daily_snapshot.main() == 0                     # le snapshot est écrit
    assert capture, "le snapshot doit être écrit"
    # Taux de test : toute devise → EUR vaut 1,2 (sauf EUR). La ligne CNY n'est jamais
    # valorisée à 1,0 : le courant ne contient que l'USD (5 150 CNY écartés), la précaution
    # ne contient que le CHF (300 CNY écartés).
    assert capture["courant_eur"] == pytest.approx(7.385 * 1.2, abs=0.01)
    assert capture["precaution_eur"] == pytest.approx(8694.44 * 1.2, abs=0.01)
    assert len(alertes) == 1
    assert "CNY" in alertes[0][1] and "partiel" in alertes[0][1]
