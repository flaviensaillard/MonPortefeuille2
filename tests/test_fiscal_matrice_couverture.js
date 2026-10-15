/* Matrice de couverture par millésime et catégorie : statuts, refus de
   reconduction d'une année sur l'autre, contradictions DGFiP signalées et
   bascule totale jamais déclarée sans preuve explicite. Hors réseau. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ctx = vm.createContext({ Number, Object, String, JSON, Math, Array, Error });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/fiscal_couverture.js'), 'utf8'), ctx);
const C = ctx.PF.fiscalCouverture;
const { ETABLI, RECOUPEMENT, PARTIEL, NON_DISPONIBLE } = C.STATUTS;

// ---------------------------------------------------------------- millésimes
assert.equal(Object.keys(C.MILLESIMES).length, 4, 'revenus 2023 à 2026');
assert.equal(C.MILLESIMES[2025].declaration, 2026, 'année de déclaration distincte');
assert.equal(C.MILLESIMES[2025].publicationBoi, '07/04/2026', 'date de publication distinguée');
assert.equal(C.MILLESIMES[2026].documentsAttendus, false, 'revenus 2026 : documents non publiés');
assert.equal(C.MILLESIMES[2026].publicationBoi, null);
assert.equal(C.millésime(2027), null, 'millésime hors périmètre');
assert.equal(C.categories().length, C.CATEGORIES.length);
assert.ok(C.categories().includes('ps_crypto') && C.categories().includes('qf_speciaux'));

// ------------------------------------------------- aucune preuve : rien d'établi
const vide = C.matrice({});
[2023, 2024, 2025, 2026].forEach(an => {
    C.CATEGORIES.forEach(c => {
        assert.equal(vide.cellules[an][c.id].statut, NON_DISPONIBLE,
            `revenus ${an} · ${c.id} : une constante embarquée n'est pas une preuve`);
    });
});
assert.equal(vide.synthese.etablis, 0);
assert.equal(vide.synthese.basculeComplete, false);
assert.equal(vide.synthese.total, 4 * C.CATEGORIES.length);
assert.match(vide.cellules[2026].ir_bareme.note, /non publiés/);
assert.match(vide.cellules[2025].ps_crypto.note, /valeur embarquée/);
assert.match(vide.cellules[2025].qf_speciaux.note, /non modélisés/);

// ------------------------------------------------------- preuves 2025 complètes
const preuves2025 = {
    boi: { ir: { tranches: [11600, 29579, 84577, 181917], taux: [.11, .3, .41, .45] },
        decote: { dc: 897, dcCouple: 1483, dcPlafond: 1982, dcPlafondCouple: 3277 }, qf: 1807,
        sources: { ir: { url: 'https://bofip.impots.gouv.fr/bofip/2491-PGP.html', datePublication: '07/04/2026' },
            decote: { url: 'https://bofip.impots.gouv.fr/bofip/2495-PGP.html', datePublication: '07/04/2026' },
            qf: { url: 'https://bofip.impots.gouv.fr/bofip/2494-PGP.html', datePublication: '07/04/2026' } } },
    frais: { abatt: { min: 509, max: 14555 }, repas: 5.45, km: { 3: [.529, .316, 1065, .37] } },
    titres: { ir: .128, ps: .186, pfu: .314 },
    brochureRcm: { valeurs: { revenus: 2025 } }, chargesRcm: { valeurs: { revenus: 2025 } },
    notice2086: { valeurs: { revenus: 2025 } },
    cryptoFaq: { valeurs: { psCourant: .186, dateModification: '17/07/2026' } },
    urls: { frais: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/frais.htm',
        gains: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/gains.htm',
        cryptoFaq: 'https://www.impots.gouv.fr/particulier/questions/x' }
};
const m = C.matrice({ 2025: preuves2025 });
const cel = m.cellules[2025];
['ir_bareme', 'decote', 'qf_general', 'frais_abattement', 'frais_repas', 'frais_km', 'ps_titres']
    .forEach(id => assert.equal(cel[id].statut, ETABLI, id + ' établi par un texte du millésime'));
assert.equal(cel.ps_titres.anneeEffet, 2025, 'effet rattaché à l’année des revenus');
assert.equal(cel.ir_bareme.publication, '07/04/2026');
assert.equal(cel.rcm_precompte.statut, PARTIEL, 'les brochures posent des règles, pas les produits du foyer');
assert.match(cel.rcm_precompte.note, /aucune CSG déductible personnelle/);
assert.equal(cel.csg_deductible.statut, PARTIEL);
assert.equal(cel.csg_deductible.exclusions.length, 4, 'trois calendriers + anti double compte 6DE');
assert.ok(cel.csg_deductible.exclusions.some(e => /2BH\/2DF/.test(e)));
assert.equal(cel.crypto_2086_foyer.statut, PARTIEL);
assert.match(cel.crypto_2086_foyer.note, /ne certifient pas une annexe 2086 exhaustive/);
assert.equal(cel.ps_crypto.statut, PARTIEL, 'FAQ seule : aucune attribution à 2025');
assert.equal(cel.qf_speciaux.statut, NON_DISPONIBLE);
assert.equal(cel.formules_arrondis.statut, NON_DISPONIBLE, 'un comportement du code n’est pas une preuve');
assert.match(cel.formules_arrondis.note, /arrondit à l’euro pour les revenus 2025/);
assert.equal(m.synthese.etablis, 7);
assert.equal(m.synthese.basculeComplete, false, 'bascule totale jamais déclarée sans toutes les catégories');

// ------------------------------------------------- anti-reconduction de millésime
assert.equal(C.preuveDuMillesime({ revenus: 2024 }, 2025), false);
assert.equal(C.preuveDuMillesime({ annee_revenus: 2025 }, 2025), true);
assert.equal(C.preuveDuMillesime(null, 2025), false);
const reconduit = C.evaluer(2025, Object.assign({}, preuves2025, {
    urls: Object.assign({}, preuves2025.urls,
        { gains: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/gains.htm' })
}));
assert.equal(reconduit.ps_titres.statut, NON_DISPONIBLE, 'aide d’un autre millésime refusée');

// Une preuve de 2025 ne remplit JAMAIS la colonne 2026.
const m2 = C.matrice({ 2026: preuves2025 });
C.CATEGORIES.forEach(c => assert.equal(m2.cellules[2026][c.id].statut, NON_DISPONIBLE,
    'revenus 2026 : ' + c.id + ' ne reprend pas 2025'));

// -------------------------------------------------------- recoupement PS crypto
const rec = { statut: 'recoupement', taux: .186,
    sources: [{ url: 'https://bofip.impots.gouv.fr/bofip/11969-PGP.html', publication: '23/04/2024' },
        { url: 'https://www.impots.gouv.fr/www2/.../nouveautes.pdf', publication: 'déclaration 2026' }],
    exclusions: ['FAQ courante non attribuée à 2025'],
    note: 'BOFiP revenus du patrimoine 17,2 % + hausse CSG 1,4 point dès les revenus 2025' };
const m3 = C.matrice({ 2025: Object.assign({}, preuves2025, { recoupementPsCrypto: rec }) });
assert.equal(m3.cellules[2025].ps_crypto.statut, RECOUPEMENT);
assert.equal(m3.cellules[2025].ps_crypto.valeur, .186);
assert.equal(m3.cellules[2025].ps_crypto.anneeEffet, 2025);
assert.match(m3.cellules[2025].ps_crypto.note, /aucun taux activé/);
assert.equal(m3.synthese.etablis, 7, 'un recoupement ne compte pas comme un texte explicite');
assert.equal(m3.synthese.recoupements, 1);
assert.equal(m3.synthese.basculeComplete, false);

// ----------------------------------------------------------- contradictions
const contra = C.contradictions();
assert.equal(contra.length, 3);
const crypto = contra.find(c => c.id === 'ps_crypto_2025');
assert.equal(crypto.termes.length, 3, 'BOFiP, FAQ courante et brochure revenus 2025');
assert.match(crypto.termes[0].valeur, /17,2 %/);
assert.match(crypto.termes[0].passage, /revenus du patrimoine au taux global de 17,2 %/);
assert.equal(crypto.termes[0].publication, '23/04/2024');
assert.match(crypto.termes[1].valeur, /18,6 %/);
assert.equal(crypto.termes[1].publication, 'modifiée le 17/07/2026');
assert.match(crypto.termes[2].passage, /à compter des revenus 2025 déclarés en 2026/);
assert.match(crypto.arbitrage, /n’est PAS attribuée automatiquement à 2025/);
assert.match(crypto.arbitrage, /jamais activé silencieusement/);
assert.equal(C.contradictions(2024).length, 0, 'aucune contradiction inventée pour 2024');
assert.equal(contra.find(c => c.id === 'ps_titres_2025').termes[1].passage.includes('Si, en 2025'), true);
assert.match(contra.find(c => c.id === 'seuil_2086_2025').arbitrage, /jamais résolu par une hypothèse/);

// Divergence relevée le 14/10/2026 à l'intérieur du même millésime de simulateur :
// la page d'accueil du modèle complet 2026 affiche encore 30 % / 17,2 % alors que
// l'aide « Plus-values et gains divers » du même millésime affiche 31,4 % / 18,6 %.
const titres = contra.find(c => c.id === 'ps_titres_2025');
assert.equal(titres.termes.length, 3, 'les deux pages du simulateur 2026 sont consignées');
assert.match(titres.termes[2].valeur, /17,2 %/);
assert.match(titres.termes[2].passage, /12\.8% d’impôt sur le revenu et 17\.2%/);
assert.match(titres.termes[2].url, /calcul_impot\/2026\/complet\/index\.htm$/);
assert.match(titres.termes[2].limite, /INTERNE au simulateur/);
assert.match(titres.arbitrage, /Si, en 2025/, 'seule l’aide date explicitement l’année');
assert.match(titres.arbitrage, /divergence non levée/);
assert.match(titres.arbitrage, /R2 2025 publiée prioritaire/);

// ------------------------------------------- vérifications distantes consignées
const verifs = C.VERIFICATIONS_DISTANTES;
assert.ok(verifs.length >= 7, 'chaque source relue hors application est tracée');
const parUrl = (an, cat, motif) => verifs.find(v => v.millesime === an && v.categorie === cat
    && new RegExp(motif).test(v.url));
verifs.forEach(v => {
    assert.match(v.date, /^2026-10-1[45]$/, 'date de lecture explicite');
    assert.ok(v.url && /^https:\/\/(simulateur-ir-ifi\.impots\.gouv\.fr|www\.impots\.gouv\.fr|bofip\.impots\.gouv\.fr)\//.test(v.url),
        'source DGFiP uniquement : ' + v.url);
    assert.ok(v.constate && v.portée, 'constat et portée obligatoires');
});
assert.equal(C.verificationsDistantes(2023, 'ps_titres').length, 1);
assert.equal(C.verificationsDistantes(2022).length, 0, 'hors périmètre : rien de consigné');
const verifs2026 = C.verificationsDistantes(2026);
assert.equal(verifs2026.length, 1, 'pour 2026, seule l’absence de publication est consignée');
assert.equal(verifs2026[0].categorie, 'toutes');
assert.match(verifs2026[0].constate, /aucune aide ni brochure du millésime « revenus 2026 »/);
assert.match(verifs2026[0].portée, /rien n’est établi pour 2026/);
assert.match(verifs2026[0].limite, /sonde directe/, 'la limite de la vérification est explicite');
assert.match(C.texteVerifications(2025), /BOI-RPPM-PVBMC-30-30-20240423/, 'BOFiP en permalien versionné');
assert.equal(C.texteVerifications(2022), '');
// Le BOFiP ne date aucune année de cession : il ne peut pas établir 2025 seul.
assert.match(parUrl(2025, 'ps_crypto', 'BOI-RPPM-PVBMC-30-30-20240423').portée, /aucune année de cession/);
assert.match(parUrl(2025, 'ps_crypto', 'comment-declarer-les-plus-ou-moins-values').portée, /jamais attribuée à 2025/);
// Revenus 2023 et 2024 : les deux aides millésimées ont été relues (14 et 15/10/2026).
assert.match(parUrl(2023, 'ps_titres', 'calcul_impot/2024/aides/gains').constate, /Si, en 2023/);
assert.match(parUrl(2024, 'ps_titres', 'calcul_impot/2025/aides/gains').constate, /Si, en 2024/);
assert.match(parUrl(2024, 'ps_titres', 'calcul_impot/2025/aides/gains').portée, /établi/);
assert.match(parUrl(2024, 'ps_titres', 'calcul_impot/2025/complet').portée, /corroboration/);
// Notice 2086 du millésime revenus 2025 : échelle du foyer vérifiée, PS non chiffrés.
const notice = 'sites/default/files/formulaires/2086/2026/2086_5515';
assert.match(parUrl(2025, 'crypto_2086_foyer', notice).constate, /au niveau du foyer fiscal/);
assert.match(parUrl(2025, 'crypto_2086_foyer', notice).constate, /réalisées en 2025/);
assert.match(parUrl(2025, 'crypto_2086_foyer', notice).constate, /3AN/);
assert.match(parUrl(2025, 'crypto_2086_foyer', notice).constate, /3CN/);
assert.match(parUrl(2025, 'crypto_2086_foyer', notice).portée, /annexeFoyerComplete:false/);
assert.match(parUrl(2025, 'ps_crypto', notice).constate, /aucun taux de PS chiffré/);
assert.match(parUrl(2025, 'ps_crypto', notice).portée, /psCrypto2025Attestes:false/);
// Le BOFiP n'a pas été mis à jour : la contradiction n'est pas levée.
const bofip15 = verifs.filter(v => v.date === '2026-10-15' && /BOI-RPPM-PVBMC-30-30/.test(v.url));
assert.equal(bofip15.length, 1);
assert.match(bofip15[0].constate, /toujours datée du 23\/04\/2024/);
assert.match(bofip15[0].portée, /pas été levée par une mise à jour du BOFiP/);
assert.ok(bofip15[0].limite, 'un constat d’absence porte sa limite');

// ------------------------------------------------------------------ comptes rendus
const t = C.texte(m3);
assert.match(t, /année des revenus ≠ année de déclaration/);
assert.match(t, /Revenus 2025 \(déclaration 2026, publication BOFiP 07\/04\/2026\)/);
assert.match(t, /Revenus 2026 \(déclaration 2027, publication BOFiP non disponible\)/);
assert.match(t, /Bascule DGFiP totale : non/);
assert.match(t, /Contradictions DGFiP signalées/);
const detail = C.texteDetail(m3, 2025);
assert.equal(detail.split('\n').length, C.CATEGORIES.length);
assert.match(detail, /non disponible/);
assert.doesNotMatch(t, /11600|https?:\/\//, 'le résumé court reste copiable');
assert.equal(C.statutDe(2025, 'ps_crypto', { 2025: Object.assign({}, preuves2025, { recoupementPsCrypto: rec }) }).statut, RECOUPEMENT);
assert.throws(() => C.statutDe(2025, 'inconnu', {}), /Catégorie inconnue/);
assert.throws(() => C.evaluer(2022, {}), /Millésime non pris en charge/);

console.log('Matrice de couverture 2023–2026 : statuts, refus de reconduction, '
    + 'recoupement distinct et contradictions signalées OK');
