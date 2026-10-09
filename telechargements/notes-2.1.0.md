# MonPortefeuille 2.1.0 — notes de version

**Version :** 2.1.0 · **Code de version :** 28 · **Release unique :** `apk-2.1.0`

Cette version corrige les constats de la revue **2.0.1** (dossier `telechargements/revue-2.0.1/`, branche `arena/7947e984-monportefeuille2`, HEAD examiné `7be0e11`). Elle suit l'ordre imposé par la revue : sécurité, intégrité des données, rendement pondéré (TWR), fiscalité, intégration continue.

**Règle suivie partout :** chaque défaut a d'abord été verrouillé par un test qui **échouait sur la 2.0.1**, puis corrigé. Les vérifications ci-dessous se refont avec `python -m pytest tests/` et `node tests/<suite>.js`.

---

## 1. Mise en service : la checklist, dans cet ordre

Le compte propriétaire passe **avant** les migrations. Les migrations 004 et 008 rattachent les lignes existantes à un identifiant d'utilisateur (*uid*), qui n'existe qu'une fois le compte créé. Un script exécuté sans uid valide s'arrête avec un message explicite, avant de rattacher la moindre ligne.

**Étape 0 — Sauvegarde.** Avant la première migration, exportez chaque table : Supabase > Table Editor, ou `pg_dump` depuis votre poste.

**Étape 1 — Créer le compte propriétaire.** Supabase > Authentication > Users > **Add user** > **Create new user**. Saisissez votre adresse e-mail et un mot de passe fort (conservé dans un gestionnaire de mots de passe), puis cochez **« Auto Confirm User »** : sans cette case, le compte doit être confirmé par e-mail avant sa première connexion.

**Étape 2 — Copier l'uid.** Supabase > Authentication > Users : copiez la valeur de la colonne **User UID** de votre ligne. C'est une chaîne de la forme `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`, pas votre adresse e-mail. Si l'intitulé de la colonne diffère sur votre tableau de bord, copiez l'identifiant de la même ligne : `select id, email from auth.users;` dans le SQL Editor affiche la même valeur.

**Étape 3 — Exécuter les migrations 004, 005, 006, 007, 008, dans cet ordre.** Supabase > SQL Editor > New query : collez **un seul** fichier, cliquez sur Run, puis passez au suivant.

| Ordre | Fichier | Modification avant exécution |
|---|---|---|
| 1 | `migrations/004_auth_rls.sql` | Remplacer `<VOTRE-UID>` par l'uid, à la ligne `select set_config('pf2.owner_uid', …)`. |
| 2 | `migrations/005_snapshot_complet.sql` | Aucune. |
| 3 | `migrations/006_twr_valorisation_flux.sql` | Aucune. |
| 4 | `migrations/007_inventaire_crypto.sql` | Aucune. |
| 5 | `migrations/008_v1_proprietaire.sql` | Même uid, à la même ligne `select set_config(…)`. |

Si un script répond « uid du propriétaire absent ou invalide », le marqueur n'a pas été remplacé ou l'uid a été mal copié : corrigez la ligne et relancez le même fichier (chaque script peut être rejoué sans erreur).

**Étape 4 — Vérifier le rattachement.** Le rattachement des lignes existantes est fait par les migrations elles-mêmes : 004 pour les neuf tables `pf2_` ; 007 crée `pf2_inventaire_crypto`, vide et protégée d'emblée (`user_id` obligatoire) ; 008 pour les cinq tables v1 (`Config`, `Donnees`, `Historique`, `Projections`, `Transaction`). Contrôlez dans le SQL Editor :

