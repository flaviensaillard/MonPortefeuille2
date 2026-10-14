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
# Revenus 2025 : tranches et décote recoupées BOFiP (07/04/2026).
# Revenus 2026 : hypothèses provisoires, NON validées pour la déclaration 2027.
# Une concordance partielle ne certifie ni le calcul complet ni la base importée.
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
        decote_base_celibataire=897.0,
        decote_plafond_celibataire=1_982.0,
        decote_base_couple=1_483.0,
        decote_plafond_couple=3_277.0,
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
    2022: "Constantes embarquées historiques non vérifiées",
    2023: "Constantes embarquées historiques non vérifiées",
    2024: "Constantes embarquées historiques non vérifiées",
    2025: "Tranches et décote recoupées BOFiP — autres règles encore à valider",
    2026: "Hypothèses provisoires — revenus 2026 non vérifiés",
}

# Plafond général QF : seul 2025 a été recoupé pour ce correctif.
# Les valeurs héritées 2022-2024 restent non auditées, 2026 est PROVISOIRE.
# Les plafonds particuliers (parent isolé, etc.) exigent un modèle distinct.
# https://bofip.impots.gouv.fr/bofip/2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20260407
PLAFOND_QF_GENERAL_PAR_ANNEE: dict[int, float] = {
    2022: 1_759.0, 2023: 1_759.0, 2024: 1_759.0,
    2025: 1_807.0, 2026: 1_807.0,
}


def plafond_qf_general(annee: int) -> float:
    if annee not in PLAFOND_QF_GENERAL_PAR_ANNEE:
        raise ValueError(f"Aucun plafond de quotient familial pour {annee}.")
    return PLAFOND_QF_GENERAL_PAR_ANNEE[annee]


# ===========================================================================
# Prélèvements sociaux : année des revenus ET nature/moment du prélèvement
# ===========================================================================
# PV de titres et gains crypto déclarés avec les revenus 2025 : 18,6 % de PS.
# RCM effectivement précomptés lors du versement en 2025 : 17,2 % ; non
# précomptés : 18,6 % lors de l'imposition en 2026. Ne jamais déduire le
# précompte du pays du courtier.
# DGFiP : https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/gains.htm
# https://www.impots.gouv.fr/particulier/les-revenus-mobiliers
# https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques
IR_FORFAITAIRE = 0.128

# Revenus du patrimoine non précomptés (PV titres, crypto, RCM non précomptés).
PS_PAR_ANNEE: dict[int, float] = {
    2018: 0.172, 2019: 0.172, 2020: 0.172, 2021: 0.172,
    2022: 0.172, 2023: 0.172, 2024: 0.172,
    2025: 0.186, 2026: 0.186,
}
# Produits de placement précomptés LORS DU VERSEMENT (sans double prélèvement).
PS_PRECOMPTES_PAR_ANNEE: dict[int, float] = {
    **{annee: 0.172 for annee in range(2018, 2026)},
    2026: 0.186,  # Hors produits bénéficiant d'une exception propre.
}
# Compatibilité de lecture avec les anciennes métadonnées, plus d'alerte
# affirmant à tort que les plus-values de titres 2025 seraient « discutées ».
PS_ANNEE_INCERTAINE: dict[int, str] = {}


def taux_ps(annee: int) -> float:
    """Taux des PV mobilières/crypto et RCM non précomptés (pas tous les RCM)."""
    if annee not in PS_PAR_ANNEE:
        raise ValueError(f"Aucun taux de PS pour les revenus {annee}.")
    return PS_PAR_ANNEE[annee]


def taux_ps_revenu_mobilier(annee: int, *, precompte: bool) -> float:
    """RCM : taux selon prélèvement EFFECTIF, jamais selon pays du payeur."""
    if not isinstance(precompte, bool):
        raise ValueError("Préciser si les prélèvements sociaux ont déjà été précomptés.")
    if not precompte:
        return taux_ps(annee)
    if annee not in PS_PRECOMPTES_PAR_ANNEE:
        raise ValueError(f"Aucun taux de PS précomptés pour les revenus {annee}.")
    return PS_PRECOMPTES_PAR_ANNEE[annee]


def taux_pfu(annee: int) -> float:
    """PFU des plus-values mobilières (ne vaut pas pour tout revenu du capital)."""
    return IR_FORFAITAIRE + taux_ps(annee)


# Anciens alias utilisés par des appelants pour le taux du millésime 2026.
PFU_TAUX = taux_pfu(2026)
PRELEVEMENTS_SOCIAUX = taux_ps(2026)

