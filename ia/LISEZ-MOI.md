# IA Université de l'Épargne — déploiement 1.6.1

Le guide complet pour débutant est livré séparément : `GUIDE-DEPLOIEMENT-IA-DEBUTANT.html`.

## Fonctions

- Recherche dans le corpus Vectorize, réponse Workers AI.
- Phrase imposée sans source : **« Le corpus ne le dit pas, mais selon mon interprétation: … »**.
- Filet anti-invention : chaque chiffre est recherché dans les passages cités et les agrégats.
- `GET /sante` expose la date `corpus.majLe`, affichée dans Android et Streamlit.
- Lecture Supabase côté Worker : la clé secrète ne quitte jamais Cloudflare ; seuls des agrégats sont transmis au modèle.
- Mise à jour GitHub hebdomadaire des articles et sous-titres publics.

## Secrets Cloudflare

`CLE_SERVICE`, `CLE_ADMIN`, `SUPABASE_URL`, `SUPABASE_CLE`.

## Secrets GitHub Actions

`UDE_URL`, `UDE_CLE_ADMIN`.

## Secrets Streamlit

`UDE_URL`, `UDE_CLE_SERVICE`.

Aucun identifiant Université de l'Épargne n'est accepté ou nécessaire.
