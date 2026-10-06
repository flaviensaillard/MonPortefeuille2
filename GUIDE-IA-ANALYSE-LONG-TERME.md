# Guide — faire analyser le corpus au lieu de le citer

**Pour qui :** vous. Aucune connaissance technique n'est nécessaire pour suivre
ce guide : les trois premières étapes sont du copier-coller.
**Ce que ça change :** l'assistant ne récite plus le corpus, il s'en sert. Il le
confronte à vos données et à des informations extérieures qu'il va chercher
lui-même, et il replace chaque réponse dans votre horizon de retraite (2055).
**Temps à prévoir :** 5 minutes pour le service, 5 minutes de vérification.
Le reste est facultatif.

---

## 1. Avant / après, sur vos trois questions

### Avant

> **Vous :** Est-ce que la moyenne mobile à 7 ans a cassé sur l'or ?
>
> **L'assistant :** *Le corpus ne le dit pas, mais selon mon interprétation: …
> [1] « Le couloir d'avalanche » — Institut des Libertés, 2009-09-22 …*

Il vous rendait des passages. Vous deviez faire le travail.

### Après

> **Vous :** Est-ce que la moyenne mobile à 7 ans a cassé sur l'or ?
>
> **L'assistant :**
> **Selon le corpus,** la moyenne mobile longue sert de jauge de tendance de fond
> et non de signal de court terme ; une cassure ne se lit pas sur une séance [1],
> [3].
>
> **En me basant sur tes données, sur le corpus et sur les informations
> extérieures que j'ai trouvées,** ta poche « réserve de valeur » pèse 28 % pour
> une cible de 20 % — elle est hors bande. À l'horizon 2055 (29 ans), une
> cassure de moyenne mobile n'est pas un motif de sortie : ce qui compte est la
> tenue du plan et le rendement réel. Les sources extérieures que j'ai trouvées
> [E1], [E2] vont dans le même sens : …
>
> **Ce qui dépend de toi :** l'arbitrage entre alléger la poche et laisser la
> bande travailler. Ni le corpus ni les sources ne peuvent le trancher à ta
> place.
>
> *Sources :* `[1]`, `[3]` → passages du corpus · `[E1]`, `[E2]` → pages lues sur le web

> *Exemple de forme : les chiffres, les poids et les passages cités sont ceux que
> le service trouvera le jour où vous posez la question — dans votre corpus, dans
> vos agrégats et dans les pages qu'il lira.*

Les trois questions de votre message se traitent maintenant de la même façon :

| Votre question | Ce qui change |
|---|---|
| « La moyenne mobile 7 ans a-t-elle cassé sur l'or ? » | le corpus donne **la règle**, l'extérieur donne **l'état du marché**, vos données donnent **votre poche** — et l'assistant conclut |
| « Dois-je rééquilibrer ? » | le seuil du corpus, vos poids réels dans les agrégats, et la lecture « à 29 ans, une dérive de 8 points n'a pas la même urgence qu'une dérive de 20 points » |
| « C'est qui, le TWR ? » | définition donnée par le corpus, puis « **Les informations que j'ai trouvées à l'extérieur disent également que** … » pour compléter |

### Ce qui a changé, en une ligne

| | Avant | Maintenant |
|---|---|---|
| Mission | citer le corpus | **analyser** : corpus + données + extérieur |
| Structure | un pavé, sources à la fin | **trois paragraphes imposés** |
| Horizon | absent | **2055 et l'objectif de retraite dans chaque réponse** |
| Internet | non | **oui** : DuckDuckGo et Wikipédia sans compte, Brave si vous voulez |
| Sources | `[1]`, `[2]` (corpus) | `[1]`, `[2]` (corpus) **et** `[E1]`, `[E2]` (extérieur) |
| Contrôle | aucun | la forme est **vérifiée**, et reprise si le modèle l'oublie |

---

## 2. Ce que vous devez faire, en résumé

