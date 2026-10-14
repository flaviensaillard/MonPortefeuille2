'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/fiscal_frais_sources.js'), 'utf8');
const km = [
    ['3CV et moins', '0,529', '0,316', '1 065', '0,370'],
    ['4 CV', '0,606', '0,340', '1 330', '0,407'],
    ['5 CV', '0,636', '0,357', '1 395', '0,427'],
    ['6 CV', '0,665', '0,374', '1 457', '0,447'],
    ['7 CV et plus', '0,697', '0,394', '1 515', '0,470']
];
function htmlKm(annee, rows = km) {
    return '<p>Pour les revenus perçus en ' + annee + ', le minimum ...</p>'
        + '<p>Tarif : automobiles</p><p>Jusqu’à 5 000 km ; De 5001 à 20 000 km</p>'
        + '<p>Le barème pour les véhicules 100 % électriques correspond au barème applicable ci-dessous majoré de 20 %.</p>'
        + '<table>' + rows.map(r => '<tr><td>' + r[0] + '</td><td>d x ' + r[1]
            + '</td><td>(d x ' + r[2] + ') + ' + r[3] + '</td><td>d x ' + r[4] + '</td></tr>').join('') + '</table>';
}
const repas = a => '<p>Pour l’imposition des revenus ' + a
    + ', la valeur d’un repas pris au foyer est de 5,45 €.</p>';
let compte = '12345678-1234-4123-a123-123456789012';
const mem = new Map();
let repasPage = repas(2025), kmPage = htmlKm(2025);
const ctx = vm.createContext({
    localStorage: { getItem: k => mem.get(k) || null, setItem: (k, v) => mem.set(k, v) },
    PF: { modele: { classeDe: () => 'action_etf' },
        ui: { h: String }, store: { reglages: () => ({}) },
        net: { auth: { utilisateur: () => ({ id: compte }) },
        req: async (_, url) => ({ ok: true, body: url.includes('frais-de-repas') ? repasPage : kmPage }) } },
    Date, Promise, Number, Object, String, Error, isFinite
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/util.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/fiscal.js'), 'utf8'), ctx);
vm.runInContext(code, ctx);
const src = ctx.PF.fiscalFraisSources, fiscal = ctx.PF.fiscal;
(async () => {
    assert.equal(src.lireRepas(repasPage, 2025), 5.45);
    assert.equal(src.lireRepas(repasPage, 2026), null, '2025 n’est pas 2026');
    assert.equal(src.lireKm(kmPage, 2026), null);
    assert.deepEqual(Array.from(src.lireKm(kmPage, 2025)[3]), [0.529, 0.316, 1065, 0.370]);
    assert.equal(src.lireKm(htmlKm(2025, km.slice(1)), 2025), null, '5 lignes exigées');
    assert.equal(src.lireKm(htmlKm(2025).replace('0,370', '1,999'), 2025), null, 'coefficients incohérents');
    const historique = '<p>Pour les revenus perçus en 2024, le minimum de déduction est de 504 €, le maximum de 14 426 €.</p><p>si vous n’avez pas de justifications détaillées, les frais supplémentaires sont évalués à 5,35 € par repas.</p>';
    assert.equal(src.lireRepas(historique, 2024), 5.35);
    assert.equal(src.lireRepas(historique, 2023), null);
    assert.equal(src.lireAbatt(historique, 2024).max, 14426);
    assert.equal(src.lireAbatt(historique, 2023), null);
    // Régression remontée par l'APK : l'aide du simulateur 2026 mentionne
    // les revenus 2025, avec espaces/euros parfois encodés en entités HTML.
    const page2025 = htmlKm(2025).replace('Pour les revenus perçus en 2025',
        'Pour les revenus per&#xE7;us en 2025')
        .replaceAll('5 000 km', '5&#xA0;000 km')
        + '<p>Pour les revenus per&#xE7;us en 2025, le minimum de d&#xE9;duction est de 509&#xA0;&#x20AC;,<br> le maximum de 14&#xA0;555&#xA0;&#x20AC;.</p>';
    assert.deepEqual(Array.from(src.lireKm(page2025, 2025)[5]), [0.636, 0.357, 1395, 0.427]);
    assert.equal(src.lireAbatt(page2025, 2025).min, 509);
    assert.equal(src.lireAbatt(page2025, 2025).max, 14555);
    assert.equal(src.lireKm(page2025, 2026), null, 'déclaration 2026 ≠ revenus 2026');
    assert.equal(src.lireAbatt(page2025, 2026), null);
    const r = await src.chercher(2025);
    assert.equal(r.valeurs.repas, 5.45);
    assert.equal(r.valeurs.km[7][3], 0.470);
    await src.chercher(2025);
    assert.equal(JSON.parse(mem.values().next().value)['2025'].length, 1, 'pas de nouvelle révision si identique');
    compte = '87654321-1234-4123-a123-123456789012';
    assert.equal(src.lireCache(2025), null, 'pas de fuite entre comptes');
    compte = '12345678-1234-4123-a123-123456789012';
    repasPage = repas(2026); kmPage = htmlKm(2026);
    const r2026 = await src.chercher(2026);
    assert.equal(r2026.valeurs.repas, 5.45);
    assert.equal(r2026.valeurs.km[7][3], .47);
    await fiscal.actualiserRevisions({ transactions: [] });
    assert.equal(fiscal.forfaitRepas(2026), 5.45, 'frais officiels appliqués à la simulation indicative');
    assert.equal(fiscal.fraisKilometriques(1000, 5, false, 2026).montant, 636);
    assert.equal(fiscal.forfaitRepas(2025), 5.45, 'R2/année précédente non remplacée');
    repasPage = repas(2026).replace('5,45', '5,50');
    const rectif = await src.chercher(2026);
    assert.equal(rectif.valeurs.repas, 5.5);
    await fiscal.actualiserRevisions({ transactions: [] });
    assert.equal(fiscal.forfaitRepas(2026), 5.5);
    assert.equal(JSON.parse(mem.values().next().value)['2026'].length, 2, 'rectification conservée');
    repasPage = repas(2025); kmPage = htmlKm(2025);
    const absent = await src.chercher(2026);
    assert.equal(absent.valeurs.repas, null, 'source revenant à 2025 : désactiver 2026');
    assert.equal(absent.valeurs.km, null);
    await fiscal.actualiserRevisions({ transactions: [] });
    assert.equal(fiscal.forfaitRepas(2026), null, 'aucun repli 2025 en 2026 si source retirée');
    assert.equal(JSON.parse(mem.values().next().value)['2026'].length, 3);
    kmPage = htmlKm(2024) + historique;
    assert.equal(src.repasUrl(2024), src.KM(2024));
    const old = await src.chercher(2024);
    assert.equal(old.valeurs.repas, 5.35);
    assert.equal(old.valeurs.abatt.min, 504);
    assert.equal(old.valeurs.km[5][2], 1395);
    await fiscal.actualiserRevisions({ transactions: [] });
    assert.equal(fiscal.forfaitRepas(2024), 5.35);

    console.log('Frais DGFiP : millésime explicite, 5 lignes, corrections, cache isolé OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
