"""Progression : TWR strict de la fenêtre (2.2.0, constat A4).

Golden : 100 € au départ, 100 € versés à mi-période, +10 % ensuite → +10 %.
La convention « flux en fin de période » donnait +20 % : ce test est donc
ROUGE sur la 2.1.1 (progression_periode appelait metrics.twr_depuis).
"""
import datetime as dt

import pandas as pd
import pytest

from core import session as S


def _contexte(monkeypatch):
    monkeypatch.setattr(S.db, "lire", lambda table: pd.DataFrame())
    ctx = S.Contexte()
    ctx.taux_eur_usd = 1.125
    return ctx


def _serie(monkeypatch, valeurs, flux, valorisations):
    dates = [dt.date(2026, 1, 1) + dt.timedelta(days=i) for i in range(len(valeurs))]
    df = pd.DataFrame({
        "Date": pd.to_datetime(dates),
        "patrimoine_total_usd": valeurs,
        "patrimoine_investi_usd": valeurs,
    })
    monkeypatch.setattr(S, "serie_performance", lambda ctx: (df, valeurs, flux, valorisations))
    return dates


def test_golden_apport_a_mi_periode_donne_dix_pour_cent(monkeypatch):
    # Deux snapshots seulement : le flux de 100 tombe À L'INTÉRIEUR de l'intervalle
    # (valeur juste avant = 100, puis +10 % jusqu'à 220). Convention « fin de
    # période » : (220 - 100 - 100) / 100 = +20 %. Strict : +10 %.
    ctx = _contexte(monkeypatch)
    _serie(monkeypatch, [100.0, 220.0], [0.0, 100.0], {dt.date(2026, 1, 2): 100.0})
    p = S.progression_periode(ctx, "Depuis le début", "Patrimoine total")
    assert p["twr_per"] == pytest.approx(0.10, abs=1e-9)


def test_flux_sur_un_snapshot_reste_exact(monkeypatch):
    # Non-régression : flux situé exactement sur un snapshot (fin de période).
    # Les deux conventions coïncident ici ; le TWR strict doit le rester.
    ctx = _contexte(monkeypatch)
    _serie(monkeypatch, [100.0, 200.0, 220.0], [0.0, 100.0, 0.0], {dt.date(2026, 1, 2): 100.0})
    p = S.progression_periode(ctx, "Depuis le début", "Patrimoine total")
    assert p["twr_per"] == pytest.approx(0.10, abs=1e-9)


def test_flux_sans_valorisation_avant_donne_non_calcule_et_pas_un_total_partiel(monkeypatch):
    ctx = _contexte(monkeypatch)
    _serie(monkeypatch, [100.0, 200.0, 220.0], [0.0, 100.0, 0.0], {})
    p = S.progression_periode(ctx, "Depuis le début", "Patrimoine total")
    assert p["twr_per"] is None


def test_reconstruit_depuis_la_veille_reste_exact(monkeypatch):
    # Snapshot de la veille à 100, flux du jour, valorisation reconstruite = 100
    # (strictement antérieure au flux) puis clôture à 220 : +10 %.
    ctx = _contexte(monkeypatch)
    _serie(monkeypatch, [100.0, 220.0], [0.0, 100.0], {dt.date(2026, 1, 2): 100.0})
    p = S.progression_periode(ctx, "Progression journalière", "Patrimoine total")
    assert p["twr_per"] == pytest.approx(0.10, abs=1e-9)


def test_sans_flux_le_resultat_est_la_variation_simple(monkeypatch):
    ctx = _contexte(monkeypatch)
    _serie(monkeypatch, [100.0, 110.0, 99.0], [0.0, 0.0, 0.0], {})
    p = S.progression_periode(ctx, "Depuis le début", "Patrimoine total")
    assert p["twr_per"] == pytest.approx(-0.01, abs=1e-9)


def test_affichage_d_un_non_calcule_est_un_tiret_pas_zero():
    from core import ui
    assert ui.fleche_pct(None) == "—"


def test_nocturne_et_direct_du_meme_jour_restent_deux_instants(monkeypatch):
    # Progression journalière : le snapshot nocturne (100) et le direct (110)
    # ont la même date. Ils ne doivent pas être fusionnés : +10 %.
    ctx = _contexte(monkeypatch)
    df = pd.DataFrame({
        "Date": pd.to_datetime(["2026-10-07", "2026-10-07"]),
        "patrimoine_total_usd": [100.0, 110.0],
        "patrimoine_investi_usd": [100.0, 110.0],
    })
    monkeypatch.setattr(S, "serie_performance", lambda c: (df, [100.0, 110.0], [0.0, 0.0], {}))
    p = S.progression_periode(ctx, "Progression journalière", "Patrimoine total")
    assert p["twr_per"] == pytest.approx(0.10, abs=1e-9)