# CSG déductible, uniquement au barème, sur les revenus de son ANNÉE DE PAIEMENT.
# https://www.impots.gouv.fr/particulier/les-autres-charges
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
SEUIL_NON_RECOUVREMENT_IR = 61.0
TAUX_ABATTEMENT_SALAIRES = 0.10
SEUILS_KM_VOITURE = (5000, 20000)
MAJORATION_VOITURE_ELECTRIQUE = 0.20

# Ancien nom, conservé pour ne pas casser les appels existants. Même valeur,
# mais c'est bien une franchise — voyez l'explication ci-dessus.
CRYPTO_ABATTEMENT = CRYPTO_FRANCHISE_CESSIONS

# Or physique, article 150 VI.
OR_PHYS_TFMP = 0.115          # taxe forfaitaire sur les métaux précieux, sur le brut
OR_PHYS_PV_IR = 0.19          # voûte plus-value : IR
OR_PHYS_PV_PS = 0.172         # voûte plus-value : PS (le régime 150 VI reste à 17,2 %)
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
# Copie de la constante historique pour chaque année prise en charge. Seul
# 2025 est recoupé avec l'aide fiscale citée dans docs/AUDIT-FISCAL-2025-2026.md ;
# les autres années conservent les hypothèses antérieures, NON homologuées.
# Des dictionnaires distincts permettent une rectification sans écraser les
# autres années. Une année absente ne reprend jamais celle de 2025/2026.
BAREME_KM_VOITURE_PAR_ANNEE: dict[int, dict[int, tuple[float, float, float, float]]] = {
    annee: dict(BAREME_KM_VOITURE) for annee in (2022, 2023, 2024, 2025, 2026)
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
    """Valeur du millésime demandé ; jamais le forfait de la dernière année."""
    if annee not in FORFAIT_REPAS_PAR_ANNEE:
        raise ValueError(f"Aucun forfait repas pour les revenus {annee}.")
    return FORFAIT_REPAS_PAR_ANNEE[annee]


def abattement_10_salaire(salaire: float, annee: int) -> float:
    """Abattement pour l'année demandée, sans substitution d'un autre millésime."""
    if annee not in PLANCHER_ABATTEMENT_10_PAR_ANNEE or annee not in PLAFOND_ABATTEMENT_10_PAR_ANNEE:
        raise ValueError(f"Aucun abattement 10 % pour les revenus {annee}.")
    sal = max(0.0, float(salaire))
    if sal <= 0:
        return 0.0
    plancher = PLANCHER_ABATTEMENT_10_PAR_ANNEE[annee]
    plafond = PLAFOND_ABATTEMENT_10_PAR_ANNEE[annee]
    brut = sal * TAUX_ABATTEMENT_SALAIRES
    return min(max(brut, min(sal, plancher)), plafond)


def frais_kilometriques(
    km: float,
    cv: int = 5,
    electrique: bool = False,
    *, annee: int,
) -> tuple[float, str]:
    """Calcule les frais kilométriques du millésime demandé (hypothèses historiques).

    La présence d'une année dans la table ne certifie pas ses coefficients.

    Retourne `(montant_eur, formule_explicative)` prête à copier dans la note
    jointe à la déclaration (case 1AK / 1BK).
    """
    if annee not in BAREME_KM_VOITURE_PAR_ANNEE:
        raise ValueError(f"Aucun barème kilométrique pour les revenus {annee}.")
    d = max(0.0, float(km))
    if d <= 0:
        return 0.0, "0 km"
    cv_cle = min(max(int(cv), 3), 7)
    a1, a2, b2, a3 = BAREME_KM_VOITURE_PAR_ANNEE[annee][cv_cle]
    if d <= SEUILS_KM_VOITURE[0]:
        montant = d * a1
        formule = f"{d:,.0f} km × {a1:.3f}".replace(",", " ").replace(".", ",")
    elif d <= SEUILS_KM_VOITURE[1]:
        montant = d * a2 + b2
        formule = (
            f"({d:,.0f} km × {a2:.3f}) + {b2:,.0f} €"
            .replace(",", " ").replace(".", ",")
        )
    else:
        montant = d * a3
        formule = f"{d:,.0f} km × {a3:.3f}".replace(",", " ").replace(".", ",")

    if electrique:
        montant *= 1 + MAJORATION_VOITURE_ELECTRIQUE
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


URL_ASSISTANT_MAJ_BAREMES = "https://arena.ai/agent/01a0f24c-13af-734b-9dd4-91b1ceafa74f"

# Cache mémoire (TTL 1 h) pour éviter d'interroger data.gouv.fr à chaque interaction UI.
_CACHE_SONDE_DATAGOUV: dict[int, tuple[float, dict | None]] = {}


def verifier_maj_baremes_fiscaux(
    annee_selectionnee: int | None = None,
    date_reference: object = None,
) -> dict:
    """Vérifie si une nouvelle version des barèmes fiscaux est disponible.

    Retourne un dictionnaire :
    - `disponible` (bool) : True si une nouvelle version des barèmes fiscaux est
      disponible / requise, False si les barèmes intégrés sont à jour.
    - `derniere_annee` (int) : dernier millésime présent dans `BAREMES`.
    - `url` (str) : lien vers l'assistant Arena de mise à jour.
    - `message` (str) : explication détaillée de l'état.
    """
    import datetime as dt
    import json
    import re
    import time
    import urllib.request

    auj = date_reference if isinstance(date_reference, dt.date) else dt.date.today()
    derniere_annee = max(BAREMES.keys())
    cible = annee_selectionnee or auj.year

    # 1. Nouvelle année fiscale non encore présente dans BAREMES (ex. dès 2027)
    if auj.year > derniere_annee or cible > derniere_annee:
        an_manquant = max(auj.year, cible)
        return {
            "disponible": True,
            "etat": "verification_requise",
            "derniere_annee": derniere_annee,
            "url": URL_ASSISTANT_MAJ_BAREMES,
            "message": (
                f"Les revenus {an_manquant} ne sont pas intégrés (dernier millésime : {derniere_annee}). "
                "Vérifiez la publication officielle avant tout ajout."
            ),
        }

    # 2. Ouverture de la campagne déclarative de printemps (avril N+1) sur un barème non définitif
    source_cible = SOURCE_PAR_ANNEE.get(cible, "")
    if any(m in source_cible.lower() for m in ("recouper", "provisoire")) and auj >= dt.date(cible + 1, 4, 1):
        return {
            "disponible": True,
            "etat": "verification_requise",
            "derniere_annee": derniere_annee,
            "url": URL_ASSISTANT_MAJ_BAREMES,
            "message": (
                f"Les hypothèses des revenus {cible} doivent être vérifiées auprès des sources officielles. "
                "L'ouverture de la campagne ne prouve pas leur publication ni leur exactitude."
            ),
        }

    # 3. Sonde rapide sur data.gouv.fr (avec cache 1 h) pour détecter la publication d'un millésime > derniere_annee
    now_ts = time.time()
    cached = _CACHE_SONDE_DATAGOUV.get(derniere_annee)
    if cached is not None and (now_ts - cached[0]) < 3600:
        if cached[1] is not None:
            return cached[1]
    else:
        trouve_remote: dict | None = None
        sonde_erreur: str | None = None
        try:
            req = urllib.request.Request(
                "https://www.data.gouv.fr/api/1/datasets/?q=bareme+impot+sur+le+revenu&page_size=3",
                headers={"User-Agent": "MonPortefeuille2/1.0"},
            )
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                payload = json.loads(resp.read().decode("utf-8", errors="ignore"))
                for item in payload.get("data", []):
                    titre = str(item.get("title") or "")
                    for m in re.findall(r"\b(20[2-9]\d)\b", titre):
                        an_trouve = int(m)
                        # Le barème de l'année N porte sur les revenus N-1 ou N
                        if an_trouve > derniere_annee + 1:
                            trouve_remote = {
                                "disponible": True,
        "etat": "nouvelle_version",
                                "derniere_annee": derniere_annee,
                                "url": URL_ASSISTANT_MAJ_BAREMES,
                                "message": (
                                    f"Un nouveau jeu de données officiel (« {titre} ») a été "
                                    f"détecté sur data.gouv.fr au-delà du millésime {derniere_annee}."
                                ),
                            }
                            break
                    if trouve_remote:
                        break
        except Exception as exc:
            # 2.1.0 (revue T-08) : une panne n'est PAS un état « à jour ».
            sonde_erreur = f"{type(exc).__name__} : {exc}"
        else:
            _CACHE_SONDE_DATAGOUV[derniere_annee] = (now_ts, trouve_remote)
        if trouve_remote is not None:
            return trouve_remote
        if sonde_erreur is not None:
            return {
                "disponible": False,
                "etat": "sonde_indisponible",
                "derniere_annee": derniere_annee,
                "url": URL_ASSISTANT_MAJ_BAREMES,
                "message": (
                    "Vérification impossible : la sonde des barèmes (data.gouv.fr) n'a pas "
                    f"répondu ({sonde_erreur}). État inconnu — les barèmes intégrés vont "
                    f"jusqu'aux revenus {derniere_annee}, sans contrôle de publication."
                ),
            }

    return {
        "disponible": False,
        "etat": "integre_non_verifie",
        "derniere_annee": derniere_annee,
        "url": URL_ASSISTANT_MAJ_BAREMES,
        "message": (
            f"Constantes intégrées jusqu'aux revenus {derniere_annee} "
            f"(PFU titres : {taux_pfu(derniere_annee)*100:.1f} %). "
            "La veille n'établit ni l'exactitude des règles, ni l'absence de rectification."
        ),
    }


def generer_prompt_maj_baremes(annee_cible: int | None = None) -> str:
    """Génère le prompt complet prêt à copier-coller dans l'assistant IA pour
    produire le nouveau fichier `core/fiscal_bars.py` à déposer dans GitHub."""
    derniere_annee = max(BAREMES.keys())
    prochaine_annee = annee_cible if (annee_cible and annee_cible > derniere_annee) else (derniere_annee + 1)
    return f"""Je souhaite mettre à jour les barèmes fiscaux de mon application MonPortefeuille2 sur GitHub (`https://github.com/flaviensaillard/MonPortefeuille2`).

1. Récupère et lis la version actuelle du fichier `core/fiscal_bars.py` sur mon dépôt GitHub (`https://github.com/flaviensaillard/MonPortefeuille2/blob/main/core/fiscal_bars.py`).
2. Recherche sur les sources officielles françaises (Loi de Finances, BOFiP, Légifrance, service-public.fr, URSSAF) les barèmes officiels applicables aux **revenus {derniere_annee}** (consolidation BOFiP) et aux **revenus {prochaine_annee}** (et toute année ultérieure déjà votée) :
   - **Barème progressif de l'impôt sur le revenu (`BAREMES`)** : seuils des 4 premières tranches (`tranches`), taux des tranches (`taux`), et paramètres de la décote (`decote_base_celibataire`, `decote_plafond_celibataire`, `decote_base_couple`, `decote_plafond_couple`, `decote_taux`).
   - **Statut de vérification (`SOURCE_PAR_ANNEE`)** : indique la référence exacte (Loi de Finances / BOFiP) et retire la mention « à recouper BOFiP » pour les années désormais définitives.
   - **Prélèvements sociaux et PFU (`PS_PAR_ANNEE`, `PS_ANNEE_INCERTAINE`, `IR_FORFAITAIRE`, `CSG_DEDUCTIBLE`)** : taux des prélèvements sociaux sur les plus-values mobilières et revenus du capital pour {derniere_annee} et {prochaine_annee}.
   - **Abattement forfaitaire de 10 % sur les salaires (`PLANCHER_ABATTEMENT_10_PAR_ANNEE` et `PLAFOND_ABATTEMENT_10_PAR_ANNEE`)** : plancher et plafond officiels (CGI art. 83, 3°).
   - **Frais professionnels aux frais réels (`FORFAIT_REPAS_PAR_ANNEE` et `BAREME_KM_VOITURE`)** : valeur forfaitaire du repas URSSAF/DGFiP pour {derniere_annee} et {prochaine_annee}, et barème kilométrique officiel voitures (3 CV à 7+ CV, CGI ann. IV art. 6 B).
3. Conserve intégralement toutes les années historiques existantes (`2022` à `{derniere_annee}`) ainsi que **toutes les fonctions et constantes existantes sans modifier leurs signatures** (`Bareme`, `bareme_de`, `annees_disponibles`, `source_de`, `taux_ps`, `taux_pfu`, `forfait_repas_de`, `abattement_10_salaire`, `frais_kilometriques`, `frais_repas`, `parts_fiscales_auto`, `URL_ASSISTANT_MAJ_BAREMES`, `verifier_maj_baremes_fiscaux`, `generer_prompt_maj_baremes`).
4. Vérifie avec `pytest` qu'aucun test ne régresse, puis fournis-moi le fichier complet **`core/fiscal_bars.py`** prêt à remplacer dans le dossier `core/` de mon dépôt GitHub."""


