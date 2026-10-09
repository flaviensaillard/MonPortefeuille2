# 05 — Rapport intégrité, complétude et continuité des données

**Version examinée :** 2.0.1 · HEAD `7be0e11` · 09/10/2026. Ce rapport distingue les lignes incohérentes volontairement ignorées (comportement documenté) des défauts de valorisation, d’historique et de synchronisation.

## D-01 — Le snapshot « résilient » écrit une valeur partielle sans marque de complétude

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** quand certaines positions n’ont pas de cours, `jobs/daily_snapshot.py:87-92` continue si au moins une position est valorisable; lorsqu’un FX/liquide manque, la ligne est omise avec une alerte (`:106-146`) puis l’agrégat est écrit (`:158-175`). Le schéma `migrations/001_init.sql:67-80` n’a aucun champ `complet`, `lignes_manquantes` ou statut. `core/session.py:782-821` ajoute ensuite ces snapshots à l’historique sans filtrage de complétude.

**Impact :** si un ticker n’a plus de cours pendant une séance, le patrimoine historisé baisse artificiellement; à son retour, la courbe remonte. Une alerte séparée ne permet pas aux calculs TWR/retirement de savoir que le point ne représente qu’une partie du portefeuille. Les tests de résilience des transactions ne prouvent pas que cette omission de cours est sans effet.

**Correctif proposé :** ne pas utiliser un point partiel dans les séries de performance, ou stocker un statut détaillé par composant (positions, liquidités, taux, source/date) et calculer seulement les sous-séries complètes. L’alerte doit rester liée au point et être visible sur le graphique. Effort M.

## D-02 — Un portefeuille entièrement en liquidités ne produit aucun snapshot

**Sévérité : MAJEUR · Effort : S**

**Preuve / scénario :** `jobs/daily_snapshot.py:76-78` retourne `0` dès que `calculer_positions()` ne renvoie aucun titre. La lecture des comptes/liquidités n’arrive qu’ensuite, lignes `106-110`. Les comptes disponibles sont pourtant la source de liquidité de la 2.0 (`migrations/003_comptes.sql:26-38`).

**Scénario :** vente de tous les titres, conservation du produit en EUR/USD/CHF; le job annonce « Rien à snapshotter », retourne succès et ne conserve pas la valeur en cash. Les comptes en cash seul ne sont pas une valeur nulle.

**Correctif proposé :** lire et valoriser les liquidités avant le test de sortie; écrire un snapshot dès qu’au moins un composant patrimonial est présent, y compris un total investi nul. Effort S.

## D-03 — Transaction et mouvement de compte ne sont pas atomiques

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `creerTitreAvecCompte()` insère d’abord une transaction, puis le mouvement lié (`app/src/main/assets/www/js/app.js:838-855`); en cas d’échec, il tente d’effacer la première ligne. La modification met à jour la transaction, puis l’opération séparément (`:890-900`). Un arrêt de l’application, délai réseau, perte d’accusé de réception ou échec de compensation entre les deux requêtes peut laisser les tables désynchronisées. L’intention « titre et mouvement, ou aucun » apparaît au commentaire `:835-837`, mais ce n’est pas une transaction PostgreSQL unique.

**Correctif proposé :** faire les deux écritures dans une fonction RPC SQL transactionnelle, avec identifiant de commande/idempotence et contrainte vérifiant le lien. Tester injection d’échec entre écritures et rejeu après timeout. Effort M.

## D-04 — Le faux code devise `NAN` passe la validation et vaut 1

**Sévérité : MAJEUR · Effort : S**

**Preuve / scénario :** le champ compte accepte un texte libre suggéré (`app/src/main/assets/www/js/app.js:1261-1265`); `comptes.js:59-68` ne valide que trois lettres majuscules, donc `NAN` passe. Les deux convertisseurs déclarent explicitement `NAN` égal à 1 (`core/fx.py:81-85`, `app/src/main/assets/www/js/net.js:286-290`). Les transactions Python normalisent `Devise` à `str(...).upper()` puis ne détectent pas toujours `NaN` comme vide (`core/portfolio.py:212-224`).

**Scénario :** devise saisie/importée `NAN` pour un compte ou une ligne de transaction; 1 000 unités sont traitées comme 1 000 EUR/USD selon le chemin, sans appel FX ni bannière. Le code à trois lettres ne vérifie pas ISO 4217.

**Correctif proposé :** représenter l’absence par `None`, ne jamais faire d’un sentinelle numérique une devise; valider contre une liste ISO 4217 partagée et refuser toute devise non prise en charge. Ajouter test `NAN`, cellule CSV vide/NaN et code inconnu aux deux moteurs. Effort S.

## D-05 — Lectures Supabase sans pagination

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** Python `core/db.py:187-190` fait un `select("*").execute()` unique; Android `app/src/main/assets/www/js/net.js:346-351` renvoie la réponse unique, sans `range`, curseur ou boucle. La limite standard Supabase/PostgREST est de 1 000 lignes par réponse, configurable côté projet. Les snapshots journaliers dépassent 1 000 lignes en ≈2,7 ans; les transactions et mouvements croissent aussi.

**Correctif proposé :** pagination stable (ordre par clé primaire/date + curseur/range), déduplication et indication d’erreur si une page échoue; éviter de charger toute la table pour un écran; tester 1 001 lignes et plusieurs décennies. Effort M.

**Source :** [Supabase, référence `limit`/pagination](https://supabase.com/docs/reference/python/limit).

## D-06 — Le dédoublonnage SQL peut refuser deux exécutions légitimes distinctes

**Sévérité : MINEUR · Effort : S**

**Preuve / scénario :** l’index unique de `migrations/001_init.sql:37-40` porte seulement sur `(ticker, sens, date, quantite, cours)`, sans `frais`, `source` ni `reference`. Deux exécutions réelles le même jour, sur le même titre, de mêmes quantité/cours mais avec références/frais différents sont indiscernables et la seconde insertion est refusée.

**Correctif proposé :** dédoublonner sur une référence externe/import stable lorsqu’elle existe; distinguer import rejoué d’exécutions réellement distinctes. Pour les saisies manuelles sans ID source, laisser un contrôle explicite plutôt qu’une unicité métier trop large. Effort S.

## D-07 — Une transaction incohérente est visible côté portefeuille mais pas invalidée côté fiscal

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** le comportement d’ignorer les ventes sans position ou excédentaires est intentionnel et signalé (`core/portfolio.py:428-445`, `app.py:66-79`, `jobs/daily_snapshot.py:56-75`). Le défaut distinct est que `core/tax.py:708-729,854-886` poursuit le calcul sur la quantité entière; détails dans [04](04-fiscalite-fr.md). Les tests `tests/test_snapshot_resilient.py` verrouillent la continuité du snapshot avec une transaction erronée, mais ne garantissent pas le rejet fiscal cohérent.

**Correctif proposé :** conserver la continuité d’affichage si elle est souhaitée, mais propager un statut `incomplet/non déclarable` aux calculs fiscaux concernés et bloquer les cases finales. Ne pas supprimer le comportement résilient sans décider son contrat. Effort M.

## Données et conservation

Le snapshot schema ne conserve que des montants EUR et l’équivalent-or, pas chaque devise/source (`migrations/001_init.sql:67-80`); la reconstruction USD est traitée dans [02](02-finances.md). Les lectures illimitées et la complétude sont prioritaires avant d’étendre l’historique sur 40 ans. Aucun export/récupération de base de l’utilisateur n’a été exécuté dans cette revue.
