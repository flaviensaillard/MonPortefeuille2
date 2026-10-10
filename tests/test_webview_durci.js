/* Durcissement WebView et pont réseau (revue 2.0.1, constat S-03).
   Verrous structurels sur les sources Android : chaque règle échoue si le
   code retombe dans la configuration dangereuse.

   Ce qui est verrouillé ici :
   - le manifeste interdit le trafic clair (usesCleartextTraffic) ;
   - le WebView n'accorde plus l'accès universel ni l'accès fichier-fichier
     depuis file://, ni l'accès contenu, et Safe Browsing n'est plus désactivé ;
   - le pont réseau n'ouvre QUE des URL HTTPS vers une allowlist d'hôtes
     (Supabase, Yahoo Finance, INSEE) et refuse les autres ;
   - les méthodes HTTP du pont sont limitées à GET/POST/PATCH/DELETE ;
   - les en-têtes sont validés (pas d'injection CR/LF) ;
   - les redirections automatiques sont coupées (un hôte autorisé ne peut pas
     rediriger vers n'importe où) ;
   - openExternal n'ouvre que des liens https ;
   - la liste des méthodes JS exposées est bornée (toute nouvelle méthode
     devra être passée en revue : ce test échouera tant qu'elle ne sera pas
     ajoutée sciemment à la liste admise). */
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

const manifeste = lire('app/src/main/AndroidManifest.xml');
const mainActivity = lire('app/src/main/java/com/portefeuille/app/MainActivity.java');
const pont = lire('app/src/main/java/com/portefeuille/app/NativeBridge.java');

console.log('Manifeste Android');
verifier('trafic clair interdit (usesCleartextTraffic="false")',
    /android:usesCleartextTraffic="false"/.test(manifeste),
    'le manifeste autorisait android:usesCleartextTraffic="true"');

console.log('Réglages WebView (MainActivity)');
verifier('pas d’accès universel depuis file://',
    !/setAllowUniversalAccessFromFileURLs\(true\)/.test(mainActivity)
        && /setAllowUniversalAccessFromFileURLs\(false\)/.test(mainActivity));
verifier('pas d’accès fichier-fichier depuis file://',
    !/setAllowFileAccessFromFileURLs\(true\)/.test(mainActivity)
        && /setAllowFileAccessFromFileURLs\(false\)/.test(mainActivity));
verifier('accès fichier et contenu coupés (les assets restent chargeables)',
    /setAllowFileAccess\(false\)/.test(mainActivity)
        && /setAllowContentAccess\(false\)/.test(mainActivity));
verifier('Safe Browsing n’est plus désactivé',
    !/setSafeBrowsingEnabled\(false\)/.test(mainActivity));

console.log('Pont réseau (NativeBridge)');
verifier('allowlist HTTPS : Supabase', /supabase\.co/.test(pont));
verifier('allowlist HTTPS : Yahoo Finance', /query1\.finance\.yahoo\.com/.test(pont)
    && /query2\.finance\.yahoo\.com/.test(pont));
verifier('allowlist HTTPS : INSEE', /api\.insee\.fr/.test(pont));
verifier('les URL non HTTPS sont refusées par le pont',
    /!"https"\.equalsIgnoreCase/.test(pont) || /https.*equalsIgnoreCase.*getProtocol/.test(pont),
    'executer() doit rejeter tout ce qui n’est pas https');
verifier('le pont vérifie l’hôte avant d’ouvrir la connexion',
    /hoteAutorise/.test(pont));
verifier('méthodes limitées à GET/POST/PATCH/DELETE',
    /"GET"/.test(pont) && /"POST"/.test(pont) && /"PATCH"/.test(pont) && /"DELETE"/.test(pont)
        && /methodeAutorisee|METHODES_AUTORISEES/.test(pont));
verifier('en-têtes validés (pas d’injection CR/LF)',
    /indexOf\('\\r'\)/.test(pont) && /indexOf\('\\n'\)/.test(pont)
        && /matches\(.*A-Za-z0-9/.test(pont));
verifier('redirections automatiques coupées',
    /setInstanceFollowRedirects\(false\)/.test(pont),
    'une redirection permettrait de sortir de l’allowlist');
verifier('openExternal n’ouvre que des liens https',
    /startsWith\("https:\/\/"\)/.test(pont));

console.log('Surface exposée à JavaScript');
const exposees = [...pont.matchAll(/@JavascriptInterface\s+public\s+\S+\s+(\w+)\s*\(/g)].map(m => m[1]);
// 2.1.1 — six méthodes d'empreinte passées en revue : elles ne manipulent
// que les jetons de session chiffrés (Keystore) et un retour de biométrie ;
// elles ne reçoivent jamais de mot de passe (verrouillé par
// tests/test_empreinte_cableage.py).
const ADMISES = ['http', 'httpAsync', 'telechargerInflationInsee', 'isOnline',
    'haptic', 'toast', 'openExternal', 'share', 'versionCode', 'versionName',
    'empreinteEtat', 'empreinteSessionGardee', 'empreinteMajSession',
    'empreinteActiver', 'empreinteOuvrir', 'empreinteEffacer'];
verifier('méthodes exposées = liste revue (' + exposees.length + ')',
    exposees.length === ADMISES.length && exposees.every(m => ADMISES.includes(m)),
    'attendu : ' + ADMISES.join(', ') + ' — trouvé : ' + exposees.join(', '));

console.log(echecs === 0
    ? '\n✔ ' + reussis + ' réussis, 0 échec'
    : '\n✗ ' + reussis + ' réussis, ' + echecs + ' échec' + (echecs > 1 ? 's' : ''));
process.exit(echecs === 0 ? 0 : 1);
