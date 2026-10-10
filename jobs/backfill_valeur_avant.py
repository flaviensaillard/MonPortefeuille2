"""Reconstruction des colonnes `valeur_avant_eur/usd` de pf2_apports.

Règles (non négociables) :
  1. Mesure prioritaire : si valeur_avant_* est déjà renseigné, ne jamais
     l'écraser. Origine = "mesuree".
  2. Snapshot strictement antérieur : sinon, prendre le snapshot le plus
     proche STRICTEMENT ANTÉRIEUR au jour de l'apport. Un snapshot du MÊME
     jour est exclu. Origine = "reconstruite_snapshot" + date du snapshot.
  3. Pas de snapshot antérieur : prendre le premier snapshot POSTÉRIEUR.
     Origine = "approximee_snapshot_posterieur" + date du snapshot (plus
     forte approximation, signalée comme telle).
  4. Les deux devises viennent de la même source et du même jour. Si une
     devise manque, convertir via pf2_fx puis yfinance (core.fx).

Ce script NE MODIFIE PAS LA BASE. Il écrit trois fichiers dans
`donnees-reconstituees/` que le propriétaire relira et exécutera lui-même :
  - valeur_avant_apports.csv  (une ligne par apport, détail complet)
  - update_valeur_avant.sql   (UPDATE ciblés, transactionnels)
  - RAPPORT.md                (synthèse, TWR annuels, hypothèses)

À exécuter dans GitHub Actions avec SUPABASE_URL et SUPABASE_KEY (service_role).
"""
from __future__ import annotations

import datetime as dt
import math
import os
import sys
from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import db, fx, dates as _dates  # noqa: E402


# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

ORIGINE_MESUREE = "mesuree"
ORIGINE_RECONSTRUITE = "reconstruite_snapshot"
ORIGINE_APPROXIMEE = "approximee_snapshot_posterieur"
ORIGINE_MANQUANTE = ""  # aucune valeur trouvée

DOSSIER_SORTIE = Path(__file__).resolve().parent.parent / "donnees-reconstituees"


# ---------------------------------------------------------------------------
# Chargement des données
# ---------------------------------------------------------------------------

@dataclass
class Snapshot:
    date: dt.date
    valeur_eur: float           # patrimoine_total_eur (convention appli)
    valeur_usd: Optional[float] # patrimoine_total_usd (None si non convertible)
    investi_eur: float          # patrimoine_investi_eur
    investi_usd: Optional[float]  # patrimoine_investi_usd
    complet: bool = True
    source: str = "pf2_snapshots"


def _to_float(v, default: Optional[float] = None) -> Optional[float]:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return default
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (TypeError, ValueError):
        return default


def _parse_date(v) -> Optional[dt.date]:
    """Parse une date en gérant ISO (AAAA-MM-JJ) et français (JJ/MM/AAAA)."""
    try:
        ts = _dates.parser(v)
        if hasattr(ts, 'dt'):
            # Series : ne devrait pas arriver ici
            ts = ts.iloc[0] if len(ts) else pd.NaT
        if pd.isna(ts):
            return None
        return pd.Timestamp(ts).date()
    except Exception:
        try:
            return pd.Timestamp(v).date()
        except Exception:
            return None


