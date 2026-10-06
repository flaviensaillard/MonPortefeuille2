# Comment ça marche

## Le principe en trois phrases

Votre question est transformée en un vecteur (une suite de nombres qui en
résume le sens). On cherche dans l'index les passages du corpus dont le vecteur
est le plus proche **et** on va chercher sur le web les informations extérieures
qui manquent. Le modèle reçoit les deux, plus les agrégats de votre
portefeuille et votre horizon de retraite, et il rend une **analyse** en trois
paragraphes — pas une citation.

## Le trajet d'une question

```
Votre téléphone (APK)          ou          Streamlit
        │                                     │
        └────────────┬────────────────────────┘
                     │  POST /discussion
                     │  { question, historique, contexte, horizon, web }
                     ▼
        ┌────────────────────────────────────────────┐
        │  Cloudflare Worker — version 1.7.0          │
        │                                             │
        │  1. cache : déjà répondu ?                  │
        │  2. embedding de la question                │
        │  3. Vectorize : 6 passages du corpus        │
        │  4. recherche extérieure (le web)           │
        │       Brave → DuckDuckGo → SearXNG →        │
        │       Wikipédia (sans clé) → [Cloudflare]   │
        │     + ouverture de 2 pages au maximum       │
        │  5. prompt = règles + horizon 2055 +        │
        │       passages [n] + sources [E n] +        │
        │       agrégats du portefeuille              │
        │  6. Workers AI (Llama 3.1 8B)               │
        │  7. contrôle de la structure imposée        │
        │       ↳ seconde passe si la forme manque    │
        │  8. filet anti-invention (3 origines)       │
        └────────────────────────────────────────────┘
                     │
                     ▼
     réponse en trois blocs + sources du corpus + sources extérieures
```

## Ce que la réponse contient

| Champ | Ce qu'il dit |
|---|---|
| `reponse` | le texte, trois paragraphes, tournures imposées |
| `format` | `conforme` + le détail (`corpus`, `analyse`, `decision`, `citations`, `citationsExternes`) et `repasse` (seconde passe utilisée) |
| `sources` | les passages du corpus retenus, avec leur score |
| `sourcesExternes` | les sources web, numérotées `E1`, `E2`, avec titre, domaine, date |
| `internet` | `utilise`, `moteur`, `requete`, `resultats`, `pagesLues`, `note` |
| `horizon` | année de départ, années restantes, objectif |
| `verification` | `verifie`, `suspects`, `externes`, `note`, `gravite` (`avertissement` / `info` / `null`) |
| `interpretation` | `true` seulement quand ni le corpus ni l'extérieur n'ont rien apporté |

## Les pièces

| Pièce | Rôle | Gratuit jusqu'à |
|---|---|---|
| Cloudflare Workers | exécute le service | 100 000 requêtes/jour |
| Workers AI — embedding | transforme un texte en vecteur | 10 000 neurones/jour |
| Workers AI — génération | rédige la réponse | le même quota |
| Vectorize | l'index du corpus | 20 millions de vecteurs |
| KV | cache des réponses (24 h) | 100 000 lectures/jour |
| DuckDuckGo, Wikipédia | la recherche extérieure, sans clé | — |
| Brave / SearXNG | la recherche extérieure, en mieux | 2 000 requêtes/mois chez Brave |
| GitHub | le corpus, le code, la tâche hebdomadaire | — |
| GitHub Actions | la mise à jour automatique | 2 000 minutes/mois |

La recherche extérieure ne consomme **aucun** neurone : ni le moteur, ni
l'ouverture des pages ne passent par Workers AI. Ce qu'elle coûte, ce sont des
jetons d'entrée en plus dans le prompt (et donc quelques neurones de plus par
réponse).

## Les routes du service

