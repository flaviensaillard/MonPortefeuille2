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

# ===========================================================================
# LE CHIFFRE QUI A CHANGÉ — prélèvements sociaux sur le capital mobilier
# ===========================================================================
#
# DÉFAUT TROUVÉ À L'AUDIT. Le taux était figé à 30,8 % :
#
#     PFU_TAUX = 0.308
#     PRELEVEMENTS_SOCIAUX = 0.172
#     => IR calculé = 0,308 - 0,172 = 0,136, soit 13,6 % au lieu de 12,8 %
#
# Les DEUX composantes étaient fausses. L'IR forfaitaire est de 12,8 % depuis
# 2018 (CGI art. 200 A) ; les 13,6 % sortaient d'une soustraction, jamais d'un
# texte. Et les prélèvements sociaux ne sont plus à 17,2 %.
#
# La LFSS 2026 (loi n° 2025-1403 du 30 décembre 2025, art. 12) porte la CSG sur
# le capital mobilier de 9,2 % à 10,6 %. Le total devient :
#
#     CSG 10,6 % + CRDS 0,5 % + prélèvement de solidarité 7,5 % = 18,6 %
#     PFU = 12,8 % d'IR + 18,6 % de PS = 31,4 %
#
# L'assurance-vie, l'immobilier et l'épargne réglementée restent à 17,2 % —
# vous n'en détenez pas dans ce portefeuille.
#
# ---------------------------------------------------------------------------
# POURQUOI 2025 EST MARQUÉE « à confirmer »
# ---------------------------------------------------------------------------
# La loi distingue deux assiettes, et les sources secondaires divergent sur le
# millésime des plus-values mobilières :
#
#   - art. L. 136-6 CSS (revenus du PATRIMOINE) : hausse dès les revenus 2025 ;
#   - art. L. 136-7 CSS (produits de PLACEMENT, CSG précomptée par le payeur) :
#     hausse à compter du 1er janvier 2026.
#
# Une plus-value chez un courtier FRANÇAIS relève du second cas : le courtier
# précompte la CSG. Chez un courtier ÉTRANGER — Swissquote — rien n'est
# précompté, l'assiette est celle du patrimoine, donc le premier cas : hausse
# dès les cessions de 2025.
#
# Trois sources (DLA Piper sur la LFSS 2026, l'ANAFAGC, Legea Avocat) retiennent
# la hausse dès 2025 pour les plus-values mobilières ; deux autres la datent du
# 1er janvier 2026. Je ne tranche pas à votre place : le taux de 2025 est
# affiché avec sa fourchette, et la page Fiscalité vous le montre.
#
# POUR VOTRE CAS CONCRET, la question est réglée : la déclaration des revenus
# 2025 a été déposée au printemps 2026. Ce qui reste à déclarer, en 2027, ce sont
# les revenus 2026 — pour lesquels toutes les sources s'accordent : 18,6 %.
#
# Source : LFSS 2026, loi n° 2025-1403 du 30/12/2025, art. 12 (JO du 31/12/2025).

IR_FORFAITAIRE = 0.128        # PFU, part IR (CGI art. 200 A). Jamais soustrait.

PS_PAR_ANNEE: dict[int, float] = {
    2018: 0.172, 2019: 0.172, 2020: 0.172, 2021: 0.172,
    2022: 0.172, 2023: 0.172, 2024: 0.172,
    2025: 0.172,   # litige : 0,172 selon la CSG précomptée, 0,186 selon la LFSS
    2026: 0.186,
}

# Années dont le taux est discuté. La page fiscalité le dit au lieu de trancher.
PS_ANNEE_INCERTAINE: dict[int, str] = {
    2025: (
        "LFSS 2026 art. 12 : la hausse de CSG s'applique aux revenus du "
        "patrimoine dès 2025, aux produits de placement à partir du 1er janvier "
        "2026. Chez un courtier étranger, aucune CSG n'est précomptée : "
        "l'assiette est celle du patrimoine, donc 18,6 %. Ce module retient "
        "17,2 % par prudence — la fourchette vous est montrée."
    ),
}