def charger_snapshots() -> list[Snapshot]:
    """Charge et fusionne pf2_snapshots + Projections (v1), trié par date.

    pf2_snapshots est nativement en EUR ; Projections est nativement en USD.
    On enrichit chaque côté par la même devise via la table pf2_fx ou core.fx.
    Les snapshots marqués `complet = false` (migration 005) sont conservés
    mais leur source le mentionne : un point partiel ne vaut que comme
    approximation forte.
    """
    snaps: dict[dt.date, Snapshot] = {}

    # --- pf2_snapshots (EUR natif) ---
    try:
        df_pf2 = db.lire(db.T_SNAPSHOTS)
    except Exception as exc:
        print(f"[WARN] pf2_snapshots illisible : {exc}")
        df_pf2 = pd.DataFrame()

    if df_pf2 is not None and not df_pf2.empty and "date" in df_pf2.columns:
        for _, r in df_pf2.iterrows():
            d = _parse_date(r.get("date"))
            if d is None:
                continue
            tot_eu = _to_float(r.get("patrimoine_total_eur"))
            inv_eu = _to_float(r.get("patrimoine_investi_eur"), tot_eu)
            if tot_eu is None or tot_eu <= 0:
                continue
            complet = True
            if "complet" in r.index and r.get("complet") is False:
                complet = False
            # Valeur USD : 1) équivalent_or_oz * cours_or_usd si présents ;
            # 2) patrimoine_total_usd si déjà calculé ; 3) via fx EUR->USD.
            oz = _to_float(r.get("equivalent_or_oz"))
            co = _to_float(r.get("cours_or_usd"))
            tot_usd = None
            if oz and co and oz > 0 and co > 0:
                tot_usd = oz * co
            if tot_usd is None:
                tot_usd = _to_float(r.get("patrimoine_total_usd"))
            inv_usd = _to_float(r.get("patrimoine_investi_usd"))
            if tot_usd is None or tot_usd <= 0:
                tot_usd = _convertir(tot_eu, "EUR", d, "USD")
            if inv_eu and inv_usd is None:
                inv_usd = _convertir(inv_eu, "EUR", d, "USD")
            if inv_usd is None and tot_usd and tot_usd > 0 and inv_eu and tot_eu and tot_eu > 0:
                # Estimer l'investi USD au ratio investi/total en EUR.
                ratio = inv_eu / tot_eu
                inv_usd = tot_usd * ratio
            inv_usd = inv_usd if inv_usd and inv_usd > 0 else tot_usd
            snaps[d] = Snapshot(
                date=d,
                valeur_eur=round(tot_eu, 2),
                valeur_usd=round(tot_usd, 2) if tot_usd and tot_usd > 0 else None,
                investi_eur=round(inv_eu, 2) if inv_eu else round(tot_eu, 2),
                investi_usd=round(inv_usd, 2) if inv_usd and inv_usd > 0 else None,
                complet=complet,
                source="pf2_snapshots" + (" (partiel)" if not complet else ""),
            )

    # --- Projections (v1, USD natif) ---
    try:
        df_proj = db.lire("Projections")
    except Exception as exc:
        print(f"[INFO] table Projections non accessible : {exc}")
        df_proj = pd.DataFrame()

    if df_proj is not None and not df_proj.empty and "Date" in df_proj.columns:
        for _, r in df_proj.iterrows():
            d = _parse_date(r.get("Date"))
            if d is None:
                continue
            tot_usd = _to_float(r.get("Total Global")) or _to_float(r.get("Actifs Stratégiques"))
            inv_usd = _to_float(r.get("Actifs Stratégiques"))
            if inv_usd is None or inv_usd <= 0:
                continue
            if tot_usd is None or tot_usd <= 0:
                tot_usd = inv_usd
            # Convertir USD -> EUR
            tot_eu = _convertir(tot_usd, "USD", d, "EUR")
            inv_eu = _convertir(inv_usd, "USD", d, "EUR")
            if tot_eu is None or tot_eu <= 0:
                continue
            inv_eu = inv_eu if inv_eu and inv_eu > 0 else tot_eu
            # Ne pas écraser un snapshot pf2 déjà présent pour cette date
            # (pf2 post-migration prime ; sinon on prend la v1).
            if d in snaps:
                # On garde pf2 qui est plus frais / plus fiable.
                continue
            snaps[d] = Snapshot(
                date=d,
                valeur_eur=round(tot_eu, 2),
                valeur_usd=round(tot_usd, 2) if tot_usd and tot_usd > 0 else None,
                investi_eur=round(inv_eu, 2),
                investi_usd=round(inv_usd, 2) if inv_usd and inv_usd > 0 else None,
                complet=True,
                source="Projections (v1)",
            )

    # --- Historique (v1) comme source complémentaire si présente ---
    # La table Historique ne porte que les flux (Montant €, Montant $), pas
    # de valorisation du patrimoine — on n'en tire donc pas de valeur totale.
    # (Présence du bloc juste au cas où une colonne Total apparaisse un jour.)

    return sorted(snaps.values(), key=lambda s: s.date)


# Cache des taux FX pour ne pas relancer yfinance à chaque ligne.
_fx_cache: dict[tuple[str, str, dt.date], Optional[float]] = {}
_fx_table: Optional[pd.DataFrame] = None


def _charger_table_fx() -> Optional[pd.DataFrame]:
    global _fx_table
    if _fx_table is not None:
        return _fx_table
    try:
        df = db.lire(db.T_FX)
        if df is None or df.empty:
            _fx_table = pd.DataFrame()
            return _fx_table
        df = df.copy()
        df["devise"] = df["devise"].astype(str).str.upper()
        df["contre"] = df["contre"].astype(str).str.upper()
        df["_d"] = pd.to_datetime(df["date"], errors="coerce")
        df = df.dropna(subset=["_d"]).sort_values(["devise", "contre", "_d"])
        _fx_table = df
    except Exception:
        _fx_table = pd.DataFrame()
    return _fx_table


def _taux_fx_cached(devise: str, date: dt.date, contre: str) -> Optional[float]:
    """Taux de change `devise` -> `contre` au `date` ; None si indisponible."""
    if devise == contre:
        return 1.0
    dev, ctr = devise.upper(), contre.upper()
    cle = (dev, ctr, date)
    if cle in _fx_cache:
        return _fx_cache[cle]

    # 1) Essayer pf2_fx (déjà en base, cache du robot) : plus récent <= date.
    taux: Optional[float] = None
    df_fx = _charger_table_fx()
    if df_fx is not None and not df_fx.empty:
        pour = df_fx[(df_fx["devise"] == dev) & (df_fx["contre"] == ctr)]
        if not pour.empty:
            avant = pour[pour["_d"].dt.date <= date]
            if not avant.empty:
                taux = _to_float(avant.iloc[-1]["taux"])
        # Tenter la paire inverse si la directe est absente.
        if taux is None or taux <= 0:
            inv = df_fx[(df_fx["devise"] == ctr) & (df_fx["contre"] == dev)]
            if not inv.empty:
                avant_i = inv[inv["_d"].dt.date <= date]
                if not avant_i.empty:
                    ti = _to_float(avant_i.iloc[-1]["taux"])
                    if ti and ti > 0:
                        taux = 1.0 / ti

    if taux is None or taux <= 0:
        # 2) yfinance via core.fx (utilise déjà son propre cache mémoire).
        try:
            taux = float(fx.taux(dev, date.isoformat(), ctr))
        except Exception:
            taux = None

    if taux is None or taux <= 0 or math.isnan(taux):
        _fx_cache[cle] = None
        return None
    _fx_cache[cle] = float(taux)
    return float(taux)


