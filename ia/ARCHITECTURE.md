# Comment ça marche

## Le principe en trois phrases

Votre question est transformée en un vecteur (une suite de nombres qui en
résume le sens). On cherche dans l'index les passages du corpus dont le vecteur
est le plus proche. On donne ces passages au modèle avec des règles strictes, et
il répond **uniquement** avec eux — en citant leur numéro.

## Le trajet d'une question

```
Votre téléphone (APK)          ou          Streamlit
        │                                     │
        └────────────┬────────────────────────┘
                     │  POST /discussion
                     │  { question, historique, contexte }
                     ▼
        ┌────────────────────────────────┐
        │  Cloudflare Worker             │
        │                                │
        │  1. cache : déjà répondu ?     │
        │  2. embedding de la question   │
        │  3. Vectorize : 6 passages     │
        │  4. prompt + règles + passages │
        │  5. Workers AI (Llama 3.1 8B)  │
        │  6. réponse + sources          │
        └────────────────────────────────┘
                     │
                     ▼
             réponse affichée avec ses sources
```

## Les pièces

| Pièce | Rôle | Gratuit jusqu'à |
|---|---|---|
| Cloudflare Workers | exécute le service | 100 000 requêtes/jour |
| Workers AI — embedding | transforme un texte en vecteur | 10 000 neurones/jour |
| Workers AI — génération | rédige la réponse | le même quota |
| Vectorize | l'index du corpus | 20 millions de vecteurs |
| KV | cache des réponses (24 h) | 100 000 lectures/jour |
| GitHub | le corpus, le code, la tâche hebdomadaire | — |
| GitHub Actions | la mise à jour automatique | 2 000 minutes/mois |

## Les routes du service

| Route | Qui l'appelle | Ce qu'elle fait |
|---|---|---|
| `POST /discussion` | l'APK, Streamlit | cherche, puis répond |
| `GET /sante` | les deux | dit si le service vit et combien de passages il connaît |
| `POST /admin/indexation` | vos scripts | écrit les passages dans l'index |
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

## Pourquoi la clé du modèle n'est pas dans l'application

Une APK se décompresse avec un outil gratuit en quelques minutes : tout ce
qu'elle contient est public. Les secrets vivent donc côté Cloudflare, et
l'application ne détient qu'une clé de service révocable — que vous pouvez
changer en une commande si elle fuit.

## Ce qui se passe quand le corpus n'a rien

C'est le cas le plus important, et le plus mal traité par les assistants
ordinaires. Le service détecte qu'aucun passage ne dépasse le seuil de
similarité, et le dit au modèle dans le prompt :

> « AUCUN PASSAGE DU CORPUS NE CORRESPOND À CETTE QUESTION. Tu appliques donc
> strictement la règle 2 : tu dis « le corpus ne le dit pas », puis tu donnes le
> raisonnement général en précisant qu'il ne vient pas du corpus. »

L'application affiche alors, sous la réponse :

> Aucun passage du corpus ne correspondait : la réponse ne s'appuie sur aucun
> texte.

Un vide assumé vaut mieux qu'un remplissage.
