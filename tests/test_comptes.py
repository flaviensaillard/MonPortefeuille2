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
