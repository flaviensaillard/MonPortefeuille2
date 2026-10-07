# Correctif du 07/10/2026 — variation journalière et transferts internes

## En une phrase

L'application comparait la valeur du moment au **mauvais repère** et comptait un
**achat de titres** comme un gain de marché. Elle affichait donc **+2 246 $
(+2,85 %)** pour une journée qui était en réalité de **−312,52 $ (−0,38 %)**.
Ce correctif répare cela — et il répare aussi les trois fichiers JavaScript qui
sont actuellement **cassés** sur la branche `main` (voir la section « État
actuel », c'est important).

**Pas de SQL à exécuter. Aucune donnée Supabase n'est touchée.** Le robot
nocturne `jobs/daily_snapshot.py` n'est pas modifié et n'a pas besoin d'être
relancé. Le point « en direct » n'existe qu'en mémoire : la table
`pf2_snapshots` reste la référence, telle quelle.

---

## État actuel de la branche `main` (à lire avant tout)

Les quatre derniers enregistrements faits sur GitHub le 07/10 entre 16h00 et
16h14 (`Update metrics.js`, `Update portfolio.js`, `Update views.js`) ont laissé
les trois fichiers JavaScript **inexploitables** :

| Fichier | Problème |
|---|---|
| `app/src/main/assets/www/js/metrics.js` | une accolade `}` en trop (ligne ≈ 287) |
| `app/src/main/assets/www/js/portfolio.js` | une accolade `}` en trop (ligne ≈ 692) |
| `app/src/main/assets/www/js/views.js` | une apostrophe manquante (ligne 55) |

Une seule faute de ce genre empêche le moteur JavaScript de démarrer : **l'application
Android ne peut pas fonctionner si on recompile à partir de `main` aujourd'hui.**
Ces fichiers contiennent déjà la logique du correctif (achats/ventes, horodatage
`cree_le`, retraits signés), mais ils ne s'exécutent pas.

La bonne nouvelle : le travail n'est pas perdu. Il ne manquait que trois
caractères. Les fichiers du dossier `fichiers/` de cette archive sont ces mêmes
fichiers, **réparés et vérifiés**.

---

## Ce qui est corrigé, en trois points

1. **Le repère de comparaison.** Le dernier enregistrement est conservé intact ;
   la valorisation du moment est un point **distinct**, marqué `_live`. La
   progression journalière compare donc bien le direct au **dernier
   enregistrement**, et non à l'avant-dernier. Un enregistrement `pf2_snapshots`
   daté du même jour prime sur l'ancienne table `Projections`.
2. **Le sens des apports et des retraits.** Dans `pf2_apports`, les montants sont
   stockés **positifs** : c'est la colonne `sens` qui dit si l'argent entre ou
   sort. Un retrait était additionné ; il est désormais **déduit** (flux de
   performance et propagation du capital investi).
3. **Les achats et ventes de titres.** Payer des titres avec les liquidités ne
   change pas la richesse : l'argent passe du compte courant aux titres. Un achat
   enregistré **après** la référence s'ajoute donc aux apports du périmètre
   **investi** (une vente s'en déduit) et ne touche **jamais** le patrimoine
   total. Le test décisif est l'**horodatage d'enregistrement** (`cree_le`) :
   une opération saisie après un enregistrement ne peut pas y figurer, même si
   elle porte la même date. À défaut d'horodatage, on retient les opérations
   strictement postérieures à la date de référence (jamais les mêmes, pour ne
   pas compter deux fois).

En plus : les étiquettes affichent leur repère (« depuis le dernier
enregistrement **du 06/10** »), pour ne pas confondre avec la variation du jour
du courtier, qui part de la clôture précédente.

### Les chiffres du 07/10/2026 (vérifiés)

| Repère | Patrimoine investi | En dollars |
|---|---|---|
| Enregistrement du 06/10 | 70 115,82 € (or 4 158,90 $, 18,925403 oz) | 78 708,86 $ |
| Enregistrement du 07/10 | 72 226,63 € (or 4 185,10 $, 19,418299 oz) | 81 267,52 $ |
| Direct du jour | 72 462 € | 80 955 $ |

- Journée du portefeuille investi : 80 955 − 81 267,52 = **−312,52 $**, soit
  **−0,38 %** (le courtier annonçait −0,69 % ; l'écart restant vient de l'heure de
  la cotation, pas du calcul).
- Patrimoine total : 93 110,52 $ contre 93 432,15 $, soit **−0,3 %**.
- Achat concerné : **68 FLXC.L** pour **1 943,91 $** (68 × 28,355 + 15,77), saisi
  **après** l'enregistrement du 06/10. Il figure donc dans l'enregistrement du
  07/10 : il ne compte pas une seconde fois, et il ne compte pas comme un gain.

---

## 1. Mettre les fichiers sur GitHub

Deux méthodes. La première (fichiers entiers) est la plus sûre.

**Méthode A — remplacer les fichiers par ceux de `fichiers/`**

1. Téléchargez et décompressez `correctif-portefeuille-2026-10-07.zip`.
2. Dans le dépôt `flaviensaillard/MonPortefeuille2`, ouvrez la branche qui sert au
   déploiement (habituellement `main`).
3. Remplacez les fichiers par ceux du dossier `fichiers/` de l'archive, en
   **conservant exactement les chemins**. N'ajoutez pas le dossier `fichiers`
   lui-même à la racine du projet.
4. Enregistrez (« Commit changes »). Les tests et le README peuvent aussi être
   remplacés : ils documentent et vérifient la correction.

Fichiers à remplacer (10) :

```
README.md
app.py
core/session.py
core/portfolio.py
app/src/main/assets/www/js/metrics.js
app/src/main/assets/www/js/portfolio.js
app/src/main/assets/www/js/views.js
tests/test_js.js
tests/test_twr_portefeuille.py
tests/test_progression_snapshot.py
.github/workflows/apk.yml
```

**Méthode B — les blocs « remplacer ceci par cela »**

Voir `A-COPIER-DANS-GITHUB.md` : **8 blocs** pour les trois fichiers JavaScript
(les autres fichiers doivent alors être remplacés entiers). Un programme a
vérifié que faire ces remplacements reproduit, caractère pour caractère, les
fichiers corrigés.

**Avec git**, depuis un clone, sur votre branche de déploiement :

```bash
# Après avoir copié le contenu de fichiers/ à la racine du clone :
git diff --stat
git add README.md app.py core/session.py core/portfolio.py \
  app/src/main/assets/www/js/metrics.js app/src/main/assets/www/js/portfolio.js \
  app/src/main/assets/www/js/views.js tests/test_js.js tests/test_twr_portefeuille.py \
  tests/test_progression_snapshot.py .github/workflows/apk.yml
git commit -m "Correctif : repère d'enregistrement et transferts internes"
git push
```

Le workflow inclus prépare l'APK **1.7.3**, code Android **20**. La 1.7.2 a été
publiée le 07/10 en fin d'après-midi ; la 1.7.3 ajoute les deux corrections
d'affichage décrites plus bas (§ « Version 1.7.3 »). Si votre APK installé porte
déjà un code supérieur à 20, augmentez `VERSION_CODE` et changez `VERSION_NAME`
dans `.github/workflows/apk.yml` avant de lancer la compilation.

---

## 2A. Reconstruire et installer l'APK (Android)

1. Sur GitHub, ouvrez **Actions**, puis la colonne de gauche **« Construire
   l'APK »**.
2. Cliquez sur **Run workflow**, choisissez la branche qui contient le correctif,
   puis **Run workflow** (bouton vert).
3. Attendez la fin de la compilation (quelques minutes). Elle publie toute seule
   la release `apk-1.7.2`.
4. Ouvrez **Releases** (colonne de droite) → **APK 1.7.2** → téléchargez
   `Porte-feuille-1.7.2.apk`. Prenez bien la release 1.7.2, pas l'ancien lien
   1.7.0.
5. **Sur le téléphone : ouvrez l'APK et choisissez « Mettre à jour ». Ne
   désinstallez pas d'abord l'ancienne application** — c'est ce qui conserve vos
   réglages et évite un conflit de signature.
6. Fermez complètement l'application, rouvrez-la, actualisez les données.

## 2B. Version web Streamlit

- **Streamlit Community Cloud** : vérifiez que l'application pointe sur la branche
  mise à jour, attendez le redéploiement, puis **Reboot app** si besoin.
- **Serveur ou poste local** : mettez les fichiers à jour, puis relancez
  `streamlit run app.py`.

Un simple rechargement de l'ancienne version ne suffit pas : le nouveau code doit
d'abord être en place.

---

## 3. Vérifier le résultat

Sur la tuile **« Portefeuille investi »**, vous devez lire **≈ −0,4 %** (et non
+2,85 %), avec la mention « depuis le dernier enregistrement du 06/10 » — ou
« du 07/10 » selon l'heure à laquelle vous regardez. Le patrimoine total doit
être à **≈ −0,3 %**.

Si un écart persiste, relevez : version installée, dernier enregistrement (date,
`patrimoine_investi_eur`, `cours_or_usd`, `equivalent_or_oz`), valeur actuelle en
USD et EUR, taux EUR/USD, et les opérations saisies depuis l'enregistrement.

---

## Contenu de l'archive

- `fichiers/` — les 11 fichiers corrigés, à remettre aux mêmes chemins.
- `correctif.patch` — pour les utilisateurs de git, à appliquer sur la base
  `d11a953fd4387c4b391bd1c81adccae52b06e140`
  (`git apply --check correctif.patch`, puis `git apply correctif.patch`).
- `A-COPIER-DANS-GITHUB.md` — les 8 blocs de remplacement pour les fichiers
  JavaScript, vérifiés par programme.
- `POURQUOI-LES-ECARTS.md` — la comparaison chiffrée avec votre courtier
  (périmètres, repères, sources de cours), établie sur vos captures du 07/10.
- `EXPLICATION-SIMPLE.md` — le même correctif raconté avec l'image des deux
  tiroirs (compte courant / titres), sans jargon.
- Ce guide.

Si votre code a changé depuis la base du patch, ne forcez pas un patch qui
échoue et n'écrasez pas vos propres modifications.

---

## Ce qui a été vérifié ici

- **81 tests JavaScript** du moteur (`node tests/test_js.js`) : 81 réussis, 0 échec.
  Les 15 nouveaux tests rejouent le cas du 07/10 (bon repère, achat avant/après la
  référence, retraits signés, transfert interne invisible pour le patrimoine total)
  et verrouillent la cotation du moment (la série Yahoo peut s'arrêter à la séance
  précédente) ainsi que les mentions affichées sur les fiches.
- **19 tests Python** de la progression (`pytest tests/test_progression_snapshot.py`) :
  réussis, dont 7 nouveaux sur les transferts internes.
- **Suite Python complète** : 561 réussis, 2 ignorés. Les 14 échecs qui restent
  sont **uniquement** les tests qui interrogent Yahoo Finance ou qui exigent
  l'écriture d'un snapshot : le bac à sable n'a pas accès à ce réseau. Ils
  passent normalement chez GitHub Actions, qui a le réseau.
- `node --check` sur les trois fichiers JavaScript : OK (plus aucune erreur de
  syntaxe), et le patch a été appliqué à blanc sur la base `d11a953` avec succès.
- Aucune donnée Supabase n'a été lue ni écrite. Aucun robot n'a été lancé.

## Version 1.7.3 — les deux écarts restants, corrigés

Après l'installation de la 1.7.2, deux différences subsistaient dans la
comparaison avec le courtier (voir `POURQUOI-LES-ECARTS.md`) :

1. **La ligne d'un actif affichait la variation de la veille.** Pour IGLN.L,
   XDW0.L et FLXC.L, Yahoo renvoie une dernière ligne de cotation sans cours ;
   le programme la retirait et comparait donc les deux clôtures précédentes.
   D'où « IGLN.L −0,70 % » là où le courtier affichait −1,35 % (et une
   valorisation de la ligne en retard d'un jour). L'application lit maintenant la
   **cotation du moment** et la **clôture précédente** publiées par Yahoo à côté
   de la série — les deux chiffres du courtier — avec l'ancien calcul en repli.
2. **Les fiches et les repères ne disaient pas tout.** La mention « clôture du
   06/10 » apparaît quand le cours du jour n'est pas encore connu ; les tuiles de
   patrimoine affichent la **date et l'heure** du repère (« du 07/10/2026 à
   2h58 ») et la page Performance affiche sa **valeur** (« repère de départ
   81 268 $ »). Deux repères pris à des heures différentes ne sont plus
   comparables par erreur.

L'archive contient du **code source**, pas une APK déjà compilée. Le lien de
téléchargement direct (forme « raw ») est donné dans la conversation ; le fichier
est aussi dans le dépôt, dossier `telechargements/`.

## Version 1.7.4 — le même correctif, côté site web (Streamlit)

La version 2 du correctif est arrivée par morceaux. Sa partie **Android** (moteur
`app/src/main/assets/www/js/`) est déjà publiée : elle est entrée dans `main` avec
la fusion de la proposition n° 5, et elle est même plus complète que prévu — les
tuiles web affichent en plus l'**heure** du repère. Les 81 tests JavaScript du
dépôt la valident, dont le scénario réel du 07/10/2026 :

```
référence du 06/10 : 78 708,86 $   (snapshot 70 115,82 EUR x 1,125)
référence du 07/10 : 81 267,52 $   (snapshot 72 226,63 EUR x 1,125)
portefeuille du moment : 80 955 $  ->  gain de marché  -312,52 $  (-0,38 %)
                                      et non +2 246 $ (+2,85 %)
```

Ce qui **manquait**, c'est la partie **web** (`core/session.py`,
`core/portfolio.py`). La 1.7.4 l'apporte :

