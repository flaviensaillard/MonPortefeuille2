"""Données du foyer indexées par millésime (revue 2.0.1 — T-07, priorité 10).

Avant la 2.1.0, salaires, intérêts, kilomètres et repas étaient enregistrés dans
la table `Config` sous des clés SANS année (`f_s1`, `f_k1`…) : changer l'année
sélectionnée réutilisait silencieusement les montants du dernier formulaire.
Les valeurs par défaut étaient en outre personnelles (32 473 €…), et une lecture
en échec retombait sur ces défauts sans un mot.

Ce qui est verrouillé ici :
- chaque donnée annuelle porte son millésime (`f_s1_2025`) ;
- une année sans donnée n'emprunte RIEN à une autre année : elle est une lacune ;
- la reprise des anciennes clés sans année est un geste explicite, jamais automatique ;
- une lecture ou une écriture Config en échec LÈVE une erreur.
"""

from __future__ import annotations

import pathlib
import re

import pandas as pd
import pytest

from core import db, foyer

RACINE = pathlib.Path(__file__).resolve().parent.parent


def _cfg_2025():
    return {
        "f_statut": "Marié(e) / Pacsé(e)", "f_enf": "2", "f_parts": "3.0",
        "f_s1_2025": "32000", "f_s2_2025": "29000", "f_int_net_2025": "200",
        "f_u1_2025": "true", "f_k1_2025": "9120", "f_cv1_2025": "5",
        "f_r1_2025": "240", "f_elec1_2025": "false",
        "f_u2_2025": "true", "f_k2_2025": "9120", "f_cv2_2025": "5",
        "f_r2_2025": "200", "f_elec2_2025": "false",
        "f_confirme_2025": "true",
    }


class TestCles:
    def test_cle_annuelle_porte_le_millesime(self):
        assert foyer.cle_annuelle("f_s1", 2025) == "f_s1_2025"

    def test_une_cle_inconnue_est_refusee(self):
        with pytest.raises(ValueError):
            foyer.cle_annuelle("f_inconnue", 2025)

    def test_identite_et_donnees_annuelles_sont_disjointes(self):
        assert not set(foyer.CLES_IDENTITE) & set(foyer.CLES_ANNUELLES)


class TestPasDeRepriseEntreAnnees:
    def test_une_annee_sans_donnees_ne_recoit_rien_d_une_autre(self):
        assert foyer.valeurs_annee(_cfg_2025(), 2024) is None

    def test_les_lacunes_nomment_les_cles_manquantes(self):
        lacunes = foyer.lacunes(_cfg_2025(), 2024)
        assert "f_s1" in lacunes and "f_k1" in lacunes

    def test_une_annee_complete_est_lue_telle_quelle(self):
        valeurs = foyer.valeurs_annee(_cfg_2025(), 2025)
        assert valeurs is not None and valeurs["f_s1"] == "32000"
        assert foyer.lacunes(_cfg_2025(), 2025) == []

    def test_une_valeur_vide_compte_comme_lacune(self):
        cfg = _cfg_2025()
        cfg["f_s1_2025"] = "   "
        assert "f_s1" in foyer.lacunes(cfg, 2025)


class TestConfirmationParAnnee:
    def test_la_confirmation_vaut_pour_son_annee_seulement(self):
        cfg = _cfg_2025()
        assert foyer.est_confirmee(cfg, 2025)
        assert not foyer.est_confirmee(cfg, 2024)


class TestRepriseExplicite:
    def test_la_reprise_copie_les_anciennes_cles_dans_l_annee_choisie(self):
        cfg = {"f_s1": "31000", "f_k1": "8000", "f_statut": "Célibataire"}
        assert foyer.reprise_sans_millesime(cfg, 2024) == {
            "f_s1_2024": "31000", "f_k1_2024": "8000",
        }

    def test_la_reprise_ne_remplace_jamais_une_annee_deja_saisie(self):
        cfg = {"f_s1": "31000", "f_s1_2024": "29000"}
        assert "f_s1_2024" not in foyer.reprise_sans_millesime(cfg, 2024)


class TestSauvegarde:
    def test_identite_sans_annee_donnees_annuelles_avec_annee(self):
        params = {
            "f_statut": "Célibataire", "f_enf": "0", "f_parts": "1.0",
            "f_pays_etr": "Lituanie", "f_s1": "30000", "f_k1": "9000", "f_u1": True,
        }
        modifs = foyer.modifs_sauvegarde(params, 2025, confirmee=True)
        assert modifs["f_statut"] == "Célibataire"
        assert modifs["f_s1_2025"] == "30000"
        assert modifs["f_u1_2025"] == "true"
        assert modifs["f_confirme_2025"] == "true"
        assert "f_s1" not in modifs

    def test_sans_confirmation_la_cle_vaut_false(self):
        modifs = foyer.modifs_sauvegarde({"f_statut": "x"}, 2025, confirmee=False)
        assert modifs["f_confirme_2025"] == "false"


class TestConversions:
    def test_nombres_et_booleens(self):
        assert foyer.as_float("1 234,5") == pytest.approx(1234.5)
        assert foyer.as_float("abc") is None
        assert foyer.as_bool("true") is True
        assert foyer.as_bool("false") is False


class TestPageFiscalite:
    def test_la_page_ne_lit_plus_de_donnee_annuelle_sans_millesime(self):
        source = (RACINE / "pages" / "4_Fiscalite.py").read_text(encoding="utf-8")
        motif = re.compile(
            r'(_float_cfg|_int_cfg|_bool_cfg|cfg\.get)\(\s*"f_(s1|s2|int_net|u1|k1|cv1|r1|elec1|u2|k2|cv2|r2|elec2)"'
        )
        assert not motif.findall(source)

    def test_la_page_passe_par_le_module_foyer(self):
        source = (RACINE / "pages" / "4_Fiscalite.py").read_text(encoding="utf-8")
        assert "foyer." in source


class TestConfigSansSilence:
    def test_une_lecture_en_echec_leve_au_lieu_de_valeurs_personnelles(self, monkeypatch):
        def panne(table):
            raise RuntimeError("réseau coupé")

        monkeypatch.setattr(db, "lire", panne)
        with pytest.raises(db.ErreurConfigFiscale):
            db.lire_config_fiscale()

    def test_une_ecriture_en_echec_ne_fait_pas_croire_a_l_enregistrement(self, monkeypatch):
        class Panne:
            def table(self, nom):
                raise RuntimeError("écriture refusée")

        monkeypatch.setattr(db, "client", lambda: Panne())
        monkeypatch.setattr(db, "lire", lambda table: pd.DataFrame())
        with pytest.raises(db.ErreurConfigFiscale):
            db.sauver_config_fiscale({"f_s1_2025": "1"})


class TestDiffInventaire:
    """La page n'écrit que ce qui a changé : création, mise à jour, suppression."""

    def test_creation_mise_a_jour_et_suppression(self):
        avant = [{"id": 1, "quantite": 2.0}, {"id": 2, "quantite": 5.0}]
        apres = [
            {"id": 1, "quantite": 3.0},
            {"date": "2025-01-01", "actif": "ETH-USD", "quantite": 1.0},
        ]
        a_ecrire, a_supprimer = foyer.diff_inventaire(avant, apres)
        assert a_ecrire == apres
        assert a_supprimer == [2]

    def test_sans_changement_rien_a_supprimer(self):
        lignes = [{"id": 7, "quantite": 1.0}]
        _, a_supprimer = foyer.diff_inventaire(lignes, lignes)
        assert a_supprimer == []
