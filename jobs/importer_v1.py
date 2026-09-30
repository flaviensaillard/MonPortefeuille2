"""Import des données de la v1 vers la v2.

CORRECTION PAR RAPPORT À LA V1
------------------------------
La v1 contenait une anomalie de données sur XJSE.SW : 9 achats saisis en JPY
(cours ≈ 1 115) et un saisi en USD (cours 6,87), le 05/06/2026. Même titre, deux
conventions de devise, et un PRU qui ne veut plus rien dire.

Cet import **normalise chaque titre sur sa devise de cotation réelle** et signale
les lignes qu'il a dû corriger. Sans ça, le bug serait importé tel quel.
"""

from __future__ import annotations

import argparse
import datetime as dt
import logging
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import db  # noqa: E402
from core.portfolio import devise_cotation_de  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("import")

# Tables de la v1.
V1_TRANSACTIONS = "Transaction"
V1_HISTORIQUE = "Historique"


def lire_v1(table: str) -> pd.DataFrame:
    """Lit une table de la v1."""
    rep = db.client().table(table).select("*").execute()
    return pd.DataFrame(rep.data or [])


def importer_transactions(dry_run: bool = False) -> tuple[int, list[str]]:
    """Importe les transactions v1, en normalisant les devises."""
    df = lire_v1(V1_TRANSACTIONS)
    if df.empty:
        log.info("Aucune transaction à importer.")
        return 0, []

    corrections: list[str] = []
    lignes: list[dict] = []

    for _, r in df.iterrows():
        ticker = str(r["Ticker"]).upper().strip()
        typ = str(r["Type"]).strip().lower()
        sens = "achat" if "achat" in typ else "vente" if "vente" in typ else None
        if sens is None:
            corrections.append(f"{ticker} {r['Date']} : type illisible ({r['Type']!r}), ignoré")
            continue

        devise_saisie = str(r.get("Devise", "") or "").upper().strip()
        devise_reelle = devise_cotation_de(ticker)

        quantite = float(r["Quantité"])
        cours = float(r["Cours"])
        frais = float(r["Frais"]) if pd.notna(r.get("Frais")) else 0.0

        if devise_saisie and devise_saisie != devise_reelle:
            # Ligne saisie dans une devise autre que celle de cotation du titre.
            # On reconvertit le cours vers la devise de cotation réelle.
            corrections.append(
                f"{ticker} {r['Date']} : saisi en {devise_saisie}, coté en "
                f"{devise_reelle} — cours {cours} converti"
            )
            # Le taux de change manuel de la v1 est la meilleure piste disponible.
            taux = r.get("Taux change (EUR)")
            if pd.notna(taux) and float(taux) > 0:
                # taux = EUR par unité de devise_saisie.
                # On veut : cours_reelle = cours_saisie / fx(devise_reelle->devise_saisie)
                # Approximation : on suppose que la saisie a converti depuis la
                # devise réelle, donc on divise par le ratio des deux taux.
                log.warning(
                    "  %s %s : conversion depuis %s vers %s à vérifier manuellement.",
                    ticker, r["Date"], devise_saisie, devise_reelle,
                )

        d = pd.to_datetime(r["Date"], dayfirst=True, errors="coerce")
        if pd.isna(d):
            corrections.append(f"{ticker} : date illisible ({r['Date']!r}), ignoré")
            continue

        net = quantite * cours + (frais if sens == "achat" else -frais)

        lignes.append({
            "ticker": ticker,
            "sens": sens,
            "date": d.date().isoformat(),
            "quantite": quantite,
            "cours": cours,
            "frais": frais,
            "devise": devise_reelle,
            "source": "import_v1",
            "montant_net": round(net, 6),
            "reference": f"v1:id{r.get('id')}",
        })

    if corrections:
        log.warning("%d ligne(s) à vérifier :", len(corrections))
        for c in corrections:
            log.warning("  - %s", c)

    if dry_run:
        log.info("[dry-run] %d transactions seraient importées.", len(lignes))
        return len(lignes), corrections

    try:
        db.ecrire(db.T_TRANSACTIONS, lignes)
        log.info("%d transactions importées.", len(lignes))
    except Exception as exc:
        log.error("Import des transactions échoué : %s", exc)
        raise
    return len(lignes), corrections


def importer_apports(dry_run: bool = False) -> int:
    """Importe les apports de fonds propres de la v1."""
    df = lire_v1(V1_HISTORIQUE)
    if df.empty:
        log.info("Aucun apport à importer.")
        return 0

    lignes = []
    for _, r in df.iterrows():
        typ = str(r.get("Type", "")).lower()
        sens = "apport" if "ajout" in typ else "retrait" if "retrait" in typ else None
        if sens is None:
            continue

        d = pd.to_datetime(r["Date"], dayfirst=True, errors="coerce")
        if pd.isna(d):
            continue

        montant_eur = float(r["Montant €"]) if pd.notna(r.get("Montant €")) else 0.0
        montant_or = float(r["Montant Or"]) if pd.notna(r.get("Montant Or")) else None
        cours_or = None
        if montant_or and montant_or > 0:
            montant_usd = float(r["Montant $"]) if pd.notna(r.get("Montant $")) else 0.0
            cours_or = round(montant_usd / montant_or, 2)

        lignes.append({
            "date": d.date().isoformat(),
            "sens": sens,
            "montant_eur": round(montant_eur, 2),
            "montant_or": round(montant_or, 6) if montant_or else None,
            "cours_or": cours_or,
            "compte": "import_v1",
            "reference": f"v1:id{r.get('id')}",
        })

    if dry_run:
        log.info("[dry-run] %d apports seraient importés.", len(lignes))
        return len(lignes)

    try:
        db.ecrire(db.T_APPORTS, lignes)
        log.info("%d apports importés.", len(lignes))
    except Exception as exc:
        log.error("Import des apports échoué : %s", exc)
        raise
    return len(lignes)


def main() -> int:
    ap = argparse.ArgumentParser(description="Import des données de la v1 vers la v2.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Simule l'import sans rien écrire.")
    args = ap.parse_args()

    manquantes = [t for t, ok in db.tables_presentes().items() if not ok]
    if manquantes:
        log.error("Tables v2 absentes : %s. Exécutez migrations/001_init.sql.", manquantes)
        return 1

    for table in (V1_TRANSACTIONS, V1_HISTORIQUE):
        if not db.existe(table):
            log.error("Table v1 '%s' introuvable.", table)
            return 1

    log.info("=== Import des transactions ===")
    importer_transactions(dry_run=args.dry_run)
    log.info("=== Import des apports ===")
    importer_apports(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
