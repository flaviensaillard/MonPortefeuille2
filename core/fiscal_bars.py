"""Barèmes fiscaux français, indexés par année de revenus.

CORRECTION MAJEURE PAR RAPPORT À LA V1
--------------------------------------
La v1 lisait une seule série de barèmes dans `st.session_state.config` et
l'appliquait à toutes les plus-values, quelle que soit l'année de cession. Une
plus-value réalisée en 2025 et une réalisée en 2026 étaient donc taxées aux mêmes
seuils. C'est faux : le barème applicable est celui de l'année d'imposition de la
plus-value, c'est-à-dire de l'année de cession.

La v1 récupérait aussi ses barèmes depuis `https://api.gouv.fr/impots/bareme/{year}`,
endpoint qui n'existe pas. Le `try` échouait en silence et l'app retombait sur sa
table interne, tout en annonçant une fiabilité « Officielle ».

Ici : une table statique, datée, sourcée, et indexée par année. Aucun appel réseau.
La fiabilité affichée est honnête.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Bareme:
    """Barème de l'impôt sur le revenu pour une année de revenus donnée."""

    annee: int
    # Plafonds des tranches 1 à 4 (la tranche 5 est ouverte).
    tranches: tuple[float, ...]
    # Taux des tranches 2 à 5.
    taux: tuple[float, ...]
    # Décote : montant forfaitaire et plafond d'application, pour isolé et couple.
    decote_base_celibataire: float
    decote_plafond_celibataire: float
    decote_base_couple: float
    decote_plafond_couple: float
    # Le taux de la décote (45,25 %).
    decote_taux: float = 0.4525

    @property
    def taux_decote(self) -> float:
        return self.decote_taux


# ---------------------------------------------------------------------------
# Table des barèmes.
#
# AVERTISSEMENT — à recouper avec le BOFiP avant mise en production.
# Les montants 2025 et 2026 proviennent de sources publiques concordantes mais
# seule la documentation administrative fait foi. La colonne `source` indique
# le niveau de confiance.
# ---------------------------------------------------------------------------

BAREMES: dict[int, Bareme] = {
    2022: Bareme(
        annee=2022,
        tranches=(10_777.0, 27_478.0, 78_570.0, 168_994.0),
        taux=(0.11, 0.30, 0.41, 0.45),
        decote_base_celibataire=846.0,
        decote_plafond_celibataire=1_870.0,
        decote_base_couple=1_395.0,
        decote_plafond_couple=3_100.0,
    ),
    2023: Bareme(
        annee=2023,
        tranches=(11_294.0, 28_797.0, 82_341.0, 177_106.0),
        taux=(0.11, 0.30, 0.41, 0.45),
        decote_base_celibataire=906.0,
        decote_plafond_celibataire=2_002.0,
        decote_base_couple=1_493.0,
        decote_plafond_couple=3_300.0,
    ),
    2024: Bareme(
        annee=2024,
        tranches=(11_520.0, 29_370.0, 83_984.0, 180_648.0),
        taux=(0.11, 0.30, 0.41, 0.45),
        decote_base_celibataire=924.0,
        decote_plafond_celibataire=2_042.0,
        decote_base_couple=1_523.0,
        decote_plafond_couple=3_365.0,
    ),
    2025: Bareme(
        annee=2025,
        tranches=(11_600.0, 29_579.0, 84_577.0, 181_917.0),
        taux=(0.11, 0.30, 0.41, 0.45),
        decote_base_celibataire=898.0,
        decote_plafond_celibataire=1_986.0,
        decote_base_couple=1_486.0,
        decote_plafond_couple=3_284.0,
    ),
    2026: Bareme(
        annee=2026,
        tranches=(11_600.0, 29_579.0, 84_577.0, 181_917.0),
        taux=(0.11, 0.30, 0.41, 0.45),
        decote_base_celibataire=898.0,
        decote_plafond_celibataire=1_986.0,
        decote_base_couple=1_486.0,
        decote_plafond_couple=3_284.0,
    ),
}

SOURCE_PAR_ANNEE: dict[int, str] = {
    2022: "Vérifié — données historiques stables",
    2023: "Vérifié — données historiques stables",
    2024: "Vérifié — données historiques stables",
    2025: "Sources publiques concordantes — à recouper BOFiP",
    2026: "Sources publiques concordantes — à recouper BOFiP",
}

# Le PFU (prélèvement forfaitaire unique) sur les plus-values mobilières :
# 12,8 % d'IR + 17,2 % de prélèvements sociaux.
PFU_TAUX = 0.308
PRELEVEMENTS_SOCIAUX = 0.172

# CSG déductible du revenu imposable quand on opte pour le barème progressif.
CSG_DEDUCTIBLE = 0.068

# Abattement annuel sur la plus-value globale crypto (art. 150 VH bis).
CRYPTO_ABATTEMENT = 305.0

# Or physique, article 150 VI.
OR_PHYS_TFMP = 0.115          # taxe forfaitaire sur les métaux précieux, sur le brut
OR_PHYS_PV_IR = 0.19          # voûte plus-value : IR
OR_PHYS_PV_PS = 0.172         # voûte plus-value : prélèvements sociaux
OR_PHYS_ABATTEMENT_MAX = 22   # années pour l'exonération totale


def bareme_de(annee: int) -> Bareme:
    """Barème applicable à une année de revenus.

    Lève `ValueError` si l'année est inconnue : mieux vaut une erreur visible
    qu'un barème deviné.
    """
    if annee not in BAREMES:
        raise ValueError(
            f"Aucun barème fiscal enregistré pour {annee}. "
            f"Années disponibles : {sorted(BAREMES)}. "
            "Renseignez-le dans core/fiscal_bars.py — ne devinez pas."
        )
    return BAREMES[annee]


def annees_disponibles() -> list[int]:
    return sorted(BAREMES)


def source_de(annee: int) -> str:
    return SOURCE_PAR_ANNEE.get(annee, "Inconnue")
