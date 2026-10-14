/* node tests/test_fiscal_crypto_pdf_sources.js — DGFiP 2086/brochure, faux réseau,
   millésime exact, preuves indépendantes, rectifications, non-activation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const dossier = 'app/src/main/assets/www/js/';
const id = '6511ae04-2496-4ce5-840b-5d365c1d6ff2';
const memoire = new Map();
const notice = `Déclaration des plus ou moins-values réalisées en 2025 suite à des cessions d’actifs numériques et droits assimilés.
51 Total des prix de cession réalisés au niveau du foyer fiscal (l. 218 + l. 258 + l. 318 + l. 413 + l. 423 + l. 433)
Si le total des prix de cession réalisés au niveau du foyer fiscal est inférieur ou égal à 305 €, vos cessions sont exonérées.
(l. 224 + l. 264) à reporter : en ligne 3AN de la 2042 C en cas de plus-value globale ou en ligne 3BN de la 2042 C en cas de moins-value globale.
NOTICE (revenus 2025) Plus ou moins-value brute = Prix de cession – [Prix total d'acquisition x Prix de cession / Valeur globale du portefeuille].
Le taux forfaitaire de 12,8 % auquel s’ajoutent les prélèvements sociaux.
Les frais déductibles, quels qu'ils soient, ne viennent pas en diminution du prix de cession pour la détermination du quotient du prix de cession sur la valeur globale du portefeuille (ils doivent seulement être déduits du prix de cession qui constitue le premier terme de la différence prévue dans la formule).
Si vous optez pour le barème, vous devez cocher la case 3CN sur la déclaration 2042 C. L’option est globale et porte sur le total des plus-values réalisées par votre foyer fiscal. Cette option est indépendante de celle pouvant être exercée pour la taxation des revenus de capitaux mobiliers.`;
const brochure = `PLUS-VALUES DE CESSION D’ACTIFS NUMÉRIQUES (CGI, art. 150 VH bis, 200 C; BOI-RPPM-PVBMC-30)
Les foyers fiscaux réalisant des cessions d’actifs numériques dont la somme des prix n’excède pas 305 € au cours d’une année d’imposition sont exonérés.
Cette plus-value est imposée au taux de 12,8 % et soumise aux prélèvements sociaux.
La 2086 doit être jointe à la déclaration de revenus y compris lorsque le montant des cessions est inférieur à 305 €.
Si l’ensemble des cessions imposables réalisées par les membres du foyer fiscal en 2025 génère une moins-value, indiquez son montant ligne 3BN.
Cette option expresse et irrévocable est globale et porte sur le total des plus-values réalisées par le foyer fiscal durant l’année. L’option pour l’imposition selon le barème progressif est indépendante de celle pouvant être exercée pour la taxation des revenus de capitaux mobiliers.
PLAN D’ÉPARGNE AVENIR CLIMAT (PEAC)`;
const retours = {};
const ctx = { PF: { net: { auth: { utilisateur: () => ({ id }) }, reqPdf: url => Promise.resolve(retours[url]) },
        fiscalBrochureSources: { extrairePages: async b64 => JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) } },
    localStorage: { getItem: k => memoire.get(k) || null, setItem: (k, v) => memoire.set(k, v) },
    Date, Promise, Number, String };
ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(dossier + 'fiscal_crypto_pdf_sources.js', 'utf8'), ctx);
const lecteur = ctx.PF.fiscalCryptoPdfSources;
function reponse(url, texte) { retours[url] = { ok: true, binary_b64: Buffer.from(JSON.stringify([texte])).toString('base64') }; }
(async () => {
    assert.equal(lecteur.analyserNotice(notice).valeurs.psCrypto2025Attestes, false);
    assert.equal(lecteur.analyserNotice(notice).valeurs.annexeFoyerComplete, false);
    assert.equal(lecteur.analyserBrochure(brochure).valeurs.psCrypto2025Attestes, false);
    assert.equal(lecteur.analyserBrochure(brochure.replace('Cette plus-value', 'Cette plus- value')
        .replace('prélèvements sociaux', 'prélève - ments sociaux')).valeurs.psCrypto2025Attestes, false,
    'césures typographiques du vrai PDF reconnues sans inventer les PS');
    assert.equal(lecteur.analyserBrochure('Sommaire plus-values de cession d’actifs numériques (150 VH bis) … ' + brochure).valeurs.psCrypto2025Attestes, false,
        'la table des matières ne doit pas masquer la section réelle');
    assert.equal(lecteur.analyserNotice(notice.replace('réalisées en 2025', 'réalisées en 2024')).valeurs, undefined);
    assert.equal(lecteur.analyserNotice(notice.replace('inférieur ou égal à 305', 'inférieur ou égal à 306')).valeurs, undefined);
    assert.equal(lecteur.analyserNotice(notice.replace('ne viennent pas en diminution', 'viennent en diminution')).valeurs, undefined);
    assert.equal(lecteur.analyserBrochure(brochure.replace('en 2025 génère', 'en 2024 génère')).valeurs, undefined);
    assert.equal(lecteur.analyserBrochure(brochure.replace('12,8 %', '13,8 %')).valeurs, undefined);
    assert.equal((await lecteur.chercher(2024)).notice.valeurs, undefined);
    reponse(lecteur.urls.notice, notice);
    reponse(lecteur.urls.brochure, brochure);
    const premier = await lecteur.chercher(2025);
    assert.equal(premier.notice.enregistree, true, premier.notice.etat);
    assert.equal(premier.brochure.enregistree, true, premier.brochure.etat);
    assert.equal(lecteur.lireCache('notice').psCrypto2025Attestes, false);
    assert.equal(lecteur.lireCache('brochure').psCrypto2025Attestes, false);
    await lecteur.chercher(2025);
    assert.equal(JSON.parse(memoire.get('pf2.dgfip.crypto.pdf.v1.notice.' + id)).length, 1);
    reponse(lecteur.urls.notice, notice.replace('NOTICE (revenus 2025)', 'NOTICE rectifiée (revenus 2025)'));
    assert.equal((await lecteur.chercher(2025)).notice.enregistree, true);
    assert.equal(JSON.parse(memoire.get('pf2.dgfip.crypto.pdf.v1.notice.' + id)).length, 1,
        'un changement hors passages probants ne crée pas de révision');
    reponse(lecteur.urls.notice, notice.replace('qui constitue le premier terme', 'qui représente le premier terme'));
    assert.equal((await lecteur.chercher(2025)).notice.enregistree, true);
    assert.equal(JSON.parse(memoire.get('pf2.dgfip.crypto.pdf.v1.notice.' + id)).length, 2);
    retours[lecteur.urls.brochure] = { ok: false, error: 'hors ligne' };
    const partiel = await lecteur.chercher(2025);
    assert.equal(partiel.notice.enregistree, true, 'échec brochure n’efface pas notice');
    assert.equal(partiel.brochure.enregistree, false);
    ctx.PF.ui = { h: String }; ctx.PF.store = { reglages: () => ({}) };
    for (const f of ['util.js', 'fiscal.js']) vm.runInNewContext(fs.readFileSync(dossier + f, 'utf8'), ctx);
    const rapport = ctx.PF.fiscal.bilanMiseAJour(2025, { cryptoPdf: premier });
    assert.match(rapport, /Notice 2086 DGFiP revenus 2025/);
    assert.match(rapport, /Brochure plus-values crypto DGFiP revenus 2025/);
    assert.match(rapport, /taux PS crypto 2025 ne sont pas attestés/);
    assert.match(rapport, /Bascule DGFiP totale : non/);
    assert.equal(ctx.PF.fiscal.couvertureDgfip(2025).feuilles['PS crypto privés'], false);
    assert.equal(ctx.PF.fiscal.couvertureDgfip(2025).feuilles['crypto et 2086 complets'], false);
    console.log('PDF crypto DGFiP : notice et brochure indépendantes, caches, refus du millésime, aucune activation OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