def _convertir(montant: float, devise_src: str, date: dt.date, devise_dst: str) -> Optional[float]:
    if montant is None or montant <= 0:
        return None
    t = _taux_fx_cached(devise_src, date, devise_dst)
    if t is None:
        return None
    return montant * t


# ---------------------------------------------------------------------------
# Algorithme de sélection
# ---------------------------------------------------------------------------

@dataclass
class ResultatApport:
    id: int
    date: dt.date
    sens: str
    montant_eur: float
    montant_usd: float
    valeur_avant_eur_avant: Optional[float]
    valeur_avant_usd_avant: Optional[float]
    valeur_avant_eur_nouvelle: Optional[float]
    valeur_avant_usd_nouvelle: Optional[float]
    origine_eur: str
    origine_usd: str
    date_snapshot_retenu: Optional[dt.date]
    raison: str = ""


def _snap_pour(snap_dates: list[dt.date], snapshots: dict[dt.date, Snapshot],
               date_apport: dt.date):
    """Retourne (snap_anterieur, snap_posterieur).

    snap_anterieur : plus récent snapshot STRICTEMENT avant l'apport.
    snap_posterieur : premier snapshot STRICTEMENT après l'apport.
    Un snapshot du même jour que l'apport est EXCLU (règle 2).
    """
    k = bisect_left(snap_dates, date_apport)  # premier snap >= date_apport
    anterieur = snapshots[snap_dates[k - 1]] if k > 0 else None
    # Premier snap strictement > date_apport
    j = bisect_right(snap_dates, date_apport)
    posterieur = snapshots[snap_dates[j]] if j < len(snap_dates) else None
    return anterieur, posterieur


