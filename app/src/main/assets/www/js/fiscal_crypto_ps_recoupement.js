/* Prélèvements sociaux des cessions crypto PRIVÉES : recoupement millésimé.

   Aucun texte DGFiP unique n'attribue un taux de PS à l'année de cession :
     - BOFiP BOI-RPPM-PVBMC-30-30 (version publiée le 23/04/2024) : 12,8 % +
       « prélèvements sociaux sur les revenus du patrimoine au taux global de
       17,2 % », soit 30 % ; il ne date pas ce taux par année de cession ;
     - FAQ DGFiP actifs numériques (modifiée le 17/07/2026) : PFU 31,4 %
       (12,8 % + 18,6 %) ; page courante, sans année de cession ;
     - brochure DGFiP « Principales nouveautés revenus 2025 » : CSG portée de
       9,2 % à 10,6 % sur les revenus du patrimoine, « à compter des revenus
       2025 déclarés en 2026 », exceptions limitativement énumérées.

   Ce module ne prend donc JAMAIS la FAQ courante pour une preuve de 2025.
   Il compose deux textes du bon millésime et renvoie un statut explicite :
     - « recoupement » : dérivation documentée, affichée, JAMAIS activée ;
     - « partiel » : un maillon manque, la contradiction est signalée ;
     - « établi » : seulement si un texte date lui-même le taux.

   La FAQ n'intervient qu'en CORROBORATION : si elle contredit le taux dérivé,
   la contradiction est signalée et le recoupement est rétrogradé. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};

    var IDENTIFIANT = 'BOI-RPPM-PVBMC-30-30';
    /* PERMALIEN versionné, et non l'URL courte /doctrine/ : le pont Android
       (NativeBridge) ne suit une redirection BOFiP que pour la série
       BOI-IR-LIQ-20-*. Un permalien sans redirection fonctionne donc sur
       l'APK déjà publiée. Contrepartie assumée : la version lue est figée au
       23/04/2024 ; si la DGFiP republie ce BOI avec un taux daté par année de
       cession, il faudra mettre à jour cette URL — la date de publication est
       de toute façon relue et conservée avec l'extrait. */
    var PERMALIEN_2024 = 'https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant='
        + IDENTIFIANT + '-20240423';
    var URL_BOFIP = PERMALIEN_2024;
    var URL_BROCHURE = 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf';
    var CLE = 'pf2.dgfip.crypto.ps.recoupement.v1.';

    function normaliser(s) {
        return String(s || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;|&#160;|&#8239;/gi, ' ')
            .replace(/&[a-z]+;|&#\d+;/gi, function (e) {
                return ({ '&euro;': '€', '&rsquo;': '’', '&eacute;': 'é', '&egrave;': 'è',
                    '&agrave;': 'à', '&ecirc;': 'ê', '&amp;': '&' })[e.toLowerCase()] || ' ';
            }).replace(/[\u00ad\u2010-\u2015]/g, '-').replace(/[’‘]/g, "'")
            .replace(/\s+/g, ' ').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    function taux(s) { return Math.round(Number(String(s).replace(',', '.')) * 10) / 1000; }

    /* Lecture du BOFiP crypto : qualification, taux publiés et DATE de la
       version. Sans date de publication, aucune attribution n'est possible. */
    function analyserBofip(html) {
        var t = normaliser(html);
        if (!new RegExp('Identifiant juridique\\s*:\\s*' + IDENTIFIANT, 'i').test(t))
            return { etat: 'BOFiP ' + IDENTIFIANT + ' non reconnu' };
        var pub = t.match(/Date de debut de publication du BOI\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (!pub) return { etat: 'date de publication du BOFiP absente : aucune attribution par année' };
        if (!/article\s+150\s+VH\s+bis/i.test(t))
            return { etat: 'article 150 VH bis absent : régime crypto non confirmé' };
        // Fenêtre bornée autour du paragraphe d'imposition : les renvois
        // « (CGI, art. 200 C) » contiennent des points, on ne découpe donc pas
        // à la première période. La borne interdit d'aller chercher un taux
        // dans une autre section du BOFiP.
        var repere = t.search(/plus-values des particuliers entrant dans le champ/i);
        if (repere < 0) return { etat: 'paragraphe d’imposition du BOFiP non identifié' };
        var corps = t.slice(repere, repere + 700);
        var ir = corps.match(/taux forfaitaire de\s*(12[,.]8)\s*%/i);
        // La QUALIFICATION est le maillon décisif : elle fixe la date d'effet
        // (revenus du patrimoine : revenus 2025 ; produits de placement : 1.1.2026).
        var patrimoine = /prelevements sociaux sur les revenus du patrimoine/i.test(corps);
        var placement = /prelevements sociaux sur les produits de placement/i.test(corps);
        var global = corps.match(/taux global de\s*(17[,.]2|18[,.]6)\s*%/i);
        var pfu = corps.match(/imposees a un taux global de\s*(30|31[,.]4)\s*%/i);
        if (!ir || !global || !pfu) return { etat: 'taux IR ou PS du BOFiP non reconnus' };
        if (!patrimoine && !placement)
            return { etat: 'qualification des prélèvements sociaux absente du BOFiP' };
        if (placement && !patrimoine)
            return { etat: 'BOFiP qualifiant ces gains de produits de placement : date d’effet différente, recoupement refusé' };
        var valeurs = { identifiant: IDENTIFIANT, publication: pub[1],
            version: pub[1].split('/').reverse().join(''),
            qualification: 'revenus du patrimoine', ir: taux(ir[1]), psGlobal: taux(global[1]),
            pfuGlobal: taux(pfu[1]), url: PERMALIEN_2024,
            anneeEffetAttestee: null };
        if (Math.abs(valeurs.ir + valeurs.psGlobal - valeurs.pfuGlobal) > 1e-6)
            return { etat: 'BOFiP : IR + PS différents du taux global publié' };
        if (valeurs.psGlobal !== .172 && valeurs.psGlobal !== .186)
            return { etat: 'BOFiP : taux de PS inattendu (' + valeurs.psGlobal + ')' };
        return { etat: valeurs.psGlobal === .172
                ? 'BOFiP lu : 17,2 % sur revenus du patrimoine, version du ' + valeurs.publication
                    + ', taux non daté par année de cession'
                : 'BOFiP lu : 18,6 %, version du ' + valeurs.publication + ', taux non daté par année de cession',
            valeurs: valeurs,
            // Extrait borné aux deux phrases probantes : jamais le BOFiP entier.
            extrait: 'Identifiant juridique : ' + IDENTIFIANT + '. Date de début de publication du BOI : '
                + valeurs.publication + '. ' + corps.slice(0, pfu.index + pfu[0].length) + '.' };
    }

    /* Vérification de la liste d'exceptions de la brochure : si les actifs
       numériques y figuraient, le recoupement serait faux. */
    function exceptionsBrochure(textePdf) {
        var t = normaliser(Array.isArray(textePdf) ? textePdf.join(' ') : textePdf);
        var m = t.match(/(Les revenus fonciers[^.]{0,220}?restent soumis au taux de\s*9[,.]2\s*%)/i);
        if (!m) return null;
        var phrase = m[1];
        var cryptoExclue = /actifs? numeriques|crypto|150\s*VH\s*bis/i.test(phrase);
        return { phrase: phrase, cryptoExclue: cryptoExclue,
            mobilieresExclues: /plus.values mobilieres|valeurs mobilieres/i.test(phrase) };
    }

    /* Composition des deux textes. Chaque maillon est nommé ; s'il manque, le
       statut retombe sur « partiel » et aucun taux n'est produit. */
    function recouper(bofip, brochure, annee, options) {
        var o = options || {};
        var m = PF.fiscalCouverture && PF.fiscalCouverture.millésime
            ? PF.fiscalCouverture.millésime(annee) : null;
        if (!m) return { statut: 'partiel', taux: null, etat: 'millésime non pris en charge', maillons: [] };
        if (!m.documentsAttendus) return { statut: 'partiel', taux: null,
            etat: 'documents du millésime revenus ' + annee + ' non publiés', maillons: [] };

        var maillons = [], refus = [];
        function poser(nom, ok, detail) {
            maillons.push({ nom: nom, verifie: !!ok, detail: detail || '' });
            if (!ok) refus.push(nom);
        }

        var b = bofip && bofip.valeurs, br = brochure && brochure.valeurs;
        poser('BOFiP crypto lu et daté', !!(b && b.publication), b ? 'version du ' + b.publication : 'BOFiP non lu');
        poser('qualification « revenus du patrimoine »', !!(b && b.qualification === 'revenus du patrimoine'),
            b ? b.qualification : 'absente');
        poser('taux global PS publié par le BOFiP', !!(b && (b.psGlobal === .172 || b.psGlobal === .186)),
            b ? b.psGlobal : 'absent');
        poser('brochure du millésime revenus ' + annee, !!(br && br.revenus === annee),
            br ? 'revenus ' + br.revenus + ', déclaration ' + br.declaration : 'brochure non lue');
        poser('hausse de CSG datée des revenus ' + annee,
            !!(br && typeof br.effetPatrimoine === 'string'
                && br.effetPatrimoine.indexOf('revenus ' + annee) >= 0),
            br ? br.effetPatrimoine : 'calendrier absent');
        poser('CSG ancienne et nouvelle lisibles',
            !!(br && br.ancienTauxCsg === .092 && br.nouveauTauxCsg === .106),
            br ? br.ancienTauxCsg + ' → ' + br.nouveauTauxCsg : 'taux CSG absents');
        var exc = o.exceptions || null;
        poser('liste d’exceptions vérifiée', !!exc, exc ? exc.phrase : 'extrait de la brochure indisponible');
        poser('actifs numériques HORS de la liste d’exceptions', !!(exc && !exc.cryptoExclue),
            exc ? (exc.cryptoExclue ? 'les actifs numériques figurent dans les exceptions' : 'aucune mention des actifs numériques') : '');

        if (refus.length) {
            return { statut: 'partiel', taux: null, maillons: maillons,
                etat: 'recoupement PS crypto refusé : ' + refus.join(', '),
                sources: sources(b, br) };
        }

        var delta = br.nouveauTauxCsg - br.ancienTauxCsg;
        var derive = Math.round((b.psGlobal + delta) * 10000) / 10000;
        if (Math.abs(derive - .186) > 1e-9) {
            return { statut: 'partiel', taux: null, maillons: maillons,
                etat: 'dérivation incohérente : ' + b.psGlobal + ' + ' + delta + ' ≠ 18,6 %',
                sources: sources(b, br) };
        }
        var derivation = 'BOFiP ' + b.identifiant + ' (version ' + b.publication + ') : PS sur les revenus du '
            + 'patrimoine au taux global de ' + pct(b.psGlobal) + '. Brochure nouveautés revenus ' + annee
            + ' : CSG portée de ' + pct(br.ancienTauxCsg) + ' à ' + pct(br.nouveauTauxCsg) + ' sur les revenus du '
            + 'patrimoine à compter des revenus ' + annee + ' déclarés en ' + (annee + 1) + ', actifs numériques hors '
            + 'de la liste d’exceptions. Donc ' + pct(b.psGlobal) + ' + ' + pct(delta) + ' = ' + pct(derive)
            + ' pour les cessions de ' + annee + '.';

        // Corroboration : la FAQ n'est PAS la preuve. Une divergence la fait
        // rétrograder le recoupement en « partiel » et signale la contradiction.
        var faq = o.faq && o.faq.valeurs;
        var contradiction = faq && Math.abs(faq.psCourant - derive) > 1e-9;
        if (contradiction) {
            return { statut: 'partiel', taux: null, maillons: maillons, derivation: derivation,
                etat: 'contradiction documentaire : recoupement ' + pct(derive)
                    + ' contre FAQ courante ' + pct(faq.psCourant) + ' (modifiée le ' + faq.dateModification + ')',
                sources: sources(b, br), contradictions: [faq] };
        }
        return {
            statut: 'recoupement', taux: derive, anneeEffet: annee,
            anneeRevenus: annee, anneeDeclaration: annee + 1,
            maillons: maillons, derivation: derivation,
            sources: sources(b, br),
            corroboration: faq ? { valeur: faq.psCourant, publication: 'FAQ modifiée le ' + faq.dateModification,
                portee: 'page courante, sans année de cession : corroboration, jamais preuve' } : null,
            contradictionBofip: b.psGlobal === .172
                ? 'le BOFiP crypto (version ' + b.publication + ') affiche encore ' + pct(b.psGlobal)
                    + ' et n’est pas daté par année de cession : contradiction non levée par un texte unique'
                : null,
            exclusions: ['FAQ courante non attribuée à ' + annee,
                'produits de placement : hausse au 1.1.' + (annee + 1) + ', pas aux revenus ' + annee,
                'revenus fonciers, plus-values immobilières, assurance-vie, épargne logement : 9,2 % maintenus',
                'aucun taux activé dans la simulation par ce recoupement'],
            // Aucune activation automatique : le moteur conserve sa valeur et la
            // R2 publiée reste prioritaire. `active` reste false par conception.
            active: false,
            etat: 'PS crypto revenus ' + annee + ' établis par recoupement de deux textes DGFiP ; '
                + 'aucun taux activé, contradiction BOFiP signalée'
        };
    }

    function pct(x) {
        return (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',') + ' %';
    }
    function sources(b, br) {
        var s = [];
        if (b) s.push({ role: 'qualification et taux publié', url: b.url || PERMALIEN_2024,
            identifiant: b.identifiant, publication: b.publication });
        if (br) s.push({ role: 'hausse de CSG et calendrier', url: URL_BROCHURE,
            identifiant: 'Brochure IR « Principales nouveautés revenus 2025 »', publication: 'déclaration 2026' });
        return s;
    }

    function compte() {
        var u = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        return u && /^[a-f\d-]{36}$/i.test(u.id || '') ? u.id : null;
    }

    function lireCache(annee) {
        var id = compte();
        if (!id || !root.localStorage) return null;
        try {
            var h = JSON.parse(root.localStorage.getItem(CLE + id) || '{}');
            var revisions = h[annee], r = Array.isArray(revisions) && revisions[revisions.length - 1];
            if (!r || r.annee_revenus !== annee || r.url_bofip !== URL_BOFIP) return null;
            var bofip = analyserBofip(r.extrait_bofip);
            var brochure = PF.fiscalBrochureSources && PF.fiscalBrochureSources.analyser
                ? PF.fiscalBrochureSources.analyser(r.extrait_brochure_pages || r.extrait_brochure) : null;
            if (!bofip.valeurs || !brochure || !brochure.valeurs) return null;
            var res = recouper(bofip, brochure, annee, {
                exceptions: exceptionsBrochure(r.extrait_brochure_pages || r.extrait_brochure) });
            return res.statut === 'partiel' ? null : res;
        } catch (_) { return null; }
    }

    function chercher(annee) {
        if (!Number.isInteger(annee) || annee < 2023 || annee > new Date().getFullYear())
            return Promise.reject(new Error('Millésime PS crypto invalide.'));
        var id = compte();
        if (!id) return Promise.reject(new Error('Session requise pour le recoupement PS crypto.'));
        var m = PF.fiscalCouverture.millésime(annee);
        if (!m || !m.documentsAttendus) {
            return Promise.resolve({ statut: 'partiel', taux: null, enregistree: false,
                etat: 'revenus ' + annee + ' : documents du millésime non publiés, taux non établi' });
        }
        if (annee !== 2025) {
            // 2023/2024 : le BOFiP affiche 17,2 % sans dater par année de
            // cession et la brochure revenus 2025 ne parle pas de ces millésimes.
            return Promise.resolve({ statut: 'partiel', taux: null, enregistree: false,
                etat: 'revenus ' + annee + ' : aucune source DGFiP ne date le taux PS crypto de ce millésime ; '
                    + 'le BOFiP courant (17,2 %) n’est pas attribué à ' + annee });
        }
        var faq = PF.fiscalCryptoSources && PF.fiscalCryptoSources.lireCache
            ? PF.fiscalCryptoSources.lireCache() : null;
        return PF.net.req('GET', URL_BOFIP, { Accept: 'text/html' }).then(function (rep) {
            if (!rep.ok || !rep.body) throw new Error('BOFiP inaccessible');
            var bofip = analyserBofip(rep.body);
            if (!bofip.valeurs) return { statut: 'partiel', taux: null, enregistree: false,
                etat: bofip.etat, url: URL_BOFIP };
            return PF.net.reqPdf(URL_BROCHURE).then(function (pdf) {
                if (!pdf.ok || !pdf.binary_b64) throw new Error(pdf.error || 'brochure PDF inaccessible');
                return PF.fiscalBrochureSources.extrairePages(pdf.binary_b64);
            }).then(function (pages) {
                var brochure = PF.fiscalBrochureSources.analyser(pages);
                var resultat = recouper(bofip, brochure, annee, {
                    exceptions: exceptionsBrochure(pages),
                    faq: faq ? { valeurs: faq } : null });
                resultat.enregistree = false;
                resultat.url = URL_BOFIP;
                if (compte() !== id) throw new Error('Session changée : recoupement PS crypto annulé.');
                if (!root.localStorage || !brochure.valeurs) return resultat;
                var pagesExtrait = (Array.isArray(pages) ? pages : [pages]).map(function (p) { return String(p || ''); });
                var cle = CLE + id, h;
                try { h = JSON.parse(root.localStorage.getItem(cle) || '{}'); } catch (_) { h = {}; }
                var revisions = Array.isArray(h[annee]) ? h[annee] : [];
                var precedent = revisions[revisions.length - 1];
                var nouveau = { annee_revenus: annee, annee_declaration: annee + 1, url_bofip: URL_BOFIP,
                    url_brochure: URL_BROCHURE, extrait_bofip: bofip.extrait,
                    extrait_brochure_pages: pagesExtrait, statut: resultat.statut, taux: resultat.taux };
                // Rectifications et révisions du même millésime conservées. Une
                // URL enregistrée différente de la source attendue impose aussi
                // une nouvelle révision : un cache altéré n'est jamais relu
                // comme preuve, mais il est réparé en historisant, pas écrasé.
                if (!precedent || precedent.url_bofip !== URL_BOFIP || precedent.url_brochure !== URL_BROCHURE
                    || JSON.stringify(precedent.extrait_bofip) !== JSON.stringify(nouveau.extrait_bofip)
                    || JSON.stringify(precedent.extrait_brochure_pages) !== JSON.stringify(nouveau.extrait_brochure_pages)) {
                    nouveau.revision = revisions.length + 1;
                    nouveau.recupere_le = new Date().toISOString();
                    revisions.push(nouveau);
                }
                h[annee] = revisions;
                try { root.localStorage.setItem(cle, JSON.stringify(h)); }
                catch (_) { return resultat; }
                resultat.enregistree = !!lireCache(annee);
                return resultat;
            });
        }).catch(function (err) {
            if (err && /Session changée/.test(err.message || '')) throw err;
            return { statut: 'partiel', taux: null, enregistree: false, url: URL_BOFIP,
                etat: 'recoupement PS crypto impossible (' + String(err && err.message || err).slice(0, 120) + ')' };
        });
    }

    PF.fiscalCryptoPsRecoupement = {
        analyserBofip: analyserBofip, exceptionsBrochure: exceptionsBrochure, recouper: recouper,
        lireCache: lireCache, chercher: chercher, urls: { bofip: URL_BOFIP, brochure: URL_BROCHURE,
            permalien2024: PERMALIEN_2024 }, IDENTIFIANT: IDENTIFIANT
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
