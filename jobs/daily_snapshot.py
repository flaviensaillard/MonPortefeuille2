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

En cas de cours manquant, le snapshot n'est PAS écrit. La v1 en aurait écrit un
avec des zéros, créant un trou dans la courbe de performance.
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

    if not positions:
        log.info("Aucune position. Rien à snapshotter.")
        return 0

    # --- Valorisation ---
    try:
        actifs, echecs = valoriser(positions)
    except fx.FXIndisponible as exc:
        log.error("Taux de change indisponible : %s. Snapshot abandonné.", exc)
        return 1

    if echecs:
        log.warning("Cours indisponibles : %s", echecs)
        if len(echecs) == len(positions):
            log.error("Aucun cours disponible. Snapshot abandonné.")
            return 1
        # On continue avec les positions valorisables, mais on le signale.

    # --- Agrégation ---
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

    # --- Liquidités : comptes (2.0) si pf2_comptes est renseignée, sinon Donnees (v1).
    #     `soldes_comptes_liquidites` choisit la source ; même forme dans les deux cas. ---
    try:
        comptes_liq = db.soldes_comptes_liquidites()
        if isinstance(comptes_liq, dict):
            for dev_code, info in comptes_liq.items():
                code = str(dev_code).upper()
                if code in tickers_deja:
                    continue
                qte = float(info.get("quantite") or 0.0)
                if qte <= 0:
                    continue
                perim = str(info.get("perimetre") or Perimetre.COURANT.value)
                try:
                    t_eur = 1.0 if code == "EUR" else float(fx.taux(code, aujourdhui.isoformat(), "EUR"))
                    t_usd = 1.0 if code == "USD" else float(fx.taux(code, aujourdhui.isoformat(), "USD"))
                except Exception:
                    continue
                cle_p = Perimetre.PRECAUTION.value if perim == "precaution" else Perimetre.COURANT.value
                totaux[cle_p] = totaux.get(cle_p, 0.0) + qte * t_eur
                totaux_usd[cle_p] = totaux_usd.get(cle_p, 0.0) + qte * t_usd
    except Exception as exc:
        log.warning("Lecture des liquidités Donnees ignorée : %s", exc)

    # --- Or ---
    try:
        cours_or = prices.cours_or()
        taux_usd = fx.taux("EUR", aujourdhui.isoformat(), "USD")
        inv_usd = totaux_usd[Perimetre.INVESTI.value] or (totaux[Perimetre.INVESTI.value] * taux_usd)
        equivalent_or = inv_usd / cours_or
    except (prices.CoursIndisponible, fx.FXIndisponible) as exc:
        log.error("Cours de l'or indisponible : %s. Snapshot abandonné.", exc)
        return 1

    ligne = {
        "date": aujourdhui.isoformat(),
        "patrimoine_total_eur": round(sum(totaux.values()), 2),
        "patrimoine_investi_eur": round(totaux[Perimetre.INVESTI.value], 2),
        "precaution_eur": round(totaux[Perimetre.PRECAUTION.value], 2),
        "courant_eur": round(totaux[Perimetre.COURANT.value], 2),
        "cours_or_usd": round(cours_or, 2),
        "equivalent_or_oz": round(equivalent_or, 6),
        "poche_rv_eur": round(
            poches.get("rv", 0.0) + poches.get("rv_physique", 0.0) + poches.get("rv_numerique", 0.0), 2
        ),
        "poche_energie_eur": round(poches.get("energie", 0.0), 2),
        "poche_asie_eur": round(poches.get("asie", 0.0), 2),
        "poche_jgb_eur": round(poches.get("jgb", 0.0), 2),
    }

    try:
        db.ajouter_snapshot(ligne)
    except Exception as exc:
        log.error("Écriture du snapshot échouée : %s", exc)
        return 1

    log.info(
        "Snapshot %s écrit : investi %.2f €, précaution %.2f €, %.2f oz d'or",
        ligne["date"], ligne["patrimoine_investi_eur"],
        ligne["precaution_eur"], ligne["equivalent_or_oz"],
    )
    if echecs:
        db.ajouter_alerte(
            "Cours manquants au snapshot",
            f"Cours indisponibles : {', '.join(echecs)}. "
            "La valorisation est partielle.",
            niveau="attention",
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
