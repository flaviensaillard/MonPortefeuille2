"""Écritures serveur : un propriétaire explicite, un échec explicite (robots, 2.1.0).

Constat : « Robots quotidiens » échouait sur `pf2_cours` (23502, `user_id` NULL). Sur
`main`, rien n'injectait le propriétaire et le workflow ne transmettait pas
SUPABASE_USER_ID. Sur la branche, l'injection laissait partir les lignes telles
quelles quand la variable manquait : la base refusait ensuite, après l'envoi.

Contrat verrouillé ici, au point de passage unique de `core/db.py` :
  - chaque table propriétaire reçoit l'uid ; sans uid, l'écriture échoue AVANT tout
    envoi (jamais de NULL silencieux) ;
  - toute mise à jour et toute suppression sont restreintes au propriétaire ;
  - aucune suppression sans filtre ;
  - aucune écriture brute (`.insert/.upsert/.update/.delete`) hors de `core/db.py`.

Un test par table. Les tests de la section « sans uid » et de la section
« suppressions » ont été observés en échec sur le code d'avant la correction.
"""

from __future__ import annotations

import os
import pathlib
import re

import pandas as pd
import pytest

from core import db

RACINE = pathlib.Path(__file__).resolve().parent.parent
UID = "11111111-1111-4111-8111-111111111111"
AUTRE_UID = "22222222-2222-4222-8222-222222222222"

LIGNE_COURS = {"ticker": "BTCUSDT", "date": "2026-10-09", "cours": 82832.5625, "devise": "USD"}
LIGNE_FX = {"devise": "USD", "contre": "EUR", "date": "2026-10-09", "taux": 0.92}
LIGNE_SNAPSHOT = {"date": "2026-10-09", "patrimoine_total_eur": 1000.0, "complet": True}
LIGNE_INFLATION = {"annee": 2025, "inflation": 2.1}


class _Reponse:
    def __init__(self, data=None):
        self.data = data or []


class FauxRequete:
    """Enregistre chaque écriture à l'exécution, avec ses filtres, au lieu de l'envoyer."""

    def __init__(self, client, table):
        self._client = client
        self._table = table
        self._op = None
        self._payload = None
        self._filtres: list[tuple] = []

    def insert(self, payload):
        self._op, self._payload = "insert", payload
        return self

    def upsert(self, payload, on_conflict=None):
        self._op, self._payload = "upsert", payload
        return self

    def update(self, champs):
        self._op, self._payload = "update", champs
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, colonne, valeur):
        self._filtres.append(("eq", colonne, valeur))
        return self

    def in_(self, colonne, valeurs):
        self._filtres.append(("in", colonne, list(valeurs)))
        return self

    def execute(self):
        self._client.journal.append({
            "op": self._op,
            "table": self._table,
            "payload": self._payload,
            "filtres": list(self._filtres),
        })
        # Une insertion rend un identifiant : la sonde de verifier_ecriture le supprime.
        return _Reponse([{"id": 99}] if self._op == "insert" else [])


class FauxClient:
    def __init__(self):
        self.journal: list[dict] = []
        self.lignes_lues: dict[str, pd.DataFrame] = {}

    def table(self, nom):
        return FauxRequete(self, nom)


@pytest.fixture
def faux(monkeypatch):
    client = FauxClient()
    monkeypatch.setattr(db, "client", lambda: client)
    monkeypatch.setattr(
        db, "lire", lambda table: client.lignes_lues.get(table, pd.DataFrame()))
    monkeypatch.setattr(db, "comptes_liquidites", lambda: None)
    monkeypatch.setenv("SUPABASE_USER_ID", UID)
    return client


@pytest.fixture
def faux_sans_uid(faux, monkeypatch):
    monkeypatch.delenv("SUPABASE_USER_ID", raising=False)
    monkeypatch.setattr("streamlit.secrets", {})
    return faux


def _lignes_envoyees(envoi: dict) -> list[dict]:
    charge = envoi["payload"]
    return charge if isinstance(charge, list) else [charge]


# ---------------------------------------------------------------------------
# Une table, une écriture, un contrat
# ---------------------------------------------------------------------------

CAS_ECRITURES = [
    pytest.param(lambda: db.remplacer(db.T_COURS, [dict(LIGNE_COURS)]),
                 db.T_COURS, id="pf2_cours"),
    pytest.param(lambda: db.remplacer(db.T_FX, [dict(LIGNE_FX)]),
                 db.T_FX, id="pf2_fx"),
    pytest.param(lambda: db.ajouter_alerte("Titre", "Message"),
                 db.T_ALERTES, id="pf2_alertes"),
    pytest.param(lambda: db.ajouter_snapshot(dict(LIGNE_SNAPSHOT)),
                 db.T_SNAPSHOTS, id="pf2_snapshots"),
    pytest.param(lambda: db.remplacer(db.T_INFLATION, [dict(LIGNE_INFLATION)],
                                      on_conflict="annee"),
                 db.T_INFLATION, id="pf2_inflation"),
]


