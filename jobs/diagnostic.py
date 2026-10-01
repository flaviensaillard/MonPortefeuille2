"""Diagnostic : qu'y a-t-il réellement dans vos bases ?

POURQUOI CE SCRIPT EXISTE
-------------------------
Deux de vos constats ne peuvent pas se lire dans le code : ils dépendent des
DONNÉES.

1. « Avant, j'avais les performances depuis avril 2023. Là, ça démarre à 2025. »
   — ou bien les valuations de la v1 n'ont pas été importées, ou bien elles
   l'ont été et quelque chose les empêche d'apparaître.

2. « Je n'ai pas fait +26,2 % en 2026, Swissquote me donne +4,10 % en TWR. »
   — 22 points d'écart. Une performance qui compte les versements comme du
   rendement produit exactement ce genre d'écart. La cause la plus probable est
   que vos apports sont enregistrés avec un montant NUL.

Ce script ne devine rien : il compte, il liste, et il conclut. Chaque section
dit ce qu'elle trouve, et à la fin un VERDICT dit quoi faire.

LECTURE SEULE. Aucune écriture, aucune modification. On peut le lancer autant
de fois qu'on veut.
"""

from __future__ import annotations

import datetime as dt
import logging
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import db  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("diagnostic")

# Colonnes que l'import v1 utilise. Si l'une manque sous ce nom exact, l'import
# la lit comme absente — et remplit un zéro au lieu de s'arrêter.
COLONNES_V1_HISTORIQUE = [
    "Date", "Type", "Montant €", "Montant $", "Montant Or",
    "Actifs Stratégiques", "Total Global",
]

verdicts: list[str] = []
# Si la connexion echoue, on ne peut RIEN conclure sur les tables. Sans ce
# drapeau, un probleme d'identifiants se presentait comme « table
# introuvable » — et on partait chercher au mauvais endroit.
connexion_ok = True


def _titre(texte: str) -> None:
    log.info("")
    log.info("=" * 72)
    log.info("%s", texte)
    log.info("=" * 72)


def _compte(df: pd.DataFrame, quoi: str) -> None:
    log.info("  %-34s %s", quoi, "aucune ligne" if df.empty else f"{len(df)} ligne(s)")


def _taux_nuls(df: pd.DataFrame, colonne: str) -> None:
    """Part de valeurs absentes ou vides dans une colonne."""
    if colonne not in df.columns:
        log.info("    %-24s ABSENTE", colonne)
        return
    serie = df[colonne]
    vides = serie.isna() | (serie.astype(str).str.strip().isin(("", "nan", "None")))
    n = int(vides.sum())
    etat = "OK" if n == 0 else f"{n} vide(s)"
    log.info("    %-24s %-10s sur %d", colonne, etat, len(serie))


# ===========================================================================
# 1. Les tables de la v1
# ===========================================================================

def sonder_connexion() -> bool:
    """Vérifie qu'on parle bien à la base AVANT d'interpréter quoi que ce soit.

    Sans cette sonde, un identifiant expiré produisait le verdict « la table
    Transaction est introuvable » — donc vous alliez chercher un problème de
    nom de table alors que le problème était une clé. Un diagnostic qui accuse
    la mauvaise cause coûte plus de temps qu'il n'en fait gagner.
    """
    global connexion_ok
    _titre("0. LA CONNEXION")

    try:
        import supabase  # noqa: F401
    except ImportError:
        connexion_ok = False
        log.info("  Le module « supabase » n'est pas installé.")
        log.info("  -> Dans GitHub Actions : `pip install -r requirements.txt` manque.")
        verdicts.append(
            "Le module Python « supabase » n'est pas installé. Rien ne peut être "
            "lu. C'est un problème d'environnement, pas de données."
        )
        return False

    try:
        url, cle = db._credentials()
    except Exception as exc:
        connexion_ok = False
        log.info("  Identifiants absents : %s", exc)
        verdicts.append(
            "SUPABASE_URL et/ou SUPABASE_KEY sont absents. Dans GitHub : "
            "Settings → Secrets and variables → Actions. Ils doivent exister "
            "sous ces deux noms EXACTS, en majuscules."
        )
        return False

    log.info("  URL : %s", url)
    log.info("  Clé : %s…%s (%d caractères)",
             cle[:6], cle[-4:] if len(cle) > 10 else "", len(cle))

    try:
        db.client().table(db.T_SNAPSHOTS).select("*").limit(1).execute()
    except Exception as exc:
        connexion_ok = False
        log.info("")
        log.info("  ÉCHEC DE CONNEXION : %s", str(exc)[:300])
        verdicts.append(
            f"Impossible de joindre la base : {str(exc)[:200]}. Vérifiez que "
            "SUPABASE_URL est bien l'adresse du projet (elle ressemble à "
            "https://xxxxx.supabase.co) et que la clé est la clé « anon public » "
            "ou « service_role ». Tant que ce point n'est pas réglé, tout le "
            "reste du rapport est vide de sens."
        )
        return False

    log.info("  Connexion établie. ✓")
    return True


