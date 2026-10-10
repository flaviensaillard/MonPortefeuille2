/* Clé publique et en-tête Authorization (2.1.1, constat B).

   Avant 2.1.1, sans session, l'application envoyait
   `Authorization: Bearer <clé>` même quand la clé était une clé publique
   `sb_publishable_…`. Ce format n'est pas un JWT : la passerelle Supabase
   répond 401 « Invalid JWT ».

   Règles verrouillées :
   1. une clé `sb_…` va UNIQUEMENT dans `apikey` (jamais en Bearer) ;
   2. sans session, une clé `sb_…` n'entraîne aucun en-tête Authorization ;
   3. une clé anon héritée (JWT `eyJ…`) reste envoyée en Bearer sans session ;
   4. avec session, le Bearer porte le jeton de session, `apikey` la clé. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE_WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');
const FICHIERS = ['util.js', 'models.js', 'net.js', 'store.js'];

const stockage = {};
const localStorageFaux = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};

const contexte = vm.createContext({
    localStorage: localStorageFaux,
    atob: (b) => Buffer.from(b, 'base64').toString('binary'),
    console, Promise, Date, JSON, Math, setTimeout
});
for (const f of FICHIERS) {
    vm.runInContext(fs.readFileSync(path.join(RACINE_WWW, 'js', f), 'utf8'), contexte, { filename: f });
}
const PF = contexte.PF;

const URL_PROJET = 'https://projet-test.supabase.co';
const CLE_SB = 'sb_publishable_TESTdeNOTREprojet_0123456789';
const CLE_ANON_HERITEE = 'eyJhbGciOiJIUzI1NiJ9.anon';

let reussis = 0, echecs = 0;
function verifier(nom, cond, detail) {
    if (cond) { reussis++; console.log('  ✓ ' + nom); }
    else { echecs++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); }
}

// Capture des en-têtes envoyés par la couche réseau (faux transport).
let dernierEntetes = null;
PF.net.setTransport(function (method, url, entetes) {
    dernierEntetes = entetes || {};
    return { ok: true, status: 200, body: '[]' };
});

async function entetesSelect(cle, sessionAcces) {
    PF.store.sauverReglages({ supabaseUrl: URL_PROJET, supabaseKey: cle });
    PF.store.effacerSession();
    if (sessionAcces) {
        PF.store.sauverSession({ access_token: sessionAcces, refresh_token: 'raf',
            expires_at: Date.now() + 3600000, user_id: 'u1', email: 'a@exemple.fr' });
    }
    dernierEntetes = null;
    await PF.net.supabase.select('Donnees', 'select=*');
    return dernierEntetes;
}

(async function main() {
    console.log('Clé publique sb_… (constat B)');

    const sans = await entetesSelect(CLE_SB, null);
    verifier('1. clé sb_ : apikey porte la clé publique', sans && sans.apikey === CLE_SB,
        'apikey = ' + (sans && sans.apikey));
    verifier('2. clé sb_ sans session : aucun Authorization (pas de Bearer sb_)',
        sans && !Object.prototype.hasOwnProperty.call(sans, 'Authorization'),
        'Authorization = ' + (sans && sans.Authorization));
    verifier('3. clé sb_ jamais présente dans un Bearer',
        !Object.values(sans || {}).some((v) => String(v).indexOf('Bearer ' + CLE_SB) === 0));

    const heritee = await entetesSelect(CLE_ANON_HERITEE, null);
    verifier('4. clé anon héritée (JWT eyJ…) sans session : Bearer conservé',
        heritee && heritee.Authorization === 'Bearer ' + CLE_ANON_HERITEE,
        'Authorization = ' + (heritee && heritee.Authorization));

    const avec = await entetesSelect(CLE_SB, 'jeton-de-session-XYZ');
    verifier('5. avec session : Bearer = jeton de session, apikey = clé sb_',
        avec && avec.Authorization === 'Bearer jeton-de-session-XYZ' && avec.apikey === CLE_SB,
        JSON.stringify(avec));

    console.log('\n' + (echecs === 0 ? '✔' : '✗') + ' ' + reussis + ' réussis, ' + echecs + ' échec(s)');
    process.exit(echecs === 0 ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
