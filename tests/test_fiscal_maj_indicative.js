'use strict';
/* Archives OpenFisca : leurs anciennes lignes restent stockées mais ne
   modifient plus la simulation. R2 2025 conserve sa priorité. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const racine = path.join(__dirname, '..');
const enveloppe = spawnSync(process.env.PF2_PYTHON || 'python3',
    ['jobs/ligne_r2_2025_hors_ligne.py'], { cwd: racine, encoding: 'utf8' });
assert.equal(enveloppe.status, 0, enveloppe.stderr);
const r2 = JSON.parse(enveloppe.stdout).colonnes_proposees_sans_user_id;
const clone = x => JSON.parse(JSON.stringify(x));
const source = 'https://api.fr.openfisca.org/latest/parameter/impot_revenu/bareme_ir_depuis_1945/bareme';
const donnees = { id: 'impot_revenu.bareme_ir_depuis_1945.bareme', brackets: {
    '2026-01-01': { '0': 0, '12000': .11, '30000': .30, '85000': .41, '183000': .45 }
} };
let compte = 'a', insertions = 0;
const collectes = { a: [], b: [] };
class DateFuture extends Date {
    constructor(...args) { super(...(args.length ? args : ['2028-03-01T00:00:00Z'])); }
}
const contexte = vm.createContext({ Date: DateFuture, PF: {
    ui: { h: String }, store: { reglages: () => ({}) },
    modele: { classeDe: () => 'action_etf' },
    net: {
        auth: { utilisateur: () => ({ id: compte }) },
        req: async () => ({ ok: true, json: donnees }),
        supabase: {
            select: async (table) => table === 'pf2_fiscal_annees'
                ? (compte === 'a' ? [{ annee_revenus: 2025, revision: 1, actif: false }, clone(r2)] : [])
                : clone(collectes[compte]),
            insert: async (table, lignes) => {
                assert.equal(table, 'pf2_fiscal_collectes', 'jamais de R2 écrite par le bouton');
                insertions++;
                collectes[compte].push(clone(lignes[0]));
                return lignes;
            }
        }
    }
} });
for (const nom of ['util.js', 'fiscal.js', 'fiscal_revisions.js', 'fiscal_sources.js']) {
    vm.runInContext(fs.readFileSync(path.join(racine, 'app/src/main/assets/www/js', nom), 'utf8'), contexte);
}
const f = contexte.PF.fiscal, sources = contexte.PF.fiscalSources;
const transactions = { transactions: [] };
(async () => {
    await f.actualiserRevisions(transactions);
    assert.equal(f.revisionActive(2025), true);
    assert.equal(f.revisionActive(2026), false);
    const reference2025 = clone(f.baremeDe(2025));
    assert.throws(() => f.baremeDe(2026), /non disponible/, '2025 non reconduit en 2026');
    const res = await sources.synchroniser(2026); // API historique encore testable, jamais appelée par le bouton
    assert.deepEqual(Array.from(res.disponibles), [2026]);
    assert.equal(insertions, 1, 'historique des collectes conservé');
    await f.actualiserRevisions(transactions);
    assert.throws(() => f.baremeDe(2026), /non disponible/, 'OpenFisca ne débloque plus 2026');
    assert.deepEqual(clone(f.baremeDe(2025)), reference2025, 'R2 2025 inchangée');
    // Valeur officielle des revenus 2024 (BOFiP 14/04/2025) depuis la correction du
    // 16/10/2026 : ce n'est plus la reconduction à 1,02 des seuils 2023, et chaque
    // millésime garde ses propres seuils.
    assert.equal(f.baremeDe(2024).tranches[0], 11497, 'barème officiel 2024 embarqué');
    assert.equal(f.baremeDe(2024).tranches.join(','), '11497,29315,83823,180294');
    assert.equal(f.baremeDe(2023).tranches[0], 11294, 'aucun recopiage 2024 vers 2023');
    assert.notEqual(f.baremeDe(2024).tranches.join(','), f.baremeDe(2023).tranches.join(','));
    assert.notEqual(f.baremeDe(2024).tranches.join(','), f.baremeDe(2025).tranches.join(','));
    assert.equal(f.revisionActive(2026), false);
    const bilan = f.bilanMiseAJour(2026, { boi: { etats: { ir: 'année absente' } }, frais: {} });
    assert.match(bilan, /collecte partielle DGFiP/);
    assert.doesNotMatch(bilan, /12000|OpenFisca/);
    assert.match(bilan, /non disponible/);
    // Un millésime postérieur au dernier embarqué n'est pas « absent du code » : il
    // est refusé tant que la DGFiP ne l'a pas publié et qu'il n'a pas été collecté.
    assert.throws(() => f.baremeDe(2027), /Revenus 2027 : barème, décote ou plafond QF DGFiP non disponible/);
    assert.equal(f.annéeSimulable(2027), false, 'revenus 2027 non simulables sans collecte');
    assert.ok(f.annéesSimulables().indexOf(2027) < 0, 'revenus 2027 absents de l’écran');
    compte = 'b';
    await f.actualiserRevisions(transactions);
    assert.throws(() => f.baremeDe(2026), /non disponible/);
    compte = 'a';
    await f.actualiserRevisions(transactions);
    assert.throws(() => f.baremeDe(2026), /non disponible/);
    console.log('Archives OpenFisca inactives, R2 2025 inchangée OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
