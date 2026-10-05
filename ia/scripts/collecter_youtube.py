#!/usr/bin/env python3
"""Collecte les sous-titres des vidéos PUBLIQUES de l'Université de l'Épargne.

PRINCIPE, ET LIGNE À NE PAS FRANCHIR
On ne télécharge que ce qui est public et accessible sans compte. Aucun
identifiant n'est accepté, aucun cookie n'est utilisé, aucun contenu réservé
aux abonnés n'est aspiré. Les vidéos du Daily d'Initié accessibles uniquement
après connexion sont donc HORS DU PÉRIMÈTRE de ce script : si vous y avez
accès, exportez-les vous-même et déposez les fichiers dans
`corpus/brut/youtube/` au format produit ci-dessous, le reste de la chaîne les
traitera de la même façon.

Ce qu'on récupère : les sous-titres (français), pas la vidéo. C'est le texte
qui nourrit le corpus, et c'est aussi ce que la loi permet le plus sereinement
(citation et indexation pour usage personnel, sans republication).

Prérequis :
    pip install yt-dlp

Usage :
    python3 scripts/collecter_youtube.py
    python3 scripts/collecter_youtube.py --limite 20   # test sur 20 vidéos
"""

import argparse
import json
import os
import re
import subprocess
import sys

# Les chaînes à suivre. Modifiez cette liste comme bon vous semble : ce sont
# des URL publiques, aucune n'exige de compte.
CHAÎNES = [
    ("Université de l'Épargne", "https://www.youtube.com/@CharlesGaveUDE/videos"),
    ("Institut des Libertés", "https://www.youtube.com/@institutdeslibertes/videos"),
]

SORTIE = os.path.join(os.path.dirname(__file__), "..", "corpus", "brut", "youtube")


def vtt_vers_texte(chemin: str) -> str:
    """WebVTT vers texte continu. Les doublons de lignes (sous-titres qui se
    recouvrent) sont supprimés — sinon le corpus gonfle de répétitions."""
    try:
        with open(chemin, "r", encoding="utf-8", errors="replace") as f:
            brut = f.read()
    except OSError:
        return ""
    brut = re.sub(r"(?s)WEBVTT.*?\n\n", "", brut)
    brut = re.sub(r"<\d{2}:\d{2}:\d{2}\.\d{3}>", " ", brut)
    brut = re.sub(r"^\d+$", "", brut, flags=re.M)
    brut = re.sub(r"\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}", "", brut)
    brut = re.sub(r"<[^>]+>", "", brut)
    lignes = []
    for ligne in brut.splitlines():
        ligne = ligne.strip()
        if not ligne:
            continue
        if lignes and lignes[-1] == ligne:      # doublon d'affichage
            continue
        lignes.append(ligne)
    return " ".join(lignes).strip()


def principal():
    p = argparse.ArgumentParser()
    p.add_argument("--limite", type=int, default=0, help="nombre maximum de vidéos par chaîne")
    args = p.parse_args()

    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
    except Exception:
        print("✘ yt-dlp est absent. Installez-le : pip install yt-dlp")
        return 1

    os.makedirs(SORTIE, exist_ok=True)
    total = 0

    for nom, url in CHAÎNES:
        print(f"\n▶ {nom}")
        limite = ["--playlist-end", str(args.limite)] if args.limite else []
        commande = [
            "yt-dlp",
            "--skip-download",                 # jamais la vidéo : le texte suffit
            "--write-subs", "--write-auto-subs",
            "--sub-langs", "fr.*",
            "--sub-format", "vtt",
            "--no-warnings",
            "--restrict-filenames",
            "--print", "id",
            "--print", "title",
            "--print", "upload_date",
            "--print", "webpage_url",
            "-o", os.path.join(SORTIE, "%(id)s.%(ext)s"),
        ] + limite + [url]

        try:
            res = subprocess.run(commande, capture_output=True, text=True, timeout=3600)
        except subprocess.TimeoutExpired:
            print("  délai dépassé, on passe à la chaîne suivante")
            continue

        if res.returncode != 0 and not os.listdir(SORTIE):
            print(f"  échec : {res.stderr.strip()[:300]}")
            continue

        # yt-dlp écrit les sous-titres à côté ; on les convertit en JSON.
        for fichier in sorted(os.listdir(SORTIE)):
            if not fichier.endswith(".vtt"):
                continue
            ident = fichier.split(".")[0]
            langue = fichier.split(".")[1] if fichier.count(".") >= 2 else "fr"
            texte = vtt_vers_texte(os.path.join(SORTIE, fichier))
            os.remove(os.path.join(SORTIE, fichier))
            if len(texte) < 200:
                continue
            objet = {
                "id": f"yt-{ident}",
                "titre": ident,                       # complété par la métadonnée ci-dessous si disponible
                "date": "", "url": f"https://www.youtube.com/watch?v={ident}",
                "source": nom, "type": "video",
                "auteur": "non attribué",
                "texte": texte,
            }
            with open(os.path.join(SORTIE, ident + ".json"), "w", encoding="utf-8") as f:
                json.dump(objet, f, ensure_ascii=False, indent=1)
            total += 1

    print(f"\n✔ {total} transcriptions enregistrées dans {os.path.normpath(SORTIE)}")
    print("  Rappel : seules les vidéos publiques, sans compte, sont traitées.")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
