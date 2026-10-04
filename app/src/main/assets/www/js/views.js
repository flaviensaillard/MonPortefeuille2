/* Les cinq écrans. Chaque vue renvoie du HTML et branche ses gestes.
   Principe d'ergonomie : un écran = une question. On lit les chiffres d'abord,
   le détail est à un geste, jamais imposé. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util, M = PF.modele, UI = PF.ui;

    var ICONES = {
        or: '🥇', or_physique: '🥇', crypto: '₿', action_etf: '📊',
        obligation_etf: '📜', espece: '💵'
    };

    function icone(classe) { return ICONES[classe] || '◈'; }

    function nomPoche(cle) {
        var p = M.etat.parCle[cle];
        return p ? p.nom : cle;
    }

    function couleurPoche(cle) { return M.couleurDe(cle); }

    // =========================================================== TABLEAU DE BORD

    function vueBord(ctx) {
        if (!ctx || (ctx.erreurs && ctx.erreurs.length && !ctx.actifs.length)) {
            return '<div class="vide"><span class="g">◈</span>' + UI.h(ctx.erreurs.join(' ')) + '</div>';
        }
        var out = '';

        // --- Bloc principal : patrimoine
        var progInv = progression(ctx, 'Progression journalière', 'investi');
        var progTot = progression(ctx, 'Progression journalière', 'total');
        var perfDebut = performanceDepuisDebut(ctx);

        out += '<div class="card gold">'
            + '<div class="lbl">Patrimoine total</div>'
            + UI.montant(ctx.patrimoineTotalUsd, ctx.patrimoineTotalEur)
            + '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
            + UI.fleche(progTot.twr_per)
            + '<span class="dim" style="font-size:12px">depuis le dernier enregistrement</span>'
            + '</div></div>';

        out += '<div class="grille g2">'
            + miniCarte('Portefeuille investi', ctx.totalInvestiUsd, ctx.totalInvestiEur,
                progInv.twr_per === null ? null : UI.fleche(progInv.twr_per))
            + miniCarte('Performance depuis le début', null, null, null, perfDebut)
            + miniCarte('Épargne de précaution', ctx.totalPrecautionUsd, ctx.totalPrecautionEur)
            + miniCarte('Cash disponible', ctx.totalCourantUsd, ctx.totalCourantEur)
            + '</div>';

        // --- Vos actifs depuis le dernier enregistrement
        var investis = ctx.actifs.filter(function (a) { return estInvesti(a); });
        if (investis.length) {
            out += '<div class="titre">Vos actifs <span class="n">depuis le dernier enregistrement</span></div>';
            out += '<div class="hscroll">';
            investis.forEach(function (a) {
                var f = U.fleche(a.variationPct);
                out += '<div class="actif-carte">'
                    + '<div class="tk">' + UI.h(a.ticker) + '</div>'
                    + '<div class="pc">' + UI.h(nomPoche(a.poche)) + '</div>'
                    + '<div class="fl ' + f.classe + '">' + UI.h(f.texte) + '</div>'
                    + '<div class="vl">' + U.usd(a.valeurUsd, { dec: 0 }) + '</div>'
                    + '<div class="ve">' + U.eur(a.valeurEur, { dec: 0 }) + '</div>'
                    + '</div>';
            });
            out += '</div>';
        }

        // --- Allocation par poche
        var diag = PF.rebalance.diagnostiquer(ctx);
        if (diag.ecarts.length) {
            out += '<div class="titre">Allocation par poche <span class="n">'
                + (diag.horsBande.length ? diag.horsBande.length + ' hors bande' : 'équilibré') + '</span></div>';
            out += '<div class="card">';
            diag.ecarts.forEach(function (e) {
                out += lignePoche(e);
            });
            out += '<div class="sep"></div><div style="font-size:12px;color:var(--txt-3)">Assiette de rééquilibrage '
                + '(investi + cash disponible) : <b style="color:var(--txt-2)">'
                + U.usd(diag.assietteUsd, { dec: 0 }) + '</b></div></div>';
        }

        // --- Précaution
        if (ctx.totalPrecautionUsd > 0) {
            out += '<div class="titre">Épargne de précaution</div><div class="card">'
                + '<div class="lbl">Disponible en 5 minutes</div>'
                + UI.montant(ctx.totalPrecautionUsd, ctx.totalPrecautionEur)
                + '<div class="sep"></div>'
                + '<div class="lbl">Budget mensuel sur 6 mois</div>'
                + UI.montant(ctx.totalPrecautionUsd / 6, ctx.totalPrecautionEur / 6, { petit: true })
                + '</div>';
        }

        // --- Rente mensuelle (toujours en bas du tableau de bord)
        out += carteRente(ctx);

        if (ctx.echecsCours && ctx.echecsCours.length) {
            out += '<div class="erreur">Cours indisponibles : ' + UI.h(ctx.echecsCours.join(', '))
                + '. Ces lignes sont exclues des totaux plutôt que remplacées par une valeur inventée.</div>';
        }
        return out;
    }

    function miniCarte(label, usdV, eurV, flecheHtml, pctValeur, legende) {
        var corps;
        if (pctValeur !== undefined && pctValeur !== null) {
            var f = U.fleche(pctValeur);
            corps = '<div class="v ' + f.classe + '">' + U.pctSigne(pctValeur) + '</div>'
                + '<div class="e">' + UI.h(legende || 'perf. TWR') + '</div>';
        } else {
            corps = '<div class="v">' + U.usd(usdV, { dec: 0 }) + '</div>'
                + '<div class="e">' + U.eur(eurV, { dec: 0 }) + '</div>'
                + (flecheHtml ? '<div style="margin-top:5px;font-size:12px">' + flecheHtml + '</div>' : '');
        }
        return '<div class="mini"><div class="l">' + UI.h(label) + '</div>' + corps + '</div>';
    }

    function lignePoche(e) {
        var pct = Math.max(0, Math.min(100, e.poidsReel * 100));
        var ciblePct = e.poidsCible * 100;
        return '<div style="margin-bottom:13px">'
            + '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">'
            + '<span style="font-size:13.5px;font-weight:650;flex:1">' + UI.h(e.pocheNom) + '</span>'
            + '<span style="font-size:12px;color:var(--txt-2);font-variant-numeric:tabular-nums">'
            + U.nombre(pct, 1) + ' % <span class="dim">/ ' + U.nombre(ciblePct, 1) + ' %</span></span> '
            + (e.horsBande ? UI.badge('hors bande', 'warn') : UI.badge('ok', 'ok'))
            + '</div>'
            + '<div class="barre"><i style="width:' + pct.toFixed(2) + '%;background:' + e.couleur + '"></i>'
            + '<u style="left:' + ciblePct.toFixed(2) + '%"></u></div>'
            + '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--txt-3);margin-top:5px">'
            + '<span>' + U.usd(e.valeurUsd, { dec: 0 }) + ' · ' + U.eur(e.valeurEur, { dec: 0 }) + '</span>'
            + '<span>écart ' + U.points(e.ecartPoints / 100) + ' · bande ±' + U.nombre(e.bande * 100, 1) + ' pt</span>'
            + '</div></div>';
    }

    function carteRente(ctx) {
        var r = PF.store.reglages();
        var capital = ctx.totalInvestiUsd;
        var apports = ctx.capitalInvestiUsd || 0;
        var rendement = r.rendementAnnuelCible || 0.06;
        var inflation = r.inflationReelleEstimee || 0.045;
        var rente = PF.metrics.renteMensuelle(capital, apports, rendement, inflation,
            r.tauxImpositionPV, ctx.tauxEurUsd);
        return '<div class="titre">Rente mensuelle</div>'
            + '<div class="card">'
            + '<div class="lbl">Revenu net perpétuel, pouvoir d’achat préservé</div>'
            + UI.montant(rente.rente_nette_usd, rente.rente_nette_eur)
            + '<div class="sep"></div>'
            + '<div class="ligne" style="padding:6px 0"><div class="gr"><div class="st">Rente brute</div></div>'
            + '<div class="dr"><div class="a">' + U.usd(rente.rente_brute_usd, { dec: 0 }) + '</div>'
            + '<div class="b">' + U.eur(rente.rente_brute_eur, { dec: 0 }) + '</div></div></div>'
            + '<div class="ligne" style="padding:6px 0"><div class="gr"><div class="st">Rendement réel retenu</div></div>'
            + '<div class="dr"><div class="a">' + U.pct(rente.rendement_reel) + '</div></div></div>'
            + '<div class="ligne" style="padding:6px 0"><div class="gr"><div class="st">Inflation retenue</div></div>'
            + '<div class="dr"><div class="a">' + U.pct(inflation) + '</div></div></div>'
            + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:8px">On ne consomme que le rendement au-dessus de '
            + 'l’inflation : le capital garde son pouvoir d’achat année après année.</div>'
            + '</div>';
    }

    function estInvesti(a) {
        var p = M.etat.parCle[a.poche];
        return !!p && p.perimetre === 'investi';
    }

    function progression(ctx, periode, perimetre) {
        if (!ctx.serie || !ctx.serie.dates.length) return { twr_per: null, gain_marche_usd: 0 };
        var valLive = perimetre === 'total' ? ctx.patrimoineTotalUsd : ctx.totalInvestiUsd;
        var col = perimetre === 'total' ? 'patrimoine_total_usd' : 'patrimoine_investi_usd';
        var dates = ctx.serie.dates, valeurs = ctx.serie.lignes.map(function (l) {
            return U.num(l.ligne[col], U.num(l.ligne.patrimoine_investi_usd, 0));
        });
        var serie = { dates: dates, valeurs: valeurs, flux: ctx.serie.flux, lignes: ctx.serie.lignes };
        return PF.metrics.progressionPeriode(serie, periode, valLive);
    }

    function performanceDepuisDebut(ctx) {
        if (!ctx.serie || ctx.serie.dates.length < 2) return 0;
        var p = progression(ctx, 'Depuis le début', 'investi');
        return p.twr_per || 0;
    }

    // ============================================================== PORTEFEUILLE

    var ongletPortefeuille = 'positions';

    function vuePortefeuille(ctx) {
        var r = PF.store.reglages();
        var out = '';

        out += '<div class="chips">'
            + chip('positions', 'Positions', ongletPortefeuille === 'positions')
            + chip('operations', 'Opérations', ongletPortefeuille === 'operations')
            + chip('reequilibrage', 'Rééquilibrage', ongletPortefeuille === 'reequilibrage')
            + chip('allocation', 'Allocation', ongletPortefeuille === 'allocation')
            + '</div>';

        out += '<button class="btn" id="btnNouveau" style="margin-bottom:14px">＋ Enregistrer une opération</button>';

        if (ongletPortefeuille === 'positions') out += ongletPositions(ctx);
        else if (ongletPortefeuille === 'operations') out += ongletOperations(ctx);
        else if (ongletPortefeuille === 'reequilibrage') out += ongletReequilibrage(ctx, r);
        else out += ongletAllocation(ctx);

        return out;
    }

    function chip(cle, texte, actif) {
        return '<button class="chip' + (actif ? ' actif' : '') + '" data-chip="' + UI.h(cle) + '">' + UI.h(texte) + '</button>';
    }

    function ongletPositions(ctx) {
        if (!ctx.actifs.length) return '<div class="vide"><span class="g">▤</span>Aucune position.</div>';
        var out = '<div class="titre">Positions détenues</div><div class="card">';
        ctx.actifs.forEach(function (a) {
            var f = U.fleche(a.variationPct);
            out += '<div class="ligne" data-pos="' + UI.h(a.ticker) + '">'
                + '<div class="pastille" style="background:' + couleurPoche(a.poche) + '22">' + icone(a.classe) + '</div>'
                + '<div class="gr"><div class="tt">' + UI.h(a.ticker) + '</div>'
                + '<div class="st">' + UI.h(nomPoche(a.poche)) + ' · ' + U.quantite(a.quantite) + ' × '
                + U.nombre(a.prix, 2) + ' ' + UI.h(a.deviseCotation) + '</div></div>'
                + '<div class="dr"><div class="a">' + U.usd(a.valeurUsd, { dec: 0 }) + '</div>'
                + '<div class="b">' + U.eur(a.valeurEur, { dec: 0 }) + '</div>'
                + '<div style="font-size:12px" class="' + f.classe + '">' + UI.h(f.texte) + '</div></div>'
                + '</div>';
        });
        out += '</div>';

        var pvTotales = ctx.actifs.reduce(function (s, a) { return s + (a.pvLatenteUsd || 0); }, 0);
        out += '<div class="card tight"><div class="lbl">Plus-values latentes</div>'
            + UI.montant(pvTotales, pvTotales / (ctx.tauxEurUsd || 1.125), { petit: true })
            + '</div>';
        return out;
    }

    function ongletOperations(ctx) {
        var out = '';
        var apports = (ctx.apports || []).slice().reverse();
        var txs = (ctx.transactions || []).slice().reverse();

        out += '<div class="titre">Apports &amp; retraits <span class="n">' + apports.length + '</span></div>';
        if (!apports.length) out += '<div class="vide" style="padding:18px">Aucun mouvement.</div>';
        else {
            out += '<div class="card">';
            apports.slice(0, 40).forEach(function (a) {
                var signe = a.type && String(a.type).toLowerCase().indexOf('retrait') >= 0 ? -1 : 1;
                out += '<div class="ligne" data-apport="' + a.id + '">'
                    + '<div class="pastille" style="background:' + (signe > 0 ? 'rgba(46,204,113,.14)' : 'rgba(231,76,60,.14)') + '">'
                    + (signe > 0 ? '↓' : '↑') + '</div>'
                    + '<div class="gr"><div class="tt">' + UI.h(a.type || 'apport') + '</div>'
                    + '<div class="st">' + U.jourMoisAnneeISO(a.date) + '</div></div>'
                    + '<div class="dr"><div class="a ' + (signe > 0 ? 'up' : 'down') + '">'
                    + U.usd(signe * U.num(a.montant_usd, a.montant_eur), { dec: 0, signe: false }) + '</div>'
                    + '<div class="b">' + U.eur(signe * a.montant_eur, { dec: 0 }) + '</div></div>'
                    + '</div>';
            });
            out += '</div>';
        }

        out += '<div class="titre">Achats &amp; ventes <span class="n">' + txs.length + '</span></div>';
        if (!txs.length) out += '<div class="vide" style="padding:18px">Aucune transaction.</div>';
        else {
            out += '<div class="card">';
            txs.slice(0, 60).forEach(function (t) {
                var achat = t.type === 'achat';
                out += '<div class="ligne" data-tx="' + (t.id === null ? '' : t.id) + '">'
                    + '<div class="pastille" style="background:' + (achat ? 'rgba(56,189,248,.14)' : 'rgba(245,196,81,.14)') + '">'
                    + (achat ? '＋' : '－') + '</div>'
                    + '<div class="gr"><div class="tt">' + UI.h(t.ticker) + '</div>'
                    + '<div class="st">' + U.jourMoisAnneeISO(t.date) + ' · ' + U.quantite(t.quantite)
                    + ' × ' + U.nombre(t.cours, 2) + ' ' + UI.h(t.devise) + '</div></div>'
                    + '<div class="dr"><div class="a">' + U.usd(t.montantNet * (achat ? 1 : -1), { dec: 0 }) + '</div>'
                    + '<div class="b">' + UI.h(t.source || '') + '</div></div>'
                    + '</div>';
            });
            out += '</div>';
        }
        return out;
    }

    function ongletReequilibrage(ctx, r) {
        var diag = PF.rebalance.diagnostiquer(ctx);
        var gen = PF.rebalance.genererOrdres(diag.ecarts, r.seuilMinOrdreEur);
        var out = '';

        out += '<div class="card"><div class="lbl">Assiette de rééquilibrage</div>'
            + UI.montant(diag.assietteUsd, diag.assietteEur)
            + '<div style="font-size:12px;color:var(--txt-3);margin-top:7px">Portefeuille investi + cash disponible '
            + '(' + U.usd(ctx.totalCourantUsd, { dec: 0 }) + ' prêts à être investis).</div></div>';

        if (!diag.ecarts.length) return out + '<div class="vide"><span class="g">⚖</span>Aucune position investie.</div>';

        if (!diag.horsBande.length) {
            out += '<div class="ok-vert">Toutes les poches sont dans leur bande de tolérance. Rien à faire.</div>';
        } else {
            out += '<div class="info">' + diag.horsBande.length + ' poche(s) hors bande.</div>';
        }

        out += '<div class="titre">Détail par poche</div><div class="card">';
        diag.ecarts.forEach(function (e) { out += lignePoche(e); });
        out += '</div>';

        if (gen.ordres.length) {
            out += '<div class="titre">Ordres proposés</div><div class="card">';
            gen.ordres.forEach(function (o, i) {
                out += '<div class="ligne" data-ordre="' + i + '">'
                    + '<div class="pastille" style="background:' + (o.sens === 'achat' ? 'rgba(56,189,248,.14)' : 'rgba(245,196,81,.14)') + '">'
                    + (o.sens === 'achat' ? '＋' : '－') + '</div>'
                    + '<div class="gr"><div class="tt">' + UI.h(o.ticker) + ' — ' + UI.h(o.sens) + '</div>'
                    + '<div class="st">' + UI.h(o.motif) + '</div></div>'
                    + '<div class="dr"><div class="a">' + U.usd(o.montantUsd, { dec: 0 }) + '</div>'
                    + '<div class="b">' + U.quantite(o.quantite) + '</div></div></div>';
            });
            out += '</div><button class="btn sec" id="btnExecuter" style="margin-bottom:8px">Enregistrer un ordre</button>';
        }

        if (gen.aSurveiller.length) {
            out += '<div class="titre">À surveiller</div><div class="card">';
            gen.aSurveiller.forEach(function (e) {
                out += '<div class="ligne"><div class="gr"><div class="tt">' + UI.h(e.pocheNom) + '</div>'
                    + '<div class="st">Écart ' + U.points(e.ecartPoints / 100) + ' — sous le seuil de '
                    + U.eur(r.seuilMinOrdreEur, { dec: 0 }) + ', les frais mangeraient la correction.</div></div></div>';
            });
            out += '</div>';
        }
        return out;
    }

    function ongletAllocation(ctx) {
        var verif = M.verifier(M.etat.actifs ? { actifs: M.etat.actifs } : null);
        var out = '';

        if (verif.depasse_100) out += '<div class="erreur">🚨 ' + UI.h(verif.message) + '</div>';
        else if (verif.inferieur_100) out += '<div class="info">⚠️ ' + UI.h(verif.message) + '</div>';
        else out += '<div class="ok-vert">Répartition cible totale : ' + U.nombre(verif.total_pct, 0) + ' %.</div>';

        out += '<div class="titre">Allocation cible par actif</div><div class="card">';
        M.etat.actifs.forEach(function (a) {
            out += '<div class="ligne" data-alloc="' + UI.h(a.ticker) + '">'
                + '<div class="pastille" style="background:' + couleurPoche(a.poche) + '22">' + icone(a.classe) + '</div>'
                + '<div class="gr"><div class="tt">' + UI.h(a.ticker) + '</div>'
                + '<div class="st">' + UI.h(nomPoche(a.poche)) + ' · cible ' + U.nombre(a.cible_pct, 1)
                + ' % · dérive ±' + U.nombre(a.bande_pct, 1).replace(/,0$/, '') + ' pt</div></div>'
                + '<div class="dr"><div class="a">' + U.nombre(a.cible_pct, 1) + ' %</div>'
                + '<div class="b">modifier</div></div></div>';
        });
        out += '</div>';

        out += '<button class="btn sec" id="btnNouvelActif" style="margin-bottom:10px">＋ Ajouter un actif ou une poche</button>';
        out += '<button class="btn ghost" id="btnReinitAlloc">Rétablir l’allocation par défaut</button>';

        var poches = M.pochesInvesties();
        if (poches.length) {
            out += '<div class="titre">Poches</div><div class="card">';
            poches.forEach(function (p) {
                out += '<div class="ligne" data-pochealloc="' + UI.h(p.cle) + '">'
                    + '<div class="gr"><div class="tt">' + UI.h(p.nom) + '</div>'
                    + '<div class="st">' + UI.h(p.membres.join(', ')) + '</div></div>'
                    + '<div class="dr"><div class="a">' + U.pct(p.cible, 1) + '</div>'
                    + '<div class="b">±' + U.nombre(p.bande * 100, 1).replace(/,0$/, '') + ' pt</div></div></div>';
            });
            out += '</div>';
        }
        return out;
    }

    // =============================================================== PERFORMANCE

    var periodeChoisie = null;

    function vuePerformance(ctx) {
        var periodes = PF.metrics.PERIODES;
        var periode = periodeChoisie || PF.store.reglages().periodeDefaut || 'Depuis le début';
        var out = '';

        out += '<div class="chips">' + periodes.map(function (p) {
            return '<button class="chip' + (p === periode ? ' actif' : '') + '" data-periode="' + UI.h(p) + '">' + UI.h(p) + '</button>';
        }).join('') + '</div>';

        if (!ctx.serie || ctx.serie.dates.length < 2) {
            return out + '<div class="vide"><span class="g">◢</span>Pas encore assez d’historique de snapshots.</div>';
        }

        var valLive = ctx.totalInvestiUsd;
        var valeurs = ctx.serie.lignes.map(function (l) { return U.num(l.ligne.patrimoine_investi_usd, 0); });
        var serie = { dates: ctx.serie.dates, valeurs: valeurs, flux: ctx.serie.flux, lignes: ctx.serie.lignes };
        var p = PF.metrics.progressionPeriode(serie, periode, valLive);

        if (p.vide) return out + '<div class="vide"><span class="g">◢</span>Pas de données sur cette période.</div>';

        out += '<div class="card">'
            + '<div class="lbl">' + UI.h(p.periode) + ' · ' + U.jourMoisAnneeISO(p.d0) + ' → ' + U.jourMoisAnneeISO(p.d1) + '</div>'
            + UI.montant(p.v_fin_usd, p.v_fin_usd / (ctx.tauxEurUsd || 1.125))
            + '<div style="display:flex;align-items:center;gap:9px;margin-top:7px;flex-wrap:wrap">'
            + UI.fleche(p.twr_per)
            + '<span class="dim" style="font-size:12px">performance de la période</span></div>'
            + '</div>';

        out += '<div class="card">' + UI.graphique(valeursPeriode(ctx, periode), { couleurSelonSens: true }) + '</div>';

        out += '<div class="grille g2">'
            + miniCarte('Gain de marché', p.gain_marche_usd, p.gain_marche_usd / (ctx.tauxEurUsd || 1.125))
            + miniCarte('Apports de la période', p.apports_periode_usd, p.apports_periode_usd / (ctx.tauxEurUsd || 1.125))
            + miniCarte('Valeur de départ', p.v_debut_usd, p.v_debut_usd / (ctx.tauxEurUsd || 1.125))
            + miniCarte('Volatilité annualisée', null, null, null,
                PF.metrics.volatilite(PF.metrics.rendementsPeriode(valeurs, ctx.serie.flux)), 'écart-type')
            + '</div>';

        // Performance par année
        var rends = PF.metrics.rendementsPeriode(valeurs, ctx.serie.flux);
        var parAn = PF.metrics.twrParAnnee(ctx.serie.dates, rends);
        var annees = Object.keys(parAn).sort();
        if (annees.length) {
            out += '<div class="titre">Performance par année</div><div class="card"><table class="tableau">'
                + '<tr><th>Année</th><th>TWR</th></tr>';
            annees.forEach(function (a) {
                var f = U.fleche(parAn[a]);
                out += '<tr><td>' + UI.h(a) + '</td><td class="' + f.classe + '">' + U.pctSigne(parAn[a]) + '</td></tr>';
            });
            out += '</table></div>';
        }

        // Or et inflation
        if (ctx.equivalentOrOz) {
            out += '<div class="titre">Étalon or</div><div class="card">'
                + '<div class="ligne"><div class="gr"><div class="tt">Portefeuille en onces d’or</div>'
                + '<div class="st">Cours : ' + U.usd(ctx.coursOr, { dec: 0 }) + ' l’once</div></div>'
                + '<div class="dr"><div class="a">' + U.nombre(ctx.equivalentOrOz, 3) + ' oz</div></div></div></div>';
        }
        return out;
    }

    function valeursPeriode(ctx, periode) {
        var dates = ctx.serie.dates, valeurs = ctx.serie.lignes.map(function (l) {
            return U.num(l.ligne.patrimoine_investi_usd, 0);
        });
        var p = PF.metrics.progressionPeriode({ dates: dates, valeurs: valeurs, flux: ctx.serie.flux, lignes: ctx.serie.lignes },
            periode, ctx.totalInvestiUsd);
        var idx = p.idxGraphe || [];
        var v = idx.map(function (i) { return valeurs[i]; });
        if (ctx.totalInvestiUsd > 0 && v.length) v[v.length - 1] = ctx.totalInvestiUsd;
        return v;
    }

    // ================================================================== RETRAITE

    function vueRetraite(ctx) {
        var r = PF.store.reglages();
        var anneeDepart = U.num(r.anneeDepartRetraite, 2055);
        var annees = Math.max(1, anneeDepart - new Date().getFullYear());
        var apportMensuelUsd = U.num(r.apportMensuelEur, 250) * (ctx.tauxEurUsd || 1.125);
        var rendement = U.num(r.rendementAnnuelCible, 0.06);
        var inflation = U.num(r.inflationReelleEstimee, 0.045);

        var capital = ctx.totalInvestiUsd;
        var proj = PF.metrics.projectionRetraite(capital, apportMensuelUsd, annees, rendement, inflation);
        var dernier = proj[proj.length - 1];
        var rente = PF.metrics.renteMensuelle(dernier.capital_usd, dernier.apports_cumules_usd,
            rendement, inflation, r.tauxImpositionPV, ctx.tauxEurUsd);

        var out = '';
        out += '<div class="card gold">'
            + '<div class="lbl">Capital projeté en ' + anneeDepart + '</div>'
            + UI.montant(dernier.capital_usd, dernier.capital_usd / (ctx.tauxEurUsd || 1.125))
            + '<div style="font-size:12px;color:var(--txt-3);margin-top:7px">'
            + 'soit ' + U.usd(dernier.pouvoir_achat_usd, { dec: 0 }) + ' en pouvoir d’achat d’aujourd’hui</div>'
            + '</div>';

        out += '<div class="card">' + UI.graphique(proj.map(function (p) { return p.capital_usd; })) + '</div>';

        out += '<div class="grille g2">'
            + miniCarte('Rente mensuelle nette', rente.rente_nette_usd, rente.rente_nette_eur)
            + miniCarte('Rente brute', rente.rente_brute_usd, rente.rente_brute_eur)
            + miniCarte('Apports cumulés', dernier.apports_cumules_usd, dernier.apports_cumules_usd / (ctx.tauxEurUsd || 1.125))
            + miniCarte('Part de plus-value', null, null, null, rente.part_pv, 'part du capital')
            + '</div>';

        out += '<div class="titre">Hypothèses</div><div class="card">';
        out += '<div class="ligne" data-reglage="anneeDepartRetraite"><div class="gr"><div class="tt">Départ à la retraite</div>'
            + '<div class="st">Année</div></div><div class="dr"><div class="a">' + anneeDepart + '</div>'
            + '<div class="b">modifier</div></div></div>';
        out += '<div class="ligne" data-reglage="apportMensuelEur"><div class="gr"><div class="tt">Apport mensuel</div>'
            + '<div class="st">Versement programmé</div></div><div class="dr"><div class="a">'
            + U.eur(U.num(r.apportMensuelEur, 0), { dec: 0 }) + '</div><div class="b">modifier</div></div></div>';
        out += '<div class="ligne" data-reglage="rendementAnnuelCible"><div class="gr"><div class="tt">Rendement annuel</div>'
            + '<div class="st">Hypothèse de marché</div></div><div class="dr"><div class="a">' + U.pct(rendement, 1)
            + '</div><div class="b">modifier</div></div></div>';
        out += '<div class="ligne" data-reglage="inflationReelleEstimee"><div class="gr"><div class="tt">Inflation retenue</div>'
            + '<div class="st">Érosion du pouvoir d’achat</div></div><div class="dr"><div class="a">' + U.pct(inflation, 1)
            + '</div><div class="b">modifier</div></div></div>';
        out += '<div class="ligne" data-reglage="tauxImpositionPV"><div class="gr"><div class="tt">Fiscalité des plus-values</div>'
            + '<div class="st">PFU</div></div><div class="dr"><div class="a">' + U.pct(U.num(r.tauxImpositionPV, 0.314), 1)
            + '</div><div class="b">modifier</div></div></div>';
        out += '</div>';

        out += '<div style="font-size:11.5px;color:var(--txt-3);padding:6px 4px">La rente ne consomme que le rendement '
            + 'réel au-dessus de l’inflation : le capital reste intact en pouvoir d’achat.</div>';
        return out;
    }

    // ================================================================ FISCALITÉ

    function vueFiscalite(ctx) {
        if (!PF.fiscal || !PF.fiscal.vue) {
            return '<div class="vide"><span class="g">§</span>Module fiscal en préparation.</div>';
        }
        return PF.fiscal.vue(ctx);
    }

    PF.vues = {
        bord: vueBord,
        portefeuille: vuePortefeuille,
        performance: vuePerformance,
        retraite: vueRetraite,
        fiscalite: vueFiscalite,
        definirOngletPortefeuille: function (o) { ongletPortefeuille = o; },
        ongletPortefeuille: function () { return ongletPortefeuille; },
        definirPeriode: function (p) { periodeChoisie = p; },
        periodeChoisie: function () { return periodeChoisie; },
        carteRente: carteRente,
        lignePoche: lignePoche,
        miniCarte: miniCarte,
        nomPoche: nomPoche,
        icone: icone
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
