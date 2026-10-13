# Millésimes fiscaux — reprise de l'existant et révisions

**Année des revenus ≠ année de déclaration** : revenus 2025 → déclaration 2026.
Les montants présents dans le code 2.2.1 ne deviennent pas officiels parce qu'ils
ont été copiés en base. Ils portent l'origine `reprise_code_non_verifiee`.

## Modèle de données

- `pf2_fiscal_annees` contient une **copie par année de revenus de plusieurs
  constantes** embarquées dans `core/fiscal_bars.py` : barème, décote,
  IR forfaitaire, taux annuel de prélèvements sociaux, frais et autres constantes.
  **Ce n'est pas un modèle complet des règles de calcul** : le plafond du quotient
  familial, codé en dur dans `core/tax.py` et le JS, n'est notamment pas importé ;
  le taux de PS n'est pas ventilé par catégorie ni par date de prélèvement.
  L'année est une ligne, pas une nouvelle table. Chaque ligne porte une
  `revision` et une référence vers le commit source. Ces lignes sont lisibles
  depuis l'APK connectée mais insérables uniquement côté serveur.
- `pf2_fiscal_collectes` reçoit historiquement le barème IR transmis par
  OpenFisca-France. Il s'agit d'une **source partielle**, pas d'un millésime prêt
  pour une déclaration. Les données d'un autre utilisateur sont invisibles (RLS).
- Une rectification des chiffres d'une même année crée la **révision N+1**.
  C'est elle qui devient la plus récente ; la révision N reste consultable pour
  comprendre ce qui a changé. Une année différente ne change pas. La collecte
  Android fait déjà cela pour le barème IR ; la publication serveur d'un
  millésime complet rectifié nécessitera son propre contrôle de complétude.
- Le moteur Python conserve les constantes intégrées. L'APK applique une R2
  complète lorsqu'elle existe et passe son contrat ; sinon, pour les années
  compatibles **à partir de 2026**, le seul barème IR collecté peut alimenter
  une simulation explicitement indicative. Tous les autres paramètres non
  contrôlés sont signalés après l'appui sur le bouton. Cette collecte ne
  transforme jamais une R1 historique en règle validée et n'est pas une
  publication des règles complètes.

## Mettre la base en place (l'ordre compte)

1. **Sauvegarde avant toute écriture de millésimes : effectuée le 12/10/2026.**
   Le workflow avait d'abord échoué sur `Config` avec une clé `anon`. Le secret
   GitHub a été corrigé côté utilisateur, puis la relance du run 38254476762
   a réussi : export chiffré, restauration de contrôle et artefact présent.
   **Ne jamais exécuter `GRANT ... TO anon`** malgré la suggestion initiale
   de l'erreur : cela exposerait `Config`. La sauvegarde de `main` couvre les
   anciennes tables ; après fusion de cette branche, une sauvegarde inclura
   aussi les deux nouvelles tables fiscales comme tables optionnelles. Vérifier
   le compte rendu après l'import. Ne jamais communiquer la clé serveur, ni la
   placer dans l'APK ou le dépôt.
2. **Migrations 009 puis 010 : exécutées par le propriétaire** dans Supabase SQL
   Editor le 12/10/2026 ; retour « Success. No rows returned » pour chacune.
   La migration 010 conserve les éventuelles collectes IR de 009 en révision 1.
3. **Simulation : effectuée en lecture seule** sur la branche via Actions run
   38257679857. Résultat : aucune année présente dans `pf2_fiscal_annees` ;
   années proposées : **2022, 2023, 2024, 2025, 2026**. Aucune ligne insérée.
   Le workflow manuel de simulation existe, mais la **reprise initiale est
   désormais figée** : après correction des constantes, simulation et application
   refusent de proposer des chiffres sous l'ancienne provenance. Il utilise
   `SUPABASE_URL`, `SUPABASE_KEY` (service_role) et `SUPABASE_USER_ID`.
4. **Import réel autorisé puis effectué le 12/10/2026**, run Actions 38258384611 :
   2022, 2023, 2024, 2025, 2026 insérées en révision 1, aucune année déjà
   présente. Le job a relu chaque ligne et comparé les paramètres avec la
   copie attendue du code. La sauvegarde chiffrée de cette version a ensuite
   été restaurée pour contrôle ; l'artefact `sauvegarde-fiscale-38258384611`
   est disponible 90 jours dans Actions : le télécharger et conserver la phrase
   `SAUVEGARDE_CLE` dans un gestionnaire de mots de passe pour pouvoir l'ouvrir.
   Le déclencheur automatique ponctuel a été retiré
   de la branche après succès. **Ne pas relancer l'import** : depuis la correction
   locale des constantes 2025, simulation et `--appliquer` sont refusés pour
   empêcher d'attribuer les nouvelles valeurs au commit source ancien. Une
   correction ultérieure doit emprunter une publication de révision 2 distincte.
