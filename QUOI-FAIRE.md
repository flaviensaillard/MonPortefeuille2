# Méthode pas à pas

---

## Où vous en êtes

| | Étape | État |
|---|---|---|
| ✅ | 1 | sauvegarde CSV | faite |
| ✅ | 2 | apport fantôme du 02/02/2026 supprimé | faite |
| ✅ | 3 | code envoyé sur GitHub | faite |
| ✅ | 4 | dry-run validé | faite |
| ✅ | 5 | import réel | **fait — 179 lignes, 2023-04-01 → 2026-10-01** |
| ✅ | 6 | regarder 📈 Performance | **fait — les 4 chiffres sont exacts** |
| ⬜ | 7 | trancher la ligne du 29/04/2024 | **à faire, en attente de votre relevé** |
| ⬜ | 8 | lancer « Robots quotidiens » | à faire — c'est **ce qui manque pour 2026** |
| ⬜ | 9 | la devise du +4,10 % de Swissquote | à faire |

**Vos quatre chiffres sont exacts.** Ce qui était annoncé, ce qui s'affiche :

| Année | Prévu | **Affiché** |
|---|---|---|
| 2023 | +11,02 % | **+11,0 %** ✅ |
| 2024 | −24,90 % | **−24,9 %** ✅ |
| 2025 | +4,12 % | **+4,1 %** ✅ |
| 2026 | +8,66 % | **+8,7 %** ✅ |

Quatre sur quatre, à l'arrondi près. Et la colonne **Réelle** se tient :
+5,8 % / −26,4 % / +3,2 %, soit chaque performance corrigée de l'inflation de
l'année. Tout est cohérent.

Et l'**alerte rouge s'est déclenchée toute seule** — celle que je vous avais
annoncée, sur la ligne du 29/04/2024. C'est la partie qui compte : vous n'avez
pas eu à me croire, l'application l'a calculé devant vous.

---

> **Réponse à votre question précédente : non, rien ne changeait. Vous pouviez commencer.**
> Vos trois règles sont exactes, je les ai vérifiées sur vos 319 lignes réelles,
> et le code faisait déjà ce qu'il fallait. Mais elles m'ont fait trouver un
> **contrôle** que j'aurais dû écrire depuis longtemps — voir l'encadré en fin de
> document. Il confirme, preuve indépendante à l'appui, la ligne du 29/04/2024.

Neuf étapes. Comptez **trente minutes** en tout, à faire dans cet ordre.

Chaque étape a un **repère** : ce que vous devez voir à l'écran. Si vous voyez
autre chose, arrêtez-vous et écrivez-moi — ne continuez pas « au cas où ».

**Vous aurez besoin de trois fenêtres :**

| Fenêtre | Adresse |
|---|---|
| Supabase | `supabase.com` → votre projet → **Table Editor** |
| GitHub | `github.com/flaviensaillard/MonPortefeuille2` |
| Streamlit | votre application en ligne |

---

## ⬜ Étape 1 — Sauvegarder vos snapshots

**Deux minutes. À ne pas sauter.** L'étape 5 supprime environ 400 lignes de la
table des snapshots avant d'y écrire votre historique. C'est voulu et sans
danger — mais une sauvegarde coûte deux minutes, et un remords coûte une
semaine.

1. Supabase → **Table Editor** (colonne de gauche)
2. Cliquez sur la table **`pf2_snapshots`**
3. Cherchez le bouton d'export — une **flèche vers le bas**, en haut à droite du
   tableau
4. **Download as CSV**

**Repère :** un fichier `pf2_snapshots_rows.csv` arrive dans vos
téléchargements. Gardez-le quelque part, ne le renommez pas.

> **Vous ne trouvez pas l'export ?** Passez l'étape. C'est une ceinture de
> sécurité, pas une condition. L'import n'écrit que dans les tables `pf2_*` et
> ne touche jamais à vos saisies manuelles.

---

