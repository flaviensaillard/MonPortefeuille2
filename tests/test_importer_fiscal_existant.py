"""Reprise par millésime : aucun réseau, aucune écriture réelle."""
import unittest
from unittest.mock import patch
from uuid import uuid4

from core import fiscal_bars as fb
from jobs.importer_fiscal_existant import importer, parametres_du_code


class Reponse:
    def __init__(self, data):
        self.data = data


class FauxClient:
    def __init__(self):
        self.lignes = []
        self.table_lue = None
        self.filtres = {}
        self.valeurs = None
        self.ecritures = 0

    def table(self, nom):
        assert nom == 'pf2_fiscal_annees'
        self.table_lue = nom
        self.filtres = {}
        self.valeurs = None
        return self

    def select(self, colonnes):
        assert colonnes == 'revision'
        return self

    def eq(self, colonne, valeur):
        self.filtres[colonne] = valeur
        return self

    def limit(self, n):
        assert n == 1
        return self

    def insert(self, valeurs):
        self.valeurs = valeurs
        return self

    def execute(self):
        if self.valeurs is not None:
            self.ecritures += 1
            self.lignes.append(self.valeurs)
            return Reponse([self.valeurs])
        return Reponse([{'revision': x['revision']} for x in self.lignes
                        if all(x.get(c) == v for c, v in self.filtres.items())][:1])


class TestReprise(unittest.TestCase):
    def test_simulation_puis_import_rejouable_et_isole_par_proprietaire(self):
        c = FauxClient()
        owner = str(uuid4())
        autre = str(uuid4())
        c.lignes.append({'user_id': autre, 'annee_revenus': 2022, 'revision': 1})
        c.lignes.append({'user_id': owner, 'annee_revenus': 2024, 'revision': 2})
        attendu = [2022, 2023, 2025, 2026]
        self.assertEqual(importer(c, owner), (attendu, [2024]))
        self.assertEqual(c.ecritures, 0)
        self.assertEqual(importer(c, owner, appliquer=True), (attendu, [2024]))
        self.assertEqual(c.ecritures, 4)
        self.assertEqual(importer(c, owner, appliquer=True), ([], [2022, 2023, 2024, 2025, 2026]))
        self.assertEqual(c.ecritures, 4)
        self.assertEqual(c.lignes[1]['revision'], 2, 'année 2024 déjà présente intacte')
        self.assertTrue(all(x['origine'] == 'reprise_code_non_verifiee' for x in c.lignes[2:]))
        self.assertEqual(c.lignes[-1]['parametres']['prelevements_sociaux'], .186)

    def test_pas_de_reprise_silencieuse_d_un_forfait_d_annee_precedente(self):
        sans_2026 = {k: v for k, v in fb.FORFAIT_REPAS_PAR_ANNEE.items() if k != 2026}
        with patch.object(fb, 'FORFAIT_REPAS_PAR_ANNEE', sans_2026):
            with self.assertRaisesRegex(ValueError, 'incomplets'):
                parametres_du_code(2026)

    def test_parametres_2025_sont_copie_du_code_et_pas_verifies_officiellement(self):
        p = parametres_du_code(2025)
        self.assertEqual(p['bareme']['tranches'], fb.BAREMES[2025].tranches)
        self.assertEqual(p['bareme_km']['5'], list(fb.BAREME_KM_VOITURE[5]))
        self.assertIn('non revérifiée', p['avertissement'])
        self.assertTrue(p['incertitude_ps'])

    def test_uid_invalide_refuse_avant_la_base(self):
        c = FauxClient()
        with self.assertRaises(ValueError):
            importer(c, '<VOTRE-UID>', appliquer=True)
        self.assertEqual(c.ecritures, 0)


if __name__ == '__main__':
    unittest.main()
