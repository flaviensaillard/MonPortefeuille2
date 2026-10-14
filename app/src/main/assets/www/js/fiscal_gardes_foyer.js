/* Garde-fous du FOYER fiscal : CSG 6DE, annexe 2086 et quotient familial.

   Trois principes, aucun chiffre inventé :
     1. Les brochures DGFiP établissent des RÈGLES, jamais les produits, les
        dates ni les montants du foyer. Une CSG déductible personnelle ne se
        calcule pas à partir de leur seule lecture : elle exige les montants
        saisis par le propriétaire (données personnelles, distinctes des
        paramètres publics).
     2. La CSG des lignes 2BH/2DF prélevée en N est calculée automatiquement
        par l'administration : elle ne doit JAMAIS être reportée en 6DE.
     3. Les opérations d'un seul portefeuille ne certifient pas une annexe 2086
        exhaustive ; seule l'inférence à sens unique est admise (un total de
        cessions du portefeuille supérieur au seuil du foyer exclut
        l'exonération, l'inverse ne la prouve pas). */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};

    var NON_DISPONIBLE = 'non disponible';
    var TAUX_CSG_DEDUCTIBLE = 0.068; // fraction déductible, inchangée par la LFSS 2026

    function nombre(x) {
        return typeof x === 'number' && isFinite(x) ? x : null;
    }
    function euro(x) { return Math.round(x * 100) / 100; }
    function fr(x) { return String(x).replace('.', ','); }

    /* ------------------------------------------------------------------ CSG

       `donnees` (montants PERSONNELS, jamais déduits d'une brochure) :
         annee                      : année des revenus
         lignes2BH, lignes2DF       : revenus déclarés sur ces lignes (PS prélevés en annee)
         csgPatrimoinePayee         : CSG sur revenus du patrimoine annee-1 payée en annee
         montant6DE                 : montant que le foyer veut inscrire en 6DE
         impositionAuBareme         : true si les revenus concernés sont au barème (2OP)
         csgAuto2BH2DF              : montant déjà calculé automatiquement par l'administration */
    function csgDeductible6DE(donnees) {
        var d = donnees || {};
        var annee = Number.isInteger(d.annee) ? d.annee : null;
        var regles = [
            'CSG sur revenus du patrimoine ' + (annee ? annee - 1 : 'N-1') + ' payée en '
                + (annee || 'N') + ' : déductible du revenu global ' + (annee || 'N') + '.',
            'RCM précomptés en ' + (annee || 'N') + ' (ligne 2BH) : CSG déductible uniquement en cas d’option 2OP.',
            'Ligne 2DF : déduction possible même sans 2OP pour certains produits déjà soumis aux PS en '
                + (annee || 'N') + '.',
            'Gains ' + (annee || 'N') + ' imposés forfaitairement : PS acquittés sur l’avis '
                + ((annee || 0) + 1) + ', aucune déduction sur le revenu ' + (annee || 'N') + '.',
            'CSG des lignes 2BH/2DF prélevée en ' + (annee || 'N') + ' : calculée automatiquement, '
                + 'à ne pas ajouter en 6DE.'
        ];
        if (!annee) return { etat: NON_DISPONIBLE, disponible: false, montant6DE: null,
            doubleCompte: null, regles: regles, blocages: ['année des revenus absente'], avertissements: [] };

        var bh = nombre(d.lignes2BH), df = nombre(d.lignes2DF);
        var patrimoine = nombre(d.csgPatrimoinePayee);
        var autre = nombre(d.autreCsgDeductible);
        var declare = nombre(d.montant6DE);
        var taux = nombre(d.tauxCsg) !== null ? nombre(d.tauxCsg) : TAUX_CSG_DEDUCTIBLE;
        var blocages = [], avertissements = [];

        if (bh === null && df === null && patrimoine === null) {
            return { etat: NON_DISPONIBLE, disponible: false, montant6DE: null, doubleCompte: null,
                regles: regles, blocages: ['aucun montant personnel saisi : la lecture des brochures '
                    + 'ne permet pas de calculer une CSG déductible personnelle'], avertissements: [],
                tauxCsgDeductible: taux };
        }
        if (d.impositionAuBareme !== true && (bh !== null || df !== null)) {
            avertissements.push('2BH : la CSG déductible suppose l’option globale 2OP du foyer ; '
                + 'sans cette option, seule la ligne 2DF peut ouvrir droit à déduction selon le produit.');
        }
        // Part calculée AUTOMATIQUEMENT par l'administration sur les lignes
        // 2BH et 2DF : elle ne se reporte jamais en 6DE.
        var auto = bh !== null || df !== null
            ? euro(taux * ((bh || 0) + (df || 0))) : null;
        if (nombre(d.csgAuto2BH2DF) !== null && auto !== null &&
            Math.abs(nombre(d.csgAuto2BH2DF) - auto) > 0.01) {
            avertissements.push('le montant automatique 2BH/2DF saisi (' + nombre(d.csgAuto2BH2DF)
                + ' €) diffère de 6,8 % × (2BH + 2DF) = ' + auto + ' € : vérifiez l’avis, aucun recalcul imposé.');
        }
        // Ce qui peut légitimement être inscrit en 6DE : la CSG sur revenus du
        // patrimoine de l'année précédente payée cette année (en principe
        // préremplie) et toute autre CSG déductible documentée par le foyer.
        var candidat = euro((patrimoine || 0) + (autre || 0));
        var total = euro(candidat + (auto || 0));
        var doubleCompte = null;
        if (declare !== null) {
            // Le contrôle décisif : un 6DE qui contient déjà la part 2BH/2DF.
            if (auto !== null && auto > 0 && Math.abs(declare - total) <= 0.01) {
                doubleCompte = true;
                blocages.push('6DE saisi (' + declare + ' €) = CSG patrimoine/autre (' + candidat
                    + ' €) + part 2BH/2DF (' + auto + ' €) déjà calculée automatiquement : '
                    + 'ne pas la reporter en 6DE, elle serait comptée deux fois.');
            } else if (auto !== null && auto > 0 && declare > candidat + 0.01) {
                doubleCompte = true;
                blocages.push('6DE saisi (' + declare + ' €) supérieur à la CSG déductible hors part '
                    + 'automatique (' + candidat + ' €) : la part 2BH/2DF (' + auto
                    + ' €) est calculée automatiquement, ne pas l’ajouter.');
            } else if (declare > candidat + 0.01) {
                avertissements.push('6DE saisi (' + declare + ' €) supérieur aux montants personnels '
                    + 'déclarés (' + candidat + ' €) : vérifiez l’avis d’imposition.');
                doubleCompte = false;
            } else doubleCompte = false;
        }
        if (blocages.length) {
            return { etat: 'CSG 6DE refusée : double compte détecté', disponible: false, montant6DE: null,
                montant6DEDu: candidat, csgDeductibleTotale: total,
                doubleCompte: true, regles: regles, blocages: blocages, avertissements: avertissements,
                partAuto2BH2DF: auto, csgPatrimoinePayee: patrimoine, tauxCsgDeductible: taux };
        }
        return {
            etat: declare !== null ? 'CSG 6DE contrôlée : pas de double compte' : 'CSG 6DE indicative',
            disponible: true, montant6DE: candidat, montant6DEDu: candidat,
            csgDeductibleTotale: total, partAuto2BH2DF: auto,
            csgPatrimoinePayee: patrimoine, doubleCompte: doubleCompte,
            origine: 'montants personnels saisis, jamais déduits de la seule lecture des brochures',
            regles: regles, blocages: [], avertissements: avertissements, tauxCsgDeductible: taux,
            limite: 'à confronter à l’avis d’imposition et au préremplissage ; ne remplace pas la déclaration.'
        };
    }

    /* ----------------------------------------------------------------- 2086 */

    function portee2086Foyer(donnees) {
        var d = donnees || {};
        var annee = Number.isInteger(d.annee) ? d.annee : null;
        var seuil = nombre(d.seuilOfficiel) !== null ? nombre(d.seuilOfficiel) : null;
        var total = nombre(d.totalPrixCessionPortefeuille);
        var operations = Number.isInteger(d.operationsPortefeuille) ? d.operationsPortefeuille : null;
        var options = {
            troisCN: 'option globale pour les actifs numériques du foyer, indépendante de 2OP',
            deuxOP: 'option globale pour les gains de titres et les RCM, distincte de 3CN',
            jamaisConfondues: true
        };
        var exclusions = ['autres portefeuilles et plateformes du foyer', 'cessions des autres membres du foyer',
            'opérations en sursis d’imposition', 'actifs détenus hors de ce portefeuille'];
        if (!annee) return { etat: NON_DISPONIBLE, certifieFoyer: false, reportable: false,
            seuilApplicable: null, options: options, exclusions: exclusions, blocages: ['année absente'] };
        if (total === null) return { etat: NON_DISPONIBLE, certifieFoyer: false, reportable: false,
            seuilApplicable: null, options: options, exclusions: exclusions,
            blocages: ['total des prix de cession du portefeuille absent'] };

        var atteste = d.attestationFoyerComplet === true;
        var seuilConnu = seuil !== null && seuil > 0;
        // Inférence à sens unique seulement : portefeuille > seuil ⇒ foyer > seuil.
        var exclusionCertaine = seuilConnu && total > seuil;
        var exonerationPossible = seuilConnu && total <= seuil;
        return {
            etat: atteste ? 'portée du foyer attestée par le propriétaire : annexe non certifiée par l’application'
                : 'portefeuille seul : annexe 2086 non certifiée au niveau du foyer',
            certifieFoyer: false,           // jamais true : l'application ne peut pas le vérifier
            reportable: atteste,
            operationsPortefeuille: operations, totalPrixCessionPortefeuille: total,
            seuilOfficiel: seuil,
            seuilApplicable: exclusionCertaine ? 'seuil dépassé par le seul portefeuille : exonération exclue'
                : exonerationPossible ? 'seuil non atteint par ce portefeuille : l’exonération du foyer n’est pas prouvée'
                    : NON_DISPONIBLE,
            exonereFoyer: exclusionCertaine ? false : null,
            options: options, exclusions: exclusions,
            blocages: atteste ? [] : ['complétude du foyer non attestée : cases 3AN/3BN non certifiées'],
            avertissements: exonerationPossible && !atteste
                ? ['un total de ' + total + ' € sur ce seul portefeuille ne prouve pas que le foyer reste sous '
                    + seuil + ' € ; ne pas conclure à l’exonération'] : [],
            limite: 'les cases 3AN/3BN sont celles du FOYER ; la formule, les frais et le seuil sont relus, '
                + 'l’exhaustivité des cessions ne l’est jamais depuis un seul portefeuille.'
        };
    }

    /* -------------------------------------------------------------------- QF */

    /* Seule la règle GÉNÉRALE est modélisée. Un cas particulier n'est pas
       recalculé : il est détecté et bloque la certification. */
    function casParticuliersQF(donnees) {
        var d = donnees || {};
        var parts = nombre(d.parts), couple = d.statut && /mari|pacs/i.test(String(d.statut));
        var enfants = Number.isInteger(d.enfants) ? Math.max(0, d.enfants) : null;
        var drapeaux = {
            parentIsole: d.parentIsole === true || d.caseT === true,
            invalidite: d.invalidite === true || d.caseP === true || d.caseF === true,
            ancienCombattant: d.ancienCombattant === true || d.caseS === true || d.caseL === true,
            veuf: d.veuf === true || d.caseG === true || d.caseW === true,
            personneAChargeHandicapee: d.personneAChargeHandicapee === true,
            enfantMarieRattache: d.enfantMarieRattache === true,
            residenceAlternee: d.residenceAlternee === true
        };
        var particuliers = Object.keys(drapeaux).filter(function (k) { return drapeaux[k]; });
        var blocages = [], avertissements = [];
        if (particuliers.length) {
            blocages.push('cas particulier du quotient familial : ' + particuliers.join(', ')
                + ' — le plafond général ne suffit pas, bilan et recommandation 2OP non certifiés.');
        }
        if (parts !== null && enfants !== null) {
            var attendues = (couple ? 2 : 1) + (enfants <= 2 ? enfants * 0.5
                : 1 + (enfants - 2));
            if (Math.abs(parts - attendues) > 1e-9) {
                avertissements.push('parts saisies (' + fr(parts) + ') différentes de la règle générale ('
                    + fr(attendues) + ') : une demi-part particulière est probable, les plafonds spéciaux '
                    + 'ne sont pas modélisés.');
                if (!particuliers.length) blocages.push('demi-part non expliquée par la règle générale : '
                    + 'plafond QF particulier non modélisé.');
            }
        } else if (parts === null) {
            avertissements.push('nombre de parts absent : contrôle du plafond QF impossible.');
        }
        return {
            etat: blocages.length ? 'quotient familial non certifié' : 'règle générale du quotient familial',
            certifie: !blocages.length, plafondsSpeciauxModelises: false,
            parts: parts, couple: !!couple, enfants: enfants, drapeaux: drapeaux,
            casParticuliers: particuliers, blocages: blocages, avertissements: avertissements,
            limite: 'plafond général par demi-part seulement ; plafonds particuliers, majorations et '
                + 'demi-parts supplémentaires hors périmètre.'
        };
    }

    /* Séparation stricte : paramètres PUBLICS d'un côté, données personnelles
       et PAS de l'autre. Aucun des garde-fous ci-dessus n'écrit en base. */
    function perimetreDonnees(donnees) {
        var d = donnees || {};
        var publiques = ['bareme', 'decote', 'plafond_qf_general', 'frais_salaries', 'taux_ps',
            'seuil_cessions', 'regles_declaratives'];
        var personnelles = ['salaires', 'interets', 'precompte_reel', 'montants_2BH_2DF_6DE',
            'options_2OP_3CN_du_foyer', 'parts_et_cas_particuliers', 'taux_pas'];
        var melange = personnelles.filter(function (k) { return d[k] !== undefined && d[k] !== null
            && d[k].source === 'collecte_publique'; });
        return { publiques: publiques, personnelles: personnelles, melangeInterdit: melange,
            conforme: !melange.length,
            regle: 'les paramètres publics proviennent des documents DGFiP ; les montants personnels, '
                + 'le précompte réel et le PAS proviennent du propriétaire et restent hors des caches publics.' };
    }

    PF.fiscalGardesFoyer = {
        csgDeductible6DE: csgDeductible6DE, portee2086Foyer: portee2086Foyer,
        casParticuliersQF: casParticuliersQF, perimetreDonnees: perimetreDonnees,
        TAUX_CSG_DEDUCTIBLE: TAUX_CSG_DEDUCTIBLE, NON_DISPONIBLE: NON_DISPONIBLE
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