## ⬜ Étape 2 — Supprimer l'apport que je vous ai fait saisir

**Deux minutes.** Et pour répondre à votre question d'hier : **oui, il faut le
supprimer.** C'était une hypothèse de diagnostic, pas un mouvement. Elle a
prouvé ce qu'il fallait prouver ; maintenant qu'on connaît la vraie cause, la
garder fausse le chiffre dans l'autre sens.

| | TWR 2026 |
|---|---|
| L'apport **conservé** | **−6,20 %** |
| L'apport **supprimé** | **+8,39 %** |

**L'application n'a pas de bouton pour supprimer un apport** — la liste est en
lecture seule. On passe donc par la base :

1. Supabase → **Table Editor** → table **`pf2_apports`**
2. Repérez la ligne avec **`date = 2026-02-02`** et
   **`montant_eur = 8968.89`**
3. Survolez la ligne → **case à cocher** à gauche → **Delete row** (l'icône
   corbeille)
4. Confirmez

⚠️ **Le même jour porte aussi un apport de 200,00 €. Celui-là est réel** — il
vient de votre table `Historique`, c'est la mensualité de février. Supprimez
**uniquement** la ligne à **8 968,89 €**.

**Repère :** il ne reste plus qu'**une** ligne au 02/02/2026 dans la table, à
200 €.

---

## ⬜ Étape 3 — Mettre le code à jour sur GitHub

**Cinq minutes.** Le fichier `MonPortefeuille2.zip` est dans la fenêtre à côté.

1. **Téléchargez et décompressez** le zip — vous obtenez un dossier
   `MonPortefeuille2`
2. Ouvrez `github.com/flaviensaillard/MonPortefeuille2`
3. **Add file** → **Upload files**
4. Ouvrez le dossier décompressé et sélectionnez **tout ce qu'il contient** :
   les dossiers `core`, `jobs`, `pages`, `tests`, `migrations`, et les fichiers
   `app.py`, `requirements.txt`, `README.md`, `QUOI-FAIRE.md`
5. Faites-les glisser dans la fenêtre de GitHub
6. En bas : **Commit changes**

**Repère :** après le commit, GitHub lance tout seul le robot **Tests**. Onglet
**Actions** → la ligne « Tests » doit passer au **vert** en une minute.

> ⚠️ **Ne touchez pas aux dossiers qui commencent par un point.** Le navigateur
> ne les envoie jamais. C'est normal : vos robots existants (dans
> `.github/workflows/`) restent en place, et le zip les contient aussi pour
> référence.

---

## ⬜ Étape 4 — Lancer l'import EN SIMULATION

**Trois minutes.** Rien n'est écrit. On regarde.

1. GitHub → onglet **Actions**
2. Colonne de gauche → **Import des données v1**
3. Bouton **Run workflow** (à droite) → laissez **`dry_run` sur `true`**
4. Bouton vert **Run workflow**
5. Attendez ~1 minute, **rechargez la page**
6. Cliquez sur la ligne qui vient d'apparaître, puis sur le job **importer**
7. Faites défiler jusqu'aux trois sections **`=== Import des ... ===`**

**Repère — vous devez lire :**

```
[dry-run] 94 transactions seraient importées.
[dry-run] 38 apports seraient importés.
[dry-run] 179 snapshots seraient importés (2023-04-01 -> 2026-10-01).
[dry-run] 408 ligne(s) seraient retirées de la fenêtre (2023-04-01 -> 2026-10-01). Exemples : ...
```

**Envoyez-moi ces quatre lignes.** Je vérifie le compte avant que vous n'écriviez
quoi que ce soit.

### ✅ Votre dry-run est validé — les quatre chiffres sont les bons

| Ligne du journal | Ce qu'elle dit | Verdict |
|---|---|---|
| `94 transactions` | vos 96 lignes moins 2 fusions | ✅ exact |
| `38 apports` | 37 apports + 1 retrait | ✅ exact |
| `179 snapshots` | vos 180 lignes moins 1 doublon | ✅ exact |
| `408 lignes retirées` | le trou qui disparaît | ✅ **vérifié, voir ci-dessous** |

