'use strict';
// Notice DGFiP 2086 revenus 2025 : 213 brut, 214 frais, 218 net ;
// 217/212 (hors frais) détermine le capital imputé, ligne 51 somme les 218.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const ctx = vm.createContext({ PF: { modele: { classeDe: () => 'crypto' } } });
for (const file of ['util.js', 'fiscal.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), ctx);
const jour = '2025-08-01';
const txs = [
    { ticker: 'BTC', type: 'achat', date: '2025-01-01', quantite: 2, cours: 500, frais: 0, devise: 'EUR' },
    { ticker: 'ETH', type: 'achat', date: '2025-01-02', quantite: 1, cours: 500, frais: 0, devise: 'EUR' },
    { ticker: 'BTC', type: 'vente', date: jour, quantite: 1, cours: 320, frais: 20, devise: 'EUR' }
];
const d = ctx.PF.fiscal.detail2086(txs, 2025, { ['USD|' + jour]: 1 }, { ['ETH|' + jour]: 500 });
const c = d.cessions[0];
assert.equal(c.ligne_212, 1140);
assert.equal(c.ligne_213, 320);
assert.equal(c.ligne_214, 20);
assert.equal(c.ligne_217, 320);
assert.equal(c.ligne_218, 300);
assert.equal(c.fraction_capital, 421.05);
assert.equal(c.ligne_224, -121.05);
assert.equal(d.total_cessions_213, 320);
assert.equal(d.total_cessions_218, 300);
assert.equal(d.exonere_305, true);
assert.equal(d.case_3bn, 0);
console.log('2086 2025 : frais hors quotient, net dans résultat/franchise (JS)');

// Frontières du calcul EXISTANT, sans homologuer le seuil ni les arrondis du
// foyer : la notice présente encore la divergence « inférieur » / « ≤ ».
for (const [brut, frais, exonere] of [[305, 0, true], [305.01, 0, false], [325, 20, true]]) {
    const test = [
        { ticker: 'BTC', type: 'achat', date: '2025-01-01', quantite: 1, cours: 100, frais: 0, devise: 'EUR' },
        { ticker: 'BTC', type: 'vente', date: jour, quantite: 1, cours: brut, frais, devise: 'EUR' }
    ];
    const resultat = ctx.PF.fiscal.detail2086(test, 2025, {}, {});
    assert.equal(resultat.exonere_305, exonere);
    assert.equal(resultat.cessions[0].fraction_capital, 100, 'frais hors quotient');
    assert.equal(resultat.perimetre, 'portefeuille_seul');
    assert.equal(resultat.annexe_foyer_complete, false);
    assert.equal(resultat.cases_foyer_certifiees, false, 'même au-dessus du seuil : pas de certification du foyer');
}
const vide = ctx.PF.fiscal.detail2086([], 2025, {}, {});
assert.equal(vide.annexe_foyer_complete, false, 'absence de transactions ≠ absence de cessions du foyer');
const code = fs.readFileSync(path.join(dir, 'fiscal.js'), 'utf8');
assert.match(code, /Annexe 2086 exhaustive du foyer : non disponible/);
assert.match(code, /Ne pas ajouter en 6DE la CSG des lignes 2BH\/2DF/);
assert.doesNotMatch(code, /Recopiez-les tels quels/);
