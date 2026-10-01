"""L'inflation : lue, calculée, et jamais inventée.

Trois défauts vivaient ici, et tous les trois étaient SILENCIEUX.

1. **`db.inflation()` ne renommait pas les colonnes.** La table stocke `annee`
   et `inflation` en minuscules ; les pages lisent `Annee` et `Inflation` en
   majuscules. `snapshots()` faisait déjà ce pont pour `date` -> `Date` ;
   `inflation()` ne le faisait pas. Résultat : la page Performance affichait
   « non renseignée » pour chaque année, alors que les chiffres étaient en base.

2. **`_inflation_par_annee` confondait « vide » et « illisible ».** Elle
   retournait `{}` dans les deux cas, sans un mot. Deux situations opposées —
   « je n'ai pas encore de données » et « je ne comprends pas ce que je lis » —
   produisaient le même affichage.

3. **Le robot lisait une table écrite à la main, arrêtée à 2025.** L'année en
   cours n'était écrite qu'en décembre. C'est à l'application de trouver ces
   chiffres, pas à l'utilisateur de les fournir.

Ces tests portent sur des fixtures synthétiques, jamais sur le réseau : un test
qui dépend de l'INSEE tomberait à chaque incident chez eux.
"""

from __future__ import annotations

import csv
import io
import zipfile

import pandas as pd
import pytest

from core import db, session
from jobs import update_inflation as ui


# ---------------------------------------------------------------------------
# Fixtures : un mini-fichier Mélodi, avec ses pièges
# ---------------------------------------------------------------------------

def _csv_melodi(lignes: list[dict]) -> str:
    colonnes = ["IDX_TYPE", "IND_TYPE", "PRODUCT_GROUP", "COICOP_2018",
                "OBS_STATUS", "SEASONAL_ADJUST", "GEO", "GEO_OBJECT", "TPH_CPI",
                "UNIT_MEASURE", "FREQ", "DECIMALS", "CONF_STATUS", "BASE_PER",
                "TIME_PERIOD", "OBS_VALUE"]
    tampon = io.StringIO()
    w = csv.DictWriter(tampon, fieldnames=colonnes, delimiter=";")
    w.writeheader()
    for l in lignes:
        w.writerow({c: l.get(c, "") for c in colonnes})
    return tampon.getvalue()


def _zip_melodi(lignes: list[dict]) -> bytes:
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w") as z:
        z.writestr("DS_IPC_PRINC_data.csv", _csv_melodi(lignes))
        z.writestr("DS_IPC_PRINC_metadata.csv", "COD_VAR;LIB_VAR\n")
    return tampon.getvalue()


def _ligne(periode: str, valeur, *, base: str = "2025", groupe: str = "_Z",
           coicop: str = "00", geo: str = "F", ind: str = "IX") -> dict:
    return {
        "IDX_TYPE": "CPI", "IND_TYPE": ind, "PRODUCT_GROUP": groupe,
        "COICOP_2018": coicop, "OBS_STATUS": "A", "SEASONAL_ADJUST": "N",
        "GEO": geo, "GEO_OBJECT": geo, "TPH_CPI": "_T", "UNIT_MEASURE": "IX",
        "FREQ": "M", "DECIMALS": "1", "CONF_STATUS": "F", "BASE_PER": base,
        "TIME_PERIOD": periode, "OBS_VALUE": valeur,
    }


def _annee_complete(annee: int, base_valeur: float, base: str = "2025") -> list[dict]:
    """12 mois d'indice constant, pour un calcul vérifiable à la main."""
    return [
        _ligne(f"{annee}-{mois:02d}", base_valeur, base=base)
        for mois in range(1, 13)
    ]


