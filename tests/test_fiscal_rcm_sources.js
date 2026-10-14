'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const stockage = new Map();
let compte = '12345678-1234-4123-a123-123456789012';
let appels = 0;
const html = (annee = 2025, pre = '17,2', avis = '18,6') => `<html>
<p>Publié le 18/07/2016, modifié le 08/04/2026</p>
<h2>La taxation aux prélèvements sociaux</h2>
<p>La plupart des RCM ont été soumis aux prélèvements sociaux lors de leur encaissement en ${annee} au taux de ${pre}&#8239;%.</p>
<p>Les produits qui n'auraient pas fait l'objet de ce prélèvement sont soumis aux prélèvements sociaux lors du traitement de la déclaration de revenus, au taux global de ${avis}&#160;% pour les revenus perçus en ${annee}.</p>
<p>Une partie de la CSG afférente aux RCM imposés au barème est déductible de votre revenu imposable de l’année de son paiement à hauteur de 6,8&nbsp;% (à l’exception des fonds en euros).</p>
</html>`;
let reponse = html();
const ctx = vm.createContext({ PF: { net: { auth: { utilisateur: () => ({ id: compte }) },
    req: async (_, url) => { appels++; assert.equal(url, 'https://www.impots.gouv.fr/particulier/les-revenus-mobiliers');
        return { ok: true, status: 200, body: reponse }; } } },
    localStorage: { getItem: k => stockage.get(k) || null, setItem: (k, v) => stockage.set(k, v) },
    Date, Promise, Number, Object, String, Error });
vm.runInContext(fs.readFileSync(path.join(dir, 'fiscal_rcm_sources.js'), 'utf8'), ctx);
const rcm = ctx.PF.fiscalRcmSources;
(async () => {
    assert.equal(rcm.analyser(html(), 2025).valeurs.precompte2025, .172);
    assert.equal(rcm.analyser(html(), 2025).valeurs.nonPrecompteAvis2026, .186);
    assert.equal(rcm.analyser(html(), 2025).valeurs.csgConditionnelle, true);
    for (const an of [2023, 2024, 2026]) {
        assert.equal((await rcm.chercher(an)).enregistree, false);
        assert.equal(rcm.lireCache(an), null);
    }
    assert.equal(appels, 0, 'la page actuelle ne vaut ni pour 2023/24 ni pour 2026');
    const premiere = await rcm.chercher(2025);
    assert.equal(premiere.valeurs.precompte2025, .172);
    assert.equal(premiere.valeurs.nonPrecompteAvis2026, .186);
    assert.equal(rcm.lireCache(2025).csgConditionnelle, true, 'preuve de CSG relue sans activation fiscale');
    const cle = 'pf2.dgfip.rcm.v1.' + compte;
    const original = stockage.get(cle);
    await rcm.chercher(2025);
    assert.equal(stockage.get(cle), original, 'collecte identique : pas de nouvelle révision');
    reponse = html(2025, '17,2', '18,7');
    const rectifie = await rcm.chercher(2025);
    assert.equal(rectifie.valeurs.nonPrecompteAvis2026, .187);
    assert.equal(JSON.parse(stockage.get(cle))['2025'].length, 2, 'rectification conservée');
    assert.equal(rcm.analyser(html(2024), 2025).valeurs, undefined, 'année des revenus exigée');
    assert.equal(rcm.analyser(html(2025, '18,6', '17,2'), 2025).valeurs, undefined, 'taux contradictoires');
    assert.equal(rcm.analyser(html().replace('La taxation aux prélèvements sociaux', 'Les gains de titres'), 2025).valeurs,
        undefined, 'ne jamais isoler deux taux sur une mauvaise page');
    assert.equal(rcm.analyser(html().replace('modifié le 08/04/2026', 'modifié le 08/04/2025'), 2025).valeurs,
        undefined, 'pas de source datée avant le régime vérifié');
    compte = '87654321-1234-4123-a123-123456789012';
    assert.equal(rcm.lireCache(2025), null, 'preuve séparée par compte');
    console.log('RCM DGFiP : précompte/avis 2025, millésime, CSG conditionnelle et rectifications OK');
})().catch(err => { console.error(err); process.exitCode = 1; });
