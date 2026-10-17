/* PS des cessions crypto PRIVÉES : recoupement millésimé de deux textes DGFiP.
   Le BOFiP (version 23/04/2024) qualifie ces gains de « revenus du patrimoine »
   au taux global de 17,2 % ; la brochure « nouveautés revenus 2025 » porte la
   CSG de 9,2 % à 10,6 % sur les revenus du patrimoine à compter des revenus
   2025. La FAQ courante n'est jamais la preuve. Hors réseau. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const stockage = new Map();
let compte = '12345678-1234-4123-a123-123456789012', appels = 0;

const BROCHURE_VALEURS = { revenus: 2025, declaration: 2026, ancienTauxCsg: .092,
    nouveauTauxCsg: .106, csgDeductibleMentionnee: .068,
    effetPatrimoine: 'revenus 2025 déclarés en 2026', effetPlacement: 'à compter du 1.1.2026',
    psCrypto2025Attestes: false };
const PAGE_BROCHURE = 'PRINCIPALES NOUVEAUTES REVENUS 2025 Prélèvements sociaux Le taux de la CSG est porté '
    + 'de 9,2 % à 10,6 % sur les revenus du patrimoine et les produits de placement. Les revenus fonciers, '
    + 'les plus-values immobilières, l’assurance-vie, l’épargne logement restent soumis au taux de 9,2 %. '
    + 'Le taux de CSG déductible reste à 6,8 % (LFSS 2026, art. 12 ; CSS, art. L136-8)';

function bofipHtml(ps = '17,2', pfu = '30', qualif = 'revenus du patrimoine', date = '23/04/2024') {
    return `<html><body>
<p><strong>Date de début de publication du BOI :</strong> ${date}</p>
<p><strong>Identifiant juridique :</strong> BOI-RPPM-PVBMC-30-30</p>
<p>Les plus-values des particuliers entrant dans le champ d'application de l'article 150 VH bis du CGI
sont soumises à l'impôt sur le revenu au taux forfaitaire de 12,8 % (CGI, art. 200 C) ainsi qu'aux
prélèvements sociaux sur les ${qualif} au taux global de ${ps} %.</p>
<p>Les plus-values concernées sont donc imposées à un taux global de ${pfu} %.</p>
</body></html>`;
}

const ctx = vm.createContext({
    PF: {
        net: { auth: { utilisateur: () => ({ id: compte }) },
            req: async (m, u) => { appels++; return { ok: true, status: 200, body: bofipHtml() }; },
            reqPdf: async () => { appels++; return { ok: true, binary_b64: 'x' }; } },
        fiscalBrochureSources: { analyser: pages => ({ etat: 'lu', valeurs: BROCHURE_VALEURS,
            extrait: Array.isArray(pages) ? pages.join(' ') : pages }), extrairePages: async () => [PAGE_BROCHURE] },
        fiscalCryptoSources: { lireCache: () => faqCache }
    },
    localStorage: { getItem: k => (stockage.has(k) ? stockage.get(k) : null),
        setItem: (k, v) => stockage.set(k, v) },
    Date, Promise, Number, Object, String, JSON, Math, Array, Error, RegExp
});
ctx.globalThis = ctx;
let faqCache = null;
for (const f of ['fiscal_couverture.js', 'fiscal_crypto_ps_recoupement.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
const R = ctx.PF.fiscalCryptoPsRecoupement;

// Le pont Android ne suit une redirection BOFiP que pour BOI-IR-LIQ-20-* :
// la source doit donc être un permalien, sur un hôte autorisé.
assert.equal(R.urls.bofip, R.urls.permalien2024, 'permalien versionné, sans redirection');
assert.equal(/doctrine/.test(R.urls.bofip), false);
assert.match(R.urls.bofip,
    /^https:\/\/bofip\.impots\.gouv\.fr\/bofip\/11969-PGP\.html\/identifiant=BOI-RPPM-PVBMC-30-30-20240423$/);
assert.match(R.urls.brochure, /^https:\/\/www\.impots\.gouv\.fr\//, 'hôte autorisé pour la lecture PDF');

// ------------------------------------------------------------- lecture du BOFiP
const bofip = R.analyserBofip(bofipHtml());
assert.equal(bofip.valeurs.identifiant, 'BOI-RPPM-PVBMC-30-30');
assert.equal(bofip.valeurs.publication, '23/04/2024', 'date de la version publiée');
assert.equal(bofip.valeurs.version, '20240423');
assert.equal(bofip.valeurs.ir, .128);
assert.equal(bofip.valeurs.psGlobal, .172);
assert.equal(bofip.valeurs.pfuGlobal, .30);
assert.equal(bofip.valeurs.qualification, 'revenus du patrimoine');
assert.equal(bofip.valeurs.anneeEffetAttestee, null, 'le BOFiP ne date pas son taux par année de cession');
assert.match(bofip.etat, /non daté par année de cession/);
assert.equal(R.analyserBofip(bofipHtml().replace('23/04/2024', '')).valeurs, undefined);
assert.match(R.analyserBofip(bofipHtml().replace('23/04/2024', '')).etat, /date de publication/);
assert.match(R.analyserBofip(bofipHtml().replace('BOI-RPPM-PVBMC-30-30', 'BOI-RPPM-PVBMC-30-20')).etat, /non reconnu/);
assert.match(R.analyserBofip(bofipHtml('17,2', '30', 'produits de placement')).etat, /produits de placement/,
    'qualification placement : date d’effet différente, recoupement refusé');
assert.match(R.analyserBofip(bofipHtml('17,2', '31,4')).etat, /différents du taux global/);
assert.match(R.analyserBofip(bofipHtml('15,5', '28,3')).etat, /taux IR ou PS du BOFiP non reconnus/);
assert.match(R.analyserBofip(bofipHtml().replace(/article 150 VH bis/, 'article 150 UA')).etat, /150 VH bis absent/);

// ------------------------------------------------------------- liste d'exceptions
const exc = R.exceptionsBrochure([PAGE_BROCHURE]);
assert.ok(exc && !exc.cryptoExclue, 'actifs numériques hors de la liste d’exceptions');
assert.match(exc.phrase, /revenus fonciers/);
assert.equal(R.exceptionsBrochure(['texte sans exceptions']), null);
assert.ok(R.exceptionsBrochure(['Les revenus fonciers, les plus-values de cession d’actifs numériques '
    + 'restent soumis au taux de 9,2 %']).cryptoExclue, 'une exclusion crypto ferait échouer le recoupement');

// ------------------------------------------------------------------ recoupement
const ok = R.recouper(bofip, { valeurs: BROCHURE_VALEURS }, 2025, { exceptions: exc });
assert.equal(ok.statut, 'recoupement');
assert.equal(ok.taux, .186);
assert.equal(ok.active, false, 'aucune activation automatique');
assert.equal(ok.anneeEffet, 2025);
assert.equal(ok.anneeRevenus, 2025);
assert.equal(ok.anneeDeclaration, 2026);
assert.ok(ok.maillons.length >= 8 && ok.maillons.every(m => m.verifie), 'chaque maillon est nommé et vérifié');
assert.match(ok.derivation, /BOI-RPPM-PVBMC-30-30 \(version 23\/04\/2024\)/);
assert.match(ok.derivation, /17,2 % \+ 1,4 % = 18,6 %/);
assert.match(ok.derivation, /hors de la liste d’exceptions/);
assert.equal(ok.sources.length, 2);
assert.match(ok.contradictionBofip, /affiche encore 17,2 %/);
assert.ok(ok.exclusions.some(e => /FAQ courante non attribuée à 2025/.test(e)));
assert.ok(ok.exclusions.some(e => /produits de placement/.test(e)));
assert.match(ok.etat, /aucun taux activé/);

// Un maillon manquant fait retomber sur « partiel », jamais sur une estimation.
const sansDate = R.recouper(bofip, { valeurs: BROCHURE_VALEURS }, 2024, { exceptions: exc });
assert.equal(sansDate.statut, 'partiel');
assert.equal(sansDate.taux, null);
assert.match(sansDate.etat, /brochure du millésime revenus 2024/);
assert.equal(R.recouper(bofip, { valeurs: BROCHURE_VALEURS }, 2026, { exceptions: exc }).etat,
    'documents du millésime revenus 2026 non publiés');
assert.equal(R.recouper(bofip, { valeurs: BROCHURE_VALEURS }, 2027, { exceptions: exc }).etat,
    'millésime non pris en charge');
assert.match(R.recouper(bofip, { valeurs: BROCHURE_VALEURS }, 2025).etat, /liste d’exceptions vérifiée/);
assert.match(R.recouper(bofip, { valeurs: BROCHURE_VALEURS }, 2025,
    { exceptions: { phrase: 'x', cryptoExclue: true } }).etat, /HORS de la liste d’exceptions/);
assert.match(R.recouper(null, { valeurs: BROCHURE_VALEURS }, 2025, { exceptions: exc }).etat, /BOFiP crypto lu/);
assert.match(R.recouper(bofip, null, 2025, { exceptions: exc }).etat, /brochure du millésime/);
assert.match(R.recouper(R.analyserBofip(bofipHtml('18,6', '31,4')), { valeurs: BROCHURE_VALEURS }, 2025,
    { exceptions: exc }).etat, /dérivation incohérente/, 'un BOFiP déjà à 18,6 % ne se recoupe plus');

// La FAQ ne sert qu'en corroboration : elle contredit → rétrogradation.
const corrobore = R.recouper(bofip, { valeurs: BROCHURE_VALEURS }, 2025,
    { exceptions: exc, faq: { valeurs: { psCourant: .186, dateModification: '17/07/2026' } } });
assert.equal(corrobore.statut, 'recoupement');
assert.match(corrobore.corroboration.portee, /jamais preuve/);
const contredit = R.recouper(bofip, { valeurs: BROCHURE_VALEURS }, 2025,
    { exceptions: exc, faq: { valeurs: { psCourant: .172, dateModification: '17/07/2026' } } });
assert.equal(contredit.statut, 'partiel');
assert.match(contredit.etat, /contradiction documentaire/);
assert.equal(contredit.taux, null);

// ------------------------------------------------------------------- millésimes
(async () => {
    for (const an of [2023, 2024, 2026]) {
        const r = await R.chercher(an);
        assert.equal(r.statut, 'partiel');
        assert.equal(r.taux, null);
        assert.equal(r.enregistree, false);
    }
    assert.equal(appels, 0, 'aucune requête pour un millésime sans document attributif');
    assert.match((await R.chercher(2023)).etat, /aucune source DGFiP ne date le taux PS crypto/);
    assert.match((await R.chercher(2026)).etat, /documents du millésime non publiés/);

    const r2025 = await R.chercher(2025);
    assert.equal(r2025.statut, 'recoupement', 'BOFiP + brochure revenus 2025 lus');
    assert.equal(r2025.taux, .186);
    assert.equal(r2025.enregistree, true);
    assert.equal(appels, 2, 'une requête BOFiP et une requête PDF');
    const cle = 'pf2.dgfip.crypto.ps.recoupement.v1.' + compte;
    const revise = JSON.parse(stockage.get(cle));
    assert.equal(revise[2025].length, 1);
    assert.equal(revise[2025][0].annee_revenus, 2025);
    assert.equal(revise[2025][0].annee_declaration, 2026, 'année de déclaration distinguée');
    assert.equal(revise[2025][0].statut, 'recoupement');
    const premier = stockage.get(cle);
    await R.chercher(2025);
    assert.equal(stockage.get(cle), premier, 'aucune révision sans changement du document');
    assert.equal(R.lireCache(2025).taux, .186, 'cache revalidé par relecture des deux textes');

    // Rectification d'un même millésime conservée, historique non écrasé.
    ctx.PF.net.req = async () => ({ ok: true, status: 200, body: bofipHtml('18,6', '31,4') });
    const rectifie = await R.chercher(2025);
    assert.equal(rectifie.statut, 'partiel');
    assert.equal(JSON.parse(stockage.get(cle))[2025].length, 2, 'rectification conservée');
    assert.equal(R.lireCache(2025), null, 'un recoupement rétrogradé n’est pas relu comme preuve');

    // Cache falsifié ou d'un autre compte : jamais de taux isolé réutilisé.
    ctx.PF.net.req = async () => ({ ok: true, status: 200, body: bofipHtml() });
    stockage.set(cle, JSON.stringify({ 2025: [{ annee_revenus: 2025, url_bofip: R.urls.bofip,
        extrait_bofip: 'taux global de 18,6 %', extrait_brochure_pages: [PAGE_BROCHURE], revision: 1 }] }));
    assert.equal(R.lireCache(2025), null, 'extrait BOFiP non revalidé');
    stockage.set(cle, JSON.stringify({ 2025: [{ annee_revenus: 2025,
        url_bofip: 'https://bofip.impots.gouv.fr/autre', extrait_bofip: bofip.extrait,
        extrait_brochure_pages: [PAGE_BROCHURE], revision: 1 }] }));
    assert.equal(R.lireCache(2025), null, 'URL différente refusée');
    await R.chercher(2025);
    assert.ok(R.lireCache(2025));
    compte = '87654321-1234-4123-a123-123456789012';
    assert.equal(R.lireCache(2025), null, 'aucun mélange entre comptes');
    ctx.PF.net.auth.utilisateur = () => null;
    await assert.rejects(() => R.chercher(2025), /Session requise/);
    await assert.rejects(() => R.chercher(2022), /Millésime PS crypto invalide/);

    // FAQ contradictoire en cache : le recoupement est rétrogradé, pas activé.
    ctx.PF.net.auth.utilisateur = () => ({ id: compte });
    faqCache = { psCourant: .172, dateModification: '17/07/2026' };
    const avecFaq = await R.chercher(2025);
    assert.equal(avecFaq.statut, 'partiel');
    assert.match(avecFaq.etat, /contradiction documentaire/);

    console.log('PS crypto privés : recoupement BOFiP + brochure revenus 2025 (18,6 % non activé), '
        + 'refus par millésime, contradictions et caches revalidés OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
