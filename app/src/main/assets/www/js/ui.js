/* Composants d'interface : cartes, feuilles, graphiques, retours.
   Tout est construit en HTML/CSS natif — aucune bibliothèque, donc aucun
   téléchargement, et une animation qui reste fluide sur un vieux téléphone. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util;

    var fileAttenteToast = null;

    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

    function el(html) {
        var d = document.createElement('div');
        d.innerHTML = String(html).trim();
        return d.firstElementChild;
    }

    function h(s) { return U.echapper(s); }

    function toast(message) {
        var t = $('#toast');
        if (!t) return;
        t.textContent = message;
        t.classList.add('ouvert');
        clearTimeout(fileAttenteToast);
        fileAttenteToast = setTimeout(function () { t.classList.remove('ouvert'); }, 2600);
        if (typeof root.Native !== 'undefined' && root.Native.haptic) {
            try { root.Native.haptic(8); } catch (e) { /* pas de vibreur */ }
        }
    }

    // ------------------------------------------------------- affichage montants

    /* Convention du porteur : le dollar en blanc en haut, l'euro en bleu en dessous. */
    function montant(usdValeur, eurValeur, opts) {
        opts = opts || {};
        var clsU = 'montant-usd' + (opts.petit ? ' sm' : '');
        var clsE = 'montant-eur' + (opts.petit ? ' sm' : '');
        return '<div class="' + clsU + '">' + U.usd(usdValeur, { dec: opts.dec }) + '</div>'
            + '<div class="' + clsE + '">' + U.eur(eurValeur, { dec: opts.dec }) + '</div>';
    }

    function fleche(part, dec) {
        var f = U.fleche(part, dec);
        return '<span class="fleche ' + f.classe + '">' + h(f.texte) + '</span>';
    }

    function badge(texte, sorte) {
        return '<span class="badge ' + (sorte || 'mut') + '">' + h(texte) + '</span>';
    }

    // ---------------------------------------------------------------- feuille

    function feuille(options) {
        var voile = $('#voile'), f = $('#feuille');
        if (!f) return { fermer: function () { } };

        var html = '<div class="poignee"></div>';
        if (options.titre) html += '<h3>' + h(options.titre) + '</h3>';
        if (options.aide) html += '<div class="aide">' + options.aide + '</div>';
        html += options.corps || '';
        if (options.boutons && options.boutons.length) {
            html += '<div class="btn-row" style="margin-top:14px">';
            options.boutons.forEach(function (b, i) {
                html += '<button class="btn ' + (b.sorte || 'sec') + '" data-b="' + i + '">' + h(b.texte) + '</button>';
            });
            html += '</div>';
        }
        f.innerHTML = html;
        f.classList.add('ouvert');
        voile.classList.add('ouvert');

        function fermer() {
            f.classList.remove('ouvert');
            voile.classList.remove('ouvert');
            voile.onclick = null;
        }
        voile.onclick = fermer;

        $$('#feuille [data-b]').forEach(function (bouton) {
            bouton.addEventListener('click', function () {
                var b = options.boutons[Number(bouton.getAttribute('data-b'))];
                if (!b) return;
                if (b.garder !== true) fermer();
                if (typeof b.action === 'function') b.action(f);
            });
        });

        return { fermer: fermer, corps: f };
    }

    function confirmer(titre, message, texteOui, action) {
        return feuille({
            titre: titre,
            corps: '<div style="font-size:14px;color:var(--txt-2);margin-bottom:6px">' + message + '</div>',
            boutons: [
                { texte: 'Annuler', sorte: 'ghost' },
                { texte: texteOui || 'Confirmer', sorte: 'danger', action: action }
            ]
        });
    }

    function choix(titre, optionsListe, action) {
        var corps = '';
        optionsListe.forEach(function (o, i) {
            corps += '<button class="btn sec" data-c="' + i + '" style="margin-bottom:9px;text-align:left">'
                + (o.icone ? h(o.icone) + '  ' : '') + h(o.texte) + '</button>';
        });
        var f = feuille({
            titre: titre,
            corps: corps,
            boutons: [{ texte: 'Annuler', sorte: 'ghost' }]
        });
        $$('#feuille [data-c]').forEach(function (bouton) {
            bouton.addEventListener('click', function () {
                var o = optionsListe[Number(bouton.getAttribute('data-c'))];
                f.fermer();
                if (o) action(o);
            });
        });
        return f;
    }

    // -------------------------------------------------------------- graphique

    function chemin(points, largeur, hauteur, marge) {
        var d = '';
        points.forEach(function (p, i) {
            d += (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ',' + p[1].toFixed(2) + ' ';
        });
        return d;
    }

    /* Courbe simple et lisible : aire dégradée + trait doré + dernier point. */
    function graphique(valeurs, options) {
        options = options || {};
        var largeur = 320, hauteur = 160, margeB = 18, margeH = 12;
        var n = (valeurs || []).length;
        if (n < 2) {
            return '<div class="vide" style="padding:26px 0"><span class="g">◢</span>Pas encore assez d’historique.</div>';
        }
        var min = Math.min.apply(null, valeurs), max = Math.max.apply(null, valeurs);
        if (max === min) { max = min + Math.abs(min) * 0.02 + 1; min = min - Math.abs(min) * 0.02 - 1; }
        var marge = (max - min) * 0.12;
        min -= marge; max += marge;

        var pts = valeurs.map(function (v, i) {
            var x = (i / (n - 1)) * (largeur - 2);
            var y = margeH + (1 - (v - min) / (max - min)) * (hauteur - margeH - margeB);
            return [x, y];
        });

        var d = chemin(pts);
        var aire = d + 'L' + pts[n - 1][0].toFixed(2) + ',' + (hauteur - margeB) + ' L0,' + (hauteur - margeB) + ' Z';
        var dernier = pts[n - 1];
        var couleur = options.couleur || 'var(--gold)';
        if (options.couleurSelonSens) {
            couleur = valeurs[n - 1] >= valeurs[0] ? 'var(--up)' : 'var(--down)';
        }

        var svg = '<svg class="graphique" viewBox="0 0 ' + largeur + ' ' + hauteur + '" preserveAspectRatio="none">'
            + '<defs><linearGradient id="degradeAire" x1="0" y1="0" x2="0" y2="1">'
            + '<stop offset="0%" stop-color="' + couleur + '" stop-opacity="0.28"/>'
            + '<stop offset="100%" stop-color="' + couleur + '" stop-opacity="0"/>'
            + '</linearGradient></defs>'
            + '<g class="grille">';
        for (var g = 0; g <= 3; g++) {
            var y = margeH + (g / 3) * (hauteur - margeH - margeB);
            svg += '<line x1="0" y1="' + y.toFixed(1) + '" x2="' + largeur + '" y2="' + y.toFixed(1) + '"/>';
        }
        svg += '</g>'
            + '<path class="aire" d="' + aire + '" fill="url(#degradeAire)"/>'
            + '<path class="trait" d="' + d + '" style="stroke:' + couleur + '" vector-effect="non-scaling-stroke"/>'
            + '<circle cx="' + dernier[0].toFixed(2) + '" cy="' + dernier[1].toFixed(2) + '" r="3.4" fill="' + couleur + '"/>'
            + '</svg>';
        return svg;
    }

    /* Barres empilées de répartition (cible vs réel). */
    function repartition(parties) {
        var total = parties.reduce(function (s, p) { return s + Math.max(0, p.valeur); }, 0);
        if (total <= 0) return '';
        var html = '<div style="display:flex;height:12px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.06)">';
        parties.forEach(function (p) {
            var w = (Math.max(0, p.valeur) / total) * 100;
            html += '<div style="width:' + w.toFixed(2) + '%;background:' + (p.couleur || 'var(--gold') + '"></div>';
        });
        html += '</div><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:9px">';
        parties.forEach(function (p) {
            html += '<div style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--txt-2)">'
                + '<span style="width:8px;height:8px;border-radius:3px;background:' + (p.couleur || 'var(--gold)') + '"></span>'
                + h(p.nom) + ' <b style="color:var(--txt)">' + U.pct(total > 0 ? Math.max(0, p.valeur) / total : 0, 1) + '</b></div>';
        });
        html += '</div>';
        return html;
    }

    function champ(opts) {
        var id = opts.id || ('c' + Math.random().toString(36).slice(2, 8));
        var valeur = opts.valeur === undefined || opts.valeur === null ? '' : opts.valeur;
        var corps;
        if (opts.type === 'select') {
            corps = '<select id="' + id + '">' + (opts.options || []).map(function (o) {
                var v = typeof o === 'object' ? o.valeur : o;
                var t = typeof o === 'object' ? o.texte : o;
                return '<option value="' + h(v) + '"' + (String(v) === String(valeur) ? ' selected' : '') + '>' + h(t) + '</option>';
            }).join('') + '</select>';
        } else {
            corps = '<input id="' + id + '" type="' + (opts.type || 'text') + '" value="' + h(valeur) + '"'
                + (opts.type === 'number' ? ' inputmode="decimal" step="any"' : '')
                + (opts.placeholder ? ' placeholder="' + h(opts.placeholder) + '"' : '') + '>';
        }
        return '<div class="champ"><label for="' + id + '">' + h(opts.label) + '</label>' + corps + '</div>';
    }

    function lire(id) {
        var e = document.getElementById(id);
        if (!e) return null;
        return e.value;
    }

    function lireNum(id, defaut) {
        var v = lire(id);
        if (v === null || v === '') return defaut === undefined ? 0 : defaut;
        var n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
        return isFinite(n) ? n : (defaut === undefined ? 0 : defaut);
    }

    function accordeon(titre, contenu, ouvert, sousTitre) {
        return '<div class="accordeon' + (ouvert ? ' ouvert' : '') + '" data-acc>'
            + '<div class="tete"><span style="font-size:16px">' + (ouvert ? '' : '') + '</span>'
            + '<span class="p">' + h(titre) + (sousTitre ? '<div style="font-size:11.5px;color:var(--txt-3);font-weight:500">'
                + sousTitre + '</div>' : '') + '</span><span class="chev">›</span></div>'
            + '<div class="corps">' + contenu + '</div></div>';
    }

    function lierAccordeons(conteneur) {
        Array.prototype.slice.call((conteneur || document).querySelectorAll('[data-acc] .tete'))
            .forEach(function (tete) {
                if (tete.dataset.lie === '1') return;
                tete.dataset.lie = '1';
                tete.addEventListener('click', function () {
                    tete.parentNode.classList.toggle('ouvert');
                    if (typeof root.Native !== 'undefined' && root.Native.haptic) {
                        try { root.Native.haptic(6); } catch (e) { /* pas de vibreur */ }
                    }
                });
            });
    }

    PF.ui = {
        $: $, $$: $$, el: el, h: h, toast: toast,
        montant: montant, fleche: fleche, badge: badge,
        feuille: feuille, confirmer: confirmer, choix: choix,
        graphique: graphique, repartition: repartition,
        champ: champ, lire: lire, lireNum: lireNum,
        accordeon: accordeon, lierAccordeons: lierAccordeons
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
