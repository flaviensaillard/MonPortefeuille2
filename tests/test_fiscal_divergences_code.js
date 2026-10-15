/* Divergences entre valeurs EMBARQUÉES et BOFiP (constat du 16/10/2026) :
   le registre cite la source exacte que lit l'application, il ne modifie aucun
   chiffre du moteur, il est affiché tant que le millésime n'est pas collecté,
   et la R2 des revenus 2025 reste intacte. Hors réseau. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const stockage = new Map();
const ctx = vm.createContext({
    PF: { ui: { h: String }, store: { reglages: () => ({}) },
        net: { auth: { utilisateur: () => ({ id: 'test' }) }, req: async () => ({ ok: false }),
            reqPdf: async () => ({ ok: false }) } },
    localStorage: { getItem: k => (stockage.has(k) ? stockage.get(k) : null),
        setItem: (k, v) => stockage.set(k, v) },
    Date, Promise, Number, Object, String, JSON, Math, Array, Error, RegExp, isFinite
});
ctx.globalThis = ctx;
for (const f of ['util.js', 'fiscal.js', 'fiscal_couverture.js', 'fiscal_dgfip_sources.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
ctx.PF.fiscalFraisSources = { lireCache: () => null,
    KM: an => 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/' + (an + 1) + '/aides/frais.htm',
    repasUrl: an => (an <= 2024 ? ctx.PF.fiscalFraisSources.KM(an) : 'https://www.impots.gouv.fr/particulier/frais-de-repas') };
ctx.PF.fiscalRegimesSources = { lireCache: () => null,
    url: an => 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/' + (an + 1) + '/aides/gains.htm' };

const C = ctx.PF.fiscalCouverture;
const f = ctx.PF.fiscal;
const src = ctx.PF.fiscalDgfipSources;
const { ETABLI, NON_DISPONIBLE } = C.STATUTS;
const json = x => JSON.stringify(x);

// ------------------------------------------------------------- contenu du registre
const div = C.divergences();
assert.equal(div.length, 4, 'quatre divergences constatées');
assert.equal(json(div.map(d => d.id)),
    json(['decote_2023', 'bareme_2024', 'decote_2024', 'qf_2024']));
assert.equal(json(div.map(d => d.anneeRevenus)), json([2023, 2024, 2024, 2024]));
assert.equal(json(div.map(d => d.categorie)),
    json(['decote', 'ir_bareme', 'decote', 'qf_general']));
assert.equal(C.divergences(2023).length, 1);
assert.equal(C.divergences(2024).length, 3);
assert.equal(C.divergences(2025).length, 0, 'revenus 2025 : recoupés BOFiP, aucune divergence');
assert.equal(C.divergences(2026).length, 0, 'revenus 2026 : rien n’est publié, rien à comparer');
assert.equal(C.divergences(2024, 'qf_general').length, 1, 'filtre par catégorie');
assert.equal(C.divergences(2024, 'decote').length, 1);

const CHAMPS = ['id', 'categorie', 'doc', 'anneeRevenus', 'url', 'publication', 'finPublication',
    'loi', 'texteOfficiel', 'officiel', 'embarque', 'ecart', 'ecartCourt', 'effet', 'arbitrage'];
div.forEach(d => CHAMPS.forEach(k =>
    assert.ok(d[k] !== undefined && d[k] !== null && d[k] !== '', `${d.id} : champ ${k} renseigné`)));

// La source citée est EXACTEMENT celle que l'application construit pour ce millésime.
div.forEach(d => {
    assert.equal(d.url, src.url(d.doc, d.anneeRevenus),
        `${d.id} : permalien identique à celui que lit fiscal_dgfip_sources.url('${d.doc}', ${d.anneeRevenus})`);
    assert.match(d.url, /^https:\/\/bofip\.impots\.gouv\.fr\/bofip\/\d+-PGP\.html\/identifiant=BOI-IR-LIQ-20-/);
    assert.match(d.publication, /^\d{4}-\d{2}-\d{2}$/, `${d.id} : date de publication`);
    assert.match(d.finPublication, /^\d{4}-\d{2}-\d{2}$/, `${d.id} : fin de publication`);
    assert.ok(d.finPublication > d.publication, `${d.id} : version en vigueur après sa publication`);
    assert.match(d.texteOfficiel, /«/, `${d.id} : passage probant cité`);
    assert.ok(d.texteOfficiel.includes(String(d.anneeRevenus)),
        `${d.id} : le passage cite l’année des revenus ${d.anneeRevenus}`);
    assert.notEqual(json(d.officiel), json(d.embarque),
        `${d.id} : une divergence enregistrée doit en être une`);
    assert.match(d.arbitrage, /collecte|remplace|vérifie|sourcée/,
        `${d.id} : l’arbitrage dit qui corrige la valeur`);
});

// Publication cohérente avec le millésime de la matrice (18/06/2024 ↔ 2024-06-18).
div.forEach(d => {
    const m = C.millésime(d.anneeRevenus);
    assert.ok(m, `${d.id} : millésime connu`);
    const iso = d.publication.split('-').reverse().join('/');
    assert.equal(iso, m.publicationBoi,
        `${d.id} : la publication citée est celle du millésime revenus ${d.anneeRevenus}`);
});

// --------------------------------------- le registre décrit le moteur, il ne le change pas
const embarqueMoteur = d => {
    const b = f.baremeDe(d.anneeRevenus);
    if (d.doc === 'ir') return { tranches: b.tranches };
    if (d.doc === 'decote') return { dc: b.dc, dcPlafond: b.dcPlafond, dcCouple: b.dcCouple,
        dcPlafondCouple: b.dcPlafondCouple };
    return { qf: f.plafondQF(d.anneeRevenus) };
};
div.forEach(d => assert.equal(json(embarqueMoteur(d)), json(d.embarque),
    `${d.id} : la valeur « embarquée » du registre est bien celle qu’utilise le moteur`));

// Aucune constante n'a été modifiée par l'ajout du registre : les valeurs
// historiques restent celles que les autres suites figent.
assert.equal(f.baremeDe(2024).tranches[0], 11520, 'aucun recopiage historique sans BOFiP');
assert.equal(f.baremeDe(2024).tranches.join(','), '11520,29370,83984,180648');
assert.equal(f.baremeDe(2023).dc, 906);
assert.equal(f.baremeDe(2023).dcCouple, 1493);
assert.equal(f.baremeDe(2024).dc, 924);
assert.equal(f.baremeDe(2024).dcCouple, 1523);
assert.equal(f.plafondQF(2024), 1759);
assert.equal(f.plafondQF(2023), 1759);

// Valeurs officielles attendues, telles que citées par le BOFiP.
const off = id => C.divergences().find(d => d.id === id).officiel;
assert.equal(json(off('bareme_2024').tranches), json([11497, 29315, 83823, 180294]));
assert.equal(json(off('decote_2023')), json({ dc: 873, dcPlafond: 1929, dcCouple: 1444, dcPlafondCouple: 3191 }));
assert.equal(json(off('decote_2024')), json({ dc: 889, dcPlafond: 1965, dcCouple: 1470, dcPlafondCouple: 3249 }));
assert.equal(off('qf_2024').qf, 1791);
// Cohérence interne de la décote officielle : seuil = base / 45,25 %.
['decote_2023', 'decote_2024'].forEach(id => {
    const o = off(id);
    assert.ok(Math.abs(o.dc / 0.4525 - o.dcPlafond) < 1, `${id} : seuil célibataire = base / 45,25 %`);
    assert.ok(Math.abs(o.dcCouple / 0.4525 - o.dcPlafondCouple) < 1, `${id} : seuil couple = base / 45,25 %`);
});

// ---------------------------------------------------- affichage tant que non collecté
const vide = C.matrice({});
[['decote', 2023, '873'], ['ir_bareme', 2024, '11 497'], ['decote', 2024, '889'],
    ['qf_general', 2024, '1 791']].forEach(([cat, an, valeurOfficielle]) => {
    const c = vide.cellules[an][cat];
    assert.equal(c.statut, NON_DISPONIBLE, `revenus ${an} · ${cat} : rien d’établi sans collecte`);
    assert.match(c.note, /DIVERGENTE du BOFiP/, `revenus ${an} · ${cat} : divergence affichée`);
    assert.ok(c.note.includes(valeurOfficielle),
        `revenus ${an} · ${cat} : la valeur officielle ${valeurOfficielle} est nommée`);
    assert.match(c.note, /la collecte du millésime revenus \d{4} la remplace/);
    assert.equal(c.valeur, null, 'aucune valeur présentée comme officielle');
    assert.equal(c.source, null);
});
// Les cases sans divergence constatée ne portent pas l'alerte.
assert.ok(!/DIVERGENTE/.test(vide.cellules[2023].ir_bareme.note),
    'barème 2023 : identique au BOFiP, aucune alerte');
assert.ok(!/DIVERGENTE/.test(vide.cellules[2023].qf_general.note),
    'plafond QF 2023 : identique au BOFiP, aucune alerte');
assert.ok(!/DIVERGENTE/.test(vide.cellules[2025].decote.note), 'revenus 2025 : recoupés');
assert.ok(!/DIVERGENTE/.test(vide.cellules[2026].ir_bareme.note),
    'revenus 2026 : non publiés, rien à comparer');
assert.match(vide.cellules[2026].ir_bareme.note, /non publiés/);

const texte = C.texte(vide);
assert.match(texte, /Valeurs embarquées divergentes du BOFiP \(constat du 16\/10\/2026\)/);
assert.match(texte, /revenus 2023 → 1, revenus 2024 → 3/);
assert.match(texte, /Elles ne sont PAS corrigées ici/);
const detail2024 = C.texteDetail(vide, 2024);
assert.match(detail2024, /DIVERGENTE du BOFiP/);
assert.match(detail2024, /1 791/);

// ------------------------------------------- la collecte du millésime corrige la case
const preuves2024 = { boi: {
    ir: { tranches: [11497, 29315, 83823, 180294], taux: [0.11, 0.30, 0.41, 0.45] },
    decote: { dc: 889, dcPlafond: 1965, dcCouple: 1470, dcPlafondCouple: 3249 },
    qf: 1791,
    sources: {
        ir: { url: src.url('ir', 2024), datePublication: '14/04/2025' },
        decote: { url: src.url('decote', 2024), datePublication: '14/04/2025' },
        qf: { url: src.url('qf', 2024), datePublication: '14/04/2025' }
    }
} };
const apres = C.evaluer(2024, preuves2024);
['ir_bareme', 'decote', 'qf_general'].forEach(cat => {
    const c = apres[cat];
    assert.equal(c.statut, ETABLI, `revenus 2024 · ${cat} : établi après collecte`);
    assert.ok(!/DIVERGENTE/.test(c.note), `revenus 2024 · ${cat} : l’alerte disparaît une fois la source lue`);
    assert.equal(c.source, src.url(cat === 'ir_bareme' ? 'ir' : cat === 'decote' ? 'decote' : 'qf', 2024));
    assert.equal(c.anneeEffet, 2024);
});
assert.equal(json(apres.qf_general.valeur), '1791');
assert.equal(json(apres.ir_bareme.valeur.tranches), json([11497, 29315, 83823, 180294]));
// Une collecte 2024 ne corrige rien pour 2023, et réciproquement.
const avant2023 = C.evaluer(2023, {});
assert.equal(avant2023.decote.statut, NON_DISPONIBLE);
assert.match(avant2023.decote.note, /DIVERGENTE du BOFiP/);
assert.match(avant2023.decote.note, /873\/1 444 € officiels/, 'la valeur officielle 2023 reste nommée');

// ------------------------------------------------- non-régression R2 (revenus 2025)
assert.equal(f.baremeDe(2025).tranches.join(','), '11600,29579,84577,181917');
assert.equal(f.baremeDe(2025).dc, 897);
assert.equal(f.baremeDe(2025).dcPlafond, 1982);
assert.equal(f.baremeDe(2025).dcCouple, 1483);
assert.equal(f.baremeDe(2025).dcPlafondCouple, 3277);
assert.equal(f.plafondQF(2025), 1807);
assert.equal(f.tauxPS(2025), 0.186);
const r2 = json(f.comparerOptionsFoyer(42000, 2, 2025, 'Marié(e) / Pacsé(e)', 1000, 500, true, 2000));
assert.ok(r2.length > 100, 'la comparaison 2OP/PFU des revenus 2025 reste calculable');
const r2bis = json(f.comparerOptionsFoyer(42000, 2, 2025, 'Marié(e) / Pacsé(e)', 1000, 500, true, 2000));
assert.equal(r2, r2bis, 'le registre des divergences ne change aucun calcul 2025');
assert.equal(C.synthese({ 2023: vide.cellules[2023], 2024: apres,
    2025: vide.cellules[2025], 2026: vide.cellules[2026] }).basculeComplete, false,
    'bascule DGFiP totale : non');

console.log('OK — divergences valeurs embarquées / BOFiP signalées, moteur inchangé');
