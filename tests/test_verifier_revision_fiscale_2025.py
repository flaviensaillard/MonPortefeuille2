"""Vérificateur fiscal : lecture seule, identifiant filtré, dérive détectée."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest

from jobs import preparer_revision_fiscale_2025 as prep
from jobs import verifier_revision_fiscale_2025 as verification


class ClientLectureSeule:
    """Le faux client ne possède volontairement AUCUNE méthode d'écriture."""

    def __init__(self, lignes):
        self.lignes = lignes
        self.appels = []
        self.uid = None

    def table(self, nom):
        self.appels.append(("table", nom))
        return self

    def select(self, champs):
        self.appels.append(("select", champs))
        return self

    def eq(self, champ, valeur):
        self.appels.append(("eq", champ, valeur))
        self.uid = valeur
        return self

    def execute(self):
        self.appels.append(("execute",))
        return SimpleNamespace(data=self.lignes)


def _lignes(uid=None):
    params = {
        "bareme": {"decote_base_celibataire": 898.0, "decote_plafond_celibataire": 1986.0,
                   "decote_base_couple": 1486.0, "decote_plafond_couple": 3284.0,
                   "tranches": [11600.0, 29579.0, 84577.0, 181917.0],
                   "taux": [0.11, 0.30, 0.41, 0.45]},
        "prelevements_sociaux": .172,
        "or_physique": {"taxe_forfaitaire": .115},
        "mention_source_code_non_verifiee": "ancienne",
    }
    base = [{"user_id": uid, "annee_revenus": a, "revision": 1, "origine": "reprise_code_non_verifiee",
             "source_ref": prep.SOURCE_REVISION_1, "parametres": deepcopy(params)}
            for a in (2022, 2023, 2024, 2025, 2026)]
    return base


def test_diff_json_ne_signale_pas_les_tuples_egaux_aux_listes_de_la_base():
    # `asdict(Bareme)` conserve les tuples ; JSONB les restitue comme listes.
    ancien = {"bareme": {"tranches": [11600, 29579], "taux": [0.11, 0.30]}}
    candidat = {"bareme": {"tranches": (11600.0, 29579.0), "taux": (0.11, 0.30)}}
    assert verification._differences(ancien, candidat) == []
    candidat["bareme"]["tranches"] = (11600.0, 30000.0)
    assert verification._differences(ancien, candidat) == [
        {"champ": "bareme.tranches[1]", "operation": "changement",
         "avant": 29579, "apres": 30000.0},
    ]


def test_simulation_2025_exclut_or_physique_et_ne_peut_pas_etre_inseree():
    simulation = prep.simuler_ligne_2025()
    ligne = simulation["champs_ligne_envisagee"]
    assert simulation["statut_validation"] == "incomplet_ne_pas_inserer_ni_activer"
    assert (ligne["annee_revenus"], ligne["revision"]) == (2025, 2)
    assert ligne["source_ref"] is None and "user_id" not in ligne
    scope = simulation["perimetre_personnel_hors_parametres_fiscaux"]
    assert scope["titulaire_des_titres_de_ce_portefeuille"] == "proprietaire_du_compte_seul"
    assert scope["foyer_pour_la_declaration_ir"] == "marie_declaration_commune"
    assert scope["autres_revenus_mobiliers_ou_cessions_du_conjoint"] == "inconnus_non_presumes_nuls"
    assert "titulaire_des_titres_de_ce_portefeuille" not in ligne["parametres"]
    meta = simulation["proposition_metadonnees_apres_migration_011_non_appliquee"]
    assert meta["statut_validation"] == "brouillon" and meta["actif"] is False
    assert "or_physique" not in ligne["parametres"]
    assert "pas" not in ligne["parametres"]
    assert ligne["parametres"]["prelevements_sociaux_par_categorie"]["plus_values_titres"] == .186


