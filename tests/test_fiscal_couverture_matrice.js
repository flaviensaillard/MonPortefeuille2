'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const dir = 'app/src/main/assets/www/js/';
class DateFixe extends Date { constructor(...args) { super(...(args.length ? args : ['2027-10-14T12:00:00Z'])); } }
const ctx = vm.createContext({ Date: DateFixe, PF: { ui: { h: String },
    store: { reglages: () => ({ anneeFiscale: 2026 }) },
    net: { auth: { utilisateur: () => ({ id: 'compte-a' }) } } } });
for (const nom of ['util.js', 'fiscal.js']) vm.runInContext(fs.readFileSync(dir + nom, 'utf8'), ctx);
const f = ctx.PF.fiscal;
(async () => {
    const initiale = JSON.stringify(f.matriceCouvertureDgfip());
    for (const ligne of f.matriceCouvertureDgfip()) {
        assert.equal(ligne.declaration, ligne.revenus + 1);
        assert.equal(ligne.complet, false);
        assert.ok(ligne.categories.every(c => c.etat === 'non disponible'));
        assert.ok(ligne.categories.every(c => c.publication === null));
    }
    // Simuler un futur cache de paramètres partiels reconnus. Même tous les
    // paramètres IR/frais ne certifient pas RCM/crypto/QF spéciaux/arrondis.
    ctx.PF.fiscalDgfipSources = { lireCache: an => an === 2026 ? {
        ir: { tranches: [12000, 30000, 85000, 183000], taux: [.11,.30,.41,.45] },
        decote: { dc: 900, dcCouple: 1500, dcPlafond: 1989, dcPlafondCouple: 3315 }, qf: 1900,
        sources: { ir: { url: 'https://bofip.impots.gouv.fr/doctrine/BOI-IR-LIQ-20-10', datePublication: '07/04/2027' } }
    } : null };
    ctx.PF.fiscalFraisSources = { KM: () => 'https://simulateur-ir-ifi.impots.gouv.fr/', repasUrl: () => 'https://www.impots.gouv.fr/particulier/frais-de-repas', lireCache: an => an === 2026 ? { abatt: { min: 520, max: 15000 }, repas: 5.5,
        km: { 3: [.529,.316,1065,.370], 4: [.606,.340,1330,.407], 5: [.636,.357,1395,.427],
            6: [.665,.374,1457,.447], 7: [.697,.394,1515,.470] } } : null };
    ctx.PF.fiscalRegimesSources = { lireCache: () => ({ ir: .128, ps: .186 }) };
    await f.actualiserRevisions({ transactions: [] });
    const matrice = f.matriceCouvertureDgfip();
    const futur = matrice.find(l => l.revenus === 2026);
    assert.equal(futur.categories.find(c => c.categorie === 'IR').publication, '07/04/2027');
    assert.equal(futur.categories.find(c => c.categorie === 'IR').etat, 'preuve partielle disponible');
    assert.equal(futur.complet, false);
    const titres25 = matrice.find(l => l.revenus === 2025).categories.find(c => c.categorie === 'PS plus-values de titres');
    assert.equal(titres25.etat, 'non disponible');
    assert.match(titres25.limite, /divergence/);
    assert.equal(f.couvertureDgfip(2025).feuilles['PS plus-values de titres'], false);
    assert.match(f.vue(null), /Revenus 2026 : calcul fiscal indisponible/);
    assert.throws(() => f.simulerFoyer({ annee: 2026 }), /non disponible/);
    assert.throws(() => f.comparerPfuBareme(100, 42000, 2, 2026, 'Marié', 100, true), /non disponible/);
    assert.throws(() => f.comparerOptionsFoyer(42000, 2, 2026, 'Marié', 100, 100, true, 100), /non disponible/);
    assert.match(f.htmlCouvertureDgfip(), /<details[^>]*><summary>Couverture/);
    assert.doesNotMatch(f.htmlCouvertureDgfip(), /<details[^>]*open/);
    assert.doesNotMatch(JSON.stringify(matrice), /salaire|montant_personnel|taux_pas|compte-a/);
    assert.match(f.bilanMiseAJour(2025, {}), /Divergence crypto non résolue/);
    assert.match(f.resumeRapport(2024, {}), /PS crypto 2024/);
    assert.doesNotMatch(f.resumeRapport(2024, {}), /PS crypto 2025/);
    // Cette lecture d'état ne transforme ni les constantes ni les résultats
    // de la simulation existante en paramètres DGFiP complets.
    const avant = JSON.stringify(f.comparerOptionsFoyer(42000, 2, 2025, 'Marié', 100, 100, true, 100));
    f.matriceCouvertureDgfip(); f.htmlCouvertureDgfip();
    assert.equal(JSON.stringify(f.comparerOptionsFoyer(42000, 2, 2025, 'Marié', 100, 100, true, 100)), avant);
    f.effacerRevisions();
    assert.equal(JSON.stringify(f.matriceCouvertureDgfip()), initiale, 'réinitialisation sans preuve résiduelle');
    console.log('Matrice 2023–2026 : catégories absentes, divergence, garde futur, aucune donnée personnelle');
})().catch(e => { console.error(e); process.exitCode = 1; });
