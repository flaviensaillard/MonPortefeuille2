/* Réglages et cache local.
   Les identifiants Supabase ne sont jamais livrés dans l'application : ils sont
   saisis une fois par le porteur au premier lancement, puis conservés sur
   l'appareil. Rien ne transite par nos serveurs, il n'y en a pas. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util;

    var CLE_REGLAGES = 'pf.reglages.v1';
    var CLE_CACHE = 'pf.cache.v1';
    var CLE_ONGLET = 'pf.onglet';

    var DEFAUTS = {
        // Connexion (à saisir au premier lancement)
        supabaseUrl: '',
        supabaseKey: '',

        // Identité fiscale
        statutFiscal: 'Marié(e) / Pacsé(e)',
        partsFiscales: 3.0,
        autresRevenusImposables: 0,
        salaireNetImposable1: 0,
        salaireNetImposable2: 0,
        fraisReels1: 0,
        fraisReels2: 0,
        interetsEtrangers: 0,

        // Retraite
        anneeDepartRetraite: 2055,
        apportMensuelEur: 250,
        tauxImpositionPV: 0.314,
        rendementAnnuelCible: 0.06,

        // Inflation
        inflationCible: 0.02,
        inflationReelleEstimee: 0.045,

        // Rééquilibrage
        seuilMinOrdreEur: 250,
        deviseAffichage: 'USD',

        // Ergonomie
        periodeDefaut: 'Depuis le début',
        onboardingFait: false
    };

    var memoire = null;
    var dispo = (function () {
        try {
            var k = '__pf_test__';
            root.localStorage.setItem(k, '1');
            root.localStorage.removeItem(k);
            return true;
        } catch (e) { return false; }
    })();

    var memTampon = {};

    function lire(cle) {
        if (!dispo) return memTampon[cle];
        try { return root.localStorage.getItem(cle); } catch (e) { return memTampon[cle]; }
    }

    function ecrire(cle, val) {
        memTampon[cle] = val;
        if (!dispo) return;
        try { root.localStorage.setItem(cle, val); } catch (e) { /* quota : on garde en mémoire */ }
    }

    function reglages() {
        if (memoire) return memoire;
        var obj = {};
        for (var k in DEFAUTS) if (DEFAUTS.hasOwnProperty(k)) obj[k] = DEFAUTS[k];
        var brut = lire(CLE_REGLAGES);
        if (brut) {
            try {
                var lu = JSON.parse(brut);
                for (var c in lu) if (lu.hasOwnProperty(c) && DEFAUTS.hasOwnProperty(c)) obj[c] = lu[c];
            } catch (e) { /* réglages illisibles : on repart des valeurs par défaut */ }
        }
        memoire = obj;
        return obj;
    }

    function sauverReglages(patch) {
        var r = reglages();
        for (var k in patch) if (patch.hasOwnProperty(k)) r[k] = patch[k];
        ecrire(CLE_REGLAGES, JSON.stringify(r));
        return r;
    }

    function reinitialiserReglages() {
        memoire = null;
        ecrire(CLE_REGLAGES, '{}');
        return reglages();
    }

    function estConfigure() {
        var r = reglages();
        return !!r.supabaseUrl && !!r.supabaseKey;
    }

    // ------------------------------------------------------------ cache local

    function sauverCache(obj) {
        try { ecrire(CLE_CACHE, JSON.stringify(obj || {})); } catch (e) { /* volume trop important */ }
    }

    function lireCache() {
        var brut = lire(CLE_CACHE);
        if (!brut) return null;
        try { return JSON.parse(brut); } catch (e) { return null; }
    }

    function viderCache() { ecrire(CLE_CACHE, '{}'); }

    function ongletCourant(defaut) {
        var v = lire(CLE_ONGLET);
        return v || defaut || 'bord';
    }

    function sauverOnglet(o) { ecrire(CLE_ONGLET, o); }

    PF.store = {
        reglages: reglages,
        sauverReglages: sauverReglages,
        reinitialiserReglages: reinitialiserReglages,
        estConfigure: estConfigure,
        sauverCache: sauverCache,
        lireCache: lireCache,
        viderCache: viderCache,
        ongletCourant: ongletCourant,
        sauverOnglet: sauverOnglet,
        DEFAUTS: DEFAUTS,
        disponible: dispo
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