**Les 408, en détail — l'arithmétique se referme à l'unité près.** Votre v1
porte **179 dates**. Combien tombent dans la période de votre robot, qui va du
18/03/2025 au 01/10/2026 ? **155**, ni une de plus ni une de moins. Donc :

```
563 lignes du robot  −  408 retirées  =  155 lignes survivantes
                                         = les 155 dates de la v1
179 dates de la v1   −  155 communes  =  24 dates nouvelles
                                         (avril 2023 → mars 2025)
```

Les 24 dates nouvelles, ce sont **les dix-huit mois d'historique qui n'ont
jamais existé dans l'application** : votre courbe partait de mars 2025, elle
partira d'avril 2023.

> **Pourquoi je vous avais annoncé « de l'ordre de 530 » : c'était une
> estimation, et elle était fausse.** J'avais supposé que votre robot avait un
> point presque chaque nuit depuis mars 2025, alors qu'il en manque environ 350 —
> les jours où le robot a échoué, et il y en a eu beaucoup. Votre chiffre réel
> est le bon. Le mien était le mauvais. Je vous le dis parce qu'un écart entre
> ce qu'on annonce et ce qu'on lit, ça se signale.

**Ce n'est pas une perte, c'est le trou qui disparaît.** Ces 408 lignes sont
celles qui portaient les 9 900 € manquants avant le 02/02/2026. Les garder avec
les nouvelles produirait ceci : 65 534 € le 31/01, puis 55 640 € le 01/02, puis
64 809 € le 02/02 — une scie de 9 900 € en trois jours, que le TWR lirait comme
trois mouvements de marché au lieu d'un défaut de données. C'est exactement le
défaut qu'on vient de passer trois semaines à comprendre.

**Le prix à payer, et il est réel :** votre série redevient **mensuelle** jusqu'en
avril 2026, là où elle était quotidienne. Le robot rajoute un point chaque nuit à
partir de ce soir, donc la finesse revient par l'avant. Mais entre mars 2025 et
avril 2026, vous aurez un point par mois au lieu d'un point par jour.

### ⚠️ Un défaut trouvé dans mon code, grâce à votre rapport

Le journal annonçait la fenêtre de retrait comme ceci :

```
2024-07-30 -> 2026-10-01      <- ce que vous avez lu
2023-04-01 -> 2026-10-01      <- la vérité
```

**`PostgREST` ne rend pas les lignes dans l'ordre des dates.** La première ligne
que Supabase a renvoyée portait le 30/07/2024, alors que la plus ancienne de
votre table est le 01/04/2023. Mon code prenait la première et la dernière ligne
de la réponse comme bornes de la fenêtre : elle partait donc dix-huit mois trop
tard.

**Sans conséquence cette fois** — votre robot n'a rien écrit avant mars 2025, donc
la liste des 408 lignes est identique. Mais c'était de la chance, pas de la
correction : une réponse ordonnée autrement aurait pu laisser survivre des lignes
fausses. C'est corrigé, avec un test qui reproduit exactement votre cas — la
ligne du 30/07/2024 en tête de réponse.

**Ce que ça implique pour vous :** réuploadez le zip (**2 minutes**) avant de
lancer l'étape 5, pour que le journal annonce la bonne fenêtre. **Inutile de
refaire le dry-run** : j'ai vérifié que la liste des lignes retirées est
identique, à la ligne près.

**Si vous lisez autre chose :** arrêtez-vous et envoyez-moi tout le journal.
Les cas les plus probables sont listés en fin de document.

---

## ⬜ Étape 5 — Lancer l'import POUR DE VRAI

**Deux minutes.** Attendez mon feu vert : je réponds en quelques minutes.

