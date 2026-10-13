'use strict';
/* Sources scalaires : période explicite, révisions immuables, lecture isolée,
   aucune activation d'une formule ou d'un régime social avec un seul taux. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const racine = path.join(__dirname, '..');
const clone = x => JSON.parse(JSON.stringify(x));
const lignes = { a: [], b: [] };
let compte = 'a', ecritures = 0;
const valeurs = {};
class DateFuture extends Date {
    constructor(...a) { super(...(a.length ? a : ['2028-01-01T00:00:00Z'])); }
}
const contexte = vm.createContext({ Date: DateFuture, PF: {
    modele: { classeDe: () => 'action_etf' },
    net: {
        auth: { utilisateur: () => ({ id: compte }) },
        req: async (_m, url) => {
            const chemin = url.split('/parameter/')[1];
            if (!chemin) return { ok: true, json: { id: 'impot_revenu.bareme_ir_depuis_1945.bareme', brackets: {} } };
            if (!valeurs[chemin]) return { ok: true, json: { id: chemin.replaceAll('/', '.'), values: { '2025-01-01': 999 } } };
            return { ok: true, json: { id: chemin.replaceAll('/', '.'), values: valeurs[chemin] } };
        },
        supabase: {
            select: async t => t === 'pf2_fiscal_annees' ? [] : clone(lignes[compte]),
            insert: async (t, items) => {
                assert.equal(t, 'pf2_fiscal_collectes');
                assert(!lignes[compte].some(r => r.annee_revenus === items[0].annee_revenus &&
                    r.source === items[0].source && r.revision === items[0].revision));
                ecritures++;
                lignes[compte].push(clone(items[0]));
            }
        }
    }
} });
for (const nom of ['util.js', 'fiscal.js', 'fiscal_revisions.js', 'fiscal_sources.js']) {
    vm.runInContext(fs.readFileSync(path.join(racine, 'app/src/main/assets/www/js', nom), 'utf8'), contexte);
}
const f = contexte.PF.fiscal, src = contexte.PF.fiscalSources;
const chemin = cle => src.PARAMETRES[cle].chemin;
(async () => {
    const initial = f.plafondQF(2026);
    assert.equal(src.validerParametres(2026, { periode: '2025-01-01', parametres: { plafond_qf: 2000 } }), null);
    assert.equal(src.validerParametres(2026, { periode: '2026-01-01', parametres: { plafond_qf: '2000' } }), null);
    assert.equal(src.validerParametres(2026, { periode: '2026-01-01', parametres: { invente: 2000 }, chemins: { invente: 'invente' } }), null);
    let resultat = await src.synchroniserParametres(2026);
    assert.equal(resultat.enregistree, false, 'pas de réutilisation de 2025');
    assert.equal(ecritures, 0);
    valeurs[chemin('plafond_qf')] = { '2026-01-01': 1900 };
    valeurs[chemin('crypto_franchise')] = { '2026-01-01': 310 };
    valeurs[chemin('csg_placement')] = { '2026-01-01': .106 };
    resultat = await src.synchroniserParametres(2026);
    assert.equal(resultat.enregistree, true);
    assert.equal(ecritures, 1);
    assert.equal(lignes.a[0].valeurs.chemins.plafond_qf, chemin('plafond_qf'));
    await f.actualiserRevisions({ transactions: [] });
    assert.equal(f.plafondQF(2026), 1900);
    assert.equal(f.franchiseCrypto(2026), 310);
    assert.equal(f.plafondQF(2025), 1807, 'millésime historique intact');
    assert.equal(f.tauxPS(2026), f.PS_PAR_ANNEE[2026], 'CSG isolée ≠ PS complets');
    assert.match(f.bilanMiseAJour(2026, { disponibles: [], parametres: resultat }), /plafond général QF = 1900 €, seuil crypto = 310 €/);
    assert.match(f.bilanMiseAJour(2026, { disponibles: [], parametres: resultat }), /CSG placements = 10.6 %/);
    assert.throws(() => f.plafondQF(2027), /Aucun plafond QF/);
    await src.synchroniserParametres(2026);
    assert.equal(ecritures, 1, 'répétition sans changement');
    valeurs[chemin('plafond_qf')] = { '2026-01-01': 1950 };
    await src.synchroniserParametres(2026);
    assert.equal(ecritures, 2);
    assert.equal(lignes.a[0].valeurs.parametres.plafond_qf, 1900, 'révision initiale intacte');
    await f.actualiserRevisions({ transactions: [] });
    assert.equal(f.plafondQF(2026), 1950, 'révision suivante appliquée');
    const mauvaise = clone(lignes.a[1]); mauvaise.revision = 3;
    mauvaise.valeurs.chemins.plafond_qf = 'chemin-detourne'; lignes.a.push(mauvaise);
    await f.actualiserRevisions({ transactions: [] });
    assert.equal(f.plafondQF(2026), initial, 'dernière révision invalide : ne pas reprendre une ancienne');
    lignes.a.pop();
    compte = 'b';
    await f.actualiserRevisions({ transactions: [] });
    assert.equal(f.plafondQF(2026), initial, 'isolation des comptes');
    compte = 'a';
    await f.actualiserRevisions({ transactions: [] });
    assert.equal(f.plafondQF(2026), 1950);
    const sql = fs.readFileSync(path.join(racine, 'migrations/012_collecte_parametres_fiscaux.sql'), 'utf8');
    assert.match(sql, /openfisca_parametres/);
    assert.match(sql, /source = 'openfisca_bareme_ir'/);
    assert.doesNotMatch(sql, /(?:delete|truncate|drop table)\s+public\.pf2_fiscal_annees/i);
    console.log('Paramètres fiscaux partiels : validation, révisions, isolation OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
