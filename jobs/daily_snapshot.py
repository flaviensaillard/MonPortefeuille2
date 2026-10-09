"""Snapshot quotidien — exécuté par GitHub Actions chaque soir.

CORRECTION PAR RAPPORT À LA V1
------------------------------
La v1 avait **deux** robots : `take_snapshot.py` écrivait des valeurs brutes, et
`calc_perf.py` calculait puis **stockait** des colonnes TWR dans Supabase. Deux
scripts, deux sources de vérité pour la même grandeur, et un TWR qui devenait
faux dès qu'une projection était éditée à la main.

Ici, un seul robot qui écrit des données **brutes** (valorisation du jour). Le TWR
n'est jamais stocké : il est calculé à la demande depuis les snapshots. Une seule
source de vérité, impossible à désynchroniser.

COMPLÉTUDE (2.1.0, revues D-01 / D-02 / F-20)
----------------------------------------------
Le snapshot est TOUJOURS écrit s'il existe au moins une composante
patrimoniale (titres valorisables OU liquidités), mais il porte un marqueur :

- `complet = true`  : toutes les positions ont un cours, toutes les liquidités
  un taux, l'indicateur or est calculé ;
- `complet = false` : au moins une composante manque ; `manquantes` liste quoi.

Les points partiels ne sont JAMAIS consommés par les séries de performance
(core/db.snapshots() les écarte) : une valorisation amputée ne doit pas passer
pour la valeur réelle du patrimoine. Un portefeuille entièrement en liquidités
produit lui aussi un point (investi = 0) — la v2.0 rentrait bredouille.
"""

from __future__ import annotations

import datetime as dt
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import db, fx, prices  # noqa: E402
from core.models import (  # noqa: E402
    POCHES_PAR_CLE,
    Perimetre,
    appliquer_allocation_personnalisee,
)
from core.portfolio import calculer_positions, charger_transactions, valoriser  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("snapshot")


