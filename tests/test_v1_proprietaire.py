"""Propriétaire des écritures serveur, tables v1 comprises (revue 2.0.1, S-01 étendu).

La revue ne couvrait que les tables `pf2_`. Or la base contient encore cinq tables
de la v1 (Config, Donnees, Historique, Projections, Transaction). Les robots et
l'application Streamlit écrivent avec la clé service_role, qui contourne la RLS :
chaque écriture doit donc porter le propriétaire (`user_id`), fourni par
SUPABASE_USER_ID. La migration 008 rend cette colonne obligatoire sur les cinq
tables v1 : une écriture sans propriétaire y échoue.

Avant cette correction, trois écritures de la v1 (Config, Donnees, Historique)
étaient des insertions littérales qui contournaient l'injection du propriétaire.
"""

from __future__ import annotations

import pathlib
import re

import pandas as pd
import pytest

from core import db

RACINE = pathlib.Path(__file__).resolve().parent.parent
UID = "11111111-1111-4111-8111-111111111111"
TABLES_V1 = ("Config", "Donnees", "Historique", "Projections", "Transaction")


class _Reponse:
    data: list = []


class FauxTable:
    """Enregistre les écritures au lieu de les envoyer."""

    def __init__(self, client, nom):
        self._client = client
        self._nom = nom

    def insert(self, payload):
        self._client.ecritures.append(("insert", self._nom, payload))
        return self

    def upsert(self, payload, on_conflict=None):
        self._client.ecritures.append(("upsert", self._nom, payload))
        return self

    def update(self, champs):
        self._client.ecritures.append(("update", self._nom, champs))
        return self

    def delete(self):
        return self

    def eq(self, *args):
        return self

    def execute(self):
        return _Reponse()


class FauxClient:
    def __init__(self):
        self.ecritures: list[tuple] = []

    def table(self, nom):
        return FauxTable(self, nom)


@pytest.fixture
def faux(monkeypatch):
    client = FauxClient()
    monkeypatch.setattr(db, "client", lambda: client)
    monkeypatch.setattr(db, "lire", lambda table: pd.DataFrame())
    monkeypatch.setenv("SUPABASE_USER_ID", UID)
    return client


