"""Constat 6 (revue 2.0.1) — refus de la vente excédentaire au formulaire Streamlit.

Avant la 2.1.0, le formulaire de saisie Android refusait la vente excédentaire, mais
le formulaire Streamlit (page Portefeuille) l'enregistrait : elle n'était écartée
qu'ensuite, des 2074 et 2086. Ce test verrouille :

- un validateur de SAISIE (`core.portfolio.erreur_saisie_vente`) qui accepte le
  dictionnaire du formulaire et applique le validateur partagé ;
- que la page Streamlit l'appelle AVANT toute écriture, à la création comme à la
  modification d'une transaction.

Chaque test est rouge sur l'ancien code (validateur absent, appel absent).
"""

from __future__ import annotations

import datetime as dt
import pathlib

import pytest

from core import portfolio as pf
from core.portfolio import Transaction

PAGE = pathlib.Path(__file__).resolve().parent.parent / "pages" / "1_Portefeuille.py"


def _tx(ticker: str, typ: str, jour: str, quantite: float, id: int | None = None) -> Transaction:
    return Transaction(
        ticker=ticker, type=typ, date=dt.date.fromisoformat(jour), quantite=quantite,
        cours=100.0, frais=0.0, devise="EUR", montant_net=quantite * 100.0, id=id,
    )


def _saisie(ticker: str, sens: str, jour: str, quantite: float) -> dict:
    """Le dictionnaire exactement tel que le formulaire Streamlit le construit."""
    return {"ticker": ticker, "sens": sens, "date": jour, "quantite": quantite,
            "cours": 110.0, "frais": 0.0, "devise": "EUR", "source": "manuel"}


class TestValidateurDeSaisie:
    def test_vente_superieure_a_la_position_est_refusee(self):
        txs = [_tx("CW8.L", "achat", "2025-01-10", 10)]
        message = pf.erreur_saisie_vente(txs, _saisie("CW8.L", "vente", "2025-06-01", 12))
        assert message is not None
        assert "CW8.L" in message

    def test_vente_sur_un_titre_jamais_detenu_est_refusee(self):
        message = pf.erreur_saisie_vente([], _saisie("XYZ", "vente", "2025-06-01", 1))
        assert message is not None

    def test_vente_dans_la_position_passe(self):
        txs = [_tx("CW8.L", "achat", "2025-01-10", 10)]
        assert pf.erreur_saisie_vente(txs, _saisie("CW8.L", "vente", "2025-06-01", 10)) is None

    def test_un_achat_n_est_jamais_refuse(self):
        assert pf.erreur_saisie_vente([], _saisie("CW8.L", "achat", "2025-06-01", 1000)) is None

    def test_modification_exclut_la_ligne_en_cours(self):
        """Modifier la vente 7 en 10 titres : la ligne 7 ne doit pas se compter deux fois."""
        txs = [
            _tx("CW8.L", "achat", "2025-01-10", 10, id=1),
            _tx("CW8.L", "vente", "2025-06-01", 7, id=7),
        ]
        assert pf.erreur_saisie_vente(txs, _saisie("CW8.L", "vente", "2025-06-01", 10), id_exclu=7) is None
        assert pf.erreur_saisie_vente(txs, _saisie("CW8.L", "vente", "2025-06-01", 11), id_exclu=7) is not None


class TestLaPageAppelleLeValidateurAvantEcriture:
    """Contrôle statique : aucune écriture de transaction sans passer par le validateur."""

    @pytest.fixture()
    def source(self) -> str:
        return PAGE.read_text(encoding="utf-8")

    def test_creation_valide_avant_ecriture(self, source):
        appel = source.find("erreur_saisie_vente(ctx.transactions")
        ecriture = source.find("db.ecrire(db.T_TRANSACTIONS, [ligne])")
        assert appel != -1, "le formulaire de création doit appeler le validateur de saisie"
        assert ecriture != -1
        assert appel < ecriture, "le validateur doit précéder l'écriture"

    def test_modification_valide_avant_ecriture(self, source):
        appel = source.find("erreur_saisie_vente(ctx.transactions", source.find("editer_transaction_"))
        ecriture = source.find("db.modifier_transaction(")
        assert appel != -1, "le formulaire de modification doit appeler le validateur de saisie"
        assert appel < ecriture, "le validateur doit précéder la modification"
        assert "id_exclu=" in source[appel:ecriture], "la ligne modifiée doit être exclue du calcul"
