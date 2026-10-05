#!/usr/bin/env python3
"""Importe le corpus DÉJÀ collecté dans votre espace de travail.

Si vous avez déjà les dossiers `idl/` (articles de l'Institut des Libertés) et
`yt/` (transcriptions de vidéos publiques), inutile de tout retélécharger : ce
script les convertit au format attendu par `fabriquer_chunks.py`.

Le gros avantage de ces fichiers : ils connaissent l'AUTEUR. On peut donc
séparer ce que Charles Gave a écrit lui-même (669 articles) du reste de
l'Institut des Libertés (1 733 articles), au lieu de le deviner.

Usage :
    python3 scripts/importer_corpus_local.py                    # tout
    python3 scripts/importer_corpus_local.py --source gave      # Gave seul (recommandé pour débuter)
    python3 scripts/importer_corpus_local.py --racine /home/user
"""

import argparse
import json
import os
import re
import sys

ICI = os.path.dirname(__file__)
RACINE_CORPUS = os.path.normpath(os.path.join(ICI, "..", "corpus", "brut"))


def propre(texte: str) -> str:
    t = re.sub(r"[ \t\xa0]+", " ", texte or "")
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def importer_idl(racine: str, gave_seul: bool):
    """Articles de l'Institut des Libertés."""
    dossier = os.path.join(RACINE_CORPUS, "idl")
    os.makedirs(dossier, exist_ok=True)
    chemin = None
    for nom in ("gave_seul.json" if gave_seul else "articles.json",):
        p = os.path.join(racine, "idl", nom)
        if os.path.exists(p):
            chemin = p
            break
    if not chemin:
        print(f"  articles introuvables dans {racine}/idl — lancez collecter_idl.py")
        return 0

    with open(chemin, encoding="utf-8") as f:
        articles = json.load(f)

    ecrits = 0
    for a in articles:
        texte = propre(a.get("texte") or "")
        if len(texte) < 400:
            continue
        auteur = (a.get("auteur") or "").strip() or "non attribué"
        objet = {
            "id": f"idl-{a.get('slug') or a.get('id')}",
            "titre": (a.get("titre") or "").strip(),
            "date": (a.get("date") or "")[:10],
            "url": a.get("url") or "",
            "source": "Institut des Libertés",
            "type": "article",
            "auteur": auteur,
            "texte": texte,
        }
        nom = re.sub(r"[^\w\-]+", "_", str(a.get("slug") or a.get("id")))[:80] + ".json"
        with open(os.path.join(dossier, nom), "w", encoding="utf-8") as f:
            json.dump(objet, f, ensure_ascii=False, indent=1)
        ecrits += 1
    print(f"  {ecrits} articles importés depuis {os.path.basename(chemin)}")
    return ecrits


def importer_videos(racine: str):
    """Transcriptions de vidéos publiques."""
    dossier = os.path.join(RACINE_CORPUS, "youtube")
    os.makedirs(dossier, exist_ok=True)
    source = os.path.join(racine, "yt")
    if not os.path.isdir(source):
        print(f"  {source} absent — lancez collecter_youtube.py")
        return 0

    # L'index des titres, s'il existe, évite d'afficher un identifiant brut.
    titres = {}
    liste = os.path.join(source, "liste.tsv")
    if os.path.exists(liste):
        with open(liste, encoding="utf-8") as f:
            for ligne in f:
                cols = ligne.rstrip("\n").split("\t")
                if len(cols) >= 3:
                    titres[cols[0]] = cols[2]
                elif len(cols) == 2:
                    titres[cols[0]] = cols[1]

    ecrits = 0
    for nom in sorted(os.listdir(source)):
        if not nom.endswith(".fr.txt"):
            continue
        ident = nom.split(".")[0]
        with open(os.path.join(source, nom), encoding="utf-8", errors="replace") as f:
            texte = propre(f.read())
        if len(texte) < 400:
            continue
        objet = {
            "id": f"yt-{ident}",
            "titre": titres.get(ident, ident),
            "date": "", "url": f"https://www.youtube.com/watch?v={ident}",
            "source": "Université de l'Épargne (YouTube)",
            "type": "video",
            "auteur": "non attribué",
            "texte": texte,
        }
        with open(os.path.join(dossier, ident + ".json"), "w", encoding="utf-8") as f:
            json.dump(objet, f, ensure_ascii=False, indent=1)
        ecrits += 1
    print(f"  {ecrits} transcriptions importées depuis {source}")
    return ecrits


def importer_manuels(racine: str):
    """Le manifeste et la bibliographie déjà rédigés."""
    dossier = os.path.join(os.path.normpath(os.path.join(ICI, "..", "corpus")), "manuels")
    os.makedirs(dossier, exist_ok=True)
    ecrits = 0
    for nom in os.listdir(racine):
        if not nom.lower().startswith("charles-gave") or not nom.endswith(".md"):
            continue
        p = os.path.join(racine, nom)
        if os.path.isfile(p):
            with open(p, encoding="utf-8", errors="replace") as src:
                contenu = src.read()
            with open(os.path.join(dossier, nom), "w", encoding="utf-8") as dst:
                dst.write(contenu)
            ecrits += 1
    if ecrits:
        print(f"  {ecrits} documents du manifeste copiés")
    return ecrits


def principal():
    p = argparse.ArgumentParser()
    p.add_argument("--racine", default="/home/user",
                   help="dossier qui contient idl/ et yt/")
    p.add_argument("--source", default="tout",
                   choices=["tout", "gave", "idl", "videos", "manuels"],
                   help="gave : les 669 articles signés Charles Gave, le meilleur point de départ")
    args = p.parse_args()

    total = 0
    if args.source in ("tout", "gave", "idl"):
        total += importer_idl(args.racine, gave_seul=(args.source == "gave"))
    if args.source in ("tout", "videos"):
        total += importer_videos(args.racine)
    if args.source in ("tout", "manuels"):
        total += importer_manuels(args.racine)

    print(f"\n✔ {total} documents prêts dans corpus/brut")
    print("  Étape suivante : python3 scripts/fabriquer_chunks.py")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
