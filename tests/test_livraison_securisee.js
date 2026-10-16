/* Livraison sécurisée (revue 2.0.1, constat S-02) : la clé de signature ne doit
   plus jamais passer par un cache GitHub, ni par un mot de passe par défaut
   commité. Chaque règle ici est un verrou : le test échoue si le dépôt retombe
   dans le défaut.

   Vérifié (rouge sur l'ancien code, vert après correctif) :
   - aucun `actions/cache` ne cible le keystore dans le workflow APK ;
   - le workflow exige les secrets de signature et échoue s'ils manquent ;
   - le workflow supprime l'ancien cache public `apk-keystore-v1` (rotation) ;
   - build.sh n'a AUCUN mot de passe de signature par défaut ;
   - build.sh refuse de construire sans mot de passe (pas de repli connu) ;
   - la release est publiée sans `--clobber` (un APK publié n'est jamais écrasé) ;
   - la version est bien 2.2.6 (code 36) dans le manifeste, le workflow et build.sh ;
   - la rotation est documentée (docs/SECURITE-LIVRAISON.md). */
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');

let reussis = 0, echecs = 0;
function verifier(nom, cond, detail) {
    if (cond) { reussis++; console.log('  ✓ ' + nom); }
    else { echecs++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); }
}

const apkYml = lire('.github/workflows/apk.yml');
const buildSh = lire('build.sh');
const manifeste = lire('app/src/main/AndroidManifest.xml');

console.log('Workflow APK (.github/workflows/apk.yml)');
verifier('aucun cache Actions ne cible le keystore',
    !/uses:\s*actions\/cache/.test(apkYml) && !/path:\s*keystore/.test(apkYml),
    'un bloc actions/cache sur `keystore` rend la clé lisible par toute personne ouvrant une PR');
verifier('les secrets de signature sont exigés (contrôle explicite)',
    /ANDROID_KEYSTORE_BASE64/.test(apkYml) && /ANDROID_KEYSTORE_PASSWORD/.test(apkYml)
        && /ANDROID_KEY_PASSWORD/.test(apkYml) && /ANDROID_KEY_ALIAS/.test(apkYml)
        && /[Ss]ecret[^\n]*manquant/.test(apkYml),
    'le workflow doit échouer net si un secret de signature manque');
verifier("l'ancien cache public apk-keystore-v1 est purgé (rotation)",
    /apk-keystore-v1/.test(apkYml) && /(gh cache delete|actions\/caches)/.test(apkYml),
    'le cache compromis du 06/10/2026 doit être supprimé du dépôt');
verifier('aucun --clobber sur la publication de release',
    !/--clobber/.test(apkYml),
    'un APK publié ne doit jamais pouvoir être remplacé');
verifier('version 2.2.6 et code 36',
    /VERSION_NAME:\s*'2\.2\.6'/.test(apkYml) && /VERSION_CODE:\s*'36'/.test(apkYml));

console.log('Script de build (build.sh)');
verifier('aucun mot de passe de signature par défaut',
    !/KEY_PASS="\$\{KEY_PASS:-/.test(buildSh) && !/KEYSTORE_PASS="\$\{KEYSTORE_PASS:-/.test(buildSh)
        && !/-storepass\s+"?portefeuille/.test(buildSh) && !/-keypass\s+"?portefeuille/.test(buildSh),
    'le mot de passe « portefeuille » commité dans le dépôt est considéré compromis');
verifier('la construction échoue sans mot de passe de signature',
    /if \[ -z "\$\{KEY_PASS:-\}" \]/.test(buildSh) && /KEY_PASS absent/.test(buildSh),
    'sans mot de passe fourni par un secret, le build doit refuser de signer');
verifier('version par défaut 2.2.6 / code 36',
    /VERSION_NAME="\$\{VERSION_NAME:-2\.2\.6\}"/.test(buildSh)
        && /VERSION_CODE="\$\{VERSION_CODE:-36\}"/.test(buildSh));

console.log('Manifeste Android');
verifier('versionName 2.2.6', /android:versionName="2\.2\.6"/.test(manifeste));
verifier('versionCode 36', /android:versionCode="36"/.test(manifeste));

console.log('Version Python (core)');
verifier('core/__init__.py annonce 2.2.6',
    /__version__\s*=\s*"2\.2\.6"/.test(lire('core/__init__.py')),
    'la version doit être cohérente partout : APK, workflow, build, core, notes');

/* Cohérence de la livraison : la version est lue dans le workflow, jamais
   recopiée ici, pour que ce verrou ne puisse pas vieillir en silence.

   Pourquoi ce bloc existe : `apk.yml` publie la release avec
   `--notes-file telechargements/notes-<VERSION_NAME>.md`. Si ce fichier manque,
   la création de la release ÉCHOUE sur main — après la fusion, donc au pire
   moment. Et comme la release est unique et immuable, un APK construit depuis un
   code modifié sous une version déjà publiée fait échouer le build
   (`exit 1`) : toute fusion touchant `app/**` exige donc une version neuve,
   cohérente partout et accompagnée de ses notes. */
console.log('Cohérence de la livraison');
const version = (apkYml.match(/VERSION_NAME:\s*'([^']+)'/) || [])[1];
const code = (apkYml.match(/VERSION_CODE:\s*'([^']+)'/) || [])[1];
verifier('le workflow annonce une version et un code',
    /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version || '') && /^[0-9]+$/.test(code || ''));
verifier('le fichier de notes de la version publiée existe',
    fs.existsSync(path.join(RACINE, 'telechargements', 'notes-' + version + '.md')),
    'apk.yml passe --notes-file telechargements/notes-' + version + '.md : '
    + 'absent, la création de la release échouerait sur main');
verifier('le workflow publie les notes de SA version',
    apkYml.includes('--notes-file telechargements/notes-' + version + '.md'));
verifier("le nom d'artefact porte la même version",
    apkYml.includes('name: Porte-feuille-' + version + '.apk'),
    'un artefact nommé d\'une autre version se télécharge à la place du bon APK');
verifier('le manifeste porte la même version et le même code que le workflow',
    manifeste.includes('android:versionName="' + version + '"')
        && manifeste.includes('android:versionCode="' + code + '"'));
verifier('build.sh construit par défaut cette version et ce code',
    buildSh.includes('VERSION_NAME:-' + version) && buildSh.includes('VERSION_CODE:-' + code));
verifier('core/__init__.py annonce la même version',
    lire('core/__init__.py').includes('__version__ = "' + version + '"'));

console.log('Documentation de rotation');
verifier('docs/SECURITE-LIVRAISON.md existe',
    fs.existsSync(path.join(RACINE, 'docs', 'SECURITE-LIVRAISON.md')));
if (fs.existsSync(path.join(RACINE, 'docs', 'SECURITE-LIVRAISON.md'))) {
    const doc = lire('docs/SECURITE-LIVRAISON.md');
    verifier('la doc couvre la rotation du keystore', /rotation/i.test(doc) && /GitHub Secrets/i.test(doc));
    verifier('la doc mentionne la compromission du cache apk-keystore-v1', /apk-keystore-v1/.test(doc));
    verifier('la doc couvre la procédure en cas de perte du téléphone/mot de passe',
        /(réinitialis|perte|vol)/i.test(doc));
}

console.log(echecs === 0
    ? '\n✔ ' + reussis + ' réussis, 0 échec'
    : '\n✗ ' + reussis + ' réussis, ' + echecs + ' échec' + (echecs > 1 ? 's' : ''));
process.exit(echecs === 0 ? 0 : 1);
