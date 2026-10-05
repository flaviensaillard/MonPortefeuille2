# IA Université de l'Épargne — déploiement 1.6.1

Le guide complet pour débutant est livré séparément : `GUIDE-DEPLOIEMENT-IA-DEBUTANT.html`.

Pour l'indexation initiale du corpus — clic par clic, jour par jour — voir
`GUIDE-INDEXATION-PAS-A-PAS.md` à la racine du dépôt.

## Fonctions

- Recherche dans le corpus Vectorize, réponse Workers AI.
- Phrase imposée sans source : **« Le corpus ne le dit pas, mais selon mon interprétation: … »**.
- Filet anti-invention : chaque chiffre est recherché dans les passages cités et les agrégats.
- `GET /sante` expose la date `corpus.majLe`, affichée dans Android et Streamlit.
- Lecture Supabase côté Worker : la clé secrète ne quitte jamais Cloudflare ; seuls des agrégats sont transmis au modèle.
- Mise à jour GitHub hebdomadaire des articles et sous-titres publics.

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

`CLE_SERVICE`, `CLE_ADMIN`, `SUPABASE_URL`, `SUPABASE_CLE`.

## Secrets GitHub Actions

`UDE_URL`, `UDE_CLE_ADMIN`.

## Secrets Streamlit

`UDE_URL`, `UDE_CLE_SERVICE`.

Aucun identifiant Université de l'Épargne n'est accepté ou nécessaire.
