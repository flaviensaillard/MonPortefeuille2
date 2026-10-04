/* Vérification du moteur JavaScript hors Android.
   Les modules sont chargés tels quels dans Node, avec un faux transport réseau :
   on teste donc le même code que celui qui tourne dans la WebView. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js');
const FICHIERS = ['util.js', 'models.js', 'net.js', 'store.js', 'metrics.js',
    'portfolio.js', 'rebalance.js', 'ui.js', 'fiscal.js', 'views.js'];

// --- Faux navigateur -------------------------------------------------------
const stockage = {};
globalThis.localStorage = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');

const COURS = { 'GC=F': 2650, 'IGLN.L': 40.5, 'BTCUSDT': 61000, 'XDW0.L': 41.5, 'FLXC.L': 24.8, 'XJSE.SW': 2150 };
const DEVISES = { 'IGLN.L': 'USD', 'BTCUSDT': 'USD', 'XDW0.L': 'USD', 'FLXC.L': 'USD', 'XJSE.SW': 'JPY', 'GC=F': 'USD' };

const TABLES = {
    pf2_transactions: [
        { id: 1, ticker: 'IGLN.L', sens: 'achat', date: '2025-01-10', quantite: 100, cours: 34.2, frais: 9.9, devise: 'USD', source: 'test' },
        { id: 2, ticker: 'XJSE.SW', sens: 'achat', date: '2025-02-10', quantite: 400, cours: 2150, frais: 12, devise: 'JPY', source: 'test' },
        { id: 3, ticker: 'IGLN.L', sens: 'vente', date: '2026-03-02', quantite: 20, cours: 39.5, frais: 9.9, devise: 'USD', source: 'test' }
    ],
    pf2_apports: [
        { id: 1, date: '2025-01-05', sens: 'apport', montant_eur: 5000, montant_or: 1.9, cours_or: 2650 }
    ],
    pf2_snapshots: [
        { date: '2025-06-01', patrimoine_investi_eur: 60000, patrimoine_total_eur: 69000, precaution_eur: 9000, cours_or_usd: 2400, equivalent_or_oz: 25.6 },
        { date: '2026-01-15', patrimoine_investi_eur: 68000, patrimoine_total_eur: 77000, precaution_eur: 9000, cours_or_usd: 2600, equivalent_or_oz: 25.4 }
    ],
    pf2_inflation: [
        { annee: 2025, inflation: 1.7 }, { annee: 2026, inflation: 1.5 }
    ],
    Donnees: [
        { id: 3849, Ticker: 'USD', Type: '💵 Cash', Quantité: 7.385 },
        { id: 3848, Ticker: 'CHF', Type: '🏦 Cash réserve', Quantité: 8694.44 },
        { id: 3850, Ticker: 'IGLN.L', Type: '💰 Or', Quantité: 80, 'Court': '$ 40,20', 'Var. Jour 🔒': '↗ +0,81 %' }
    ],
    Projections: [
        { Date: '01/06/2025', 'Actifs Stratégiques': 67500, 'Total Global': 76500, 'Capital investi': 50000 },
        { Date: '15/01/2026', 'Actifs Stratégiques': 73000, 'Total Global': 82000, 'Capital investi': 50000 }
    ],
    Historique: [
        { id: 11, Date: '05/01/2025', Type: 'Ajout de fond propre', 'Montant $': 5600, 'Montant €': 5000, 'Montant Or': 1.9, Total_Apports_nets: 5600 }
    ],
    Config: []
};

function fauxTransport(method, url, entetes, corps) {
    if (url.indexOf('/v8/finance/chart/') >= 0) {
        const symbole = decodeURIComponent(url.split('/v8/finance/chart/')[1].split('?')[0]);
        const prix = symbole.indexOf('=X') >= 0
            ? (symbole === 'JPYEUR=X' ? 0.006 : (symbole === 'JPYUSD=X' ? 0.0068 : (symbole === 'CHFEUR=X' ? 1.06 : (symbole === 'CHFUSD=X' ? 1.2 : (symbole === 'EURUSD=X' ? 1.125 : 1.0)))))
            : (COURS[symbole] || 100);
        const devise = symbole.indexOf('=X') >= 0 ? 'EUR' : (DEVISES[symbole] || 'USD');
        const corpsJson = {
            chart: {
                result: [{
                    meta: { currency: devise },
                    timestamp: [1735689600, 1735776000, 1735862400],
                    indicators: { quote: [{ close: [prix * 0.98, prix * 0.99, prix] }] }
                }],
                error: null
            }
        };
        return { ok: true, status: 200, body: JSON.stringify(corpsJson) };
    }
    if (url.indexOf('/rest/v1/') >= 0) {
        const table = url.split('/rest/v1/')[1].split('?')[0];
        if (method === 'GET') {
            return { ok: true, status: 200, body: JSON.stringify(TABLES[table] || []) };
        }
        return { ok: true, status: 201, body: '[]' };
    }
    return { ok: false, status: -1, body: '' };
}

// --- Chargement ------------------------------------------------------------
const contexte = vm.createContext(globalThis);
for (const f of FICHIERS) {
    const code = fs.readFileSync(path.join(RACINE, f), 'utf8');
    vm.runInContext(code, contexte, { filename: f });
}
const PF = globalThis.PF;
PF.net.setTransport(fauxTransport);

// --- Mini cadre de test ----------------------------------------------------
let reussis = 0, echecs = 0;
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
function proche(a, b, tolerance) {
    const t = tolerance === undefined ? 1e-6 : tolerance;
    if (Math.abs(a - b) > t) throw new Error(a + ' ≠ ' + b);
    return true;
}
const U = PF.util;

console.log('\nFormatage');
test('fleche ↗ au-dessus du seuil', () => U.fleche(0.0081).texte === '↗ +0,81 %');
test('fleche ↘ en dessous', () => U.fleche(-0.0152).texte === '↘ -1,52 %');
test('fleche → si stable', () => U.fleche(0.0).texte === '→ 0,00 %');
test('fleche — si valeur nulle', () => U.fleche(null).texte === '—');
test('nombres en français', () => U.usd(1234.5) === '1 234,50 $');
test('euros', () => U.eur(1234.5, { dec: 0 }) === '1 235 €');
test('points', () => U.points(0.015) === '+1,5 pt');

console.log('\nModèle d’allocation');
test('cible de l’or à 15 %', () => proche(PF.modele.cibleActif('IGLN.L'), 0.15));
test('bitcoin dans rv_numerique', () => PF.modele.pocheDe('BTCUSDT').cle === 'rv_numerique');
test('or dans rv_physique', () => PF.modele.pocheDe('IGLN.L').cle === 'rv_physique');
test('total des cibles = 100 %', () => proche(PF.modele.verifier({ actifs: PF.modele.etat.actifs }).total_pct, 100));
test('bande de l’or = 3 pts', () => proche(PF.modele.bandeActif('IGLN.L'), 0.03));
test('classe de XJSE.SW', () => PF.modele.classeDe('XJSE.SW') === 'obligation_etf');
test('devise de XJSE.SW', () => PF.modele.deviseDe('XJSE.SW') === 'JPY');

console.log('\nMesures');
test('TWR nul quand le flux explique la hausse', () => proche(PF.metrics.twrDepuis([100, 110], [0, 10]), 0));
test('TWR de 10 % sans flux', () => proche(PF.metrics.twrDepuis([100, 110], [0, 0]), 0.1));
test('chaînage géométrique', () => proche(PF.metrics.twr([0.1, 0.1]), 0.21));
test('annualisation', () => proche(PF.metrics.annualiser(0.21, 730), Math.pow(1.21, 365.25 / 730) - 1, 1e-9));
test('rendement réel de Fisher', () => proche(PF.metrics.rendementReel(0.05, 0.02), 1.05 / 1.02 - 1));
test('flux rangés dans la période', () => {
    const f = PF.metrics.fluxParPeriode(['2025-01-01', '2025-02-01', '2025-03-01'], { '2025-01-20': 500 }, 0);
    return f[1] === 500 && f[2] === 0;
});
test('inflation cumulée pondérée par le temps', () => {
    const f = PF.metrics.inflationCumulee({ 2025: 0.02 }, '2025-01-01', '2026-01-01');
    return proche(f, 1.02, 1e-3);
});
test('rente mensuelle : on ne consomme que le réel', () => {
    const r = PF.metrics.renteMensuelle(100000, 80000, 0.06, 0.02, 0.314, 1.125);
    const reel = 1.06 / 1.02 - 1;
    return proche(r.rente_brute_usd, 100000 * reel / 12, 1e-6) && proche(r.part_pv, 0.2, 1e-9);
});

console.log('\nFiscalité');
test('barème 2025 disponible', () => PF.fiscal.annees().indexOf(2025) >= 0);
test('IR nul sous la décote', () => PF.fiscal.impotRevenu(10000, 3, 2025, 'Marié(e) / Pacsé(e)').impot_net === 0);
test('TMI à 11 % dans la deuxième tranche', () => proche(PF.fiscal.impotRevenu(20000, 1, 2025, 'Célibataire').tmi, 0.11));
test('TMI à 30 % au-delà de 29 579 €', () => proche(PF.fiscal.impotRevenu(40000, 1, 2025, 'Célibataire').tmi, 0.30));
test('IR positif au-delà', () => PF.fiscal.impotRevenu(60000, 1, 2025, 'Célibataire').impot_net > 3000);
test('abattement 10 % plancher', () => proche(PF.fiscal.abattement10(1000, 2025), 509));
test('abattement 10 % plafond', () => proche(PF.fiscal.abattement10(200000, 2025), 14555));
test('PFU 2026 = 31,4 %', () => proche(PF.fiscal.tauxPFU(2026), 0.314, 1e-9));
test('PFU 2025 = 30,0 %', () => proche(PF.fiscal.tauxPFU(2025), 0.30, 1e-9));
test('comparaison PFU / barème renvoie un choix', () => {
    const c = PF.fiscal.comparerPfuBareme(5000, 40000, 3, 2026, 'Marié(e) / Pacsé(e)');
    return (c.choix === 'PFU' || c.choix === 'Barème progressif') && c.pfu.total > 0;
});
test('frais kilométriques 20 000 km / 5 CV', () => proche(PF.fiscal.fraisKilometriques(20000, 5).montant, 20000 * 0.357 + 1395, 0.01));

console.log('\nRééquilibrage');
function fauxContexte() {
    const ctx = PF.portefeuille.contexteVide();
    ctx.actifs = [
        { ticker: 'IGLN.L', classe: 'or', deviseCotation: 'USD', poche: 'rv_physique', quantite: 100, prix: 40, valeurUsd: 4000, valeurEur: 3555, variationPct: 0.01 },
        { ticker: 'XDW0.L', classe: 'action_etf', deviseCotation: 'USD', poche: 'energie', quantite: 100, prix: 40, valeurUsd: 4000, valeurEur: 3555, variationPct: -0.01 },
        { ticker: 'FLXC.L', classe: 'action_etf', deviseCotation: 'USD', poche: 'asie', quantite: 100, prix: 40, valeurUsd: 4000, valeurEur: 3555, variationPct: 0 },
        { ticker: 'BTCUSDT', classe: 'crypto', deviseCotation: 'USD', poche: 'rv_numerique', quantite: 5, prix: 40, valeurUsd: 200, valeurEur: 178, variationPct: 0 },
        { ticker: 'XJSE.SW', classe: 'obligation_etf', deviseCotation: 'JPY', poche: 'jgb', quantite: 300, prix: 1, valeurUsd: 2000, valeurEur: 1778, variationPct: 0 }
    ];
    PF.portefeuille.agreger(ctx);
    return ctx;
}
test('agrégation : total investi en dollars', () => proche(fauxContexte().totalInvestiUsd, 14200));
test('agrégation : poids réels calculés', () => {
    const ctx = fauxContexte();
    return proche(ctx.etats.rv_physique.poidsReel, 4000 / 14200, 1e-9);
});
test('diagnostic : une poche hors bande au moins', () => {
    const d = PF.rebalance.diagnostiquer(fauxContexte());
    return d.ecarts.length === 5;
});
test('ordres générés dans le bon sens', () => {
    const d = PF.rebalance.diagnostiquer(fauxContexte());
    const g = PF.rebalance.genererOrdres(d.ecarts, 1);
    const achats = g.ordres.filter((o) => o.sens === 'achat');
    const ventes = g.ordres.filter((o) => o.sens === 'vente');
    return achats.length > 0 && ventes.length > 0;
});

console.log('\nChargement complet (faux réseau)');
PF.store.sauverReglages({ supabaseUrl: 'https://test.supabase.co', supabaseKey: 'cle-test' });

PF.portefeuille.charger().then((ctx) => {
    test('aucune erreur bloquante', () => ctx.erreurs.length === 0 || (console.log('    erreurs :', ctx.erreurs), false));
    test('transactions chargées', () => ctx.transactions.length === 3);
    test('position IGLN.L = 80 après la vente', () => proche(ctx.positions['IGLN.L'].quantite, 80, 1e-6));
    test('cours IGLN.L = 40,5', () => proche(ctx.actifs.find((a) => a.ticker === 'IGLN.L').prix, 40.5));
    test('variation IGLN.L ≈ +1,01 %', () => proche(ctx.actifs.find((a) => a.ticker === 'IGLN.L').variationPct, 1 / 0.99 - 1, 1e-6));
    test('précaution CHF rattachée', () => ctx.actifs.some((a) => a.ticker === 'CHF'));
    test('cash USD rattaché au compte courant', () => ctx.actifs.some((a) => a.ticker === 'USD' && a.poche === 'courant'));
    test('total investi > 0', () => ctx.totalInvestiUsd > 0);
    test('patrimoine = investi + précaution + courant', () =>
        proche(ctx.patrimoineTotalUsd, ctx.totalInvestiUsd + ctx.totalPrecautionUsd + ctx.totalCourantUsd, 1e-6));
    test('taux EUR/USD', () => proche(ctx.tauxEurUsd, 1.125));
    test('équivalent-or calculé', () => ctx.equivalentOrOz > 0);
    test('snapshots enrichis en dollars', () => ctx.snapshots.length >= 2 && ctx.snapshots[0].patrimoine_investi_usd > 0);
    test('capital investi propagé', () => ctx.snapshots.every((s) => s.capital_investi_usd > 0));
    test('série de performance construite', () => ctx.serie.dates.length >= 2);
    test('apports convertis en dollars', () => ctx.apports[0].montant_usd > 0);
    test('cession 2026 détectée', () => {
        return PF.fiscal.cessionsAnnee(ctx, 2026).then((r) => r.cessions.length === 1);
    });

    console.log('\n' + (echecs === 0 ? '✔ ' : '✘ ') + reussis + ' réussis, ' + echecs + ' échecs\n');
    process.exit(echecs === 0 ? 0 : 1);
}).catch((e) => {
    console.log('  ✗ chargement : ' + (e && e.stack ? e.stack : e));
    process.exit(1);
});