1. **Les retraits ne comptent plus comme des entrées.** Dans `pf2_apports`, le
   signe est porté par la colonne `sens`, pas par le montant. Le moteur web
   utilisait le montant tel quel : un retrait enregistré en négatif devenait un
   apport, donc un **faux gain**. Le montant est maintenant pris en valeur
   absolue et le signe vient de `sens`, comme le fait déjà l'application.
2. **Un achat (ou une vente) de titres enregistré après le repère du soir est un
   transfert interne**, pas un gain. C'est l'artefact du 07/10/2026 : l'achat de
   68 FLXC.L pour 1 943,91 $, saisi après le snapshot, gonflait la performance.
   La règle utilise l'horodatage `cree_le` (colonne déjà présente en base,
   aucune migration) et retombe sur la date de l'opération quand il manque.
3. Le montant en dollars de chaque opération est conservé (`montant_usd`), ce
   dont la règle ci-dessus a besoin.

**Ce que la 1.7.4 ne contient pas** : le garde-fou des cotations aberrantes
(refus d'un cours à plus de 25 % de la dernière clôture). Ce travail n'a jamais
quitté la session précédente ; il n'existe ni dans le dépôt ni dans le correctif
reçu. Il reste à écrire.

Contrôles de la 1.7.4 : `node tests/test_js.js` → 81 réussis, 0 échec ;
`python -m pytest tests/ -q` → **561 réussis, 2 ignorés, 14 échecs réseau** —
exactement le même compte qu'avant, les 14 échecs étant les tests qui interrogent
Yahoo ou qui exigent l'écriture d'un snapshot. Aucune donnée Supabase n'a été lue
ni écrite, aucun robot n'a été lancé.