class TestChaqueTableProprietaire:
    @pytest.mark.parametrize("ecrire, table", CAS_ECRITURES)
    def test_avec_uid_chaque_ligne_porte_le_proprietaire(self, faux, ecrire, table):
        ecrire()
        envois = [e for e in faux.journal if e["table"] == table]
        assert envois, f"aucune écriture envoyée à {table}"
        for envoi in envois:
            proprietaires = [l.get("user_id") for l in _lignes_envoyees(envoi)]
            assert proprietaires == [UID] * len(proprietaires), table

    @pytest.mark.parametrize("ecrire, table", CAS_ECRITURES)
    def test_sans_uid_l_ecriture_echoue_avant_l_envoi(self, faux_sans_uid, ecrire, table):
        with pytest.raises(PermissionError, match="SUPABASE_USER_ID"):
            ecrire()
        assert not [e for e in faux_sans_uid.journal if e["table"] == table], (
            f"des lignes sont parties vers {table} sans propriétaire")

    def test_la_sonde_d_ecriture_echoue_sans_uid(self, faux_sans_uid):
        """`verifier_ecriture` écrit une sonde dans pf2_alertes : même règle."""
        with pytest.raises(PermissionError, match="SUPABASE_USER_ID"):
            db.verifier_ecriture()
        assert not faux_sans_uid.journal

    def test_une_ligne_d_un_autre_proprietaire_est_refusee(self, faux):
        with pytest.raises(ValueError, match="autre propriétaire"):
            db.remplacer(db.T_COURS, [{**LIGNE_COURS, "user_id": AUTRE_UID}])
        assert not faux.journal

    def test_remplacer_ne_supprime_jamais(self, faux):
        """Garde (vert avant et après) : `remplacer` est un upsert. Il n'émet aucune
        suppression, donc aucune suppression non restreinte n'est possible par là."""
        db.remplacer(db.T_COURS, [dict(LIGNE_COURS)])
        db.remplacer(db.T_FX, [dict(LIGNE_FX)])
        assert {e["op"] for e in faux.journal} == {"upsert"}


class TestRobotDesCours:
    """Le scénario du journal : `update_market_data` écrit pf2_cours, puis pf2_fx."""

    @pytest.fixture
    def marche(self, monkeypatch):
        from jobs import update_market_data as job

        monkeypatch.setattr(job.prices, "cours", lambda t: 100.0)
        monkeypatch.setattr(job.prices, "devise_de", lambda t: "EUR")
        monkeypatch.setattr(job.fx, "taux", lambda d, a, b: 1.0)
        return job

    def test_sans_uid_le_robot_s_arrete_sans_rien_envoyer(self, faux_sans_uid, marche, caplog):
        assert marche.main() == 1
        assert not faux_sans_uid.journal
        assert "SUPABASE_USER_ID" in caplog.text

    def test_avec_uid_cours_et_taux_portent_le_proprietaire(self, faux, marche):
        assert marche.main() == 0
        for table in (db.T_COURS, db.T_FX):
            envois = [e for e in faux.journal if e["table"] == table]
            assert envois, f"aucune écriture sur {table}"
            for envoi in envois:
                assert all(l.get("user_id") == UID for l in _lignes_envoyees(envoi)), table


# ---------------------------------------------------------------------------
# Mises à jour et suppressions : restreintes au propriétaire
# ---------------------------------------------------------------------------

def _config_existante(faux):
    faux.lignes_lues["Config"] = pd.DataFrame([{"id": 5, "Clé": "f_s1_2025", "Valeur": "1"}])


def _donnees_existantes(faux):
    faux.lignes_lues["Donnees"] = pd.DataFrame(
        [{"id": 3, "Ticker": "EUR", "Quantité": 10.0}])


