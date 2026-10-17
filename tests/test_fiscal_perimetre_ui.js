/* Périmètre de la déclaration : un seul propriétaire des titres, foyer marié.
   Ce test inspecte les avertissements de l'APK ; aucun service n'est appelé.

   Mise à jour 2.2.6 : le propriétaire a demandé le retrait de quatre bandeaux
   d'en-tête, dont « Titres et cessions : ce portefeuille appartient uniquement à
   son propriétaire… ». Ce bandeau portait un avertissement RÉEL — le périmètre du
   foyer — qui fait partie des cinq points fiscaux ouverts du chantier (2086 et
   2OP/3CN à l'échelle du FOYER, un portefeuille seul n'étant pas une annexe
   exhaustive). Le retirer de l'en-tête ne doit donc pas retirer le fond : ce test
   vérifie que l'avertissement subsiste là où il est utile, c'est-à-dire au contact
   du chiffre qu'il qualifie, et non plus en bandeau général.

   Il survit à trois endroits, tous vérifiés ci-dessous :
     • la limite du comparateur 2OP (« 2OP est globale pour tous les RCM et gains
       mobiliers du foyer »), affichée avec la recommandation elle-même ;
     • la note au CONTACT de la ligne 51 crypto (« Ce total ne suffit pas à
       prouver l'exonération du foyer fiscal ») et les cessions du conjoint ;
     • `portee2086Foyer()`, qui porte la portée foyer de l'annexe 2086.

   Le test verrouille aussi le RETRAIT : si l'un des quatre bandeaux réapparaît
   dans un rendu, il échoue. La suppression est un choix du propriétaire, pas un
   oubli — elle doit le rester. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const texte = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/fiscal.js'), 'utf8');
const guide = fs.readFileSync(path.join(__dirname,
    '../app/src/main/assets/www/js/fiscal_formulaires_dgfip.js'), 'utf8');

/* ---------------------------------------------------------- ce qui doit rester
   L'avertissement sur le périmètre du foyer, au contact des chiffres. */
assert.match(texte, /2OP est globale pour tous les RCM et gains mobiliers du foyer/,
    'la limite foyer du comparateur 2OP doit subsister');
assert.match(guide, /Ce total ne suffit pas à prouver l’exonération du foyer fiscal/,
    'le seuil crypto de 305 € doit rester qualifié dans le formulaire 2086');
assert.match(guide, /cessions du conjoint hors de ce portefeuille/,
    'le conjoint hors portefeuille doit être explicitement mentionné');
assert.match(guide, /seuil de 305 €.*cessions du conjoint hors de ce portefeuille/s,
    'la condition de seuil doit figurer avec la part connue de 51');
assert.match(texte, /portee2086Foyer/, 'la portée foyer de l’annexe 2086 doit subsister');
assert.doesNotMatch(texte, /<b>exonéré<\/b>/,
    'sous le seuil, le mot « exonéré » ne doit pas être affirmé en gras');

/* ------------------------------------------------------- ce qui doit avoir disparu
   Trois des quatre bandeaux n'existent plus du tout dans le CODE.

   On retire d'abord les lignes de commentaire : elles citent volontairement ces
   incipits pour documenter le retrait, et une recherche brute les retrouverait.
   Ce qui compte est ce qui est rendu, donc ce qui est concaténé dans `out`.
   Seules les lignes dont le premier caractère non-blanc est `//` sont retirées —
   jamais un `//` intérieur à une chaîne (les adresses https:// doivent survivre). */
const code = texte.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const RETIRES = [
    'Révision publiée des paramètres',
    'Quotient familial : plafond général seulement',
    'ce portefeuille appartient uniquement à son propriétaire',
    'Le mariage ne rend pas le conjoint codétenteur',
];
RETIRES.forEach(incipit => assert.equal(code.includes(incipit), false,
    `bandeau retiré à la demande du propriétaire (2.2.6) mais encore rendu : « ${incipit} »`));

/* Le quatrième — « Paramètres publiés pour les revenus … » — est le message
   d'ÉTAT renvoyé par verifierMaj(), qui reste une API exportée et testée. Ce qui
   doit disparaître, c'est son AFFICHAGE. On vérifie donc qu'il n'existe qu'une
   seule occurrence dans le code et qu'elle est dans verifierMaj(), défini avant
   vue() : aucune concaténation de rendu ne peut plus le porter. */
const occurrences = code.split('Paramètres publiés pour les revenus').length - 1;
assert.equal(occurrences, 1,
    'le message « Paramètres publiés pour les revenus … » ne doit exister que dans verifierMaj()');
assert.ok(code.indexOf('Paramètres publiés pour les revenus') < code.indexOf('function vue(ctx)'),
    'ce message doit rester dans verifierMaj(), défini avant le rendu de l’écran');
// Et son affichage est bien conditionné : le rendu ok-vert de maj.message ne
// s'exécute pas quand une révision est active, cas qui produit ce message.
assert.match(code, /\} else if \(!revisionActive\(annee\)\) \{[\s\S]{0,600}UI\.h\(maj\.message\)/,
    'le message d’une révision active ne doit plus être affiché');

console.log('Périmètre du foyer préservé au contact des chiffres, quatre bandeaux retirés : OK');
