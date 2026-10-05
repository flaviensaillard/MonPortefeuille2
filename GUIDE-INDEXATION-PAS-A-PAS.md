# Guide pas à pas — finir l'indexation du corpus IA

Ce guide est écrit pour quelqu'un qui n'a jamais touché à GitHub. Chaque clic est
donné. Compte **5 minutes par jour pendant 2 à 3 jours**, et rien à installer sur
ton ordinateur.

Dernière mise à jour : 5 octobre 2026.

---

## 1. En deux mots, qu'est-ce qui se passe ?

Le robot qui tourne sur GitHub doit ranger les **7 226 passages** de ton corpus
dans un index, chez Cloudflare, pour que l'IA puisse les retrouver avant de
répondre. C'est ce qu'on appelle l'**indexation**.

Cet index coûte de la puissance de calcul, mesurée en « neurons ». Cloudflare en
offre **10 000 par jour, gratuitement**, et pas un de plus : quand le quota du
jour est épuisé, tout appel est refusé jusqu'au lendemain 00 h (heure UTC, soit
2 h du matin en France en été).

Or, mettre les 7 226 passages dans l'index coûte environ **13 400 neurons**. Il
faut donc **2 à 3 jours**, découpés en tranches quotidiennes. Ce n'est pas une
panne : c'est le prix de la gratuité.

En plus, la version du robot qui tournait jusqu'ici avait trois défauts qui
l'empêchaient de finir :

| Défaut | Ce que ça donnait |
|---|---|
| Il oubliait où il en était à chaque lancement | Il recommençait toujours au passage n° 1 |
| Il renvoyait des passages déjà indexés | Il dépensait le quota du jour pour rien |
| Le compteur affiché s'additionnait sans vérifier l'index | « 5 426 en attente » à chaque fois |

**J'ai corrigé ces trois points.** La correction est prête, sur ma branche, dans
la « pull request » n° 1. Le guide ci-dessous consiste simplement à :

1. **fusionner** cette correction dans la branche `main` (Étape 1) ;
2. **relancer le robot** (Étape 2) ;
3. **vérifier** puis **recommencer le lendemain** (Étapes 3 et 4).

Le reste (Étape 5, lexique, dépannage) sert au cas où.

---

## 2. Ce que tu vas faire — la liste à cocher

| | Étape | Où | Durée |
|---|---|---|---|
| ⬜ | 0. Vérifier que tu es connecté à GitHub | navigateur | 1 min |
| ⬜ | 1. Fusionner la correction (pull request n° 1) | GitHub | 2 min |
| ⬜ | 2. Lancer l'indexation du jour | GitHub | 1 min |
| ⬜ | 3. Vérifier que ça avance (3 preuves possibles) | GitHub / appli | 2 min |
| ⬜ | 4. Relancer demain, puis après-demain | GitHub | 1 min/jour |
| ⬜ | 5. *(facultatif)* Mettre à jour le service Cloudflare | Cloudflare | 5 min |

---

## Étape 0 — Avant de commencer

Ouvre ton navigateur et va sur :

**https://github.com/flaviensaillard/MonPortefeuille2**

