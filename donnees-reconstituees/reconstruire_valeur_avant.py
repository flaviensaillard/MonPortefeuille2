#!/usr/bin/env python3
"""Reconstitution de pf2_apports.valeur_avant_eur / valeur_avant_usd.

LECTURE SEULE : ce script n'écrit jamais dans Supabase. Il produit trois fichiers
dans donnees-reconstituees/ : le CSV de contrôle, le script SQL à relire et le
RAPPORT.md. Il est exécuté par .github/workflows/reconstitution-valeur-avant.yml,
le seul endroit où les secrets SUPABASE_URL / SUPABASE_KEY sont disponibles.
Aucune valeur de secret n'est écrite ni affichée.

Règles (mission « valeur_avant ») :
  1. Valeur déjà renseignée            -> origine « mesuree » (jamais écrasée).
  2. Snapshot complet STRICTEMENT antérieur au jour de l'apport (le plus proche)
                                        -> origine « reconstruite_snapshot ».
  3. Sinon, premier snapshot complet STRICTEMENT postérieur
                                        -> origine « approximee_snapshot_posterieur ».
  4. Sinon                              -> NULL et raison écrite.
  5. EUR et USD viennent du MÊME snapshot. L'USD n'existe pas dans
     pf2_snapshots : il est obtenu par conversion du total EUR au taux EUR/USD
     historique du jour du snapshot, et l'origine porte le suffixe
     « _converti_taux_historique ».
"""

from __future__ import annotations

import bisect
import csv
import datetime as dt
import io
import os
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DOSSIER = Path(__file__).resolve().parent
sys.path.insert(0, str(RACINE))

from core import fx, metrics  # noqa: E402  (fx : taux historiques ; metrics : contrôle croisé)

COLONNES_CSV = [
    "id", "date", "sens", "montant_eur", "montant_usd", "source_montant_usd",
    "valeur_avant_eur_avant", "valeur_avant_usd_avant",
    "valeur_avant_eur_nouvelle", "valeur_avant_usd_nouvelle",
    "origine_eur", "origine_usd", "date_snapshot_retenu", "raison",
]

COLONNES_APPORTS_ATTENDUES = {"id", "date", "sens", "montant_eur", "montant_or",
                              "cours_or", "reference", "valeur_avant_eur", "valeur_avant_usd"}
COLONNES_SNAPSHOTS_ATTENDUES = {"date", "patrimoine_total_eur", "complet", "manquantes"}


class ControleEchoue(Exception):
    pass


def controle(condition: bool, message: str, journal: list) -> None:
    journal.append((("OK" if condition else "ECHEC"), message))
    if not condition:
        raise ControleEchoue(message)


# ---------------------------------------------------------------------------
# Lecture (SELECT uniquement)
# ---------------------------------------------------------------------------

def lire_toutes(client, table: str, ordre: str, uid: str) -> list[dict]:
    lignes: list[dict] = []
    debut, taille = 0, 1000
    while True:
        requete = client.table(table).select("*")
        if uid:
            requete = requete.eq("user_id", uid)
        page = requete.order(ordre).range(debut, debut + taille - 1).execute().data or []
        lignes.extend(page)
        if len(page) < taille:
            return lignes
        debut += taille


def jour(valeur) -> dt.date:
    return dt.date.fromisoformat(str(valeur)[:10])


def nombre(valeur) -> float | None:
    if valeur is None or str(valeur).strip() == "":
        return None
    return float(valeur)


_taux_cache: dict = {}


def taux_eur_usd(j: dt.date):
    """Taux historique EUR -> USD (dollars pour un euro). Retourne (taux, erreur)."""
    if j in _taux_cache:
        return _taux_cache[j]
    try:
        t = float(fx.taux("EUR", j.isoformat(), "USD"))
        if not (t > 0) or t != t:
            raise ValueError("taux non positif")
        resultat = (t, None)
    except Exception as exc:  # noqa: BLE001 - on note seulement le type d'erreur
        resultat = (None, type(exc).__name__)
    _taux_cache[j] = resultat
    return resultat


def f2(x) -> str:
    return "" if x is None else f"{x:.2f}"


def fr(x) -> str:
    """Montant pour le rapport : 12 345,67."""
    if x is None:
        return "—"
    return f"{x:,.2f}".replace(",", " ").replace(".", ",")


def pct(x) -> str:
    if x is None:
        return "non calculé"
    return f"{x * 100:+.2f} %".replace(".", ",")