APPELS_PAR_ID = [
    pytest.param(lambda: db.modifier_transaction(7, {"quantite": 1.0}), None,
                 id="modifier_transaction"),
    pytest.param(lambda: db.supprimer_transaction(7), None, id="supprimer_transaction"),
    pytest.param(lambda: db.modifier_apport(7, {"montant_eur": 1.0}), None,
                 id="modifier_apport"),
    pytest.param(lambda: db.supprimer_apport(7), None, id="supprimer_apport"),
    pytest.param(lambda: db.maj_ligne(db.T_ALERTES, 7, {"niveau": "info"}), None,
                 id="maj_ligne"),
    pytest.param(lambda: db.enregistrer_inventaire_crypto([{"id": 7, "quantite": 1.0}], [8]),
                 None, id="inventaire_crypto"),
    pytest.param(lambda: db.sauver_config_fiscale({"f_s1_2025": "32000"}),
                 _config_existante, id="config_fiscale"),
    pytest.param(lambda: db.ajuster_solde_compte("EUR", 100.0, "💵 Cash", 1.1),
                 _donnees_existantes, id="solde_donnees"),
]


class TestSuppressionsEtMisesAJourLimitees:
    def test_supprimer_lignes_ajoute_le_proprietaire(self, faux):
        db.supprimer_lignes(db.T_SNAPSHOTS, dans=("date", ["2026-01-01", "2026-01-02"]))
        (envoi,) = faux.journal
        assert ("eq", "user_id", UID) in envoi["filtres"]
        assert ("in", "date", ["2026-01-01", "2026-01-02"]) in envoi["filtres"]

    def test_une_suppression_sans_filtre_est_refusee(self, faux):
        with pytest.raises(ValueError, match="sans filtre"):
            db.supprimer_lignes(db.T_TRANSACTIONS)
        assert not faux.journal

    def test_supprimer_lignes_sans_uid_echoue_avant_l_envoi(self, faux_sans_uid):
        with pytest.raises(PermissionError, match="SUPABASE_USER_ID"):
            db.supprimer_lignes(db.T_APPORTS, compte="import_v1")
        assert not faux_sans_uid.journal

    @pytest.mark.parametrize("appel, preparer", APPELS_PAR_ID)
    def test_chaque_mise_a_jour_et_suppression_est_restreinte(self, faux, appel, preparer):
        if preparer:
            preparer(faux)
        appel()
        assert faux.journal, "aucune écriture envoyée"
        for envoi in faux.journal:
            assert ("eq", "user_id", UID) in envoi["filtres"], envoi

    @pytest.mark.parametrize("appel, preparer", APPELS_PAR_ID)
    def test_chaque_mise_a_jour_sans_uid_echoue_avant_l_envoi(
            self, faux_sans_uid, appel, preparer):
        """La configuration fiscale enveloppe l'erreur dans ErreurConfigFiscale, son
        contrat documenté : le message doit toujours nommer SUPABASE_USER_ID."""
        if preparer:
            preparer(faux_sans_uid)
        with pytest.raises((PermissionError, db.ErreurConfigFiscale), match="SUPABASE_USER_ID"):
            appel()
        assert not faux_sans_uid.journal


# ---------------------------------------------------------------------------
# Garde-fou statique : aucune écriture brute hors de core/db.py
# ---------------------------------------------------------------------------

_ECRITURE_CHAINEE = re.compile(
    r"\.table\([^()]*\)\s*\.\s*(?:insert|upsert|update|delete)\s*\(")
_AFFECTATION_TABLE = re.compile(r"^\s*(\w+)\s*=\s*[^\n]*\.table\(", re.M)
_DOSSIERS_EXCLUS = {".venv", "venv", ".git", "tests", "node_modules"}


def _fichiers_python_hors_db():
    for dossier, sous_dossiers, fichiers in os.walk(RACINE):
        sous_dossiers[:] = [d for d in sous_dossiers if d not in _DOSSIERS_EXCLUS]
        for nom in fichiers:
            chemin = pathlib.Path(dossier) / nom
            rel = chemin.relative_to(RACINE).as_posix()
            if nom.endswith(".py") and rel != "core/db.py":
                yield rel, chemin


class TestAucuneEcritureBruteHorsCoreDb:
    def test_les_robots_et_l_application_passent_par_core_db(self):
        fautes = []
        for rel, chemin in _fichiers_python_hors_db():
            source = chemin.read_text(encoding="utf-8", errors="replace")
            for m in _ECRITURE_CHAINEE.finditer(source):
                fautes.append(f"{rel} : {' '.join(m.group(0).split())}")
            for nom in _AFFECTATION_TABLE.findall(source):
                for m in re.finditer(
                        rf"\b{re.escape(nom)}\s*\.\s*(?:insert|upsert|update|delete)\s*\(",
                        source):
                    fautes.append(f"{rel} : {nom}.{m.group(0).split('.')[-1]}")
        assert not fautes, "écritures brutes hors core/db.py :\n" + "\n".join(fautes)