def main() -> int:
    aujourdhui = dt.date.today()

    # --- Vérifier que le schéma existe ---
    manquantes = db.tables_requises_manquantes()
    if manquantes:
        log.error("Tables absentes : %s. Exécutez migrations/001_init.sql.", manquantes)
        return 1

    # --- Charger l'allocation cible personnalisée (actifs & poches) ---
    try:
        if hasattr(db, "lire_allocation_personnalisee"):
            appliquer_allocation_personnalisee(db.lire_allocation_personnalisee())
    except Exception as exc:
        log.warning("Allocation personnalisée ignorée : %s", exc)

    # --- Transactions -> positions ---
    # Une ligne incohérente ne doit pas empêcher le snapshot : sans lui, vous
    # n'avez aucun historique, donc aucune courbe de performance. On consigne
    # l'anomalie dans une alerte et on continue avec ce qui est sain.
    transactions = charger_transactions(db.transactions())
    anomalies: list[str] = []
    positions = calculer_positions(transactions, anomalies)

    if anomalies:
        for a in anomalies:
            log.warning("Transaction incohérente ignorée : %s", a)
        try:
            db.ajouter_alerte(
                "Transactions incohérentes",
                "Ces lignes ont été ignorées dans le calcul des positions, vos "
                "chiffres sont donc partiels : " + " ".join(anomalies),
                niveau="attention",
            )
        except Exception as exc:      # une alerte ne doit jamais tuer le snapshot
            log.warning("Alerte non enregistrée : %s", exc)

    manquantes: list[str] = []

    # --- Valorisation des positions (si titres) ---
    actifs: list = []
    echecs: list[str] = []
    if positions:
        try:
            actifs, echecs = valoriser(positions)
        except fx.FXIndisponible as exc:
            log.error("Taux de change indisponible : %s.", exc)
            echecs = [p.ticker for p in positions]
            manquantes.append(f"taux de change ({exc})")

        if echecs:
            log.warning("Cours indisponibles : %s", echecs)
            manquantes.append("cours : " + ", ".join(echecs))
            # On continue avec les positions valorisables : le point sera
            # écrit MAIS marqué incomplet — jamais consommé par les séries.

    # --- Liquidités : comptes (2.0) si pf2_comptes est renseignée, sinon Donnees (v1).
    #     LUES AVANT le test de sortie (revue D-02) : un portefeuille vendu en
    #     totalité reste un patrimoine — le cash seul doit produire un point. ---
    totaux = {p.value: 0.0 for p in Perimetre}
    totaux_usd = {p.value: 0.0 for p in Perimetre}
    poches = {cle: 0.0 for cle in POCHES_PAR_CLE}
    tickers_deja = {a.ticker.upper() for a in actifs}

    for a in actifs:
        p = POCHES_PAR_CLE.get(a.poche)
        cle = p.perimetre.value if p else Perimetre.INVESTI.value
        totaux[cle] += a.valeur_eur
        totaux_usd[cle] += getattr(a, "valeur_usd", 0.0)
        poches[a.poche] = poches.get(a.poche, 0.0) + a.valeur_eur

    echecs_liquidites: list[str] = []
    liquidites_lues = 0
    try:
        comptes_liq = db.soldes_comptes_liquidites()
        if isinstance(comptes_liq, dict):
            for dev_code, info in comptes_liq.items():
                # La devise est le champ `ticker`. La clé peut être « CNY:courant » quand une
                # devise est répartie entre deux poches : s'en servir ferait échouer le cours
                # et la ligne serait écartée sans bruit.
                code = str(info.get("ticker") or dev_code).upper()
                if code in tickers_deja:
                    continue
                qte = float(info.get("quantite") or 0.0)
                if qte <= 0:
                    continue
                liquidites_lues += 1
                perim = str(info.get("perimetre") or Perimetre.COURANT.value)
                try:
                    t_eur = 1.0 if code == "EUR" else float(fx.taux(code, aujourdhui.isoformat(), "EUR"))
                    t_usd = 1.0 if code == "USD" else float(fx.taux(code, aujourdhui.isoformat(), "USD"))
                except Exception as exc:
                    # Taux indisponible : la ligne est écartée ET signalée. Jamais valorisée à 1,0.
                    echecs_liquidites.append(f"{code} ({exc})")
                    continue
                cle_p = Perimetre.PRECAUTION.value if perim == "precaution" else Perimetre.COURANT.value
                totaux[cle_p] = totaux.get(cle_p, 0.0) + qte * t_eur
                totaux_usd[cle_p] = totaux_usd.get(cle_p, 0.0) + qte * t_usd
    except Exception as exc:
        log.warning("Lecture des liquidités ignorée : %s", exc)
        manquantes.append(f"liquidités illisibles ({exc})")

    if echecs_liquidites:
        log.warning("Liquidités absentes du snapshot, taux indisponible : %s", echecs_liquidites)
        manquantes.append("taux liquidités : " + ", ".join(echecs_liquidites))

    if not positions and liquidites_lues == 0 and sum(totaux.values()) <= 0:
        log.info("Aucune position et aucune liquidité. Rien à snapshotter.")
        return 0

    # --- Or : indicateur seulement. Son absence ne supprime plus le snapshot :
    #     les colonnes or restent NULL et le point est marqué incomplet. ---
    cours_or = None
    equivalent_or = None
    try:
        cours_or = prices.cours_or()
        taux_usd = fx.taux("EUR", aujourdhui.isoformat(), "USD")
        inv_usd = totaux_usd[Perimetre.INVESTI.value] or (totaux[Perimetre.INVESTI.value] * taux_usd)
        equivalent_or = inv_usd / cours_or if cours_or else None
    except (prices.CoursIndisponible, fx.FXIndisponible) as exc:
        log.warning("Cours de l'or ou taux EUR/USD indisponible : %s. Indicateur or absent.", exc)
        manquantes.append(f"or/EURUSD ({exc})")

    complet = not manquantes

    ligne = {
        "date": aujourdhui.isoformat(),
        "patrimoine_total_eur": round(sum(totaux.values()), 2),
        "patrimoine_investi_eur": round(totaux[Perimetre.INVESTI.value], 2),
        "precaution_eur": round(totaux[Perimetre.PRECAUTION.value], 2),
        "courant_eur": round(totaux[Perimetre.COURANT.value], 2),
        "cours_or_usd": round(cours_or, 2) if cours_or is not None else None,
        "equivalent_or_oz": round(equivalent_or, 6) if equivalent_or is not None else None,
        "poche_rv_eur": round(
            poches.get("rv", 0.0) + poches.get("rv_physique", 0.0) + poches.get("rv_numerique", 0.0), 2
        ),
        "poche_energie_eur": round(poches.get("energie", 0.0), 2),
        "poche_asie_eur": round(poches.get("asie", 0.0), 2),
        "poche_jgb_eur": round(poches.get("jgb", 0.0), 2),
        "complet": complet,
        "manquantes": " ; ".join(manquantes) if manquantes else None,
    }

    try:
        db.ajouter_snapshot(ligne)
    except Exception as exc:
        log.error("Écriture du snapshot échouée : %s", exc)
        return 1

    log.info(
        "Snapshot %s écrit (%s) : investi %.2f €, précaution %.2f €, %s",
        ligne["date"],
        "complet" if complet else "PARTIEL — " + " ; ".join(manquantes),
        ligne["patrimoine_investi_eur"],
        ligne["precaution_eur"],
        f"{ligne['equivalent_or_oz']:.2f} oz d'or" if equivalent_or else "indicateur or absent",
    )
    if manquantes:
        try:
            db.ajouter_alerte(
                "Snapshot partiel",
                "Snapshot partiel du " + ligne["date"] + " : la valorisation est "
                "incomplète et ce point n'entrera pas dans les séries de "
                "performance. Manque : " + " ; ".join(manquantes),
                niveau="attention",
            )
        except Exception as exc:
            log.warning("Alerte non enregistrée : %s", exc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
