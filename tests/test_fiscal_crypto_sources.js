'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const stockage = new Map();
let compte = '12345678-1234-4123-a123-123456789012', appels = 0;
const url = 'https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques';
const html = (pfu = '31,4', ir = '12,8', ps = '18,6', seuil = '305') => `<html>
<p>Publié le 16/06/2023, modifié le 17/07/2026</p>
<h2>Vous vendez à titre particulier</h2>
<p>Les plus-values réalisées dans le cadre de la gestion votre patrimoine privé sont imposées au prélèvement forfaitaire unique (PFU) de ${pfu}&#8239;% (${ir}&#8239;% d’impôt + ${ps}&#8239;% de prélèvements sociaux), quel que soit le nombre de transactions.</p>
<p>Vous pouvez toutefois renoncer à ce PFU et choisir le barème progressif de l’impôt si cela vous avantage. Pour cela, cochez la case 3CN sur votre déclaration de revenus. Cette option est définitive et indépendante de celle qui concerne les revenus de capitaux mobiliers.</p>
<p>Vous êtes exonérés d’imposition lorsque la somme des prix de cession (montant annuel brut des cessions et non les plus-values), hors opération d’échange en sursis d’imposition, n’excède pas ${seuil} € au cours de l’année d’imposition.</p>
<h2>Déclaration en ligne (cessions réalisées à titre particulier)</h2>
<p>Indiquez le total de la plus-value ou de la moins-value de l’année dans la déclaration annexe n° 2086 de votre déclaration en ligne. Le montant renseigné remplira automatiquement la case 3AN (plus-value) ou 3BN (moins-value) de votre déclaration principale.</p>
</html>`;
let reponse = html();
const ctx = vm.createContext({ PF: { net: { auth: { utilisateur: () => ({ id: compte }) },
    req: async (m, u) => { appels++; assert.equal(m, 'GET'); assert.equal(u, url);
        return { ok: true, status: 200, body: reponse }; } } },
    localStorage: { getItem: k => stockage.get(k) || null, setItem: (k, v) => stockage.set(k, v) },
    Date, Promise, Number, Object, String, Error });
vm.runInContext(fs.readFileSync(path.join(dir, 'fiscal_crypto_sources.js'), 'utf8'), ctx);
const lecteur = ctx.PF.fiscalCryptoSources;
(async () => {
    assert.equal(lecteur.analyser(html()).valeurs.psCourant, .186);
    assert.equal(lecteur.analyser(html()).valeurs.anneeRevenusAttestee, null);
    for (const an of [2023, 2024, 2026])
        assert.equal((await lecteur.chercher(an)).enregistree, false);
    assert.equal(appels, 0, 'FAQ courante non réutilisée pour 2023/24/26');
    const premier = await lecteur.chercher(2025);
    assert.equal(premier.enregistree, true);
    assert.equal(premier.valeurs.seuilCourant, 305);
    assert.equal(lecteur.lireCache().pfuCourant, .314);
    const cle = 'pf2.dgfip.crypto.faq.v1.' + compte;
    const precedent = stockage.get(cle);
    await lecteur.chercher(2025);
    assert.equal(stockage.get(cle), precedent, 'pas de révision lorsque la page est identique');
    reponse = html('31,5', '12,8', '18,7');
    assert.equal((await lecteur.chercher(2025)).valeurs.psCourant, .187);
    assert.equal(JSON.parse(stockage.get(cle)).length, 2, 'rectification conservée');
    assert.equal(lecteur.analyser(html('31,4', '12,8', '17,2')).valeurs, undefined, 'PFU discordant');
    assert.equal(lecteur.analyser(html().replace('Vous vendez à titre particulier', 'Vous vendez à titre professionnel')).valeurs,
        undefined, 'régime privé exigé');
    assert.equal(lecteur.analyser(html().replace('indépendante de celle qui concerne les revenus de capitaux mobiliers', 'globale avec les RCM')).valeurs,
        undefined, 'options distinctes exigées');
    assert.equal(lecteur.analyser(html().replace('modifié le 17/07/2026', 'modifié le 17/07/2024')).valeurs,
        undefined, 'date de mise à jour du taux actuel exigée');
    stockage.set(cle, JSON.stringify([{ url, extrait: '17,2 %', revision: 1 }]));
    assert.equal(lecteur.lireCache(), null, 'preuve en cache revalidée, pas de taux isolé');
    compte = '87654321-1234-4123-a123-123456789012';
    assert.equal(lecteur.lireCache(), null, 'aucun mélange entre comptes');
    console.log('FAQ crypto DGFiP courante : preuve partielle, cache, refus du millésime et rectifications OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
