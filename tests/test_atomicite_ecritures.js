/* Écritures atomiques transaction + mouvement (revue 2.0.1, constat D-03).

   Avant la 2.1.0, une saisie de titre faisait DEUX requêtes séparées :
   l'insert de la transaction, puis l'insert du mouvement de compte ; si la
   seconde échouait, l'app tentait une « compensation » (supprimer la première)
   qui pouvait elle-même échouer — laissant des titres achetés sans argent
   débité, ou l'inverse. Une panne entre les deux écritures suffisait.

   Désormais, la saisie et la modification passent par les RPC serveur
   `pf2_enregistrer_transaction`, `pf2_modifier_transaction`,
   `pf2_enregistrer_apport`, `pf2_modifier_apport` (migration 004), qui
   écrivent les deux lignes dans UNE transaction SQL : tout passe ou rien.

   Le faux serveur ci-dessous implémente ces RPC fidèlement (tout ou rien)
   et permet d'injecter une panne. Ce qui est verrouillé :
   - un appel unique écrit la transaction ET son mouvement ;
   - une panne pendant l'écriture ne laisse AUCUN orphelin (zéro compensation) ;
   - la clé d'idempotence rend les rejeux inoffensifs (pas de doublon) ;
   - app.js n'utilise plus le double insert + compensation. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js');
const FICHIERS = ['util.js', 'models.js', 'net.js', 'store.js', 'metrics.js',
    'comptes.js', 'portfolio.js', 'rebalance.js', 'ui.js', 'fiscal.js', 'views.js', 'ia.js'];

const stockage = {};
globalThis.localStorage = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');

let compteurUuid = 0;
const TABLES = {};
let panne = null;          // 'panne-entre-ecritures' → l'écriture échoue à mi-chemin
let nbEcritures = 0;       // nombre de requêtes d'écriture émises par l'app
let seq = { pf2_transactions: 0, pf2_apports: 0, pf2_operations_compte: 0 };

function reset() {
    TABLES.pf2_transactions = [];
    TABLES.pf2_apports = [];
    TABLES.pf2_operations_compte = [];
    panne = null;
    nbEcritures = 0;
    seq = { pf2_transactions: 0, pf2_apports: 0, pf2_operations_compte: 0 };
}

/* Implémentation fidèle des RPC de la migration 004 : les deux lignes sont
   écrites ensemble, ou aucune. Une panne simulée fait échouer l'ensemble. */
function rpcEnregistrerTransaction(p) {
    if (p.p_idempotence && TABLES.pf2_transactions.some(t => t.idempotence === p.p_idempotence)) {
        return { ok: true, deja_ecrit: true };
    }
    if (panne) throw new Error('panne simulée entre les écritures');
    const txId = ++seq.pf2_transactions;
    TABLES.pf2_transactions.push({
        id: txId, ticker: p.p_ticker, sens: p.p_sens, date: p.p_date,
        quantite: p.p_quantite, cours: p.p_cours, frais: p.p_frais || 0,
        devise: p.p_devise, source: p.p_source || 'appli', reference: p.p_reference,
        note: p.p_note, idempotence: p.p_idempotence || null
    });
    let opId = null;
    if (p.p_compte_id) {
        opId = ++seq.pf2_operations_compte;
        TABLES.pf2_operations_compte.push({
            id: opId, compte_id: p.p_compte_id, type: p.p_type_operation,
            montant: p.p_montant_operation, date: p.p_date_operation || p.p_date,
            transaction_id: txId, apport_id: null, note: p.p_note_operation || null
        });
    }
    return { ok: true, transaction_id: txId, operation_id: opId };
}

function rpcModifierTransaction(p) {
    if (panne) throw new Error('panne simulée entre les écritures');
    const tx = TABLES.pf2_transactions.find(t => t.id === p.p_tx_id);
    if (!tx) throw new Error('transaction introuvable');
    Object.assign(tx, {
        ticker: p.p_ticker, sens: p.p_sens, date: p.p_date, quantite: p.p_quantite,
        cours: p.p_cours, frais: p.p_frais || 0, devise: p.p_devise
    });
    if (p.p_compte_id && p.p_operation_id) {
        const op = TABLES.pf2_operations_compte.find(o =>
            o.id === p.p_operation_id && o.transaction_id === p.p_tx_id);
        if (!op) throw new Error('opération introuvable pour cette transaction');
        Object.assign(op, {
            compte_id: p.p_compte_id, montant: p.p_montant_operation,
            date: p.p_date_operation || p.p_date, type: p.p_type_operation
        });
    }
    return { ok: true };
}

