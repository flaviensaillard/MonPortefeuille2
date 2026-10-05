/* Formatage, dates, petites fonctions. Portage de core/ui.py (partie texte)
   et de core/dates.py, en respectant la convention d'affichage du porteur :
   le dollar en blanc, l'euro en bleu en dessous. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};

    // ---------------------------------------------------------------- nombres

    function estNombre(x) {
        return typeof x === 'number' && isFinite(x);
    }

    function num(x, defaut) {
        var v = typeof x === 'string' ? parseFloat(String(x).replace(/\s/g, '').replace(',', '.')) : x;
        if (typeof v !== 'number' || !isFinite(v)) return defaut === undefined ? 0 : defaut;
        return v;
    }

    var fr = null;
    function frFmt(dec) {
        if (!fr) fr = {};
        if (!fr[dec]) {
            fr[dec] = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        }
        return fr[dec];
    }

    function nombre(x, dec) {
        if (!estNombre(x)) x = 0;
        // L'espace fine insécable de l'ICU est remplacée par une espace
        // ordinaire : les montants restent copiables tels qu'affichés.
        return frFmt(dec === undefined ? 2 : dec).format(x).replace(/[\u00a0\u202f]/g, ' ');
    }

    function signe(x) { return x > 0 ? '+' : (x < 0 ? '-' : ''); }

    function usd(x, opts) {
        opts = opts || {};
        var d = opts.dec === undefined ? 2 : opts.dec;
        var s = opts.signe ? signe(x) : '';
        return s + nombre(opts.signe ? Math.abs(x) : x, d) + ' $';
    }

    function eur(x, opts) {
        opts = opts || {};
        var d = opts.dec === undefined ? 2 : opts.dec;
        var s = opts.signe ? signe(x) : '';
        return s + nombre(opts.signe ? Math.abs(x) : x, d) + ' €';
    }

    /* Deux fonctions, deux métiers : on ne convertit une unité qu'une seule
       fois, et jamais au même endroit deux fois. */

    /* Taux déjà exprimé en taux (0,017 pour 1,7 %) — un réglage saisi à la
       main. Un entier tapé « 2 » pour 2 % est compris ; une valeur qui ne peut
       pas être une inflation annuelle française est écartée : mieux vaut 2 %
       par défaut, annoncé, qu'une rente calculée sur 94 %. */
    function tauxPlausible(x) {
        if (!estNombre(x)) return null;
        var t = x;
        if (Math.abs(t) >= 1) t = t / 100;      // « 2 » pour 2 %
        if (t > 0.15 || t < -0.02) return null; // hors de ce qu'a connu la France
        return t;
    }

    /* Lecture de la table `pf2_inflation`, partagée avec l'application
       Streamlit : la v2 y stocke un POURCENTAGE et divise par 100 à la lecture
       (1,7 pour 1,7 %). L'application Android lisait la même colonne sans la
       diviser : 0,944 s'affichait « 94,4 % ». On reprend la convention de la
       v2, avec un rattrapage pour les lignes saisies directement en taux
       (0,017), et on écarte ce qui n'est manifestement pas un taux annuel. */
    function inflationDepuisTable(v) {
        if (!estNombre(v)) return null;
        var t = v / 100;
        if (Math.abs(v) < 0.05) t = v;          // déjà un taux, saisi à la main
        if (t > 0.15 || t < -0.02) return null;
        return t;
    }

    function pct(x, dec) {
        if (!estNombre(x)) return '—';
        return nombre(x * 100, dec === undefined ? 2 : dec) + ' %';
    }

    function pctSigne(x, dec) {
        if (!estNombre(x)) return '—';
        return signe(x) + nombre(Math.abs(x) * 100, dec === undefined ? 2 : dec) + ' %';
    }

    function points(x, dec) {
        if (!estNombre(x)) return '—';
        var v = typeof x === 'number' && Math.abs(x) <= 1.0001 && Math.abs(x) > 0 ? x * 100 : x;
        return signe(v) + nombre(Math.abs(v), dec === undefined ? 1 : dec) + ' pt';
    }

    function quantite(x) {
        if (!estNombre(x)) return '—';
        var d = Math.abs(x) < 10 ? 4 : 2;
        return frFmt(d).format(x);
    }

    /* La flèche : ↗ ça monte, ↘ ça descend, → c'est stable.
       Le seuil de 0,005 % évite d'afficher une hausse pour un arrondi. */
    var SEUIL_STABLE = 0.00005;

    function fleche(part, dec) {
        if (part === null || part === undefined || !estNombre(part)) return { texte: '—', sens: 'flat', classe: 'flat' };
        var p = num(part, 0);
        var sens = p > SEUIL_STABLE ? 'up' : (p < -SEUIL_STABLE ? 'down' : 'flat');
        var glyph = sens === 'up' ? '↗' : (sens === 'down' ? '↘' : '→');
        var d = dec === undefined ? 2 : dec;
        var txt;
        if (sens === 'flat') txt = '→ ' + nombre(0, d) + ' %';
        else txt = glyph + ' ' + signe(p) + nombre(Math.abs(p) * 100, d) + ' %';
        return { texte: txt, sens: sens, classe: sens, valeur: p };
    }

    function flecheTexte(part, dec) { return fleche(part, dec).texte; }

    // ------------------------------------------------------------------ dates

    function jourMoisAnnee(d) {
        var j = String(d.getDate()).padStart(2, '0');
        var m = String(d.getMonth() + 1).padStart(2, '0');
        return j + '/' + m + '/' + d.getFullYear();
    }

    /* Accepte ISO (2026-10-04), jj/mm/aaaa, et tout ce que renvoie Supabase. */
    function parseDate(v) {
        if (v === null || v === undefined || v === '') return null;
        if (v instanceof Date && !isNaN(v.getTime())) return iso(v);
        var s = String(v).trim();
        var m;
        if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) {
            return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
        }
        if ((m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(s))) {
            return m[3] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
        }
        var d = new Date(s);
        return isNaN(d.getTime()) ? null : iso(d);
    }

    function iso(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function todayISO() { return iso(new Date()); }

    function jourMois(isoDate) {
        if (!isoDate) return '—';
        var p = String(isoDate).split('-');
        return p.length === 3 ? p[2] + '/' + p[1] : String(isoDate);
    }

    function jourMoisAnneeISO(isoDate) {
        if (!isoDate) return '—';
        var p = String(isoDate).split('-');
        return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(isoDate);
    }

    function diffJours(a, b) {
        var da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
        return Math.round((db - da) / 86400000);
    }

    function ajouterJours(isoDate, n) {
        var d = new Date(isoDate + 'T00:00:00');
        d.setDate(d.getDate() + n);
        return iso(d);
    }

    // ------------------------------------------------------------------ divers

    function arrondi(x, d) {
        if (!estNombre(x)) return 0;
        var f = Math.pow(10, d === undefined ? 2 : d);
        return Math.round(x * f) / f;
    }

    function echapper(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function debounce(fn, ms) {
        var t = null;
        return function () {
            var args = arguments, self = this;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
        };
    }

    function clone(o) { return o === null || o === undefined ? o : JSON.parse(JSON.stringify(o)); }

    function somme(liste, f) {
        var t = 0;
        for (var i = 0; i < (liste || []).length; i++) t += f ? f(liste[i]) : liste[i];
        return t;
    }

    function vider(obj) { for (var k in obj) if (obj.hasOwnProperty(k)) delete obj[k]; }

    /* Un réglage peut arriver d'un <select> (chaîne « true » / « false »),
       de la table Config (idem) ou du code (booléen). */
    function estVrai(v) {
        if (v === true || v === 1) return true;
        var s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'oui' || s === 'yes';
    }

    PF.util = {
        estNombre: estNombre, num: num, nombre: nombre, signe: signe,
        usd: usd, eur: eur, pct: pct, pctSigne: pctSigne, points: points,
        tauxPlausible: tauxPlausible, inflationDepuisTable: inflationDepuisTable,
        quantite: quantite, fleche: fleche, flecheTexte: flecheTexte,
        parseDate: parseDate, iso: iso, todayISO: todayISO, jourMois: jourMois,
        jourMoisAnnee: jourMoisAnnee, jourMoisAnneeISO: jourMoisAnneeISO,
        diffJours: diffJours, ajouterJours: ajouterJours,
        arrondi: arrondi, echapper: echapper, debounce: debounce, clone: clone,
        somme: somme, vider: vider, estVrai: estVrai, SEUIL_STABLE: SEUIL_STABLE
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
