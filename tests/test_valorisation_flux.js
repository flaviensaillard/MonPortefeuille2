/* TWR exact (revue 2.0.1, constat F-07) : chaque apport porte la valeur du
   patrimoine juste AVANT le flux.

   Avant la 2.1.0, aucun geste n'enregistrait la valeur du portefeuille au
   moment du flux. Le TWR supposait alors le flux « en fin de période » et
   rendait +20 % là où le rendement réel était +10 %. Désormais :
   - `PF.net.ecrireApport` / `modifierApport` envoient `p_valeur_avant_eur` /
     `p_valeur_avant_usd` à la RPC (migration 006) ;
   - l'app capture le patrimoine courant au moment d'un NOUVEAU geste (le flux
     n'est pas encore écrit, c'est donc la valeur d'avant) ;
   - à la correction d'un geste 2.1 déjà saisi, on garde la valeur captée ;
   - avant la 2.1 : NULL, et le TWR déclare l'intervalle non calculé.

   Ce qui est verrouillé ici :
   - les deux RPC d'apport transmettent bien la valorisation d'avant-flux ;
   - sans valorisation fournie, les paramètres partent à null (pas d'invention) ;
   - app.js capture le patrimoine pour un nouveau geste et réutilise la valeur
     existante pour une correction. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js');

const stockage = {};
globalThis.localStorage = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');

/* Le faux serveur capture le corps de chaque RPC au lieu de l'exécuter :
   on veut inspecter CE QUI EST ENVOYÉ, pas le résultat. */
let corpsRpc = {};
function fauxTransport(method, url, entetes, corps) {
    if (url.indexOf('/rest/v1/') < 0) return { ok: false, status: -1, body: '' };
    if (method === 'GET') return { ok: true, status: 200, body: '[]' };
    const reste = url.split('/rest/v1/')[1];
    if (reste.startsWith('rpc/')) {
        const nom = reste.split('?')[0].slice(4);
        corpsRpc[nom] = JSON.parse(corps || '{}');
        return { ok: true, status: 200, body: JSON.stringify({ ok: true, apport_id: 1, operation_id: 1 }) };
    }
    if (method === 'POST' || method === 'PATCH') return { ok: true, status: 200, body: corps || '[]' };
    if (method === 'DELETE') return { ok: true, status: 200, body: '[]' };
    return { ok: false, status: 405, body: '' };
}

const contexte = vm.createContext(globalThis);
for (const f of ['util.js', 'models.js', 'store.js', 'net.js']) {
    vm.runInContext(fs.readFileSync(path.join(RACINE, f), 'utf8'), contexte, { filename: f });
}
const PF = globalThis.PF;
PF.net.setTransport(fauxTransport);
PF.store.sauverReglages({ supabaseUrl: 'https://test.supabase.co', supabaseKey: 'cle-test' });

let reussis = 0, echecs = 0;
function verifier(nom, cond, detail) {
    if (cond) { reussis++; console.log('  ✓ ' + nom); }
    else { echecs++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); }
}

const LIGNE_AP = {
    date: '2026-03-02', sens: 'apport', montant_eur: 500, montant_or: 0.2,
    cours_or: 2500, compte: 'Courant', reference: null, note: null
};

async function principal() {
    console.log('La RPC d’apport transmet la valorisation juste avant le flux');
    corpsRpc = {};
    await PF.net.ecrireApport({
        ligne: LIGNE_AP, compteId: 'c1', montantOperation: 500, typeOperation: 'depot',
        idempotence: '44444444-4444-4444-8444-444444444444',
        valeurAvantEur: 58000.5, valeurAvantUsd: 63250.25
    });
    let corps = corpsRpc['pf2_enregistrer_apport'] || {};
    verifier('p_valeur_avant_eur est envoyé', corps.p_valeur_avant_eur === 58000.5,
        'reçu : ' + corps.p_valeur_avant_eur);
    verifier('p_valeur_avant_usd est envoyé', corps.p_valeur_avant_usd === 63250.25,
        'reçu : ' + corps.p_valeur_avant_usd);

    console.log('Sans valorisation fournie, les paramètres partent à null');
    corpsRpc = {};
    await PF.net.ecrireApport({
        ligne: LIGNE_AP, compteId: 'c1', montantOperation: 500, typeOperation: 'depot',
        idempotence: '55555555-5555-4555-8555-555555555555'
    });
    corps = corpsRpc['pf2_enregistrer_apport'] || {};
    verifier('p_valeur_avant_eur est null par défaut', corps.p_valeur_avant_eur === null,
        'reçu : ' + corps.p_valeur_avant_eur);
    verifier('p_valeur_avant_usd est null par défaut', corps.p_valeur_avant_usd === null,
        'reçu : ' + corps.p_valeur_avant_usd);

    console.log('La correction d’un apport transmet aussi la valorisation');
    corpsRpc = {};
    await PF.net.modifierApport({
        id: 7, ligne: Object.assign({}, LIGNE_AP, { montant_eur: 350 }),
        compteId: 'c1', operationId: 9, montantOperation: 350, typeOperation: 'depot',
        valeurAvantEur: 2000, valeurAvantUsd: 2200
    });
    corps = corpsRpc['pf2_modifier_apport'] || {};
    verifier('p_valeur_avant_eur est envoyé à la modification', corps.p_valeur_avant_eur === 2000,
        'reçu : ' + corps.p_valeur_avant_eur);
    verifier('p_valeur_avant_usd est envoyé à la modification', corps.p_valeur_avant_usd === 2200,
        'reçu : ' + corps.p_valeur_avant_usd);

    console.log('app.js capture le patrimoine au moment du geste (structurel)');
    const src = fs.readFileSync(path.join(RACINE, 'app.js'), 'utf8');
    verifier('le nouveau geste capture le patrimoine courant',
        src.indexOf('etat.ctx.patrimoineTotalEur') >= 0
        && src.indexOf('etat.ctx.patrimoineTotalUsd') >= 0);
    verifier('la correction réutilise la valeur captée à l’époque',
        src.indexOf('existant.valeur_avant_eur') >= 0
        && src.indexOf('existant.valeur_avant_usd') >= 0);
    verifier('l’apport transmet la valorisation à la RPC',
        src.indexOf('valeurAvantEur: valeurAvantEur') >= 0
        && src.indexOf('valeurAvantUsd: valeurAvantUsd') >= 0);

    console.log('\n' + (echecs ? '✗ ' + echecs + ' échec(s), ' : '✔ ') + reussis + ' réussis'
        + (echecs ? '' : ', 0 échec'));
    process.exit(echecs ? 1 : 0);
}

principal().catch((e) => { console.error('Erreur inattendue :', e); process.exit(1); });