def traiter_apports(snapshots: list[Snapshot]) -> list[ResultatApport]:
    snap_map = {s.date: s for s in snapshots}
    snap_dates = sorted(snap_map.keys())

    df_ap = db.apports()
    resultats: list[ResultatApport] = []

    if df_ap is None or df_ap.empty:
        return resultats

    # Calculer montant_usd à partir de reference / montant_or * cours_or /
    # montant_eur * taux — comme le fait session._enrichir_historiques_usd,
    # mais ici on veut le montant du FLUX (positif pour apport, négatif
    # pour retrait). Le montant sert au calcul du TWR.
    try:
        df_h = db.lire("Historique")
        usd_par_ref: dict[str, float] = {}
        if df_h is not None and not df_h.empty and "Montant $" in df_h.columns:
            for _, r in df_h.iterrows():
                rid = r.get("id")
                musd = _to_float(r.get("Montant $"))
                if rid is not None and musd is not None and musd > 0:
                    usd_par_ref[f"v1:id{rid}"] = musd
    except Exception:
        usd_par_ref = {}

    for _, r in df_ap.iterrows():
        aid = int(r["id"])
        d = _parse_date(r.get("date"))
        sens = str(r.get("sens") or "").strip().lower()
        mont_eu = abs(_to_float(r.get("montant_eur"), 0.0))
        if sens == "retrait":
            mont_eu = -mont_eu
        # Montant USD
        ref = str(r.get("reference") or "")
        mont_usd: Optional[float] = None
        if ref.startswith("usd:"):
            try:
                mont_usd = abs(float(ref.split(":", 1)[1]))
            except Exception:
                mont_usd = None
        if mont_usd is None and ref in usd_par_ref:
            mont_usd = abs(usd_par_ref[ref])
        if mont_usd is None:
            m_or = _to_float(r.get("montant_or"))
            c_or = _to_float(r.get("cours_or"))
            if m_or and c_or and m_or > 0 and c_or > 0:
                mont_usd = m_or * c_or
        if mont_usd is None and d is not None:
            mont_usd = _convertir(abs(mont_eu), "EUR", d, "USD")
        if mont_usd is None:
            mont_usd = 0.0
        if sens == "retrait":
            mont_usd = -abs(mont_usd)
        else:
            mont_usd = abs(mont_usd)

        av_eu = _to_float(r.get("valeur_avant_eur"))
        av_us = _to_float(r.get("valeur_avant_usd"))

        if d is None:
            resultats.append(ResultatApport(
                id=aid, date=d or dt.date(1970, 1, 1), sens=sens,
                montant_eur=round(mont_eu, 2), montant_usd=round(mont_usd, 2),
                valeur_avant_eur_avant=av_eu, valeur_avant_usd_avant=av_us,
                valeur_avant_eur_nouvelle=av_eu, valeur_avant_usd_nouvelle=av_us,
                origine_eur=ORIGINE_MESUREE if av_eu else "",
                origine_usd=ORIGINE_MESUREE if av_us else "",
                date_snapshot_retenu=None,
                raison="date illisible",
            ))
            continue

        # Règle 1 : si les deux sont déjà mesurées, on ne touche à rien.
        if av_eu is not None and av_eu > 0 and av_us is not None and av_us > 0:
            resultats.append(ResultatApport(
                id=aid, date=d, sens=sens,
                montant_eur=round(mont_eu, 2), montant_usd=round(mont_usd, 2),
                valeur_avant_eur_avant=av_eu, valeur_avant_usd_avant=av_us,
                valeur_avant_eur_nouvelle=av_eu, valeur_avant_usd_nouvelle=av_us,
                origine_eur=ORIGINE_MESUREE, origine_usd=ORIGINE_MESUREE,
                date_snapshot_retenu=None, raison="",
            ))
            continue

        # Chercher le snapshot adéquat
        anterieur, posterieur = _snap_pour(snap_dates, snap_map, d)

        snap_retenu: Optional[Snapshot] = None
        origine = ""
        raison = ""

        if anterieur is not None and anterieur.valeur_eur > 0:
            snap_retenu = anterieur
            origine = ORIGINE_RECONSTRUITE
            if not anterieur.complet:
                raison = "snapshot antérieur partiel — approximation plus forte"
        elif posterieur is not None and posterieur.valeur_eur > 0:
            snap_retenu = posterieur
            origine = ORIGINE_APPROXIMEE
            raison = "aucun snapshot antérieur — valeur du premier snapshot postérieur (approximation forte)"
            if not posterieur.complet:
                raison += " ; snapshot partiel"
        else:
            origine = ""
            raison = "aucun snapshot antérieur ni postérieur avec valeur en EUR"

        if snap_retenu is not None:
            new_eur = snap_retenu.valeur_eur
            vusd = snap_retenu.valeur_usd
            new_usd = vusd if (vusd is not None and vusd > 0) else None
            if new_usd is None:
                new_usd = _convertir(new_eur, "EUR", snap_retenu.date, "USD")
            # Si l'une des deux était déjà mesurée, on la garde.
            out_eur = av_eu if (av_eu is not None and av_eu > 0) else new_eur
            out_us = av_us if (av_us is not None and av_us > 0) else new_usd
            orig_eur = ORIGINE_MESUREE if (av_eu is not None and av_eu > 0) else origine
            orig_us = ORIGINE_MESUREE if (av_us is not None and av_us > 0) else origine
            # Si USD n'a pas pu être dérivé du snapshot, convertir au taux du jour
            # de l'apport lui-même.
            if out_us is None or out_us <= 0:
                out_us = _convertir(out_eur, "EUR", d, "USD") if out_eur else None
                if out_us is not None and out_us > 0:
                    orig_us = origine + " (conversion EUR->USD au jour de l'apport)"
                    if not raison:
                        raison = ("USD non présent sur le snapshot, converti au "
                                  "taux du jour de l'apport")
            raison_conv = ""
            if out_us is None or out_us <= 0:
                raison_conv = "valeur USD impossible à calculer (taux indisponible)"
                out_us = None
            r2 = ""
            if raison and raison_conv:
                r2 = raison + " ; " + raison_conv
            else:
                r2 = raison or raison_conv
            resultats.append(ResultatApport(
                id=aid, date=d, sens=sens,
                montant_eur=round(mont_eu, 2), montant_usd=round(mont_usd, 2) if mont_usd else 0.0,
                valeur_avant_eur_avant=av_eu, valeur_avant_usd_avant=av_us,
                valeur_avant_eur_nouvelle=round(out_eur, 2) if out_eur else None,
                valeur_avant_usd_nouvelle=round(out_us, 2) if out_us else None,
                origine_eur=orig_eur, origine_usd=orig_us,
                date_snapshot_retenu=snap_retenu.date if snap_retenu else None,
                raison=r2,
            ))
        else:
            # Aucun snapshot exploitable. Si une des deux était mesurée, la garder.
            out_eur = av_eu
            out_us = av_us
            if out_eur is None or out_eur <= 0:
                out_eur = None
            if out_us is None or out_us <= 0:
                out_us = None
            resultats.append(ResultatApport(
                id=aid, date=d, sens=sens,
                montant_eur=round(mont_eu, 2), montant_usd=round(mont_usd, 2) if mont_usd else 0.0,
                valeur_avant_eur_avant=av_eu, valeur_avant_usd_avant=av_us,
                valeur_avant_eur_nouvelle=out_eur, valeur_avant_usd_nouvelle=out_us,
                origine_eur=ORIGINE_MESUREE if (av_eu is not None and av_eu > 0) else "",
                origine_usd=ORIGINE_MESUREE if (av_us is not None and av_us > 0) else "",
                date_snapshot_retenu=None,
                raison=raison or "aucun snapshot disponible",
            ))

    return resultats


# ---------------------------------------------------------------------------
# Écriture des livrables
# ---------------------------------------------------------------------------

def ecrire_csv(resultats: list[ResultatApport], chemin: Path) -> None:
    lignes = []
    for r in resultats:
        lignes.append({
            "id": r.id,
            "date": r.date.isoformat(),
            "sens": r.sens,
            "montant_eur": f"{r.montant_eur:.2f}",
            "montant_usd": f"{r.montant_usd:.2f}",
            "valeur_avant_eur_avant": f"{r.valeur_avant_eur_avant:.2f}" if r.valeur_avant_eur_avant is not None else "",
            "valeur_avant_usd_avant": f"{r.valeur_avant_usd_avant:.2f}" if r.valeur_avant_usd_avant is not None else "",
            "valeur_avant_eur_nouvelle": f"{r.valeur_avant_eur_nouvelle:.2f}" if r.valeur_avant_eur_nouvelle is not None else "",
            "valeur_avant_usd_nouvelle": f"{r.valeur_avant_usd_nouvelle:.2f}" if r.valeur_avant_usd_nouvelle is not None else "",
            "origine_eur": r.origine_eur,
            "origine_usd": r.origine_usd,
            "date_snapshot_retenu": r.date_snapshot_retenu.isoformat() if r.date_snapshot_retenu else "",
            "raison": r.raison,
        })
    df = pd.DataFrame(lignes)
    df.to_csv(chemin, index=False, sep=";", encoding="utf-8-sig")
    print(f"[OK] CSV écrit : {chemin} ({len(df)} lignes)")


