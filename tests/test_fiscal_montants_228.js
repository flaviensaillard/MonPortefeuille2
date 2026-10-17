/* Régression 2.2.8 : montants VUS sur téléphone, par titre ET par case.
   Hors réseau / sans données personnelles. Un refus d'IR (PS d'intérêts inconnus)
   ou de crypto (cours manquant) ne doit plus effacer les titres calculables. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const js = path.join(__dirname, '../app/src/main/assets/www/js');

const achatsVentes = [
    { ticker: 'X', type: 'achat', date: '2025-01-10', quantite: 10, cours: 100, frais: 10, devise: 'EUR' },
    { ticker: 'X', type: 'achat', date: '2025-02-10', quantite: 10, cours: 200, frais: 20, devise: 'EUR' },
    { ticker: 'Y', type: 'achat', date: '2025-03-01', quantite: 1, cours: 300, frais: 0, devise: 'EUR' },
    { ticker: 'X', type: 'vente', date: '2025-06-10', quantite: 5, cours: 250, frais: 5, devise: 'EUR' },
    { ticker: 'Y', type: 'vente', date: '2025-06-15', quantite: 1, cours: 250, frais: 0, devise: 'EUR' },
    { ticker: 'X', type: 'vente', date: '2025-09-20', quantite: 5, cours: 260, frais: 10, devise: 'EUR' }
];
const crypto = [
    { ticker: 'BTC', type: 'achat', date: '2025-01-01', quantite: 2, cours: 500, frais: 0, devise: 'EUR' },
    { ticker: 'ETH', type: 'achat', date: '2025-01-02', quantite: 1, cours: 500, frais: 0, devise: 'EUR' },
    { ticker: 'BTC', type: 'vente', date: '2025-08-01', quantite: 1, cours: 320, frais: 20, devise: 'EUR' }
];

// Faux DOM minimal : les attributs open sont réellement relus avant chaque
// remplacement innerHTML, puis reconstruits depuis le HTML calculé.
class FormContainer {
    constructor() {
        this.attrs = { 'data-annee': '2025' };
        this.states = {}; this.cessionStates = {}; this._html = '';
    }
    getAttribute(k) { return this.attrs[k]; }
    querySelectorAll(sel) {
        assert.ok(['[data-fisc-imprime]', '[data-fisc-cession]'].includes(sel));
        const key = sel === '[data-fisc-imprime]' ? 'data-fisc-imprime' : 'data-fisc-cession';
        const states = key === 'data-fisc-imprime' ? this.states : this.cessionStates;
        return Object.entries(states).map(([nom, open]) => ({
            getAttribute: k => k === key ? nom : null, open
        }));
    }
    set innerHTML(html) {
        this._html = html;
        this.states = {}; this.cessionStates = {};
        const formes = /<details class="card fisc-imprime" data-fisc-imprime="([^"]+)"( open)?>/g;
        const ventes = /<details class="fisc-cession" data-fisc-cession="([^"]+)"( open)?>/g;
        let m;
        while ((m = formes.exec(html))) this.states[m[1]] = !!m[2];
        while ((m = ventes.exec(html))) this.cessionStates[m[1]] = !!m[2];
    }
    get innerHTML() { return this._html; }
}
const f = new FormContainer(), g = { innerHTML: '', querySelectorAll: () => [] };
const vueDOM = { dataset: {}, addEventListener: () => {} };
const reglages = {
    statutFiscal: 'Célibataire', partsFiscales: 1, salaireNetImposable1: 30000,
    salaireNetImposable2: 0, utiliserFraisReels1: false, fraisKm1: 0, cvFiscal1: 5,
    joursRepas1: 0, vehiculeElectrique1: false, interetsEtrangers: 300,
    paysEtranger: 'Suisse', interetsPs2025: null
};
const doc = {
    getElementById: id => ({ fiscFormulaires: f, fiscBilan: g, view: vueDOM })[id] || null,
    querySelector: () => null, querySelectorAll: () => []
};
const ctx = vm.createContext({
    Date, Number, String, Object, Array, Math, JSON, Promise, Error, RegExp, isFinite,
    document: doc,
    PF: {
        store: { reglages: () => reglages, sauverReglages: () => {} },
        modele: { classeDe: t => ['BTC', 'ETH'].includes(t) ? 'crypto' : 'action_etf' },
        portefeuille: { erreurVenteExcedentaire: () => null },
        net: { taux: async () => 1, cours: async () => 500,
            auth: { utilisateur: () => null } }
    }
});
ctx.globalThis = ctx;
for (const name of ['util.js', 'ui.js', 'fiscal.js', 'fiscal_formulaires_dgfip.js']) {
    vm.runInContext(fs.readFileSync(path.join(js, name), 'utf8'), ctx, { filename: name });
}
const F = ctx.PF.fiscal, G = ctx.PF.fiscalFormulairesDgfip;
const donnees = { transactions: achatsVentes.concat(crypto), transactionsChargees: true };
const tick = () => new Promise(resolve => setImmediate(resolve));
function forme(html, nom) {
    const start = html.indexOf('data-fisc-imprime="' + nom + '"');
    assert.ok(start !== -1, 'formulaire absent : ' + nom);
    const next = html.indexOf('<details class="card fisc-imprime"', start + 1);
    return html.slice(start, next === -1 ? undefined : next);
}

(async () => {
    // Le rendu initial affiche déjà les salaires/intérêts connus ; les ventes
    // arrivent ensuite, même si le précompte inconnu interdit le bilan d'IR.
    const initial = F.vue(donnees);
    assert.match(initial, /<details class="card fisc-imprime" data-fisc-imprime="2074">/);
    assert.match(initial, /<b>2TR<\/b>[\s\S]*?300 €/, 'intérêts saisis visibles avant la lecture des ventes');
    f.states['2074'] = true; // ouverture pendant le calcul asynchrone
    await tick();
    assert.match(f.innerHTML, /Simulation d’impôt du foyer indisponible : Indiquez si les prélèvements sociaux/);
    assert.match(f.innerHTML, /Vos chiffres dans l’application · revenus 2025/);
    assert.doesNotMatch(f.innerHTML, /À compléter depuis vos justificatifs/);
    assert.match(f.innerHTML, /<b>2074 · 903\/PV<\/b>[\s\S]*?1 020,00 €/);
    assert.match(g.innerHTML, /Impôt du foyer indisponible/);
    assert.equal(f.states['2074'], true, 'la 2074 ouverte ne se referme pas après le calcul');
    assert.equal(Object.keys(f.states).length, 7, 'sept imprimés vraiment repliables');
    assert.match(forme(f.innerHTML, '2074'), /X · 2 cession\(s\) · résultat net 1 020,00 €/);
    assert.match(forme(f.innerHTML, '2074'), /Y · 1 cession\(s\) · résultat net -50,00 €/);
    assert.match(forme(f.innerHTML, '2074'), /<b>903 \/ PV<\/b>[\s\S]*?1 020,00 €/);
    assert.match(forme(f.innerHTML, '2074'), /<b>903 \/ MV<\/b>[\s\S]*?50,00 €/);
    assert.match(forme(f.innerHTML, '2074'), /<b>1133 \/ 1 · A<\/b>[\s\S]*?487,50 €/);
    assert.match(forme(f.innerHTML, '2042 C'), /<b>3VG<\/b>[\s\S]*?970 €/);
    assert.match(forme(f.innerHTML, '2042'), /<b>1AJ<\/b>[\s\S]*?30 000 €/);
    assert.match(forme(f.innerHTML, '2042'), /<b>2TR<\/b>[\s\S]*?300 €/);
    assert.match(forme(f.innerHTML, '2086'), /BTC · 1 cession\(s\) · résultat estimé -121,05 €/);
    assert.match(forme(f.innerHTML, '2086'), /Calcul \(hors case\)[\s\S]*?-121,05 €/);
    assert.match(forme(f.innerHTML, '2086'), /<b>224<\/b>[\s\S]*?-121,05 €/);
    assert.match(forme(f.innerHTML, '2086'), /<b>52<\/b>[\s\S]*?-121,05 €/);
    assert.match(forme(f.innerHTML, '2086'), /<b>51<\/b>[\s\S]*?300,00 €/);
    assert.match(forme(f.innerHTML, '2086'), /216\/222.*l’application ne les invente pas/);
    const sous305 = F.detail2086([
        { ticker: 'BTC', type: 'achat', date: '2025-02-01', quantite: 1, cours: 100, frais: 0, devise: 'EUR' },
        { ticker: 'BTC', type: 'vente', date: '2025-03-01', quantite: 1, cours: 200, frais: 0, devise: 'EUR' }
    ], 2025, {}, {});
    assert.equal(sous305.plus_value_globale_224, 100);
    assert.equal(sous305.case_3an, 0, 'le seuil porte sur les cessions de tout le foyer');
    const caseCrypto = forme(G.render(2025, { t2086: sous305 }), '2042 C');
    assert.match(caseCrypto, /<b>3AN<\/b>[\s\S]*?<b class="dim">0 €<\/b>/);
    assert.match(caseCrypto, /224 estimée : 100,00 €/);
    assert.doesNotMatch(caseCrypto, /<b>3AN<\/b>[\s\S]*?<b class="up">100 €/s,
        'un gain 224 sous le seuil ne devient pas une 3AN prête à saisir');
    assert.match(forme(f.innerHTML, '2042'), /2CG, 2BH et 2DF[\s\S]*?6DE/);
    assert.doesNotMatch(forme(f.innerHTML, '2042'), /<b>6DE<\/b>[\s\S]*?<b class="up">0 €/,
        'les données du foyer inconnues ne sont pas certifiées à zéro');
    assert.ok(Object.keys(f.cessionStates).length >= 4, 'ventes repliées, montants en tête');
    assert.ok(Object.values(f.cessionStates).every(v => !v));
    f.cessionStates['2074|X|2025-06-10|0'] = true;

    // Repli manuel persisté après nouveau rendu (PS connus). Le total du
    // portefeuille ne change pas ; seul l'arbitrage IR devient disponible.
    f.states['2074'] = false;
    reglages.interetsPs2025 = 'non';
    F.vue(donnees);
    await tick();
    assert.equal(f.states['2074'], false, 'la 2074 repliée par l’utilisateur le reste');
    assert.equal(f.cessionStates['2074|X|2025-06-10|0'], true,
        'une vente ouverte reste ouverte après un recalcul de la même année');
    assert.doesNotMatch(g.innerHTML, /Impôt du foyer indisponible/);
    assert.match(forme(f.innerHTML, '2074'), /903 \/ PV/);

    // Le cours crypto absent/rejeté bloque la 2086, PAS les titres et leurs
    // cases 3VG/903. Un zéro ou un 224 partiel ne doit jamais être inventé.
    ctx.PF.net.cours = () => Promise.reject(new Error('flux des cours indisponible'));
    F.vue(donnees);
    await tick();
    assert.match(forme(f.innerHTML, '2074'), /903 \/ PV[\s\S]*?1 020,00 €/);
    assert.match(forme(f.innerHTML, '2042 C'), /<b>3VG<\/b>[\s\S]*?970 €/);
    assert.match(forme(f.innerHTML, '2086'), /Crypto-actifs non chiffrables/);
    assert.doesNotMatch(forme(f.innerHTML, '2086'), /<b>224<\/b>[\s\S]*?<b class="up">.*?€<\/b>/s);
    assert.match(g.innerHTML, /Bilan non calculé/);

    // Une vente excédentaire de titres ne laisse pas un total 903 partiel
    // présenté comme reportable ; la 2086, si complète, reste consultable.
    const position = ctx.PF.portefeuille;
    position.erreurVenteExcedentaire = (_, tx) => tx.ticker === 'Y' && tx.type === 'vente'
        ? 'Y : vente au-delà de la position' : null;
    ctx.PF.net.cours = async () => 500;
    const exclu = await F.bilanCessions(donnees, 2025);
    assert.ok(exclu.t2074.indisponible.length, 'une vente écartée rend 903 incomplet');
    assert.equal(exclu.t2074.ligne_903_pv, 0, 'aucun gain partiel n’est vendu comme total 903');
    assert.equal(exclu.t2086.cessions.length, 1, 'crypto indépendante toujours calculée');
    const prudence = G.render(2025, { t2074: exclu.t2074, t2086: exclu.t2086 });
    assert.match(forme(prudence, '2074'), /Y · position de vente non justifiée/);
    assert.doesNotMatch(forme(prudence, '2074'), /<b>903 \/ PV<\/b>[\s\S]*?<b class="up">.*?€<\/b>/s);
    assert.match(forme(prudence, '2086'), /-121,05 €/);
    position.erreurVenteExcedentaire = () => null;

    // Deux cessions du MÊME titre qui se compensent : le total par ticker
    // (30 €) n'est jamais substitué à 903/PV=50 € et 903/MV=20 €.
    const opposees = [
        { ticker: 'A', type: 'achat', date: '2025-01-01', quantite: 2, cours: 100, frais: 0, devise: 'EUR' },
        { ticker: 'A', type: 'vente', date: '2025-02-01', quantite: 1, cours: 150, frais: 0, devise: 'EUR' },
        { ticker: 'A', type: 'vente', date: '2025-03-01', quantite: 1, cours: 80, frais: 0, devise: 'EUR' }
    ];
    const compense = F.detail2074(opposees, 2025, {});
    const extrait = forme(G.render(2025, { t2074: compense }), '2074');
    assert.equal(compense.ligne_903_pv, 50);
    assert.equal(compense.ligne_903_mv, 20);
    assert.match(extrait, /A · 2 cession\(s\) · résultat net 30,00 €/);
    assert.match(extrait, /Contribution 903\/PV 50,00 € · 903\/MV 20,00 €/);

    // Un achat de titre en CHF sans change connu interdit 903, mais la crypto
    // EUR reste visible par cession et dans son total connu 224.
    ctx.PF.net.taux = async devise => {
        if (devise === 'CHF') throw new Error('change CHF indisponible');
        return 1;
    };
    const titresCHF = achatsVentes.map((tx, i) => i === 0 ? { ...tx, devise: 'CHF' } : tx);
    const changeManquant = await F.bilanCessions({ transactions: titresCHF.concat(crypto) }, 2025);
    assert.ok(changeManquant.t2074.indisponible.length);
    assert.equal(changeManquant.t2086.cessions.length, 1);
    const independants = G.render(2025, { t2074: changeManquant.t2074, t2086: changeManquant.t2086 });
    assert.match(forme(independants, '2074'), /X · CHF/);
    assert.match(forme(independants, '2086'), /-121,05 €/);
    assert.doesNotMatch(forme(independants, '2074'), /<b>903 \/ PV<\/b>[\s\S]*?<b class="up">.*?€<\/b>/s);
    ctx.PF.net.taux = async () => 1;

    // Une vieille réponse FX ne doit jamais remplacer une vue plus récente,
    // même pour la même année (actualisation / changement de compte).
    let liberer;
    ctx.PF.net.taux = () => new Promise(resolve => { liberer = resolve; });
    F.vue({ transactions: achatsVentes.concat([{
        ticker: 'VIEUX', type: 'achat', date: '2025-01-03', quantite: 1, cours: 1, devise: 'USD'
    }]), transactionsChargees: true });
    await tick(); // l'ancien taux est maintenant en attente
    assert.equal(typeof liberer, 'function');
    F.vue({ transactions: achatsVentes, transactionsChargees: true });
    await tick();
    const nouveau = f.innerHTML;
    liberer(1);
    await tick();
    assert.equal(f.innerHTML, nouveau, 'une réponse ancienne ne doit pas injecter ses montants');

    // Les imprimés futurs restent une maquette, mais les montants PAR TITRE
    // connus peuvent être affichés séparément comme estimation non reportable.
    const t = F.detail2074(achatsVentes, 2025, {});
    assert.doesNotMatch(G.render(2030, { t2074: t }), /Calcul des seules écritures connues/,
        'aucune transaction 2025 ne doit être présentée pour les revenus 2030');
    const t2030 = F.detail2074(achatsVentes.map(tx => ({ ...tx,
        date: tx.date.replace('2025', '2030') })), 2030, {});
    const fut = G.render(2030, { t2074: t2030 });
    assert.match(fut, /NON reportable avant publication des imprimés/);
    assert.match(fut, /X le 10\/06\/2030 : 487,50 €/);
    assert.doesNotMatch(forme(fut, '2074'), /<b class="up">.*?€<\/b>/s);

    // Les montants sont maintenant côte à côte avec leur case même sur mobile.
    const css = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/css/app.css'), 'utf8');
    assert.match(css, /\.fisc-ligne-haut\s*\{[^}]*display:\s*flex/);
    assert.match(css, /\.fisc-ligne-haut > b\s*\{[^}]*font-size:\s*15px/);
    assert.doesNotMatch(css, /\.fisc-formulaire-table\s*\{[^}]*min-width:\s*520px/);
    assert.match(css, /\.fisc-apercu \.fisc-lignes\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);

    console.log('Montants : chiffres en tête, détail repliable, IR/crypto indépendants, mobile et futur sûrs : OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
