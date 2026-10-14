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
    function analyserNotice(pages) {
        var t = normaliser(pages);
        // Année des CESSIONS explicite dans le formulaire, pas seulement /2026/ dans l'URL.
        var annee = preuve(t, /declaration des plus ou moins.values realisees en 2025 suite a des cessions d.actifs numeriques/i);
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
        if (absents.length) return { etat: 'notice 2086 2025 : preuves incomplètes (' + absents.join(', ') + ')' };
        return { etat: 'notice 2086 revenus 2025 : méthode et foyer partiellement vérifiés, PS non chiffrés',
            valeurs: { revenus: 2025, declaration: 2026, irForfaitaire: .128,
                seuilFoyer: 305, numerateurQuotientAvantFrais: true, fraisPremierTerme: true,
                ligne51Foyer: true, cases: '3AN/3BN', option: '3CN indépendante de 2OP',
                psCrypto2025Attestes: false, annexeFoyerComplete: false },
            extrait: Object.keys(morceaux).map(function (k) { return morceaux[k]; }).join(' ; ') };
    }
    function analyserBrochure(pages) {
        var t = normaliser(pages);
        // Écarter la table des matières et les paragraphes voisins sur les titres.
        var titres = /plus.values de cession d.actifs numeriques/ig, m, section = '';
        while ((m = titres.exec(t))) {
            if (/150\s*VH\s*bis/i.test(t.slice(m.index, m.index + 220))) {
                section = t.slice(m.index, m.index + 6500);
                break;
            }
        }
        var fin = section.search(/PLAN D.EPARGNE AVENIR CLIMAT/i);
        if (fin > 0) section = section.slice(0, fin);
        var annee = preuve(section, /l.ensemble des cessions imposables realisees par les membres du foyer fiscal en 2025/i);
        var seuil = preuve(section, /foyers fiscaux realisant des cessions d.actifs numeriques dont la somme des prix n.excede pas\s*305\s*€/i);
        var ir = preuve(section, /cette plus.value est imposee au taux de\s*12[,.]8\s*%\s*et soumise aux prelevements sociaux/i);
        var annexe = preuve(section, /2086 doit etre jointe a la declaration de revenus y compris lorsque le montant des cessions est inferieur a\s*305\s*€/i);
        var option = preuve(section, /option expresse et irrevocable est globale[\s\S]{0,160}?foyer fiscal[\s\S]{0,340}?independante de celle pouvant etre exercee pour la taxation des revenus de capitaux mobiliers/i);
        var morceaux = { rubrique: section && section.slice(0, Math.min(section.indexOf('150 VH bis') + 10, 210)),
            millesime: annee, seuilFoyer: seuil, ir: ir, annexe: annexe, option3CN: option };
        var absents = Object.keys(morceaux).filter(function (k) { return !morceaux[k]; });
        if (absents.length) return { etat: 'brochure crypto 2025 : preuves incomplètes (' + absents.join(', ') + ')' };
        return { etat: 'brochure crypto revenus 2025 : IR 12,8 %, PS non déterminés par ce lecteur',
            valeurs: { revenus: 2025, declaration: 2026, irForfaitaire: .128,
                seuilFoyer: 305, annexe2086: true, option3CN: true,
                psCrypto2025Attestes: false, annexeFoyerComplete: false },
            extrait: Object.keys(morceaux).map(function (k) { return morceaux[k]; }).join(' ; ') };
    }
    function compte() {
        var u = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        return u && /^[a-f\d-]{36}$/i.test(u.id || '') ? u.id : null;
    }
    function cle(type, id) { return CLE + type + '.' + id; }
    function analyser(type, texte) { return type === 'notice' ? analyserNotice(texte) : analyserBrochure(texte); }
    function lireCache(type) {
        var id = compte();
        if (!id || !root.localStorage || !DOCS[type]) return null;
        try {
            var h = JSON.parse(root.localStorage.getItem(cle(type, id)) || '[]');
            var r = Array.isArray(h) && h[h.length - 1];
            var a = r && r.url === DOCS[type] && r.annee_revenus === 2025 && analyser(type, r.extrait);
            return a && a.valeurs || null;
        } catch (_) { return null; }
    }
    function chercherDoc(type, id) {
        var url = DOCS[type];
        return PF.net.reqPdf(url).then(function (rep) {
            if (!rep.ok || !rep.binary_b64) throw new Error(rep.error || 'PDF inaccessible');
            return PF.fiscalBrochureSources.extrairePages(rep.binary_b64);
        }).then(function (pages) {
            var a = analyser(type, pages);
            if (compte() !== id) throw new Error('Session changée : lecture PDF annulée.');
            if (!root.localStorage || !a.valeurs) return { etat: a.etat, enregistree: false, url: url };
            if (!analyser(type, a.extrait).valeurs)
                return { etat: 'preuve PDF impossible à relire', enregistree: false, url: url };
            var k = cle(type, id), h;
            try { h = JSON.parse(root.localStorage.getItem(k) || '[]'); } catch (_) { h = []; }
            if (!Array.isArray(h)) h = [];
            if (!h.length || h[h.length - 1].extrait !== a.extrait)
                h.push({ url: url, annee_revenus: 2025, annee_declaration: 2026,
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
            return Promise.reject(new Error('Année crypto PDF invalide.'));
        var id = compte();
        if (!id) return Promise.reject(new Error('Session requise pour les PDF crypto.'));
        if (annee !== 2025) return Promise.resolve({ notice: { etat: 'millésime non pris en charge' },
            brochure: { etat: 'millésime non pris en charge' } });
        return Promise.all([chercherDoc('notice', id), chercherDoc('brochure', id)])
            .then(function (r) { return { notice: r[0], brochure: r[1] }; });
    }
    PF.fiscalCryptoPdfSources = { analyserNotice: analyserNotice, analyserBrochure: analyserBrochure,
        chercher: chercher, lireCache: lireCache, urls: DOCS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
