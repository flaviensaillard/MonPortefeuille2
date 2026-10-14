'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const storage = new Map();
const compte = '12345678-1234-4123-a123-123456789012';
// Rectification fictive à 18,7 % : la preuve partielle ne peut ni écraser
// la R2 ni devenir le taux universel des intérêts sans produit/précompte.
const page = `<p>modifié le 08/04/2026</p><h2>La taxation aux prélèvements sociaux</h2>
<p>La plupart des RCM ont été soumis aux prélèvements sociaux lors de leur encaissement en 2025 au taux de 17,2 %.</p>
<p>Les produits qui n'auraient pas fait l'objet de ce prélèvement sont soumis aux prélèvements sociaux lors du traitement de la déclaration de revenus, au taux global de 18,7 % pour les revenus perçus en 2025.</p>`;
const ctx = vm.createContext({ PF: { ui: { h: String }, store: { reglages: () => ({}) },
    net: { auth: { utilisateur: () => ({ id: compte }) }, req: async () => ({ ok: true, body: page }) } },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    Date, Promise, Number, Object, String, Error });
for (const nom of ['util.js', 'fiscal.js', 'fiscal_rcm_sources.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, nom), 'utf8'), ctx);
(async () => {
    const f = ctx.PF.fiscal;
    const r = await ctx.PF.fiscalRcmSources.chercher(2025);
    assert.equal(r.valeurs.nonPrecompteAvis2026, .187);
    await f.actualiserRevisions({ transactions: [] });
    const bilan = f.bilanMiseAJour(2025, { boi: {}, frais: {}, rcm: r });
    assert.match(bilan, /18,7 % sur avis 2026 si non précomptés en 2025/);
    assert.match(bilan, /Produit, exception et précompte du foyer non déterminés ; taux non activés/);
    assert.match(bilan, /Bascule DGFiP totale : non/);
    assert.equal(f.couvertureDgfip(2025).feuilles['RCM par produit, précompte et date'], false);
    const opts = f.comparerOptionsFoyer(42000, 2, 2025, 'Marié(e) / Pacsé(e)', 0, 100, false, 0);
    assert.equal(opts.retenu.ps_interets, 18.6, 'lire un taux RCM ne remplace pas le moteur non classé');
    console.log('RCM DGFiP partiels : rapport sourcé, pas de contamination de la simulation');
})().catch(e => { console.error(e); process.exitCode = 1; });
