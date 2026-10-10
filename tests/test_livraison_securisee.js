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
   - la version est bien 2.2.0 (code 30) dans le manifeste, le workflow et build.sh ;
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
verifier('version 2.2.0 et code 30',
    /VERSION_NAME:\s*'2\.2\.0'/.test(apkYml) && /VERSION_CODE:\s*'30'/.test(apkYml));

console.log('Script de build (build.sh)');
verifier('aucun mot de passe de signature par défaut',
    !/KEY_PASS="\$\{KEY_PASS:-/.test(buildSh) && !/KEYSTORE_PASS="\$\{KEYSTORE_PASS:-/.test(buildSh)
        && !/-storepass\s+"?portefeuille/.test(buildSh) && !/-keypass\s+"?portefeuille/.test(buildSh),
    'le mot de passe « portefeuille » commité dans le dépôt est considéré compromis');
verifier('la construction échoue sans mot de passe de signature',
    /if \[ -z "\$\{KEY_PASS:-\}" \]/.test(buildSh) && /KEY_PASS absent/.test(buildSh),
    'sans mot de passe fourni par un secret, le build doit refuser de signer');
verifier('version par défaut 2.2.0 / code 30',
    /VERSION_NAME="\$\{VERSION_NAME:-2\.2\.0\}"/.test(buildSh)
        && /VERSION_CODE="\$\{VERSION_CODE:-30\}"/.test(buildSh));

console.log('Manifeste Android');
verifier('versionName 2.2.0', /android:versionName="2\.2\.0"/.test(manifeste));
verifier('versionCode 30', /android:versionCode="30"/.test(manifeste));

console.log('Version Python (core)');
verifier('core/__init__.py annonce 2.2.0',
    /__version__\s*=\s*"2\.2\.0"/.test(lire('core/__init__.py')),
    'la version doit être cohérente partout : APK, workflow, build, core, notes');

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
