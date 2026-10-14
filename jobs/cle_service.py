"""Empêche une sauvegarde ou une reprise avec une clé Supabase publique.

La RLS rendrait les tables pf2_ silencieusement vides avec une clé `anon`.
SUPABASE_KEY dans les jobs GitHub doit être une clé *serveur* service_role.
La clé n'est jamais affichée. Le contrôle local est un garde-fou de format ;
les privilèges réels restent contrôlés par Supabase.
"""
from __future__ import annotations

import base64
import binascii
import json
import os


class CleServiceManquante(ValueError):
    """Clé serveur absente, publique ou invalide."""


def configurer() -> None:
    cle = os.environ.get("SUPABASE_KEY", "").strip()
    if cle.startswith("sb_secret_") and len(cle) >= 32:
        pass  # Nouvelle clé secrète Supabase, opaque (non JWT).
    else:
        try:
            morceaux = cle.split(".")
            if len(morceaux) != 3:
                raise ValueError("format JWT")
            corps = morceaux[1] + "=" * (-len(morceaux[1]) % 4)
            role = json.loads(base64.urlsafe_b64decode(corps)).get("role")
        except (ValueError, UnicodeError, binascii.Error, AttributeError) as exc:
            raise CleServiceManquante(
                "SUPABASE_KEY absente ou invalide : sauvegarde/import arrêté. "
                "Configurer la clé service_role/secret dans les secrets GitHub ; "
                "ne jamais partager cette clé ni l'inclure dans l'APK."
            ) from exc
        if role != "service_role":
            raise CleServiceManquante(
                "SUPABASE_KEY n'a pas le rôle service_role : "
                "la clé publique anon/authenticated ne peut pas sauvegarder ou importer."
            )
    # Le client core.db lit SUPABASE_KEY. Le garde-fou s'exécute avant toute
    # connexion ; cette clé ne doit jamais être embarquée dans l'APK.
    from core import db
    db.reinitialiser()
