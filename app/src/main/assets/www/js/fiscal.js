/* Fiscalité française. Portage de core/fiscal_bars.py et core/tax.py.
   Règle : aucun taux n'est deviné. Une année absente du barème est signalée,
   jamais extrapolée. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util, UI = PF.ui;

    // ------------------------------------------------------------------ barèmes

    /* Barèmes et décotes recoupés au BOFiP le 16/10/2026, version par millésime :
       revenus 2022 (publication 26/06/2023), 2023 (18/06/2024), 2024 (14/04/2025),
       2025 (07/04/2026). Les valeurs historiques non conformes ont été REMPLACÉES
       par les valeurs officielles ; l'écart et sa source sont consignés dans
       PF.fiscalCouverture.CORRECTIONS_OFFICIELLES et dans
       docs/MATRICE-COUVERTURE-FISCALE-2023-2026.md §5.3. 2026 reste provisoire :
       aucun document « revenus 2026 » n'est publié. */
    var BAREMES = {
        2022: { tranches: [10777, 27478, 78570, 168994], taux: [0.11, 0.30, 0.41, 0.45], dc: 833, dcPlafond: 1841, dcCouple: 1378, dcPlafondCouple: 3045 },
        2023: { tranches: [11294, 28797, 82341, 177106], taux: [0.11, 0.30, 0.41, 0.45], dc: 873, dcPlafond: 1929, dcCouple: 1444, dcPlafondCouple: 3191 },
        2024: { tranches: [11497, 29315, 83823, 180294], taux: [0.11, 0.30, 0.41, 0.45], dc: 889, dcPlafond: 1965, dcCouple: 1470, dcPlafondCouple: 3249 },
        2025: { tranches: [11600, 29579, 84577, 181917], taux: [0.11, 0.30, 0.41, 0.45], dc: 897, dcPlafond: 1982, dcCouple: 1483, dcPlafondCouple: 3277 },
        2026: { tranches: [11600, 29579, 84577, 181917], taux: [0.11, 0.30, 0.41, 0.45], dc: 898, dcPlafond: 1986, dcCouple: 1486, dcPlafondCouple: 3284 }
    };
    var TAUX_DECOTE = 0.4525;
    var SEUIL_NON_RECOUVREMENT_IR = 61;
    var TAUX_ABATTEMENT_SALAIRES = 0.10;
    var SEUILS_KM_VOITURE = [5000, 20000];
    var MAJORATION_VOITURE_ELECTRIQUE = 0.20;
    var SOURCE_PAR_ANNEE = {
        2022: 'Barème, décote et plafond QF recoupés BOFiP le 16/10/2026 (versions du 26/06/2023)',
        2023: 'Barème, décote et plafond QF recoupés BOFiP le 16/10/2026 (versions du 18/06/2024)',
        2024: 'Barème, décote et plafond QF recoupés BOFiP le 16/10/2026 (versions du 14/04/2025)',
        2025: 'Tranches et décote recoupées BOFiP — autres règles à valider',
        2026: 'Hypothèses provisoires — revenus 2026 non vérifiés'
    };

    var IR_FORFAITAIRE = 0.128;               // part IR du PFU (CGI art. 200 A)
    // Revenus du patrimoine non précomptés : PV de titres/crypto et RCM non précomptés.
    var PS_PAR_ANNEE = {
        2018: 0.172, 2019: 0.172, 2020: 0.172, 2021: 0.172, 2022: 0.172,
        2023: 0.172, 2024: 0.172, 2025: 0.186, 2026: 0.186
    };
    // RCM déjà soumis aux PS lors du versement, sans double prélèvement.
    var PS_PRECOMPTES_PAR_ANNEE = {
        2018: 0.172, 2019: 0.172, 2020: 0.172, 2021: 0.172, 2022: 0.172,
        2023: 0.172, 2024: 0.172, 2025: 0.172, 2026: 0.186
    };
    /* Provenance des taux de PS embarqués, millésime par millésime. 2026 est
       une RECONDUCTION de 2025 : aucun document du millésime « revenus 2026 »
       n'existe, elle ne peut donc pas être présentée comme officielle. Cette
       table ne change aucun calcul ; elle interdit de faire passer une
       constante recopiée pour une mise à jour vérifiée. */
    var PROVENANCE_PS = {
        2023: 'BOFiP crypto/titres : 17,2 % stable, attribution par année de cession non vérifiée',
        2024: 'BOFiP crypto/titres : 17,2 % stable, attribution par année de cession non vérifiée',
        2025: 'titres : aide du simulateur 2026 (revenus 2025 explicites), divergence notice 2042 signalée ; '
            + 'crypto : recoupement BOFiP + brochure nouveautés revenus 2025, non activé',
        2026: 'reconduction de 2025, aucun document du millésime revenus 2026 : non établi'
    };
    var CSG_DEDUCTIBLE = 0.068;
    var CRYPTO_FRANCHISE_CESSIONS = 305.0;    // seuil sur le TOTAL des prix de cession
    var OR_PHYS_TFMP = 0.115, OR_PHYS_PV_IR = 0.19, OR_PHYS_PV_PS = 0.172;

    var PLANCHER_ABATTEMENT_10 = { 2022: 472, 2023: 495, 2024: 504, 2025: 509, 2026: 509 };
    var PLAFOND_ABATTEMENT_10 = { 2022: 13522, 2023: 14171, 2024: 14426, 2025: 14555, 2026: 14555 };
    var FORFAIT_REPAS = { 2022: 5.0, 2023: 5.2, 2024: 5.35, 2025: 5.45, 2026: 5.5 };
    var BAREME_KM = { 3: [0.529, 0.316, 1065, 0.370], 4: [0.606, 0.340, 1330, 0.407], 5: [0.636, 0.357, 1395, 0.427], 6: [0.665, 0.374, 1457, 0.447], 7: [0.697, 0.394, 1515, 0.470] };
    // Même hypothèse historique copiée pour chaque année ; seule 2025 a été
    // recoupée. Une rectification d'un millésime ne modifie pas les autres.
    var BAREME_KM_PAR_ANNEE = {};
    [2022, 2023, 2024, 2025, 2026].forEach(function (annee) {
        var copie = {};
        Object.keys(BAREME_KM).forEach(function (cv) { copie[cv] = BAREME_KM[cv].slice(); });
        BAREME_KM_PAR_ANNEE[annee] = copie;
    });

    var URL_MAJ_BAREMES = 'https://arena.ai/agent/01a0f24c-13af-734b-9dd4-91b1ceafa74f';

    // Collectes BOFiP / frais DGFiP par année et compte. Les anciennes
    // collectes OpenFisca restent en base mais ne sont plus relues ni appliquées.
    var revisionsActives = Object.create(null), officiels = Object.create(null),
        fraisOfficiels = Object.create(null), titresOfficiels = Object.create(null),
        recoupementsCrypto = Object.create(null);
    var sequenceLecture = 0, rapportsControle = Object.create(null);
    var compteRevisions = null, contexteRevisions = null, etatR2 = 'non lue', compteRapports = null;
    function paramsActifs(annee) { return revisionsActives[annee] || null; }
    function baremePartiel(annee) { return !paramsActifs(annee) && officiels[annee] && officiels[annee].ir || null; }
    function franchiseCrypto(annee) {
        var p = paramsActifs(annee);
        return p ? p.franchise_crypto : CRYPTO_FRANCHISE_CESSIONS;
    }
    function tauxIrForfaitaire(annee) {
        var p = paramsActifs(annee);
        return p ? p.ir_forfaitaire : IR_FORFAITAIRE;
    }
    function seuilIr(annee) {
        var p = paramsActifs(annee);
        return p ? p.seuil_non_recouvrement_ir : SEUIL_NON_RECOUVREMENT_IR;
    }
    function tauxCsg(annee) {
        var p = paramsActifs(annee);
        return p ? p.csg_deductible : CSG_DEDUCTIBLE;
    }
    function effacerRevisions() {
        var courant = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        if (compteRapports && (!courant || courant.id !== compteRapports)) {
            rapportsControle = Object.create(null); // pas de rapport du compte précédent
            compteRapports = null;
        }
        ++sequenceLecture;
        revisionsActives = Object.create(null);
        officiels = Object.create(null);
        fraisOfficiels = Object.create(null);
        titresOfficiels = Object.create(null);
        recoupementsCrypto = Object.create(null);
        compteRevisions = null;
        contexteRevisions = null;
        etatR2 = 'non lue';
    }
    function chargerCachesDgfip(compte) {
        if (!compte || !compte.id) return;
        if (PF.fiscalFraisSources) annees().forEach(function (an) {
            if (an >= 2023) fraisOfficiels[an] = PF.fiscalFraisSources.lireCache(an);
        });
        if (PF.fiscalDgfipSources) annees().forEach(function (an) {
            if (an >= 2023) officiels[an] = PF.fiscalDgfipSources.lireCache(an);
        });
        if (PF.fiscalRegimesSources) annees().forEach(function (an) {
            if (an >= 2023) titresOfficiels[an] = PF.fiscalRegimesSources.lireCache(an);
        });
        // Le recoupement PS crypto est relu et REVALIDÉ à chaque lecture : une
        // ligne en cache n'est jamais une preuve en soi.
        if (PF.fiscalCryptoPsRecoupement) annees().forEach(function (an) {
            if (an >= 2023) recoupementsCrypto[an] = PF.fiscalCryptoPsRecoupement.lireCache(an);
        });
    }
    function perimetreR2(ctx) {
        return ctx && Array.isArray(ctx.transactions) && ctx.transactionsChargees !== false && PF.modele &&
            typeof PF.modele.classeDe === 'function' && !ctx.transactions.some(function (t) {
                return PF.modele.classeDe(t.ticker) === 'or_physique';
            });
    }
    function actualiserRevisions(ctx) {
        effacerRevisions();
        var numero = sequenceLecture;
        var compte = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        // Les caches DGFiP sont indépendants de la sélection SQL de la R2.
        chargerCachesDgfip(compte);
        compteRevisions = compte && compte.id || null;
        contexteRevisions = ctx;
        // L'or détenu en métal relève d'un régime DISTINCT non publié par R2.
        // Une transaction physique dans les données chargées interdit de présenter
        // la couverture de cette révision comme intégrale pour ce portefeuille.
        if (!perimetreR2(ctx)) {
            etatR2 = !ctx || !Array.isArray(ctx.transactions) ? 'portefeuille non chargé'
                : ctx.transactionsChargees === false ? 'transactions indisponibles'
                : 'hors périmètre : or physique ou classe inconnue';
            return Promise.resolve(null);
        }
        if (!compte || !compte.id || !PF.fiscalRevisions) {
            etatR2 = 'session ou lecteur R2 absent';
            return Promise.resolve(null);
        }
        var chemins = PF.fiscalRevisions.cheminsFeuilles(snapshotConstantesCode(2025));
        return PF.fiscalRevisions.consulter(2025, chemins).then(function (selection) {
            var compteActuel = PF.net.auth.utilisateur();
            if (numero !== sequenceLecture || !compteActuel || compteActuel.id !== compte.id) return null;
            if (selection && selection.statut === 'candidat_structurel_non_homologue') {
                // L'objet réseau n'est pas conservé : copie non partagée pour la session.
                revisionsActives[2025] = JSON.parse(JSON.stringify(selection.parametres));
                etatR2 = 'active';
                return selection.revision;
            }
            etatR2 = 'révision inactive ou non compatible avec le lecteur';
            return null;
        }).catch(function () {
            etatR2 = 'lecture R2 impossible (connexion ou Supabase)';
            return null;
        }); // hors ligne : estimation embarquée, jamais ancienne règle en cache
    }
    function actualiserCollectesDgfip(ctx) {
        var compte = PF.net && PF.net.auth && PF.net.auth.utilisateur();
        if (!ctx || !Array.isArray(ctx.transactions) || ctx.transactionsChargees === false) {
            // Le contexte local allégé est affiché pendant le chargement. Ne
            // PAS effacer une lecture R2 en cours en tentant de la remplacer
            // par ce contexte incomplet ; la collecte DGFiP reste possible.
            chargerCachesDgfip(compte);
            if (!paramsActifs(2025)) etatR2 = !ctx || !Array.isArray(ctx.transactions)
                ? 'portefeuille non chargé (R2 en attente)' : 'transactions indisponibles (R2 non évaluée)';
            return Promise.resolve(null);
        }
        // La collecte publique ne doit PAS vider une R2 déjà vérifiée dans la
        // même session : une panne Supabase au clic provoquait un faux repli.
        if (paramsActifs(2025) && compte && compte.id === compteRevisions &&
            ctx === contexteRevisions && perimetreR2(ctx)) {
            chargerCachesDgfip(compte);
            return Promise.resolve(2);
        }
        return actualiserRevisions(ctx); // autre compte, contexte changé, ou réessai R2 absente
    }
    function revisionActive(annee) { return !!paramsActifs(annee); }

    function annees() { return Object.keys(BAREMES).map(Number).sort(function (a, b) { return a - b; }); }
    function derniereAnnee() { var a = annees(); return a[a.length - 1]; }
    function baremeDe(annee) {
        var p = paramsActifs(annee);
        if (p) {
            var b = p.bareme;
            return { tranches: b.tranches, taux: b.taux, dc: b.decote_base_celibataire,
                dcPlafond: b.decote_plafond_celibataire, dcCouple: b.decote_base_couple,
                dcPlafondCouple: b.decote_plafond_couple };
        }
        if (!BAREMES[annee]) throw new Error('Aucun barème enregistré pour ' + annee + '. Années disponibles : ' + annees().join(', ') + '.');
        var officiel = officiels[annee] || {};
        var embarque = BAREMES[annee];
        // 2026 ne peut pas simuler l'IR avec le barème recopié de 2025.
        if (annee >= 2026 && (!officiel.ir || !officiel.decote || !officiel.qf ||
            !fraisOfficiels[annee] || !fraisOfficiels[annee].repas || !fraisOfficiels[annee].km ||
            !fraisOfficiels[annee].abatt))
            throw new Error('Revenus ' + annee + ' : barème, décote ou plafond QF DGFiP non disponible ; simulation suspendue.');
        return { tranches: officiel.ir ? officiel.ir.tranches : embarque.tranches,
            taux: officiel.ir ? officiel.ir.taux : embarque.taux,
            dc: officiel.decote ? officiel.decote.dc : embarque.dc,
            dcPlafond: officiel.decote ? officiel.decote.dcPlafond : embarque.dcPlafond,
            dcCouple: officiel.decote ? officiel.decote.dcCouple : embarque.dcCouple,
            dcPlafondCouple: officiel.decote ? officiel.decote.dcPlafondCouple : embarque.dcPlafondCouple };
    }
    function tauxPS(annee) {
        var p = paramsActifs(annee);
        if (p) return p.prelevements_sociaux_par_categorie.plus_values_titres;
        if (titresOfficiels[annee]) return titresOfficiels[annee].ps;
        if (PS_PAR_ANNEE[annee] === undefined) throw new Error('Aucun taux de prélèvements sociaux pour ' + annee + '.');
        return PS_PAR_ANNEE[annee];
    }
    function tauxPFU(annee) { return tauxIrForfaitaire(annee) + tauxPS(annee); }
    function tauxPSRevenuMobilier(annee, precompte) {
        if (typeof precompte !== 'boolean') throw new Error('Préciser si les PS des intérêts ont déjà été précomptés.');
        var p = paramsActifs(annee);
        if (p) return precompte ? p.prelevements_sociaux_par_categorie.rcm_precomptes_en_2025
            : p.prelevements_sociaux_par_categorie.rcm_non_precomptes;
        // Un taux DGFiP des plus-values de titres n'est PAS le taux RCM
        // (précompte, date de paiement et exceptions propres au produit).
        if (!precompte) {
            if (PS_PAR_ANNEE[annee] === undefined)
                throw new Error('Aucun taux de PS pour les revenus mobiliers de ' + annee + '.');
            return PS_PAR_ANNEE[annee];
        }
        if (PS_PRECOMPTES_PAR_ANNEE[annee] === undefined) throw new Error('Aucun taux de PS précomptés pour ' + annee + '.');
        return PS_PRECOMPTES_PAR_ANNEE[annee];
    }
    /* Taux de PS des plus-values de titres ÉTABLI pour un millésime : une
       révision publiée ou un document DGFiP de ce millésime. Renvoie null
       sinon — jamais la constante embarquée, qui peut être une reconduction
       silencieuse de l'année précédente (2026 = copie de 2025). */
    function tauxPSEtabli(annee) {
        var p = paramsActifs(annee);
        if (p) return { taux: p.prelevements_sociaux_par_categorie.plus_values_titres,
            statut: 'révision publiée', provenance: 'R2 publiée par le propriétaire (Supabase)' };
        if (titresOfficiels[annee]) return { taux: titresOfficiels[annee].ps, statut: 'établi',
            provenance: PROVENANCE_PS[annee] || 'document DGFiP du millésime' };
        return null;
    }
    /* Recoupement PS crypto : statut « recoupement » ou « partiel », jamais
       une activation. La R2 publiée reste prioritaire. */
    function psCryptoRecoupement(annee) { return recoupementsCrypto[annee] || null; }

    /* Plafond général du quotient familial, par demi-part supplémentaire, recoupé
       au BOFiP BOI-IR-LIQ-20-20-20 le 16/10/2026 : 1 678 € « à compter de
       l'imposition des revenus de l'année 2022 », 1 759 € pour 2023, 1 791 € pour
       2024, 1 807 € pour 2025. 2022 et 2024 portaient la valeur 2023 reconduite.
       2026 reste provisoire : rien n'est publié pour les revenus 2026. */
    var PLAFOND_QF_GENERAL = { 2022: 1678, 2023: 1759, 2024: 1791, 2025: 1807, 2026: 1807 };
    function plafondQF(annee) {
        var p = paramsActifs(annee);
        if (p) return p.quotient_familial.plafond_general_par_demi_part;
        if (officiels[annee] && typeof officiels[annee].qf === 'number') return officiels[annee].qf;
        if (annee >= 2026) throw new Error('Plafond QF DGFiP non disponible pour les revenus ' + annee + '.');
        if (PLAFOND_QF_GENERAL[annee] === undefined) throw new Error('Aucun plafond QF pour ' + annee + '.');
        return PLAFOND_QF_GENERAL[annee];
    }

    // ----------------------------------------------------------- impôt sur le revenu

    /* La première tranche est à 0 % : les taux sont préfixés d'un zéro. */
    function impotParPart(revenu, b) {
        var bornes = [0].concat(b.tranches);
        var taux = [0].concat(b.taux);
        var impot = 0;
        for (var i = 0; i < taux.length; i++) {
            var bas = bornes[i];
            var haut = i + 1 < bornes.length ? bornes[i + 1] : Infinity;
            if (revenu > bas) impot += (Math.min(revenu, haut) - bas) * taux[i];
        }
        return impot;
    }

    function estCouple(statut) {
        var s = String(statut || '').toLowerCase();
        return s.indexOf('mari') >= 0 || s.indexOf('pacs') >= 0;
    }

    function euro2025(valeur, annee) { return annee === 2025 ? Math.floor(valeur + .5) : valeur; }

    function impotRevenu(revenu, parts, annee, statut, appliquerSeuil) {
        var b = baremeDe(annee);
        revenu = euro2025(Math.max(0, U.num(revenu, 0)), annee);
        parts = Math.max(0.5, U.num(parts, 1));
        var couple = estCouple(statut);
        var partsBase = couple ? 2 : 1;

        var qf = revenu / parts;
        var impotNonPlafonne = impotParPart(qf, b) * parts;
        var impot, gainMax;
        if (parts > partsBase) {
            var impotBase = impotParPart(revenu / partsBase, b) * partsBase;
            gainMax = (parts - partsBase) * 2 * plafondQF(annee);
            if ((impotBase - impotNonPlafonne) > gainMax) {
                impot = Math.max(0, impotBase - gainMax);
                qf = revenu / partsBase;
            } else impot = impotNonPlafonne;
        } else impot = impotNonPlafonne;

        impot = euro2025(impot, annee);
        // TMI : taux de la tranche dans laquelle tombe le quotient familial.
        var tmi = b.taux[b.taux.length - 1];
        for (var i = 0; i < b.tranches.length; i++) {
            if (qf <= b.tranches[i]) {
                tmi = i > 0 ? b.taux[i - 1] : 0;
                break;
            }
        }

        var decote = 0;
        var base = couple ? b.dcCouple : b.dc;
        var plafond = couple ? b.dcPlafondCouple : b.dcPlafond;
        if (impot <= plafond) {
            decote = Math.max(0, base - impot * (paramsActifs(annee) ? paramsActifs(annee).bareme.decote_taux : TAUX_DECOTE));
            decote = euro2025(Math.min(decote, impot), annee);
        }
        var net = impot - decote;
        if (appliquerSeuil !== false && net < seuilIr(annee)) net = 0;  // seul si IR global = barème
        return { impot_brut: impot, decote: decote, impot_net: net, tmi: tmi, quotient: qf, annee: annee, plafonnement: gainMax || 0 };
    }

    function abattement10(salaire, annee) {
        if (!paramsActifs(annee) && (PLANCHER_ABATTEMENT_10[annee] === undefined || PLAFOND_ABATTEMENT_10[annee] === undefined))
            throw new Error('Aucun abattement 10 % pour les revenus ' + annee + '.');
        var sal = Math.max(0, U.num(salaire, 0));
        if (sal <= 0) return 0;
        var frais = fraisOfficiels[annee] && fraisOfficiels[annee].abatt;
        var plancher = paramsActifs(annee) ? paramsActifs(annee).abattement_10.plancher : frais ? frais.min : PLANCHER_ABATTEMENT_10[annee];
        var plafond = paramsActifs(annee) ? paramsActifs(annee).abattement_10.plafond : frais ? frais.max : PLAFOND_ABATTEMENT_10[annee];
        return euro2025(Math.min(Math.max(sal * (paramsActifs(annee) ? paramsActifs(annee).abattement_10.taux : TAUX_ABATTEMENT_SALAIRES), Math.min(sal, plancher)), plafond), annee);
    }

    /* Frais de repas aux frais réels : nombre de jours × forfait URSSAF/DGFiP
       de l'année. Pas de forfait connu pour l'année = pas de montant inventé. */
    function forfaitRepas(annee) {
        if (paramsActifs(annee)) return paramsActifs(annee).forfait_repas;
        var officiel = fraisOfficiels[annee];
        if (officiel && typeof officiel.repas === 'number') return officiel.repas;
        if (annee >= 2026 || FORFAIT_REPAS[annee] === undefined) return null;
        return FORFAIT_REPAS[annee];
    }

    function fraisRepas(jours, annee) {
        var j = Math.max(0, Math.round(U.num(jours, 0)));
        var taux = forfaitRepas(annee);
        if (j <= 0) return { montant: 0, formule: '0 repas' };
        if (taux === null) {
            return { montant: 0, formule: 'Aucun forfait repas enregistré pour ' + annee + ' : montant non calculé' };
        }
        var montant = U.arrondi(j * taux, 2);
        return {
            montant: montant,
            formule: 'Repas : ' + U.nombre(j, 0) + ' j × ' + U.nombre(taux, 2) + ' € = ' + U.nombre(montant, 2) + ' €'
        };
    }

    /* Frais réels d'un déclarant : barème kilométrique + forfait repas,
       comparés à l'abattement automatique de 10 %. C'est la comparaison qui
       décide, pas la préférence déclarée. La case 1AK/1BK porte le MONTANT DES
       FRAIS, pas le salaire après déduction — l'erreur inverse était affichée
       avant ce correctif. */
    function fraisReelsDeclarant(reglages, n, annee) {
        var r = reglages || {};
        var salaire = U.num(r['salaireNetImposable' + n], 0);
        var abattement = abattement10(salaire, annee);
        var utilise = U.estVrai(r['utiliserFraisReels' + n]);
        var km = fraisKilometriques(r['fraisKm' + n], r['cvFiscal' + n], U.estVrai(r['vehiculeElectrique' + n]), annee);
        var repas = fraisRepas(r['joursRepas' + n], annee);
        var total = U.arrondi(km.montant + repas.montant, 2);
        var retenir = utilise && total > abattement;
        return {
            salaire: salaire, abattement: abattement, km: km, repas: repas,
            total: total, utilise: utilise, retenir: retenir,
            deduction: retenir ? euro2025(total, annee) : abattement,
            caseValeur: retenir ? Math.round(total) : null,
            gain: U.arrondi(Math.max(0, total - abattement), 2)
        };
    }

    function fraisKilometriques(km, cv, electrique, annee) {
        if (!paramsActifs(annee) && !BAREME_KM_PAR_ANNEE[annee])
            throw new Error('Aucun barème kilométrique pour les revenus ' + annee + '.');
        var d = Math.max(0, U.num(km, 0));
        if (d <= 0) return { montant: 0, formule: '0 km' };
        var cle = Math.min(Math.max(Math.round(U.num(cv, 5)), 3), 7);
        var sourceKm = !paramsActifs(annee) && fraisOfficiels[annee] && fraisOfficiels[annee].km;
        if (annee >= 2026 && !sourceKm && !paramsActifs(annee))
            throw new Error('Barème kilométrique DGFiP des revenus ' + annee + ' non disponible.');
        var f = paramsActifs(annee) ? paramsActifs(annee).bareme_km[cle]
            : sourceKm ? sourceKm[cle] : BAREME_KM_PAR_ANNEE[annee][cle];
        var montant, formule;
        if (d <= (paramsActifs(annee) ? paramsActifs(annee).regles_km.seuils_distance_km[0] : SEUILS_KM_VOITURE[0])) { montant = d * f[0]; formule = U.nombre(d, 0) + ' km × ' + U.nombre(f[0], 3); }
        else if (d <= (paramsActifs(annee) ? paramsActifs(annee).regles_km.seuils_distance_km[1] : SEUILS_KM_VOITURE[1])) { montant = d * f[1] + f[2]; formule = '(' + U.nombre(d, 0) + ' km × ' + U.nombre(f[1], 3) + ') + ' + U.nombre(f[2], 0) + ' €'; }
        else { montant = d * f[3]; formule = U.nombre(d, 0) + ' km × ' + U.nombre(f[3], 3); }
        if (electrique) { var maj = paramsActifs(annee) ? paramsActifs(annee).regles_km.majoration_electrique : MAJORATION_VOITURE_ELECTRIQUE; montant *= 1 + maj; formule += ' × ' + U.nombre(1 + maj, 2) + ' (électrique)'; }
        return { montant: U.arrondi(montant, 2), formule: formule + ' = ' + U.nombre(montant, 2) + ' €' };
    }

    /* Option 2OP : ne pas mélanger le taux des titres et celui des RCM déjà
       précomptés ; la CSG des titres est déductible à son paiement (N+1). */
    function comparerPfuBareme(pv, autresRevenus, parts, annee, statut, interets, interetsPrecomptes) {
        pv = Math.max(0, U.num(pv, 0));
        interets = Math.max(0, U.num(interets, 0));
        if (interets > 0 && typeof interetsPrecomptes !== 'boolean')
            throw new Error('Indiquez si les prélèvements sociaux des intérêts ont déjà été précomptés lors du versement ; le pays ne suffit pas.');
        if (pv + interets <= 0) return { choix: 'PFU', gain: 0, detail: 'Aucun revenu mobilier imposable.' };
        var psInterets = interets ? interets * tauxPSRevenuMobilier(annee, interetsPrecomptes) : 0;
        var ps = pv * tauxPS(annee) + psInterets;
        var irSans = impotRevenu(autresRevenus, parts, annee, statut);
        var irSansBrut = impotRevenu(autresRevenus, parts, annee, statut, false).impot_net;
        var irForfaitBrut = euro2025((pv + interets) * tauxIrForfaitaire(annee), annee);
        var pfuGlobal = irSansBrut + irForfaitBrut;
        var pfuIr = pfuGlobal >= seuilIr(annee) ? irForfaitBrut : 0;
        var irBaremeDebloque = pfuIr ? irSansBrut - irSans.impot_net : 0;
        var pfuTotal = pfuIr + irBaremeDebloque + ps;

        var csgCetteAnnee = interetsPrecomptes ? interets * tauxCsg(annee) : 0;
        var csgApresPaiement = (pv + (interetsPrecomptes ? 0 : interets)) * tauxCsg(annee);
        var irAvec = impotRevenu(autresRevenus + pv + interets - csgCetteAnnee, parts, annee, statut, false);
        var irMarginal = Math.max(0, (irAvec.impot_net >= seuilIr(annee) ? irAvec.impot_net : 0) - irSans.impot_net);
        var baremeTotal = irMarginal + ps;
        var avantage = pfuTotal - baremeTotal;

        return {
            annee: annee, plus_value_nette: pv + interets,
            pfu: { ir: pfuIr, ir_bareme_debloque: irBaremeDebloque, ps: ps, total: pfuTotal },
            bareme: { ir_marginal: irMarginal, ps: ps, total: baremeTotal,
                csg_deductible: csgCetteAnnee, csg_deductible_apres_paiement_estimee: csgApresPaiement },
            ps_titres: pv * tauxPS(annee), ps_interets: psInterets,
            ps_deja_precomptes: interetsPrecomptes ? psInterets : 0,
            choix: baremeTotal < pfuTotal ? 'Barème progressif' : 'PFU',
            gain: Math.abs(avantage), tmi: irAvec.tmi, cocher_2op: baremeTotal < pfuTotal
        };
    }

    /* 2OP (titres + RCM) et 3CN (crypto) : options indépendantes, mais IR
       progressif calculé conjointement sur les assiettes sélectionnées. */
    function comparerOptionsFoyer(revenuSalaires, parts, annee, statut, pvTitres, interets, precomptes, pvCrypto) {
        var pv = Math.max(0, U.num(pvTitres, 0));
        var rcm = Math.max(0, U.num(interets, 0));
        var crypto = Math.max(0, U.num(pvCrypto, 0));
        if (rcm > 0 && typeof precomptes !== 'boolean')
            throw new Error('Indiquez si les prélèvements sociaux des intérêts ont déjà été précomptés lors du versement ; le pays du courtier ne suffit pas.');
        var irSalaires = impotRevenu(revenuSalaires, parts, annee, statut).impot_net;
        var psTitres = pv * tauxPS(annee);
        var psInterets = rcm ? rcm * tauxPSRevenuMobilier(annee, precomptes) : 0;
        // Même raison : la crypto n'emprunte pas le taux des titres.
        var psCrypto = crypto * (paramsActifs(annee)
            ? paramsActifs(annee).prelevements_sociaux_par_categorie.plus_values_crypto_privees
            : PS_PAR_ANNEE[annee]);
        var psTotal = psTitres + psInterets + psCrypto;
        var psDeja = precomptes ? psInterets : 0;
        var scenarios = [];
        var opChoix = pv + rcm > 0 ? [false, true] : [false];
        var cnChoix = crypto > 0 && annee >= 2023 ? [false, true] : [false];
        opChoix.forEach(function (op) {
            cnChoix.forEach(function (cn) {
                var csgPayee = op && precomptes ? rcm * tauxCsg(annee) : 0;
                var revenuBareme = revenuSalaires + (op ? pv + rcm : 0) + (cn ? crypto : 0) - csgPayee;
                var irBareme = impotRevenu(revenuBareme, parts, annee, statut, false).impot_net;
                var irForfait = euro2025(tauxIrForfaitaire(annee) * ((op ? 0 : pv + rcm) + (cn ? 0 : crypto)), annee);
                if (irBareme + irForfait < seuilIr(annee)) {
                    irBareme = 0; irForfait = 0;
                }
                var total = irBareme + irForfait + psTotal;
                scenarios.push({
                    cocher_2op: op, cocher_3cn: cn,
                    ir_bareme: irBareme, ir_forfaitaire: irForfait,
                    ps_titres: psTitres, ps_interets: psInterets, ps_crypto: psCrypto,
                    ps_total: psTotal, ps_deja_precomptes: psDeja,
                    ps_restants: psTotal - psDeja, csg_deductible_annee: csgPayee,
                    impot_total_foyer: total, cout_capital: total - irSalaires
                });
            });
        });
        var retenu = scenarios.reduce(function (best, s) {
            return s.impot_total_foyer < best.impot_total_foyer ? s : best;
        }, scenarios[0]);
        return {
            scenarios: scenarios, retenu: retenu,
            economie_vs_pfu: scenarios[0].impot_total_foyer - retenu.impot_total_foyer,
            assiette_2op: pv + rcm, assiette_3cn: annee >= 2023 ? crypto : 0,
            limite: 'Estimation sur les seuls revenus saisis ; 2OP est globale pour tous les RCM et gains mobiliers du foyer. Vérifiez les autres revenus et la déclaration officielle.'
        };
    }

    /* Taux de prélèvement à la source (CGI art. 204 H & 204 M). */
    function tauxPAS(revenuNet, parts, annee, statut, declarant) {
        var foyer = impotRevenu(revenuNet, parts, annee, statut);
        var tauxFoyer = revenuNet > 0 ? foyer.impot_net / revenuNet : 0;
        var res = { taux_foyer: tauxFoyer, impot: foyer.impot_net };
        if (declarant) {
            var couple = estCouple(statut);
            var partsIndiv = couple ? (parts - 1) : parts;
            if (partsIndiv >= 0.5) {
                var revenuIndiv = couple ? revenuNet / 2 : revenuNet;
                var parts1 = Math.max(0.5, partsIndiv < 1 ? 0.5 : partsIndiv);
                var ir1 = impotRevenu(revenuIndiv, parts1, annee, couple ? 'Célibataire' : statut);
                res.taux_individuel = revenuIndiv > 0 ? ir1.impot_net / revenuIndiv : 0;
                res.impot_individuel = ir1.impot_net;
            }
        }
        return res;
    }

    // --------------------------------------------------- mise à jour des barèmes

    function verifierMaj(anneeCible) {
        var auj = new Date();
        var an = auj.getFullYear();
        var cible = anneeCible || an;
        var derniere = derniereAnnee();
        if (an > derniere || cible > derniere) {
            return {
                disponible: true, derniere_annee: derniere, url: URL_MAJ_BAREMES,
                message: 'Revenus ' + Math.max(an, cible) + ' absents (dernier millésime : ' + derniere
                    + '). Vérifiez leur publication officielle avant tout ajout.'
            };
        }
        if (revisionActive(cible)) {
            return { disponible: false, derniere_annee: derniere, url: URL_MAJ_BAREMES,
                message: 'Paramètres publiés pour les revenus ' + cible + ' appliqués ; les situations personnelles restent à vérifier.' };
        }
        if (officiels[cible] && officiels[cible].ir && officiels[cible].decote && officiels[cible].qf) {
            return { disponible: false, derniere_annee: derniere, url: URL_MAJ_BAREMES,
                message: 'IR, décote et plafond QF général DGFiP des revenus ' + cible
                    + ' relus ; autres régimes et conditions personnels non certifiés.' };
        }
        var src = SOURCE_PAR_ANNEE[cible] || '';
        if ((/recouper|provisoire/i).test(src) && auj >= new Date(cible + 1, 3, 1)) {
            return {
                disponible: true, derniere_annee: derniere, url: URL_MAJ_BAREMES,
                message: 'Hypothèses pour les revenus ' + cible + ' : vérification officielle requise. '
                    + 'La date seule ne prouve pas la publication des barèmes.'
            };
        }
        return {
            disponible: false, derniere_annee: derniere, url: URL_MAJ_BAREMES,
            message: 'Constantes intégrées jusqu’aux revenus ' + derniere + ' (PFU titres '
                + U.nombre(tauxPFU(derniere) * 100, 1) + ' % — ' + (PROVENANCE_PS[derniere] || 'provenance non documentée')
                + '). Cela ne prouve ni l’exactitude des règles ni l’absence de rectification.'
        };
    }

    var PROMPT_MAJ = 'Mets à jour le fichier core/fiscal_bars.py du projet MonPortefeuille2.\n\n'
        + 'Je veux le millésime {ANNEE} des revenus, au format du fichier existant :\n'
        + '- Bareme(annee, tranches=(4 plafonds), taux=(0.11, 0.30, 0.41, 0.45), '
        + 'decote_base_celibataire, decote_plafond_celibataire, decote_base_couple, decote_plafond_couple)\n'
        + '- taux de prélèvements sociaux sur le capital mobilier (PS_PAR_ANNEE)\n'
        + '- plafond/plancher de l’abattement forfaitaire de 10 % sur les salaires\n'
        + '- forfait repas et barème kilométrique\n\n'
        + 'Sources à citer explicitement : BOFiP, loi de finances, LFSS. '
        + 'N’invente aucune valeur : si un chiffre est introuvable, laisse l’année absente et dis-le. '
        + 'Rends le fichier complet, prêt à remplacer l’ancien, avec les commentaires de source.';

    // -------------------------------------------------------------- plus-values

    /* Cessions de l'année, lots FIFO, coût converti en euros à la date de
       chaque transaction (jamais une conversion manuelle). */
    function cessionsAnnee(ctx, annee) {
        var txs = (ctx.transactions || []).filter(function (t) { return String(t.date).slice(0, 4) === String(annee); });
        if (!txs.length) return Promise.resolve({ parClasse: {}, total: 0, cessions: [], indisponible: [] });

        // Les lots se reconstituent depuis le tout premier achat : les taux de
        // tout l'historique sont demandés, pas seulement ceux de l'année.
        var besoin = {};
        (ctx.transactions || []).forEach(function (t) { if (t.devise !== 'EUR') besoin[t.devise + '|' + t.date] = 1; });

        return Promise.all(Object.keys(besoin).map(function (cle) {
            var p = cle.split('|');
            return PF.net.taux(p[0], p[1], 'EUR').then(function (v) { return [cle, v]; });
        })).then(function (paires) {
            var taux = {};
            paires.forEach(function (p) { taux[p[0]] = PF.util.tauxValide(p[1]); });

            var manquants = tauxManquants(ctx.transactions || [], taux);
            if (manquants.length) {
                return { parClasse: {}, total: null, cessions: [], indisponible: manquants };
            }

            var lots = {}, cessions = [];
            // On rejoue tout l'historique pour reconstituer les lots.
            (ctx.transactions || []).forEach(function (t) {
                var tEur = tauxTransaction(t, taux);
                if (!lots[t.ticker]) lots[t.ticker] = [];
                if (t.type === 'achat') {
                    lots[t.ticker].push({ qte: t.quantite, cout: t.montantNet * tEur });
                } else {
                    var restant = t.quantite;
                    var produit = (t.quantite * t.cours - t.frais) * tEur;
                    var cout = 0;
                    while (restant > 1e-9 && lots[t.ticker].length) {
                        var lot = lots[t.ticker][0];
                        var pris = Math.min(lot.qte, restant);
                        cout += (lot.cout / lot.qte) * pris;
                        lot.qte -= pris;
                        lot.cout -= (lot.cout / (lot.qte + pris)) * pris;
                        restant -= pris;
                        if (lot.qte <= 1e-9) lots[t.ticker].shift();
                    }
                    if (String(t.date).slice(0, 4) === String(annee)) {
                        cessions.push({
                            ticker: t.ticker, date: t.date, quantite: t.quantite,
                            produit: produit, cout: cout, pv: produit - cout,
                            prix_cession: t.quantite * t.cours,
                            classe: PF.modele.classeDe(t.ticker)
                        });
                    }
                }
            });

            var parClasse = {};
            cessions.forEach(function (c) {
                if (!parClasse[c.classe]) parClasse[c.classe] = { pv: 0, mv: 0, prix_cession: 0, nb: 0 };
                var o = parClasse[c.classe];
                o.nb += 1;
                o.prix_cession += c.prix_cession;
                if (c.pv >= 0) o.pv += c.pv; else o.mv += -c.pv;
            });
            var total = cessions.reduce(function (s, c) { return s + c.pv; }, 0);
            return { parClasse: parClasse, total: total, cessions: cessions, indisponible: [] };
        });
    }


    // -------------------------------------------------- moteur de déclaration
    /* Portage de core/tax.py — detail_2074_de_lannee, detail_2086_de_lannee et
       simuler_foyer_complet. Un seul moteur alimente les cinq formulaires :
       deux lectures différentes des mêmes écritures donneraient deux montants
       pour la même case, et une case fausse se paie.

       Deux méthodes distinctes, et ce n'est pas une subtilité :
       - titres (actions, ETF, ETC, or) : prix de revient moyen, comme la v2 ;
       - crypto-actifs : méthode proportionnelle de l'article 150 VH bis, la
         seule que l'administration accepte pour les actifs numériques. */

    var CLASSES_2074 = ['action_etf', 'obligation_etf', 'or'];

    function estAchat(t) { return String(t.type).indexOf('achat') >= 0; }

    /* Montant net dans la devise de cotation, converti en euros au cours du
       jour de l'opération : les frais entrent dans le prix de revient à
       l'achat, et sortent du prix de cession à la vente. */
    function montantNetEur(t, taux) {
        var brut = U.num(t.quantite, 0) * U.num(t.cours, 0);
        var net = estAchat(t) ? brut + U.num(t.frais, 0) : brut - U.num(t.frais, 0);
        var tx = tauxTransaction(t, taux);
        return tx === null ? null : net * tx;
    }

    /* Taux de conversion de la transaction vers l'euro, ou null si le cours du
       jour n'est pas disponible. Jamais de repli sur 1 : un montant en euros
       fabriqué avec un taux inventé entre dans une base imposable. */
    function tauxTransaction(t, taux) {
        if (t.devise === 'EUR') return 1;
        return PF.util.tauxValide(taux[t.devise + '|' + t.date]);
    }

    /* Liste des cours de change qui manquent pour les transactions données. */
    function tauxManquants(txs, taux) {
        var vus = {}, liste = [];
        txs.forEach(function (t) {
            if (tauxTransaction(t, taux) !== null) return;
            var cle = t.devise + '|' + String(t.date);
            if (!vus[cle]) { vus[cle] = 1; liste.push({ devise: t.devise, date: String(t.date) }); }
        });
        return liste;
    }

    function ajouterManquants(liste, ajout) {
        var vus = {};
        liste.forEach(function (m) { vus[m.devise + '|' + m.date] = 1; });
        ajout.forEach(function (m) {
            if (!vus[m.devise + '|' + m.date]) { vus[m.devise + '|' + m.date] = 1; liste.push(m); }
        });
        return liste;
    }

    function ecrituresTriees(ctx, annee) {
        return (ctx.transactions || []).slice().sort(function (a, b) {
            var da = String(a.date), db = String(b.date);
            if (da !== db) return da < db ? -1 : 1;
            return estAchat(a) ? -1 : 1;          // achats avant ventes, à date égale
        }).filter(function (t) { return Number(String(t.date).slice(0, 4)) <= annee; });
    }

    function vide2074(annee) {
        return { annee: annee, operations: [], par_actif: [], ligne_905: 0, ligne_913: 0,
            bilan_net: 0, mv_anterieures_reportables: 0, case_3vg: 0, case_3vh: 0, cadre_11: [] };
    }

    function vide2086(annee) {
        return { annee: annee, cessions: [], total_cessions_213: 0, total_cessions_218: 0,
            plus_value_globale_224: 0, exonere_305: false, case_3an: 0, case_3bn: 0 };
    }

    /* Formulaire 2074 : synthèse 905/913, cadre 5 ligne par ligne et cadre 11
       (imputation des moins-values, colonnes A à E). */
    function detail2074(txs, annee, taux) {
        var soldes = {}, operations = [], pvParAnnee = {}, manquants = [];

        txs.forEach(function (t) {
            if (CLASSES_2074.indexOf(PF.modele.classeDe(t.ticker)) < 0) return;
            var an = Number(String(t.date).slice(0, 4));
            var net = montantNetEur(t, taux);
            if (net === null) { manquants = ajouterManquants(manquants, [{ devise: t.devise, date: String(t.date) }]); return; }
            var qte = U.num(t.quantite, 0);
            if (!soldes[t.ticker]) soldes[t.ticker] = { qte: 0, cout: 0 };
            var etat = soldes[t.ticker];

            if (estAchat(t)) {
                etat.qte += qte;
                etat.cout += net;
                return;
            }
            if (etat.qte <= 1e-9) return;                  // vente sans lot : on ne invente pas de PRU

            var pru = etat.cout / etat.qte;
            var acq = pru * qte;
            var pv = net - acq;
            etat.qte = Math.max(0, etat.qte - qte);
            etat.cout = Math.max(0, etat.cout - acq);
            if (etat.qte <= 1e-6) { etat.qte = 0; etat.cout = 0; }

            pvParAnnee[an] = (pvParAnnee[an] || 0) + pv;
            if (an === annee) {
                operations.push({
                    actif: t.ticker, date: String(t.date), quantite: qte,
                    pru_unitaire_eur: pru, acq_globale_eur: acq,
                    cession_globale_eur: net, plus_value_eur: pv
                });
            }
        });

        /* Suivi des moins-values antérieures reportables dix ans
           (CGI art. 150-0 D, 11) : la plus ancienne s'impute la première. */
        var files = [];
        Object.keys(pvParAnnee).map(Number).sort(function (a, b) { return a - b; })
            .forEach(function (y) {
                if (y >= annee) return;
                files = files.filter(function (f) { return y - f[0] <= 10 && f[1] > 1e-6; });
                var solde = pvParAnnee[y];
                if (solde < 0) { files.push([y, Math.abs(solde)]); return; }
                var gain = solde;
                files.forEach(function (f) {
                    if (gain <= 0) return;
                    var conso = Math.min(gain, f[1]);
                    f[1] -= conso;
                    gain -= conso;
                });
                files = files.filter(function (f) { return f[1] > 1e-6; });
            });
        files = files.filter(function (f) { return annee - f[0] <= 10 && f[1] > 1e-6; });
        var mvAnterieures = U.arrondi(files.reduce(function (s, f) { return s + f[1]; }, 0), 2);

        // --- Cadre 5 : une ligne de 511 à 524 par titre, agrégée sur l'année
        var parActif = [], actifs = {};
        operations.forEach(function (op) { actifs[op.actif] = 1; });
        Object.keys(actifs).sort().forEach(function (actif) {
            var ops = operations.filter(function (o) { return o.actif === actif; });
            var qteTot = ops.reduce(function (s, o) { return s + o.quantite; }, 0);
            var cessionTot = ops.reduce(function (s, o) { return s + o.cession_globale_eur; }, 0);
            var acqTot = ops.reduce(function (s, o) { return s + o.acq_globale_eur; }, 0);
            var pvTot = ops.reduce(function (s, o) { return s + o.plus_value_eur; }, 0);
            parActif.push({
                actif: actif, nb_operations: ops.length,
                ligne_511: actif + ' (agrégé annuel) — Swissquote Bank Europe SA',
                ligne_512: '31/12/' + annee,
                ligne_514: qteTot > 0 ? cessionTot / qteTot : 0,
                ligne_515: qteTot, ligne_516: cessionTot, ligne_517: 0, ligne_518: cessionTot,
                ligne_520: qteTot > 0 ? acqTot / qteTot : 0,
                ligne_521: acqTot, ligne_522: 0, ligne_523: acqTot, ligne_524: pvTot
            });
        });

        var l905 = parActif.reduce(function (s, a) { return s + (a.ligne_524 > 0 ? a.ligne_524 : 0); }, 0);
        var l913 = Math.abs(parActif.reduce(function (s, a) { return s + (a.ligne_524 < 0 ? a.ligne_524 : 0); }, 0));
        var bilanNet = U.arrondi(l905 - l913, 2);
        // Une seule transaction sans cours et le bilan 2074 n'est plus juste :
        // on n'en présente aucun chiffre.
        if (manquants.length) return Object.assign(vide2074(annee), { indisponible: manquants });

        // --- Cadre 11 (bloc 1133) : colonnes A à E
        var cadre11 = [], mvRestante = l913, mvAntRestante = mvAnterieures;
        parActif.forEach(function (a) {
            if (a.ligne_524 <= 0) return;
            var gain = a.ligne_524;
            var imput = Math.min(gain, mvRestante);
            mvRestante = Math.max(0, mvRestante - imput);
            var colC = gain - imput;
            var imputAnt = Math.min(colC, mvAntRestante);
            mvAntRestante = Math.max(0, mvAntRestante - imputAnt);
            cadre11.push({
                actif: a.actif,
                col_a: U.arrondi(gain, 2), col_b: U.arrondi(imput, 2), col_c: U.arrondi(colC, 2),
                col_d: U.arrondi(imputAnt, 2), col_e: U.arrondi(colC - imputAnt, 2)
            });
        });

        return {
            annee: annee, operations: operations, par_actif: parActif,
            ligne_905: U.arrondi(l905, 2), ligne_913: U.arrondi(l913, 2), bilan_net: bilanNet,
            mv_anterieures_reportables: mvAnterieures,
            case_3vg: bilanNet > 0 ? U.arrondi(Math.max(0, bilanNet - mvAnterieures), 2) : 0,
            case_3vh: bilanNet < 0 ? U.arrondi(Math.abs(bilanNet), 2) : 0,
            cadre_11: cadre11
        };
    }

    /* Les cours historiques des autres crypto-actifs détenus le jour d'une
       cession : sans eux, la valeur globale du portefeuille — donc la fraction
       de capital déductible — serait fausse. */
    function besoinsPrixCrypto(txs, annee) {
        var qtes = {}, demandes = [];
        txs.forEach(function (t) {
            if (PF.modele.classeDe(t.ticker) !== 'crypto') return;
            var q = U.num(t.quantite, 0);
            if (estAchat(t)) { qtes[t.ticker] = (qtes[t.ticker] || 0) + q; return; }
            Object.keys(qtes).forEach(function (tk) {
                if ((qtes[tk] || 0) > 1e-8 && tk !== t.ticker) demandes.push({ ticker: tk, date: String(t.date) });
            });
            qtes[t.ticker] = Math.max(0, (qtes[t.ticker] || 0) - q);
        });
        if (!demandes.length) return Promise.resolve({});
        return Promise.all(demandes.map(function (d) {
            return PF.net.cours(d.ticker, d.date).then(function (c) { return [d.ticker + '|' + d.date, c]; });
        })).then(function (paires) {
            // Un cours absent reste absent : detail2086 le signale au lieu de
            // retirer la position de la valeur globale.
            var prix = {};
            paires.forEach(function (p) { prix[p[0]] = PF.util.estNombre(p[1]) && p[1] > 0 ? p[1] : null; });
            return prix;
        });
    }

    /* Formulaire 2086 — article 150 VH bis. La fraction de capital déduite
       (ligne 221) suit le rapport entre le prix de cession et la valeur
       globale du portefeuille d'actifs numériques au jour de la cession. */
    function detail2086(txs, annee, taux, prix) {
        var coutTotal = 0, fractions = 0, qtes = {}, cessions = [], manquants = [];

        txs.forEach(function (t) {
            if (PF.modele.classeDe(t.ticker) !== 'crypto') return;
            var net = montantNetEur(t, taux);
            var q = U.num(t.quantite, 0);
            var iso = String(t.date);

            if (net === null) { manquants = ajouterManquants(manquants, [{ devise: t.devise, date: iso }]); return; }
            if (estAchat(t)) { coutTotal += net; qtes[t.ticker] = (qtes[t.ticker] || 0) + q; return; }

            // 2086 : 213/217 (brut hors frais) sert au quotient de capital ;
            // 218 (net des frais) sert au premier terme de la plus-value et
            // à la ligne 51 du foyer. Ne jamais déduire les frais deux fois.
            var tx = tauxTransaction(t, taux);
            var brut = q * U.num(t.cours, 0) * tx;
            var frais = U.num(t.frais, 0) * tx;
            var prixUnitaire = q > 0 ? brut / q : 0;
            var valeurGlobale = 0;
            Object.keys(qtes).forEach(function (tk) {
                var qte = qtes[tk] || 0;
                if (qte <= 1e-8) return;
                if (tk === t.ticker && prixUnitaire > 0) valeurGlobale += qte * prixUnitaire;
                else {
                    var c = prix[tk + '|' + iso];
                    var tUsd = PF.util.tauxValide(taux['USD|' + iso]);
                    if (!PF.util.estNombre(c) || !(c > 0)) {
                        manquants = ajouterManquants(manquants, [{ devise: 'cours ' + tk, date: iso }]);
                    } else if (tUsd === null) {
                        manquants = ajouterManquants(manquants, [{ devise: 'USD', date: iso }]);
                    } else {
                        valeurGlobale += qte * c * tUsd;
                    }
                }
            });
            if (valeurGlobale < brut) valeurGlobale = brut;   // garde-fou de la v2

            var l220 = coutTotal, l221 = fractions, l223 = Math.max(0, l220 - l221);
            var fraction = valeurGlobale > 0 ? l223 * (brut / valeurGlobale) : 0;
            var l224 = net - fraction;
            fractions += fraction;
            qtes[t.ticker] = Math.max(0, (qtes[t.ticker] || 0) - q);

            if (Number(iso.slice(0, 4)) === annee) {
                cessions.push({
                    actif: t.ticker, date: iso, quantite: q,
                    ligne_212: U.arrondi(valeurGlobale, 2),
                    ligne_213: U.arrondi(brut, 2), ligne_214: U.arrondi(frais, 2),
                    ligne_217: U.arrondi(brut, 2), ligne_218: U.arrondi(net, 2),
                    ligne_220: U.arrondi(l220, 2), ligne_221: U.arrondi(l221, 2),
                    ligne_223: U.arrondi(l223, 2),
                    fraction_capital: U.arrondi(fraction, 2), ligne_224: U.arrondi(l224, 2)
                });
            }
        });

        if (manquants.length) return Object.assign(vide2086(annee), { indisponible: manquants });

        var total213 = U.arrondi(cessions.reduce(function (s, c) { return s + c.ligne_213; }, 0), 2);
        var total218 = U.arrondi(cessions.reduce(function (s, c) { return s + c.ligne_218; }, 0), 2);
        var total224 = U.arrondi(cessions.reduce(function (s, c) { return s + c.ligne_224; }, 0), 2);
        var exonere = cessions.length > 0 && total218 <= franchiseCrypto(annee);
        var case3an = 0, case3bn = 0;
        if (!exonere && cessions.length) {
            if (total224 > 0) case3an = total224; else case3bn = Math.abs(total224);
        }
        return {
            annee: annee, cessions: cessions, total_cessions_213: total213,
            total_cessions_218: total218, plus_value_globale_224: total224, exonere_305: exonere,
            case_3an: U.arrondi(case3an, 2), case_3bn: U.arrondi(case3bn, 2), indisponible: []
        };
    }

    function bilanCessions(ctx, annee) {
        var txs = ecrituresTriees(ctx, annee);
        if (!txs.length) return Promise.resolve({ t2074: vide2074(annee), t2086: vide2086(annee),
            indisponible: [], ventes_excedentaires: [] });

        var besoin = {};
        txs.forEach(function (t) {
            if (t.devise !== 'EUR') besoin[t.devise + '|' + t.date] = 1;
            if (PF.modele.classeDe(t.ticker) === 'crypto') besoin['USD|' + t.date] = 1;
        });

        return Promise.all(Object.keys(besoin).map(function (cle) {
            var p = cle.split('|');
            return PF.net.taux(p[0], p[1], 'EUR').then(function (v) { return [cle, v]; });
        })).then(function (paires) {
            var taux = {};
            paires.forEach(function (p) { taux[p[0]] = PF.util.tauxValide(p[1]); });

            /* 2.1.0 (revue D-06) : une vente supérieure à la position détenue est
               rejetée de la déclaration, comme du formulaire. Chaque vente est jugée
               contre les écritures retenues avant elle (ordre de lecture) : une vente
               excédentaire fabriquerait un PRU faux au 2074 et une cession fictive au
               2086. Elle est écartée ET annoncée, jamais calculée en silence. */
            var ventesExcedentaires = [];
            var retenues = [];
            txs.forEach(function (t) {
                var exces = PF.portefeuille.erreurVenteExcedentaire(retenues, t, {});
                if (exces) { ventesExcedentaires.push(exces); return; }
                retenues.push(t);
            });

            var t2074 = detail2074(retenues, annee, taux);
            return besoinsPrixCrypto(retenues, annee).then(function (prix) {
                var t2086 = detail2086(retenues, annee, taux, prix);
                // Le bilan entier attend le cours : un 2074 juste et un 2086 faux
                // ne se présentent pas ensemble comme une déclaration complète.
                var indisponible = ajouterManquants(
                    ajouterManquants([], t2074.indisponible || []), t2086.indisponible || []);
                return { t2074: t2074, t2086: t2086, indisponible: indisponible,
                    ventes_excedentaires: ventesExcedentaires };
            });
        });
    }

    /* Simulation complète du foyer. Portage de tax.simuler_foyer_complet :
       mêmes agrégats et arrondis. Les taux de PAS affichés sont des estimations
       simplifiées sur salaires, pas les taux individualisés transmis par la DGFiP
       (CGI art. 204 M : revenus communs, crédits et arrondis non reconstruits). */
    function simulerFoyer(o) {
        var annee = o.annee;
        var couple = estCouple(o.statut);
        var sal1 = Math.max(0, U.num(o.salaire1, 0));
        var sal2 = couple ? Math.max(0, U.num(o.salaire2, 0)) : 0;

        var abatt1 = abattement10(sal1, annee);
        var km1 = fraisKilometriques(o.km1, o.cv1, o.elec1, annee);
        var rep1 = fraisRepas(o.joursRepas1, annee);
        var frais1 = o.fraisReels1 ? U.arrondi(km1.montant + rep1.montant, 2) : 0;
        var retenir1 = !!(o.fraisReels1 && frais1 > abatt1);
        var ded1 = retenir1 ? euro2025(frais1, annee) : abatt1;

        var abatt2 = couple ? abattement10(sal2, annee) : 0;
        var km2 = couple ? fraisKilometriques(o.km2, o.cv2, o.elec2, annee) : { montant: 0, formule: '' };
        var rep2 = couple ? fraisRepas(o.joursRepas2, annee) : { montant: 0, formule: '' };
        var frais2 = (couple && o.fraisReels2) ? U.arrondi(km2.montant + rep2.montant, 2) : 0;
        var retenir2 = !!(couple && o.fraisReels2 && frais2 > abatt2);
        var ded2 = retenir2 ? euro2025(frais2, annee) : abatt2;

        var revNet1 = Math.max(0, sal1 - ded1), revNet2 = Math.max(0, sal2 - ded2);
        var revNetSalaires = revNet1 + revNet2;
        var irSalaires = impotRevenu(revNetSalaires, o.parts, annee, o.statut);

        var pvActionsPos = Math.max(0, U.num(o.bilanPvActions, 0));
        var interetsPos = Math.max(0, U.num(o.interetsEtrangers, 0));
        var assiette2op = pvActionsPos + interetsPos;
        var arbitrage = assiette2op > 0
            ? comparerPfuBareme(pvActionsPos, revNetSalaires, o.parts, annee, o.statut,
                interetsPos, o.interetsPrecomptes)
            : null;

        var pvCryptoPos = Math.max(0, U.num(o.pvCryptoImposable, 0));
        var impotCrypto = pvCryptoPos * (tauxIrForfaitaire(annee) +
            (paramsActifs(annee) ? paramsActifs(annee).prelevements_sociaux_par_categorie.plus_values_crypto_privees
                : PS_PAR_ANNEE[annee])); // PFU de référence, pas retenu si 3CN
        var options = comparerOptionsFoyer(revNetSalaires, o.parts, annee, o.statut,
            pvActionsPos, interetsPos, o.interetsPrecomptes, pvCryptoPos);
        var impotCapital = options.retenu.cout_capital;
        var impotTotal = options.retenu.impot_total_foyer;
        var tauxMoyenSalaires = (sal1 + sal2) > 0 ? irSalaires.impot_net / (sal1 + sal2) : 0;

        var tauxPas1 = tauxMoyenSalaires, tauxPas2 = 0;
        if (couple && sal1 > 0 && sal2 > 0) {
            var demi = Math.max(1, U.num(o.parts, 1) / 2);
            var impot1, impot2;
            if (revNet1 <= revNet2) {
                var irA = impotRevenu(revNet1, demi, annee, 'Célibataire');
                impot1 = Math.min(irSalaires.impot_net, irA.impot_net);
                impot2 = Math.max(0, irSalaires.impot_net - impot1);
            } else {
                var irB = impotRevenu(revNet2, demi, annee, 'Célibataire');
                impot2 = Math.min(irSalaires.impot_net, irB.impot_net);
                impot1 = Math.max(0, irSalaires.impot_net - impot2);
            }
            tauxPas1 = impot1 / sal1;
            tauxPas2 = impot2 / sal2;
        }

        return {
            annee: annee, couple: couple, parts: o.parts,
            salaire_1: sal1, salaire_2: sal2,
            abattement_10_1: abatt1, abattement_10_2: abatt2,
            frais_km_1: km1.montant, frais_km_formule_1: km1.formule,
            frais_repas_1: rep1.montant, frais_repas_formule_1: rep1.formule,
            frais_reels_1: frais1, retenir_frais_reels_1: retenir1,
            frais_km_2: km2.montant, frais_km_formule_2: km2.formule,
            frais_repas_2: rep2.montant, frais_repas_formule_2: rep2.formule,
            frais_reels_2: frais2, retenir_frais_reels_2: retenir2,
            case_1aj: Math.round(sal1), case_1ak: retenir1 ? Math.round(frais1) : null,
            case_1bj: (couple && sal2 > 0) ? Math.round(sal2) : null,
            case_1bk: retenir2 ? Math.round(frais2) : null,
            note_1ak: o.fraisReels1
                ? 'Déclarant 1 (' + annee + ') — ' + km1.formule + ' ; ' + rep1.formule
                  + ' ; Total frais réels (case 1AK) = ' + U.nombre(Math.round(frais1), 0) + ' €'
                : '',
            note_1bk: (couple && o.fraisReels2)
                ? 'Déclarant 2 (' + annee + ') — ' + km2.formule + ' ; ' + rep2.formule
                  + ' ; Total frais réels (case 1BK) = ' + U.nombre(Math.round(frais2), 0) + ' €'
                : '',
            interets_etrangers: interetsPos, pays: o.pays || '—',
            case_2tr: interetsPos > 0 ? Math.round(interetsPos) : null,
            revenu_net_imposable_salaires: U.arrondi(revNetSalaires, 2),
            ir_salaires: irSalaires, arbitrage: arbitrage, options_fiscales: options,
            cocher_2op: options.retenu.cocher_2op, cocher_3cn: options.retenu.cocher_3cn,
            impot_crypto: impotCrypto, impot_capital_retenu: impotCapital,
            impot_total_foyer: impotTotal, taux_moyen_salaires: tauxMoyenSalaires,
            taux_pas_foyer: tauxMoyenSalaires, taux_pas_1: tauxPas1, taux_pas_2: tauxPas2
        };
    }

    // -------------------------------------------------------------------- vue

    /* Les paramètres fiscaux sont mémorisés dans la table `Config` (clés f_*)
       par la v1 et la v2 : on les charge, sinon l'écran fiscalité affiche des
       zéros que le porteur doit ressaisir à la main. */
    var CORRESPONDANCE = {
        f_statut: 'statutFiscal', f_parts: 'partsFiscales', f_enf: 'nbEnfants',
        f_s1: 'salaireNetImposable1', f_s2: 'salaireNetImposable2',
        f_int_net: 'interetsEtrangers', f_pays_etr: 'paysEtranger',
        f_u1: 'utiliserFraisReels1', f_k1: 'fraisKm1', f_cv1: 'cvFiscal1',
        f_r1: 'joursRepas1', f_elec1: 'vehiculeElectrique1',
        f_u2: 'utiliserFraisReels2', f_k2: 'fraisKm2', f_cv2: 'cvFiscal2',
        f_r2: 'joursRepas2', f_elec2: 'vehiculeElectrique2'
    };

    var configAppliquee = false;

    function appliquerConfig(ctx) {
        var cfg = (ctx && ctx.config) || {};
        var cles = Object.keys(cfg);
        if (!cles.length) return false;
        var patch = {};
        cles.forEach(function (k) {
            var cible = CORRESPONDANCE[k];
            if (!cible) return;
            var v = cfg[k];
            if (v === null || v === undefined || String(v).trim() === '') return;
            patch[cible] = (typeof v === 'string' && /^-?\d+(?:[.,]\d+)?$/.test(v.trim()) && cible !== 'paysEtranger')
                ? U.num(v, 0) : String(v);
        });
        if (Object.keys(patch).length) PF.store.sauverReglages(patch);
        configAppliquee = true;
        return true;
    }

    // Photographie du code seulement : utile pour détecter une divergence avec
    // le candidat Python, pas un certificat juridique ni une source Supabase.
    function snapshotConstantesCode(annee) {
        if (annee !== 2025) throw new Error('Photographie locale limitée aux revenus 2025.');
        var b = BAREMES[annee];
        if (!BAREME_KM_PAR_ANNEE[annee] || PLANCHER_ABATTEMENT_10[annee] === undefined ||
            PLAFOND_ABATTEMENT_10[annee] === undefined || FORFAIT_REPAS[annee] === undefined)
            throw new Error('Paramètres fiscaux incomplets pour ' + annee + '.');
        var km = {};
        Object.keys(BAREME_KM_PAR_ANNEE[annee]).forEach(function (cv) {
            km[cv] = BAREME_KM_PAR_ANNEE[annee][cv].slice();
        });
        return {
            bareme: {
                annee: annee, tranches: b.tranches.slice(), taux: b.taux.slice(),
                decote_base_celibataire: b.dc, decote_plafond_celibataire: b.dcPlafond,
                decote_base_couple: b.dcCouple, decote_plafond_couple: b.dcPlafondCouple,
                decote_taux: TAUX_DECOTE
            },
            prelevements_sociaux: PS_PAR_ANNEE[annee],
            prelevements_sociaux_par_categorie: {
                plus_values_titres: PS_PAR_ANNEE[annee], plus_values_crypto_privees: PS_PAR_ANNEE[annee],
                rcm_precomptes_en_2025: PS_PRECOMPTES_PAR_ANNEE[annee],
                rcm_non_precomptes: PS_PAR_ANNEE[annee]
            },
            quotient_familial: {
                plafond_general_par_demi_part: PLAFOND_QF_GENERAL[annee],
                plafonds_particuliers_modelises: false
            },
            ir_forfaitaire: IR_FORFAITAIRE,
            seuil_non_recouvrement_ir: SEUIL_NON_RECOUVREMENT_IR,
            csg_deductible: CSG_DEDUCTIBLE,
            calendrier_csg: {
                deduction_selon_annee_paiement: true,
                rcm_precomptes_deduction_possible_en_2025_si_bareme: true,
                csg_payee_ulterieurement_non_deduite_du_revenu_2025: true
            },
            options_fiscales: {
                deux_op_globale_titres_et_rcm: true,
                trois_cn_crypto_independante: true,
                trois_cn_disponible_pour_cessions_depuis: 2023
            },
            abattement_10: {
                taux: TAUX_ABATTEMENT_SALAIRES, plancher: PLANCHER_ABATTEMENT_10[annee],
                plafond: PLAFOND_ABATTEMENT_10[annee]
            },
            forfait_repas: FORFAIT_REPAS[annee],
            bareme_km: km,
            regles_km: { seuils_distance_km: SEUILS_KM_VOITURE.slice(),
                majoration_electrique: MAJORATION_VOITURE_ELECTRIQUE },
            franchise_crypto: CRYPTO_FRANCHISE_CESSIONS
        };
    }

    var anneeFiscale = null;

    function anneeEnCours() {
        if (anneeFiscale) return anneeFiscale;
        var auj = new Date().getFullYear() - 1;   // on déclare l'année précédente
        return auj;  // année demandée, même absente : jamais la dernière à sa place
    }

    function texteRapport(annee) {
        var r = rapportsControle[annee];
        return r && typeof r === 'object' ? bilanMiseAJour(Number(annee), r) : (r || '');
    }
    // Un compte rendu utile sur téléphone doit tenir en quelques lignes.
    // L'audit intégral reste accessible, mais n'est plus affiché d'emblée.
    function resumeRapport(annee, r) {
        if (!r || typeof r !== 'object') return String(r || '');
        var boi = r.boi && r.boi.valeurs || {}, frais = r.frais && r.frais.valeurs || {};
        var crypto = r.cryptoPdf || {}, rcm = r.rcmPdf || {};
        function lu(v) { return v && v.valeurs ? 'lu' : 'non disponible'; }
        var ir = ['ir', 'decote', 'qf'].filter(function (k) { return !!boi[k]; }).length;
        var salaries = ['abatt', 'repas', 'km'].filter(function (k) {
            return k === 'repas' ? typeof frais[k] === 'number' : !!frais[k];
        }).length;
        return 'Revenus ' + annee + ' (déclaration ' + (annee + 1) + ') — '
            + (revisionActive(annee) ? 'R2 publiée prioritaire' : 'simulation indicative seulement')
            + '. DGFiP : IR/décote/QF ' + ir + '/3, frais salariés ' + salaries + '/3, PS titres '
            + lu(r.titres) + '. PDF : nouveautés CSG ' + lu(r.brochure)
            + ', notice 2086 ' + lu(crypto.notice) + ', brochure crypto ' + lu(crypto.brochure)
            + ', RCM ' + lu(rcm.rcm) + ', charges/CSG ' + lu(rcm.charges)
            + '. RCM personnels, PS crypto 2025 et déduction CSG du foyer non vérifiés ; '
            + 'aucun nouveau taux activé. Bascule DGFiP totale : non.';
    }
    function htmlRapport(annee) {
        if (!rapportsControle[annee]) return '';
        return '<div style="margin-top:8px;overflow-wrap:anywhere">' + UI.h(resumeRapport(Number(annee), rapportsControle[annee]))
            + '</div><button class="btn ghost" data-fisc="copier-resume" data-annee="' + Number(annee)
            + '" style="margin-top:8px">Copier le résumé</button>'
            + '<details style="margin-top:8px"><summary>Sources, valeurs et limites détaillées</summary>'
            + '<div class="st" style="margin-top:8px;overflow-wrap:anywhere">' + UI.h(texteRapport(annee))
            + '</div></details>';
    }
    function vue(ctx) {
        var prefait = ctx && ctx.config ? appliquerConfig(ctx) : false;
        var r = PF.store.reglages();
        var annee = anneeEnCours();
        var out = '';
        var maj = verifierMaj(annee);

        out += '<div class="chips">' + annees().map(function (a) {
            return '<button class="chip' + (a === annee ? ' actif' : '') + '" data-fisc="annee" data-valeur="' + a + '">Revenus ' + a + '</button>';
        }).join('') + '</div>';
        if (!BAREMES[annee] || (annee >= 2026 && (!officiels[annee] ||
            !officiels[annee].ir || !officiels[annee].decote || !officiels[annee].qf ||
            !fraisOfficiels[annee] || !fraisOfficiels[annee].repas || !fraisOfficiels[annee].km ||
            !fraisOfficiels[annee].abatt))) {
            return out + '<div class="info"><b>Revenus ' + UI.h(annee)
                + ' : calcul fiscal indisponible.</b> IR, décote, plafond QF ou frais salariés officiels de ce millésime non réunis. '
                + 'Le barème isolé d’une source externe ne suffit pas à produire un bilan ; '
                + 'les chiffres d’une autre année ne sont pas réutilisés. Déclaration ' + UI.h(annee + 1) + ' ≠ revenus ' + UI.h(annee) + '.'
                + '<div style="margin-top:8px"><button class="btn sec" data-fisc="collecter">'
                + '⟳ Mettre à jour les données fiscales disponibles</button></div>'
                + '<div style="margin-top:8px"><button class="btn ghost" data-fisc="collecter-tout">Vérifier les revenus 2023 à 2026 (DGFiP)</button></div>'
                + '<div id="etatCollecteFiscale" class="st" style="margin-top:6px;overflow-wrap:anywhere">'
                + htmlRapport(annee) + htmlMatrice()
                + '</div>' + Object.keys(rapportsControle).filter(function (an) { return Number(an) !== annee; })
                    .sort().map(function (an) { return '<div class="st" style="margin-top:10px;overflow-wrap:anywhere">'
                        + htmlRapport(an) + '</div>'; }).join('') + '</div>';
        }

        // Le cache d'accueil ne contient aucune transaction : tant que la
        // table n'est pas relue avec succès, ne pas simuler un portefeuille
        // vide ni présenter une R2 comme refusée. La collecte publique reste
        // accessible indépendamment de cette synchronisation personnelle.
        if (ctx && (!Array.isArray(ctx.transactions) || ctx.transactionsChargees === false)) {
            return out + '<div class="info"><b>Portefeuille non chargé : simulation personnelle suspendue.</b> '
                + 'La R2 sera évaluée après synchronisation des transactions ; réessayez ⟳ si le chargement a échoué. '
                + 'Les documents publics DGFiP peuvent être consultés séparément.</div>'
                + '<button class="btn sec" data-fisc="collecter">Vérifier cette année (DGFiP)</button>'
                + '<button class="btn ghost" data-fisc="collecter-tout">Vérifier 2023 à 2026</button>'
                + '<div id="etatCollecteFiscale" class="st" style="margin-top:6px;overflow-wrap:anywhere">'
                + htmlRapport(annee) + '</div>';
        }

        // --- Bandeau de mise à jour
        if (revisionActive(annee)) {
            out += '<div class="ok-vert">Révision publiée des paramètres ' + UI.h(annee)
                + ' appliquée automatiquement depuis votre compte Supabase. Les montants personnels, le PAS officiel et les cas particuliers restent des estimations ou hors périmètre.</div>';
        } else {
            var valeurDGFiP = officiels[annee] || {};
            var utilises = [];
            if (valeurDGFiP.ir) utilises.push('barème IR');
            if (valeurDGFiP.decote) utilises.push('décote');
            if (valeurDGFiP.qf) utilises.push('plafond QF général');
            if (fraisOfficiels[annee] && fraisOfficiels[annee].abatt) utilises.push('abattement salariés');
            if (fraisOfficiels[annee] && fraisOfficiels[annee].repas) utilises.push('repas salariés');
            if (fraisOfficiels[annee] && fraisOfficiels[annee].km) utilises.push('kilomètres automobiles');
            out += '<div class="info">Simulation indicative ' + UI.h(annee) + ' : '
                + (utilises.length ? 'DGFiP : ' + UI.h(utilises.join(', ')) + '. ' : 'aucune valeur DGFiP relue. ')
                + 'Autres paramètres embarqués non vérifiés, aucune révision complète. '
                + 'Les anciennes collectes OpenFisca sont conservées en historique, jamais appliquées.</div>';
        }
        if (maj.disponible) {
            out += '<div class="info"><b>Vérification fiscale requise.</b> ' + UI.h(maj.message)
                + '<div style="margin-top:8px"><button class="btn sec" data-fisc="ouvrir-lien">Ouvrir l’assistant de mise à jour</button></div>'
                + '<div style="margin-top:8px"><button class="btn ghost" data-fisc="prompt">Voir le prompt à envoyer à l’IA</button></div></div>';
        } else {
            out += '<div class="ok-vert">' + UI.h(maj.message) + '</div>';
        }
        // Collectes sourcées partielles ; une révision complète garde priorité.
        out += '<div class="card tight" style="margin:10px 0">'
            + '<b>Mise à jour fiscale — revenus ' + UI.h(annee) + '</b>'
            + '<div class="st" style="margin:6px 0">Sources DGFiP uniquement. Collecte partielle : les paramètres non vérifiés restent signalés, les révisions précédentes conservées. Résumé ci-dessous ; détails disponibles au besoin.</div>'
            + '<button class="btn sec" data-fisc="collecter">⟳ Vérifier cette année (DGFiP)</button>'
            + '<button class="btn ghost" data-fisc="collecter-tout">Vérifier 2023 à 2026</button>'
            + '<div id="etatCollecteFiscale" class="st" style="margin-top:6px;overflow-wrap:anywhere">'
            + htmlRapport(annee)
            + '</div>' + htmlMatrice() + '</div>';
        var autresRapports = Object.keys(rapportsControle).filter(function (an) { return Number(an) !== annee; });
        if (autresRapports.length) out += '<div class="card tight"><b>Autres années vérifiées (revenus, pas déclaration)</b>'
            + autresRapports.sort().map(function (an) { return '<div class="st" style="margin:8px 0;overflow-wrap:anywhere">'
                + htmlRapport(an) + '</div>'; }).join('') + '</div>';
        if (annee === 2026 && !revisionActive(annee)) {
            out += '<div class="info">Revenus 2026 : décote et autres hypothèses provisoires, à revérifier pour la déclaration 2027.</div>';
        }
        var qfGarde = PF.fiscalGardesFoyer ? PF.fiscalGardesFoyer.casParticuliersQF({
            parts: U.num(r.partsFiscales, 0), statut: r.statutFiscal, enfants: enfants }) : null;
        out += '<div class="info">Quotient familial : plafond général seulement. Si vous êtes parent isolé ou bénéficiez d’une demi-part particulière, ne vous fiez pas au bilan ni à la recommandation 2OP.'
            + (qfGarde && (qfGarde.blocages.length || qfGarde.avertissements.length)
                ? '<div class="st" style="margin-top:6px">'
                    + UI.h(qfGarde.blocages.concat(qfGarde.avertissements).join(' ')) + '</div>' : '')
            + '</div>';

        // --- 1. Paramètres fiscaux
        var couple = estCouple(r.statutFiscal);
        out += '<div class="info">Titres et cessions : ce portefeuille appartient uniquement à son propriétaire. '
            + (couple ? 'Le mariage ne rend pas le conjoint codétenteur ; l’IR utilise cependant les revenus saisis pour les deux déclarants. ' : '')
            + 'Les options 2OP/3CN et le seuil de cessions crypto concernent tout le foyer : vérifier tout autre revenu ou cession éventuel hors de ce portefeuille, sans en présumer l’existence.</div>';
        var f1 = fraisReelsDeclarant(r, 1, annee);
        var f2 = couple ? fraisReelsDeclarant(r, 2, annee) : null;

        out += '<div class="titre">1. Vos paramètres fiscaux <span class="n">cliquez pour modifier</span></div>';

        var enfants = Math.max(0, Math.round((r.partsFiscales - (couple ? 2 : 1)) * 2));
        out += UI.accordeon('Situation familiale',
            ligneReglage('Statut', r.statutFiscal, 'statutFiscal')
            + ligneReglage('Parts fiscales', U.nombre(r.partsFiscales, 1), 'partsFiscales')
            + '<div style="font-size:12px;color:var(--txt-3);margin-top:4px">' + (couple ? 'Foyer de 2 parts' : 'Foyer d’1 part')
            + (enfants > 0 ? ' + ' + enfants + ' demi-part(s) au titre des enfants' : '') + '.</div>',
            false);

        var corpsBase = ''
            + (prefait ? '<div class="ok-vert" style="margin-bottom:10px">Paramètres chargés depuis votre base '
                + 'Supabase (table <b>Config</b>) : statut, salaires, kilomètres, CV, repas, intérêts étrangers.</div>'
                : '<div class="info" style="margin-bottom:10px">Aucun paramètre mémorisé dans la table '
                + '<b>Config</b> : saisissez vos valeurs, elles seront enregistrées et partagées avec '
                + 'l’application Streamlit.</div>')
            + ligneReglage('Salaire net imposable — déclarant 1 (case 1AJ)', U.eur(r.salaireNetImposable1, { dec: 0 }), 'salaireNetImposable1')
            + (couple ? ligneReglage('Salaire net imposable — déclarant 2 (case 1BJ)', U.eur(r.salaireNetImposable2, { dec: 0 }), 'salaireNetImposable2') : '')
            + blocFraisReels(1, f1, annee, r)
            + (f2 ? blocFraisReels(2, f2, annee, r) : '')
            + '<div class="sep"></div>'
            + ligneReglage('Revenus d’intérêts encaissés à l’étranger (€)', U.eur(r.interetsEtrangers, { dec: 0 }), 'interetsEtrangers')
            + ligneReglage('Pays d’origine de ces intérêts', String(r.paysEtranger || '—'), 'paysEtranger')
            + (U.num(r.interetsEtrangers, 0) > 0
                ? '<div class="info">PS des intérêts ' + annee + ' : déjà précomptés lors du versement ? '
                    + '<button class="chip' + (r['interetsPs' + annee] === 'oui' ? ' actif' : '') + '" data-fisc="ps-interets" data-valeur="oui">Oui</button> '
                    + '<button class="chip' + (r['interetsPs' + annee] === 'non' ? ' actif' : '') + '" data-fisc="ps-interets" data-valeur="non">Non</button> '
                    + (['oui', 'non'].indexOf(r['interetsPs' + annee]) < 0
                        ? '<b>À préciser : bilan et recommandation indisponibles.</b>' : '')
                    + ' Vérifiez votre justificatif : le pays du courtier ne permet pas de répondre.</div>' : '')
            + '<div style="font-size:12px;color:var(--txt-3);margin:6px 0 10px">Formulaire <b>2047</b> '
            + 'ligne 250, puis report en <b>2TR</b> sur la 2042 — en cochant « revenus encaissés à l’étranger ».</div>'
            + '<div class="ligne" style="padding-top:4px"><div class="gr"><div class="tt">Comptes détenus hors de France</div>'
            + '<div class="st">Formulaire 3916-3916 bis + case 8UU</div></div>'
            + '<div class="dr">' + UI.badge('à déclarer', 'warn') + '</div></div>'
            + '<div class="card tight" style="margin-top:6px">'
            + COMPTES_ETRANGER.map(function (c) {
                return '<div style="display:flex;gap:8px;padding:5px 0;font-size:12.5px;color:var(--txt-2)">'
                    + '<span style="color:var(--gold)">•</span><span>' + UI.h(c) + '</span></div>';
            }).join('')
            + '</div>'
            + '<div style="font-size:12px;color:var(--txt-3)">Un compte ouvert chez un intermédiaire étranger '
            + 'doit être déclaré même sans opération : amende de 1 500 € par compte et par an. Le compte '
            + 'courant Revolut n’est pas listé : selon votre contrat il est adossé à une entité française, '
            + 'irlandaise ou lituanienne — la réponse vous appartient, l’application ne la devine pas.</div>';

        out += UI.accordeon('Déclaration de base', corpsBase, false, resumeBase(f1, f2, r));

        // --- 2. Formulaires (remplis après lecture des écritures de l'année)
        out += '<div class="titre">2. Vos formulaires de déclaration ' + (annee + 1)
            + ' <span class="n">revenus ' + annee + '</span></div>';
        out += '<div id="fiscFormulaires"><div class="card"><div class="vide" style="padding:14px">'
            + 'Lecture de vos écritures ' + annee + ' en cours…</div></div></div>';

        // --- 3. Arbitrage, bilan et prélèvement à la source
        out += '<div class="titre">3. Impôt du foyer, arbitrage PFU / barème et taux à la source</div>';
        out += '<div id="fiscBilan"><div class="card"><div class="vide" style="padding:14px">Calcul en cours…</div></div></div>';

        bilanCessions(ctx, annee).then(function (b) {
            if (b.indisponible.length) {
                var f0 = document.getElementById('fiscFormulaires');
                if (f0) f0.innerHTML = formulairesIndisponibles(annee, b.indisponible);
                var g0 = document.getElementById('fiscBilan');
                if (g0) g0.innerHTML = bilanIndisponible(annee, b.indisponible);
                return;
            }
            var sim = simulerFoyer({
                annee: annee, statut: r.statutFiscal, parts: r.partsFiscales,
                salaire1: r.salaireNetImposable1, salaire2: r.salaireNetImposable2,
                fraisReels1: U.estVrai(r.utiliserFraisReels1), km1: r.fraisKm1, cv1: r.cvFiscal1,
                joursRepas1: r.joursRepas1, elec1: U.estVrai(r.vehiculeElectrique1),
                fraisReels2: U.estVrai(r.utiliserFraisReels2), km2: r.fraisKm2, cv2: r.cvFiscal2,
                joursRepas2: r.joursRepas2, elec2: U.estVrai(r.vehiculeElectrique2),
                interetsEtrangers: r.interetsEtrangers, pays: r.paysEtranger,
                interetsPrecomptes: r['interetsPs' + annee] === 'oui' ? true
                    : r['interetsPs' + annee] === 'non' ? false : null,
                bilanPvActions: b.t2074.bilan_net, pvCryptoImposable: b.t2086.case_3an
            });
            var f = document.getElementById('fiscFormulaires');
            if (f) {
                var banniere = '';
                if (b.ventes_excedentaires && b.ventes_excedentaires.length) {
                    banniere = '<div class="erreur" style="margin:0 0 10px">'
                        + 'Vente(s) supérieure(s) à la position détenue : écartée(s) de la déclaration, '
                        + 'aucun chiffre n’a été calculé dessus.<br>– '
                        + b.ventes_excedentaires.map(UI.h).join('<br>– ') + '</div>';
                }
                f.innerHTML = banniere + formulaires(annee, sim, b.t2074, b.t2086, r);
                UI.lierAccordeons(f);
            }
            var g = document.getElementById('fiscBilan');
            if (g) { g.innerHTML = bilanImpot(annee, sim, b.t2074, b.t2086); UI.lierAccordeons(g); }
        }).catch(function (err) {
            /* Sans les cours de change du jour, les montants ne peuvent pas être
               reconstitués : un formulaire à moitié rempli est pire qu'un
               formulaire vide, on le dit au lieu de deviner. */
            var erreur = String(err && err.message || err);
            var psInconnus = erreur.indexOf('précomptés') >= 0;
            var msg = '<div class="erreur">' + (psInconnus ? 'Bilan fiscal indisponible : ' : 'Formulaires non préremplis : ')
                + UI.h(erreur)
                + (psInconnus ? ' Choisissez Oui ou Non ci-dessus après vérification.'
                    : ' Recopiez vos écritures depuis l’onglet Portefeuille › Opérations.') + '</div>';
            var f2b = document.getElementById('fiscFormulaires');
            if (f2b) f2b.innerHTML = msg;
            var g2 = document.getElementById('fiscBilan');
            if (g2) g2.innerHTML = '<div class="card"><div class="vide" style="padding:14px">'
                + (psInconnus ? 'Bilan indisponible tant que le prélèvement des PS des intérêts n’est pas précisé.'
                    : 'Bilan indisponible sans la lecture des écritures.') + '</div></div>';
        });

        return out;
    }

    /* Un taux ou un cours manquant : aucun montant n'est calculé à sa place.
       La liste dit quel cours manque, et les chiffres restent à « — ». */
    function libelleManquant(m) {
        var quand = U.jourMoisAnneeISO(m.date);
        return /^cours /.test(m.devise)
            ? m.devise + ' au ' + quand
            : 'taux ' + m.devise + '/EUR au ' + quand;
    }

    function avisIndisponible(liste) {
        return '<div class=\"erreur\">Montant non calculé, taux indisponible au '
            + liste.map(function (m) { return UI.h(libelleManquant(m)); }).join(' ; ')
            + '. Réessayez plus tard, quand le cours est disponible : rien n’a été estimé à la place.</div>';
    }

    function formulairesIndisponibles(annee, liste) {
        return '<div class=\"card\"><div class=\"lbl\">Formulaires 2074 et 2086 ' + annee + '</div>'
            + avisIndisponible(liste)
            + ligneResultat('Plus-values de cession (2074, case 3VG / 3VH)', '—')
            + ligneResultat('Plus-values de cryptos-actifs (2086, case 3AN / 3BN)', '—')
            + '</div>';
    }

    function bilanIndisponible(annee, liste) {
        return '<div class=\"card\"><div class=\"lbl\">Flat tax (PFU) ou barème progressif ?</div>'
            + avisIndisponible(liste)
            + ligneResultat('Flat tax : total', '—')
            + ligneResultat('Barème : total', '—')
            + '</div>'
            + '<div class=\"card\"><div class=\"lbl\">Bilan de votre impôt sur le revenu ' + annee + '</div>'
            + ligneResultat('Impôt total du foyer', '—', true)
            + '<div style=\"font-size:11.5px;color:var(--txt-3);margin-top:6px\">Le bilan est calculé d’un seul tenant : '
            + 'tant que ce cours manque, aucun de ses montants n’est affiché.</div>'
            + '</div>';
    }

    /* Comptes à l'étranger connus du portefeuille : écrits dans les descriptions
       des poches à la création du portefeuille, jamais supposés. */
    var COMPTES_ETRANGER = [
        'Compte-titres Swissquote — Swissquote Bank Europe SA, Luxembourg',
        'Livret CHF Swissquote — Swissquote Bank Europe SA, Luxembourg'
    ];

    function resumeBase(f1, f2, r) {
        var morceaux = ['1AJ : ' + U.eur(f1.salaire, { dec: 0 })];
        morceaux.push('1AK : ' + (f1.caseValeur !== null ? U.eur(f1.caseValeur, { dec: 0 }) : 'vide'));
        if (f2) {
            morceaux.push('1BJ : ' + U.eur(f2.salaire, { dec: 0 }));
            morceaux.push('1BK : ' + (f2.caseValeur !== null ? U.eur(f2.caseValeur, { dec: 0 }) : 'vide'));
        }
        if (U.num(r.interetsEtrangers, 0) > 0) morceaux.push('2TR : ' + U.eur(r.interetsEtrangers, { dec: 0 }));
        return morceaux.join(' · ');
    }

    /* Un tableau de cases : c'est la seule forme qui se recopie sans se
       tromper — la case, ce qu'elle attend, et le montant exact. */
    function tableauCases(lignes) {
        if (!lignes.length) return '<div class="info">Rien à inscrire sur ce formulaire cette année.</div>';
        return '<table class="tableau compact"><tr><th>Case</th><th>Rubrique</th><th>À inscrire</th></tr>'
            + lignes.map(function (l) {
                return '<tr><td style="white-space:nowrap"><b>' + UI.h(l[0]) + '</b></td>'
                    + '<td style="text-align:left;font-size:12px;color:var(--txt-2)">' + UI.h(l[1])
                    + (l[3] ? '<div style="font-size:11px;color:var(--txt-3);margin-top:3px">' + UI.h(l[3]) + '</div>' : '')
                    + '</td>'
                    + '<td style="text-align:right;white-space:nowrap"><b>' + UI.h(l[2]) + '</b></td></tr>';
            }).join('') + '</table>';
    }

    // --------------------------------------------------- les cinq formulaires

    function formulaires(annee, sim, t2074, t2086, r) {
        var out = '';

        // ---- 2042 & 2042 C
        var resume2042 = ['1AJ : ' + U.eur(sim.case_1aj, { dec: 0 })];
        if (sim.case_1ak !== null) resume2042.push('1AK : ' + U.eur(sim.case_1ak, { dec: 0 }));
        if (sim.case_1bj) resume2042.push('1BJ : ' + U.eur(sim.case_1bj, { dec: 0 }));
        if (sim.case_1bk !== null) resume2042.push('1BK : ' + U.eur(sim.case_1bk, { dec: 0 }));
        if (t2074.case_3vg > 0) resume2042.push('3VG : ' + U.eur(t2074.case_3vg, { dec: 0 }));
        else if (t2074.case_3vh > 0) resume2042.push('3VH : ' + U.eur(t2074.case_3vh, { dec: 0 }));

        var cases2042 = [];
        if (sim.case_1aj > 0) cases2042.push(['1AJ', 'Traitements et salaires — déclarant 1',
            U.eur(sim.case_1aj, { dec: 0 }), 'Vérifier le montant prérempli par l’employeur.']);
        cases2042.push(['1AK', 'Frais réels — déclarant 1',
            sim.case_1ak !== null ? U.eur(sim.case_1ak, { dec: 0 }) : 'LAISSER VIDE',
            sim.case_1ak !== null ? sim.note_1ak
                : 'Abattement 10 % (' + U.eur(sim.abattement_10_1, { dec: 0 }) + ') plus avantageux.']);
        if (sim.couple && sim.case_1bj) {
            cases2042.push(['1BJ', 'Traitements et salaires — déclarant 2',
                U.eur(sim.case_1bj, { dec: 0 }), 'Vérifier le montant prérempli par l’employeur.']);
            cases2042.push(['1BK', 'Frais réels — déclarant 2',
                sim.case_1bk !== null ? U.eur(sim.case_1bk, { dec: 0 }) : 'LAISSER VIDE',
                sim.case_1bk !== null ? sim.note_1bk
                    : 'Abattement 10 % (' + U.eur(sim.abattement_10_2, { dec: 0 }) + ') plus avantageux.']);
        }
        if (sim.case_2tr) cases2042.push(['2TR', 'Intérêts et produits de placement à revenu fixe',
            U.eur(sim.case_2tr, { dec: 0 }), 'Reporté depuis la ligne 252 du formulaire 2047.']);
        if (sim.options_fiscales.assiette_2op > 0) cases2042.push(['2OP', 'Option globale titres et revenus mobiliers (indépendante de 3CN)',
            sim.cocher_2op ? '☑ À ENVISAGER' : '☐ NON RETENUE selon simulation',
            'Estimation sur les seules assiettes saisies : vérifier tous les revenus mobiliers du foyer.']);
        if (sim.options_fiscales.assiette_3cn > 0) cases2042.push(['3CN', 'Option barème des gains crypto privés (indépendante de 2OP)',
            sim.cocher_3cn ? '☑ À ENVISAGER' : '☐ NON RETENUE selon simulation',
            'Option sur tous les gains crypto privés du foyer ; vérifier la déclaration 2086.']);
        if (t2074.case_3vg > 0) cases2042.push(['3VG', 'Plus-value nette imposable de cession de valeurs mobilières',
            U.eur(t2074.case_3vg, { dec: 0 }),
            'Calcul : ' + U.eur(t2074.ligne_905, { dec: 0 }) + ' − ' + U.eur(t2074.ligne_913, { dec: 0 }) + '.']);
        else if (t2074.case_3vh > 0) cases2042.push(['3VH', 'Moins-value nette reportable 10 ans',
            U.eur(t2074.case_3vh, { dec: 0 }), 'Inscrire en POSITIF, sans signe moins.']);
        if (t2086.cessions.length) {
            if (t2086.exonere_305) cases2042.push(['3AN / 3BN', 'Plus ou moins-value sur actifs numériques',
                'À VÉRIFIER (seuil du foyer ≤ 305 €)',
                'Cessions de ce portefeuille (ligne 51, nets de frais) : ' + U.eur(t2086.total_cessions_218, { dec: 0 })
                + ' ; vérifier aussi toute autre cession du foyer avant de laisser les cases vides.']);
            else if (t2086.case_3an > 0) cases2042.push(['3AN', 'Plus-value imposable sur actifs numériques',
                U.eur(t2086.case_3an, { dec: 0 }),
                'Total des cessions > 305 € — case 3AN après le formulaire 2086.']);
            else if (t2086.case_3bn > 0) cases2042.push(['3BN', 'Moins-value sur actifs numériques',
                U.eur(t2086.case_3bn, { dec: 0 }), 'Inscrire en POSITIF en case 3BN.']);
        }
        cases2042.push(['8UU', 'Comptes ouverts, détenus, utilisés ou clos à l’étranger',
            '☑ À COCHER', COMPTES_ETRANGER.length + ' compte(s) déclaré(s) sur l’annexe 3916 / 3916-bis.']);

        out += UI.accordeon('Formulaire 2042 & 2042-C',
            '<div style="font-size:12px;color:var(--txt-3);margin-bottom:8px">Déclaration principale — les montants '
            + 'sont ceux de vos écritures ' + annee + ' et de vos paramètres. Recopiez-les tels quels.</div>'
            + tableauCases(cases2042),
            false, resume2042.join(' · '));

        // ---- 2047
        var ligne2047 = t2074.case_3vg > 0
            ? 'Pays : Luxembourg / Suisse (Swissquote) · Plus-value nette : ' + U.eur(t2074.case_3vg, { dec: 0 })
            : 'Aucune plus-value nette imposable de valeurs mobilières à reporter au Cadre 3 cette année.';
        out += UI.accordeon('Formulaire 2047',
            '<div style="font-size:12px;color:var(--txt-3);margin-bottom:8px">Sur impots.gouv.fr : étape 3, '
            + 'cocher « Revenus encaissés à l’étranger par un contribuable domicilié en France », annexe 2047.</div>'
            + '<div style="font-size:13px;font-weight:650;margin:10px 0 4px">Rubrique 2 — revenus de capitaux mobiliers</div>'
            + (U.num(r.interetsEtrangers, 0) > 0
                ? tableauCases([
                    ['232 à 238', 'Crédits d’impôt conventionnels', 'VIDE', 'Aucun crédit d’impôt sur ces intérêts.'],
                    ['250', 'Intérêts n’ouvrant pas droit à crédit d’impôt', U.eur(r.interetsEtrangers, { dec: 0 }),
                        'Pays : ' + String(r.paysEtranger || '—')],
                    ['251', 'Total', U.eur(r.interetsEtrangers, { dec: 0 })],
                    ['252', 'Total à reporter en case 2TR de la 2042', U.eur(r.interetsEtrangers, { dec: 0 })]
                ])
                : '<div class="info">Aucun intérêt étranger saisi : rien à remplir dans la Rubrique 2.</div>')
            + '<div style="font-size:13px;font-weight:650;margin:12px 0 4px">Cadre 3 — plus-values de source étrangère</div>'
            + '<div class="' + (t2074.case_3vg > 0 ? 'ok-vert' : 'info') + '">' + UI.h(ligne2047) + '</div>',
            false,
            (U.num(r.interetsEtrangers, 0) > 0
                ? 'Ligne 250 / 2TR : ' + U.eur(r.interetsEtrangers, { dec: 0 }) + ' (' + String(r.paysEtranger || '—') + ')'
                : 'Aucun intérêt étranger saisi'));

        // ---- 2074
        out += UI.accordeon('Formulaire 2074 / 2074-CMV',
            t2074.operations.length ? bloc2074(annee, t2074)
                : '<div class="info">Aucune cession d’actions, d’ETF ou d’ETC détectée en ' + annee + '.</div>',
            false,
            t2074.operations.length
                ? t2074.operations.length + ' cession(s) · bilan ' + U.eur(t2074.bilan_net, { dec: 0 })
                : 'Aucune cession en ' + annee);

        // ---- 2086
        out += UI.accordeon('Formulaire 2086',
            t2086.cessions.length ? bloc2086(annee, t2086)
                : '<div class="info">Aucune cession de cryptomonnaie détectée en ' + annee + '.</div>',
            false,
            t2086.cessions.length
                ? t2086.cessions.length + ' cession(s) · cédé net de frais ' + U.eur(t2086.total_cessions_218, { dec: 0 })
                    + ' · bilan ' + U.eur(t2086.plus_value_globale_224, { dec: 0 })
                : 'Aucune cession en ' + annee);

        // ---- 3916
        out += UI.accordeon('Formulaire 3916 / 3916-bis',
            '<div style="font-size:12px;color:var(--txt-3);margin-bottom:8px">Tout compte ouvert, détenu, utilisé '
            + 'ou clos hors de France doit être déclaré — même sans aucune opération.</div>'
            + COMPTES_ETRANGER.map(function (c, i) {
                return '<div class="ligne"><div class="gr"><div class="tt">Compte ' + (i + 1) + '</div>'
                    + '<div class="st">' + UI.h(c) + '</div></div>'
                    + '<div class="dr">' + UI.badge('à déclarer', 'warn') + '</div></div>';
            }).join('')
            + '<div class="sep"></div>'
            + tableauCases([['8UU', 'Comptes détenus hors de France', '☑ À COCHER',
                'Un 3916 par compte, et la case 8UU sur la 2042.']])
            + '<div class="erreur" style="margin-top:10px">Défaut de déclaration : 1 500 € d’amende par compte '
            + 'et par an, ramenée à 750 € si le solde total est inférieur à 50 000 €.</div>',
            false, COMPTES_ETRANGER.length + ' compte(s) à déclarer · case 8UU');

        return out;
    }

    function bloc2074(annee, t) {
        var out = '<div style="font-size:13px;font-weight:650;margin-bottom:6px">1. Synthèse</div>'
            + ligneResultat('Ligne 905 — total des plus-values', U.eur(t.ligne_905, { dec: 0 }))
            + ligneResultat('Ligne 913 — total des moins-values', U.eur(t.ligne_913, { dec: 0 }))
            + ligneResultat('Bilan net (905 − 913)', U.eur(t.bilan_net, { dec: 0, signe: true }), true)
            + '<div class="info" style="margin-top:8px">Bilan ' + U.eur(t.bilan_net, { dec: 0 })
            + ' → case <b>' + (t.bilan_net >= 0 ? '3VG' : '3VH') + '</b> : <b>'
            + U.eur(Math.abs(t.bilan_net), { dec: 0 }) + '</b>.'
            + (t.mv_anterieures_reportables > 0
                ? ' Moins-values antérieures encore disponibles : ' + U.eur(t.mv_anterieures_reportables, { dec: 0 })
                  + ' — après imputation, la base imposable est de ' + U.eur(t.case_3vg, { dec: 0 }) + '.'
                : '') + '</div>';

        out += '<div class="sep"></div><div style="font-size:13px;font-weight:650;margin:4px 0 6px">'
            + '2. Cadre 5 — détail par titre (lignes 511 à 524)</div>';
        t.par_actif.forEach(function (a) {
            out += '<div class="card tight" style="margin-bottom:10px">'
                + '<div style="font-size:13.5px;font-weight:700;margin-bottom:6px">' + UI.h(a.actif)
                + ' <span class="dim" style="font-weight:400">— ' + a.nb_operations + ' vente(s)</span></div>'
                + ligneResultat('511 — désignation', UI.h(a.ligne_511))
                + ligneResultat('512 — date de cession', a.ligne_512)
                + ligneResultat('514 — valeur unitaire de cession', U.eur(a.ligne_514, { dec: 4 }))
                + ligneResultat('515 — nombre de titres cédés', U.quantite(a.ligne_515))
                + ligneResultat('516 / 518 — prix de cession net', U.eur(a.ligne_516, { dec: 2 }))
                + ligneResultat('520 — prix d’acquisition unitaire', U.eur(a.ligne_520, { dec: 4 }))
                + ligneResultat('521 / 523 — prix de revient', U.eur(a.ligne_521, { dec: 2 }))
                + ligneResultat('524 — résultat', U.eur(a.ligne_524, { dec: 2, signe: true }), true)
                + '</div>';
        });

        out += '<div style="font-size:13px;font-weight:650;margin:12px 0 6px">'
            + '3. GPS fiscal — cadres 11 et 12 (imputation des moins-values)</div>';
        if (t.bilan_net < 0) {
            out += '<div class="erreur">Vous êtes en <b>perte nette globale</b> cette année (' + U.eur(t.bilan_net, { dec: 0 }) + ').<br><br>'
                + '1. Laissez le <b>cadre 11</b> totalement <b>VIDE</b>.<br>'
                + '2. Allez au <b>cadre 12</b> « suivi des moins-values reportables au 31/12/' + annee + ' ».<br>'
                + '3. Sur la ligne ' + annee + ', inscrivez <b>' + U.eur(t.case_3vh, { dec: 0 }) + '</b> '
                + 'et reportez le même montant en case <b>3VH</b> de la 2042-C.</div>';
        } else if (t.bilan_net > 0 && t.ligne_913 > 0) {
            out += '<div class="ok-vert">Gain net de <b>' + U.eur(t.bilan_net, { dec: 0 }) + '</b>, mais avec '
                + U.eur(t.ligne_913, { dec: 0 }) + ' de moins-values à imputer :<br><br>'
                + '1. Laissez le bloc <b>1132</b> totalement <b>VIDE</b>.<br>'
                + '2. Remplissez le bloc <b>1133</b> avec les colonnes ci-dessous.</div>'
                + '<table class="tableau compact" style="margin-top:8px"><tr><th>Titre</th><th>A gain</th>'
                + '<th>B perte imputée</th><th>C solde</th><th>D pertes ant.</th><th>E net</th></tr>'
                + t.cadre_11.map(function (c) {
                    return '<tr><td><b>' + UI.h(c.actif) + '</b></td><td>' + U.eur(c.col_a, { dec: 0 })
                        + '</td><td>' + U.eur(c.col_b, { dec: 0 }) + '</td><td>' + U.eur(c.col_c, { dec: 0 })
                        + '</td><td>' + U.eur(c.col_d, { dec: 0 }) + '</td><td><b>' + U.eur(c.col_e, { dec: 0 })
                        + '</b></td></tr>';
                }).join('') + '</table>'
                + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:6px">Colonnes F et G (abattement pour '
                + 'durée de détention) : 0 € — les ETF, ETC et titres acquis après le 01/01/2018 n’y ouvrent pas droit.</div>';
        } else {
            out += '<div class="ok-vert">Gain net de <b>' + U.eur(t.bilan_net, { dec: 0 }) + '</b> et '
                + 'aucune moins-value cette année.<br><br>'
                + 'Dans le <b>cadre 11</b>, ne remplissez que la <b>colonne A</b> (et reportez le même montant '
                + 'en colonnes C et E). Colonnes F et G : 0 €.<br>'
                + 'Reportez <b>' + U.eur(t.case_3vg, { dec: 0 }) + '</b> en case <b>3VG</b> de la 2042-C.</div>';
        }

        out += '<div class="sep"></div><div style="font-size:13px;font-weight:650;margin:4px 0 6px">'
            + '4. Détail des ' + t.operations.length + ' ventes ' + annee + '</div>'
            + '<table class="tableau compact"><tr><th>Actif</th><th>Date</th><th>Quantité</th>'
            + '<th>PRU</th><th>Coût</th><th>Cession</th><th>PV</th></tr>'
            + t.operations.map(function (o) {
                return '<tr><td><b>' + UI.h(o.actif) + '</b></td><td>' + U.jourMoisAnneeISO(o.date) + '</td>'
                    + '<td>' + U.quantite(o.quantite) + '</td><td>' + U.eur(o.pru_unitaire_eur, { dec: 4 }) + '</td>'
                    + '<td>' + U.eur(o.acq_globale_eur, { dec: 0 }) + '</td>'
                    + '<td>' + U.eur(o.cession_globale_eur, { dec: 0 }) + '</td>'
                    + '<td class="' + (o.plus_value_eur >= 0 ? 'up' : 'down') + '">'
                    + U.eur(o.plus_value_eur, { dec: 0, signe: true }) + '</td></tr>';
            }).join('') + '</table>';

        return out;
    }

    function bloc2086(annee, t) {
        var out = '<div style="font-size:12.5px;color:var(--txt-2);margin-bottom:8px">' + t.cessions.length
            + ' cession(s) · prix de cession brut (213) : <b>'
            + U.eur(t.total_cessions_213, { dec: 0 }) + '</b> · part connue de la ligne 51 du foyer (218 nets de frais) : <b>'
            + U.eur(t.total_cessions_218, { dec: 0 }) + '</b> · résultat net global (cumul des lignes 224) : <b>'
            + U.eur(t.plus_value_globale_224, { dec: 0 }) + '</b>.</div>';

        if (t.exonere_305) {
            out += '<div class="info">Franchise de 305 € à confirmer sur tout le foyer : les cessions de '
                + 'ce portefeuille (' + U.eur(t.total_cessions_218, { dec: 0 }) + ' nets de frais) restent sous le seuil. '
                + 'Ce total ne suffit pas à prouver l’exonération du foyer fiscal : vérifiez aussi les cessions '
                + 'éventuelles du conjoint hors de ce portefeuille. Laissez 3AN/3BN vides seulement si le '
                + 'seuil du foyer est respecté ; vérifiez également l’annexe 2086.</div>';
        } else {
            out += '<div class="info">Seuil de 305 € franchi : la plus-value est imposable dès le premier euro. '
                + 'Ce seuil porte sur le <b>total des prix de cession</b> de l’année, ce n’est pas un abattement.<br>'
                + 'À reporter en case <b>' + (t.case_3an > 0 ? '3AN' : '3BN') + '</b> : <b>'
                + U.eur(t.case_3an > 0 ? t.case_3an : t.case_3bn, { dec: 0 }) + '</b>.</div>';
        }
        // Portée du FOYER contrôlée, pas seulement annoncée : les cases 3AN/3BN
        // sont celles du foyer, l'application ne peut pas les certifier.
        if (PF.fiscalGardesFoyer) {
            var portee = PF.fiscalGardesFoyer.portee2086Foyer({ annee: annee,
                totalPrixCessionPortefeuille: t.total_cessions_218,
                operationsPortefeuille: t.cessions.length, seuilOfficiel: CRYPTO_FRANCHISE_CESSIONS });
            out += '<div class="st" style="margin-bottom:8px">' + UI.h(portee.etat + ' — ' + portee.seuilApplicable
                + '. ' + portee.limite + (portee.avertissements.length ? ' ' + portee.avertissements.join(' ') : ''))
                + '</div>';
        }

        out += '<table class="tableau compact" style="margin-top:10px"><tr><th>Actif</th><th>Date</th>'
            + '<th>212 valeur globale</th><th>213 brut</th><th>214 frais</th><th>218 net</th>'
            + '<th>220 coût total</th><th>221 déjà déduit</th><th>223</th><th>224 résultat</th></tr>'
            + t.cessions.map(function (c) {
                return '<tr><td><b>' + UI.h(c.actif) + '</b></td><td>' + U.jourMoisAnneeISO(c.date) + '</td>'
                    + '<td>' + U.eur(c.ligne_212, { dec: 0 }) + '</td><td>' + U.eur(c.ligne_213, { dec: 0 }) + '</td>'
                    + '<td>' + U.eur(c.ligne_214, { dec: 0 }) + '</td><td>' + U.eur(c.ligne_218, { dec: 0 }) + '</td>'
                    + '<td>' + U.eur(c.ligne_220, { dec: 0 }) + '</td>'
                    + '<td>' + U.eur(c.ligne_221, { dec: 0 }) + '</td><td>' + U.eur(c.ligne_223, { dec: 0 }) + '</td>'
                    + '<td class="' + (c.ligne_224 >= 0 ? 'up' : 'down') + '">'
                    + U.eur(c.ligne_224, { dec: 0, signe: true }) + '</td></tr>';
            }).join('') + '</table>';

        out += '<div style="font-size:11.5px;color:var(--txt-3);margin-top:8px">La ligne 221 retrace les fractions '
            + 'de capital déjà déduites lors des cessions précédentes : sans elle, le même capital serait déduit '
            + 'deux fois. Chaque 224 s’obtient par 218 (prix net des frais et soultes) − '
            + '(223 × 217 (prix avant frais, net des soultes) / 212 (valeur globale du portefeuille '
            + 'au jour de la cession)).</div>';

        return out;
    }

    // ------------------------------------------- 3. arbitrage, bilan et source

    function bilanImpot(annee, sim, t2074, t2086) {
        var out = '';

        // --- Arbitrage PFU / barème
        if (sim.options_fiscales.assiette_3cn > 0) {
            var options = sim.options_fiscales;
            out += '<div class="card"><div class="lbl">Options distinctes : 2OP (titres/intérêts) et 3CN (crypto)</div>'
                + '<div class="st">La 3CN est expresse et irrévocable pour tous les gains crypto privés du foyer, indépendante de 2OP ; chaque combinaison recalcule l’impôt progressif commun.</div>'
                + '<div style="overflow-x:auto"><table class="tableau compact" style="min-width:520px"><tr><th>2OP</th><th>3CN</th><th>IR barème</th><th>IR forfait</th><th>PS annuels</th><th>Total annuel</th></tr>'
                + options.scenarios.map(function (s) {
                    return '<tr><td>' + (s.cocher_2op ? '☑' : '☐') + '</td><td>' + (s.cocher_3cn ? '☑' : '☐')
                        + '</td><td>' + U.eur(s.ir_bareme, { dec: 0 })
                        + '</td><td>' + U.eur(s.ir_forfaitaire, { dec: 0 })
                        + '</td><td>' + U.eur(s.ps_total, { dec: 0 })
                        + '</td><td>' + U.eur(s.impot_total_foyer, { dec: 0 }) + '</td></tr>';
                }).join('') + '</table></div>'
                + '<div class="info">Sur les revenus saisis : 2OP ' + (sim.cocher_2op ? 'à envisager' : 'non retenue')
                + ', 3CN ' + (sim.cocher_3cn ? 'à envisager' : 'non retenue')
                + ' ; écart contre les deux forfaits : ' + U.eur(options.economie_vs_pfu, { dec: 0 }) + '. '
                + UI.h(options.limite) + '</div>'
                + '<div class="st">PS déjà précomptés sur intérêts : '
                + U.eur(options.retenu.ps_deja_precomptes, { dec: 0 })
                + ' ; PS restant à acquitter : ' + U.eur(options.retenu.ps_restants, { dec: 0 })
                + '. Aucun acompte d’IR déjà retenu ni déduction future de CSG n’est reconstitué.</div></div>';
        } else if (sim.arbitrage) {
            var a = sim.arbitrage;
            out += '<div class="card">'
                + '<div class="lbl">Flat tax (PFU) ou barème progressif ?</div>'
                + '<div style="display:flex;gap:10px;margin-top:6px">'
                + '<div style="flex:1;background:rgba(255,255,255,.04);border-radius:12px;padding:10px">'
                + '<div style="font-size:11px;color:var(--txt-3);text-transform:uppercase;letter-spacing:.06em">Flat tax</div>'
                + ligneResultat('IR ' + U.nombre(tauxIrForfaitaire(annee) * 100, 1) + ' %', U.eur(a.pfu.ir, { dec: 0 }))
                + (a.pfu.ir_bareme_debloque ? ligneResultat('IR au barème rétabli (seuil global)', U.eur(a.pfu.ir_bareme_debloque, { dec: 0 })) : '')
                + ligneResultat('PS (titres ' + U.nombre(tauxPS(annee) * 100, 1) + ' %, intérêts selon précompte)', U.eur(a.pfu.ps, { dec: 0 }))
                + ligneResultat('Total', U.eur(a.pfu.total, { dec: 0 }), true)
                + '</div>'
                + '<div style="flex:1;background:rgba(255,255,255,.04);border-radius:12px;padding:10px">'
                + '<div style="font-size:11px;color:var(--txt-3);text-transform:uppercase;letter-spacing:.06em">Barème</div>'
                + ligneResultat('Supplément d’IR', U.eur(a.bareme.ir_marginal, { dec: 0 }))
                + ligneResultat('PS (titres ' + U.nombre(tauxPS(annee) * 100, 1) + ' %, intérêts selon précompte)', U.eur(a.bareme.ps, { dec: 0 }))
                + ligneResultat('Total', U.eur(a.bareme.total, { dec: 0 }), true)
                + '</div></div>'
                + '<div class="' + (sim.cocher_2op ? 'info' : 'ok-vert') + '" style="margin-top:10px">'
                + 'Le plus favorable : <b>' + UI.h(a.choix) + '</b> — écart ' + U.eur(a.gain, { dec: 0 }) + '. '
                + (sim.cocher_2op
                    ? 'Case <b>2OP</b> à envisager sur les seuls revenus saisis : vérifier les autres revenus mobiliers du foyer.'
                    : 'Case <b>2OP</b> non retenue sur les seuls revenus saisis.')
                + (a.bareme.csg_deductible > 0
                    ? ' CSG déductible cette année sur intérêts précomptés : '
                      + U.eur(a.bareme.csg_deductible, { dec: 0 }) + '.' : '')
                + (a.bareme.csg_deductible_apres_paiement_estimee > 0
                    ? ' CSG potentiellement déductible l’année de son paiement (non comptée dans ce choix) : '
                      + U.eur(a.bareme.csg_deductible_apres_paiement_estimee, { dec: 0 }) + '.' : '')
                + (a.ps_deja_precomptes > 0
                    ? ' Dont PS déjà précomptés sur intérêts : ' + U.eur(a.ps_deja_precomptes, { dec: 0 }) + '.' : '')
                + '</div>'
                + (annee < 2023 && sim.impot_crypto > 0
                    ? '<div class="st">Cessions 2022 : 3CN n’existait pas encore ; les gains crypto restent au PFU.</div>' : '')
                + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:6px">Assiette soumise à l’option : '
                + U.eur(a.plus_value_nette, { dec: 0 }) + ' — plus-values mobilières et intérêts étrangers réunis.</div>'
                + '</div>';
        } else {
            out += '<div class="card"><div class="lbl">Flat tax (PFU) ou barème progressif ?</div>'
                + '<div class="info" style="margin-top:6px">'
                + (annee < 2023 && sim.impot_crypto > 0
                    ? 'Cessions 2022 : 3CN n’existait pas encore ; les gains crypto restent au PFU.'
                    : 'Aucune plus-value ni intérêt imposable cette année : l’arbitrage ne se pose pas.')
                + '</div></div>';
        }

        // --- Bilan de l'impôt du foyer
        out += '<div class="card"><div class="lbl">Bilan de votre impôt sur le revenu ' + annee + '</div>'
            + (sim.options_fiscales.retenu.ps_deja_precomptes > 0
                ? '<div class="st">Coût annuel incluant les PS déjà précomptés : ils ne sont pas à payer deux fois.</div>' : '')
            + ligneResultat('Impôt sur vos salaires', U.eur(sim.ir_salaires.impot_net, { dec: 0 }))
            + ligneResultat('Impôt + PS sur vos revenus du capital', U.eur(sim.impot_capital_retenu, { dec: 0 }))
            + ligneResultat('Impôt total du foyer', U.eur(sim.impot_total_foyer, { dec: 0 }), true)
            + ligneResultat('Taux marginal (TMI)', U.pct(sim.ir_salaires.tmi, 0))
            + ligneResultat('Revenu net imposable (salaires)', U.eur(sim.revenu_net_imposable_salaires, { dec: 0 }))
            + '</div>';

        // --- Prélèvement à la source
        var pas = '<div class="card"><div class="lbl">Prélèvement à la source — estimation simplifiée</div>'
            + ligneResultat('Taux du foyer estimé sur salaires', U.pct(sim.taux_pas_foyer, 2), true);
        if (sim.couple) {
            pas += ligneResultat('Taux individualisé estimé — déclarant 1', U.pct(sim.taux_pas_1, 2))
                + ligneResultat('Taux individualisé estimé — déclarant 2', U.pct(sim.taux_pas_2, 2));
        }
        pas += '<div class="st">Calcul indicatif sur les seuls salaires saisis. Il ne reproduit pas tous les revenus communs, crédits et arrondis des articles 204 H et 204 M. Pour un couple, l’individualisation est le régime par défaut depuis septembre 2025, sauf choix du taux foyer. Vérifiez vos taux réels sur impots.gouv.fr.</div>';
        pas += '</div>';

        return out + pas;
    }

    function blocFraisReels(n, f, annee, r) {
        var caseNom = n === 1 ? '1AK' : '1BK';
        var out = '<div class="sep"></div>'
            + '<div style="font-size:13px;font-weight:650;margin-bottom:6px">Déclarant ' + n
            + ' — frais professionnels (' + U.eur(f.abattement, { dec: 0 }) + ' d’abattement 10 %)</div>'
            + ligneReglage('Opter pour les frais réels', f.utilise ? 'Oui' : 'Non', 'utiliserFraisReels' + n);
        if (f.utilise) {
            out += ligneReglage('Kilomètres annuels', U.nombre(U.num(r['fraisKm' + n], 0), 0), 'fraisKm' + n)
                + ligneReglage('Puissance fiscale', U.num(r['cvFiscal' + n], 5) + ' CV', 'cvFiscal' + n)
                + ligneReglage('Jours de repas hors domicile', U.nombre(U.num(r['joursRepas' + n], 0), 0), 'joursRepas' + n)
                + ligneReglage('Véhicule 100 % électrique (+20 %)',
                    U.estVrai(r['vehiculeElectrique' + n]) ? 'Oui' : 'Non', 'vehiculeElectrique' + n);
        }
        out += '<div class="' + (f.retenir ? 'ok-vert' : 'info') + '" style="margin-top:8px">'
            + (f.retenir
                ? '<b>Case ' + caseNom + ' : estimation ' + U.eur(f.caseValeur, { dec: 0 }) + ' à vérifier avant déclaration</b><br>'
                    + UI.h('Frais kilométriques (' + U.num(r['cvFiscal' + n], 5) + ' CV) : ' + f.km.formule)
                    + '<br>' + UI.h(f.repas.formule) + '<br>'
                    + 'Total <b>' + U.eur(f.total, { dec: 0 }) + '</b> contre ' + U.eur(f.abattement, { dec: 0 })
                    + ' d’abattement 10 % : <b>' + U.eur(f.gain, { dec: 0 }) + '</b> de déduction supplémentaire.'
                : 'Abattement de 10 % estimé (' + U.eur(f.abattement, { dec: 0 }) + ') contre '
                    + U.eur(f.total, { dec: 0 }) + ' de frais réels estimés : <b>vérifiez avant la case ' + caseNom + '</b>.')
            + (f.utilise ? '<div class="st">Simulation non certifiée : vérifiez trajets éligibles, règle des 40 km, '
                + 'repas imposés hors domicile, mode de restauration, justificatifs et participation employeur. '
                + 'Le forfait repas ne s’applique pas automatiquement à tous les repas.</div>' : '')
            + '</div>';
        return out;
    }

    function ligneResultat(label, valeur, fort) {
        return '<div class="ligne" style="padding:7px 0"><div class="gr"><div class="st">' + UI.h(label) + '</div></div>'
            + '<div class="dr"><div class="a"' + (fort ? ' style="font-size:17px;color:var(--gold)"' : '') + '>'
            + UI.h(valeur) + '</div></div></div>';
    }

    function ligneReglage(label, valeur, cle) {
        return '<div class="ligne" data-reglage="' + UI.h(cle) + '"><div class="gr"><div class="tt">' + UI.h(label) + '</div></div>'
            + '<div class="dr"><div class="a">' + UI.h(valeur) + '</div><div class="b">modifier</div></div></div>';
    }

    // Une collecte DGFiP n'est complète que si TOUS les régimes utilisés
    // disposent d'une preuve et d'un moteur compatible. Ce bilan ne publie
    // ni ne remplace une R2 ; les renseignements personnels restent distincts.
    function couvertureDgfip(annee) {
        var boi = officiels[annee] || {}, frais = fraisOfficiels[annee] || {};
        var feuilles = {
            'IR': !!boi.ir, 'décote': !!boi.decote,
            'plafond QF général': !!boi.qf,
            'abattement salariés': !!frais.abatt, 'repas salariés': typeof frais.repas === 'number',
            'kilomètres voiture': !!frais.km, 'PS plus-values de titres': !!titresOfficiels[annee],
            'RCM par produit, précompte et date': false,
            'PS crypto privés': false, 'CSG déductible et calendrier': false,
            'crypto et 2086 complets': false, 'plafonds QF spéciaux': false,
            'formules et arrondis contrôlés': false
        };
        return { complet: Object.keys(feuilles).every(function (nom) { return feuilles[nom]; }),
            feuilles: feuilles,
            manquants: Object.keys(feuilles).filter(function (nom) { return !feuilles[nom]; }) };
    }

    /* Preuves réellement LUES pour un millésime, en vue de la matrice. Les
       constantes embarquées du code n'y apparaissent jamais : seule une
       relecture de cache revalidée, ou un document du millésime, compte. */
    /* URL d'un document PDF pour CE millésime : l'inventaire des sources décide.
       Un millésime sans document vérifié vaut `null`, jamais l'URL d'une autre
       année. Les lecteurs antérieurs à l'inventaire (sans `urlPour`) retombent
       sur leur adresse par défaut pour les revenus 2025 uniquement. */
    function urlSource(module, type, annee) {
        if (!module) return null;
        if (typeof module.urlPour === 'function') return module.urlPour(type, annee);
        return annee === 2025 && module.urls ? module.urls[type] || null : null;
    }

    function preuvesParAnnee(annee) {
        var r = rapportsControle[annee] || {};
        function cache(module, args) {
            try {
                return module && typeof module.lireCache === 'function'
                    ? module.lireCache.apply(module, args || []) : null;
            } catch (_) { return null; }
        }
        var recoupement = recoupementsCrypto[annee]
            || cache(PF.fiscalCryptoPsRecoupement, [annee]) || null;
        return {
            boi: officiels[annee] || cache(PF.fiscalDgfipSources, [annee]) || null,
            frais: fraisOfficiels[annee] || cache(PF.fiscalFraisSources, [annee]) || null,
            titres: titresOfficiels[annee] || cache(PF.fiscalRegimesSources, [annee]) || null,
            cryptoFaq: cache(PF.fiscalCryptoSources) || null,
            brochure: cache(PF.fiscalBrochureSources) || null,
            notice2086: cache(PF.fiscalCryptoPdfSources, ['notice', annee]) || null,
            brochureCrypto: cache(PF.fiscalCryptoPdfSources, ['brochure', annee]) || null,
            brochureRcm: cache(PF.fiscalRcmPdfSources, ['rcm', annee]) || null,
            chargesRcm: cache(PF.fiscalRcmPdfSources, ['charges', annee]) || null,
            recoupementPsCrypto: recoupement && recoupement.statut === 'partiel' ? recoupement
                : recoupement ? { statut: recoupement.statut, taux: recoupement.taux,
                    sources: recoupement.sources, note: recoupement.derivation } : null,
            revisionPubliee: revisionActive(annee),
            urls: {
                frais: PF.fiscalFraisSources ? PF.fiscalFraisSources.KM(annee) : null,
                repas: PF.fiscalFraisSources ? PF.fiscalFraisSources.repasUrl(annee) : null,
                gains: PF.fiscalRegimesSources ? PF.fiscalRegimesSources.url(annee) : null,
                cryptoFaq: PF.fiscalCryptoSources ? PF.fiscalCryptoSources.url : null,
                notice2086: urlSource(PF.fiscalCryptoPdfSources, 'notice', annee),
                brochureRcm: urlSource(PF.fiscalRcmPdfSources, 'rcm', annee),
                charges: urlSource(PF.fiscalRcmPdfSources, 'charges', annee),
                brochureCrypto: urlSource(PF.fiscalCryptoPdfSources, 'brochure', annee)
            }
        };
    }

    function matriceCouverture() {
        if (!PF.fiscalCouverture) return null;
        var preuves = {};
        annees().forEach(function (an) { if (an >= 2023) preuves[an] = preuvesParAnnee(an); });
        return PF.fiscalCouverture.matrice(preuves);
    }

    /* Matrice repliée : le compte rendu court reste copiable en un clic, les
       preuves détaillées ne s'imposent pas. */
    function htmlMatrice() {
        var m = matriceCouverture();
        if (!m) return '';
        var corps = m.annees.map(function (an) {
            var verifs = PF.fiscalCouverture.texteVerifications(an);
            return '<div style="margin-top:8px"><b>Revenus ' + UI.h(an) + '</b> — déclaration '
                + UI.h(m.millesimes[an].declaration) + ', publication BOFiP '
                + UI.h(m.millesimes[an].publicationBoi || 'non disponible')
                + '<div class="st" style="white-space:pre-wrap;overflow-wrap:anywhere">'
                + UI.h(PF.fiscalCouverture.texteDetail(m, an)) + '</div>'
                + (verifs ? '<div class="st" style="white-space:pre-wrap;overflow-wrap:anywhere">'
                    + '<b>Sources publiques relues hors application</b>\n' + UI.h(verifs) + '</div>' : '')
                + '</div>';
        }).join('');
        var contra = PF.fiscalCouverture.contradictions();
        return '<details style="margin-top:8px"><summary>Matrice de couverture DGFiP 2023–2026 '
            + '(établis ' + m.synthese.etablis + '/' + m.synthese.total
            + (m.synthese.recoupements ? ', recoupements ' + m.synthese.recoupements : '')
            + ') — bascule totale : ' + (m.synthese.basculeComplete ? 'oui' : 'non') + '</summary>'
            + corps + (contra.length ? '<div style="margin-top:8px"><b>Contradictions documentaires DGFiP</b>'
                + contra.map(function (c) {
                    return '<div class="st" style="margin-top:6px;overflow-wrap:anywhere">' + UI.h(c.resume)
                        + ' (revenus ' + UI.h(c.millesime) + ') : ' + UI.h(c.termes.map(function (t) {
                            return t.valeur + ' — ' + t.source + ' (' + (t.publication || 'date non indiquée') + ')'
                                + (t.passage ? ' ' + t.passage : '');
                        }).join(' CONTRE ')) + '. ' + UI.h(c.arbitrage) + '</div>';
                }).join('') + '</div>' : '')
            + '</details>';
    }

    function bilanMiseAJour(annee, resultat) {
        var boi = resultat.boi || {}, frais = resultat.frais || {}, titres = resultat.titres || {},
            rcm = resultat.rcm || {}, crypto = resultat.crypto || {}, brochure = resultat.brochure || {},
            cryptoPdf = resultat.cryptoPdf || {}, notice2086 = cryptoPdf.notice || {},
            brochureCrypto = cryptoPdf.brochure || {}, rcmPdf = resultat.rcmPdf || {},
            brochureRcm = rcmPdf.rcm || {}, chargesRcm = rcmPdf.charges || {},
            recoupement = resultat.recoupement || {};
        var v = boi.valeurs || {}, f = frais.valeurs || {};
        var sources = v.sources || {};
        function statut(nom, valeur, source) {
            return nom + ' : ' + (valeur || 'non disponible / non vérifié')
                + (source ? ' (publication ' + source.datePublication + ', ' + source.url + ')' : '');
        }
        var ir = v.ir && v.ir.tranches.join(' / ') + ' €, taux 0 / 11 / 30 / 41 / 45 %';
        var decote = v.decote && v.decote.dc + ' / ' + v.decote.dcCouple + ' € (45,25 %, plafond brut '
            + v.decote.dcPlafond + ' / ' + v.decote.dcPlafondCouple + ' €)';
        return 'Revenus ' + annee + ' (déclaration ' + (annee + 1) + ') : collecte partielle DGFiP, '
            + (revisionActive(annee) ? 'R2 déjà active prioritaire. '
                : annee === 2025 && /portefeuille non chargé|transactions indisponibles/.test(etatR2)
                    ? 'R2 2025 non évaluée : ' + etatR2 + '. Simulation personnelle en attente. '
                    : 'simulation indicative seulement. '
                        + (annee === 2025 ? 'R2 2025 : ' + etatR2 + '. ' : ''))
            + statut('IR', ir, sources.ir) + ' ; ' + statut('Décote', decote, sources.decote) + ' ; '
            + statut('Plafond QF général (hors plafonds spéciaux)', v.qf && v.qf + ' €/demi-part', sources.qf) + ' ; '
            + statut('Abattement salariés 10 % (min/max)', f.abatt && f.abatt.min + ' / ' + f.abatt.max + ' €', null) + ' ; '
            + statut('Repas salariés (sans justificatifs détaillés, conditions à vérifier)', f.repas && f.repas + ' €/repas', null) + ' ; '
            + statut('Barème kilomètres voiture (3 à 7 CV)', f.km && '5 lignes vérifiées', null)
            + '. Sources frais : ' + (PF.fiscalFraisSources ? PF.fiscalFraisSources.KM(annee) + ' ; '
                + PF.fiscalFraisSources.repasUrl(annee) : 'non disponible') + '. '
            + 'PS des plus-values de titres : ' + (titres.valeurs
                ? (titres.valeurs.ps * 100).toFixed(1).replace('.', ',') + ' % (IR forfaitaire '
                    + (titres.valeurs.ir * 100).toFixed(1).replace('.', ',') + ' %, DGFiP ' + titres.url + ')'
                : 'non vérifié (' + (titres.etat || 'non recherché') + ')') + '. '
            + (annee === 2025
                ? 'Écart documentaire DGFiP pour les titres 2025 : notice 2042 (17,2 % de PS) contre notice dédiée 2074 et aide du simulateur 2026 (18,6 %). Le lecteur utilise l’aide du simulateur ; divergence non levée, R2 prioritaire. '
                : '')
            + 'RCM — preuve partielle : ' + (rcm.valeurs
                ? 'revenus encaissés en 2025 : ' + (rcm.valeurs.precompte2025 * 100).toFixed(1).replace('.', ',')
                    + ' % si PS précomptés lors du versement ; '
                    + (rcm.valeurs.nonPrecompteAvis2026 * 100).toFixed(1).replace('.', ',')
                    + ' % sur avis 2026 si non précomptés en 2025 (page modifiée le '
                    + rcm.valeurs.dateModification + ', ' + rcm.url + '). Produit, exception et précompte du foyer non déterminés ; taux non activés'
                    + (rcm.valeurs.csgConditionnelle ? '. CSG de 6,8 % sous conditions mentionnée sur la page courante : cette lecture ne met pas à jour le moteur ; la simulation peut déjà employer une estimation CSG issue de la R2 ou du code embarqué, selon précompte déclaré. Éligibilité, produit et année de paiement non contrôlés par le bouton' : '')
                : 'non disponible (' + (rcm.etat || 'non recherché') + ')') + '. '
            + 'Crypto — FAQ DGFiP courante, preuve partielle : ' + (crypto.valeurs
                ? 'PFU actuel ' + (crypto.valeurs.pfuCourant * 100).toFixed(1).replace('.', ',')
                    + ' % (IR ' + (crypto.valeurs.irCourant * 100).toFixed(1).replace('.', ',')
                    + ' %, PS ' + (crypto.valeurs.psCourant * 100).toFixed(1).replace('.', ',')
                    + ' %) ; 3CN indépendante de 2OP, seuil de cessions du foyer '
                    + crypto.valeurs.seuilCourant + ' €, annexe 2086, cases 3AN/3BN (page modifiée le '
                    + crypto.valeurs.dateModification + ', ' + crypto.url + '). '
                    + 'La FAQ ne date pas ce PFU par année de cession : aucun taux crypto de cette lecture attribué aux revenus 2025 ni activé dans la simulation'
                : 'non disponible (' + (crypto.etat || 'non recherchée') + ')') + '. '
            + (annee === 2025 ? 'Brochure DGFiP revenus 2025 (PDF, preuve partielle) : ' : 'Brochure PDF de ce millésime : ')
            + (brochure.valeurs
                ? 'CSG patrimoine de 9,2 % à 10,6 % sur revenus 2025 déclarés en 2026 ; produits de placement à compter du 1.1.2026 ; exceptions à 9,2 % et CSG déductible 6,8 % mentionnées ('
                    + brochure.url + '). Cette lecture ne prouve ni le taux global PS crypto 2025, ni la CSG personnelle déductible ; aucun taux activé'
                : 'non disponible (' + (brochure.etat || 'non recherchée') + ')') + '. '
            + (annee === 2025 ? 'Notice 2086 DGFiP revenus 2025 (PDF, preuve partielle) : '
                : 'Notice 2086 PDF de ce millésime : ') + (notice2086.valeurs
                ? 'quotient sur prix avant frais et valeur globale du portefeuille ; frais dans le premier terme du gain ; ligne 51 et seuil du foyer 305 €, 3AN/3BN et option 3CN ('
                    + notice2086.url + '). Formulaire : « inférieur ou égal à 305 € » ; un paragraphe de la notice écrit « inférieur à 305 € » (égalité non résolue par cette lecture). La formule et les cases du formulaire sont relues, mais la complétude des cessions du foyer et le taux PS crypto 2025 ne sont pas attestés ; aucun paramètre activé'
                : 'non disponible (' + (notice2086.etat || 'non recherchée') + ')') + '. '
            + (annee === 2025 ? 'Brochure plus-values crypto DGFiP revenus 2025 (PDF, preuve partielle) : '
                : 'Brochure crypto PDF de ce millésime : ') + (brochureCrypto.valeurs
                ? 'IR forfaitaire 12,8 %, seuil du foyer 305 €, 2086 même en dessous du seuil, 3CN distincte de l’option RCM ('
                    + brochureCrypto.url + '). Taux global PS crypto 2025 non déterminé par ce lecteur ; aucune activation'
                : 'non disponible (' + (brochureCrypto.etat || 'non recherchée') + ')') + '. '
            + (annee === 2025 ? 'Brochure RCM DGFiP revenus 2025 (PDF, preuve partielle) : '
                : 'Brochure RCM PDF de ce millésime : ') + (brochureRcm.valeurs
                ? '2CG : pas de CSG déductible ; 2BH : CSG 6,8 % déductible si option globale 2OP et PS prélevés en 2025 ; 2DF : déduction même sans 2OP pour certains produits (dont versements avant le 27.9.2017) déjà soumis aux PS en 2025 ('
                    + brochureRcm.url + '). Produit, dates et précompte du foyer non attestés ; aucune activation'
                : 'non disponible (' + (brochureRcm.etat || 'non recherchée') + ')') + '. '
            + (annee === 2025 ? 'Brochure charges DGFiP revenus 2025 (PDF, preuve partielle) : '
                : 'Brochure charges PDF de ce millésime : ') + (chargesRcm.valeurs
                ? 'CSG sur certains revenus du patrimoine 2024 payée en 2025 déductible des revenus 2025 ; case 6DE pour corriger le préremplissage dans les cas prévus. CSG des lignes 2BH/2DF prélevée en 2025 calculée automatiquement, à ne pas ajouter en 6DE ('
                    + chargesRcm.url + '). Une plus-value 2025 imposée forfaitairement ne crée pas à elle seule une déduction CSG en 2025 ; avis et montants du foyer non lus, aucune activation'
                : 'non disponible (' + (chargesRcm.etat || 'non recherchée') + ')') + '. '
            + 'PS des cessions crypto privées — recoupement documentaire : '
            + (recoupement.statut === 'recoupement'
                ? 'revenus ' + annee + ' : ' + recoupement.derivation + '. Statut « recoupement » de deux textes '
                    + 'DGFiP, aucun texte unique ne datant ce taux par année de cession. '
                    + (recoupement.contradictionBofip || 'Contradiction BOFiP signalée.')
                    + ' Aucun taux activé par cette lecture'
                : 'revenus ' + annee + ' non établi (' + (recoupement.etat || 'non recherché') + '). '
                    + 'La FAQ courante n’est pas attribuée à cette année ; le BOFiP crypto '
                    + '(BOI-RPPM-PVBMC-30-30, version du 23/04/2024, 17,2 %) ne date pas son taux par année '
                    + 'de cession. Aucun taux activé') + '. '
            + 'RCM complets selon produit/date, PS crypto, CSG déductible, crypto/2086, plafonds QF spéciaux, '
            + 'changements de formule et conditions personnelles : non vérifiés par ce lecteur. '
            + 'Les valeurs embarquées de ces catégories ne sont pas des mises à jour. '
            + 'État des sources : BOFiP ' + JSON.stringify(boi.etats || boi.erreur || {})
            + ' ; frais ' + JSON.stringify(frais.etats || frais.erreur || {})
            + ' ; titres ' + (titres.etat || titres.erreur || 'non recherché')
            + ' ; RCM ' + (rcm.etat || rcm.erreur || 'non recherché')
            + ' ; crypto ' + (crypto.etat || crypto.erreur || 'non recherchée')
            + ' ; brochure CSG PDF ' + (brochure.etat || brochure.erreur || 'non recherchée')
            + ' ; notice 2086 PDF ' + (notice2086.etat || notice2086.erreur || 'non recherchée')
            + ' ; brochure crypto PDF ' + (brochureCrypto.etat || brochureCrypto.erreur || 'non recherchée')
            + ' ; brochure RCM PDF ' + (brochureRcm.etat || brochureRcm.erreur || 'non recherchée')
            + ' ; brochure charges PDF ' + (chargesRcm.etat || chargesRcm.erreur || 'non recherchée') + '. '
            + 'Bascule DGFiP totale : non ; contrôles manquants : ' + couvertureDgfip(annee).manquants.join(', ') + '. '
            + 'Les montants personnels, frais réels, autres revenus du foyer et PAS officiel ne sont pas contrôlés.';
    }

    // -------------------------------------------------------------- événements

    function attacher() {
        var vue = document.getElementById('view');
        if (!vue || vue.dataset.fiscal === '1') return;
        vue.dataset.fiscal = '1';
        vue.addEventListener('click', function (e) {
            var cible = e.target.closest ? e.target : null;
            if (!cible) return;
            var copieResume = cible.closest('[data-fisc="copier-resume"]');
            if (copieResume) {
                var aCopier = Number(copieResume.getAttribute('data-annee'));
                var uCopie = PF.net && PF.net.auth && PF.net.auth.utilisateur();
                if (!uCopie || uCopie.id !== compteRapports || !rapportsControle[aCopier]) return;
                var texteCourt = resumeRapport(aCopier, rapportsControle[aCopier]);
                var zoneCopie = document.createElement('textarea');
                zoneCopie.value = texteCourt;
                zoneCopie.style.position = 'fixed'; zoneCopie.style.opacity = '0';
                document.body.appendChild(zoneCopie);
                zoneCopie.select();
                var okCopie = false;
                try { okCopie = document.execCommand('copy'); } catch (_) { /* WebView sans presse-papiers */ }
                document.body.removeChild(zoneCopie);
                if (okCopie) UI.toast('Résumé copié');
                else if (root.Native && root.Native.share) root.Native.share('Bilan fiscal DGFiP', texteCourt);
                else UI.toast('Copie impossible');
                return;
            }
            var collecte = cible.closest('[data-fisc="collecter"], [data-fisc="collecter-tout"]');
            if (collecte) {
                var etat = vue.querySelector('#etatCollecteFiscale');
                if (!PF.fiscalDgfipSources || !PF.fiscalFraisSources ||
                    !PF.fiscalRegimesSources || !PF.fiscalRcmSources || !PF.fiscalCryptoSources
                    || !PF.fiscalBrochureSources || !PF.fiscalCryptoPdfSources || !PF.fiscalRcmPdfSources) {
                    if (etat) etat.textContent = 'Modules DGFiP absents.';
                    return;
                }
                var proprietaire = PF.net.auth.utilisateur();
                if (!proprietaire) {
                    if (etat) etat.textContent = 'Connectez-vous avant de rechercher une mise à jour.';
                    return;
                }
                var années = collecte.getAttribute('data-fisc') === 'collecter-tout'
                    ? [2023, 2024, 2025, 2026] : [anneeEnCours()];
                collecte.disabled = true;
                if (etat) etat.textContent = 'Lecture DGFiP des revenus ' + années.join(', ') + '…';
                Promise.all(années.map(function (an) {
                    return Promise.all([
                        PF.fiscalDgfipSources.chercher(an).catch(function (err) {
                            return { erreur: String(err && err.message || err) };
                        }),
                        PF.fiscalFraisSources.chercher(an).catch(function (err) {
                            return { erreur: String(err && err.message || err) };
                        }),
                        PF.fiscalRegimesSources.chercher(an).catch(function (err) {
                            return { erreur: String(err && err.message || err) };
                        }),
                        PF.fiscalRcmSources.chercher(an).catch(function (err) {
                            return { erreur: String(err && err.message || err) };
                        }),
                        PF.fiscalCryptoSources.chercher(an).catch(function (err) {
                            return { erreur: String(err && err.message || err) };
                        }),
                        PF.fiscalBrochureSources.chercher(an).catch(function (err) {
                            return { erreur: String(err && err.message || err) };
                        }),
                        PF.fiscalCryptoPdfSources.chercher(an).catch(function (err) {
                            return { notice: { erreur: String(err && err.message || err) },
                                brochure: { erreur: String(err && err.message || err) } };
                        }),
                        PF.fiscalRcmPdfSources.chercher(an).catch(function (err) {
                            return { rcm: { erreur: String(err && err.message || err) },
                                charges: { erreur: String(err && err.message || err) } };
                        }),
                        // Recoupement PS crypto : module récent, donc optionnel.
                        // Son absence ne bloque pas la collecte déjà livrée.
                        (PF.fiscalCryptoPsRecoupement
                            ? PF.fiscalCryptoPsRecoupement.chercher(an)
                            : Promise.resolve({ statut: 'partiel', etat: 'module de recoupement absent' })
                        ).catch(function (err) {
                            return { statut: 'partiel', etat: 'recoupement interrompu : '
                                + String(err && err.message || err) };
                        })
                    ]).then(function (resultats) {
                        return { annee: an, boi: resultats[0], frais: resultats[1],
                            titres: resultats[2], rcm: resultats[3], crypto: resultats[4],
                            brochure: resultats[5], cryptoPdf: resultats[6], rcmPdf: resultats[7],
                            recoupement: resultats[8] };
                    });
                })).then(function (resultats) {
                    var courant = PF.net.auth.utilisateur();
                    if (!courant || courant.id !== proprietaire.id)
                        throw new Error('Session changée pendant la recherche.');
                    return actualiserCollectesDgfip(PF.app.etat.ctx).then(function () {
                        courant = PF.net.auth.utilisateur();
                        if (!courant || courant.id !== proprietaire.id) return;
                        if (compteRapports && compteRapports !== proprietaire.id)
                            rapportsControle = Object.create(null);
                        compteRapports = proprietaire.id;
                        resultats.forEach(function (r) { rapportsControle[r.annee] = r; });
                        // Le recoupement relu est conservé par millésime : il ne
                        // s'applique jamais à une autre année et n'active rien.
                        resultats.forEach(function (r) {
                            if (r.recoupement && r.recoupement.statut && r.recoupement.statut !== 'partiel')
                                recoupementsCrypto[r.annee] = r.recoupement;
                        });
                        PF.app.rendre();
                    });
                }).catch(function (err) {
                    if (etat) etat.textContent = 'Actualisation interrompue : '
                        + String(err && err.message || err) + '. Aucune révision complète publiée.';
                }).then(function () { collecte.disabled = false; });
                return;
            }
            var psBtn = cible.closest('[data-fisc="ps-interets"]');
            if (psBtn) {
                var choix = psBtn.getAttribute('data-valeur');
                if (choix !== 'oui' && choix !== 'non') return;
                var patch = {};
                patch['interetsPs' + anneeEnCours()] = choix; // local et millésimé, jamais Config sans année
                PF.store.sauverReglages(patch);
                PF.app.rendre();
                return;
            }
            var anneeBtn = cible.closest('[data-fisc="annee"]');
            if (anneeBtn) { anneeFiscale = Number(anneeBtn.getAttribute('data-valeur')); PF.app.rendre(); return; }
            var lien = cible.closest('[data-fisc="ouvrir-lien"]');
            if (lien) {
                if (typeof root.Native !== 'undefined' && root.Native.openExternal) root.Native.openExternal(URL_MAJ_BAREMES);
                return;
            }
            var promptBtn = cible.closest('[data-fisc="prompt"]');
            if (promptBtn) {
                UI.feuille({
                    titre: 'Prompt de mise à jour des barèmes',
                    aide: 'À envoyer à l’assistant Arena : il régénère core/fiscal_bars.py avec les sources citées.',
                    corps: '<textarea id="fiscPrompt" rows="10" style="width:100%;background:rgba(255,255,255,.05);'
                        + 'border:1px solid var(--line);border-radius:13px;color:var(--txt);font-size:12.5px;padding:12px;font-family:monospace">'
                        + UI.h(PROMPT_MAJ.replace('{ANNEE}', String(derniereAnnee() + 1))) + '</textarea>',
                    boutons: [
                        { texte: 'Copier', sorte: '', garder: true, action: function () { copier('fiscPrompt'); } },
                        { texte: 'Ouvrir l’assistant', sorte: 'sec', action: function () {
                            if (typeof root.Native !== 'undefined' && root.Native.openExternal) root.Native.openExternal(URL_MAJ_BAREMES);
                        } },
                        { texte: 'Fermer', sorte: 'ghost' }
                    ]
                });
            }
        });
    }

    function copier(id) {
        var z = document.getElementById(id);
        if (!z) return;
        z.select();
        try {
            document.execCommand('copy');
            UI.toast('Prompt copié');
        } catch (e) {
            UI.toast('Copie impossible');
        }
    }

    PF.fiscal = {
        BAREMES: BAREMES, PS_PAR_ANNEE: PS_PAR_ANNEE, IR_FORFAITAIRE: IR_FORFAITAIRE,
        CSG_DEDUCTIBLE: CSG_DEDUCTIBLE, CRYPTO_FRANCHISE_CESSIONS: CRYPTO_FRANCHISE_CESSIONS,
        OR_PHYS_TFMP: OR_PHYS_TFMP, OR_PHYS_PV_IR: OR_PHYS_PV_IR, OR_PHYS_PV_PS: OR_PHYS_PV_PS,
        annees: annees, derniereAnnee: derniereAnnee, baremeDe: baremeDe, tauxPS: tauxPS, tauxPFU: tauxPFU,
        impotRevenu: impotRevenu, abattement10: abattement10, fraisKilometriques: fraisKilometriques,
        fraisRepas: fraisRepas, forfaitRepas: forfaitRepas, fraisReelsDeclarant: fraisReelsDeclarant,
        appliquerConfig: appliquerConfig,
        comparerPfuBareme: comparerPfuBareme, comparerOptionsFoyer: comparerOptionsFoyer,
        tauxPAS: tauxPAS, verifierMaj: verifierMaj,
        cessionsAnnee: cessionsAnnee, bilanCessions: bilanCessions,
        detail2074: detail2074, detail2086: detail2086, simulerFoyer: simulerFoyer,
        PROMPT_MAJ: PROMPT_MAJ, URL_MAJ_BAREMES: URL_MAJ_BAREMES,
        snapshotConstantesCode: snapshotConstantesCode,
        actualiserRevisions: actualiserRevisions, actualiserCollectesDgfip: actualiserCollectesDgfip,
        effacerRevisions: effacerRevisions,
        revisionActive: revisionActive, bilanMiseAJour: bilanMiseAJour,
        resumeRapport: resumeRapport, htmlRapport: htmlRapport,
        plafondQF: plafondQF, franchiseCrypto: franchiseCrypto, couvertureDgfip: couvertureDgfip,
        PROVENANCE_PS: PROVENANCE_PS, tauxPSEtabli: tauxPSEtabli, psCryptoRecoupement: psCryptoRecoupement,
        preuvesParAnnee: preuvesParAnnee, matriceCouverture: matriceCouverture, htmlMatrice: htmlMatrice,
        csgDeductible6DE: function (d) { return PF.fiscalGardesFoyer.csgDeductible6DE(d); },
        portee2086Foyer: function (d) { return PF.fiscalGardesFoyer.portee2086Foyer(d); },
        casParticuliersQF: function (d) { return PF.fiscalGardesFoyer.casParticuliersQF(d); },
        vue: vue, attacher: attacher
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