Vérifie en haut à droite que tu es bien **connecté** (ton avatar s'affiche). Si tu
ne l'es pas, clique sur « Sign in » et connecte-toi. Tu ne peux pas faire les
étapes suivantes sans être connecté.

> 💡 Tu n'as rien à installer. Tout se fait dans le navigateur. Tu n'as besoin
> d'aucun mot de passe à me communiquer.

---

## Étape 1 — Fusionner la correction (2 minutes)

Tant que la correction n'est pas fusionnée, `main` — la seule branche que le
robot utilise — contient encore l'ancienne version défectueuse.

### 1.1 Ouvrir la pull request

Va directement sur :

**https://github.com/flaviensaillard/MonPortefeuille2/pull/1**

Tu verras une page intitulée : *« Indexation du corpus IA : reprise garantie,
aucun passage repayé »*. C'est la correction. On peut lire tout ce qui a changé en
descendant, mais tu peux aussi ne pas t'en occuper.

### 1.2 Vérifier qu'elle est prête

Cherche la mention :

- 🟢 **« This branch has no conflicts with the base branch »** → tout va bien,
  continue.
- 🔴 **« This branch has conflicts… »** → arrête-toi et dis-le moi, il faudra
  que je m'en occupe.

Ne t'inquiète pas si un voyant jaune/rouge de tests s'affiche : c'est le
contrôle technique automatique, il n'empêche rien.

### 1.3 Fusionner

1. Descends jusqu'au **gros bouton vert** en bas de la page. Il s'appelle
   **« Merge pull request »** ou **« Squash and merge »** — les deux font le
   même travail pour nous.
2. Clique dessus.
3. Un bouton de confirmation apparaît : **« Confirm merge »** (ou « Confirm
   squash and merge »). Clique dessus.
4. La page devient violette/rose avec la mention **« Pull request successfully
   merged and closed »**. C'est fait. ✅

### ⚠️ Le seul piège de cette étape

Après la fusion, GitHub propose un bouton **« Delete branch »** (« Supprimer la
branche »).

**Ne clique pas dessus.** Cette branche est celle sur laquelle je travaille.
Laisse-la tranquille ; elle ne gêne personne.

### 1.4 Rien d'autre à faire

La correction est maintenant dans `main`, et le dépôt t'affiche peut-être une
nouvelle ligne « Indexation du corpus IA : reprise garantie, aucun passage
repayé » en haut de la page d'accueil. C'est le signe que c'est bien passé.

---

## Étape 2 — Lancer l'indexation du jour (1 minute, puis ~10 à 30 minutes d'attente)

### 2.1 Aller dans l'onglet Actions

Sur la page du dépôt (https://github.com/flaviensaillard/MonPortefeuille2),
repère la barre horizontale sous le nom du dépôt : **Code · Issues · Pull
requests · Actions · Projects · Wiki · Security · Insights**.

Clique sur **Actions**. *(Si GitHub passe à l'anglais, c'est le même mot.)*

### 2.2 Choisir la bonne action

À gauche s'affiche la liste des robots du dépôt. Clique sur celle qui s'appelle :

**« Indexation initiale — relancer chaque jour jusqu'à 0 restant »**

Si la liste est repliée, clique d'abord sur « Workflows ». Attention à ne pas te
tromper avec les autres (« Tests », « Robots quotidiens », « Diagnostic »…).

### 2.3 Lancer le robot

À droite, il y a un bouton **« Run workflow »**. Clique dessus : un petit panneau
blanc s'ouvre sous le bouton.

Dans ce panneau :

| Champ | Valeur attendue |
|---|---|
| **Use workflow from** (branche) | `main` ← **vérifie-le**, c'est important |
| **Passages à indexer dans cette exécution** | `3000` (déjà pré-rempli) |

Puis clique sur le **bouton vert « Run workflow »** à l'intérieur du panneau.

> 💡 Pourquoi 3 000 ? Chaque passage coûte environ 2 neurons, donc 3 000
> passages ≈ 5 500 neurons. Il reste ainsi ~4 500 neurons pour tes questions du
> jour. Si tu veux aller plus vite, tu peux mettre `4500` ; si tu veux garder la
> marge maximale, mets `1800` (il faudra alors 4 relances au lieu de 3).

### 2.4 Ensuite : patienter (et c'est normal)

- Un **nouveau bandeau apparaît** en haut de la liste, avec un point jaune 🟡 :
  c'est l'exécution en cours (on appelle ça un « run »).
- Elle dure **10 à 30 minutes**. Tu peux **fermer ton ordinateur, ton navigateur,
  tout éteindre** : le travail se fait sur les ordinateurs de GitHub, pas chez
  toi. Reviens plus tard, la page se met à jour toute seule.
- Un point vert ✅ = terminé sans problème. Un point rouge ❌ = voir la section
  « Si ça se passe mal » — mais **ne t'affole pas**, ça arrive souvent et ça se
  répare.

> ⚠️ **La seule chose à ne pas faire : annuler l'exécution.** S'il y a un bouton
> « Cancel workflow » (croix orange), ne clique pas dessus. Ce n'est pas grave si
> tu l'as déjà fait une fois : avec la correction, ce qui était déjà indexé est
> maintenant conservé.

### 2.5 Si tu vois le mot « queued » ou « en attente de file »

C'est normal : deux indexations n'ont pas le droit de tourner en même temps.
La seconde attend que la première soit finie. Patiente simplement.

---

## Étape 3 — Vérifier que ça avance (2 minutes)

Trois moyens de contrôle. Le premier est le plus simple ; le deuxième est le plus
agréable ; le troisième est celui de Cloudflare.

### Méthode A — le résumé de l'exécution (sur GitHub)

1. Onglet **Actions** → clique sur l'exécution du jour (la ligne du haut).
2. En haut de la page, clique sur le mot **« indexer »** (le nom du poste de
   travail). La liste des opérations s'affiche, avec des coches vertes au fur et
   à mesure.
3. Tu y verras notamment :
   - **« Où en est l'index ? »** : affiche ce que l'index contient déjà ;
   - **« Indexer une tranche »** : affiche ligne par ligne `50/3000`, `100/3000`…
   - **« Résumé »** : affiche à la fin :

```
### Corpus indexé : 3000 / 7226 passages

Restants : 4226. Relancez cette action demain : le quota gratuit plafonne
à 10 000 neurons par jour.
```

Quand ce résumé dit **« Tout est indexé. Cette action n'a plus besoin d'être
relancée. »**, tu as terminé. 🎉

### Méthode B — dans l'application (le plus parlant)

Ouvre ta page Streamlit « 5_IA » : le bandeau vert affiche

> **Corpus mis à jour le 2026-10-05 21:14 UTC — 3000 passages.**

La même information s'affiche dans l'application Android, sous forme de compteur
**« 3000 passages »** sous le titre. Ce nombre doit **augmenter** d'un jour sur
l'autre. Si c'est le cas, tout va bien : c'est la preuve que l'index grandit
réellement.

### Méthode C — chez Cloudflare

1. Va sur **https://dash.cloudflare.com** et connecte-toi.
2. Dans le menu de gauche : **« AI »** ou **« Compute (Workers) »**, puis
   **« Vectorize »**.
3. Clique sur l'index nommé **`ude-corpus`**.
4. Le nombre de **vecteurs** (= de passages rangés) s'affiche. Compare-le avec le
   résumé de l'étape A : ils doivent concorder.

---

## Étape 4 — Relancer demain, puis après-demain (1 minute par jour)

Le quota de Cloudflare se recharge chaque nuit à **00 h 00 UTC** (2 h du matin en
France en été, 1 h en hiver). Le lendemain :

1. Onglet **Actions** ;
2. clique sur **« Indexation initiale — relancer chaque jour jusqu'à 0 restant »** ;
3. **« Run workflow »** → vérifie que la branche est `main` → **Run workflow** ;
4. vérifie le résumé du soir (Étape 3).

Répète jusqu'à ce que le résumé affiche « Tout est indexé ».

### Cas particulier : le lendemain, tout est déjà indexé

Le message « **Tout ce corpus est déjà indexé.** » s'affichera et le robot ne
dépensera rien. C'est le signe que tu as fini — inutile de relancer les jours
suivants.

### Et si une nouvelle exécution avait déjà été lancée automatiquement ?

Chaque lundi, un autre robot (« Mise à jour du corpus ») va chercher les
nouveaux articles publics, reconstruit les passages et en indexe une tranche
lui-même. Tu peux laisser faire : il utilise la même correction et n'indexera
jamais deux fois le même passage.

---

## Étape 5 (facultatif) — Mettre à jour le service Cloudflare

**Tu peux sauter cette étape pour l'instant.** L'indexation fonctionne sans elle.
Ce qu'elle apporte, en plus :

- la vérification gratuite « ce passage est-il déjà indexé ? » avant chaque envoi
  (le filet de sécurité absolu contre les doublons) ;
- le compte exact de passages affiché dans l'application.

Deux méthodes. La première se fait entièrement dans le navigateur.

### Méthode A — copier-coller dans le tableau de bord (la plus simple)

**a) Copier le nouveau code**

1. Ouvre : https://github.com/flaviensaillard/MonPortefeuille2/blob/main/ia/worker/src/index.js
2. En haut à droite du fichier, clique sur le bouton **« Raw »**. La page
   affiche le code seul, sans couleurs ni numéros de ligne.
3. Sélectionne tout : **Ctrl + A** (Windows) ou **Cmd + A** (Mac), puis copie :
   **Ctrl + C** / **Cmd + C**.

**b) Aller chez Cloudflare**

