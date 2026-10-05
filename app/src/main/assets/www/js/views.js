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
        var progDebut = progression(ctx, 'Depuis le début', 'investi');
        var perfDebut = progDebut.twr_per || 0;

        var fx0 = ctx.tauxEurUsd > 0 ? ctx.tauxEurUsd : 1;
        var gainJourUsd = U.num(progTot.gain_marche_usd, 0);
        var gainJourInvUsd = U.num(progInv.gain_marche_usd, 0);
        var gainDebutUsd = U.num(progDebut.gain_marche_usd, 0);

        out += '<div class="card gold">'
            + '<div class="lbl">Patrimoine total</div>'
            + UI.montant(ctx.patrimoineTotalUsd, ctx.patrimoineTotalEur)
            + '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
            + UI.fleche(progTot.twr_per)
            + '<span class="dim" style="font-size:12px">depuis le dernier enregistrement</span>'
            + (progTot.twr_per === null ? '' : '<span style="font-size:12.5px;font-weight:650">'
                + U.usd(gainJourUsd, { dec: 0, signe: true }) + '</span>')
            + '</div></div>';

        out += '<div class="grille g2">'
            + miniCarte('Portefeuille investi', ctx.totalInvestiUsd, ctx.totalInvestiEur,
                progInv.twr_per === null ? null : UI.fleche(progInv.twr_per), null, null,
                progInv.twr_per === null ? null : {
                    usd: gainJourInvUsd, eur: gainJourInvUsd / fx0, legende: 'depuis hier'
                })
            + miniCarte('Performance depuis le début', null, null, null, perfDebut,
                'TWR, apports neutralisés', {
                    usd: gainDebutUsd, eur: gainDebutUsd / fx0, legende: 'gain de marché depuis le début'
                })
            + miniCarte('Épargne de précaution', ctx.totalPrecautionUsd, ctx.totalPrecautionEur)
            + miniCarte('Cash disponible', ctx.totalCourantUsd, ctx.totalCourantEur)
            + '</div>';
        out += '<div class="astuce">Touchez une tuile : le pourcentage se lit en dollars, '
            + 'l’euro en dessous. Touchez à nouveau pour revenir au pourcentage.</div>';

        // --- Vos actifs depuis le dernier enregistrement
        var investis = ctx.actifs.filter(function (a) { return estInvesti(a); });
        if (investis.length) {
            out += '<div class="titre">Vos actifs <span class="n">depuis le dernier enregistrement</span></div>';
            out += '<div class="hscroll">';
            investis.forEach(function (a) {
                var f = U.fleche(a.variationPct);
                var h = perfHistorique(a, fx0);
                out += '<div class="actif-carte" data-alt="'
                    + ((a.variationPct || h) ? '1' : '') + '">'
                    + '<div class="tk">' + UI.h(a.ticker) + '</div>'
                    + '<div class="pc">' + UI.h(nomPoche(a.poche)) + '</div>'
                    + '<div class="pct">'
                    + '<div class="fl ' + f.classe + '">' + UI.h(f.texte) + '</div>'
                    + '<div class="vl">' + U.usd(a.valeurUsd, { dec: 0 }) + '</div>'
                    + '<div class="ve">' + U.eur(a.valeurEur, { dec: 0 }) + '</div>'
                    + (h ? '<div class="sec"><span class="sec-l">depuis l’achat</span>'
                        + '<span class="sec-v ' + (h.pct >= 0 ? 'up' : 'down') + '">'
                        + U.pctSigne(h.pct, 2) + '</span></div>' : '')
                    + '</div>'
                    + gainPosition(a, fx0, h)
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

        // --- Précaution : le total est déjà dans les cartes du haut, on ne
        //     l'affiche pas deux fois. Ici, la seule information utile : de
        //     combien de mois de budget cette réserve vous couvre.
        if (ctx.totalPrecautionUsd > 0) {
            out += '<div class="titre">Épargne de précaution <span class="n">6 mois de budget</span></div>'
                + '<div class="card">'
                + '<div class="lbl">Budget mensuel couvert pendant 6 mois</div>'
                + UI.montant(ctx.totalPrecautionUsd / 6, ctx.totalPrecautionEur / 6)
                + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:7px">Disponible en '
                + 'cinq minutes, hors portefeuille investi : cette réserve n’entre pas dans '
                + 'l’allocation cible.</div></div>';
        }

        // --- Rente mensuelle (toujours en bas du tableau de bord)
        out += carteRente(ctx);

        if (ctx.echecsCours && ctx.echecsCours.length) {
            out += '<div class="erreur">Cours indisponibles : ' + UI.h(ctx.echecsCours.join(', '))
                + '. Ces lignes sont exclues des totaux plutôt que remplacées par une valeur inventée.</div>';
        }
        return out;
    }

    /* Une tuile qui affiche un pourcentage garde, sous le doigt, le montant
       correspondant : un pourcentage seul ne dit pas de combien d'argent il
       s'agit. Le bloc alternatif est dans le DOM, le geste ne fait que
       basculer l'affichage — d'où l'absence de recalcul au toucher. */
    function blocAlt(alt) {
        if (!alt) return '';
        return '<div class="alt">'
            + '<div class="v">' + U.usd(alt.usd, { dec: 0, signe: true }) + '</div>'
            + '<div class="e">' + U.eur(alt.eur, { dec: 0, signe: true }) + '</div>'
            + (alt.legende ? '<div class="e dim">' + UI.h(alt.legende) + '</div>' : '')
            + '</div>';
    }

    function miniCarte(label, usdV, eurV, flecheHtml, pctValeur, legende, alt) {
        var corps;
        if (pctValeur !== undefined && pctValeur !== null) {
            var f = U.fleche(pctValeur);
            corps = '<div class="v ' + f.classe + '">' + U.pctSigne(pctValeur) + '</div>'
                + '<div class="e">' + UI.h(legende || 'TWR, apports neutralisés') + '</div>';
        } else {
            corps = '<div class="v">' + U.usd(usdV, { dec: 0 }) + '</div>'
                + '<div class="e">' + U.eur(eurV, { dec: 0 }) + '</div>'
                + (flecheHtml ? '<div style="margin-top:5px;font-size:12px">' + flecheHtml + '</div>' : '');
        }
        return '<div class="mini"' + (alt ? ' data-alt="1"' : '') + '>'
            + '<div class="l">' + UI.h(label) + '</div>'
            + '<div class="pct">' + corps + '</div>'
            + blocAlt(alt) + '</div>';
    }

    /* Le gain en euros d'une position depuis le dernier enregistrement :
       la valeur d'hier se déduit de la variation du cours. */
    function perfHistorique(a, fx) {
        if (!a || a.classe === 'espece') return null;
        var cout = U.num(a.coutTotalUsd, 0);
        if (cout <= 0) return null;
        var pct = (U.num(a.valeurUsd, 0) / cout) - 1;
        if (!isFinite(pct) || Math.abs(pct) < 0.00005) return null;
        var pv = U.num(a.pvLatenteUsd, U.num(a.valeurUsd, 0) - cout);
        return { pct: pct, usd: pv, eur: pv / (fx || 1) };
    }

    function gainPosition(a, fx, histo) {
        var r = U.num(a.variationPct, 0);
        var h = histo || null;
        if (!r && !h) return '';
        var out = '<div class="alt">';
        if (r) {
            var hier = a.valeurUsd / (1 + r);
            var gain = a.valeurUsd - hier;
            out += '<div class="v">' + U.usd(gain, { dec: 0, signe: true }) + '</div>'
                + '<div class="e">' + U.eur(gain / (fx || 1), { dec: 0, signe: true }) + '</div>'
                + '<div class="e dim">depuis le dernier enregistrement</div>';
        }
        if (h) {
            out += '<div class="sec alt-sec">'
                + '<div class="v2 ' + (h.usd >= 0 ? 'up' : 'down') + '">'
                + U.usd(h.usd, { dec: 1, signe: true }) + '</div>'
                + '<div class="e2">' + U.eur(h.eur, { dec: 1, signe: true }) + '</div>'
                + '<div class="e dim">depuis l’achat</div>'
                + '</div>';
        }
        return out + '</div>';
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

    /* La rente du tableau de bord est calculée par le même moteur que l'écran
       Retraite — mêmes hypothèses, mêmes chiffres. Avant, elle utilisait un
       rendement et une inflation de réglage : deux chiffres différents pour la
       même question selon l'écran où l'on se trouvait. */
    /* La rente du tableau de bord est calculée par le même moteur que l'écran
       Retraite — mêmes hypothèses, mêmes chiffres. Avant, elle utilisait un
       rendement et une inflation de réglage : deux chiffres différents pour la
       même question selon l'écran où l'on se trouvait. */
    function carteRente(ctx) {
        var base = scenariosRetraite(ctx);
        var a = base.scenarios[0];
        var cap = baseCapital(ctx);
        var rente = a.renteActuelle;          // capital d'aujourd'hui, comme Streamlit
        var fx = base.fx;
        var rReel = U.num(rente.rendement_reel, 0);

        /* Un rendement réel négatif donne une perpétuité nulle par construction :
           afficher « 0 $ » sans explication est une insulte à l'intelligence du
           lecteur. On dit ce qui manque, et on donne le seul chiffre qui reste
           défendable : la rente nominale, celle qui entame le capital. */
        if (rReel <= 0) {
            var nominal = cap.capitalUsd * Math.max(0, U.num(a.def.rendement, 0)) / 12;
            var impotNominal = nominal * U.num(rente.part_pv, 0) * U.num(rente.taux_imposition_pv, 0);
            var netteNominale = Math.max(0, nominal - impotNominal);
            return '<div class="titre">Rente mensuelle <span class="n">scénario historique</span></div>'
                + '<div class="card" data-aller="retraite">'
                + '<div class="lbl">Rente perpétuelle : ' + U.pct(rReel, 2) + ' de rendement réel</div>'
                + '<div class="erreur" style="margin:8px 0 0">Votre rendement retenu ('
                + U.pct(a.def.rendement, 2) + ') ne couvre pas l’inflation ('
                + U.pct(a.def.inflation, 2) + ') : le rendement réel est de '
                + '<b>' + U.pct(rReel, 2) + '</b>. Préserver le pouvoir d’achat du capital '
                + 'ne laisse donc aucun revenu — le sortir entamerait le capital, et le '
                + 'capital entamé ne se reconstitue pas.</div>'
                + '<div class="sep"></div>'
                + '<div class="ligne" style="padding:6px 0"><div class="gr"><div class="st">'
                + 'Revenu nominal, capital non préservé</div>'
                + '<div class="ss">à titre indicatif, le capital perd '
                + U.pct(U.num(a.def.inflation, 0), 1) + ' de pouvoir d’achat par an</div></div>'
                + '<div class="dr"><div class="a">' + U.usd(netteNominale, { dec: 0 }) + '</div>'
                + '<div class="b">' + U.eur(netteNominale / fx, { dec: 0 }) + '</div></div></div>'
                + '<div class="ligne" style="padding:6px 0"><div class="gr"><div class="st">Capital retenu (investi + cash)</div></div>'
                + '<div class="dr"><div class="a">' + U.usd(cap.capitalUsd, { dec: 0 }) + '</div>'
                + '<div class="b">' + U.eur(cap.capitalUsd / fx, { dec: 0 }) + '</div></div></div>'
                + '<div class="ligne" style="padding:6px 0"><div class="gr"><div class="st">Rendement retenu</div>'
                + '<div class="ss">' + UI.h(a.def.source) + '</div></div>'
                + '<div class="dr"><div class="a">' + U.pct(a.def.rendement, 2) + '</div>'
                + '<div class="b">inflation ' + U.pct(a.def.inflation, 1) + '</div></div></div>'
                + '<div style="font-size:11.5px;color:var(--gold);margin-top:8px">'
                + 'Changer d’hypothèse, comparer les trois scénarios et voir le détail : '
                + 'onglet Retraite ›</div>'
                + '</div>';
        }

        return '<div class="titre">Rente mensuelle <span class="n">scénario historique</span></div>'
            + '<div class="card" data-aller="retraite">'
            + '<div class="lbl">Revenu net perpétuel si vous partiez aujourd’hui</div>'
            + UI.montant(rente.rente_nette_usd, rente.rente_nette_eur)
            + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:4px">'
            + 'On ne vit que du rendement au-dessus de l’inflation ('
            + U.pct(rReel, 2) + ') : le capital reste entier en pouvoir d’achat, indéfiniment. '
            + 'Rente calculée sur votre capital actuel, pas sur une projection.</div>'
            + '<div class="sep"></div>'
            + '<div class="ligne" style="padding:6px 0"><div class="gr"><div class="st">Rente brute</div></div>'
            + '<div class="dr"><div class="a">' + U.usd(rente.rente_brute_usd, { dec: 0 }) + '</div>'
            + '<div class="b">' + U.eur(rente.rente_brute_eur, { dec: 0 }) + '</div></div></div>'
            + '<div class="ligne" style="padding:6px 0"><div class="gr"><div class="st">Capital retenu (investi + cash)</div></div>'
            + '<div class="dr"><div class="a">' + U.usd(cap.capitalUsd, { dec: 0 }) + '</div>'
            + '<div class="b">' + U.eur(cap.capitalUsd / fx, { dec: 0 }) + '</div></div></div>'
            + '<div class="ligne" style="padding:6px 0"><div class="gr"><div class="st">Apports nets versés</div></div>'
            + '<div class="dr"><div class="a">' + U.usd(cap.apportsUsd, { dec: 0 }) + '</div>'
            + '<div class="b">' + U.eur(cap.apportsUsd / fx, { dec: 0 }) + '</div></div></div>'
            + '<div class="ligne" style="padding:6px 0"><div class="gr"><div class="st">Plus-value dans le capital</div></div>'
            + '<div class="dr"><div class="a">' + U.usd(cap.pvCapitalUsd, { dec: 0 }) + '</div>'
            + '<div class="b">' + U.eur(cap.pvCapitalUsd / fx, { dec: 0 }) + '</div></div></div>'
            + '<div class="ligne" style="padding:6px 0"><div class="gr"><div class="st">Rendement retenu</div>'
            + '<div class="ss">' + UI.h(a.def.source) + '</div></div>'
            + '<div class="dr"><div class="a">' + U.pct(a.def.rendement, 2) + '</div>'
            + '<div class="b">inflation ' + U.pct(a.def.inflation, 1) + '</div></div></div>'
            + (PF.metrics.twrAnnualise(ctx.serie) === null
                ? '<div class="info" style="margin-top:6px">Historique insuffisant pour calculer votre '
                  + 'CAGR : 5 % est retenu par prudence. Détail dans l’onglet Retraite.</div>' : '')
            + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:8px">On ne consomme que le rendement '
            + 'au-dessus de l’inflation : le capital garde son pouvoir d’achat. '
            + '<b style="color:var(--gold)">Détail, hypothèses et scénarios : onglet Retraite ›</b></div>'
            + '</div>';
    }

    function estInvesti(a) {
        var p = M.etat.parCle[a.poche];
        return !!p && p.perimetre === 'investi';
    }

    /* Deux définitions de la plus-value, et l'erreur serait de les confondre :
       - la plus-value DES POSITIONS : valeur actuelle moins prix d'achat des
         titres détenus — c'est celle qui serait imposée si vous vendiez ;
       - la plus-value DANS LE CAPITAL : capital moins apports nets versés,
         gains réalisés compris — c'est la base de la rente.
       La v2 affiche la seconde sous le libellé « dans le capital ». L'application
       affichait la première sous un libellé voisin : les deux chiffres sont
       justes, ils ne mesurent pas la même chose. On montre donc les deux,
       chacune nommée. */
    function baseCapital(ctx) {
        var capital = (ctx.totalInvestiUsd || 0) + (ctx.totalCourantUsd || 0);
        var apports = U.num(ctx.capitalInvestiUsd, 0) || capital;
        var pv = Math.max(0, capital - apports);
        return {
            capitalUsd: capital,
            apportsUsd: apports,
            pvCapitalUsd: pv,
            partPv: capital > 0 ? pv / capital : 0,
            fx: ctx.tauxEurUsd > 0 ? ctx.tauxEurUsd : 1.125
        };
    }

    function pvPositionsTotales(ctx) {
        var total = 0;
        (ctx.actifs || []).forEach(function (a) {
            if (a.classe === 'espece') return;
            total += (a.pvLatenteUsd || 0);
        });
        return total;
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
            + chip('comptes', 'Comptes', ongletPortefeuille === 'comptes')
            + chip('reequilibrage', 'Rééquilibrage', ongletPortefeuille === 'reequilibrage')
            + chip('allocation', 'Allocation', ongletPortefeuille === 'allocation')
            + '</div>';

        out += '<button class="btn" id="btnNouveau" style="margin-bottom:14px">＋ Enregistrer une opération</button>';

        if (ongletPortefeuille === 'positions') out += ongletPositions(ctx);
        else if (ongletPortefeuille === 'operations') out += ongletOperations(ctx);
        else if (ongletPortefeuille === 'comptes') out += ongletComptes(ctx);
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

        var pvPos = pvPositionsTotales(ctx);
        var cap = baseCapital(ctx);
        out += '<div class="card tight">'
            + '<div class="lbl">Plus-value latente des positions</div>'
            + UI.montant(pvPos, pvPos / cap.fx)
            + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:6px">Valeur actuelle moins prix '
            + 'd’achat des titres détenus : la plus-value qui serait imposée si vous vendiez aujourd’hui.</div>'
            + '<div class="sep"></div>'
            + '<div class="lbl">Plus-value dans le capital</div>'
            + UI.montant(cap.pvCapitalUsd, cap.pvCapitalUsd / cap.fx, { petit: true })
            + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:6px">Capital (investi + cash '
            + 'disponible) moins vos apports nets versés, gains réalisés compris : c’est la base de la rente, '
            + 'et le chiffre que la v2 appelle « plus-value latente dans le capital ».</div>'
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

    /* Les comptes de liquidités, en devise puis en dollars et en euros : c'est
       l'écran « Fonds & Comptes » de la v2, avec les virements internes. */
    function ongletComptes(ctx) {
        var comptes = (ctx.actifs || []).filter(function (a) { return a.classe === 'espece'; });
        var out = '<div class="titre">Comptes de liquidités <span class="n">' + comptes.length + '</span></div>';
        if (!comptes.length) {
            return out + '<div class="vide" style="padding:18px">Aucun compte de liquidités trouvé '
                + 'dans la table Donnees.</div>';
        }
        var totalUsd = 0, totalEur = 0;
        comptes.forEach(function (c) { totalUsd += c.valeurUsd; totalEur += c.valeurEur; });

        out += '<div class="card gold"><div class="lbl">Total disponible</div>'
            + UI.montant(totalUsd, totalEur)
            + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:6px">Épargne de précaution : '
            + U.usd(ctx.totalPrecautionUsd, { dec: 0 }) + ' · cash disponible : '
            + U.usd(ctx.totalCourantUsd, { dec: 0 }) + '</div></div>';

        out += '<div class="card">';
        comptes.forEach(function (c) {
            var poche = M.etat.parCle[c.poche];
            out += '<div class="ligne"><div class="pastille" style="background:rgba(56,189,248,.14)">💵</div>'
                + '<div class="gr"><div class="tt">' + UI.h(c.ticker) + '</div>'
                + '<div class="st">Solde : <b style="color:var(--txt-2)">' + U.quantite(c.quantite) + ' '
                + UI.h(c.ticker) + '</b>' + (poche ? ' · ' + UI.h(poche.nom) : '') + '</div></div>'
                + '<div class="dr"><div class="a">' + U.usd(c.valeurUsd, { dec: 0 }) + '</div>'
                + '<div class="b">' + U.eur(c.valeurEur, { dec: 0 }) + '</div></div></div>';
        });
        out += '</div>';

        out += '<button class="btn" id="btnVirement" style="margin-bottom:10px">↔ Virement entre deux comptes</button>';
        out += '<div style="font-size:11.5px;color:var(--txt-3);padding:0 4px">Un virement interne ne modifie '
            + 'ni votre capital investi ni vos apports : il déplace simplement des fonds d’un compte à l’autre, '
            + 'au taux de change du jour de l’opération.</div>';
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

    var BLOCS_PERF = [
        { titre: 'Progression journalière', sous: 'depuis le dernier enregistrement',
          cle: 'Progression journalière' },
        { titre: 'Progression mensuelle', sous: 'depuis le 1ᵉʳ du mois',
          cle: 'Depuis le début du mois' },
        { titre: 'Progression annuelle', sous: 'depuis le 1ᵉʳ janvier',
          cle: 'Depuis le début de l’année' },
        { titre: 'Progression depuis un an', sous: 'année glissante',
          cle: 'Depuis 1 an' },
        { titre: 'Progression totale', sous: 'depuis le premier enregistrement',
          cle: 'Depuis le début' }
    ];

    function vuePerformance(ctx) {
        var perimetre = perimetrePerf || PF.store.reglages().perimetrePerf || 'investi';
        var nomPerimetre = perimetre === 'total' ? 'Patrimoine total' : 'Portefeuille investi';
        var out = '';

        out += '<div class="chips">'
            + '<button class="chip' + (perimetre === 'investi' ? ' actif' : '')
            + '" data-perimetre="investi">Portefeuille investi</button>'
            + '<button class="chip' + (perimetre === 'total' ? ' actif' : '')
            + '" data-perimetre="total">Patrimoine total</button>'
            + '</div>';

        if (!ctx.serie || ctx.serie.dates.length < 2) {
            return out + '<div class="vide"><span class="g">\u25e2</span>Pas encore assez d\u2019historique de snapshots.</div>';
        }

        var fx = ctx.tauxEurUsd > 0 ? ctx.tauxEurUsd : 1.125;
        var affiches = 0;

        BLOCS_PERF.forEach(function (b) {
            var p = progression(ctx, b.cle, perimetre);
            if (p.vide) return;
            var courbe = valeursPeriode(ctx, b.cle, perimetre);
            if (courbe.valeurs.length < 2) return;
            affiches++;
            var dernier = courbe.valeurs[courbe.valeurs.length - 1];
            var premier = courbe.valeurs[0];
            var hausse = dernier >= premier;
            out += '<div class="card">'
                + '<div class="lbl">' + UI.h(b.titre) + '</div>'
                + '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">'
                + UI.fleche(p.twr_per)
                + '<span style="font-size:14px;font-weight:750">'
                + U.usd(p.gain_marche_usd, { dec: 0, signe: true }) + '</span>'
                + '<span class="dim" style="font-size:11.5px">'
                + '<span style="color:var(--euro)">'
                + U.eur(p.gain_marche_usd / fx, { dec: 0, signe: true }) + '</span> \u00b7 '
                + UI.h(b.sous) + '</span>'
                + '</div>'
                + '<div style="font-size:11px;color:var(--txt-3);margin:3px 0 9px">'
                + U.jourMoisAnneeISO(courbe.dates[0]) + ' \u2192 '
                + U.jourMoisAnneeISO(courbe.dates[courbe.dates.length - 1])
                + ' \u00b7 ' + courbe.valeurs.length + ' points \u00b7 valeur fin de p\u00e9riode '
                + U.usd(p.v_fin_usd, { dec: 0 })
                + ' <span style="color:var(--euro)">(' + U.eur(p.v_fin_usd / fx, { dec: 0 }) + ')</span></div>'
                + UI.graphique([{
                    nom: nomPerimetre,
                    valeurs: courbe.valeurs,
                    dates: courbe.dates,
                    couleur: hausse ? 'var(--up)' : 'var(--down)'
                }], { hauteur: 128, tauxEurUsd: fx, unite: '$' })
                + '</div>';
        });

        if (!affiches) {
            return out + '<div class="vide"><span class="g">\u25e2</span>Pas de donn\u00e9es sur ces p\u00e9riodes.</div>';
        }

        out += '<div class="astuce">Chaque courbe montre tous les enregistrements de sa '
            + 'p\u00e9riode, sans \u00e9chantillonnage. Touchez une courbe pour lire un point.</div>';

        var valeursSerie = ctx.serie.lignes.map(function (l) {
            return U.num(l.ligne[perimetre === 'total' ? 'patrimoine_total_usd' : 'patrimoine_investi_usd'], 0);
        });
        var rends = PF.metrics.rendementsPeriode(valeursSerie, ctx.serie.flux);
        var parAn = PF.metrics.twrParAnnee(ctx.serie.dates, rends);
        var annees = Object.keys(parAn).sort();
        if (annees.length) {
            out += '<div class="titre">Performance par ann\u00e9e <span class="n">' + UI.h(nomPerimetre) + '</span></div>'
                + '<div class="card"><table class="tableau"><tr><th>Ann\u00e9e</th><th>TWR</th></tr>';
            annees.forEach(function (a) {
                var f = U.fleche(parAn[a]);
                out += '<tr><td>' + UI.h(a) + '</td><td class="' + f.classe + '">'
                    + U.pctSigne(parAn[a]) + '</td></tr>';
            });
            out += '</table></div>';
        }

        if (ctx.equivalentOrOz) {
            out += '<div class="titre">\u00c9talon or</div><div class="card">'
                + '<div class="ligne"><div class="gr"><div class="tt">Portefeuille en onces d\u2019or</div>'
                + '<div class="st">Cours : ' + U.usd(ctx.coursOr, { dec: 0 }) + ' l\u2019once</div></div>'
                + '<div class="dr"><div class="a">' + U.nombre(ctx.equivalentOrOz, 3) + ' oz</div></div></div></div>';
        }
        return out;
    }

    /* Les valeurs ET les dates de la période : une courbe sans dates ni
       échelle ne se lit pas. */
    function valeursPeriode(ctx, periode, perimetre) {
        var col = perimetre === 'total' ? 'patrimoine_total_usd' : 'patrimoine_investi_usd';
        var valLive = perimetre === 'total' ? ctx.patrimoineTotalUsd : ctx.totalInvestiUsd;
        var dates = ctx.serie.dates, valeurs = ctx.serie.lignes.map(function (l) {
            return U.num(l.ligne[col], U.num(l.ligne.patrimoine_investi_usd, 0));
        });
        var p = PF.metrics.progressionPeriode({ dates: dates, valeurs: valeurs, flux: ctx.serie.flux, lignes: ctx.serie.lignes },
            periode, valLive);
        var idx = p.idxGraphe || [];
        var v = idx.map(function (i) { return valeurs[i]; });
        if (valLive > 0 && v.length) v[v.length - 1] = valLive;
        return {
            valeurs: v,
            dates: idx.map(function (i) { return dates[i]; })
        };
    }

    // ================================================================== RETRAITE

    var scenarioActif = null;
    var perimetrePerf = null;

    /* La dernière inflation INSEE réellement enregistrée pour une année close.
       Une année en cours n'est pas une année : elle n'est jamais retenue. */
    function inflationObservee(ctx) {
        var an = new Date().getFullYear();
        var annees = Object.keys(ctx.inflation || {}).map(Number)
            .filter(function (a) { return a <= an - 1; })
            .sort(function (a, b) { return b - a; });
        for (var i = 0; i < annees.length; i++) {
            var n = U.tauxPlausible(ctx.inflation[annees[i]]);
            if (n === null) continue;
            return { annee: annees[i], valeur: n };
        }
        return null;
    }

    /* Le premier enregistrement : c'est la naissance du portefeuille au sens
       de l'application, et le point de départ du CAGR. */
    function premierEnregistrement(ctx) {
        if (!ctx.serie || !ctx.serie.dates || !ctx.serie.dates.length) return '';
        return ctx.serie.dates[0];
    }

    /* La moyenne des dernières années closes. Une année seule ne fait pas une
       tendance : 2025 à 0,94 % est une année de repli des prix de l'énergie,
       pas une hypothèse pour les trente ans qui viennent. */
    function inflationMoyenne(ctx, combien) {
        var an = new Date().getFullYear();
        var annees = Object.keys(ctx.inflation || {}).map(Number)
            .filter(function (a) { return a <= an - 1; })
            .sort(function (a, b) { return b - a; })
            .slice(0, combien || 10);
        var somme = 0, n = 0;
        annees.forEach(function (a) {
            var v = U.tauxPlausible(ctx.inflation[a]);
            if (v === null) return;
            somme += v; n++;
        });
        return n >= 3 ? { valeur: somme / n, annees: n, depuis: annees[annees.length - 1] } : null;
    }

    /* L'inflation de référence du scénario A.
       Deux mesures, et rien d'autre : la moyenne des années closes, ou la
       dernière année écoulée. Aucune valeur de confort, aucune convention
       saisissable — ce qui est retenu a été mesuré par l'INSEE, ou n'est pas
       retenu du tout. La moyenne est le défaut : une seule année ne fait pas
       une tendance, et c'est précisément ce que la moyenne corrige. */
    function inflationReference(ctx) {
        var r = PF.store.reglages();
        var mode = r.retraiteInflationMode || 'moyenne';
        var connue = inflationObservee(ctx);
        var moyenne = inflationMoyenne(ctx, 10);
        var restantes = Math.max(1,
            (U.num(r.anneeDepartRetraite, 0) || (new Date().getFullYear() + 20)) - new Date().getFullYear());

        /* Les deux mesures sont affichées côte à côte, quelle que soit celle
           qui est retenue : leur écart est une information, pas un détail. */
        var comparaison = '';
        if (connue && moyenne) {
            comparaison = 'L’an pass\u00e9 (' + connue.annee + ') : ' + U.pct(connue.valeur, 2)
                + ' \u00b7 moyenne de ' + moyenne.annees + ' ans : ' + U.pct(moyenne.valeur, 2);
        } else if (connue) {
            comparaison = 'L’an pass\u00e9 (' + connue.annee + ') : ' + U.pct(connue.valeur, 2);
        }

        if (mode === 'derniere') {
            return {
                mode: mode, valeur: connue ? connue.valeur : 0.02, comparaison: comparaison,
                source: connue
                    ? 'Derni\u00e8re ann\u00e9e close : INSEE ' + connue.annee + ', ' + U.pct(connue.valeur, 2)
                    : 'Aucune inflation INSEE enregistr\u00e9e : 2 % retenu faute de mieux',
                alerte: connue
                    ? 'Une seule ann\u00e9e, projet\u00e9e sur ' + restantes + ' ans. 2025 a \u00e9t\u00e9 une '
                      + 'ann\u00e9e de repli des prix de l’\u00e9nergie : la prendre pour les trente '
                      + 'prochaines ann\u00e9es n’est pas une hypoth\u00e8se prudente.'
                    : null
            };
        }
        return {
            mode: moyenne ? 'moyenne' : 'derniere',
            valeur: moyenne ? moyenne.valeur : (connue ? connue.valeur : 0.02),
            comparaison: comparaison,
            source: moyenne
                ? 'Moyenne INSEE des ' + moyenne.annees + ' derni\u00e8res ann\u00e9es closes ('
                  + moyenne.depuis + ' \u2192 ' + (new Date().getFullYear() - 1) + ') : '
                  + U.pct(moyenne.valeur, 2)
                : (connue
                    ? 'Historique trop court pour une moyenne (il faut 3 ann\u00e9es closes) : '
                      + 'derni\u00e8re ann\u00e9e retenue, INSEE ' + connue.annee + ', ' + U.pct(connue.valeur, 2)
                    : 'Aucune inflation INSEE enregistr\u00e9e : 2 % retenu faute de mieux'),
            alerte: null
        };
    }

    /* Une inflation venue d'un réglage est normalisée puis contrôlée : un
       pourcentage tapé à la main (2 pour 2 %) est compris, une valeur qui ne
       peut pas être une inflation annuelle est écartée au profit de la
       dernière inflation INSEE connue. */
    function inflationSaisie(valeur, inflConnue) {
        if (valeur === null || valeur === undefined) return inflConnue ? inflConnue.valeur : 0.02;
        var n = U.tauxPlausible(valeur);
        return n === null ? (inflConnue ? inflConnue.valeur : 0.02) : n;
    }

    /* Trois scénarios, chacun avec son rendement ET sa propre inflation.
       Le scénario A est prérempli par le CAGR réellement observé du
       portefeuille — jamais par un chiffre de confort. */
    function scenariosRetraite(ctx) {
        var r = PF.store.reglages();
        var anneeCourante = new Date().getFullYear();
        var anneeDepart = Math.max(anneeCourante + 1, U.num(r.anneeDepartRetraite, anneeCourante + 20));
        var fx = ctx.tauxEurUsd > 0 ? ctx.tauxEurUsd : 1.125;
        var apportMensuelUsd = U.num(r.apportMensuelEur, 250) * fx;
        var cagr = PF.metrics.twrAnnualise(ctx.serie);
        var inflConnue = inflationObservee(ctx);
        var inflRef = inflationReference(ctx);

        var defs = [
            {
                cle: 'A', nom: 'Historique',
                /* Le scénario A n'est pas une hypothèse : c'est la photographie de ce qui
                   s'est réellement produit. Le rendement est votre CAGR observé,
                   l'inflation est une mesure INSEE. Aucun des deux ne peut être forcé —
                   sinon ce n'est plus le scénario « historique », c'est un troisième
                   scénario libre déguisé. */
                rendement: cagr === null ? 0.05 : cagr,
                inflation: inflRef.valeur,
                source: cagr === null
                    ? 'Historique trop court pour calculer votre CAGR : 5 % retenu par prudence, et l’application le dit'
                    : 'CAGR de votre portefeuille investi, corrigé de vos apports, depuis le premier '
                      + 'enregistrement (' + U.jourMoisAnneeISO(premierEnregistrement(ctx)) + ') — calculé, non modifiable',
                sourceInflation: inflRef.source,
                modifiable: false
            },
            {
                cle: 'B', nom: 'Prudent',
                rendement: U.num(r.retraiteRendementB, 0.05),
                inflation: inflationSaisie(r.retraiteInflationB, inflRef),
                source: 'Hypothèse prudentielle, à ajuster', sourceInflation: 'Hypothèse, à ajuster'
            },
            {
                cle: 'C', nom: 'Volontaire',
                rendement: U.num(r.retraiteRendementC, 0.08),
                inflation: inflationSaisie(r.retraiteInflationC, inflRef),
                source: 'Hypothèse volontaire, à ajuster', sourceInflation: 'Hypothèse, à ajuster'
            }
        ];

        var capitalInitial = (ctx.totalInvestiUsd || 0) + (ctx.totalCourantUsd || 0);
        var apportsCumules = U.num(ctx.capitalInvestiUsd, 0) || capitalInitial;

        return {
            anneeDepart: anneeDepart, anneeCourante: anneeCourante,
            apportMensuelUsd: apportMensuelUsd, capitalInitial: capitalInitial,
            apportsCumules: apportsCumules, fx: fx,
            scenarios: defs.map(function (d) {
                var projet = PF.metrics.projectionScenario({
                    capitalInitialUsd: capitalInitial,
                    apportsCumulesUsd: apportsCumules,
                    apportMensuelUsd: apportMensuelUsd,
                    anneeDepart: anneeDepart,
                    rendementAnnuel: d.rendement,
                    inflationAnnuelle: d.inflation
                });
                var fin = projet[projet.length - 1];
                var rReel = (1 + d.rendement) / (1 + d.inflation) - 1;
                var pv = Math.max(0, fin.pouvoir_achat - fin.apports_cumules);
                var rente = PF.metrics.renteMensuelle(fin.pouvoir_achat, fin.apports_cumules,
                    d.rendement, d.inflation, U.num(r.tauxImpositionPV, 0.314), fx);
                /* La rente D'AUJOURD'HUI, sur le capital d'aujourd'hui : c'est
                   celle que Streamlit affiche sur son tableau de bord. La
                   projeter à l'année de départ relève de l'écran Retraite —
                   mélanger les deux (une rente de 2055 sous un capital de 2026)
                   ne veut rien dire. */
                var renteActuelle = PF.metrics.renteMensuelle(capitalInitial, apportsCumules,
                    d.rendement, d.inflation, U.num(r.tauxImpositionPV, 0.314), fx);
                return {
                    def: d, projet: projet, fin: fin, rendementReel: rReel,
                    partPv: fin.pouvoir_achat > 0 ? pv / fin.pouvoir_achat : 0,
                    plusValue: pv, rente: rente, renteActuelle: renteActuelle
                };
            })
        };
    }

    function recapLigne(label, valeur, source, fort) {
        return '<div class="recap-l"><span>' + UI.h(label) + '</span><b'
            + (fort ? ' style="color:var(--gold);font-size:15px"' : '') + '>' + UI.h(valeur) + '</b></div>'
            + (source ? '<div class="recap-src">' + UI.h(source) + '</div>' : '');
    }

    function vueRetraite(ctx) {
        var r = PF.store.reglages();
        var base = scenariosRetraite(ctx);
        var cle = scenarioActif || 'A';
        var courant = base.scenarios.filter(function (s) { return s.def.cle === cle; })[0] || base.scenarios[0];
        var fx = base.fx;
        var anneesRestantes = base.anneeDepart - base.anneeCourante;
        var out = '';

        // --- Choix du scénario
        out += '<div class="chips">' + base.scenarios.map(function (s) {
            return '<button class="chip' + (s.def.cle === cle ? ' actif' : '') + '" data-scenario="'
                + UI.h(s.def.cle) + '">Scénario ' + UI.h(s.def.cle) + ' · ' + UI.h(s.def.nom) + '</button>';
        }).join('') + '</div>';

        // --- L'inflation : deux mesures, aucune convention saisissable
        var inflRef = inflationReference(ctx);
        var scenA = base.scenarios.filter(function (x) { return x.def.cle === 'A'; })[0] || base.scenarios[0];
        var MODES = [
            { cle: 'moyenne', nom: 'Moyenne 10 ans' },
            { cle: 'derniere', nom: 'L’an passé' }
        ];
        out += '<div class="titre">Inflation du scénario A <span class="n">'
            + U.pct(scenA.def.inflation, 2) + '</span></div>';
        out += '<div class="chips">' + MODES.map(function (m) {
            return '<button class="chip' + (m.cle === inflRef.mode ? ' actif' : '')
                + '" data-inflation="' + UI.h(m.cle) + '">' + UI.h(m.nom) + '</button>';
        }).join('') + '</div>';
        out += '<div class="card tight" style="margin-bottom:10px">'
            + '<div style="font-size:12.5px;color:var(--txt-2);line-height:1.55">'
            + UI.h(inflRef.source) + '</div>'
            + (inflRef.comparaison ? '<div style="font-size:12px;color:var(--txt-3);margin-top:6px">'
                + UI.h(inflRef.comparaison) + '</div>' : '')
            + (inflRef.alerte ? '<div class="info" style="margin-top:8px">'
                + UI.h(inflRef.alerte) + '</div>' : '')
            + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:8px;line-height:1.55">'
            + 'Ce chiffre est mesuré, pas choisi : vous sélectionnez la période, jamais la '
            + 'valeur. Le rendement du scénario A est votre CAGR observé depuis le '
            + U.jourMoisAnneeISO(premierEnregistrement(ctx)) + ' — il n’est pas modifiable '
            + 'davantage. Les scénarios B et C restent libres, ce sont des hypothèses.</div>'
            + '</div>';

        // --- Capital projeté
        out += '<div class="card gold">'
            + '<div class="lbl">Capital au 1ᵉʳ janvier ' + base.anneeDepart + ' — scénario ' + UI.h(courant.def.cle) + '</div>'
            + UI.montant(courant.fin.capital_nominal, courant.fin.capital_nominal / fx)
            + '<div style="font-size:12.5px;color:var(--txt-3);margin-top:7px">'
            + 'soit <b style="color:var(--txt-2)">' + U.usd(courant.fin.pouvoir_achat, { dec: 0 }) + '</b>'
            + ' <span style="color:var(--euro)">(' + U.eur(courant.fin.pouvoir_achat / fx, { dec: 0 }) + ')</span> '
            + 'en pouvoir d’achat d’aujourd’hui</div>'
            + '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">'
            + UI.badge('rendement ' + U.pct(courant.def.rendement, 1), 'mut')
            + UI.badge('inflation ' + U.pct(courant.def.inflation, 1), 'mut')
            + UI.badge('réel ' + U.pct(courant.rendementReel, 2), courant.rendementReel > 0 ? 'ok' : 'warn')
            + '</div></div>';

        // --- Courbe des trois scénarios (pouvoir d'achat)
        out += '<div class="card">' + UI.graphique(base.scenarios.map(function (s) {
            return {
                nom: 'Scén. ' + s.def.cle,
                valeurs: s.projet.map(function (p) { return p.pouvoir_achat; }),
                dates: s.projet.map(function (p) { return p.annee + '-01-01'; }),
                couleur: s.def.cle === 'A' ? 'var(--gold)' : (s.def.cle === 'B' ? 'var(--up)' : 'var(--flat)')
            };
        }), { hauteur: 196, tauxEurUsd: fx, unite: '$', dec: 0 })
            + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:2px">Pouvoir d’achat, '
            + 'c’est-à-dire le capital en euros constants : touchez la courbe pour lire une année.</div>'
            + '</div>';

        // --- Tableau comparatif
        var COLONNES = [
            { t: 'Rendement', f: function (s) { return U.pct(s.def.rendement, 1); } },
            { t: 'Inflation', f: function (s) { return U.pct(s.def.inflation, 1); } },
            { t: 'Rendement réel', f: function (s) { return U.pct(s.rendementReel, 2); } },
            { t: 'Capital nominal', f: function (s) { return U.usd(s.fin.capital_nominal, { dec: 0 }); } },
            { t: 'Pouvoir d’achat', f: function (s) { return U.usd(s.fin.pouvoir_achat, { dec: 0 }); } },
            { t: 'Dont apports', f: function (s) { return U.usd(s.fin.apports_cumules, { dec: 0 }); } },
            { t: 'Dont plus-value', f: function (s) { return U.usd(Math.max(0, s.fin.capital_nominal - s.fin.apports_cumules), { dec: 0 }); } },
            { t: 'Rente brute / mois', f: function (s) { return U.usd(s.rente.rente_brute_usd, { dec: 0 }); } },
            { t: 'Impôt / mois', f: function (s) { return '− ' + U.usd(s.rente.impot_usd, { dec: 0 }); } },
            { t: 'Rente nette / mois', f: function (s) { return U.usd(s.rente.rente_nette_usd, { dec: 0 }); }, fort: true }
        ];
        out += '<div class="titre">Les trois scénarios <span class="n">en dollars, eux en euros</span></div>';
        out += '<div class="card"><table class="tableau compact"><tr><th>Indicateur</th>'
            + base.scenarios.map(function (s) { return '<th>' + UI.h(s.def.cle + ' · ' + s.def.nom) + '</th>'; }).join('')
            + '</tr>';
        COLONNES.forEach(function (l) {
            out += '<tr><td>' + UI.h(l.t) + '</td>' + base.scenarios.map(function (s) {
                return '<td' + (l.fort ? ' class="fort"' : '') + '>' + UI.h(l.f(s)) + '</td>';
            }).join('') + '</tr>';
        });
        out += '</table><div style="font-size:11.5px;color:var(--txt-3);margin-top:8px">'
            + 'Divisez par le taux du jour (1 € = ' + U.nombre(fx, 3) + ' $) pour l’équivalent en euros.</div></div>';

        // --- Revenu net perpétuel
        var rente = courant.rente;
        out += '<div class="titre">Revenu net perpétuel <span class="n">scénario ' + UI.h(courant.def.cle) + '</span></div>';
        out += '<div class="card">'
            + '<div class="lbl">Rente mensuelle nette, pouvoir d’achat préservé</div>'
            + UI.montant(rente.rente_nette_usd, rente.rente_nette_eur)
            + '<div style="font-size:12px;color:var(--txt-3);margin-top:6px">Seul le rendement au-dessus de '
            + 'l’inflation est consommé : la rente est servie indéfiniment, en euros constants.</div>'
            + '<div class="sep"></div>'
            + recapLigne('Capital en pouvoir d’achat', U.usd(rente.capital_usd, { dec: 0 }), '')
            + recapLigne('Rendement réel retenu', U.pct(rente.rendement_reel, 2),
                '(1 + ' + U.pct(courant.def.rendement, 1) + ') ÷ (1 + ' + U.pct(courant.def.inflation, 1) + ') − 1')
            + recapLigne('Rente brute mensuelle', U.usd(rente.rente_brute_usd, { dec: 0 }),
                'capital × ' + U.pct(rente.rendement_reel, 2) + ' ÷ 12')
            + recapLigne('Part de plus-value', U.pct(courant.partPv, 1),
                'seule cette part est imposée — le capital remboursé ne l’est pas')
            + recapLigne('Impôt (' + U.pct(rente.taux_imposition_pv, 1) + ' sur la part de PV)',
                '− ' + U.usd(rente.impot_usd, { dec: 0 }), '')
            + recapLigne('Rente nette mensuelle', U.usd(rente.rente_nette_usd, { dec: 0 }),
                'soit ' + U.eur(rente.rente_nette_eur, { dec: 0 }) + ' par mois en euros d’aujourd’hui', true)
            + '</div>';

        // --- D'où vient ce chiffre
        var origines = [
            ['Capital de départ', U.usd(base.capitalInitial, { dec: 0 }),
                'Portefeuille investi (' + U.usd(ctx.totalInvestiUsd || 0, { dec: 0 }) + ') + cash disponible ('
                + U.usd(ctx.totalCourantUsd || 0, { dec: 0 }) + '), valorisés aux cours du jour'],
            ['Apports déjà versés', U.usd(base.apportsCumules, { dec: 0 }),
                'Dernier capital investi enregistré dans vos snapshots'],
            ['Apport mensuel', U.eur(U.num(r.apportMensuelEur, 0), { dec: 0 }) + ' → ' + U.usd(base.apportMensuelUsd, { dec: 0 }),
                'Converti au taux du jour, puis indexé chaque année sur l’inflation du scénario'],
            ['Durée de projection', anneesRestantes + ' ans',
                'du 1ᵉʳ janvier ' + (base.anneeCourante + 1) + ' au 1ᵉʳ janvier ' + base.anneeDepart
                + ', capitalisation mensuelle'],
            ['Rendement', U.pct(courant.def.rendement, 2), courant.def.source],
            ['Inflation', U.pct(courant.def.inflation, 2), courant.def.sourceInflation],
            ['Fiscalité des plus-values', U.pct(U.num(r.tauxImpositionPV, 0.314), 1),
                'PFU : 12,8 % d’IR + prélèvements sociaux'],
            ['Taux de change', '1 € = ' + U.nombre(fx, 3) + ' $',
                'Cours du jour. Hypothèse la plus fragile du modèle — voir la sensibilité ci-dessous']
        ];
        var corpsOrigine = origines.map(function (o) { return recapLigne(o[0], o[1], o[2]); }).join('')
            + '<div class="sep"></div>'
            + '<div style="font-size:12.5px;color:var(--txt-2);line-height:1.55">'
            + '<b style="color:var(--txt)">Formule.</b> Rente nette = capital en pouvoir d’achat × rendement réel ÷ 12, '
            + 'moins l’impôt calculé sur la seule part de plus-value. Le capital n’est jamais entamé : '
            + 'c’est une règle de pérennité, plus exigeante que la règle des 4 % quand les rendements sont bons.'
            + '</div>';
        out += UI.accordeon('D’où vient ce chiffre ?', corpsOrigine, true,
            'chaque hypothèse, sa valeur et sa source');

        // --- Sensibilité au taux de change
        var sens = PF.metrics.sensibiliteChange(courant.fin.capital_nominal, courant.fin.pouvoir_achat, fx);
        out += '<div class="titre">Sensibilité au taux de change <span class="n">scénario ' + UI.h(courant.def.cle) + '</span></div>';
        out += '<div class="card"><table class="tableau compact">'
            + '<tr><th>1 € =</th><th>Pouvoir d’achat</th><th>Impact</th></tr>';
        sens.forEach(function (l) {
            var f = U.fleche(l.impact);
            out += '<tr><td>' + U.nombre(l.taux, 3) + ' $ <span style="color:var(--txt-3)">('
                + U.pctSigne(l.variation, 0) + ')</span></td>'
                + '<td>' + U.eur(l.pouvoir_achat_eur, { dec: 0 }) + '</td>'
                + '<td class="' + f.classe + '">' + U.pctSigne(l.impact, 1) + '</td></tr>';
        });
        out += '</table><div style="font-size:11.5px;color:var(--txt-3);margin-top:8px">Votre portefeuille est '
            + 'libellé en dollars, en yens et en francs suisses, mais vous dépenserez en euros. Une variation '
            + 'de 15 % du change pèse davantage que la plupart des écarts de rendement entre scénarios.</div></div>';

        // --- Hypothèses modifiables
        out += '<div class="titre">Hypothèses</div><div class="card">';
        var scenAHyp = base.scenarios.filter(function (x) { return x.def.cle === 'A'; })[0] || base.scenarios[0];
        var HYPOTHESES = [
            ['anneeDepartRetraite', 'Départ à la retraite', String(base.anneeDepart)],
            ['apportMensuelEur', 'Apport mensuel', U.eur(U.num(r.apportMensuelEur, 0), { dec: 0 })],
            ['retraiteRendementB', 'Scénario B — rendement', U.pct(U.num(r.retraiteRendementB, 0.05), 2)],
            ['retraiteInflationB', 'Scénario B — inflation', U.pct(U.num(r.retraiteInflationB, 0.02), 2)],
            ['retraiteRendementC', 'Scénario C — rendement', U.pct(U.num(r.retraiteRendementC, 0.08), 2)],
            ['retraiteInflationC', 'Scénario C — inflation', U.pct(U.num(r.retraiteInflationC, 0.02), 2)],
            ['tauxImpositionPV', 'Fiscalité des plus-values', U.pct(U.num(r.tauxImpositionPV, 0.314), 1)]
        ];
        HYPOTHESES.forEach(function (h) {
            out += '<div class="ligne" data-reglage="' + UI.h(h[0]) + '"><div class="gr"><div class="tt">'
                + UI.h(h[1]) + '</div></div><div class="dr"><div class="a">' + UI.h(h[2])
                + '</div><div class="b">modifier</div></div></div>';
        });
        /* Le scénario A est affiché, pas modifiable : deux lignes sans le
           mot « modifier », avec la source en dessous. */
        out += '<div class="ligne"><div class="gr"><div class="tt">Scénario A — rendement</div>'
            + '<div class="ss">' + UI.h(scenAHyp.def.source) + '</div></div>'
            + '<div class="dr"><div class="a">' + U.pct(scenAHyp.def.rendement, 2) + '</div>'
            + '<div class="b">calculé</div></div></div>';
        out += '<div class="ligne"><div class="gr"><div class="tt">Scénario A — inflation</div>'
            + '<div class="ss">' + UI.h(scenAHyp.def.sourceInflation) + '</div></div>'
            + '<div class="dr"><div class="a">' + U.pct(scenAHyp.def.inflation, 2) + '</div>'
            + '<div class="b">mesurée</div></div></div>';
        out += '</div>';

        if (r.retraiteRendementA !== null && r.retraiteRendementA !== undefined) {
            out += '<button class="btn ghost" id="btnResetA" style="margin-bottom:8px">⟲ Scénario A : '
                + 'effacer les anciennes valeurs saisies</button>';
        }
        if (ctx.inflationEcartee && ctx.inflationEcartee.length) {
            out += '<div class="erreur"><b>Table d’inflation : '
                + ctx.inflationEcartee.length + ' ligne(s) écartée(s).</b> '
                + ctx.inflationEcartee.slice(0, 4).map(function (l) {
                    return UI.h(String(l.annee)) + ' : ' + U.pct(U.num(l.valeur, 0), 1);
                }).join(' · ')
                + '. Une inflation annuelle française ne sort pas de ces valeurs : ce sont des indices '
                + 'ou des cumuls, pas des taux. Relancez « Récupérer l’inflation officielle (INSEE) » '
                + 'dans les réglages pour réécrire la table.</div>';
        }
        if (PF.metrics.twrAnnualise(ctx.serie) === null) {
            out += '<div class="info">Historique insuffisant pour calculer votre CAGR : le scénario A '
                + 'reprend donc 5 % par prudence. Dès que vos snapshots couvriront plusieurs mois, '
                + 'il sera prérempli par votre rendement réellement observé.</div>';
        }
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
        definirPerimetre: function (v) { perimetrePerf = v; PF.store.sauverReglages({ perimetrePerf: v }); },
        definirInflation: function (v) { PF.store.sauverReglages({ retraiteInflationMode: v }); },
        retraite: vueRetraite,
        fiscalite: vueFiscalite,
        definirOngletPortefeuille: function (o) { ongletPortefeuille = o; },
        ongletPortefeuille: function () { return ongletPortefeuille; },
        definirScenario: function (c) { scenarioActif = c; },
        scenarioActif: function () { return scenarioActif; },
        scenariosRetraite: scenariosRetraite,
        inflationObservee: inflationObservee,
        ongletComptes: ongletComptes,
        baseCapital: baseCapital,
        pvPositionsTotales: pvPositionsTotales,
        definirPeriode: function (p) { periodeChoisie = p; },
        periodeChoisie: function () { return periodeChoisie; },
        carteRente: carteRente,
        lignePoche: lignePoche,
        miniCarte: miniCarte,
        nomPoche: nomPoche,
        icone: icone
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
