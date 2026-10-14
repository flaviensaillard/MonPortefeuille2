/* Barèmes DGFiP (BOFiP). Aucun chiffre OpenFisca n'est utilisé ici.
   Données publiques seules ; cache local millésimé, vérifié à la relecture. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var BASE = 'https://bofip.impots.gouv.fr';
    var CLE = 'pf2.dgfip.boi.v1.';
    var DATES = { 2023: '20240618', 2024: '20250414', 2025: '20260407' };
    var DOCS = {
        ir: ['2491', 'BOI-IR-LIQ-20-10'],
        decote: ['2495', 'BOI-IR-LIQ-20-20-30'],
        qf: ['2494', 'BOI-IR-LIQ-20-20-20']
    };
    function url(nom, annee) {
        var d = DOCS[nom];
        if (!d) return null;
        return DATES[annee]
            ? BASE + '/bofip/' + d[0] + '-PGP.html/identifiant=' + d[1] + '-' + DATES[annee]
            : BASE + '/doctrine/' + d[1]; // dernière version, redirection même hôte uniquement
    }
    function texte(html) {
        return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;|&#8239;/gi, ' ')
            .replace(/&[a-z]+;|&#\d+;/gi, function (e) {
                return ({ '&euro;': '€', '&rsquo;': '’', '&eacute;': 'é', '&egrave;': 'è',
                    '&agrave;': 'à', '&ecirc;': 'ê', '&amp;': '&' })[e.toLowerCase()] || ' ';
            }).replace(/\s+/g, ' ').trim();
    }
    function montant(s) { return Number(String(s).replace(/\s/g, '').replace(',', '.')); }
    function borne(x) { return Number.isInteger(x) && x > 1000 && x < 1000000; }
    function tableauIr(html, annee) {
        var t = texte(html), marque = new RegExp('barème pour l.imposition des revenus de l.année\\s+' + annee
            + '\\s+est présenté dans le tableau suivant', 'i');
        if (!marque.test(t) || !/Identifiant juridique\s*:\s*BOI-IR-LIQ-20-10/i.test(t)) return null;
        // Le titre peut être fragmenté par des balises HTML ; le texte normalisé
        // prouve l'année, puis chaque tableau est contrôlé indépendamment.
        var tables = String(html).match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) || [];
        for (var k = 0; k < tables.length; k++) {
            var rows = tables[k].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
            var seuils = [], taux = [];
            rows.forEach(function (r) {
                var cellules = [], m, re = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
                while ((m = re.exec(r))) cellules.push(texte(m[1]));
                if (cellules.length !== 2) return;
                var percent = cellules[1].match(/^\s*(0|11|30|41|45)\s*%\s*$/);
                if (!percent) return;
                var montants = cellules[0].match(/[\d\s]{4,10}\s*€/g) || [];
                var borneLigne = montants.length ? montant(montants[montants.length - 1].replace('€', '')) : null;
                if (Number(percent[1]) === 45) { if (/Supérieure à/i.test(cellules[0])) taux.push(.45); }
                else if (borne(borneLigne)) { seuils.push(borneLigne); taux.push(Number(percent[1]) / 100); }
            });
            if (seuils.length === 4 && taux.join(',') === '0,0.11,0.3,0.41,0.45' &&
                seuils.every(function (x, i) { return !i || x > seuils[i - 1]; }))
                return { tranches: seuils, taux: taux.slice(1) };
        }
        return null;
    }
    function decote(html, annee) {
        var t = texte(html);
        if (!/Identifiant juridique\s*:\s*BOI-IR-LIQ-20-20-30/i.test(t)) return null;
        var re = new RegExp('Pour l.imposition des revenus de\\s+' + annee
            + ',\\s+cette décote est accordée[^.]{0,600}?inférieure à\\s+([\\d\\s]+)\\s*€'
            + '[^.]{0,200}?à\\s+([\\d\\s]+)\\s*€[^.]{0,250}?45[,.]25\\s*%\\s+de\\s+([\\d\\s]+)\\s*€'
            + '[^.]{0,100}?45[,.]25\\s*%\\s+de\\s+([\\d\\s]+)\\s*€', 'i');
        var m = t.match(re);
        if (!m) return null;
        var v = m.slice(1).map(montant);
        if (v.some(function (x) { return !Number.isInteger(x) || x < 100 || x > 10000; }) || Math.abs(v[0] - v[2] / .4525) > 3 ||
            Math.abs(v[1] - v[3] / .4525) > 3) return null;
        return { dcPlafond: v[0], dcPlafondCouple: v[1], dc: v[2], dcCouple: v[3], taux: .4525 };
    }
    function qf(html, annee) {
        var t = texte(html);
        if (!/Identifiant juridique\s*:\s*BOI-IR-LIQ-20-20-20/i.test(t)) return null;
        var m = t.match(new RegExp('Son montant est fixé à\\s+([\\d\\s]+)\\s*€\\s+par demi-part supplémentaire à compter de l.imposition des revenus de l.année\\s+' + annee, 'i'));
        var v = m && montant(m[1]);
        return borne(v) && v < 10000 ? v : null;
    }
    var PARSE = { ir: tableauIr, decote: decote, qf: qf };
    function compte() {
        var u = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        return u && /^[a-f\d-]{36}$/i.test(u.id || '') ? u.id : null;
    }
    function lireCache(annee) {
        var id = compte();
        if (!id || !root.localStorage) return null;
        try {
            var data = JSON.parse(root.localStorage.getItem(CLE + id) || '{}');
            var liste = data[annee], r = Array.isArray(liste) && liste[liste.length - 1];
            if (!r || r.annee !== annee) return null;
            var valeurs = { sources: {} };
            Object.keys(DOCS).forEach(function (nom) {
                var p = r[nom];
                if (p && p.url === url(nom, annee)) {
                    valeurs[nom] = PARSE[nom](p.extrait, annee);
                    if (valeurs[nom] !== null) valeurs.sources[nom] = { url: p.permalien || p.url, datePublication: p.datePublication };
                }
            });
            return valeurs;
        } catch (_) { return null; }
    }
    function chercher(annee) {
        if (!Number.isInteger(annee) || annee < 2023 || annee > new Date().getFullYear())
            return Promise.reject(new Error('Millésime DGFiP invalide.'));
        var id = compte();
        if (!id) return Promise.reject(new Error('Session requise pour la collecte DGFiP.'));
        var etats = {}, donnees = {};
        return Promise.all(Object.keys(DOCS).map(function (nom) {
            return PF.net.req('GET', url(nom, annee), { Accept: 'text/html' }).then(function (rep) {
                if (!rep.ok || !rep.body) { etats[nom] = 'document inaccessible'; return; }
                var v = PARSE[nom](rep.body, annee);
                if (annee >= 2026 && !/Date de début de publication du BOI\s*:\s*\d{2}\/\d{2}\/\d{4}/i.test(texte(rep.body))) v = null;
                if (v === null) { etats[nom] = 'année absente ou format non reconnu'; return; }
                etats[nom] = 'valeur du millésime trouvée';
                // Conserver seulement l'extrait utile, jamais le HTML complet.
                var t = texte(rep.body), fragment;
                if (nom === 'ir') {
                    var m = String(rep.body).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
                    fragment = 'Identifiant juridique : BOI-IR-LIQ-20-10. Le barème pour l’imposition des revenus de l’année '
                        + annee + ' est présenté dans le tableau suivant : <table>' + m.filter(function (row) {
                            return /(?:N.exc.dant|Supérieure)/i.test(texte(row));
                        }).join(' ') + '</table>';
                } else {
                    var re = nom === 'decote' ? new RegExp('Pour l.imposition des revenus de\\s+' + annee + '[^.]{0,620}', 'i')
                        : new RegExp('Son montant est fixé à\\s+[\\d\\s]+€\\s+par demi-part supplémentaire à compter de l.imposition des revenus de l.année\\s+' + annee, 'i');
                    var match = t.match(re);
                    fragment = 'Identifiant juridique : ' + DOCS[nom][1] + '. ' + (match ? match[0] : '');
                }
                var pub = t.match(/Date de début de publication du BOI\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
                var dateBoi = pub ? pub[1].split('/').reverse().join('') : DATES[annee];
                donnees[nom] = { url: url(nom, annee), extrait: fragment,
                    permalien: dateBoi ? BASE + '/bofip/' + DOCS[nom][0] + '-PGP.html/identifiant='
                        + DOCS[nom][1] + '-' + dateBoi : url(nom, annee),
                    datePublication: pub ? pub[1] : DATES[annee] ? DATES[annee].slice(6, 8) + '/'
                        + DATES[annee].slice(4, 6) + '/' + DATES[annee].slice(0, 4) : 'date non vérifiée' };
                etats[nom] += ' (' + donnees[nom].datePublication + ')';
            }).catch(function () { etats[nom] = 'document inaccessible'; });
        })).then(function () {
            if (compte() !== id) throw new Error('Session changée : collecte DGFiP annulée.');
            if (!root.localStorage) return { etats: etats, enregistree: false };
            var cle = CLE + id, data;
            try { data = JSON.parse(root.localStorage.getItem(cle) || '{}'); } catch (_) { data = {}; }
            var prochain = { annee: annee }, versions = Array.isArray(data[annee]) ? data[annee] : [];
            Object.keys(DOCS).forEach(function (nom) { prochain[nom] = donnees[nom] || null; });
            var ancien = versions[versions.length - 1];
            if (!ancien || Object.keys(DOCS).some(function (nom) {
                return JSON.stringify(ancien[nom]) !== JSON.stringify(prochain[nom]);
            })) {
                prochain.revision = versions.length + 1;
                prochain.recupere_le = new Date().toISOString();
                versions.push(prochain);
            }
            data[annee] = versions;
            try { root.localStorage.setItem(cle, JSON.stringify(data)); }
            catch (_) { return { etats: etats, enregistree: false }; }
            return { etats: etats, enregistree: true, valeurs: lireCache(annee) };
        });
    }
    PF.fiscalDgfipSources = { chercher: chercher, lireCache: lireCache, tableauIr: tableauIr,
        decote: decote, qf: qf, url: url, texte: texte };
})(typeof globalThis !== 'undefined' ? globalThis : this);