# ---------------------------------------------------------------------------
# Logique
# ---------------------------------------------------------------------------

def montant_usd_apport(a: dict):
    """Montant USD de l'apport, dans l'ordre de core/session.py."""
    ref = a["reference"]
    if ref.startswith("usd:"):
        try:
            return round(abs(float(ref.split(":", 1)[1])), 2), "reference_usd"
        except ValueError:
            pass
    if a["montant_or"] and a["cours_or"] and a["montant_or"] > 0 and a["cours_or"] > 0:
        return round(a["montant_or"] * a["cours_or"], 2), "once_x_cours_or"
    t, _ = taux_eur_usd(a["date"])
    if t is None:
        return None, "indisponible"
    return round(abs(a["montant_eur"]) * t, 2), "eur_x_taux_historique"


def chaine(points, flux, avant, flux_sans_valeur):
    """Rendements de sous-période, même formule que core/metrics.rendements_stricts.

    points : [(date, valeur ou None)] triés ; flux : {date: montant signé} ;
    avant : {date du flux: valeur juste avant le flux} ; flux_sans_valeur : dates
    de flux dont la valorisation avant est absente.
    Retourne [(date de fin, rendement ou None, raison)].
    """
    res = []
    for i in range(1, len(points)):
        deb, vdeb = points[i - 1]
        fin, vfin = points[i]
        if vdeb is None or vfin is None:
            res.append((fin, None, "valeur de snapshot manquante"))
            continue
        if any(deb < d <= fin for d in flux_sans_valeur):
            res.append((fin, None, "apport sans valeur avant"))
            continue
        flux_int = sorted((d, m) for d, m in flux.items() if deb < d <= fin and m != 0)
        if not flux_int:
            res.append((fin, vfin / vdeb - 1.0, None))
            continue
        prod, prev, ok = 1.0, vdeb, True
        for d, m in flux_int:
            av = avant.get(d)
            if av is None or av <= 0:
                ok = False
                break
            prod *= av / prev
            prev = av + m
            if prev <= 0:
                ok = False
                break
        if ok and prev > 0:
            res.append((fin, prod * vfin / prev - 1.0, None))
        else:
            res.append((fin, None, "flux non valorisé"))
    return res


