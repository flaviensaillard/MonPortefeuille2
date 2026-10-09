"""Utilitaires partagés par les tests.

`importer_v1` purge les lignes issues de l'import avant de réécrire. Pourquoi :
la clé de conflit de l'upsert (`ticker,sens,date,quantite,cours`) contient la
DATE. Une réimportation après correction du parseur de dates ne peut donc pas
écraser les anciennes lignes — la clé diffère, et chaque transaction se
retrouverait en double, une fois à la mauvaise date.

Cette purge passe par `db.client()`, qui exige de vrais identifiants Supabase.
Les tests la neutralisent avec `simuler_supabase()`.
"""

from __future__ import annotations


class _Rep:
    data: list = []


class _Chaine:
    """Chaîne PostgREST inopérante : `eq` et `in_` s'enchaînent, `execute` ne fait rien.

    Enchaînable comme le vrai constructeur : la purge ajoute un filtre propriétaire
    après le filtre `source` (revue robots, 2.1.0).
    """

    def eq(self, *args):
        return self

    def in_(self, *args):
        return self

    def execute(self):
        return _Rep()


def simuler_supabase(monkeypatch, module) -> None:
    """Remplace `module.db.client()` par une chaîne delete/eq/execute inopérante.

    À appeler dans tout test qui appelle `importer_transactions(dry_run=False)`.
    """
    class _Table:
        def delete(self):
            return _Chaine()

    client = type("C", (), {"table": staticmethod(lambda nom: _Table())})()
    monkeypatch.setattr(module.db, "client", lambda: client)
