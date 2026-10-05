#!/usr/bin/env python3
"""Indexe les passages du corpus qui ne sont pas encore dans Vectorize.

Trois garanties, dans cet ordre d'importance :

  1. Reprise — le fichier `corpus/.indexation.json` retient les identifiants
     déjà envoyés, et il est écrit après CHAQUE lot, pas à la fin.
  2. Aucune remise à zéro — avant d'envoyer, le script demande au service les
     passages qu'il connaît déjà (`POST /admin/presents`, qui ne consomme pas
     de neurons). Un passage présent dans l'index n'est jamais renvoyé, même si
     le fichier de reprise a été perdu (exécution annulée, échec, nouvel
     espace de travail).
  3. Quota — quand le quota gratuit du jour est épuisé, le script s'arrête
     proprement (code 0) en disant combien de passages restent : il suffit de
     relancer le lendemain, rien n'est perdu et le point de reprise est
     enregistré par le workflow.

Pourquoi c'est long, en clair :
  quota gratuit Cloudflare Workers AI  10 000 neurons par jour (00:00 UTC),
                                       partagés avec les questions posées à
                                       l'application ;
  embedding bge-base-en-v1.5           6 058 neurons par million de tokens ;
  un passage (1 200 caractères)        ≈ 330 tokens ≈ 2 neurons ;
  corpus complet (7 226 passages)      ≈ 13 400 neurons ≈ 1,4 jour de quota ;
  tranche de 3 000 passages            ≈ 5 500 neurons, il reste ≈ 4 500
                                       neurons pour les questions du jour.

Usage :
    python3 ia/scripts/indexer.py                  # tranche de 3 000, lots de 50
    python3 ia/scripts/indexer.py --tranche 1800   # prudent : 4 jours au lieu de 3
    python3 ia/scripts/indexer.py --etat           # où en est l'index, sans rien envoyer
    python3 ia/scripts/indexer.py --recommencer    # ignore le fichier de reprise
"""

import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

RACINE = pathlib.Path(__file__).resolve().parents[1]
CHUNKS = RACINE / "corpus" / "chunks.jsonl"
ETAT = RACINE / "corpus" / ".indexation.json"

# Un quota épuisé arrive tantôt en 429, tantôt en 500 avec le texte de l'erreur
# du modèle dans le corps de la réponse : on regarde les deux.
MOTS_QUOTA = ("quota", "neuron", "rate limit", "429", "exceeded", "capacity", "too many")


def appel(url, route, corps, cle, methode="POST", timeout=300):
    """Un appel HTTP JSON au service, erreurs comprises."""
    donnees = json.dumps(corps).encode() if corps is not None else None
    entetes = {"content-type": "application/json", "x-cle-admin": cle}
    requete = urllib.request.Request(url + route, data=donnees, headers=entetes, method=methode)
    with urllib.request.urlopen(requete, timeout=timeout) as reponse:
        return json.loads(reponse.read() or b"{}")


def lire_passages():
    """Les passages du corpus, sans doublon d'identifiant.

    Un identifiant présent deux fois dans le fichier serait embarqué deux fois :
    les neurons sont facturés à l'entrée, le second calcul ne sert à rien.
    """
    if not CHUNKS.exists():
        print(f"ERREUR : {CHUNKS} est introuvable. Lancez fabriquer_chunks.py d'abord.")
        return None
    vus, passages = set(), []
    for ligne in CHUNKS.read_text(encoding="utf-8").splitlines():
        if not ligne.strip():
            continue
        passage = json.loads(ligne)
        identifiant = str(passage.get("id") or "")
        if not identifiant or identifiant in vus:
            continue
        vus.add(identifiant)
        passages.append(passage)
    return passages


def lire_etat(recommencer=False):
    if recommencer or not ETAT.exists():
        return set()
    try:
        return set(json.loads(ETAT.read_text(encoding="utf-8")).get("ids", []))
    except Exception:
        print("  (fichier de reprise illisible, il sera reconstruit)")
        return set()


def ecrire_etat(ids):
    ETAT.write_text(
        json.dumps({"ids": sorted(ids), "total": len(ids)}, ensure_ascii=False),
        encoding="utf-8",
    )


def deja_presents(url, cle, ids, taille=100):
    """Demande au service lesquels de ces passages sont déjà dans l'index.

    Route gratuite : elle lit l'index, elle ne fait tourner aucun modèle.
    En cas de doute (service muet), on renvoie une liste vide : le pire qui
    puisse arriver est de réenvoyer un passage, jamais d'en oublier un.
    """
    presents = []
    for i in range(0, len(ids), taille):
        try:
            reponse = appel(url, "/admin/presents", {"ids": ids[i : i + taille]}, cle, timeout=60)
            presents.extend(str(x) for x in reponse.get("presents", []))
        except Exception:
            return presents
    return presents


