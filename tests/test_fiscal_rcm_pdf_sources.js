/* node tests/test_fiscal_rcm_pdf_sources.js — textes courts issus des brochures
   DGFiP revenus 2025, transport PDF simulé, cache, rectifications et refus
   d'attribuer une déduction personnelle ou d'activer le moteur.
   PÉRENNITÉ : le lecteur est paramétré par millésime via l'inventaire des
   sources ; un millésime sans URL vérifiée, ou sans jeu de preuves vérifié, est
   refusé SANS appel réseau et sans valeur produite. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const base = 'app/src/main/assets/www/js/';
const id = '6511ae04-2496-4ce5-840b-5d365c1d6ff2';
const memoire = new Map(), retours = {};
const rcm = `La 2042 K est préremplie du montant des revenus de capitaux mobiliers perçus en 2025 par le contribuable et son conjoint.
Indiquez ligne 2CG les produits suivants qui n’ouvrent jamais droit à CSG déductible, y compris lorsqu’ils sont imposés au barème de l’impôt sur le revenu.
Les revenus inscrits ligne 2CG sont exclus de la base soumise aux prélèvements sociaux et n’ouvrent pas droit à CSG déductible.
Inscrivez ligne 2BH le montant des revenus perçus en 2025 sur lesquels les prélèvements sociaux ont déjà été prélevés en 2025 par l'établissement payeur et qui ouvrent droit à CSG déductible uniquement en cas d’option pour l'imposition au barème.
Si vous avez opté pour l'imposition au barème de l’ensemble de vos revenus de capitaux mobiliers (case 2OP cochée).
Le montant de CSG déductible sera alors calculé (6,8 % du montant déclaré ligne 2BH) et déduit automatiquement de votre revenu global de 2025.
Inscrivez ligne 2DF le montant des revenus perçus en 2025 sur lesquels les prélèvements sociaux ont déjà été prélevés en 2025 par l’établissement payeur et qui ouvrent toujours droit à CSG déductible, y compris en l’absence d’option globale pour l'imposition au barème (case 2OP non cochée).
– produits des fonds en unités de compte des bons ou contrats de capitalisation et d’assurance-vie attachés à des versements effectués avant le 27.9.2017;`;
const charges = `CSG DÉDUCTIBLE CALCULÉE SUR LES REVENUS 2024, PAYÉE EN 2025
Le montant déductible est égal à 6,8 points de CSG calculée (au taux de 9,2 %) sur les revenus du patrimoine soumis au barème.
La déduction s’opère sur les revenus de l’année du paiement de la CSG.
Aucune CSG calculée sur les revenus du patrimoine n'est déductible lorsque ces revenus ont été imposés à l'impôt sur le revenu à un taux forfaitaire.
Dans ces deux cas, rayez le montant préimprimé et inscrivez ligne 6DE le montant exact de CSG déductible.
Le montant de CSG déductible est égal à 6,8 % des revenus déclarés ligne 2BH de la 2042 si vous optez pour l'imposition au barème et à 6,8 % des revenus déclarés ligne 2DF quelle que soit l'option.
Vous ne devez pas le calculer vous-même ni l‘indiquer ligne 6DE en corrigeant le montant prérempli. Le montant de CSG déductible afférent aux revenus déclarés ligne 2BH et 2DF sera calculé automatiquement.`;
let activeId = id;
const ctx = { PF: { net: { auth: { utilisateur: () => ({ id: activeId }) },
    reqPdf: url => Promise.resolve(retours[url]) },
    fiscalBrochureSources: { extrairePages: async b64 => JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) } },
    localStorage: { getItem: k => memoire.get(k) || null, setItem: (k, v) => memoire.set(k, v) },
    Date, Promise, Number, String };
ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(base + 'fiscal_sources_millesimes.js', 'utf8'), ctx);
vm.runInNewContext(fs.readFileSync(base + 'fiscal_rcm_pdf_sources.js', 'utf8'), ctx);
const sources = ctx.PF.fiscalSourcesMillesimes;
const lecteur = ctx.PF.fiscalRcmPdfSources;
function reponse(url, texte) { retours[url] = { ok: true,
    binary_b64: Buffer.from(JSON.stringify([texte])).toString('base64') }; }
(async () => {
    assert.equal(lecteur.analyserRcm(rcm).valeurs.tauxRcmPersonnelsAttestes, false);
    assert.equal(lecteur.analyserCharges(charges).valeurs.deductionPersonnelleAttestee, false);
    assert.equal(lecteur.analyserRcm(rcm.replace('perçus en 2025', 'perçus en 2024')).valeurs, undefined);
    assert.equal(lecteur.analyserRcm(rcm.replace('qui n’ouvrent jamais droit', 'qui ouvrent droit')).valeurs, undefined);
    assert.equal(lecteur.analyserRcm(rcm.replace('case 2OP non cochée', 'case 2OP cochée')).valeurs, undefined);
    assert.equal(lecteur.analyserCharges(charges.replace('REVENUS 2024, PAYÉE EN 2025', 'REVENUS 2025, PAYÉE EN 2026')).valeurs, undefined);
    assert.equal(lecteur.analyserCharges(charges.replace('ne devez pas le calculer', 'devez le calculer')).valeurs, undefined);
    assert.equal(lecteur.analyserCharges(charges.replace('un taux forfaitaire', 'le barème progressif')).valeurs, undefined);
    assert.equal((await lecteur.chercher(2024)).rcm.valeurs, undefined);
    reponse(lecteur.urls.rcm, rcm); reponse(lecteur.urls.charges, charges);
    const premier = await lecteur.chercher(2025);
    assert.equal(premier.rcm.enregistree, true, premier.rcm.etat);
    assert.equal(premier.charges.enregistree, true, premier.charges.etat);
    assert.equal(lecteur.lireCache('rcm').tauxRcmPersonnelsAttestes, false);
    assert.equal(lecteur.lireCache('charges').deductionPersonnelleAttestee, false);
    await lecteur.chercher(2025);
    const k = 'pf2.dgfip.rcm.pdf.v1.rcm.2025.' + id;
    assert.equal(JSON.parse(memoire.get(k)).length, 1);
    reponse(lecteur.urls.rcm, rcm.replace('par le contribuable et son conjoint', 'par les déclarants'));
    await lecteur.chercher(2025);
    assert.equal(JSON.parse(memoire.get(k)).length, 1, 'changement hors extrait non retenu');
    reponse(lecteur.urls.rcm, rcm.replace('par l\'établissement payeur', 'par les établissements payeurs'));
    assert.equal((await lecteur.chercher(2025)).rcm.enregistree, true);
    assert.equal(JSON.parse(memoire.get(k)).length, 2, 'un extrait révisé conserve son historique');
    activeId = '7522ae04-2496-4ce5-840b-5d365c1d6ff2';
    assert.equal(lecteur.lireCache('rcm'), null, 'cache isolé entre comptes');
    activeId = id;
    retours[lecteur.urls.charges] = { ok: false, error: 'hors ligne' };
    const partiel = await lecteur.chercher(2025);
    assert.equal(partiel.rcm.enregistree, true);
    assert.equal(partiel.charges.enregistree, false);
    // ---------------------------------------------------- pérennité par millésime
    assert.equal(lecteur.urlPour('rcm', 2025), sources.url(2025, 'brochure_rcm'));
    assert.equal(lecteur.urlPour('rcm', 2025), lecteur.urls.rcm, 'comportement 2025 inchangé');
    assert.equal(lecteur.urlPour('charges', 2025), lecteur.urls.charges);
    assert.equal(lecteur.urlPour('rcm', 2023), null,
        'document 2023 repéré mais jeu de preuves non vérifié : aucune lecture');
    assert.equal(lecteur.urlPour('rcm', 2024), null, 'chapitre ir_2025 non repéré');
    assert.equal(lecteur.urlPour('rcm', 2026), null, 'brochure ir_2027 non publiée');

    let appels = 0;
    const reqPdf = ctx.PF.net.reqPdf;
    ctx.PF.net.reqPdf = url => { appels++; return reqPdf(url); };
    const refus2023 = await lecteur.chercher(2023);
    assert.equal(refus2023.rcm.valeurs, undefined);
    assert.equal(refus2023.rcm.enregistree, false);
    assert.match(refus2023.rcm.etat, /jeu de preuves non vérifié sur ce millésime/);
    assert.equal(refus2023.rcm.url, 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2024/pdf_som/08-RCM_123a137.pdf',
        'le document repéré est nommé, sans être lu');
    assert.match(refus2023.charges.etat, /aucune URL inventée/);
    assert.equal(refus2023.charges.url, null);
    const refus2024 = await lecteur.chercher(2024);
    assert.match(refus2024.rcm.etat, /non repéré : aucune URL inventée/);
    assert.match(refus2024.rcm.motif, /ir_<N\+1>\/pdf_som\/08-RCM_<référence>\.pdf/,
        'le motif à vérifier est donné, pas une adresse');
    const refus2026 = await lecteur.chercher(2026);
    assert.equal(refus2026.rcm.valeurs, undefined);
    assert.match(refus2026.rcm.etat, /non repéré : aucune URL inventée/);
    assert.equal(appels, 0, 'aucun appel réseau pour un millésime non vérifié');
    ctx.PF.net.reqPdf = reqPdf;

    // Le mécanisme est générique : un texte portant une autre année de revenus est
    // lu pour cette année-là, et jamais pour une autre.
    const rcm2023 = rcm.replace(/2025/g, '2023');
    const charges2023 = charges.replace('REVENUS 2024, PAYÉE EN 2025', 'REVENUS 2022, PAYÉE EN 2023')
        .replace(/de 2025/g, 'de 2023');
    assert.equal(lecteur.analyserRcm(rcm2023, 2023).valeurs.revenus, 2023);
    assert.equal(lecteur.analyserRcm(rcm2023, 2023).valeurs.declaration, 2024);
    assert.equal(lecteur.analyserRcm(rcm2023).valeurs, undefined, '2023 refusé par défaut 2025');
    assert.equal(lecteur.analyserRcm(rcm2023, 2024).valeurs, undefined);
    assert.equal(lecteur.analyserCharges(charges2023, 2023).valeurs.revenus, 2023);
    assert.equal(lecteur.analyserCharges(charges2023, 2023).valeurs.revenusPatrimoineOrigine, 2022);
    assert.equal(lecteur.analyserCharges(charges2023, 2023).valeurs.csgPayeeEn, 2023);
    assert.equal(lecteur.analyserCharges(charges2023).valeurs, undefined);
    assert.equal(lecteur.analyserRcm(rcm, 2024).valeurs, undefined, 'texte 2025 refusé pour 2024');
    assert.match(lecteur.analyserRcm(rcm.replace('perçus en 2025', 'perçus en 2024'), 2025).etat,
        /preuves incomplètes/);

    // L'ancienne clé de cache (sans millésime) reste lue pour les revenus 2025.
    memoire.delete(k);
    memoire.set('pf2.dgfip.rcm.pdf.v1.rcm.' + id, JSON.stringify([{ url: lecteur.urls.rcm,
        annee_revenus: 2025, annee_declaration: 2026, extrait: rcm, revision: 1,
        recupere_le: new Date().toISOString() }]));
    assert.equal(lecteur.lireCache('rcm').tauxRcmPersonnelsAttestes, false,
        'cache Android constitué avant la clé millésimée toujours lisible');
    assert.equal(lecteur.lireCache('rcm', 2024), null, 'aucun report du cache 2025 sur 2024');

    ctx.PF.ui = { h: String }; ctx.PF.store = { reglages: () => ({}) };
    for (const f of ['util.js', 'fiscal.js']) vm.runInNewContext(fs.readFileSync(base + f, 'utf8'), ctx);
    const rapport = ctx.PF.fiscal.bilanMiseAJour(2025, { rcmPdf: premier });
    assert.match(rapport, /Brochure RCM DGFiP revenus 2025/);
    assert.match(rapport, /Brochure charges DGFiP revenus 2025/);
    assert.match(rapport, /avis et montants du foyer non lus/);
    assert.match(rapport, /Bascule DGFiP totale : non/);
    assert.equal(ctx.PF.fiscal.couvertureDgfip(2025).feuilles['CSG déductible et calendrier'], false);
    console.log('PDF RCM/charges DGFiP : preuves indépendantes, caches et non-activation OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
