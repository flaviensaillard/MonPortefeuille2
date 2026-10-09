/* Comptes de liquidités (cahier 2.0) : règles, migration, portefeuille et écran.
   Même principe que test_js.js : les modules tournent tels quels dans Node, avec un
   faux réseau. Aucun appel réseau réel.

   Ce qui est verrouillé ici :
   - le solde se calcule (jamais stocké) comme somme signée des opérations ;
   - un achat ou une vente ne touche jamais une réserve, ni une autre devise ;
   - un virement ne change pas de devise (pas de change) ;
   - la migration depuis Donnees ne modifie jamais Donnees ;
   - le patrimoine = investi + réserves + disponible, archivage compris ;
   - les colonnes écrites par l'application existent dans migrations/003_comptes.sql. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE_WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');
const RACINE = path.join(RACINE_WWW, 'js');
const FICHIERS = ['util.js', 'models.js', 'net.js', 'store.js', 'metrics.js',
    'comptes.js', 'portfolio.js', 'rebalance.js', 'ui.js', 'fiscal.js', 'views.js', 'ia.js'];

// --- Faux navigateur -------------------------------------------------------
const stockage = {};
globalThis.localStorage = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');

const COURS = { 'IGLN.L': 40.5, 'FLXC.L': 24.8, 'GC=F': 2650 };
const DEVISES = { 'IGLN.L': 'USD', 'FLXC.L': 'USD', 'GC=F': 'USD' };

// Tables du faux serveur. `comptesAbsents` simule une table pf2_comptes non créée (404).
const TABLES = {};
let comptesAbsents = false;

function jeuDeComptes(avecVoyage, archiveVoyage) {
    const comptes = [
        { id: 'c-usd', nom: 'Courtage USD', banque: 'Swissquote', devise: 'USD', type: 'disponible', motif: null, archive: false, note: null },
        { id: 'c-chf', nom: 'Livret CHF', banque: 'Swissquote', devise: 'CHF', type: 'reserve', motif: 'Épargne de précaution', archive: false, note: null },
        { id: 'c-cny', nom: 'Compte CNY', banque: null, devise: 'CNY', type: 'reserve', motif: null, archive: false, note: null }
    ];
    const ops = [
        { id: 1, compte_id: 'c-usd', type: 'ouverture', montant: 7.385, date: '2025-01-01', groupe: null, transaction_id: null, apport_id: null },
        { id: 2, compte_id: 'c-chf', type: 'ouverture', montant: 8694.44, date: '2025-01-01', groupe: null, transaction_id: null, apport_id: null },
        { id: 3, compte_id: 'c-cny', type: 'ouverture', montant: 0, date: '2025-01-01', groupe: null, transaction_id: null, apport_id: null }
    ];
    if (avecVoyage) {
        comptes.push({ id: 'c-voy', nom: 'Voyage CNY', banque: null, devise: 'CNY', type: 'disponible', motif: 'Voyage', archive: !!archiveVoyage, note: null });
        ops.push({ id: 4, compte_id: 'c-voy', type: 'ouverture', montant: 5000, date: '2026-09-01', groupe: null, transaction_id: null, apport_id: null });
    }
    return { comptes, ops };
}

function remplirTables(avecVoyage, archiveVoyage) {
    const j = jeuDeComptes(avecVoyage, archiveVoyage);
    TABLES.pf2_comptes = j.comptes;
    TABLES.pf2_operations_compte = j.ops;
}

TABLES.pf2_transactions = [
    { id: 1, ticker: 'IGLN.L', sens: 'achat', date: '2025-01-10', quantite: 100, cours: 34.2, frais: 9.9, devise: 'USD', source: 'test' }
];
TABLES.pf2_apports = [];
TABLES.pf2_snapshots = [];
TABLES.pf2_inflation = [];
TABLES.Donnees = [
    { id: 3849, Ticker: 'USD', Type: '💵 Cash', Quantité: 7.385 },
    { id: 3848, Ticker: 'CHF', Type: '🏦 Cash réserve', Quantité: 8694.44 },
    { id: 3850, Ticker: 'IGLN.L', Type: '💰 Or', Quantité: 80, 'Court': '$ 40,20' }
];
TABLES.Projections = [];
TABLES.Historique = [];
TABLES.Config = [];

const ecritures = [];   // journal : chaque écriture réseau (méthode + table)

function fauxTransport(method, url, entetes, corps) {
    if (method !== 'GET' && url.indexOf('/rest/v1/') >= 0) {
        ecritures.push(method + ' ' + url.split('/rest/v1/')[1].split('?')[0]);
    }
    if (url.indexOf('/v8/finance/chart/') >= 0) {
        const symbole = decodeURIComponent(url.split('/v8/finance/chart/')[1].split('?')[0]);
        const taux = { 'CHFEUR=X': 1.06, 'CHFUSD=X': 1.2, 'CNYEUR=X': 0.13, 'CNYUSD=X': 0.14, 'EURUSD=X': 1.125 };
        const prix = symbole.indexOf('=X') >= 0 ? (taux[symbole] || 1.0) : (COURS[symbole] || 100);
        const devise = symbole.indexOf('=X') >= 0 ? 'EUR' : (DEVISES[symbole] || 'USD');
        return {
            ok: true, status: 200,
            body: JSON.stringify({
                chart: {
                    result: [{
                        meta: { currency: devise },
                        timestamp: [1735689600, 1735776000, 1735862400],
                        indicators: { quote: [{ close: [prix * 0.98, prix * 0.99, prix] }] }
                    }],
                    error: null
                }
            })
        };
    }
    if (url.indexOf('/rest/v1/') >= 0) {
        const table = url.split('/rest/v1/')[1].split('?')[0];
        if (table === 'pf2_comptes' && comptesAbsents) return { ok: false, status: 404, body: 'relation does not exist' };
        if (method === 'GET') return { ok: true, status: 200, body: JSON.stringify(TABLES[table] || []) };
        return { ok: true, status: 201, body: '[]' };
    }
    return { ok: false, status: -1, body: '' };
}

// --- Chargement ------------------------------------------------------------
const contexte = vm.createContext(globalThis);
for (const f of FICHIERS) {
    vm.runInContext(fs.readFileSync(path.join(RACINE, f), 'utf8'), contexte, { filename: f });
}
const PF = globalThis.PF;
PF.net.setTransport(fauxTransport);
const C = PF.comptes;
const U = PF.util;

// --- Mini cadre de test ----------------------------------------------------
let reussis = 0, echecs = 0;
function test(nom, fn) {
    try {
        const r = fn();
        if (r === false) throw new Error('assertion fausse');
        reussis++;
        console.log('  ✓ ' + nom);
    } catch (e) {
        echecs++;
        console.log('  ✗ ' + nom + ' → ' + e.message);
    }
}
function proche(a, b, tolerance) {
    const t = tolerance === undefined ? 1e-6 : tolerance;
    if (Math.abs(a - b) > t) throw new Error(a + ' ≠ ' + b);
    return true;
}
function contient(texte, morceau) {
    if (String(texte).indexOf(morceau) < 0) throw new Error('« ' + morceau + ' » absent');
    return true;
}

// Comptes de test, construits comme le fait l'écran (même chemin que la base).
function compte(id, nom, devise, type, extra) {
    return Object.assign({ id: id, nom: nom, banque: null, devise: devise, type: type, motif: null, archive: false, note: null }, extra || {});
}
function op(compteId, type, montant, extra) {
    return Object.assign({ id: Math.floor(Math.random() * 1e9), compte_id: compteId, type: type, montant: montant, date: '2026-10-01', groupe: null, transaction_id: null, apport_id: null, contrepartie: null, note: null }, extra || {});
}

console.log('\nModèle et règles de compte');
test('un compte se crée avec devise ISO en majuscules', () => {
    const r = C.nouveauCompte({ nom: 'Voyage CNY', devise: 'cny', type: 'disponible', banque: 'X' });
    return r.erreurs.length === 0 && r.compte.devise === 'CNY' && r.compte.archive === false && r.compte.id.length > 10;
});
test('refus : nom vide', () => C.nouveauCompte({ nom: '  ', devise: 'EUR', type: 'disponible' }).erreurs.length > 0);
test('refus : devise invalide', () => C.nouveauCompte({ nom: 'X', devise: 'DOLLARS', type: 'disponible' }).erreurs.length > 0);
test('refus : type inconnu', () => C.nouveauCompte({ nom: 'X', devise: 'EUR', type: 'épargne' }).erreurs.length > 0);
test('la devise ne change pas si le compte a des opérations', () => {
    const c = compte('a', 'Courtage USD', 'USD', 'disponible');
    const r = C.modifierCompte(c, { nom: 'Courtage USD', devise: 'CHF', type: 'disponible' }, [op('a', 'ouverture', 10)]);
    return r.erreurs.length > 0;
});
test('la devise peut changer tant qu’il n’y a aucune opération', () => {
    const c = compte('a', 'Compte', 'USD', 'disponible');
    const r = C.modifierCompte(c, { nom: 'Compte', devise: 'CHF', type: 'disponible' }, []);
    return r.erreurs.length === 0 && r.compte.devise === 'CHF';
});
test('archiver : le compte garde son identifiant et son historique', () => {
    const c = compte('a', 'Voyage CNY', 'CNY', 'disponible');
    const a = C.basculerArchive(c, true);
    return a.archive === true && a.id === 'a' && a.nom === 'Voyage CNY';
});

console.log('\nOpérations et solde (somme signée, jamais stockée)');
test('achat : coût + frais sortent, signé négatif', () => proche(C.montantTitre('achat', 10, 2, 1), -21));
test('vente : produit - frais entre, signé positif', () => proche(C.montantTitre('vente', 10, 2, 1), 19));
test('retrait : montant saisi positif, écrit négatif', () =>
    proche(C.operationMouvement({ compte: { id: 'a' }, type: 'retrait', montant: 30, date: '2026-01-01' }).montant, -30));
test('dépôt : écrit positif', () =>
    proche(C.operationMouvement({ compte: { id: 'a' }, type: 'depot', montant: 50, date: '2026-01-01' }).montant, 50));
test('solde = ouverture + dépôt - retrait - achat + vente', () => {
    const ops = [op('a', 'ouverture', 100), op('a', 'depot', 50), op('a', 'retrait', -30),
        op('a', 'achat_titres', -21), op('a', 'vente_titres', 19)];
    return proche(C.soldeDuCompte('a', ops), 118);
});
test('solde : les opérations d’un autre compte ne comptent pas', () =>
    proche(C.soldeDuCompte('a', [op('a', 'ouverture', 100), op('b', 'ouverture', 999)]), 100));
test('solde : idsExclus retire une opération (cas de la modification)', () => {
    const ops = [op('a', 'ouverture', 100), { id: 42, compte_id: 'a', type: 'achat_titres', montant: -40 }];
    return proche(C.soldeDuCompte('a', ops, [42]), 100);
});

console.log('\nGarde-fous : achats, ventes, retraits, virements');
const usd = compte('c-usd', 'Courtage USD', 'USD', 'disponible');
const chf = compte('c-chf', 'Livret CHF', 'CHF', 'reserve', { motif: 'Épargne de précaution' });
const cnyRes = compte('c-cny', 'Compte CNY', 'CNY', 'reserve');
const voyage = compte('c-voy', 'Voyage CNY', 'CNY', 'disponible');
const archive = compte('c-arch', 'Ancien USD', 'USD', 'disponible', { archive: true });
const tousComptes = [usd, chf, cnyRes, voyage, archive];
const soldes = [op('c-usd', 'ouverture', 7.385), op('c-chf', 'ouverture', 8694.44), op('c-voy', 'ouverture', 5000)];

test('achat refusé sur une réserve, même si elle a du solde', () =>
    C.verifierAchat({ compte: chf, devise: 'CHF', montant: 10, operations: soldes }).some((m) => /réserve/.test(m)));
test('vente refusée depuis une réserve', () =>
    C.verifierVente({ compte: cnyRes, devise: 'CNY' }).some((m) => /réserve/.test(m)));
test('achat refusé si la devise du compte ≠ devise du titre (pas de change)', () =>
    C.verifierAchat({ compte: usd, devise: 'CNY', montant: 1, operations: soldes }).some((m) => /change/.test(m)));
test('achat refusé si le solde ne suffit pas', () =>
    C.verifierAchat({ compte: usd, devise: 'USD', montant: 100, operations: soldes }).some((m) => /Solde insuffisant/.test(m)));
test('achat accepté : disponible, bonne devise, solde suffisant', () =>
    C.verifierAchat({ compte: voyage, devise: 'CNY', montant: 1000, operations: soldes }).length === 0);
test('achat refusé sur un compte archivé', () =>
    C.verifierAchat({ compte: archive, devise: 'USD', montant: 1, operations: soldes }).some((m) => /archivé/.test(m)));
test('retrait refusé s’il dépasse le solde', () =>
    C.verifierMouvement({ compte: usd, type: 'retrait', montant: 99, operations: soldes }).some((m) => /Solde insuffisant/.test(m)));
test('dépôt sur compte archivé refusé', () =>
    C.verifierMouvement({ compte: archive, type: 'depot', montant: 5, operations: soldes }).length > 0);
test('virement USD → CHF refusé (aucun change)', () =>
    C.verifierVirement({ source: usd, cible: chf, montant: 1, operations: soldes }).some((m) => /pas de change/.test(m)));
test('virement dans la même devise accepté', () => {
    const autre = compte('c-usd2', 'Second USD', 'USD', 'disponible');
    return C.verifierVirement({ source: usd, cible: autre, montant: 1, operations: soldes }).length === 0;
});
test('virement réserve → disponible, même devise : autorisé (décision 2.0)', () => {
    const reserveCny = compte('c-cny-res', 'Réserve CNY', 'CNY', 'reserve');
    const ops = [op('c-cny-res', 'ouverture', 1000)];
    return C.verifierVirement({ source: reserveCny, cible: voyage, montant: 300, operations: ops }).length === 0;
});
test('virement disponible → réserve, même devise : autorisé', () => {
    const ops = [op('c-voy', 'ouverture', 1000)];
    return C.verifierVirement({ source: voyage, cible: cnyRes, montant: 300, operations: ops }).length === 0;
});
test('virement : solde source insuffisant refusé', () => {
    const autre = compte('c-usd2', 'Second USD', 'USD', 'disponible');
    return C.verifierVirement({ source: usd, cible: autre, montant: 50, operations: soldes }).length > 0;
});

console.log('\nContrepartie d’un virement');
const comptesLibelle = [{ id: 'c-chf', nom: 'Livret CHF' }, { id: 'c-usd', nom: 'Courtage USD' }];
test('sortie d’un virement : « → Livret CHF »', () =>
    C.libelleContrepartie({ type: 'virement', montant: -200, contrepartie: 'c-chf' }, comptesLibelle) === '→ Livret CHF');
test('entrée d’un virement : « ← Courtage USD »', () =>
    C.libelleContrepartie({ type: 'virement', montant: 200, contrepartie: 'c-usd' }, comptesLibelle) === '← Courtage USD');
test('une autre opération n’a pas de contrepartie affichée', () =>
    C.libelleContrepartie({ type: 'depot', montant: 5, contrepartie: 'c-chf' }, comptesLibelle) === '');
test('contrepartie inconnue : rien d’affiché, pas de nom deviné', () =>
    C.libelleContrepartie({ type: 'virement', montant: -1, contrepartie: 'c-zzz' }, comptesLibelle) === '');

console.log('\nListes proposées');
test('achat en CNY : seul le disponible CNY est proposé (réserve exclue)', () => {
    const ids = C.comptesPourTitre(tousComptes, 'CNY', soldes).map((x) => x.compte.id);
    return ids.length === 1 && ids[0] === 'c-voy';
});
test('achat en USD (FLXC.L) : seul le disponible USD actif est proposé', () => {
    const ids = C.comptesPourTitre(tousComptes, 'USD', soldes).map((x) => x.compte.id);
    return ids.length === 1 && ids[0] === 'c-usd';
});
test('un compte archivé n’est jamais proposé à l’achat', () =>
    C.comptesPourTitre(tousComptes, 'USD', soldes).every((x) => x.compte.id !== 'c-arch'));
test('virement : même devise seulement, la source exclue, l’archivé exclu', () => {
    // Voyage CNY → la seule autre cible CNY est la réserve « Compte CNY » : un virement
    // réserve → disponible est permis (ce n'est ni un achat ni une vente). Pas de cible USD.
    const versVoyage = C.comptesPourVirement(tousComptes, voyage).map((x) => x.id);
    const versUsd = C.comptesPourVirement(tousComptes, usd).map((x) => x.id);
    return versVoyage.join() === 'c-cny' && versUsd.length === 0;
});
test('virement vers un autre compte de même devise proposé', () => {
    const autre = compte('c-cny2', 'CNY courant', 'CNY', 'disponible');
    const ids = C.comptesPourVirement(tousComptes.concat([autre]), voyage).map((x) => x.id);
    return ids.length === 2 && ids.indexOf('c-cny2') >= 0 && ids.indexOf('c-cny') >= 0;
});

console.log('\nVirement : deux jambes liées');
test('construireVirement : deux jambes, même groupe, somme nulle, contreparties croisées', () => {
    const autre = compte('c-cny2', 'CNY courant', 'CNY', 'disponible');
    const jambes = C.construireVirement({ source: voyage, cible: autre, montant: 200, date: '2026-10-08', note: 'n' });
    const [s, e] = jambes;
    return jambes.length === 2 && s.groupe === e.groupe && s.groupe
        && proche(s.montant + e.montant, 0) && s.montant < 0 && e.montant > 0
        && s.compte_id === 'c-voy' && e.compte_id === 'c-cny2'
        && s.contrepartie === 'c-cny2' && e.contrepartie === 'c-voy';
});
test('jambesDuVirement retrouve la sortie et l’entrée par groupe', () => {
    const ops = [{ id: 1, groupe: 'g', montant: -200, compte_id: 'a' }, { id: 2, groupe: 'g', montant: 200, compte_id: 'b' },
        { id: 3, groupe: null, montant: 9, compte_id: 'a' }];
    const j = C.jambesDuVirement(ops, 'g');
    return j.sortie.id === 1 && j.entree.id === 2;
});
test('une jambe seule est signalée (sortie ou entrée absente)', () => {
    const j = C.jambesDuVirement([{ id: 1, groupe: 'g', montant: -200 }], 'g');
    return j.sortie !== null && j.entree === null;
});

console.log('\nLiquidités agrégées : poche de chaque compte, archivés comptés');
test('réserve → précaution, disponible → courant, archivé compté', () => {
    const lignes = C.grouperLiquidites(tousComptes, soldes);
    const cny = lignes.filter((l) => l.devise === 'CNY');
    const reserveCny = cny.filter((l) => l.poche === 'precaution')[0];
    const courantCny = cny.filter((l) => l.poche === 'courant')[0];
    return reserveCny && courantCny && proche(courantCny.quantite, 5000);
});
test('un compte archivé reste dans le total (son solde est du patrimoine)', () => {
    const avec = C.grouperLiquidites([archive], [op('c-arch', 'ouverture', 300)]);
    return avec.length === 1 && proche(avec[0].quantite, 300);
});

console.log('\nMigration depuis Donnees (pure : aucune écriture)');
const donnees = [
    { id: 3849, Ticker: 'USD', Type: '💵 Cash', Quantité: 7.385 },
    { id: 3848, Ticker: 'CHF', Type: '🏦 Cash réserve', Quantité: 8694.44 },
    { id: 3850, Ticker: 'IGLN.L', Type: '💰 Or', Quantité: 80 }
];
const copieDonnees = JSON.stringify(donnees);
const plan = C.planMigration(donnees, '2026-10-08');
test('migration : USD disponible, CHF réserve avec motif, CNY réserve à 0', () => {
    const par = {};
    plan.comptes.forEach((p) => { par[p.origine] = p; });
    return plan.erreurs.length === 0
        && par.USD.type === 'disponible' && par.USD.banque === 'Swissquote' && proche(par.USD.solde, 7.385)
        && par.CHF.type === 'reserve' && par.CHF.motif === 'Épargne de précaution' && par.CHF.banque === 'Swissquote'
        && par.CNY.type === 'reserve' && par.CNY.solde === 0;
});
test('migration : Donnees n’est jamais modifiée', () => JSON.stringify(donnees) === copieDonnees);
test('migration : l’or (IGLN.L) n’est pas un compte de liquidités', () => plan.comptes.every((p) => p.devise !== 'IGLN.L'));
test('migration : une ligne Donnees « Cash réserve » devient une réserve (CNY reporté)', () => {
    const p = C.planMigration([{ Ticker: 'CNY', Type: '🏦 Cash réserve', Quantité: 12 }], '2026-10-08');
    return p.comptes.filter((x) => x.origine === 'CNY')[0].type === 'reserve';
});
test('migration : une ligne Donnees « Cash » sans réserve devient un disponible (CNY reporté)', () => {
    const p = C.planMigration([{ Ticker: 'CNY', Type: '💵 Cash', Quantité: 12 }], '2026-10-08');
    return p.comptes.filter((x) => x.origine === 'CNY')[0].type === 'disponible';
});
test('migration refusée : ticker en double (aucun solde deviné)', () => {
    const p = C.planMigration([{ Ticker: 'USD', Quantité: 1 }, { Ticker: 'USD', Quantité: 2 }], '2026-10-08');
    return p.erreurs.length > 0 && p.comptes.length === 0;
});
test('migration refusée : quantité illisible (aucun zéro silencieux)', () => {
    const p = C.planMigration([{ Ticker: 'CHF', Quantité: 'n/a' }], '2026-10-08');
    return p.erreurs.length > 0 && p.comptes.length === 0;
});
test('migration : quantité en format français lue correctement', () => {
    const p = C.planMigration([{ Ticker: 'CHF', Quantité: '8694,44' }], '2026-10-08');
    return proche(p.comptes.filter((x) => x.origine === 'CHF')[0].solde, 8694.44);
});
test('migrationRequise : seulement quand la table lue est vide', () =>
    C.migrationRequise([]) === true && C.migrationRequise(null) === false && C.migrationRequise([{ id: 'x' }]) === false);

console.log('\nColonnes : ce que l’application écrit existe dans migrations/003_comptes.sql');
const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '003_comptes.sql'), 'utf8');
function colonnesDe(table) {
    const debut = sql.indexOf('create table if not exists ' + table + ' (');
    if (debut < 0) return [];
    const fin = sql.indexOf(');', debut);
    return sql.slice(debut, fin).split('\n').slice(1)
        .map((l) => l.trim().split(/\s+/)[0])
        .filter((m) => /^[a-z_]+$/.test(m));
}
test('lignes de compte : toutes les clés sont des colonnes de pf2_comptes', () => {
    const cols = colonnesDe('pf2_comptes');
    const cles = Object.keys(C.versLigneCompte(usd));
    const manquantes = cles.filter((k) => cols.indexOf(k) < 0);
    if (manquantes.length) throw new Error('absentes du SQL : ' + manquantes.join(', '));
    return true;
});
test('lignes d’opération : toutes les clés sont des colonnes de pf2_operations_compte', () => {
    const cols = colonnesDe('pf2_operations_compte');
    const cles = Object.keys(C.versLigneOperation(C.operationOuverture(usd, 1, '2026-10-08')));
    const manquantes = cles.filter((k) => cols.indexOf(k) < 0);
    if (manquantes.length) throw new Error('absentes du SQL : ' + manquantes.join(', '));
    return true;
});
test('la mise à jour d’un compte envoie modifie_le, colonne du SQL', () => colonnesDe('pf2_comptes').indexOf('modifie_le') >= 0);
test('l’identifiant d’opération est by default (upsert d’un virement possible)', () =>
    /id\s+bigint generated by default as identity/.test(sql));

// --- Portefeuille : scénario d'acceptation (faux réseau) -------------------
console.log('\nPortefeuille avec comptes (faux réseau)');
PF.store.sauverReglages({ supabaseUrl: 'https://test.supabase.co', supabaseKey: 'cle-test' });

function chargerAvec(avecVoyage, archiveVoyage) {
    remplirTables(avecVoyage, archiveVoyage);
    comptesAbsents = false;
    return PF.portefeuille.charger();
}

function patrimoineCoherent(ctx) {
    return proche(ctx.patrimoineTotalUsd, ctx.totalInvestiUsd + ctx.totalPrecautionUsd + ctx.totalCourantUsd, 1e-6);
}

// Scénarios enchaînés : ils partagent les tables du faux serveur, donc jamais en parallèle.
function scenarioAcceptation() {
    return chargerAvec(true, false).then((ctx) => {
        test('comptes lus depuis la base (table présente)', () => ctx.comptesEtat.presente === true && ctx.comptes.length === 4);
        test('aucune erreur bloquante avec les comptes', () => ctx.erreurs.length === 0 || (console.log('    erreurs :', ctx.erreurs), false));
        test('liquidités viennent des comptes : USD courant, CHF réserve', () => {
            const usdL = ctx.actifs.filter((a) => a.classe === 'espece' && a.ticker === 'USD');
            const chfL = ctx.actifs.filter((a) => a.classe === 'espece' && a.ticker === 'CHF');
            return usdL.length === 1 && usdL[0].poche === 'courant' && chfL.length === 1 && chfL[0].poche === 'precaution';
        });
        test('Voyage CNY (disponible) : une ligne courante CNY de 5 000', () => {
            const l = ctx.actifs.filter((a) => a.classe === 'espece' && a.ticker === 'CNY' && a.poche === 'courant');
            return l.length === 1 && proche(l[0].quantite, 5000);
        });
        test('patrimoine = investi + réserves + disponible', () => patrimoineCoherent(ctx));
        test('les réserves ne sont pas dans le cash disponible (CHF + CNY réserve)', () =>
            ctx.totalPrecautionUsd > 0 && ctx.totalCourantUsd > 0 && proche(ctx.totalCourantUsd, 5000 * 0.14 + 7.385, 1e-3));
        test('achat FLXC.L (USD) : Courtage USD proposé, rien d’autre', () =>
            C.comptesPourTitre(ctx.comptes, 'USD', ctx.operationsCompte).map((x) => x.compte.nom).join() === 'Courtage USD');
        test('achat CNY : Voyage CNY proposé (acceptation 1)', () =>
            C.comptesPourTitre(ctx.comptes, 'CNY', ctx.operationsCompte).map((x) => x.compte.nom).join() === 'Voyage CNY');
        test('virement USD → CHF refusé (acceptation 3)', () => {
            const usdC = ctx.comptes.filter((x) => x.nom === 'Courtage USD')[0];
            const chfC = ctx.comptes.filter((x) => x.nom === 'Livret CHF')[0];
            return C.verifierVirement({ source: usdC, cible: chfC, montant: 1, operations: ctx.operationsCompte }).length > 0;
        });
        test('chaque compte a une valeur en dollars et une variation de change', () =>
            ctx.comptes.every((x) => typeof x.valeurUsd === 'number' && x.valeurUsd >= 0)
            && ctx.comptesVariation['c-voy'] !== undefined);

        return chargerAvec(true, true).then((apres) => {
            test('archiver Voyage CNY : patrimoine inchangé (acceptation 4)', () =>
                proche(apres.patrimoineTotalUsd, ctx.patrimoineTotalUsd, 1e-6));
            test('archiver Voyage CNY : il sort des propositions d’achat', () =>
                C.comptesPourTitre(apres.comptes, 'CNY', apres.operationsCompte).length === 0);
            test('archiver Voyage CNY : son historique reste (opération d’ouverture gardée)', () =>
                apres.operationsCompte.some((o) => o.compte_id === 'c-voy'));
            test('archiver Voyage CNY : il reste dans les données, marqué archivé', () =>
                apres.comptes.some((x) => x.id === 'c-voy' && x.archive === true));

            const vue = PF.vues.ongletComptes(apres);
            test('écran : compte archivé absent des listes actives (acceptation 4)', () =>
                vue.split('Archivés <span')[0].indexOf('Voyage CNY') < 0);
            test('écran : compte archivé présent dans la section Archivés', () => contient(vue, 'Voyage CNY'));
            test('écran : bouton « Nouveau compte » offert quand la table existe', () => contient(vue, 'id="btnCompteNouveau"'));
            test('écran : une réserve n’apparaît jamais dans Disponibles', () => {
                const dispo = vue.split('Disponibles <span')[1].split('Réserves <span')[0];
                return dispo.indexOf('Livret CHF') < 0 && dispo.indexOf('Compte CNY') < 0;
            });
        });
    });
}

function scenarioTableVide() {
    remplirTables(false, false);
    TABLES.pf2_comptes = [];
    TABLES.pf2_operations_compte = [];
    comptesAbsents = false;
    return PF.portefeuille.charger().then((vide) => {
        test('table vide : aucun compte lu, présence confirmée', () => vide.comptesEtat.presente === true && vide.comptes.length === 0);
        test('table vide : liquidités lues dans Donnees (repli)', () =>
            vide.actifs.some((a) => a.ticker === 'USD' && a.poche === 'courant'));
        test('table vide : la migration est requise', () => C.migrationRequise(vide.comptes) === true);
    });
}

function scenarioTableAbsente() {
    comptesAbsents = true;
    return PF.portefeuille.charger().then((ctx) => {
        comptesAbsents = false;
        test('table absente : signalée dans les erreurs, jamais silencieuse', () =>
            ctx.comptesEtat.presente === false && ctx.erreurs.some((e) => /pf2_comptes/.test(e)));
        test('table absente : écran dit quoi faire (migrations/003)', () =>
            contient(PF.vues.ongletComptes(ctx), 'migrations/003_comptes.sql'));
        test('table absente : aucune création de compte proposée', () =>
            PF.vues.ongletComptes(ctx).indexOf('id="btnCompteNouveau"') < 0);
    });
}

scenarioAcceptation()
    .then(scenarioTableVide)
    .then(scenarioTableAbsente)
    .then(() => {
        test('Donnees : aucune écriture réseau pendant ces scénarios (lecture seule)', () =>
            ecritures.every((e) => e.indexOf('Donnees') < 0)
            || (console.log('    écritures :', ecritures), false));
        console.log(echecs === 0 ? `\n✔ ${reussis} réussis, 0 échec` : `\n✗ ${reussis} réussis, ${echecs} échec(s)`);
        process.exit(echecs === 0 ? 0 : 1);
    })
    .catch((e) => {
        console.log('  ✗ scénario : ' + (e && e.stack ? e.stack : e));
        process.exit(1);
    });
