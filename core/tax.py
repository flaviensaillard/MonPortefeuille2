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

3. **L'abattement de 305 € sur la plus-value crypto manquait**, et les
   prélèvements sociaux n'étaient pas isolés.

4. **La comparaison PFU / barème était incomplète** : pas de CSG déductible
   (6,8 %), pas d'abattement pour durée, et l'affichage final abdiquait
   (« À calculer ») en renvoyant la main à l'utilisateur.

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


def _impot_par_part(revenu_par_part: float, bareme: fb.Bareme | None = None) -> float:
    """Impôt sur un revenu par part, sans décote.

    `bareme.tranches` contient les plafonds des tranches 1 à 4 ; `bareme.taux`
    contient les taux des tranches 2 à 5. La première tranche est à 0 % : il faut
    donc préfixer les taux d'un zéro, sans quoi la première tranche est taxée au
    taux de la deuxième.
    """
    if bareme is None:
        bareme = fb.BAREMES[max(fb.BAREMES)]
    bornes = (0.0,) + bareme.tranches
    taux = (0.0,) + bareme.taux
    impot = 0.0
    for i, t in enumerate(taux):
        bas = bornes[i]
        haut = bornes[i + 1] if i + 1 < len(bornes) else float("inf")
        if revenu_par_part > bas:
            impot += (min(revenu_par_part, haut) - bas) * t
    return impot


def _quotient_plafonne(revenu: float, parts: float, parts_couple: float = 2.0) -> float:
    """Plafonne le gain procuré par les parts au-delà de 2.

    Règle : l'avantage en impôt procuré par chaque demi-part supplémentaire est
    plafonné. Sans ce plafond, un foyer à 3 parts est sur-avantagé.
    À VÉRIFIER : le plafond exact pour 2026.
    """
    if parts <= parts_couple:
        return revenu / parts
    demi_parts = (parts - parts_couple) * 2
    plafond_par_demi_part = 1_759.0
    gain_max = demi_parts * plafond_par_demi_part / 2.0

    impot_sans = _impot_par_part(revenu / parts_couple) * parts_couple
    impot_avec = _impot_par_part(revenu / parts) * parts
    gain = impot_sans - impot_avec
    if gain <= gain_max:
        return revenu / parts

    impot_cible = impot_sans - gain_max
    if impot_cible <= 0:
        return revenu / parts
    bas, haut = revenu / parts_couple, revenu
    for _ in range(80):
        milieu = (bas + haut) / 2
        if _impot_par_part(milieu) * parts_couple < impot_cible:
            bas = milieu
        else:
            haut = milieu
    return (bas + haut) / 2


def _est_couple(statut: str) -> bool:
    s = statut.lower()
    return "mari" in s or "pacs" in s


