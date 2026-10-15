/* Inventaire PÉRENNE des sources DGFiP, millésime par millésime.
   Une seule table décrit, pour chaque année de REVENUS, le document attendu,
   son URL quand elle a été vérifiée, la date de cette vérification, et si le
   jeu de preuves du lecteur a été vérifié pour ce millésime.

   Règles :
   - aucune URL n'est inventée : une case vide vaut `null`, jamais un motif
     complété à la volée ;
   - un document repéré mais dont le jeu de preuves n'a pas été vérifié pour ce
     millésime (`lectureVerifiee: false`) ne déclenche AUCUNE lecture : il est
     refusé, et le refus dit ce qui manque ;
   - les motifs de construction (`motif`) sont fournis pour les millésimes à
     venir : ils indiquent quoi chercher, pas quoi croire ;
   - aucune valeur fiscale n'est portée d'une année sur l'autre.

   Ce module est purement descriptif : il ne calcule rien et n'appelle pas le
   réseau. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var BROCHURE = 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/';
    var SIMULATEUR = 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/';
    var BOFIP = 'https://bofip.impots.gouv.fr/bofip/';

    var MILLESIMES = {
        2023: { declaration: 2024, publicationBoi: '2024-06-18', documentsAttendus: true },
        2024: { declaration: 2025, publicationBoi: '2025-04-14', documentsAttendus: true },
        2025: { declaration: 2026, publicationBoi: '2026-04-07', documentsAttendus: true },
        2026: { declaration: 2027, publicationBoi: null, documentsAttendus: false }
    };

    /* `url: null` = document non publié OU adresse non vérifiée à cette date.
       `verifieeLe` = date de la vérification effectuée hors application.
       `lectureVerifiee` = le lecteur sait reconnaître CE millésime (ancres et
       passages confirmés sur le document réel). Sans cela, pas de lecture. */
    var SOURCES = {
        boi_ir: {
            libelle: 'BOFiP — barème de l’impôt (BOI-IR-LIQ-20-10)',
            lecteur: 'fiscal_dgfip_sources.tableauIr',
            motif: BOFIP + '2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-<AAAAMMJJ>',
            parAnnee: {
                2023: { url: BOFIP + '2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20240618',
                    verifieeLe: '2026-10-16', lectureVerifiee: true,
                    constat: 'relu : 11 294 / 28 797 / 82 341 / 177 106 €, indexation 4,8 % (loi n° 2023-1322 du 29/12/2023) — identique au code' },
                2024: { url: BOFIP + '2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20250414',
                    verifieeLe: '2026-10-16', lectureVerifiee: true,
                    constat: 'relu : 11 497 / 29 315 / 83 823 / 180 294 €, indexation 1,8 % (loi n° 2025-127 du 14/02/2025) — DIVERGENT du code (11 520 / 29 370 / 83 984 / 180 648 = 2023 × 1,02)' },
                2025: { url: BOFIP + '2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20260407',
                    verifieeLe: '2026-10-14', lectureVerifiee: true,
                    constat: 'recoupé et activé par le propriétaire (R2 revenus 2025)' },
                2026: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'aucun document « revenus 2026 » publié ; aucune version 2027 du permalien' }
            }
        },
        boi_decote: {
            libelle: 'BOFiP — décote (BOI-IR-LIQ-20-20-30)',
            lecteur: 'fiscal_dgfip_sources.decote',
            motif: BOFIP + '2495-PGP.html/identifiant=BOI-IR-LIQ-20-20-30-<AAAAMMJJ>',
            parAnnee: {
                2023: { url: BOFIP + '2495-PGP.html/identifiant=BOI-IR-LIQ-20-20-30-20240618',
                    verifieeLe: '2026-10-16', lectureVerifiee: true,
                    constat: 'relu : 873 € / 1 444 € (seuils 1 929 € / 3 191 €) — DIVERGENT du code (906 € / 1 493 €, seuils 2 002 € / 3 300 €)' },
                2024: { url: BOFIP + '2495-PGP.html/identifiant=BOI-IR-LIQ-20-20-30-20250414',
                    verifieeLe: '2026-10-16', lectureVerifiee: true,
                    constat: 'relu : 889 € / 1 470 € (seuils 1 965 € / 3 249 €) — DIVERGENT du code (924 € / 1 523 €, seuils 2 042 € / 3 365 €)' },
                2025: { url: BOFIP + '2495-PGP.html/identifiant=BOI-IR-LIQ-20-20-30-20260407',
                    verifieeLe: '2026-10-14', lectureVerifiee: true,
                    constat: 'recoupé : 897 € / 1 483 € (seuils 1 982 € / 3 277 €), identique au code' },
                2026: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'aucun document de ce millésime publié au 16/10/2026' }
            }
        },
        boi_qf: {
            libelle: 'BOFiP — plafonnement du quotient familial (BOI-IR-LIQ-20-20-20)',
            lecteur: 'fiscal_dgfip_sources.qf',
            motif: BOFIP + '2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-<AAAAMMJJ>',
            parAnnee: {
                2023: { url: BOFIP + '2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20240618',
                    verifieeLe: '2026-10-16', lectureVerifiee: true,
                    constat: 'relu : « 1 759 € par demi-part supplémentaire à compter de l’imposition des revenus de l’année 2023 » — identique au code' },
                2024: { url: BOFIP + '2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20250414',
                    verifieeLe: '2026-10-16', lectureVerifiee: true,
                    constat: 'relu : « 1 791 € par demi-part supplémentaire à compter de l’imposition des revenus de l’année 2024 » — DIVERGENT du code (1 759 €, valeur 2023 reconduite)' },
                2025: { url: BOFIP + '2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20260407',
                    verifieeLe: '2026-10-14', lectureVerifiee: true,
                    constat: 'recoupé : 1 807 € par demi-part, identique au code' },
                2026: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'aucun document de ce millésime publié au 16/10/2026' }
            }
        },
        aide_frais: {
            libelle: 'Aide du simulateur — déduction des frais professionnels',
            lecteur: 'fiscal_frais_sources.preuveAnnee',
            motif: SIMULATEUR + '<N+1>/aides/frais.htm',
            parAnnee: {
                2023: { url: SIMULATEUR + '2024/aides/frais.htm', verifieeLe: '2026-10-15',
                    lectureVerifiee: true,
                    constat: 'relu : 495 € / 14 171 €, forfait repas 5,20 €, barème km 3 à 7 CV, majoration électrique 20 % — identiques au code' },
                2024: { url: SIMULATEUR + '2025/aides/frais.htm', verifieeLe: '2026-10-15',
                    lectureVerifiee: true,
                    constat: 'relu par indexation (accès direct en échec, extrait tronqué) : 504 € / 14 426 € et barème 3-4 CV identiques au code ; forfait repas 2024 et tranches 5 à 7 CV NON recoupés' },
                2025: { url: SIMULATEUR + '2026/aides/frais.htm', verifieeLe: '2026-10-14',
                    lectureVerifiee: true,
                    constat: 'page lue par le bouton ; preuve « Pour les revenus perçus en 2025 » exigée' },
                2026: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'aucune version 2027 du simulateur indexée au 16/10/2026' }
            }
        },
        aide_gains: {
            libelle: 'Aide du simulateur — gains de cession de valeurs mobilières (PFU / 2OP)',
            lecteur: 'fiscal_regimes_sources.preuveAnnee',
            motif: SIMULATEUR + '<N+1>/aides/gains.htm',
            parAnnee: {
                2023: { url: SIMULATEUR + '2024/aides/gains.htm', verifieeLe: '2026-10-14',
                    lectureVerifiee: true, constat: 'relu : 17,2 % de prélèvements sociaux, PFU 30 %' },
                2024: { url: SIMULATEUR + '2025/aides/gains.htm', verifieeLe: '2026-10-15',
                    lectureVerifiee: true, constat: 'relu : 17,2 %, PFU 30 %, option 2OP, abattement titres acquis avant 2018' },
                2025: { url: SIMULATEUR + '2026/aides/gains.htm', verifieeLe: '2026-10-14',
                    lectureVerifiee: true,
                    constat: 'relu : 18,6 % / 31,4 % — en contradiction interne avec complet/index.htm du même millésime (30 % / 17,2 %), contradiction signalée et non levée' },
                2026: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false, constat: 'aucun document de ce millésime publié au 16/10/2026' }
            }
        },
        aide_repas: {
            libelle: 'Forfait repas (page dédiée à partir des revenus 2025)',
            lecteur: 'fiscal_frais_sources.repasUrl',
            motif: 'revenus ≤ 2024 : aide_frais ; revenus ≥ 2025 : https://www.impots.gouv.fr/particulier/frais-de-repas',
            parAnnee: {
                2023: { url: SIMULATEUR + '2024/aides/frais.htm', verifieeLe: '2026-10-15',
                    lectureVerifiee: true, constat: '5,20 € par repas relu sur l’aide frais du millésime 2024' },
                2024: { url: SIMULATEUR + '2025/aides/frais.htm', verifieeLe: '2026-10-15',
                    lectureVerifiee: true,
                    constat: 'extrait indexé tronqué avant le forfait repas : 5,35 € NON recoupé' },
                2025: { url: 'https://www.impots.gouv.fr/particulier/frais-de-repas',
                    verifieeLe: '2026-10-14', lectureVerifiee: true,
                    constat: 'page non datée par millésime : la preuve d’année est portée par l’aide frais, jamais par cette page seule' },
                2026: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false, constat: 'aucun document de ce millésime publié au 16/10/2026' }
            }
        },
        brochure_rcm: {
            libelle: 'Brochure — chapitre RCM (cases 2CG / 2BH / 2DF, option 2OP)',
            lecteur: 'fiscal_rcm_pdf_sources.analyserRcm',
            motif: BROCHURE + 'ir_<N+1>/pdf_som/08-RCM_<référence>.pdf',
            parAnnee: {
                2023: { url: BROCHURE + 'ir_2024/pdf_som/08-RCM_123a137.pdf',
                    verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'document repéré et 4 passages vérifiés (« revenus perçus en 2023 », CSG déductible 6,8 % ajoutée au prérempli, « N’indiquez pas cette fraction … ligne 6DE », 2DF retenu pour la CSG à déduire du revenu global de 2023) ; le jeu de 8 preuves du lecteur n’est pas confirmé sur ce millésime : lecture refusée, aucune valeur produite' },
                2024: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'chapitre ir_2025 non repéré : référence du fichier non vérifiée, aucune URL inventée' },
                2025: { url: BROCHURE + 'ir_2026/pdf_som/08-RCM_121a136.pdf',
                    verifieeLe: '2026-10-16', lectureVerifiee: true,
                    constat: '8 preuves vérifiées sur le document réel ; lecteur confirmé sur Android par le propriétaire' },
                2026: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'brochure ir_2027 non publiée' }
            }
        },
        brochure_charges: {
            libelle: 'Brochure — chapitre charges déductibles (CSG déductible, case 6DE)',
            lecteur: 'fiscal_rcm_pdf_sources.analyserCharges',
            motif: BROCHURE + 'ir_<N+1>/pdf_som/12-charges_ded_rev_<référence>.pdf',
            parAnnee: {
                2023: { url: BROCHURE + 'ir_2024/pdf_som/12-charges_ded_rev_219a230.pdf',
                    verifieeLe: '2026-10-16', lectureVerifiee: false, lectureAutorisee: true,
                    constat: 'chapitre repéré et relu le 16/10/2026 : « CSG DÉDUCTIBLE CALCULÉE SUR LES REVENUS 2022, PAYÉE EN 2023 » (l’année portante de l’ancre), « Le montant déductible est égal à 6,8 points de CSG calculée (au taux de 9,2 %) », « Vous ne devez pas le calculer vous-même ni l’indiquer ligne 6DE en corrigeant le montant prérempli. Le montant de CSG déductible afférent aux revenus déclarés ligne 2BH et 2DF sera calculé automatiquement » ; 4 des 7 preuves non relues dans l’extrait : lecture autorisée SOUS RÉSERVE, le lecteur exige ses 7 preuves et refuse sans elles' },
                2024: { url: BROCHURE + 'ir_2025/pdf_som/12-charges_ded_rev_215a226.pdf',
                    verifieeLe: '2026-10-16', lectureVerifiee: false, lectureAutorisee: true,
                    constat: 'chapitre repéré et relu le 16/10/2026 : « CSG DÉDUCTIBLE CALCULÉE SUR LES REVENUS 2023, PAYÉE EN 2024 » et seconde partie « CSG DÉDUCTIBLE CALCULÉE SUR LES REVENUS 2024, PAYÉE EN 2024 », « 6,8 points de CSG calculée (au taux de 9,2 %) », exemple 736 € (8 000 € × 9,2 %) → 544 € (8 000 € × 6,8 %), « Vous ne devez pas le calculer vous-même ni l’indiquer ligne 6DE … sera calculé automatiquement » ; 3 des 7 preuves non relues dans l’extrait : lecture autorisée SOUS RÉSERVE, le lecteur exige ses 7 preuves et refuse sans elles' },
                2025: { url: BROCHURE + 'ir_2026/pdf_som/12-charges_ded_rev_225a236.pdf',
                    verifieeLe: '2026-10-16', lectureVerifiee: true,
                    constat: '7 preuves vérifiées sur le document réel, dont « CSG DÉDUCTIBLE CALCULÉE SUR LES REVENUS 2024, PAYÉE EN 2025 » et la partie « REVENUS 2025, PAYÉE EN 2025 » ; le plafonnement sur plus-values est signalé non modélisé' },
                2026: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'brochure ir_2027 non publiée' }
            }
        },
        brochure_plus_values: {
            libelle: 'Brochure — chapitre plus-values (seuil 305 €, abattements, cases 3VG/3VH)',
            lecteur: 'fiscal_crypto_pdf_sources.analyserBrochure',
            motif: BROCHURE + 'ir_<N+1>/pdf_som/09-plus_values_<référence>.pdf',
            parAnnee: {
                2023: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'chapitre ir_2024 non repéré : référence du fichier non vérifiée, aucune URL inventée' },
                2024: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'chapitre ir_2025 non repéré : référence du fichier non vérifiée, aucune URL inventée' },
                2025: { url: BROCHURE + 'ir_2026/pdf_som/09-plus_values_137a156.pdf',
                    verifieeLe: '2026-10-14', lectureVerifiee: true,
                    constat: '5 preuves vérifiées ; lecteur figé sur ce millésime' },
                2026: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false, constat: 'aucun document de ce millésime publié au 16/10/2026' }
            }
        },
        notice_2086: {
            libelle: 'Notice 2086 — cessions de crypto-actifs à l’échelle du foyer',
            lecteur: 'fiscal_crypto_pdf_sources.analyserNotice',
            motif: 'formulaire seul : https://www.impots.gouv.fr/sites/default/files/formulaires/2086/<N+1>/2086_<numéro>.pdf ; '
                + 'ou dans la brochure : ' + BROCHURE + 'ir_<N+1>/pdf_som/2086.pdf',
            parAnnee: {
                2023: { url: BROCHURE + 'ir_2024/pdf_som/2086.pdf', verifieeLe: '2026-10-16',
                    lectureVerifiee: false, lectureAutorisee: true,
                    constat: 'notice 16043*05 repérée et relue le 16/10/2026 : « Déclaration des plus ou moins-values réalisées en 2023 suite à des cessions d’actifs numériques », « Ligne 51 Total des prix de cession réalisés au niveau du foyer fiscal (l. 218 + l. 258 + l. 318 + l. 413 + l. 423 + l. 433) » ; les 6 autres preuves du lecteur n’ont pas été relues dans l’extrait : lecture autorisée SOUS RÉSERVE, le lecteur exige ses 8 preuves et refuse sans elles' },
                2024: { url: BROCHURE + 'ir_2025/pdf_som/2086.pdf', verifieeLe: '2026-10-16',
                    lectureVerifiee: false, lectureAutorisee: true,
                    constat: 'notice 16043*06 repérée et relue le 16/10/2026 : « NOTICE (revenus 2024) », « réalisées en 2024 », « Plus ou moins-value brute = Prix de cession – [Prix total d’acquisition x Prix de cession / Valeur globale du portefeuille] », « Si le total des prix de cession réalisés au niveau du foyer fiscal est inférieur ou égal à 305 €, vos cessions sont exonérées », ligne 51 et ses lignes sources, « ligne 3AN de la 2042 C en cas de plus-value globale ou en ligne 3BN … en cas de moins-value globale », « taux forfaitaire de 12,8 % auquel s’ajoutent les prélèvements sociaux », option 3CN « expresse et irrévocable » ; frais hors quotient et portée globale de l’option non relus : lecture autorisée SOUS RÉSERVE, le lecteur exige ses 8 preuves' },
                2025: { url: 'https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf',
                    verifieeLe: '2026-10-14', lectureVerifiee: true,
                    constat: 'notice 16043*07 : 8 preuves exigées ; seuil 305 € « au niveau du foyer fiscal », formule de répartition, ligne 52 → 3AN/3BN, option 3CN distincte de 2OP ; aucun taux de prélèvements sociaux chiffré dans cette notice' },
                2026: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'notice 2086 du millésime 2027 non publiée' }
            }
        },
        nouveautes: {
            libelle: 'Brochure — nouveautés (évolution des taux de prélèvements sociaux)',
            lecteur: 'fiscal_crypto_ps_recoupement.analyserBofip (corroboration)',
            motif: BROCHURE + 'ir_<N+1>/pdf_som/nouveautes.pdf',
            parAnnee: {
                2023: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false,
                    constat: 'brochure ir_2024 non relue : aucune vérification menée sur ce millésime' },
                2024: { url: BROCHURE + 'ir_2025/pdf_som/nouveautes.pdf', verifieeLe: '2026-10-16',
                    lectureVerifiee: false,
                    constat: 'document repéré et relu le 16/10/2026 : « PRINCIPALES NOUVEAUTÉS REVENUS 2024 », « Les tranches du barème de l’impôt sur le revenu 2024, ainsi que les seuils et limites qui lui sont associés, augmentent de 1,8 % » — confirme l’indexation officielle déjà consignée au §5.3 ; aucun lecteur dédié dans l’application, donc aucune collecte' },
                2025: { url: BROCHURE + 'ir_2026/pdf_som/nouveautes.pdf', verifieeLe: '2026-10-14',
                    lectureVerifiee: true,
                    constat: 'relu : CSG 9,2 % → 10,6 % « à compter des revenus 2025 déclarés en 2026 », foncier / PV immobilières / assurance-vie / épargne logement maintenus à 9,2 %, « le taux de CSG déductible reste à 6,8 % », crypto absente des exceptions' },
                2026: { url: null, verifieeLe: '2026-10-16', lectureVerifiee: false, constat: 'aucun document de ce millésime publié au 16/10/2026' }
            }
        }
    };

    function familles() { return Object.keys(SOURCES); }
    function millésimes() { return Object.keys(MILLESIMES).map(Number); }

    function source(annee, famille) {
        var f = SOURCES[famille];
        if (!f || !MILLESIMES[annee]) return null;
        var s = f.parAnnee[annee];
        if (!s) return null;
        /* `lectureVerifiee` : le jeu de preuves du lecteur a été confirmé sur le
           document réel de ce millésime. `lectureAutorisee` : la lecture peut être
           tentée parce que l'ancre portante (l'année des revenus) a été vérifiée
           verbatim et que le lecteur exige TOUTES ses preuves — un document
           incomplet ne produit aucune valeur, il renvoie la liste de ce qui manque.
           Par défaut, autoriser = avoir vérifié. */
        var verifiee = !!s.lectureVerifiee;
        return { famille: famille, libelle: f.libelle, lecteur: f.lecteur, motif: f.motif,
            anneeRevenus: annee, anneeDeclaration: MILLESIMES[annee].declaration,
            url: s.url, verifieeLe: s.verifieeLe, lectureVerifiee: verifiee,
            lectureAutorisee: s.lectureAutorisee !== undefined ? !!s.lectureAutorisee : verifiee,
            publiee: !!s.url, constat: s.constat };
    }

    function toutes(annee) {
        return familles().map(function (f) { return source(annee, f); })
            .filter(function (s) { return !!s; });
    }
    function lisibles(annee) {
        return toutes(annee).filter(function (s) { return s.url && s.lectureAutorisee; });
    }
    function verifiees(annee) {
        return toutes(annee).filter(function (s) { return s.url && s.lectureVerifiee; });
    }
    function manquantes(annee) {
        return toutes(annee).filter(function (s) { return !(s.url && s.lectureAutorisee); });
    }
    function url(annee, famille) {
        var s = source(annee, famille);
        // Une URL repérée dont la lecture n'est pas autorisée pour ce millésime ne
        // doit pas déclencher de collecte : elle vaut « non lisible ».
        return s && s.url && s.lectureAutorisee ? s.url : null;
    }
    function etatDe(s) {
        if (!s.url) return 'absente';
        if (s.lectureVerifiee) return 'lisible-vérifiée';
        if (s.lectureAutorisee) return 'lisible-sous-réserve';
        return 'repérée-non-autorisée';
    }
    function motif(famille) { return SOURCES[famille] ? SOURCES[famille].motif : null; }

    function prochainMillésime() {
        var an = millésimes().filter(function (a) { return !MILLESIMES[a].documentsAttendus; });
        return an.length ? an[0] : null;
    }

    /* Fenêtres de publication observées, pour savoir QUAND chercher — jamais
       pour fabriquer une URL ou une valeur. */
    function calendrier(annee) {
        var m = MILLESIMES[annee];
        if (!m) return null;
        return {
            anneeRevenus: annee, anneeDeclaration: m.declaration,
            bofip: m.publicationBoi
                ? 'indexation publiée le ' + m.publicationBoi
                : 'attendue au printemps ' + m.declaration + ' (observations : 18/06/2024 pour 2023, 14/04/2025 pour 2024, 07/04/2026 pour 2025)',
            brochures: 'brochure ir_' + m.declaration + ' attendue au printemps ' + m.declaration,
            simulateur: 'aides du simulateur calcul_impot/' + m.declaration + ' attendues à l’ouverture de la déclaration ' + m.declaration,
            formulaire2086: 'notice 2086 du millésime ' + m.declaration + ' attendue avec le formulaire ' + m.declaration,
            publié: !!m.documentsAttendus
        };
    }

    function aVerifier(annee) {
        return toutes(annee).filter(function (s) { return !(s.url && s.lectureVerifiee); })
            .map(function (s) {
                return { famille: s.famille, libelle: s.libelle, motif: s.motif,
                    urlReperee: s.url, lectureVerifiee: s.lectureVerifiee, manque: s.constat };
            });
    }

    function inventaire() {
        var lignes = [];
        millésimes().forEach(function (an) {
            lignes.push({ anneeRevenus: an, anneeDeclaration: MILLESIMES[an].declaration,
                lisibles: lisibles(an).length, verifiees: verifiees(an).length,
                total: toutes(an).length,
                familles: toutes(an).map(function (s) {
                    return s.famille + ':' + etatDe(s);
                }) });
        });
        return lignes;
    }

    function texte(annee) {
        var l = lisibles(annee), mv = manquantes(annee), cal = calendrier(annee);
        if (!cal) return 'Millésime hors inventaire : ' + annee + '.';
        var total = l.length + mv.length;
        var lignes = ['Sources DGFiP — revenus ' + annee + ' (déclaration ' + cal.anneeDeclaration + ') : '
            + l.length + '/' + total + ' familles lisibles par l’application, dont '
            + verifiees(annee).length + '/' + total + ' au jeu de preuves vérifié.'];
        if (l.length) lignes.push('Lisibles : ' + l.map(function (s) {
            return s.famille + ' (vérifiée le ' + s.verifieeLe + ')';
        }).join(', ') + '.');
        mv.forEach(function (s) {
            lignes.push('— ' + s.famille + ' : ' + s.constat
                + (s.url ? ' [document repéré : ' + s.url + ']' : ' [aucune URL inventée]'));
        });
        lignes.push('Calendrier : ' + cal.bofip + ' ; ' + cal.brochures + '.');
        return lignes.join('\n');
    }

    PF.fiscalSourcesMillesimes = {
        MILLESIMES: MILLESIMES, SOURCES: SOURCES, familles: familles, millésimes: millésimes,
        source: source, toutes: toutes, lisibles: lisibles, verifiees: verifiees, etatDe: etatDe,
        manquantes: manquantes, url: url,
        motif: motif, prochainMillésime: prochainMillésime, calendrier: calendrier,
        aVerifier: aVerifier, inventaire: inventaire, texte: texte
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
