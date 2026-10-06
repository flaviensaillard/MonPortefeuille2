# IA Université de l'Épargne — déploiement 1.7.0

Le guide du déploiement initial pour débutant est livré séparément :
`GUIDE-DEPLOIEMENT-IA-DEBUTANT.html`.

Pour l'indexation initiale du corpus — clic par clic, jour par jour — voir
`GUIDE-INDEXATION-PAS-A-PAS.md` à la racine du dépôt.

**Pour changer la façon dont l'assistant répond** — horizon 2055, analyse au
lieu de citation, recherche extérieure — tout est dans
`GUIDE-IA-ANALYSE-LONG-TERME.md`, à la racine du dépôt.

## Fonctions

- Recherche dans le corpus Vectorize **et** recherche extérieure sur le web
  (Brave si une clé est fournie, sinon DuckDuckGo, SearXNG, puis Wikipédia —
  les trois derniers sans compte).
- Réponse en trois paragraphes, avec les tournures imposées :
  **« Selon le corpus, … »**, **« En me basant sur tes données, sur le corpus et
  sur les informations extérieures que j'ai trouvées, … »**, **« Ce qui dépend
  de toi : … »**.
- Horizon de très long terme (départ à la retraite en 2055 par défaut) transmis
  à chaque question ; chaque réponse est jugée à cette aune.
- Sources extérieures numérotées `[E1]`, `[E2]`, affichées avec la réponse comme
  les passages du corpus.
- Contrôle de la structure imposée (`format.conforme`) et seconde passe de
  remise en forme quand le modèle l'oublie.
- Filet anti-invention à trois origines : corpus, pages extérieures lues,
  agrégats du portefeuille.
- `GET /sante` expose la version, la date `corpus.majLe` et l'état de la
  recherche extérieure.
- Lecture Supabase côté Worker : la clé secrète ne quitte jamais Cloudflare ;
  seuls des agrégats sont transmis au modèle. Les montants sont retirés des
  requêtes envoyées aux moteurs de recherche extérieurs.
- Mise à jour GitHub hebdomadaire des articles et sous-titres publics.

## Réglages utiles (variables Cloudflare)

| Variable | Défaut | Effet |
|---|---|---|
| `HORIZON_ANNEE` | `2055` | année de départ à la retraite |
| `OBJECTIF` | préparer la retraite | objectif rappelé au modèle |
| `WEB` | `auto` | `auto`, `toujours`, ou `non` pour couper toute recherche extérieure |
| `MOTEUR_WEB` | `auto` | force `brave`, `duckduckgo`, `searxng`, `wikipedia` ou `cloudflare` |
| `REPARATION` | `oui` | `non` pour désactiver la seconde passe de mise en forme |

Secrets facultatifs : `BRAVE_CLE` (recherche de meilleure qualité),
`SEARXNG_URL` (votre instance SearXNG), `CF_WEB="oui"` (API Web Search de
Cloudflare, facturée à l'usage).

## Combien de temps prend l'indexation initiale

C'est long, et c'est le quota qui l'impose — pas le robot. Le compte exact :

| | |
|---|---|
| quota gratuit Workers AI | 10 000 neurons par jour, remis à zéro à 00:00 UTC |
| embedding `bge-base-en-v1.5` | 6 058 neurons par million de tokens |
| un passage (tronqué à 1 200 caractères) | ≈ 330 tokens ≈ **2 neurons** |
| les 7 226 passages du corpus | ≈ 13 400 neurons ≈ **1,4 jour de quota** |

Une tranche de 3 000 passages coûte ≈ 5 500 neurons : il reste de quoi poser des
questions à l'application le même jour. Comptez donc **2 à 3 relances** de
l'action « Indexation initiale », une par jour.

Le quota est partagé avec les questions posées à l'application (≈ 150 neurons
par réponse) : indexer et discuter le même jour, c'est possible, mais un gros
travail d'indexation peut épuiser le quota avant la fin de la tranche. Ce n'est
pas grave : le script s'arrête proprement, enregistre son point de reprise, et
la suite reprend au prochain lancement.

Comment savoir où vous en êtes :

```bash
python3 ia/scripts/indexer.py --etat      # ce que l'index contient vraiment
```

Deux règles à retenir :

- **ne pas annuler** une exécution en cours — et si elle a été annulée, rien
  n'est perdu : au lancement suivant, le script demande au service quels
  passages il connaît déjà (route `/admin/presents`, gratuite) et ne renvoie
  jamais deux fois le même passage ;
- **ne pas lancer deux indexations en même temps** (le workflow les met en
  file d'attente de lui-même) : elles se partageraient le quota pour rien.

## Secrets Cloudflare

`CLE_SERVICE`, `CLE_ADMIN`, `SUPABASE_URL`, `SUPABASE_CLE`. Facultatifs :
`BRAVE_CLE`, `SEARXNG_URL`.

## Secrets GitHub Actions

`UDE_URL`, `UDE_CLE_ADMIN`.

## Secrets Streamlit

`UDE_URL`, `UDE_CLE_SERVICE`. Facultatifs : `IA_HORIZON_ANNEE`, `IA_OBJECTIF`.

Aucun identifiant Université de l'Épargne n'est accepté ou nécessaire.
