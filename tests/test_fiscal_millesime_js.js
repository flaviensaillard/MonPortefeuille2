/* Données fiscales annuelles côté Android (revue 2.0.1 — T-07, priorité 10).

   Avant la 2.1.0, la fiche « Situation fiscale » poussait salaires, intérêts,
   kilomètres, puissance et repas vers la table `Config` SOUS DES CLÉS SANS ANNÉE
   (`f_s1`, `f_k1`…). La page Streamlit, qui partage cette table, relisait donc
   des montants sans millésime, et une même valeur pouvait valoir pour plusieurs
   années.

   Désormais, seule l'identité du foyer (statut, enfants, parts, pays) est
   poussée vers `Config`. Les données annuelles restent locales à l'application
   tant qu'elles n'ont pas de millésime côté Android. */
'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js', 'app.js'), 'utf8');

let reussis = 0, echecs = 0;
function verifier(nom, cond, detail) {
    if (cond) { reussis++; console.log('  ✓ ' + nom); }
    else { echecs++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); }
}

const debut = source.indexOf('var CORRESPONDANCE_CONFIG = {');
const fin = source.indexOf('};', debut);
const bloc = debut >= 0 && fin > debut ? source.slice(debut, fin) : '';
const clesPoussees = [...bloc.matchAll(/:\s*'(f_[a-z0-9_]+)'/g)].map(m => m[1]);
const ANNUELLES = ['f_s1', 'f_s2', 'f_int_net', 'f_u1', 'f_k1', 'f_cv1', 'f_r1', 'f_elec1',
    'f_u2', 'f_k2', 'f_cv2', 'f_r2', 'f_elec2'];
const IDENTITE = ['f_statut', 'f_parts', 'f_enf', 'f_pays_etr'];

console.log('Les données annuelles ne sont plus poussées vers Config sans millésime');
verifier('le bloc CORRESPONDANCE_CONFIG existe', debut >= 0);
verifier('aucune clé annuelle sans année n’est poussée',
    ANNUELLES.every(c => clesPoussees.indexOf(c) < 0),
    'poussées : ' + clesPoussees.filter(c => ANNUELLES.indexOf(c) >= 0).join(', '));
verifier('l’identité du foyer reste partagée avec Streamlit',
    IDENTITE.every(c => clesPoussees.indexOf(c) >= 0),
    'poussées : ' + clesPoussees.join(', '));

console.log('\n' + (echecs ? '✗ ' + echecs + ' échec(s), ' : '✔ ') + reussis + ' réussis'
    + (echecs ? '' : ', 0 échec'));
process.exit(echecs ? 1 : 0);