| # | Étape | Obligatoire ? | Temps |
|---|---|---|---|
| 1 | Mettre le nouveau code dans le service Cloudflare | **oui** | 4 min |
| 2 | Vérifier avec trois questions | **oui** | 3 min |
| 3 | Créer le corpus / relancer l'indexation | non | — |
| 4 | Améliorer la recherche extérieure (clé Brave) | non | 5 min |
| 5 | Réinstaller l'application Android | non | 10 min |
| 6 | Rien à faire côté Streamlit | — | — |

**Vous n'avez aucun secret à créer, aucune clé à acheter, aucun réglage à
saisir.** Le service fonctionne sans configuration : l'horizon 2055 est dans le
code, et la recherche extérieure utilise DuckDuckGo puis Wikipédia, qui ne
demandent ni compte ni clé.

---

## 3. Étape 1 — Mettre le nouveau service en ligne (4 minutes)

### a) Copier le nouveau code

1. Ouvrez
   `https://github.com/flaviensaillard/MonPortefeuille2/blob/main/ia/worker/src/index.js`
2. En haut à droite du fichier, cliquez sur **« Raw »**. La page affiche le code
   seul, sans couleurs ni numéros de ligne.
3. **Ctrl + A** (Windows) ou **Cmd + A** (Mac), puis **Ctrl + C** / **Cmd + C**.

> ⚠️ Le fichier est volontairement **unique** : il contient tout, y compris la
> recherche extérieure. Ne le découpez pas en plusieurs fichiers — la méthode de
> copier-coller ci-dessous ne fonctionnerait plus.

### b) Ouvrir votre service chez Cloudflare

4. Allez sur **https://dash.cloudflare.com** et connectez-vous.
5. Menu de gauche → **« Compute (Workers) »** (ou **« Workers & Pages »**).
6. Dans la liste, cliquez sur le service **`universite-epargne`**.

### c) Remplacer le code

7. Cliquez sur **« Edit code »** (ou « Modifier le code »).
8. Cliquez dans l'éditeur, **Ctrl + A**, puis **Suppr** : tout est effacé.
9. **Ctrl + V** : le nouveau code apparaît.
10. Cliquez sur **« Deploy »** (ou « Save and deploy »), puis confirmez.

> ⚠️ Ne touchez à rien d'autre dans le tableau de bord : ni aux « bindings », ni
> au KV, ni à Vectorize, ni aux variables. On ne remplace que le code.

### d) Le repère

11. Ouvrez dans votre navigateur :
    `https://universite-epargne.VOTRE-SOUS-DOMAINE.workers.dev/sante`
12. Vous devez voir apparaître **`"version":"1.7.0"`**, un bloc `"horizon"` avec
    `"anneeDepartRetraite":2055`, et `"web":true` dans `"branchements"`.

Si vous voyez `"version":"1.6.1"` ou pas de bloc `"horizon"`, c'est que le
copier-coller n'a pas été jusqu'au bout : recommencez à l'étape a).

### Variante pour les techniciens (Codespaces, Wrangler)

```bash
git clone https://github.com/flaviensaillard/MonPortefeuille2.git
cd MonPortefeuille2/ia/worker
npx wrangler deploy
```

---

## 4. Étape 2 — Vérifier (3 minutes)

Posez ces questions dans l'application Streamlit (page **5_IA**) ou dans
l'application Android, onglet **IA**. Ce que vous devez voir :

### Question 1 — une question de corpus

> « Que dit le corpus sur la moyenne mobile 7 ans ? »

- le texte commence par **« Selon le corpus, »** ;
- il y a **des renvois `[1]`, `[2]`** dans la phrase, et les titres des passages
  sous la réponse ;
- si le corpus n'en parle pas : **« Selon le corpus, ce point n'y est pas
  traité. »** — c'est un aveu, pas un bug.

### Question 2 — une question d'actualité

