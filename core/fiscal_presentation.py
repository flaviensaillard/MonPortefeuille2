"""Synthèses de présentation, sans confondre une cession et une case du foyer.

Les colonnes 510/2086 restent PAR VENTE et datées. Les regroupements par actif
ne sont que des aides à la lecture : 903/PV et 903/MV somment séparément les
résultats de chaque vente, 224 est le total du déclarant et 51/52 celui du foyer.
"""

from __future__ import annotations

from . import fiscal_bars as fb


def calculable(detail: dict) -> bool:
    """Un total amputé d'une vente ou d'un cours n'est jamais reportable."""
    return bool(detail["calcul_complet"] and not detail["ventes_excedentaires"])


def titres_par_actif(cessions: list[dict]) -> list[dict]:
    """Vue par titre des colonnes 510 ; PV/MV restent séparées par cession."""
    groupes: dict[str, dict] = {}
    for op in cessions:
        actif = op["actif"]
        if actif not in groupes:
            groupes[actif] = {"actif": actif, "cessions": 0,
                              **{f"ligne_{n}": 0.0 for n in (516, 517, 518, 523, 524)},
                              "903_PV": 0.0, "903_MV": 0.0}
        g = groupes[actif]
        g["cessions"] += 1
        for n in (516, 517, 518, 523, 524):
            g[f"ligne_{n}"] += op[f"ligne_{n}"]
        g["903_PV"] += max(0, op["ligne_524"])
        g["903_MV"] += max(0, -op["ligne_524"])
    return list(groupes.values())


def crypto_par_actif(cessions: list[dict]) -> list[dict]:
    """La somme des résultats intermédiaires par actif n'est PAS la ligne 224."""
    groupes: dict[str, dict] = {}
    for op in cessions:
        actif = op["actif"]
        if actif not in groupes:
            groupes[actif] = {"actif": actif, "cessions": 0,
                              **{f"ligne_{n}": 0.0 for n in (213, 214, 218, 224)}}
        g = groupes[actif]
        g["cessions"] += 1
        for n in (213, 214, 218, 224):
            g[f"ligne_{n}"] += op[f"ligne_{n}"]
    return list(groupes.values())


def salaires_confirmes(annee: int, declarants: list[dict]) -> list[dict]:
    """Seulement 1AJ/BJ et 1AK/BK, même lorsque l'arbitrage IR est suspendu.

    Reprend la comparaison frais réels/abattement du moteur, sans lui passer de
    PV ou d'intérêts fictifs pour forcer une simulation partielle du foyer.
    """
    lignes = []
    for i, d in enumerate(declarants):
        brut = max(0, float(d["salaire"]))
        deduction_10 = fb.abattement_10_salaire(brut, annee)
        if annee == 2025:  # arrondi fiscal, et non round Python au demi-euro
            import math
            deduction_10 = math.floor(deduction_10 + 0.5)
        km, _ = fb.frais_kilometriques(d["km"], d["cv"], d["electrique"], annee=annee)
        repas, _ = fb.frais_repas(d["repas"], annee)
        frais = round(km + repas, 2) if d["reels"] else 0.0
        code_salaire, code_frais = (("1AJ", "1AK"), ("1BJ", "1BK"))[i]
        lignes.append({"case_salaire": code_salaire, "salaire": round(brut),
                       "case_frais": code_frais, "abattement_10": round(deduction_10, 2),
                       "frais_reels": frais,
                       "frais": round(frais) if d["reels"] and frais > deduction_10 else None})
    return lignes