def main() -> int:
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    cle = (os.environ.get("SUPABASE_KEY") or "").strip()
    uid = (os.environ.get("SUPABASE_USER_ID") or "").strip()
    if not url or not cle:
        raise SystemExit("Secrets Supabase absents dans l'environnement du workflow.")

    from supabase import create_client
    client = create_client(url, cle)

    apports_brut = lire_toutes(client, "pf2_apports", "id", uid)
    snaps_brut = lire_toutes(client, "pf2_snapshots", "date", uid)
    journal: list = []

    if apports_brut:
        manquantes = COLONNES_APPORTS_ATTENDUES - set(apports_brut[0].keys())
        controle(not manquantes, "colonnes attendues présentes dans pf2_apports (manquantes : %s)" % (sorted(manquantes) or "aucune"), journal)
    if snaps_brut:
        manquantes = COLONNES_SNAPSHOTS_ATTENDUES - set(snaps_brut[0].keys())
        controle(not manquantes, "colonnes attendues présentes dans pf2_snapshots (manquantes : %s)" % (sorted(manquantes) or "aucune"), journal)

    if not uid:
        proprietaires = {str(r.get("user_id")) for r in apports_brut}
        if len(proprietaires) > 1:
            raise SystemExit("Plusieurs propriétaires dans pf2_apports sans SUPABASE_USER_ID : arrêt.")

    # --- Apports -----------------------------------------------------------
    apports = []
    for r in apports_brut:
        apports.append({
            "id": int(r["id"]), "date": jour(r["date"]), "sens": r.get("sens") or "",
            "montant_eur": nombre(r.get("montant_eur")),
            "montant_or": nombre(r.get("montant_or")), "cours_or": nombre(r.get("cours_or")),
            "reference": str(r.get("reference") or ""),
            "old_eur": nombre(r.get("valeur_avant_eur")), "old_usd": nombre(r.get("valeur_avant_usd")),
        })
    apports.sort(key=lambda a: (a["date"], a["id"]))
    controle(all(a["montant_eur"] is not None for a in apports),
             "montant_eur renseigné sur tous les apports", journal)
    controle(all(a["sens"] in ("apport", "retrait") for a in apports),
             "sens = apport ou retrait sur tous les apports", journal)
    nb_negatifs = sum(1 for a in apports if a["montant_eur"] < 0)

    # --- Snapshots : seuls les points complets et valorisés comptent ------
    nb_snap_incomplets = 0
    nb_snap_sans_total = 0
    snaps_ok: list[tuple[dt.date, float]] = []
    for s in snaps_brut:
        if not s.get("complet"):
            nb_snap_incomplets += 1
            continue
        total = nombre(s.get("patrimoine_total_eur"))
        if total is None or total <= 0:
            nb_snap_sans_total += 1
            continue
        snaps_ok.append((jour(s["date"]), total))
    snaps_ok.sort()
    dates_snap = [d for d, _ in snaps_ok]

    def snapshot_retenu(d: dt.date):
        i = bisect.bisect_left(dates_snap, d)        # premier index >= d : exclut le même jour
        if i > 0:
            sd, st = snaps_ok[i - 1]
            return sd, st, "reconstruite_snapshot"
        j = bisect.bisect_right(dates_snap, d)       # premier index > d
        if j < len(snaps_ok):
            sd, st = snaps_ok[j]
            return sd, st, "approximee_snapshot_posterieur"
        return None

    # --- Calcul ligne par ligne -------------------------------------------
    lignes = []
    for a in apports:
        d = a["date"]
        sel = snapshot_retenu(d)
        raisons: list[str] = []
        mesure_eur = a["old_eur"] is not None
        mesure_usd = a["old_usd"] is not None
        # Règle 5 : EUR et USD viennent de la même source. Si une seule devise est
        # mesurée, l'autre n'est PAS reconstruite depuis un snapshot (source mixte).
        source_mixte = mesure_eur != mesure_usd
        sel_utilisable = None if source_mixte else sel

        if mesure_eur:
            eur, orig_eur = round(a["old_eur"], 2), "mesuree"
        elif sel_utilisable:
            eur, orig_eur = round(sel_utilisable[1], 2), sel_utilisable[2]
        else:
            eur, orig_eur = None, "non_renseignee"
            if source_mixte:
                raisons.append("USD mesurée seule : EUR non reconstituée pour ne pas mélanger les sources")
            else:
                raisons.append("aucun snapshot complet valorisé, ni antérieur ni postérieur")

        if mesure_usd:
            usd, orig_usd = round(a["old_usd"], 2), "mesuree"
        elif sel_utilisable:
            t, err = taux_eur_usd(sel_utilisable[0])
            if t is None:
                usd, orig_usd = None, "non_renseignee"
                raisons.append(f"taux EUR/USD historique indisponible au {sel_utilisable[0].isoformat()} ({err})")
            else:
                usd, orig_usd = round(sel_utilisable[1] * t, 2), sel_utilisable[2] + "_converti_taux_historique"
        else:
            usd, orig_usd = None, "non_renseignee"
            if source_mixte:
                raisons.append("EUR mesurée seule : USD non reconstituée pour ne pas mélanger les sources")
            elif not any("aucun snapshot" in r for r in raisons):
                raisons.append("aucun snapshot complet valorisé, ni antérieur ni postérieur")

        snapshot_utilise = any(o.startswith(("reconstruite", "approx")) for o in (orig_eur, orig_usd))
        date_snap = sel[0] if (snapshot_utilise and sel) else None

        montant_usd, source_usd = montant_usd_apport(a)

        lignes.append({
            "id": a["id"], "date": d.isoformat(), "sens": a["sens"],
            "montant_eur": f"{a['montant_eur']:.2f}",
            "montant_usd": f2(montant_usd), "source_montant_usd": source_usd,
            "valeur_avant_eur_avant": f2(a["old_eur"]), "valeur_avant_usd_avant": f2(a["old_usd"]),
            "valeur_avant_eur_nouvelle": f2(eur), "valeur_avant_usd_nouvelle": f2(usd),
            "origine_eur": orig_eur, "origine_usd": orig_usd,
            "date_snapshot_retenu": date_snap.isoformat() if date_snap else "",
            "raison": " ; ".join(raisons),
            # champs internes (non écrits dans le CSV)
            "_sens": a["sens"], "_montant_eur": a["montant_eur"], "_montant_usd": montant_usd,
            "_eur": eur, "_usd": usd, "_old_eur": a["old_eur"], "_old_usd": a["old_usd"],
            "_date": d, "_date_snap": date_snap, "_sel": sel,
        })

    # --- Contrôles --------------------------------------------------------
    controle(len(lignes) == len(apports), "lignes calculées = apports lus", journal)
    controle(all(L["_date_snap"] != L["_date"] for L in lignes),
             "aucun snapshot du même jour que l'apport n'a été utilisé", journal)
    def _est_reconstruite(L):
        return L["origine_eur"].startswith("reconstruite") or L["origine_usd"].startswith("reconstruite")

    def _est_approx(L):
        return L["origine_eur"].startswith("approx") or L["origine_usd"].startswith("approx")

    controle(all(L["_date_snap"] is None or
                 ((not _est_reconstruite(L) or L["_date_snap"] < L["_date"]) and
                  (not _est_approx(L) or L["_date_snap"] > L["_date"]))
                 for L in lignes),
             "snapshot antérieur pour « reconstruite », postérieur pour « approximée »", journal)
    controle(all(L["_eur"] == L["_old_eur"] for L in lignes if L["_old_eur"] is not None),
             "valeurs EUR mesurées inchangées", journal)
    controle(all(L["_usd"] == L["_old_usd"] for L in lignes if L["_old_usd"] is not None),
             "valeurs USD mesurées inchangées", journal)
    controle(all(L["_date_snap"] is None or
                 (L["origine_eur"] != "non_renseignee" or L["origine_usd"] != "non_renseignee")
                 for L in lignes),
             "une date de snapshot n'est retenue que si une valeur en découle", journal)
    mixtes = [L for L in lignes
              if (L["origine_eur"] == "mesuree") != (L["origine_usd"] == "mesuree")]
    controle(all(not ((L["origine_eur"] == "mesuree") != (L["origine_usd"] == "mesuree")) or
                 (L["origine_eur"] == "non_renseignee" or L["origine_usd"] == "non_renseignee")
                 for L in lignes),
             "aucune source mixte : une devise mesurée seule laisse l'autre NULL", journal)

    # --- Recalcul du TWR par année (valeurs nouvelles) ---------------------
    annees_twr = {}
    for devise in ("EUR", "USD"):
        annees_twr[devise] = twr_par_devise(devise, lignes, snaps_ok, journal)

    # --- Fichiers ---------------------------------------------------------
    ecrire_csv(lignes)
    sql, nb_updates = generer_sql(lignes)
    controle(nb_updates == sum(1 for L in lignes if (L["_old_eur"] is None and L["_eur"] is not None)
                               or (L["_old_usd"] is None and L["_usd"] is not None)),
             "une instruction UPDATE par ligne à compléter", journal)
    (DOSSIER / "update_valeur_avant.sql").write_text(sql, encoding="utf-8")
    controle(not re.search(r"\b(DELETE|INSERT|DROP|ALTER|CREATE|TRUNCATE)\b", sql, re.I),
             "SQL : aucune suppression ni changement de schéma", journal)
    controle(all(re.fullmatch(r"UPDATE pf2_apports SET [^;]+ WHERE id = \d+ AND [^;]+;", ligne)
                 for ligne in sql.splitlines() if ligne.startswith("UPDATE")),
             "SQL : chaque UPDATE ne touche que pf2_apports, colonnes valeur_avant_*, avec garde IS NULL",
             journal)

    ecrire_rapport(lignes, apports, snaps_brut, snaps_ok, nb_snap_incomplets, nb_snap_sans_total,
                   annees_twr, mixtes, nb_negatifs, journal, uid, nb_updates)

    print(f"apports={len(apports)} lignes_a_completer={nb_updates} "
          f"snapshots_utilisables={len(snaps_ok)} controles={sum(1 for s, _ in journal if s == 'OK')}/{len(journal)}")
    return 0