```sql
-- Contrôle 1 : aucune ligne sans propriétaire. Attendu : 0 sur chaque ligne.
select 'pf2_transactions' as table_, count(*) filter (where user_id is null) as sans_proprietaire from pf2_transactions
union all select 'pf2_apports', count(*) filter (where user_id is null) from pf2_apports
union all select 'pf2_snapshots', count(*) filter (where user_id is null) from pf2_snapshots
union all select 'pf2_cours', count(*) filter (where user_id is null) from pf2_cours
union all select 'pf2_fx', count(*) filter (where user_id is null) from pf2_fx
union all select 'pf2_inflation', count(*) filter (where user_id is null) from pf2_inflation
union all select 'pf2_alertes', count(*) filter (where user_id is null) from pf2_alertes
union all select 'pf2_comptes', count(*) filter (where user_id is null) from pf2_comptes
union all select 'pf2_operations_compte', count(*) filter (where user_id is null) from pf2_operations_compte
union all select 'pf2_inventaire_crypto', count(*) filter (where user_id is null) from pf2_inventaire_crypto
union all select 'Config', count(*) filter (where user_id is null) from "Config"
union all select 'Donnees', count(*) filter (where user_id is null) from "Donnees"
union all select 'Historique', count(*) filter (where user_id is null) from "Historique"
union all select 'Projections', count(*) filter (where user_id is null) from "Projections"
union all select 'Transaction', count(*) filter (where user_id is null) from "Transaction";

-- Contrôle 2 : la clé publique n'a aucun accès aux tables v1. Attendu : aucune ligne.
select c.relname
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('Config', 'Donnees', 'Historique', 'Projections', 'Transaction')
  and (has_table_privilege('anon', c.oid, 'select, insert, update, delete')
       or not c.relrowsecurity);
```

**Étape 5 — Définir `SUPABASE_USER_ID`, dans la même séance.** Entre l'étape 3 et cette étape, les écritures des robots et de Streamlit sont refusées (« sans propriétaire ») ; les lectures continuent. C'est voulu, mais ne laissez pas cet écart durer.

