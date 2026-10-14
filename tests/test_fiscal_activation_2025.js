'use strict';
/* Révision synthétique uniquement : aucune connexion ni écriture Supabase. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const racine = path.join(__dirname, '..');
const py = spawnSync(process.env.PF2_PYTHON || 'python3', ['-c',
    'import json; from jobs.preparer_revision_fiscale_2025 import parametres_2025; from jobs.controle_couverture_2025 import verifier; p=parametres_2025(); v=verifier(p); print(json.dumps({"p":p,"chemins":v["parametres_inventories"],"sources":v["sources_par_parametre"]}))'
], { cwd: racine, encoding: 'utf8' });
assert.equal(py.status, 0, py.stderr);
const { p: origine, chemins, sources } = JSON.parse(py.stdout);
const proposition = spawnSync(process.env.PF2_PYTHON || 'python3',
    ['jobs/ligne_r2_2025_hors_ligne.py'], { cwd: racine, encoding: 'utf8' });
assert.equal(proposition.status, 0, proposition.stderr);
const enveloppe = JSON.parse(proposition.stdout);
assert.equal(enveloppe.ecriture_autorisee, false);
assert.equal(chemins.length, 36);
const clone = x => JSON.parse(JSON.stringify(x));
let compte = 'utilisateur-a';
let lignes = [];
let erreurReseau = false;
let enAttente = null;
let requetes = [];
const contexte = vm.createContext({ PF: {
    util: {}, ui: {}, modele: { classeDe: ticker => ticker === 'LINGOT' ? 'or_physique' :
        (ticker === 'BTC-USD' ? 'crypto' : 'or') },
    net: { auth: { utilisateur: () => ({ id: compte }) },
        supabase: { select: (table, query) => {
            requetes.push({ table, query });
            if (erreurReseau) return Promise.reject(new Error('hors ligne'));
            if (enAttente) return enAttente;
            return Promise.resolve(clone(lignes));
        }, insert: () => { throw new Error('écriture interdite'); },
        update: () => { throw new Error('écriture interdite'); } } }
} });
for (const nom of ['util.js', 'fiscal.js', 'fiscal_revisions.js']) {
    vm.runInContext(fs.readFileSync(path.join(racine, 'app/src/main/assets/www/js', nom), 'utf8'), contexte);
}
const f = contexte.PF.fiscal;
const r = contexte.PF.fiscalRevisions;
const json = x => JSON.parse(JSON.stringify(x));
function active(p) {
    return { annee_revenus: 2025, revision: 2, origine: 'nouvelle_publication', actif: true,
        source_ref: 'https://example.org/provenance-figee', parametres: p,
        statut_validation: 'valide_pour_perimetre',
        perimetre_validation: { couverture: 'integrale_parametres_utilises', annee_revenus: 2025,
            regles_exclues: [], parametres_utilises: chemins,
            sources_par_parametre: sources } };
}
function faux() { return { annee_revenus: 2025, revision: 1, actif: false,
    statut_validation: 'historique_non_verifie', parametres: { bareme: {} }, perimetre_validation: {} }; }
const reference = json(f.snapshotConstantesCode(2025));
assert.deepEqual(reference, origine);
assert.deepEqual(json(r.cheminsFeuilles(reference)), chemins);
assert.deepEqual(json(r.examiner([faux(), enveloppe.colonnes_proposees_sans_user_id], 2025, chemins).parametres),
    origine, 'la proposition figée est compatible avec le lecteur de l’APK');

(async () => {
    lignes = [faux()];
    assert.equal(await f.actualiserRevisions({transactions: []}), null);
    assert.equal(f.revisionActive(2025), false);
    const p = clone(origine);
    p.bareme.tranches[0] += 100;
    p.bareme.taux[0] += .01;
    p.bareme.decote_base_celibataire += 100;
    p.quotient_familial.plafond_general_par_demi_part += 100;
    p.prelevements_sociaux = .19;
    p.prelevements_sociaux_par_categorie.plus_values_titres = .19;
    p.prelevements_sociaux_par_categorie.plus_values_crypto_privees = .19;
    p.prelevements_sociaux_par_categorie.rcm_non_precomptes = .19;
    p.prelevements_sociaux_par_categorie.rcm_precomptes_en_2025 = .18;
    p.abattement_10.plancher += 10;
    p.abattement_10.plafond += 10;
    p.forfait_repas += 1;
    p.bareme_km['5'][0] += .1;
    p.csg_deductible = .07;
    p.franchise_crypto = 310;
    const txsCrypto = [
        {ticker: 'BTC-USD', type: 'achat', date: '2025-01-01', quantite: 1, cours: 200, frais: 0, devise: 'EUR'},
        {ticker: 'BTC-USD', type: 'vente', date: '2025-09-01', quantite: 1, cours: 307, frais: 0, devise: 'EUR'}
    ];
    assert.equal(f.detail2086(txsCrypto, 2025, {}, {}).exonere_305, false);
    lignes = [faux(), active(p)];
    // Le cache local allégé est visible pendant que le portefeuille et la R2
    // se chargent : cliquer DGFiP ne doit pas annuler la lecture R2 en vol.
    let libererChargement;
    enAttente = new Promise(res => { libererChargement = res; });
    const enCours = f.actualiserRevisions({transactions: [], transactionsChargees: true});
    assert.equal(await f.actualiserCollectesDgfip({snapshots: []}), null);
    assert.match(f.bilanMiseAJour(2025, {boi: {}, frais: {}}), /R2 2025 non évaluée/);
    assert.doesNotMatch(f.bilanMiseAJour(2025, {boi: {}, frais: {}}), /simulation indicative seulement/);
    libererChargement([faux(), active(clone(origine))]);
    assert.equal(await enCours, 2);
    assert.equal(f.revisionActive(2025), true);
    assert.match(f.bilanMiseAJour(2025, {boi: {}, frais: {}}), /R2 déjà active prioritaire/);
    enAttente = null;
    const ctxActif = {transactions: [], transactionsChargees: true};
    assert.equal(await f.actualiserRevisions(ctxActif), 2);
    assert.equal(f.revisionActive(2025), true);
    // Le bouton DGFiP recharge ses caches sans faire disparaître la R2 si
    // Supabase tombe au moment du clic (même compte et même contexte chargé).
    erreurReseau = true;
    assert.equal(await f.actualiserCollectesDgfip(ctxActif), 2);
    assert.equal(f.revisionActive(2025), true);
    erreurReseau = false;
    assert.equal(f.revisionActive(2024), false);
    assert.equal(f.baremeDe(2025).tranches[0], p.bareme.tranches[0]);
    assert.equal(f.baremeDe(2025).taux[0], p.bareme.taux[0]);
    assert.equal(f.baremeDe(2024).tranches[0], 11520);
    assert.equal(f.tauxPS(2025), .19);
    assert.equal(f.tauxPFU(2025), .318);
    assert.equal(f.tauxPS(2024), .172);
    assert.equal(f.forfaitRepas(2025), 6.45);
    assert.equal(f.forfaitRepas(2024), 5.35);
    assert.equal(f.abattement10(1000, 2025), 519);
    assert.equal(f.abattement10(200000, 2025), 14565);
    assert.equal(f.fraisKilometriques(1000, 5, false, 2025).montant, 736);
    assert.equal(f.fraisKilometriques(1000, 5, false, 2024).montant, 636);
    assert.equal(f.impotRevenu(20000, 1, 2025, 'Célibataire').impot_brut,
        (20000 - p.bareme.tranches[0]) * p.bareme.taux[0]);
    const pf = f.comparerPfuBareme(1000, 60000, 1, 2025, 'Célibataire', 1000, true);
    assert.equal(pf.ps_titres, 190);
    assert.equal(pf.ps_interets, 180);
    assert.equal(pf.pfu.ir, 256);
    assert.equal(pf.bareme.csg_deductible, 70);
    assert.equal(f.detail2086(txsCrypto, 2025, {}, {}).exonere_305, true);
    assert.equal(f.impotRevenu(20000, 1, 2025, 'Célibataire').decote,
        Math.floor(p.bareme.decote_base_celibataire - f.impotRevenu(20000, 1, 2025, 'Célibataire').impot_brut * .4525 + .5));
    const plafond = f.impotRevenu(180000, 2, 2025, 'Marié(e) / Pacsé(e)').impot_brut
        - f.impotRevenu(180000, 3, 2025, 'Marié(e) / Pacsé(e)').impot_brut;
    assert.equal(plafond, 2 * p.quotient_familial.plafond_general_par_demi_part);
    assert.equal(f.comparerOptionsFoyer(60000, 1, 2025, 'Célibataire', 1000, 1000, true, 1000)
        .scenarios[0].ps_total, 560);
    assert.deepEqual(json(f.snapshotConstantesCode(2025)), reference,
        'photographie du code indépendante de la révision distante');
    p.bareme.tranches[0] = 99999;
    assert.notEqual(f.baremeDe(2025).tranches[0], 99999, 'pas de référence mutable à la réponse réseau');
    assert.equal(requetes.at(-1).table, 'pf2_fiscal_annees');
    assert.match(requetes.at(-1).query, /annee_revenus=eq\.2025&select=/);
    const nbRequetes = requetes.length;
    ctxActif.transactions.push({ticker: 'LINGOT'});
    assert.equal(await f.actualiserCollectesDgfip(ctxActif), null,
        'même objet de contexte muté : ne pas garder une R2 hors périmètre');
    assert.equal(f.revisionActive(2025), false);
    assert.equal(await f.actualiserRevisions({transactions: [{ticker: 'LINGOT'}]}), null,
        'une opération de métal physique sort du périmètre R2');
    assert.equal(f.revisionActive(2025), false);
    assert.equal(requetes.length, nbRequetes, 'pas de requête si le portefeuille est hors périmètre');
    assert.equal(await f.actualiserRevisions({transactions: [], transactionsChargees: false}), null);
    assert.equal(requetes.length, nbRequetes, 'une panne des transactions ne vaut pas portefeuille vide');
    assert.match(f.bilanMiseAJour(2025, {boi: {}, frais: {}}), /transactions indisponibles/);

    // Une ligne active incomplète / R1 / une erreur réseau ne conserve jamais R2.
    const invalide = active(clone(origine));
    invalide.parametres.bareme.tranches[0] = -1;
    lignes = [faux(), invalide];
    assert.equal(await f.actualiserRevisions({transactions: []}), null);
    assert.equal(f.revisionActive(2025), false);
    lignes = [faux(), active(clone(origine))];
    erreurReseau = true;
    assert.equal(await f.actualiserCollectesDgfip({transactions: []}), null,
        'R2 absente : le bouton retente bien sa lecture');
    assert.equal(f.revisionActive(2025), false);
    assert.match(f.bilanMiseAJour(2025, {boi: {}, frais: {}}), /lecture R2 impossible/);
    erreurReseau = false;

    // La réponse d'une ancienne session ne doit jamais s'installer chez B.
    let liberer;
    compte = 'utilisateur-a';
    enAttente = new Promise(res => { liberer = res; });
    const ancienne = f.actualiserRevisions({transactions: []});
    compte = 'utilisateur-b';
    liberer([faux(), active(clone(origine))]);
    assert.equal(await ancienne, null);
    assert.equal(f.revisionActive(2025), false);
    enAttente = null;
    assert.equal(await f.actualiserRevisions({transactions: []}), 2);
    f.effacerRevisions();
    assert.equal(f.revisionActive(2025), false);
    assert.deepEqual(json(f.snapshotConstantesCode(2025)), reference);
    console.log('Activation APK : 36 feuilles, révision isolée par année et compte, refus sûrs');
})().catch(e => { console.error(e); process.exitCode = 1; });
