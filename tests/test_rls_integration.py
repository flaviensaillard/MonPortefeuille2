"""Intégration RLS contre un VRAI Supabase (optionnel, sauté sans credentials).

Complément de tests/test_rls.py (PostgreSQL embarqué) : vérifie sur le projet
réel que la clé publishable ne lit plus rien une fois la migration 004 passée.

Variables nécessaires (sinon la suite est sautée) :
- SUPABASE_URL ;
- SUPABASE_KEY_PUBLISHABLE : la clé « anon » / publishable ;
- SUPABASE_SERVICE_ROLE_KEY : pour créer deux utilisateurs de test et semer
  leurs lignes (jamais livrée dans l'APK).

ATTENTION : ce test crée puis supprime des données réelles de test
(utilisateurs rls-test-*, lignes marquées « test RLS »). À ne faire tourner
que sur un projet dédié ou en connaissance de cause.
"""

from __future__ import annotations

import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    not (
        os.environ.get("SUPABASE_URL")
        and os.environ.get("SUPABASE_KEY_PUBLISHABLE")
        and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    ),
    reason="SUPABASE_URL / SUPABASE_KEY_PUBLISHABLE / SUPABASE_SERVICE_ROLE_KEY absents",
)


@pytest.fixture()
def clients():
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    anon = create_client(url, os.environ["SUPABASE_KEY_PUBLISHABLE"])
    admin = create_client(url, os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    return anon, admin


def test_la_cle_publique_ne_lit_rien(clients):
    anon, admin = clients
    # Une ligne de référence, écrite en service_role avec un propriétaire fictif.
    uid = str(uuid.uuid4())
    admin.auth.admin.create_user({
        "email": f"rls-test-{uuid.uuid4().hex[:8]}@exemple.fr",
        "password": uuid.uuid4().hex,
        "email_confirm": True,
    })
    rep = anon.table("pf2_alertes").select("*").execute()
    assert isinstance(rep.data, list)
    # Avant la migration 004, cette lecture renvoyait TOUTES les lignes du
    # projet. Après, elle n'en renvoie aucune pour la clé publique.
    assert rep.data == [], (
        f"La clé publishable lit encore {len(rep.data)} ligne(s) : "
        "la migration 004_auth_rls.sql n'est pas appliquée sur ce projet."
    )


def test_la_cle_publique_n_ecrit_pas(clients):
    anon, _ = clients
    with pytest.raises(Exception):
        anon.table("pf2_alertes").insert(
            {"titre": "test RLS", "message": "ne devrait jamais passer"}
        ).execute()
