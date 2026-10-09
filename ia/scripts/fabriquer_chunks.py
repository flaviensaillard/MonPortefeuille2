#!/usr/bin/env python3
"""Découpe le corpus en passages indexables.

POURQUOI DÉCOUPER
Un article de 6 000 caractères ne tient pas dans une fenêtre de contexte, et
surtout : si on l'indexe entier, la recherche renvoie l'article, pas le passage
qui répond. On découpe donc en morceaux d'environ 1 200 caractères, avec un
recouvrement de 150 pour ne pas couper une idée en deux au mauvais endroit.

Chaque morceau garde avec lui sa provenance (source, titre, date, URL) : c'est
cette provenance qui devient la citation [n] dans la réponse.

Entrée  : corpus/brut/**/*.json  +  corpus/manuels/*.md
Sortie  : corpus/chunks.jsonl
"""

import hashlib
import json
import os
import re
import sys

ICI = os.path.dirname(__file__)
RACINE = os.path.normpath(os.path.join(ICI, ".."))
BRUT = os.path.join(RACINE, "corpus", "brut")
MANUELS = os.path.join(RACINE, "corpus", "manuels")
SORTIE = os.path.join(RACINE, "corpus", "chunks.jsonl")

TAILLE = 1200
RECOUVREMENT = 150

# Identifiant d'un passage : 64 caractères au plus (contrainte de Vectorize).
# Quand deux passages tombent sur le même identifiant tronqué, le second reçoit
# une empreinte de son contenu à la place du suffixe perdu. Avant ce correctif,
# la troncature supprimait « -{i} » pour les longs articles : 1 143 passages
# partageaient leur identifiant avec le premier passage de leur article, et
# n'étaient jamais indexés.
LONGUEUR_ID = 64
LONGUEUR_EMPREINTE = 8


def desambiguiser(candidat, passage, utilises):
    """Rend unique un identifiant déjà pris, en gardant le début du candidat.

    Déterministe : la même entrée donne toujours le même identifiant, quel que
    soit l'ordre de lecture des fichiers. `utilises` est mis à jour.
    """
    if candidat not in utilises:
        utilises.add(candidat)
        return candidat
    empreinte = hashlib.sha1(passage.encode("utf-8")).hexdigest()[:LONGUEUR_EMPREINTE]
    base = candidat[: LONGUEUR_ID - LONGUEUR_EMPREINTE - 1]
    nouveau = f"{base}-{empreinte}"
    if nouveau in utilises:
        raise RuntimeError(f"identifiant impossible à rendre unique : {candidat}")
    utilises.add(nouveau)
    return nouveau


def identifiant_passage(doc_id, i, passage, utilises):
    """Identifiant du passage i d'un document, unique dans le fichier."""
    candidat = f"{doc_id}-{i}".replace(" ", "-")[:LONGUEUR_ID]
    return desambiguiser(candidat, passage, utilises)


def morceaux(texte: str, taille: int = TAILLE, recouvrement: int = RECOUVREMENT):
    """Découpe en respectant les paragraphes : on ne coupe pas au milieu d'une
    phrase quand on peut l'éviter."""
    paragraphes = [p.strip() for p in texte.split("\n") if p.strip()]
    if not paragraphes:
        return []
    blocs, courant = [], ""
    for p in paragraphes:
        if len(courant) + len(p) + 1 <= taille:
            courant = (courant + "\n" + p).strip()
        else:
            if courant:
                blocs.append(courant)
            # un paragraphe plus long que la taille est coupé net
            while len(p) > taille:
                blocs.append(p[:taille])
                p = p[taille - recouvrement:]
            courant = p
    if courant:
        blocs.append(courant)

    # léger recouvrement : la fin du bloc précédent ouvre le suivant
    sortie = []
    for i, b in enumerate(blocs):
        if i and recouvrement:
            precedent = blocs[i - 1][-recouvrement:]
            if not b.startswith(precedent):
                b = precedent + " " + b
        sortie.append(b.strip())
    return sortie


def charger():
    """Tous les documents, quelle que soit leur origine."""
    docs = []
    for dossier in (BRUT, MANUELS):
        if not os.path.isdir(dossier):
            continue
        for chemin, sous_dossiers, fichiers in os.walk(dossier):
            # Ordre stable : deux exécutions produisent les mêmes identifiants.
            sous_dossiers.sort()
            for nom in sorted(fichiers):
                p = os.path.join(chemin, nom)
                try:
                    if nom.endswith(".json"):
                        with open(p, encoding="utf-8") as f:
                            docs.append(json.load(f))
                    elif nom.endswith((".md", ".txt")):
                        with open(p, encoding="utf-8") as f:
                            texte = f.read()
                        docs.append({
                            "id": "doc-" + re.sub(r"\W+", "-", nom),
                            "titre": nom.rsplit(".", 1)[0].replace("-", " ").replace("_", " "),
                            "date": "", "url": "",
                            "source": os.path.basename(chemin),
                            "type": "document",
                            "auteur": "non attribué",
                            "texte": texte,
                        })
                except Exception as exc:
                    print(f"  ignoré {p} : {exc}")
    return docs


def principal():
    docs = charger()
    if not docs:
        print("✘ Aucun document dans corpus/brut ou corpus/manuels.")
        print("  Lancez d'abord : python3 scripts/collecter_idl.py")
        return 1

    ecrits = 0
    utilises = set()
    with open(SORTIE, "w", encoding="utf-8") as out:
        for doc in docs:
            titre = doc.get("titre") or ""
            source = doc.get("source") or "source inconnue"
            date = doc.get("date") or ""
            url = doc.get("url") or ""
            type_ = doc.get("type") or "texte"
            auteur = doc.get("auteur") or "non attribué"
            for i, passage in enumerate(morceaux(doc.get("texte") or "")):
                objet = {
                    "id": identifiant_passage(doc.get("id", "doc"), i, passage, utilises),
                    "titre": titre,
                    "source": f"{source} — {auteur}",
                    "date": date,
                    "url": url,
                    "type": type_,
                    "texte": passage,
                }
                out.write(json.dumps(objet, ensure_ascii=False) + "\n")
                ecrits += 1

    print(f"✔ {len(docs)} documents → {ecrits} passages dans {os.path.relpath(SORTIE, RACINE)}")
    print(f"  Poids estimé pour l'indexation : environ {ecrits * 2} neurons (2 par passage),")
    print(f"  soit environ {max(1, round(ecrits * 2 / 10000, 1))} jour(s) de quota gratuit (10 000 neurons/jour).")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
