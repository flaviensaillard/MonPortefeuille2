"""Veille des barèmes : une sonde en panne n'affiche jamais « à jour ».

Revue 2.0.1 — T-08. Avant la 2.1.0, toute exception de la sonde réseau était
avalée (`except Exception: pass`) et le résultat devenait « Aucune nouvelle version
en attente — les barèmes sont à jour » : une panne réseau était présentée comme
un état vert. Désormais l'état est distinct : `sonde_indisponible`.
"""

from __future__ import annotations

import datetime as dt

from core import fiscal_bars as fb


def _panne_reseau(monkeypatch):
    def panne(*args, **kwargs):
        raise OSError("réseau coupé")

    monkeypatch.setattr("urllib.request.urlopen", panne)


def test_une_sonde_en_panne_donne_un_etat_distinct(monkeypatch):
    fb._CACHE_SONDE_DATAGOUV.clear()
    monkeypatch.setattr(fb, "SOURCE_PAR_ANNEE", {})
    _panne_reseau(monkeypatch)
    derniere = max(fb.BAREMES)
    r = fb.verifier_maj_baremes_fiscaux(derniere, date_reference=dt.date(derniere, 10, 9))
    assert r["etat"] == "sonde_indisponible"
    assert r["disponible"] is False
    assert "sont à jour" not in r["message"]


def test_une_panne_n_est_pas_memorisee_comme_un_etat_a_jour(monkeypatch):
    """Avant : la panne était mise en cache, et la seconde vérification affichait
    « à jour » sans même réessayer le réseau."""
    fb._CACHE_SONDE_DATAGOUV.clear()
    monkeypatch.setattr(fb, "SOURCE_PAR_ANNEE", {})
    _panne_reseau(monkeypatch)
    derniere = max(fb.BAREMES)
    date_ref = dt.date(derniere, 10, 9)
    fb.verifier_maj_baremes_fiscaux(derniere, date_reference=date_ref)
    r = fb.verifier_maj_baremes_fiscaux(derniere, date_reference=date_ref)
    assert r["etat"] == "sonde_indisponible"


def test_les_etats_normaux_sont_nommes(monkeypatch):
    fb._CACHE_SONDE_DATAGOUV.clear()
    monkeypatch.setattr(fb, "SOURCE_PAR_ANNEE", {})

    class Vide:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"data": []}'

    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **k: Vide())
    derniere = max(fb.BAREMES)
    r = fb.verifier_maj_baremes_fiscaux(derniere, date_reference=dt.date(derniere, 10, 9))
    assert r["etat"] == "a_jour"
    assert r["disponible"] is False
