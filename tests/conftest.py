"""Réglages communs à toute la suite.

Les robots et l'application tournent avec `SUPABASE_USER_ID` (revue robots, 2.1.0) :
sans lui, toute écriture serveur sur une table propriétaire échoue avant l'envoi.
Les tests de logique (import, calculs, requêtes) se placent donc dans la configuration
réelle d'un robot, avec un propriétaire de test.

Le contrat « sans propriétaire » n'est PAS ici : il est testé explicitement, avec
`monkeypatch.delenv("SUPABASE_USER_ID")`, dans `test_robots_proprietaire.py` et
`test_v1_proprietaire.py`.
"""

import pytest

UID_DE_TEST = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def proprietaire_de_test(monkeypatch):
    monkeypatch.setenv("SUPABASE_USER_ID", UID_DE_TEST)
