'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const id = '12345678-1234-4123-a123-123456789012';
// Révision fictive de la FAQ actuelle : le taux 18,7 % ne doit jamais
// devenir le taux des cessions 2025 ni remplacer une éventuelle R2.
const page = `<p>modifié le 17/07/2026</p><h2>Vous vendez à titre particulier</h2>
<p>Dans le cadre de votre patrimoine privé : PFU de 31,5 % (12,8 % d’impôt + 18,7 % de prélèvements sociaux).</p>
<p>Cochez la case 3CN sur votre déclaration. Cette option est indépendante de celle qui concerne les revenus de capitaux mobiliers.</p>
<p>La somme des prix de cession, hors opération d’échange en sursis d’imposition, n’excède pas 305 €.</p>
<h2>Déclaration en ligne (cessions réalisées à titre particulier)</h2>
<p>Déclaration annexe n° 2086. Le montant remplira automatiquement la case 3AN (plus-value) ou 3BN (moins-value).</p>`;
const stockage = new Map();
const ctx = vm.createContext({ PF: { ui: { h: String }, store: { reglages: () => ({}) },
    net: { auth: { utilisateur: () => ({ id }) }, req: async () => ({ ok: true, body: page }) } },
    localStorage: { getItem: k => stockage.get(k) || null, setItem: (k, v) => stockage.set(k, v) },
    Date, Promise, Number, Object, String, Error });
for (const file of ['util.js', 'fiscal.js', 'fiscal_crypto_sources.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), ctx);
(async () => {
    const f = ctx.PF.fiscal;
    const r = await ctx.PF.fiscalCryptoSources.chercher(2025);
    assert.equal(r.valeurs.psCourant, .187);
    assert.equal(r.valeurs.anneeRevenusAttestee, null);
    await f.actualiserRevisions({ transactions: [] });
    const bilan = f.bilanMiseAJour(2025, { boi: {}, frais: {}, crypto: r });
    assert.match(bilan, /FAQ DGFiP courante, preuve partielle/);
    assert.match(bilan, /PS 18,7 %/);
    assert.match(bilan, /aucun taux crypto de cette lecture attribué aux revenus 2025 ni activé/);
    assert.match(bilan, /Bascule DGFiP totale : non/);
    assert.equal(f.couvertureDgfip(2025).feuilles['PS crypto privés'], false);
    assert.equal(f.tauxPS(2025), .186, 'FAQ actuelle ne remplace pas le taux des titres');
    const opts = f.comparerOptionsFoyer(42000, 2, 2025, 'Marié(e) / Pacsé(e)', 0, 0, false, 100);
    assert.equal(opts.retenu.ps_crypto, 18.6, 'FAQ actuelle ne remplace pas le moteur crypto');
    console.log('FAQ crypto : affichage partiel sans activation fiscale');
})().catch(e => { console.error(e); process.exitCode = 1; });