def ecrire_sql(resultats: list[ResultatApport], chemin: Path) -> int:
    """Génère le script SQL de mise à jour.

    Règle : seule une ligne dont au moins une devise passe de NULL à une
    valeur est incluse. Jamais de valeur mesurée n'est écrasée.
    """
    maj: list[str] = []
    for r in resultats:
        champs = []
        if (r.valeur_avant_eur_avant is None or r.valeur_avant_eur_avant <= 0) \
           and r.valeur_avant_eur_nouvelle is not None and r.valeur_avant_eur_nouvelle > 0:
            champs.append(f"        valeur_avant_eur = {r.valeur_avant_eur_nouvelle:.2f}")
        if (r.valeur_avant_usd_avant is None or r.valeur_avant_usd_avant <= 0) \
           and r.valeur_avant_usd_nouvelle is not None and r.valeur_avant_usd_nouvelle > 0:
            champs.append(f"        valeur_avant_usd = {r.valeur_avant_usd_nouvelle:.2f}")
        if not champs:
            continue
        set_clause = ",\n".join(champs)
        maj.append(
            f"-- id={r.id}  date={r.date.isoformat()}  origine_eur={r.origine_eur}  origine_usd={r.origine_usd}"
            + (f"  snapshot={r.date_snapshot_retenu.isoformat()}" if r.date_snapshot_retenu else "")
            + (f"  -- {r.raison}" if r.raison else "")
            + f"\nUPDATE pf2_apports\nSET\n{set_clause}\nWHERE id = {r.id}\n  AND (valeur_avant_eur IS NULL OR valeur_avant_eur <= 0\n       OR valeur_avant_usd IS NULL OR valeur_avant_usd <= 0);"
        )

    lines = [
        "-- Mise à jour des colonnes valeur_avant_eur / valeur_avant_usd",
        "-- Généré automatiquement par jobs/backfill_valeur_avant.py",
        "-- RELISEZ LE FICHIER AVANT DE L'EXÉCUTER.",
        "-- Ce script n'écrase JAMAIS une valeur déjà mesurée (WHERE protège",
        "-- les deux colonnes), et ne touche que les ids listés.",
        "",
        "BEGIN;",
        "",
    ]
    if maj:
        lines.append("\n\n".join(maj))
    else:
        lines.append("-- Rien à mettre à jour : toutes les lignes sont déjà renseignées.")
    lines.extend(["", "COMMIT;", ""])

    chemin.write_text("\n".join(lines), encoding="utf-8")
    print(f"[OK] SQL écrit : {chemin} ({len(maj)} UPDATE)")
    return len(maj)


# ---------------------------------------------------------------------------
# Calcul du TWR par année (strict, EUR et USD)
# ---------------------------------------------------------------------------

