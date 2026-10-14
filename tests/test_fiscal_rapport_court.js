/* Le retour après le clic doit tenir en quelques lignes ; audit intégral
   accessible sans obliger à copier une page entière. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = 'app/src/main/assets/www/js/';
const ctx = { PF: { ui: { h: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;') },
    store: { reglages: () => ({}) } }, Date, Number, String };
ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(path + 'fiscal.js', 'utf8'), ctx);
const fiscal = ctx.PF.fiscal;
const donnees = { boi: { valeurs: { ir: { tranches: [11600, 29579, 84577, 181917] },
    decote: { dc: 897, dcCouple: 1483, dcPlafond: 1982, dcPlafondCouple: 3277 }, qf: 1807 } },
    frais: { valeurs: { abatt: { min: 509, max: 14555 }, repas: 5.45, km: [{}] } },
    titres: { valeurs: { ir: .128, ps: .186 }, url: 'https://example.invalid/titres' },
    brochure: { valeurs: { revenus: 2025 } },
    cryptoPdf: { notice: { valeurs: { seuilFoyer: 305 } }, brochure: { valeurs: { irForfaitaire: .128 } } },
    rcmPdf: { rcm: { valeurs: { case2CG: true } }, charges: { valeurs: { case6DE: true } } } };
const court = fiscal.resumeRapport(2025, donnees);
assert.match(court, /Revenus 2025 \(déclaration 2026\)/);
assert.match(court, /DGFiP : IR\/décote\/QF 3\/3, frais salariés 3\/3/);
assert.match(court, /notice 2086 lu, brochure crypto lu, RCM lu, charges\/CSG lu/);
assert.match(court, /PS crypto 2025 et déduction CSG du foyer non vérifiés/);
assert.match(court, /Bascule DGFiP totale : non/);
assert.doesNotMatch(court, /https?:|11600|18,6 %/);
assert.ok(court.length < 600, 'le résumé doit être copiable en un seul message');
assert.match(fiscal.resumeRapport(2025, { cryptoPdf: { notice: { etat: 'PDF inaccessible' } } }),
    /notice 2086 non disponible/);
assert.match(fiscal.resumeRapport(2026, {}), /2026 \(déclaration 2027\)/);
assert.equal(fiscal.htmlRapport(2025), '', 'pas de rapport avant lecture');
const code = fs.readFileSync(path + 'fiscal.js', 'utf8');
assert.match(code, /<details style="margin-top:8px"><summary>Sources, valeurs et limites détaillées<\/summary>/);
assert.match(code, /data-fisc="copier-resume"/);
assert.match(code, /zoneCopie.value = texteCourt/);
assert.doesNotMatch(code, /zoneCopie.value = texteRapport/);
assert.match(fiscal.bilanMiseAJour(2025, donnees), /Sources frais/,
    'le détail original doit rester disponible');
console.log('Résumé fiscal court : statut par source, millésime et refus de bascule OK');
