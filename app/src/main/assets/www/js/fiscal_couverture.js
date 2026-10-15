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
                    : EMBARQUE + ' ; ' + cheminMoteur + ' refuse ce millésime sans preuve' });
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
        var rcmRegles = !!(p.brochureRcm && p.brochureRcm.valeurs);
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
        var charges = !!(p.chargesRcm && p.chargesRcm.valeurs);
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
        var notice = p.notice2086 && p.notice2086.valeurs, brochurePv = p.brochureCrypto && p.brochureCrypto.valeurs;
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
            constate: 'sonde en échec le 15/10/2026 : ni l’abattement 10 %, ni le forfait repas, ni le barème '
                + 'kilométrique des revenus 2024 n’ont pu être relus à distance',
            portée: 'les trois cases frais des revenus 2024 restent à établir par le bouton ; aucune valeur de '
                + '2023 n’est reportée sur 2024',
            limite: 'échec d’accès distant et non absence de publication : à re-vérifier, sans rien déduire' },
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
        { date: '2026-10-14', millesime: 2026, categorie: 'toutes',
            url: 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2027/aides/frais.htm',
            constate: 'aucune aide ni brochure du millésime « revenus 2026 » (déclaration 2027) publiée ou '
                + 'indexée à cette date',
            portée: 'rien n’est établi pour 2026 ; les constantes embarquées restent des hypothèses provisoires',
            limite: 'la sonde directe de cette URL n’a pas abouti depuis l’environnement de vérification : '
                + 'constat fondé sur l’absence de publication indexée et sur docs/COLLECTE-FISCALE.md (13/10/2026)' }
    ];

    /* Une entrée peut porter une catégorie précise, la famille 'frais' (les
       trois cases lues sur la même page d'aide) ou 'toutes'. */
    function categorieConcernee(v, categorie) {
        if (categorie === undefined) return true;
        if (v.categorie === categorie || v.categorie === 'toutes') return true;
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
        categories: categories, millésime: millésime, millésimeDe: millésime,
        preuveDuMillesime: preuveDuMillesime, evaluer: evaluer, matrice: matrice,
        synthese: synthese, statutDe: statutDe, contradictions: contradictions,
        verificationsDistantes: verificationsDistantes, texteVerifications: texteVerifications,
        texte: texte, texteDetail: texteDetail
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
