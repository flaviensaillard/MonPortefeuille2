/* node tests/test_fiscal_brochure_sources.js — PDF transport, texte, millésime,
   refus d'attribution crypto et conservation des rectifications. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const pdfjs = require('../app/src/main/assets/www/vendor/pdfjs/pdf.min.js');
const dossier = 'app/src/main/assets/www/js/';
const id = '0b5524a0-88dc-4920-a899-913067b8d352';
const memoire = new Map();
const texte = `Prelevements sociaux Le taux de la CSG est porte de 9,2 % a 10,6 % sur les revenus du patrimoine et les produits de placement.
Les revenus fonciers, les plus-values immobilieres, l'assurance-vie, l'epargne logement restent soumis au taux de 9,2 %.
Le taux de CSG deductible reste a 6,8 %.
La hausse de la CSG s'applique a compter des revenus 2025 declares en 2026 pour les revenus du patrimoine et a compter du 1.1.2026 pour les produits de placement.
(LFSS 2026, art. 12 ; CSS, art. L136-8)
PRINCIPALES NOUVEAUT E S REVENUS 2025`;
const autreAnnee = `PRINCIPALES NOUVEAUTES REVENUS 2026 & SUIVANTS`;
// Passage public réellement extrait de la page 1 par PDF.js sur le PDF DGFiP :
// titre 2025 APRÈS le paragraphe CSG, « NOUVEAUT É S » scindé par la police.
const passageReel = `Prélèvements sociaux Le taux de la CSG est porté de 9,2 % à 10,6 % sur les revenus du patrimoine et les produits de placement. Les revenus fonciers, les plus-values immobilières, l’assurance-vie, l’épargne logement restent soumis au taux de 9,2 %. Le taux de CSG déductible reste à 6,8 % La hausse de la CSG s’applique à compter des revenus 2025 déclarés en 2026 pour les revenus du patrimoine et à compter du 1.1.2026 pour les produits de placement. (LFSS 2026, art. 12 ; CSS, art. L136-8) PRINCIPALES NOUVEAUT É S REVENUS 2025`;

// PDF minimal valide, texte sans dépendance npm pendant le test/CI.
function pdf(pages) {
    const objets = ['<< /Type /Catalog /Pages 2 0 R >>',
        `<< /Type /Pages /Kids [${pages.map((_, i) => 4 + i * 2 + ' 0 R').join(' ')}] /Count ${pages.length} >>`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    for (let i = 0; i < pages.length; i++) {
        const lignes = pages[i].replace(/\s+/g,' ').match(/.{1,65}(?:\s|$)/g) || [pages[i]];
        const stream = 'BT /F1 10 Tf 40 750 Td 12 TL ' + lignes.map(x => '(' + x.replace(/[()\\]/g, '\\$&') + ') Tj T*').join(' ') + ' ET';
        const content = 5 + i * 2;
        objets.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`);
        objets.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    }
    let s = '%PDF-1.4\n'; const offsets = [0];
    objets.forEach((o, i) => { offsets.push(Buffer.byteLength(s)); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const debut = Buffer.byteLength(s);
    s += 'xref\n0 ' + (objets.length + 1) + '\n0000000000 65535 f \n';
    offsets.slice(1).forEach(n => { s += String(n).padStart(10, '0') + ' 00000 n \n'; });
    s += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debut}\n%%EOF`;
    return Buffer.from(s).toString('base64');
}

const ctx = {
    PF: { net: { auth: { utilisateur: () => ({ id }) }, reqPdf: async () => ({ ok: true, binary_b64: pdf([texte, autreAnnee]) }) } },
    pdfjsLib: pdfjs,
    pdfjsWorkerSrc: require.resolve('../app/src/main/assets/www/vendor/pdfjs/pdf.worker.min.js'),
    atob: b64 => Buffer.from(b64, 'base64').toString('binary'),
    localStorage: { getItem: k => memoire.get(k) || null, setItem: (k, v) => memoire.set(k, v) },
    Date, Uint8Array, Promise, console
};
ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(dossier + 'fiscal_brochure_sources.js', 'utf8'), ctx);
const lecteur = ctx.PF.fiscalBrochureSources;
(async () => {
    // Le canal PDF doit préserver les octets Base64 : aucun décodage UTF-8.
    let rappel;
    const netCtx = { PF: { util: {} }, document: {}, Native: { httpPdfAsync: (url, id) => {
        assert.equal(url, lecteur.url); rappel = id;
    } }, Date, Promise, Uint8Array, atob: ctx.atob };
    netCtx.globalThis = netCtx;
    vm.runInNewContext(fs.readFileSync(dossier + 'net.js', 'utf8'), netCtx);
    const attente = netCtx.PF.net.reqPdf(lecteur.url);
    const brut = '/wD+UEZG'; // octets non UTF-8 après préfixe
    netCtx.PF.net._fin(rappel, { ok: true, status: 200, binary_b64: brut });
    assert.equal((await attente).binary_b64, brut);
    assert.equal(lecteur.analyser(texte).valeurs.nouveauTauxCsg, .106);
    assert.equal(lecteur.analyser([passageReel, autreAnnee]).valeurs.nouveauTauxCsg, .106,
        'l’ordre des items et le titre fragmenté du vrai PDF sont reconnus');
    assert.equal(lecteur.analyser([passageReel.replace('revenus 2025 déclarés en 2026', 'revenus 2026 déclarés en 2027'), autreAnnee]).valeurs, undefined);
    assert.equal(lecteur.analyser([passageReel.replace('PRINCIPALES NOUVEAUT É S REVENUS 2025', ''), autreAnnee]).valeurs, undefined,
        'un taux 2025 sans titre sur la même page est refusé');
    assert.equal(lecteur.analyser([passageReel, passageReel]).valeurs, undefined,
        'un millésime ambigu sur plusieurs pages est refusé');
    assert.equal(lecteur.analyser(texte).valeurs.psCrypto2025Attestes, false);
    assert.equal(lecteur.analyser(texte.replace('revenus 2025 declares en 2026', 'revenus 2026 declares en 2027')).valeurs, undefined);
    assert.equal(lecteur.analyser(texte.replace('revenus du patrimoine et les produits de placement', 'les revenus')).valeurs, undefined);
    assert.equal((await lecteur.chercher(2024)).enregistree, false);
    const premiere = await lecteur.chercher(2025);
    assert.equal(premiere.enregistree, true, premiere.etat);
    assert.equal(lecteur.lireCache().psCrypto2025Attestes, false);
    ctx.PF.ui = { h: String };
    ctx.PF.store = { reglages: () => ({}) };
    vm.runInNewContext(fs.readFileSync(dossier + 'util.js', 'utf8'), ctx);
    vm.runInNewContext(fs.readFileSync(dossier + 'fiscal.js', 'utf8'), ctx);
    const rapport = ctx.PF.fiscal.bilanMiseAJour(2025, { brochure: premiere });
    assert.match(rapport, /revenus 2025 déclarés en 2026/);
    assert.match(rapport, /aucun taux activé/);
    assert.match(rapport, /Bascule DGFiP totale : non/);
    assert.equal(ctx.PF.fiscal.couvertureDgfip(2025).feuilles['PS crypto privés'], false);
    assert.equal(JSON.parse([...memoire.values()][0]).length, 1);
    await lecteur.chercher(2025);
    assert.equal(JSON.parse([...memoire.values()][0]).length, 1);
    // Rectification sur le même millésime : conserver les deux preuves.
    ctx.PF.net.reqPdf = async () => ({ ok: true, binary_b64: pdf([texte.replace('Le taux de CSG deductible reste a 6,8 %.', 'Le taux de CSG deductible reste a 6,8 %. Note complementaire.'), autreAnnee]) });
    assert.equal((await lecteur.chercher(2025)).enregistree, true);
    assert.equal(JSON.parse([...memoire.values()][0]).length, 2);
    ctx.PF.net.reqPdf = async () => ({ ok: true, binary_b64: Buffer.from('<html>not a pdf</html>').toString('base64') });
    assert.equal((await lecteur.chercher(2025)).enregistree, false);
    assert.equal(JSON.parse([...memoire.values()][0]).length, 2);
    console.log('PDF DGFiP : extraction, garde-fous, millésime, révisions et non-activation OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
