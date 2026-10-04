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
        return s + nombre(x, d) + ' $';
    }

    function eur(x, opts) {
        opts = opts || {};
        var d = opts.dec === undefined ? 2 : opts.dec;
        var s = opts.signe ? signe(x) : '';
        return s + nombre(x, d) + ' €';
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

    PF.util = {
        estNombre: estNombre, num: num, nombre: nombre, signe: signe,
        usd: usd, eur: eur, pct: pct, pctSigne: pctSigne, points: points,
        quantite: quantite, fleche: fleche, flecheTexte: flecheTexte,
        parseDate: parseDate, iso: iso, todayISO: todayISO, jourMois: jourMois,
        jourMoisAnnee: jourMoisAnnee, jourMoisAnneeISO: jourMoisAnneeISO,
        diffJours: diffJours, ajouterJours: ajouterJours,
        arrondi: arrondi, echapper: echapper, debounce: debounce, clone: clone,
        somme: somme, vider: vider, SEUIL_STABLE: SEUIL_STABLE
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
