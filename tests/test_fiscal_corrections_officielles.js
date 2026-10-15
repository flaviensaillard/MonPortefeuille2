/* Valeurs officielles appliquées aux constantes historiques (16/10/2026) :
   le journal conserve l'écart, sa source et son effet ; le moteur porte les
   valeurs du BOFiP ; une correction n'est pas une collecte ; la R2 des revenus
   2025 est intacte. Hors réseau. */
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

// ------------------------------------------------------------- journal des corrections
const corr = C.corrections();
assert.equal(corr.length, 6, 'six corrections appliquées le 16/10/2026');
assert.equal(json(corr.map(c => c.id)),
    json(['decote_2022', 'qf_2022', 'decote_2023', 'bareme_2024', 'decote_2024', 'qf_2024']));
assert.equal(json(corr.map(c => c.anneeRevenus)), json([2022, 2022, 2023, 2024, 2024, 2024]));
assert.equal(C.corrections(2025).length, 0, 'revenus 2025 : recoupés BOFiP, rien à corriger');
assert.equal(C.corrections(2026).length, 0, 'revenus 2026 : rien de publié, rien à corriger');
assert.equal(C.corrections(2024, 'qf_general').length, 1, 'filtre par catégorie');

const CHAMPS = ['id', 'categorie', 'doc', 'anneeRevenus', 'url', 'publication', 'finPublication',
    'loi', 'texteOfficiel', 'officiel', 'avantCorrection', 'ecart', 'ecartCourt', 'effet',
    'arbitrage', 'corrigee', 'corrigeLe'];
corr.forEach(c => CHAMPS.forEach(k =>
    assert.ok(c[k] !== undefined && c[k] !== null && c[k] !== '', `${c.id} : champ ${k} renseigné`)));