def test_requete_unique_filtre_proprietaire_et_aucune_ecriture():
    uid = str(uuid4())
    client = ClientLectureSeule(_lignes(uid))
    lignes = verification.lire_revisions(client, uid)
    assert lignes == client.lignes
    assert client.appels == [("table", "pf2_fiscal_annees"),
                            ("select", "user_id,annee_revenus,revision,parametres,origine,source_ref"),
                            ("eq", "user_id", uid), ("execute",)]
    with pytest.raises(ValueError, match="autre propriétaire"):
        verification.lire_revisions(ClientLectureSeule(_lignes(str(uuid4()))), uid)
    with pytest.raises(ValueError):
        verification.lire_revisions(ClientLectureSeule([]), "identifiant invalide")


def test_diff_distinguant_ajouts_et_modifications_ne_produit_pas_de_ligne_a_inserer():
    r = verification.comparer_lignes(_lignes())
    assert r["revision_2_confirmable_sous_reserve"] is True
    assert r["ecriture_autorisee"] is False
    assert len(r["empreintes_lignes_pour_controle_apres_ecriture"]) == 5
    assert r["annees_autres_revisions_lues"] == {"2022": [1], "2023": [1],
                                                "2024": [1], "2026": [1]}
    ecarts = {e["champ"]: e for e in r["ecarts_code_2025_brouillon_vs_base"]}
    assert ecarts["bareme.decote_base_couple"] == {
        "champ": "bareme.decote_base_couple", "operation": "changement", "avant": 1486.0, "apres": 1483.0}
    assert ecarts["prelevements_sociaux"]["apres"] == .186
    assert "bareme.tranches" not in ecarts and "bareme.taux" not in ecarts
    assert ecarts["quotient_familial"]["operation"] == "ajout"
    assert ecarts["or_physique"]["operation"] == "retrait_du_brouillon"
    assert "avant" not in ecarts["or_physique"]
    assert ecarts["mention_source_code_non_verifiee"]["operation"] == "retrait_du_brouillon"
    assert "avant" not in ecarts["mention_source_code_non_verifiee"]
    assert not {"user_id", "revision", "parametres", "origine", "source_ref"} & r.keys()


@pytest.mark.parametrize("mutation,attendu", [
    (lambda lignes: lignes[3].update(revision=2), "Révisions 2025"),
    (lambda lignes: lignes[3]["parametres"].update(prelevements_sociaux=.186), "prelevements_sociaux"),
    (lambda lignes: lignes[3].update(source_ref="inconnu"), "Origine ou source"),
    (lambda lignes: lignes.pop(0), "2022"),
    (lambda lignes: lignes[3]["parametres"].update(champ_imprevu="sensible"), "champs inconnus"),
    (lambda lignes: lignes[0].update(revision=2), "2022"),
])
def test_derives_bloquent_numero_suppose(mutation, attendu):
    lignes = _lignes()
    mutation(lignes)
    r = verification.comparer_lignes(lignes)
    assert r["revision_2_confirmable_sous_reserve"] is False
    assert r["ecriture_autorisee"] is False
    assert attendu in " ".join(r["problemes"])


def test_workflow_manuel_sauvegarde_avant_lecture_et_aucune_ecriture():
    contenu = (Path(__file__).resolve().parents[1] / ".github/workflows/sauvegarde.yml").read_text()
    assert "workflow_dispatch: {}" in contenu
    assert contenu.index("- name: Restauration de contrôle") < contenu.index(
        "name: sauvegarde-pf2-") < contenu.index("- name: Comparer la révision 2025 en lecture seule")
    assert "if: github.event_name == 'workflow_dispatch'" in contenu
    assert "python jobs/verifier_revision_fiscale_2025.py --lire-supabase" in contenu
    assert "--appliquer" not in contenu


def test_reponse_invalide_refusee_et_pas_de_connexion_implicite():
    client = ClientLectureSeule(None)
    with pytest.raises(ValueError, match="Lecture fiscale incomplète"):
        verification.lire_revisions(client, str(uuid4()))
    with patch("sys.argv", ["verifier_revision_fiscale_2025.py"]):
        with pytest.raises(SystemExit, match="2"):
            verification.main()  # sans --lire-supabase, aucune connexion