function rpcEnregistrerApport(p) {
    if (p.p_idempotence && TABLES.pf2_apports.some(a => a.idempotence === p.p_idempotence)) {
        return { ok: true, deja_ecrit: true };
    }
    if (panne) throw new Error('panne simulée entre les écritures');
    const apId = ++seq.pf2_apports;
    TABLES.pf2_apports.push({
        id: apId, date: p.p_date, sens: p.p_sens, montant_eur: p.p_montant_eur,
        montant_or: p.p_montant_or, cours_or: p.p_cours_or, compte: p.p_compte,
        reference: p.p_reference, idempotence: p.p_idempotence || null
    });
    let opId = null;
    if (p.p_compte_id) {
        opId = ++seq.pf2_operations_compte;
        TABLES.pf2_operations_compte.push({
            id: opId, compte_id: p.p_compte_id, type: p.p_type_operation,
            montant: p.p_montant_operation, date: p.p_date_operation || p.p_date,
            transaction_id: null, apport_id: apId, note: null
        });
    }
    return { ok: true, apport_id: apId, operation_id: opId };
}

function rpcModifierApport(p) {
    if (panne) throw new Error('panne simulée entre les écritures');
    const ap = TABLES.pf2_apports.find(a => a.id === p.p_apport_id);
    if (!ap) throw new Error('apport introuvable');
    Object.assign(ap, {
        date: p.p_date, sens: p.p_sens, montant_eur: p.p_montant_eur,
        montant_or: p.p_montant_or, cours_or: p.p_cours_or,
        compte: p.p_compte, reference: p.p_reference
    });
    if (p.p_compte_id && p.p_operation_id) {
        const op = TABLES.pf2_operations_compte.find(o =>
            o.id === p.p_operation_id && o.apport_id === p.p_apport_id);
        if (!op) throw new Error('opération introuvable pour cet apport');
        Object.assign(op, {
            compte_id: p.p_compte_id, montant: p.p_montant_operation,
            date: p.p_date_operation || p.p_date, type: p.p_type_operation
        });
    }
    return { ok: true };
}

const RPC = {
    pf2_enregistrer_transaction: rpcEnregistrerTransaction,
    pf2_modifier_transaction: rpcModifierTransaction,
    pf2_enregistrer_apport: rpcEnregistrerApport,
    pf2_modifier_apport: rpcModifierApport
};

function fauxTransport(method, url, entetes, corps) {
    if (url.indexOf('/rest/v1/') < 0) return { ok: false, status: -1, body: '' };
    if (method === 'GET') return { ok: true, status: 200, body: '[]' };

    nbEcritures++;
    const reste = url.split('/rest/v1/')[1];

    if (reste.startsWith('rpc/')) {
        const nom = reste.split('?')[0].slice(4);
        const fn = RPC[nom];
        if (!fn) return { ok: false, status: 404, body: 'RPC inconnue : ' + nom };
        try {
            return { ok: true, status: 200, body: JSON.stringify(fn(JSON.parse(corps || '{}'))) };
        } catch (e) {
            return { ok: false, status: 500, body: JSON.stringify({ message: e.message }) };
        }
    }

    /* Écriture directe sur table : l'ancien chemin. En cas de panne, la
       deuxième écriture échoue ET la suppression de compensation échoue :
       c'est exactement le scénario D-03 (orphelin possible). */
    const table = reste.split('?')[0];
    if (panne && table === 'pf2_operations_compte') {
        return { ok: false, status: 500, body: 'panne simulée entre les écritures' };
    }
    if (method === 'POST') {
        TABLES[table] = TABLES[table] || [];
        JSON.parse(corps || '[]').forEach(l => TABLES[table].push(Object.assign({ id: ++seq[table] }, l)));
        return { ok: true, status: 201, body: corps };
    }
    if (method === 'PATCH') return { ok: true, status: 200, body: '[]' };
    if (method === 'DELETE') {
        if (panne) return { ok: false, status: 500, body: 'panne simulée de la compensation' };
        TABLES[table] = [];
        return { ok: true, status: 200, body: '[]' };
    }
    return { ok: false, status: 405, body: '' };
}

