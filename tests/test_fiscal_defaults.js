'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/store.js'), 'utf8');
function initialiser(sauvegarde) {
    const donnees = sauvegarde ? { 'pf.reglages.v1': JSON.stringify(sauvegarde) } : {};
    const ctx = vm.createContext({ PF: {}, localStorage: {
        setItem: (k, v) => { donnees[k] = String(v); },
        getItem: k => donnees[k] ?? null,
        removeItem: k => { delete donnees[k]; }
    } });
    vm.runInContext(code, ctx);
    return ctx.PF.store.reglages();
}
const nouveaux = initialiser(null);
for (const n of [1, 2]) {
    assert.equal(nouveaux['utiliserFraisReels' + n], false);
    assert.equal(nouveaux['fraisKm' + n], 0);
    assert.equal(nouveaux['joursRepas' + n], 0);
}
const conserves = initialiser({ utiliserFraisReels1: true, fraisKm1: 9120, joursRepas1: 240 });
assert.equal(conserves.utiliserFraisReels1, true);
assert.equal(conserves.fraisKm1, 9120);
assert.equal(conserves.joursRepas1, 240);
console.log('Frais professionnels : aucun défaut positif, anciens réglages conservés');