class TestInjectionDuProprietaire:
    @pytest.mark.parametrize("table", TABLES_V1 + ("pf2_snapshots", "pf2_alertes"))
    def test_les_tables_proprietaires_recoivent_l_uid(self, monkeypatch, table):
        monkeypatch.setenv("SUPABASE_USER_ID", UID)
        assert db._avec_proprietaire(table, [{"x": 1}]) == [{"x": 1, "user_id": UID}]

    def test_une_table_hors_proprietaire_reste_inchangee(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_USER_ID", UID)
        assert db._avec_proprietaire("Autre", [{"x": 1}]) == [{"x": 1}]

    def test_sans_uid_l_ecriture_est_refusee_avant_envoi(self, monkeypatch):
        """Revue robots (2.1.0) : sans propriétaire, rien ne part vers la base. L'ancienne
        version rendait les lignes telles quelles, et la base refusait ensuite."""
        monkeypatch.delenv("SUPABASE_USER_ID", raising=False)
        monkeypatch.setattr("streamlit.secrets", {})
        with pytest.raises(PermissionError, match="SUPABASE_USER_ID"):
            db._avec_proprietaire("Config", [{"x": 1}])

    def test_l_uid_peut_venir_des_secrets_streamlit(self, monkeypatch):
        """Même source que les identifiants : variable d'environnement, ou
        .streamlit/secrets.toml pour l'application lancée en local."""
        monkeypatch.delenv("SUPABASE_USER_ID", raising=False)
        monkeypatch.setattr("streamlit.secrets", {"SUPABASE_USER_ID": UID})
        assert db.proprietaire_service() == UID


class TestEcrituresServeur:
    def test_la_configuration_fiscale_envoie_le_proprietaire(self, faux):
        db.sauver_config_fiscale({"f_s1_2025": "32000"})
        genre, table, payload = faux.ecritures[-1]
        assert (genre, table) == ("insert", "Config")
        assert payload["user_id"] == UID

    def test_l_historique_v1_envoie_le_proprietaire(self, faux):
        db.ajouter_historique_v1("09/10/2026", "apport", 1000.0, 900.0, 0.4)
        genre, table, payload = faux.ecritures[-1]
        assert (genre, table) == ("insert", "Historique")
        assert payload["user_id"] == UID

    def test_le_snapshot_envoie_le_proprietaire(self, faux):
        db.ajouter_snapshot({"date": "2026-10-09", "patrimoine_total_eur": 1.0})
        assert faux.ecritures[-1][2]["user_id"] == UID

    def test_l_alerte_envoie_le_proprietaire(self, faux):
        db.ajouter_alerte("Titre", "Message")
        assert faux.ecritures[-1][2][0]["user_id"] == UID   # ecrire() envoie une liste

    def test_aucune_insertion_litterale_ne_contourne_le_proprietaire(self):
        """Une insertion écrite en littéral ne passerait pas par l'injection."""
        source = (RACINE / "core" / "db.py").read_text(encoding="utf-8")
        nues = re.findall(r"\.insert\(\s*\{", source)
        assert not nues, f"{len(nues)} insertion(s) littérale(s) sans propriétaire dans core/db.py"


class _ErreurPostgrest(Exception):
    """Forme de l'erreur PostgREST : `code` et `message`, comme `_traduire_erreur` les lit."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class _ClientRefuse:
    """Toute écriture est refusée, comme une colonne user_id NOT NULL restée vide."""

    def table(self, nom):
        return self

    def insert(self, payload):
        return self

    def update(self, champs):
        return self

    def eq(self, *args):
        return self

    def execute(self):
        raise _ErreurPostgrest(
            "23502",
            'null value in column "user_id" violates not-null constraint',
        )


class TestEcrituresV1Signalees:
    """Une écriture v1 refusée doit être signalée. Sans cela, la règle de
    propriétaire créerait une perte silencieuse : l'historique ou le solde ne
    seraient pas écrits, et personne ne le saurait (revue 2.0.1, S-01 étendu)."""

    @pytest.fixture
    def refus(self, monkeypatch):
        monkeypatch.setattr(db, "client", lambda: _ClientRefuse())
        monkeypatch.setattr(db, "lire", lambda table: pd.DataFrame())
        monkeypatch.setattr(db, "comptes_liquidites", lambda: None)
        monkeypatch.delenv("SUPABASE_USER_ID", raising=False)
        monkeypatch.setattr("streamlit.secrets", {})

    def test_l_historique_refuse_leve_une_erreur(self, refus):
        with pytest.raises(PermissionError, match="sans propriétaire"):
            db.ajouter_historique_v1("09/10/2026", "apport", 1000.0, 900.0, 0.4)

    def test_le_solde_refuse_leve_une_erreur(self, refus):
        with pytest.raises(PermissionError, match="sans propriétaire"):
            db.ajuster_solde_compte("EUR", 100.0, "💵 Cash", 1.1)

    def test_la_configuration_refusee_donne_la_consigne(self, refus):
        """La page Fiscalité doit dire QUOI faire, pas seulement « refusé »."""
        with pytest.raises(db.ErreurConfigFiscale, match="SUPABASE_USER_ID"):
            db.sauver_config_fiscale({"f_s1_2025": "32000"})


class TestRobotsQuotidiens:
    """Les quatre robots de daily.yml écrivent des lignes pf2_ : chacun doit
    transmettre SUPABASE_USER_ID. Lecture textuelle, sans dépendance YAML."""

    def test_chaque_robot_transmet_le_proprietaire(self):
        texte = (RACINE / ".github" / "workflows" / "daily.yml").read_text(encoding="utf-8")
        etapes = re.split(r"(?m)^      - ", texte)
        robots = [e for e in etapes if "run: python jobs/" in e]
        assert len(robots) == 4, f"{len(robots)} robot(s) trouvé(s), 4 attendus"
        for etape in robots:
            titre = etape.splitlines()[0]
            assert "SUPABASE_USER_ID: ${{ secrets.SUPABASE_USER_ID }}" in etape, titre
