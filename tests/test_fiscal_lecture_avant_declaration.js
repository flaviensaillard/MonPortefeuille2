/* Lecture avant déclaration : le bug silencieux que `var` rend possible.

   Pourquoi ce test existe
   -----------------------
   En retirant le bandeau « Quotient familial » (2.2.6), un défaut latent réel est
   apparu : `vue()` appelait `casParticuliersQF({ …, enfants: enfants })` alors que
   `var enfants` était déclaré DIX-SEPT LIGNES PLUS BAS. Avec `var`, l'identifiant
   est hissé mais vaut `undefined` avant sa déclaration : la garde personnalisée ne
   s'est donc JAMAIS affichée, sans erreur, sans test rouge, sans trace. Un bug
   parfaitement silencieux, découvert par hasard.

   `let` et `const` ne sont pas concernés : leur zone morte lève une
   ReferenceError, donc le problème se voit. Ce test ne porte que sur `var`, et
   c'est délibéré.

   Ce que ce test vérifie
   ----------------------
   1. le détecteur n'est PAS vacueux : sur un extrait synthétique contenant le
      bug, il doit le trouver. Sans cet auto-contrôle, un détecteur cassé
      renverrait « 0 problème » et le test passerait en mentant — c'est
      exactement ce qui est arrivé à la première version de ce scanneur, dont le
      regex de fonction ne matchait rien ;
   2. sur la version 2.2.5 du dépôt, il retrouve le bug réel `enfants` et rien
      d'autre ;
   3. sur le code courant, aucun `var` n'est lu avant sa déclaration.

   Les deux classes de faux positifs rencontrées sont corrigées et verrouillées :
   un paramètre de fonction inline sur une seule ligne (qui masque la variable
   externe) et un `\\d` à l'intérieur d'une regex (dont la classe `[/\\-.]` contient
   un `/` qui fermait le masque trop tôt). */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js');
const ID = 'A-Za-z0-9_$éèêàçûîô';

/* Masque chaînes, commentaires et regex en espaces, en conservant les retours à
   la ligne : les mots français dans les chaînes, les clés d'objet et les
   commentaires cessent d'être pris pour du code, sans déplacer aucune ligne.

   Deux difficultés réelles, toutes deux rencontrées en pratique :
   - une regex peut contenir un `/` dans une classe de caractères (`[/\-.]`) :
     sans suivi de la classe, le masque se ferme trop tôt et le `\d` suivant est
     lu comme un identifiant `d` ;
   - ce commentaire est écrit avec `//` et non en bloc, justement parce qu'il
     cite la syntaxe de bloc, qui fermerait un bloc prématurément.

   Limite assumée : le contenu d'une interpolation de template literal est masqué
   lui aussi. Les fichiers de ce dépôt concatènent à l'ancienne et n'en usamnt
   pas ; si cela change, ce masque devra suivre. */
