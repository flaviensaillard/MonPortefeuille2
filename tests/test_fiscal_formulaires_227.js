/* Formulaires fiscaux 2.2.7 — sources DGFiP revenus 2025, hors réseau.
   Le guide ne doit PAS fabriquer un 2074 « ligne 905 = PV, 913 = MV » ; le PDF
   11905*26 place les cessions calculées par le contribuable en 903 col. PV/MV,
   la ligne 905 traite les instruments à terme et 913 est le total du cadre.
   Chaque vente a SA date ; 516−517=518, 521+522=523, 518−523=524.
   PDF 2086 16043*07 : 215,216,222 et 51/52 doivent être visibles ; 51/52
   sont du FOYER et ne peuvent pas être certifiées par un seul portefeuille. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const ctx = vm.createContext({
    Date, Number, String, Object, Array, Math, JSON, Promise, Error, RegExp,
    PF: { modele: { classeDe: ticker => ticker === 'BTC' || ticker === 'ETH' ? 'crypto' : 'action_etf' },
        ui: { h: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;') },
        store: { reglages: () => ({}) } }
});
ctx.globalThis = ctx;
for (const f of ['util.js', 'fiscal.js', 'fiscal_formulaires_dgfip.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
const F = ctx.PF.fiscal, G = ctx.PF.fiscalFormulairesDgfip;

assert.equal(G.structure(2025).structureVerifiee, true);
assert.equal(G.structure(2026).structureVerifiee, false);
assert.equal(G.structure(2038).structureVerifiee, false);
assert.match(G.structure(2038).avertissement, /REPÈRES des revenus 2025/);
assert.equal(G.structure(2038).sources['2074'],
    'https://www.impots.gouv.fr/sites/default/files/formulaires/2074/2026/2074_5497.pdf');
assert.equal(G.structure(2038).sources['2086'],
    'https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf');

// Deux achats de titres (frais d'acquisition 10 + 20) puis DEUX ventes à dates,
// prix et frais distincts. L'agrégation annuelle sous la date fictive 31/12
// serait immédiatement détectée par ces assertions.
const titres = [
    { ticker: 'X', type: 'achat', date: '2025-01-10', quantite: 10, cours: 100, frais: 10, devise: 'EUR' },
    { ticker: 'X', type: 'achat', date: '2025-02-10', quantite: 10, cours: 200, frais: 20, devise: 'EUR' },
    { ticker: 'X', type: 'vente', date: '2025-06-10', quantite: 5, cours: 250, frais: 5, devise: 'EUR' },
    { ticker: 'X', type: 'vente', date: '2025-09-20', quantite: 5, cours: 260, frais: 10, devise: 'EUR' }
];
const t = F.detail2074(titres, 2025, {});
assert.equal(t.operations.length, 2);
assert.equal(t.par_actif.length, 2, 'une colonne 510 par cession, non par ticker');
assert.equal(t.par_actif[0].ligne_512, '2025-06-10');
assert.equal(t.par_actif[1].ligne_512, '2025-09-20');
assert.equal(t.par_actif[0].ligne_516, 1250);
assert.equal(t.par_actif[0].ligne_517, 5);
assert.equal(t.par_actif[0].ligne_518, 1245);
assert.equal(t.par_actif[0].ligne_521, 750);
assert.equal(t.par_actif[0].ligne_522, 7.5);
assert.equal(t.par_actif[0].ligne_523, 757.5);
assert.equal(t.par_actif[0].ligne_524, 487.5);
assert.equal(t.par_actif[1].ligne_516, 1300);
assert.equal(t.par_actif[1].ligne_517, 10);
assert.equal(t.par_actif[1].ligne_518, 1290);
assert.equal(t.par_actif[1].ligne_522, 7.5);
assert.equal(t.par_actif[1].ligne_524, 532.5);
assert.equal(t.ligne_903_pv, 1020);
assert.equal(t.ligne_903_mv, 0);
assert.equal(t.case_3vg, 1020);
assert.equal(t.case_3vh, 0);
assert.equal(t.ligne_905, undefined, 'ancienne clé mensongère supprimée');
assert.equal(t.ligne_913, undefined, 'ancienne clé mensongère supprimée');
assert.equal(t.abattementsNonVerifies, false, 'achats connus après 2018');
assert.equal(t.cadre_11.reduce((s, l) => s + l.col_h, 0), 1020);

const tauxEur = {};
const cryptoTxs = [
    { ticker: 'BTC', type: 'achat', date: '2025-01-01', quantite: 2, cours: 500, frais: 0, devise: 'EUR' },
    { ticker: 'ETH', type: 'achat', date: '2025-01-02', quantite: 1, cours: 500, frais: 0, devise: 'EUR' },
    { ticker: 'BTC', type: 'vente', date: '2025-08-01', quantite: 1, cours: 320, frais: 20, devise: 'EUR' }
];
const c = F.detail2086(cryptoTxs, 2025, { 'USD|2025-08-01': 1 }, { 'ETH|2025-08-01': 500 });
assert.equal(c.cessions[0].ligne_215, 300);
assert.equal(c.cessions[0].ligne_216, null, 'aucune preuve que les soultes valent 0');
assert.equal(c.cessions[0].ligne_222, null);
assert.equal(c.cessions[0].ligne_217, 320);
assert.equal(c.cessions[0].ligne_218, 300);
assert.equal(c.cessions[0].ligne_224, -121.05);
assert.equal(c.total_cessions_218, 300);

const html = G.render(2025, { sim: { annee: 2025, case_1aj: 30000, case_1ak: null, case_1bj: 0, case_1bk: null,
    couple: false, options_fiscales: { assiette_2op: 1020, assiette_3cn: 0 }, cocher_2op: false },
    t2074: t, t2086: c, reglages: { interetsEtrangers: 300, paysEtranger: 'Suisse' },
    comptes: ['Swissquote <b>non fiable</b>'] });
for (const form of ['2042', '2042 C', '2047', '2074', '2074-CMV', '2086', '3916 / 3916-bis'])
    assert.ok(html.includes('<h3>' + form + ' · revenus 2025</h3>'), form);
for (const n of ['511', '512', '514', '515', '516', '517', '518', '520', '521', '522', '523', '524',
    '903 / PV', '903 / MV', '913 / total', '1133 / 1 · A', '1164', '211', '212', '213', '214',
    '215', '216', '217', '218', '220', '221', '222', '223', '224', '51', '52',
    '2TR', '2CG', '2BH', '2DF', '6DE', '2OP', '3VG', '3VH', '3SG', '3AN', '3BN', '3CN', '8UU'])
    assert.ok(html.includes('<b>' + n + '</b>'), 'repère utile absent : ' + n);
assert.match(html, /913 existe : c’est le total du cadre/);
assert.doesNotMatch(html, /Ligne 905 — total des plus-values|Ligne 913 — total des moins-values/);
assert.match(html, /Chaque cession occupe une colonne/i);
assert.match(html, /1 245,00 €/);
assert.match(html, /511/);
assert.match(html, /part connue seulement/);
assert.match(html, /3AN.*À compléter au niveau du foyer/s);
assert.match(html, /SWISSQUOTE|Swissquote/);
assert.doesNotMatch(html, /<b>non fiable<\/b>/, 'les noms de comptes doivent être échappés');
assert.match(html, /(?:&lt;|&amp;lt;)b(?:&gt;|&amp;gt;)non fiable/,
    'le HTML utilisateur doit être échappé, jamais interprété');

const en2029 = txs => txs.map(tx => ({ ...tx, date: tx.date.replace('2025', '2029') }));
const t29 = F.detail2074(en2029(titres), 2029, {});
const c29 = F.detail2086(en2029(cryptoTxs), 2029, { 'USD|2029-08-01': 1 },
    { 'ETH|2029-08-01': 500 });
const futur = G.render(2029, { sim: { case_1aj: 9999 }, t2074: t29, t2086: c29,
    reglages: { interetsEtrangers: 9999 }, comptes: [] });
assert.match(futur, /imprimés des revenus 2029.*NON vérifiées|imprimés des revenus 2029/s);
assert.match(futur, /REPÈRES des revenus 2025/);
assert.match(futur, /NON reportable avant publication/);
const mauvaisMillesime = G.render(2029, { t2074: t, t2086: c });
assert.doesNotMatch(mauvaisMillesime, /Calcul des seules écritures connues/,
    'une estimation 2025 ne doit pas apparaître parmi les revenus 2029');
assert.doesNotMatch(futur, /9 999 €/, 'aucun faux montant fiscal 2029 issu de la 2025');
assert.doesNotMatch(futur, /<b class="up">.*€<\/b>/, 'aucune case future ne devient officielle');
const futurSansCession = G.render(2030, { t2074: { operations: [], bilan_net: 0 },
    t2086: { cessions: [], plus_value_globale_224: 0 } });
assert.doesNotMatch(futurSansCession, /Calcul des seules écritures connues/,
    'une année future sans cession ne doit pas annoncer une estimation zéro');

// Le garde-fou 2026 reste strict pour le calcul de l'IR, mais le guide existe.
assert.equal(F.annéeSimulable(2026), false);
const date2027 = class extends Date { constructor(...a) { super(...(a.length ? a : ['2027-04-15T12:00:00Z'])); }
    static now() { return Date.parse('2027-04-15T12:00:00Z'); } };
const ctxFuture = vm.createContext({ PF: { store: { reglages: () => ({}) },
    ui: { h: s => String(s) }, util: {}, modele: { classeDe: () => 'action_etf' } },
    Date: date2027, Number, String, Object, Array, Math, JSON, Promise });
ctxFuture.globalThis = ctxFuture;
for (const f of ['util.js', 'fiscal.js', 'fiscal_formulaires_dgfip.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctxFuture);
const ecran = ctxFuture.PF.fiscal.vue({ transactions: [], transactionsChargees: false });
assert.match(ecran, /Revenus 2026 : calcul fiscal indisponible/);
assert.match(ecran, /Vos formulaires de déclaration 2027/);
assert.match(ecran, /fiscAnneeGuide/);
assert.match(ecran, /data-fisc="annee-guide"/);
assert.match(ecran, /REPÈRES des revenus 2025/);
assert.doesNotMatch(ecran, /<h3>2074 · revenus 2026.*<b class="up">/s,
    'aucune valeur 2074 future avec pastille de valeur officielle');

// Parcours réel du sélecteur : une année hors des puces (2035) peut être choisie
// sans barème inventé ; le guide de ses formulaires s'affiche malgré le refus IR.
let clickHandler, rendus = 0;
const vueDOM = { dataset: {}, addEventListener: (_t, fn) => { clickHandler = fn; },
    querySelector: id => id === '#fiscAnneeGuide' ? { value: '2035' } : null };
ctxFuture.document = { getElementById: id => id === 'view' ? vueDOM : null };
ctxFuture.PF.app = { rendre: () => { rendus++; } };
ctxFuture.PF.fiscal.attacher();
const btn = { closest: sel => sel === '[data-fisc="annee-guide"]' ? btn : null };
clickHandler({ target: btn });
assert.equal(rendus, 1, 'le sélecteur a déclenché un nouveau rendu');
const ecran2035 = ctxFuture.PF.fiscal.vue({ transactions: [], transactionsChargees: false });
assert.match(ecran2035, /Revenus 2035 : calcul fiscal indisponible/);
assert.match(ecran2035, /Vos formulaires de déclaration 2036/);
assert.match(ecran2035, /REPÈRES des revenus 2025/);
assert.match(ecran2035, /numéros ci-dessous sont les REPÈRES des revenus 2025/);

console.log('Guide DGFiP 2.2.7 : 7 imprimés, calculs 2074/2086, garde du foyer et futur refusés sans source OK');
