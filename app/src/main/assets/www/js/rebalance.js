/* Rééquilibrage par poche. Portage de core/rebalance.py.
   L'assiette inclut le cash disponible du compte courant : c'est de l'argent
   prêt à être investi, il entre donc dans le calcul des écarts. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util;
    var M = PF.modele;

    function ecartPoche(cle, etat, assietteEur, assietteUsd) {
        var p = etat.poche;
        var valeurCibleEur = assietteEur * p.cible;
        var valeurCibleUsd = assietteUsd * p.cible;
        var valUsd = etat.valeurUsd || etat.valeurEur;
        var poidsReel;
        if (valUsd > 0 && assietteUsd > 0) poidsReel = valUsd / assietteUsd;
        else if (etat.valeurEur > 0 && assietteEur > 0) poidsReel = etat.valeurEur / assietteEur;
        else poidsReel = 0;

        var e = {
            pocheCle: cle,
            pocheNom: p.nom,
            couleur: p.couleur || M.couleurDe(cle),
            poidsReel: poidsReel,
            poidsCible: p.cible,
            bande: p.bande,
            valeurEur: etat.valeurEur,
            valeurUsd: valUsd,
            valeurCibleEur: valeurCibleEur,
            valeurCibleUsd: valeurCibleUsd,
            actifs: (etat.actifs || []).slice()
        };
        e.ecartPoints = (poidsReel - p.cible) * 100;
        e.horsBande = Math.abs(poidsReel - p.cible) > p.bande;
        e.ecartEur = valeurCibleEur - etat.valeurEur;
        e.ecartUsd = valeurCibleUsd - valUsd;
        e.rang = p.cible > 0 ? Math.abs(e.ecartPoints) / (p.cible * 100) : 0;
        return e;
    }

    function diagnostiquer(ctx) {
        var assietteEur = ctx.totalInvestiEur + ctx.totalCourantEur;
        var assietteUsd = ctx.totalInvestiUsd + ctx.totalCourantUsd;
        var ecarts = [];
        Object.keys(ctx.etats || {}).forEach(function (cle) {
            var etat = ctx.etats[cle];
            if (!etat.poche || etat.poche.perimetre !== 'investi') return;
            ecarts.push(ecartPoche(cle, etat, assietteEur, assietteUsd));
        });
        ecarts.sort(function (a, b) { return b.rang - a.rang; });
        return {
            ecarts: ecarts,
            assietteEur: assietteEur,
            assietteUsd: assietteUsd,
            horsBande: ecarts.filter(function (e) { return e.horsBande; })
        };
    }

    /* Ordres proposés pour les poches hors bande. En dessous du seuil, l'ordre
       coûterait plus en frais qu'il ne corrige de dérive : on le signale. */
    function genererOrdres(ecarts, seuilMinUsd) {
        seuilMinUsd = seuilMinUsd === undefined ? 250 : seuilMinUsd;
        var ordres = [], aSurveiller = [], sansTaux = [];

        (ecarts || []).forEach(function (e) {
            if (!e.horsBande) return;
            var ecart = e.ecartEur;
            var ecartU = e.ecartUsd;
            if (Math.abs(ecart) < seuilMinUsd || !e.actifs.length) { aSurveiller.push(e); return; }

            var sens = ecart > 0 ? 'achat' : 'vente';
            var ciblesA = e.actifs.map(function (a) { return M.cibleActif(a.ticker); });
            var totalCibles = ciblesA.reduce(function (a, b) { return a + b; }, 0);
            var ciblesDistinctes = e.actifs.length > 1 && totalCibles > 0
                && new Set(ciblesA.map(function (c) { return c.toFixed(6); })).size > 1;
            var totalPoche = e.actifs.reduce(function (s, a) { return s + a.valeurEur; }, 0);

            e.actifs.forEach(function (a, i) {
                var part = ciblesDistinctes ? (ciblesA[i] / totalCibles)
                    : (totalPoche > 0 ? a.valeurEur / totalPoche : 1 / e.actifs.length);
                var montant = Math.abs(ecart) * part;
                var montantU = Math.abs(ecartU) * part;
                // Sans cours de change pour cet actif, la quantité n'est pas calculée :
                // l'ordre est signalé au lieu d'être chiffré avec un taux de 1.
                var tauxEur = U.tauxValide(a.dernierTaux);
                if (tauxEur === null) { sansTaux.push({ ticker: a.ticker, montantEur: U.arrondi(montant, 2) }); return; }
                var prixEur = a.prix * tauxEur;
                var quantite = prixEur > 0 ? montant / prixEur : 0;
                ordres.push({
                    ticker: a.ticker,
                    sens: sens,
                    montantEur: U.arrondi(montant, 2),
                    montantUsd: U.arrondi(montantU, 2),
                    quantite: U.arrondi(quantite, 6),
                    poche: e.pocheCle,
                    pocheNom: e.pocheNom,
                    motif: e.pocheNom + ' à ' + U.nombre(e.poidsReel * 100, 1) + ' % vs cible '
                        + U.nombre(e.poidsCible * 100, 1) + ' % (bande ±' + U.nombre(e.bande * 100, 1) + ' pts)'
                });
            });
        });

        return { ordres: ordres, aSurveiller: aSurveiller, sansTaux: sansTaux };
    }

    PF.rebalance = {
        diagnostiquer: diagnostiquer,
        genererOrdres: genererOrdres,
        ecartPoche: ecartPoche
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