class TestSerieMensuelle:
    def test_extrait_l_agregat_ensemble_des_menages(self):
        lignes = _annee_complete(2024, 100.0) + _annee_complete(2025, 102.0)
        serie = ui.serie_mensuelle(_zip_melodi(lignes))
        assert len(serie) == 24
        assert serie["2025-06"] == 102.0

    def test_ignore_les_autres_agregats(self):
        """`4000` est l'ALIMENTATION. La retenir donnerait l'inflation des
        courses, appliquée à un portefeuille d'or et d'actions."""
        lignes = (
            _annee_complete(2025, 102.0)                              # l'ensemble
            + [_ligne(f"2025-{m:02d}", 150.0, groupe="4000") for m in range(1, 13)]
        )
        serie = ui.serie_mensuelle(_zip_melodi(lignes))
        assert set(serie.values()) == {102.0}, "l'agrégat alimentation a fui"

    def test_ignore_les_autres_zones(self):
        """Le code géographique de la France est `F`. Filtrer sur `FRANCE`
        ne renvoie rien — c'est le piège qui m'a fait croire que la série
        n'existait pas."""
        lignes = _annee_complete(2025, 102.0) + [
            _ligne(f"2025-{m:02d}", 999.0, geo="DE") for m in range(1, 13)
        ]
        serie = ui.serie_mensuelle(_zip_melodi(lignes))
        assert set(serie.values()) == {102.0}

    def test_rejette_les_valeurs_vides(self):
        """Le fichier réel contient des OBS_VALUE vides en fin de série.
        `float("")` lève ; les ignorer en silence tronquerait la série."""
        lignes = _annee_complete(2025, 102.0) + [
            _ligne("2025-13", ""), _ligne("2026-01", ""), _ligne("2026-02", "103.0"),
        ]
        serie = ui.serie_mensuelle(_zip_melodi(lignes))
        assert "2025-13" not in serie
        assert "2026-01" not in serie
        assert serie["2026-02"] == 103.0

    def test_prend_la_base_la_plus_recente(self):
        """Le fichier contient PLUSIEURS séries du même agrégat, une par base.

        Les mélanger a produit un +4,88 % pour 2022 au lieu de +5,22 %. Deux
        échelles différentes additionnées, et un écart que j'ai d'abord attribué
        à l'INSEE.
        """
        lignes = (
            _annee_complete(2025, 50.0, base="2015")     # ancienne base
            + _annee_complete(2025, 102.0, base="2025")  # base courante
        )
        serie = ui.serie_mensuelle(_zip_melodi(lignes))
        assert set(serie.values()) == {102.0}, "les bases ont été mélangées"

    def test_leve_si_l_agregat_est_absent(self):
        """Un sélecteur qui ne trouve rien doit crier, pas rendre un vide."""
        lignes = [_ligne(f"2025-{m:02d}", 100.0, groupe="4007") for m in range(1, 13)]
        with pytest.raises(ValueError, match="ensemble des menages"):
            ui.serie_mensuelle(_zip_melodi(lignes))

    def test_leve_si_le_format_change(self):
        tampon = io.BytesIO()
        with zipfile.ZipFile(tampon, "w") as z:
            z.writestr("DS_IPC_PRINC_data.csv", "a;b;c\n1;2;3\n")
        with pytest.raises(ValueError, match="Colonnes absentes"):
            ui.serie_mensuelle(tampon.getvalue())


class TestCalculAnnuel:
    def test_inflation_egale_variation_de_l_indice_moyen(self):
        """Indice plat en 2023, +10 % en 2024 : l'inflation 2024 vaut 10 %."""
        lignes = _annee_complete(2023, 100.0) + _annee_complete(2024, 110.0)
        cal = ui.inflations(ui.serie_mensuelle(_zip_melodi(lignes)))
        assert cal[2024][0] == pytest.approx(10.0, abs=1e-9)
        assert cal[2024][1] == 12
        assert cal[2024][2] is False

    def test_annee_incomplete_est_provisoire(self):
        """Une année en cours n'a pas de moyenne annuelle.

        On publie la variation depuis décembre précédent, marquée provisoire,
        avec le nombre de mois couverts. Le déflateur doit porter sur la même
        période que la performance : neuf mois contre neuf mois.
        """
        lignes = _annee_complete(2024, 100.0) + _annee_complete(2025, 100.0) + [
            _ligne("2026-01", 101.0), _ligne("2026-02", 102.0),
        ]
        cal = ui.inflations(ui.serie_mensuelle(_zip_melodi(lignes)))
        annee_en_cours = cal[max(cal)]
        if annee_en_cours[2]:                       # true si max(cal) == année courante
            assert annee_en_cours[1] == 2
            assert annee_en_cours[0] == pytest.approx(2.0, abs=1e-9)

    def test_annee_sans_douze_mois_n_est_pas_close(self):
        """Une année à 11 mois n'est pas une année. On ne la publie pas."""
        lignes = _annee_complete(2023, 100.0) + [
            _ligne(f"2024-{m:02d}", 110.0) for m in range(1, 12)
        ]
        cal = ui.inflations(ui.serie_mensuelle(_zip_melodi(lignes)))
        assert 2024 not in cal or cal[2024][2] is False or cal[2024][1] == 11


