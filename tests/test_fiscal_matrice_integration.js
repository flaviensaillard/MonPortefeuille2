/* Intégration : la matrice de couverture et le recoupement PS crypto alimentent
   l'écran fiscal SANS changer un seul chiffre du moteur, sans remplacer une R2
   publiée et sans reconduire 2025 sur 2026. Hors réseau. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const id = '12345678-1234-4123-a123-123456789012';
const stockage = new Map();
const REC = { statut: 'recoupement', taux: .186, anneeEffet: 2025, anneeRevenus: 2025,
    anneeDeclaration: 2026, active: false,
    derivation: 'BOFiP BOI-RPPM-PVBMC-30-30 (version 23/04/2024) : PS sur les revenus du patrimoine au '
        + 'taux global de 17,2 %. Brochure nouveautés revenus 2025 : CSG portée de 9,2 % à 10,6 % à compter '
        + 'des revenus 2025. Donc 17,2 % + 1,4 % = 18,6 % pour les cessions de 2025.',
    sources: [{ url: 'https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423',
        publication: '23/04/2024' },
        { url: 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf',
            publication: 'déclaration 2026' }],
    contradictionBofip: 'le BOFiP crypto (version 23/04/2024) affiche encore 17,2 %',
    exclusions: ['FAQ courante non attribuée à 2025'], etat: 'recoupement, aucun taux activé' };
let recoupementActif = false;

const ctx = vm.createContext({
    PF: { ui: { h: String }, store: { reglages: () => ({}) },
        net: { auth: { utilisateur: () => ({ id }) }, req: async () => ({ ok: false }),
            reqPdf: async () => ({ ok: false }) } },
    localStorage: { getItem: k => (stockage.has(k) ? stockage.get(k) : null),
        setItem: (k, v) => stockage.set(k, v) },
    Date, Promise, Number, Object, String, JSON, Math, Array, Error, RegExp, isFinite
});
ctx.globalThis = ctx;
for (const f of ['util.js', 'fiscal.js', 'fiscal_couverture.js', 'fiscal_gardes_foyer.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
ctx.PF.fiscalFraisSources = { lireCache: () => null,
    KM: an => 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/' + (an + 1) + '/aides/frais.htm',
    repasUrl: an => (an <= 2024 ? ctx.PF.fiscalFraisSources.KM(an) : 'https://www.impots.gouv.fr/particulier/frais-de-repas') };
ctx.PF.fiscalRegimesSources = { lireCache: () => null,
    url: an => 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/' + (an + 1) + '/aides/gains.htm' };
ctx.PF.fiscalCryptoPsRecoupement = {
    lireCache: an => (recoupementActif && an === 2025 ? REC : null),
    chercher: async () => REC, urls: { bofip: 'https://bofip.impots.gouv.fr/doctrine/BOI-RPPM-PVBMC-30-30' }
};
const f = ctx.PF.fiscal;
const json = x => JSON.stringify(x);

(async () => {
    // ---------------------------------------------------- avant toute collecte
    assert.equal(f.tauxPSEtabli(2025), null, 'sans document du millésime, rien n’est établi');
    assert.equal(f.tauxPSEtabli(2026), null);
    assert.match(f.PROVENANCE_PS[2026], /reconduction de 2025/);
    assert.match(f.PROVENANCE_PS[2026], /non établi/);
    assert.match(f.verifierMaj(2026).message, /reconduction de 2025/,
        'la constante recopiée est annoncée comme telle');
    const avant = f.comparerOptionsFoyer(42000, 2, 2025, 'Marié(e) / Pacsé(e)', 1000, 500, true, 2000);
    assert.equal(f.revisionActive(2025), false);
    assert.equal(f.psCryptoRecoupement(2025), null);

    // ------------------------------------------- relecture des caches (recoupement)
    recoupementActif = true;
    assert.equal(await f.actualiserCollectesDgfip({ snapshots: [] }), null);
    const rec = f.psCryptoRecoupement(2025);
    assert.equal(rec.taux, .186);
    assert.equal(rec.active, false);
    assert.equal(f.psCryptoRecoupement(2024), null, 'jamais reporté sur un autre millésime');
    assert.equal(f.psCryptoRecoupement(2026), null);
    assert.equal(f.revisionActive(2025), false, 'un recoupement n’est pas une révision publiée');
    assert.equal(f.tauxPS(2025), .186, 'taux inchangé');
    assert.equal(f.tauxPS(2026), f.PS_PAR_ANNEE[2026], 'comportement existant conservé');
    assert.equal(f.tauxPSEtabli(2025), null, 'le recoupement ne passe pas pour un texte explicite');

    // --------------------------------------------- NON-RÉGRESSION des calculs
    const apres = f.comparerOptionsFoyer(42000, 2, 2025, 'Marié(e) / Pacsé(e)', 1000, 500, true, 2000);
    assert.equal(json(apres), json(avant), 'aucun chiffre du moteur modifié par le recoupement');
    assert.equal(apres.retenu.ps_crypto, avant.retenu.ps_crypto);
    assert.throws(() => f.comparerOptionsFoyer(42000, 2, 2026, 'Marié(e) / Pacsé(e)', 0, 0, true, 0),
        /non disponible|suspendue/, 'revenus 2026 : simulation refusée sans document du millésime');
    assert.equal(f.couvertureDgfip(2025).feuilles['PS crypto privés'], false,
        'la porte de bascule totale reste fermée');
    assert.equal(f.couvertureDgfip(2025).complet, false);

    // ------------------------------------------------------------------ matrice
    const m = f.matriceCouverture();
    assert.equal(m.annees.join(','), '2023,2024,2025,2026');
    assert.equal(m.cellules[2025].ps_crypto.statut, 'recoupement');
    assert.equal(m.cellules[2025].ps_crypto.valeur, .186);
    assert.equal(m.cellules[2025].ps_crypto.anneeEffet, 2025);
    assert.match(m.cellules[2025].ps_crypto.source, /bofip\.impots\.gouv\.fr/);
    assert.equal(m.cellules[2024].ps_crypto.statut, 'non disponible');
    assert.equal(m.cellules[2026].ps_crypto.statut, 'non disponible');
    assert.equal(m.synthese.basculeComplete, false);
    assert.equal(m.synthese.recoupements, 1);
    ['ir_bareme', 'decote', 'qf_general', 'ps_titres'].forEach(c =>
        assert.equal(m.cellules[2025][c].statut, 'non disponible',
            'aucune valeur embarquée ne passe pour une collecte DGFiP'));
    assert.equal(m.cellules[2025].ir_bareme.note.includes('valeur embarquée'), true);
    assert.equal(f.preuvesParAnnee(2025).revisionPubliee, false);
    assert.equal(f.preuvesParAnnee(2025).urls.gains.includes('/2026/'), true,
        'URL de l’aide rattachée à la déclaration 2026');

    // ---------------------------------------------------------------- affichage
    const html = f.htmlMatrice();
    assert.match(html, /<details/);
    assert.match(html, /Matrice de couverture DGFiP 2023–2026/);
    assert.match(html, /bascule totale : non/);
    assert.match(html, /recoupements 1/);
    assert.match(html, /Contradictions documentaires DGFiP/);
    assert.match(html, /BOFiP BOI-RPPM-PVBMC-30-30/);
    assert.match(html, /23\/04\/2024/);
    assert.match(html, /modifiée le 17\/07\/2026/);
    assert.match(html, /n’est PAS attribuée automatiquement à 2025/);
    assert.match(html, /Revenus 2026<\/b> — déclaration 2027, publication BOFiP non disponible/);

    // ------------------------------------------------------------------ rapports
    const bilan = f.bilanMiseAJour(2025, { boi: {}, frais: {}, recoupement: REC });
    assert.match(bilan, /recoupement documentaire/);
    assert.match(bilan, /17,2 % \+ 1,4 % = 18,6 %/);
    assert.match(bilan, /Aucun taux activé par cette lecture/);
    assert.match(bilan, /Bascule DGFiP totale : non/);
    assert.match(bilan, /CSG déductible.*non vérifiés/);
    const bilan2026 = f.bilanMiseAJour(2026, { boi: {}, frais: {} });
    assert.match(bilan2026, /revenus 2026 non établi/);
    assert.match(bilan2026, /FAQ courante n’est pas attribuée à cette année/);
    assert.match(bilan2026, /version du 23\/04\/2024, 17,2 %/);
    assert.doesNotMatch(bilan2026, /18,6 % pour les cessions/);
    // Le résumé court reste copiable et ne contient ni URL ni taux.
    const court = f.resumeRapport(2025, { boi: {}, frais: {}, recoupement: REC });
    assert.ok(court.length < 600, 'résumé toujours copiable en un message : ' + court.length);
    assert.doesNotMatch(court, /https?:|18,6 %/);
    assert.match(court, /Bascule DGFiP totale : non/);

    // ---------------------------------------------------- garde-fous accessibles
    assert.equal(f.csgDeductible6DE({ annee: 2025, lignes2BH: 1000, montant6DE: 68 }).doubleCompte, true);
    assert.equal(f.portee2086Foyer({ annee: 2025, totalPrixCessionPortefeuille: 1000,
        seuilOfficiel: 305 }).certifieFoyer, false);
    assert.equal(f.casParticuliersQF({ parts: 1.5, statut: 'Célibataire', enfants: 1,
        parentIsole: true }).certifie, false);

    // La matrice est rendue par l'onglet unique de mise à jour (2.2.5), appelé
    // dans les TROIS branches de l'écran : calcul indisponible, portefeuille non
    // chargé, cas nominal. Avant cela elle était appelée deux fois en clair, si
    // bien que le comptage brut a changé de forme — l'exigence, non : la matrice
    // doit rester repliée dans l'écran fiscal, y compris quand le calcul est
    // indisponible. On vérifie donc l'emboîtement réel plutôt qu'un décompte.
    const code = fs.readFileSync(path.join(dir, 'fiscal.js'), 'utf8');
    assert.equal((code.match(/htmlOngletCollecte\(/g) || []).length >= 4, true,
        'onglet de mise à jour appelé dans les trois branches de l’écran fiscal');
    assert.match(code, /function htmlOngletCollecte[\s\S]{0,400}htmlMatrice\(\)/,
        'matrice repliée dans l’onglet, y compris quand le calcul est indisponible');
    const index = fs.readFileSync(path.join(dir, '..', 'index.html'), 'utf8');
    ['fiscal_couverture.js', 'fiscal_crypto_ps_recoupement.js', 'fiscal_gardes_foyer.js'].forEach(m =>
        assert.ok(index.includes('js/' + m), m + ' chargé par la WebView'));

    console.log('Intégration matrice + recoupement PS crypto : aucun chiffre du moteur changé, '
        + 'R2 non remplacée, 2026 non reconduit OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