def taux_ps(annee: int) -> float:
    """Taux de prélèvements sociaux sur le capital mobilier pour `annee`.

    Lève `ValueError` sur une année inconnue : un taux deviné produirait un
    chiffre faux sans le moindre avertissement.
    """
    if annee not in PS_PAR_ANNEE:
        raise ValueError(
            f"Aucun taux de prélèvements sociaux enregistré pour {annee}. "
            f"Années disponibles : {sorted(PS_PAR_ANNEE)}. "
            "Renseignez-le dans core/fiscal_bars.py — ne devinez pas."
        )
    return PS_PAR_ANNEE[annee]


def taux_pfu(annee: int) -> float:
    """PFU global (IR + PS) de l'année."""
    return IR_FORFAITAIRE + taux_ps(annee)


# Conservés pour ne pas casser les appelants qui les lisent encore, mais
# DÉRIVÉS de la table annuelle : ils ne peuvent plus diverger d'elle.
PFU_TAUX = IR_FORFAITAIRE + PS_PAR_ANNEE[2026]
PRELEVEMENTS_SOCIAUX = PS_PAR_ANNEE[2026]

# CSG déductible du revenu imposable quand on opte pour le barème progressif.
# Elle reste figée à 6,8 points (CGI art. 154 quinquies) : les 1,4 point
# supplémentaires de la LFSS 2026 sont entièrement non déductibles.
CSG_DEDUCTIBLE = 0.068

# ---------------------------------------------------------------------------
# CRYPTO — le seuil de 305 EUR n'est pas un abattement
# ---------------------------------------------------------------------------
# DÉFAUT TROUVÉ À L'AUDIT. Le code faisait :
#
#     abattement = min(305, pv_globale)   # 305 EUR retirés du GAIN
#
# Le seuil de 305 EUR (art. 150 VH bis CGI) est une FRANCHISE assise sur le
# montant total des PRIX DE CESSION de l'année, pas sur la plus-value :
#
#   - total des cessions <= 305 EUR : plus-value exonérée, case 3AN vide,
#     mais la 2086 reste à déposer — c'est elle qui prouve qu'on est sous le seuil ;
#   - total des cessions >  305 EUR : la plus-value est imposable DÈS LE PREMIER
#     EURO. Il n'y a rien à retirer du gain.
#
# Exemple : 20 EUR de gain sur 400 EUR de cessions. L'ancien code retirait 20 EUR
# d'abattement et n'imposait rien. C'est faux : le seuil est franchi, les 20 EUR
# sont imposables.
CRYPTO_FRANCHISE_CESSIONS = 305.0   # sur le total des prix de cession de l'année

# Ancien nom, conservé pour ne pas casser les appels existants. Même valeur,
# mais c'est bien une franchise — voyez l'explication ci-dessus.
CRYPTO_ABATTEMENT = CRYPTO_FRANCHISE_CESSIONS

# Or physique, article 150 VI.
OR_PHYS_TFMP = 0.115          # taxe forfaitaire sur les métaux précieux, sur le brut
OR_PHYS_PV_IR = 0.19          # voûte plus-value : IR
OR_PHYS_PV_PS = 0.172         # voûte plus-value : PS (le régime 150 VI reste à 17,2 %)
OR_PHYS_ABATTEMENT_MAX = 22   # années pour l'exonération totale

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



# ===========================================================================
# Barème kilométrique officiel URSSAF / DGFiP (voitures, CGI ann. IV art. 6 B)
# & Forfait repas par année
# ===========================================================================
# Pour une distance annuelle d (en km) et une puissance fiscale de 3 à 7+ CV :
#   - jusqu'à 5 000 km      : d * a1
#   - de 5 001 à 20 000 km  : d * a2 + b2
#   - au-delà de 20 000 km  : d * a3
# Les véhicules 100 % électriques bénéficient d'une majoration de 20 %.
BAREME_KM_VOITURE: dict[int, tuple[float, float, float, float]] = {
    3: (0.529, 0.316, 1065.0, 0.370),
    4: (0.606, 0.340, 1330.0, 0.407),
    5: (0.636, 0.357, 1395.0, 0.427),
    6: (0.665, 0.374, 1457.0, 0.447),
    7: (0.697, 0.394, 1515.0, 0.470),
}

FORFAIT_REPAS_PAR_ANNEE: dict[int, float] = {
    2022: 5.00,
    2023: 5.20,
    2024: 5.35,
    2025: 5.45,
    2026: 5.50,
}