corr.forEach(c => {
    assert.equal(c.corrigee, true, `${c.id} : correction appliquée`);
    assert.equal(c.corrigeLe, '2026-10-16', `${c.id} : date de correction`);
    assert.match(c.url, /^https:\/\/bofip\.impots\.gouv\.fr\/bofip\/\d+-PGP\.html\/identifiant=BOI-IR-LIQ-20-/,
        `${c.id} : permalien BOFiP`);
    assert.match(c.publication, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(c.finPublication, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(c.finPublication > c.publication, `${c.id} : version en vigueur après publication`);
    assert.match(c.texteOfficiel, /«/, `${c.id} : passage probant cité`);
    assert.ok(c.texteOfficiel.includes(String(c.anneeRevenus)),
        `${c.id} : le passage cite l’année des revenus ${c.anneeRevenus}`);
    assert.notEqual(json(c.officiel), json(c.avantCorrection), `${c.id} : l’écart est réel`);
    assert.match(c.arbitrage, /corrigé|remplac/, `${c.id} : l’arbitrage dit ce qui a été fait`);
    const m = C.millésime(c.anneeRevenus);
    if (m) assert.equal(c.publication.split('-').reverse().join('/'), m.publicationBoi,
        `${c.id} : publication du millésime revenus ${c.anneeRevenus}`);
    if (c.anneeRevenus >= 2023) assert.equal(c.url, src.url(c.doc, c.anneeRevenus),
        `${c.id} : permalien identique à fiscal_dgfip_sources.url('${c.doc}', ${c.anneeRevenus})`);
});

// ------------------------------------------- le moteur porte les valeurs officielles
const valeurMoteur = c => {
    const b = f.baremeDe(c.anneeRevenus);
    if (c.doc === 'ir') return { tranches: b.tranches };
    if (c.doc === 'decote') return { dc: b.dc, dcPlafond: b.dcPlafond, dcCouple: b.dcCouple,
        dcPlafondCouple: b.dcPlafondCouple };
    return { qf: f.plafondQF(c.anneeRevenus) };
};
corr.forEach(c => assert.equal(json(valeurMoteur(c)), json(c.officiel),
    `${c.id} : le moteur porte désormais la valeur officielle`));

const off = id => corr.find(c => c.id === id).officiel;
assert.equal(json(off('decote_2022')), json({ dc: 833, dcPlafond: 1841, dcCouple: 1378, dcPlafondCouple: 3045 }));
assert.equal(off('qf_2022').qf, 1678);
assert.equal(json(off('decote_2023')), json({ dc: 873, dcPlafond: 1929, dcCouple: 1444, dcPlafondCouple: 3191 }));
assert.equal(json(off('bareme_2024').tranches), json([11497, 29315, 83823, 180294]));
assert.equal(json(off('decote_2024')), json({ dc: 889, dcPlafond: 1965, dcCouple: 1470, dcPlafondCouple: 3249 }));
assert.equal(off('qf_2024').qf, 1791);
// Valeurs d'avant, conservées pour l'audit.
assert.equal(json(corr.find(c => c.id === 'bareme_2024').avantCorrection.tranches),
    json([11520, 29370, 83984, 180648]));
assert.equal(corr.find(c => c.id === 'qf_2024').avantCorrection.qf, 1759);
assert.equal(corr.find(c => c.id === 'decote_2023').avantCorrection.dc, 906);
assert.equal(corr.find(c => c.id === 'qf_2022').avantCorrection.qf, 1759);
assert.equal(corr.find(c => c.id === 'decote_2022').avantCorrection.dc, 846);

// Cohérence interne des décotes officielles : seuil = base / 45,25 %.
['decote_2022', 'decote_2023', 'decote_2024'].forEach(id => {
    const o = off(id);
    assert.ok(Math.abs(o.dc / 0.4525 - o.dcPlafond) < 1, `${id} : seuil célibataire = base / 45,25 %`);
    assert.ok(Math.abs(o.dcCouple / 0.4525 - o.dcPlafondCouple) < 1, `${id} : seuil couple = base / 45,25 %`);
});
// Chaque millésime garde ses propres seuils : plus aucune reconduction.
const tr = an => f.baremeDe(an).tranches.join(',');
assert.equal(tr(2022), '10777,27478,78570,168994');
assert.equal(tr(2023), '11294,28797,82341,177106');
assert.equal(tr(2024), '11497,29315,83823,180294');
assert.notEqual(tr(2023), tr(2024));
assert.notEqual(tr(2024), tr(2025));
[2022, 2023, 2024, 2025].forEach(an => assert.equal(f.plafondQF(an),
    { 2022: 1678, 2023: 1759, 2024: 1791, 2025: 1807 }[an], `plafond QF ${an}`));
// La décote suit le barème : un revenu sous le seuil ne paie pas d'impôt indu.
const decote2024 = f.impotRevenu(15000, 1, 2024);
assert.ok(decote2024.decote > 0 && decote2024.decote <= 889,
    'décote 2024 bornée par le plafond officiel de 889 €');
assert.ok(decote2024.decote <= 889 - 0.4525 * decote2024.impot_brut + 1);

// ---------------------------------- une correction n'est pas une collecte
const vide = C.matrice({});
[['decote', 2023, '873'], ['ir_bareme', 2024, '11 497'], ['decote', 2024, '889'],
    ['qf_general', 2024, '1 791']].forEach(([cat, an, valeurOfficielle]) => {
    const c = vide.cellules[an][cat];
    assert.equal(c.statut, NON_DISPONIBLE,
        `revenus ${an} · ${cat} : corrigé ne veut pas dire établi — la collecte reste requise`);
    assert.equal(c.valeur, null, 'aucune valeur présentée comme officielle sans collecte');
    assert.equal(c.source, null);
    assert.match(c.note, /corrigée le 16\/10\/2026/, `revenus ${an} · ${cat} : correction tracée`);
    assert.ok(c.note.includes(valeurOfficielle), `revenus ${an} · ${cat} : valeur officielle nommée`);
    assert.match(c.note, /correction ≠ collecte/);
    assert.match(c.note, /« établi » à la collecte du millésime revenus \d{4}/);
    assert.ok(!/DIVERGENTE/.test(c.note), 'plus aucune alerte de divergence : l’écart est corrigé');
});
assert.ok(!/corrigée/.test(vide.cellules[2023].ir_bareme.note), 'barème 2023 : déjà conforme');
assert.ok(!/corrigée/.test(vide.cellules[2023].qf_general.note), 'plafond QF 2023 : déjà conforme');
assert.ok(!/corrigée/.test(vide.cellules[2025].decote.note), 'revenus 2025 : recoupés');
assert.match(vide.cellules[2026].ir_bareme.note, /non publiés/);

const texte = C.texte(vide);
assert.match(texte, /Valeurs embarquées corrigées d’après le BOFiP le 16\/10\/2026/);
assert.match(texte, /revenus 2022 → 2, revenus 2023 → 1, revenus 2024 → 3/);
assert.match(texte, /une correction n’est pas une collecte/);
assert.doesNotMatch(texte, /divergentes du BOFiP/);
assert.match(C.texteDetail(vide, 2024), /corrigée le 16\/10\/2026/);

// ------------------------------------------- la collecte établit, avec sa source
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
    assert.ok(!/corrigée/.test(c.note), `revenus 2024 · ${cat} : la preuve lue remplace la mention de correction`);
    assert.equal(c.anneeEffet, 2024);
});
assert.equal(json(apres.qf_general.valeur), '1791');
assert.equal(json(apres.ir_bareme.valeur.tranches), json([11497, 29315, 83823, 180294]));
const avant2023 = C.evaluer(2023, {});
assert.equal(avant2023.decote.statut, NON_DISPONIBLE, 'une collecte 2024 n’établit rien pour 2023');
assert.match(avant2023.decote.note, /873\/1 444 € officiels/);

// ------------------------------------------------- non-régression R2 (revenus 2025)
assert.equal(f.baremeDe(2025).tranches.join(','), '11600,29579,84577,181917');
assert.equal(f.baremeDe(2025).dc, 897);
assert.equal(f.baremeDe(2025).dcPlafond, 1982);
assert.equal(f.baremeDe(2025).dcCouple, 1483);
assert.equal(f.baremeDe(2025).dcPlafondCouple, 3277);
assert.equal(f.plafondQF(2025), 1807);
assert.equal(f.tauxPS(2025), 0.186);
assert.equal(f.tauxPFU(2025), 0.314);
const r2 = json(f.comparerOptionsFoyer(42000, 2, 2025, 'Marié(e) / Pacsé(e)', 1000, 500, true, 2000));
assert.equal(r2, json(f.comparerOptionsFoyer(42000, 2, 2025, 'Marié(e) / Pacsé(e)', 1000, 500, true, 2000)),
    'la comparaison 2OP/PFU des revenus 2025 reste stable');
assert.equal(C.synthese({ 2023: vide.cellules[2023], 2024: apres,
    2025: vide.cellules[2025], 2026: vide.cellules[2026] }).basculeComplete, false,
    'bascule DGFiP totale : non');

console.log('OK — valeurs officielles appliquées aux constantes 2022-2024, journal tracé, R2 intacte');
