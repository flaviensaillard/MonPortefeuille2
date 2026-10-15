/* Matrice de couverture fiscale par MILLÉSIME et par CATÉGORIE.

   Trois dates distinctes, jamais confondues :
     - année des REVENUS (le millésime imposable, ex. 2025) ;
     - année de DÉCLARATION (ex. 2026 pour les revenus 2025) ;
     - date de PUBLICATION du document DGFiP effectivement lu.

   Règles impératives de ce module :
     1. Une constante embarquée dans le code n'est JAMAIS une preuve. Elle
        produit « non disponible », pas une mise à jour officielle.
     2. Une preuve d'un autre millésime est refusée : aucune reconduction
        silencieuse d'une année sur l'autre.
     3. Une collecte partielle n'est pas une révision complète : le drapeau
        `basculeComplete` reste faux tant qu'une catégorie n'est pas établie.
     4. Un « recoupement » (dérivation documentée de plusieurs textes DGFiP)
        est un statut distinct d'un texte explicite ; il n'active rien.
     5. Les rectifications et révisions d'un même millésime sont conservées :
        ce module lit la dernière révision valide, sans écraser l'historique.

   Aucune donnée personnelle ni aucun taux de PAS ne transitent ici. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};

    var STATUTS = {
        ETABLI: 'établi',                 // texte DGFiP du millésime, attribution explicite
        RECOUPEMENT: 'recoupement',       // dérivation documentée de >= 2 textes DGFiP
        PARTIEL: 'partiel',               // document lu, portée insuffisante pour activer
        NON_DISPONIBLE: 'non disponible'  // aucune preuve de ce millésime
    };
    var ETABLIS = [STATUTS.ETABLI, STATUTS.RECOUPEMENT];

    /* Millésimes pris en charge. `documentsAttendus` est faux pour 2026 : les
       brochures et aides du millésime « revenus 2026 » n'existent pas encore,
       donc rien ne peut y être établi, même partiellement. */
    var MILLESIMES = {
        2023: { revenus: 2023, declaration: 2024, publicationBoi: '18/06/2024', documentsAttendus: true },
        2024: { revenus: 2024, declaration: 2025, publicationBoi: '14/04/2025', documentsAttendus: true },
        2025: { revenus: 2025, declaration: 2026, publicationBoi: '07/04/2026', documentsAttendus: true },
        2026: { revenus: 2026, declaration: 2027, publicationBoi: null, documentsAttendus: false }
    };

    var CATEGORIES = [
        { id: 'ir_bareme', libelle: 'Barème IR (tranches et taux)', moteur: 'baremeDe' },
        { id: 'decote', libelle: 'Décote (seuils, base, 45,25 %)', moteur: 'baremeDe' },
        { id: 'qf_general', libelle: 'Plafond général du quotient familial', moteur: 'plafondQF' },
        { id: 'qf_speciaux', libelle: 'Plafonds QF particuliers (parent isolé, invalidité, demi-parts majorées)', moteur: 'non modélisé' },
        { id: 'frais_abattement', libelle: 'Abattement salariés 10 % (plancher/plafond)', moteur: 'abattement10' },
        { id: 'frais_repas', libelle: 'Forfait repas salariés', moteur: 'fraisRepas' },
        { id: 'frais_km', libelle: 'Barème kilométrique voitures 3 à 7 CV', moteur: 'fraisKilometriques' },
        { id: 'ps_titres', libelle: 'PS sur plus-values de titres', moteur: 'tauxPS' },
        { id: 'ps_crypto', libelle: 'PS sur cessions crypto privées (150 VH bis)', moteur: 'comparerOptionsFoyer' },
        { id: 'rcm_precompte', libelle: 'RCM par produit, année et réalité du précompte (2CG/2BH/2DF, option 2OP du foyer)', moteur: 'tauxPSRevenuMobilier' },
        { id: 'csg_deductible', libelle: 'CSG déductible et calendrier (6DE, anti double compte 2BH/2DF)', moteur: 'tauxCsg' },
        { id: 'crypto_2086_foyer', libelle: 'Annexe 2086 à l’échelle du FOYER (formule, frais, seuil, cases 3AN/3BN, option 3CN)', moteur: 'detail2086' },
        { id: 'formules_arrondis', libelle: 'Changements de formule et arrondis par millésime', moteur: 'euro2025' }
    ];

    function millésime(annee) {
        return Number.isInteger(annee) ? MILLESIMES[annee] || null : null;
    }
    function categories() { return CATEGORIES.map(function (c) { return c.id; }); }

    /* Contrôle de millésime : la preuve doit porter l'année des REVENUS
       demandée. Une preuve sans année, ou d'une autre année, est refusée. */
    function preuveDuMillesime(preuve, annee) {
        if (!preuve || typeof preuve !== 'object') return false;
        var candidate = preuve.revenus !== undefined ? preuve.revenus
            : preuve.annee_revenus !== undefined ? preuve.annee_revenus
                : preuve.anneeRevenus !== undefined ? preuve.anneeRevenus
                    : preuve.annee;
        return candidate === annee;
    }

    function cellule(statut, o) {
        var c = { statut: statut, valeur: null, source: null, publication: null,
            anneeEffet: null, exclusions: [], note: '' };
        Object.keys(o || {}).forEach(function (k) { c[k] = o[k]; });
        return c;
    }

    var EMBARQUE = 'valeur embarquée dans le code : ce n’est pas une mise à jour officielle';

    /* Preuve issue d'un PDF DGFiP. Deux formes circulent dans l'application :
       le résultat d'une collecte (`{ etat, valeurs }`) et le contenu du cache
       (les valeurs seules). Les deux sont acceptées, à deux conditions : l'objet
       porte des valeurs, et ces valeurs sont celles du millésime demandé. Une
       preuve d'une autre année n'établit jamais une case. */
    function valeursPdf(preuve, annee) {
        if (!preuve || typeof preuve !== 'object') return null;
        var v = preuve.valeurs && typeof preuve.valeurs === 'object' ? preuve.valeurs : preuve;
        if (!v || typeof v !== 'object' || v.revenus !== annee) return null;
        return v;
    }

    /* `preuves` décrit ce qui a été réellement LU pour ce millésime. Toute
       clé absente vaut « non lu ». Une R2 publiée reste prioritaire mais ne
       transforme pas une catégorie non établie en catégorie établie : elle est
       signalée séparément par `revisionPubliee`. */
    function evaluer(annee, preuves) {
        var m = millésime(annee);
        if (!m) throw new Error('Millésime non pris en charge par la matrice : ' + annee + '.');
        var p = preuves || {};
        var boi = p.boi || {}, frais = p.frais || {}, sourcesBoi = boi.sources || {};
        var titres = p.titres || null, recoupement = p.recoupementPsCrypto || null;
        var futur = !m.documentsAttendus;
        var cellules = {};

        function bofip(nom, valeur, cheminMoteur) {
            if (futur || !valeur) {
                return cellule(STATUTS.NON_DISPONIBLE, { note: futur
                    ? 'documents du millésime revenus ' + annee + ' non publiés : rien n’est établi'
                    : EMBARQUE + ' ; ' + cheminMoteur + ' refuse ce millésime sans preuve'
                        + noteDivergence(nom, annee) });
            }
            var src = sourcesBoi[nom] || null;
            return cellule(STATUTS.ETABLI, { valeur: valeur, source: src && src.url || null,
                publication: src && src.datePublication || m.publicationBoi, anneeEffet: annee,
                note: 'texte du millésime revenus ' + annee });
        }

        cellules.ir_bareme = bofip('ir', boi.ir && boi.ir.tranches ? boi.ir : null, 'baremeDe');
        cellules.decote = bofip('decote', boi.decote || null, 'baremeDe');
        cellules.qf_general = bofip('qf', typeof boi.qf === 'number' ? boi.qf : null, 'plafondQF');

        // Plafonds particuliers : jamais modélisés, quel que soit le millésime.
        cellules.qf_speciaux = cellule(STATUTS.NON_DISPONIBLE, {
            note: 'plafonds particuliers non modélisés ; le bilan et la recommandation 2OP '
                + 'ne sont pas certifiés pour un parent isolé, une invalidité ou une demi-part majorée',
            exclusions: ['case T parent isolé', 'invalidité', 'anciens combattants', 'veuvage'] });

        function fraisOfficiel(nom, valeur, url) {
            if (futur || !valeur) return cellule(STATUTS.NON_DISPONIBLE, { note: futur
                ? 'documents du millésime revenus ' + annee + ' non publiés' : EMBARQUE });
            return cellule(STATUTS.ETABLI, { valeur: valeur, source: url || null,
                publication: m.publicationBoi, anneeEffet: annee,
                note: 'année des revenus ' + annee + ' explicite dans la page d’aide' });
        }
        cellules.frais_abattement = fraisOfficiel('abatt', frais.abatt || null, p.urls && p.urls.frais);
        cellules.frais_repas = fraisOfficiel('repas', typeof frais.repas === 'number' ? frais.repas : null,
            p.urls && p.urls.repas);
        cellules.frais_km = fraisOfficiel('km', frais.km || null, p.urls && p.urls.frais);

        // PS titres : l'aide du simulateur de la DÉCLARATION annee+1 attribue le
        // taux aux revenus `annee` (« Si, en <annee>, vous ... avez vendu »).
        if (futur || !titres || !titres.ps) {
            cellules.ps_titres = cellule(STATUTS.NON_DISPONIBLE, { note: futur
                ? 'aide du simulateur de la déclaration ' + m.declaration + ' non publiée pour les revenus ' + annee
                : EMBARQUE + ' ; divergence DGFiP éventuelle non levée' });
        } else if (p.urls && p.urls.gains && String(p.urls.gains).indexOf('/' + m.declaration + '/') < 0) {
            // Anti-reconduction : l'aide lue doit être celle de la DÉCLARATION
            // annee+1, pas celle d'un autre millésime.
            cellules.ps_titres = cellule(STATUTS.NON_DISPONIBLE, {
                note: 'preuve lue hors du millésime de déclaration ' + m.declaration });
        } else {
            cellules.ps_titres = cellule(STATUTS.ETABLI, { valeur: titres.ps, source: p.urls && p.urls.gains || null,
                publication: 'aide de la déclaration ' + m.declaration + ' (date de mise en ligne non indiquée)',
                anneeEffet: annee,
                exclusions: annee === 2025 ? ['notice 2042 affichant 17,2 % : divergence documentaire non levée'] : [],
                note: 'IR ' + titres.ir + ' + PS ' + titres.ps + ' = PFU ' + titres.pfu });
        }

        // PS crypto privées : voir fiscal_crypto_ps_recoupement.js.
        cellules.ps_crypto = evaluerPsCrypto(annee, m, p, recoupement, futur);

        // RCM : les brochures établissent des RÈGLES, jamais les produits, les
        // dates ni la réalité du précompte du foyer.
        var rcmRegles = !!valeursPdf(p.brochureRcm, annee);
        cellules.rcm_precompte = cellule(rcmRegles && !futur ? STATUTS.PARTIEL : STATUTS.NON_DISPONIBLE, {
            valeur: null, source: p.urls && p.urls.brochureRcm || null,
            publication: rcmRegles ? m.publicationBoi : null, anneeEffet: rcmRegles ? annee : null,
            exclusions: ['produit et nature du revenu', 'réalité du précompte', 'date de paiement',
                'option 2OP du foyer', 'exceptions assurance-vie / CEL-PEL / PEP'],
            note: rcmRegles
                ? 'règles 2CG/2BH/2DF lues ; aucune CSG déductible personnelle ne peut être calculée '
                    + 'à partir de la seule lecture des brochures'
                : 'aucun document de ce millésime lu ; le précompte doit être indiqué par le propriétaire' });

        // CSG : trois calendriers distincts, jamais additionnés.
        var charges = !!valeursPdf(p.chargesRcm, annee);
        cellules.csg_deductible = cellule(charges && !futur ? STATUTS.PARTIEL : STATUTS.NON_DISPONIBLE, {
            valeur: null, source: p.urls && p.urls.charges || null,
            publication: charges ? m.publicationBoi : null, anneeEffet: charges ? annee : null,
            exclusions: ['CSG patrimoine ' + (annee - 1) + ' payée en ' + annee,
                'RCM précomptés en ' + annee,
                'gains ' + annee + ' dont les PS sont acquittés sur l’avis ' + (annee + 1),
                'CSG des lignes 2BH/2DF calculée automatiquement : à ne jamais reporter en 6DE'],
            note: charges ? 'calendrier lu ; déduction personnelle du foyer non établie'
                : 'aucun document de ce millésime lu' });

        // 2086 : la formule et les cases sont relues, l'exhaustivité du FOYER
        // ne l'est jamais depuis un seul portefeuille.
        var notice = valeursPdf(p.notice2086, annee), brochurePv = valeursPdf(p.brochureCrypto, annee);
        var preuve2086 = notice || brochurePv;
        cellules.crypto_2086_foyer = cellule(preuve2086 && !futur ? STATUTS.PARTIEL : STATUTS.NON_DISPONIBLE, {
            valeur: null, source: p.urls && p.urls.notice2086 || null,
            publication: preuve2086 ? m.publicationBoi : null, anneeEffet: preuve2086 ? annee : null,
            exclusions: ['autres portefeuilles et plateformes du foyer', 'opérations en sursis',
                'cases 3AN/3BN du foyer non certifiées', 'distinction 3CN / 2OP conservée'],
            note: preuve2086
                ? 'formule, frais hors quotient, seuil 305 € du foyer et cases relus ; les opérations du seul '
                    + 'portefeuille ne certifient pas une annexe 2086 exhaustive'
                : 'aucun document de ce millésime lu' });

        // Formules et arrondis : aucun document DGFiP lu ne les établit. Le
        // code applique un arrondi à l'euro pour 2025 seulement ; ce
        // comportement n'est pas une preuve et reste « non disponible ».
        cellules.formules_arrondis = cellule(
            p.formulesArrondis && preuveDuMillesime(p.formulesArrondis, annee) && !futur
                ? STATUTS.ETABLI : STATUTS.NON_DISPONIBLE, {
                valeur: null, source: p.formulesArrondis && p.formulesArrondis.url || null,
                publication: p.formulesArrondis && p.formulesArrondis.publication || null,
                anneeEffet: p.formulesArrondis ? annee : null,
                exclusions: ['arrondi à l’euro des autres millésimes', 'changements de formule non datés'],
                note: annee === 2025
                    ? 'le moteur arrondit à l’euro pour les revenus 2025 seulement ; aucun document DGFiP lu '
                        + 'n’établit les changements de formule et arrondis de ce millésime'
                    : 'changements de formule et arrondis de ce millésime non contrôlés' });

        if (p.revisionPubliee) {
            Object.keys(cellules).forEach(function (id) {
                cellules[id].revisionPubliee = true;
                if (cellules[id].statut === STATUTS.NON_DISPONIBLE) cellules[id].note =
                    'R2 publiée prioritaire pour les revenus ' + annee + ' ; ' + cellules[id].note;
            });
        }
        return cellules;
    }

    function evaluerPsCrypto(annee, m, p, recoupement, futur) {
        if (futur) return cellule(STATUTS.NON_DISPONIBLE, {
            note: 'aucun document du millésime revenus ' + annee + ' : taux non établi' });
        if (recoupement && recoupement.statut === 'établi') {
            return cellule(STATUTS.ETABLI, { valeur: recoupement.taux, source: recoupement.source || null,
                publication: recoupement.publication || null, anneeEffet: annee, note: recoupement.note || '' });
        }
        if (recoupement && recoupement.statut === STATUTS.RECOUPEMENT) {
            return cellule(STATUTS.RECOUPEMENT, { valeur: recoupement.taux,
                source: (recoupement.sources || []).map(function (s) { return s.url; }).join(' + ') || null,
                publication: (recoupement.sources || []).map(function (s) { return s.publication; }).join(' + ') || null,
                anneeEffet: annee, exclusions: recoupement.exclusions || [],
                note: (recoupement.note || '') + ' — aucun taux activé par ce recoupement' });
        }
        var faq = p.cryptoFaq && p.cryptoFaq.valeurs;
        if (recoupement) {
            return cellule(STATUTS.PARTIEL, {
                valeur: null, source: p.urls && p.urls.bofipCrypto || null,
                publication: null, anneeEffet: null,
                exclusions: ['FAQ courante non attribuée à ' + annee,
                    'BOFiP crypto (version 23/04/2024) : 17,2 % non daté par année de cession'],
                note: recoupement.etat || 'recoupement refusé : maillon manquant' });
        }
        if (!faq) return cellule(STATUTS.NON_DISPONIBLE, {
            note: 'aucun document lu pour ce millésime ; ' + EMBARQUE });
        return cellule(STATUTS.PARTIEL, {
            valeur: null, source: faq ? p.urls && p.urls.cryptoFaq || null : null,
            publication: faq ? 'FAQ modifiée le ' + faq.dateModification : null, anneeEffet: null,
            exclusions: ['FAQ non datée par année de cession', 'BOFiP crypto version 23/04/2024 : 17,2 %'],
            note: 'aucune attribution du taux PS à l’année de cession ' + annee });
    }

    /* Contradictions documentaires DGFiP relevées, non tranchées par le code.
       Chaque ligne cite les deux textes et leur date. */
    var CONTRADICTIONS = [
        {
            id: 'ps_crypto_2025', categorie: 'ps_crypto', millesime: 2025,
            resume: 'Taux de prélèvements sociaux des cessions crypto privées de 2025',
            termes: [
                { valeur: '17,2 % (PFU 30 %)', source: 'BOFiP BOI-RPPM-PVBMC-30-30',
                    url: 'https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423',
                    publication: '23/04/2024',
                    passage: '« ainsi qu’aux prélèvements sociaux sur les revenus du patrimoine au taux global de 17,2 %. '
                        + 'Les plus-values concernées sont donc imposées à un taux global de 30 % »',
                    limite: 'ne date pas ce taux par année de cession ; version non mise à jour depuis le 23/04/2024' },
                { valeur: '18,6 % (PFU 31,4 %)', source: 'FAQ DGFiP actifs numériques',
                    url: 'https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques',
                    publication: 'modifiée le 17/07/2026',
                    passage: '« PFU de 31,4 % (12,8 % d’impôt + 18,6 % de prélèvements sociaux) »',
                    limite: 'page courante : aucune année de cession n’est attribuée à ce taux' },
                { valeur: 'CSG 9,2 % → 10,6 % sur les revenus du patrimoine à compter des revenus 2025',
                    source: 'Brochure DGFiP « Principales nouveautés revenus 2025 »',
                    url: 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf',
                    publication: 'déclaration 2026',
                    passage: '« La hausse de la CSG s’applique à compter des revenus 2025 déclarés en 2026 pour les '
                        + 'revenus du patrimoine et à compter du 1.1.2026 pour les produits de placement '
                        + '(LFSS 2026, art. 12 ; CSS, art. L 136-8) »',
                    limite: 'ne nomme pas les actifs numériques ; liste d’exceptions : revenus fonciers, '
                        + 'plus-values immobilières, assurance-vie, épargne logement' }
            ],
            arbitrage: 'Aucun texte DGFiP unique n’attribue un taux PS aux cessions crypto de 2025. '
                + 'La FAQ courante n’est PAS attribuée automatiquement à 2025. Le recoupement '
                + 'BOFiP (qualification « revenus du patrimoine ») + brochure revenus 2025 (CSG 10,6 % '
                + 'dès les revenus 2025, crypto hors liste d’exceptions) donne 17,2 % + 1,4 point = 18,6 %, '
                + 'statut « recoupement » : il est affiché, jamais activé silencieusement.'
        },
        {
            id: 'ps_titres_2025', categorie: 'ps_titres', millesime: 2025,
            resume: 'Taux de PS des plus-values de titres des revenus 2025',
            termes: [
                { valeur: '17,2 %', source: 'Notice 2042 (revenus 2025)', publication: 'déclaration 2026',
                    limite: 'lecture antérieure consignée dans docs/COLLECTE-FISCALE.md' },
                { valeur: '18,6 %', source: 'Aide du simulateur IR-IFI 2026, page « Plus-values et gains divers »',
                    url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/gains.htm',
                    publication: 'déclaration 2026',
                    passage: '« Si, en 2025, vous ou les membres de votre foyer fiscal avez vendu des valeurs '
                        + 'mobilières ... PFU de 12,8 % auquel s’ajoutent les prélèvements sociaux de 18,6 % '
                        + 'soit au total un taux de 31,4 % »',
                    limite: 'page vérifiée le 14/10/2026 ; l’année 2025 est explicite' },
                { valeur: '17,2 %', source: 'Simulateur IR-IFI 2026, page d’accueil du modèle complet '
                        + '(même millésime que l’aide ci-dessus)',
                    url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/complet/index.htm',
                    publication: 'déclaration 2026',
                    passage: '« Si la case 2OP n’est pas cochée, vos revenus de capitaux mobiliers et gains de '
                        + 'cession de valeurs mobilières demeurent soumis à l’imposition au prélèvement forfaitaire '
                        + 'unique (Flat Tax) de 30% (12.8% d’impôt sur le revenu et 17.2% de prélèvements sociaux) »',
                    limite: 'vérifiée le 14/10/2026 : la contradiction est INTERNE au simulateur du millésime 2026' }
            ],
            arbitrage: 'Le lecteur retient l’aide « Plus-values et gains divers », seule page du simulateur qui '
                + 'date explicitement le taux des revenus 2025 (« Si, en 2025 … ») et dont la somme IR + PS = PFU '
                + 'est cohérente (12,8 + 18,6 = 31,4). La page d’accueil du même simulateur et la notice 2042 '
                + 'affichent encore 30 % / 17,2 % : divergence non levée, aucun taux intermédiaire inventé, '
                + 'R2 2025 publiée prioritaire.'
        },
        {
            id: 'seuil_2086_2025', categorie: 'crypto_2086_foyer', millesime: 2025,
            resume: 'Seuil d’exonération des cessions crypto',
            termes: [
                { valeur: '« inférieur ou égal à 305 € »', source: 'Formulaire/notice 2086 revenus 2025',
                    url: 'https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf' },
                { valeur: '« inférieur à 305 € »', source: 'Paragraphe de la même notice', publication: 'déclaration 2026' }
            ],
            arbitrage: 'Le cas d’égalité exacte à 305 € n’est pas tranché par cette lecture ; il est signalé, '
                + 'jamais résolu par une hypothèse.'
        }
    ];

    /* Valeurs EMBARQUÉES dont la divergence avec le BOFiP a été constatée le
       16/10/2026, sur les permaliens que `fiscal_dgfip_sources.js` construit
       lui-même pour ces millésimes. Ce registre ne modifie AUCUNE constante :
       les tests existants figent volontairement les valeurs historiques
       (« aucun recopiage historique sans BOFiP »,
       tests/test_fiscal_maj_indicative.js ; « corrige 11520 historique »,
       tests/test_fiscal_dgfip_activation.js). Son rôle est d'afficher que, sans
       collecte du millésime, la simulation repose sur une valeur qui N'EST PAS
       celle de la DGFiP, et de donner la valeur officielle avec sa source. */
    var DIVERGENCES_CODE = [
        {
            id: 'decote_2023', categorie: 'decote', doc: 'decote', anneeRevenus: 2023,
            url: 'https://bofip.impots.gouv.fr/bofip/2495-PGP.html/identifiant=BOI-IR-LIQ-20-20-30-20240618',
            publication: '2024-06-18', finPublication: '2025-04-14',
            loi: 'loi n° 2023-1322 du 29 décembre 2023 de finances pour 2024, art. 2',
            texteOfficiel: '« Pour l’imposition des revenus de 2023, cette décote est accordée aux '
                + 'contribuables dont la cotisation d’impôt brut est inférieure à 1 929 € pour les '
                + 'contribuables célibataires, divorcés ou veufs et à 3 191 € pour les contribuables '
                + 'soumis à imposition commune (soit respectivement 1/45,25 % de 873 € et 1/45,25 % de '
                + '1 444 €) » ; « le plafond applicable … (873 € pour les contribuables célibataires, '
                + 'divorcés ou veufs et 1 444 € pour les contribuables soumis à imposition commune pour '
                + 'l’imposition des revenus de 2023) »',
            officiel: { dc: 873, dcPlafond: 1929, dcCouple: 1444, dcPlafondCouple: 3191 },
            embarque: { dc: 906, dcPlafond: 2002, dcCouple: 1493, dcPlafondCouple: 3300 },
            ecart: 'décote embarquée 906 € / 1 493 € au lieu de 873 € / 1 444 € (seuils 2 002 € / 3 300 € au lieu de 1 929 € / 3 191 €)',
            ecartCourt: 'décote 906/1 493 € embarqués contre 873/1 444 € officiels',
            effet: 'sans collecte, la décote 2023 est plus élevée que l’officielle : l’impôt 2023 des '
                + 'foyers sous le seuil est sous-évalué',
            arbitrage: 'la collecte du BOFiP « revenus 2023 » remplace les quatre nombres ; aucune '
                + 'constante n’est modifiée par ce registre'
        },
        {
            id: 'bareme_2024', categorie: 'ir_bareme', doc: 'ir', anneeRevenus: 2024,
            url: 'https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20250414',
            publication: '2025-04-14', finPublication: '2026-04-07',
            loi: 'loi n° 2025-127 du 14 février 2025 de finances pour 2025, art. 2, I-A et B',
            texteOfficiel: '« Le barème pour l’imposition des revenus de l’année 2024 est présenté dans '
                + 'le tableau suivant : N’excédant pas 11 497 € 0 % ; Supérieure à 11 497 € et '
                + 'inférieure ou égale à 29 315 € 11 % ; … 83 823 € 30 % ; … 180 294 € 41 % ; '
                + 'Supérieure à 180 294 € 45 % » ; « indexe les limites des tranches de revenus du '
                + 'barème … sur l’évolution de l’IPC hors tabac de 2024 par rapport à 2023, soit 1,8 % »',
            officiel: { tranches: [11497, 29315, 83823, 180294] },
            embarque: { tranches: [11520, 29370, 83984, 180648] },
            ecart: 'les quatre seuils embarqués correspondent aux seuils 2023 multipliés par 1,02, alors '
                + 'que l’indexation officielle des revenus 2024 est de 1,8 % (11 497 / 29 315 / 83 823 / 180 294)',
            ecartCourt: 'tranches 11 520/29 370/83 984/180 648 embarquées (= 2023 × 1,02) contre 11 497/29 315/83 823/180 294 officiels (indexation 1,8 %)',
            effet: 'sans collecte, le barème 2024 est décalé vers le haut : l’impôt 2024 est sous-évalué '
                + 'et la TMI peut basculer sur le mauvais seuil',
            arbitrage: 'tests/test_fiscal_dgfip_activation.js vérifie déjà que la collecte corrige '
                + '11 520 en 11 497 pour le compte concerné, sans toucher les autres comptes'
        },
        {
            id: 'decote_2024', categorie: 'decote', doc: 'decote', anneeRevenus: 2024,
            url: 'https://bofip.impots.gouv.fr/bofip/2495-PGP.html/identifiant=BOI-IR-LIQ-20-20-30-20250414',
            publication: '2025-04-14', finPublication: '2026-04-07',
            loi: 'loi n° 2025-127 du 14 février 2025 de finances pour 2025, art. 2',
            texteOfficiel: '« Pour l’imposition des revenus de 2024, cette décote est accordée aux '
                + 'contribuables dont la cotisation d’impôt brut est inférieure à 1 965 € pour les '
                + 'contribuables célibataires, divorcés ou veufs et à 3 249 € pour les contribuables '
                + 'soumis à imposition commune (soit respectivement 1/45,25 % de 889 € et 1/45,25 % de '
                + '1 470 €) »',
            officiel: { dc: 889, dcPlafond: 1965, dcCouple: 1470, dcPlafondCouple: 3249 },
            embarque: { dc: 924, dcPlafond: 2042, dcCouple: 1523, dcPlafondCouple: 3365 },
            ecart: 'décote embarquée 924 € / 1 523 € au lieu de 889 € / 1 470 € (seuils 2 042 € / 3 365 € au lieu de 1 965 € / 3 249 €)',
            ecartCourt: 'décote 924/1 523 € embarqués contre 889/1 470 € officiels',
            effet: 'sans collecte, la décote 2024 est plus élevée que l’officielle : l’impôt 2024 des '
                + 'foyers sous le seuil est sous-évalué',
            arbitrage: 'la collecte du BOFiP « revenus 2024 » remplace les quatre nombres'
        },
        {
            id: 'qf_2024', categorie: 'qf_general', doc: 'qf', anneeRevenus: 2024,
            url: 'https://bofip.impots.gouv.fr/bofip/2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20250414',
            publication: '2025-04-14', finPublication: '2026-04-07',
            loi: 'loi n° 2025-127 du 14 février 2025 de finances pour 2025, art. 2',
            texteOfficiel: '« Son montant est fixé à 1 791 € par demi-part supplémentaire à compter de '
                + 'l’imposition des revenus de l’année 2024 » ; « On retranche l’avantage maximum en '
                + 'impôt procuré par les 6 demi-parts supplémentaires soumises au plafonnement … soit '
                + '1 791 € x 6 = 10 746 € »',
            officiel: { qf: 1791 },
            embarque: { qf: 1759 },
            ecart: 'plafond embarqué 1 759 € (valeur des revenus 2023) au lieu de 1 791 € pour les revenus 2024',
            ecartCourt: 'plafond QF 1 759 € embarqué (valeur 2023) contre 1 791 € officiel',
            effet: 'sans collecte, le plafonnement du quotient familial 2024 retient 1 759 € par '
                + 'demi-part au lieu de 1 791 € : l’avantage plafonné est sous-évalué de 32 € par demi-part',
            arbitrage: 'tests/test_corrections_fiscales_2025.py signalait déjà cette valeur comme '
                + '« héritée, PAS validée lors de l’audit » ; la valeur officielle est désormais sourcée'
        }
    ];

    function divergences(annee, categorie) {
        return DIVERGENCES_CODE.filter(function (d) {
            return (annee === undefined || d.anneeRevenus === annee)
                && (!categorie || d.categorie === categorie);
        });
    }

    function noteDivergence(doc, annee) {
        var d = divergences(annee).filter(function (x) { return x.doc === doc; });
        if (!d.length) return '';
        return ' ; valeur embarquée DIVERGENTE du BOFiP — ' + d.map(function (x) {
            return x.ecartCourt;
        }).join(' ; ') + ' ; la collecte du millésime revenus ' + annee + ' la remplace';
    }

    /* Vérifications distantes menées les 14 et 15/10/2026 sur les documents
       publics, hors application. Elles ne remplacent PAS la collecte du bouton :
       elles consignent ce qui a été constaté sur la source à cette date, et ce
       qui ne l'a pas été. Les tests récurrents, eux, n'utilisent jamais le
       réseau. */
    var VERIFICATIONS_DISTANTES = [
        { date: '2026-10-14', millesime: 2023, categorie: 'ps_titres',
            url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/gains.htm',
            constate: 'PFU de 12,8 % + PS de 17,2 % = 30 % ; « Si, en 2023, vous ou les membres de votre '
                + 'foyer fiscal avez vendu des valeurs mobilières » ; case 2OP ; abattement réservé aux titres '
                + 'acquis ou souscrits avant le 1er janvier 2018',
            portée: 'libellé accepté par analyserTitres pour les revenus 2023 : la case passe à « établi » au clic' },
        { date: '2026-10-15', millesime: 2024, categorie: 'ps_titres',
            url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/gains.htm',
            constate: 'PFU de 12,8 % + PS de 17,2 % = 30 % ; « Si, en 2024, vous ou les membres de votre '
                + 'foyer fiscal avez vendu des valeurs mobilières » ; case 2OP ; case 3VG (montant avant '
                + 'abattement en cas d’abattement de droit commun) ; moins-value reportée case 3VH et imputable '
                + 'dix ans ; abattement réservé aux titres acquis ou souscrits avant le 1er janvier 2018 ; '
                + 'fiche 2074-CMV',
            portée: 'libellé accepté par analyserTitres pour les revenus 2024 : la case passe à « établi » au clic' },
        { date: '2026-10-15', millesime: 2024, categorie: 'ps_titres',
            url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/complet/index.htm',
            constate: 'Flat Tax de 30 % (12,8 % d’IR et 17,2 % de PS) pour les revenus 2024',
            portée: 'corroboration du même millésime, lue avant l’aide ; jamais utilisée seule comme preuve' },
        { date: '2026-10-15', millesime: 2023, categorie: 'frais_abattement',
            url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/frais.htm',
            constate: '« Pour les revenus perçus en 2023, le minimum de déduction est de 495 €, le maximum de '
                + '14 171 € » ; déduction calculée automatiquement ; choix entre forfaitaire 10 % et frais réels '
                + 'par membre du foyer ; frais réels en cases 1AK à 1DK, remboursements en 1AJ à 1DJ',
            portée: 'identique aux constantes embarquées PLANCHER_ABATTEMENT_10[2023] = 495 et '
                + 'PLAFOND_ABATTEMENT_10[2023] = 14 171 : recoupement du code par la source du millésime' },
        { date: '2026-10-15', millesime: 2023, categorie: 'frais_repas',
            url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/frais.htm',
            constate: '« si vous n’avez pas de justifications détaillées, les frais supplémentaires sont évalués à '
                + '5,20 € par repas » ; « la valeur du repas pris au foyer (évalué à 5,20 € pour 2023) » ; '
                + 'participation de l’employeur aux titres-restaurant à déduire',
            portée: 'identique à FORFAIT_REPAS[2023] = 5.2 : recoupement du code par la source du millésime' },
        { date: '2026-10-15', millesime: 2023, categorie: 'frais_km',
            url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2024/aides/frais.htm',
            constate: 'barème automobiles des revenus 2023 — 3 CV et moins : d × 0,529 / (d × 0,316) + 1 065 / '
                + 'd × 0,370 ; 4 CV : 0,606 / 0,340 + 1 330 / 0,407 ; 5 CV : 0,636 / 0,357 + 1 395 / 0,427 ; '
                + '6 CV : 0,665 / 0,374 + 1 457 / 0,447 ; 7 CV et plus : 0,697 / 0,394 + 1 515 / 0,470 ; seuils '
                + '5 000 et 20 000 km ; « Le barème pour les véhicules 100 % électriques correspond au barème '
                + 'applicable ci-dessous majoré de 20 % » ; arrêté du 27 mars 2023 (+5,4 %) ; frais payés au cours '
                + 'de l’année 2023 ; règle des 40 km ; tarifs 2 roues et cyclomoteurs',
            portée: 'identique à BAREME_KM et à MAJORATION_VOITURE_ELECTRIQUE = 0,20 : pour les revenus 2023 '
                + 'l’hypothèse embarquée cesse d’en être une. Elle reste une hypothèse recopiée pour 2022, 2024 '
                + 'et 2026, et recoupée pour 2025 : le lecteur lireKm exige « Pour les revenus perçus en <année> » '
                + 'et refuse toute page d’une autre année' },
        { date: '2026-10-15', millesime: 2024, categorie: 'frais',
            url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/frais.htm',
            constate: '« Pour les revenus perçus en 2024, le minimum de déduction est de 504 €, le maximum de '
                + '14 426 € » ; frais « payés au cours de l’année 2024 », cases 1AK à 1DK ; barème automobiles '
                + '3 CV et moins : d × 0,529 / (d × 0,316) + 1 065 / d × 0,370 ; 4 CV : 0,606 / 0,340 + 1 330 / '
                + '0,407 ; seuils 5 000 et 20 000 km ; « Le barème pour les véhicules 100 % électriques correspond '
                + 'au barème applicable ci-dessous majoré de 20 % » ; tarif 2 roues 1 ou 2 CV : 0,395 / '
                + '(0,099) + 891 / 0,248',
            portée: 'identique aux constantes embarquées PLANCHER_ABATTEMENT_10[2024] = 504, '
                + 'PLAFOND_ABATTEMENT_10[2024] = 14 426 et au barème km 3 CV et 4 CV : pour ces cases '
                + 'l’hypothèse recopiée cesse d’en être une. Le lecteur lireKm exige de toute façon '
                + '« Pour les revenus perçus en 2024 » sur la page du millésime déclaration 2025',
            limite: 'accès direct en échec le 15/10/2026, texte lu par indexation et extrait tronqué : le forfait '
                + 'repas 2024 et les tranches 5 CV à 7 CV et plus n’ont PAS été relus. FORFAIT_REPAS[2024] = 5.35 '
                + 'reste non recoupé par une source, à vérifier au clic' },
        { date: '2026-10-14', millesime: 2025, categorie: 'ps_titres',
            url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/gains.htm',
            constate: 'PFU de 12,8 % + PS de 18,6 % = 31,4 % ; « Si, en 2025 … »',
            portée: 'source retenue par le lecteur ; contradiction interne au simulateur 2026 signalée' },
        { date: '2026-10-14', millesime: 2025, categorie: 'ps_crypto',
            url: 'https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423',
            constate: '« Date de début de publication du BOI : 23/04/2024 » ; 12,8 % + « prélèvements sociaux '
                + 'sur les revenus du patrimoine au taux global de 17,2 % » ; « taux global de 30 % »',
            portée: 'maillon 1 du recoupement ; aucune année de cession n’est datée par ce texte' },
        { date: '2026-10-14', millesime: 2025, categorie: 'ps_crypto',
            url: 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf',
            constate: 'CSG portée de 9,2 % à 10,6 % sur les revenus du patrimoine et les produits de placement ; '
                + 'revenus fonciers, plus-values immobilières, assurance-vie et épargne logement maintenus à '
                + '9,2 % ; CSG déductible à 6,8 % ; hausse « à compter des revenus 2025 déclarés en 2026 pour les '
                + 'revenus du patrimoine et à compter du 1.1.2026 pour les produits de placement » '
                + '(LFSS 2026, art. 12 ; CSS, art. L 136-8)',
            portée: 'maillon 2 du recoupement ; les actifs numériques ne figurent pas dans les exceptions' },
        { date: '2026-10-14', millesime: 2025, categorie: 'ps_crypto',
            url: 'https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques',
            constate: '« Publié le 16/06/2023, modifié le 17/07/2026 » ; PFU de 31,4 % (12,8 % + 18,6 %) ; '
                + 'option 3CN définitive et indépendante de celle des RCM ; exonération si la somme des prix de '
                + 'cession n’excède pas 305 € ; annexe 2086 et cases 3AN/3BN',
            portée: 'corroboration sans année de cession : jamais attribuée à 2025' },
        { date: '2026-10-14', millesime: 2025, categorie: 'crypto_2086_foyer',
            url: 'https://bofip.impots.gouv.fr/bofip/11967-PGP.html/identifiant=BOI-RPPM-PVBMC-30-10-20190902',
            constate: '« il convient de retenir les cessions d’actifs numériques … réalisées dans le cadre du '
                + 'foyer fiscal … tant par le contribuable ou les époux soumis à une imposition commune … que par '
                + 'les autres membres du foyer fiscal »',
            portée: 'fonde l’exigence du seuil et de l’annexe au niveau du FOYER, pas du seul portefeuille' },
        { date: '2026-10-15', millesime: 2025, categorie: 'crypto_2086_foyer',
            url: 'https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf',
            constate: 'formulaire et notice 2086 n° 16043*07, « Déclaration des plus ou moins-values réalisées '
                + 'en 2025 » ; « Si le total des prix de cession réalisés au niveau du foyer fiscal est inférieur '
                + 'ou égal à 305 €, vos cessions sont exonérées » ; « Ligne 52 — Total des plus-values et '
                + 'moins-values réalisées au niveau du foyer fiscal : à reporter ligne 3AN de la 2042 C en cas de '
                + 'plus-value globale ou à reporter ligne 3BN de la 2042 C en cas de moins-value globale » ; '
                + '« Plus ou moins-value brute = Prix de cession – [Prix total d’acquisition x Prix de cession / '
                + 'Valeur globale du portefeuille] » ; « vous devez cocher la case 3CN … L’option est globale et '
                + 'porte sur le total des plus-values de cession d’actifs numériques réalisées par votre foyer '
                + 'fiscal … indépendante de celle pouvant être exercée pour la taxation des revenus de capitaux '
                + 'mobiliers »',
            portée: 'les huit preuves exigées par analyserNotice sont présentes dans le document réel : seuil, '
                + 'formule, ligne de total et cases 3AN/3BN sont bien à l’échelle du FOYER, et l’option 3CN reste '
                + 'distincte de la 2OP. L’exhaustivité de l’annexe du foyer demeure non certifiable '
                + '(annexeFoyerComplete:false)' },
        { date: '2026-10-15', millesime: 2025, categorie: 'ps_crypto',
            url: 'https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf',
            constate: '« Les plus-values … sont passibles de l’impôt sur le revenu selon le régime … de l’article '
                + '150 VH bis du CGI (taux forfaitaire de 12,8 % auquel s’ajoutent les prélèvements sociaux) » : '
                + 'aucun taux de PS chiffré dans le formulaire du millésime revenus 2025',
            portée: 'le document millésimé 2025 ne chiffre pas les PS des cessions crypto : il ne peut pas établir '
                + '18,6 % à lui seul. D’où psCrypto2025Attestes:false et le recours au recoupement' },
        { date: '2026-10-15', millesime: 2025, categorie: 'ps_crypto',
            url: 'https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423',
            constate: 'version en vigueur toujours datée du 23/04/2024 (12,8 % + PS sur revenus du patrimoine '
                + '17,2 %, taux global 30 %) ; aucune version postérieure trouvée dans les sources indexées ; '
                + 'l’URL non versionnée renvoie « Document non trouvé », seul le permalien versionné est lisible',
            portée: 'au 15/10/2026 la contradiction n’a pas été levée par une mise à jour du BOFiP : le '
                + 'recoupement reste la seule chaîne DGFiP qui date les revenus 2025',
            limite: 'constat d’absence fondé sur les sources indexées, pas sur une interrogation exhaustive du '
                + 'BOFiP ; à re-vérifier à chaque campagne' },
        { date: '2026-10-15', millesime: 2025, categorie: 'csg_deductible',
            url: 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/12-charges_ded_rev_225a236.pdf',
            constate: '« CSG DÉDUCTIBLE CALCULÉE SUR LES REVENUS 2024, PAYÉE EN 2025 » ; « Le montant déductible '
                + 'est égal à 6,8 points de CSG calculée (au taux de 9,2 %) » ; « La déduction s’opère sur les '
                + 'revenus de l’année du paiement de la CSG » ; « Aucune CSG calculée sur les revenus du patrimoine '
                + 'n’est déductible lorsque ces revenus ont été imposés à l’impôt sur le revenu à un taux '
                + 'forfaitaire » ; « rayez le montant préimprimé et inscrivez ligne 6DE le montant exact de CSG '
                + 'déductible » ; second calendrier « CSG DÉDUCTIBLE CALCULÉE SUR LES REVENUS 2025, PAYÉE EN 2025 » '
                + ': « Le montant de CSG déductible est égal à 6,8 % des revenus déclarés ligne 2BH de la 2042 si '
                + 'vous optez pour l’imposition au barème et à 6,8 % des revenus déclarés ligne 2DF quelle que soit '
                + 'l’option » ; « Ce montant de CSG déductible n’est pas inclus dans le montant de CSG déductible '
                + 'préimprimé » ; « Vous ne devez pas le calculer vous-même ni l’indiquer ligne 6DE en corrigeant le '
                + 'montant prérempli … sera calculé automatiquement » ; exemple « 736 € (8 000 € × 9,2 %). La CSG '
                + 'déductible s’élève à 544 € (8 000 € × 6,8 %) » ; plafond applicable à la CSG afférente aux '
                + 'plus-values de titres avec abattement, à hauteur du rapport entre plus-value soumise à l’IR et '
                + 'plus-value soumise à la CSG',
            portée: 'les sept preuves exigées par analyserCharges sont présentes dans le document réel ; les deux '
                + 'calendriers du point 3 (patrimoine 2024 payé en 2025, RCM précomptés en 2025) sont distincts '
                + 'dans le texte officiel comme dans csgDeductible6DE() ; la fraction déductible reste 6,8 % alors '
                + 'que la CSG passe à 10,6 % (brochure nouveautés), cohérent avec CSG_DEDUCTIBLE = 0.068',
            limite: 'le plafonnement de la CSG déductible afférente aux plus-values de titres avec abattement '
                + 'n’est PAS modélisé : signalé comme règle non calculée, aucun montant n’est produit à ce titre' },
        { date: '2026-10-15', millesime: 2025, categorie: 'rcm_precompte',
            url: 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_integral/Brochure-IR-2026.pdf',
            constate: 'libellés des cases — « Revenus déjà soumis aux prélèvements sociaux avec CSG déductible si '
                + 'option barème … 2BH » ; « Autres revenus déjà soumis aux prélèvements sociaux avec CSG '
                + 'déductible … 2DF » ; « CSG déductible connue, calculée sur les revenus du patrimoine — Si ce '
                + 'montant est inexact, corrigez case 6DE … 6DE »',
            portée: 'confirme la sémantique des trois cases distinguées par le garde-fou : 2BH soumise à l’option '
                + 'du foyer, 2DF non, 6DE seulement en correction d’un préremplissage inexact. Ne dit rien des '
                + 'produits, des années de versement ni du précompte réellement subi par le foyer',
            limite: 'extrait indexé lu le 15/10/2026 ; le chapitre RCM 08-RCM_121a136.pdf, celui du lecteur, n’a '
                + 'pas pu être relu directement à cette date' },
        { date: '2026-10-15', millesime: 2023, categories: ['rcm_precompte', 'csg_deductible'],
            categorie: 'rcm_precompte',
            url: 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2024/pdf_som/08-RCM_123a137.pdf',
            constate: 'brochure du millésime ir_2024 (revenus 2023) : « Inscrivez ligne 2BH le montant des revenus '
                + 'perçus en 2023 sur … (case 2OP cochée) » ; « Le montant de CSG déductible sera alors calculé '
                + '(6,8 % du montant …) … ajouté au montant de CSG déductible prérempli sur votre déclaration des '
                + 'revenus de 2023 » ; « N’indiquez pas cette fraction de CSG déductible ligne 6DE » ; « Le montant '
                + 'des revenus indiqué ligne 2DF est exclu de la base de calcul des prélèvements sociaux et retenu '
                + 'pour le calcul du montant de CSG à déduire du revenu global de l’année 2023 »',
            portée: 'la source des revenus 2023 existe et date ses règles, mais elle n’est PAS lue par '
                + 'l’application : DOCS.rcm et DOCS.charges sont figés sur le millésime ir_2026 et analyserCharges '
                + 'exige la mention littérale « REVENUS 2024, PAYEE EN 2025 ». Les cases RCM et CSG des revenus '
                + '2023 et 2024 restent donc « non disponible » : aucune règle n’est reportée d’un millésime à '
                + 'l’autre',
            limite: 'extrait lu par indexation le 15/10/2026 (mise en page en colonnes), sans lecture PDF complète ; '
                + 'le millésime ir_2025 (revenus 2024) n’a pas été sondé' },
        { date: '2026-10-14', millesime: 2026, categorie: 'toutes',
            url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2027/aides/frais.htm',
            constate: 'aucune aide ni brochure du millésime « revenus 2026 » (déclaration 2027) publiée ou '
                + 'indexée à cette date',
            portée: 'rien n’est établi pour 2026 ; les constantes embarquées restent des hypothèses provisoires',
            limite: 'la sonde directe de cette URL n’a pas abouti depuis l’environnement de vérification : '
                + 'constat fondé sur l’absence de publication indexée et sur docs/COLLECTE-FISCALE.md (13/10/2026)' }
    ];

    /* Une entrée peut porter une catégorie précise, une liste `categories`
       (une même page établit plusieurs cases), la famille 'frais' (les trois
       cases lues sur la même page d'aide) ou 'toutes'. */
    function categorieConcernee(v, categorie) {
        if (categorie === undefined) return true;
        if (v.categorie === categorie || v.categorie === 'toutes') return true;
        if (Array.isArray(v.categories) && v.categories.indexOf(categorie) >= 0) return true;
        return v.categorie === 'frais' && String(categorie).indexOf('frais_') === 0;
    }

    function verificationsDistantes(annee, categorie) {
        return VERIFICATIONS_DISTANTES.filter(function (v) {
            return (annee === undefined || v.millesime === annee) && categorieConcernee(v, categorie);
        });
    }

    function contradictions(annee) {
        return CONTRADICTIONS.filter(function (c) { return annee === undefined || c.millesime === annee; });
    }

    function matrice(preuvesParAnnee) {
        var donnees = preuvesParAnnee || {};
        var annees = Object.keys(MILLESIMES).map(Number).sort(function (a, b) { return a - b; });
        var parAnnee = {};
        annees.forEach(function (an) { parAnnee[an] = evaluer(an, donnees[an]); });
        return { millesimes: MILLESIMES, categories: CATEGORIES, annees: annees,
            cellules: parAnnee, synthese: synthese(parAnnee, annees) };
    }

    function synthese(parAnnee, annees) {
        var compte = {}, manquants = [];
        Object.keys(STATUTS).forEach(function (k) { compte[STATUTS[k]] = 0; });
        (annees || []).forEach(function (an) {
            CATEGORIES.forEach(function (c) {
                var cel = parAnnee[an][c.id];
                compte[cel.statut] = (compte[cel.statut] || 0) + 1;
                if (ETABLIS.indexOf(cel.statut) < 0) manquants.push(an + ' · ' + c.libelle);
            });
        });
        var total = CATEGORIES.length * (annees || []).length;
        return {
            compte: compte, total: total, manquants: manquants,
            etablis: compte[STATUTS.ETABLI] || 0,
            recoupements: compte[STATUTS.RECOUPEMENT] || 0,
            // Une bascule totale exige TOUTES les catégories établies par un
            // texte explicite du millésime : un recoupement ne suffit pas.
            basculeComplete: total > 0 && (compte[STATUTS.ETABLI] || 0) === total
        };
    }

    function statutDe(annee, categorie, preuvesParAnnee) {
        var cel = evaluer(annee, (preuvesParAnnee || {})[annee])[categorie];
        if (!cel) throw new Error('Catégorie inconnue : ' + categorie);
        return cel;
    }

    /* Compte rendu court, copiable. Les preuves détaillées restent repliées. */
    function texte(m) {
        var lignes = ['Couverture DGFiP par millésime (année des revenus ≠ année de déclaration) :'];
        m.annees.forEach(function (an) {
            var mm = m.millesimes[an], cel = m.cellules[an];
            var e = CATEGORIES.filter(function (c) { return cel[c.id].statut === STATUTS.ETABLI; }).length;
            var r = CATEGORIES.filter(function (c) { return cel[c.id].statut === STATUTS.RECOUPEMENT; }).length;
            var p = CATEGORIES.filter(function (c) { return cel[c.id].statut === STATUTS.PARTIEL; }).length;
            lignes.push('Revenus ' + an + ' (déclaration ' + mm.declaration + ', publication BOFiP '
                + (mm.publicationBoi || 'non disponible') + ') : établis ' + e + '/' + CATEGORIES.length
                + (r ? ', recoupements ' + r : '') + (p ? ', partiels ' + p : '')
                + ', non disponibles ' + (CATEGORIES.length - e - r - p) + '.');
        });
        lignes.push('Établis ' + m.synthese.etablis + '/' + m.synthese.total
            + (m.synthese.recoupements ? ' (+ ' + m.synthese.recoupements + ' par recoupement)' : '')
            + '. Bascule DGFiP totale : ' + (m.synthese.basculeComplete ? 'oui' : 'non') + '.');
        var contra = contradictions();
        if (contra.length) lignes.push('Contradictions DGFiP signalées : '
            + contra.map(function (c) { return c.resume + ' (' + c.millesime + ')'; }).join(' ; ') + '.');
        var inv = root.PF && root.PF.fiscalSourcesMillesimes;
        if (inv) lignes.push('Sources DGFiP par millésime (familles lisibles par l’application) : '
            + inv.inventaire().map(function (l) {
                return 'revenus ' + l.anneeRevenus + ' ' + l.lisibles + '/' + l.total;
            }).join(', ')
            + '. Aucune URL n’est inventée pour un millésime non vérifié : il reste « non disponible ».');
        var div = divergences();
        if (div.length) {
            var parAn = {};
            div.forEach(function (d) { parAn[d.anneeRevenus] = (parAn[d.anneeRevenus] || 0) + 1; });
            lignes.push('Valeurs embarquées divergentes du BOFiP (constat du 16/10/2026) : '
                + Object.keys(parAn).sort().map(function (an) {
                    return 'revenus ' + an + ' → ' + parAn[an];
                }).join(', ')
                + '. Elles ne sont PAS corrigées ici : la collecte du millésime les remplace, et sans '
                + 'collecte la simulation n’utilise pas les chiffres de la DGFiP.');
        }
        return lignes.join('\n');
    }

    function texteDetail(m, annee) {
        var cel = m.cellules[annee];
        return CATEGORIES.map(function (c) {
            var x = cel[c.id];
            return c.libelle + ' — ' + x.statut
                + (x.valeur !== null && x.valeur !== undefined ? ' : ' + (typeof x.valeur === 'number' && x.valeur < 1
                    ? (Math.round(x.valeur * 1000) / 10) + ' %' : JSON.stringify(x.valeur)) : '')
                + (x.anneeEffet ? ' [effet revenus ' + x.anneeEffet + ']' : '')
                + (x.publication ? ' (publication ' + x.publication + ')' : '')
                + (x.source ? ' ' + x.source : '')
                + (x.exclusions && x.exclusions.length ? ' — exclus : ' + x.exclusions.join(', ') : '')
                + (x.note ? ' — ' + x.note : '');
        }).join('\n');
    }

    /* Liste textuelle, pour le bloc replié, des lectures de sources publiques
       menées hors application. Rien ici n'établit une valeur dans le moteur :
       la matrice ne dépend que des preuves collectées sur l'appareil. */
    function texteVerifications(annee) {
        var v = verificationsDistantes(annee);
        if (!v.length) return '';
        return v.map(function (x) {
            return '— ' + x.date + ', revenus ' + x.millesime + ' / ' + x.categorie + ' : ' + x.constate
                + '\n  portée : ' + x.portée + (x.limite ? '\n  limite : ' + x.limite : '')
                + '\n  ' + x.url;
        }).join('\n');
    }

    PF.fiscalCouverture = {
        STATUTS: STATUTS, MILLESIMES: MILLESIMES, CATEGORIES: CATEGORIES,
        CONTRADICTIONS: CONTRADICTIONS, VERIFICATIONS_DISTANTES: VERIFICATIONS_DISTANTES,
        DIVERGENCES_CODE: DIVERGENCES_CODE, divergences: divergences,
        categories: categories, millésime: millésime, millésimeDe: millésime,
        preuveDuMillesime: preuveDuMillesime, evaluer: evaluer, matrice: matrice,
        synthese: synthese, statutDe: statutDe, contradictions: contradictions,
        verificationsDistantes: verificationsDistantes, texteVerifications: texteVerifications,
        texte: texte, texteDetail: texteDetail
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
