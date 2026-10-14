/* Périmètre de la déclaration : un seul propriétaire des titres, foyer marié.
   Ce test inspecte les avertissements de l'APK ; aucun service n'est appelé. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const texte = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/fiscal.js'), 'utf8');

assert.match(texte, /ce portefeuille appartient uniquement à son propriétaire/);
assert.match(texte, /Le mariage ne rend pas le conjoint codétenteur/);
assert.match(texte, /Les options 2OP\/3CN et le seuil de cessions crypto concernent tout le foyer/);
assert.match(texte, /Ce total ne suffit pas à prouver l’exonération du foyer fiscal/);
assert.match(texte, /seuil du foyer est respecté/);
assert.doesNotMatch(texte, /<b>exonéré<\/b>/);
console.log('Périmètre des titres et avertissement sur le seuil crypto : tests réussis');
