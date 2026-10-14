'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const code = fs.readFileSync(path.join(dir, 'fiscal_regimes_sources.js'), 'utf8');
const html = (year, social = '17,2', pfu = '30') => `<html><p>Les plus-values de cession de valeurs mobilières réalisées depuis le 1er janvier 2018 sont soumises, lors de leur imposition, à un prélèvement forfaitaire unique (PFU) de 12,8&nbsp;% auquel s'ajoutent les prélèvements sociaux de ${social}&nbsp;% soit au total un taux de ${pfu}&nbsp;%.</p><p>Vous pouvez opter lors de la déclaration en cochant la case 2OP.</p><p>Si, en ${year}, vous ou les membres de votre foyer fiscal avez vendu des valeurs mobilières, des droits sociaux et titres assimilés.</p><p>Le mécanisme d’abattements s'applique uniquement pour les titres acquis ou souscrit avant le 1er janvier 2018 en cas d'option pour le barème progressif.</p></html>`;
let compte = '12345678-1234-4123-a123-123456789012';
const storage = new Map();
const pages = { 2023: html(2023), 2024: html(2024), 2025: html(2025, '18,6', '31,4'),
    2026: html(2025, '18,6', '31,4') };
const ctx = vm.createContext({ PF: { net: { auth: { utilisateur: () => ({ id: compte }) },
    req: async (_, url) => ({ ok: true, body: pages[Number(url.match(/calcul_impot\/(\d{4})/)[1]) - 1] }) } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key,val) => storage.set(key,val) },
    Date, Promise, Number, Object, String, Error });
vm.runInContext(code, ctx);
const src = ctx.PF.fiscalRegimesSources;
(async () => {
    for (const [year, ps] of [[2023,.172],[2024,.172],[2025,.186]]) {
        const r = await src.chercher(year);
        assert.equal(r.enregistree, true);
        assert.equal(r.valeurs.ps, ps, `${year}: ${r.etat}`);
        assert.equal(src.lireCache(year).ps, ps);
    }
    assert.equal(src.lireTitres(pages[2025], 2026), null, 'déclaration 2026 ≠ revenus 2026');
    assert.equal(src.lireTitres(html(2025, '18,6', '30'), 2025), null, 'somme incohérente');
    assert.equal(src.lireTitres(html(2025).replace('2OP', '3CN'), 2025), null, 'option absente');
    const ancien = storage.get('pf2.dgfip.regimes.v1.' + compte);
    await src.chercher(2024);
    assert.equal(storage.get('pf2.dgfip.regimes.v1.' + compte), ancien, 'pas de révision identique');
    pages[2024] = html(2024, '18,6', '31,4');
    const rectif = await src.chercher(2024);
    assert.equal(rectif.valeurs.ps, .186);
    assert.equal(JSON.parse(storage.get('pf2.dgfip.regimes.v1.' + compte))['2024'].length, 2);
    compte = '87654321-1234-4123-a123-123456789012';
    assert.equal(src.lireCache(2024), null, 'pas de fuite entre comptes');
    console.log('PV de titres DGFiP : années, taux, refus, rectification et comptes OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
