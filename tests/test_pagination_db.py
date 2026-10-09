"""Pagination des lectures Supabase côté Python (revue 2.0.1, constats D-05 / L-07).

Comme le vrai PostgREST, le faux client ci-dessous limite CHAQUE réponse à
1 000 lignes. Ce qui est verrouillé :
- `db.lire()` rend les 1 001 lignes (pas 1 000) ;
- 15 000 lignes (40 ans de snapshots quotidiens) : tout est lu ;
- pas de doublons, ordre stable demandé au serveur ;
- une page qui échoue fait échouer toute la lecture.

Rouge sur l'ancien code : `lire()` faisait un unique `select("*").execute()`,
tronqué à 1 000 lignes sans erreur.
"""

from __future__ import annotations

import pytest

from core import db


class FauxExecute:
    def __init__(self, lignes):
        self.data = lignes


class FauxRequete:
    """Émule le builder postgrest-py AVEC la limite serveur de 1 000 lignes."""

    LIMITE_SERVEUR = 1000

    def __init__(self, table, lignes, journal):
        self._lignes = lignes
        self._ordre = None
        self._plage = None
        self._journal = journal

    def order(self, colonne):
        self._ordre = colonne
        return self

    def range(self, debut, fin):
        self._plage = (debut, fin)
        return self

    def limit(self, n):
        self._plage = (0, n - 1)
        return self

    def execute(self):
        lignes = list(self._lignes)
        if self._ordre:
            def clef(l):
                return tuple(str(l.get(c, "")) for c in self._ordre.replace(".asc", "").replace(".desc", "").split(","))
            lignes.sort(key=clef)
        debut, fin = self._plage or (0, None)
        if fin is None:
            page = lignes[debut:]
        else:
            page = lignes[debut:fin + 1]
        # La règle du vrai serveur : jamais plus de 1 000 lignes par réponse.
        page = page[: self.LIMITE_SERVEUR]
        self._journal.append({"ordre": self._ordre, "plage": self._plage, "rendues": len(page)})
        return FauxExecute(page)


class FauxTable:
    def __init__(self, nom, lignes, journal):
        self._nom = nom
        self._lignes = lignes
        self._journal = journal

    def select(self, colonnes):
        return FauxRequete(self._nom, self._lignes, self._journal)


class FauxClient:
    def __init__(self, tables):
        self._tables = tables
        self.journal = []

    def table(self, nom):
        return FauxTable(nom, self._tables.get(nom, []), self.journal)


@pytest.fixture(autouse=True)
def reinitialiser_client():
    db.reinitialiser()
    yield
    db.reinitialiser()


def _installer(lignes_snapshots):
    faux = FauxClient({"pf2_snapshots": lignes_snapshots})
    db._client = faux
    return faux


def _snapshots(n):
    return [
        {
            "id": i + 1,
            "date": f"2026-{(i // 28) + 1:02d}-{(i % 28) + 1:02d}",
            "patrimoine_total_eur": 100000 + i,
            "patrimoine_investi_eur": 90000 + i,
        }
        for i in range(n)
    ]


def test_1001_lignes_sont_toutes_lues():
    _installer(_snapshots(1001))
    df = db.lire("pf2_snapshots")
    assert len(df) == 1001, f"lecture tronquée : {len(df)} lignes au lieu de 1001"


def test_15000_lignes_40_ans_de_snapshots():
    _installer(_snapshots(15000))
    df = db.lire("pf2_snapshots")
    assert len(df) == 15000, f"lecture tronquée : {len(df)} lignes au lieu de 15000"


def test_aucun_doublon_et_ordre_stable():
    faux = _installer(_snapshots(2500))
    df = db.lire("pf2_snapshots")
    assert len(df) == 2500
    assert df["id"].nunique() == 2500
    # L'ordre demandé au serveur doit être stable (clé de pagination).
    assert faux.journal and all(e["ordre"] for e in faux.journal), (
        "la lecture paginée doit imposer un ordre stable"
    )


def test_une_page_qui_echoue_fait_echouer_toute_la_lecture():
    class RequeteQuiTombe(FauxRequete):
        def execute(self):
            if self._plage and self._plage[0] >= 1000:
                raise RuntimeError("panne simulée du serveur")
            return super().execute()

    class TableQuiTombe(FauxTable):
        def select(self, colonnes):
            return RequeteQuiTombe(self._nom, self._lignes, self._journal)

    faux = FauxClient({"pf2_snapshots": _snapshots(2500)})
    faux.table = lambda nom: TableQuiTombe(nom, faux._tables.get(nom, []), faux.journal)
    db._client = faux

    with pytest.raises(Exception):
        db.lire("pf2_snapshots")


def test_une_petite_table_se_lit_en_une_seule_page():
    faux = _installer(_snapshots(12))
    df = db.lire("pf2_snapshots")
    assert len(df) == 12
    assert len(faux.journal) == 1
