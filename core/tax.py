"""Moteur fiscal français.

CORRECTIONS PAR RAPPORT À LA V1
-------------------------------
1. **Les barèmes n'étaient pas indexés par année de cession.** Une seule série
   était lue dans la config et appliquée à toutes les plus-values. Ici, chaque
   calcul prend l'année d'imposition, et le barème correspondant.

2. **L'or ETC et l'or physique étaient confondus.** Tout ce qui n'était pas du
   cash ou de la crypto partait au régime des valeurs mobilières (150-0 A, donc
   12,8 % + 17,2 %). C'est exact pour un ETC comme IGLN.L, mais l'Université de
   l'Épargne propose aussi l'or physique, qui relève de l'article 150 VI avec un
   régime très différent. Le moteur sait désormais faire la distinction.

3. Le seuil d'exonération crypto de 305 € porte sur le total des cessions,
   sans abattement sur la plus-value.

4. La comparaison PFU / barème distingue les PS des titres et les intérêts
   précomptés ; la CSG n'est déduite que l'année de son paiement. Le bilan du
   foyer compare conjointement 2OP et 3CN à partir des revenus saisis ; les
   revenus absents et les cas particuliers restent hors de cette estimation.

AVERTISSEMENT
-------------
Les taux et seuils ci-dessous proviennent de sources publiques concordantes.
Seule la documentation administrative (BOFiP) fait foi. Les points marqués
« À VÉRIFIER » doivent être recoupés avant toute déclaration. Ce module produit
une estimation, pas une déclaration fiscale.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from . import fiscal_bars as fb
from .models import Classe

_QF_CORRIGE_197 = True

if TYPE_CHECKING:                     # annotations seulement : pas d'import à l'exécution
    from .portfolio import Position, Transaction


# ===========================================================================
# Impôt sur le revenu
# ===========================================================================

@dataclass
class ResultatIR:
    impot_brut: float
    decote: float
    impot_net: float
    tmi: float
    bareme_annee: int


def _impot_par_part(revenu_par_part: float, bareme: fb.Bareme) -> float:
    """Impôt sur un revenu par part, sans décote.

    `bareme.tranches` contient les plafonds des tranches 1 à 4 ; `bareme.taux`
    contient les taux des tranches 2 à 5. La première tranche est à 0 % : il faut
    donc préfixer les taux d'un zéro, sans quoi la première tranche est taxée au
    taux de la deuxième.
    """
    # L'appelant doit fournir le barème exact de l'année demandée ; ne jamais
    # appliquer implicitement le dernier millésime enregistré.
    if bareme is None:
        raise ValueError("Barème annuel requis pour le calcul par part.")
    bornes = (0.0,) + bareme.tranches
    taux = (0.0,) + bareme.taux
    impot = 0.0
    for i, t in enumerate(taux):
        bas = bornes[i]
        haut = bornes[i + 1] if i + 1 < len(bornes) else float("inf")
        if revenu_par_part > bas:
            impot += (min(revenu_par_part, haut) - bas) * t
    return impot


def _est_couple(statut: str) -> bool:
    s = statut.lower()
    return "mari" in s or "pacs" in s


def impot_revenu(
    revenu: float,
    parts: float,
    annee: int,
    statut: str = "Célibataire",
    avec_decote: bool = True,
    appliquer_seuil: bool = True,
) -> ResultatIR:
    """Impôt sur le revenu selon le barème de `annee` (CGI art. 197).

    `parts` = nombre de parts fiscales (2 pour un couple, +0,5 puis +0,5 puis +1
    par enfant à partir du troisième).
    """
    bareme = fb.bareme_de(annee)
    revenu = max(0.0, float(revenu))
    parts = max(0.5, float(parts))
    couple = _est_couple(statut)
    parts_base = 2.0 if couple else 1.0

    qf = revenu / parts
    impot_non_plafonne = _impot_par_part(qf, bareme) * parts
    if parts > parts_base:
        impot_base = _impot_par_part(revenu / parts_base, bareme) * parts_base
        demi_parts_supp = (parts - parts_base) * 2.0
        gain_max = demi_parts_supp * fb.plafond_qf_general(annee)
        if (impot_base - impot_non_plafonne) > gain_max:
            impot = max(0.0, impot_base - gain_max)
            qf = revenu / parts_base
        else:
            impot = impot_non_plafonne
    else:
        impot = impot_non_plafonne

    tmi = 0.0
    for i, plafond in enumerate(bareme.tranches):
        if qf > plafond:
            tmi = bareme.taux[i]
        else:
            tmi = bareme.taux[max(0, i - 1)] if i > 0 else 0.0
            break
    else:
        tmi = bareme.taux[-1]

    decote = 0.0
    if avec_decote:
        if couple:
            base, plafond = bareme.decote_base_couple, bareme.decote_plafond_couple
        else:
            base, plafond = bareme.decote_base_celibataire, bareme.decote_plafond_celibataire
        if impot <= plafond:
            decote = max(0.0, base - impot * bareme.decote_taux)
            decote = min(decote, impot)

    net = impot - decote
    # Seuil de non-recouvrement : en dessous de 61 €, l'impôt n'est pas prélevé.
    if appliquer_seuil and net < fb.SEUIL_NON_RECOUVREMENT_IR:
        net = 0.0

    return ResultatIR(impot_brut=impot, decote=decote, impot_net=net, tmi=tmi, bareme_annee=annee)


# ===========================================================================
# Régime 150-0 A — valeurs mobilières (actions, ETF, ETC)
# ===========================================================================

@dataclass
class PlusValue:
    actif: str
    date_cession: dt.date
    quantite: float
    pru_eur: float
    prix_cession_eur: float
    plus_value_eur: float
    regime: str


@dataclass
class ResultatFiscal:
    regime: str
    annee: int
    plus_value_brute: float
    abattement: float
    plus_value_imposable: float
    impot_ir: float
    prelevements_sociaux: float
    total_du: float
    detail: list[PlusValue] = field(default_factory=list)
    # Renseignes uniquement pour l'article 150 VH bis : le seuil de 305 EUR
    # porte sur les prix de cession, pas sur le gain.
    total_cessions: float | None = None
    exonere_par_franchise: bool | None = None

    @property
    def taux_effectif(self) -> float:
        if self.plus_value_brute <= 0:
            return 0.0
        return self.total_du / self.plus_value_brute


def pv_titres(lignes: list[dict], annee: int) -> ResultatFiscal:
    """Plus-values de valeurs mobilières au régime 150-0 A.

    `lignes` : dicts avec `actif`, `date`, `quantite`, `pru_eur`,
    `prix_cession_eur`.

    L'abattement pour durée de détention ne s'applique qu'aux acquisitions
    antérieures au 1er janvier 2018 et aux actions de certaines sociétés. Il est
    laissé à 0 par défaut et doit être renseigné si le titre est concerné —
    c'est ce sur quoi la v1 renonçait (« À calculer »).
    """
    details: list[PlusValue] = []
    for l in lignes:
        d = l["date"]
        d = d.date() if isinstance(d, dt.datetime) else d
        if d.year != annee:
            continue
        pv = l["prix_cession_eur"] - l["pru_eur"] * l["quantite"]
        details.append(PlusValue(
            actif=l["actif"], date_cession=d, quantite=l["quantite"],
            pru_eur=l["pru_eur"], prix_cession_eur=l["prix_cession_eur"],
            plus_value_eur=pv, regime="150-0 A",
        ))

    pv_brute = sum(x.plus_value_eur for x in details)
    pv_nette = max(0.0, pv_brute)

    # DÉFAUT CORRIGÉ — les deux composantes étaient fausses.
    # `fb.PFU_TAUX - fb.PRELEVEMENTS_SOCIAUX` donnait 0,308 - 0,172 = 0,136,
    # soit 13,6 % d'IR au lieu de 12,8 % : un taux sorti d'une soustraction,
    # jamais d'un texte. Et 17,2 % de PS ne valent plus pour 2026 (18,6 %).
    ir = pv_nette * fb.IR_FORFAITAIRE
    ps = pv_nette * fb.taux_ps(annee)

    return ResultatFiscal(
        regime="150-0 A", annee=annee, plus_value_brute=pv_brute, abattement=0.0,
        plus_value_imposable=pv_nette, impot_ir=ir, prelevements_sociaux=ps,
        total_du=ir + ps, detail=details,
    )


# ===========================================================================
# Régime 150 VH bis — actifs numériques (crypto), calcul global
# ===========================================================================

def pv_crypto(lignes: list[dict], annee: int,
              anomalies: list[str] | None = None) -> ResultatFiscal:
    """Plus-values d'actifs numériques, méthode du calcul global.

    Formulaires 2086-SD. Pour chaque cession de l'année :
      - ligne 211 : date de cession
      - ligne 212 : valeur globale du portefeuille de biens numériques au moment
                    de la cession
      - ligne 213 : prix de cession
      - ligne 220 : prix total d'acquisition du portefeuille
      - ligne 221 : fractions du prix d'acquisition déjà prises en compte
      - ligne 223 : fraction du capital correspondant (220-221) × 213/212
      - ligne 224 : plus-value = 213 - 223

    Le seuil de 305 € porte sur le total des prix de cession du foyer :
    au-delà, la plus-value entière est imposable (aucun abattement).
    """
    details: list[PlusValue] = []
    pv_globale = 0.0

    for l in lignes:
        d = l["date"]
        d = d.date() if isinstance(d, dt.datetime) else d
        if d.year != annee or l.get("sens") != "vente":
            continue

        prix_cession = float(l["prix_cession_eur"])
        valeur_globale = float(l.get("valeur_globale_eur", 0.0))
        # Garde-fou explicite : la v1 forçait valeur_globale = prix_cession quand
        # le calcul donnait moins, ce qui masquait les prix historiques manquants.
        #
        # Lever une exception ici faisait sauter toute la page Fiscalité pour une
        # seule cession. On garde la même exigence — pas de chiffre approximatif —
        # mais on la consigne dans `anomalies` quand l'appelant en fournit une,
        # comme pour `calculer_positions`. Sans liste, on lève toujours : les
        # robots, eux, doivent s'arrêter.
        if valeur_globale <= 0:
            message = (
                f"Valeur globale du portefeuille crypto indisponible au {d}. "
                "Impossible de calculer la fraction du capital. "
                "Renseignez le prix de chaque actif détenu à cette date."
            )
            if anomalies is None:
                raise ValueError(message)
            anomalies.append(message)
            continue

        ligne_220 = float(l["cout_total_acquisition_eur"])
        ligne_221 = float(l.get("fractions_deja_prises", 0.0))
        ligne_222 = max(0.0, ligne_220 - ligne_221)
        ligne_223 = ligne_222 * (prix_cession / valeur_globale)
        ligne_224 = prix_cession - ligne_223

        pv_globale += ligne_224
        details.append(PlusValue(
            actif=l["actif"], date_cession=d, quantite=l["quantite"],
            pru_eur=ligne_223 / l["quantite"] if l["quantite"] else 0.0,
            prix_cession_eur=prix_cession, plus_value_eur=ligne_224,
            regime="150 VH bis",
        ))

    # DÉFAUT CORRIGÉ — le seuil de 305 EUR est une FRANCHISE assise sur le
    # total des PRIX DE CESSION, pas un abattement sur le gain.
    #
    #   total des cessions <= 305 EUR : plus-value exonérée, case 3AN vide,
    #                                   la 2086 reste due ;
    #   total des cessions >  305 EUR : imposable DÈS LE PREMIER EURO.
    #
    # L'ancien code retirait jusqu'à 305 EUR du gain. Sur 20 EUR de gain pour
    # 400 EUR de cessions — seuil franchi — il n'imposait rien. C'est faux.
    total_cessions = sum(x.prix_cession_eur for x in details)
    exonere = total_cessions <= fb.CRYPTO_FRANCHISE_CESSIONS

    pv_imposable = 0.0 if exonere else max(0.0, pv_globale)
    abattement = 0.0          # il n'y a pas d'abattement : le champ reste, la valeur est nulle

    ir = pv_imposable * fb.IR_FORFAITAIRE
    ps = pv_imposable * fb.taux_ps(annee)

    return ResultatFiscal(
        regime="150 VH bis", annee=annee, plus_value_brute=pv_globale,
        abattement=abattement, plus_value_imposable=pv_imposable,
        impot_ir=ir, prelevements_sociaux=ps, total_du=ir + ps, detail=details,
        # Champs d'affichage : ce sont eux qui alimentent la ligne 2086 et le
        # controle du seuil sur la page Fiscalite.
        total_cessions=total_cessions, exonere_par_franchise=exonere,
    )


# ===========================================================================
# Régime 150 VI — or physique
# ===========================================================================

def abattement_or_physique(annees_detention: int) -> float:
    """Abattement pour durée de détention de l'or physique.

    5 % par année de détention au-delà de la deuxième année, dans la limite de
    100 % — soit exonération totale à 22 ans.

    À VÉRIFIER : le barème exact de l'abattement et son application à la taxe
    forfaitaire (TFMP) doivent être recoupés avec le BOFiP.
    """
    if annees_detention <= 2:
        return 0.0
    return min(1.0, (annees_detention - 2) * 0.05)


def pv_or_physique(lignes: list[dict], annee: int) -> dict:
    """Or physique : les deux régimes de l'article 150 VI, et le plus favorable.

    Régime A — **Taxe forfaitaire sur les métaux précieux** : 11,5 % du montant
    brut de la cession. Aucun abattement pour durée.

    Régime B — **Plus-value** : 19 % d'IR + 17,2 % de prélèvements sociaux sur la
    plus-value, avec abattement de 5 %/an dès la 3ᵉ année, exonération totale à
    22 ans.

    ATTENTION : le régime des plus-values n'est PAS appliqué automatiquement
    parce qu'il coûte moins cher. Il exige une option expresse (2092) et une
    preuve de la date et du prix d'acquisition, ou de la détention > 22 ans.
    Le minimum calculé ci-dessous est uniquement illustratif et ne doit pas
    être considéré comme l'impôt réellement dû. Modalités et taux PS 2025 à
    valider pour chaque vente avant toute publication fiscale.
    """
    total_brut = 0.0
    total_pv = 0.0
    abattement_moyen = 0.0
    nb = 0

    for l in lignes:
        d = l["date"]
        d = d.date() if isinstance(d, dt.datetime) else d
        if d.year != annee or l.get("sens") != "vente":
            continue
        brut = float(l["prix_cession_eur"])
        pv = brut - float(l["cout_acquisition_eur"])
        da = l["date_acquisition"]
        da = da.date() if isinstance(da, dt.datetime) else da
        annees = (d - da).days / 365.25
        total_brut += brut
        total_pv += pv
        abattement_moyen += abattement_or_physique(int(annees))
        nb += 1

    if nb == 0:
        return {"regime": "150 VI", "annee": annee, "total_du": 0.0,
                "detail": "Aucune cession d'or physique cette année."}

    abatt = abattement_moyen / nb

    # Régime A : TFMP sur le brut.
    tfmp = total_brut * fb.OR_PHYS_TFMP

    # Régime B : PV après abattement.
    pv_nette = max(0.0, total_pv * (1.0 - abatt))
    regime_b = pv_nette * (fb.OR_PHYS_PV_IR + fb.OR_PHYS_PV_PS)

    retenu = "TFMP (11,5 % du brut)" if tfmp <= regime_b else "Plus-value dégressive"
    return {
        "regime": "150 VI",
        "annee": annee,
        "montant_brut_cessions": total_brut,
        "plus_value": total_pv,
        "abattement_duree": abatt,
        "tfmp": tfmp,
        "regime_plus_value": regime_b,
        "regime_retenu": retenu,  # comparaison illustrative, PAS option exercée
        "total_du": min(tfmp, regime_b),  # minimum théorique, PAS solde dû certifié
        "avertissement": "Or physique : option 2092 non automatique, justificatifs requis ; montant indicatif non validé pour une déclaration.",
        "detail": f"{nb} cession(s) d'or physique.",
    }


# ===========================================================================
# Choix PFU / barème progressif
# ===========================================================================

def comparer_pfu_bareme(
    plus_value_nette: float,
    autres_revenus: float,
    parts: float,
    annee: int,
    statut: str = "Célibataire",
    *,
    interets_eur: float = 0.0,
    interets_ps_precomptes: bool | None = None,
) -> dict:
    """Option globale 2OP : titres + intérêts, PS selon leur traitement réel.

    La CSG sur les PV et les RCM non précomptés, payée sur l'avis N+1,
    n'est PAS déductible des revenus N. Le futur avantage n'est pas chiffré
    dans l'arbitrage N (les revenus et le paiement futurs sont inconnus).
    """
    pv = max(0.0, float(plus_value_nette))
    interets = max(0.0, float(interets_eur))
    if interets > 0 and not isinstance(interets_ps_precomptes, bool):
        raise ValueError("Indiquez si les prélèvements sociaux des intérêts ont déjà été précomptés lors du versement ; le pays du courtier ne suffit pas.")
    if pv + interets <= 0:
        return {"choix": "PFU", "gain": 0.0, "detail": "Aucun revenu mobilier imposable."}

    ps_pv = pv * fb.taux_ps(annee)
    ps_interets = interets * fb.taux_ps_revenu_mobilier(
        annee, precompte=interets_ps_precomptes,
    ) if interets else 0.0
    ps = ps_pv + ps_interets  # dette totale, déjà versée en partie si précomptée
    ir_sans = impot_revenu(autres_revenus, parts, annee, statut)
    ir_sans_brut = impot_revenu(autres_revenus, parts, annee, statut, appliquer_seuil=False).impot_net
    pfu_ir_brut = (pv + interets) * fb.IR_FORFAITAIRE
    # 61 € s'apprécie sur la cotisation globale (barème + taux proportionnel),
    # pas sur la composante au barème prise isolément.
    pfu_global = ir_sans_brut + pfu_ir_brut
    pfu_ir = pfu_ir_brut if pfu_global >= fb.SEUIL_NON_RECOUVREMENT_IR else 0.0
    ir_bareme_debloque = (ir_sans_brut - ir_sans.impot_net) if pfu_ir else 0.0
    pfu_total = pfu_ir + ir_bareme_debloque + ps

    csg_annee = interets * fb.CSG_DEDUCTIBLE if interets_ps_precomptes else 0.0
    csg_ulterieure = (pv + (0.0 if interets_ps_precomptes else interets)) * fb.CSG_DEDUCTIBLE
    revenu_imposable_supp = pv + interets - csg_annee
    ir_avec = impot_revenu(autres_revenus + revenu_imposable_supp, parts, annee, statut, appliquer_seuil=False)
    ir_marginal = max(0.0, (ir_avec.impot_net if ir_avec.impot_net >= fb.SEUIL_NON_RECOUVREMENT_IR else 0.0) - ir_sans.impot_net)
    bareme_total = ir_marginal + ps

    avantage = pfu_total - bareme_total
    return {
        "annee": annee,
        "plus_value_nette": pv + interets,
        "pfu": {"ir": pfu_ir, "ir_bareme_debloque": ir_bareme_debloque,
                "ps": ps, "total": pfu_total},
        "bareme": {"ir_marginal": ir_marginal, "ps": ps, "total": bareme_total,
                   "csg_deductible": csg_annee,
                   "csg_deductible_apres_paiement_estimee": csg_ulterieure},
        "ps_titres": ps_pv, "ps_interets": ps_interets,
        "ps_deja_precomptes": ps_interets if interets_ps_precomptes else 0.0,
        "choix": "Barème progressif" if bareme_total < pfu_total else "PFU",
        "gain": abs(avantage),
        "tmi": ir_avec.tmi,
    }


def comparer_options_foyer(
    revenu_salaires: float, parts: float, annee: int, statut: str,
    pv_titres: float = 0.0, interets: float = 0.0,
    interets_ps_precomptes: bool | None = None, pv_crypto: float = 0.0,
) -> dict:
    """Compare conjointement les options *indépendantes* 2OP et 3CN.

    L'option 2OP concerne globalement les titres et revenus mobiliers saisis ;
    3CN concerne tous les gains crypto privés du foyer. Tester les quatre
    combinaisons évite de comparer deux marges IR séparées à tort : le barème,
    la décote et le QF portent sur l'assiette totale. Résultat indicatif sur
    les seules assiettes connues, sans déduction future de CSG ni crédit d'impôt.
    3CN n'est ouverte qu'à partir des cessions réalisées en 2023.
    Sources : DGFiP, notice 2086 revenus 2025 et page « revenus mobiliers ».
    """
    pv = max(0.0, float(pv_titres))
    rcm = max(0.0, float(interets))
    crypto = max(0.0, float(pv_crypto))
    if rcm > 0 and not isinstance(interets_ps_precomptes, bool):
        raise ValueError("Indiquez si les prélèvements sociaux des intérêts ont déjà été précomptés lors du versement ; le pays du courtier ne suffit pas.")
    ir_salaires = impot_revenu(revenu_salaires, parts, annee, statut).impot_net
    ps_titres = pv * fb.taux_ps(annee)
    ps_interets = (rcm * fb.taux_ps_revenu_mobilier(annee, precompte=interets_ps_precomptes)
                   if rcm else 0.0)
    ps_crypto = crypto * fb.taux_ps(annee)
    ps_total = ps_titres + ps_interets + ps_crypto
    ps_deja_precomptes = ps_interets if interets_ps_precomptes else 0.0
    scenarios = []
    for op in (False, True) if pv + rcm > 0 else (False,):
        for cn in (False, True) if crypto > 0 and annee >= 2023 else (False,):
            csg_payee_annee = rcm * fb.CSG_DEDUCTIBLE if op and interets_ps_precomptes else 0.0
            revenu_au_bareme = (revenu_salaires + (pv + rcm if op else 0.0)
                                + (crypto if cn else 0.0) - csg_payee_annee)
            ir_bareme = impot_revenu(revenu_au_bareme, parts, annee, statut,
                                     appliquer_seuil=False).impot_net
            ir_forfaitaire = fb.IR_FORFAITAIRE * ((0.0 if op else pv + rcm)
                                                 + (0.0 if cn else crypto))
            if ir_bareme + ir_forfaitaire < fb.SEUIL_NON_RECOUVREMENT_IR:
                ir_bareme = ir_forfaitaire = 0.0
            total = ir_bareme + ir_forfaitaire + ps_total
            scenarios.append({
                "cocher_2op": op, "cocher_3cn": cn,
                "ir_bareme": ir_bareme, "ir_forfaitaire": ir_forfaitaire,
                "ps_titres": ps_titres, "ps_interets": ps_interets,
                "ps_crypto": ps_crypto, "ps_total": ps_total,
                "ps_deja_precomptes": ps_deja_precomptes,
                "ps_restants": ps_total - ps_deja_precomptes,
                "csg_deductible_annee": csg_payee_annee,
                "impot_total_foyer": total,
                "cout_capital": total - ir_salaires,
            })
    retenu = min(scenarios, key=lambda s: s["impot_total_foyer"])
    defaut = scenarios[0]  # pas d'option 2OP ni 3CN
    return {
        "scenarios": scenarios, "retenu": retenu,
        "economie_vs_pfu": defaut["impot_total_foyer"] - retenu["impot_total_foyer"],
        "assiette_2op": pv + rcm, "assiette_3cn": crypto if annee >= 2023 else 0.0,
        "limite": "Estimation sur les seuls revenus saisis ; 2OP est globale pour tous les RCM et gains mobiliers du foyer. Vérifier les autres revenus et la déclaration officielle.",
    }


# ===========================================================================
# Point d'entrée
# ===========================================================================

def cessions_de_lannee(
    transactions: list["Transaction"],
    positions: dict[str, "Position"],
    annee: int,
) -> dict[Classe, list[dict]]:
    """Cessions de l'année, au format attendu par `calculer`.

    Suit le CUMP (PRU en euros) chronologique jusqu'à chaque vente, avec repli
    sur `positions[ticker].pru_eur` lorsqu'un test unitaire ne fournit que les
    ventes sans les achats antérieurs.

    2.1.0 (revue T-01) : sans taux de change, le montant n'est PAS pris en brut
    pour des euros. La cession porte `prix_cession_eur` = None et une mention
    `indisponible` ; `calculer` refuse alors de la chiffrer.
    """
    from . import fx
    from .portfolio import classe_de

    triees = sorted(
        transactions,
        key=lambda x: (x.date, 0 if x.est_achat else 1),
    )
    soldes: dict[str, dict] = {}
    cessions: dict[Classe, list[dict]] = {}

    for t in triees:
        if t.date.year > annee:
            continue
        motif_taux = None
        try:
            montant_eur = t.montant_net * fx.taux(t.devise, t.date.isoformat(), "EUR")
        except fx.FXIndisponible:
            montant_eur = None
            motif_taux = f"Taux {t.devise}/EUR indisponible le {t.date:%d/%m/%Y} pour {t.ticker}"

        etat = soldes.setdefault(t.ticker, {"qte": 0.0, "cout_eur": 0.0, "incertain": False})
        if t.est_achat:
            etat["qte"] += t.quantite
            if montant_eur is None:
                etat["incertain"] = True        # coût inconnu : la suite de la position l'est aussi
            else:
                etat["cout_eur"] += montant_eur
        elif t.est_vente:
            pos = positions.get(t.ticker)
            if etat["qte"] > 1e-9:
                pru_instant = etat["cout_eur"] / etat["qte"]
                cout_sorti = pru_instant * t.quantite
                etat["qte"] = max(0.0, etat["qte"] - t.quantite)
                etat["cout_eur"] = max(0.0, etat["cout_eur"] - cout_sorti)
                if etat["qte"] <= 1e-6:
                    etat["qte"] = 0.0
                    etat["cout_eur"] = 0.0
                    etat["incertain"] = False
            else:
                pru_instant = pos.pru_eur if pos else 0.0

            if t.date.year == annee:
                motif = motif_taux
                if motif is None and etat["incertain"]:
                    motif = (f"Coût d'acquisition incertain pour {t.ticker} "
                             "(taux manquant sur un achat antérieur)")
                ligne = {
                    "actif": t.ticker,
                    "date": t.date,
                    "quantite": t.quantite,
                    "pru_eur": pru_instant,
                    "prix_cession_eur": montant_eur,
                    "sens": "vente",
                }
                if motif:
                    ligne["indisponible"] = motif
                cessions.setdefault(classe_de(t.ticker), []).append(ligne)

    crypto = cessions.get(Classe.CRYPTO)
    if crypto:
        enrichir_crypto(crypto, transactions)
    return cessions


def enrichir_crypto(lignes: list[dict], transactions: list["Transaction"]) -> None:
    """Complète les cessions crypto des trois chiffres de l'article 150 VH bis.

    La plus-value d'une cession de biens numériques ne se calcule **pas** actif
    par actif : on fractionne le capital d'acquisition du portefeuille ENTIER au
    prorata de la valeur cédée (formulaire 2086-SD, lignes 212 à 224). D'où :

      - ligne 212 `valeur_globale_eur` : valeur de **tout** le portefeuille
        crypto détenu au moment de la cession ;
      - ligne 220 `cout_total_acquisition_eur` : prix total d'acquisition de ce
        même portefeuille ;
      - ligne 221 `fractions_deja_prises` : fractions du capital déjà déduites
        lors de cessions antérieures.

    Ces trois grandeurs sont au niveau du portefeuille, jamais de la ligne :
    c'est pourquoi elles ne peuvent pas venir de la transaction elle-même. La
    version précédente ne les fournissait pas, `pv_crypto` les lisait donc à zéro
    et son garde-fou faisait sauter la page entière.
    """
    from . import fx, prices
    from .portfolio import calculer_positions, classe_de

    crypto = sorted(
        (t for t in transactions if classe_de(t.ticker) is Classe.CRYPTO),
        key=lambda t: t.date,
    )
    fractions_prises = 0.0

    for l in sorted(lignes, key=lambda x: x["date"]):
        if l.get("prix_cession_eur") is None:
            continue        # taux absent : la ligne est déjà marquée indisponible
        d = l["date"]
        iso = d.isoformat()

        # Positions détenues à la date de cession : tout ce qui précède, d compris.
        positions = calculer_positions(
            [t for t in crypto if t.date <= d], anomalies=[]
        )

        # ligne 220 — coût d'acquisition du portefeuille crypto
        cout_total = sum(p.cout_total_eur for p in positions.values())

        # ligne 212 — valeur globale du portefeuille crypto à la date de cession
        valeur_globale = 0.0
        manquants: list[str] = []
        for p in positions.values():
            if p.quantite <= 0:
                continue
            try:
                prix = prices.cours(p.ticker, iso)
                taux = fx.taux(p.devise_cotation, iso, "EUR")
            except (prices.CoursIndisponible, fx.FXIndisponible):
                manquants.append(f"{p.ticker} au {d:%d/%m/%Y}")
                continue
            valeur_globale += p.quantite * prix * taux

        # Un prix manquant rend la fraction fausse. On remet à zéro plutôt que de
        # livrer un chiffre approximatif : le garde-fou de `pv_crypto` le dira.
        if manquants:
            valeur_globale = 0.0

        l["valeur_globale_eur"] = valeur_globale
        l["cout_total_acquisition_eur"] = cout_total
        l["fractions_deja_prises"] = fractions_prises

        # Fraction consommée par cette cession, répercutée sur les suivantes.
        if valeur_globale > 0 and cout_total > 0:
            ligne_222 = max(0.0, cout_total - fractions_prises)
            ligne_223 = ligne_222 * (l["prix_cession_eur"] / valeur_globale)
            fractions_prises += ligne_223


def calculer(transactions_par_classe: dict[Classe, list[dict]], annee: int,
             autres_revenus: float = 0.0, parts: float = 1.0,
             statut: str = "Célibataire",
             anomalies: list[str] | None = None) -> dict:
    """Calcule l'ensemble des régimes pour une année d'imposition."""
    for lignes_classe in transactions_par_classe.values():
        for ligne in lignes_classe or []:
            if isinstance(ligne, dict) and ligne.get("indisponible"):
                raise ValueError(f"Calcul non produit : {ligne['indisponible']}.")

    resultats: dict = {"annee": annee, "regimes": []}

    classes_titres = (Classe.ACTION_ETF, Classe.OBLIGATION_ETF, Classe.OR)
    if any(c in transactions_par_classe for c in classes_titres):
        lignes: list[dict] = []
        for c in classes_titres:
            lignes.extend(transactions_par_classe.get(c, []))
        r = pv_titres(lignes, annee)
        resultats["regimes"].append({
            "regime": r.regime,
            "pv_brute": r.plus_value_brute,
            "total_du": r.total_du,
            "taux_effectif": r.taux_effectif,
            "nb_cessions": len(r.detail),
        })
        resultats["pv_titres"] = r

    if Classe.CRYPTO in transactions_par_classe:
        r = pv_crypto(transactions_par_classe[Classe.CRYPTO], annee, anomalies)
        resultats["regimes"].append({
            "regime": r.regime,
            "pv_brute": r.plus_value_brute,
            "abattement": r.abattement,
            "total_du": r.total_du,
            "taux_effectif": r.taux_effectif,
            "nb_cessions": len(r.detail),
        })
        resultats["pv_crypto"] = r

    if Classe.OR_PHYSIQUE in transactions_par_classe:
        r = pv_or_physique(transactions_par_classe[Classe.OR_PHYSIQUE], annee)
        resultats["regimes"].append(r)

    pv_totale = sum(g["pv_brute"] for g in resultats["regimes"] if "pv_brute" in g)
    resultats["pv_totale_brute"] = pv_totale
    if pv_totale > 0:
        resultats["comparaison"] = comparer_pfu_bareme(
            max(0.0, pv_totale), autres_revenus, parts, annee, statut
        )

    return resultats



# ===========================================================================
# Détails complets pour le pré-remplissage des formulaires 2074, 2086 et 2042
# ===========================================================================

# ===========================================================================
# Garde-fous de calcul (2.1.0 — revue 2.0.1, T-01 / T-02 / priorité 5)
# ===========================================================================
# Règle commune : une donnée manquante RENDE LE CALCUL INCOMPLET et le dit.
# Jamais de repli sur le montant brut étranger, jamais d'exception ravalée.


def _montant_eur(montant: float, devise: str, date_iso: str, ticker: str,
                 date_obj, indisponible: list[str]) -> float:
    """Convertit en euros, ou SIGNALE l'absence de taux. Jamais de repli au brut."""
    from . import fx
    try:
        return montant * fx.taux(devise, date_iso, "EUR")
    except fx.FXIndisponible:
        _ajouter_unique(
            indisponible,
            f"Taux {devise}/EUR indisponible le {date_obj:%d/%m/%Y} pour {ticker} : "
            "montant non converti, calcul non produit.",
        )
        return 0.0


