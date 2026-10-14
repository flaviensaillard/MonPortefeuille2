'use strict';
// Fixtures synthétiques, aucun réseau. Forme du § 40 BOI-IR-LIQ-20-10.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const mem = new Map();
const id = '12345678-1234-4123-a123-123456789012';
const cle = 'pf2.dgfip.boi.v1.' + id;
class DateFixe extends Date { constructor(...args) { super(...(args.length ? args : ['2027-10-14T12:00:00Z'])); } }
const ctx = vm.createContext({ Date: DateFixe, PF: { net: { auth: { utilisateur: () => ({ id }) } } },
    localStorage: { getItem: k => mem.get(k) || null, setItem: (k, v) => mem.set(k, v) } });
vm.runInContext(fs.readFileSync('app/src/main/assets/www/js/fiscal_dgfip_sources.js', 'utf8'), ctx);
const dg = ctx.PF.fiscalDgfipSources;
const entete = 'Identifiant juridique : BOI-IR-LIQ-20-10. ';
const annonce = an => `<p>Le barème pour l’imposition des revenus de l’année <b>${an}</b> est présenté dans le tableau suivant :</p>`;
const tableau = `<table><tr><th>Fraction de revenu imposable par part</th><th>Taux</th></tr>
<tr><td>N’excédant pas 11 600 €</td><td>0 %</td></tr>
<tr><td>Supérieure à 11 600 € et inférieure ou égale à 29 579 €</td><td>11 %</td></tr>
<tr><td>Supérieure à 29 579 € et inférieure ou égale à 84 577 €</td><td>30 %</td></tr>
<tr><td>Supérieure à 84 577 € et inférieure ou égale à 181 917 €</td><td>41 %</td></tr>
<tr><td>Supérieure à 181 917 €</td><td>45 %</td></tr></table>`;
const page = an => entete + annonce(an) + tableau;
assert.equal(dg.tableauIr(page(2025), 2025).tranches[0], 11600);
assert.equal(dg.tableauIr(page(2025), 2026), null);
assert.equal(dg.tableauIr(entete + annonce(2026) + annonce(2025) + tableau, 2026), null,
    'une annonce 2026 ne millésime pas le tableau 2025 suivant');
assert.equal(dg.tableauIr(entete + tableau + annonce(2026), 2026), null,
    'ne pas lire un tableau antérieur au titre');
assert.equal(dg.tableauIr(page(2025) + annonce(2026), 2026), null);
assert.equal(dg.tableauIr(page(2025) + annonce(2025) + tableau, 2025), null,
    'deux tableaux candidats : refuser au lieu de choisir arbitrairement');
assert.equal(dg.tableauIr(page(2025) + annonce(2026) + tableau.replaceAll('11 600', '12 000'), 2026).tranches[0], 12000,
    'le bon tableau est relu, pas celui du millésime précédent');
for (const modifie of [
    tableau.replace('11 %', '12 %'),
    tableau.replace('</table>', '<tr><td>Supérieure à 200 000 €</td><td>49 %</td></tr></table>'),
    tableau.replace('Supérieure à 11 600', 'Supérieure à 11 700'),
    tableau.replace('Supérieure à 181 917', 'Supérieure à 182 000'),
    tableau.replace('<td>30 %</td>', '<td>30 %</td><td>Autre régime</td>')
]) assert.equal(dg.tableauIr(entete + annonce(2025) + modifie, 2025), null,
    'changement de formule/structure ou discontinuité : refus');
const decote = 'Identifiant juridique : BOI-IR-LIQ-20-20-30. Pour l’imposition des revenus de 2025, cette décote est accordée aux contribuables dont la cotisation d’impôt brut est inférieure à 1 982 € pour les contribuables célibataires, divorcés ou veufs et à 3 277 € pour les contribuables soumis à imposition commune (soit respectivement 1/45,25 % de 897 € et 1/45,25 % de 1 483 €).';
assert.ok(dg.decote(decote, 2025));
assert.equal(dg.decote(decote.replaceAll('45,25', '44,25'), 2025), null);
assert.equal(dg.qf('Identifiant juridique : BOI-IR-LIQ-20-20-20. Parent isolé : 4 262 € pour le premier enfant en 2025.', 2025), null,
    'un plafond spécial ne devient pas le plafond général');

(async () => {
    let corps = page(2026);
    ctx.PF.net.req = async (_, url) => ({ ok: true, body: url.includes('20-10') ? corps : '' });
    await dg.chercher(2026);
    assert.equal(dg.lireCache(2026).ir, undefined, 'publication absente refusée');
    corps = 'Date de début de publication du BOI : 07/04/2027. ' + page(2026);
    await dg.chercher(2026);
    assert.equal(dg.lireCache(2026).ir.tranches[0], 11600);
    assert.equal(dg.lireCache(2026).sources.ir.datePublication, '07/04/2027');
    const avant = JSON.parse(mem.get(cle));
    const extrait = avant[2026].at(-1).ir.extrait;
    assert.match(extrait, /2027/);
    assert.match(extrait, /inférieure ou égale/);
    assert.equal((extrait.match(/<table>/g) || []).length, 1);
    corps = corps.replaceAll('11 600', '12 000');
    await dg.chercher(2026);
    assert.equal(dg.lireCache(2026).ir.tranches[0], 12000);
    const apres = JSON.parse(mem.get(cle));
    assert.equal(apres[2026].length, avant[2026].length + 1);
    assert.deepEqual(apres[2026].slice(0, -1), avant[2026], 'historique intact');
    corps = page(2025);
    await dg.chercher(2026);
    assert.equal(dg.lireCache(2026).ir, undefined, 'retrait de preuve sans repli antérieur');
    const data = JSON.parse(mem.get(cle));
    data[2026].at(-1).ir = { url: dg.url('ir', 2026), extrait: page(2026), datePublication: '07/04/2027' };
    mem.set(cle, JSON.stringify(data));
    assert.equal(dg.lireCache(2026).ir, null, 'métadonnée de publication seule sans passage ne suffit pas');
    console.log('BOFiP : liaison année/tableau, formules, publication et historique contrôlés');
})().catch(e => { console.error(e); process.exitCode = 1; });