5. Contrôle facultatif côté Supabase :
   ```sql
   select annee_revenus, revision, origine, cree_le
     from public.pf2_fiscal_annees
    order by annee_revenus, revision;
   ```
   Ne copiez pas de données sensibles depuis d'autres tables dans un journal
   public. Le numéro de version `2.2.1` du téléphone ne change pas à cette étape.

**Import réel effectué et contrôlé sur Supabase le 12/10/2026.** Il s'agit
seulement d'une reprise des données du code embarqué, non de chiffres
fiscaux officiellement revérifiés. La PR #22 reste à examiner : ni le bouton
ni les sauvegardes périodiques incluant les nouvelles tables ne sont encore
livrés sur `main`. Une sauvegarde chiffrée ponctuelle avec les deux nouvelles
tables a été produite et contrôlée lors de l'import.

**Audit fiscal daté du 12/10/2026 :** voir
[`AUDIT-FISCAL-2025-2026.md`](AUDIT-FISCAL-2025-2026.md). Des écarts officiels
sont confirmés pour la décote, le quotient familial et les prélèvements sociaux
de certains gains 2025. L'import reste **non vérifié** ; aucune révision importée
ne doit être activée automatiquement pour les calculs sur la seule foi de cette
reprise.

**Préparation locale ultérieure (13/10/2026) :** voir
[`REVISION-FISCALE-2025-PREPARATION.md`](REVISION-FISCALE-2025-PREPARATION.md)
pour le brouillon d'une éventuelle révision 2 de **2025 uniquement**.
La [migration de structure 011](MIGRATION-FISCALE-011-MODE-EMPLOI.md) est déclarée
appliquée par le propriétaire après sauvegarde/restauration du run 38369577641 ;
les cinq R1 restent non vérifiées et inactives. Cette migration n'insère ni
n'active de R2 et ne change pas le moteur des calculs.
`python jobs/preparer_revision_fiscale_2025.py` génère un inventaire hors ligne
avec différences attendues et règles non auditées ; ce n'est ni une simulation
de lecture Supabase, ni une ligne publiable, ni une sauvegarde. Aucune écriture
de paramètres fiscaux n'a été effectuée pendant cette préparation : seule la structure de la table a été étendue par 011.

## Collecte sur le téléphone (APK de branche, distincte de la release publique 2.2.1)

Le bouton de la version antérieure à la migration 012 lit le barème IR de **l'année sélectionnée** sur
`https://api.fr.openfisca.org/latest/parameter/impot_revenu/bareme_ir_depuis_1945/bareme`.
Le pont réseau de l'APK de branche doit autoriser l'hôte HTTPS **exact**
`api.fr.openfisca.org` : son omission a causé le message « source injoignable »
alors que Supabase fonctionnait. Une APK antérieure au correctif ne peut pas
réussir cette collecte. Ni la migration 009 ni la 010 ne doivent être rejouées
pour corriger un refus de cet hôte. Le serveur et son format restent des
dépendances externes : un accès à l'hôte ne garantit pas une réponse valide.
Une entrée explicite pour l'année des revenus est exigée ; aucun barème de l'année
précédente n'est supposé valable. Si la source rectifie une année déjà collectée,
le bouton ajoute une révision, conserve la précédente. Pour une année avec un
moteur embarqué compatible (actuellement 2026), les nouveaux seuils et taux IR
modifient **seulement la simulation indicative**, jamais une R2 complète ;
la décote, les PS, frais, crypto, règles de calcul et montants personnels restent
non vérifiés. Si aucune année compatible n'existe dans l'APK (par exemple 2027),
le bouton peut collecter un barème mais refuse de calculer en recopiant l'année
précédente. Le rapport du bouton liste les manques. OpenFisca est une modélisation
ouverte, **pas le texte officiel de la loi**. Tester uniquement l'artefact de branche construit avec la signature
habituelle ; la release publique `apk-2.2.1` correspond à un ancien commit et
ne contient pas le lecteur R2 ni le correctif d'accès OpenFisca. Ne pas
installer un APK signé avec une clé de développement par-dessus l'application.

Tests sans base : `python -m unittest tests.test_importer_fiscal_existant`,
`node tests/test_fiscal_sources.js`.

## Extension des paramètres isolés (branche, 13/10/2026)