- **GitHub** : Settings > Secrets and variables > Actions > **New repository secret**, nom `SUPABASE_USER_ID`, valeur : l'uid de l'étape 2. Vérifiez aussi que `SUPABASE_KEY` est la clé **service_role** (Project Settings > API) : avec la clé publishable, les robots sont refusés (42501).
- **Streamlit** : dans `.streamlit/secrets.toml` (ignoré par Git), à côté de `SUPABASE_URL` et `SUPABASE_KEY`, ajoutez `SUPABASE_USER_ID = "votre-uid"` (ou dans le gestionnaire de secrets de votre hébergement, si l'application n'est pas lancée en local). Une variable d'environnement du même nom convient aussi.
- **Application Android** : ni `SUPABASE_USER_ID` ni clé de service (l'application refuse une clé service_role). Au premier lancement, elle demande l'URL du projet et la clé publique (anon / publishable), une seule fois, puis le compte de l'étape 1 (e-mail et mot de passe).

**Étape 6 — Relancer les robots.** GitHub > Actions > « Robots quotidiens » > **Run workflow**. Les quatre jobs doivent passer au vert. Tant que `main` ne porte pas la 2.1.0, lancez le workflow depuis la branche de la version (sélecteur de branche du bouton **Run workflow**) : `main` exécute son propre `daily.yml`, qui ne transmet pas `SUPABASE_USER_ID`. Un job rouge avec « sans propriétaire » signifie que `SUPABASE_USER_ID` manque ; un job rouge avec « foreign key » (clé étrangère) signifie qu'il est faux.

**Étape 7 — Installer l'APK 2.1.0.** La release `apk-2.1.0` est publiée par le workflow `apk.yml`, une fois les quatre secrets de signature définis (§ 1.2). Avant de désinstaller la 2.0.1, notez les valeurs de la fiche « Situation fiscale » de l'application Android : elles sont stockées sur le téléphone, et la désinstallation les efface (§ 5). Désinstallez la 2.0.1, signée avec l'ancienne clé (§ 1.2), installez la 2.1.0, puis suivez l'étape 5 pour l'URL, la clé publique et la connexion.

**Étape 8 — Reprendre la fiscalité.** Page Fiscalité, pour chaque année : si les anciennes valeurs correspondent, cliquez « Reprendre les anciennes valeurs sans année, pour N » (reprise explicite, jamais automatique) ; vérifiez ; cochez « Je confirme que ces montants et options sont ceux de l'année N, et non ceux d'une autre année » ; cliquez « Enregistrer les données de N ».

**Étape 9 — Contrôle final.** Le portefeuille et la performance s'affichent ; les robots sont verts ; aucune erreur « sans propriétaire » (23502) ni « row-level security » (42501) n'apparaît.

**Avertissements.** Après la migration 004, la 2.0.1 ne lit plus rien : c'est voulu. La clé service_role est un secret de serveur : ne la mettez jamais dans l'APK. Recommandé : désactivez les inscriptions publiques dans les réglages d'authentification de Supabase, pour qu'un seul compte puisse exister (libellé à vérifier sur votre tableau de bord).

### 1.2 Clé de signature Android (prérequis de publication)

La 2.0.1 mettait la clé de signature en cache dans un dépôt public : elle est traitée comme **compromise**. La 2.1.0 ne met plus jamais de clé en cache ; elle se lit depuis les secrets GitHub `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD`. Sans ces quatre secrets, le workflow `apk.yml` échoue à son étape « Vérifier les secrets de signature » et ne crée aucune release. La procédure de rotation est dans `docs/SECURITE-LIVRAISON.md`.

**Contrôle à faire avant diffusion :** comparez les empreintes SHA-256 des certificats des APK 2.0.1 et 2.1.0 avec `apksigner verify --print-certs <fichier.apk>` (outil du SDK Android) : elles doivent différer.

**Conséquence pour l'utilisateur :** une nouvelle clé de signature ne peut pas mettre à jour une 2.0.1 installée. Il faut désinstaller la 2.0.1 puis installer la 2.1.0. Les données (transactions, apports, snapshots) sont dans Supabase et ne sont pas perdues ; seuls les réglages locaux de l'application sont à ressaisir.

---

## 2. Les 10 constats prioritaires, un par un

| # | Constat de la revue 2.0.1 | Correction | Vérification |
|---|---|---|---|
| **1** | Politiques Supabase `USING (true)` : n'importe quel détenteur de la clé publique lisait et modifiait toutes les lignes, y compris les tables v1 (`Config` avec l'identité fiscale, `Donnees`, `Historique`, `Projections`, `Transaction`). | Migration 004 (9 tables `pf2_`) et migration 008 (5 tables v1) : propriétaire par ligne, RLS, anciennes politiques supprimées, clé publique sans droit. Connexion email / mot de passe (option A, choisie). Robots et Streamlit fournissent `SUPABASE_USER_ID`. | `tests/test_rls.py` (33, PostgreSQL embarqué) ; `tests/test_v1_proprietaire.py` (19) ; `tests/test_auth_client.js` (16) |
| **2** | Clé de signature APK mise en cache publique, mot de passe par défaut connu. | Plus de cache de clé ; secrets GitHub ; mot de passe par défaut supprimé ; rotation documentée. | `tests/test_livraison_securisee.js` (14) |
| **3** | Devise absente devenue `NAN`, puis valorisée au taux 1 ; côté fiscal, le montant étranger brut devenait des euros. | Liste ISO 4217 partagée ; taux absent = `NULL` annoncé, jamais 1 ; fiscal : plus de repli sur le brut (T-01). | `tests/test_devise_absente.js` (11), `tests/test_devise_absente.py` (11), `tests/test_fiscal_inventaire.py` (TestTauxAbsent) |
| **4** | Snapshots partiels écrits sans marque de complétude ; portefeuille en liquidités seules sans point. | Colonne `complet` (migration 005) ; un point partiel n'entre jamais dans une série ; liquidités seules = point quand même ; alerte « Snapshot partiel ». | `tests/test_snapshot_complet.py` (7) |
| **5** | 2086 : crypto-actifs détenus hors application ignorés du dénominateur ; erreurs de cours avalées par `except Exception: pass`. | Inventaire externe (migration 007, RLS) entrant dans les lignes 212 et 220 ; cours, taux, solde ou prix d'acquisition manquant = calcul **incomplet** et nommé ; plus aucun `except … : pass` dans le fiscal. | `tests/test_fiscal_inventaire.py` (9, dont le verrou sans `except … pass`) ; `tests/test_rls.py` (TestInventaireCrypto) |
| **6** | Vente supérieure à la position : rejetée par le portefeuille, mais calculée en 2074 (gain sur la quantité entière). | Même règle dans les moteurs JS et Python ; refusée au formulaire Android, écartée des 2074 et 2086 et annoncée partout ; jamais chiffrée. Streamlit ne la refuse pas encore à la saisie (voir § 5). | `tests/test_ventes_excedentaires.py` (12) ; `tests/test_ventes_excedentaires.js` (18) |
| **7** | TWR : chaque flux supposé en fin d'intervalle ; exemple de la revue : 100 €, apport de 100 € au milieu, +10 % → affiché +20 %, réel +10 %. | Valorisation juste avant chaque flux (migration 006 et saisie). Un intervalle non valorisé n'est pas chaîné : il est annoncé « non calculé ». `test_metrics.py` corrigé, miroir JS aligné. | `tests/test_twr_strict.py` (10) ; `tests/test_twr_strict.js` (16) ; `tests/test_metrics.py` (51) ; `tests/test_valorisation_flux.js` (9) |
| **8** | Transaction et mouvement de compte écrits en deux requêtes, avec suppression « compensatoire » : une panne laissait des titres sans argent débité. | Création et modification par RPC atomiques (transactions : migration 004 ; apports : migrations 004 et 006) ; rejeu idempotent ; zéro compensation. | `tests/test_atomicite_ecritures.js` (26) ; `tests/test_rls.py` (RPC atomiques) |
| **9** | Lectures Supabase sans pagination : au-delà de 1 000 lignes, l'historique était tronqué en silence. | Lecture paginée partout (JS et Python), ordre stable par table ; une page en échec fait échouer toute la lecture. | `tests/test_pagination.js` (11, jusqu'à 15 000 lignes) ; `tests/test_pagination_db.py` (5) |
| **10** | Données fiscales du foyer (salaires, intérêts, kilomètres, repas) enregistrées **sans année** : un autre millésime réutilisait les mêmes montants. | Données annuelles suffixées par l'année (`f_s1_2025`) ; une année sans donnée est une lacune, jamais comblée par une autre année ; enregistrement explicite et confirmation par année ; reprise des anciennes valeurs sur geste explicite seulement ; plus de valeurs personnelles par défaut. | `tests/test_fiscal_millesime.py` (19) ; `tests/test_fiscal_millesime_js.js` (3) ; `tests/test_execution_pages.py` |

