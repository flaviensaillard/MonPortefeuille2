/* Vérification du moteur JavaScript hors Android.
   Les modules sont chargés tels quels dans Node, avec un faux transport réseau :
   on teste donc le même code que celui qui tourne dans la WebView. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js');
const FICHIERS = ['util.js', 'models.js', 'net.js', 'store.js', 'metrics.js',
    'portfolio.js', 'rebalance.js', 'ui.js', 'fiscal.js', 'views.js', 'ia.js'];

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

console.log('\nProgression depuis le snapshot nocturne');
const todayAvantTests = PF.util.todayISO;
PF.util.todayISO = () => '2026-10-07';
function contexteSnapshot(projections, dateSnapshot) {
    const c = PF.portefeuille.contexteVide();
    c.tauxEurUsd = 1.125;
    c.totalInvestiEur = 72529; c.totalInvestiUsd = 72529 * 1.125;
    c.patrimoineTotalEur = 82529; c.patrimoineTotalUsd = 82529 * 1.125;
    c.totalPrecautionEur = 10000; c.totalPrecautionUsd = 11250;
    c.snapshotsBruts = [{ date: dateSnapshot || '2026-10-07', patrimoine_investi_eur: 72226.23,
        patrimoine_total_eur: 82226.23, precaution_eur: 10000,
        cours_or_usd: 4000, equivalent_or_oz: 72226.23 * 1.125 / 4000 }];
    c.projections = projections || [];
    return c;
}
test('snapshot de la nuit conservé + direct séparé le même jour', () => {
    const c = contexteSnapshot();
    PF.portefeuille.enrichirHistoriquesUsd(c);
    proche(c.snapshots[0].patrimoine_investi_eur, 72226.23);
    if (c.snapshots.length !== 2 || !c.snapshots[1]._live) return false;
    const serie = PF.metrics.seriePerformance(c.snapshots, c.apports);
    const p = PF.metrics.progressionPeriode(serie, 'Progression journalière', c.totalInvestiUsd);
    proche(p.gain_marche_usd / c.tauxEurUsd, 302.77, 0.01);
    proche(p.twr_per, 302.77 / 72226.23, 1e-7);
    return p.valeurs.length === 2 && p.d0 === '2026-10-07' && p.d1 === '2026-10-07';
});
test('dernière référence pf2 prioritaire sur Projections', () => {
    const c = contexteSnapshot([{ Date: '07/10/2026', 'Actifs Stratégiques': 70000 * 1.125, 'Capital investi': 60000 }]);
    PF.portefeuille.enrichirHistoriquesUsd(c);
    proche(c.snapshots[0].patrimoine_investi_usd, 72226.23 * 1.125, 0.01);
    return c.snapshots.every(s => s.capital_investi_usd === 60000);
});
test('snapshot ancien : apport entre snapshot et direct neutralisé', () => {
    const c = contexteSnapshot([], '2026-10-05');
    c.apports = [{ date: '2026-10-06', montant_eur: 100, montant_usd: 112.5 }];
    PF.portefeuille.enrichirHistoriquesUsd(c);
    const serie = PF.metrics.seriePerformance(c.snapshots, c.apports);
    const p = PF.metrics.progressionPeriode(serie, 'Progression journalière', c.totalInvestiUsd);
    proche(p.gain_marche_usd / 1.125, 202.77, 0.01);
    proche(p.apports_periode_usd, 112.5);
    proche(c.snapshots[1].capital_investi_usd, 112.5);
    return p.d1 === '2026-10-07';
});
test('série brute : ne pas remplacer le dernier snapshot', () => {
    const serie = { dates: ['2026-10-06', '2026-10-07'], valeurs: [70084 * 1.125, 72226.23 * 1.125], flux: [0, 0] };
    const p = PF.metrics.progressionPeriode(serie, 'Progression journalière', 72529 * 1.125);
    proche(p.gain_marche_usd / 1.125, 302.77, 0.01);
    return serie.dates.length === 2 && serie.valeurs[1] === 72226.23 * 1.125;
});
test('apport du jour déjà dans le snapshot : pas de double comptage', () => {
    const c = contexteSnapshot();
    c.snapshotsBruts.unshift({ date: '2026-10-06', patrimoine_investi_eur: 70084, patrimoine_total_eur: 80084 });
    c.apports = [{ date: '2026-10-07', montant_eur: 100 }];
    PF.portefeuille.enrichirHistoriquesUsd(c);
    const serie = PF.metrics.seriePerformance(c.snapshots, c.apports);
    return JSON.stringify(serie.flux) === JSON.stringify([0, 112.5, 0]);
});
test('pas de cumul répété des apports sur le nouveau point live', () => {
    const c = contexteSnapshot();
    c.apports = [{ date: '2026-10-01', montant_eur: 100 }];
    PF.portefeuille.enrichirHistoriquesUsd(c);
    return c.snapshots.every(s => s.capital_investi_usd === 112.5);
});
test('direct absent : valeur historique intacte', () => {
    const c = contexteSnapshot();
    c.totalInvestiUsd = 0;
    PF.portefeuille.enrichirHistoriquesUsd(c);
    return c.snapshots.length === 1 && c.snapshots[0].patrimoine_investi_eur === 72226.23;
});
test('taux historique USD conservé distinct du taux en direct', () => {
    const c = contexteSnapshot();
    c.snapshotsBruts[0].equivalent_or_oz = 72226.23 * 1.12 / 4000;
    PF.portefeuille.enrichirHistoriquesUsd(c);
    const serie = PF.metrics.seriePerformance(c.snapshots, c.apports);
    const p = PF.metrics.progressionPeriode(serie, 'Progression journalière', c.totalInvestiUsd);
    proche(p.twr_per, (72529 * 1.125) / (72226.23 * 1.12) - 1, 1e-7);
});

console.log('\nCorrectif du 07/10 — transferts internes et sens des flux');
/* Contexte réel du 07/10/2026 : les snapshots portent l'once d'or et le cours,
   la valeur en dollars en découle (19,418299 oz x 4 185,10 $ = 81 267,52 $). */