def examiner_v1() -> dict:
    _titre("1. LA SOURCE — tables de la v1")
    trouve: dict = {}

    if not connexion_ok:
        log.info("  Sauté : la connexion n'est pas établie.")
        return trouve

    for table in ("Transaction", "Historique"):
        try:
            if not db.existe(table):
                log.info("  %-34s TABLE INTROUVABLE", table)
                verdicts.append(
                    f"La table v1 « {table} » est introuvable. L'import ne peut "
                    "rien faire. Vérifiez son nom exact dans le Supabase de la v1."
                )
                continue
            df = db.client().table(table).select("*").execute()
            df = pd.DataFrame(df.data or [])
            trouve[table] = df
            _compte(df, table)
            log.info("    colonnes : %s", ", ".join(map(str, df.columns)))
        except Exception as exc:
            log.info("  %-34s ERREUR (%s)", table, exc)
            verdicts.append(f"Lecture de la table v1 « {table} » impossible : {exc}")
            continue

    hist = trouve.get("Historique")
    if hist is None or hist.empty:
        return trouve

    # --- Les dates ---
    if "Date" in hist.columns:
        dates = pd.to_datetime(hist["Date"], errors="coerce")
        valides = dates.dropna()
        log.info("")
        log.info("  Dates de l'Historique v1 :")
        if valides.empty:
            log.info("    aucune date exploitable — l'import les rejettera toutes")
            verdicts.append(
                "Aucune date exploitable dans l'Historique v1. Le format est "
                "peut-être jj/mm/aaaa et non aaaa-mm-jj : dites-le-moi, c'est un "
                "correctif d'une ligne."
            )
        else:
            log.info("    de %s à %s", valides.min().date(), valides.max().date())
            par_an = valides.dt.year.value_counts().sort_index()
            for annee, n in par_an.items():
                log.info("      %s : %d ligne(s)", annee, n)

    # --- Les valuations contre les mouvements de trésorerie ---
    log.info("")
    log.info("  Répartition par type :")
    if "Type" in hist.columns:
        types = hist["Type"].astype(str).str.strip().str.lower()
        vide = hist["Type"].isna() | types.isin(("", "nan", "none"))
        mouvements = hist["Type"].notna() & types.isin(("ajout", "retrait", "apport"))
        n_val = int(vide.sum())
        n_mvt = int(mouvements.sum())
        log.info("    valuations (Type vide)      : %d", n_val)
        log.info("    mouvements (Ajout/Retrait)  : %d", n_mvt)
        log.info("    autres types                : %d", len(hist) - n_val - n_mvt)
        if n_val == 0:
            verdicts.append(
                "Aucune LIGNE DE VALORISATION dans l'Historique v1 : toutes les "
                "lignes portent un Type. Sans valuation, il n'y a pas "
                "d'historique de performance à importer."
            )
        if n_mvt == 0:
            verdicts.append(
                "Aucun mouvement de trésorerie (Ajout/Retrait) dans l'Historique "
                "v1 : c'est peut-être normal, mais sans apports enregistrés la "
                "performance ne peut pas être corrigée des versements."
            )
    else:
        log.info("    colonne « Type » ABSENTE")

    # --- Les colonnes de montants : le point le plus important ---
    log.info("")
    log.info("  Colonnes utilisées par l'import (celles qui comptent) :")
    for colonne in COLONNES_V1_HISTORIQUE:
        _taux_nuls(hist, colonne)

    # --- Le piège : une colonne absente donne un zéro silencieux ---
    manquantes = [c for c in COLONNES_V1_HISTORIQUE if c not in hist.columns]
    if manquantes:
        log.info("")
        log.info("  ⚠️  COLONNES ABSENTES : %s", ", ".join(manquantes))
        verdicts.append(
            f"Colonnes attendues par l'import et ABSENTES de la v1 : "
            f"{', '.join(manquantes)}. L'import les lit comme vides et écrit un "
            "ZÉRO au lieu de s'arrêter. C'est ainsi qu'on obtient des apports à "
            "0 €, donc un TWR qui compte vos versements comme du rendement."
        )

    return trouve


