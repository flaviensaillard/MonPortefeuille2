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
from core.portfolio import DEVISES_COTATION  # noqa: E402

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
        row_date = r["Date"]

        quantite = float(r["Quantité"])
        cours = float(r["Cours"])
        frais = float(r["Frais"]) if pd.notna(r.get("Frais")) else 0.0

        # --- Devise : la saisie de l'utilisateur fait autorité -----------------
        # `DEVISES_COTATION` ne connaît qu'une dizaine de tickers et renvoyait
        # "USD" par défaut. Conséquence : tout titre européen absent de la table
        # (ASML, MC.PA, SAP.DE...) était réétiqueté en USD, avec un cours en
        # euro lu comme un cours en dollar. La valorisation de la ligne était
        # alors fausse, et l'allocation avec elle.
        #
        # La règle est donc : ce que vous avez saisi dans la v1 est la vérité —
        # c'est ce que dit votre relevé. La table ne sert que de repli quand la
        # v1 a laissé la devise vide. Et si on ne sait pas, on n'invente pas :
        # la ligne est écartée et signalée, plutôt qu'importée avec une devise
        # devinée.
        devise_connue = DEVISES_COTATION.get(ticker)
        if devise_saisie:
            devise = devise_saisie
            if devise_connue and devise_connue != devise_saisie:
                # Incohérence réelle (cas XJSE.SW dans la v1). On NE reconvertit
                # PAS le cours : on n'a pas de taux fiable dans la ligne, et un
                # taux inventé fausserait le PRU. On importe tel quel et on
                # signale, pour que vous tranchiez sur votre relevé.
                corrections.append(
                    f"{ticker} {r['Date']} : saisi en {devise_saisie}, coté "
                    f"habituellement en {devise_connue} — importé TEL QUEL, "
                    f"cours {cours} non converti, À VÉRIFIER DANS VOTRE RELEVÉ"
                )
                log.warning(
                    "  %s %s : devise saisie %s, cotation habituelle %s — "
                    "aucune conversion appliquée, ligne à vérifier.",
                    ticker, r["Date"], devise_saisie, devise_connue,
                )
        elif devise_connue:
            devise = devise_connue
        else:
            corrections.append(
                f"{ticker} {r['Date']} : devise absente dans la v1 et ticker "
                f"inconnu de la table de cotation — ligne NON importée. "
                f"Ajoutez {ticker} à DEVISES_COTATION ou ressaisissez la ligne."
            )
            log.error(
                "  %s %s : devise indéterminable, ligne écartée.", ticker, r["Date"]
            )
            continue

        d = pd.to_datetime(row_date, dayfirst=True, errors="coerce", format="mixed")
        if pd.isna(d):
            corrections.append(f"{ticker} : date illisible ({r['Date']!r}), ignoré")
            continue

        # `montant_net` n'est PAS stocké : c'est une valeur dérivée
        # (quantite x cours, frais inclus), recalculée à la lecture par
        # `charger_transactions()`. La table pf2_transactions n'a pas cette
        # colonne, et l'envoyer faisait échouer l'import avec
        # `PGRST204: Could not find the 'montant_net' column`.
        lignes.append({
            "ticker": ticker,
            "sens": sens,
            "date": d.date().isoformat(),
            "quantite": quantite,
            "cours": cours,
            "frais": frais,
            "devise": devise,
            "source": "import_v1",
            "reference": f"v1:id{r.get('id')}",
        })

    if corrections:
        log.warning("%d ligne(s) à vérifier :", len(corrections))
        for c in corrections:
            log.warning("  - %s", c)

    if dry_run:
        log.info("[dry-run] %d transactions seraient importées.", len(lignes))
        return len(lignes), corrections

    if not lignes:
        # Rien à écrire : on n'envoie pas une requête vide à PostgREST.
        log.warning("Aucune transaction importable.")
        return 0, corrections

    try:
        # Upsert sur l'index unique : relancer l'import ne crée pas de doublons.
        db.remplacer(
            db.T_TRANSACTIONS, lignes,
            on_conflict="ticker,sens,date,quantite,cours",
        )
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

    # Idempotence : on repart d'une base propre pour les lignes issues de la v1.
    # La table pf2_apports n'a pas de contrainte d'unicité exploitable en upsert.
    try:
        db.client().table(db.T_APPORTS).delete().eq("compte", "import_v1").execute()
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
