/* DGFiP : contrôle millésimé du seul régime des plus-values de titres.
   Le PFU des RCM, la crypto et la CSG sont des régimes distincts : ne jamais
   réutiliser ici le taux des titres pour les couvrir implicitement. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var CLE = 'pf2.dgfip.regimes.v1.';
    function url(annee) {
        return 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/' + (annee + 1) + '/aides/gains.htm';
    }
    function texte(html) {
        return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&(?:#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (e) {
                var key = e.slice(1, -1).toLowerCase();
                var noms = { nbsp: ' ', euro: '€', rsquo: '’', eacute: 'é', egrave: 'è',
                    ccedil: 'ç', agrave: 'à', ecirc: 'ê', amp: '&' };
                if (key[0] !== '#') return noms[key] || ' ';
                var cp = key[1] === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
                return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : ' ';
            }).replace(/\s+/g, ' ').trim();
    }
    function analyserTitres(html, annee) {
        var t = texte(html), debut = t.search(/Les plus-values de cession de valeurs mobilières réalisées depuis le 1er janvier 2018 sont soumises/i);
        if (!Number.isInteger(annee) || annee < 2023 || debut < 0)
            return { etat: 'régime des gains de titres absent' };
        // Pas de taux isolé ailleurs sur la page : ils doivent être dans le
        // paragraphe du PFU DES TITRES, avant les exemples et autres régimes.
        var paragraphe = t.slice(debut, debut + 1100);
        var fin = paragraphe.search(/Gains de cession de valeurs mobilières, droits sociaux/i);
        if (fin > 0) paragraphe = paragraphe.slice(0, fin);
        var irM = paragraphe.match(/prélèvement forfaitaire unique\s*\(PFU\)\s*de\s*(12[,.]8)\s*%/i);
        var psM = paragraphe.match(/prélèvements sociaux de\s*(17[,.]2|18[,.]6)\s*%/i);
        var pfuM = paragraphe.match(/taux de\s*(30|31[,.]4)\s*%/i);
        if (!irM || !psM || !pfuM) return { etat: 'taux IR/PS/PFU des titres absents du paragraphe officiel' };
        var ir = Math.round(Number(irM[1].replace(',', '.')) * 10) / 1000;
        var ps = Math.round(Number(psM[1].replace(',', '.')) * 10) / 1000;
        var pfu = Math.round(Number(pfuM[1].replace(',', '.')) * 10) / 1000;
        if (Math.abs(ir + ps - pfu) > .00001) return { etat: 'taux IR + PS différents du PFU publié' };
        if (!new RegExp('Si, en\\s+' + annee + ',\\s+vous ou les membres de votre foyer fiscal avez vendu des valeurs mobilières', 'i').test(t))
            return { etat: 'revenus ' + annee + ' non mentionnés pour les titres' };
        if (!/case\s*2OP/i.test(t) || !/Le mécanisme d.abattements/i.test(t) ||
            !/titres acquis ou souscrits? avant le\s+1er janvier 2018/i.test(t))
            return { etat: 'option 2OP ou condition des titres anciens non reconnue' };
        return { etat: 'taux IR/PS des titres et année explicites',
            valeurs: { ir: ir, ps: ps, pfu: pfu },
            // Extrait exact du document public (aucune donnée du portefeuille).
            extrait: t.slice(debut, Math.min(t.length, debut + 4200)) };
    }
    function lireTitres(html, annee) { return analyserTitres(html, annee).valeurs || null; }
    function compte() {
        var u = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        return u && /^[a-f0-9-]{36}$/i.test(u.id || '') ? u.id : null;
    }
    function lireCache(annee) {
        var id = compte();
        if (!id || !root.localStorage) return null;
        try {
            var donnees = JSON.parse(root.localStorage.getItem(CLE + id) || '{}');
            var revisions = donnees[annee], derniere = Array.isArray(revisions) && revisions[revisions.length - 1];
            return derniere && derniere.annee === annee && derniere.url === url(annee)
                ? lireTitres(derniere.extrait, annee) : null;
        } catch (_) { return null; }
    }
    function chercher(annee) {
        if (!Number.isInteger(annee) || annee < 2023 || annee > new Date().getFullYear())
            return Promise.reject(new Error('Millésime de plus-values de titres invalide.'));
        var id = compte();
        if (!id) return Promise.reject(new Error('Session requise pour la collecte des gains.'));
        var source = url(annee);
        return PF.net.req('GET', source, { Accept: 'text/html' }).then(function (rep) {
            var analyse = rep.ok && rep.body ? analyserTitres(rep.body, annee) : null;
            var valeur = analyse && analyse.valeurs;
            var etat = analyse ? analyse.etat : 'document inaccessible';
            if (compte() !== id) throw new Error('Session changée : collecte des titres annulée.');
            if (!root.localStorage) return { etat: etat, enregistree: false };
            var cle = CLE + id, donnees;
            try { donnees = JSON.parse(root.localStorage.getItem(cle) || '{}'); }
            catch (_) { donnees = {}; }
            var historique = Array.isArray(donnees[annee]) ? donnees[annee] : [];
            var nouveau = { annee: annee, url: source, extrait: null };
            if (valeur) {
                nouveau.extrait = analyse.extrait;
                if (!lireTitres(nouveau.extrait, annee)) {
                    nouveau.extrait = null;
                    etat = 'preuve insuffisante pour relecture';
                }
            }
            var ancien = historique[historique.length - 1];
            if (!ancien || ancien.extrait !== nouveau.extrait) {
                nouveau.revision = historique.length + 1;
                nouveau.recupere_le = new Date().toISOString();
                historique.push(nouveau);
            }
            donnees[annee] = historique;
            try { root.localStorage.setItem(cle, JSON.stringify(donnees)); }
            catch (_) { return { etat: etat, enregistree: false }; }
            return { etat: etat, enregistree: true, valeurs: lireCache(annee), url: source,
                publication: 'page d’aide déclaration ' + (annee + 1) + ' ; date de mise en ligne non indiquée' };
        }).catch(function (err) {
            if (err && /Session changée/.test(err.message || '')) throw err;
            return { etat: 'document inaccessible', enregistree: false, url: source };
        });
    }
    PF.fiscalRegimesSources = { lireTitres: lireTitres, analyserTitres: analyserTitres,
        lireCache: lireCache, chercher: chercher, url: url };
})(typeof globalThis !== 'undefined' ? globalThis : this);
