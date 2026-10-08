/* Taux absent : aucun repli silencieux côté interface (www/js).
   Règle du projet : un chiffre plausible fabriqué avec un taux inventé (1, 1,125…)
   est pire qu'une absence affichée. Chaque point ci-dessous a son test, et la suite
   est lancée sur HEAD (PF_JS_DIR=<copie de HEAD>/www/js) pour vérifier qu'elle est
   rouge avant le correctif.

   Les modules sont chargés tels quels dans un vm, comme dans test_js.js. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = process.env.PF_JS_DIR || path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js');
const FICHIERS = ['util.js', 'models.js', 'net.js', 'store.js', 'metrics.js',
    'comptes.js', 'portfolio.js', 'rebalance.js', 'ui.js', 'fiscal.js', 'views.js', 'ia.js'];

// --- Faux navigateur -------------------------------------------------------
const stockage = {};
globalThis.localStorage = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');

// Transport réseau : les cours de change présents dans `table` (symbole -> cours),
// tous les autres symboles n'ont aucune donnée. Les tables Supabase sont vides.
function transportFx(table) {
    return function (method, url) {
        if (url.indexOf('/v8/finance/chart/') >= 0) {
            const symbole = decodeURIComponent(url.split('/v8/finance/chart/')[1].split('?')[0]);
            if (table[symbole] === undefined) {
                return { ok: true, status: 200, body: JSON.stringify({ chart: { result: null, error: { code: 'Not Found', description: 'absent' } } }) };
            }
            const v = table[symbole];
            return {
                ok: true, status: 200, body: JSON.stringify({
                    chart: {
                        result: [{
                            meta: { currency: 'EUR' },
                            timestamp: [1735689600, 1735776000, 1735862400],
                            indicators: { quote: [{ close: [v, v, v] }] }
                        }],
                        error: null
                    }
                })
            };
        }
        if (url.indexOf('/rest/v1/') >= 0) {
            return { ok: true, status: method === 'GET' ? 200 : 201, body: '[]' };
        }
        return { ok: false, status: -1, body: '' };
    };
}

// --- Chargement ------------------------------------------------------------
const contexte = vm.createContext(globalThis);
for (const f of FICHIERS) {
    vm.runInContext(fs.readFileSync(path.join(RACINE, f), 'utf8'), contexte, { filename: f });
}
const PF = globalThis.PF;
const U = PF.util;
PF.net.setTransport(transportFx({}));

// --- Cadre -----------------------------------------------------------------
let reussis = 0, echecs = 0;
const differes = [];
function test(nom, fn) {
    try {
        const r = fn();
        if (r === false) throw new Error('assertion fausse');
        reussis++;
        console.log('  ✓ ' + nom);
    } catch (e) {
        echecs++;
        console.log('  ✗ ' + nom + ' → ' + e.message);
    }
}
function testAsync(nom, fn) { differes.push({ nom, fn }); }
function egal(a, b) {
    if (a !== b) throw new Error(JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));
    return true;
}
function proche(a, b, tol) {
    if (typeof a !== 'number' || Math.abs(a - b) > (tol === undefined ? 1e-6 : tol)) throw new Error(a + ' ≠ ' + b);
    return true;
}
// Remplace temporairement une propriété de PF.* le temps d'un test.
function avec(cible, cle, valeur, fn) {
    const avant = cible[cle];
    cible[cle] = valeur;
    try { return fn(); } finally { cible[cle] = avant; }
}
async function avecAsync(cible, cle, valeur, fn) {
    const avant = cible[cle];
    cible[cle] = valeur;
    try { return await fn(); } finally { cible[cle] = avant; }
}

// Taux de change de test : EUR par dollar et par yen, connus à l'avance.
const tauxStub = (devise, date, contre) => {
    const t = { 'USD|EUR': 0.9, 'JPY|EUR': 0.006, 'USD|USD': 1, 'EUR|EUR': 1, 'EUR|USD': 1.11 };
    return Promise.resolve(t[String(devise).toUpperCase() + '|' + String(contre).toUpperCase()] || null);
};

// ---------------------------------------------------------------- formatage
console.log('\nFormatage : une valeur absente n’est jamais affichée comme zéro');
test('eur(null) affiche « — », pas « 0,00 € »', () => egal(U.eur(null), '—'));
test('usd(undefined) affiche « — »', () => egal(U.usd(undefined), '—'));
test('eur(NaN, signe) affiche « — »', () => egal(U.eur(NaN, { signe: true, dec: 0 }), '—'));
test('eur(0) reste un zéro réel', () => egal(U.eur(0), '0,00 €'));
test('tauxValide : 0, null, NaN, négatif → null', () =>
    egal(U.tauxValide(0), null) && egal(U.tauxValide(null), null) && egal(U.tauxValide(NaN), null) && egal(U.tauxValide(-1), null));
test('tauxValide : un cours réel passe tel quel', () => egal(U.tauxValide(1.125), 1.125));
test('enEur sans taux → null (pas de division par 1)', () => egal(U.enEur(100, null), null));
test('enEur avec taux → division', () => proche(U.enEur(100, 1.25), 80));
test('enUsd sans taux → null (pas de multiplication par 1,125)', () => egal(U.enUsd(100, undefined), null));

// ------------------------------------------- 1. mouvement de fonds (apport/retrait)
console.log('\n1. Apport ou retrait : valorisé au cours réel ou refusé');
testAsync('tauxMouvement : cours manquant → refus nommé, sans valeur devinée', async () => {
    PF.net.setTransport(transportFx({}));
    PF.net.viderCache();
    try {
        await PF.net.tauxMouvement('USD', '2025-01-03');
        throw new Error('aucune erreur levée');
    } catch (e) {
        if (!e.tauxIndisponible) throw new Error('erreur non marquée tauxIndisponible : ' + e.message);
        egal(e.paire, 'USD/EUR');
    }
    PF.net.setTransport(transportFx({}));
});
testAsync('tauxMouvement : cours présents → EUR et USD réels, rien de 1', async () => {
    PF.net.viderCache();
    PF.net.setTransport(transportFx({ 'USDEUR=X': 0.9, 'USDUSD=X': 1.0 }));
    const tx = await PF.net.tauxMouvement('USD', '2025-01-03');
    proche(tx.eur, 0.9);
    proche(tx.usd, 1);
    PF.net.setTransport(transportFx({}));
});
testAsync('tauxMouvement : une seule jambe manquante (JPY/USD) → refus, pas de taux de réglage', async () => {
    PF.net.viderCache();
    PF.net.setTransport(transportFx({ 'JPYEUR=X': 0.006 }));
    try {
        await PF.net.tauxMouvement('JPY', '2025-01-03');
        throw new Error('aucune erreur levée');
    } catch (e) {
        if (!e.tauxIndisponible) throw new Error('non refusé : ' + e.message);
        egal(e.paire, 'JPY/USD');
    }
    PF.net.setTransport(transportFx({}));
});
test('garde-fou : aucun repli de taux dans www/js (hors démo, « démo, ne pas imiter »)', () => {
    const interdits = [
        /\|\|\s*1\.125\b/, /:\s*1\.125\b/, /\bfx\s*\|\|\s*1\b/, /\btEur\s*\|\|\s*1\b/,
        /\bdernierTaux\s*\|\|\s*1\b/, /\btaux\[[^\]]*\]\s*\|\|\s*1\b/, /\btaux\s*\|\|\s*1\b/,
        /\bfx\s*\?\s*fx\s*:\s*1\b/, /\btauxEurUsd\s*>\s*0\s*\?\s*[\w.]+\s*:\s*1\.125/
    ];
    const trouves = [];
    fs.readdirSync(RACINE).filter((f) => f.endsWith('.js')).forEach((f) => {
        let code = fs.readFileSync(path.join(RACINE, f), 'utf8');
        if (f === 'app.js') {
            // La démo est le seul endroit où 1,125 peut figurer : tout ce qui suit
            // « function demoContexte » et précède « PF.app = { » est exclu.
            const debut = code.indexOf('function demoContexte');
            const fin = code.indexOf('PF.app = {');
            if (debut >= 0 && fin > debut) code = code.slice(0, debut) + code.slice(fin);
        }
        code.split('\n').forEach((ligne, i) => {
            interdits.forEach((re) => { if (re.test(ligne)) trouves.push(f + ':' + (i + 1) + ' ' + ligne.trim()); });
        });
    });
    if (trouves.length) throw new Error(trouves.length + ' repli(s) : ' + trouves.slice(0, 3).join(' | '));
    return true;
});
test('garde-fou : 1,125 n’apparaît que dans la démo', () => {
    const trouves = [];
    fs.readdirSync(RACINE).filter((f) => f.endsWith('.js')).forEach((f) => {
        let code = fs.readFileSync(path.join(RACINE, f), 'utf8');
        if (f === 'app.js') {
            const debut = code.indexOf('function demoContexte');
            const fin = code.indexOf('PF.app = {');
            if (debut >= 0 && fin > debut) code = code.slice(0, debut) + code.slice(fin);
        }
        if (code.indexOf('1.125') >= 0) trouves.push(f);
    });
    if (trouves.length) throw new Error('1,125 hors démo dans : ' + trouves.join(', '));
    return true;
});

// ------------------------------------------------------------------ 2. fiscal
console.log('\n2. Fiscalité : pas de montant avec un taux inventé');
function transactionsTest() {
    return [
        { ticker: 'BTCUSDT', type: 'achat', date: '2025-01-10', quantite: 1, cours: 60000, frais: 0, montantNet: 60000, devise: 'USD' },
        { ticker: 'BTC-USD', type: 'achat', date: '2025-02-01', quantite: 10, cours: 3000, frais: 0, montantNet: 30000, devise: 'USD' },
        { ticker: 'BTCUSDT', type: 'vente', date: '2025-03-01', quantite: 0.5, cours: 70000, frais: 0, montantNet: 35000, devise: 'USD' }
    ];
}
testAsync('bilanCessions : taux USD manquant → « non calculé », aucun chiffre', async () => {
    const ctx = { transactions: transactionsTest() };
    const b = await avecAsync(PF.net, 'taux', () => Promise.resolve(null),
        () => avecAsync(PF.net, 'cours', () => Promise.resolve(60000), () => PF.fiscal.bilanCessions(ctx, 2025)));
    if (!b.indisponible || b.indisponible.length === 0) throw new Error('aucun manquant signalé');
    egal(b.indisponible[0].devise, 'USD');
    if (['2025-01-10', '2025-02-01', '2025-03-01'].indexOf(b.indisponible[0].date) < 0) throw new Error('date inattendue : ' + b.indisponible[0].date);
    egal(b.t2086.plus_value_globale_224, 0);
    egal(b.t2086.case_3an, 0);
});
testAsync('bilanCessions : cours d’un autre crypto absent → signalé, position pas retirée en silence', async () => {
    const ctx = { transactions: transactionsTest() };
    const b = await avecAsync(PF.net, 'taux', tauxStub,
        () => avecAsync(PF.net, 'cours', (t) => Promise.resolve(t === 'BTC-USD' ? null : 60000),
            () => PF.fiscal.bilanCessions(ctx, 2025)));
    const libelles = b.indisponible.map((m) => m.devise);
    if (libelles.indexOf('cours BTC-USD') < 0) throw new Error('cours BTC-USD manquant non signalé : ' + libelles.join(','));
    if (b.t2086.cessions.length !== 0) throw new Error('une cession chiffrée malgré le cours manquant');
});
testAsync('bilanCessions : taux de l’achat ancien manquant → vente de l’année non chiffrée', async () => {
    // L'achat de 2025 n'a pas de cours ; la cession est en 2026. Sans cet achat,
    // le prix de revient — donc la plus-value — serait faux.
    const txs = [
        { ticker: 'IGLN.L', type: 'achat', date: '2025-01-10', quantite: 100, cours: 34.2, frais: 9.9, montantNet: 3429.9, devise: 'USD' },
        { ticker: 'IGLN.L', type: 'vente', date: '2026-03-02', quantite: 20, cours: 39.5, frais: 9.9, montantNet: 780.1, devise: 'EUR' }
    ];
    const b = await avecAsync(PF.net, 'taux', (d, date) => Promise.resolve(date === '2025-01-10' ? null : 0.9),
        () => PF.fiscal.bilanCessions({ transactions: txs }, 2026));
    if (!b.indisponible.some((m) => m.devise === 'USD' && m.date === '2025-01-10')) {
        throw new Error('achat 2025 sans cours non signalé');
    }
    egal(b.t2074.bilan_net, 0);
});
testAsync('bilanCessions : tous les cours présents → rien de signalé, chiffres calculés', async () => {
    const ctx = { transactions: transactionsTest() };
    const b = await avecAsync(PF.net, 'taux', tauxStub,
        () => avecAsync(PF.net, 'cours', () => Promise.resolve(60000), () => PF.fiscal.bilanCessions(ctx, 2025)));
    egal(b.indisponible.length, 0);
    if (b.t2086.cessions.length !== 1) throw new Error('la cession devrait être calculée');
});

// --------------------------------------------- 3. affichage : tableau de bord, graphes…
console.log('\n3. Affichage : « — », point non tracé avec mention, exclusion annoncée');
test('portefeuille : taux EUR/USD absent → aucun point d’historique USD, nombre dit', () => {
    const ctx = PF.portefeuille.contexteVide();
    ctx.tauxEurUsd = null;
    ctx.snapshotsBruts = [{ date: '2025-06-01', patrimoine_investi_eur: 60000, patrimoine_total_eur: 69000 }];
    ctx.apports = [{ date: '2025-01-05', montant_eur: 5000, sens: 'apport' }];
    PF.portefeuille.enrichirHistoriquesUsd(ctx);
    egal(ctx.snapshots.length, 0);
    if (!(ctx.nbPointsSansTaux > 0)) throw new Error('points non tracés non comptés');
    egal(ctx.apports[0].montant_usd, null);
    return true;
});
test('portefeuille : avec taux, les points sont calculés (pas de sur-blocage)', () => {
    const ctx = PF.portefeuille.contexteVide();
    ctx.tauxEurUsd = 1.1;
    ctx.snapshotsBruts = [{ date: '2025-06-01', patrimoine_investi_eur: 60000, patrimoine_total_eur: 69000 }];
    ctx.apports = [{ date: '2025-01-05', montant_eur: 5000, sens: 'apport' }];
    PF.portefeuille.enrichirHistoriquesUsd(ctx);
    if (ctx.snapshots.length < 1) throw new Error('aucun point USD malgré le taux');
    proche(ctx.apports[0].montant_usd, 5500, 0.01);
    return true;
});
test('métriques : rente en euros sans taux → null, pas de rente au taux de 1', () =>
    egal(PF.metrics.renteMensuelle(1000, 500, 0.05, 0.02, 0.3, null), null));
test('métriques : sensibilité au change sans taux → null, pas de base à 1,125', () =>
    egal(PF.metrics.sensibiliteChange(1000, 900, null), null));
test('rééquilibrage : titre sans cours de change → ordre non chiffré, nommé', () => {
    const ctx = PF.portefeuille.contexteVide();
    ctx.actifs = [
        { ticker: 'IGLN.L', classe: 'or', deviseCotation: 'USD', poche: 'rv_physique', quantite: 100, prix: 40, valeurUsd: 4000, valeurEur: 3555, variationPct: 0.01, dernierTaux: null },
        { ticker: 'XDW0.L', classe: 'action_etf', deviseCotation: 'USD', poche: 'energie', quantite: 100, prix: 40, valeurUsd: 4000, valeurEur: 3555, variationPct: -0.01, dernierTaux: 0.889 },
        { ticker: 'FLXC.L', classe: 'action_etf', deviseCotation: 'USD', poche: 'asie', quantite: 100, prix: 40, valeurUsd: 4000, valeurEur: 3555, variationPct: 0, dernierTaux: 0.889 },
        { ticker: 'BTCUSDT', classe: 'crypto', deviseCotation: 'USD', poche: 'rv_numerique', quantite: 5, prix: 40, valeurUsd: 200, valeurEur: 178, variationPct: 0, dernierTaux: 0.889 },
        { ticker: 'XJSE.SW', classe: 'obligation_etf', deviseCotation: 'JPY', poche: 'jgb', quantite: 300, prix: 1, valeurUsd: 2000, valeurEur: 1778, variationPct: 0, dernierTaux: 0.006 }
    ];
    PF.portefeuille.agreger(ctx);
    const d = PF.rebalance.diagnostiquer(ctx);
    const g = PF.rebalance.genererOrdres(d.ecarts, 1);
    if (g.ordres.some((o) => o.ticker === 'IGLN.L')) throw new Error('un ordre chiffré sans cours : IGLN.L');
    if (!g.sansTaux || !g.sansTaux.some((o) => o.ticker === 'IGLN.L')) throw new Error('IGLN.L non signalé');
    return true;
});
test('retraite : taux absent → projection non chiffrée, pas de scénario au taux de 1,125', () => {
    const ctx = PF.portefeuille.contexteVide();
    ctx.tauxEurUsd = null;
    const base = PF.vues.scenariosRetraite(ctx);
    if (base.indisponible !== true) throw new Error('scénarios calculés sans taux');
    egal(base.scenarios.length, 0);
    return true;
});
test('retraite : avec taux, les scénarios sont calculés', () => {
    const ctx = PF.portefeuille.contexteVide();
    ctx.tauxEurUsd = 1.25;
    const base = PF.vues.scenariosRetraite(ctx);
    if (base.indisponible) throw new Error('indisponible malgré un taux');
    egal(base.fx, 1.25);
    return true;
});

// ------------------------------------- 4. coût des positions, flux, bandeau (ajouts)
console.log('\n4. Positions, flux en dollars, bandeau : aucun repli inter-devises');
testAsync('positions : achat en EUR sans cours EUR/USD → ligne « non calculée », pas de coût en dollars inventé', async () => {
    // Avant : le cours EUR servait de cours USD (ou 1). Le coût en dollars était
    // alors faux, et la position était valorisée sur ce faux coût.
    const txs = [{ ticker: 'IWDA.L', type: 'achat', date: '2025-01-10', quantite: 10, cours: 100,
        frais: 0, montantNet: 1000, devise: 'EUR' }];
    const r = await avecAsync(PF.net, 'taux', () => Promise.resolve(null),
        () => PF.portefeuille.calculerPositions(txs, []));
    const p = r.positions['IWDA.L'];
    if (!p || p.nonCalcule !== true) throw new Error('position non marquée « non calculée »');
    egal(p.coutTotalUsd, 0);
    if (r.tauxManquants.indexOf('EUR/USD') < 0) throw new Error('paire EUR/USD non signalée : ' + r.tauxManquants.join(','));
});
testAsync('positions : achat en USD avec cours EUR/USD présent → coûts réels, rien marqué', async () => {
    const txs = [{ ticker: 'CW8.L', type: 'achat', date: '2025-01-10', quantite: 10, cours: 100,
        frais: 0, montantNet: 1000, devise: 'USD' }];
    const r = await avecAsync(PF.net, 'taux', tauxStub,
        () => PF.portefeuille.calculerPositions(txs, []));
    const p = r.positions['CW8.L'];
    if (p.nonCalcule) throw new Error('position marquée sans raison');
    proche(p.coutTotalEur, 900, 0.01);
    proche(p.coutTotalUsd, 1000, 0.01);
});
testAsync('positions : une ligne non calculée est listée en échec, jamais valorisée à moitié', async () => {
    const txs = [{ ticker: 'IWDA.L', type: 'achat', date: '2025-01-10', quantite: 10, cours: 100,
        frais: 0, montantNet: 1000, devise: 'EUR' }];
    const pos = await avecAsync(PF.net, 'taux', () => Promise.resolve(null),
        () => PF.portefeuille.calculerPositions(txs, []));
    const v = await avecAsync(PF.net, 'cours', () => Promise.resolve(110),
        () => avecAsync(PF.net, 'taux', () => Promise.resolve(null),
            () => PF.portefeuille.valoriser(pos.positions, '2025-06-01')));
    if (v.echecs.indexOf('IWDA.L') < 0) throw new Error('ligne non calculée absente des échecs');
    if (v.actifs.length) throw new Error('ligne valorisée malgré un coût inconnu');
});
test('flux : montantSigne d’un apport sans montant en dollars → null, pas le montant en euros', () => {
    const v = PF.metrics.montantSigne({ type: 'apport', montant_eur: 500 }, 'montant_usd');
    if (v !== null) throw new Error('montant en euros compté en dollars : ' + v);
    return true;
});
test('flux : montantSigne avec colonne renseignée → signé comme avant', () => {
    egal(PF.metrics.montantSigne({ type: 'apport', montant_usd: 550 }, 'montant_usd'), 550);
    egal(PF.metrics.montantSigne({ type: 'retrait', montant_usd: 550 }, 'montant_usd'), -550);
    return true;
});
test('apports : un apport sans montant en dollars s’affiche « — », pas son montant en euros', () => {
    const ctx = PF.portefeuille.contexteVide();
    ctx.tauxEurUsd = null;
    ctx.apports = [{ id: 7, date: '2025-01-05', type: 'apport', montant_eur: 5000, montant_usd: null }];
    ctx.ongletPortefeuille = 'operations';
    PF.vues.definirOngletPortefeuille('operations');
    const html = PF.vues.portefeuille(ctx);
    PF.vues.definirOngletPortefeuille('positions');
    if (html.indexOf('5 000 $') >= 0 || html.indexOf('5 000,00 $') >= 0) throw new Error('5 000 € affichés en dollars');
    return true;
});
test('bandeau : titre sans taux de change → « Non calculé, taux de change indisponible », distinct des cours', () => {
    const ctx = PF.portefeuille.contexteVide();
    ctx.tauxEurUsd = 1.2; ctx.tauxIndisponible = false;
    ctx.positions = { 'IWDA.L': { ticker: 'IWDA.L', nonCalcule: true, quantite: 10 } };
    ctx.echecsCours = ['IWDA.L'];
    ctx.echecsFx = ['CNY/EUR'];
    const html = PF.vues.bord(ctx);
    if (html.indexOf('Non calculé, taux de change indisponible') < 0) throw new Error('bandeau « non calculé » absent');
    if (html.indexOf('CNY/EUR') < 0) throw new Error('paire manquante non nommée');
    if (html.indexOf('Cours indisponibles : IWDA.L') >= 0) throw new Error('titre non calculé présenté comme cours indisponible');
    return true;
});

// ------------------------------------------------------------------- lancement
(async () => {
    for (const t of differes) {
        try {
            await t.fn();
            reussis++;
            console.log('  ✓ ' + t.nom);
        } catch (e) {
            echecs++;
            console.log('  ✗ ' + t.nom + ' → ' + e.message);
        }
    }
    PF.net.setTransport(transportFx({}));
    console.log('\n' + (echecs === 0 ? '✔ ' : '✘ ') + reussis + ' réussis, ' + echecs + ' échecs\n');
    process.exit(echecs === 0 ? 0 : 1);
})();
