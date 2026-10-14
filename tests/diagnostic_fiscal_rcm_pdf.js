/* Vérification ponctuelle SUR LES PDF DGFiP réels, à exécuter dans un
   environnement disposant d'un accès réseau à impots.gouv.fr.
   node tests/diagnostic_fiscal_rcm_pdf.js ; aucun taux personnel activé. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const base = 'app/src/main/assets/www/';
const ctx = { PF: {}, Date, Promise, Number, String,
    Uint8Array, atob: s => Buffer.from(s, 'base64').toString('binary') };
ctx.globalThis = ctx;
ctx.pdfjsLib = require('../app/src/main/assets/www/vendor/pdfjs/pdf.min.js');
ctx.pdfjsLib.GlobalWorkerOptions.workerSrc = require('node:path').resolve(base, 'vendor/pdfjs/pdf.worker.min.js');
for (const f of ['fiscal_brochure_sources.js', 'fiscal_rcm_pdf_sources.js'])
    vm.runInNewContext(fs.readFileSync(base + 'js/' + f, 'utf8'), ctx);
(async () => {
    const reader = ctx.PF.fiscalRcmPdfSources;
    for (const type of ['rcm', 'charges']) {
        const url = reader.urls[type];
        const rep = await fetch(url);
        assert.equal(rep.status, 200, url);
        const buf = Buffer.from(await rep.arrayBuffer());
        const pages = await ctx.PF.fiscalBrochureSources.extrairePages(buf.toString('base64'));
        const analyse = (type === 'rcm' ? reader.analyserRcm : reader.analyserCharges)(pages);
        console.log(type, 'octets=', buf.length, 'pages=', pages.length, 'etat=', analyse.etat);
        if (!analyse.valeurs) {
            const needles = type === 'rcm' ? ['2CG', '2BH', '2DF', '2042 K']
                : ['6DE', 'CSG DÉDUCTIBLE CALCULÉE', '2BH'];
            for (const n of needles) {
                const index = pages.findIndex(s => s.includes(n));
                const extrait = index < 0 ? '' : pages[index].slice(Math.max(0, pages[index].indexOf(n) - 100), pages[index].indexOf(n) + 850);
                console.log('repere', n, 'page', index + 1, extrait);
                console.log('::warning title=PDF ' + type + ' ' + n + ' page ' + (index + 1)
                    + '::' + extrait.replace(/[\r\n%]/g, ' ').slice(0, 900));
            }
        }
        assert.ok(analyse.valeurs, analyse.etat);
        assert.ok((type === 'rcm' ? reader.analyserRcm : reader.analyserCharges)(analyse.extrait).valeurs,
            'extrait sauvegardé impossible à relire');
        assert.equal(analyse.valeurs.revenus, 2025);
        assert.equal(type === 'rcm' ? analyse.valeurs.tauxRcmPersonnelsAttestes :
            analyse.valeurs.deductionPersonnelleAttestee, false);
    }
})().catch(e => { console.error(e);
    console.error('::error title=Diagnostic PDF DGFiP::' + String(e && e.stack || e).replace(/[\r\n%]/g, ' ').slice(0, 2500));
    process.exitCode = 1; });
