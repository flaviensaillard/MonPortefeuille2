/* Millésime futur : revenus 2027, collectés au printemps 2028.
   Vérifie qu'aucune modification de code n'est nécessaire — ni constante
   embarquée, ni libellé, ni liste d'années — et qu'à l'inverse rien n'est
   inventé tant que les documents ne sont pas lus.

   Les valeurs de ce jeu de test sont FICTIVES (barème 11 700 / 29 800 / 85 200 /
   183 300 €, décote 905 € / 1 496 €, plafond QF 1 823 €) : elles servent à prouver
   le chemin, pas à annoncer les revenus 2027. Les coefficients kilométriques sont
   repris du jeu de fixtures existant. Hors réseau. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, '../app/src/main/assets/www/js');

const COMPTE = '12345678-1234-4123-a123-123456789012';
const AN = 2027;                       // année des revenus
const DECL = 2028;                     // année de la déclaration
const BAR = [11700, 29800, 85200, 183300];
/* Adresse « dernière version » construite par fiscal_dgfip_sources.url() quand le
   millésime n'a pas encore de date de publication connue. Vérifiée le 16/10/2026 :
   elle redirige, sur le même hôte, vers le permalien verrouillé de la version en
   vigueur (…/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20260407) — la seule
   famille de liens que le pont Android résout (NativeBridge.java). */
const DOC_URL = id => 'https://bofip.impots.gouv.fr/doctrine/' + id;
const KM_URL = 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/' + DECL + '/aides/frais.htm';
const GAINS_URL = 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/' + DECL + '/aides/gains.htm';
const REPAS_URL = 'https://www.impots.gouv.fr/particulier/frais-de-repas';

const bofip = (id, corps) => '<p>Date de début de publication du BOI : 11/04/' + DECL + '</p>'
    + '<p>Identifiant juridique : ' + id + '</p>' + corps;
const pageIr = bofip('BOI-IR-LIQ-20-10',
    '<p>Le barème pour l’imposition des revenus de l’année ' + AN + ' est présenté dans le tableau suivant :</p><table>'
    + [[BAR[0], 0], [BAR[1], 11], [BAR[2], 30], [BAR[3], 41], ['plus', 45]].map(([n, t]) =>
        '<tr><td>' + (n === 'plus' ? 'Supérieure à ' + BAR[3].toLocaleString('fr-FR')
            : 'N’excédant pas ' + Number(n).toLocaleString('fr-FR')) + ' €</td><td>' + t + ' %</td></tr>').join('')
    + '</table>');
const pageDecote = bofip('BOI-IR-LIQ-20-20-30',
    '<p>Pour l’imposition des revenus de ' + AN + ', cette décote est accordée aux contribuables dont la '
    + 'cotisation d’impôt brut est inférieure à 2 000 € pour les contribuables célibataires, divorcés ou '
    + 'veufs et à 3 306 € pour les contribuables soumis à imposition commune (soit respectivement 1/45,25 % '
    + 'de 905 € et 1/45,25 % de 1 496 €).</p>');
const pageQf = bofip('BOI-IR-LIQ-20-20-20',
    '<p>Son montant est fixé à 1 823 € par demi-part supplémentaire à compter de l’imposition des revenus '
    + 'de l’année ' + AN + '.</p>');
const KM = [['3CV et moins', '0,529', '0,316', '1 065', '0,370'],
    ['4 CV', '0,606', '0,340', '1 330', '0,407'], ['5 CV', '0,636', '0,357', '1 395', '0,427'],
    ['6 CV', '0,665', '0,374', '1 457', '0,447'], ['7 CV et plus', '0,697', '0,394', '1 515', '0,470']];
const pageFrais = '<p>Pour les revenus perçus en ' + AN + ', le minimum de déduction est de 520 €, '
    + 'le maximum de 14 900 €.</p><p>Tarif : automobiles</p>'
    + '<p>Jusqu’à 5 000 km ; De 5001 à 20 000 km</p>'
    + '<p>Le barème pour les véhicules 100 % électriques correspond au barème applicable ci-dessous '
    + 'majoré de 20 %.</p><table>' + KM.map(r => '<tr><td>' + r[0] + '</td><td>d x ' + r[1]
    + '</td><td>(d x ' + r[2] + ') + ' + r[3] + '</td><td>d x ' + r[4] + '</td></tr>').join('') + '</table>';
const pageRepas = '<p>Pour l’imposition des revenus ' + AN
    + ', la valeur d’un repas pris au foyer est de 5,60 €.</p>';
