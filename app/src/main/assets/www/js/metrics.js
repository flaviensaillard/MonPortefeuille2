/* Mesures de performance. Portage de core/metrics.py et de la série de
   performance de core/session.py.
   Convention du porteur : tout est compté en DOLLARS ($), l'euro n'est qu'une
   indication affichée en bleu en dessous. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util;

    /* r_i = (V_i − V_{i−1} − F_i) / V_{i−1} */
    function rendementsPeriode(valeurs, flux) {
        var n = (valeurs || []).length;
        if (n < 2) return [];
        flux = flux || new Array(n).fill(0);
        if (flux.length !== n) throw new Error('valeurs et flux doivent avoir la même longueur');
        var out = [];
        for (var i = 1; i < n; i++) {
            var vPrec = valeurs[i - 1];
            if (!(vPrec > 0)) { out.push(0); continue; }
            out.push((valeurs[i] - vPrec - (flux[i] || 0)) / vPrec);
        }
        return out;
    }

    /* Chaque flux est rangé dans la période qui se TERMINE à la date du
       snapshot : on somme tout l'intervalle (dates[i−1], dates[i]]. Sans cela,
       un apport tombé entre deux snapshots disparaissait et gonflait le TWR. */
    function fluxParPeriode(dates, fluxJour, defaut) {
        defaut = defaut || 0;
        var n = (dates || []).length;
        var out = new Array(n).fill(defaut);
        if (!n) return out;
        var entrees = [];
        for (var d in (fluxJour || {})) {
            if (fluxJour.hasOwnProperty(d)) {
                var m = U.num(fluxJour[d], 0);
                if (m !== 0) entrees.push([d, m]);
            }
        }
        if (!entrees.length) return out;
        entrees.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });

        out[0] = U.num(fluxJour[dates[0]], defaut);
        var k = 0;
        for (var i = 1; i < n; i++) {
            var deb = dates[i - 1], fin = dates[i];
            while (k < entrees.length && !(entrees[k][0] > deb)) k++;
            var total = 0, j = k;
            while (j < entrees.length && !(entrees[j][0] > fin)) { total += entrees[j][1]; j++; }
            out[i] = total;
            k = j;
        }
        return out;
    }

    function twr(rendements) {
        if (!rendements || !rendements.length) return 0;
        var p = 1;
        for (var i = 0; i < rendements.length; i++) p *= (1 + rendements[i]);
        return p - 1;
    }

    function twrDepuis(valeurs, flux) { return twr(rendementsPeriode(valeurs, flux)); }

    function annualiser(twrTotal, jours) {
        if (jours <= 0) return 0;
        var annees = jours / 365.25;
        if (annees <= 0) return 0;
        return Math.pow(1 + twrTotal, 1 / annees) - 1;
    }

    function rendementReel(nominal, inflation) {
        return (1 + nominal) / (1 + inflation) - 1;
    }

    function pouvoirAchat(montantFutur, inflation, annees) {
        if (annees < 0) throw new Error('Le nombre d’années ne peut pas être négatif');
        return montantFutur / Math.pow(1 + inflation, annees);
    }

    function rendementEnOr(valeurDebut, valeurFin, orDebut, orFin) {
        if (!(orDebut > 0) || !(orFin > 0)) throw new Error('Cours de l’or invalide');
        if (valeurDebut < 0) throw new Error('La valeur de départ ne peut pas être négative');
        var oncesDebut = valeurDebut / orDebut;
        var oncesFin = valeurFin / orFin;
        if (!(oncesDebut > 0)) return 0;
        return oncesFin / oncesDebut - 1;
    }

    function volatilite(rendements, periodicite) {
        periodicite = periodicite || 252;
        var r = (rendements || []).filter(function (x) { return isFinite(x); });
        if (r.length < 2) return 0;
        var m = r.reduce(function (a, b) { return a + b; }, 0) / r.length;
        var v = r.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (r.length - 1);
        return Math.sqrt(v) * Math.sqrt(periodicite);
    }

    /* Facteur d'inflation cumulé, pondéré par le TEMPS passé dans chaque année.
       Une année absente est sautée, jamais remplacée par 0 %. */
    function inflationCumulee(inflation, d0, d1) {
        if (!d0 || !d1) return 1;
        if (d1 <= d0) return 1;
        var annees = {};
        [d0.slice(0, 4), d1.slice(0, 4)].forEach(function (a) { annees[a] = 1; });
        for (var k in (inflation || {})) if (inflation.hasOwnProperty(k)) annees[k] = 1;
        var facteur = 1;
        Object.keys(annees).map(Number).sort(function (a, b) { return a - b; }).forEach(function (annee) {
            if (!(annee in (inflation || {}))) return;
            var debut = d0 > annee + '-01-01' ? d0 : annee + '-01-01';
            var fin = d1 < (annee + 1) + '-01-01' ? d1 : (annee + 1) + '-01-01';
            var jours = U.diffJours(debut, fin);
            if (jours <= 0) return;
            facteur *= Math.pow(1 + inflation[annee], jours / 365.25);
        });
        return facteur;
    }

    /* Rendement de chaque sous-période exprimé en ONCES D'OR. Une mesure en or
       exige un prix réel du métal à chaque date : s'il manque, on ne mesure
       pas, plutôt que d'afficher un chiffre inventé. */
    function rendementsEnOr(valeurs, flux, onces) {
        var n = (valeurs || []).length;
        if ((onces || []).length !== n) throw new Error('valeurs et onces doivent avoir la même longueur');
        if (n < 2) return [];
        flux = flux || new Array(n).fill(0);
        for (var k = 0; k < n; k++) {
            if (!onces[k] || onces[k] <= 0) throw new Error('équivalent-or manquant ou nul');
        }
        var out = [];
        for (var i = 1; i < n; i++) {
            if (!(valeurs[i] > 0) || !(valeurs[i - 1] > 0)) { out.push(0); continue; }
            var r = (valeurs[i] - valeurs[i - 1] - (flux[i] || 0)) / valeurs[i - 1];
            // « 1 + r » : sans lui, un or stable donnerait un rendement nul.
            var unPlusROr = (1 + r) * (valeurs[i - 1] / valeurs[i]) * (onces[i] / onces[i - 1]);
            out.push(unPlusROr - 1);
        }
        return out;
    }

    function twrEnOr(valeurs, flux, onces) { return twr(rendementsEnOr(valeurs, flux, onces)); }

    /* TRI annualisé : le rendement qui tient compte de VOTRE calendrier
       d'apports, là où le TWR ne mesure que la stratégie. L'écart entre les
       deux dit si vous avez bien alimenté le portefeuille. */
    function irr(flux) {
        if (!flux || flux.length < 2) return null;
        var f = flux.slice().sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
        var t0 = f[0][0];

        function van(taux) {
            var total = 0;
            for (var i = 0; i < f.length; i++) {
                var annees = U.diffJours(t0, f[i][0]) / 365.25;
                total += f[i][1] / Math.pow(1 + taux, annees);
            }
            return total;
        }

        var bas = -0.95, haut = 10;
        var fBas = van(bas), fHaut = van(haut);
        if (!isFinite(fBas) || !isFinite(fHaut) || fBas * fHaut > 0) return null;
        for (var it = 0; it < 200; it++) {
            var milieu = (bas + haut) / 2;
            var fMilieu = van(milieu);
            if (!isFinite(fMilieu)) return null;
            if (Math.abs(fMilieu) < 1e-9) return milieu;
            if (fBas * fMilieu <= 0) { haut = milieu; fHaut = fMilieu; }
            else { bas = milieu; fBas = fMilieu; }
        }
        return (bas + haut) / 2;
    }

    function twrParAnnee(dates, rendements) {
        var out = {};
        for (var i = 0; i < (rendements || []).length; i++) {
            if (i + 1 >= dates.length) break;
            var an = String(dates[i + 1]).slice(0, 4);
            out[an] = (out[an] === undefined ? 1 : out[an]) * (1 + rendements[i]);
        }
        for (var k in out) if (out.hasOwnProperty(k)) out[k] = out[k] - 1;
        return out;
    }

    /* Série (dates, valeurs, flux) servant à tous les calculs de performance.
       Source : les snapshots, en dollars dès que la colonne existe. */
    function seriePerformance(snapshots, apports) {
        var snaps = (snapshots || []).slice();
        if (!snaps.length) return { dates: [], valeurs: [], flux: [], useUsd: false, lignes: [] };

        var nbUsd = snaps.filter(function (s) { return U.num(s.patrimoine_investi_usd, 0) > 0; }).length;
        var useUsd = nbUsd >= 2;
        var colVal = useUsd ? 'patrimoine_investi_usd' : 'patrimoine_investi_eur';
        if (snaps.every(function (s) { return s[colVal] === undefined; })) {
            colVal = 'patrimoine_investi_eur';
        }

        var lignes = snaps.map(function (s) {
            var d = U.parseDate(s.Date || s.date);
            return { ligne: s, date: d, valeur: U.num(s[colVal], 0) };
        }).filter(function (l) { return l.date && l.valeur > 0; })
            .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

        if (lignes.length < 2) {
            return {
                dates: lignes.map(function (l) { return l.date; }),
                valeurs: lignes.map(function (l) { return l.valeur; }),
                flux: lignes.map(function () { return 0; }),
                useUsd: useUsd, lignes: lignes
            };
        }

        var dates = lignes.map(function (l) { return l.date; });
        var valeurs = lignes.map(function (l) { return l.valeur; });

        // Flux d'apports, en dollars si possible.
        var colAp = useUsd ? 'montant_usd' : 'montant_eur';
        var fluxJour = {};
        (apports || []).forEach(function (a) {
            var d = U.parseDate(a.date || a.Date);
            if (!d) return;
            var m = U.num(a[colAp], useUsd ? null : U.num(a.montant_eur, 0));
            if (m === null || m === undefined || !isFinite(m)) m = U.num(a.montant_eur, 0);
            fluxJour[d] = (fluxJour[d] || 0) + m;
        });
        var fluxAp = fluxParPeriode(dates, fluxJour, 0);

        var flux;
        if (useUsd && lignes[0].ligne.capital_investi_usd !== undefined) {
            // Un capital investi à 0 est une valeur manquante (NULL en base) :
            // on propage le dernier connu augmenté des apports de la période.
            var cap = lignes.map(function (l) { var c = U.num(l.ligne.capital_investi_usd, 0); return c > 0 ? c : null; });
            flux = [0];
            var reconstruit = [cap[0]];
            for (var i = 1; i < lignes.length; i++) {
                var prev = reconstruit[reconstruit.length - 1];
                if (cap[i] !== null && prev !== null && prev !== undefined) {
                    flux.push(cap[i] - prev);
                    reconstruit.push(cap[i]);
                } else {
                    var f = fluxAp[i] || 0;
                    flux.push(f);
                    reconstruit.push(prev !== null && prev !== undefined ? U.arrondi(prev + f, 2) : null);
                }
            }
            lignes.forEach(function (l, idx) { l.ligne.capital_investi_usd = reconstruit[idx]; });
        } else {
            flux = fluxAp;
        }

        return { dates: dates, valeurs: valeurs, flux: flux, useUsd: useUsd, lignes: lignes, colVal: colVal };
    }

    /* Progression sur une période : graphique + indicateurs. */
    var PERIODES = ['Progression journalière', 'Progression mensuelle', 'Depuis le début du mois',
        'Depuis le début de l’année', 'Depuis 1 an', 'Depuis le début', 'Période choisie'];

    function progressionPeriode(serie, periode, valeurLiveUsd, options) {
        options = options || {};
        var dates = serie.dates, valeurs = serie.valeurs.slice(), flux = serie.flux.slice();
        if (dates.length < 1) return { vide: true };

        // Le dernier point porte la valorisation en direct du jour.
        if (valeurLiveUsd > 0) valeurs[valeurs.length - 1] = U.arrondi(valeurLiveUsd, 2);

        var idxGraphe = [], idxCalc = [];
        var n = dates.length;
        var i;
        var dMax = dates[n - 1], dMin = dates[0];

        if (periode === 'Progression journalière') {
            /* La courbe couvre les trente derniers jours, TOUS les
               enregistrements inclus : c'est la lecture au jour le jour.
               Le chiffre, lui, reste celui du dernier enregistrement. */
            var seuil = U.ajouterJours(dMax, -30);
            var deb30 = -1;
            for (i = 0; i < n; i++) { if (dates[i] <= seuil) deb30 = i; else break; }
            if (deb30 >= 0) idxGraphe.push(deb30);
            for (i = deb30 + 1; i < n; i++) idxGraphe.push(i);
            if (idxGraphe.length < 2) {
                var deb = Math.max(0, n - 30);
                idxGraphe = [];
                for (i = deb; i < n; i++) idxGraphe.push(i);
            }
            idxCalc = [Math.max(0, n - 2), n - 1];
        } else if (periode === 'Progression mensuelle') {
            var parMois = {}, ordre = [];
            for (i = 0; i < n; i++) {
                var cle = dates[i].slice(0, 7);
                if (!parMois[cle]) { parMois[cle] = { idx: i, flux: 0 }; ordre.push(cle); }
                else parMois[cle].idx = i;
                parMois[cle].flux += (flux[i] || 0);
            }
            ordre.forEach(function (c) { idxGraphe.push(parMois[c].idx); });
            idxCalc = idxGraphe.slice(-2);
            idxCalc = idxCalc.length === 2 ? idxCalc : [idxGraphe[0], idxGraphe[idxGraphe.length - 1]];
            var fluxMois = {};
            ordre.forEach(function (c) { fluxMois[parMois[c].idx] = parMois[c].flux; });
            flux = dates.map(function (_, j) { return fluxMois[j] !== undefined ? fluxMois[j] : 0; });
        } else if (periode === 'Depuis le début du mois' || periode === 'Depuis le début de l’année' || periode === 'Depuis 1 an') {
            var limite;
            if (periode === 'Depuis le début du mois') limite = dMax.slice(0, 7) + '-01';
            else if (periode === 'Depuis le début de l’année') limite = dMax.slice(0, 4) + '-01-01';
            else limite = U.ajouterJours(dMax, -365);
            var avant = -1;
            for (i = 0; i < n; i++) { if (dates[i] <= limite) avant = i; else break; }
            if (avant >= 0) idxGraphe.push(avant);
            for (i = 0; i < n; i++) if (dates[i] > limite) idxGraphe.push(i);
            if (!idxGraphe.length) idxGraphe = dates.map(function (_, j) { return j; });
            idxCalc = idxGraphe.slice();
        } else if (periode === 'Période choisie') {
            var dDeb = options.dateDeb || U.ajouterJours(dMax, -30);
            var dFin = options.dateFin || dMax;
            var av = -1;
            for (i = 0; i < n; i++) { if (dates[i] <= dDeb) av = i; else break; }
            if (av >= 0) idxGraphe.push(av);
            for (i = 0; i < n; i++) if (dates[i] > dDeb && dates[i] <= dFin) idxGraphe.push(i);
            if (!idxGraphe.length) for (i = 0; i < n; i++) if (dates[i] <= dFin) idxGraphe.push(i);
            idxCalc = idxGraphe.slice();
        } else { // Depuis le début
            for (i = 0; i < n; i++) idxGraphe.push(i);
            idxCalc = idxGraphe.slice();
        }

        var res = { vide: false, idxGraphe: idxGraphe, dates: dates, valeurs: valeurs };
        if (idxCalc.length >= 2) {
            var i0 = idxCalc[0], i1 = idxCalc[idxCalc.length - 1];
            var valCalc = [];
            for (i = i0; i <= i1; i++) valCalc.push(valeurs[i]);
            var fluxCalc = [0];
            for (i = i0 + 1; i <= i1; i++) fluxCalc.push(flux[i] || 0);

            var vDebut = valCalc[0], vFin = valCalc[valCalc.length - 1];
            var delta = vFin - vDebut;
            var apportsPeriode = fluxCalc.slice(1).reduce(function (a, b) { return a + b; }, 0);
            var gain = delta - apportsPeriode;
            res.v_debut_usd = vDebut;
            res.v_fin_usd = vFin;
            res.delta_val_usd = delta;
            res.apports_periode_usd = apportsPeriode;
            res.gain_marche_usd = gain;
            res.twr_per = twrDepuis(valCalc, fluxCalc);
            res.pct_brut = vDebut > 0 ? delta / vDebut : 0;
            res.d0 = dates[i0];
            res.d1 = dates[i1];
            res.jours = U.diffJours(dates[i0], dates[i1]);
        } else {
            var dlast = valeurs[n - 1];
            res.v_debut_usd = dlast; res.v_fin_usd = dlast;
            res.delta_val_usd = 0; res.apports_periode_usd = 0;
            res.gain_marche_usd = 0; res.twr_per = 0; res.pct_brut = 0;
            res.d0 = dates[0]; res.d1 = dMax; res.jours = 0;
        }
        res.d_min = dMin; res.d_max = dMax; res.periode = periode;
        return res;
    }

    /* Rente mensuelle perpétuelle en pouvoir d'achat réel : on ne consomme que
       le rendement réel au-dessus de l'inflation, pour que le capital conserve
       son pouvoir d'achat année après année. */
    function renteMensuelle(capitalUsd, apportsCumulesUsd, rendementAnnuel, inflationAnnuelle, tauxImpositionPV, tauxEurUsd) {
        var cap = Math.max(0, U.num(capitalUsd, 0));
        var app = Math.max(0, U.num(apportsCumulesUsd, 0));
        var fx = U.num(tauxEurUsd, 0) > 0 ? U.num(tauxEurUsd, 1) : 1;
        var rReel = (1 + U.num(rendementAnnuel, 0)) / (1 + U.num(inflationAnnuelle, 0)) - 1;
        var pv = Math.max(0, cap - app);
        var partPV = cap > 0 ? pv / cap : 0;
        var renteBrute = cap * Math.max(0, rReel) / 12;
        var impot = renteBrute * partPV * Math.max(0, U.num(tauxImpositionPV, 0));
        var renteNette = renteBrute - impot;
        return {
            capital_usd: cap, capital_eur: cap / fx,
            apports_cumules_usd: app, apports_cumules_eur: app / fx,
            plus_value_usd: pv, plus_value_eur: pv / fx, part_pv: partPV,
            rendement_nominal: U.num(rendementAnnuel, 0), inflation: U.num(inflationAnnuelle, 0),
            rendement_reel: rReel, taux_imposition_pv: U.num(tauxImpositionPV, 0),
            rente_brute_usd: renteBrute, rente_brute_eur: renteBrute / fx,
            impot_usd: impot, impot_eur: impot / fx,
            rente_nette_usd: renteNette, rente_nette_eur: renteNette / fx
        };
    }

    /* Le CAGR du portefeuille, corrigé des apports : c'est la seule mesure de
       rendement qui ne prend pas vos versements pour de la performance. Sert à
       préremplir le scénario « historique » de la projection retraite. */
    function twrAnnualise(serie) {
        if (!serie || !serie.dates || serie.dates.length < 2) return null;
        var rends = rendementsPeriode(serie.valeurs, serie.flux);
        if (!rends.length) return null;
        var total = twr(rends);
        var jours = U.diffJours(serie.dates[0], serie.dates[serie.dates.length - 1]);
        if (jours <= 30) return null;
        var a = annualiser(total, jours);
        if (a === null || !isFinite(a)) return null;
        if (a > 1 || a < -0.9) return null;   // historique trop court pour être annualisé
        return a;
    }

    /* Projection d'un scénario, mois par mois.
       Deux règles héritées des corrections de la v2 :
       1. les apports croissent à l'inflation DE CE scénario — sinon les
          scénarios partagent l'hypothèse même qu'ils sont censés comparer ;
       2. la capitalisation est mensuelle, pas annuelle : sur trente ans
          l'écart se chiffre en dizaines de milliers d'euros. */
    function projectionScenario(opts) {
        opts = opts || {};
        var capital = U.num(opts.capitalInitialUsd, 0);
        var apport = U.num(opts.apportMensuelUsd, 0);
        var annee0 = Number(String(opts.dateDepart || U.todayISO()).slice(0, 4)) || new Date().getFullYear();
        var anneeFin = U.num(opts.anneeDepart, annee0 + 20);
        var rendement = U.num(opts.rendementAnnuel, 0);
        var inflation = U.num(opts.inflationAnnuelle, 0);
        var rM = Math.pow(1 + rendement, 1 / 12) - 1;
        var apportsCumules = U.num(opts.apportsCumulesUsd, capital);
        var moisRestants = Math.max(1, 13 - new Date().getMonth());
        var moisCumules = 0;
        var lignes = [];

        for (var annee = annee0; annee <= anneeFin; annee++) {
            var mois = annee === annee0 ? moisRestants : 12;
            for (var m = 0; m < mois; m++) {
                capital += apport;
                apportsCumules += apport;
                capital *= (1 + rM);
            }
            moisCumules += mois;
            lignes.push({
                annee: annee,
                capital_nominal: capital,
                apports_cumules: apportsCumules,
                pouvoir_achat: pouvoirAchat(capital, inflation, moisCumules / 12),
                mois: moisCumules
            });
            apport *= (1 + inflation);
        }
        return lignes;
    }

    /* Sensibilité au taux de change : le portefeuille est en dollars, la dépense
       sera en euros. Une erreur d'hypothèse de 15 % coûte plus que la plupart
       des écarts de rendement entre scénarios. */
    function sensibiliteChange(capitalNominalUsd, capitalReelUsd, tauxEurUsd) {
        var taux = U.num(tauxEurUsd, 0) > 0 ? U.num(tauxEurUsd, 1) : 1.125;
        var base = capitalReelUsd / taux;
        return [-0.30, -0.15, 0, 0.15, 0.30].map(function (v) {
            var t = taux * (1 + v);
            var reelEur = capitalReelUsd / t;
            return {
                variation: v, taux: t,
                capital_nominal_eur: capitalNominalUsd / t,
                pouvoir_achat_eur: reelEur,
                impact: base > 0 ? (reelEur / base - 1) : 0
            };
        });
    }

    /* Projection : capital projeté avec apports mensuels, et pouvoir d'achat. */
    function projectionRetraite(capitalUsd, apportMensuelUsd, annees, rendementAnnuel, inflationAnnuelle) {
        var pts = [];
        var capital = U.num(capitalUsd, 0);
        var annee0 = new Date().getFullYear();
        for (var a = 0; a <= annees; a++) {
            pts.push({
                annee: annee0 + a,
                capital_usd: capital,
                pouvoir_achat_usd: capital / Math.pow(1 + U.num(inflationAnnuelle, 0), a),
                apports_cumules_usd: U.num(capitalUsd, 0) + U.num(apportMensuelUsd, 0) * 12 * a
            });
            capital = capital * (1 + U.num(rendementAnnuel, 0)) + U.num(apportMensuelUsd, 0) * 12;
        }
        return pts;
    }

    PF.metrics = {
        rendementsPeriode: rendementsPeriode,
        fluxParPeriode: fluxParPeriode,
        twr: twr,
        twrDepuis: twrDepuis,
        annualiser: annualiser,
        rendementReel: rendementReel,
        pouvoirAchat: pouvoirAchat,
        rendementEnOr: rendementEnOr,
        volatilite: volatilite,
        inflationCumulee: inflationCumulee,
        twrParAnnee: twrParAnnee,
        seriePerformance: seriePerformance,
        progressionPeriode: progressionPeriode,
        renteMensuelle: renteMensuelle,
        projectionRetraite: projectionRetraite,
        projectionScenario: projectionScenario,
        sensibiliteChange: sensibiliteChange,
        twrAnnualise: twrAnnualise,
        twrEnOr: twrEnOr, rendementsEnOr: rendementsEnOr, irr: irr,
        PERIODES: PERIODES
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
