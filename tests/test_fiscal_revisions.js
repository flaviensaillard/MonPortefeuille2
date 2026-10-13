'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const code = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/fiscal_revisions.js'), 'utf8');
let appels = [];
let lignes = [];
const contexte = vm.createContext({ PF: { net: { supabase: {
    select: async (table, query) => {
        appels.push({ table, query });
        return lignes;
    },
    insert: () => { throw new Error('écriture interdite'); },
    update: () => { throw new Error('écriture interdite'); }
} } }, Set, Promise, Object, Number, String, Error, Array, isFinite });
vm.runInContext(code, contexte);
const lecteur = contexte.PF.fiscalRevisions;
const candidat = spawnSync(process.env.PF2_PYTHON || 'python3', ['-c',
    'import json; from jobs.preparer_revision_fiscale_2025 import parametres_2025; from jobs.controle_couverture_2025 import verifier; p=parametres_2025(); print(json.dumps({"parametres":p,"chemins":verifier(p)["parametres_inventories"]}))'
], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
assert.equal(candidat.status, 0, candidat.stderr);
const donnees = JSON.parse(candidat.stdout);
const utilises = donnees.chemins;
function r2() {
    return {
        annee_revenus: 2025, revision: 2, origine: 'nouvelle_publication',
        source_ref: 'https://exemple.test/version-figee',
        parametres: structuredClone(donnees.parametres),
        statut_validation: 'valide_pour_perimetre', actif: true,
        perimetre_validation: {
            couverture: 'integrale_parametres_utilises', annee_revenus: 2025,
            regles_exclues: [], parametres_utilises: utilises.slice(),
            sources_par_parametre: Object.fromEntries(utilises.map(k => [k, 'https://exemple.test/regle']))
        }
    };
}
const ancienne = { annee_revenus: 2025, revision: 1, actif: false,
    statut_validation: 'historique_non_verifie', perimetre_validation: {},
    parametres: { bareme: {} } };

assert.equal(lecteur.examiner([ancienne], 2025, utilises), null,
    'R1 historique ne doit jamais être implicitement active');
assert.equal(lecteur.examiner([ancienne, r2()], 2025, utilises).statut,
    'candidat_structurel_non_homologue', 'ce n’est PAS une homologation fiscale');

// Tests synchrones : erreur d'année et de doublon = anomalie de lecture, pas un repli.
assert.throws(() => lecteur.examiner([r2()], 2026, utilises), /autre millésime/);
assert.throws(() => lecteur.examiner([r2(), r2()], 2025, utilises), /dupliquée/);
assert.throws(() => lecteur.examiner([], 2025, []), /inventaire/);
assert.throws(() => lecteur.examiner([], 2025, ['bareme.tranches', 'bareme.tranches']), /inventaire/);

function invalide(modifier, commentaire) {
    const r = r2(); modifier(r);
    assert.equal(lecteur.examiner([ancienne, r], 2025, utilises), null, commentaire);
}
invalide(r => { r.actif = false; }, 'pas de drapeau actif');
invalide(r => { r.statut_validation = 'brouillon'; }, 'brouillon');
invalide(r => { r.perimetre_validation.couverture = 'partielle'; }, 'périmètre partiel');
invalide(r => { r.perimetre_validation.regles_exclues = ['pas']; }, 'règle exclue');
invalide(r => { r.perimetre_validation.annee_revenus = 2024; }, 'métadonnées d’une autre année');
invalide(r => { r.perimetre_validation.parametres_utilises.pop(); }, 'paramètre utilisé absent');
invalide(r => { delete r.perimetre_validation.sources_par_parametre['bareme.taux']; }, 'source manquante');
invalide(r => { r.parametres.bareme.tranches = []; }, 'valeur vide');
invalide(r => { r.parametres.bareme.tranches = [11600, [null]]; }, 'valeur imbriquée absente');
invalide(r => { r.parametres.bareme.champ_inconnu = 10; }, 'champ non inventorié');
invalide(r => { r.parametres.bareme.tranches[1] = 100; }, 'tranches non croissantes');
invalide(r => { r.parametres.bareme.taux[0] = .9; }, 'taux aberrant');
invalide(r => { r.parametres.prelevements_sociaux = .99; }, 'PS aberrants');
invalide(r => { r.parametres.quotient_familial.plafonds_particuliers_modelises = true; },
    'QF spécial non pris en charge par le moteur');
invalide(r => { r.parametres.regles_km.seuils_distance_km = [5000, 21000]; },
    'changer une formule non dynamique exige du nouveau code');
invalide(r => { r.parametres.bareme_km['5'] = [1, 2]; }, 'barème km mal formé');
invalide(r => { r.source_ref = ''; }, 'provenance manquante');
invalide(r => { r.origine = 'reprise_code_non_verifiee'; }, 'R1 ne peut être homologuée par un drapeau');
assert.equal(lecteur.examiner([r2(), { ...r2(), revision: 3 }], 2025, utilises), null,
    'plusieurs révisions actives : rien à sélectionner');

(async () => {
    lignes = [ancienne, r2()];
    const res = await lecteur.consulter(2025, utilises);
    assert.equal(res.revision, 2);
    assert.equal(res.statut, 'candidat_structurel_non_homologue');
    assert.equal(appels.length, 1);
    assert.equal(appels[0].table, 'pf2_fiscal_annees');
    assert.match(appels[0].query, /annee_revenus=eq\.2025&select=/);
    assert.match(appels[0].query, /statut_validation,perimetre_validation,actif/);
    assert.equal(appels[0].query.includes('user_id'), false, 'RLS sans identifiant exposé');
    await assert.rejects(lecteur.consulter('2025', utilises), /inventaire/);
    assert.equal(appels.length, 1, 'entrée invalide : aucune requête');
    console.log('Prototype de lecture fiscale en lecture seule : tests réussis');
})().catch(e => { console.error(e); process.exitCode = 1; });
