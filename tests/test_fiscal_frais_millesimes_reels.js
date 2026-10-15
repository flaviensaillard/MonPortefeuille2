/* Valeurs RÉELLES des aides « Déduction des frais professionnels » du simulateur
   IR-IFI, relues à distance le 15/10/2026 :
     revenus 2023 — millésime déclaration 2024
     https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/frais.htm
     revenus 2024 — millésime déclaration 2025 (accès direct en échec, texte lu
     par indexation, extrait tronqué)
     https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/frais.htm

   Objectif : recouper le moteur embarqué avec la source du millésime, sans
   réseau. La page officielle dit :
     - « Pour les revenus perçus en 2023, le minimum de déduction est de 495 €,
       le maximum de 14 171 € » ;
     - « les frais supplémentaires sont évalués à 5,20 € par repas »,
       « valeur du repas pris au foyer (évalué à 5,20 € pour 2023) » ;
     - barème automobiles 3 CV et moins : d × 0,529 / (d × 0,316) + 1 065 /
       d × 0,370 ; 4 CV : 0,606 / 0,340 + 1 330 / 0,407 ; 5 CV : 0,636 / 0,357
       + 1 395 / 0,427 ; 6 CV : 0,665 / 0,374 + 1 457 / 0,447 ; 7 CV et plus :
       0,697 / 0,394 + 1 515 / 0,470 ; seuils 5 000 et 20 000 km ;
       « Le barème pour les véhicules 100 % électriques correspond au barème
       applicable ci-dessous majoré de 20 % » ; arrêté du 27 mars 2023 (+5,4 %).

   La page des revenus 2024 dit : « Pour les revenus perçus en 2024, le minimum
   de déduction est de 504 €, le maximum de 14 426 € », frais « payés au cours de
   l'année 2024 », barème automobiles 3 CV et moins : d × 0,529 / (d × 0,316)
   + 1 065 / d × 0,370 ; 4 CV : 0,606 / 0,340 + 1 330 / 0,407 ; « Le barème pour
   les véhicules 100 % électriques correspond au barème applicable ci-dessous
   majoré de 20 % ». Son extrait indexé s'arrête avant les tranches 5 CV à 7 CV
   et avant le forfait repas : ces deux valeurs de 2024 ne sont PAS recoupées ici.

   Ce test vérifie que le code produit exactement les nombres officiels pour 2023
   (et, pour 2024, ceux qui ont pu être relus) — et qu'il ne les reporte sur
   aucune autre année. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const id = '12345678-1234-4123-a123-123456789012';
const stockage = new Map();
const URL_FRAIS_2023 = 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/frais.htm';
const URL_FRAIS_2024 = 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/frais.htm';

// Valeurs lues sur la page officielle des revenus 2023.
const OFFICIEL_2023 = {
    plancher: 495, plafond: 14171, repas: 5.2,
    seuils: [5000, 20000], majorationElectrique: .2,
    km: { 3: [.529, .316, 1065, .370], 4: [.606, .340, 1330, .407],
        5: [.636, .357, 1395, .427], 6: [.665, .374, 1457, .447],
        7: [.697, .394, 1515, .470] }
};

// Valeurs lues sur la page officielle des revenus 2024. `repas: null` et l'absence
// des tranches 5 à 7 CV ne sont pas des oublis : l'extrait indexé est tronqué, ces
// valeurs n'ont PAS été relues et ne sont donc pas recoupées ici.
const OFFICIEL_2024 = {
    plancher: 504, plafond: 14426, repas: null,
    seuils: [5000, 20000], majorationElectrique: .2,
    km: { 3: [.529, .316, 1065, .370], 4: [.606, .340, 1330, .407] }
};

const ctx = vm.createContext({
    PF: { ui: { h: String }, store: { reglages: () => ({}) },
        net: { auth: { utilisateur: () => ({ id }) }, req: async () => ({ ok: false }),
            reqPdf: async () => ({ ok: false }) } },
    localStorage: { getItem: k => (stockage.has(k) ? stockage.get(k) : null),
        setItem: (k, v) => stockage.set(k, v) },
    Date, Promise, Number, Object, String, JSON, Math, Array, Error, RegExp, isFinite
});
ctx.globalThis = ctx;
for (const f of ['util.js', 'fiscal.js', 'fiscal_couverture.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
ctx.PF.fiscalFraisSources = { lireCache: () => null,
    KM: an => 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/' + (an + 1) + '/aides/frais.htm',
    repasUrl: an => (an <= 2024 ? ctx.PF.fiscalFraisSources.KM(an) : 'https://www.impots.gouv.fr/particulier/frais-de-repas') };
ctx.PF.fiscalRegimesSources = { lireCache: () => null,
    url: an => 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/' + (an + 1) + '/aides/gains.htm' };
const F = ctx.PF.fiscal;
const C = ctx.PF.fiscalCouverture;

// ------------------------------------------------- 1. abattement 10 % de 2023
assert.equal(F.abattement10(3000, 2023), OFFICIEL_2023.plancher,
    'plancher officiel 495 € appliqué quand 10 % est inférieur');
assert.equal(F.abattement10(200000, 2023), OFFICIEL_2023.plafond,
    'plafond officiel 14 171 € appliqué quand 10 % le dépasse');
assert.equal(F.abattement10(10000, 2023), 1000, '10 % entre plancher et plafond');
assert.equal(F.abattement10(0, 2023), 0);

// ------------------------------------------------------ 2. forfait repas 2023
assert.equal(F.forfaitRepas(2023), OFFICIEL_2023.repas, '5,20 € par repas en 2023');
assert.equal(F.fraisRepas(200, 2023).montant, 1040, '200 j × 5,20 €');
assert.equal(F.fraisRepas(0, 2023).montant, 0);

// ------------------------------------------ 3. barème kilométrique revenus 2023
const km = (d, cv, elec) => F.fraisKilometriques(d, cv, !!elec, 2023).montant;
Object.keys(OFFICIEL_2023.km).forEach(cvStr => {
    const cv = Number(cvStr), f = OFFICIEL_2023.km[cvStr];
    assert.equal(km(4000, cv), Math.round(4000 * f[0] * 100) / 100, `${cv} CV, tranche ≤ 5 000 km`);
    assert.equal(km(10000, cv), Math.round((10000 * f[1] + f[2]) * 100) / 100, `${cv} CV, 5 001–20 000 km`);
    assert.equal(km(25000, cv), Math.round(25000 * f[3] * 100) / 100, `${cv} CV, au-delà de 20 000 km`);
});
// Seuils et majoration électrique de la page officielle.
assert.equal(km(5000, 3), Math.round(5000 * .529 * 100) / 100, 'seuil bas inclus dans la 1re tranche');
assert.equal(km(5001, 3), Math.round((5001 * .316 + 1065) * 100) / 100, 'seuil bas + 1 km');
assert.equal(km(20000, 3), Math.round((20000 * .316 + 1065) * 100) / 100, 'seuil haut inclus');
assert.equal(km(20001, 3), Math.round(20001 * .370 * 100) / 100, 'seuil haut + 1 km');
assert.equal(km(4000, 3, true), Math.round(4000 * .529 * 1.2 * 100) / 100,
    'véhicule 100 % électrique : barème majoré de 20 %');
assert.match(F.fraisKilometriques(4000, 3, true, 2023).formule, /électrique/);

// ------------------------------- 3 bis. revenus 2024 : ce qui a pu être relu
assert.equal(F.abattement10(3000, 2024), OFFICIEL_2024.plancher,
    'plancher officiel 504 € des revenus 2024');
assert.equal(F.abattement10(200000, 2024), OFFICIEL_2024.plafond,
    'plafond officiel 14 426 € des revenus 2024');
assert.equal(F.abattement10(10000, 2024), 1000);
const km24 = (d, cv, elec) => F.fraisKilometriques(d, cv, !!elec, 2024).montant;
Object.keys(OFFICIEL_2024.km).forEach(cvStr => {
    const cv = Number(cvStr), f = OFFICIEL_2024.km[cvStr];
    assert.equal(km24(4000, cv), Math.round(4000 * f[0] * 100) / 100, `2024 · ${cv} CV, ≤ 5 000 km`);
    assert.equal(km24(10000, cv), Math.round((10000 * f[1] + f[2]) * 100) / 100, `2024 · ${cv} CV, 5 001–20 000 km`);
    assert.equal(km24(25000, cv), Math.round(25000 * f[3] * 100) / 100, `2024 · ${cv} CV, > 20 000 km`);
});
assert.equal(km24(4000, 3, true), Math.round(4000 * .529 * 1.2 * 100) / 100,
    '2024 · électrique majoré de 20 %');
// Le code porte un forfait repas 2024 et les tranches 5 à 7 CV, mais AUCUNE source
// relue ne les confirme : ce test fige le code, il ne prouve pas la valeur.
assert.equal(F.forfaitRepas(2024), 5.35, 'valeur embarquée NON recoupée par une source au 15/10/2026');
assert.equal(km24(10000, 7), Math.round((10000 * .394 + 1515) * 100) / 100,
    '7 CV 2024 : valeur embarquée NON recoupée (extrait indexé tronqué)');
assert.notEqual(F.forfaitRepas(2024), F.forfaitRepas(2023),
    'le forfait repas n’est pas reconduit d’une année sur l’autre');

// ------------------------------- 4. aucune de ces valeurs ne sert une autre année
assert.equal(F.forfaitRepas(2026), null, 'pas de forfait repas inventé pour 2026');
assert.equal(F.fraisRepas(100, 2026).montant, 0);
assert.match(F.fraisRepas(100, 2026).formule, /non calculé/);
assert.throws(() => F.fraisKilometriques(4000, 3, false, 2026), /non disponible/,
    'barème 2026 refusé sans preuve collectée');
assert.throws(() => F.abattement10(10000, 2027), /Aucun abattement 10 %/);
assert.throws(() => F.fraisKilometriques(4000, 3, false, 2027), /Aucun barème kilométrique/);

// ------------------------------- 5. la preuve collectée ne vaut que son millésime
// Pour les revenus <= 2024, repasUrl(annee) === KM(annee) : le forfait repas et
// le barème km se lisent sur la même page d'aide du millésime.
const preuve = (an, off, url) => ({ frais: { abatt: { min: off.plancher, max: off.plafond },
    repas: off.repas === null ? undefined : off.repas, km: off.km }, urls: { frais: url, repas: url } });
// 2023 seul : la page 2024 n'est pas collectée, donc rien pour 2024.
const m = C.matrice({ 2023: preuve(2023, OFFICIEL_2023, URL_FRAIS_2023) });
const ST = C.STATUTS;
[['frais_abattement', { min: 495, max: 14171 }], ['frais_repas', 5.2], ['frais_km', null]].forEach(([cat, val]) => {
    const cel = m.cellules[2023][cat];
    assert.equal(cel.statut, ST.ETABLI, `revenus 2023 · ${cat} établi par la page du millésime`);
    assert.equal(cel.anneeEffet, 2023);
    assert.equal(cel.source, URL_FRAIS_2023);
    if (val !== null) assert.equal(JSON.stringify(cel.valeur), JSON.stringify(val));
});
['frais_abattement', 'frais_repas', 'frais_km'].forEach(cat => {
    [2024, 2025, 2026].forEach(an => assert.equal(m.cellules[an][cat].statut, ST.NON_DISPONIBLE,
        `revenus ${an} · ${cat} : la page des revenus 2023 ne profite à aucune autre année`));
});
assert.equal(m.synthese.basculeComplete, false);

// Les deux millésimes collectés : chaque colonne porte SA page et SES valeurs.
const m2 = C.matrice({ 2023: preuve(2023, OFFICIEL_2023, URL_FRAIS_2023),
    2024: preuve(2024, OFFICIEL_2024, URL_FRAIS_2024) });
assert.equal(m2.cellules[2024].frais_abattement.statut, ST.ETABLI);
assert.equal(JSON.stringify(m2.cellules[2024].frais_abattement.valeur),
    JSON.stringify({ min: 504, max: 14426 }), 'valeurs 2024, pas celles de 2023');
assert.equal(m2.cellules[2024].frais_abattement.source, URL_FRAIS_2024);
assert.equal(m2.cellules[2024].frais_abattement.anneeEffet, 2024);
assert.equal(JSON.stringify(m2.cellules[2023].frais_abattement.valeur),
    JSON.stringify({ min: 495, max: 14171 }), 'la colonne 2023 garde ses valeurs');
// Forfait repas 2024 non collecté (non relu) : la case reste non disponible.
assert.equal(m2.cellules[2024].frais_repas.statut, ST.NON_DISPONIBLE,
    'un forfait repas non relu n’établit pas la case 2024');
assert.equal(m2.cellules[2024].frais_km.statut, ST.ETABLI, 'barème 2024 lu, même partiellement');
[2025, 2026].forEach(an => ['frais_abattement', 'frais_repas', 'frais_km'].forEach(cat =>
    assert.equal(m2.cellules[an][cat].statut, ST.NON_DISPONIBLE, `revenus ${an} · ${cat} inchangé`)));
assert.equal(m2.synthese.basculeComplete, false);

// ------------------------- 6. les vérifications distantes disent la même chose
const v2023 = C.verificationsDistantes(2023, 'frais_abattement');
assert.ok(v2023.some(x => x.url === URL_FRAIS_2023 && /495 €/.test(x.constate) && /14 171 €/.test(x.constate)),
    'abattement 2023 tracé avec ses valeurs officielles');
const vRepas = C.verificationsDistantes(2023, 'frais_repas');
assert.ok(vRepas.some(x => /5,20 € par repas/.test(x.constate)), 'forfait repas 2023 tracé');
const vKm = C.verificationsDistantes(2023, 'frais_km');
assert.ok(vKm.some(x => /d × 0,529/.test(x.constate) && /majoré de 20 %/.test(x.constate)),
    'barème kilométrique 2023 tracé');
assert.match(vKm.find(x => x.url === URL_FRAIS_2023).portée, /hypothèse embarquée cesse d’en être une/);
assert.match(vKm.find(x => x.url === URL_FRAIS_2023).portée, /reste une hypothèse recopiée pour 2022, 2024/);
// La famille 'frais' couvre les trois cases, sans déborder sur les autres.
const v2024 = C.verificationsDistantes(2024, 'frais_repas').filter(x => x.categorie === 'frais');
assert.equal(v2024.length, 1, 'la lecture des frais 2024 est visible pour les trois cases frais');
assert.equal(v2024[0].url, URL_FRAIS_2024);
assert.match(v2024[0].constate, /revenus perçus en 2024/);
assert.match(v2024[0].constate, /504 €/);
assert.match(v2024[0].constate, /14 426 €/);
assert.match(v2024[0].portée, /PLANCHER_ABATTEMENT_10\[2024\] = 504/);
assert.match(v2024[0].limite, /accès direct en échec/, 'le mode de lecture est dit');
assert.match(v2024[0].limite, /forfait repas 2024 et les tranches 5 CV à 7 CV/, 'ce qui n’a pas été relu est nommé');
assert.match(v2024[0].limite, /reste non recoupé/);
assert.equal(C.verificationsDistantes(2024, 'ps_titres').filter(x => x.categorie === 'frais').length, 0,
    'la famille frais ne déborde pas sur les autres catégories');
assert.equal(C.verificationsDistantes(2023, 'frais_km').length >= 1, true);

console.log('OK — frais 2023 (495/14 171 €, 5,20 €, barème km 3–7 CV) et frais 2024 '
    + '(504/14 426 €, barème 3–4 CV) recoupés avec les pages officielles ; repas 2024 et 5–7 CV '
    + '2024 non recoupés, aucune valeur reportée d’une année sur l’autre');
