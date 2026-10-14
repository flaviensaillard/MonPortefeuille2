/* DGFiP : preuve PARTIELLE des prélèvements sociaux des RCM encaissés en 2025.
   Ce lecteur ne classe ni les produits du foyer ni leur précompte effectif :
   ses taux ne sont donc jamais transférés dans la simulation ou une R2. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var URL = 'https://www.impots.gouv.fr/particulier/les-revenus-mobiliers';
    var CLE = 'pf2.dgfip.rcm.v1.';

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
    function analyser(html, annee) {
        if (annee !== 2025) return { etat: 'preuve RCM de ce millésime non disponible' };
        var t = texte(html);
        // La date d'édition du site n'est pas une date d'effet : les deux
        // passages ci-dessous doivent désigner les revenus 2025 eux-mêmes.
        var date = t.match(/modifie le\s+(\d{2}\/\d{2}\/\d{4})/i);
        var debut = t.search(/La taxation aux prelevements sociaux/i);
        if (!date || Number(date[1].slice(-4)) < 2026 || debut < 0)
            return { etat: 'publication ou section RCM non reconnue (date publiée=' + !!date
                + ', section PS=' + (debut >= 0) + ')' };
        var partie = t.slice(debut, debut + 4200);
        var pre = partie.match(/La plupart des RCM[^.]{0,220}?encaissement en 2025[^.]{0,110}?au taux de\s+(\d{1,2}[,.]\d{1,2})\s*%/i);
        var non = partie.match(/Les produits qui n.auraient pas fait l.objet de ce prelevement[^.]{0,250}?au taux global de\s+(\d{1,2}[,.]\d{1,2})\s*%\s+pour les revenus percus en 2025/i);
        if (!pre || !non) return { etat: 'précompte 2025 ou avis des revenus 2025 non documenté'
            + ' (encaissement=' + !!pre + ', avis=' + !!non + ')' };
        var precompte = taux(pre[1]), avis = taux(non[1]);
        if (!(precompte >= .15 && precompte <= .25 && avis >= precompte && avis <= .25))
            return { etat: 'taux RCM hors bornes ou contradictoires' };
        // Éléments conditionnels seulement : la CSG n'est pas appliquée sans
        // source millésimée, produit, option barème et année de paiement.
        var csg = t.match(/(?:une partie|fraction) de la CSG afferente aux RCM imposes au bareme[^.]{0,230}?l.annee de son paiement[^.]{0,100}?a hauteur de\s+(\d[,.]\d)\s*%/i);
        var extrait = 'modifie le ' + date[1] + ' La taxation aux prelevements sociaux '
            + pre[0] + '. ' + non[0] + '. ' + (csg ? csg[0] + '.' : '');
        return { etat: 'RCM 2025 : taux à l’encaissement et sur avis distingués, produit non déterminé',
            valeurs: { precompte2025: precompte, nonPrecompteAvis2026: avis,
                dateModification: date[1], csgConditionnelle: csg && taux(csg[1]) === .068 },
            extrait: extrait };
    }
    function compte() {
        var u = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        return u && /^[a-f\d-]{36}$/i.test(u.id || '') ? u.id : null;
    }
    function lireCache(annee) {
        var id = compte();
        if (!id || !root.localStorage || annee !== 2025) return null;
        try {
            var historique = JSON.parse(root.localStorage.getItem(CLE + id) || '{}')[annee];
            var dernier = Array.isArray(historique) && historique[historique.length - 1];
            var analyse = dernier && dernier.annee === annee && dernier.url === URL
                && analyser(dernier.extrait, annee);
            return analyse && analyse.valeurs || null;
        } catch (_) { return null; }
    }
    function chercher(annee) {
        if (!Number.isInteger(annee) || annee < 2023 || annee > new Date().getFullYear())
            return Promise.reject(new Error('Millésime RCM invalide.'));
        var id = compte();
        if (!id) return Promise.reject(new Error('Session requise pour la collecte RCM.'));
        if (annee !== 2025) return Promise.resolve({ etat: 'preuve RCM de ce millésime non disponible',
            enregistree: false, url: null });
        return PF.net.req('GET', URL, { Accept: 'text/html' }).then(function (rep) {
            var analyse = rep.ok && rep.body ? analyser(rep.body, annee) : null;
            var etat = analyse ? analyse.etat : 'document inaccessible';
            if (compte() !== id) throw new Error('Session changée : collecte RCM annulée.');
            if (!root.localStorage || !analyse || !analyse.valeurs)
                return { etat: etat, enregistree: false, url: URL };
            // Relecture de l'extrait avant stockage : aucun taux isolé du site.
            if (!analyser(analyse.extrait, annee).valeurs)
                return { etat: 'preuve RCM insuffisante pour relecture', enregistree: false, url: URL };
            var cle = CLE + id, donnees;
            try { donnees = JSON.parse(root.localStorage.getItem(cle) || '{}'); }
            catch (_) { donnees = {}; }
            var historique = Array.isArray(donnees[annee]) ? donnees[annee] : [];
            var dernier = historique[historique.length - 1];
            if (!dernier || dernier.extrait !== analyse.extrait) {
                historique.push({ annee: annee, url: URL, extrait: analyse.extrait,
                    revision: historique.length + 1, recupere_le: new Date().toISOString() });
            }
            donnees[annee] = historique;
            try { root.localStorage.setItem(cle, JSON.stringify(donnees)); }
            catch (_) { return { etat: etat, enregistree: false, url: URL }; }
            return { etat: etat, enregistree: true, valeurs: lireCache(annee), url: URL,
                publication: analyse.valeurs.dateModification };
        }).catch(function (err) {
            if (err && /Session changée/.test(err.message || '')) throw err;
            return { etat: 'document inaccessible', enregistree: false, url: URL };
        });
    }
    PF.fiscalRcmSources = { analyser: analyser, lireCache: lireCache, chercher: chercher, url: URL };
})(typeof globalThis !== 'undefined' ? globalThis : this);