# ===========================================================================
# 2. Les tables de la v2
# ===========================================================================

def examiner_v2() -> None:
    _titre("2. LA DESTINATION — tables de la v2")
    if not connexion_ok:
        log.info("  Sauté : la connexion n'est pas établie.")
        return

    for nom, table in (
        ("transactions", db.T_TRANSACTIONS),
        ("apports", db.T_APPORTS),
        ("snapshots", db.T_SNAPSHOTS),
        ("inflation", db.T_INFLATION),
    ):
        try:
            df = db.lire(table)
        except Exception as exc:
            log.info("  %-34s ERREUR (%s)", nom, exc)
            continue
        _compte(df, nom)

        if df.empty:
            continue

        if "date" in df.columns:
            dates = pd.to_datetime(df["date"], errors="coerce").dropna()
            if not dates.empty:
                log.info("    de %s à %s", dates.min().date(), dates.max().date())
                par_an = dates.dt.year.value_counts().sort_index()
                log.info("    par année : %s",
                         ", ".join(f"{a}:{n}" for a, n in par_an.items()))

    # --- Les apports : le cœur du problème de performance ---
    _titre("3. VOS APPORTS — c'est eux qui décident si la performance est juste")

    try:
        apports = db.lire(db.T_APPORTS)
    except Exception as exc:
        log.info("  Lecture impossible : %s", exc)
        return

    if apports.empty:
        log.info("  AUCUN apport enregistré.")
        verdicts.append(
            "La table pf2_apports est VIDE. Sans apports, le TWR ne peut pas "
            "neutraliser vos versements : il affiche votre épargne comme du "
            "rendement. C'est la cause la plus probable de l'écart avec "
            "Swissquote. Lancez « Import des données v1 » avec dry_run = false."
        )
        return

    if "montant_eur" in apports.columns:
        montants = pd.to_numeric(apports["montant_eur"], errors="coerce")
        n_zero = int((montants.fillna(0) == 0).sum())
        n_nan = int(montants.isna().sum())
        total = float(montants.fillna(0).sum())

        log.info("  Nombre d'apports   : %d", len(apports))
        log.info("  Montant total      : %s €", f"{total:,.2f}".replace(",", " "))
        log.info("  Apports à ZÉRO     : %d", n_zero)
        log.info("  Montants illisibles: %d", n_nan)

        if n_zero == len(apports):
            log.info("")
            log.info("  ⚠️  TOUS LES APPORTS SONT À ZÉRO.")
            verdicts.append(
                "TOUS vos apports sont enregistrés à 0 €. La performance les "
                "compte donc comme du rendement — c'est exactement l'écart que "
                "vous constatez avec Swissquote. La cause est presque toujours "
                "une colonne de montant mal nommée côté v1. Voyez la section 1."
            )
        elif n_zero:
            verdicts.append(
                f"{n_zero} apport(s) sur {len(apports)} sont à 0 €. Ces "
                "versements-là comptent comme du rendement."
            )

        if "date" in apports.columns:
            par_an = pd.to_datetime(apports["date"], errors="coerce").dt.year
            log.info("")
            log.info("  Apports par année :")
            for annee, groupe in apports.assign(_a=par_an).groupby("_a"):
                m = pd.to_numeric(groupe["montant_eur"], errors="coerce").fillna(0).sum()
                log.info("    %s : %2d apport(s), %s €",
                         int(annee) if pd.notna(annee) else "?",
                         len(groupe), f"{m:,.2f}".replace(",", " "))

    # --- Les snapshots : l'historique ---
    _titre("4. VOTRE HISTORIQUE — c'est lui qui décide depuis quand on mesure")

    try:
        snaps = db.lire(db.T_SNAPSHOTS)
    except Exception as exc:
        log.info("  Lecture impossible : %s", exc)
        return

    if snaps.empty:
        log.info("  AUCUN snapshot.")
        verdicts.append("La table pf2_snapshots est vide : aucune performance n'est calculable.")
        return

    if "date" in snaps.columns:
        dates = pd.to_datetime(snaps["date"], errors="coerce").dropna()
        log.info("  Premier snapshot : %s", dates.min().date())
        log.info("  Dernier snapshot : %s", dates.max().date())
        par_an = dates.dt.year.value_counts().sort_index()
        log.info("")
        log.info("  Snapshots par année :")
        for annee, n in par_an.items():
            log.info("    %s : %d", annee, n)

        amax = int(dates.dt.year.max())
        if amax < dt.date.today().year:
            verdicts.append(
                f"Le dernier snapshot date de {amax}. Le robot quotidien ne "
                "tourne plus : vérifiez l'onglet Actions du dépôt."
            )

        if "equivalent_or_oz" in snaps.columns:
            oz = pd.to_numeric(snaps["equivalent_or_oz"], errors="coerce")
            n_vides = int(oz.isna().sum() + (oz <= 0).sum())
            log.info("")
            log.info("  Équivalent-or renseigné : %d / %d", len(snaps) - n_vides, len(snaps))
            if n_vides == len(snaps):
                verdicts.append(
                    "Aucun snapshot ne porte d'équivalent-or. La performance en "
                    "or — l'étalon de Gave — n'est pas calculable sur la "
                    "période. Lancez « Reconstitution de l'historique »."
                )

        prem = dates.min().date()
        if prem > dt.date(2023, 6, 1):
            verdicts.append(
                f"Votre historique DÉMARRE au {prem}, alors que votre "
                "portefeuille existe depuis avril 2023. Les valuations "
                "mensuelles de la v1 n'ont pas été importées. Lancez « Import "
                "des données v1 » avec dry_run = false."
            )

    # --- L'inflation ---
    _titre("5. L'INFLATION")

    try:
        infl = db.inflation()
    except Exception as exc:
        log.info("  Lecture impossible : %s", exc)
        return

    if infl.empty:
        log.info("  Table vide — lancez le robot quotidien (il s'en occupe seul).")
        verdicts.append(
            "La table pf2_inflation est vide. Le robot quotidien la remplit "
            "depuis l'INSEE à chaque passage ; si elle reste vide, l'onglet "
            "Actions doit montrer une erreur."
        )
    else:
        log.info("  %d année(s) :", len(infl))
        for _, r in infl.sort_values("Annee").iterrows():
            source = str(r.get("source", ""))
            marque = " [provisoire]" if "provisoire" in source else ""
            log.info("    %s : %+.2f %%%s", int(r["Annee"]), float(r["Inflation"]), marque)