> « Où en est l'or aujourd'hui ? » (ou : « Que disent les informations
> extérieures sur l'or cette semaine ? »)

- une section **« Sources extérieures (hors corpus) »** apparaît, avec des
  entrées `[E1]`, `[E2]` cliquables ;
- une ligne discrète indique `Recherche extérieure : 5 résultat(s), 2 page(s)
  lue(s) · moteur : duckduckgo` ;
- le second paragraphe commence par **« En me basant sur tes données, sur le
  corpus et sur les informations extérieures que j'ai trouvées, »**.

### Question 3 — une définition

> « C'est quoi le TWR ? »

- le corpus définit le TWR dans le premier paragraphe ;
- le second paragraphe peut commencer par **« Les informations que j'ai
  trouvées à l'extérieur disent également que … »** ;
- à la fin : **« Ce qui dépend de toi : … »**.

### Question 4 — l'horizon

> « Mon horizon 2055 change quoi à ma façon d'investir ? »

- la réponse parle de **pouvoir d'achat, de rendement réel, d'onces d'or**, et
  traite un mouvement de court terme comme du bruit.

### Si une seule de ces réponses ne va pas

| Ce que vous voyez | Ce que ça veut dire | Ce que vous faites |
|---|---|---|
| Aucun renvoi `[E…]` et pas de ligne « Recherche extérieure » | le moteur a refusé la requête (cela arrive avec DuckDuckGo depuis les serveurs de Cloudflare) | ajoutez une clé Brave — étape 4 — ou posez `MOTEUR_WEB` sur `duckduckgo` puis `wikipedia` pour voir lequel répond |
| La réponse ne commence pas par « Selon le corpus, » | le modèle a oublié la consigne | attendez la seconde passe (une seconde de plus) ; si ça persiste, passez `REPARATION` sur `oui` (c'est le défaut) |
| Un bandeau rouge « Filet anti-invention » avec un chiffre | le modèle a produit un chiffre que rien ne confirme | c'est **le filet qui fait son travail** : ne retenez pas ce chiffre, relancez la question |
| Un bandeau gris « Chiffres extérieurs — … » | le chiffre vient d'une page web, pas du corpus | c'est normal et c'est signalé : la mention dit que le corpus ne le confirme pas |
| L'ancien texte « Le corpus ne le dit pas, mais selon mon interprétation: … » | le service n'a pas été remplacé | reprenez l'étape 1 |

---

## 5. Étape 3 — Le corpus (rien à faire dans cette version)

Le changement de comportement ne touche pas l'indexation : le corpus reste ce
qu'il est. Si votre indexation initiale n'est pas terminée, c'est le
`GUIDE-INDEXATION-PAS-A-PAS.md` qu'il faut suivre — dans l'ordre :

```bash
python3 ia/scripts/indexer.py --etat            # ce que l'index contient
python3 ia/scripts/indexer.py --tranche 3000    # la tranche du jour
```

Une chose à savoir : la recherche extérieure **ne consomme aucun neurone**. Ce
qu'elle ajoute, ce sont des jetons dans le prompt, donc quelques neurones de
plus par réponse (de l'ordre de 20 à 30 %). Vous restez très loin des 10 000
neurones gratuits par jour.

---

## 6. Étape 4 (facultatif) — Améliorer la recherche extérieure

Par défaut, la cascade est : **DuckDuckGo → Wikipédia**, sans compte ni clé.
C'est gratuit et cela suffit pour beaucoup de questions, mais les pages de
résultats de DuckDuckGo sont parfois refusées aux serveurs de Cloudflare.

### Option A — clé Brave Search (le meilleur rapport qualité/effort)

1. Créez un compte sur **https://brave.com/search/api/** et prenez le plan
   gratuit (2 000 requêtes par mois).
2. Copiez la clé.
3. Chez Cloudflare → votre service `universite-epargne` → **Settings** →
   **Variables and Secrets** → **Add** :
   - Type : **Secret**, Nom : **`BRAVE_CLE`**, Valeur : votre clé.
4. **Deploy**. C'est tout : le service essaie Brave en premier.

### Option B — votre propre instance SearXNG

Si vous (ou une association) hébergez un SearXNG : posez la variable
`SEARXNG_URL` avec l'adresse de l'instance. Le service l'essaiera avant
Wikipédia.

### Option C — API Web Search de Cloudflare (bêta, facturée à l'usage)

Cloudflare propose depuis le 2 octobre 2026 une recherche web dans AI Gateway.
Elle est **payante à l'usage** (de l'ordre de 0,25 $ pour 1 000 recherches chez
le fournisseur par défaut), c'est pourquoi elle est désactivée par défaut dans
ce service. Pour l'activer : variable **`CF_WEB`** = `oui`.

### Régler la recherche, sans toucher au code

| Variable (Cloudflare → Settings → Variables) | Valeurs | Effet |
|---|---|---|
| `WEB` | `auto` *(défaut)* | cherche, et n'ouvre les pages que si c'est utile |
| | `toujours` | cherche **et ouvre les pages** à chaque question (plus lent, plus riche) |
| | `non` | **rien ne sort** : ni corpus, ni web — l'assistant s'appuie sur le corpus et vos données |
| `MOTEUR_WEB` | `auto` *(défaut)*, `brave`, `duckduckgo`, `searxng`, `wikipedia`, `cloudflare` | force un moteur unique |
| `REPARATION` | `oui` *(défaut)*, `non` | `non` coupe la seconde passe de remise en forme |
| `HORIZON_ANNEE` | `2055` *(défaut)* | l'année de départ à la retraite |
| `OBJECTIF` | phrase libre | l'objectif rappelé au modèle |
| `MODELE_GENERATION` | `@cf/meta/llama-3.1-8b-instruct` *(défaut)* | voir « Changer de modèle » plus bas |

---

## 7. Étape 5 (facultatif) — L'application Android

L'application **déjà installée continue de fonctionner** : si elle n'envoie pas
l'horizon, le service applique 2055 par défaut. Vous perdez seulement deux
choses :

- l'interrupteur **« ✓ Internet »** dans la barre du haut (couper la recherche
  extérieure question par question) ;
- l'affichage **« Sources extérieures »** `[E1]`, `[E2]` sous la réponse.

Pour les avoir, réinstallez l'APK construite depuis ce dépôt (`app/`). La page
Streamlit, elle, n'a rien à réinstaller : elle lit le dépôt à chaque
redémarrage.

---

## 8. Ce qu'il faut modifier, si vous voulez aller plus loin

Trois endroits, et trois seulement. **Les tournures imposées sont écrites à deux
endroits qui doivent rester d'accord** : le code du service et le fichier
`ia/REGLES.md` (sa version lisible, pour vous).

| Ce que vous voulez changer | Où | Quoi |
|---|---|---|
| La phrase « Selon le corpus, … » | `ia/worker/src/index.js` (fonction `construireRegles`) **et** `ia/REGLES.md` | le texte entre guillemets, dans les paragraphes 1, 2 et 3 |
| La phrase « En me basant sur tes données, … » | les mêmes deux fichiers, **plus** la fonction `conformite` du Worker (elle vérifie la tournure) | garder les deux formes cohérentes, sinon la seconde passe réécrira la réponse à chaque fois |
| L'année 2055 | `HORIZON_ANNEE` (Cloudflare), `IA_HORIZON_ANNEE` (secret Streamlit), ou le réglage du téléphone | une seule valeur à changer selon l'écran que vous utilisez |
| L'objectif de retraite | `OBJECTIF` / `IA_OBJECTIF` / réglage du téléphone | une phrase |
| Les moteurs de recherche autorisés | `WEB`, `MOTEUR_WEB`, `BRAVE_CLE`, `SEARXNG_URL`, `CF_WEB` | voir le tableau de l'étape 4 |
| Le nombre de pages lues | `ia/worker/src/index.js` : constantes `BUDGET_PAGES` (2), `TAILLE_PAGE`, `BUDGET_EXTERNE` | augmenter coûte des jetons d'entrée |
| Le seuil de pertinence du corpus | `ia/worker/src/index.js` : `const SEUIL = 0.30` | baisser fait entrer plus de passages (et du bruit) |
| Le ton, les interdits, le style | `ia/worker/src/index.js` (`construireRegles`) **et** `ia/REGLES.md` | ce sont les deux faces d'une même chose |

### Changer de modèle (si la qualité ne suffit pas)

`MODELE_GENERATION` (Cloudflare → Settings → Variables) accepte n'importe quel
modèle du catalogue Workers AI. Un modèle plus gros écrit mieux et respecte
mieux les consignes, mais coûte plus de neurones et peut sortir du quota
gratuit :

| Modèle | Ce qu'il apporte | Coût relatif |
|---|---|---|
| `@cf/meta/llama-3.1-8b-instruct` *(défaut)* | rapide, économe, parfois oublie une consigne (la seconde passe corrige) | 1× |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | nettement meilleur en analyse et en français | ≈ 10× |

Le catalogue exact et les prix se lisent chez vous : Cloudflare → **AI** →
**Models**. L'identifiant à recopier est celui de la colonne « model ».

---

## 9. Combien ça coûte

| Poste | Coût |
|---|---|
| Recherche extérieure (DuckDuckGo, Wikipédia) | **0 €** — aucune inscription |
| Ouverture des pages | **0 €** |
| Brave Search | **0 €** jusqu'à 2 000 requêtes/mois |
| Cloudflare Workers, Workers AI, Vectorize, KV | **0 €** dans les quotas gratuits |
| API Web Search de Cloudflare | payante à l'usage — **désactivée** par défaut |

Ordre de grandeur des neurones par réponse : ≈ 150 avant, ≈ 180 à 200
maintenant (prompt plus long). Le quota gratuit est de 10 000 par jour.

Le cache de 24 h joue aussi : la même question posée deux fois ne relance ni la
recherche extérieure, ni le modèle.

---

## 10. Ce qui sort sur internet (et comment l'empêcher)

| Ce qui part | Où | Détail |
|---|---|---|
| Votre question, **montants retirés** | le moteur de recherche | « 79 200 € » et « 12 % » sont supprimés de la requête ; « moyenne mobile 7 ans » reste |
| Le texte des pages lues | nulle part | il est lu, gardé en mémoire le temps de la réponse, jamais republié |
| Vos agrégats (capital, poches) | **pas au moteur de recherche** | ils restent entre l'application et Cloudflare |

Trois façons de couper :

1. **case « Autoriser la recherche extérieure »** décochée dans Streamlit
   (question par question) ;
2. **bouton « ✓ Internet »** dans Android (question par question) ;
3. variable **`WEB`** = `non` chez Cloudflare (définitivement).

Dans les trois cas, l'assistant continue de répondre : avec le corpus et vos
agrégats seulement.

---

## 11. Si ça se passe mal

| Ce que vous voyez | Ce que ça veut dire | Ce que vous faites |
|---|---|---|
| `/sante` affiche encore `"version":"1.6.1"` | le code n'a pas été remplacé | reprenez l'étape 1 |
| `HTTP 500` sur une question | souvent un modèle qui répond mal | relancez une fois ; si cela recommence, passez `REPARATION` sur `non` et re-testez |
| La réponse est plus lente qu'avant (2 à 6 s) | c'est le prix de la recherche extérieure | `WEB` = `auto` est déjà le réglage le plus économe ; `non` retrouve la vitesse d'avant |
| Aucune source extérieure, toujours | DuckDuckGo refuse les serveurs de Cloudflare | ajoutez `BRAVE_CLE` (étape 4) |
| Une réponse commence par autre chose que « Selon le corpus, » | le modèle a résisté | vérifiez que `REPARATION` vaut bien `oui` ; si oui, signalez-le : c'est un cas à ajouter dans les tests |
| Le texte affiché est en anglais | une page extérieure était en anglais et le modèle a suivi | ajoutez une phrase dans `ia/REGLES.md` et dans `construireRegles` : « tu écris toujours en français, même quand la source est en anglais » |
| Un chiffre affiché vous paraît faux | le filet anti-invention l'aurait signalé en rouge | vérifiez la ligne sous la réponse : s'il n'y a pas de bandeau, le chiffre est retrouvé dans une source ; cliquez la source `[E…]` |

---

## 12. Ce qui est vérifié automatiquement (et pourquoi c'est votre garantie)

Le dépôt contient une suite de tests qui **n'appelle rien sur internet** et
vérifie, à chaque livraison, les points suivants :

```
✔ le premier bloc commence par « Selon le corpus, »
✔ le second bloc reprend la phrase imposée
✔ la structure est reconnue comme conforme
✔ corpus muet : la phrase de silence est imposée
✔ l’horizon 2055 est dans le prompt du modèle
✔ le nombre d’années restantes est calculé
✔ le prompt ordonne de traiter le court terme comme du bruit
✔ la recherche extérieure a bien été lancée
✔ les résultats extérieurs sont numérotés [E1]
✔ l’URL réelle est décodée, pas celle du moteur
✔ la page a été lue et son texte transmis au modèle
✔ le chiffre venu du web est signalé comme extérieur
✔ web:false ne lance aucune requête extérieure
✔ une seconde passe rétablit la structure
✔ l’historique de conversation est transmis au modèle
✔ (et 21 autres, sur l’indexation et les clés)
```

Pour les lancer vous-même dans un Codespace :

```bash
node ia/tests/test_worker.mjs
```

---

## 13. Les mots que j'utilise, expliqués

| Mot | Traduction |
|---|---|
| **Corpus** | vos textes indexés : articles de l'Institut des Libertés, vidéos, documents internes |
| **Passage** | un morceau de corpus (≈ 1 200 caractères) ; c'est lui qui porte un numéro `[1]`, `[2]` |
| **Source extérieure** | une page ou un résumé trouvé sur le web ; numéroté `[E1]`, `[E2]` |
| **Prompt** | le texte envoyé au modèle : les règles, vos données, les passages, les sources |
| **Worker** | le petit service qui tourne chez Cloudflare et qui répond aux questions |
| **Embedding** | la transformation d'un texte en série de nombres, pour retrouver les passages proches |
| **Neuron** | l'unité de calcul facturée par Cloudflare : 10 000 gratuits par jour |
| **KV** | le cache de Cloudflare : garde une réponse 24 h pour ne pas la recalculer |
| **Seconde passe** | la réécriture automatique de la réponse quand la forme imposée manque |

---

## 14. Récapitulatif, en une page

1. **Oui**, vous devez faire une chose : coller le nouveau
   `ia/worker/src/index.js` dans votre service Cloudflare et cliquer sur
   **Deploy**. Rien d'autre n'est obligatoire.
2. **Non**, vous n'avez aucune clé à créer. DuckDuckGo et Wikipédia travaillent
   sans compte ; Brave est un confort facultatif.
3. **L'horizon 2055** est dans le code par défaut ; il se change en une variable
   (`HORIZON_ANNEE`) ou dans vos réglages.
4. **Les trois tournures** que vous avez demandées sont imposées au modèle,
   vérifiées après coup, et reprises automatiquement s'il les oublie.
5. **Vos données** sont envoyées en agrégats ; **les montants ne partent jamais**
   vers les moteurs de recherche ; trois interrupteurs permettent de tout couper.
6. Les règles lisibles sont dans **`ia/REGLES.md`** — si vous voulez changer le
   ton ou les phrases, c'est là que ça se lit, et dans `construireRegles` que ça
   s'applique.
