/* Brochure DGFiP « Principales nouveautés revenus 2025 » : lecture PDF
   expérimentale. Elle constate la hausse de CSG patrimoine / placement et
   son calendrier, SANS en déduire un taux PS crypto ou activer un paramètre. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var URL = 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf';
    var CLE = 'pf2.dgfip.brochure.csg.v1.';

    function normaliser(s) {
        return String(s || '').replace(/\s+/g, ' ').normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    }
    function analyser(textePdf) {
        // PDF.js renvoie les items dans l'ordre de dessin, pas forcément dans
        // l'ordre de lecture : sur le PDF DGFiP, le titre « revenus 2025 » est
        // dessiné APRÈS le paragraphe CSG et « NOUVEAUT É S » est scindé.
        // Exiger titre et passage sur la MÊME page interdit de prendre une
        // règle de 2026 sur la page suivante pour une règle de 2025.
        var pages = (Array.isArray(textePdf) ? textePdf : [textePdf]).map(normaliser);
        var candidats = pages.filter(function (t) {
            return /PRINCIPALES\s+NOUVEAUT\s*E\s*S\s+REVENUS\s+2025\b/i.test(t)
                && !/PRINCIPALES\s+NOUVEAUT\s*E\s*S\s+REVENUS\s+2026\s*&\s*SUIVANTS/i.test(t);
        });
        if (candidats.length !== 1) return { etat: 'rubrique revenus 2025 non reconnue sur une page unique du PDF' };
        var section = candidats[0];
        var bloc = section.match(/Prelevements sociaux\s+(Le taux de la CSG est porte[\s\S]{0,950}?\(LFSS 2026, art\.\s*12\s*;\s*CSS, art\.\s*L\s*136-8\))/i);
        if (!bloc) return { etat: 'section prélèvements sociaux du PDF non reconnue' };
        var s = bloc[1];
        var hausse = s.match(/CSG est porte de\s*(9[,.]2)\s*%\s*a\s*(10[,.]6)\s*%\s*sur les revenus du patrimoine et les produits de placement/i);
        var reserve = /revenus fonciers, les plus.values immobilieres, l.assurance.vie, l.epargne logement restent soumis au taux de\s*9[,.]2\s*%/i.test(s);
        var deduct = /taux de CSG deductible reste a\s*(6[,.]8)\s*%/i.test(s);
        var effet = /hausse de la CSG s.applique a compter des revenus 2025 declares en 2026 pour les revenus du patrimoine et a compter du\s*1[./]1[./]2026 pour les produits de placement/i.test(s);
        if (!hausse || !reserve || !deduct || !effet)
            return { etat: 'preuves PDF incomplètes (hausse=' + !!hausse + ', exceptions=' + reserve
                + ', déductibilité=' + deduct + ', calendrier=' + effet + ')' };
        return { etat: 'brochure revenus 2025 lue : portée partielle, aucun taux crypto attribué',
            valeurs: { revenus: 2025, declaration: 2026, ancienTauxCsg: .092, nouveauTauxCsg: .106,
                csgDeductibleMentionnee: .068, effetPatrimoine: 'revenus 2025 déclarés en 2026',
                effetPlacement: 'à compter du 1.1.2026', psCrypto2025Attestes: false },
            extrait: 'Prelevements sociaux ' + s + ' PRINCIPALES NOUVEAUTES REVENUS 2025' };
    }
    function compte() {
        var u = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        return u && /^[a-f\d-]{36}$/i.test(u.id || '') ? u.id : null;
    }
    function lireCache() {
        var id = compte();
        if (!id || !root.localStorage) return null;
        try {
            var h = JSON.parse(root.localStorage.getItem(CLE + id) || '[]');
            var r = Array.isArray(h) && h[h.length - 1];
            var a = r && r.url === URL && r.annee_revenus === 2025 && analyser(r.extrait);
            return a && a.valeurs || null;
        } catch (_) { return null; }
    }
    function extraire(b64) {
        if (typeof b64 !== 'string' || !b64.length || b64.length > 2 * 1024 * 1024 * 4 / 3 + 4)
            return Promise.reject(new Error('PDF absent ou trop volumineux'));
        if (!root.pdfjsLib) return Promise.reject(new Error('Lecteur PDF indisponible'));
        var bin = root.atob(b64), octets = new Uint8Array(bin.length);
        if (bin.slice(0, 5) !== '%PDF-') return Promise.reject(new Error('Réponse non PDF'));
        for (var i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
        root.pdfjsLib.GlobalWorkerOptions.workerSrc = root.pdfjsWorkerSrc || 'vendor/pdfjs/pdf.worker.min.js';
        var chargement = root.pdfjsLib.getDocument({ data: octets, useSystemFonts: true,
            isEvalSupported: false });
        return chargement.promise.then(function (pdf) {
            if (pdf.numPages < 1 || pdf.numPages > 20) throw new Error('Nombre de pages inattendu');
            var pages = [];
            // Ne pas présumer que le premier feuillet suffit (édition rectifiée).
            for (var page = 1; page <= pdf.numPages; page++) {
                (function (n) { pages.push(pdf.getPage(n).then(function (p) {
                    return p.getTextContent().then(function (c) {
                        return c.items.map(function (i) { return i.str; }).join(' ');
                    });
                })); })(page);
            }
            return Promise.all(pages).then(function (contenu) {
                return pdf.destroy().then(function () { return contenu; });
            });
        });
    }
    function chercher(annee) {
        if (!Number.isInteger(annee) || annee < 2023 || annee > new Date().getFullYear())
            return Promise.reject(new Error('Année de brochure invalide.'));
        var id = compte();
        if (!id) return Promise.reject(new Error('Session requise pour la brochure.'));
        if (annee !== 2025) return Promise.resolve({ etat: 'brochure de ce millésime non prise en charge',
            enregistree: false, url: null });
        return PF.net.reqPdf(URL).then(function (rep) {
            if (!rep.ok || !rep.binary_b64) throw new Error(rep.error || 'PDF inaccessible');
            return extraire(rep.binary_b64);
        }).then(function (texte) {
            var analyse = analyser(texte);
            if (compte() !== id) throw new Error('Session changée : brochure annulée.');
            if (!root.localStorage || !analyse.valeurs)
                return { etat: analyse.etat, enregistree: false, url: URL };
            if (!analyser(analyse.extrait).valeurs)
                return { etat: 'preuve PDF impossible à relire', enregistree: false, url: URL };
            var cle = CLE + id, historique;
            try { historique = JSON.parse(root.localStorage.getItem(cle) || '[]'); }
            catch (_) { historique = []; }
            if (!Array.isArray(historique)) historique = [];
            var dernier = historique[historique.length - 1];
            if (!dernier || dernier.extrait !== analyse.extrait)
                historique.push({ url: URL, extrait: analyse.extrait, annee_revenus: 2025,
                    annee_declaration: 2026, revision: historique.length + 1,
                    recupere_le: new Date().toISOString() });
            try { root.localStorage.setItem(cle, JSON.stringify(historique)); }
            catch (_) { return { etat: analyse.etat, enregistree: false, url: URL }; }
            return { etat: analyse.etat, enregistree: true, valeurs: lireCache(), url: URL };
        }).catch(function (err) {
            if (err && /Session changée/.test(err.message || '')) throw err;
            return { etat: 'PDF DGFiP non disponible (' + String(err && err.message || err).slice(0, 100) + ')',
                enregistree: false, url: URL };
        });
    }
    // Même extraction binaire bornée pour la notice 2086 et la brochure des PV.
    PF.fiscalBrochureSources = { analyser: analyser, lireCache: lireCache, chercher: chercher,
        extrairePages: extraire, url: URL };
})(typeof globalThis !== 'undefined' ? globalThis : this);
