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
            })) return null;
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