---

## 3. Détail par constat

### Constat 1 — Sécurité des données (RLS), tables `pf2_` et tables v1
- Option retenue : **A — authentification Supabase par email et mot de passe**. Chaque utilisateur ne voit et ne modifie que ses lignes.
- **Tables `pf2_`** (migration 004 : neuf tables ; migration 007 : `pf2_inventaire_crypto`) : propriétaire `user_id` obligatoire, politiques par opération limitées à `auth.uid()`, anciennes politiques `USING (true)` supprimées.
- **Tables v1** (migration 008) : `Config` (identité fiscale), `Donnees`, `Historique`, `Projections`, `Transaction`. La revue 2.0.1 ne les couvrait pas, or l'application les lit encore : aucune n'est morte, donc aucune n'est écartée. Chaque table reçoit `user_id` rattaché au compte, la RLS est activée, toutes ses politiques existantes sont supprimées (y compris un éventuel accès public hérité de la v1), la clé publique perd tout droit, et un utilisateur connecté n'accède qu'à ses lignes.
- **Robots et Streamlit** utilisent la clé service_role, qui contourne la RLS : chaque écriture doit donc porter le propriétaire, fourni par `SUPABASE_USER_ID`. Trois écritures v1 ne le portaient pas (`Config` à la sauvegarde fiscale, `Donnees` à l'ajustement de solde, `Historique` au journal) : corrigées. Le workflow `daily.yml` ne transmettait pas `SUPABASE_USER_ID` aux quatre jobs : corrigé.
- **Écritures refusées** : sans propriétaire (`SUPABASE_USER_ID` absent), l'écriture est refusée **avant tout envoi**, au point de passage unique de `core/db.py` (`ProprietaireAbsent`, message « sans propriétaire » qui nomme le secret). Rien ne part, aucun `user_id` NULL n'est écrit. L'erreur est désormais signalée avec la consigne (`Historique`, solde `Donnees`, configuration fiscale), au lieu d'être avalée.
- **Robots (correctif de la mise en service)** : « Robots quotidiens » échouait sur `pf2_cours` (`23502`, `user_id` NULL). Sur `main`, ni injection ni `SUPABASE_USER_ID` dans le workflow. Sur la branche, l'injection laissait partir les lignes sans propriétaire quand la variable manquait, et la base refusait après l'envoi. Corrigé au point de passage unique : chaque table propriétaire (`pf2_cours`, `pf2_fx`, `pf2_inflation`, `pf2_alertes`, `pf2_snapshots`, tables v1) reçoit l'uid, sinon l'écriture échoue avant tout envoi. Les mises à jour et suppressions sont restreintes au propriétaire ; l'import v1 ne supprime plus sans filtre propriétaire (`jobs/importer_v1.py`). Vérifié par `tests/test_robots_proprietaire.py` (35 tests, un par table ; 28 échouaient sur le code précédent).
- Tests négatifs : un anonyme ne lit ni n'écrit rien (tables v1 : refus 42501) ; un utilisateur B ne voit ni ne modifie les lignes de A ; une écriture sans propriétaire est refusée ; l'accès public hérité disparaît ; 004 et 008 refusent un uid absent.
- Vérifié par : `tests/test_rls.py` (33), `tests/test_v1_proprietaire.py` (19), `tests/test_auth_client.js` (16).

### Constat 2 — Clé de signature
- Le workflow de livraison ne met plus rien en cache, lit la clé dans les secrets, et purge l'ancien cache de clé compromise.
- Le mot de passe par défaut de la clé a disparu du script de construction.
- La WebView est durcie (liste blanche de domaines, redirections coupées, ouverture externe en HTTPS seulement) : `tests/test_webview_durci.js` (15).

### Constat 3 — Devises absentes
- `core/devises.py` et `DEVISES_ISO` (JS) portent la même liste ISO 4217 (173 codes), vérifiée par test de parité.
- Un taux absent n'est jamais 1 : côté portefeuille, côté fiscal et côté saisie.

### Constat 4 — Snapshots complets
- `jobs/daily_snapshot.py` : cours ou taux manquant → `complet = false`, liste des manquants, alerte « Snapshot partiel » dans le corps du message.
- Les séries de performance excluent les points partiels ; la colonne est ajoutée par la migration 005.

### Constat 5 — 2086 et erreurs avalées
- Lignes 212 (valeur globale) et 220 (prix d'acquisition) : incluent le solde externe valable à la date de cession.
- Règle : un actif déclaré hors application doit avoir un solde **à une date antérieure ou égale à chaque cession** ; à défaut, le calcul s'arrête et le dit. Pour déclarer « rien détenu », saisir une quantité 0 à une date ancienne.
- Le résultat expose `calcul_complet`, `indisponible` (liste nommée) et `sources_externes` (plateformes utilisées).
- La page 4 (Fiscalité) n'affiche aucun formulaire et ne lance aucune simulation tant que le calcul est incomplet.

### Constat 6 — Vente excédentaire
- Le formulaire de saisie Android contrôle la quantité détenue, pas seulement la quantité positive (validateur partagé `erreurVenteExcedentaire`). Streamlit n'appelle pas encore ce validateur à la saisie : la vente y est enregistrée, puis écartée des calculs 2074 et 2086 et annoncée sur la page Fiscalité (voir § 5).
- Les deux moteurs (JS et Python) appliquent la même règle, testée des deux côtés : achats du jour comptés, ventes du jour retirées par prudence, achats avant ventes à date égale.
- Une vente excédentaire déjà enregistrée est écartée des 2074 et 2086 et annoncée (Python : `core/portfolio.py`, `filtrer_ventes_excedentaires` ; JS : `PF.portefeuille.erreurVenteExcedentaire`).

### Constat 7 — TWR exact
- `core/metrics.py` : `rendements_stricts` / `twr_strict` ; `app/src/main/assets/www/js/metrics.js` : `rendementsStricts` / `twrStricts` (mêmes règles).
- Un intervalle sans flux est exact quelle que soit sa longueur.
- Un intervalle dont chaque flux est valorisé est chaîné exactement.
- Un intervalle dont un flux n'est pas valorisé n'est **pas** calculé : il apparaît comme « non calculé » (pages Performance et Retraite) ou « — » (vue Android).
- Le rendement en or ne chaîne que les intervalles sans flux.
- Retraite : un rendement historique absent n'est plus remplacé par 5 % sans avertissement ; le 5 % est présenté comme une hypothèse.

### Constat 8 — Écritures atomiques
- Transaction et mouvement de compte passent par une seule requête RPC.
- Une panne entre les deux ne laisse aucune ligne orpheline ; un rejeu avec la même clé d'idempotence ne duplique rien.

### Constat 9 — Pagination
- Limite standard Supabase : 1 000 lignes par réponse. La lecture enchaîne les pages (`limit`/`offset`) sur un ordre stable.
- Une page en échec fait échouer la lecture entière : l'historique n'est plus jamais tronqué en silence.

### Constat 10 — Millésime des données fiscales
- Identité du foyer (statut, enfants, parts, pays) : clé simple.
- Données annuelles (salaires, intérêts, kilomètres, puissance, repas, frais réels) : clé suffixée par l'année.
- Une année sans donnée affiche « aucune donnée enregistrée » et n'emprunte aucune valeur d'une autre année.
- Enregistrement explicite (plus d'écriture automatique de valeurs par défaut), case de confirmation « Je confirme que ces montants et options sont ceux de l'année N ».
- Reprise des anciennes valeurs sans année : bouton explicite, jamais une année déjà saisie n'est écrasée.
- Une lecture ou une écriture de configuration en échec affiche une erreur au lieu de valeurs de repli.
- Android : la feuille Règles pousse vers la configuration partagée les parts, le nombre d'enfants et le pays des intérêts étrangers ; la fiche « Situation fiscale » (statut, parts, revenus, salaires) reste locale, sans année (voir « limites »).

---

## 4. Autres constats traités dans cette version
- **T-01** (repli FX vers le montant brut) : traité côté fiscal (2074, 2086, cessions).
- **T-03** (vente incohérente en fiscal) : traité avec le constat 6.
- **T-07** (profil annuel) : traité avec le constat 10.
- **T-08** (veille des barèmes « à jour » après une panne) : une panne donne l'état `sonde_indisponible`, jamais « à jour » ; la panne n'est pas mise en cache. `tests/test_fiscal_veille.py` (3).
- **F-17** (rendement retraite de 5 % présenté comme historique) : traité avec le constat 7.
- **F-20** (historiques partiels) : traité avec le constat 4.
- **Robots quotidiens** (S-01 étendu) : `daily.yml` ne transmettait pas `SUPABASE_USER_ID` aux quatre jobs, qui auraient donc été refusés. Corrigé ; verrouillé par `TestRobotsQuotidiens` (`tests/test_v1_proprietaire.py`). Voir aussi le constat 1 (écritures des robots).
- **Écritures v1 silencieuses** (S-01 étendu) : `ajouter_historique_v1` avalait toute erreur (`except … : pass`) et `ajuster_solde_compte` renvoyait `None` : une écriture refusée passait pour réussie. Les deux lèvent désormais l'erreur, avec la consigne. `tests/test_v1_proprietaire.py` (`TestEcrituresV1Signalees`, 3).

---

## 5. Limites connues — NON traitées en 2.1.0
À planifier dans une version ultérieure ; aucune de ces limites n'est masquée :

- **Android — millésime annuel** : la fiche « Situation fiscale » garde ses valeurs en local, sans année, et n'envoie rien à Supabase. Le calcul Android ne doit pas servir de déclaration tant que ce portage n'est pas fait ; la déclaration de référence est la page Fiscalité de l'application Streamlit.
- **Android — inventaire externe** : le formulaire 2086 Android ne voit pas les positions saisies hors application (elles se saisissent dans la page Fiscalité). Il bloque toutefois le calcul dès qu'un cours ou un taux manque.
- **T-04** (or physique routé vers l'or papier en Python ; choix automatique du régime) — non traité.
- **T-05** (frais de repas sans contrôle d'éligibilité ni de participation employeur) — non traité.
- **T-06** (taux de prélèvements sociaux 2025 non déterminé par régime) — non traité.
- **F-16** (colonnes USD des snapshots non persistées) — non traité.
- **F-18** (projection de rente déterministe, sans simulation de séquence) — non traité.
- **F-19** (prix de l'or : contrat à terme, non le spot) — non traité, source affichée.
- **Lectures silencieuses (Python)** : `core/db.py` (`lire_allocation_personnalisee`, `variations_donnees_v1`, `soldes_comptes_liquidites`) retombe sur des valeurs par défaut ou partielles si une lecture échoue ; `core/session.py` (2 cas) et `core/models.py` (1 cas) ont encore des `except … : pass`. Non traité : le verrou de 2.1.0 ne porte que sur le fiscal.
- **Lectures silencieuses (Android)** : `lireTable` (`app/src/main/assets/www/js/portfolio.js`) renvoie une liste vide en cas d'erreur. Sans session valide, les vues s'affichent vides, sans message. Une bannière « session absente ou expirée » reste à faire.
- **Apport ou retrait (Streamlit) : écritures non couplées.** La page Portefeuille écrit `pf2_apports`, puis le journal v1 (`Historique`), puis le solde (`Donnees`), en requêtes séparées. Si le journal ou le solde est refusé, l'erreur s'affiche, mais la ligne déjà écrite reste. Le couplage entre tables v1 et pf2 n'est pas atomique : non traité.
- **Streamlit — vente excédentaire acceptée à la saisie** : le formulaire de la page Portefeuille n'appelle pas le validateur partagé. La vente est enregistrée, puis écartée des 2074 et 2086 et annoncée sur la page Fiscalité. Le refus au formulaire reste à faire, avec un test rouge préalable.
- **Clé service_role dans Streamlit** : l'application Streamlit lit et écrit avec `SUPABASE_KEY` (service_role), qui contourne la RLS. La protection repose donc sur le secret `.streamlit/secrets.toml` et sur l'accès au serveur qui fait tourner l'application. Une connexion Streamlit par compte est une évolution distincte, non faite en 2.1.0 et soumise à votre accord.
- **Tables v1 hors dépôt** : leur schéma n'est pas dans le dépôt. La migration 008 ne lit aucune colonne métier (seulement `id`, facultatif, pour la séquence) ; le nom des colonnes utilisées par l'application reste à vérifier sur votre base.
- **Clés d'unicité sans propriétaire** : `pf2_cours` (ticker, date), `pf2_fx` (devise, contre, date), `pf2_inflation` (année) et `pf2_snapshots` (date) ne contiennent pas `user_id`. Sans effet avec un seul compte ; à corriger par migration avant tout second compte, sinon un upsert réattribuerait à un autre propriétaire une ligne déjà présente.
- **XJSE.SW sans cotation vivante chez Yahoo** : la position est détenue ; le cours manque chaque nuit, le snapshot est donc partiel et exclu des séries. Aucune exclusion silencieuse n'est appliquée. La décision (valorisation de remplacement datée, ou sortie du plan si la position est soldée) reste à prendre.

---

## 6. Tests et intégration continue
- **Python hors réseau :** 772 tests passent, dont 33 tests RLS sur PostgreSQL embarqué (aucun Supabase requis), 19 tests de propriétaire couvrant les tables v1 et 35 tests des écritures serveur des robots (`tests/test_robots_proprietaire.py`).
- **JavaScript hors réseau :** 13 suites, 342 vérifications.
- **Exclues de la CI (dépendent du réseau ou d'identifiants) :** `tests/test_tickers_yahoo.py`, `tests/test_dates_de_bout_en_bout.py`, `tests/test_snapshot_resilient.py`, `tests/test_rls_integration.py`. Elles restent exécutables à la main.
- `tests/test_rendu.js` (DOM simulé) : exclu, faute de jsdom dans le dépôt.
- La CI (`.github/workflows/tests.yml`) lance désormais l'ensemble de ces suites.

## 7. Release
- Une seule release : `apk-2.1.0`, immuable. Le workflow refuse d'écraser une release existante avec un APK différent.
- Publiée par le workflow `apk.yml`, une fois les quatre secrets de signature définis (§ 1.2).
- La release `apk-2.0.1` reste en ligne, avec la mention « Surchargée par la 2.1.0 » (ajoutée à la publication de la 2.1.0).
