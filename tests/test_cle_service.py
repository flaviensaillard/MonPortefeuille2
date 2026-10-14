"""Les jobs serveur refusent une clé publique avant toute requête Supabase."""
import base64
import json

import pytest

from core import db
from jobs import cle_service, sauvegarde as job_sauvegarde


def cle_test(role):
    """Payload fictif pour le garde-fou local (pas une vraie clé utilisable)."""
    def partie(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip('=')
    return partie({'alg': 'HS256'}) + '.' + partie({'role': role}) + '.signature-factice'


@pytest.mark.parametrize('valeur', ['', 'sb_publishable_cle_test', cle_test('anon'),
                                   cle_test('authenticated')])
def test_refuse_cle_publique_ou_absente_sans_afficher_sa_valeur(monkeypatch, valeur):
    monkeypatch.setenv('SUPABASE_KEY', valeur)
    with pytest.raises(cle_service.CleServiceManquante) as exc:
        cle_service.configurer()
    assert valeur not in str(exc.value) or not valeur


def test_accepte_cle_service_role_et_secret_opaque(monkeypatch):
    for cle in (cle_test('service_role'), 'sb_secret_' + 'x' * 32):
        monkeypatch.setenv('SUPABASE_KEY', cle)
        cle_service.configurer()


def test_sauvegarde_refuse_anon_avant_lecture_et_archive(monkeypatch, tmp_path):
    monkeypatch.setenv('SAUVEGARDE_CLE', 'phrase-tres-longue')
    monkeypatch.setenv('SUPABASE_KEY', cle_test('anon'))
    monkeypatch.setenv('SAUVEGARDE_DOSSIER', str(tmp_path))
    monkeypatch.setattr(db, 'client', lambda: pytest.fail('aucun appel réseau attendu'))
    assert job_sauvegarde.main() == 2
    assert list(tmp_path.iterdir()) == []