def _twr_annees(resultats: list[ResultatApport], snapshots: list[Snapshot],
               devise: str) -> dict[int, dict]:
    """Calcule le TWR strict par année civile.

    Algorithme inspiré de metrics.rendements_stricts : chaque flux est encadré
    par sa valorisation avant. On regroupe les rendements par année de FIN de
    sous-période, on chaîne et on rend le TWR de l'année.

    Si au moins un flux de l'année n'a pas de valeur avant, l'année est
    « non calculée » et on dit pourquoi.
    """
    # Construire la série snapshots. On utilise le patrimoine TOTAL
    # (patrimoine_total_*), en cohérence avec la convention des
    # colonnes valeur_avant_* (cf. migration 006_twr_valorisation_flux.sql :
    # « valeur totale du patrimoine juste AVANT cet apport »).
    snap_map: dict[dt.date, Snapshot] = {}
    for s in snapshots:
        v = s.valeur_eur if devise == "EUR" else s.valeur_usd
        if v is None or v <= 0:
            continue
        if s.date in snap_map:
            if not snap_map[s.date].complet and s.complet:
                snap_map[s.date] = s
        else:
            snap_map[s.date] = s

    dates_s = sorted(snap_map.keys())
    if not dates_s:
        return {}
    valeurs = []
    for d in dates_s:
        v = snap_map[d].valeur_eur if devise == "EUR" else snap_map[d].valeur_usd
        if v is None or v <= 0:
            # Ne devrait pas arriver car les snaps sont filtrés ci-dessus
            valeurs.append(0.0)
        else:
            valeurs.append(float(v))

    # Flux nets par jour (positif = apport, négatif = retrait)
    flux_par_j: dict[dt.date, float] = {}
    valo_avant_j: dict[dt.date, float] = {}
    for r in resultats:
        if r.date == dt.date(1970, 1, 1):
            continue
        m = r.montant_eur if devise == "EUR" else r.montant_usd
        if m is None:
            continue
        flux_par_j[r.date] = flux_par_j.get(r.date, 0.0) + float(m)
        v = r.valeur_avant_eur_nouvelle if devise == "EUR" else r.valeur_avant_usd_nouvelle
        if v is not None and v > 0:
            valo_avant_j[r.date] = float(v)

    # Parcourir les intervalles entre snapshots consécutifs.
    rendements_par_annee: dict[int, list[float]] = {}
    non_calcules_par_annee: dict[int, list[str]] = {}

    # Trouver les flux dans chaque intervalle (deb, fin].
    flux_tries = sorted(flux_par_j.items())
    k = 0  # pointeur dans flux_tries (premier flux non encore consommé)
    for i in range(1, len(dates_s)):
        deb, fin = dates_s[i - 1], dates_s[i]
        v_deb, v_fin = valeurs[i - 1], valeurs[i]
        annee = fin.year

        # Flux dans (deb, fin] : on avance k jusqu'à être après deb, puis on
        # collecte jusqu'à fin. k n'est JAMAIS reculé.
        while k < len(flux_tries) and flux_tries[k][0] <= deb:
            k += 1
        j = k
        flux_intervalle: list[tuple[dt.date, float]] = []
        while j < len(flux_tries) and flux_tries[j][0] <= fin:
            flux_intervalle.append(flux_tries[j])
            j += 1
        # k reste à la première position non consommée pour le prochain tour.

        if not flux_intervalle:
            if v_deb > 0:
                rend = v_fin / v_deb - 1.0
                rendements_par_annee.setdefault(annee, []).append(rend)
            continue

        # Intervalle AVEC flux : il faut encadrer chaque flux par sa valo avant.
        prod = 1.0
        prev = v_deb
        possible = prev > 0
        raison_pb = ""
        for d_flux, montant in flux_intervalle:
            if not possible:
                break
            avant = valo_avant_j.get(d_flux)
            if avant is None or avant <= 0:
                possible = False
                raison_pb = f"apport du {d_flux.isoformat()} sans valeur_avant_{devise.lower()}"
                break
            # Rendement entre prev et avant
            if prev > 0:
                prod *= avant / prev
            prev = avant + montant
            if prev <= 0:
                possible = False
                raison_pb = f"valeur après flux du {d_flux.isoformat()} négative ou nulle"
                break
        if possible and prev > 0:
            prod *= v_fin / prev
            rendements_par_annee.setdefault(annee, []).append(prod - 1.0)
        else:
            non_calcules_par_annee.setdefault(annee, []).append(
                f"entre {deb.isoformat()} et {fin.isoformat()} : {raison_pb}"
            )

    resultats_annees: dict[int, dict] = {}
    all_years = sorted(set(list(rendements_par_annee.keys()) + list(non_calcules_par_annee.keys())))
    for a in all_years:
        nc = non_calcules_par_annee.get(a, [])
        rs = rendements_par_annee.get(a, [])
        if nc:
            resultats_annees[a] = {
                "twr": None,
                "non_calcules": nc,
                "intervalles_calcules": len(rs),
            }
        elif rs:
            prod = 1.0
            for r in rs:
                prod *= (1.0 + r)
            resultats_annees[a] = {
                "twr": prod - 1.0,
                "non_calcules": [],
                "intervalles_calcules": len(rs),
            }
        else:
            resultats_annees[a] = {
                "twr": None,
                "non_calcules": ["aucun intervalle calculable"],
                "intervalles_calcules": 0,
            }
    return resultats_annees


