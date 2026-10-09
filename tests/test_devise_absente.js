/* Devise absente ou fausse : NULL annoncé, jamais « NAN = 1 »
   (revue 2.0.1, constat D-04).

   Avant la 2.1.0, le champ devise acceptait le texte libre « NAN » et les deux
   convertisseurs déclaraient explicitement NAN égal à 1 : 1 000 unités d'une
   devise absente entraient comme 1 000 EUR, sans conversion ni bannière.

   Ce qui est verrouillé ici :
   - taux('NAN'), taux('') et toute devise hors ISO 4217 rendent NULL —
     jamais 1 ; la valorisation qui suit est annoncée indisponible ;
   - la même devise contre elle-même reste 1 (cas légitime) ;
   - un compte ne peut plus être créé avec une devise hors ISO 4217
     (« NAN » est refusé nommément) ;
   - une transaction ne peut plus être saisie avec une devise hors ISO ;
   - la liste JS est le miroir EXACT de core/devises.py (parité des moteurs). */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js');
const FICHIERS = ['util.js', 'models.js', 'net.js', 'store.js', 'metrics.js', 'comptes.js'];

const stockage = {};
globalThis.localStorage = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');

function fauxTransport(method, url) {
    // Aucun cours disponible : toute tentative de conversion échoue.
    return { ok: true, status: 200, body: JSON.stringify({ chart: { result: [null], error: null } }) };
}

const contexte = vm.createContext(globalThis);
for (const f of FICHIERS) {
    vm.runInContext(fs.readFileSync(path.join(RACINE, f), 'utf8'), contexte, { filename: f });
}
const PF = globalThis.PF;
PF.net.setTransport(fauxTransport);

let reussis = 0, echecs = 0;
function verifier(nom, cond, detail) {
    if (cond) { reussis++; console.log('  ✓ ' + nom); }
    else { echecs++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); }
}

async function principal() {
    console.log('Le convertisseur ne prend plus jamais NAN pour 1');
    verifier('taux(« NAN ») rend NULL, pas 1',
        (await PF.net.taux('NAN', '2026-01-01')) === null);
    verifier('taux(devise vide) rend NULL, pas 1',
        (await PF.net.taux('', '2026-01-01')) === null);
    verifier('taux(« nan » minuscule) rend NULL aussi',
        (await PF.net.taux('nan', '2026-01-01')) === null);
    verifier('une devise hors ISO 4217 rend NULL',
        (await PF.net.taux('ZZZ', '2026-01-01')) === null);
    verifier('la même devise contre elle-même reste 1',
        (await PF.net.taux('EUR', '2026-01-01', 'EUR')) === 1);

    console.log('Un compte exige une devise ISO 4217');
    var saisieNan = { nom: 'Compte mystère', banque: '', devise: 'NAN', type: 'disponible', motif: '', note: '' };
    var resNan = PF.comptes.nouveauCompte(saisieNan);
    verifier('la devise « NAN » est refusée à la création d’un compte',
        resNan.compte === null && resNan.erreurs.length > 0
            && /ISO/.test(resNan.erreurs.join(' ')),
        JSON.stringify(resNan.erreurs));
    var saisieZzz = Object.assign({}, saisieNan, { devise: 'ZZZ' });
    verifier('une devise inconnue (ZZZ) est refusée aussi',
        PF.comptes.nouveauCompte(saisieZzz).compte === null);
    var saisieOk = Object.assign({}, saisieNan, { devise: 'USD' });
    verifier('une devise ISO (USD) passe toujours',
        PF.comptes.nouveauCompte(saisieOk).compte !== null);

    console.log('La saisie de transaction exige une devise ISO 4217');
    verifier('PF.portefeuille ou l’écran expose le contrôle ISO',
        Array.isArray(PF.modele.DEVISES_ISO) && !PF.modele.DEVISES_ISO.includes('NAN'));
    verifier('la devise d’une transaction est validée par erreurDevise()',
        typeof PF.comptes.erreurDevise === 'function'
            && PF.comptes.erreurDevise('NAN') !== null
            && PF.comptes.erreurDevise('') !== null
            && PF.comptes.erreurDevise('USD') === null);

    console.log('Parité avec le moteur Python (core/devises.py)');
    const brut = fs.readFileSync(path.join(__dirname, '..', 'core', 'devises.py'), 'utf8');
    const m = brut.match(/frozenset\("""\n([\s\S]*?)\n"""\.split\(\)\)/);
    const python = m[1].split(/\s+/).filter(Boolean).sort();
    const js = PF.modele.DEVISES_ISO.slice().sort();
    verifier('les deux listes ISO 4217 sont identiques (' + js.length + ' codes)',
        python.length === js.length && python.every((c, i) => c === js[i]),
        'différence éventuelle autour de : '
            + python.filter((c, i) => js[i] !== c).slice(0, 5).join(','));

    console.log(echecs === 0
        ? '\n✔ ' + reussis + ' réussis, 0 échec'
        : '\n✗ ' + reussis + ' réussis, ' + echecs + ' échec' + (echecs > 1 ? 's' : ''));
    process.exit(echecs === 0 ? 0 : 1);
}

principal().catch((e) => { console.error(e); process.exit(1); });