const pageGains = '<html><p>Les plus-values de cession de valeurs mobilières réalisées depuis le 1er janvier '
    + '2018 sont soumises, lors de leur imposition, à un prélèvement forfaitaire unique (PFU) de 12,8&nbsp;% '
    + 'auquel s\'ajoutent les prélèvements sociaux de 18,6&nbsp;% soit au total un taux de 31,4&nbsp;%.</p>'
    + '<p>Vous pouvez opter lors de la déclaration en cochant la case 2OP.</p>'
    + '<p>Si, en ' + AN + ', vous ou les membres de votre foyer fiscal avez vendu des valeurs mobilières, '
    + 'des droits sociaux et titres assimilés.</p><p>Le mécanisme d’abattements s\'applique uniquement pour '
    + 'les titres acquis ou souscrit avant le 1er janvier 2018 en cas d\'option pour le barème progressif.</p></html>';

const PAGES = {
    [DOC_URL('BOI-IR-LIQ-20-10')]: pageIr,
    [DOC_URL('BOI-IR-LIQ-20-20-30')]: pageDecote,
    [DOC_URL('BOI-IR-LIQ-20-20-20')]: pageQf,
    [KM_URL]: pageFrais, [REPAS_URL]: pageRepas, [GAINS_URL]: pageGains
};