def _ajouter_unique(liste: list[str], message: str) -> None:
    if message not in liste:
        liste.append(message)


def _normaliser_inventaire(inventaire) -> list[dict]:
    """Lignes d'inventaire crypto hors application, triées par actif puis date.

    Chaque ligne : `actif`, `date` (date ou ISO), `quantite`, `cout_acquisition_eur`
    (None = manquant, donc bloquant), `source`. Une ligne sans actif ni date est ignorée.
    """
    import datetime as _dt

    sortie: list[dict] = []
    for e in inventaire or []:
        d = e.get("date")
        if isinstance(d, str):
            d = _dt.date.fromisoformat(d[:10])
        actif = str(e.get("actif") or "").strip()
        if d is None or not actif:
            continue
        cout = e.get("cout_acquisition_eur")
        sortie.append({
            "actif": actif,
            "date": d,
            "quantite": float(e.get("quantite") or 0.0),
            "cout": None if cout in (None, "") else float(cout),
            "source": str(e.get("source") or "").strip(),
        })
    sortie.sort(key=lambda x: (x["actif"], x["date"]))
    return sortie


def detail_2074_de_lannee(
    transactions: list["Transaction"],
    annee: int,
    choix_regime: str = "PFU",
) -> dict:
    """Calcule l'intégralité du Formulaire 2074 / 2074-CMV pour `annee` :
    - Ligne 905 (plus-values) et Ligne 913 (moins-values)
    - Cadre 5 (lignes 511 à 524) détaillé actif par actif
    - Cadres 11 et 12 (Bloc 1133 : imputation des moins-values col. A à G)
    - Tableau détaillé opération par opération.
    """
    from . import fx
    from .portfolio import classe_de, filtrer_ventes_excedentaires

    classes_titres = {Classe.ACTION_ETF, Classe.OBLIGATION_ETF, Classe.OR}
    triees = sorted(
        (t for t in transactions if classe_de(t.ticker) in classes_titres),
        key=lambda x: (x.date, 0 if x.est_achat else 1),
    )

    # 2.1.0 (revue, constat 6) : une vente supérieure à la position détenue est
    # écartée de la déclaration et annoncée — jamais chiffrée. Avant, le gain
    # était calculé sur la quantité vendue entière (PRU déduit sur des titres
    # jamais détenus).
    triees, ventes_excedentaires = filtrer_ventes_excedentaires(triees)

    soldes: dict[str, dict[str, float]] = {}
    operations: list[dict] = []
    indisponible: list[str] = []
    pv_par_annee: dict[int, float] = {}

    for t in triees:
        if t.date.year > annee:
            continue
        net_eur = _montant_eur(t.montant_net, t.devise, t.date.isoformat(), t.ticker,
                               t.date, indisponible)

        etat = soldes.setdefault(t.ticker, {"qte": 0.0, "cout_eur": 0.0})
        if t.est_achat:
            etat["qte"] += t.quantite
            etat["cout_eur"] += net_eur
        elif t.est_vente and etat["qte"] > 1e-9:
            pru_eur = etat["cout_eur"] / etat["qte"]
            acq_eur = pru_eur * t.quantite
            pv_eur = net_eur - acq_eur
            etat["qte"] = max(0.0, etat["qte"] - t.quantite)
            etat["cout_eur"] = max(0.0, etat["cout_eur"] - acq_eur)
            if etat["qte"] <= 1e-6:
                etat["qte"] = 0.0
                etat["cout_eur"] = 0.0

            pv_par_annee[t.date.year] = pv_par_annee.get(t.date.year, 0.0) + pv_eur
            if t.date.year == annee:
                operations.append({
                    "actif": t.ticker,
                    "date": t.date,
                    "quantite": t.quantite,
                    "pru_unitaire_eur": pru_eur,
                    "acq_globale_eur": acq_eur,
                    "cession_unitaire_eur": net_eur / t.quantite if t.quantite > 0 else 0.0,
                    "cession_globale_eur": net_eur,
                    "plus_value_eur": pv_eur,
                })

    # Suivi FIFO des moins-values mobilières antérieures reportables sur 10 ans (CGI art. 150-0 D, 11)
    files_mv_ant: list[list[float]] = []  # [[annee_origine, montant_restant], ...]
    for y in sorted(k for k in pv_par_annee if k < annee):
        files_mv_ant = [item for item in files_mv_ant if y - int(item[0]) <= 10 and item[1] > 1e-6]
        solde_y = pv_par_annee[y]
        if solde_y < 0:
            files_mv_ant.append([float(y), abs(solde_y)])
        elif solde_y > 0 and files_mv_ant:
            gain_y = solde_y
            for item in files_mv_ant:
                if gain_y <= 0:
                    break
                conso = min(gain_y, item[1])
                item[1] -= conso
                gain_y -= conso
            files_mv_ant = [item for item in files_mv_ant if item[1] > 1e-6]

    files_mv_ant = [item for item in files_mv_ant if annee - int(item[0]) <= 10 and item[1] > 1e-6]
    mv_anterieures_dispo = round(sum(item[1] for item in files_mv_ant), 2)

    # Agrégation annuelle par titre (Cadre 5 : lignes 511 à 524)
    par_actif: list[dict] = []
    actifs_distincts = sorted({op["actif"] for op in operations})
    for actif in actifs_distincts:
        ops_a = [op for op in operations if op["actif"] == actif]
        qte_tot = sum(op["quantite"] for op in ops_a)
        cession_tot = sum(op["cession_globale_eur"] for op in ops_a)
        acq_tot = sum(op["acq_globale_eur"] for op in ops_a)
        pv_tot = sum(op["plus_value_eur"] for op in ops_a)
        par_actif.append({
            "actif": actif,
            "nb_operations": len(ops_a),
            "ligne_511": f"{actif} (Agrégé annuel) — Swissquote Bank Europe SA",
            "ligne_512": f"31/12/{annee}",
            "ligne_514": cession_tot / qte_tot if qte_tot > 0 else 0.0,
            "ligne_515": qte_tot,
            "ligne_516": cession_tot,
            "ligne_517": 0.0,
            "ligne_518": cession_tot,
            "ligne_520": acq_tot / qte_tot if qte_tot > 0 else 0.0,
            "ligne_521": acq_tot,
            "ligne_522": 0.0,
            "ligne_523": acq_tot,
            "ligne_524": pv_tot,
        })

    ligne_905 = sum(a["ligne_524"] for a in par_actif if a["ligne_524"] > 0)
    ligne_913 = abs(sum(a["ligne_524"] for a in par_actif if a["ligne_524"] < 0))
    bilan_net = ligne_905 - ligne_913

    # Cadre 11 (Bloc 1133) : imputation des moins-values de l'année (Col B) et antérieures (Col D) sur les gains
    cadre_11: list[dict] = []
    mv_restante = ligne_913
    mv_ant_restante = mv_anterieures_dispo
    for a in par_actif:
        if a["ligne_524"] <= 0:
            continue
        gain_a = a["ligne_524"]
        imput = min(gain_a, mv_restante)
        mv_restante = max(0.0, mv_restante - imput)
        col_c = gain_a - imput
        imput_ant = min(col_c, mv_ant_restante)
        mv_ant_restante = max(0.0, mv_ant_restante - imput_ant)
        col_e = col_c - imput_ant
        cadre_11.append({
            "Titre (Bloc 1133)": a["actif"],
            "Col A — Gain (€)": round(gain_a, 2),
            "Col B — Perte de l'année imputée (€)": round(imput, 2),
            "Col C — Solde (A − B) (€)": round(col_c, 2),
            "Col D — Pertes antérieures (€)": round(imput_ant, 2),
            "Col E — Gain net imposable (C − D) (€)": round(col_e, 2),
            "Col F/G — Abattement durée détention (€)": 0.0,
        })

    pv_nette_apres_mv_ant = max(0.0, bilan_net - mv_anterieures_dispo) if bilan_net > 0 else 0.0

    return {
        "annee": annee,
        "indisponible": indisponible,
        "calcul_complet": not indisponible,
        "operations": operations,
        "par_actif": par_actif,
        "ligne_905": round(ligne_905, 2),
        "ligne_913": round(ligne_913, 2),
        "bilan_net": round(bilan_net, 2),
        "mv_anterieures_reportables": mv_anterieures_dispo,
        "case_3vg": round(pv_nette_apres_mv_ant, 2) if bilan_net > 0 else 0.0,
        "case_3vh": round(abs(bilan_net), 2) if bilan_net < 0 else 0.0,
        "cadre_11": cadre_11,
        "choix_regime": choix_regime,
        "ventes_excedentaires": ventes_excedentaires,
    }


