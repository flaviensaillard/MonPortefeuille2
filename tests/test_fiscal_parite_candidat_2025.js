'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const racine = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(racine, 'app/src/main/assets/www/js/fiscal.js'), 'utf8');
const contexte = vm.createContext({ PF: { util: {}, ui: {} } });
vm.runInContext(code, contexte);
const j = JSON.parse(JSON.stringify(contexte.PF.fiscal.snapshotConstantesCode(2025)));
// Inventaire local uniquement : pas de connexion et aucune information de foyer.
const py = spawnSync(process.env.PF2_PYTHON || 'python3', ['-c',
    'import json; from jobs.preparer_revision_fiscale_2025 import parametres_2025; print(json.dumps(parametres_2025()))'
], { cwd: racine, encoding: 'utf8' });
assert.equal(py.status, 0, py.stderr);
const p = JSON.parse(py.stdout);
assert.deepEqual(j, p, 'tous les champs du candidat doivent concorder avec le code Android');
assert.equal(j.bareme.annee, 2025);
assert.equal(j.prelevements_sociaux_par_categorie.rcm_precomptes_en_2025, .172);
assert.equal(j.bareme_km['5'][1], .357);
assert(!('or_physique' in j) && !('pas' in j), 'ni or physique ni PAS officiel inventé');
assert.throws(() => contexte.PF.fiscal.snapshotConstantesCode(2026), /limitée aux revenus 2025/);
const fresh = contexte.PF.fiscal.snapshotConstantesCode(2025);
fresh.bareme.tranches[0] = 123;
fresh.bareme_km['5'][0] = 123;
assert.equal(contexte.PF.fiscal.snapshotConstantesCode(2025).bareme.tranches[0], 11600);
assert.equal(contexte.PF.fiscal.snapshotConstantesCode(2025).bareme_km['5'][0], .636);
console.log('Candidat local 2025 : parité des constantes Python/Android, sans homologation');
