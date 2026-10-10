# MonPortefeuille 2.1.1 — notes de version

**Version :** 2.1.1 · **Code de version :** 29 · **Release unique :** `apk-2.1.1`

Cette version regroupe les **correctifs** (constats A à D) et la **nouveauté
« connexion par empreinte digitale »**. Elle ne remplace ni n'écrase
`apk-2.1.0` ni `apk-2.0.1`.

## À retenir

- **Si vous n'arrivez pas à vous connecter dans l'application Android, c'est corrigé par la 2.1.1.** Sans connexion, aucune donnée pf2 n'est lisible ni modifiable (RLS, migration 004).
- **Nouveauté : après une première connexion e-mail / mot de passe, l'appareil peut rouvrir la session par empreinte digitale.** Le mot de passe n'est jamais stocké ; les jetons de session sont chiffrés par le Keystore Android ; si l'empreinte échoue ou n'est pas configurée, le repli est toujours l'e-mail / mot de passe.
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

- Version 2.1.1, code 29, dans `AndroidManifest.xml`, `apk.yml` (`VERSION_NAME`, `VERSION_CODE`), `build.sh` **et** `core/__init__.py`. Le workflow publie les notes de `telechargements/notes-2.1.1.md`.
- `tests/test_livraison_securisee.js` est mis à jour : 15 vérifications, toutes vertes.

## Nouveauté — Connexion par empreinte digitale (Android)

Après une première connexion e-mail / mot de passe (Réglages > Compte),
l'appareil peut désormais **rouvrir la session par empreinte digitale**.

- **Activation :** Réglages > « 🔐 Connexion par empreinte ». L'appareil demande
  une confirmation biométrique, puis les jetons de session sont scellés.
  Désactivation possible du même écran : les jetons gardés sont effacés.
- **Ouverture :** au lancement suivant, l'application est verrouillée ; la
  biométrie rouvre la session. En cas d'échec, d'annulation ou d'empreinte non
  configurée, le repli est **toujours** l'écran de connexion e-mail / mot de passe.
- **Le mot de passe n'est JAMAIS stocké** — ni dans l'application, ni côté
  natif. Seuls les jetons de session sont conservés, **chiffrés en AES-GCM par
  une clé du Keystore Android** (clé matérielle, non exportable). Quand
  l'empreinte est active, la session en clair n'existe que pendant que
  l'application est déverrouillée.
- **Implémentation :** `android.hardware.biometrics.BiometricPrompt` (API
  système, Android 9+), câblé dans `MainActivity.java` / `NativeBridge.java`,
  avec `CryptoObject` (le déchiffrement n'a lieu qu'après la biométrie) ;
  logique applicative dans `assets/www/js/biometrie.js`, écran de réglage et
  écran de verrouillage dans `app.js`.
- **Tests :** `tests/test_empreinte_logique.js` (33 vérifications de logique,
  faux pont natif) et `tests/test_empreinte_cableage.py` (14 vérifications de
  câblage Android/JS). Écrits d'abord, rouges sur la 2.1.0, verts avec la
  fonctionnalité.

### Limites de la biométrie — à lire

- **La biométrie elle-même ne se teste que sur appareil : c'est vous qui la
  testez** (BiometricPrompt, Keystore, capteur du téléphone — étape « Mise en
  service » ci-dessous). Les tests du dépôt couvrent toute la logique et le
  câblage, pas le dialogue avec le capteur physique.
- La bibliothèque `androidx.biometric` **n'est pas utilisée** : la chaîne de
  construction de l'APK est volontairement sans Gradle et ne consomme pas les
  AAR Maven. C'est le `BiometricPrompt` système qu'elle enveloppe qui est
  câblé — même API, Android 9+. Sous Android 8, l'empreinte est annoncée
  indisponible et le repli e-mail / mot de passe s'applique. Un passage à
  `androidx.biometric` (qui ajoute le repli code PIN/schéma sur les vieux
  appareils) demandera d'abord de faire entrer les AAR dans la chaîne.