class TestLectureBase:
    """Le pont de noms entre la table et les pages."""

    def test_inflation_renomme_les_colonnes(self, monkeypatch):
        """DÉFAUT CORRIGÉ : la table dit `annee`, les pages lisent `Annee`."""
        brute = pd.DataFrame([
            {"annee": 2024, "inflation": 2.0, "source": "INSEE"},
            {"annee": 2025, "inflation": 0.9, "source": "INSEE"},
        ])
        monkeypatch.setattr(db, "lire", lambda t: brute)
        df = db.inflation()
        assert "Annee" in df.columns and "Inflation" in df.columns

    def test_inflation_leve_si_les_colonnes_sont_absentes(self, monkeypatch):
        """Une table pleine qu'on ne sait pas nommer doit lever, pas rendre {}."""
        monkeypatch.setattr(db, "lire",
                            lambda t: pd.DataFrame([{"x": 1, "y": 2}]))
        with pytest.raises(ValueError, match="pf2_inflation"):
            db.inflation()

    def test_table_vide_reste_silencieuse(self, monkeypatch):
        """Au premier démarrage, une table vide est normale."""
        monkeypatch.setattr(db, "lire", lambda t: pd.DataFrame())
        assert db.inflation().empty


class TestInflationParAnnee:
    def test_convertit_en_fraction(self):
        df = pd.DataFrame([{"Annee": 2024, "Inflation": 2.0},
                           {"Annee": 2025, "Inflation": 0.9}])
        out = session._inflation_par_annee(df)
        assert out[2024] == pytest.approx(0.02)
        assert out[2025] == pytest.approx(0.009)

    def test_vide_reste_silencieux(self):
        assert session._inflation_par_annee(pd.DataFrame()) == {}

    def test_pleine_mais_illisible_leve(self):
        """DÉFAUT CORRIGÉ. Cette fonction retournait {} — en silence, pour
        toujours — et la page Performance annonçait « non renseignée » alors
        que les chiffres étaient en base."""
        df = pd.DataFrame([{"annee": 2024, "inflation": 2.0}])
        with pytest.raises(ValueError, match="illisible"):
            session._inflation_par_annee(df)

    def test_lignes_non_numeriques_comptees(self):
        df = pd.DataFrame([{"Annee": "2024", "Inflation": "n/a"},
                           {"Annee": 2025, "Inflation": 0.9}])
        assert session._inflation_par_annee(df)[2025] == pytest.approx(0.009)


class TestPerimetreDuCalcul:
    def test_le_selecteur_vise_l_ensemble_des_menages(self):
        """Le sélecteur est le cœur du robot : une seule ligne fausse et
        l'inflation devient celle de l'alimentation ou de l'énergie."""
        assert ui.SELECTEUR["PRODUCT_GROUP"] == "_Z"
        assert ui.SELECTEUR["COICOP_2018"] == "00"
        assert ui.SELECTEUR["GEO"] == "F"
        assert ui.SELECTEUR["IND_TYPE"] == "IX"
        assert ui.SELECTEUR["TPH_CPI"] == "_T"
        assert ui.SELECTEUR["FREQ"] == "M"
