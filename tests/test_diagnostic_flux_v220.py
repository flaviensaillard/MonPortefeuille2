"""Diagnostic 2.2.0 : pour chaque flux, la valorisation utilisée par le TWR.

Constat A3 : « Tu n'as pas accès à mes données : étends le diagnostic (lecture
seule) pour sortir, pour chaque flux des 3 dernières années, la date, le montant,
la valorisation utilisée ou manquante, le snapshot retenu et sa date. »

La fonction testée est pure : aucune connexion Supabase, aucun réseau.
"""

from __future__ import annotations

import datetime as dt

import pandas as pd
import pytest

from jobs import diagnostic as D


DATES = [dt.date(2024, 1, 31), dt.date(2024, 2, 29), dt.date(2024, 3, 31)]
VALEURS = [10_000.0, 10_100.0, 10_600.0]


def apports(lignes):
    return pd.DataFrame(lignes, columns=["date", "sens", "montant_eur", "valeur_avant_eur"]) \
        if lignes and len(lignes[0]) == 4 else pd.DataFrame(lignes)


class TestLignesFluxValorises:
    def test_valorisation_reconstruite_et_snapshot_retenu_sont_donnes(self):
        ap = apports([("2024-02-15", "apport", 500.0, None)])
        lignes = D.lignes_flux_valorises(DATES, VALEURS, ap, depuis_annee=2024)
        assert len(lignes) == 1
        L = lignes[0]
        assert L["origine"] == "reconstruite"
        assert L["valorisation"] == pytest.approx(10_000.0)   # snapshot du 31/01
        assert L["snapshot"] == dt.date(2024, 1, 31)
        assert L["montant"] == pytest.approx(500.0)
        assert L["hors_fenetre"] is False

    def test_valorisation_mesuree_est_marquee_mesuree(self):
        ap = apports([("2024-02-15", "apport", 500.0, 10_123.0)])
        L = D.lignes_flux_valorises(DATES, VALEURS, ap, 2024)[0]
        assert L["origine"] == "mesurée"
        assert L["valorisation"] == pytest.approx(10_123.0)
        assert L["snapshot"] is None

    def test_retrait_est_signe_negativement(self):
        ap = apports([("2024-02-15", "retrait", 200.0, None)])
        L = D.lignes_flux_valorises(DATES, VALEURS, ap, 2024)[0]
        assert L["montant"] == pytest.approx(-200.0)

    def test_flux_avant_le_premier_snapshot_est_hors_fenetre(self):
        ap = apports([("2024-01-10", "apport", 500.0, None)])
        L = D.lignes_flux_valorises(DATES, VALEURS, ap, 2024)[0]
        assert L["hors_fenetre"] is True
        assert L["origine"] == "manquante"
        assert "aucun snapshot" in L["raison"]

    def test_annees_anterieures_ne_sont_pas_listees(self):
        ap = apports([("2022-05-01", "apport", 500.0, None),
                      ("2024-02-15", "apport", 500.0, None)])
        lignes = D.lignes_flux_valorises(DATES, VALEURS, ap, depuis_annee=2024)
        assert [L["date"] for L in lignes] == [dt.date(2024, 2, 15)]

    def test_jour_a_plusieurs_apports_n_a_pas_de_valorisation_mesuree(self):
        ap = apports([("2024-02-15", "apport", 300.0, 10_123.0),
                      ("2024-02-15", "apport", 200.0, 10_123.0)])
        L = D.lignes_flux_valorises(DATES, VALEURS, ap, 2024)[0]
        assert L["nb_apports"] == 2
        assert L["montant"] == pytest.approx(500.0)
        assert L["mesuree"] is None
        assert L["origine"] == "reconstruite"     # attribution ambiguë : pas de mesure

    def test_base_vide_ne_leve_pas(self):
        assert D.lignes_flux_valorises(DATES, VALEURS, pd.DataFrame(), 2024) == []

    def test_le_tableau_couvre_les_trois_dernieres_annees(self):
        # Depuis l'année courante − 2 : 2024, 2025, 2026 sont couverts (année 2026
        # aujourd'hui). Le diagnostic utilise `date.today().year - 2`.
        ap = apports([("2024-02-15", "apport", 500.0, None)])
        depuis = dt.date.today().year - 2
        lignes = D.lignes_flux_valorises(DATES, VALEURS, ap, depuis)
        assert lignes == [] or all(L["date"].year >= depuis for L in lignes)


class TestJournal:
    def test_le_journal_affiche_la_valorisation_et_le_twr_non_calcule(self, caplog):
        import logging
        snaps = pd.DataFrame({
            "Date_DT": pd.to_datetime(DATES),
            "patrimoine_investi_eur": VALEURS,
        })
        # Flux du 15 février : reconstruit (snapshot du 31 janvier). Le flux du
        # 10 janvier est avant le premier snapshot : hors fenêtre.
        ap = apports([("2024-01-10", "apport", 500.0, None),
                      ("2024-02-15", "apport", 500.0, None)])
        D.verdicts.clear()
        with caplog.at_level(logging.INFO):
            D.examiner_flux_valorises(snaps, ap)
        texte = "\n".join(r.getMessage() for r in caplog.records)
        assert "reconstruite" in texte
        assert "hors fenêtre" in texte
        # Le flux du 15/02 est reconstruit, le flux hors fenêtre n'entre dans aucun
        # intervalle : le TWR global est donc calculé, et la date est affichée.
        assert "TWR global calculé" in texte
        assert "2024-02-15" in texte