1. Même écran : **Actions** → **Import des données v1** → **Run workflow**
2. Passez **`dry_run` sur `false`**
3. Bouton vert **Run workflow**
4. Attendez ~2 minutes — cette fois il y a le réseau à faire, une ligne par
   date pour le taux de change

**Repère — vous devez lire :**

```
=== Import des transactions ===
94 transactions importées.
=== Import des apports ===
38 apports importés.
=== Import de l'historique de valorisation (Projections) ===
179 snapshots importés (2023-04-01 -> 2026-10-01).
Fenêtre 2023-04-01 -> 2026-10-01 : 408 ligne(s) de la v2 remplacée(s) par l'historique v1 (la v2 en avait 563 au total).
408 ligne(s) de la v2 retirées de la fenêtre.
```

**Ce que fait cet import, en une phrase :** il remplace la série du robot par
votre historique de la v1 sur la période qu'elle couvre, parce que le robot
était court de 9 900 € avant le 02/02/2026 — c'est toute l'origine du
+26,2 %.

---

## ✅ Étape 5 — FAITE, et vérifiée à l'unité près

Votre import a réussi. Voici la reconstruction complète, à partir des chiffres
de votre propre journal :

```
La table contenait            563 lignes   (le robot, 2025-03-18 → 2026-10-01)
L'import a écrit              179 lignes   de la v1
   dont 155 écrasent une ligne du robot (même date)
   et   24 sont neuves
Table juste avant la purge    563 + 24 = 587
La fenêtre annoncée           « 2024-07-30 → 2026-10-01 »  (16 lignes v1 avant)
   lignes dans cette fenêtre    571          <- votre « la v2 en avait 571 »
Lignes retirées               408
ÉTAT FINAL                    179 lignes = les 179 de la v1
```

**179. Exactement votre série historique, du 01/04/2023 au 01/10/2026.** L'import
a fait ce qu'il devait faire.

**Deux libellés de moi étaient faux, et ils vous ont fait douter — à juste titre :**

| Ce que le journal a dit | La vérité |
|---|---|
| `179 snapshots importés (2024-07-30 -> 2026-10-01)` | la série va de **2023-04-01** à 2026-10-01. Le 2024-07-30 était la **première ligne rendue par Supabase**, dans un ordre quelconque — le défaut corrigé depuis |
| `la v2 en avait 571 au total` | la v2 en avait **563**. Les 571, c'était le nombre de lignes **dans la fenêtre annoncée** (563 du robot + 24 lignes v1 neuves − 16 lignes v1 antérieures à la fenêtre) |

Corrigé tous les deux dans le code que je vous ai envoyé depuis. **Vous pouvez
réuploader le zip quand vous voulez**, mais rien ne presse : ces deux phrases
sont de l'affichage, elles n'ont écrit aucune donnée. Le résultat est bon.

---

## ✅ Étape 6 — FAITE : les quatre chiffres sont exacts

**Cinq minutes.**

1. Streamlit Cloud → votre application → **Manage app** → **Reboot app**
2. Ouvrez la page **📈 Performance**
3. Descendez jusqu'à la section **« Par année »**

**Repère — vous devez voir :**

| Année | TWR attendu |
|---|---|
| 2023 | **+11,02 %** |
| 2024 | **−24,90 %** ← provisoire, voyez l'étape 7 |
| 2025 | **+4,12 %** |
| 2026 | **+8,66 %** |
| **Total depuis avril 2023** | **−5,68 %** |

Ces cinq chiffres sont calculés sur vos données réelles, avec le taux EUR/USD
de chaque jour. Si `2026` sort à **−5,92 %** au lieu de +8,66 %, c'est que
l'apport fantôme du 02/02/2026 est encore là — retournez à l'étape 2.