4. Va sur **https://dash.cloudflare.com** et connecte-toi.
5. Menu de gauche → **« Compute (Workers) »** ou **« Workers & Pages »** (selon
   la langue de ton compte).
6. Dans la liste, clique sur le service nommé **`universite-epargne`**.

**c) Remplacer le code**

7. Cherche le bouton **« Edit code »** (ou « Modifier le code ») et clique.
8. Un éditeur s'ouvre avec l'ancien code. Clique dedans, fais **Ctrl + A** puis
   **Suppr** (tout est effacé), puis **Ctrl + V** (le nouveau code apparaît).
9. Clique sur **« Deploy »** (ou **« Save and deploy »**), puis confirme.

**d) Vérifier**

10. Ouvre ton application IA et pose une question. Si elle répond, le service
    fonctionne. Ouvre ensuite
    `https://universite-epargne.<ton-sous-domaine>.workers.dev/sante` dans le
    navigateur : tu dois voir `"ok":true`.

> ⚠️ Ne touche à rien d'autre dans le tableau de bord : ni aux « bindings », ni
> au KV, ni à Vectorize. On ne remplace que le code.

### Méthode B — en ligne de commande (si Node.js est installé)

```bash
git clone https://github.com/flaviensaillard/MonPortefeuille2.git
cd MonPortefeuille2/ia/worker
npx wrangler deploy
```