let appels = 0;
const stockage = new Map();
class Date2028 extends Date {
    constructor(...x) { super(...(x.length ? x : ['2028-04-20T12:00:00Z'])); }
}
const ctx = vm.createContext({
    Date: Date2028, Promise, Number, Object, String, JSON, Math, Array, Error, RegExp, isFinite,
    localStorage: { getItem: k => (stockage.has(k) ? stockage.get(k) : null),
        setItem: (k, v) => stockage.set(k, v) },
    document: { getElementById: () => null, querySelector: () => null,
        querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {} } }) },
    PF: { ui: { h: String, accordeon: (t, c) => '<div class="accordeon">' + t + c + '</div>' },
        store: { reglages: () => ({}) }, modele: { classeDe: () => 'action_etf' },
        net: { auth: { utilisateur: () => ({ id: COMPTE }) },
            req: async (_, url) => { ++appels;
                return PAGES[url] ? { ok: true, body: PAGES[url] } : { ok: false, body: '' }; } } }
});
ctx.globalThis = ctx;
// ui.js avant fiscal.js : le moteur capture PF.ui à l'initialisation.
for (const f of ['util.js', 'ui.js', 'fiscal.js', 'fiscal_dgfip_sources.js', 'fiscal_frais_sources.js',
    'fiscal_regimes_sources.js', 'fiscal_sources_millesimes.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);

const fiscal = ctx.PF.fiscal;
const S = ctx.PF.fiscalSourcesMillesimes;
const transactions = [];

(async () => {
    // ---------------------------------------------------- avant toute collecte
    await fiscal.actualiserRevisions({ transactions });
    assert.equal(fiscal.annéeSimulable(AN), false, 'revenus 2027 non simulables sans collecte');
    assert.equal(fiscal.millésimeComplet(AN), false);
    assert.ok(fiscal.annéesSimulables().indexOf(AN) < 0, '2027 absent de l’écran avant collecte');
    assert.equal(fiscal.annees().join(','), '2022,2023,2024,2025,2026',
        'aucune constante embarquée ajoutée pour 2027');
    assert.throws(() => fiscal.baremeDe(AN),
        /Revenus 2027 : barème, décote ou plafond QF DGFiP non disponible/,
        'refus explicite, jamais une valeur d’une autre année');
    assert.throws(() => fiscal.plafondQF(AN), /non disponible/);
    assert.match(fiscal.verifierMaj(AN).message, /Revenus 2027 absents/,
        'le bouton dit que le millésime est absent avant publication');

    // La plage du bouton s'étend seule : au printemps 2028 elle couvre 2023 à 2027.
    assert.equal(fiscal.plageCollecte().join(','), '2023,2024,2025,2026,2027');
    assert.equal(fiscal.libelléPlage(), '2023 à 2027');
    assert.ok(fiscal.annéesCachables().indexOf(AN) >= 0, 'le cache 2027 est cherché au chargement');
    assert.match(fiscal.vue({ transactions }), /Vérifier les revenus 2023 à 2027 \(DGFiP\)/,
        'libellé du bouton construit d’après la plage, non écrit en dur');
    assert.doesNotMatch(fiscal.vue({ transactions }), /2023 à 2026/);

    // ------------------------------------------------------------- la collecte
    const avant = appels;
    const [boi, frais, regimes] = await Promise.all([
        ctx.PF.fiscalDgfipSources.chercher(AN),
        ctx.PF.fiscalFraisSources.chercher(AN),
        ctx.PF.fiscalRegimesSources.chercher(AN)
    ]);
    assert.ok(appels > avant, 'la collecte a bien interrogé les sources');
    assert.equal(boi.etats.ir, 'valeur du millésime trouvée (11/04/2028)', boi.etats.ir);
    assert.equal(boi.etats.decote, 'valeur du millésime trouvée (11/04/2028)');
    assert.equal(boi.etats.qf, 'valeur du millésime trouvée (11/04/2028)');
    assert.equal(frais.etats.abatt, 'valeur explicite trouvée');
    assert.equal(frais.etats.km, 'valeur explicite trouvée');
    assert.equal(frais.etats.repas, 'valeur explicite trouvée');
    assert.equal(regimes.valeurs.ps, .186, 'PS des revenus 2027 lus dans l’aide du simulateur');

    // Le permalien verrouillé est DÉDUIT de la page lue : aucune date codée en dur.
    assert.equal(boi.valeurs.ir.tranches.join(','), BAR.join(','));
    // `sources[nom].url` porte le PERMALIEN verrouillé déduit de la page lue.
    assert.equal(boi.valeurs.sources.ir.url,
        'https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20280411');
    assert.equal(boi.valeurs.sources.ir.datePublication, '11/04/2028');
    assert.equal(boi.valeurs.sources.decote.url,
        'https://bofip.impots.gouv.fr/bofip/2495-PGP.html/identifiant=BOI-IR-LIQ-20-20-30-20280411');
    assert.equal(boi.valeurs.sources.qf.url,
        'https://bofip.impots.gouv.fr/bofip/2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20280411');

    // ------------------------------------------------- après collecte : calculable
    await fiscal.actualiserRevisions({ transactions });
    assert.equal(fiscal.millésimeComplet(AN), true, 'les quatre familles exigées sont réunies');
    assert.equal(fiscal.annéeSimulable(AN), true);
    assert.equal(fiscal.annéesSimulables().join(','), '2022,2023,2024,2025,2026,2027',
        'le millésime collecté apparaît sans qu’aucune constante ait été ajoutée');
    assert.equal(fiscal.baremeDe(AN).tranches.join(','), BAR.join(','));
    assert.equal(fiscal.baremeDe(AN).dc, 905);
    assert.equal(fiscal.baremeDe(AN).dcCouple, 1496);
    assert.equal(fiscal.plafondQF(AN), 1823);
    assert.equal(fiscal.tauxPS(AN), .186);
    assert.equal(fiscal.forfaitRepas(AN), 5.6);
    // abattement10 renvoie un montant nu ; fraisKilometriques un objet détaillé.
    assert.equal(fiscal.abattement10(30000, AN), 3000, '10 % du salaire');
    assert.equal(fiscal.abattement10(2000, AN), 520, 'plancher officiel 2027 collecté');
    assert.equal(fiscal.abattement10(900000, AN), 14900, 'plafond officiel 2027 collecté');
    assert.equal(fiscal.fraisKilometriques(4000, 3, false, AN).montant, Math.round(4000 * .529 * 100) / 100);
    assert.doesNotMatch(fiscal.verifierMaj(AN).message, /absents/,
        'après collecte le millésime n’est plus signalé absent');
    assert.match(fiscal.verifierMaj(AN).message, /revenus 2027 relus/);
    assert.match(fiscal.vue({ transactions }), /Revenus 2027<\/button>/, 'puce 2027 à l’écran');

    // Les preuves exposées sont celles du millésime 2027, jamais d'une autre année.
    const preuves = fiscal.preuvesParAnnee(AN);
    assert.equal(preuves.boi.ir.tranches.join(','), BAR.join(','));
    assert.equal(preuves.frais.repas, 5.6);
    assert.equal(preuves.titres.ps, .186, 'PS des titres lus pour les revenus 2027');
    assert.equal(preuves.urls.gains, GAINS_URL, 'aide du simulateur construite pour la déclaration 2028');
    assert.equal(preuves.urls.frais, KM_URL, 'aide frais construite pour la déclaration 2028');
    assert.equal(preuves.urls.repas, REPAS_URL);
    assert.equal(preuves.revisionPubliee, false, 'aucune révision publiée : la collecte seule n’active rien');
    assert.equal(ctx.PF.fiscalDgfipSources.url('ir', AN), DOC_URL('BOI-IR-LIQ-20-10'));
    assert.equal(ctx.PF.fiscalDgfipSources.url('decote', AN), DOC_URL('BOI-IR-LIQ-20-20-30'));
    assert.equal(ctx.PF.fiscalDgfipSources.url('qf', AN), DOC_URL('BOI-IR-LIQ-20-20-20'));
    // Le permalien conservé, lui, est verrouillé sur la version lue.
    assert.match(preuves.boi.sources.ir.url,
        /2491-PGP\.html\/identifiant=BOI-IR-LIQ-20-10-\d{8}$/,
        'la preuve conserve le permalien de la version lue, pas l’adresse courte');

    // ------------------------------------------- collecte partielle : rien d'inventé
    const partiel = vm.createContext({
        Date: Date2028, Promise, Number, Object, String, JSON, Math, Array, Error, RegExp, isFinite,
        localStorage: { getItem: () => null, setItem: () => {} },
        document: { getElementById: () => null, querySelector: () => null,
            querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {} } }) },
        PF: { ui: { h: String, accordeon: (t, c) => '<div class="accordeon">' + t + c + '</div>' },
        store: { reglages: () => ({}) }, modele: { classeDe: () => 'action_etf' },
            net: { auth: { utilisateur: () => ({ id: COMPTE }) },
                // Seul le BOFiP répond ; les aides du simulateur sont absentes.
                req: async (_, url) => (PAGES[url] && url.includes('bofip')
                    ? { ok: true, body: PAGES[url] } : { ok: false, body: '' }) } }
    });
    partiel.globalThis = partiel;
    for (const f of ['util.js', 'ui.js', 'fiscal.js', 'fiscal_dgfip_sources.js', 'fiscal_frais_sources.js',
        'fiscal_regimes_sources.js'])
        vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), partiel);
    const boiSeul = await partiel.PF.fiscalDgfipSources.chercher(AN);
    assert.equal(boiSeul.etats.ir, 'valeur du millésime trouvée (11/04/2028)');
    await partiel.PF.fiscal.actualiserRevisions({ transactions });
    assert.equal(partiel.PF.fiscal.millésimeComplet(AN), false, 'sans frais salariés, millésime incomplet');
    assert.equal(partiel.PF.fiscal.annéeSimulable(AN), false);
    assert.throws(() => partiel.PF.fiscal.baremeDe(AN), /non disponible/,
        'un barème seul ne suffit pas : la simulation reste suspendue');
    assert.match(partiel.PF.fiscal.vue({ transactions }), /calcul fiscal indisponible/);

    // --------------------------------------------------------- non-régressions
    assert.equal(fiscal.annees().join(','), '2022,2023,2024,2025,2026', 'BAREMES inchangé');
    assert.throws(() => fiscal.baremeDe(2026), /non disponible/, 'revenus 2026 toujours suspendus sans collecte');
    assert.equal(fiscal.baremeDe(2025).tranches.join(','), '11600,29579,84577,181917', 'R2 2025 intacte');
    assert.equal(fiscal.baremeDe(2025).dc, 897);
    assert.equal(fiscal.plafondQF(2025), 1807);
    assert.equal(fiscal.tauxPS(2025), .186);
    assert.equal(fiscal.plafondQF(2024), 1791, 'valeur officielle corrigée le 16/10/2026');
    assert.equal(fiscal.baremeDe(2024).tranches[0], 11497);

    // ------------------------------------- inventaire : ce qui reste à inscrire
    const h = S.horizon(AN);
    assert.equal(h.anneeDeclaration, DECL);
    assert.equal(h.automatique.join(','), 'boi_ir,boi_decote,boi_qf,aide_frais,aide_gains,aide_repas',
        'six familles se collectent sans inscription nouvelle');
    assert.equal(h.aInscrire.join(','),
        'brochure_rcm,brochure_charges,brochure_plus_values,notice_2086,nouveautes',
        'les cinq familles PDF exigent une adresse vérifiée : leur nom de fichier ne se devine pas');
    assert.equal(S.toutes(AN).length, 11);
    assert.equal(S.lisibles(AN).length, 0, 'rien de lisible tant que rien n’est publié');
    assert.equal(S.url(AN, 'brochure_rcm'), null, 'aucune adresse de brochure inventée');
    assert.equal(S.url(AN, 'boi_ir'), null, 'l’inventaire ne fabrique pas non plus le permalien BOFiP');
    assert.match(S.calendrier(AN).bofip, /attendue au printemps 2028/);
    assert.equal(S.millésimes().join(','), '2023,2024,2025,2026',
        'les comptes de l’inventaire ne changent pas : 2027 n’est pas un millésime décrit');

    console.log('OK — revenus 2027 collectables et calculables au printemps 2028 sans modifier le code');
})().catch(e => { console.error(e); process.exitCode = 1; });