> **Une petite chose à ne pas confondre.** Le robot quotidien reprend ce soir et
> réécrira la ligne du 01/10/2026 avec **sa** valeur, environ **69 795 €**, quand
> la v1 affiche **70 470 €** ce jour-là. Il y aura donc un creux d'environ
> **−1 %** sur cette journée-là. Ce n'est pas une erreur : c'est la dernière
> trace du désaccord de 0,97 % entre les deux séries. Il s'effacera de
> lui-même au fil des semaines, et il est très en dessous du seuil d'alerte.

Et **une alerte rouge** doit apparaître, écrite par l'application elle-même :

> ⚠️ **un apport de 11 050 € enregistré, et la valeur ne suit pas — 30/04/2024**

C'est le nouveau contrôle qui travaille. Il vous montre la ligne du 29/04/2024
dont je vous ai parlé, avec le montant et l'écart. **Vous n'avez pas à me croire
sur parole : l'application le calcule devant vous.**

> **Si l'alerte rouge n'apparaît pas**, envoyez-moi une capture de la page. Soit
> la ligne a été supprimée, soit mon seuil est trop prudent — les deux sont
> intéressants à savoir.

---

## ⬜ Étape 7 — Réparer l'année 2024

**Cinq minutes.** C'est votre décision, pas la mienne : c'est votre relevé qui
tranche.

### Le message que vous avez lu, et ce qu'il dit exactement

> « un apport de 11 050 € enregistré **entre le 30/03/2024 et le 30/04/2024**,
> et la valeur ne suit pas. Le portefeuille ne varie que de +23 € alors qu'il
> devrait varier d'au moins 11 050 € de ce seul fait. »

**Notez la période et non une seule date.** Le versement litigieux est daté du
**29/04/2024** dans votre journal, alors que le snapshot qui le révèle porte le
30/04/2024. J'ai corrigé le message pour qu'il donne les deux bornes — il
n'affichait qu'une date, et vous auriez cherché une ligne au 30/04 qui n'existe
pas.

Le zip que je viens de reconstruire fait mieux : il **liste nommément les
versements de la période** sous le message, comme ceci —

> Versements enregistrés sur cette période : **29/04/2024** — apport de 10 800,00 €

Réuploadez-le quand vous voulez ; c'est de l'affichage, aucune donnée ne bouge.

Regardez votre relevé Swissquote **au 29 avril 2024**. Vous cherchez un
versement de **10 800 €**.

**Cas A — le versement n'a pas eu lieu** (ligne saisie deux fois, ou date
erronée) : supprimez-la, exactement comme à l'étape 2.

- Supabase → **Table Editor** → **`pf2_apports`**
- Ligne avec **`date = 2024-04-29`** et **`montant_eur = 10800`**
- Cocher → **Delete row**

**Après ça, 2024 passe de −24,90 % à +18,68 %**, et votre performance totale
depuis avril 2023 de **−5,68 % à +49,06 %**. C'est beaucoup pour une ligne —
mais c'est la bonne mesure : un versement fantôme de 12 000 $ pèse plus lourd
qu'une année entière de rendement sur un portefeuille de 30 000 $.

Votre propre table v1 affichait +15,21 % pour 2024. Les +18,68 % retombent dans
la même région — l'écart de 3 points est la différence de convention entre deux
façons de dater les flux.

**Cas B — le versement a bien eu lieu** : ne touchez à rien, et dites-le-moi.
C'est alors la valorisation d'avril 2024 qui manque dans la v1, et c'est une
autre histoire : je regarderai le mois de plus près.

> **Un détail à connaître :** cette ligne vient de votre table `Historique`. Si
> un jour vous relancez l'import, elle reviendra. Dites-le-moi et je l'exclus
> **définitivement dans le code**, pour que la correction survive aux relances.

---

## ⬜ Étape 8 — L'inflation 2026

**Trois minutes.**

1. GitHub → **Actions** → **Robots quotidiens**
2. **Run workflow** → **Run workflow**
3. Attendez ~2 minutes

**Repère :** dans le job **inflation**, vous devez lire
**`2026 : +3.04 % (provisoire)`**.

