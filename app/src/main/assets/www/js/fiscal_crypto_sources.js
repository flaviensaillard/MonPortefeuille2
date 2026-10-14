/* DGFiP : FAQ crypto privée courante, preuve PARTIELLE et NON millésimée.
   Lue pour préparer le contrôle des cessions 2025, jamais pour activer le taux
   PS dans la simulation : la FAQ ne rattache pas son PFU actuel à 2025. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var URL = 'https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques';
    var CLE = 'pf2.dgfip.crypto.faq.v1.';

    function texte(html) {
        var entites = { nbsp: ' ', euro: '€', rsquo: '’', lsquo: '‘', eacute: 'é',
            egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç',
            ocirc: 'ô', ugrave: 'ù', amp: '&', apos: "'" };
        return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&(?:#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (e) {
                var key = e.slice(1, -1).toLowerCase();
                if (key[0] !== '#') return entites[key] || ' ';
                var cp = key[1] === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
                return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : ' ';
            }).replace(/\s+/g, ' ').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    function taux(s) { return Math.round(Number(s.replace(',', '.')) * 100) / 10000; }
    function analyser(html) {
        var t = texte(html);
        var date = t.match(/modifie le\s+(\d{2}\/\d{2}\/\d{4})/i);
        var debut = t.search(/Vous vendez a titre particulier/i);
        var fin = t.search(/Declaration en ligne \(cessions realisees a titre particulier\)/i);
        if (!date || Number(date[1].slice(-4)) < 2026 || debut < 0 || fin < debut)
            return { etat: 'FAQ, date ou section crypto privée non reconnue' };
        var section = t.slice(debut, fin);
        // Le texte « depuis 2023 » concerne la distinction privé/pro ; il ne
        // donne PAS l'année d'effet du PFU affiché sur cette page courante.
        var pfu = section.match(/patrimoine prive[^.]{0,200}?PFU\)? de\s+(\d{1,2}[,.]\d)\s*%\s*\(\s*(\d{1,2}[,.]\d)\s*% d.impot\s*\+\s*(\d{1,2}[,.]\d)\s*% de prelevements sociaux\s*\)/i);
        var option = section.match(/coch(?:ez|er) la case\s*3CN[\s\S]{0,240}?independante de celle qui concerne les revenus de capitaux mobiliers/i);
        var franchise = section.match(/somme des prix de cession[^.]{0,220}?hors operation d.echange en sursis d.imposition[^.]{0,100}?n.excede pas\s*(\d{2,4})\s*€/i);
        var annexe = t.slice(fin, fin + 1800).match(/annexe n[°o]?\s*2086[\s\S]{0,480}?case\s*3AN\s*\(plus.value\)\s*ou\s*3BN\s*\(moins.value\)/i);
        if (!pfu || !option || !franchise || !annexe)
            return { etat: 'preuves FAQ crypto incomplètes (PFU=' + !!pfu + ', 3CN=' + !!option
                + ', seuil=' + !!franchise + ', 2086=' + !!annexe + ')' };
        var valeurs = { pfuCourant: taux(pfu[1]), irCourant: taux(pfu[2]), psCourant: taux(pfu[3]),
            seuilCourant: Number(franchise[1]), dateModification: date[1], anneeRevenusAttestee: null };
        if (valeurs.irCourant < .05 || valeurs.irCourant > .35 || valeurs.psCourant < .1
            || valeurs.psCourant > .3 || Math.abs(valeurs.pfuCourant - valeurs.irCourant - valeurs.psCourant) > .000001
            || valeurs.seuilCourant < 100 || valeurs.seuilCourant > 1000)
            return { etat: 'PFU ou franchise FAQ incohérents' };
        var extrait = 'modifie le ' + date[1] + ' Vous vendez a titre particulier '
            + pfu[0] + '. ' + option[0] + '. ' + franchise[0] + '. '
            + 'Declaration en ligne (cessions realisees a titre particulier) ' + annexe[0] + '.';
        return { etat: 'FAQ crypto privée actuelle : année des cessions non attestée, taux non activé',
            valeurs: valeurs, extrait: extrait };
    }
    function compte() {
        var u = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        return u && /^[a-f\d-]{36}$/i.test(u.id || '') ? u.id : null;
    }
    function lireCache() {
        var id = compte();
        if (!id || !root.localStorage) return null;
        try {
            var historique = JSON.parse(root.localStorage.getItem(CLE + id) || '[]');
            var dernier = Array.isArray(historique) && historique[historique.length - 1];
            var analyse = dernier && dernier.url === URL && analyser(dernier.extrait);
            return analyse && analyse.valeurs || null;
        } catch (_) { return null; }
    }
    function chercher(annee) {
        if (!Number.isInteger(annee) || annee < 2023 || annee > new Date().getFullYear())
            return Promise.reject(new Error('Année de consultation crypto invalide.'));
        var id = compte();
        if (!id) return Promise.reject(new Error('Session requise pour la consultation crypto.'));
        if (annee !== 2025) return Promise.resolve({ etat: 'FAQ crypto actuelle non attribuable à ce millésime',
            enregistree: false, url: null });
        return PF.net.req('GET', URL, { Accept: 'text/html' }).then(function (rep) {
            var analyse = rep.ok && rep.body ? analyser(rep.body) : null;
            var etat = analyse ? analyse.etat : 'document inaccessible';
            if (compte() !== id) throw new Error('Session changée : consultation crypto annulée.');
            if (!root.localStorage || !analyse || !analyse.valeurs)
                return { etat: etat, enregistree: false, url: URL };
            if (!analyser(analyse.extrait).valeurs)
                return { etat: 'preuve FAQ crypto insuffisante pour relecture', enregistree: false, url: URL };
            var cle = CLE + id, historique;
            try { historique = JSON.parse(root.localStorage.getItem(cle) || '[]'); }
            catch (_) { historique = []; }
            if (!Array.isArray(historique)) historique = [];
            var dernier = historique[historique.length - 1];
            if (!dernier || dernier.extrait !== analyse.extrait)
                historique.push({ url: URL, extrait: analyse.extrait, revision: historique.length + 1,
                    consulte_pour: 2025, annee_revenus_attestee: null, recupere_le: new Date().toISOString() });
            try { root.localStorage.setItem(cle, JSON.stringify(historique)); }
            catch (_) { return { etat: etat, enregistree: false, url: URL }; }
            return { etat: etat, enregistree: true, valeurs: lireCache(), url: URL,
                publication: analyse.valeurs.dateModification };
        }).catch(function (err) {
            if (err && /Session changée/.test(err.message || '')) throw err;
            return { etat: 'document inaccessible', enregistree: false, url: URL };
        });
    }
    PF.fiscalCryptoSources = { analyser: analyser, lireCache: lireCache, chercher: chercher, url: URL };
})(typeof globalThis !== 'undefined' ? globalThis : this);