function masquer(src) {
    let out = '', i = 0, etat = 'code', prec = '', classe = false;
    while (i < src.length) {
        const c = src[i], d = src[i + 1];
        if (etat === 'code') {
            if (c === '/' && d === '/') { etat = 'ligne'; out += '  '; i += 2; continue; }
            if (c === '/' && d === '*') { etat = 'bloc'; out += '  '; i += 2; continue; }
            if (c === "'") { etat = 'sq'; out += ' '; i++; continue; }
            if (c === '"') { etat = 'dq'; out += ' '; i++; continue; }
            if (c === '`') { etat = 'tq'; out += ' '; i++; continue; }
            // Une regex ne peut commencer qu'après un opérateur ou un mot-clé :
            // sans cette règle, un `/` de division ouvrirait un masque infini.
            if (c === '/' && /[=(,:[!&|?{};]/.test(prec.slice(-1))) {
                etat = 're'; classe = false; out += ' '; i++; continue;
            }
            out += c;
            if (!/\s/.test(c)) prec += c;
            i++; continue;
        }
        if (etat === 'ligne') {
            if (c === '\n') { etat = 'code'; out += '\n'; } else out += ' ';
            i++; continue;
        }
        if (etat === 'bloc') {
            if (c === '*' && d === '/') { etat = 'code'; out += '  '; i += 2; }
            else { out += (c === '\n' ? '\n' : ' '); i++; }
            continue;
        }
        if (etat === 'sq' || etat === 'dq' || etat === 'tq') {
            const q = etat === 'sq' ? "'" : etat === 'dq' ? '"' : '`';
            if (c === '\\') { out += '  '; i += 2; continue; }
            if (c === q) { etat = 'code'; out += ' '; i++; continue; }
            out += (c === '\n' ? '\n' : ' '); i++; continue;
        }
        // etat === 're'
        if (c === '\\') { out += '  '; i += 2; continue; }
        if (c === '[') { classe = true; out += ' '; i++; continue; }
        if (c === ']') { classe = false; out += ' '; i++; continue; }
        if (c === '/' && !classe) { etat = 'code'; out += ' '; i++; continue; }
        if (c === '\n') { etat = 'code'; out += '\n'; i++; continue; }   // garde-fou
        out += ' '; i++; continue;
    }
    return out;
}

/* Étendue d'une fonction à partir de sa ligne d'ouverture, par comptage
   d'accolades sur le source MASQUÉ (les accolades dans les chaînes ne comptent
   donc pas). Approximation assumée, d'où les auto-contrôles ci-dessous. */
function etendue(lignes, deb) {
    let prof = 0, ouvert = false;
    for (let i = deb; i < lignes.length; i++) {
        for (const ch of lignes[i]) {
            if (ch === '{') { prof++; ouvert = true; }
            else if (ch === '}') { prof--; }
            if (ouvert && prof === 0) return [deb, i];
        }
    }
    return [deb, lignes.length - 1];
}

function scanner(src) {
    const lignes = masquer(src).split('\n');
    const RE_FUNC = new RegExp('^    function ([' + ID + ']+)\\s*\\(');
    const RE_VAR = new RegExp('^        var ([' + ID + ']+)');

    const foncs = [];
    lignes.forEach((l, i) => {
        const m = RE_FUNC.exec(l);
        if (m) foncs.push({ nom: m[1], deb: i, fin: etendue(lignes, i)[1] });
    });

    const hits = [];
    for (const f of foncs) {
        const corps = lignes.slice(f.deb, f.fin + 1);

        // Déclarations du corps direct (indentation 8). Un nom déclaré plusieurs
        // fois est ambigu : on ne conclut pas plutôt que de deviner.
        const decl = {};
        corps.forEach((l, k) => {
            const m = RE_VAR.exec(l);
            if (m) (decl[m[1]] = decl[m[1]] || []).push(f.deb + k);
        });

        // Toute fonction imbriquée est exclue, y compris celle qui tient sur une
        // seule ligne : son paramètre masque la variable externe, et le compter
        // produirait un faux positif (cas réel : `lignes.filter(function (r) {…})`
        // dans fiscal_revisions.js). Revers accepté et documenté : une ligne
        // mélangeant lecture externe et fonction inline ne sera pas examinée.
        const imbriques = [];
        corps.forEach((l, k) => {
            if (k > 0 && /\bfunction\b/.test(l)) {
                const s = etendue(lignes, f.deb + k);
                imbriques.push(s);
            }
        });
        const dansClosure = n => imbriques.some(([a, b]) => n >= a && n <= b);

        for (const nom of Object.keys(decl)) {
            if (decl[nom].length !== 1) continue;
            const d = decl[nom][0];
            const re = new RegExp('(^|[^' + ID + '.])' + nom + '([^' + ID + ']|$)', 'g');
            for (let n = f.deb; n < d; n++) {
                if (dansClosure(n)) continue;
                const l = lignes[n];
                let m; re.lastIndex = 0;
                while ((m = re.exec(l))) {
                    // `nom:` est une clé d'objet, pas une lecture de variable.
                    const apres = l.slice(m.index + m[0].length - 1).replace(/^\s*/, '');
                    if (apres.startsWith(':')) continue;
                    hits.push({ fonction: f.nom, variable: nom, lecture: n + 1, declaration: d + 1 });
                    break;
                }
            }
        }
    }
    return { fonctions: foncs.length, hits: hits };
}

/* ---------------------------------------------------------- 1. auto-contrôle
   Sans ce contrôle, un détecteur cassé renverrait « 0 problème » et ce test
   passerait en mentant. C'est exactement ce qui est arrivé à la première version
   de ce scanneur : son regex de fonction ne matchait rien, il a annoncé
   « 0 fonction analysée, 0 hit » — un résultat vide pris à tort pour un succès. */
const SYNTH_BOGUE = [
    '(function (root) {',
    "    function exemple(r) {",
    "        var out = 'x' + enfants + 'y';",
    '        var enfants = 3;',
    '        return out + enfants;',
    '    }',
    '})(this);'].join('\n');
const synth = scanner(SYNTH_BOGUE);
assert.equal(synth.fonctions, 1, 'le détecteur doit voir la fonction du snippet');
assert.equal(synth.hits.length, 1, 'le bug synthétique doit être détecté');
assert.equal(synth.hits[0].variable, 'enfants');
assert.equal(synth.hits[0].lecture, 3);
assert.equal(synth.hits[0].declaration, 4);

/* Les deux classes de faux positifs doivent rester neutres. */
const SYNTH_SAIN = [
    '(function (root) {',
    '    function sain(lignes) {',
    '        var actives = lignes.filter(function (r) { return r.actif === true; });',
    '        var r = actives[0];',
    '        var re = /^(\\d{1,2})[/\\-.](\\d{4})$/',
    '        return { r: r, trouve: re.test(String(r)) };',
    '    }',
    '})(this);'].join('\n');
const sain = scanner(SYNTH_SAIN);
assert.equal(sain.hits.length, 0,
    'paramètre de fonction inline et \\d dans une regex ne sont pas des lectures avant déclaration');
console.log('1. auto-contrôle : bug synthétique détecté, faux positifs neutres');

/* ------------------------------------------- 2. contrôle positif sur le réel
   Reproduction fidèle du défaut de la 2.2.5 : même forme d'appel (l'argument
   `enfants:` est une clé, sa VALEUR est la lecture fautive), même déclaration
   repoussée plus bas dans `vue()`. Vérifié sur le fichier réel de la 2.2.5 : le
   scanneur y retrouve exactement ce hit, et aucun autre dans ce fichier — un
   détecteur qui crierait partout serait inutile.

   Cette reproduction remplace une fixture de code ancien : un extrait figé de
   fiscal.js aurait pourri en silence, et un contrôle dont l'exécution dépend de
   la présence d'un fichier n'est pas un contrôle. */
const DEFECT_REEL_225 = [
    '(function (root) {',
    '    function vue(ctx) {',
    '        var out = "";',
    '        var qfGarde = PF.fiscalGardesFoyer ? PF.fiscalGardesFoyer.casParticuliersQF({',
    '            parts: U.num(r.partsFiscales, 0), statut: r.statutFiscal, enfants: enfants }) : null;',
    '        out += qfGarde ? "" : "";',
    '        var couple = true;',
    '        var enfants = Math.max(0, Math.round((r.partsFiscales - (couple ? 2 : 1)) * 2));',
    '        return out + enfants;',
    '    }',
    '})(this);'].join('\n');
const reel = scanner(DEFECT_REEL_225);
assert.equal(reel.hits.length, 1, 'le défaut réel de la 2.2.5 doit être retrouvé, et seul');
assert.equal(reel.hits[0].fonction, 'vue');
assert.equal(reel.hits[0].variable, 'enfants');
assert.equal(reel.hits[0].lecture, 5, 'la lecture fautive est la valeur de la clé, pas la clé');
assert.equal(reel.hits[0].declaration, 8);
console.log('2. contrôle positif : défaut réel de la 2.2.5 reproduit et retrouvé');

/* ------------------------------------------------------ 3. le code courant
   Aucun `var` lu avant sa déclaration dans les modules de la WebView. Le nombre
   de fonctions analysées est asserté : c'est ce qui distingue « rien trouvé » de
   « rien examiné ». */
const fichiers = fs.readdirSync(WWW).filter(f => f.endsWith('.js')).sort();
assert.ok(fichiers.length >= 25, 'assez de modules analysés pour être significatif');
let fonctions = 0;
const trouvés = [];
for (const f of fichiers) {
    const r = scanner(fs.readFileSync(path.join(WWW, f), 'utf8'));
    fonctions += r.fonctions;
    r.hits.forEach(h => trouvés.push(f + ' → ' + h.fonction + '() : `' + h.variable
        + '` lu ligne ' + h.lecture + ', déclaré ligne ' + h.declaration));
}
assert.ok(fonctions >= 500,
    'le scan ne doit pas être vacuous : ' + fonctions + ' fonctions de niveau 1 vues');
assert.deepEqual(trouvés, [],
    'variable lue avant sa déclaration `var` (hissée donc undefined, bug silencieux) :\n  '
    + trouvés.join('\n  '));
console.log('3. code courant : ' + fichiers.length + ' modules, ' + fonctions
    + ' fonctions analysées, aucune lecture avant déclaration');

console.log('Lecture avant déclaration `var` : détecteur auto-contrôlé, code courant sain OK');
