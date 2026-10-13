"""Tout champ du candidat 2025 a une référence, sans certification implicite."""
from copy import deepcopy
import unittest

from jobs import controle_couverture_2025 as ctrl
from jobs import preparer_revision_fiscale_2025 as prep


class ControleCouverture(unittest.TestCase):
    def test_exactement_les_champs_du_candidat_et_aucune_autorisation(self):
        rapport = ctrl.verifier(prep.parametres_2025())
        self.assertEqual(len(rapport["parametres_inventories"]), 36)
        self.assertEqual(set(rapport["sources_par_parametre"]), set(rapport["parametres_inventories"]))
        self.assertFalse(rapport["pret_a_ecrire"])
        self.assertNotIn("or_physique", rapport["parametres_inventories"])
        self.assertNotIn("pas", rapport["parametres_inventories"])

    def test_ajout_suppression_ou_source_dupliquee_bloquent(self):
        params = prep.parametres_2025()
        params["nouvelle_regle"] = 1
        with self.assertRaisesRegex(ValueError, "non sourcés"):
            ctrl.verifier(params)
        params = prep.parametres_2025()
        del params["forfait_repas"]
        with self.assertRaisesRegex(ValueError, "absents"):
            ctrl.verifier(params)
        orig = ctrl.GROUPES["repas"]
        try:
            ctrl.GROUPES["repas"] = orig + ("bareme.tranches",)
            with self.assertRaisesRegex(ValueError, "plusieurs fois"):
                ctrl.verifier(prep.parametres_2025())
        finally:
            ctrl.GROUPES["repas"] = orig

    def test_pas_de_donnees_personnelles_ni_d_identifiants(self):
        rapport = ctrl.verifier(prep.parametres_2025())
        self.assertNotIn("user_id", str(rapport))
        self.assertNotIn("marie", str(rapport).lower())


if __name__ == "__main__":
    unittest.main()
