/* Libellé réel de l'aide « Plus-values et gains divers » du simulateur IR-IFI,
   millésime 2024 (revenus 2023), relu à distance le 14/10/2026 :
   https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/gains.htm
   Transcrit ici hors réseau (balisage simplifié, le lecteur ne fait que retirer
   les balises) pour vérifier que :
     - la page officielle des revenus 2023 est bien acceptée telle quelle,
       avec PS 17,2 % et PFU 30 % ;
     - elle est refusée si on demande une autre année (aucune reconduction) ;
     - les paragraphes supplémentaires propres à 2023 (cases 3VG/3VH, moins-values
       reportables, déclaration 2074-CMV) ne perturbent pas la lecture.
   Les assertions portent uniquement sur les taux, l'année et la case 2OP. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const ctx = vm.createContext({
    PF: { net: { auth: { utilisateur: () => ({ id: '12345678-1234-4123-a123-123456789012' }) },
        req: async () => ({ ok: true, body: '' }) } },
    localStorage: { getItem: () => null, setItem: () => {} },
    Date, Promise, Number, Object, String, JSON, Math, Array, Error
});
vm.runInContext(fs.readFileSync(path.join(dir, 'fiscal_regimes_sources.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'fiscal_couverture.js'), 'utf8'), ctx);
const src = ctx.PF.fiscalRegimesSources;
const C = ctx.PF.fiscalCouverture;

const aide2023 = `<table><tr><td>Les plus-values de cession de valeurs mobilières réalisées depuis le 1er janvier 2018 sont soumises,<br>lors de leur imposition, à <b>un prélèvement forfaitaire unique (PFU)</b> de 12,8&#160;% auquel<br>s'ajoutent les prélèvements sociaux de 17,2&#160;% soit au total un taux de <b>30&#160;%</b>.<br>Cependant vous pouvez opter, lors de la déclaration de revenus, pour une imposition globale de ces revenus et gains au barème progressif<br>de l'impôt sur le revenu en cochant la <b>case 2OP</b>.<br><b>Gains de cession de valeurs mobilières, droits sociaux et gains assimilés</b><br>Si, en 2023, vous ou les membres de votre foyer fiscal avez vendu des valeurs mobilières, des droits<br>sociaux et titres assimilés, si vous avez perçu des distributions effectuées par certaines structures.<br>Vous indiquez en case 3VG le montant des plus-values avant abattement lorsque l'abattement pour<br>durée de détention de droit commun s'applique ; les moins-values sont portées en case 3VH et<br>reportables sur dix ans.<br>Les plus-values réalisées en 2023 peuvent être réduites des moins-values en report.<br>Le mécanisme d’abattements qui existe pour certains gains en tenant compte de la durée de détention des titres cédés s'applique uniquement pour les titres acquis ou souscrit avant le<br>1er janvier 2018 en cas d'option pour le barème progressif.<br>Si vous êtes dispensé du dépôt de la déclaration 2074, la déclaration 2074-CMV peut suffire.</td></tr></table>`;

// 1. La page officielle des revenus 2023 est acceptée, avec ses propres taux.
const t = src.lireTitres(aide2023, 2023);
assert.ok(t, 'aide gains.htm du millésime 2024 lue pour les revenus 2023');
assert.equal(t.ir, .128, 'IR 12,8 %');
assert.equal(t.ps, .172, 'PS 17,2 % pour les revenus 2023');
assert.equal(t.pfu, .30, 'PFU 30 %');

// 2. Aucun report silencieux : la même page est refusée pour une autre année.
assert.equal(src.lireTitres(aide2023, 2024), null, 'refus d’attribuer la page 2023 aux revenus 2024');
assert.equal(src.lireTitres(aide2023, 2025), null, 'refus d’attribuer la page 2023 aux revenus 2025');

// 3. Les variantes typographiques observées en production restent acceptées.
assert.equal(src.lireTitres(aide2023.replaceAll('1er janvier 2018', '1<sup>er</sup> janvier 2018'), 2023).ps, .172,
    'date coupée par une balise d’exposant');
assert.equal(src.lireTitres(aide2023.replace('Si, en 2023', 'Si, en <b>2023</b>'), 2023), null,
    'balise entre l’année et la virgule : refus conservateur plutôt que mauvaise attribution');
assert.equal(src.lireTitres(aide2023.replace('Si, en 2023', 'Si, au cours de l’année'), 2023), null,
    'sans attribution explicite à l’année 2023, la page n’établit rien');

// 4. La même page, chargée par le collecteur, devient une preuve de millésime.
(async () => {
    const storage = new Map();
    const ctx2 = vm.createContext({
        PF: { net: { auth: { utilisateur: () => ({ id: '12345678-1234-4123-a123-123456789012' }) },
            req: async (_, url) => ({ ok: true, body: String(url).includes('/2024/') ? aide2023 : '' }) } },
        localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
        Date, Promise, Number, Object, String, JSON, Math, Array, Error
    });
    vm.runInContext(fs.readFileSync(path.join(dir, 'fiscal_regimes_sources.js'), 'utf8'), ctx2);
    const s2 = ctx2.PF.fiscalRegimesSources;
    const r = await s2.chercher(2023);
    assert.equal(r.enregistree, true, 'preuve 2023 enregistrée : ' + r.etat);
    assert.equal(s2.lireCache(2023).ps, .172);

    // 5. La matrice ne s'appuie que sur la preuve collectée, pas sur la transcription.
    const m = C.matrice({ 2023: { titres: r.valeurs, urls: { gains: r.url || null } } });
    const cel = m.cellules[2023].ps_titres;
    assert.equal(cel.statut, C.STATUTS.ETABLI, 'case PS titres revenus 2023 établie');
    assert.equal(cel.valeur, .172);
    assert.equal(cel.anneeEffet, 2023, 'effet rattaché à l’année des revenus, pas à celle de la déclaration');
    assert.equal(m.cellules[2024].ps_titres.statut, C.STATUTS.NON_DISPONIBLE,
        'les revenus 2024 ne profitent pas de la page 2023');
    assert.equal(m.cellules[2025].ps_titres.statut, C.STATUTS.NON_DISPONIBLE);

    // 6. La vérification distante consignée correspond à la même source.
    const v = C.verificationsDistantes(2023, 'ps_titres');
    assert.equal(v.length, 1);
    assert.equal(v[0].url, 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/gains.htm');
    assert.match(v[0].constate, /17,2 %/);
    assert.match(v[0].constate, /Si, en 2023/);
    assert.match(v[0].portée, /établi/);
    // 2024 : corroboration seulement, l'aide gains du millésime 2025 n'a pas été relue.
    const v24 = C.verificationsDistantes(2024, 'ps_titres')[0];
    assert.match(v24.portée, /corroboration seulement/);
    assert.ok(v24.limite, 'la limite de la vérification 2024 est explicite');

    console.log('OK — libellé réel revenus 2023 (17,2 %/30 %) accepté, autre année refusée, '
        + 'vérifications distantes cohérentes');
})();
