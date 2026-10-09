/* TWR exact côté app : valorisation avant/après chaque flux
   (revue 2.0.1, F-07 ; miroir Python : tests/test_twr_strict.py).

   Avant la 2.1.0, rendementsPeriode supposait chaque flux en FIN
   d'intervalle : 100 € au départ, 100 € versés au milieu, +10 % après le
   versement, clôture à 220 € → +20 % affichés au lieu de +10 %.

   Désormais, rendementsStricts exige la valorisation juste avant chaque flux
   (enregistrée avec l'apport depuis la 2.1.0) :
   - intervalle sans flux : exact, V_i / V_{i−1} ;
   - intervalle à flux valorisé : chaîné exactement ;
   - intervalle à flux NON valorisé : null, listé dans nonCalcules — jamais
     remplacé par une convention de fin de période. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js');

const stockage = {};
globalThis.localStorage = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');

const contexte = vm.createContext(globalThis);
for (const f of ['util.js', 'models.js', 'metrics.js']) {
    vm.runInContext(fs.readFileSync(path.join(RACINE, f), 'utf8'), contexte, { filename: f });
}
const PF = globalThis.PF;

let reussis = 0, echecs = 0;
function verifier(nom, cond, detail) {
    if (cond) { reussis++; console.log('  ✓ ' + nom); }
    else { echecs++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps); }

console.log('Le moteur strict existe');
verifier('PF.metrics.rendementsStricts existe', typeof PF.metrics.rendementsStricts === 'function');
verifier('PF.metrics.twrStricts existe', typeof PF.metrics.twrStricts === 'function');
if (echecs) { console.log('\n✗ ' + echecs + ' échec(s), ' + reussis + ' réussis'); process.exit(1); }

const R = PF.metrics.rendementsStricts;

console.log('Le scénario de la revue est exact quand le flux est valorisé');
var r = R(['2026-01-01', '2026-01-31'], [100, 220], { '2026-01-13': 100 }, { '2026-01-13': 100 });
verifier('rendement chaîné = +10 %', r.rendements.length === 1 && approx(r.rendements[0], 0.10),
    'obtenu : ' + JSON.stringify(r.rendements));
verifier('rien de non calculé', r.nonCalcules.length === 0);

console.log('Sans valorisation, le point n’est pas calculé');
r = R(['2026-01-01', '2026-01-31'], [100, 220], { '2026-01-13': 100 });
verifier('le rendement est null, pas +20 %', r.rendements.length === 1 && r.rendements[0] === null,
    'obtenu : ' + JSON.stringify(r.rendements));
verifier('l’intervalle est annoncé', r.nonCalcules.length === 1
    && approx(r.nonCalcules[0].flux, 100), JSON.stringify(r.nonCalcules));
var t = PF.metrics.twrStricts(['2026-01-01', '2026-01-31'], [100, 220], { '2026-01-13': 100 });
verifier('twrStricts : rien de chaîné, un écart annoncé', t.twr === 0 && t.nonCalcules.length === 1);

console.log('Intervalle sans flux : exact quelle que soit sa longueur');
r = R(['2026-01-31', '2026-03-31'], [1000, 1210], {});
verifier('+21 % exact', approx(r.rendements[0], 0.21) && r.nonCalcules.length === 0);

console.log('Deux flux valorisés dans le même intervalle');
r = R(['2026-01-01', '2026-01-31'], [100, 270],
    { '2026-01-10': 100, '2026-01-20': 50 }, { '2026-01-10': 100, '2026-01-20': 220 });
verifier('+10 % exact', approx(r.rendements[0], 0.10), 'obtenu : ' + JSON.stringify(r.rendements));
verifier('rien de non calculé', r.nonCalcules.length === 0);

console.log('Un retrait valorisé est chaîné comme un flux négatif');
r = R(['2026-01-01', '2026-01-31'], [300, 180], { '2026-01-15': -100 }, { '2026-01-15': 300 });
verifier('−10 % exact', approx(r.rendements[0], -0.10), 'obtenu : ' + JSON.stringify(r.rendements));

console.log('Un seul flux non valorisé ne condamne que son intervalle');
r = R(['2026-01-01', '2026-01-02', '2026-01-03'], [100, 260, 286], { '2026-01-02': 100 });
verifier('l’intervalle du flux est null', r.rendements[0] === null);
verifier('l’intervalle suivant reste exact (+10 %)', approx(r.rendements[1], 0.10));
t = PF.metrics.twrStricts(['2026-01-01', '2026-01-02', '2026-01-03'], [100, 260, 286], { '2026-01-02': 100 });
verifier('le TWR chaîne le seul intervalle exact', approx(t.twr, 0.10) && t.nonCalcules.length === 1);

console.log('Flux du premier jour : déjà dans la valeur de départ');
r = R(['2026-01-01', '2026-01-31'], [100, 110], { '2026-01-01': 500 });
verifier('aucun effet, +10 %', approx(r.rendements[0], 0.10) && r.nonCalcules.length === 0);

console.log('seriePerformance expose les valorisations capturées avec les apports');
var snaps = [
    { Date: '2026-01-01', patrimoine_investi_eur: 100 },
    { Date: '2026-01-31', patrimoine_investi_eur: 220 }
];
var apports = [{ date: '2026-01-13', sens: 'apport', montant_eur: 100, valeur_avant_eur: 100 }];
var serie = PF.metrics.seriePerformance(snaps, apports);
verifier('la série porte les valorisations avant',
    serie.valorisations && approx(serie.valorisations['2026-01-13'], 100),
    JSON.stringify(serie.valorisations));

console.log('\n' + (echecs ? '✗ ' + echecs + ' échec(s), ' : '✔ ') + reussis + ' réussis'
    + (echecs ? '' : ', 0 échec'));
process.exit(echecs ? 1 : 0);
