# -*- coding: utf-8 -*-
"""Sauvegarde chiffrée hebdomadaire (2.2.0, C).

Lit les tables de Supabase, produit une archive chiffrée `.pf2` et son
empreinte `.sha256`, dans le dossier `SAUVEGARDE_DOSSIER` (défaut `sauvegardes/`).
Le workflow `.github/workflows/sauvegarde.yml` la restaure aussitôt (contrôle)
puis la publie en artefact : c'est la copie hors ligne.

Secrets requis (jamais écrits dans le code ni dans le journal) :
- SUPABASE_URL, SUPABASE_KEY : lecture (comme les autres jobs) ;
- SAUVEGARDE_CLE : phrase de chiffrement, 12 caractères minimum.

Sans phrase valable, le job s'arrête (code 2) : aucune sauvegarde en clair.
"""
from __future__ import annotations

import datetime as dt
import logging
import os
import sys
from pathlib import Path
from typing import Callable
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import db, sauvegarde  # noqa: E402

log = logging.getLogger("sauvegarde")
FUSEAU = ZoneInfo("Europe/Paris")


def lecteur_supabase(nom: str) -> list[dict]:
    """Lit une table. Une table optionnelle absente lève LookupError."""
    if nom in sauvegarde.TABLES_OPTIONNELLES and not db.existe(nom):
        raise LookupError(nom)
    df = db.lire(nom)
    lignes = df.to_dict("records") if df is not None and not df.empty else []
    # NaN -> None : le JSON doit rester valide et la somme de contrôle stable.
    return [{k: (None if _est_nan(v) else v) for k, v in ligne.items()} for ligne in lignes]


def _est_nan(v) -> bool:
    return isinstance(v, float) and v != v


def produire_fichier(lecteur: Callable[[str], list[dict]], phrase: str, dossier: Path,
                     maintenant: dt.datetime) -> tuple[Path, dict]:
    """Écrit `pf2-AAAA-MM-JJ.pf2` et `.sha256` dans `dossier`. Écriture atomique."""
    dossier.mkdir(parents=True, exist_ok=True)
    blob, document = sauvegarde.produire(
        lecteur, phrase, genere_le=maintenant.astimezone(FUSEAU).isoformat(timespec="seconds"))
    nom = f"pf2-{maintenant.astimezone(FUSEAU):%Y-%m-%d}.pf2"
    chemin = dossier / nom
    sha = sauvegarde.sha256_octets(blob)
    for fichier, contenu in ((chemin, blob), (dossier / (nom + ".sha256"),
                                              f"{sha}  {nom}\n".encode("ascii"))):
        tmp = fichier.with_suffix(fichier.suffix + ".tmp")
        tmp.write_bytes(contenu)
        os.replace(tmp, fichier)
    return chemin, document


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    phrase = os.environ.get("SAUVEGARDE_CLE", "")
    if len(phrase) < sauvegarde.PHRASE_MIN:
        log.error("SAUVEGARDE_CLE absente ou trop courte : aucune sauvegarde produite.")
        return 2
    dossier = Path(os.environ.get("SAUVEGARDE_DOSSIER", "sauvegardes"))
    try:
        chemin, document = produire_fichier(lecteur_supabase, phrase, dossier,
                                            dt.datetime.now(dt.timezone.utc))
    except sauvegarde.ErreurSauvegarde as exc:
        log.error("%s", exc)
        return 1
    log.info("Sauvegarde écrite : %s (%d octets)", chemin, chemin.stat().st_size)
    for nom, bloc in document["tables"].items():
        log.info("  %-24s %6d lignes  sha256 %s", nom, bloc["nb"], bloc["sha256"][:16])
    for nom in document["absentes"]:
        log.warning("  %-24s ABSENTE (optionnelle) : non sauvegardée", nom)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