def detail_2086_de_lannee(
    transactions: list["Transaction"],
    annee: int,
    inventaire: list[dict] | None = None,
) -> dict:
    """Calcule l'intégralité du Formulaire 2086 (cryptomonnaies, art. 150 VH bis)
    en suivant les achats et les fractions de capital déduites (ligne 221) depuis
    l'origine du portefeuille jusqu'à la fin de `annee`.

    `inventaire` (2.1.0, revue T-02) : crypto-actifs détenus HORS des transactions
    suivies, une ligne par solde de référence :
    `{"actif", "date", "quantite", "cout_acquisition_eur", "source"}`.
    Le solde valable à une date de cession est le plus récent au plus tard à cette
    date. Un actif déclaré sans solde à la date d'une cession bloque le calcul ;
    une position sans prix d'acquisition aussi.

    Aucun cours ni aucun taux manquant n'est ravalé : chacun rend le calcul
    incomplet (`calcul_complet` = False), et `indisponible` nomme ce qui manque.
    """
    from . import fx, prices
    from .portfolio import classe_de, filtrer_ventes_excedentaires

    triees = sorted(
        (t for t in transactions if classe_de(t.ticker) is Classe.CRYPTO),
        key=lambda x: (x.date, 0 if x.est_achat else 1),
    )

    # 2.1.0 (revue, constat 6) : comme au 2074, une vente supérieure à la
    # position détenue est écartée et annoncée.
    triees, ventes_excedentaires = filtrer_ventes_excedentaires(triees)

    externes_par_actif: dict[str, list[dict]] = {}
    for e in _normaliser_inventaire(inventaire):
        externes_par_actif.setdefault(e["actif"], []).append(e)

    indisponible: list[str] = []
    sources_utilisees: set[str] = set()
    cout_total_brut_eur = 0.0
    somme_fractions_deduites = 0.0
    quantites: dict[str, float] = {}
    cessions_annee: list[dict] = []

    for t in triees:
        if t.date.year > annee:
            continue
        iso = t.date.isoformat()
        net_eur = _montant_eur(t.montant_net, t.devise, iso, t.ticker, t.date, indisponible)

        if t.est_achat:
            cout_total_brut_eur += net_eur
            quantites[t.ticker] = quantites.get(t.ticker, 0.0) + t.quantite
        elif t.est_vente:
            prix_cession_eur = net_eur
            prix_unitaire_implicite_eur = (
                prix_cession_eur / t.quantite if t.quantite > 0 else 0.0
            )

            # Positions détenues HORS application, valables à la date de cession.
            externes_qte: dict[str, float] = {}
            cout_externe_eur = 0.0
            for actif, entrees in externes_par_actif.items():
                valables = [e for e in entrees if e["date"] <= t.date]
                if not valables:
                    _ajouter_unique(
                        indisponible,
                        f"Solde externe de {actif} inconnu au {t.date:%d/%m/%Y} : déclarez "
                        "un solde à cette date ou antérieure (quantité 0 si rien n'était détenu).",
                    )
                    continue
                solde = valables[-1]
                if solde["cout"] is None:
                    _ajouter_unique(
                        indisponible,
                        f"Prix d'acquisition de {actif} ({solde['source'] or 'source non précisée'}) "
                        f"manquant au solde du {solde['date']:%d/%m/%Y}.",
                    )
                    continue
                externes_qte[actif] = solde["quantite"]
                cout_externe_eur += solde["cout"]
                if solde["quantite"] > 1e-8 and solde["source"]:
                    sources_utilisees.add(solde["source"])

            # Valeur globale (ligne 212) : suivi + hors application.
            qte_totale = dict(quantites)
            for actif, q in externes_qte.items():
                qte_totale[actif] = qte_totale.get(actif, 0.0) + q

            valeur_globale_eur = 0.0
            for c_tick, c_qte in qte_totale.items():
                if c_qte <= 1e-8:
                    continue
                if c_tick == t.ticker and prix_unitaire_implicite_eur > 0:
                    valeur_globale_eur += c_qte * prix_unitaire_implicite_eur
                    continue
                try:
                    px = prices.cours(c_tick, iso)
                    tx = fx.taux("USD", iso, "EUR")
                except (prices.CoursIndisponible, fx.FXIndisponible):
                    _ajouter_unique(
                        indisponible,
                        f"Cours ou taux indisponible pour {c_tick} le {t.date:%d/%m/%Y} : "
                        "valeur globale du portefeuille incomplète.",
                    )
                    continue
                valeur_globale_eur += c_qte * px * tx

            if valeur_globale_eur < prix_cession_eur:
                valeur_globale_eur = prix_cession_eur

            ligne_220 = cout_total_brut_eur + cout_externe_eur
            ligne_221 = somme_fractions_deduites
            ligne_223 = max(0.0, ligne_220 - ligne_221)
            fraction_capital = (
                ligne_223 * (prix_cession_eur / valeur_globale_eur)
                if valeur_globale_eur > 0 else 0.0
            )
            ligne_224 = prix_cession_eur - fraction_capital

            somme_fractions_deduites += fraction_capital
            quantites[t.ticker] = max(0.0, quantites.get(t.ticker, 0.0) - t.quantite)

            if t.date.year == annee:
                cessions_annee.append({
                    "actif": t.ticker,
                    "date": t.date,
                    "quantite": t.quantite,
                    "ligne_211": t.date.strftime("%d/%m/%Y"),
                    "ligne_212": round(valeur_globale_eur, 2),
                    "ligne_213": round(prix_cession_eur, 2),
                    "ligne_214": 0.0,
                    "ligne_215": round(prix_cession_eur, 2),
                    "ligne_216": 0.0,
                    "ligne_217": round(prix_cession_eur, 2),
                    "ligne_218": round(prix_cession_eur, 2),
                    "ligne_220": round(ligne_220, 2),
                    "ligne_221": round(ligne_221, 2),
                    "ligne_222": 0.0,
                    "ligne_223": round(ligne_223, 2),
                    "fraction_capital": round(fraction_capital, 2),
                    "ligne_224": round(ligne_224, 2),
                })

    total_213 = round(sum(c["ligne_213"] for c in cessions_annee), 2)
    total_224 = round(sum(c["ligne_224"] for c in cessions_annee), 2)
    exonere_305 = bool(cessions_annee) and total_213 <= fb.CRYPTO_FRANCHISE_CESSIONS

    if not cessions_annee or exonere_305:
        case_3an = 0.0
        case_3bn = 0.0
    elif total_224 > 0:
        case_3an = total_224
        case_3bn = 0.0
    else:
        case_3an = 0.0
        case_3bn = abs(total_224)

    return {
        "annee": annee,
        "cessions": cessions_annee,
        "total_cessions_213": total_213,
        "plus_value_globale_224": total_224,
        "exonere_305": exonere_305,
        "case_3an": round(case_3an, 2),
        "case_3bn": round(case_3bn, 2),
        "ventes_excedentaires": ventes_excedentaires,
        "indisponible": indisponible,
        "calcul_complet": not indisponible,
        "sources_externes": sorted(sources_utilisees),
    }