# Plafond et plancher de l'abattement forfaitaire de 10 % sur les salaires
# (CGI art. 83, 3°).
PLANCHER_ABATTEMENT_10_PAR_ANNEE: dict[int, float] = {
    2022: 472.0,
    2023: 495.0,
    2024: 504.0,
    2025: 509.0,
    2026: 509.0,
}

PLAFOND_ABATTEMENT_10_PAR_ANNEE: dict[int, float] = {
    2022: 13_522.0,
    2023: 14_171.0,
    2024: 14_426.0,
    2025: 14_555.0,
    2026: 14_555.0,
}


def forfait_repas_de(annee: int) -> float:
    """Valeur forfaitaire d'un repas déductible aux frais réels pour `annee`."""
    if annee in FORFAIT_REPAS_PAR_ANNEE:
        return FORFAIT_REPAS_PAR_ANNEE[annee]
    return FORFAIT_REPAS_PAR_ANNEE[max(FORFAIT_REPAS_PAR_ANNEE)]


def abattement_10_salaire(salaire: float, annee: int) -> float:
    """Abattement forfaitaire de 10 % sur un salaire net imposable."""
    sal = max(0.0, float(salaire))
    if sal <= 0:
        return 0.0
    plancher = PLANCHER_ABATTEMENT_10_PAR_ANNEE.get(
        annee, PLANCHER_ABATTEMENT_10_PAR_ANNEE[max(PLANCHER_ABATTEMENT_10_PAR_ANNEE)]
    )
    plafond = PLAFOND_ABATTEMENT_10_PAR_ANNEE.get(
        annee, PLAFOND_ABATTEMENT_10_PAR_ANNEE[max(PLAFOND_ABATTEMENT_10_PAR_ANNEE)]
    )
    brut = sal * 0.10
    return min(max(brut, min(sal, plancher)), plafond)


def frais_kilometriques(
    km: float,
    cv: int = 5,
    electrique: bool = False,
) -> tuple[float, str]:
    """Calcule les frais kilométriques selon le barème officiel URSSAF / DGFiP.

    Retourne `(montant_eur, formule_explicative)` prête à copier dans la note
    jointe à la déclaration (case 1AK / 1BK).
    """
    d = max(0.0, float(km))
    if d <= 0:
        return 0.0, "0 km"
    cv_cle = min(max(int(cv), 3), 7)
    a1, a2, b2, a3 = BAREME_KM_VOITURE[cv_cle]
    if d <= 5_000:
        montant = d * a1
        formule = f"{d:,.0f} km × {a1:.3f}".replace(",", " ").replace(".", ",")
    elif d <= 20_000:
        montant = d * a2 + b2
        formule = (
            f"({d:,.0f} km × {a2:.3f}) + {b2:,.0f} €"
            .replace(",", " ").replace(".", ",")
        )
    else:
        montant = d * a3
        formule = f"{d:,.0f} km × {a3:.3f}".replace(",", " ").replace(".", ",")

    if electrique:
        montant *= 1.20
        formule += " × 1,20 (électrique +20 %)"

    s_m = f"{montant:,.2f}".replace(",", " ").replace(".", ",")
    label_cv = "7 CV et +" if cv_cle >= 7 else f"{cv_cle} CV"
    return round(montant, 2), f"Frais km ({label_cv}) : {formule} = {s_m} €"


def frais_repas(
    jours: int,
    annee: int,
    forfait_unitaire: float | None = None,
) -> tuple[float, str]:
    """Calcule les frais de repas déductibles aux frais réels."""
    j = max(0, int(jours))
    if j <= 0:
        return 0.0, "0 repas"
    taux = float(forfait_unitaire) if forfait_unitaire is not None else forfait_repas_de(annee)
    montant = round(j * taux, 2)
    s_t = f"{taux:.2f}".replace(".", ",")
    s_m = f"{montant:,.2f}".replace(",", " ").replace(".", ",")
    return montant, f"Frais de repas : {j} j × {s_t} € = {s_m} €"


def parts_fiscales_auto(statut: str, enfants: int) -> float:
    """Nombre de parts fiscales de droit commun selon le statut et les enfants."""
    s = str(statut).lower()
    base = 2.0 if ("mari" in s or "pacs" in s) else 1.0
    n = max(0, int(enfants))
    if n == 0:
        return base
    if n == 1:
        return base + 0.5
    if n == 2:
        return base + 1.0
    return base + 1.0 + float(n - 2)
