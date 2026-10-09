/* Ventes excédentaires : rejetées partout, 2074 incluse — côté app
   (revue 2.0.1, constat 6 ; miroir Python : tests/test_ventes_excedentaires.py).

   Avant la 2.1.0 :
   - le formulaire de saisie contrôlait la quantité positive mais JAMAIS la
     quantité détenue : on pouvait enregistrer une vente de 12 titres en n'en
     ayant que 10 ;
   - le portefeuille les écartait bien, mais la déclaration 2074 calculait la
     cession entière (le PRU déduit sur des titres jamais détenus) ;
   - le 2086 clampait les quantités en silence.

   Désormais un validateur PARTAGÉ (PF.portefeuille.erreurVenteExcedentaire)
   sert au formulaire et aux déclarations. Ce qui est verrouillé :
   - la vente excédentaire est refusée au formulaire (controleTitre) ;
   - elle est écartée du 2074 et du 2086, annoncée, jamais chiffrée ;
   - une vente dans la limite de la position passe sans être inquiétée. */
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

const contexte = vm.createContext(globalThis);
for (const f of FICHIERS) {
    vm.runInContext(fs.readFileSync(path.join(RACINE, f), 'utf8'), contexte, { filename: f });
}
const PF = globalThis.PF;
PF.net.setTransport(() => ({ ok: true, status: 200, body: '[]' }));
PF.net.taux = () => Promise.resolve(1);        // EUR partout dans ces scénarios
PF.store.sauverReglages({ supabaseUrl: 'https://test.supabase.co', supabaseKey: 'cle-test' });

let reussis = 0, echecs = 0;
function verifier(nom, cond, detail) {
    if (cond) { reussis++; console.log('  ✓ ' + nom); }
    else { echecs++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); }
}

function tx(ticker, type, date, quantite, cours, id) {
    return {
        id: id === undefined ? null : id, ticker: ticker, type: type, sens: type,
        date: date, quantite: quantite, cours: cours, frais: 0, devise: 'EUR'
    };
}

async function principal() {
    console.log('Le validateur partagé existe et juge comme le portefeuille');
    verifier('PF.portefeuille.erreurVenteExcedentaire existe',
        typeof PF.portefeuille.erreurVenteExcedentaire === 'function');
    if (echecs) { console.log('\n✗ ' + echecs + ' échec(s), ' + reussis + ' réussis'); process.exit(1); }

    const v = PF.portefeuille.erreurVenteExcedentaire;
    var achat10 = [tx('CW8.L', 'achat', '2025-01-10', 10, 100)];
    verifier('vente 12 avec 10 détenus : refusée',
        v(achat10, tx('CW8.L', 'vente', '2025-06-01', 12, 110)) !== null);
    verifier('vente 10 avec 10 détenus : acceptée',
        v(achat10, tx('CW8.L', 'vente', '2025-06-01', 10, 110)) === null);
    verifier('achat du même jour fournit des lots',
        v([tx('CW8.L', 'achat', '2025-06-01', 10, 100)],
            tx('CW8.L', 'vente', '2025-06-01', 10, 110)) === null);
    verifier('vente du même jour retire des lots par prudence',
        v([tx('CW8.L', 'achat', '2025-01-10', 10, 100), tx('CW8.L', 'vente', '2025-06-01', 8, 110, 1)],
            tx('CW8.L', 'vente', '2025-06-01', 5, 110, 2)) !== null);
    verifier('un achat postérieur ne compte pas',
        v([tx('CW8.L', 'achat', '2025-09-01', 10, 100)],
            tx('CW8.L', 'vente', '2025-06-01', 5, 110)) !== null);
    verifier('les autres titres ne comptent pas',
        v([tx('AIR.PA', 'achat', '2025-01-10', 10, 100)],
            tx('CW8.L', 'vente', '2025-06-01', 1, 110)) !== null);
    verifier('la ligne en cours de modification peut être écartée (idExclu)',
        v([tx('CW8.L', 'achat', '2025-01-10', 10, 100), tx('CW8.L', 'vente', '2025-06-01', 8, 110, 7)],
            tx('CW8.L', 'vente', '2025-06-01', 10, 110, 7), { idExclu: 7 }) === null);

    console.log('Le formulaire de saisie refuse la vente excédentaire (structurel)');
    const src = fs.readFileSync(path.join(RACINE, 'app.js'), 'utf8');
    verifier('controleTitre utilise le validateur partagé',
        src.indexOf('PF.portefeuille.erreurVenteExcedentaire(') >= 0);

    console.log('2074 : la vente excédentaire est écartée et annoncée');
    var b = await PF.fiscal.bilanCessions({
        transactions: [tx('CW8.L', 'achat', '2025-01-10', 10, 100),
            tx('CW8.L', 'vente', '2025-06-01', 12, 110)]
    }, 2025);
    verifier('aucune opération chiffrée sur l’excédent', b.t2074.operations.length === 0,
        'opérations : ' + b.t2074.operations.length);
    verifier('l’écart est annoncé', (b.ventes_excedentaires || []).length === 1,
        'annonces : ' + (b.ventes_excedentaires || []).length);
    verifier('le bilan 2074 est nul', b.t2074.bilan_net === 0);
    verifier('rien à reporter en 3VG/3VH', b.t2074.case_3vg === 0 && b.t2074.case_3vh === 0);

    console.log('2074 : une vente dans la position passe');
    b = await PF.fiscal.bilanCessions({
        transactions: [tx('CW8.L', 'achat', '2025-01-10', 10, 100),
            tx('CW8.L', 'vente', '2025-06-01', 10, 110)]
    }, 2025);
    verifier('pas d’annonce', (b.ventes_excedentaires || []).length === 0);
    verifier('l’opération est chiffrée', b.t2074.operations.length === 1);
    verifier('la plus-value est juste (1 100 − 1 000)', Math.abs(b.t2074.bilan_net - 100) < 1e-6,
        'bilan : ' + b.t2074.bilan_net);

    console.log('2086 : la vente crypto excédentaire est écartée');
    b = await PF.fiscal.bilanCessions({
        transactions: [tx('BTCUSDT', 'achat', '2025-01-10', 1, 10000),
            tx('BTCUSDT', 'vente', '2025-06-01', 2, 11000)]
    }, 2025);
    verifier('la cession fictive n’entre pas au 2086', b.t2086.cessions.length === 0,
        'cessions : ' + b.t2086.cessions.length);
    verifier('l’écart est annoncé', (b.ventes_excedentaires || []).length === 1);

    console.log('\n' + (echecs ? '✗ ' + echecs + ' échec(s), ' : '✔ ') + reussis + ' réussis'
        + (echecs ? '' : ', 0 échec'));
    process.exit(echecs ? 1 : 0);
}

principal().catch(e => { console.error(e); process.exit(1); });
