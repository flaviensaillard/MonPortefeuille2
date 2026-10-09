# Sécurité de la livraison Android — keystore, secrets et rotation (2.1.0)

**Contexte :** la revue de la 2.0.1 (constat S-02, BLOQUANT) a établi que le
keystore de signature était mis en cache par GitHub Actions sous la clé fixe
`apk-keystore-v1` (créé le 06/10/2026 sur `main`, 2 931 octets) et que
`build.sh` fournissait le mot de passe par défaut `portefeuille`, commité dans
un dépôt public. La clé de signature d'alors est **considérée compromise** et a
été remplacée (rotation) pour la 2.1.0.

## Ce qui a changé en 2.1.0

1. **Plus aucun cache pour le keystore.** Le bloc `actions/cache` du workflow
   APK a été supprimé. Un cache GitHub est lisible par toute personne pouvant
   ouvrir une pull request — une clé de signature n'y a jamais sa place.
2. **Secrets chiffrés GitHub uniquement.** Le workflow exige quatre secrets et
   échoue net s'il en manque un :
   - `ANDROID_KEYSTORE_BASE64` : le fichier `.jks` encodé en base64 ;
   - `ANDROID_KEYSTORE_PASSWORD` : mot de passe du keystore ;
   - `ANDROID_KEY_PASSWORD` : mot de passe de la clé ;
   - `ANDROID_KEY_ALIAS` : alias de la clé.
   Vérification d'intégrité à chaque build : `keytool -list` doit réussir avec
   ces secrets avant toute signature.
3. **Aucun mot de passe par défaut.** `build.sh` refuse de construire si
   `KEY_PASS` n'est pas fourni par l'environnement. La génération locale d'un
   keystore de DÉVELOPPEMENT reste possible (`GEN_KEYSTORE_LOCAL=1`) mais n'est
   jamais utilisée en CI et ne doit jamais être diffusée.
4. **Release unique et immuable.** La publication n'utilise plus `--clobber`.
   Si la release `apk-X` existe déjà avec un APK identique (même SHA256), rien
   ne se passe ; avec un APK différent, le build échoue. On publie alors une
   nouvelle version (2.1.1…) plutôt que d'écraser.
5. **Purge du cache compromis.** Chaque exécution du workflow tente
   `gh cache delete apk-keystore-v1` (idempotent). Le retrait du cache ne rend
   pas la clé « non compromise » — c'est la rotation qui protège.

## Procédure de rotation du keystore

À faire si la clé fuite, si un secret est suspecté, ou périodiquement :

1. Générer un nouveau keystore sur une machine de confiance :
   ```
   keytool -genkeypair -keystore portefeuille-nouveau.jks -alias portefeuille \
     -keyalg RSA -keysize 2048 -validity 10950 \
     -dname "CN=Porte-feuille, OU=Mobile, O=Porte-feuille, L=Aix-les-Bains, C=FR"
   ```
   avec un mot de passe long et aléatoire (32 caractères minimum, distinct du
   mot de passe de session de la machine).
2. Encoder et verser dans GitHub Secrets (remplacement des quatre secrets) :
   ```
   base64 -w0 portefeuille-nouveau.jks   # → ANDROID_KEYSTORE_BASE64
   ```
   puis Settings > Secrets and variables > Actions. Le fichier `.jks` doit être
   conservé hors du dépôt (coffre-fort de mots de passe) et jamais commité.
3. Purger tout cache résiduel : `gh cache delete apk-keystore-v1` (et lister
   `gh cache list` pour vérifier qu'aucun autre cache ne contient `keystore/`).
4. Consigner la rotation (date, empreinte SHA256 du certificat, motif) dans le
   journal ci-dessous, sans jamais publier la clé ni les mots de passe.
5. Publier la version suivante : la rotation casse la mise à jour des APK
   sideloadés signés avec l'ancienne clé — une réinstallation propre est
   nécessaire (les données restent dans Supabase, rien n'est stocké dans l'APK).

**Conséquence acceptée de la rotation :** les installations signées avec la clé
compromise (≤ 2.0.1) ne peuvent pas être mises à jour en place par une APK
signée avec la nouvelle clé. C'est voulu : un attaquant détenteur de l'ancienne
clé ne doit plus pouvoir produire d'APK accepté par ces installations.

## Journal des rotations

| Date       | Version | Empreinte (SHA256 du certificat) | Motif                                              |
|------------|---------|----------------------------------|----------------------------------------------------|
| 09/10/2026 | 2.1.0   | (à consigner lors de la création du secret) | Cache public `apk-keystore-v1` + mot de passe par défaut commité : clé 2.0.1 considérée compromise |

## Perte ou vol du téléphone / des accès

- L'APK ne contient aucune donnée patrimoniale : tout est dans Supabase. La
  perte du téléphone ne perd pas les données.
- Depuis la 2.1.0, l'accès aux données passe par un compte Supabase Auth
  (email/mot de passe) créé dans l'application : la récupération se fait par la
  procédure de mot de passe oublié de Supabase, et les politiques RLS ne
  laissent rien lire sans ce compte.
- Les secrets GitHub sont révocables à tout instant (Settings > Secrets) ; la
  clé Supabase publishable reste nécessaire à l'application mais ne donne plus
  aucun accès sans compte authentifié (migrations 004+).