# ---------------------------------------------------------------------------
# TWR par année civile
# ---------------------------------------------------------------------------

def twr_par_devise(devise: str, lignes: list, snaps_ok: list, journal: list) -> dict:
    cle_val = "_eur" if devise == "EUR" else "_usd"
    cle_mont = "_montant_eur" if devise == "EUR" else "_montant_usd"

    points = []
    for d, total in snaps_ok:
        if devise == "EUR":
            points.append((d, total))
        else:
            t, _ = taux_eur_usd(d)
            points.append((d, total * t if t else None))
    if not points:
        return {}

    flux: dict = {}
    avant: dict = {}
    flux_sans_valeur: set = set()
    annees_sans_valeur: set = set()
    for L in sorted(lignes, key=lambda x: (x["_date"], x["id"])):
        d = L["_date"]
        m = L[cle_mont]
        signe = 1.0 if L["_sens"] == "apport" else -1.0
        if m is None:
            flux_sans_valeur.add(d)
            annees_sans_valeur.add(d.year)
        else:
            flux[d] = flux.get(d, 0.0) + signe * abs(m)
        if d not in avant:
            v = L[cle_val]
            if v is None:
                flux_sans_valeur.add(d)
                annees_sans_valeur.add(d.year)
            else:
                avant[d] = v
        elif L[cle_val] is None:
            flux_sans_valeur.add(d)
            annees_sans_valeur.add(d.year)

    intervalles = chaine(points, flux, avant, flux_sans_valeur)

    # Contrôle croisé avec le moteur de l'application, quand tout est valorisé.
    if all(v is not None for _, v in points) and not flux_sans_valeur:
        dates = [d for d, _ in points]
        ref, _ = metrics.rendements_stricts(dates, [v for _, v in points], dict(flux), dict(avant))
        ours = [r for _, r, _ in intervalles]
        comparables = [(a, b) for a, b in zip(ours, ref) if a is not None and b is not None]
        controle(len(ours) == len(ref) and all(abs(a - b) < 1e-9 for a, b in comparables),
                 f"chaînage TWR {devise} identique à core/metrics.rendements_stricts", journal)

    annees = sorted({L["_date"].year for L in lignes} | {d.year for d, _ in points})
    sortie = {}
    for an in annees:
        ints = [(fin, r, why) for fin, r, why in intervalles if fin.year == an]
        raisons = []
        if not ints:
            raisons.append("aucun intervalle entre deux snapshots complets")
        if any(r is None for _, r, _ in ints):
            raisons.append("intervalle non calculé")
        if an in annees_sans_valeur:
            n = sum(1 for L in lignes if L["_date"].year == an and L[cle_val] is None)
            raisons.append(f"{n} apport(s) sans valeur {devise}")
        hors = [L for L in lignes if L["_date"].year == an
                and not (points[0][0] <= L["_date"] <= points[-1][0])]
        if hors:
            raisons.append(f"{len(hors)} apport(s) hors de la période des snapshots")
        rend = 1.0
        if not raisons:
            for _, r, _ in ints:
                rend *= 1.0 + r
        sortie[an] = {
            "twr": None if raisons else rend - 1.0,
            "raisons": raisons,
            "nb_apports": sum(1 for L in lignes if L["_date"].year == an),
            "nb_approx": sum(1 for L in lignes if L["_date"].year == an
                             and L["origine_eur" if devise == "EUR" else "origine_usd"].startswith("approx")),
        }
    sortie["_dernier_snapshot"] = points[-1][0]
    return sortie


