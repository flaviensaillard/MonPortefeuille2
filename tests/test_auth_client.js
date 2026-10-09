/* Authentification Supabase côté application (2.1.0, revue S-01, option A).
   Comme les autres suites JS : modules réels dans Node, faux réseau.

   Ce qui est verrouillé ici (tout était absent avant 2.1.0) :
   - la création de compte et la connexion enregistrent une session ;
   - les requêtes Data API portent le JETON DE SESSION en Authorization,
     pas seulement la clé publique ;
   - sans session, on retombe sur la clé publique (et le serveur renvoie
     l'équivalent de « zéro ligne ») ;
   - un 401 déclenche UN rafraîchissement puis une nouvelle tentative ;
   - un rafraîchissement refusé purge la session (reconnexion demandée) ;
   - l'appel RPC (écritures atomiques) passe par /rest/v1/rpc/<fonction> ;
   - la déconnexion efface la session locale ;
   - le mot de passe n'est JAMAIS persisté (jetons seuls). */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE_WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');
const FICHIERS = ['util.js', 'models.js', 'net.js', 'store.js'];

const stockage = {};
globalThis.localStorage = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');

const contexte = vm.createContext({
    localStorage: globalThis.localStorage, atob: globalThis.atob,
    console, Promise, Date, JSON, Math, setTimeout
});
for (const f of FICHIERS) {
    vm.runInContext(fs.readFileSync(path.join(RACINE_WWW, 'js', f), 'utf8'),
        contexte, { filename: f });
}
const PF = contexte.PF;

let reussis = 0, echecs = 0;
function verifier(nom, cond, detail) {
    if (cond) { reussis++; console.log('  ✓ ' + nom); }
    else { echecs++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); }
}

// ---------------------------------------------------------------------------
// Faux serveur : Supabase Auth + Data API avec contrôle du porteur.
// ---------------------------------------------------------------------------
const URL_PROJET = 'https://test.supabase.co';
const CLE_ANON = 'eyJhbGciOiJIUzI1NiJ9.anon';
const sessions = {
    'acces-init-A': { refresh: 'raf-A', user: '11111111-1111-4111-8111-111111111111', email: 'a@exemple.fr' },
    'acces-renouvele': { refresh: 'raf-B', user: '11111111-1111-4111-8111-111111111111', email: 'a@exemple.fr' }
};
let motDePasseRecu = null;
let jetonsVus = [];          // Authorization vus par la Data API
let refuserRafraichissement = false;
let refuserPorteur = false;  // rejeter tout jeton hors clé anon (mode « pré-2.1.0 inversé »)

PF.store.sauverReglages({ supabaseUrl: URL_PROJET, supabaseKey: CLE_ANON });

function transport(method, url, entetes, corps) {
    const auth = entetes && entetes.Authorization ? String(entetes.Authorization) : '';
    const porteur = auth.replace(/^Bearer /, '');

    // --- Supabase Auth ---
    if (url.startsWith(URL_PROJET + '/auth/v1/')) {
        if (url.endsWith('/auth/v1/signup') && method === 'POST') {
            const c = JSON.parse(corps);
            motDePasseRecu = c.password;
            return { ok: true, status: 200, body: JSON.stringify({
                access_token: 'acces-init-A', refresh_token: 'raf-A', expires_in: 3600,
                user: { id: sessions['acces-init-A'].user, email: c.email }
            }) };
        }
        if (url.includes('/auth/v1/token?grant_type=password')) {
            const c = JSON.parse(corps);
            if (c.email === 'a@exemple.fr' && c.password === 'mot-de-passe-1') {
                return { ok: true, status: 200, body: JSON.stringify({
                    access_token: 'acces-init-A', refresh_token: 'raf-A', expires_in: 3600,
                    user: { id: sessions['acces-init-A'].user, email: 'a@exemple.fr' }
                }) };
            }
            return { ok: false, status: 400, body: JSON.stringify({ error_description: 'Identifiants invalides' }) };
        }
        if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
            const c = JSON.parse(corps);
            if (refuserRafraichissement || c.refresh_token !== 'raf-A') {
                return { ok: false, status: 400, body: JSON.stringify({ error_description: 'refresh_token invalide' }) };
            }
            return { ok: true, status: 200, body: JSON.stringify({
                access_token: 'acces-renouvele', refresh_token: 'raf-B', expires_in: 3600,
                user: { id: sessions['acces-renouvele'].user, email: 'a@exemple.fr' }
            }) };
        }
        if (url.endsWith('/auth/v1/logout')) return { ok: true, status: 204, body: '' };
        return { ok: false, status: 404, body: '{}' };
    }

    // --- Data API : exige un porteur de session valide ---
    if (url.startsWith(URL_PROJET + '/rest/v1/')) {
        jetonsVus.push(porteur);
        if (porteur === CLE_ANON) {
            // RLS sans compte connecté : lecture vide, écriture refusée.
            if (method === 'GET') return { ok: true, status: 200, body: '[]' };
            return { ok: false, status: 401, body: JSON.stringify({ message: 'new row violates row-level security policy' }) };
        }
        const valide = !!sessions[porteur];
        if (!valide || refuserPorteur) return { ok: false, status: 401, body: JSON.stringify({ message: 'JWT expired' }) };
        if (url.includes('/rest/v1/rpc/')) {
            const fn = url.split('/rpc/')[1].split('?')[0];
            return { ok: true, status: 200, body: JSON.stringify({ ok: true, fonction: fn, recu: JSON.parse(corps) }) };
        }
        if (method === 'GET') return { ok: true, status: 200, body: JSON.stringify([{ id: 1 }]) };
        return { ok: true, status: 201, body: JSON.stringify([{ id: 9 }]) };
    }
    return { ok: false, status: 404, body: '' };
}

