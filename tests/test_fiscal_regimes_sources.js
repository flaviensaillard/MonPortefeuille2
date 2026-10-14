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
    // Mise en page du simulateur réel : lignes brisées par <br>, balises et
    // espaces insécables numériques, et longue phrase des titres anciens.
    const aide2025 = `<td>Les plus-values de cession de valeurs mobilières réalisées depuis le 1er janvier 2018 sont soumises,<br>lors de leur imposition, à <b>un prélèvement forfaitaire unique (PFU)</b> de 12,8&#160;% auquel<br>s'ajoutent les prélèvements sociaux de 18,6&#160;% soit au total un taux de <b>31,4&#160;%</b>.<br>Cependant vous pouvez opter, lors de la déclaration de revenus, pour une imposition globale de ces revenus et gains au barème progressif<br>de l'impôt sur le revenu en cochant la <b>case 2OP</b>.<br><b>Gains de cession de valeurs mobilières, droits sociaux et gains assimilés</b><br>Si, en 2025, vous ou les membres de votre foyer fiscal avez vendu des valeurs mobilières, des droits<br>sociaux et titres assimilés, si vous avez perçu des distributions effectuées par certaines structures.<br>Le mécanisme d’abattements qui existe pour certains gains en tenant compte de la durée de détention des titres cédés s'applique uniquement pour les titres acquis ou souscrit avant le<br>1er janvier 2018 en cas d'option pour le barème progressif.</td>`;
    assert.equal(src.lireTitres(aide2025, 2025).ps, .186);
    // Cas observé par diagnostic mobile : la date peut être coupée par une
    // balise de typographie HTML, donnant « 1 er » dans le texte normalisé.
    const aideAvecExposant = aide2025.replaceAll('1er janvier 2018', '1<sup>er</sup> janvier 2018');
    assert.equal(src.lireTitres(aideAvecExposant, 2025).ps, .186);
    assert.equal(src.lireTitres(aide2025.replaceAll('1er janvier 2018', '1ᵉʳ janvier 2018'), 2025).ps, .186);
    assert.equal(src.lireTitres(aideAvecExposant.replace('1<sup>er</sup> janvier 2018 en cas',
        '1<sup>er</sup> janvier 2019 en cas'), 2025), null, 'condition des titres anciens millésimée');
    pages[2025] = aideAvecExposant;
    const releve2025 = await src.chercher(2025);
    assert.equal(releve2025.valeurs.ps, .186, 'extrait de la vraie structure HTML relu après stockage');
    assert.match(releve2025.etat, /année explicites/);
    assert.equal(src.analyserTitres(aide2025, 2026).etat, 'revenus 2026 non mentionnés pour les titres');
    // Si la phrase introductive change ou est cassée par des balises, le
    // titre de section et son paragraphe PFU voisin servent de preuve, mais
    // jamais la seule présence de « 18,6 % » sur une page sans titres.
    const introVariante = aide2025.replace('Les plus-values de cession de valeurs mobilières réalisées depuis le 1er janvier 2018 sont soumises,',
        'Plus-values et gains divers. Ces opérations sont soumises,');
    assert.equal(src.lireTitres(introVariante, 2025).ps, .186);
    assert.equal(src.lireTitres(introVariante.replace('Gains de cession de valeurs mobilières, droits sociaux',
        'Gains sur des actifs numériques'), 2025), null);
    assert.equal(src.lireTitres(introVariante.replace('Si, en 2025,', 'Si, en 2024,'), 2025), null);
    assert.equal(src.lireTitres(pages[2025], 2026), null, 'déclaration 2026 ≠ revenus 2026');
    assert.equal(src.lireTitres(html(2025, '18,6', '30'), 2025), null, 'somme incohérente');
    assert.equal(src.lireTitres(html(2025).replace('2OP', '3CN'), 2025), null, 'option absente');
    assert.match(src.analyserTitres(html(2025).replace('2OP', '3CN'), 2025).etat, /case 2OP non reconnue.*2OP=false/);
    const reformulee = html(2025, '18,6', '31,4').replace(
        'Le mécanisme d’abattements s\'applique uniquement pour les titres acquis ou souscrit avant le 1er janvier 2018',
        'Un abattement pour durée de détention est possible pour les titres acquis avant le 1er janvier 2018');
    assert.equal(src.lireTitres(reformulee, 2025).ps, .186, 'ne pas exiger le libellé littéral de l’abattement');
    assert.match(src.analyserTitres(html(2025).replace('avant le 1er janvier 2018', 'avant le 1er janvier 2019'), 2025).etat,
        /avant 2018 non reconnu.*avant 2018=false/);
    const ancien = storage.get('pf2.dgfip.regimes.v1.' + compte);
    await src.chercher(2024);
    assert.equal(storage.get('pf2.dgfip.regimes.v1.' + compte), ancien, 'pas de révision identique');
    pages[2024] = html(2024, '18,6', '31,4');
    const rectif = await src.chercher(2024);
    assert.equal(rectif.valeurs.ps, .186);
    assert.equal(JSON.parse(storage.get('pf2.dgfip.regimes.v1.' + compte))['2024'].length, 2);
    pages[2025] = '<html><h1>Page de maintenance temporaire</h1></html>';
    const mauvaisePage = await src.chercher(2025);
    assert.match(mauvaisePage.etat, /régime des gains de titres absent \(HTTP \?, \d+ caractères ; début du document : «Page de maintenance temporaire»\)/);
    assert.equal(src.lireCache(2025), null, 'une autre page 200 ne valide aucun taux');
    compte = '87654321-1234-4123-a123-123456789012';
    assert.equal(src.lireCache(2024), null, 'pas de fuite entre comptes');
    console.log('PV de titres DGFiP : années, taux, refus, rectification et comptes OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
