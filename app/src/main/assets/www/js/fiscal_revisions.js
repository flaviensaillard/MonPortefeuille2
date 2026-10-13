/* Prototype de lecteur de révisions fiscales : lecture Supabase seulement.
   NON chargé par index.html et NON branché aux calculs : le contrat d'audit
   par paramètre et le moteur multi-années doivent être finalisés avant cela.
   Une sélection structurelle n'homologue jamais une règle fiscale. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var TABLE = 'pf2_fiscal_annees';
    var CHAMPS = 'annee_revenus,revision,origine,source_ref,parametres,statut_validation,perimetre_validation,actif';

    function objet(x) {
        return x !== null && typeof x === 'object' && !Array.isArray(x);
    }
    function entier(x) {
        return typeof x === 'number' && isFinite(x) && Math.floor(x) === x;
    }
    function valeurSaine(valeur) {
        if (valeur === null || valeur === undefined) return false;
        if (typeof valeur === 'number') return isFinite(valeur);
        if (typeof valeur === 'string') return valeur.length > 0;
        if (typeof valeur === 'boolean') return true;
        if (Array.isArray(valeur)) return valeur.length > 0 && valeur.every(valeurSaine);
        if (objet(valeur)) return Object.keys(valeur).length > 0 &&
            Object.keys(valeur).every(function (cle) { return valeurSaine(valeur[cle]); });
        return false;
    }
    function cheminsFeuilles(params, prefixe) {
        if (!objet(params)) throw new Error('Paramètres fiscaux invalides.');
        var noms = Object.keys(params);
        if (!noms.length) throw new Error('Paramètres fiscaux vides.');
        var chemins = [];
        noms.forEach(function (nom) {
            if (!nom || nom.indexOf('.') !== -1 || nom === '__proto__' || nom === 'constructor') {
                throw new Error('Clé fiscale invalide.');
            }
            var chemin = prefixe ? prefixe + '.' + nom : nom;
            var valeur = params[nom];
            if (objet(valeur)) chemins = chemins.concat(cheminsFeuilles(valeur, chemin));
            else if (!valeurSaine(valeur)) throw new Error('Valeur fiscale absente ou invalide.');
            else chemins.push(chemin);
        });
        return chemins.sort();
    }
    function listeChemins(xs) {
        return Array.isArray(xs) && xs.length > 0 && xs.every(function (x) {
            return typeof x === 'string' && x.length > 0 && x.split('.').every(function (p) {
                return p.length > 0 && p !== '__proto__' && p !== 'constructor';
            });
        }) && new Set(xs).size === xs.length;
    }
    function identiques(a, b) {
        return a.length === b.length && a.every(function (x, i) { return x === b[i]; });
    }

    function nombre(x, bas, haut) {
        return typeof x === 'number' && isFinite(x) && x >= bas && x <= haut;
    }
    /* Format compatible avec le moteur ACTUEL 2025 ; les seuils de mode de
       calcul non configurables sont exigés à leur valeur embarquée. Ne prouve
       PAS que ces chiffres soient légalement exacts. */
    function forme2025(v) {
        try {
            if (!objet(v) || !objet(v.bareme) || v.bareme.annee !== 2025) return false;
            var b = v.bareme;
            if (!Array.isArray(b.tranches) || b.tranches.length !== 4 ||
                !b.tranches.every(function (x, i) {
                    return entier(x) && x > (i ? b.tranches[i - 1] : 0) && x < 10000000;
                }) || !Array.isArray(b.taux) || b.taux.length !== 4 ||
                !b.taux.every(function (x, i) {
                    return nombre(x, 0, .6) && x > (i ? b.taux[i - 1] : 0);
                })) return false;
            if (!['decote_base_celibataire', 'decote_plafond_celibataire',
                'decote_base_couple', 'decote_plafond_couple'].every(function (k) {
                return nombre(b[k], 0, 10000);
            }) || b.decote_taux !== .4525) return false;
            var ps = v.prelevements_sociaux_par_categorie;
            if (!objet(ps) || !nombre(v.prelevements_sociaux, 0, .4) ||
                !['plus_values_titres', 'plus_values_crypto_privees',
                    'rcm_precomptes_en_2025', 'rcm_non_precomptes'].every(function (k) {
                    return nombre(ps[k], 0, .4);
                }) || ps.plus_values_titres !== v.prelevements_sociaux ||
                ps.plus_values_crypto_privees !== v.prelevements_sociaux ||
                ps.rcm_non_precomptes !== v.prelevements_sociaux) return false;
            if (!objet(v.quotient_familial) ||
                !nombre(v.quotient_familial.plafond_general_par_demi_part, 0, 10000) ||
                v.quotient_familial.plafonds_particuliers_modelises !== false ||
                v.ir_forfaitaire !== .128 || v.seuil_non_recouvrement_ir !== 61 ||
                !nombre(v.csg_deductible, 0, .2)) return false;
            var cal = v.calendrier_csg, options = v.options_fiscales;
            if (!objet(cal) || cal.deduction_selon_annee_paiement !== true ||
                cal.rcm_precomptes_deduction_possible_en_2025_si_bareme !== true ||
                cal.csg_payee_ulterieurement_non_deduite_du_revenu_2025 !== true ||
                !objet(options) || options.deux_op_globale_titres_et_rcm !== true ||
                options.trois_cn_crypto_independante !== true ||
                options.trois_cn_disponible_pour_cessions_depuis !== 2023) return false;
            var ab = v.abattement_10, km = v.bareme_km, regles = v.regles_km;
            if (!objet(ab) || ab.taux !== .10 || !nombre(ab.plancher, 0, 10000) ||
                !nombre(ab.plafond, ab.plancher, 100000) ||
                !nombre(v.forfait_repas, 0, 100) || !objet(km) ||
                Object.keys(km).sort().join(',') !== '3,4,5,6,7' ||
                !Object.keys(km).every(function (cv) {
                    return Array.isArray(km[cv]) && km[cv].length === 4 &&
                        km[cv].every(function (x, i) { return nombre(x, 0, i === 2 ? 10000 : 2); });
                }) || !objet(regles) ||
                !Array.isArray(regles.seuils_distance_km) ||
                regles.seuils_distance_km.length !== 2 ||
                regles.seuils_distance_km[0] !== 5000 ||
                regles.seuils_distance_km[1] !== 20000 ||
                regles.majoration_electrique !== .20 ||
                !nombre(v.franchise_crypto, 0, 10000) ||
                'or_physique' in v || 'pas' in v) return false;
            return true;
        } catch (_) { return false; }
    }

    /* L'inventaire du moteur est fourni par l'appelant ; jamais inféré des
       seules données distantes. Aucun repli sur R1 ni sur la dernière révision. */
    function examiner(lignes, annee, cheminsConsommes) {
        if (!entier(annee) || annee < 2000 || annee > 2100 || !listeChemins(cheminsConsommes)) {
            throw new Error('Année ou inventaire des paramètres consommés invalide.');
        }
        if (!Array.isArray(lignes) || lignes.some(function (r) {
            return !objet(r) || r.annee_revenus !== annee || !entier(r.revision) || r.revision < 1;
        })) throw new Error('Réponse fiscale incomplète ou autre millésime.');
        var revues = new Set();
        lignes.forEach(function (r) {
            if (revues.has(r.revision)) throw new Error('Révision fiscale dupliquée.');
            revues.add(r.revision);
        });
        var actives = lignes.filter(function (r) { return r.actif === true; });
        if (actives.length !== 1) return null;
        var r = actives[0];
        var p = r.perimetre_validation;
        if (r.statut_validation !== 'valide_pour_perimetre' ||
            r.origine !== 'nouvelle_publication' ||
            typeof r.source_ref !== 'string' || !/^https:\/\//.test(r.source_ref) ||
            !objet(p) || p.couverture !== 'integrale_parametres_utilises' ||
            p.annee_revenus !== annee || !Array.isArray(p.regles_exclues) ||
            p.regles_exclues.length !== 0 || !listeChemins(p.parametres_utilises) ||
            !objet(p.sources_par_parametre)) return null;
        var attendus = cheminsConsommes.slice().sort();
        if (!identiques(attendus, p.parametres_utilises.slice().sort())) return null;
        var reels;
        try { reels = cheminsFeuilles(r.parametres, ''); }
        catch (_) { return null; }
        if (!identiques(attendus, reels) ||
            !identiques(attendus, Object.keys(p.sources_par_parametre).sort()) ||
            attendus.some(function (chemin) {
                var ref = p.sources_par_parametre[chemin];
                return typeof ref !== 'string' || !/^https:\/\//.test(ref);
            }) || annee !== 2025 || !forme2025(r.parametres)) return null;
        // Résultat purement structurel : aucune constante n'est branchée au
        // moteur, même si les métadonnées prétendent une couverture intégrale.
        return { annee_revenus: annee, revision: r.revision,
            statut: 'candidat_structurel_non_homologue', parametres: r.parametres };
    }

    function consulter(annee, cheminsConsommes) {
        if (!entier(annee) || annee < 2000 || annee > 2100 || !listeChemins(cheminsConsommes)) {
            return Promise.reject(new Error('Année ou inventaire des paramètres consommés invalide.'));
        }
        // RLS Supabase : uniquement l'utilisateur connecté ; aucune écriture.
        return PF.net.supabase.select(TABLE, 'annee_revenus=eq.' + annee + '&select=' + CHAMPS)
            .then(function (lignes) { return examiner(lignes, annee, cheminsConsommes); });
    }
    PF.fiscalRevisions = { examiner: examiner, consulter: consulter };
})(typeof window !== 'undefined' ? window : globalThis);
