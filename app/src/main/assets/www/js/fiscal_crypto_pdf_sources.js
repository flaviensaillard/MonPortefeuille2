/* Revenus 2025 : notice 2086 et brochure plus-values DGFiP, preuves partielles.
   Jamais de PS crypto chiffrés ni de présomption d'exhaustivité du foyer.
   Le PDF brut n'est pas conservé ; extraits publics revalidés par compte. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var DOCS = {
        notice: 'https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf',
        brochure: 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/09-plus_values_137a156.pdf'
    };
    var CLE = 'pf2.dgfip.crypto.pdf.v1.';
    var ANNEE_PAR_DEFAUT = 2025;
    var FAMILLE = { notice: 'notice_2086', brochure: 'brochure_plus_values' };
    /* PÉRENNITÉ : l'inventaire `fiscal_sources_millesimes` est la seule source
       d'URL par millésime. Un millésime sans document vérifié est refusé avec le
       motif à chercher, sans appel réseau et sans valeur produite. */
    function registre() { return PF.fiscalSourcesMillesimes || null; }
    function urlPour(type, annee) {
        var r = registre();
        if (!r) return annee === ANNEE_PAR_DEFAUT ? DOCS[type] : null;
        return r.url(annee, FAMILLE[type]);
    }
    function etatRefus(type, annee) {
        var r = registre(), s = r && r.source(annee, FAMILLE[type]);
        if (!s) return { etat: 'millésime revenus ' + annee
            + ' hors inventaire des sources DGFiP : aucune lecture', url: null, enregistree: false };
        if (!s.url) return { etat: 'document du millésime revenus ' + annee
            + ' non repéré : aucune URL inventée — ' + s.constat,
            url: null, motif: s.motif, enregistree: false };
        return { etat: 'document repéré pour les revenus ' + annee
            + ' mais jeu de preuves non vérifié sur ce millésime : lecture refusée, '
            + 'aucune valeur produite — ' + s.constat, url: s.url, motif: s.motif, enregistree: false };
    }

    function normaliser(pages) {
        return (Array.isArray(pages) ? pages : [pages]).map(function (p) { return String(p || ''); })
            .join(' ').replace(/[\u00ad\u2010-\u2015]/g, '-')
            .replace(/[’‘]/g, "'").normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ').trim();
    }
    function preuve(t, motif) {
        var m = t.match(motif);
        return m && m[0];
    }
    function analyserNotice(pages, anneeRevenus) {
        var t = normaliser(pages);
        var an = Number.isInteger(anneeRevenus) ? anneeRevenus : ANNEE_PAR_DEFAUT;
        // Année des CESSIONS explicite dans le formulaire, pas seulement /2026/ dans l'URL.
        var annee = preuve(t, new RegExp('declaration des plus ou moins.values realisees en ' + an
            + ' suite a des cessions d.actifs numeriques', 'i'));
        var formule = preuve(t, /plus ou moins.value brute\s*=\s*prix de cession\s*[-=]\s*\[?\s*prix total d.acquisition\s*[x×]\s*prix de cession\s*\/\s*valeur globale du portefeuille\s*\]?/i);
        var frais = preuve(t, /les frais deductibles[^.]{0,160}?ne viennent pas en diminution du prix de cession pour la determination du quotient[^.]{0,260}?premier terme de la difference/i);
        var seuil = preuve(t, /total des prix de cession realises au niveau du foyer fiscal[^.]{0,240}?inferieur ou egal a\s*305\s*€/i);
        var ligne51 = preuve(t, /51\s+total des prix de cession realises au niveau du foyer fiscal\s*\([^)]*(?:l\.?\s*)?218\s*\+\s*(?:l\.?\s*)?258\s*\+\s*(?:l\.?\s*)?318\s*\+\s*(?:l\.?\s*)?413\s*\+\s*(?:l\.?\s*)?423\s*\+\s*(?:l\.?\s*)?433\s*\)/i);
        var cases = preuve(t, /ligne\s*3AN[^.]{0,130}?plus.value globale[^.]{0,160}?ligne\s*3BN[^.]{0,130}?moins.value globale/i);
        var option = preuve(t, /case\s*3CN[\s\S]{0,260}?option est globale[\s\S]{0,240}?foyer fiscal[\s\S]{0,200}?independante de celle pouvant etre exercee pour la taxation des revenus de capitaux mobiliers/i);
        var ir = preuve(t, /taux forfaitaire de\s*12[,.]8\s*%\s*auquel\s*s.ajoutent les prelevements sociaux/i);
        var morceaux = { millesime: annee, formule: formule, fraisHorsQuotient: frais,
            seuilFoyer: seuil, ligne51: ligne51, cases: cases, option3CN: option, ir: ir };
        var absents = Object.keys(morceaux).filter(function (k) { return !morceaux[k]; });
        if (absents.length) return { etat: 'notice 2086 revenus ' + an + ' : preuves incomplètes ('
            + absents.join(', ') + ')' };
        return { etat: 'notice 2086 revenus ' + an + ' : méthode et foyer partiellement vérifiés, PS non déterminés par ce lecteur',
            valeurs: { revenus: an, declaration: an + 1, irForfaitaire: .128,
                seuilFoyer: 305, numerateurQuotientAvantFrais: true, fraisPremierTerme: true,
                ligne51Foyer: true, cases: '3AN/3BN', option: '3CN indépendante de 2OP',
                psCrypto2025Attestes: false, psCryptoAttestes: false, annexeFoyerComplete: false },
            extrait: Object.keys(morceaux).map(function (k) { return morceaux[k]; }).join(' ; ') };
    }
    function analyserBrochure(pages, anneeRevenus) {
        var t = normaliser(pages);
        var anBrochure = Number.isInteger(anneeRevenus) ? anneeRevenus : ANNEE_PAR_DEFAUT;
        // Le titre de cette rubrique peut être absent du texte PDF.js et la
        // colonne PEAC peut être dessinée au milieu. Ancrer sur le paragraphe
        // CRYPTO et borner ses preuves à sa proximité, jamais à la table des
        // matières ou à un taux PS trouvé dans une autre rubrique.
        var seuilRx = /foyers fiscaux realisant des cessions d.actifs numeriques dont la somme des prix n.excede pas\s*305\s*€/i;
        var repere = seuilRx.exec(t);
        var section = repere ? t.slice(Math.max(0, repere.index - 2200), repere.index + 2800) : '';
        var annee = preuve(section, new RegExp('l.ensemble des cessions imposables realisees par les membres du foyer fiscal en '
            + anBrochure, 'i'));
        var seuil = preuve(section, seuilRx);
        var ir = preuve(section, /cette plus\s*-?\s*value est imposee au taux de\s*12[,.]8\s*%\s*et soumise aux preleve\s*-?\s*ments sociaux/i);
        var annexe = preuve(section, /2086 doit etre jointe a la declaration de revenus y compris lorsque le montant des cessions est inferieur a\s*305\s*€/i);
        var option = preuve(section, /option expresse et irrevocable est globale[\s\S]{0,160}?foyer fiscal[\s\S]{0,340}?independante de celle pouvant etre exercee pour la taxation des revenus de capitaux mobiliers/i);
        var morceaux = { millesime: annee, seuilFoyer: seuil, ir: ir,
            annexe: annexe, option3CN: option };
        var absents = Object.keys(morceaux).filter(function (k) { return !morceaux[k]; });
        if (absents.length) return { etat: 'brochure crypto revenus ' + anBrochure
            + ' : preuves incomplètes (' + absents.join(', ') + ')' };
        return { etat: 'brochure crypto revenus ' + anBrochure + ' : IR 12,8 %, PS non déterminés par ce lecteur',
            valeurs: { revenus: anBrochure, declaration: anBrochure + 1, irForfaitaire: .128,
                seuilFoyer: 305, annexe2086: true, option3CN: true,
                psCrypto2025Attestes: false, psCryptoAttestes: false, annexeFoyerComplete: false },
            extrait: Object.keys(morceaux).map(function (k) { return morceaux[k]; }).join(' ; ') };
    }
    function compte() {
        var u = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        return u && /^[a-f\d-]{36}$/i.test(u.id || '') ? u.id : null;
    }
    function anneeDe(a) { return Number.isInteger(a) ? a : ANNEE_PAR_DEFAUT; }
    function cle(type, id, annee) { return CLE + type + '.' + anneeDe(annee) + '.' + id; }
    function cleLegacy(type, id) { return CLE + type + '.' + id; }
    function analyser(type, texte, annee) {
        return type === 'notice' ? analyserNotice(texte, annee) : analyserBrochure(texte, annee);
    }
    /* La clé porte le millésime. L'ancienne clé (sans année) reste lue pour les
       revenus 2025 : le cache déjà constitué sur Android n'est ni perdu, ni
       jamais reporté sur une autre année. */
    function lireCache(type, anneeRevenus) {
        var id = compte(), an = anneeDe(anneeRevenus);
        if (!id || !root.localStorage) return null;
        var url = urlPour(type, an);
        if (!url) return null;
        var cles = [cle(type, id, an)];
        if (an === ANNEE_PAR_DEFAUT) cles.push(cleLegacy(type, id));
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
            if (compte() !== id) throw new Error('Session changée : lecture PDF annulée.');
            if (!root.localStorage || !a.valeurs) return { etat: a.etat, enregistree: false, url: url };
            if (!analyser(type, a.extrait, an).valeurs)
                return { etat: 'preuve PDF impossible à relire', enregistree: false, url: url };
            var k = cle(type, id, an), h;
            try { h = JSON.parse(root.localStorage.getItem(k) || '[]'); } catch (_) { h = []; }
            if (!Array.isArray(h)) h = [];
            if (!h.length || h[h.length - 1].extrait !== a.extrait)
                h.push({ url: url, annee_revenus: an, annee_declaration: an + 1,
                    extrait: a.extrait, revision: h.length + 1, recupere_le: new Date().toISOString() });
            try { root.localStorage.setItem(k, JSON.stringify(h)); }
            catch (_) { return { etat: a.etat, enregistree: false, url: url }; }
            return { etat: a.etat, enregistree: true, valeurs: lireCache(type, an), url: url };
        }).catch(function (err) {
            if (err && /Session changée/.test(err.message || '')) throw err;
            return { etat: 'PDF non disponible (' + String(err && err.message || err).slice(0, 100) + ')',
                enregistree: false, url: url };
        });
    }
    function chercher(annee) {
        if (!Number.isInteger(annee) || annee < 2023 || annee > new Date().getFullYear())
            return Promise.reject(new Error('Année crypto PDF invalide.'));
        var id = compte();
        if (!id) return Promise.reject(new Error('Session requise pour les PDF crypto.'));
        return Promise.all([chercherDoc('notice', id, annee), chercherDoc('brochure', id, annee)])
            .then(function (r) { return { notice: r[0], brochure: r[1] }; });
    }
    PF.fiscalCryptoPdfSources = { analyserNotice: analyserNotice, analyserBrochure: analyserBrochure,
        chercher: chercher, lireCache: lireCache, urls: DOCS, urlPour: urlPour,
        etatRefus: etatRefus, ANNEE_PAR_DEFAUT: ANNEE_PAR_DEFAUT, familles: FAMILLE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
