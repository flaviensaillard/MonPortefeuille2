'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Simulation au-delà du dernier barème : l'écran ne doit jamais présenter
// 2026 comme le calcul applicable aux revenus 2027.
class DateFuture extends Date {
    constructor(...args) { super(...(args.length ? args : ['2028-10-13T12:00:00Z'])); }
}
const contexte = vm.createContext({
    PF: { store: { reglages: () => ({}) }, ui: { h: String }, util: {} },
    Date: DateFuture
});
vm.runInContext(fs.readFileSync(path.join(__dirname,
    '../app/src/main/assets/www/js/fiscal.js'), 'utf8'), contexte);
const ecran = contexte.PF.fiscal.vue(null);
assert.match(ecran, /Revenus 2027 : calcul fiscal indisponible/);
assert.match(ecran, /les chiffres d’une autre année ne sont pas réutilisés/);
assert.doesNotMatch(ecran, /class="chip actif"[^>]*data-valeur="2026"/);
assert.doesNotMatch(ecran, /Vos paramètres fiscaux|case 1AK/);
console.log('Année fiscale absente : aucun repli silencieux sur 2026');
