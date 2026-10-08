"""Un titre hors périmètre n'est compté nulle part.

Défaut de production (07/10/2026) : la tuile « Portefeuille investi » affichait
84 180 $ alors que la somme des cartes d'actifs et du cash donnait 80 781 $.
Les 3 409 $ d'écart étaient Pernod Ricard (RI.PA), détenu chez un AUTRE
courtier : `agreger` rangeait la poche inconnue dans le périmètre investi, et
la liste des actifs, elle, la masquait. Personne ne pouvait retrouver le
montant manquant à l'écran.

La règle qui remplace ce défaut : un actif sans poche connue est HORS
PÉRIMÈTRE. Il est suivi, chiffré, montré à part — mais il n'entre dans aucun
total, ni investi, ni précaution, ni courant, ni patrimoine.
"""

from __future__ import annotations

import pytest

from core.models import (
    Actif,
    Classe,
    Perimetre,
    POCHES_PAR_CLE,
    agreger_perimetres,
    poche_de,
    total_patrimoine,
)


def _actif(ticker, valeur, poche):
    return Actif(
        ticker=ticker, classe=Classe.ACTION_ETF, devise_cotation="USD",
        poche=poche, quantite=1.0, prix=valeur, valeur_eur=valeur,
        valeur_usd=valeur,
    )


class TestAgregationParPerimetre:
    def test_un_titre_sans_poche_n_entre_dans_aucun_total(self):
        actifs = [
            _actif("FLXC.L", 24000, "asie"),
            _actif("IGLN.L", 11000, "rv_physique"),
            _actif("CHF", 12000, "precaution"),
            _actif("USD", 10, "courant"),
            _actif("ZZZZ", 3409, "hors"),  # autre courtier
        ]
        eur, _usd = agreger_perimetres(actifs)

        assert eur[Perimetre.INVESTI.value] == pytest.approx(35000.0)
        assert eur[Perimetre.PRECAUTION.value] == pytest.approx(12000.0)
        assert eur[Perimetre.COURANT.value] == pytest.approx(10.0)
        # Le hors périmètre est bien mesuré — mais à part.
        assert eur[Perimetre.HORS.value] == pytest.approx(3409.0)
        assert total_patrimoine(eur) == pytest.approx(47010.0)

    def test_la_poche_inconnue_tombe_dans_le_hors(self):
        """Même sans poche « hors » déclarée : le repli est le hors, jamais
        l'investi. C'est ce repli qui créait le montant fantôme."""
        _eur, usd = agreger_perimetres([_actif("ZZZZ", 3409, "inconnu")])
        assert usd[Perimetre.INVESTI.value] == pytest.approx(0.0)
        assert usd[Perimetre.HORS.value] == pytest.approx(3409.0)

    def test_le_patrimoine_ignore_le_hors(self):
        perimetres = {p.value: 0.0 for p in Perimetre}
        perimetres[Perimetre.INVESTI.value] = 80771.0
        perimetres[Perimetre.PRECAUTION.value] = 12153.0
        perimetres[Perimetre.COURANT.value] = 10.0
        perimetres[Perimetre.HORS.value] = 3409.0
        assert total_patrimoine(perimetres) == pytest.approx(92934.0)


class TestRattachementDuTitre:
    def test_ri_pa_est_declare_hors_perimetre(self):
        p = POCHES_PAR_CLE.get("hors")
        assert p is not None
        assert p.perimetre == Perimetre.HORS
        assert "RI.PA" in p.membres

    def test_un_ticker_inconnu_n_est_jamais_investi(self):
        assert poche_de("ZZZZ") is None
        a = _actif("ZZZZ", 100, "hors")
        assert a.est_investi is False