def simuler_foyer_complet(
    *,
    annee: int,
    statut: str,
    enfants: int,
    parts: float,
    salaire_1: float,
    utiliser_frais_reels_1: bool,
    km_1: float,
    cv_1: int,
    jours_repas_1: int,
    electrique_1: bool = False,
    salaire_2: float = 0.0,
    utiliser_frais_reels_2: bool = False,
    km_2: float = 0.0,
    cv_2: int = 5,
    jours_repas_2: int = 0,
    electrique_2: bool = False,
    interets_etrangers_eur: float = 0.0,
    pays_interets_etrangers: str = "Lituanie",
    interets_ps_precomptes: bool | None = None,
    bilan_pv_actions_eur: float = 0.0,
    bilan_pv_crypto_imposable_eur: float = 0.0,
) -> dict:
    """Calcule la déclaration complète du foyer (salaires, frais réels vs 10 %,
    revenus mobiliers étrangers, arbitrage PFU vs Barème, IR net, TMI et taux de
    prélèvement à la source neutre + individualisés)."""
    couple = _est_couple(statut)
    sal1 = max(0.0, float(salaire_1))
    sal2 = max(0.0, float(salaire_2)) if couple else 0.0

    # --- Déclarant 1 ---
    abatt1 = fb.abattement_10_salaire(sal1, annee)
    km1_val, km1_txt = fb.frais_kilometriques(km_1, cv_1, electrique_1, annee=annee)
    rep1_val, rep1_txt = fb.frais_repas(jours_repas_1, annee)
    frais_reels_1 = round(km1_val + rep1_val, 2) if utiliser_frais_reels_1 else 0.0
    retenir_reels_1 = bool(utiliser_frais_reels_1 and frais_reels_1 > abatt1)
    deduction_1 = frais_reels_1 if retenir_reels_1 else abatt1
    note_1ak = (
        f"Déclarant 1 ({annee}) — {km1_txt} ; {rep1_txt} ; Total frais réels (case 1AK) = " + f"{round(frais_reels_1):,} €".replace(",", " ")
        if utiliser_frais_reels_1 else ""
    )

    # --- Déclarant 2 ---
    abatt2 = fb.abattement_10_salaire(sal2, annee) if couple else 0.0
    km2_val, km2_txt = fb.frais_kilometriques(km_2, cv_2, electrique_2, annee=annee) if couple else (0.0, "")
    rep2_val, rep2_txt = fb.frais_repas(jours_repas_2, annee) if couple else (0.0, "")
    frais_reels_2 = round(km2_val + rep2_val, 2) if (couple and utiliser_frais_reels_2) else 0.0
    retenir_reels_2 = bool(couple and utiliser_frais_reels_2 and frais_reels_2 > abatt2)
    deduction_2 = frais_reels_2 if retenir_reels_2 else abatt2
    note_1bk = (
        f"Déclarant 2 ({annee}) — {km2_txt} ; {rep2_txt} ; Total frais réels (case 1BK) = " + f"{round(frais_reels_2):,} €".replace(",", " ")
        if (couple and utiliser_frais_reels_2) else ""
    )

    rev_net_1 = max(0.0, sal1 - deduction_1)
    rev_net_2 = max(0.0, sal2 - deduction_2)
    revenu_net_salaires = rev_net_1 + rev_net_2

    ir_salaires = impot_revenu(revenu_net_salaires, parts, annee, statut, avec_decote=True)

    # Assiette soumise à l'option globale PFU / Barème (case 2OP) :
    # plus-values de valeurs mobilières (> 0) + intérêts étrangers (case 2TR).
    pv_actions_pos = max(0.0, float(bilan_pv_actions_eur))
    interets_pos = max(0.0, float(interets_etrangers_eur))
    assiette_2op = pv_actions_pos + interets_pos

    if assiette_2op > 0:
        arbitrage = comparer_pfu_bareme(
            pv_actions_pos, revenu_net_salaires, parts, annee, statut,
            interets_eur=interets_pos,
            interets_ps_precomptes=interets_ps_precomptes,
        )
    else:
        arbitrage = None

    # 3CN est indépendante de 2OP : tester aussi les combinaisons croisées.
    pv_crypto_pos = max(0.0, float(bilan_pv_crypto_imposable_eur))
    options = comparer_options_foyer(
        revenu_net_salaires, parts, annee, statut,
        pv_titres=pv_actions_pos, interets=interets_pos,
        interets_ps_precomptes=interets_ps_precomptes, pv_crypto=pv_crypto_pos,
    )
    retenu = options["retenu"]
    impot_crypto = pv_crypto_pos * fb.taux_pfu(annee)  # référence PFU, pas coût retenu si 3CN
    impot_capital_retenu = retenu["cout_capital"]
    impot_total_foyer = retenu["impot_total_foyer"]
    revenu_brut_global = sal1 + sal2 + interets_pos + pv_actions_pos + pv_crypto_pos
    taux_moyen_salaires = (
        ir_salaires.impot_net / (sal1 + sal2) if (sal1 + sal2) > 0 else 0.0
    )

    # PAS : approximation sur les seuls salaires saisis, PAS le taux transmis
    # par la DGFiP. Les formules de l'art. 204 M prennent également en compte
    # les revenus communs, revenus hors PAS, crédits étrangers et arrondis ;
    # l'individualisation de droit commun s'applique depuis septembre 2025.
    # Ici, on répartit seulement l'IR simulé sur les salaires entre conjoints :
    # la somme correspond à cet IR, pas nécessairement au PAS officiel.
    if couple and sal1 > 0 and sal2 > 0:
        demi_parts_foyer = max(1.0, parts / 2.0)
        if rev_net_1 <= rev_net_2:
            ir_faible = impot_revenu(rev_net_1, demi_parts_foyer, annee, "Célibataire", avec_decote=True)
            impot_1 = min(ir_salaires.impot_net, ir_faible.impot_net)
            impot_2 = max(0.0, ir_salaires.impot_net - impot_1)
        else:
            ir_faible = impot_revenu(rev_net_2, demi_parts_foyer, annee, "Célibataire", avec_decote=True)
            impot_2 = min(ir_salaires.impot_net, ir_faible.impot_net)
            impot_1 = max(0.0, ir_salaires.impot_net - impot_2)
        taux_pas_1 = impot_1 / sal1 if sal1 > 0 else 0.0
        taux_pas_2 = impot_2 / sal2 if sal2 > 0 else 0.0
    else:
        taux_pas_1 = taux_moyen_salaires
        taux_pas_2 = 0.0

    return {
        "annee": annee,
        "statut": statut,
        "couple": couple,
        "enfants": enfants,
        "parts": parts,
        "salaire_1": sal1,
        "abattement_10_1": round(abatt1, 2),
        "frais_km_1": km1_val,
        "frais_km_formule_1": km1_txt,
        "frais_repas_1": rep1_val,
        "frais_repas_formule_1": rep1_txt,
        "frais_reels_1": frais_reels_1,
        "retenir_frais_reels_1": retenir_reels_1,
        "deduction_1": round(deduction_1, 2),
        "case_1aj": round(sal1),
        "case_1ak": round(frais_reels_1) if retenir_reels_1 else None,
        "note_1ak": note_1ak,
        "salaire_2": sal2,
        "abattement_10_2": round(abatt2, 2),
        "frais_km_2": km2_val,
        "frais_km_formule_2": km2_txt,
        "frais_repas_2": rep2_val,
        "frais_repas_formule_2": rep2_txt,
        "frais_reels_2": frais_reels_2,
        "retenir_frais_reels_2": retenir_reels_2,
        "deduction_2": round(deduction_2, 2),
        "case_1bj": round(sal2) if couple and sal2 > 0 else None,
        "case_1bk": round(frais_reels_2) if retenir_reels_2 else None,
        "note_1bk": note_1bk,
        "interets_etrangers_eur": round(interets_pos, 2),
        "pays_interets_etrangers": pays_interets_etrangers,
        "case_2tr": round(interets_pos) if interets_pos > 0 else None,
        "revenu_net_imposable_salaires": round(revenu_net_salaires, 2),
        "revenu_brut_global": round(revenu_brut_global, 2),
        "ir_salaires": ir_salaires,
        "arbitrage": arbitrage,  # comparaison 2OP isolée, affichée uniquement sans crypto
        "options_fiscales": options,
        "cocher_2op": retenu["cocher_2op"],
        "cocher_3cn": retenu["cocher_3cn"],
        "impot_crypto": round(impot_crypto, 2),  # scénario PFU de référence
        "impot_capital_retenu": round(impot_capital_retenu, 2),
        "impot_total_foyer": round(impot_total_foyer, 2),
        "taux_moyen_salaires": taux_moyen_salaires,
        "taux_pas_foyer": taux_moyen_salaires,
        "taux_pas_1": taux_pas_1,
        "taux_pas_2": taux_pas_2,
    }
