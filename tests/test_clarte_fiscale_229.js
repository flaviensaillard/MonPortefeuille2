/* 2.2.9 : chiffres de l'application d'abord, limites UNIQUEMENT si données
   absentes. Les montants conditionnels restent visibles sans devenir des
   valeurs certifiées du foyer. Aucun appel au réseau ni donnée personnelle. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const ctx = vm.createContext({
    Date, Number, String, Object, Array, Math, JSON, Promise, Error, RegExp,
    PF: { modele: { classeDe: ticker => ticker === 'BTC' ? 'crypto' : 'action_etf' },
        ui: { h: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;') },
        store: { reglages: () => ({}) } }
});
ctx.globalThis = ctx;
for (const f of ['util.js', 'fiscal.js', 'fiscal_formulaires_dgfip.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
const F = ctx.PF.fiscal, G = ctx.PF.fiscalFormulairesDgfip;
const tx = (ticker, type, date, quantite, cours) =>
    ({ ticker, type, date, quantite, cours, frais: 0, devise: 'EUR' });
const titres = F.detail2074([
    tx('X', 'achat', '2025-01-01', 2, 100),
    tx('X', 'vente', '2025-02-01', 1, 150),
    tx('X', 'vente', '2025-03-01', 1, 80)
], 2025, {});
const crypto = F.detail2086([
    tx('BTC', 'achat', '2025-01-01', 1, 100),
    tx('BTC', 'vente', '2025-06-01', 1, 200)
], 2025, {}, {});
function fiche(html, nom) {
    const a = html.indexOf('data-fisc-imprime="' + nom + '"');
    assert.notEqual(a, -1, nom);
    const b = html.indexOf('<details class="card fisc-imprime"', a + 1);
    return html.slice(a, b === -1 ? undefined : b);
}
const html = G.render(2025, {
    base: { case_1aj: 32000, case_1ak: null }, t2074: titres, t2086: crypto,
    reglages: { interetsEtrangers: 75 }, comptes: ['Compte <b>non fiable</b>']
});
assert.ok(html.indexOf('Vos chiffres dans l’application') < html.indexOf('data-fisc-imprime="2042"'));
assert.match(html, /<b>2074 · 903\/PV<\/b>[\s\S]*?50,00 €/);
assert.match(html, /<b>2074 · 903\/MV<\/b>[\s\S]*?20,00 €/);
assert.match(fiche(html, '2042 C'), /<b>3VG<\/b>[\s\S]*?30 €/);
assert.match(fiche(html, '2042 C'), /<b>3AN<\/b>[\s\S]*?<b class="dim">0 €<\/b>/);
assert.match(fiche(html, '2086'), /<b>224<\/b>[\s\S]*?100,00 €/);
assert.match(fiche(html, '2086'), /<b>51<\/b>[\s\S]*?200,00 €/);
assert.match(fiche(html, '2086'), /<b>52<\/b>[\s\S]*?100,00 €/);
assert.match(fiche(html, '2086'), /<b>52<\/b>[\s\S]*?projection si foyer = application/i);
assert.match(fiche(html, '2047'), /<b>252 → 2TR<\/b>[\s\S]*?75 €/);
assert.match(fiche(html, '2047'), /<b>250<\/b>[\s\S]*?75 €/);
assert.match(fiche(html, '2074-CMV'), /903 \/ PV[\s\S]*?50,00 €/);
assert.doesNotMatch(fiche(html, '2074-CMV'), /<b>21<\/b>|<b>25<\/b>/,
    'la CMV est un parcours alternatif, pas une recopie automatique');
assert.match(fiche(html, '3916 / 3916-bis'), /Compte &lt;b&gt;non fiable&lt;\/b&gt;/);
assert.doesNotMatch(fiche(html, '3916 / 3916-bis'), /<b>3\.1<\/b>|<b>4\.2<\/b>/,
    'pas de faux numéro ou date de compte rempli');
assert.doesNotMatch(html, /À compléter depuis vos justificatifs/);
const titreNonFiable = F.detail2074([
    tx('X"><img src=x onerror=alert(1)>', 'achat', '2025-01-01', 1, 100),
    tx('X"><img src=x onerror=alert(1)>', 'vente', '2025-02-01', 1, 150)
], 2025, {});
const renduNonFiable = G.render(2025, { t2074: titreNonFiable });
assert.doesNotMatch(renduNonFiable, /<img|data-fisc-cession="[^"]*"\s+onerror=/,
    'une désignation de titre ne doit devenir ni balise ni gestionnaire HTML');
assert.match(renduNonFiable, /X&quot;&gt;&lt;img/,
    'la valeur enregistrée reste lisible, mais échappée dans le HTML');

// Les achats avant 2018 n'autorisent pas à fabriquer 0 pour F/G/H/3SG.
const anciens = F.detail2074([
    tx('ANCIEN', 'achat', '2017-04-01', 1, 100),
    tx('ANCIEN', 'vente', '2025-06-01', 1, 150)
], 2025, {});
assert.equal(anciens.abattementsNonVerifies, true);
const guideAncien = G.render(2025, { t2074: anciens });
assert.match(guideAncien, /3SG.*aucun 0 € n’est présumé/);
assert.doesNotMatch(fiche(guideAncien, '2074'), /<b>1133 \/ 1 · [FGH]<\/b>/,
    'les colonnes non vérifiables sont regroupées dans une limite, pas préremplies');
assert.match(fiche(guideAncien, '2074'), /Abattements F\/G\/H non chiffrés/);

// Sans écriture de l'année, aucune case faussement chiffrée à zéro.
const vides = G.render(2025, { t2074: F.detail2074([], 2025, {}),
    t2086: F.detail2086([], 2025, {}, {}) });
assert.doesNotMatch(vides, /<b>(3VG|903 \/ PV|224|3AN)<\/b>/);
assert.doesNotMatch(vides, /À compléter depuis vos justificatifs/);
console.log('Clarté fiscale 2.2.9 : chiffres connus visibles, limites ciblées, foyer et années protégés : OK');
