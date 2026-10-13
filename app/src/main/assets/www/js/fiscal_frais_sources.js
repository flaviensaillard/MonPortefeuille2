/* DGFiP : lecture prudente des barèmes des salariés (année de revenus explicite).
   Cache local par compte : aucune modification SQL ni transfert de données privées. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var REPAS = 'https://www.impots.gouv.fr/particulier/frais-de-repas';
    var KM = function (annee) { return 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/' + (annee + 1) + '/aides/frais.htm'; };
    var CLE = 'pf2.frais.officiels.v1.';

    function nettoyer(html) {
        return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
            .replace(/&[a-z]+;|&#\d+;/gi, function (entite) {
                return ({ '&eacute;': 'é', '&egrave;': 'è', '&agrave;': 'à', '&rsquo;': '’',
                    '&times;': '×', '&euro;': '€', '&amp;': '&' })[entite.toLowerCase()] || ' ';
            }).replace(/\s+/g, ' ').trim();
    }
    var PREUVE_REPAS = /Pour l.imposition des revenus\s+\d{4},?\s+la valeur d.un repas pris au foyer est de\s+\d{1,2}[,.]\d{2}\s*€/i;
    function euros(s) { return Number(String(s).replace(/\s/g, '').replace(',', '.')); }
    function lireRepas(html, annee) {
        var t = nettoyer(html);
        var re = new RegExp('Pour l.imposition des revenus\\s+' + annee
            + ',?\\s+la valeur d.un repas pris au foyer est de\\s+(\\d{1,2}[,.]\\d{2})\\s*€', 'i');
        var m = t.match(re), v = m && euros(m[1]);
        return v >= 1 && v <= 30 ? v : null;
    }
    function lireKm(html, annee) {
        var t = nettoyer(html);
        // Le répertoire /2027 concerne la déclaration 2027, PAS les revenus
        // 2027. Refuser une page 2027 qui contiendrait encore les revenus 2025.
        if (!new RegExp('Pour les revenus perçus en\\s+' + annee + '\\b', 'i').test(t) ||
            !/Tarif\s*:\s*automobiles/i.test(t) ||
            !/5\s*000\s*km/i.test(t) || !/20\s*000\s*km/i.test(t) ||
            !/100\s*%\s*électriques[^.]{0,180}20\s*%/i.test(t)) return null;
        var rows = String(html).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
        var bareme = {};
        rows.forEach(function (row) {
            var cols = [], matches, re = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
            while ((matches = re.exec(row))) cols.push(nettoyer(matches[1]));
            if (cols.length !== 4) return;
            var cv = /^3\s*CV\s*et\s*moins$/i.test(cols[0]) ? 3
                : /^([456])\s*CV$/i.test(cols[0]) ? Number(cols[0].match(/[456]/)[0])
                : /^7\s*CV\s*et\s*plus$/i.test(cols[0]) ? 7 : null;
            if (!cv || bareme[cv]) return;
            var a = cols[1].match(/d\s*[x×*]\s*(0[,.]\d{2,3})/i);
            var b = cols[2].match(/\(?\s*d\s*[x×*]\s*(0[,.]\d{2,3})\s*\)?\s*\+\s*([\d\s]{3,6})/i);
            var c = cols[3].match(/d\s*[x×*]\s*(0[,.]\d{2,3})/i);
            if (!a || !b || !c) return;
            var f = [euros(a[1]), euros(b[1]), euros(b[2]), euros(c[1])];
            if (f.some(function (x, i) { return !isFinite(x) || x <= 0 || x > (i === 2 ? 10000 : 2); }) ||
                Math.abs(5000 * f[0] - (5000 * f[1] + f[2])) > 50 ||
                Math.abs(20000 * f[3] - (20000 * f[1] + f[2])) > 50) return;
            bareme[cv] = f;
        });
        return Object.keys(bareme).length === 5 ? bareme : null;
    }
    function compteActuel() {
        var u = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        return u && /^[a-f0-9-]{36}$/i.test(u.id || '') ? u.id : null;
    }
    function lireCache(annee) {
        var id = compteActuel();
        if (!id || !root.localStorage) return null;
        try {
            var data = JSON.parse(root.localStorage.getItem(CLE + id) || '{}');
            var revisions = data[annee], r = Array.isArray(revisions) && revisions[revisions.length - 1];
            if (!r || r.annee !== annee) return null;
            return {
                annee: annee,
                repas: r.repas && r.repas.url === REPAS && lireRepas(r.repas.extrait, annee),
                km: r.km && r.km.url === KM(annee) && lireKm(r.km.extrait, annee)
            };
        } catch (_) { return null; }
    }
    function chercher(annee) {
        if (!Number.isInteger(annee) || annee < 2025 || annee > new Date().getFullYear())
            return Promise.reject(new Error('Millésime de frais invalide.'));
        var id = compteActuel();
        if (!id) return Promise.reject(new Error('Session requise pour la collecte des frais.'));
        var urls = { repas: REPAS, km: KM(annee) }, etats = {}, resultats = {};
        return Promise.all(Object.keys(urls).map(function (type) {
            return PF.net.req('GET', urls[type], { Accept: 'text/html' }).then(function (rep) {
                if (!rep.ok || !rep.body) { etats[type] = 'source officielle inaccessible'; return; }
                var v = type === 'repas' ? lireRepas(rep.body, annee) : lireKm(rep.body, annee);
                if (v === null) { etats[type] = 'millésime absent ou format incompatible'; return; }
                etats[type] = 'valeur explicite trouvée';
                // Ne pas stocker tout le HTML officiel : seuls les extraits ayant
                // passé le contrôle sont conservés pour revalidation à la lecture.
                var t = type === 'repas' ? nettoyer(rep.body).match(PREUVE_REPAS)
                    : String(rep.body).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi);
                resultats[type] = { url: urls[type], extrait: type === 'repas' ? t && t[0] :
                    'Pour les revenus perçus en ' + annee + ' ; Tarif : automobiles ; Jusqu’à 5 000 km ; De 5001 à 20 000 km ; véhicule 100 % électriques majoré de 20 % ' +
                    (t || []).filter(function (row) { return /(?:3\s*CV\s*et\s*moins|[456]\s*CV|7\s*CV\s*et\s*plus)/i.test(nettoyer(row)); }).join(' ') };
            }).catch(function () { etats[type] = 'source officielle inaccessible'; });
        })).then(function () {
            if (compteActuel() !== id) throw new Error('Session changée : collecte des frais annulée.');
            if (!root.localStorage) return { etats: etats, enregistree: false };
            var cle = CLE + id, historique;
            try { historique = JSON.parse(root.localStorage.getItem(cle) || '{}'); }
            catch (_) { historique = {}; }
            var nouveau = { annee: annee, repas: resultats.repas || null, km: resultats.km || null };
            var revisions = Array.isArray(historique[annee]) ? historique[annee] : [];
            var ancien = revisions.length ? revisions[revisions.length - 1] : null;
            if (!ancien || JSON.stringify({ repas: ancien.repas, km: ancien.km }) !==
                JSON.stringify({ repas: nouveau.repas, km: nouveau.km })) {
                nouveau.revision = revisions.length + 1;
                nouveau.recupere_le = new Date().toISOString();
                revisions.push(nouveau);
            }
            historique[annee] = revisions;
            try { root.localStorage.setItem(cle, JSON.stringify(historique)); }
            catch (_) { return { etats: etats, enregistree: false }; }
            return { etats: etats, enregistree: true, valeurs: lireCache(annee) };
        });
    }
    PF.fiscalFraisSources = { chercher: chercher, lireCache: lireCache, lireRepas: lireRepas, lireKm: lireKm,
        REPAS: REPAS, KM: KM };
})(typeof globalThis !== 'undefined' ? globalThis : this);