**Migration 012 exécutée par le propriétaire le 13/10/2026 (succès communiqué), après le run de sauvegarde/restauration 38396580535 réussi. Ne pas la rejouer.** Avant cela, la table 009/010 limitait
`source` et `source_url` au barème IR. Le script
[`migrations/012_collecte_parametres_fiscaux.sql`](../migrations/012_collecte_parametres_fiscaux.sql)
élargit ces deux contraintes à `openfisca_parametres` sans modifier une seule
révision existante. Il a été appliqué **une seule fois** par le propriétaire après la sauvegarde vérifiée.
Ne pas rejouer 009, 010, 011, 012 ni le SQL R2 2025. L'APK et le SQL sont
deux opérations distinctes : une erreur d'unicité `23505` signifie qu'une
révision existe déjà, **pas** que la migration a échoué. La collecte relit
désormais la dernière révision de cette année/source puis réessaie au plus deux
fois en cas de conflit, sans modifier ni supprimer une ligne existante. Même
si l'enregistrement échoue, le bilan montre les feuilles recherchées et distingue
les valeurs repérées mais non enregistrées (donc non utilisées).

Le clic interroge, pour l'année de revenus choisie, les paramètres scalaires
suivants d'OpenFisca-France, à partir de
`https://api.fr.openfisca.org/latest/parameter/` :

| Catégorie | Chemin sous `/parameter/` | Traitement |
| --- | --- | --- |
| Plafond général QF | `impot_revenu/calcul_impot_revenu/plaf_qf/plafond_avantages_procures_par_demi_part/general` | Utilisé **dans la simulation indicative seulement** si valeur explicite pour l'année et moteur compatible. Les demi-parts particulières ne sont pas couvertes. |
| Décote | `impot_revenu/calcul_impot_revenu/plaf_qf/decote/seuil_celib`, `seuil_couple`, `taux` | Chiffres collectés mais **non appliqués isolément** : seuils d'application, arrondis et méthode restent à auditer. |
| CSG et PS du capital | `taxation_capital/prelevements_sociaux/csg/{taux_global,taux_deductible}/{revenus_du_patrimoine,produits_de_placement}` et `taxation_capital/prelevements_sociaux/prelevements_solidarite/{revenus_du_patrimoine,produits_de_placement}` | Collectés séparément, **jamais additionnés en un taux de PS global**. CRDS, autres composantes, date de paiement et catégories ne sont pas vérifiées. |
| Crypto | `impot_revenu/calcul_impot_revenu/pv/actifs_numeriques/{plancher,taux}` | Seul le seuil de cessions peut alimenter la simulation indicative si explicite ; taux, méthode de calcul 2086, exhaustivité du foyer et option 3CN non certifiés. |
| Repas, kilomètres | Aucune feuille OpenFisca structurée repérée pour ces barèmes | **Pas de mise à jour automatique** à partir de cette source. Les frais réels embarqués restent estimatifs et soumis aux justificatifs personnels. |
| Changements de formules | Ce ne sont pas des paramètres scalaires | **Non appliqués automatiquement**. Mise à jour/test du moteur et nouvelle APK indispensables. L'absence de changement de code n'est pas certifiée par ce bouton. |

La collecte conserve **chaque révision d'un même millésime** dans
`pf2_fiscal_collectes` avec sa source, le chemin de chaque feuille et sa date ; une nouvelle année est
séparée. Seule une valeur numérique valide à la clé exacte `AAAA-01-01` est
acceptée. Une valeur d'une année antérieure n'est **jamais** présumée encore
valide. Une panne d'une feuille n'empêche pas de rapporter les autres ; les
feuilles manquantes/inaccessibles sont nommées après le clic. Le lecteur
revérifie à chaque session la période, la source, la forme et les bornes de la
dernière révision : une révision plus récente invalide désactive la collecte
partielle plutôt que revenir silencieusement à une ancienne. R2 2025 complète
reste prioritaire. La publication d'une R2 pour une année future n'est **pas**
automatisée et 2027 n'a pas de moteur fiscal compatible dans cette APK.

L'API OpenFisca décrit une modélisation publique, **pas** la certification de
la DGFiP ou d'une LF/LFSS publiée. Au 13/10/2026, lors de l'essai utilisateur,
le barème IR explicite 2026 était absent ; aucune hausse ou stabilité d'IR
2026 ne doit en être déduite. Le fait qu'une autre feuille soit datée de 2026
ne complète pas le millésime fiscal. Le rapport n'atteste pas l'absence d'une
loi rectificative ni la validité de la déclaration.

Tests locaux sans Supabase :
`node tests/test_fiscal_parametres_partiels.js`,
`node tests/test_fiscal_sources.js`,
`node tests/test_fiscal_maj_indicative.js`.