def impot_revenu(
    revenu: float,
    parts: float,
    annee: int,
    statut: str = "Célibataire",
    avec_decote: bool = True,
) -> ResultatIR:
    """Impôt sur le revenu selon le barème de `annee`.

    `parts` = nombre de parts fiscales (2 pour un couple, +0,5 puis +0,5 puis +1
    par enfant à partir du troisième).
    """
    bareme = fb.bareme_de(annee)
    revenu = max(0.0, float(revenu))
    parts = max(0.5, float(parts))
    couple = _est_couple(statut)

    if couple:
        qf = _quotient_plafonne(revenu, parts, parts_couple=2.0)
        impot = _impot_par_part(qf, bareme) * 2.0
    else:
        qf = revenu / parts
        impot = _impot_par_part(qf, bareme) * parts

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
    if net < 61.0:
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

    La plus-value globale annuelle est ensuite réduite d'un abattement de 305 €.

    CORRECTION : la v1 implémentait bien la mécanique des lignes, mais oubliait
    l'abattement de 305 € et n'appliquait aucun taux.
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

    L'administration applique le régime le plus avantageux, sauf option
    contraire du contribuable. On calcule les deux et on retient le moindre.

    À VÉRIFIER auprès du BOFiP : le traitement de l'abattement sur la TFMP.
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
        "regime_retenu": retenu,
        "total_du": min(tfmp, regime_b),
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
) -> dict:
    """Compare le PFU et le barème progressif sur une plus-value.

    CORRECTION : la v1 omettait la CSG déductible (6,8 % de la CSG), qui réduit
    le revenu imposable quand on opte pour le barème. Elle appliquait aussi la
    décote dans les deux branches de la soustraction, ce qui pouvait produire un
    écart négatif.
    """
    if plus_value_nette <= 0:
        return {"choix": "PFU", "gain": 0.0, "detail": "Aucune plus-value imposable."}

    # --- Option PFU : 12,8 % d'IR + les PS de l'annee de cession.
    # Le taux de PS depend de l'annee (LFSS 2026, art. 12) : 17,2 % jusqu'en
    # 2025, 18,6 % en 2026. Un taux fige comparait deux regimes sur des bases
    # differentes selon l'exercice.
    pfu_ir = plus_value_nette * fb.IR_FORFAITAIRE
    pfu_ps = plus_value_nette * fb.taux_ps(annee)
    pfu_total = pfu_ir + pfu_ps

    # --- Option barème : la PV s'ajoute au revenu, PS dus par ailleurs.
    csg_deductible = plus_value_nette * fb.CSG_DEDUCTIBLE
    revenu_imposable_supp = plus_value_nette - csg_deductible

    ir_avec = impot_revenu(autres_revenus + revenu_imposable_supp, parts, annee, statut)
    ir_sans = impot_revenu(autres_revenus, parts, annee, statut)
    ir_marginal = max(0.0, ir_avec.impot_net - ir_sans.impot_net)
    ps = plus_value_nette * fb.taux_ps(annee)
    bareme_total = ir_marginal + ps

    avantage = pfu_total - bareme_total
    return {
        "annee": annee,
        "plus_value_nette": plus_value_nette,
        "pfu": {"ir": pfu_ir, "ps": pfu_ps, "total": pfu_total},
        "bareme": {"ir_marginal": ir_marginal, "ps": ps, "total": bareme_total,
                   "csg_deductible": csg_deductible},
        "choix": "Barème progressif" if bareme_total < pfu_total else "PFU",
        "gain": abs(avantage),
        "tmi": ir_avec.tmi,
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
    """
    from . import fx
    from .portfolio import classe_de

    triees = sorted(
        transactions,
        key=lambda x: (x.date, 0 if x.est_achat else 1),
    )
    soldes: dict[str, dict[str, float]] = {}
    cessions: dict[Classe, list[dict]] = {}

    for t in triees:
        if t.date.year > annee:
            continue
        try:
            montant_eur = t.montant_net * fx.taux(t.devise, t.date.isoformat(), "EUR")
        except fx.FXIndisponible:
            montant_eur = t.montant_net

        etat = soldes.setdefault(t.ticker, {"qte": 0.0, "cout_eur": 0.0})
        if t.est_achat:
            etat["qte"] += t.quantite
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
            else:
                pru_instant = pos.pru_eur if pos else 0.0

            if t.date.year == annee:
                classe = classe_de(t.ticker)
                cessions.setdefault(classe, []).append({
                    "actif": t.ticker,
                    "date": t.date,
                    "quantite": t.quantite,
                    "pru_eur": pru_instant,
                    "prix_cession_eur": montant_eur,
                    "sens": "vente",
                })

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
    from .portfolio import classe_de

    classes_titres = {Classe.ACTION_ETF, Classe.OBLIGATION_ETF, Classe.OR}
    triees = sorted(
        (t for t in transactions if classe_de(t.ticker) in classes_titres),
        key=lambda x: (x.date, 0 if x.est_achat else 1),
    )

    soldes: dict[str, dict[str, float]] = {}
    operations: list[dict] = []

    for t in triees:
        if t.date.year > annee:
            continue
        try:
            net_eur = t.montant_net * fx.taux(t.devise, t.date.isoformat(), "EUR")
        except fx.FXIndisponible:
            net_eur = t.montant_net

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

    # Cadre 11 (Bloc 1133) : imputation des moins-values de l'année sur les gains
    cadre_11: list[dict] = []
    mv_restante = ligne_913
    for a in par_actif:
        if a["ligne_524"] <= 0:
            continue
        gain_a = a["ligne_524"]
        imput = min(gain_a, mv_restante)
        mv_restante = max(0.0, mv_restante - imput)
        col_c = gain_a - imput
        cadre_11.append({
            "Titre (Bloc 1133)": a["actif"],
            "Col A — Gain (€)": round(gain_a, 2),
            "Col B — Perte de l'année imputée (€)": round(imput, 2),
            "Col C — Solde (A − B) (€)": round(col_c, 2),
            "Col D — Pertes antérieures (€)": 0.0,
            "Col E — Gain net imposable (C − D) (€)": round(col_c, 2),
            "Col F/G — Abattement durée détention (€)": 0.0,
        })

    return {
        "annee": annee,
        "operations": operations,
        "par_actif": par_actif,
        "ligne_905": round(ligne_905, 2),
        "ligne_913": round(ligne_913, 2),
        "bilan_net": round(bilan_net, 2),
        "case_3vg": round(bilan_net, 2) if bilan_net > 0 else 0.0,
        "case_3vh": round(abs(bilan_net), 2) if bilan_net < 0 else 0.0,
        "cadre_11": cadre_11,
        "choix_regime": choix_regime,
    }


def detail_2086_de_lannee(
    transactions: list["Transaction"],
    annee: int,
) -> dict:
    """Calcule l'intégralité du Formulaire 2086 (cryptomonnaies, art. 150 VH bis)
    en suivant les achats et les fractions de capital déduites (ligne 221) depuis
    l'origine du portefeuille jusqu'à la fin de `annee`."""
    from . import fx, prices
    from .portfolio import classe_de

    triees = sorted(
        (t for t in transactions if classe_de(t.ticker) is Classe.CRYPTO),
        key=lambda x: (x.date, 0 if x.est_achat else 1),
    )

    cout_total_brut_eur = 0.0
    somme_fractions_deduites = 0.0
    quantites: dict[str, float] = {}
    cessions_annee: list[dict] = []

    for t in triees:
        if t.date.year > annee:
            continue
        iso = t.date.isoformat()
        try:
            net_eur = t.montant_net * fx.taux(t.devise, iso, "EUR")
        except fx.FXIndisponible:
            net_eur = t.montant_net

        if t.est_achat:
            cout_total_brut_eur += net_eur
            quantites[t.ticker] = quantites.get(t.ticker, 0.0) + t.quantite
        elif t.est_vente:
            prix_cession_eur = net_eur
            prix_unitaire_implicite_eur = (
                prix_cession_eur / t.quantite if t.quantite > 0 else 0.0
            )
            valeur_globale_eur = 0.0
            for c_tick, c_qte in quantites.items():
                if c_qte <= 1e-8:
                    continue
                if c_tick == t.ticker and prix_unitaire_implicite_eur > 0:
                    valeur_globale_eur += c_qte * prix_unitaire_implicite_eur
                else:
                    try:
                        px = prices.cours(c_tick, iso)
                        tx = fx.taux("USD", iso, "EUR")
                        valeur_globale_eur += c_qte * px * tx
                    except Exception:
                        pass

            if valeur_globale_eur < prix_cession_eur:
                valeur_globale_eur = prix_cession_eur

            ligne_220 = cout_total_brut_eur
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
    km1_val, km1_txt = fb.frais_kilometriques(km_1, cv_1, electrique_1)
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
    km2_val, km2_txt = fb.frais_kilometriques(km_2, cv_2, electrique_2) if couple else (0.0, "")
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
            assiette_2op, revenu_net_salaires, parts, annee, statut
        )
    else:
        arbitrage = None

    # Plus-value crypto imposable (> 305 € de cessions) : PFU 30 % / 31,4 %
    pv_crypto_pos = max(0.0, float(bilan_pv_crypto_imposable_eur))
    impot_crypto = pv_crypto_pos * fb.taux_pfu(annee)

    impot_capital_retenu = (
        min(arbitrage["pfu"]["total"], arbitrage["bareme"]["total"])
        if arbitrage else 0.0
    ) + impot_crypto

    impot_total_foyer = ir_salaires.impot_net + impot_capital_retenu
    revenu_brut_global = sal1 + sal2 + interets_pos + pv_actions_pos + pv_crypto_pos
    taux_moyen_salaires = (
        ir_salaires.impot_net / (sal1 + sal2) if (sal1 + sal2) > 0 else 0.0
    )

    # Taux de prélèvement à la source (PAS) individualisés (1 part chacun, sans décote)
    ir_indiv_1 = impot_revenu(rev_net_1, 1.0, annee, "Célibataire", avec_decote=False)
    ir_indiv_2 = impot_revenu(rev_net_2, 1.0, annee, "Célibataire", avec_decote=False) if couple else None
    taux_pas_1 = ir_indiv_1.impot_net / sal1 if sal1 > 0 else 0.0
    taux_pas_2 = (ir_indiv_2.impot_net / sal2) if (couple and sal2 > 0 and ir_indiv_2) else 0.0

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
        "arbitrage": arbitrage,
        "cocher_2op": bool(arbitrage and arbitrage["choix"] == "Barème progressif"),
        "impot_crypto": round(impot_crypto, 2),
        "impot_capital_retenu": round(impot_capital_retenu, 2),
        "impot_total_foyer": round(impot_total_foyer, 2),
        "taux_moyen_salaires": taux_moyen_salaires,
        "taux_pas_foyer": taux_moyen_salaires,
        "taux_pas_1": taux_pas_1,
        "taux_pas_2": taux_pas_2,
    }
