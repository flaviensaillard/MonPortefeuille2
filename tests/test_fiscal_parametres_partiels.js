'use strict';
/* Archive du collecteur scalaire OpenFisca : conserve ses lignes et leur
   validation historique, mais aucune n'est appliquée par la simulation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const racine = path.join(__dirname, '..');
const clone = x => JSON.parse(JSON.stringify(x));
const lignes = { a: [], b: [] };
let compte = 'a', ecritures = 0, masquerLecture = false, refuserEcriture = false;
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
            select: async (t, query) => {
                if (t === 'pf2_fiscal_annees') return [];
                if (!query || !query.includes('source=eq.openfisca_parametres')) return clone(lignes[compte]);
                if (masquerLecture) { masquerLecture = false; return []; }
                return clone(lignes[compte].filter(r => r.annee_revenus === 2026 &&
                    r.source === 'openfisca_parametres').sort((a, b) => b.revision - a.revision).slice(0, 1));
            },
            insert: async (t, items) => {
                assert.equal(t, 'pf2_fiscal_collectes');
                if (refuserEcriture) throw new Error('Écriture refusée (403)');
                if (lignes[compte].some(r => r.annee_revenus === items[0].annee_revenus &&
                    r.source === items[0].source && r.revision === items[0].revision))
                    throw new Error('23505 Key (user_id, annee_revenus, source, revision)=(privé, 2026, openfisca_parametres, 1) already exists');
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
    assert.throws(() => f.plafondQF(2026), /non disponible/);
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
    assert.throws(() => f.plafondQF(2026), /non disponible/, 'OpenFisca ne s’applique plus');
    assert.equal(f.franchiseCrypto(2026), 305, 'crypto OpenFisca ignorée');
    assert.equal(f.plafondQF(2025), 1807, 'millésime historique intact');
    assert.equal(f.tauxPS(2026), f.PS_PAR_ANNEE[2026], 'CSG isolée ≠ PS complets');
    assert.doesNotMatch(f.bilanMiseAJour(2026, { boi: {} }), /1900|310|OpenFisca/);
    assert.match(f.bilanMiseAJour(2026, { boi: {} }), /CSG déductible.*non vérifiés/);
    assert.throws(() => f.plafondQF(2027), /non disponible/);
    await src.synchroniserParametres(2026);
    assert.equal(ecritures, 1, 'répétition sans changement');
    masquerLecture = true; // concurrence ou liste initiale tronquée : la révision 1 existe
    resultat = await src.synchroniserParametres(2026);
    assert.equal(resultat.enregistree, true, '23505 relu et résolu, sans écraser la ligne');
    assert.equal(ecritures, 1);
    assert.equal(resultat.etats.plafond_qf, 'valeur explicite collectée');
    refuserEcriture = true;
    valeurs[chemin('plafond_qf')] = { '2026-01-01': 1950 };
    resultat = await src.synchroniserParametres(2026);
    assert.equal(resultat.enregistree, false);
    assert.equal(resultat.etats.plafond_qf, 'valeur explicite collectée', 'la recherche ne disparaît pas');
    assert.doesNotMatch(resultat.erreur, /privé|23505/);
    const rapportErreur = f.bilanMiseAJour(2026, { disponibles: [], parametres: resultat });
    assert.doesNotMatch(rapportErreur, /vérifier la migration 012/);
    assert.doesNotMatch(rapportErreur, /1900|1950/);
    refuserEcriture = false;
    masquerLecture = true; // même collision, nouveau contenu => révision 2
    resultat = await src.synchroniserParametres(2026);
    assert.equal(resultat.enregistree, true);
    assert.equal(ecritures, 2);
    assert.equal(lignes.a[1].revision, 2);
    assert.equal(lignes.a[0].valeurs.parametres.plafond_qf, 1900, 'révision initiale intacte');
    await f.actualiserRevisions({ transactions: [] });
    assert.throws(() => f.plafondQF(2026), /non disponible/, 'révision OpenFisca jamais appliquée');
    const mauvaise = clone(lignes.a[1]); mauvaise.revision = 3;
    mauvaise.valeurs.chemins.plafond_qf = 'chemin-detourne'; lignes.a.push(mauvaise);
    await f.actualiserRevisions({ transactions: [] });
    assert.throws(() => f.plafondQF(2026), /non disponible/);
    lignes.a.pop();
    compte = 'b';
    await f.actualiserRevisions({ transactions: [] });
    assert.throws(() => f.plafondQF(2026), /non disponible/);
    compte = 'a';
    await f.actualiserRevisions({ transactions: [] });
    assert.throws(() => f.plafondQF(2026), /non disponible/);
    const sql = fs.readFileSync(path.join(racine, 'migrations/012_collecte_parametres_fiscaux.sql'), 'utf8');
    assert.match(sql, /openfisca_parametres/);
    assert.match(sql, /source = 'openfisca_bareme_ir'/);
    assert.doesNotMatch(sql, /(?:delete|truncate|drop table)\s+public\.pf2_fiscal_annees/i);
    console.log('Paramètres fiscaux partiels : validation, révisions, isolation OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