PF.net.setTransport(transport);

async function principal() {
    console.log('Création de compte et session');
    verifier('au départ, aucune session', !PF.net.auth.aUneSession());

    const res = await PF.net.auth.inscription('a@exemple.fr', 'mot-de-passe-1');
    verifier('l’inscription enregistre la session', res && !!res.access_token);
    verifier('l’utilisateur est identifié',
        PF.net.auth.utilisateur().email === 'a@exemple.fr');
    const brutSession = JSON.stringify(PF.store.lireSession());
    verifier('le mot de passe n’est jamais persisté',
        !brutSession.includes('mot-de-passe-1') && !Object.values(stockage).join('|').includes('mot-de-passe-1'));

    console.log('Porteur des requêtes Data API');
    jetonsVus = [];
    await PF.net.supabase.select('pf2_transactions', 'select=*');
    verifier('la lecture porte le jeton de session, pas la clé publique',
        jetonsVus.length === 1 && jetonsVus[0] === 'acces-init-A',
        'vu : ' + JSON.stringify(jetonsVus));

    jetonsVus = [];
    await PF.net.supabase.insert('pf2_transactions', [{ ticker: 'IGLN.L' }]);
    verifier('l’écriture porte elle aussi le jeton de session',
        jetonsVus.length === 1 && jetonsVus[0] === 'acces-init-A');

    console.log('Connexion refusée sans compte');
    PF.store.effacerSession();
    jetonsVus = [];
    const lignesAnon = await PF.net.supabase.select('pf2_transactions', 'select=*');
    verifier('sans session, la clé publique ne lit rien (RLS)',
        Array.isArray(lignesAnon) && lignesAnon.length === 0 && jetonsVus[0] === CLE_ANON);
    let refusEcriture = null;
    try { await PF.net.supabase.insert('pf2_alertes', [{ titre: 'x' }]); }
    catch (e) { refusEcriture = e; }
    verifier('sans session, l’écriture est refusée', refusEcriture !== null);

    console.log('Connexion par mot de passe');
    await PF.net.auth.connexion('a@exemple.fr', 'mot-de-passe-1');
    verifier('la connexion rétablit la session', PF.net.auth.aUneSession());
    let mauvaise = null;
    try { await PF.net.auth.connexion('a@exemple.fr', 'faux'); }
    catch (e) { mauvaise = e; }
    verifier('un mauvais mot de passe est refusé avec un message lisible',
        mauvaise && /Identifiants invalides/.test(mauvaise.message));

    console.log('Expiration et rafraîchissement');
    PF.store.sauverSession({
        access_token: 'acces-perime', refresh_token: 'raf-A',
        expires_at: Date.now() - 1000, user_id: 'u', email: 'a@exemple.fr'
    });
    jetonsVus = [];
    const r401 = await PF.net.supabase.select('pf2_transactions', 'select=*');
    verifier('un jeton expiré (401) déclenche le rafraîchissement puis la relecture',
        r401.length === 1 && jetonsVus.includes('acces-perime') && jetonsVus.includes('acces-renouvele'),
        'jetons vus : ' + JSON.stringify(jetonsVus));
    verifier('la session porte désormais le jeton renouvelé',
        PF.store.lireSession().access_token === 'acces-renouvele');

    console.log('Rafraîchissement définitivement refusé');
    refuserRafraichissement = true;
    PF.store.sauverSession({
        access_token: 'acces-perime', refresh_token: 'raf-A',
        expires_at: Date.now() - 1000, user_id: 'u', email: 'a@exemple.fr'
    });
    const sNulle = await PF.net.auth.sessionValide();
    verifier('la session morte est purgée (reconnexion demandée)',
        sNulle === null && !PF.net.auth.aUneSession());
    refuserRafraichissement = false;

    console.log('Appel RPC (écritures atomiques)');
    await PF.net.auth.connexion('a@exemple.fr', 'mot-de-passe-1');
    const rpc = await PF.net.supabase.rpc('pf2_enregistrer_transaction', { p_ticker: 'IGLN.L' });
    verifier('le RPC passe par /rest/v1/rpc/<fonction>', rpc && rpc.fonction === 'pf2_enregistrer_transaction');
    verifier('les paramètres sont transmis', rpc.recu && rpc.recu.p_ticker === 'IGLN.L');

    console.log('Déconnexion');
    await PF.net.auth.deconnexion();
    verifier('la déconnexion efface la session locale', !PF.net.auth.aUneSession());

    console.log(echecs === 0
        ? '\n✔ ' + reussis + ' réussis, 0 échec'
        : '\n✗ ' + reussis + ' réussis, ' + echecs + ' échec' + (echecs > 1 ? 's' : ''));
    process.exit(echecs === 0 ? 0 : 1);
}

principal().catch((e) => { console.error(e); process.exit(1); });