const contexte = vm.createContext(globalThis);
for (const f of FICHIERS) {
    vm.runInContext(fs.readFileSync(path.join(RACINE, f), 'utf8'), contexte, { filename: f });
}
const PF = globalThis.PF;
PF.net.setTransport(fauxTransport);
PF.store.sauverReglages({ supabaseUrl: 'https://test.supabase.co', supabaseKey: 'cle-test' });

let reussis = 0, echecs = 0;
function verifier(nom, cond, detail) {
    if (cond) { reussis++; console.log('  ✓ ' + nom); }
    else { echecs++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); }
}

const LIGNE_TX = {
    ticker: 'CW8.L', sens: 'achat', date: '2026-03-01', quantite: 2,
    cours: 100, frais: 1, devise: 'GBP', source: 'appli', reference: null, note: null
};
const LIGNE_AP = {
    date: '2026-03-02', sens: 'apport', montant_eur: 500, montant_or: 0.2,
    cours_or: 2500, compte: 'Courant', reference: null, note: null
};

async function principal() {
    console.log('Les écritures passent par les RPC atomiques du serveur');
    reset();
    verifier('PF.net.ecrireTransaction existe', typeof PF.net.ecrireTransaction === 'function');
    verifier('PF.net.modifierTransaction existe', typeof PF.net.modifierTransaction === 'function');
    verifier('PF.net.ecrireApport existe', typeof PF.net.ecrireApport === 'function');
    verifier('PF.net.modifierApport existe', typeof PF.net.modifierApport === 'function');
    if (echecs) { console.log('\n✗ ' + echecs + ' échec(s), ' + reussis + ' réussis'); process.exit(1); }

    console.log('Un appel unique écrit la transaction ET son mouvement');
    reset();
    let r = await PF.net.ecrireTransaction({
        ligne: LIGNE_TX, compteId: 'c1', montantOperation: -201, typeOperation: 'titre',
        idempotence: '11111111-1111-4111-8111-111111111111'
    });
    verifier('la RPC renvoie ok', !!(r && r.ok));
    verifier('1 transaction écrite', TABLES.pf2_transactions.length === 1,
        'écrit : ' + TABLES.pf2_transactions.length);
    verifier('1 mouvement écrit et lié', TABLES.pf2_operations_compte.length === 1
        && TABLES.pf2_operations_compte[0].transaction_id === TABLES.pf2_transactions[0].id);
    verifier('une seule requête d’écriture a été émise', nbEcritures === 1,
        'requêtes : ' + nbEcritures);

    console.log('Panne pendant l’écriture : AUCUN orphelin, aucune compensation');
    reset();
    panne = 'panne-entre-ecritures';
    let erreur = null;
    try {
        await PF.net.ecrireTransaction({
            ligne: LIGNE_TX, compteId: 'c1', montantOperation: -201, typeOperation: 'titre',
            idempotence: '22222222-2222-4222-8222-222222222222'
        });
    } catch (e) { erreur = e; }
    verifier('l’échec est annoncé à l’appelant', erreur !== null);
    verifier('aucune transaction orpheline', TABLES.pf2_transactions.length === 0,
        'orphelins : ' + TABLES.pf2_transactions.length);
    verifier('aucun mouvement orphelin', TABLES.pf2_operations_compte.length === 0);
    verifier('une seule requête a été tentée (pas de compensation)', nbEcritures === 1,
        'requêtes : ' + nbEcritures);

    console.log('Rejeu avec la même clé d’idempotence : pas de doublon');
    reset();
    const cle = '33333333-3333-4333-8333-333333333333';
    await PF.net.ecrireTransaction({
        ligne: LIGNE_TX, compteId: 'c1', montantOperation: -201, typeOperation: 'titre',
        idempotence: cle
    });
    r = await PF.net.ecrireTransaction({
        ligne: LIGNE_TX, compteId: 'c1', montantOperation: -201, typeOperation: 'titre',
        idempotence: cle
    });
    verifier('le rejeu signale déjà écrit', !!(r && r.deja_ecrit));
    verifier('toujours une seule transaction', TABLES.pf2_transactions.length === 1,
        'écrit : ' + TABLES.pf2_transactions.length);
    verifier('toujours un seul mouvement', TABLES.pf2_operations_compte.length === 1);

    console.log('Apport : même atomicité, même refus en cas de panne');
    reset();
    r = await PF.net.ecrireApport({
        ligne: LIGNE_AP, compteId: 'c2', montantOperation: 500, typeOperation: 'depot',
        idempotence: '44444444-4444-4444-8444-444444444444'
    });
    verifier('l’apport et son mouvement sont écrits ensemble',
        TABLES.pf2_apports.length === 1 && TABLES.pf2_operations_compte.length === 1
        && TABLES.pf2_operations_compte[0].apport_id === TABLES.pf2_apports[0].id);
    panne = 'panne-entre-ecritures';
    erreur = null;
    try {
        await PF.net.ecrireApport({
            ligne: LIGNE_AP, compteId: 'c2', montantOperation: 500, typeOperation: 'depot',
            idempotence: '55555555-5555-4555-8555-555555555555'
        });
    } catch (e) { erreur = e; }
    verifier('la panne laisse l’apport non écrit', erreur !== null
        && TABLES.pf2_apports.length === 1 && TABLES.pf2_operations_compte.length === 1,
        'apports : ' + TABLES.pf2_apports.length + ', mouvements : ' + TABLES.pf2_operations_compte.length);

    console.log('Modification : une seule requête, atomique aussi');
    reset();
    await PF.net.ecrireTransaction({
        ligne: LIGNE_TX, compteId: 'c1', montantOperation: -201, typeOperation: 'titre',
        idempotence: '66666666-6666-4666-8666-666666666666'
    });
    nbEcritures = 0;
    const txId = TABLES.pf2_transactions[0].id;
    const opId = TABLES.pf2_operations_compte[0].id;
    await PF.net.modifierTransaction({
        id: txId, ligne: Object.assign({}, LIGNE_TX, { cours: 110 }),
        compteId: 'c1', operationId: opId, montantOperation: -221, typeOperation: 'titre'
    });
    verifier('la modification passe par une seule requête', nbEcritures === 1,
        'requêtes : ' + nbEcritures);
    verifier('la transaction est modifiée', TABLES.pf2_transactions[0].cours === 110);
    verifier('le mouvement est modifié avec elle', TABLES.pf2_operations_compte[0].montant === -221);

    console.log('app.js n’écrit plus en deux temps (structurel)');
    const src = fs.readFileSync(path.join(RACINE, 'app.js'), 'utf8');
    verifier('l’app appelle ecrireTransaction', src.indexOf('PF.net.ecrireTransaction(') >= 0);
    verifier('l’app appelle ecrireApport', src.indexOf('PF.net.ecrireApport(') >= 0);
    verifier('l’app appelle modifierTransaction', src.indexOf('PF.net.modifierTransaction(') >= 0);
    verifier('l’app appelle modifierApport', src.indexOf('PF.net.modifierApport(') >= 0);
    verifier('la compensation « compte non débité, opération annulée » a disparu',
        src.indexOf('compte non débité, opération annulée') < 0);
    verifier('la compensation « compte non crédité, mouvement annulé » a disparu',
        src.indexOf('compte non crédité, mouvement annulé') < 0);

    console.log('\n' + (echecs ? '✗ ' + echecs + ' échec(s), ' : '✔ ') + reussis + ' réussis'
        + (echecs ? '' : ', 0 échec'));
    process.exit(echecs ? 1 : 0);
}

principal().catch(e => { console.error(e); process.exit(1); });
