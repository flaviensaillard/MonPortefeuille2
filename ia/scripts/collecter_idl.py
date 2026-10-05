#!/usr/bin/env python3
"""Collecte les articles de l'Institut des Libertés.

POURQUOI CE SCRIPT
Le corpus doit être à vous, relisible, et reconstructible : on ne branche pas
un service tiers qui « connaîtrait » le site. On télécharge les articles en
accès libre via l'API publique du site (WordPress), on les range en JSON, et
on les relit à chaque mise à jour.

CE QU'IL NE FAIT PAS
- aucun contournement d'accès : seuls les articles publics sont pris ;
- aucun identifiant : le script n'accepte ni login ni cookie ;
- aucune republication : le texte est stocké pour votre usage personnel
  d'indexation, il n'est pas redistribué.

Usage :
    python3 scripts/collecter_idl.py                 # tout récupérer
    python3 scripts/collecter_idl.py --recents 2     # les 200 derniers (mise à jour)
"""

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.request

API = "https://institutdeslibertes.org/wp-json/wp/v2/posts"
SORTIE = os.path.join(os.path.dirname(__file__), "..", "corpus", "brut", "idl")
ENTETES = {"User-Agent": "Mozilla/5.0 (corpus personnel, usage prive)"}


def texte_propre(brut: str) -> str:
    """HTML vers texte lisible, sans perdre les paragraphes."""
    t = re.sub(r"(?is)<(script|style|figure|noscript)[^>]*>.*?</\1>", " ", brut)
    t = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>", "\n", t)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    t = html.unescape(t)
    t = re.sub(r"[ \t\xa0]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def signature_gave(texte: str, titre: str) -> bool:
    """Détecte la signature « Charles Gave » plutôt que de la supposer.

    Le site n'expose pas l'auteur via son API publique. On ne devine donc
    jamais : on signale une signature TROUVÉE DANS LE TEXTE, ce qui est
    vérifiable, au lieu d'attribuer un auteur de confiance.
    """
    fin = texte[-800:]
    return bool(
        re.search(r"Charles\s+Gave", fin)
        or re.search(r"(?i)^charles\s+gave", titre.strip())
    )


def telecharger(page: int, par_page: int = 100):
    url = f"{API}?per_page={par_page}&page={page}"
    req = urllib.request.Request(url, headers=ENTETES)
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode("utf-8", "replace")), r.headers


def principal():
    p = argparse.ArgumentParser()
    p.add_argument("--recents", type=int, default=0,
                   help="ne prendre que les N dernières pages de 100 articles")
    p.add_argument("--par-page", type=int, default=100)
    args = p.parse_args()

    os.makedirs(SORTIE, exist_ok=True)
    deja = {f[:-5] for f in os.listdir(SORTIE) if f.endswith(".json")}

    page = 1
    ecrits = 0
    vus = 0
    max_pages = args.recents if args.recents else 40

    while page <= max_pages:
        try:
            articles, entetes = telecharger(page, args.par_page)
        except Exception as exc:
            print(f"  arrêt page {page} : {exc}")
            break
        if not articles:
            break
        if page == 1 and not args.recents:
            total = entetes.get("X-WP-TotalPages") or "?"
            print(f"  {entetes.get('X-WP-Total', '?')} articles annoncés, {total} pages")

        for a in articles:
            slug = str(a.get("slug") or a.get("id"))
            vus += 1
            if slug in deja:
                continue
            titre = html.unescape(re.sub("<[^>]+>", "", a.get("title", {}).get("rendered", "")))
            texte = texte_propre(a.get("content", {}).get("rendered", "") or "")
            if len(texte) < 400:
                continue                      # trop court pour être un article
            objet = {
                "id": f"idl-{slug}",
                "titre": titre.strip(),
                "date": (a.get("date") or "")[:10],
                "url": a.get("link") or "",
                "source": "Institut des Libertés",
                "type": "article",
                "auteur": "Charles Gave (signature dans le texte)" if signature_gave(texte, titre)
                          else "non attribué",
                "texte": texte,
            }
            chemin = os.path.join(SORTIE, slug + ".json")
            with open(chemin, "w", encoding="utf-8") as f:
                json.dump(objet, f, ensure_ascii=False, indent=1)
            ecrits += 1

        page += 1
        time.sleep(0.4)          # politesse envers le serveur

    print(f"✔ {vus} articles lus, {ecrits} nouveaux enregistrés dans {os.path.normpath(SORTIE)}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
