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

1. **Vérifier une vraie sauvegarde réussie avant toute écriture de millésimes.**
   Le 12/10/2026, « Sauvegarde chiffrée » a échoué à la lecture de `Config` :
   `permission denied`, avec une suggestion de `GRANT ... TO anon` dans le log.
   **Ne surtout pas suivre cette suggestion** : exposer `Config` à la clé
   publique serait une fuite. La clé `SUPABASE_KEY` configurée dans les secrets
   GitHub semble être de rôle `anon`, alors que les jobs serveur attendent une
   clé **service_role** (ou nouvelle clé `sb_secret_…`). Corriger *uniquement*
   ce secret GitHub depuis Supabase → Project Settings → API Keys, puis relancer
   « Sauvegarde chiffrée ». Ne jamais communiquer la clé, ni la mettre dans
   l'APK ou le dépôt. Le code bloque désormais avant lecture si le secret a le
   rôle `anon`. Ces scripts SQL ne suppriment ni ne modifient vos tables de
   transactions, ni les autres données fiscales `Config`.
   La prochaine sauvegarde, si elle réussit, inclura les deux nouvelles tables
   fiscales comme tables optionnelles ; contrôlez le compte rendu pour confirmer
   qu'elles y figurent après l'import (une table absente est explicitement signalée).
2. Dans **Supabase → SQL Editor**, exécuter `migrations/009_collectes_fiscales.sql`
   puis `migrations/010_fiscal_annees.sql`. Aucune clé service rôle n'est à
   transmettre dans la conversation. La migration 010 peut être rejouée ; elle
   conserve les éventuelles collectes IR de la 009, qui deviennent révision 1.
3. Une fois le code sur `main`, GitHub → **Actions → Reprendre les millésimes
   fiscaux existants → Run workflow**, laisser « Écrire » sur **Non** et lire
   les années proposées (simulation). Ce workflow emploie les secrets serveur
   déjà utilisés par les robots : `SUPABASE_URL`, `SUPABASE_KEY` (service_role)
   et `SUPABASE_USER_ID`. Il ne demande aucune valeur dans l'APK.
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

**Je n'ai pas exécuté ces SQL sur votre projet Supabase.** La branche prépare
l'opération mais la connexion SQL à votre base n'est pas disponible ici ; l'ordre
09 → 10 → simulation → import réel est indispensable.

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