C'était le robot qui plantait, et la cause est instructive : il faisait un
`insert` là où il fallait un `upsert`. La clé primaire de la table est `annee`,
et elle existe toujours — le robot tourne chaque nuit sur les mêmes années. Il
échouait donc **avant** d'écrire quoi que ce soit, 2026 compris : l'année qui
manquait justement.

---

## ⬜ Étape 9 — Une question pour vous

Sur l'écran de performance de **Swissquote**, regardez la **devise** du
**+4,10 %** affiché.

- **Si c'est du dollar** : tout est expliqué, il n'y a plus rien à chercher.
  L'écart de 4 points avec vos +8,39 % est la baisse de l'euro depuis janvier
  (−5,9 %), et un portefeuille en dollars gagne en euros ce que l'euro perd.
- **Si c'est de l'euro** : il reste 4 points à comprendre. Dites-le-moi et je
  m'y mets.

---

## Ce qui peut mal tourner, et quoi faire

| Vous voyez | Ce que ça veut dire | Quoi faire |
|---|---|---|
| `Table v1 'Projections' introuvable` | Le nom de la table diffère chez vous | Envoyez-moi une capture de **Table Editor** |
| `Tables v2 absentes` | Un des `pf2_*` manque | Envoyez-moi la liste des tables |
| `1 ligne(s) écartée(s), taux USD/EUR introuvable` | Un jour sans taux de change | Normal, il est signalé. Si ça en fait plus de 3, dites-le-moi |
| `attribuable à un algorithme de réglage` / erreur Python | Un bug de ma part | Copiez-moi tout le journal |
| L'import écrit `0 snapshots` | La table est vide ou illisible | Envoyez-moi le journal entier |

---

## Récapitulatif

| | Étape | Où | Durée |
|---|---|---|---|
| ⬜ | 1 | sauvegarder `pf2_snapshots` en CSV | Supabase | 2 min |
| ⬜ | 2 | supprimer l'apport de 8 968,89 € du 02/02/2026 | Supabase | 2 min |
| ⬜ | 3 | envoyer le zip sur GitHub | GitHub | 5 min |
| ⬜ | 4 | lancer l'import **en simulation** et m'envoyer les 4 lignes | GitHub | 3 min |
| ⬜ | 5 | lancer l'import **pour de vrai** (après mon feu vert) | GitHub | 2 min |
| ⬜ | 6 | regarder 📈 Performance | Streamlit | 5 min |
| ⬜ | 7 | trancher la ligne du 29/04/2024 sur votre relevé | Supabase | 5 min |
| ⬜ | 8 | lancer « Robots quotidiens » | GitHub | 3 min |
| ⬜ | 9 | me dire la devise du +4,10 % de Swissquote | — | 1 min |

**Les trois étapes où vous m'attendez :** la 5 (feu vert), la 7 (votre relevé
tranche) et la 9. Pour tout le reste, vous avancez seul.

Et à la fin de l'étape 6, votre courbe de performance partira d'**avril 2023** —
trois ans et demi d'historique qui existaient déjà dans votre v1 et n'avaient
jamais trouvé le chemin de l'application.

---

## Ce que vos trois règles ont changé (la réponse complète)

Vos trois règles sont **justes**, vérifiées sur les données :

| Table | Votre règle | Ce que disent les chiffres |
|---|---|---|
| `Historique` | trois colonnes, trois unités | ✅ `Montant $` / `Montant Or` = **1 955,73 $/oz** en juillet 2023, **4 478,70 $/oz** en septembre 2026 : ce sont les cours réels de l'or |
| `Transaction` | l'unité est celle de la colonne `Devise` voisine | ✅ vérifié sur 96 lignes : `quantité × cours ± frais = Montant Net`, écart médian **0,001 %** |
| `Projections` | `Capital investi` en $ | ✅ 59 629,92 $ au 01/10/2026, quand le cumul du journal donne 59 630,04 $ |