function contexteOr(avecAchat) {
    const c = PF.portefeuille.contexteVide();
    c.tauxEurUsd = 1.125;
    c.totalInvestiEur = 72462; c.totalInvestiUsd = 80955;
    c.patrimoineTotalEur = 83310; c.patrimoineTotalUsd = 93110.52;
    c.totalPrecautionEur = 10000; c.totalPrecautionUsd = 11250;
    c.snapshotsBruts = [
        { date: '2026-10-06', patrimoine_investi_eur: 70115.82, patrimoine_total_eur: 80115.82,
          precaution_eur: 10000, cours_or_usd: 4158.9, equivalent_or_oz: 18.925403,
          cree_le: '2026-10-06T18:05:00Z' },
        { date: '2026-10-07', patrimoine_investi_eur: 72226.63, patrimoine_total_eur: 82226.63,
          precaution_eur: 10000, cours_or_usd: 4185.1, equivalent_or_oz: 19.418299,
          cree_le: '2026-10-07T18:05:00Z' }
    ];
    c.transactions = avecAchat ? [avecAchat] : [];
    return c;
}
const ACHAT_06 = { ticker: 'FLXC.L', type: 'achat', date: '2026-10-06',
    cree_le: '2026-10-06T21:30:00Z', montantNetUsd: 1943.91, montantNetEur: 1727.92 };
const ACHAT_07 = { ticker: 'FLXC.L', type: 'achat', date: '2026-10-07',
    cree_le: '2026-10-07T20:30:00Z', montantNetUsd: 1943.91, montantNetEur: 1727.92 };

