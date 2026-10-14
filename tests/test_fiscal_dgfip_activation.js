'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, '../app/src/main/assets/www/js');
let account = '12345678-1234-4123-a123-123456789012';
const storage = new Map();
const pages = {};
function page(annee, nom, value) {
    const ids = { ir: 'BOI-IR-LIQ-20-10', decote: 'BOI-IR-LIQ-20-20-30', qf: 'BOI-IR-LIQ-20-20-20' };
    return `<p>Date de début de publication du BOI : 14/04/${annee + 1}</p><p>Identifiant juridique : ${ids[nom]}</p>` + value;
}
pages[2024] = {
    ir: page(2024, 'ir', '<p>Le barème pour l’imposition des revenus de l’année 2024 est présenté dans le tableau suivant :</p><table>'
        + [[11497,0],[29315,11],[83823,30],[180294,41],['plus',45]]
            .map(([n,t]) => `<tr><td>${n === 'plus' ? 'Supérieure à 180 294' : 'N’excédant pas ' + n} €</td><td>${t} %</td></tr>`).join('') + '</table>'),
    decote: page(2024, 'decote', '<p>Pour l’imposition des revenus de 2024, cette décote est accordée aux contribuables dont la cotisation d’impôt brut est inférieure à 1 965 € pour les contribuables célibataires, divorcés ou veufs et à 3 249 € pour les contribuables soumis à imposition commune (soit respectivement 1/45,25 % de 889 € et 1/45,25 % de 1 470 €).</p>'),
    qf: page(2024, 'qf', '<p>Son montant est fixé à 1 791 € par demi-part supplémentaire à compter de l’imposition des revenus de l’année 2024.</p>')
};
class DateNow extends Date { constructor(...x) { super(...(x.length ? x : ['2027-10-13T12:00:00Z'])); } }
const ctx = vm.createContext({ Date: DateNow, Promise, Number, Object, String, Error,
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) },
    PF: { ui: { h: String }, store: { reglages: () => ({}) },
        net: { auth: { utilisateur: () => ({ id: account }) },
            req: async (_, url) => ({ ok: true, body: pages[url.includes('20250414') ? 2024 : 2025]?.[
                url.includes('2491') ? 'ir' : url.includes('2495') ? 'decote' : 'qf'] || '' }) } } });
for (const file of ['util.js','fiscal.js','fiscal_dgfip_sources.js']) {
    vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), ctx);
}
(async () => {
    const fiscal = ctx.PF.fiscal;
    assert.throws(() => fiscal.baremeDe(2026), /non disponible/);
    assert.match(fiscal.vue(null), /Revenus 2026 : calcul fiscal indisponible/);
    await ctx.PF.fiscalDgfipSources.chercher(2024);
    await fiscal.actualiserRevisions({ transactions: [] });
    assert.equal(fiscal.baremeDe(2024).tranches[0], 11497, 'corrige 11520 historique');
    assert.equal(fiscal.baremeDe(2024).dc, 889, 'corrige décote embarquée');
    assert.equal(fiscal.plafondQF(2024), 1791, 'corrige QF embarqué');
    assert.throws(() => fiscal.baremeDe(2026), /non disponible/, 'aucun transfert 2024/2025 vers 2026');
    account = '87654321-1234-4123-a123-123456789012';
    await fiscal.actualiserRevisions({ transactions: [] });
    assert.equal(fiscal.baremeDe(2024).tranches[0], 11520, 'autre compte non modifié');
    console.log('Activation DGFiP : 2024 corrigé, 2026 suspendu, comptes isolés OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
