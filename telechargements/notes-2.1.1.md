# MonPortefeuille 2.1.1 — notes de version

**Version :** 2.1.1 · **Code de version :** 29 · **Release unique :** `apk-2.1.1`

Cette version est un ensemble de **correctifs** (constats A à D). Elle ne remplace ni n'écrase `apk-2.1.0` ni `apk-2.0.1`.

## À retenir

- **Si vous n'arrivez pas à vous connecter dans l'application Android, c'est corrigé par la 2.1.1.** Sans connexion, aucune donnée pf2 n'est lisible ni modifiable (RLS, migration 004).
- Installez la 2.1.1 par-dessus la 2.1.0 : même signature, code de version supérieur (29 > 28). Aucune désinstallation n'est nécessaire, mais notez tout de même les valeurs de la fiche « Situation fiscale » avant (elles sont stockées sur le téléphone).

## Les constats, un par un

### Constat A — Le bouton « se connecter / créer » ouvrait la fiche d'un compte

- **Cause :** l'application contenait deux fonctions nommées `feuilleCompte` (l'écran de connexion, et la fiche d'un compte de liquidités). La seconde écrasait la première.
- **Effet constaté :** « Compte introuvable : actualisez ». Le premier lancement, qui propose la connexion, était touché par le même conflit.
- **Correctif :** l'écran de connexion s'appelle désormais `feuilleConnexionCompte`. La fiche de liquidités garde `feuilleCompte`.
- **Test :** `tests/test_app_feuilles_compte.py` (3 tests). Rouges sur la 2.1.0, verts après correctif.

### Constat B — La clé publique était envoyée en « Bearer » sans session

- **Cause :** sans session, l'application envoyait `Authorization: Bearer <clé>`, y compris pour une clé `sb_publishable_…`. Ce format n'est pas un JWT : la passerelle Supabase le refuse (401 « Invalid JWT »).
- **Correctif :** une clé `sb_…` va uniquement dans l'en-tête `apikey`. Le `Bearer` ne porte plus qu'un jeton de session, ou une clé anon héritée (JWT, `eyJ…`).
- **Test :** `tests/test_cle_publique_entetes.js` (5 vérifications). Sur la 2.1.0, deux échouent (absence de `Bearer` avec une clé `sb_…`). Toutes vertes après correctif.

### Constat C — Le diagnostic de connexion accusait une clé « révoquée »

- **Effet :** un 401 sur la racine du projet affichait « la clé a été révoquée ou régénérée », alors que la cause pouvait être l'URL, ou l'en-tête (constat B).
- **Correctif :** le message demande de vérifier que l'URL et la clé appartiennent au même projet.

### Constat D — Version

- Version 2.1.1, code 29, dans `AndroidManifest.xml`, `apk.yml` (`VERSION_NAME`, `VERSION_CODE`) et `build.sh`. Le workflow publie les notes de `telechargements/notes-2.1.1.md`.
- `tests/test_livraison_securisee.js` est mis à jour : 14 vérifications, toutes vertes.

## Tests

- **Python hors réseau :** 792 tests passent (789 pour la 2.1.0, plus les 3 tests du constat A). Les 14 échecs de `python -m pytest tests/` sans exclusion sont tous dans des suites qui interrogent Yahoo ou Supabase en direct (`test_tickers_yahoo.py`, `test_dates_de_bout_en_bout.py`, `test_snapshot_resilient.py`) ; la CI les exclut.
- **JS :** `test_cle_publique_entetes.js`, `test_auth_client.js`, `test_livraison_securisee.js` et toutes les autres suites `tests/test_*.js` hors `test_rendu.js` passent.
- **Échecs préexistants, non liés à cette version :** `tests/test_rendu.js` (exige un DOM simulé, exclu de la CI) a 3 échecs (performance : périodes manquantes ; fiscalité : changement de millésime ; guide par formulaire replié). Ils étaient présents avant ces modifications. Ils restent à traiter.

## Limites connues

- **Non testé sur appareil ni contre votre projet Supabase.** Le comportement de la clé vient du code et de la documentation Supabase. La validation réelle est l'étape 3 ci-dessous.
- **Clés anon héritées** (`eyJ…`) : Supabase prévoit de les retirer d'ici fin 2026. Un projet qui n'utilise que ces clés devra passer aux clés `sb_publishable_` avant cette date.

## Mise en service de la 2.1.1

1. Fusionner la branche dans `main`, puis publier `apk-2.1.1` (workflow `apk.yml`, sans écraser une release existante).
2. Installer `Porte-feuille-2.1.1.apk` sur le téléphone, par-dessus la 2.1.0.
3. Réglages > Compte : se connecter avec l'e-mail et le mot de passe du compte. Les tables v1 (`Config`, `Donnees`, `Historique`, `Projections`) deviennent lisibles une fois connecté.
4. Réglages > Diagnostic : le message « Serveur du projet » doit passer en vert. Si ce n'est pas le cas, notez le texte exact et le code HTTP.

## Hors périmètre de cette version

- Le formulaire Streamlit, les robots et le calcul de valorisation ne changent pas : ils utilisent la clé serveur et ne sont pas concernés par ces constats.
- La connexion par empreinte digitale (Android) n'est **pas** dans cette version.