- La clé du Keystore n'exige pas une authentification biométrique à **chaque**
  opération de chiffrement : sans cela, les jetons rafraîchis en arrière-plan
  ne pourraient pas être rescellés silencieusement. La porte d'ouverture reste
  applicative (toute ouverture passe par la biométrie ou le mot de passe) et la
  clé reste matérielle.

## Tests

- **Python hors réseau :** 806 tests passent (789 pour la 2.1.0, plus les 3
  tests du constat A, les 14 tests de câblage de l'empreinte, et les suites
  complétées depuis). Les échecs de `python -m pytest tests/` sans exclusion
  sont tous dans des suites qui interrogent Yahoo ou Supabase en direct
  (`test_tickers_yahoo.py`, `test_dates_de_bout_en_bout.py`,
  `test_snapshot_resilient.py`) ; la CI les exclut.
- **Un faux monde s'est révélé poreux (corrigé ici) :** le test
  `test_snapshot_complet.py` singeait Supabase et les cours, mais pas la
  couche de « cotation du moment » ajoutée en 2.1.0 — hors ligne il retombait
  sur la simulation, en CI (connectée) Yahoo lui servait un vrai cours et
  `test_un_cours_manquant_marque_le_snapshot_incomplet` échouait. Le faux monde
  coupe désormais aussi `cotation_du_moment` et `cours_de_reference` : aucun
  contact réseau ou Supabase, même quand le réseau répond.
- **JS :** `test_cle_publique_entetes.js`, `test_auth_client.js`,
  `test_livraison_securisee.js` (15 vérifications),
  `test_empreinte_logique.js` (33 vérifications) et toutes les autres suites
  `tests/test_*.js` hors `test_rendu.js` passent.
- **Échecs préexistants, non liés à cette version :** `tests/test_rendu.js` (exige un DOM simulé, exclu de la CI) a 3 échecs (performance : périodes manquantes ; fiscalité : changement de millésime ; guide par formulaire replié). Ils étaient présents avant ces modifications. Ils restent à traiter.

## Limites connues

- **La biométrie n'a pas été testée sur appareil** (voir ci-dessus) : le
  comportement de `BiometricPrompt` et du Keystore vient du code et de la
  documentation Android. La validation réelle est l'étape 3 ci-dessous, faite
  par le porteur sur son téléphone.
- **Clés anon héritées** (`eyJ…`) : Supabase prévoit de les retirer d'ici fin 2026. Un projet qui n'utilise que ces clés devra passer aux clés `sb_publishable_` avant cette date.

## Mise en service de la 2.1.1

1. Fusionner la branche dans `main` : le workflow `apk.yml` construit et publie `apk-2.1.1` (release unique et immuable, sans écraser une autre release). Les exécutions de branche ne font que vérifier que l'APK se construit.
2. Installer `Porte-feuille-2.1.1.apk` sur le téléphone, par-dessus la 2.1.0.
3. Réglages > Compte : se connecter avec l'e-mail et le mot de passe du compte. Les tables v1 (`Config`, `Donnees`, `Historique`, `Projections`) deviennent lisibles une fois connecté.
4. Réglages > Diagnostic : le message « Serveur du projet » doit passer en vert. Si ce n'est pas le cas, notez le texte exact et le code HTTP.
5. **Tester l'empreinte :** Réglages > « Connexion par empreinte » > Activer, confirmer au capteur, fermer l'application, la rouvrir : le déverrouillage par empreinte doit rouvrir la session. Puis tester le repli : annuler la demande, le bouton « Utiliser mon mot de passe » doit ramener à l'écran de connexion.

## Hors périmètre de cette version

- Le formulaire Streamlit, les robots et le calcul de valorisation ne changent pas : ils utilisent la clé serveur et ne sont pas concernés par ces constats.
- Aucune migration Supabase n'est requise ni livrée : la connexion par empreinte ne touche pas à la base.