**Ce que j'ai trouvé en vérifiant la deuxième règle.** Le `Montant Net` des
**ventes** ne s'obtient pas de la même façon que celui des achats : les frais se
**déduisent**. Trente-quatre lignes tombaient « faux » de mon calcul, toutes des
ventes, avec un écart d'exactement deux fois les frais. Exemple réel :
`14 × 62,6425 − 5,85 = 871,15`, le montant net de votre table.

Bonne nouvelle : **mon importateur faisait déjà ça.** Il ne le faisait pas par
hasard — la règle était écrite — mais **aucun test ne la protégeait**. Il y en a
cinq maintenant, sur vos valeurs réelles.

**Et une précision, parce qu'elle compte.** La devise n'est pas globale au
fichier : elle change de ligne en ligne. 87 de vos lignes sont en USD, les
**9 lignes XJSE.SW en JPY** (cours ≈ 1 115, pas 6,87). Votre règle « regardez la
colonne `Devise` juste à côté » est donc exactement la bonne — et c'est celle que
le code applique. La dixième ligne XJSE.SW, celle du 05/06/2026, est saisie en
USD : c'est la seule incohérence qui reste dans le fichier, elle vaut environ
**7 €**, ce n'est pas la peine d'y toucher maintenant.

### Le contrôle que vos règles m'ont fait écrire

Puisque `Capital investi` est en dollars, comme `Montant $`, les deux colonnes
sont **comparables**. J'ai donc ajouté au diagnostic un contrôle qui, pour chaque
mois, demande : *ce versement a-t-il fait bouger le capital investi ?*

Résultat sur vos trois ans et demi, sans que le contrôle sache rien d'avril 2024 :

```
1 période(s) où un apport enregistré n'a pas bougé le capital :

    periode                  flux_apports  capital_bouge_de  non_enregistre
    -----------------------  ------------  ----------------  --------------
    2024-03-30 → 2024-04-30     12 048.09              -500      -12 548.09
```

**Une seule période signalée sur les 180 points. La bonne.**

Et les autres gros versements, eux, bougent bien : +8 889 $ en mai 2024 pour
9 161 $ d'apports, +11 019 $ en juillet 2024 pour 11 554 $. Le signal est donc
net — 12 048 $ d'un côté, −500 $ de l'autre. Ce n'est pas du bruit.

Vous avez maintenant **cinq mesures indépendantes** qui disent la même chose sur
cette ligne :

| Mesure | Résultat |
|---|---|
| La valeur investie, en $ | 31 988 → 31 779 : elle **recule** |
| La trésorerie | figée à **22 690 $** d'août 2023 à août 2024 |
| Le capital investi de la v1 | **−500 $** ce mois-là |
| Le TWR affiché par la v1 en 2024 | **+15,21 %** — ce flux donnerait −24,90 % |
| Votre relevé | à regarder à l'étape 7 |

Le contrôle est maintenant dans le diagnostic, donc il tournera tout seul à
chaque fois. C'est ce qui manquait : les deux rounds précédents, je cherchais la
bonne ligne à la main.

### Un dernier aveu, parce qu'il vaut la peine

En écrivant ce contrôle, j'ai réintroduit **exactement** le bug de dates corrigé
au round précédent : `pd.to_datetime` sur du `jj/mm/aaaa` sans `dayfirst`, qui lit
le 29/04/2024 comme le 4 du 29ᵉ mois. Une date impossible, donc jamais trouvée.
Le contrôle a d'abord répondu « 1 période : 2023-01-04 → 2026-01-06 » — un
résultat absurde qui m'a mis sur la piste.

C'est corrigé, et **un test le protège maintenant nommément**, avec le commentaire
qui explique par où le défaut est entré. Dans ce projet, les bugs de dates sont
revenus trois fois ; ils ne reviendront pas une quatrième sans qu'un test crie.