| Route | Qui l'appelle | Ce qu'elle fait |
|---|---|---|
| `POST /discussion` | l'APK, Streamlit | cherche, va sur le web, puis répond |
| `GET /sante` | les deux | dit si le service vit, combien de passages il connaît, et si la recherche extérieure est active |
| `POST /admin/indexation` | vos scripts | écrit les passages dans l'index |
| `POST /admin/presents` | vos scripts | dit lesquels de ces passages sont déjà indexés (aucun neurone dépensé) |
| `GET /admin/etat` | vous | nombre de vecteurs, date de dernière indexation |
| `POST /admin/mise-a-jour` | le bouton « ⟳ Corpus » | relance la tâche GitHub |

Les deux clés séparent les usages : `CLE_SERVICE` permet de discuter,
`CLE_ADMIN` permet d'écrire dans l'index. L'application Android et Streamlit ne
connaissent que la première.

## Ce que l'assistant reçoit de votre portefeuille

La **même forme** dans les deux applications, pour que la même question donne la
même lecture :

```json
{
  "horizon": { "anneeDepartRetraite": 2055, "anneesRestantes": 29,
               "objectif": "préparer la retraite : …" },
  "uniteDeCompte": "USD", "deviseDeDepense": "EUR", "tauxEurUsd": 1.125,
  "capitalInvesti": 79959, "cashDisponible": 1240,
  "epargnePrecaution": 11433, "patrimoineTotal": 92632,
  "apportsNets": 67166,
  "poches": [
    { "nom": "Énergie", "poids": 0.42, "cible": 0.30, "bande": 0.05, "horsBande": true }
  ],
  "principalesLignes": [{ "ticker": "XDW0.L", "poids": 0.28 }]
}
```

Des agrégats. **Jamais** un identifiant, un numéro de compte, une adresse ou une
ligne d'écriture. Le test `le contexte contient des écritures` de la suite
automatique vérifie ce point à chaque livraison.

## Ce qui sort du service

- vers Cloudflare (modèle, Vectorize) : la question, les passages, les agrégats
  et le texte des pages lues ;
- vers le moteur de recherche extérieur : **la question, avec les montants
  retirés**. Un patrimoine de 92 632 € ne part pas chez un moteur ; « moyenne
  mobile 7 ans or » y va. `WEB = "non"` coupe tout, et l'application Android
  comme la page Streamlit ont une case pour le faire question par question.

## Pourquoi la clé du modèle n'est pas dans l'application

Une APK se décompresse avec un outil gratuit en quelques minutes : tout ce
qu'elle contient est public. Les secrets vivent donc côté Cloudflare, et
l'application ne détient qu'une clé de service révocable — que vous pouvez
changer en une commande si elle fuit.

## Ce qui se passe quand le corpus n'a rien

C'est le cas le plus important, et le plus mal traité par les assistants
ordinaires. Le service le détecte, et l'écrit noir sur blanc dans le prompt :

> « AUCUN PASSAGE DU CORPUS NE RÉPOND À CETTE QUESTION. Tu écris donc, au début
> du paragraphe 1 : « Selon le corpus, ce point n'y est pas traité. » »

Le paragraphe 2 prend alors le relais avec ce que le web a donné et ce que vos
agrégats disent. Si le web n'a rien donné non plus, la réponse est marquée comme
une **interprétation** (« Ni le corpus ni l'extérieur n'ont de passage sur ce
point ») et l'application l'affiche comme telle.

Un vide assumé vaut mieux qu'un remplissage.

## Quand le modèle oublie la forme

Un modèle de 8 milliards de paramètres oublie parfois une consigne. Le service
mesure donc la forme (`format.conforme`) au lieu de la supposer, et une seconde
passe — une seule — réécrit la réponse **sans toucher au fond** : mêmes
chiffres, mêmes renvois, mêmes conseils de prudence. C'est ce qui rend la
tournure stable dans le temps. Coût : une génération supplémentaire, uniquement
quand c'est nécessaire (`REPARATION = "non"` pour couper).
