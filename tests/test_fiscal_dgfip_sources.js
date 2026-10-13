'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/fiscal_dgfip_sources.js'), 'utf8');
let compte = '12345678-1234-4123-a123-123456789012';
const mem = new Map();
const pages = {};
function ir(a, bornes) {
    return `<p>Identifiant juridique : BOI-IR-LIQ-20-10</p><p>Le barème pour l’imposition des revenus de l’année ${a} est présenté dans le tableau suivant :</p><table>`
        + [0, 11, 30, 41, 45].map((n, i) => `<tr><td>${i === 4 ? 'Supérieure à ' + bornes[3] : 'N’excédant pas ' + bornes[i]} €</td><td>${n} %</td></tr>`).join('') + '</table>';
}
function decote(a, v) {
    return `<p>Identifiant juridique : BOI-IR-LIQ-20-20-30</p><p>Pour l’imposition des revenus de ${a}, cette décote est accordée aux contribuables dont la cotisation d’impôt brut est inférieure à ${v[0]} € pour les contribuables célibataires, divorcés ou veufs et à ${v[1]} € pour les contribuables soumis à imposition commune (soit respectivement 1/45,25 % de ${v[2]} € et 1/45,25 % de ${v[3]} €).</p>`;
}
function qf(a, n) {
    return `<p>Identifiant juridique : BOI-IR-LIQ-20-20-20</p><p>Son montant est fixé à ${n} € par demi-part supplémentaire à compter de l’imposition des revenus de l’année ${a}.</p>`;
}
const e = a => a.toLocaleString('fr-FR');
for (const [a, bornes, d, q] of [
    [2023, [11294,28797,82341,177106], [1929,3191,873,1444],1759],
    [2024, [11497,29315,83823,180294], [1965,3249,889,1470],1791],
    [2025, [11600,29579,84577,181917], [1982,3277,897,1483],1807]
]) {
    pages[a] = { ir: ir(a, bornes.map(e)), decote: decote(a, d.map(e)), qf: qf(a,e(q)) };
}
const ctx = vm.createContext({ localStorage: { getItem: k => mem.get(k) || null, setItem: (k,v) => mem.set(k,v) },
    PF: { net: { auth: { utilisateur: () => ({ id: compte }) }, req: async (_, url) => ({ ok: true,
        body: pages[url.includes('20240618') ? 2023 : url.includes('20250414') ? 2024 : url.includes('doctrine') ? 2026 : 2025]
            [url.includes('2491') || url.endsWith('20-10') ? 'ir' : url.includes('2495') || url.endsWith('20-30') ? 'decote' : 'qf'] }) } },
    Date, Promise, Number, Object, String, Error });
vm.runInContext(src, ctx);
const dg = ctx.PF.fiscalDgfipSources;
(async () => {
    for (const a of [2023,2024,2025]) {
        const r = await dg.chercher(a);
        assert.equal(r.enregistree, true);
        assert.ok(r.valeurs.ir && r.valeurs.decote && r.valeurs.qf, `${a}: ${JSON.stringify(r)}`);
    }
    assert.equal(dg.lireCache(2024).ir.tranches[0], 11497);
    assert.equal(dg.lireCache(2023).decote.dc, 873);
    assert.equal(dg.lireCache(2024).qf, 1791);
    await dg.chercher(2024);
    assert.equal(JSON.parse(mem.get('pf2.dgfip.boi.v1.' + compte))['2024'].length, 1);
    pages[2024].qf = qf(2024, '1 795');
    await dg.chercher(2024);
    assert.equal(dg.lireCache(2024).qf, 1795);
    assert.equal(JSON.parse(mem.get('pf2.dgfip.boi.v1.' + compte))['2024'].length, 2);
    const r26 = await dg.chercher(2026);
    assert.equal(r26.valeurs.ir, undefined, '2025 is not 2026');
    assert.equal(r26.valeurs.qf, undefined);
    compte = '87654321-1234-4123-a123-123456789012';
    assert.equal(dg.lireCache(2024), null);
    console.log('DGFiP BOFiP : années, décote, QF, cache et rectification OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
