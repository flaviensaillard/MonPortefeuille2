/* Pagination des lectures Supabase (revue 2.0.1, constats D-05 / L-07).

   La limite standard de PostgREST/Supabase est de 1 000 lignes par réponse.
   Avant la 2.1.0, aucune lecture ne paginait : au-delà de 1 000 lignes,
   l'historique était tronqué sans erreur. À un snapshot par jour, on atteint
   la limite en ~2,7 ans ; 40 ans ≈ 14 610 lignes.

   Le faux serveur ci-dessous applique la limite de 1 000 lignes PAR REQUÊTE,
   comme le vrai Supabase. Ce qui est verrouillé :
   - 1 001 lignes : tout est lu (pas 1 000) ;
   - 15 000 lignes (plus de 40 ans de snapshots) : tout est lu ;
   - aucune ligne dupliquée, ordre stable conservé ;
   - une page qui échoue fait échouer TOUTE la lecture (jamais de
     troncature silencieuse) ;
   - l'écran (chargerDonnées) reçoit bien toutes les transactions au-delà
     de la limite. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js');
const FICHIERS = ['util.js', 'models.js', 'net.js', 'store.js', 'metrics.js',
    'comptes.js', 'portfolio.js', 'rebalance.js', 'ui.js', 'fiscal.js', 'views.js', 'ia.js'];

const stockage = {};
globalThis.localStorage = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');

// ---------------------------------------------------------------------------
// Émulateur PostgREST : limite de 1 000 lignes PAR REQUÊTE, order/limit/offset.
// ---------------------------------------------------------------------------
const LIMITE_SERVEUR = 1000;
const TABLES = {};
let injecterEchecPage = null;   // { table, offset } → la page échoue
let nbRequetes = 0;

function comparer(a, b, ordre) {
    for (const o of ordre) {
        const [col, sens] = o.split('.');
        const va = a[col], vb = b[col];
        if (va === vb) continue;
        const cmp = va < vb ? -1 : 1;
        return (sens === 'desc' ? -1 : 1) * cmp;
    }
    return 0;
}

function fauxTransport(method, url, entetes, corps) {
    if (url.indexOf('/v8/finance/chart/') >= 0) {
        return {
            ok: true, status: 200,
            body: JSON.stringify({
                chart: {
                    result: [{
                        meta: { currency: 'USD' },
                        timestamp: [1735689600, 1735776000],
                        indicators: { quote: [{ close: [40, 41] }] }
                    }],
                    error: null
                }
            })
        };
    }
    if (url.indexOf('/rest/v1/') < 0) return { ok: false, status: -1, body: '' };
    if (method !== 'GET') return { ok: true, status: 201, body: '[]' };

    const reste = url.split('/rest/v1/')[1];
    const table = reste.split('?')[0];
    if (table.startsWith('rpc/')) return { ok: true, status: 200, body: '{"ok":true}' };
    const params = {};
    (reste.split('?')[1] || '').split('&').filter(Boolean).forEach(function (kv) {
        const i = kv.indexOf('=');
        params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });

    let lignes = (TABLES[table] || []).slice();
    if (params.order) lignes.sort((a, b) => comparer(a, b, params.order.split(',')));

    const offset = parseInt(params.offset || '0', 10);
    const limit = Math.min(parseInt(params.limit || String(LIMITE_SERVEUR), 10), LIMITE_SERVEUR);

    nbRequetes++;
    if (injecterEchecPage && injecterEchecPage.table === table && offset >= injecterEchecPage.offset) {
        return { ok: false, status: 500, body: 'panne simulée du serveur' };
    }
    return { ok: true, status: 200, body: JSON.stringify(lignes.slice(offset, offset + limit)) };
}

const contexte = vm.createContext(globalThis);
for (const f of FICHIERS) {
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

function remplirSnapshots(n) {
    TABLES.pf2_snapshots = [];
    for (let i = 0; i < n; i++) {
        const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000);
        TABLES.pf2_snapshots.push({
            id: i + 1,
            date: d.toISOString().slice(0, 10),
            patrimoine_total_eur: 100000 + i,
            patrimoine_investi_eur: 90000 + i,
            precaution_eur: 5000, courant_eur: 5000,
            complet: true
        });
    }
}

async function principal() {
    console.log('1 001 lignes : la ligne de plus ne doit pas disparaître');
    remplirSnapshots(1001);
    nbRequetes = 0;
    let lignes = await PF.net.supabase.selectTout('pf2_snapshots', 'select=*');
    verifier('les 1 001 lignes sont lues', lignes.length === 1001, 'lu : ' + lignes.length);
    verifier('aucune ligne dupliquée', new Set(lignes.map(l => l.id)).size === lignes.length);
    verifier('ordre par date conservé',
        lignes[0].date === '2026-01-01' && lignes[1000].date === TABLES.pf2_snapshots[1000].date);
    verifier('la lecture a paginé (plus d’une requête)', nbRequetes >= 2, 'requêtes : ' + nbRequetes);

    console.log('15 000 lignes : plus de 40 ans de snapshots quotidiens');
    remplirSnapshots(15000);
    nbRequetes = 0;
    lignes = await PF.net.supabase.selectTout('pf2_snapshots', 'select=*');
    verifier('les 15 000 lignes sont lues', lignes.length === 15000, 'lu : ' + lignes.length);
    verifier('aucune ligne dupliquée à 15 000', new Set(lignes.map(l => l.id)).size === lignes.length);
    verifier('la dernière ligne est la plus récente',
        lignes[lignes.length - 1].id === 15000);

    console.log('Une page qui échoue fait échouer toute la lecture');
    injecterEchecPage = { table: 'pf2_snapshots', offset: 1000 };
    let erreur = null;
    try { await PF.net.supabase.selectTout('pf2_snapshots', 'select=*'); }
    catch (e) { erreur = e; }
    verifier('l’échec d’une page n’est jamais avalé (pas de troncature silencieuse)',
        erreur !== null);
    injecterEchecPage = null;

    console.log('Lecture exacte pour une table vide et une petite table');
    remplirSnapshots(0);
    lignes = await PF.net.supabase.selectTout('pf2_snapshots', 'select=*');
    verifier('table vide : zéro ligne, pas d’erreur', lignes.length === 0);
    remplirSnapshots(12);
    lignes = await PF.net.supabase.selectTout('pf2_snapshots', 'select=*');
    verifier('petite table : 12 lignes en une requête', lignes.length === 12);

    console.log('L’écran reçoit toutes les transactions au-delà de la limite');
    TABLES.pf2_transactions = [];
    for (let i = 0; i < 1050; i++) {
        TABLES.pf2_transactions.push({
            id: i + 1, ticker: 'IGLN.L', sens: 'achat',
            date: '2025-01-01', quantite: 1, cours: 40, frais: 0,
            devise: 'USD', source: 'test', reference: null, note: null
        });
    }
    TABLES.pf2_apports = [];
    TABLES.pf2_inflation = [];
    TABLES.Donnees = [];
    TABLES.Projections = [];
    TABLES.Historique = [];
    TABLES.Config = [];
    TABLES.pf2_comptes = [];
    TABLES.pf2_operations_compte = [];
    const ctx = await PF.portefeuille.charger();
    verifier('l’écran lit les 1 050 transactions',
        ctx && ctx.transactions && ctx.transactions.length === 1050,
        'lu : ' + (ctx && ctx.transactions ? ctx.transactions.length : 'rien'));

    console.log(echecs === 0
        ? '\n✔ ' + reussis + ' réussis, 0 échec'
        : '\n✗ ' + reussis + ' réussis, ' + echecs + ' échec' + (echecs > 1 ? 's' : ''));
    process.exit(echecs === 0 ? 0 : 1);
}

principal().catch((e) => { console.error(e); process.exit(1); });
