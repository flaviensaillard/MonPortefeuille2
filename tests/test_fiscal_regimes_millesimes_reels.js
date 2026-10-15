/* Libellés RÉELS des aides « Plus-values et gains divers » du simulateur IR-IFI,
   relues à distance hors application et transcrites ici pour des tests hors
   réseau (balisage simplifié : le lecteur ne fait que retirer les balises) :

     revenus 2023 — millésime déclaration 2024, lue le 14/10/2026
     https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/gains.htm
     revenus 2024 — millésime déclaration 2025, lue le 15/10/2026
     https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/gains.htm

   Les deux pages portent PFU 12,8 % + PS 17,2 % = 30 % et datent explicitement
   leur année de revenus. Objectifs :
     - la page officielle de chaque millésime est acceptée telle quelle ;
     - aucune page n'est jamais attribuée à une autre année (pas de reconduction) ;
     - les paragraphes propres à chaque millésime (cases 3VG/3VH, moins-values
       reportables dix ans, 2074-CMV, profits sur instruments financiers à terme)
       ne perturbent pas la lecture ;
     - la collecte enregistrée ne remplit QUE la colonne de son année.
   Les assertions portent sur les taux, l'année, la case 2OP et la portée. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const COMPTE = '12345678-1234-4123-a123-123456789012';

// ------------------------------------------------------------------ documents
const aide2023 = `<table><tr><td>Les plus-values de cession de valeurs mobilières réalisées depuis le 1er janvier 2018 sont soumises,<br>lors de leur imposition, à <b>un prélèvement forfaitaire unique (PFU)</b> de 12,8&#160;% auquel<br>s'ajoutent les prélèvements sociaux de 17,2&#160;% soit au total un taux de <b>30&#160;%</b>.<br>Cependant vous pouvez opter, lors de la déclaration de revenus, pour une imposition globale de ces revenus et gains au barème progressif<br>de l'impôt sur le revenu en cochant la <b>case 2OP</b>.<br><b>Gains de cession de valeurs mobilières, droits sociaux et gains assimilés</b><br>Si, en 2023, vous ou les membres de votre foyer fiscal avez vendu des valeurs mobilières, des droits<br>sociaux et titres assimilés, si vous avez perçu des distributions effectuées par certaines structures.<br>Vous devez indiquer case 3VG le montant des plus-values après imputation, le cas échéant, des<br>moins-values de l’année et/ou des moins-values antérieures. Si vous bénéficiez de l’abattement pour<br>durée de détention de droit commun, vous devez porter en case 3VG le montant avant abattement.<br>Les moins-values sont reportées case 3VH et s'imputent sur les plus-values de même nature des dix<br>années suivantes. Les plus-values réalisées en 2023 peuvent être réduites des moins-values en report.<br>Le mécanisme d’abattements qui existe pour certains gains en tenant compte de la durée de détention des titres cédés s'applique uniquement pour les titres acquis ou souscrit avant le<br>1er janvier 2018 en cas d'option pour le barème progressif.<br>Si vous êtes dispensé du dépôt de la déclaration n° 2074, vous pouvez effectuer cette compensation<br>sur la fiche n° 2074-CMV.</td></tr></table>`;

const aide2024 = `<table><tr><td>Les plus-values de cession de valeurs mobilières réalisées depuis le 1er janvier 2018 sont soumises,<br>lors de leur imposition, à <b>un prélèvement forfaitaire unique (PFU)</b> de 12,8&#160;% auquel<br>s'ajoutent les prélèvements sociaux de 17,2&#160;% soit au total un taux de <b>30&#160;%</b>.<br>Cependant vous pouvez opter, lors de la déclaration de revenus, pour une imposition globale de ces revenus et gains au <b>barème progressif</b><br>de l'impôt sur le revenu en cochant la <b>case 2OP</b>.<br><b>Gains de cession de valeurs mobilières, droits sociaux et gains assimilés</b><br>Si, en 2024, vous ou les membres de votre foyer fiscal avez vendu des valeurs mobilières, des droits<br>sociaux et titres assimilés, si vous avez perçu des distributions effectuées par certaines<br>structures ou si vous avez réalisé des profits sur les instruments financiers à terme, les<br>gains et distributions réalisés, sont imposables au taux de 12,8 % (ou sur option au barème<br>progressif de l’impôt sur le revenu).<br>Le mécanisme d’abattements qui existe pour certains gains en tenant compte de la durée de<br>détention des titres cédés s'applique uniquement pour les titres acquis ou souscrit avant le<br>1er janvier 2018 en cas d'option pour le barème progressif.<br>Vous devez indiquer case 3VG le montant des plus-values après imputation, le cas échéant,<br>des moins-values de l’année et/ou des moins-values antérieures. Si vous bénéficiez<br>de l’abattement pour durée de détention de droit commun, vous devez porter en case 3VG, le montant avant abattement.<br><b>Les pertes de l’année et les pertes antérieures</b><br>Si après compensation entre les plus et moins-values de l'année, vous disposez d’une<br>moins-value, reportez le montant case 3VH. Ce montant pourra s'imputer sur les plus-values de même<br>nature des dix années suivantes.<br>Les plus-values réalisées en 2024 peuvent être réduites des moins-values en<br>report des dix années précédentes non encore imputées.<br>Si vous êtes dispensé du dépôt de la déclaration n° 2074,<br>vous pouvez effectuer cette compensation sur la fiche n° 2074-CMV, disponible sur impots.gouv.fr.</td></tr></table>`;

const PAGES = { 2023: aide2023, 2024: aide2024 };
const URLS = {
    2023: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/gains.htm',
    2024: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/gains.htm'
};
// Le collecteur construit l'URL à partir de l'année des revenus (déclaration an+1) :
// le bouchon réseau est donc indexé par URL, comme dans l'application.
const PAGES_PAR_URL = { [URLS[2023]]: aide2023, [URLS[2024]]: aide2024 };

function contexte(pages, stockage) {
    const ctx = vm.createContext({
        PF: { net: { auth: { utilisateur: () => ({ id: COMPTE }) },
            req: async (_, url) => ({ ok: true, status: 200, body: pages[String(url)] || '' }) } },
        localStorage: stockage || { getItem: () => null, setItem: () => {} },
        Date, Promise, Number, Object, String, JSON, Math, Array, Error, RegExp
    });
    vm.runInContext(fs.readFileSync(path.join(dir, 'fiscal_regimes_sources.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(dir, 'fiscal_couverture.js'), 'utf8'), ctx);
    return ctx;
}

// ------------------------------------------- 1. lecture directe des deux pages
const src = contexte(PAGES_PAR_URL).PF.fiscalRegimesSources;
const C = contexte(PAGES_PAR_URL).PF.fiscalCouverture;

[2023, 2024].forEach(an => {
    const t = src.lireTitres(PAGES[an], an);
    assert.ok(t, `aide du millésime déclaration ${an + 1} lue pour les revenus ${an}`);
    assert.equal(t.ir, .128, `revenus ${an} : IR 12,8 %`);
    assert.equal(t.ps, .172, `revenus ${an} : PS 17,2 % (et non 18,6 %)`);
    assert.equal(t.pfu, .30, `revenus ${an} : PFU 30 %`);
});

// ------------------------------------ 2. aucune attribution croisée d'une page
assert.equal(src.lireTitres(aide2023, 2024), null, 'page revenus 2023 refusée pour 2024');
assert.equal(src.lireTitres(aide2023, 2025), null, 'page revenus 2023 refusée pour 2025');
assert.equal(src.lireTitres(aide2024, 2023), null, 'page revenus 2024 refusée pour 2023');
assert.equal(src.lireTitres(aide2024, 2025), null, 'page revenus 2024 refusée pour 2025');
assert.equal(src.lireTitres(aide2023.replace('Si, en 2023', 'Si, au cours de l’année'), 2023), null,
    'sans attribution explicite de l’année, la page n’établit rien');
assert.equal(src.lireTitres(aide2024.replace('Si, en 2024', 'Si, en <b>2024</b>'), 2024), null,
    'balise entre l’année et la virgule : refus conservateur plutôt que mauvaise attribution');
assert.equal(src.lireTitres(aide2024.replace('17,2&#160;%', '17,2&#160;% soit 15,5'), 2024).ps, .172,
    'un autre taux cité plus loin ne remplace pas celui du paragraphe officiel');

// ---------------------------------------- 3. variantes typographiques réelles
[2023, 2024].forEach(an => {
    assert.equal(src.lireTitres(PAGES[an].replaceAll('1er janvier 2018', '1<sup>er</sup> janvier 2018'), an).ps, .172,
        `revenus ${an} : date coupée par une balise d’exposant`);
    assert.equal(src.lireTitres(PAGES[an].replace('12,8&#160;%', '12,8 %'), an).ps, .172,
        `revenus ${an} : espace ordinaire acceptée`);
});

// ------------------------------- 4. collecte : la preuve ne vaut que son année
(async () => {
    const stockage = new Map();
    const ctx = contexte(PAGES_PAR_URL, {
        getItem: k => stockage.get(k) || null,
        setItem: (k, v) => stockage.set(k, v)
    });
    const s = ctx.PF.fiscalRegimesSources;
    const parAnnee = {};
    for (const an of [2023, 2024]) {
        const r = await s.chercher(an);
        assert.equal(r.enregistree, true, `revenus ${an} : révision enregistrée (${r.etat})`);
        assert.equal(r.url, URLS[an], `revenus ${an} : URL du millésime déclaration ${an + 1}`);
        assert.match(r.publication, new RegExp(`déclaration ${an + 1}`),
            'année de déclaration distinguée de l’année des revenus');
        assert.equal(r.valeurs.ps, .172);
        assert.equal(s.lireCache(an).ps, .172, `revenus ${an} : relecture du cache`);
        parAnnee[an] = { titres: r.valeurs, urls: { gains: r.url } };
    }

    // Une page d'une autre année ne remplit rien : la révision est enregistrée
    // comme « sans preuve », jamais comme une valeur reconduite.
    const stockage2 = new Map();
    const ctxFaux = contexte({ [URLS[2024]]: aide2023 }, {
        getItem: k => stockage2.get(k) || null,
        setItem: (k, v) => stockage2.set(k, v)
    });
    const sFaux = ctxFaux.PF.fiscalRegimesSources;
    const faux = await sFaux.chercher(2024);
    assert.equal(faux.valeurs, null, 'page des revenus 2023 servie pour 2024 : aucune valeur retenue');
    assert.equal(sFaux.lireCache(2024), null, 'rien dans le cache 2024');
    assert.match(faux.etat, /2024/, 'l’état nomme l’année manquante');

    // ---------------------------------- 5. matrice : une colonne par millésime
    const m = ctx.PF.fiscalCouverture.matrice(parAnnee);
    [2023, 2024].forEach(an => {
        const cel = m.cellules[an].ps_titres;
        assert.equal(cel.statut, ctx.PF.fiscalCouverture.STATUTS.ETABLI, `revenus ${an} : case établie`);
        assert.equal(cel.valeur, .172);
        assert.equal(cel.anneeEffet, an, `effet rattaché aux revenus ${an}, pas à la déclaration ${an + 1}`);
        assert.equal(cel.source, URLS[an]);
    });
    [2025, 2026].forEach(an => assert.equal(m.cellules[an].ps_titres.statut,
        ctx.PF.fiscalCouverture.STATUTS.NON_DISPONIBLE,
        `revenus ${an} : ne profite pas des pages 2023/2024`));
    assert.equal(m.synthese.basculeComplete, false, 'deux cases établies ne font pas une bascule totale');

    // --------------------- 6. cohérence avec les vérifications distantes tracées
    const v23 = ctx.PF.fiscalCouverture.verificationsDistantes(2023, 'ps_titres');
    const v24 = ctx.PF.fiscalCouverture.verificationsDistantes(2024, 'ps_titres');
    assert.ok(v23.some(x => x.url === URLS[2023]), 'aide revenus 2023 tracée');
    assert.ok(v24.some(x => x.url === URLS[2024]), 'aide revenus 2024 tracée');
    [...v23, ...v24].forEach(x => assert.match(x.constate, /17,2 %/));
    assert.match(v23.find(x => x.url === URLS[2023]).constate, /Si, en 2023/);
    assert.match(v24.find(x => x.url === URLS[2024]).constate, /Si, en 2024/);
    v24.forEach(x => assert.doesNotMatch(x.portée, /corroboration seulement/,
        'l’aide des revenus 2024 a été relue : ce n’est plus une simple corroboration'));

    console.log('OK — libellés réels revenus 2023 et 2024 (17,2 %/30 %) acceptés chacun pour '
        + 'leur seule année, collecte et matrice sans reconduction');
})();