def montrer_etat(url, cle):
    try:
        etat = appel(url, "/admin/etat", None, cle, methode="GET", timeout=60)
    except urllib.error.HTTPError as err:
        print("HTTP", err.code, err.read().decode(errors="replace")[:300])
        return 1
    except Exception as err:
        print("Service injoignable :", err)
        return 1
    print(json.dumps(etat, ensure_ascii=False, indent=1))
    return 0


def principal():
    analyseur = argparse.ArgumentParser(description="Indexe le corpus par tranches.")
    analyseur.add_argument("--taille", type=int, default=50, help="passages par requête (50)")
    analyseur.add_argument("--tranche", type=int, default=3000, help="passages par exécution (3000 ; 0 = tout)")
    analyseur.add_argument("--recommencer", action="store_true", help="ignore le fichier de reprise")
    analyseur.add_argument("--etat", action="store_true", help="affiche l'état de l'index et sort")
    options = analyseur.parse_args()

    url = os.getenv("UDE_URL", "").rstrip("/")
    cle = os.getenv("UDE_CLE_ADMIN", "")
    if not url or not cle:
        print("ERREUR : UDE_URL ou UDE_CLE_ADMIN manque.")
        return 1

    if options.etat:
        return montrer_etat(url, cle)

    morceaux = lire_passages()
    if morceaux is None:
        return 1
    deja = lire_etat(options.recommencer)
    nouveaux = [m for m in morceaux if m.get("id") not in deja]
    print(f"Corpus : {len(morceaux)} passages — {len(deja)} dans le point de reprise — {len(nouveaux)} à envoyer.")
    if not nouveaux:
        print("Tout ce corpus est déjà indexé.")
        return 0

    # Filet : même sans point de reprise, on ne renvoie pas ce que l'index
    # contient déjà. On avance dans le corpus tant que la tranche n'est pas
    # pleine, pour ne pas s'arrêter sur un premier bloc entièrement indexé.
    limite = options.tranche or len(nouveaux)
    tranche, ignores, curseur = [], 0, 0
    while curseur < len(nouveaux) and len(tranche) < limite:
        bloc = nouveaux[curseur : curseur + 100]
        presents = set(deja_presents(url, cle, [m["id"] for m in bloc]))
        ignores += len(presents)
        tranche.extend(m for m in bloc if m["id"] not in presents)
        curseur += len(bloc)
    tranche = tranche[:limite]
    if ignores:
        print(f"  dont {ignores} déjà dans l'index (vérifié auprès du service) — ignorés, aucun neuron dépensé.")
    if not tranche:
        print("Rien à envoyer : l'index contient déjà tout ce corpus.")
        return 0

    print(f"{len(tranche)} passages à indexer, par lots de {options.taille}.")
    envoyes = 0
    for debut in range(0, len(tranche), options.taille):
        paquet = tranche[debut : debut + options.taille]
        try:
            reponse = appel(url, "/admin/indexation", {"morceaux": paquet}, cle)
        except urllib.error.HTTPError as err:
            corps = err.read().decode(errors="replace")[:400]
            if err.code == 429 or any(mot in corps.lower() for mot in MOTS_QUOTA):
                print(f"\nQuota gratuit du jour épuisé (HTTP {err.code}). {envoyes} passages indexés pendant cette exécution.")
                print(f"Relancez cette action demain : le point de reprise est enregistré, la suite reprendra ici.")
                return 0
            print("HTTP", err.code, corps)
            return 1
        except KeyboardInterrupt:
            ecrire_etat(deja)
            print(f"\nInterrompu. {envoyes} passages indexés, point de reprise enregistré.")
            return 1

        deja.update(m["id"] for m in paquet)
        ecrire_etat(deja)
        etat = reponse.get("corpus", {})
        envoyes += len(paquet)
        print(f"  {envoyes}/{len(tranche)} — index : {etat.get('vecteurs', etat.get('passages', '?'))} passages")
        time.sleep(0.25)

    print("Tranche terminée. Restants :", max(0, len(nouveaux) - len(tranche)))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(principal())
    except KeyboardInterrupt:
        print("\nInterrompu à la main : le point de reprise contient tout ce qui a été indexé.")
        sys.exit(1)
