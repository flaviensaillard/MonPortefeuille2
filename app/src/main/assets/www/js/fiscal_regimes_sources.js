/* DGFiP : contrôle millésimé du seul régime des plus-values de titres.
   Le PFU des RCM, la crypto et la CSG sont des régimes distincts : ne jamais
   réutiliser ici le taux des titres pour les couvrir implicitement. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var CLE = 'pf2.dgfip.regimes.v1.';
    // Dans l'aide HTML « 1<sup>er</sup> » devient « 1 er » quand les
    // balises sont supprimées. La date reste exigée (jamais 2019 ni 2025).
    var DATE_TITRES_ANCIENS = /avant\s+le\s+1\s*(?:e\s*r|ᵉ\s*ʳ)\s+janvier\s+2018/i;
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
                    ccedil: 'ç', agrave: 'à', ecirc: 'ê', amp: '&', apos: "'",
                    ugrave: 'ù', uacute: 'ú', ucirc: 'û', ocirc: 'ô', oelig: 'œ',
                    acirc: 'â', icirc: 'î', iuml: 'ï', euml: 'ë', laquo: '«', raquo: '»' };
                if (key[0] !== '#') return noms[key] || ' ';
                var cp = key[1] === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
                return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : ' ';
            }).replace(/\s+/g, ' ').trim();
    }
    function analyserTitres(html, annee) {
        var t = texte(html).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!Number.isInteger(annee) || annee < 2023)
            return { etat: 'millésime de gains invalide' };
        // L'aide peut fragmenter ou reformuler la phrase d'introduction.
        // On exige soit cette introduction ciblée, soit le titre de la section
        // des titres ET un paragraphe PFU immédiatement avant cette section.
        var debut = t.search(/plus-values\s+de\s+cession\s+de\s+valeurs\s+mobilieres/i);
        var section = t.search(/Gains\s+de\s+cession\s+de\s+valeurs\s+mobilieres,?\s+droits\s+sociaux/i);
        if (debut < 0 && section < 0)
            return { etat: 'régime des gains de titres absent' };
        // Jamais de taux isolé ailleurs sur la page : IR, PS et somme doivent
        // précéder la section des titres, dans le paragraphe du même PFU.
        var depart = debut >= 0 && (section < 0 || (debut < section && section - debut <= 1100))
            ? debut : Math.max(0, section - 1000);
        var paragraphe = t.slice(depart, section > depart ? Math.min(section, depart + 1100) : depart + 1100);
        if (!/plus-values\s+de\s+cession\s+de\s+valeurs\s+mobilieres/i.test(paragraphe) &&
            !/Plus-values\s+et\s+gains\s+divers/i.test(paragraphe))
            return { etat: 'paragraphe des taux des titres non identifié' };
        var irM = paragraphe.match(/prelevement forfaitaire unique\s*\(PFU\)\s*de\s*(12[,.]8)\s*%/i);
        var psM = paragraphe.match(/prelevements sociaux de\s*(17[,.]2|18[,.]6)\s*%/i);
        var pfuM = paragraphe.match(/taux de\s*(30|31[,.]4)\s*%/i);
        if (!irM || !psM || !pfuM) return { etat: 'taux IR/PS/PFU des titres absents du paragraphe officiel' };
        var ir = Math.round(Number(irM[1].replace(',', '.')) * 10) / 1000;
        var ps = Math.round(Number(psM[1].replace(',', '.')) * 10) / 1000;
        var pfu = Math.round(Number(pfuM[1].replace(',', '.')) * 10) / 1000;
        if (Math.abs(ir + ps - pfu) > .00001) return { etat: 'taux IR + PS différents du PFU publié' };
        var passageTitres = t.slice(section > depart ? section : depart, depart + 4200);
        if (!new RegExp('Si, en\\s+' + annee + ',\\s+vous ou les membres de votre foyer fiscal avez vendu des valeurs mobilieres', 'i').test(passageTitres))
            return { etat: 'revenus ' + annee + ' non mentionnés pour les titres' };
        var option = /case\s*2OP/i.test(t.slice(depart, depart + 4200));
        // La formulation exacte de la phrase d'abattement n'est pas un taux :
        // vérifier ensemble son objet, la condition d'acquisition et sa date,
        // plutôt qu'exiger le mot-à-mot d'un seul libellé éditorial.
        var abattement = passageTitres.match(/abattement.{0,750}/i);
        var condition = abattement && abattement[0].match(DATE_TITRES_ANCIENS);
        var anciens = !!condition && /titres\s+(?:acquis|souscrits?)/i.test(abattement[0].slice(0, condition.index));
        if (!option || !anciens) {
            var indice2018 = passageTitres.indexOf('2018');
            return { etat: (option ? '' : 'case 2OP non reconnue ; ')
                + (anciens ? '' : 'abattement des titres acquis avant 2018 non reconnu')
                + ' (repères du document public : 2OP=' + /\b2OP\b/i.test(t)
                + ', abattement=' + /abattement/i.test(passageTitres)
                + ', titres acquis=' + /titres\s+(?:acquis|souscrits?)/i.test(passageTitres)
                + ', avant 2018=' + DATE_TITRES_ANCIENS.test(passageTitres)
                + (anciens || indice2018 < 0 ? '' : ', contexte 2018=«'
                    + passageTitres.slice(Math.max(0, indice2018 - 65), indice2018 + 12) + '»') + ')' };
        }
        return { etat: 'taux IR/PS des titres et année explicites',
            valeurs: { ir: ir, ps: ps, pfu: pfu },
            // Extrait textuel du document public, sans données du portefeuille.
            extrait: t.slice(depart, Math.min(t.length, depart + 4200)) };
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
            if (analyse && !valeur && /absent|non identifié/.test(etat)) {
                // Diagnostic limité au document PUBLIC reçu, sans donnée du
                // compte, afin de distinguer une page différente d'un problème
                // d'encodage ; jamais conservé en cache ni utilisé comme preuve.
                etat += ' (HTTP ' + (rep.status || '?') + ', ' + rep.body.length
                    + ' caractères ; début du document : «'
                    + texte(rep.body).slice(0, 130) + '»)';
            }
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
