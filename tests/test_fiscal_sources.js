'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const code = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/fiscal_sources.js'), 'utf8');
const source = 'https://api.fr.openfisca.org/latest/parameter/impot_revenu/bareme_ir_depuis_1945/bareme';
const reseau = {
    id: 'impot_revenu.bareme_ir_depuis_1945.bareme',
    brackets: {
        '2025-01-01': { '0': 0, '11600': 0.11, '29579': 0.30, '84577': 0.41, '181917': 0.45 }
    }
};
const lignes = [{ annee_revenus: 2022, source: 'openfisca_bareme_ir', revision: 1,
    valeurs: { periode: '2022-01-01', tranches: [10777, 27478, 78570, 168994], taux: [.11,.3,.41,.45] } }];
let ecritures = 0;
const contexte = vm.createContext({
    PF: { net: {
        req: async (m, url) => {
            assert.equal(m, 'GET'); assert.equal(url, source);
            return { ok: true, json: reseau };
        },
        supabase: {
            select: async (table) => { assert.equal(table, 'pf2_fiscal_collectes'); return lignes.slice(); },
            insert: async (table, items) => {
                assert.equal(table, 'pf2_fiscal_collectes'); assert.equal(items.length, 1);
                assert(!lignes.some(row => row.annee_revenus === items[0].annee_revenus
                    && row.revision === items[0].revision), 'contrainte unique');
                ecritures++; lignes.push(items[0]); return items;
            }
        }
    } },
    Date, Promise, Object, Number, String, Error, isFinite
});
vm.runInContext(code, contexte);
const collecteur = contexte.PF.fiscalSources;

(async () => {
    const b = collecteur.validerBareme(2025, reseau);
    assert.deepEqual(Array.from(b.tranches), [11600, 29579, 84577, 181917]);
    assert.equal(collecteur.validerBareme(2026, reseau), null, 'pas de reprise de 2025 vers 2026');
    assert.throws(() => collecteur.validerBareme(2025, {
        brackets: { '2025-01-01': { '0': 0, '11600': 0.11 } }
    }), /Format du barème inconnu/);
    assert.throws(() => collecteur.validerBareme(2027, reseau), /Année de revenus invalide/);
    const r = await collecteur.synchroniser();
    assert.deepEqual(Array.from(r.ajoutees), [2025]);
    assert.equal(lignes[1].revision, 1);
    await collecteur.synchroniser();
    assert.equal(ecritures, 1, 'la seconde recherche ne crée rien');
    reseau.brackets['2025-01-01']['11600'] = 0.7;
    await assert.rejects(collecteur.synchroniser(), /Taux IR inattendus/);
    assert.equal(ecritures, 1, 'source incohérente : aucune écriture');
    reseau.brackets['2025-01-01']['11600'] = 0.11;
    reseau.brackets['2025-01-01']['29579'] = 0.31;
    const modifie = await collecteur.synchroniser();
    assert.deepEqual(Array.from(modifie.corrigees), [2025]);
    assert.equal(lignes[2].revision, 2, 'même année : nouvelle révision');
    assert.equal(lignes[1].valeurs.taux[1], 0.30, 'ancienne révision intacte');
    assert.equal(lignes[0].annee_revenus, 2022, 'année antérieure inchangée');
    await collecteur.synchroniser();
    assert.equal(ecritures, 2, 'pas de doublon après rectification');
    contexte.PF.net.req = async () => ({ ok: false, status: -1,
        error: 'Hôte non autorisé (HTTPS requis, allowlist) : ' + source });
    await assert.rejects(collecteur.synchroniser(), /bloqué par cette version de l’APK/);
    assert.equal(ecritures, 2, 'hôte bloqué : aucune écriture');
    contexte.PF.net.req = async () => ({ ok: false, status: 503 });
    await assert.rejects(collecteur.synchroniser(), /Source OpenFisca inaccessible \(HTTP 503\)/);
    assert.equal(ecritures, 2, 'panne réseau : aucune écriture');
    contexte.PF.net.req = async () => ({ ok: true, json: { id: 'autre' } });
    await assert.rejects(collecteur.synchroniser(), /Format de la réponse OpenFisca inattendu/);
    assert.equal(ecritures, 2, 'réponse inattendue : aucune écriture');

    const sql = fs.readFileSync(path.join(__dirname, '../migrations/010_fiscal_annees.sql'), 'utf8');
    assert.match(sql, /primary key \(user_id, annee_revenus, source, revision\)/);
    assert.match(sql, /primary key \(user_id, annee_revenus, revision\)/);
    assert.match(sql, /auth\.uid\(\) = user_id/);
    assert.match(sql, /grant select on table public\.pf2_fiscal_annees to authenticated/);
    const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/index.html'), 'utf8');
    const fiscal = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/fiscal.js'), 'utf8');
    assert.match(html, /js\/fiscal_sources\.js/);
    assert.match(fiscal, /data-fisc="collecter"/);
    assert.match(fiscal, /ses chiffres isolés ne sont pas appliqués aux calculs/);
    assert.match(fiscal, /Ne rejouez pas les migrations/);
    assert.doesNotMatch(fiscal, /Vérifiez les migrations 009 et 010/);
    console.log('Révisions fiscales annuelles : tests réussis');
})().catch(e => { console.error(e); process.exitCode = 1; });