---

## 6. Comment savoir que tout est fini ?

Les trois signes suivants doivent être vrais :

| Vérification | Où | Résultat attendu |
|---|---|---|
| Résumé du run | GitHub → Actions → dernier run | « Tout est indexé. » |
| Compteur de passages | Application IA (Streamlit ou Android) | ~7 226 passages (le nombre peut grandir : de nouveaux articles s'ajoutent chaque semaine) |
| Nombre de vecteurs | Cloudflare → Vectorize → `ude-corpus` | Le même nombre |

À ce moment-là, l'indexation initiale est terminée : cette action n'a plus besoin
d'être relancée à la main. Le robot hebdomadaire du lundi s'occupera des nouveaux
articles tout seul.

---

## 7. Si ça se passe mal

| Ce que tu vois | Ce que ça veut dire | Ce que tu fais |
|---|---|---|
| ❌ rouge, et dans le journal : **« Quota gratuit du jour épuisé »** | Tu as utilisé tes 10 000 neurons du jour, ou un autre lancement les a consommés. **Ce n'est pas un échec.** | Rien. Relance demain. Ce qui a été indexé est conservé. |
| ❌ rouge, et le journal affiche **`HTTP 401`** | La clé d'administration n'est pas la bonne. | Dis-le moi : c'est un secret à corriger dans GitHub, je t'indiquerai où. |
| ❌ rouge, et le journal affiche **`HTTP 404`** | Le service Cloudflare n'est pas déployé, ou l'adresse est erronée. | Vérifie que le service existe toujours chez Cloudflare. Sinon, dis-le moi. |
| ❌ rouge, et le journal affiche **`HTTP 500`** | Panne côté Cloudflare (souvent : un modèle qui répond mal). | Relance une fois. Si ça recommence, copie-moi les 5 lignes du journal. |
| ❌ rouge, et le journal affiche **« ERREUR : UDE_URL ou UDE_CLE_ADMIN manque »** | Les identifiants du robot ont disparu des réglages GitHub. | Dis-le moi, il faut les remettre (Étape 5 du guide d'installation). |
| 🟡 « queued » pendant des heures | Une autre indexation occupe la place. | Patiente. Si c'est encore là le lendemain, dis-le moi. |
| 🟡 puis ❌ au bout de 60 minutes | Le robot a été coupé par le délai maximal. | Relance : il reprendra où il s'est arrêté, sans rien reperdre. |
| ✅ vert, mais le compteur n'a pas bougé | Aucun nouveau passage à envoyer (tout était déjà indexé), ou le compteur affiché vient encore de l'ancien service. | Regarde le résumé : s'il dit « Tout est indexé », c'est fini. Sinon, fais l'Étape 5. |
| « Je ne comprends rien au journal » | — | Envoie-moi la capture d'écran du journal, je te dirai. |

### Où lire le journal, exactement ?

Onglet **Actions** → clique sur l'exécution → clique sur **« indexer »** à gauche
→ clique sur la ligne rouge (la ligne de l'étape qui a échoué) : son contenu se
déroule. Les messages commencent souvent par `HTTP` ou `Quota`.

---

## 8. Les mots que j'utilise, expliqués

| Mot | Traduction |
|---|---|
| **Dépôt** (repository, repo) | Le dossier de ton projet sur GitHub, avec tout son historique. |
| **Branche** | Une version parallèle du dossier, sur laquelle on travaille sans abîmer la version officielle. |
| **`main`** | La branche officielle. **C'est la seule que les robots utilisent.** |
| **Pull request** (PR) | Une proposition de correction. Tant qu'elle n'est pas « fusionnée », la correction reste dans sa branche et n'est pas active. |
| **Fusionner** (merge) | Accepter la proposition : la correction passe dans `main` et devient active. |
| **Action / workflow / robot** | Un programme que GitHub lance pour toi : il lit, calcule, écrit. |
| **Exécution / run** | Une fois où le robot a tourné. 🟡 en cours, ✅ réussi, ❌ échoué. |
| **Job / « indexer »** | Le poste de travail du robot, où toutes ses opérations s'enchaînent. |
| **Secret** | Un mot de passe que GitHub cache et n'affiche jamais (clés d'accès à Cloudflare, à Supabase…). |
| **Index** | Le « classeur » dans lequel on range les passages du corpus pour pouvoir les retrouver vite. |
| **Indexer** | Ranger les passages dans l'index. C'est l'objet de ce guide. |
| **Embedding** | La transformation d'un texte en une série de nombres qui résume son sens. Un passage = un embedding = ≈ 2 neurons. |
| **Neuron** | L'unité de calcul facturée par Cloudflare. 10 000 gratuits par jour, remis à zéro à 00 h 00 UTC. |
| **Quota** | Ce plafond gratuit journalier. |
| **Worker** | Le petit service qui tourne chez Cloudflare et qui répond aux questions de l'application. |
| **Vectorize** | Le service de Cloudflare qui stocke l'index. |
| **UTC** | L'heure de référence mondiale. Quand il est 22 h en France en été, il est 20 h UTC. |

---

## 9. Pour information : ce qui a été corrigé, techniquement

Cette section est là pour mémoire ; elle ne demande aucune action.

1. **Le point de reprise n'était jamais enregistré.** Le fichier
   `ia/corpus/.indexation.json` devait être commité par une étape du robot qui
   est **sautée dès que l'indexation échoue ou est annulée**. Résultat : zéro
   commit de ce fichier sur `main`, et un redémarrage au passage n° 1 chaque
   fois. → L'étape est maintenant marquée « même en cas d'échec » (`if: always()`)
   et le fichier est écrit après chaque lot de 50 passages.
2. **`VECTORIZE.insert` ignore en silence un identifiant déjà présent.**
   Renvoyer les mêmes passages ne faisait donc pas grandir l'index… tout en
   consommant le quota du jour. → Le service utilise désormais `upsert`, refuse
   les doublons d'un même lot, et expose une route **`/admin/presents`**, qui
   répond « ce passage est déjà chez moi » sans appeler aucun modèle (donc sans
   dépenser de neurons). Le robot interroge cette route avant d'envoyer.
3. **Le compteur affiché était une addition, pas une mesure.** Il faisait
   `ancien + envoyés`. → Le compte vient maintenant de l'index lui-même
   (`describe()` de Vectorize), et la route `/admin/etat` affiche le chiffre
   exact.
4. **Une coupure du quota était traitée comme une erreur.** → Le robot s'arrête
   proprement en disant combien de passages restent, et la relance reprend
   exactement là où il faut. Deux indexations ne peuvent plus se chevaucher, et
   la tranche quotidienne (3 000 passages) est réglable au lancement.

Le tout est couvert par des tests automatiques : `tests/test_indexation_ia.py`
(quota épuisé, point de reprise perdu, doublons) et `ia/tests/test_worker.mjs`,
qui tournent maintenant à chaque modification du dépôt.