test('snapshots du 06 et du 07 : la bonne référence est le 07/10', () => {
    const c = contexteOr(ACHAT_06);
    PF.portefeuille.enrichirHistoriquesUsd(c);
    proche(c.snapshots[0].patrimoine_investi_usd, 78708.86, 0.02);
    proche(c.snapshots[1].patrimoine_investi_usd, 81267.52, 0.02);
    return c.snapshots[2]._live === true && c.snapshots.length === 3;
});
test('journée du 07/10 : -0,38 % et non +2,85 %', () => {
    const c = contexteOr(ACHAT_06);
    PF.portefeuille.enrichirHistoriquesUsd(c);
    const serie = PF.metrics.seriePerformance(c.snapshots, c.apports, c.fluxTitresFinal);
    const p = PF.metrics.progressionPeriode(serie, 'Progression journalière', c.totalInvestiUsd);
    proche(p.gain_marche_usd, -312.52, 0.02);
    proche(p.twr_per, -312.52 / 81267.52, 1e-6);
    return p.d0 === '2026-10-07' && p.d1 === '2026-10-07';
});
test('achat enregistré AVANT la référence : aucun double comptage', () => {
    const c = contexteOr(ACHAT_06);
    PF.portefeuille.enrichirHistoriquesUsd(c);
    proche(c.fluxTitresFinal, 0);
    return true;
});
test('achat enregistré APRÈS la référence : apport interne, gain marché seul', () => {
    const c = contexteOr(ACHAT_07);
    c.totalInvestiUsd = 80955 + 1943.91; c.totalInvestiEur = 72462 + 1727.92;
    PF.portefeuille.enrichirHistoriquesUsd(c);
    proche(c.fluxTitresFinal, 1943.91, 0.02);
    const serie = PF.metrics.seriePerformance(c.snapshots, c.apports, c.fluxTitresFinal);
    // Comme la vue : le périmètre « investi » reçoit le flux des titres, le total non.
    const serieInv = { dates: serie.dates, valeurs: serie.valeurs,
        flux: PF.metrics.fluxPerimetre(serie, 'investi'), lignes: serie.lignes };
    const p = PF.metrics.progressionPeriode(serieInv, 'Progression journalière', c.totalInvestiUsd);
    proche(p.apports_periode_usd, 1943.91, 0.02);
    proche(p.gain_marche_usd, -312.52, 0.05);
    return true;
});
test('le patrimoine total ignore le transfert interne', () => {
    const c = contexteOr(ACHAT_07);
    PF.portefeuille.enrichirHistoriquesUsd(c);
    const serie = PF.metrics.seriePerformance(c.snapshots, c.apports, c.fluxTitresFinal);
    const fluxTotal = PF.metrics.fluxPerimetre(serie, 'total');
    const fluxInvesti = PF.metrics.fluxPerimetre(serie, 'investi');
    proche(fluxInvesti[fluxInvesti.length - 1] - fluxTotal[fluxTotal.length - 1], 1943.91, 0.02);
    return fluxTotal[fluxTotal.length - 1] === serie.flux[serie.flux.length - 1];
});
test('vente après la référence : le flux se déduit', () => {
    const c = contexteOr({ ticker: 'FLXC.L', type: 'vente', date: '2026-10-07',
        cree_le: '2026-10-07T20:30:00Z', montantNetUsd: 500, montantNetEur: 444.44 });
    PF.portefeuille.enrichirHistoriquesUsd(c);
    proche(c.fluxTitresFinal, -500, 0.02);
    return true;
});
test('retrait : montant stocké positif, déduit du capital', () => {
    const c = contexteOr(null);
    c.apports = [{ date: '2026-10-07', sens: 'retrait', montant_eur: 1000, montant_usd: 1125 }];
    PF.portefeuille.enrichirHistoriquesUsd(c);
    const serie = PF.metrics.seriePerformance(c.snapshots, c.apports, 0);
    return JSON.stringify(serie.flux) === JSON.stringify([0, -1125, 0]);
});
test('apport : montant stocké positif, ajouté au capital', () => {
    const c = contexteOr(null);
    c.apports = [{ date: '2026-10-07', sens: 'apport', montant_eur: 1000, montant_usd: 1125 }];
    PF.portefeuille.enrichirHistoriquesUsd(c);
    const serie = PF.metrics.seriePerformance(c.snapshots, c.apports, 0);
    return JSON.stringify(serie.flux) === JSON.stringify([0, 1125, 0]);
});

