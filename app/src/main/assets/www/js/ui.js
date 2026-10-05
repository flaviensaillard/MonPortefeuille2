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

    var graphiques = {};
    var nbGraphiques = 0;

    /* Étiquettes d'axe : 12 k$, 1,25 M$ — jamais « 1234567.89 $ ». */
    function montantCourt(x, unite) {
        var u = unite || '$';
        var a = Math.abs(x);
        if (!isFinite(x)) return '—';
        if (a >= 1e9) return U.nombre(x / 1e9, 2) + ' Md' + u;
        if (a >= 1e6) return U.nombre(x / 1e6, 2) + ' M' + u;
        if (a >= 1e3) return U.nombre(x / 1e3, 0) + ' k' + u;
        return U.nombre(x, 0) + ' ' + u;
    }

    /* Enregistre un graphique ; le tracé est fait par `lierGraphiques`, une fois
       le conteneur monté et mesuré (un SVG ne connaît pas sa largeur avant). */
    function graphique(series, options) {
        options = options || {};
        var liste = Array.isArray(series) ? series.slice() : [series];
        if (liste.length && typeof liste[0] === 'number') liste = [{ nom: '', valeurs: liste }];
        liste = liste.filter(function (s) { return s && s.valeurs && s.valeurs.length >= 2; });
        if (!liste.length) {
            return '<div class="vide" style="padding:26px 0"><span class="g">◢</span>Pas encore assez d’historique.</div>';
        }
        var id = 'g' + (++nbGraphiques);
        graphiques[id] = {
            series: liste.map(function (s) {
                return {
                    nom: s.nom || '',
                    valeurs: (s.valeurs || []).slice(),
                    dates: (s.dates || []).slice(),
                    couleur: s.couleur || null
                };
            }),
            options: options
        };
        return '<div class="graph" data-graph="' + id + '" style="height:' + (options.hauteur || 186) + 'px"></div>';
    }

    /* Un graphique se lit : axe gradué et étiqueté, dates, et au toucher la
       valeur du point visé. C'est ce qui manquait : une courbe sans échelle
       n'est pas une information, c'est un dessin. */
    function lierGraphiques(conteneur) {
        var zones = Array.prototype.slice.call((conteneur || document).querySelectorAll('[data-graph]'));
        zones.forEach(function (zone) {
            if (zone.dataset.lie !== '1') dessinerGraphique(zone);
        });
    }

    /* Borne haute « ronde » : 1, 2, 2,5 ou 5 fois une puissance de dix. Une
       graduation qui tombe juste se lit ; 2 347 811 € ne se lit pas. */
    function echelleHaute(max) {
        if (!(max > 0) || !isFinite(max)) return 1;
        var exp = Math.floor(Math.log(max) / Math.LN10);
        var base = Math.pow(10, exp);
        var n = max / base;
        var palier = n <= 1 ? 1 : (n <= 2 ? 2 : (n <= 2.5 ? 2.5 : (n <= 5 ? 5 : 10)));
        return palier * base;
    }

    function couleurSerie(i) {
        var pal = ['var(--gold)', 'var(--up)', 'var(--flat)', 'var(--down)'];
        return pal[i % pal.length];
    }

    function dessinerGraphique(zone) {
        zone.dataset.lie = '1';
        var id = zone.getAttribute('data-graph');
        var spec = graphiques[id];
        if (!spec) return;

        var largeur = Math.round(zone.clientWidth || (zone.getBoundingClientRect ? zone.getBoundingClientRect().width : 0) || 0);
        if (!largeur || largeur < 120) largeur = 320;
        var hauteur = parseInt(zone.style.height, 10) || 186;
        var padL = 54, padR = 12, padT = 16, padB = 24;
        var w = largeur - padL - padR, hZone = hauteur - padT - padB;
        if (w <= 20 || hZone <= 20) return;

        var series = spec.series, options = spec.options || {};
        var n = series[0].valeurs.length;
        var min = Infinity, max = -Infinity;
        series.forEach(function (s) {
            s.valeurs.forEach(function (v) {
                if (typeof v === 'number' && isFinite(v)) {
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
            });
        });
        if (!isFinite(min) || !isFinite(max)) return;
        if (max === min) { var ec = Math.abs(max) * 0.02 + 1; max += ec; min -= ec; }
        if (min >= 0) {
            // Un capital ne descend pas sous zéro : l'axe part de zéro et
            // s'arrête à une borne ronde, sinon la courbe est écrasée.
            min = 0;
            max = echelleHaute(max * 1.02);
        } else {
            var marge = (max - min) * 0.10;
            min -= marge; max += marge;
        }

        var couleurs = series.map(function (s, i) { return s.couleur || couleurSerie(i); });
        var dates = series[0].dates && series[0].dates.length === n ? series[0].dates : null;

        function px(i) { return padL + (n <= 1 ? w / 2 : (i / (n - 1)) * w); }
        function py(v) { return padT + (1 - (v - min) / (max - min)) * hZone; }

        var svg = '<svg width="' + largeur + '" height="' + hauteur + '" viewBox="0 0 ' + largeur + ' ' + hauteur + '">'
            + '<defs><linearGradient id="air' + id + '" x1="0" y1="0" x2="0" y2="1">'
            + '<stop offset="0%" stop-color="' + couleurs[0] + '" stop-opacity="0.30"/>'
            + '<stop offset="100%" stop-color="' + couleurs[0] + '" stop-opacity="0"/>'
            + '</linearGradient></defs>';

        // --- axe des ordonnates : quatre graduations, étiquetées
        var unite = options.unite || '$';
        for (var g = 0; g <= 3; g++) {
            var gy = padT + (g / 3) * hZone;
            var val = max - (g / 3) * (max - min);
            svg += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (padL + w) + '" y2="' + gy.toFixed(1)
                + '" stroke="rgba(255,255,255,.08)" stroke-width="1"/>'
                + '<text x="' + (padL - 7) + '" y="' + (gy + 3.4).toFixed(1) + '" text-anchor="end" '
                + 'font-size="9.5" fill="rgba(226,232,240,.55)">' + h(montantCourt(val, unite)) + '</text>';
        }

        // --- courbes
        series.forEach(function (s, i) {
            var d = s.valeurs.map(function (v, j) {
                return (j ? 'L' : 'M') + px(j).toFixed(1) + ',' + py(v).toFixed(1);
            }).join(' ');
            if (i === 0) {
                svg += '<path d="' + d + ' L' + px(n - 1).toFixed(1) + ',' + (padT + hZone) + ' L' + padL + ',' + (padT + hZone)
                    + ' Z" fill="url(#air' + id + ')" opacity="' + (series.length > 1 ? 0.12 : 1) + '"/>';
            }
            svg += '<path d="' + d + '" fill="none" stroke="' + couleurs[i] + '" stroke-width="2" '
                + 'stroke-linejoin="round" stroke-linecap="round"/>';
        });

        // --- axe des dates
        if (dates) {
            [[0, 'start'], [Math.floor((n - 1) / 2), 'middle'], [n - 1, 'end']].forEach(function (c) {
                var idx = c[0];
                if (idx < 0 || idx >= n) return;
                svg += '<text x="' + px(idx).toFixed(1) + '" y="' + (hauteur - 8) + '" text-anchor="' + c[1]
                    + '" font-size="9.5" fill="rgba(226,232,240,.5)">' + h(U.jourMoisAnneeISO(dates[idx])) + '</text>';
            });
        }

        // --- curseur de lecture
        svg += '<line class="gcross" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + hZone)
            + '" stroke="var(--txt-3)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>';
        series.forEach(function (s, i) {
            svg += '<circle class="gdot" r="4" fill="' + couleurs[i] + '" stroke="#0F1520" stroke-width="1.6" opacity="0"/>';
        });
        svg += '</svg>';

        var legende = '';
        var avecNom = series.filter(function (s) { return s.nom; });
        if (avecNom.length) {
            legende = '<div class="graph-legende">';
            series.forEach(function (s, i) {
                if (!s.nom) return;
                legende += '<span><i style="background:' + couleurs[i] + '"></i>' + h(s.nom) + '</span>';
            });
            legende += '</div>';
        }

        zone.style.position = 'relative';
        zone.innerHTML = '<div class="graph-svg">' + svg + '</div>'
            + '<div class="graph-touch" style="left:' + padL + 'px;top:' + padT + 'px;width:' + w + 'px;height:' + hZone + 'px"></div>'
            + '<div class="graph-bulle"></div>' + legende;

        var touch = zone.querySelector('.graph-touch');
        var bulle = zone.querySelector('.graph-bulle');
        var cross = zone.querySelector('.gcross');
        var points = Array.prototype.slice.call(zone.querySelectorAll('.gdot'));
        if (!touch) return;

        function valeur(v) {
            var dec = options.dec === undefined ? 0 : options.dec;
            var txt = '<b>' + h(U.usd(v, { dec: dec })) + '</b>';
            if (options.tauxEurUsd && options.tauxEurUsd > 0) {
                txt += '<i class="gb-e">' + h(U.eur(v / options.tauxEurUsd, { dec: dec })) + '</i>';
            }
            return txt;
        }

        function afficher(idx) {
            var cx = px(idx);
            cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('opacity', '1');
            var corps = dates ? '<div class="gb-d">' + h(U.jourMoisAnneeISO(dates[idx])) + '</div>' : '';
            series.forEach(function (s, i) {
                var v = s.valeurs[idx];
                if (points[i]) {
                    points[i].setAttribute('cx', cx);
                    points[i].setAttribute('cy', py(v));
                    points[i].setAttribute('opacity', '1');
                }
                corps += '<div class="gb-l' + (series.length > 1 ? '">' : ' seule">')
                    + (series.length > 1 ? '<i style="background:' + couleurs[i] + '"></i><span>' + h(s.nom) + '</span>' : '')
                    + valeur(v) + '</div>';
            });
            bulle.innerHTML = corps;
            bulle.style.display = 'block';
            var lb = bulle.offsetWidth || 128;
            bulle.style.left = Math.max(2, Math.min(largeur - lb - 2, cx - lb / 2)) + 'px';
            bulle.style.top = '2px';
        }

        function effacer() {
            cross.setAttribute('opacity', '0');
            points.forEach(function (p) { p.setAttribute('opacity', '0'); });
            bulle.style.display = 'none';
        }

        var actif = false, x0 = 0, y0 = 0, horizontal = false;
        function indice(clientX) {
            var r = touch.getBoundingClientRect();
            var f = (clientX - r.left) / (r.width || 1);
            f = Math.max(0, Math.min(1, f));
            return Math.round(f * (n - 1));
        }
        function debut(cx, cy) { actif = true; x0 = cx; y0 = cy; horizontal = false; afficher(indice(cx)); }
        function mouvement(cx, cy) {
            if (!actif) return;
            if (!horizontal) {
                if (Math.abs(cx - x0) > Math.abs(cy - y0) + 6) horizontal = true;
                else if (Math.abs(cy - y0) > 12) { actif = false; effacer(); return; }
            }
            if (horizontal) afficher(indice(cx));
        }
        function fin() { actif = false; horizontal = false; setTimeout(effacer, 2200); }

        touch.addEventListener('touchstart', function (e) {
            var t = e.touches[0];
            debut(t.clientX, t.clientY);
        }, { passive: true });
        touch.addEventListener('touchmove', function (e) {
            var t = e.touches[0];
            if (horizontal) { try { e.preventDefault(); } catch (err) { /* passif */ } }
            mouvement(t.clientX, t.clientY);
        }, { passive: false });
        touch.addEventListener('touchend', fin, { passive: true });
        touch.addEventListener('touchcancel', fin, { passive: true });
        touch.addEventListener('mousedown', function (e) { debut(e.clientX, e.clientY); });
        touch.addEventListener('mousemove', function (e) { mouvement(e.clientX, e.clientY); });
        touch.addEventListener('mouseleave', fin);
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
        graphique: graphique, lierGraphiques: lierGraphiques, montantCourt: montantCourt,
        echelleHaute: echelleHaute,
        repartition: repartition,
        champ: champ, lire: lire, lireNum: lireNum,
        accordeon: accordeon, lierAccordeons: lierAccordeons
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
