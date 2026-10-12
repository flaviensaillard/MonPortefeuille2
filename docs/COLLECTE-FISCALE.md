# Millésimes fiscaux — reprise de l'existant et révisions

**Année des revenus ≠ année de déclaration** : revenus 2025 → déclaration 2026.
Les montants présents dans le code 2.2.1 ne deviennent pas officiels parce qu'ils
ont été copiés en base. Ils portent l'origine `reprise_code_non_verifiee`.

## Modèle de données

- `pf2_fiscal_annees` contient une **copie complète, par année de revenus**, des
  paramètres actuellement embarqués dans `core/fiscal_bars.py` : barème, décote,
  IR forfaitaire, prélèvements sociaux, frais et autres constantes du moteur.
  L'année est une ligne, pas une nouvelle table. Chaque ligne porte une
  `revision` et une référence vers le commit source. Ces lignes sont lisibles
  depuis l'APK connectée mais insérables uniquement côté serveur.
- `pf2_fiscal_collectes` reçoit pour l'instant le barème IR transmis par
  OpenFisca-France. Il s'agit d'une **source partielle**, pas d'un millésime prêt
  pour une déclaration. Les données d'un autre utilisateur sont invisibles (RLS).
- Une rectification des chiffres d'une même année crée la **révision N+1**.
  C'est elle qui devient la plus récente ; la révision N reste consultable pour
  comprendre ce qui a changé. Une année différente ne change pas. La collecte
  Android fait déjà cela pour le barème IR ; la publication serveur d'un
  millésime complet rectifié nécessitera son propre contrôle de complétude.
- Le moteur fiscal Python/Android utilise **encore les constantes intégrées** :
  ni une collecte IR ni la reprise du code ne basculent silencieusement les
  calculs vers la base. Il faut d'abord couvrir et valider tous les paramètres
  et les changements de règles et tester le lecteur des deux plateformes.

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
   Le workflow manuel de simulation restera disponible sur `main` après fusion.
   Il utilise `SUPABASE_URL`, `SUPABASE_KEY` (service_role) et `SUPABASE_USER_ID`.
4. Si le rapport convient, relancer le workflow avec **Écrire = Oui**. Seules
   les années ABSENTES sont insérées en révision 1. Si une année possède déjà
   une révision, elle est laissée intacte. Relancer une deuxième fois ne crée
   rien. Commande équivalente sur un poste équipé et configuré :
   `python jobs/importer_fiscal_existant.py --dry-run`, puis `--appliquer`.
5. Vérifier côté Supabase :
   ```sql
   select annee_revenus, revision, origine, cree_le
     from public.pf2_fiscal_annees
    order by annee_revenus, revision;
   ```
   Ne copiez pas de données sensibles depuis d'autres tables dans un journal
   public. Le numéro de version `2.2.1` du téléphone ne change pas à cette étape.

**Import réel NON exécuté : en attente de l'accord du propriétaire.** Les SQL ont
été exécutés par le propriétaire, la sauvegarde et la simulation sont réussies.
Les données proposées proviennent toujours du code embarqué, non des textes
fiscaux officiellement revérifiés.

## Collecte sur le téléphone (version future, pas APK 2.2.1 installée)

Le bouton « Chercher les données fiscales disponibles » lit le barème IR sur
`https://api.fr.openfisca.org/latest/parameter/impot_revenu/bareme_ir_depuis_1945/bareme`.
Une entrée explicite pour l'année des revenus est exigée ; aucun barème de l'année
précédente n'est supposé valable. Si la source rectifie une année déjà collectée,
le bouton ajoute une révision, conserve la précédente et laisse les calculs
inchangés. OpenFisca est une modélisation ouverte, **pas le texte officiel de la
loi**. Ne pas installer un paquet APK signé avec une clé de développement sur la
2.2.1 : une prochaine release aura son propre numéro et la signature habituelle.

Tests sans base : `python -m unittest tests.test_importer_fiscal_existant`,
`node tests/test_fiscal_sources.js`.