PF.util.todayISO = todayAvantTests;

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

    console.log('\nAssistant IA — horizon et contexte envoyés');
    test('l’horizon de retraite part avec chaque question', () => {
        const h = PF.ia.horizonPourIA();
        return h.anneeDepartRetraite === 2055 && h.anneesRestantes === 2055 - new Date().getFullYear();
    });
    test('l’objectif de retraite est transmis au service', () => /retraite/i.test(PF.ia.horizonPourIA().objectif));
    test('le contexte du portefeuille porte l’horizon', () => {
        const c = PF.ia.contextePourIA(ctx);
        return c.horizon.anneeDepartRetraite === 2055 && c.poches.length > 0;
    });
    test('la recherche extérieure est active par défaut', () => PF.ia.internet() === true);
    test('elle se coupe et se remet d’un geste', () => {
        PF.ia.internet(false);
        const coupe = PF.ia.internet();
        PF.ia.internet(true);
        return coupe === false && PF.ia.internet() === true;
    });


    // --- Écarts avec le courtier : cotation du moment, séance affichée
    console.log('\nÉcarts avec le courtier : cotation du moment et séance affichée');
    test('une clôture plus ancienne est annoncée sur la fiche', () => {
        const m = PF.vues.mentionSeance({ variationPct: -0.0135, variationOrigine: 'jour',
            seanceVariation: '2026-10-06' });
        return m.indexOf('clôture du 06/10/2026') >= 0;
    });
    test('la séance du jour n’est pas répétée sur la fiche', () =>
        PF.vues.mentionSeance({ variationPct: -0.008, variationOrigine: 'jour',
            seanceVariation: '2026-10-07' }) === '');
    test('un chiffre venu de l’enregistrement le dit', () =>
        PF.vues.mentionSeance({ variationOrigine: 'enregistrement' }).indexOf('enregistrement') >= 0);
    test('le repère affiche sa date et son heure', () => {
        const contexteRef = { serie: { lignes: [
            { ligne: { date: '2026-10-06', cree_le: '2026-10-06T00:58:00Z' } },
            { ligne: { date: '2026-10-07', cree_le: '2026-10-07T00:58:00Z' } },
            { ligne: { date: '2026-10-07', _live: true } }
        ] } };
        const txt = PF.vues.dernierEnregistrement(contexteRef, { d0: '2026-10-07' });
        // L'heure est affichée en heure locale : on vérifie la date et la forme.
        return txt.indexOf('07/10/2026') >= 0 && /\d+h\d\d/.test(txt);
    });

    // La cotation du moment (méta Yahoo) doit primer sur la dernière clôture de
    // la série : celle-ci peut s'arrêter à la séance précédente (IGLN.L, XDW0.L,
    // FLXC.L), et la ligne semblait alors n'avoir pas bougé.
    const T_META = Date.UTC(2026, 9, 7, 14, 30) / 1000;
    PF.net.setTransport((method, url, entetes, corps) => {
        if (url.indexOf('/v8/finance/chart/') >= 0) {
            return { ok: true, status: 200, body: JSON.stringify({ chart: { result: [{
                meta: { currency: 'USD', regularMarketPrice: 99, chartPreviousClose: 100,
                    regularMarketTime: T_META },
                timestamp: [T_META - 3 * 86400, T_META - 2 * 86400],
                indicators: { quote: [{ close: [80.5, 80.6] }] } }], error: null } }) };
        }
        return fauxTransport(method, url, entetes, corps);
    });
    PF.net.cours('META.TEST').then((prix) => {
        test('la cotation du moment prime sur la dernière clôture', () => proche(prix, 99));
        test('la variation du jour est calculée sur cette cotation', () =>
            proche(PF.net.variationRecente('META.TEST'), -0.01));
        test('la séance comparée vient du méta', () =>
            PF.net.variationSeance('META.TEST') === U.iso(new Date(T_META * 1000)));
        PF.net.setTransport(fauxTransport);
        console.log('\n' + (echecs === 0 ? '✔ ' : '✘ ') + reussis + ' réussis, ' + echecs + ' échecs\n');
        process.exit(echecs === 0 ? 0 : 1);
    }).catch((e) => {
        console.log('  ✗ méta Yahoo : ' + (e && e.stack ? e.stack : e));
        process.exit(1);
    });
}).catch((e) => {
    console.log('  ✗ chargement : ' + (e && e.stack ? e.stack : e));
    process.exit(1);
});
