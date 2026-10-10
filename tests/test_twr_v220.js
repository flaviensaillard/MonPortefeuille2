/* TWR 2.2.0 côté app (miroir de tests/test_twr_v220.py).

   Constats couverts (bug A du retour d'appareil) :
   - A1 : une valorisation absente est RECONSTRUITE depuis le snapshot le plus
     proche STRICTEMENT antérieur au flux (date et origine conservées) ; une
     valorisation mesurée reste prioritaire ;
   - A2 : un intervalle non calculé rend le TWR global (et le CAGR) non
     calculés : jamais un chaînage partiel présenté comme un total ;
   - A4 : golden test de la revue (100 €, apport de 100 € à mi-période, +10 %
     après → +10 %, pas +20 %) et bout en bout sur une série réaliste.

   Même technique que tests/test_js.js : les modules sont chargés tels quels. */
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
for (const f of ['util.js', 'metrics.js']) {
    vm.runInContext(fs.readFileSync(path.join(RACINE, f), 'utf8'), contexte, { filename: f });
}
const PF = globalThis.PF;
const M = PF.metrics;

let echecs = 0, reussis = 0;
function verifier(nom, cond, detail) {
    if (cond) { reussis++; console.log('  ✓ ' + nom); }
    else { echecs++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); }
}
function approx(a, b, eps) { return a !== null && a !== undefined && Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps); }

console.log('Golden test de la revue : 100 €, apport de 100 € à mi-période, +10 %');
var dates = ['2026-01-01', '2026-01-31'];
var r = M.rendementsStricts(dates, [100, 220], { '2026-01-13': 100 }, { '2026-01-13': 100 });
verifier('avec valorisation mesurée : +10 %, pas +20 %', approx(r.rendements[0], 0.10), JSON.stringify(r.rendements));
var t = M.twrStricts(dates, [100, 220], { '2026-01-13': 100 }, { '2026-01-13': 100 });
verifier('TWR global = +10 %', approx(t.twr, 0.10) && t.nonCalcules.length === 0);

console.log('Reconstruction depuis le snapshot de la veille');
var vd = M.valorisationsAvantFlux(['2026-01-01', '2026-01-02'], [100, 220], ['2026-01-02'], {});
verifier('origine « reconstruite »', vd['2026-01-02'].origine === 'reconstruite', JSON.stringify(vd));
verifier('snapshot retenu = la veille (01/01)', vd['2026-01-02'].snapshot === '2026-01-01');
verifier('valeur = 100 €', approx(vd['2026-01-02'].valeur, 100));
var vc = M.valorisationsCompletees(vd);
var t2 = M.twrStricts(['2026-01-01', '2026-01-02'], [100, 220], { '2026-01-02': 100 }, vc);
verifier('le TWR est calculé (+10 %), sans intervalle non calculé',
    t2.twr !== null && approx(t2.twr, 0.10) && t2.nonCalcules.length === 0, JSON.stringify(t2));

console.log('Le snapshot du jour même est exclu');
vd = M.valorisationsAvantFlux(['2026-01-01', '2026-01-13', '2026-01-31'], [100, 999, 220], ['2026-01-13'], {});
verifier('le snapshot du 13 n’est pas retenu', vd['2026-01-13'].snapshot === '2026-01-01' && approx(vd['2026-01-13'].valeur, 100));

console.log('La valorisation mesurée reste prioritaire');
vd = M.valorisationsAvantFlux(['2026-01-01', '2026-01-31'], [100, 220], ['2026-01-13'], { '2026-01-13': 104 });
verifier('origine « mesurée », 104 €', vd['2026-01-13'].origine === 'mesurée' && approx(vd['2026-01-13'].valeur, 104));

console.log('Snapshot antérieur à valeur nulle : manquant, avec raison');
vd = M.valorisationsAvantFlux(['2026-01-01', '2026-01-31'], [0, 220], ['2026-01-13'], {});
verifier('manquante', vd['2026-01-13'].origine === 'manquante' && vd['2026-01-13'].valeur === null);
verifier('raison fournie', typeof vd['2026-01-13'].raison === 'string' && vd['2026-01-13'].raison.length > 0);

