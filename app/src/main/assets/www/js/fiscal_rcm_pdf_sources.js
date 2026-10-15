/* Brochures DGFiP : cases RCM et CSG selon année du paiement.
   Preuves documentaires séparées des produits, versements et choix du foyer.
   Pas d'activation des taux RCM/CSG dans le moteur ou la R2.

   PÉRENNITÉ : les URL ne sont plus figées sur un seul millésime. Elles viennent
   de `PF.fiscalSourcesMillesimes`, qui n'inscrit une adresse que si elle a été
   vérifiée, et n'autorise la lecture que si le jeu de preuves a été vérifié pour
   CE millésime. Sans URL vérifiée : refus, aucune adresse inventée, aucun appel
   réseau. Sans jeu de preuves vérifié : refus, aucune valeur produite. Les
   ancres sont construites avec l'année des revenus demandée, donc un document
   d'une autre année est refusé. Le comportement par défaut (revenus 2025) est
   inchangé. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var DOCS = {
        rcm: 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/08-RCM_121a136.pdf',
        charges: 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/12-charges_ded_rev_225a236.pdf'
    };
    var CLE = 'pf2.dgfip.rcm.pdf.v1.';
    var ANNEE_PAR_DEFAUT = 2025;
    var FAMILLE = { rcm: 'brochure_rcm', charges: 'brochure_charges' };
    function registre() { return PF.fiscalSourcesMillesimes || null; }
    function anneeDe(a) { return Number.isInteger(a) ? a : ANNEE_PAR_DEFAUT; }
    /* URL lisible pour ce millésime : `null` si le document n'est pas repéré ou
       si sa lecture n'a pas été vérifiée pour cette année de revenus. */
    function urlPour(type, annee) {
        var r = registre();
        if (r) return r.url(anneeDe(annee), FAMILLE[type]);
        return anneeDe(annee) === ANNEE_PAR_DEFAUT ? DOCS[type] : null;
    }
    function etatRefus(type, annee) {
        var r = registre(), s = r && r.source(anneeDe(annee), FAMILLE[type]);
        if (!s) return { etat: 'millésime revenus ' + anneeDe(annee)
            + ' hors inventaire des sources DGFiP : aucune lecture', url: null, enregistree: false };
        if (!s.url) return { etat: 'document du millésime revenus ' + anneeDe(annee)
            + ' non repéré : aucune URL inventée — ' + s.constat,
            url: null, motif: s.motif, enregistree: false };
        return { etat: 'document repéré pour les revenus ' + anneeDe(annee)
            + ' mais jeu de preuves non vérifié sur ce millésime : lecture refusée, '
            + 'aucune valeur produite — ' + s.constat, url: s.url, motif: s.motif, enregistree: false };
    }
    function normaliser(pages) {
        return (Array.isArray(pages) ? pages : [pages]).map(function (p) { return String(p || ''); })
            .join(' ').replace(/[\u00ad\u2010-\u2015]/g, '-').replace(/[’‘]/g, "'")
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/([a-zA-Z])\s*-\s+([a-zA-Z])/g, '$1$2').replace(/\s+/g, ' ').trim();
    }
    function preuve(t, rx) { var m = t.match(rx); return m && m[0]; }
    function analyserRcm(pages, anneeRevenus) {
        var t = normaliser(pages);
        var an = anneeDe(anneeRevenus);
        var annee = preuve(t, new RegExp('2042\\s*K[^.]{0,130}?revenus de capitaux mobiliers percus en ' + an, 'i'));
        var cg = preuve(t, /indiquez ligne 2CG les produits suivants qui n.ouvrent jamais droit a CSG deductible[^.]{0,180}?y compris lorsqu.ils sont imposes au bareme/i);
        var bh = preuve(t, new RegExp('inscrivez ligne 2BH le montant des revenus percus en ' + an
            + '[^.]{0,200}?prelevements sociaux ont deja ete preleves en ' + an
            + '[^.]{0,250}?ouvrent droit a CSG deductible uniquement en cas d.option', 'i'));
        var bhCalcul = preuve(t, new RegExp('6[,.]8\\s*% du montant declare ligne 2BH[^.]{0,180}?revenu global de ' + an, 'i'));
        var bhOption = preuve(t, /si vous avez opte pour l.imposition au bareme[^.]{0,150}?case 2OP cochee/i);
        var df = preuve(t, new RegExp('inscrivez ligne 2DF le montant des revenus percus en ' + an
            + '[^.]{0,230}?prelevements sociaux ont deja ete preleves en ' + an
            + '[^.]{0,260}?ouvrent toujours droit a CSG deductible[^.]{0,200}?case 2OP non cochee', 'i'));
        var dfProduit = preuve(t, /produits des fonds en unites de compte[^.]{0,240}?versements effectues avant le\s*27[./]9[./]2017/i);
        var cgExclusion = preuve(t, /revenus inscrits ligne 2CG sont exclus de la base soumise aux prelevements sociaux et n.ouvrent pas droit a CSG deductible/i);
        var morceaux = {};
        morceaux['revenus' + an] = annee;
        morceaux.case2CG = cg; morceaux.exclusion2CG = cgExclusion;
        Object.assign(morceaux, {
            case2BH: bh, option2OP: bhOption, calcul6_8: bhCalcul, case2DF: df, produit2DF: dfProduit });
        var manque = Object.keys(morceaux).filter(function (k) { return !morceaux[k]; });
        if (manque.length) return { etat: 'brochure RCM revenus ' + an + ' : preuves incomplètes ('
            + manque.join(', ') + ')' };
        return { etat: 'brochure RCM revenus ' + an + ' : 2CG/2BH/2DF distinguées, produit du foyer non déterminé',
            valeurs: { revenus: an, declaration: an + 1,
                case2CG: 'sans CSG déductible', case2BH: 'CSG 6,8 % si option 2OP sous conditions',
                case2DF: 'CSG déductible indépendamment de 2OP selon produit',
                produitAvant2017: true, tauxRcmPersonnelsAttestes: false,
                anneePaiementPersonnelleAttestee: false },
            extrait: Object.keys(morceaux).map(function (k) { return morceaux[k]; }).join(' ; ') };
    }
    function analyserCharges(pages, anneeRevenus) {
        var t = normaliser(pages);
        var an = anneeDe(anneeRevenus);
        var annee = preuve(t, new RegExp('CSG DEDUCTIBLE CALCULEE SUR LES REVENUS ' + (an - 1)
            + ', PAYEE EN ' + an, 'i'));
        var six = preuve(t, /montant deductible est egal a\s*6[,.]8\s*points de CSG calculee\s*\(au taux de\s*9[,.]2\s*%\)/i);
        var paiement = preuve(t, /deduction s.opere sur les revenus de l.annee du paiement de la CSG/i);
        var pf = preuve(t, /aucune CSG calculee sur les revenus du patrimoine n.est deductible lorsque ces revenus ont ete imposes a l.impot sur le revenu a un taux forfaitaire/i);
        var de = preuve(t, /inscrivez ligne 6DE le montant exact de CSG deductible/i);
        var bhdf = preuve(t, /6[,.]8\s*% des revenus declares ligne 2BH[^.]{0,140}?6[,.]8\s*% des revenus declares ligne 2DF/i);
        var pasDouble = preuve(t, /ne devez pas le calculer vous.meme ni l.indiquer ligne 6DE[\s\S]{0,270}?ligne 2BH et 2DF sera calcule automatiquement/i);
        var morceaux = {};
        morceaux['revenus' + (an - 1) + 'Payee' + an] = annee;
        Object.assign(morceaux, { six8: six, paiement: paiement,
            pasDeDeductionPFU: pf, case6DE: de, cases2BH2DF: bhdf, sansDoubleCompte: pasDouble });
        var manque = Object.keys(morceaux).filter(function (k) { return !morceaux[k]; });
        if (manque.length) return { etat: 'brochure charges revenus ' + an + ' : preuves CSG incomplètes ('
            + manque.join(', ') + ')' };
        return { etat: 'brochure charges revenus ' + an + ' : paiement ' + an
            + ' documenté, avis et montants du foyer non lus',
            valeurs: { revenus: an, declaration: an + 1, revenusPatrimoineOrigine: an - 1,
                csgPayeeEn: an, csgDeductibleMentionnee: .068, case6DE: true,
                cases2BH2DFCalculAuto: true, deductionPersonnelleAttestee: false },
            extrait: Object.keys(morceaux).map(function (k) { return morceaux[k]; }).join(' ; ') };
    }
    function compte() {
        var u = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        return u && /^[a-f\d-]{36}$/i.test(u.id || '') ? u.id : null;
    }
    function analyser(type, pages, annee) {
        return type === 'rcm' ? analyserRcm(pages, annee) : analyserCharges(pages, annee);
    }
    /* La clé porte le millésime. L'ancienne clé (sans année) reste lue pour les
       revenus 2025, afin de ne pas perdre le cache déjà constitué sur Android. */
    function lireCache(type, anneeRevenus) {
        var id = compte(), an = anneeDe(anneeRevenus);
        if (!id || !root.localStorage) return null;
        var url = urlPour(type, an);
        if (!url) return null;
        var cles = [CLE + type + '.' + an + '.' + id];
        if (an === ANNEE_PAR_DEFAUT) cles.push(CLE + type + '.' + id);
        for (var i = 0; i < cles.length; i++) {
            try {
                var h = JSON.parse(root.localStorage.getItem(cles[i]) || '[]');
                var r = Array.isArray(h) && h[h.length - 1];
                var a = r && r.url === url && r.annee_revenus === an && analyser(type, r.extrait, an);
                if (a && a.valeurs) return a.valeurs;
            } catch (_) { return null; }
        }
        return null;
    }
    function chercherDoc(type, id, anneeRevenus) {
        var an = anneeDe(anneeRevenus), url = urlPour(type, an);
        if (!url) return Promise.resolve(etatRefus(type, an));
        return PF.net.reqPdf(url).then(function (rep) {
            if (!rep.ok || !rep.binary_b64) throw new Error(rep.error || 'PDF inaccessible');
            return PF.fiscalBrochureSources.extrairePages(rep.binary_b64);
        }).then(function (pages) {
            var a = analyser(type, pages, an);
            if (compte() !== id) throw new Error('Session changée : consultation PDF annulée.');
            if (!root.localStorage || !a.valeurs) return { etat: a.etat, enregistree: false, url: url };
            if (!analyser(type, a.extrait, an).valeurs)
                return { etat: 'preuve PDF impossible à relire', enregistree: false, url: url };
            var k = CLE + type + '.' + an + '.' + id, h;
            try { h = JSON.parse(root.localStorage.getItem(k) || '[]'); } catch (_) { h = []; }
            if (!Array.isArray(h)) h = [];
            if (!h.length || h[h.length - 1].extrait !== a.extrait)
                h.push({ url: url, annee_revenus: an, annee_declaration: an + 1,
                    extrait: a.extrait, revision: h.length + 1, recupere_le: new Date().toISOString() });
            try { root.localStorage.setItem(k, JSON.stringify(h)); }
            catch (_) { return { etat: a.etat, enregistree: false, url: url }; }
            return { etat: a.etat, enregistree: true, valeurs: lireCache(type), url: url };
        }).catch(function (err) {
            if (err && /Session changée/.test(err.message || '')) throw err;
            return { etat: 'PDF non disponible (' + String(err && err.message || err).slice(0, 100) + ')',
                enregistree: false, url: url };
        });
    }
    function chercher(annee) {
        if (!Number.isInteger(annee) || annee < 2023 || annee > new Date().getFullYear())
            return Promise.reject(new Error('Année RCM PDF invalide.'));
        var id = compte();
        if (!id) return Promise.reject(new Error('Session requise pour les PDF RCM.'));
        return Promise.all([chercherDoc('rcm', id, annee), chercherDoc('charges', id, annee)])
            .then(function (r) { return { rcm: r[0], charges: r[1] }; });
    }
    PF.fiscalRcmPdfSources = { analyserRcm: analyserRcm, analyserCharges: analyserCharges,
        chercher: chercher, lireCache: lireCache, urls: DOCS, urlPour: urlPour,
        etatRefus: etatRefus, ANNEE_PAR_DEFAUT: ANNEE_PAR_DEFAUT, familles: FAMILLE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