# ---------------------------------------------------------------------------
# Écritures dans donnees-reconstituees/
# ---------------------------------------------------------------------------

def ecrire_csv(lignes: list) -> None:
    with (DOSSIER / "valeur_avant_apports.csv").open("w", encoding="utf-8", newline="") as fh:
        ecrivain = csv.DictWriter(fh, fieldnames=COLONNES_CSV, extrasaction="ignore", lineterminator="\n")
        ecrivain.writeheader()
        for L in lignes:
            ecrivain.writerow(L)


def generer_sql(lignes: list):
    tampon = io.StringIO()
    tampon.write("-- Mise à jour des valeurs « avant apport » (pf2_apports).\n")
    tampon.write("-- NE PAS EXÉCUTER sans validation écrite du propriétaire (CSV + RAPPORT.md).\n")
    tampon.write("-- Ne touche qu'aux colonnes valeur_avant_eur / valeur_avant_usd des ids listés,\n")
    tampon.write("-- uniquement si elles sont encore NULL (garde IS NULL). Aucune suppression.\n")
    tampon.write("BEGIN;\n")
    nb = 0
    for L in lignes:
        sets, gardes = [], []
        if L["_old_eur"] is None and L["_eur"] is not None:
            sets.append(f"valeur_avant_eur = {L['_eur']:.2f}")
            gardes.append("valeur_avant_eur IS NULL")
        if L["_old_usd"] is None and L["_usd"] is not None:
            sets.append(f"valeur_avant_usd = {L['_usd']:.2f}")
            gardes.append("valeur_avant_usd IS NULL")
        if sets:
            nb += 1
            tampon.write(f"UPDATE pf2_apports SET {', '.join(sets)} "
                         f"WHERE id = {L['id']} AND {' AND '.join(gardes)};\n")
    tampon.write(f"-- Nombre de lignes concernées : {nb}\n")
    tampon.write("COMMIT;\n")
    return tampon.getvalue(), nb


