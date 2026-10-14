'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const storage = new Map();
const compte = '12345678-1234-4123-a123-123456789012';
let page = (ps, total) => '<p>Les plus-values de cession de valeurs mobilières réalisées depuis le 1er janvier 2018 sont soumises, lors de leur imposition, à un prélèvement forfaitaire unique (PFU) de 12,8 % auquel s’ajoutent les prélèvements sociaux de ' + ps + ' % soit au total un taux de ' + total + ' %.</p>'
    + '<p>Vous pouvez opter pour le barème en cochant la case 2OP.</p>'
    + '<p>Si, en 2024, vous ou les membres de votre foyer fiscal avez vendu des valeurs mobilières, des droits sociaux.</p>'
    + '<p>Le mécanisme d’abattements s’applique uniquement pour les titres acquis ou souscrit avant le 1er janvier 2018 en cas d’option pour le barème progressif.</p>';
let reponse = page('18,6', '31,4');
const ctx = vm.createContext({ PF: { ui: { h: String }, store: { reglages: () => ({}) },
    net: { auth: { utilisateur: () => ({ id: compte }) }, req: async () => ({ ok: true, body: reponse }) } },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) },
    Date, Promise, Number, Object, String, Error });
for (const nom of ['util.js','fiscal.js','fiscal_regimes_sources.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, nom), 'utf8'), ctx);
(async () => {
    const f = ctx.PF.fiscal;
    assert.equal(f.tauxPS(2024), .172);
    const r = await ctx.PF.fiscalRegimesSources.chercher(2024);
    assert.equal(r.valeurs.ps, .186);
    await f.actualiserRevisions({ transactions: [] });
    assert.equal(f.tauxPS(2024), .186, 'seuls les gains de titres utilisent ce taux');
    const opts = f.comparerOptionsFoyer(42000, 2, 2024, 'Marié(e) / Pacsé(e)', 100, 100, false, 100);
    assert.equal(opts.retenu.ps_titres, 18.6);
    assert.equal(opts.retenu.ps_crypto, 17.2, 'crypto ≠ titres');
    assert.equal(opts.retenu.ps_interets, 17.2, 'RCM non précomptés ≠ titres');
    assert.equal(f.couvertureDgfip(2024).complet, false);
    assert.ok(f.couvertureDgfip(2024).manquants.includes('CSG déductible et calendrier'));
    console.log('Activation titres DGFiP : pas de contagion aux RCM ou crypto, bascule bloquée OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
