# Méthode pas à pas

Sept étapes. Comptez **trente minutes** en tout, à faire dans cet ordre.

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
[dry-run] XXX ligne(s) seraient retirées de la fenêtre (2023-04-01 -> 2026-10-01). Exemples : ...
```

**Envoyez-moi ces quatre lignes.** Je vérifie le compte avant que vous n'écriviez
quoi que ce soit.

**Le quatrième chiffre va vous surprendre : de l'ordre de 530.** Le chiffre
exact dépend des jours où votre v1 et votre robot ont un point commun. Je préfère
vous prévenir plutôt que de vous laisser découvrir un gros nombre tout seul —
voici ce qu'il veut dire.

Votre robot écrivait **un point par nuit** depuis le 18/03/2025 : 563 lignes.
Votre historique v1 porte **179 points** sur la même période et avant elle. Là
où les deux ont un point au même jour, celui de la v1 remplace l'autre. Partout
ailleurs — les 530 autres nuits — la ligne du robot est **retirée**, parce
qu'elle était **9 900 € trop basse** avant le 02/02/2026.

Ce n'est pas une perte : c'est le trou qui disparaît.

**Le prix à payer, et je le dis franchement :** votre série redevient mensuelle
là où elle était quotidienne. Le robot rajoutera un point chaque nuit à partir
de ce soir, donc la finesse revient par l'avant. Mais pour les huit derniers
mois, vous aurez un point toutes les deux semaines au lieu d'un par jour.

L'alternative — garder les deux séries — produirait ceci : 65 534 € le 31/01,
puis 55 640 € le 01/02, puis 64 809 € le 02/02. Une scie de 9 900 € en trois
jours, que le TWR lirait comme trois mouvements de marché au lieu d'un défaut de
données. C'est exactement le défaut qu'on vient de passer trois semaines à
comprendre.

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
Fenêtre 2023-04-01 -> 2026-10-01 : 530 ligne(s) de la v2 remplacée(s) par l'historique v1 (la v2 en avait 563 au total).
530 ligne(s) de la v2 retirées de la fenêtre.
```

**Ce que fait cet import, en une phrase :** il remplace la série du robot par
votre historique de la v1 sur la période qu'elle couvre, parce que le robot
était court de 9 900 € avant le 02/02/2026 — c'est toute l'origine du
+26,2 %.

---

## ⬜ Étape 6 — Regarder le résultat

**Cinq minutes.**

1. Streamlit Cloud → votre application → **Manage app** → **Reboot app**
2. Ouvrez la page **📈 Performance**
3. Descendez jusqu'à la section **« Par année »**

**Repère — vous devez voir :**

| Année | TWR |
|---|---|
| 2023 | **+11,02 %** |
| 2024 | **−24,90 %** ← provisoire, voyez l'étape 7 |
| 2025 | **+4,12 %** |
| 2026 | **+8,39 %** |

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

Regardez votre relevé Swissquote **au 29 avril 2024**. Vous cherchez un
versement de **10 800 €**.

**Cas A — le versement n'a pas eu lieu** (ligne saisie deux fois, ou date
erronée) : supprimez-la, exactement comme à l'étape 2.

- Supabase → **Table Editor** → **`pf2_apports`**
- Ligne avec **`date = 2024-04-29`** et **`montant_eur = 10800`**
- Cocher → **Delete row**

**Après ça, 2024 passe de −24,90 % à +18,68 %** — et votre propre table v1
affichait +15,21 % pour cette année. On retombe sur nos pieds.

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