console.log('A2 : un intervalle non calculé rend le TWR global null');
t = M.twrStricts(['2026-01-01', '2026-01-31', '2026-02-28'], [0, 220, 240], { '2026-01-13': 100 }, {});
verifier('twr null', t.twr === null);
verifier('intervalle annoncé avec sa raison', t.nonCalcules.length === 1 && typeof t.nonCalcules[0].raison === 'string' && t.nonCalcules[0].raison.length > 0);

console.log('Série réaliste 2024-2025 : valorisations complétées, années calculables');
// Modèle : hausse de +1 % APRÈS chaque apport du 15 ; la valeur juste avant le
// flux est le snapshot précédent. Le TWR global vaut exactement 1,01^23 − 1.
var snaps = [], apports = [], capital = 10000, fins = [];
var y = 2024, m = 0;
for (var i = 0; i < 24; i++) {
    var mm = m + 1, yy = y;
    var dernier = new Date(Date.UTC(yy, mm, 0)).getUTCDate();   // fin du mois, mois 1-12
    fins.push(yy + '-' + String(mm).padStart(2, '0') + '-' + String(dernier).padStart(2, '0'));
    m++; if (m === 12) { m = 0; y++; }
}
for (i = 0; i < fins.length; i++) {
    if (i > 0) {
        if (i >= 2) {
            var jour = fins[i].slice(0, 8) + '15';
            var avant = capital;
            capital += 500;
            apports.push({ date: jour, sens: 'apport', montant_eur: 500,
                valeur_avant_eur: fins[i].slice(0, 4) === '2024' ? avant : null });
        }
        capital *= 1.01;
    }
    snaps.push({ Date: fins[i], patrimoine_investi_eur: capital });
}
var serie = M.seriePerformance(snaps, apports);
verifier('valorisation 2025 reconstruite', serie.valorisationsDetail['2025-03-15'].origine === 'reconstruite'
    && serie.valorisationsDetail['2025-03-15'].snapshot === '2025-02-28');
verifier('valorisation 2024 mesurée', serie.valorisationsDetail['2024-04-15'].origine === 'mesurée');
var rs = M.rendementsStricts(serie.dates, serie.valeurs, serie.fluxJour, serie.valorisations);
verifier('aucun intervalle non calculé', rs.nonCalcules.length === 0, JSON.stringify(rs.nonCalcules.slice(0, 2)));
var tg = M.twrStricts(serie.dates, serie.valeurs, serie.fluxJour, serie.valorisations);
verifier('TWR global = 1,01^23 − 1', tg.twr !== null && approx(tg.twr, Math.pow(1.01, 23) - 1, 1e-6), String(tg.twr));
var cagr = M.twrAnnualise(serie);
verifier('CAGR calculé', cagr !== null && isFinite(cagr));

console.log('Le CAGR est calculé quand la valorisation est reconstruite');
var serieTrou = M.seriePerformance(
    [{ Date: '2026-01-01', patrimoine_investi_eur: 100 }, { Date: '2026-03-01', patrimoine_investi_eur: 150 },
     { Date: '2026-09-01', patrimoine_investi_eur: 160 }],
    [{ date: '2026-02-10', sens: 'apport', montant_eur: 50 }]);
verifier('valorisation reconstruite du 01/01 (100 €)', serieTrou.valorisationsDetail['2026-02-10'].origine === 'reconstruite'
    && approx(serieTrou.valorisationsDetail['2026-02-10'].valeur, 100));
verifier('CAGR calculé sur l’historique complet', M.twrAnnualise(serieTrou) !== null);

if (echecs) { console.log('\n✗ ' + echecs + ' échec(s), ' + reussis + ' réussis'); process.exit(1); }
console.log('\n✔ ' + reussis + ' réussis, 0 échecs');