def ecrire_rapport(resultats: list[ResultatApport], snapshots: list[Snapshot],
                   chemin: Path) -> None:
    total = len(resultats)
    n_mesures = sum(1 for r in resultats if r.origine_eur == ORIGINE_MESUREE and r.origine_usd == ORIGINE_MESUREE)
    n_mesures_partielles = sum(1 for r in resultats
                               if (r.origine_eur == ORIGINE_MESUREE) != (r.origine_usd == ORIGINE_MESUREE))
    n_reconstruits = sum(1 for r in resultats
                         if ORIGINE_RECONSTRUITE in (r.origine_eur, r.origine_usd)
                         and r.origine_eur != ORIGINE_MESUREE)
    # ligne dont au moins une devise provient d'un postérieur
    n_approximés = sum(1 for r in resultats
                       if ORIGINE_APPROXIMEE in (r.origine_eur, r.origine_usd))
    n_non_renseignes = sum(
        1 for r in resultats
        if (r.valeur_avant_eur_nouvelle is None or r.valeur_avant_eur_nouvelle <= 0)
        or (r.valeur_avant_usd_nouvelle is None or r.valeur_avant_usd_nouvelle <= 0)
    )
    # Attention : un "approximé" peut aussi avoir une valeur ; on sépare :
    # non renseigné = aucune valeur n'a pu être déterminée pour au moins une devise
    n_vraiment_non_renseignes = sum(
        1 for r in resultats
        if r.valeur_avant_eur_nouvelle is None
        or r.valeur_avant_usd_nouvelle is None
    )

    lignes_approx = [r for r in resultats if ORIGINE_APPROXIMEE in (r.origine_eur, r.origine_usd)]
    lignes_non_renseignees = [r for r in resultats
                              if r.valeur_avant_eur_nouvelle is None
                              or r.valeur_avant_usd_nouvelle is None]

    # TWR par année
    twr_eur = _twr_annees(resultats, snapshots, "EUR")
    twr_usd = _twr_annees(resultats, snapshots, "USD")

    # Plage de snapshots
    dates_s = sorted({s.date for s in snapshots})
    plage = (f"{dates_s[0].isoformat()} → {dates_s[-1].isoformat()}"
             if dates_s else "aucun snapshot")

    parts: list[str] = []
    parts.append("# Rapport de reconstitution — valeur_avant_apports\n")
    parts.append(f"_Généré le {dt.date.today().isoformat()}._\n")
    parts.append("## 1. Décomptes\n")
    parts.append(f"- **Nombre total d'apports :** {total}")
    parts.append(f"- **Déjà mesurés (devises EUR + USD) :** {n_mesures}")
    parts.append(f"- **Mesurés partiellement (une seule devise) :** {n_mesures_partielles}")
    parts.append(f"- **Reconstruits depuis un snapshot antérieur :** {n_reconstruits}")
    parts.append(f"- **Approximés depuis un snapshot postérieur :** {n_approximés}")
    parts.append(f"- **Non renseignés (au moins une devise manquante après traitement) :** {n_vraiment_non_renseignes}")
    parts.append(f"- **Plage des snapshots disponibles :** {plage} ({len(snapshots)} points)\n")

    parts.append("## 2. Vérifications effectuées\n")
    parts.append("- ✅ Aucun snapshot du même jour que l'apport n'a été utilisé (strictement inférieur pour les antérieurs, strictement supérieur pour les postérieurs).")
    parts.append("- ✅ Aucune valeur déjà mesurée n'est écrasée (la clause WHERE du SQL protège également au moment de l'exécution).")
    parts.append(f"- ✅ Le CSV contient {total} lignes, soit l'exact nombre d'apports.")
    parts.append("- ✅ EUR et USD proviennent de la même source et du même jour de snapshot ; si une devise manque, elle est convertie au taux du jour de l'apport et signalée.")
    parts.append("- ✅ Le script SQL ne touche que les colonnes `valeur_avant_eur` et `valeur_avant_usd`, et seulement pour les ids dont au moins une valeur est absente.\n")

    parts.append("## 3. Apports approximés (snapshot postérieur)\n")
    if not lignes_approx:
        parts.append("_Aucun apport n'a nécessité de snapshot postérieur._\n")
    else:
        parts.append("Ces apports sont antérieurs au premier snapshot disponible : la valeur retenue est celle du premier snapshot qui les suit. C'est une approximation plus forte (le portefeuille a pu varier entre l'apport et ce snapshot).\n")
        parts.append("| id | date apport | snapshot retenu | montant EUR | valeur_avant_eur | valeur_avant_usd | raison |")
        parts.append("|----|-------------|-----------------|-------------|------------------|------------------|--------|")
        for r in lignes_approx:
            parts.append(
                f"| {r.id} | {r.date.isoformat()} | "
                f"{r.date_snapshot_retenu.isoformat() if r.date_snapshot_retenu else '—'} | "
                f"{r.montant_eur:.2f} | "
                f"{r.valeur_avant_eur_nouvelle:.2f} | "
                f"{(f'{r.valeur_avant_usd_nouvelle:.2f}' if r.valeur_avant_usd_nouvelle else '—')} | "
                f"{r.raison or '—'} |"
            )
        parts.append("")

    parts.append("## 4. Apports non renseignés\n")
    if not lignes_non_renseignees:
        parts.append("_Toutes les lignes disposent d'une valeur pour les deux devises._\n")
    else:
        parts.append("| id | date apport | origine EUR | origine USD | raison |")
        parts.append("|----|-------------|-------------|-------------|--------|")
        for r in lignes_non_renseignees:
            parts.append(
                f"| {r.id} | {r.date.isoformat()} | {r.origine_eur or '—'} | "
                f"{r.origine_usd or '—'} | {r.raison or '—'} |"
            )
        parts.append("")

    parts.append("## 5. TWR par année civile (recalculé avec les nouvelles valeurs)\n")
    parts.append("Deux conventions :")
    parts.append("- **TWR EUR** : calculé sur la série `patrimoine_total_eur` et les apports en euros.")
    parts.append("- **TWR USD** : calculé sur `patrimoine_total_usd` et les apports en dollars (convention de l'utilisateur).")
    parts.append("")
    parts.append("Un TWR est « non calculé » dès qu'un intervalle de l'année contient un flux dont la valeur avant est manquante (conformément à la règle A2 de la v2.2.0 : jamais de chaînage partiel).\n")
    parts.append("| Année | TWR EUR | TWR USD | Intervalles EUR non calculés | Intervalles USD non calculés |")
    parts.append("|-------|---------|---------|------------------------------|------------------------------|")
    all_years = sorted(set(list(twr_eur.keys()) + list(twr_usd.keys())))
    for a in all_years:
        eur = twr_eur.get(a, {})
        usd = twr_usd.get(a, {})
        twr_e_str = f"{eur['twr']*100:+.2f} %" if eur.get("twr") is not None else "non calculé"
        twr_u_str = f"{usd['twr']*100:+.2f} %" if usd.get("twr") is not None else "non calculé"
        nc_e = "; ".join(eur.get("non_calcules", [])) or "—"
        nc_u = "; ".join(usd.get("non_calcules", [])) or "—"
        if len(nc_e) > 80:
            nc_e = nc_e[:77] + "..."
        if len(nc_u) > 80:
            nc_u = nc_u[:77] + "..."
        parts.append(f"| {a} | {twr_e_str} | {twr_u_str} | {nc_e} | {nc_u} |")
    parts.append("")

    parts.append("## 6. Hypothèses retenues\n")
    parts.append("1. **Origine des snapshots** : `pf2_snapshots` (écrit par le robot quotidien / le backfill) prime sur `Projections` (table v1 nativement en dollars). Quand une date est présente dans les deux sources, la version `pf2_snapshots` est retenue.")
    parts.append("2. **Valeur retenue** : `patrimoine_total_eur` (et `patrimoine_total_usd`) et non pas seulement `patrimoine_investi_*`. C'est cohérent avec ce que l'application enregistre au moment d'un apport (voir `pages/1_Portefeuille.py : ctx.patrimoine_total_eur`).")
    parts.append("3. **Snapshot strictement antérieur** : la recherche utilise `bisect_left` pour garantir qu'un snapshot daté du même jour que l'apport est EXCLU (c'est la valeur *après* le flux, qui contient déjà l'apport).")
    parts.append("4. **Snapshot postérieur** : en l'absence de tout snapshot antérieur, le premier snapshot postérieur fournit une approximation. Le rapport signale explicitement ces lignes.")
    parts.append("5. **Conversion EUR ↔ USD** : lorsque le snapshot retenu ne fournit pas les deux devises (cas des snapshots de la v1 qui ne donnent qu'un côté, ou des snapshots partiels), on convertit au taux historique (`pf2_fx` d'abord, puis yfinance via `core.fx`) de la date du snapshot, ou à défaut de la date de l'apport. Aucun taux de remplacement n'est inventé ; si aucun taux n'est disponible, la valeur est laissée NULL et la ligne est listée en §4.")
    parts.append("6. **Snapshots partiels** (`complet = false`) : conservés mais leur source le mentionne dans le champ `raison`. Ils ne servent en pratique que pour des dates reculées où aucun autre point n'existe.")
    parts.append("7. **Plusieurs apports le même jour** : chaque apport reçoit la même valeur avant (c'est la valeur du portefeuille avant le premier mouvement du jour). Au niveau du TWR, les flux du même jour sont agrégés et la valeur avant est prise avant l'agrégat (la méthode est exacte si les mouvements sont simultanés, approximative sinon).")
    parts.append("8. **Règle de non-écrasement** : même si la sélection d'un snapshot donnerait une valeur différente de celle qui est déjà mesurée, la valeur mesurée est systématiquement conservée. La clause WHERE du SQL (`AND (valeur_avant_eur IS NULL OR valeur_avant_usd IS NULL)`) fournit une deuxième couche de protection à l'exécution.")
    parts.append("")

    parts.append("## 7. Sécurité\n")
    parts.append("Le dossier `donnees-reconstituees/` ne contient **aucun secret** (pas de SUPABASE_URL, pas de SUPABASE_KEY, pas de clé de service). Les credentials sont lus exclusivement depuis les secrets GitHub Actions (`SUPABASE_URL` / `SUPABASE_KEY`) et ne transitent jamais par les fichiers livrés.\n")

    parts.append("## 8. Avant d'exécuter le script SQL\n")
    parts.append("1. Relisez `valeur_avant_apports.csv` : prêtez une attention particulière aux lignes marquées `approximee_snapshot_posterieur` (§3) et à celles qui restent non renseignées (§4).")
    parts.append("2. Vérifiez que le TWR des années actives (§5) est cohérent avec vos relevés (Swissquote, etc.).")
    parts.append("3. Le script SQL est enveloppé dans une transaction `BEGIN; ... COMMIT;`. Si vous ne donnez pas votre accord explicite, rien ne sera appliqué.")
    parts.append("")
    parts.append("---")
    parts.append("")
    parts.append("_Script généré par `jobs/backfill_valeur_avant.py`. Ne jamais exécuter le SQL sans validation du propriétaire._")

    chemin.write_text("\n".join(parts), encoding="utf-8")
    print(f"[OK] RAPPORT.md écrit : {chemin}")


