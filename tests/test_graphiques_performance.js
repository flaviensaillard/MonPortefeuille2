'use strict';
/* Axe des courbes Performance : les valeurs observées restent visibles sans
   inventer un point à zéro ; les autres écrans gardent leur échelle actuelle. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const js = path.join(__dirname, '..', 'app/src/main/assets/www/js');
const contexte = vm.createContext({ Intl });
for (const nom of ['util.js', 'ui.js']) {
    vm.runInContext(fs.readFileSync(path.join(js, nom), 'utf8'), contexte);
}
const UI = contexte.PF.ui;

function rendu(valeurs, options = {}) {
    const html = UI.graphique(valeurs.map((v, i) => ({
        nom: 'Série ' + i, valeurs: v,
        dates: v.map((_, n) => '2025-01-0' + (n + 1))
    })), { unite: '$', hauteur: 128, ...options });
    const id = html.match(/data-graph="([^"]+)"/)[1];
    const zone = {
        dataset: {}, clientWidth: 330, style: { height: '128px' }, innerHTML: '',
        getAttribute: nom => nom === 'data-graph' ? id : null,
        querySelector: () => null, querySelectorAll: () => []
    };
    UI.lierGraphiques({ querySelectorAll: () => [zone] });
    return { svg: zone.innerHTML, ticks: [...zone.innerHTML.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
        .map(m => m[1]).filter(v => /\$/.test(v)) };
}

let chart = rendu([[40000, 45000, 50000]], { axeResserre: true });
assert.equal(chart.ticks.at(-1), '40 k$');
assert.ok(chart.ticks.every(v => v !== '0 $'));
assert.match(chart.svg, /M54\.0,|M54,|M54\.0/);  // premier point réel tracé
assert.ok(!/NaN|Infinity/.test(chart.svg));

// Les trois courbes se partagent le même axe et aucune valeur n'est coupée.
chart = rendu([[42000, 44500, 44000], [41000, 42500, 43500]], { axeResserre: true });
assert.equal(chart.ticks.at(-1), '40 k$');
assert.ok(Number(chart.ticks[0].replace(/[^\d]/g, '')) >= 45);
assert.equal(new Set(chart.ticks).size, chart.ticks.length);

// Une vraie valeur nulle, une série plate et un passage sous zéro restent lisibles.
chart = rendu([[0, 20000, 40000]], { axeResserre: true });
assert.ok(chart.ticks.includes('0 $'));
chart = rendu([[50000, 50000, 50000]], { axeResserre: true });
assert.ok(!/NaN|Infinity/.test(chart.svg));
assert.ok(chart.ticks.every(v => v !== '0 $'));
chart = rendu([[-200, 0, 250]], { axeResserre: true });
assert.ok(chart.ticks.some(v => v.startsWith('-')));
assert.ok(chart.ticks.includes('0 $'));

// Les graduations proches ne sont pas arrondies sur un même libellé.
assert.equal(UI.montantCourt(42250, '$', 250), '42,25 k$');
chart = rendu([[42250, 42500, 42750]], { axeResserre: true });
assert.equal(new Set(chart.ticks).size, chart.ticks.length);

// L'écran Retraite et les autres consommateurs conservent l'axe historique.
chart = rendu([[40000, 45000, 50000]]);
assert.equal(chart.ticks.at(-1), '0 $');
const views = fs.readFileSync(path.join(js, 'views.js'), 'utf8');
assert.equal((views.match(/axeResserre: true/g) || []).length, 1);
assert.match(views, /Axe vertical ajusté aux valeurs de chaque période/);
console.log('Échelles Performance : bornes utiles, graduations, zéro réel et autres écrans OK.');