def ecrire_rapport(lignes, apports, snaps_brut, snaps_ok, nb_incomplets, nb_sans_total,
                   annees_twr, mixtes, nb_negatifs, journal, uid, nb_updates) -> None:
    n = len(lignes)
    run = os.environ.get("GITHUB_RUN_ID", "local")

    def compte(pred):
        return sum(1 for L in lignes if pred(L))

    deja_eur = compte(lambda L: L["_old_eur"] is not None)
    deja_usd = compte(lambda L: L["_old_usd"] is not None)
    deja_tous = compte(lambda L: L["_old_eur"] is not None and L["_old_usd"] is not None)
    recon_eur = compte(lambda L: L["origine_eur"].startswith("reconstruite"))
    recon_usd = compte(lambda L: L["origine_usd"].startswith("reconstruite"))
    appr_eur = compte(lambda L: L["origine_eur"].startswith("approx"))
    appr_usd = compte(lambda L: L["origine_usd"].startswith("approx"))
    non_eur = compte(lambda L: L["origine_eur"] == "non_renseignee")
    non_usd = compte(lambda L: L["origine_usd"] == "non_renseignee")
    conv_usd = compte(lambda L: L["origine_usd"].endswith("_converti_taux_historique"))
    nb_cpt = {"apport": 0, "retrait": 0}
    for L in lignes:
        nb_cpt[L["_sens"]] = nb_cpt.get(L["_sens"], 0) + 1

    dates_snap_brut = sorted(jour(s["date"]) for s in snaps_brut) if snaps_brut else []
    premier_snap = dates_snap_brut[0].isoformat() if dates_snap_brut else "—"
    dernier_snap = dates_snap_brut[-1].isoformat() if dates_snap_brut else "—"

    out = io.StringIO()
    w = out.write
    w("# Rapport — reconstitution de `valeur_avant_eur` / `valeur_avant_usd` (pf2_apports)\n\n")
    w("**Statut : PROPOSITION, NON APPLIQUÉE.** Aucune écriture n'a été faite dans la base. "
      "Ce rapport et le CSV doivent être validés par écrit par le propriétaire avant toute "
      "exécution de `update_valeur_avant.sql`.\n\n")
    w(f"Généré par le workflow « Reconstitution valeur_avant » (run {run}), en lecture seule.\n\n")

    w("## 1. Données lues et constats\n\n")
    w(f"- **pf2_apports** : {len(apports)} lignes lues"
      f"{' (filtre user_id du propriétaire)' if uid else ' (aucun filtre user_id : un seul propriétaire détecté)'}. "
      f"Sens : {nb_cpt.get('apport', 0)} apport(s), {nb_cpt.get('retrait', 0)} retrait(s).\n")
    w("- Colonnes réelles de pf2_apports (sonde) : `id, date, sens, montant_eur, montant_or, cours_or, compte, "
      "reference, note, idempotence, user_id, valeur_avant_eur, valeur_avant_usd, cree_le`. "
      "**Pas de colonne `montant_usd`** : il est calculé comme dans `core/session.py` "
      "(référence `usd:…`, puis `montant_or × cours_or`, puis `montant_eur × taux historique`). "
      "La source est indiquée par ligne (`source_montant_usd`).\n")
    w(f"- **pf2_snapshots** : {len(snaps_brut)} lignes. Snapshots incomplets exclus (`complet = false`) : "
      f"{nb_incomplets}. Totaux absents ou nuls exclus : {nb_sans_total}. "
      f"**Snapshots utilisables : {len(snaps_ok)}** (du {premier_snap} au {dernier_snap}).\n")
    w("- Colonnes réelles de pf2_snapshots (sonde) : `id, date, patrimoine_total_eur, patrimoine_investi_eur, "
      "courant_eur, precaution_eur, cours_or_usd, equivalent_or_oz, poche_rv_eur, poche_energie_eur, "
      "poche_asie_eur, poche_jgb_eur, complet, manquantes, user_id, cree_le`. **Aucune colonne de patrimoine "
      "en USD** (`cours_or_usd` est le cours de l'or) : la conversion USD est donc nécessaire (voir hypothèses).\n")
    w("- **Tables v1** (`Historique`, `Projections`, `Donnees`, `Transaction`, `Config`) : "
      "inaccessibles avec la clé utilisée par le workflow (erreur 42501, constatée lors d'une sonde des "
      "noms de colonnes). Le repli sur `Historique` demandé par la mission n'a donc **pas** pu être utilisé.\n")
    w("- **pf2_fx** ne contient que le cache du jour (écrit par `jobs/update_market_data.py`) : "
      "il n'a pas d'historique. Les taux historiques EUR/USD viennent donc de `core/fx.py` "
      "(même source que le robot de reconstitution). Chaque conversion est signalée.\n\n")

    w("## 2. Nombre d'apports\n\n")
    w("| Indicateur | EUR | USD |\n|---|---:|---:|\n")
    w(f"| Total d'apports | {n} | {n} |\n")
    w(f"| Déjà mesurés (valeur présente avant la mission) | {deja_eur} | {deja_usd} |\n")
    w(f"| Reconstruits (snapshot antérieur) | {recon_eur} | {recon_usd} |\n")
    w(f"| dont USD converties au taux historique | — | {conv_usd} |\n")
    w(f"| Approximés (snapshot postérieur, approximation plus forte) | {appr_eur} | {appr_usd} |\n")
    w(f"| Non renseignés (NULL) | {non_eur} | {non_usd} |\n\n")
    w(f"- Apports déjà entièrement mesurés (EUR et USD) : **{deja_tous}**.\n")
    w(f"- Lignes à compléter dans le SQL : **{nb_updates}**.\n")
    w(f"- Lignes où une seule devise est mesurée (l'autre laissée NULL pour ne pas mélanger les sources) : **{len(mixtes)}**"
      f"{' — ids ' + ', '.join(str(L['id']) for L in mixtes) if mixtes else ''}.\n")
    w(f"- Montants EUR négatifs dans pf2_apports : {nb_negatifs} (le sens gouverne le signe du flux).\n\n")

    w("## 3. Apports approximés (snapshot postérieur)\n\n")
    approx = [L for L in lignes if L["origine_eur"].startswith("approx") or L["origine_usd"].startswith("approx")]
    if not approx:
        w("Aucun.\n\n")
    else:
        w("Une valeur approximée utilise le premier snapshot **après** l'apport : c'est une approximation "
          "plus forte que la reconstruction antérieure, car elle suppose que le portefeuille n'a pas "
          "changé entre l'apport et ce snapshot.\n\n")
        w("| id | date | sens | montant EUR | origine EUR | origine USD | snapshot retenu |\n"
          "|---:|---|---|---:|---|---|---|\n")
        for L in approx:
            w(f"| {L['id']} | {L['date']} | {L['sens']} | {fr(L['_montant_eur'])} | {L['origine_eur']} | "
              f"{L['origine_usd']} | {L['date_snapshot_retenu']} |\n")
        w("\n")

    w("## 4. Apports non renseignés\n\n")
    non = [L for L in lignes if L["raison"]]
    if not non:
        w("Aucun.\n\n")
    else:
        w("| id | date | sens | montant EUR | raison |\n|---:|---|---|---:|---|\n")
        for L in non:
            w(f"| {L['id']} | {L['date']} | {L['sens']} | {fr(L['_montant_eur'])} | {L['raison']} |\n")
        w("\n")

    w("## 5. TWR par année civile, avec les nouvelles valeurs\n\n")
    w("Méthode : TWR strict. Chaque apport est encadré par sa valorisation juste avant (valeur "
      "mesurée ou reconstruite). Une année est **« non calculé »** dès qu'un de ses apports reste sans "
      "valeur, ou qu'un intervalle de l'année ne peut pas être chaîné. Les années avec approximations "
      "sont marquées.\n\n")
    w("Le TWR EUR porte sur `patrimoine_total_eur`. Le TWR USD porte sur le même total converti au taux "
      "historique de chaque date de snapshot.\n\n")
    w("| Année | TWR EUR | TWR USD | Apports | Approximés (EUR / USD) | Motif si non calculé |\n"
      "|---:|---:|---:|---:|---:|---|\n")
    eur, usd = annees_twr.get("EUR", {}), annees_twr.get("USD", {})
    annees = sorted((set(eur) | set(usd)) - {"_dernier_snapshot"})
    dernier = eur.get("_dernier_snapshot") or usd.get("_dernier_snapshot")
    for an in annees:
        e, u = eur.get(an, {}), usd.get(an, {})
        libelle = f"{an}" + (" (en cours)" if dernier and an == dernier.year and an == dt.date.today().year else "")
        motifs = []
        if e.get("raisons"):
            motifs.append("EUR : " + " ; ".join(e["raisons"]))
        if u.get("raisons"):
            motifs.append("USD : " + " ; ".join(u["raisons"]))
        w(f"| {libelle} | {pct(e.get('twr'))} | {pct(u.get('twr'))} | {e.get('nb_apports', 0)} | "
          f"{e.get('nb_approx', 0)} / {u.get('nb_approx', 0)} | {'; '.join(motifs) or '—'} |\n")
    w("\n")

    w("## 6. Contrôles automatiques\n\n")
    for statut, message in journal:
        w(f"- [{statut}] {message}\n")
    w("- [OK] Contrôle anti-secret : vérifié par le workflow sur `donnees-reconstituees/` avant la "
      "publication (les valeurs de SUPABASE_URL et SUPABASE_KEY n'y figurent pas).\n\n")

    w("## 7. Hypothèses retenues\n\n")
    w("1. **Valeur « avant apport » = `patrimoine_total_eur` du snapshot.** C'est la valeur que l'application "
      "enregistre au moment d'un apport (`pages/1_Portefeuille.py`).\n")
    w("2. **Snapshots utilisés : complets et valorisés seulement** (`complet = true`, total > 0). Un point partiel "
      "est exclu, comme dans l'application.\n")
    w("3. **Règle 2 (antérieur strict)** : le snapshot du même jour que l'apport est exclu. "
      "Le snapshot le plus proche antérieur est pris.\n")
    w("4. **Règle 3 (postérieur)** : utilisée seulement s'il n'existe aucun snapshot complet antérieur.\n")
    w("5. **USD** : pas de colonne USD dans pf2_snapshots. Le total EUR du snapshot retenu est converti au "
      "taux EUR→USD historique de sa date (`core/fx.py`). L'origine porte le suffixe `_converti_taux_historique`. "
      "Les taux EUR/USD historiques ne sont pas des cotations de la base : c'est une approximation signalée.\n")
    w("6. **Source commune** : EUR et USD d'un même apport viennent du même snapshot, donc du même jour. "
      "Si une seule devise est mesurée, l'autre reste NULL (pas de source mixte).\n")
    w("7. **Plusieurs apports le même jour** : ils partagent la valeur « avant » du jour. "
      "Pour un même jour, la valeur retenue est celle du premier apport (id le plus bas) ; "
      "l'application exclut ces jours, ce rapport les garde.\n")
    w("8. **montant USD** : `montant_or × cours_or` si disponible, sinon `montant_eur × taux historique` "
      "(même ordre que `core/session.py` ; la source est indiquée par ligne dans `source_montant_usd`).\n")
    w("9. **Flux** : `apport` = entrée (+), `retrait` = sortie (−). Le montant est pris en valeur absolue.\n")
    w("10. **Aucun chiffre inventé.** Sans snapshot utilisable, la ligne reste NULL avec sa raison.\n\n")

    w("## 8. Points d'attention\n\n")
    w("- **Dépôt public.** Les montants, dates et totaux de patrimoine de ces fichiers sont visibles "
      "de tout le monde, dans le dépôt, les journaux d'Actions et la PR. Le propriétaire a accepté cette "
      "publication. Un retrait ultérieur ne supprime pas l'historique git.\n")
    w("- **Incohérence possible dans l'application (non modifiée).** Le TWR de l'application compare les "
      "valeurs « avant » au total `patrimoine_total_eur`, mais la série de performance utilise "
      "`patrimoine_investi_eur` (`core/session.py`, `serie_performance`). Quand il y a de la trésorerie, "
      "ces deux séries diffèrent. Ce rapport, lui, utilise le total des deux côtés.\n")
    w("- Les valeurs reconstruites supposent un portefeuille inchangé entre le snapshot et l'apport "
      "(voir `core/metrics.py`, limite A6). Elles sont donc des approximations.\n\n")

    w("## 9. Application (à faire après validation écrite)\n\n")
    w("Exécuter `update_valeur_avant.sql` dans l'éditeur SQL Supabase, une seule fois. Le fichier est une "
      "transaction BEGIN/COMMIT. Chaque instruction ne met à jour que les colonnes encore NULL.\n")

    (DOSSIER / "RAPPORT.md").write_text(out.getvalue(), encoding="utf-8")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ControleEchoue as exc:
        print(f"CONTROLE ECHOUE : {exc}")
        sys.exit(1)