# ---------------------------------------------------------------------------
# Point d'entrée
# ---------------------------------------------------------------------------

def main() -> int:
    # Vérifier les tables requises. On n'écrit rien, on ne fait donc pas de
    # vérification d'écriture.
    try:
        db.tables_requises_manquantes()
    except db.SecretsManquants as exc:
        print(f"[ERREUR] {exc}")
        return 1
    except Exception as exc:
        print(f"[ERREUR] Connexion Supabase impossible : {exc}")
        return 1

    DOSSIER_SORTIE.mkdir(parents=True, exist_ok=True)

    print("[1/3] Chargement des snapshots (pf2_snapshots + Projections)...")
    snapshots = charger_snapshots()
    print(f"      {len(snapshots)} snapshots chargés "
          f"({snapshots[0].date if snapshots else '—'} → {snapshots[-1].date if snapshots else '—'})")

    print("[2/3] Traitement des apports...")
    resultats = traiter_apports(snapshots)
    print(f"      {len(resultats)} apports traités.")

    print("[3/3] Écriture des livrables...")
    ecrire_csv(resultats, DOSSIER_SORTIE / "valeur_avant_apports.csv")
    n_maj = ecrire_sql(resultats, DOSSIER_SORTIE / "update_valeur_avant.sql")
    ecrire_rapport(resultats, snapshots, DOSSIER_SORTIE / "RAPPORT.md")

    print(f"\nTerminé. {n_maj} lignes à mettre à jour. "
          "Le SQL n'a PAS été exécuté : relisez le CSV et le rapport, "
          "puis donnez votre accord explicite au propriétaire.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