# ===========================================================================
# Verdict
# ===========================================================================

def conclure() -> None:
    _titre("VERDICT")
    if not verdicts:
        log.info("  Rien d'anormal. Historique, apports et inflation sont en place.")
        return
    for i, v in enumerate(verdicts, 1):
        log.info("")
        log.info("  %d. %s", i, v)
    log.info("")


def resume_a_envoyer(
    v1: dict, etat: dict, apports: pd.DataFrame, snaps: pd.DataFrame, infl: pd.DataFrame
) -> None:
    """Un bloc court, en une seule pièce, à copier-coller.

    Le rapport complet fait plusieurs centaines de lignes. Personne n'a envie
    de le recopier, et une capture d'écran perd les chiffres. Ce bloc contient
    tout ce dont j'ai besoin pour trancher, et rien d'autre.
    """
    _titre("À COPIER-COLLER (le journal complet ne sert que si je le demande)")

    lignes = [f"DIAGNOSTIC {dt.date.today().isoformat()}",
              f"connexion={'ok' if connexion_ok else 'ECHEC'}"]

    if not connexion_ok:
        lignes.append("-> rien d'autre n'a pu etre lu")
        for l in lignes:
            log.info("  %s", l)
        return

    # --- source v1 ---
    hist = v1.get("Historique")
    if hist is not None and not hist.empty:
        d = pd.to_datetime(hist.get("Date"), errors="coerce").dropna()
        lignes.append(
            f"v1.Historique: {len(hist)} lignes, "
            f"{d.min().date() if not d.empty else '?'} -> "
            f"{d.max().date() if not d.empty else '?'}"
        )
        types = hist["Type"].astype(str).str.strip().str.lower() if "Type" in hist.columns else None
        if types is not None:
            n_val = int((hist["Type"].isna() | types.isin(("", "nan"))).sum())
            n_mvt = int((hist["Type"].notna() & types.isin(("ajout", "retrait", "apport"))).sum())
            lignes.append(f"v1.Historique: {n_val} valuations, {n_mvt} mouvements")
        lignes.append("v1.Historique colonnes: " + "|".join(map(str, hist.columns)))
        for c in COLONNES_V1_HISTORIQUE:
            if c not in hist.columns:
                lignes.append(f"  MANQUE: {c}")
            else:
                serie = hist[c]
                vides = int((serie.isna() | serie.astype(str).str.strip().isin(("", "nan", "None"))).sum())
                if vides:
                    lignes.append(f"  VIDE: {c} x{vides}")
    else:
        lignes.append("v1.Historique: ABSENTE ou VIDE")

    tr = v1.get("Transaction")
    lignes.append(f"v1.Transaction: {'ABSENTE' if tr is None or tr.empty else str(len(tr)) + ' lignes'}")

    # --- destination v2 ---
    for nom in ("transactions", "apports", "snapshots", "inflation"):
        df = etat.get(nom)
        if df is None or df.empty:
            lignes.append(f"v2.{nom}: VIDE")
            continue
        if "date" in df.columns:
            d = pd.to_datetime(df["date"], errors="coerce").dropna()
            lignes.append(f"v2.{nom}: {len(df)} lignes, {d.min().date()} -> {d.max().date()}")
        elif "annee" in df.columns:
            lignes.append(f"v2.{nom}: {len(df)} lignes, annees "
                          f"{df['annee'].min()}-{df['annee'].max()}")
        else:
            lignes.append(f"v2.{nom}: {len(df)} lignes")

    if not snaps.empty and "equivalent_or_oz" in snaps.columns:
        oz = pd.to_numeric(snaps["equivalent_or_oz"], errors="coerce")
        lignes.append(f"v2.snapshots equivalent_or_oz vides: {int(oz.isna().sum())}/{len(snaps)}")

    if not apports.empty and "montant_eur" in apports.columns:
        m = pd.to_numeric(apports["montant_eur"], errors="coerce").fillna(0)
        lignes.append(f"v2.apports: {len(apports)} lignes, total {m.sum():.2f} EUR, "
                      f"{int((m == 0).sum())} a zero")
        if "date" in apports.columns:
            par_an = pd.to_datetime(apports["date"], errors="coerce").dt.year
            detail = ", ".join(
                f"{int(a)}:{(pd.to_numeric(g['montant_eur'], errors='coerce').fillna(0) != 0).sum()}/{len(g)}"
                for a, g in apports.assign(_a=par_an).groupby("_a")
            )
            lignes.append(f"  non-nuls par annee: {detail}")

    lignes.append(f"VERDICT_COUNT={len(verdicts)}")
    for i, v in enumerate(verdicts, 1):
        lignes.append(f"  {i}. {v[:220]}")

    for l in lignes:
        log.info("  %s", l)


def main() -> int:
    log.info("Diagnostic du portefeuille — %s (lecture seule)",
             dt.datetime.now().strftime("%d/%m/%Y %H:%M"))

    etat: dict = {}
    apports = snaps = infl = pd.DataFrame()

    try:
        sonder_connexion()
        v1 = examiner_v1()
        examiner_v2()

        if connexion_ok:
            for nom, table in (("transactions", db.T_TRANSACTIONS),
                               ("apports", db.T_APPORTS),
                               ("snapshots", db.T_SNAPSHOTS)):
                try:
                    etat[nom] = db.lire(table)
                except Exception:
                    etat[nom] = pd.DataFrame()
            try:
                infl = db.inflation()
                etat["inflation"] = infl
            except Exception as exc:
                log.info("  Inflation illisible : %s", exc)
                infl = pd.DataFrame()
            apports = etat.get("apports", pd.DataFrame())
            snaps = etat.get("snapshots", pd.DataFrame())

        conclure()
        resume_a_envoyer(v1, etat, apports, snaps, infl)
    except Exception as exc:
        log.error("Diagnostic interrompu : %s", exc)
        conclure()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
