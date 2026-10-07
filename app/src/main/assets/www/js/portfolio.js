/* Construction du contexte : transactions -> positions -> valorisation.
   Portage de core/portfolio.py et de core/session.py.

   Règle tenue d'un bout à l'autre, héritée des corrections de la v2 : un cours
   ou un taux de change introuvable n'est JAMAIS remplacé par une valeur
   inventée. La ligne est signalée, ou exclue, mais le chiffre affiché reste
   vrai. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util;
    var M = PF.modele;

    // ------------------------------------------------------------ transactions

    var ALIAS = {
        ticker: 'Ticker', sens: 'Type', type: 'Type', date: 'Date',
        quantite: 'Quantité', cours: 'Cours', frais: 'Frais', devise: 'Devise',
        source: 'Source', reference: 'Référence', montant_net: 'Montant net'
    };

    function valeurLigne(ligne, clefs) {
        for (var i = 0; i < clefs.length; i++) {
            if (ligne[clefs[i]] !== undefined && ligne[clefs[i]] !== null) return ligne[clefs[i]];
            var al = ALIAS[clefs[i]];
            if (al && ligne[al] !== undefined && ligne[al] !== null) return ligne[al];
        }
        return null;
    }

    function chargerTransactions(lignes) {
        var out = [];
        (lignes || []).forEach(function (ligne, i) {
            var ticker = String(valeurLigne(ligne, ['ticker']) || '').toUpperCase().trim();
            var type = String(valeurLigne(ligne, ['sens', 'type']) || '').toLowerCase().trim();
            var date = U.parseDate(valeurLigne(ligne, ['date']));
            if (!ticker || !date) return;
            if (type.indexOf('achat') < 0 && type.indexOf('vente') < 0) return;

            var quantite = U.num(valeurLigne(ligne, ['quantite']), NaN);
            var cours = U.num(valeurLigne(ligne, ['cours']), NaN);
            var frais = U.num(valeurLigne(ligne, ['frais']), 0);
            if (!(quantite > 0) || !(cours > 0)) return;

            var devise = String(valeurLigne(ligne, ['devise']) || '').toUpperCase().trim();
            if (!devise) devise = M.deviseDe(ticker) || '';
            if (!devise) return; // une devise absente n'est jamais devinée

            var net = quantite * cours;
            net = type.indexOf('achat') >= 0 ? net + frais : net - frais;

            var id = valeurLigne(ligne, ['id']);
            out.push({
                id: (id === null || id === undefined || id === '') ? null : Number(id),
                cree_le: valeurLigne(ligne, ['cree_le', 'created_at']) || null,
                ticker: ticker,
                type: type.indexOf('achat') >= 0 ? 'achat' : 'vente',
                date: date,
                quantite: quantite,
                cours: cours,
                frais: frais,
                devise: devise,
                montantNet: U.arrondi(net, 6),
                source: String(valeurLigne(ligne, ['source']) || 'manuel'),
                reference: valeurLigne(ligne, ['reference']) || null
            });
        });

        // Achats avant ventes à date égale : sans cela, une vente rangée avant
        // son achat fait échouer le calcul du PRU.
        out.sort(function (a, b) {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            var oa = a.type === 'achat' ? 0 : 1, ob = b.type === 'achat' ? 0 : 1;
            if (oa !== ob) return oa - ob;
            return a.ticker < b.ticker ? -1 : 1;
        });
        return out;
    }

    // --------------------------------------------------------------- positions

    /* PRU et quantités par ticker, FIFO sur la quantité. Chaque ligne est
       convertie à sa date avec le taux réel — aucune conversion manuelle. */
    function calculerPositions(transactions, anomalies) {
        var positions = {};
        var erreurs = anomalies || [];
        var besoin = [];  // paires [devise, contre] à résoudre

        transactions.forEach(function (t) {
            [['EUR'], ['USD']].forEach(function (c) {
                if (t.devise !== c[0]) besoin.push(t.devise + '|' + c[0] + '|' + t.date);
            });
        });

        var uniq = {};
        besoin.forEach(function (b) { uniq[b] = 1; });

        return Promise.all(Object.keys(uniq).map(function (cle) {
            var p = cle.split('|');
            return PF.net.taux(p[0], p[2], p[1]).then(function (v) { return [cle, v]; });
        })).then(function (paires) {
            var taux = {};
            paires.forEach(function (p) { taux[p[0]] = p[1]; });
            var manquants = {};

            transactions.forEach(function (t) {
                var pos = positions[t.ticker];
                if (!pos) {
                    pos = positions[t.ticker] = {
                        ticker: t.ticker,
                        classe: M.classeDe(t.ticker),
                        poche: (M.pocheDe(t.ticker) || { cle: 'inconnu' }).cle,
                        deviseCotation: t.devise,
                        quantite: 0, coutTotalEur: 0, coutTotalUsd: 0,
                        pruEur: 0, pruUsd: 0, prix: 0,
                        valeurEur: 0, valeurUsd: 0, pvLatenteEur: 0, pvLatenteUsd: 0
                    };
                }

                var tEur = t.devise === 'EUR' ? 1 : taux[t.devise + '|EUR|' + t.date];
                var tUsd = t.devise === 'USD' ? 1 : taux[t.devise + '|USD|' + t.date];
                if (tEur === null || tEur === undefined) {
                    manquants[t.devise + '/EUR'] = 1;
                    tEur = tUsd !== null && tUsd !== undefined ? tUsd : 1;
                }
                if (tUsd === null || tUsd === undefined) tUsd = tEur;

                var montantEur = t.montantNet * tEur;
                var montantUsd = t.montantNet * tUsd;
                // Conservés pour neutraliser les achats/ventes comme flux
                // internes quand la référence précède l'opération.
                t.montantNetEur = montantEur;
                t.montantNetUsd = montantUsd;

                if (t.type === 'achat') {
                    pos.quantite += t.quantite;
                    pos.coutTotalEur += montantEur;
                    pos.coutTotalUsd += montantUsd;
                } else {
                    if (pos.quantite <= 1e-9) {
                        erreurs.push('Vente de ' + U.quantite(t.quantite) + ' ' + t.ticker + ' le '
                            + U.jourMoisAnneeISO(t.date) + ' sans position détenue.');
                        return;
                    }
                    if (t.quantite > pos.quantite + 1e-6) {
                        erreurs.push('Vente de ' + U.quantite(t.quantite) + ' ' + t.ticker + ' le '
                            + U.jourMoisAnneeISO(t.date) + ' supérieure à la quantité détenue ('
                            + U.quantite(pos.quantite) + ').');
                        return;
                    }
                    var pru = pos.coutTotalEur / pos.quantite;
                    var pruU = pos.coutTotalUsd / pos.quantite;
                    pos.coutTotalEur -= pru * t.quantite;
                    pos.coutTotalUsd -= pruU * t.quantite;
                    pos.quantite -= t.quantite;
                    if (pos.quantite <= 1e-9) {
                        pos.quantite = 0; pos.coutTotalEur = 0; pos.coutTotalUsd = 0;
                    }
                }
            });

            Object.keys(positions).forEach(function (k) {
                var p = positions[k];
                p.pruEur = p.quantite > 0 ? p.coutTotalEur / p.quantite : 0;
                p.pruUsd = p.quantite > 0 ? p.coutTotalUsd / p.quantite : 0;
            });

            return { positions: positions, tauxManquants: Object.keys(manquants) };
        });
    }

    /* Valorise les positions au cours du jour. Les échecs sont listés, pas masqués. */
    function valoriser(positions, jour) {
        jour = jour || U.todayISO();
        var cles = Object.keys(positions).filter(function (k) { return positions[k].quantite > 0; });
        var actifs = [], echecs = [];

        return Promise.all(cles.map(function (k) {
            var pos = positions[k];
            return Promise.all([
                PF.net.cours(pos.ticker, jour),
                pos.deviseCotation === 'EUR' ? Promise.resolve(1) : PF.net.taux(pos.deviseCotation, jour, 'EUR'),
                pos.deviseCotation === 'USD' ? Promise.resolve(1) : PF.net.taux(pos.deviseCotation, jour, 'USD')
            ]).then(function (r) {
                return { pos: pos, prix: r[0], tEur: r[1], tUsd: r[2] };
            });
        })).then(function (resultats) {
            resultats.forEach(function (r) {
                var pos = r.pos;
                if (r.prix === null || r.tEur === null || r.tUsd === null) { echecs.push(pos.ticker); return; }
                var devise = r.devise || pos.deviseCotation;
                pos.prix = r.prix;
                pos.valeurEur = pos.quantite * r.prix * r.tEur;
                pos.valeurUsd = pos.quantite * r.prix * r.tUsd;
                pos.pvLatenteEur = pos.valeurEur - pos.coutTotalEur;
                pos.pvLatenteUsd = pos.valeurUsd - pos.coutTotalUsd;
                actifs.push({
                    ticker: pos.ticker,
                    classe: pos.classe,
                    deviseCotation: devise,
                    poche: pos.poche,
                    quantite: pos.quantite,
                    prix: r.prix,
                    valeurEur: pos.valeurEur,
                    valeurUsd: pos.valeurUsd,
                    dernierTaux: r.tEur,
                    dernierTauxUsd: r.tUsd,
                    pruEur: pos.pruEur,
                    pruUsd: pos.pruUsd,
                    coutTotalEur: pos.coutTotalEur,
                    coutTotalUsd: pos.coutTotalUsd,
                    pvLatenteEur: pos.pvLatenteEur,
                    pvLatenteUsd: pos.pvLatenteUsd,
                    variationPct: PF.net.variationRecente(pos.ticker)
                });
            });
            return { actifs: actifs, echecs: echecs };
        });
    }

    // ---------------------------------------------------------- agrégation

    function agregerParPoche(actifs, totalInvestiEur, totalInvestiUsd) {
        var etats = {};
        M.etat.poches.forEach(function (p) {
            etats[p.cle] = { poche: p, valeurEur: 0, valeurUsd: 0, poidsReel: 0, poidsCible: p.cible, actifs: [] };
        });

        actifs.forEach(function (a) {
            var etat = etats[a.poche];
            if (!etat) {
                etat = etats.inconnu = etats.inconnu || {
                    poche: { cle: 'inconnu', nom: 'Non classé', cible: 0, bande: 0, membres: [], perimetre: 'investi', couleur: '#6B7789' },
                    valeurEur: 0, valeurUsd: 0, poidsReel: 0, poidsCible: 0, actifs: []
                };
            }
            etat.actifs.push(a);
            etat.valeurEur += a.valeurEur;
            etat.valeurUsd += a.valeurUsd;
        });

        if (totalInvestiEur > 0 || totalInvestiUsd > 0) {
            Object.keys(etats).forEach(function (k) {
                var e = etats[k];
                if (e.poche.perimetre !== 'investi') { e.poidsReel = 0; return; }
                if (totalInvestiUsd > 0 && e.valeurUsd > 0) e.poidsReel = e.valeurUsd / totalInvestiUsd;
                else if (totalInvestiEur > 0) e.poidsReel = e.valeurEur / totalInvestiEur;
                else e.poidsReel = 0;
            });
        }
        return etats;
    }

    // ------------------------------------------------- lecture des tables

    function lireTable(table, query) {
        return PF.net.supabase.select(table, query).catch(function () { return []; });
    }

    /* La table `Config` de la v1 est un simple couple Clé / Valeur. */
    function lireConfig() {
        return lireTable('Config', 'select=*').then(function (rows) {
            var out = {};
            (rows || []).forEach(function (r) {
                var k = String(r['Clé'] !== undefined ? r['Clé'] : (r.cle !== undefined ? r.cle : r.key) || '').trim();
                var v = r['Valeur'] !== undefined ? r['Valeur'] : (r.valeur !== undefined ? r.valeur : r.value);
                if (k) out[k] = v;
            });
            return out;
        });
    }

    /* La table `Config` de la v1 est un couple Clé / Valeur.
       Un PATCH qui ne touche aucune ligne renvoie 200 avec une liste vide :
       on vérifie donc l'existence de la clé avant de choisir l'écriture. */
    function sauverConfigCle(cle, valeur) {
        return lireTable('Config', 'select=*').then(function (rows) {
            var cleTrouvee = null;
            (rows || []).forEach(function (r) {
                if (cleTrouvee) return;
                if (String(r['Clé'] !== undefined ? r['Clé'] : (r.cle !== undefined ? r.cle : '') || '').trim() === cle) {
                    cleTrouvee = (r['Clé'] !== undefined) ? 'Clé' : 'cle';
                }
            });
            if (!cleTrouvee) {
                return PF.net.supabase.insert('Config', [{ Clé: cle, Valeur: valeur }]);
            }
            return PF.net.supabase.update('Config', { Valeur: valeur },
                cleTrouvee + '=eq.' + encodeURIComponent(cle));
        });
    }

    // --------------------------------------------------------- le contexte

    function contexteVide() {
        return {
            transactions: [], positions: {}, actifs: [], etats: {},
            snapshots: [], apports: [], inflation: {},
            totalInvestiEur: 0, totalPrecautionEur: 0, totalCourantEur: 0, patrimoineTotalEur: 0,
            totalInvestiUsd: 0, totalPrecautionUsd: 0, totalCourantUsd: 0, patrimoineTotalUsd: 0,
            tauxEurUsd: 1.125, coursOr: null, equivalentOrOz: null,
            echecsCours: [], echecsFx: [], erreurs: [], anomaliesTransactions: [],
            allocationCfg: M.allocationDefaut(), etatAllocation: M.verifier(null),
            variationsActifs: {}, capitalInvestiUsd: null, capitalInvestiEur: null,
            liquides: {}, importeLe: null, horodatage: Date.now()
        };
    }

    function charger(options) {
        options = options || {};
        var ctx = contexteVide();

        if (!PF.store.estConfigure()) {
            ctx.erreurs.push('Configuration absente : renseignez l’URL et la clé Supabase.');
            return Promise.resolve(ctx);
        }

        var jour = U.todayISO();

        return Promise.all([
            lireConfig(),
            lireTable('pf2_transactions', 'select=*'),
            lireTable('pf2_apports', 'select=*'),
            lireTable('pf2_snapshots', 'select=*'),
            lireTable('pf2_inflation', 'select=*'),
            lireTable('Donnees', 'select=*'),
            lireTable('Projections', 'select=*'),
            lireTable('Historique', 'select=*')
        ]).then(function (r) {
            var config = r[0], txRows = r[1], apRows = r[2], snRows = r[3], infRows = r[4];
            ctx.donneesV1 = r[5] || [];
            ctx.projections = r[6] || [];
            ctx.historiqueV1 = r[7] || [];

            // --- Allocation personnalisée
            try {
                var brut = config['pf2_allocation_json'];
                if (brut) {
                    var data = JSON.parse(String(brut));
                    if (data && data.actifs) ctx.allocationCfg = data;
                }
                ctx.allocationCfg = M.appliquer(ctx.allocationCfg);
            } catch (e) {
                ctx.allocationCfg = M.appliquer(M.allocationDefaut());
            }
            ctx.etatAllocation = M.verifier(ctx.allocationCfg);

            ctx.snapshotsBruts = snRows || [];
            ctx.apportsBruts = apRows || [];
            ctx.apports = chargerApports(apRows);
            ctx.config = config;

            // --- Inflation
            /* La table est partagée avec l'application Streamlit, et tout le
               monde n'y écrit pas la même unité. On normalise (pourcentage ou
               taux) et on met de côté les lignes qui ne peuvent pas être une
               inflation annuelle : elles seront signalées à l'écran plutôt que
               de passer dans un calcul de rente. */
            ctx.inflationEcartee = [];
            (infRows || []).forEach(function (l) {
                var a = U.num(l.annee !== undefined ? l.annee : l.Annee, 0);
                var brut = U.num(l.inflation !== undefined ? l.inflation : l.Inflation, 0);
                if (!a) return;
                var v = U.inflationDepuisTable(brut);
                if (v === null) { ctx.inflationEcartee.push({ annee: a, valeur: brut }); return; }
                ctx.inflation[a] = v;
            });

            // --- Transactions -> positions
            ctx.transactions = chargerTransactions(txRows);
            if (txRows && txRows.length) {
                for (var i = 0; i < txRows.length; i++) {
                    var c = txRows[i].cree_le || txRows[i].created_at;
                    if (c) { ctx.importeLe = String(c); break; }
                }
            }
            return calculerPositions(ctx.transactions, ctx.anomaliesTransactions);
        }).then(function (res) {
            ctx.positions = res.positions;
            ctx.echecsFx = res.tauxManquants || [];
            return valoriser(ctx.positions, jour);
        }).then(function (v) {
            ctx.actifs = v.actifs;
            ctx.echecsCours = v.echecs;

            // --- Taux EUR -> USD du jour
            return PF.net.taux('EUR', jour, 'USD').then(function (t) {
                ctx.tauxEurUsd = (t && t > 0) ? t : 1.125;
                return completerLiquiditesV1(ctx, jour);
            });
        }).then(function () {
            return variationsActifs(ctx);
        }).then(function () {
            agreger(ctx);

            // --- Or, l'étalon de Gave
            return PF.net.coursOr(jour).then(function (c) {
                ctx.coursOr = c;
                if (c && ctx.totalInvestiUsd > 0) ctx.equivalentOrOz = ctx.totalInvestiUsd / c;
            }).catch(function () { ctx.echecsCours.push(PF.net.TICKER_OR); });
        }).then(function () {
            // --- Historiques en dollars
            enrichirHistoriquesUsd(ctx);
            ctx.serie = PF.metrics.seriePerformance(ctx.snapshots, ctx.apports, ctx.fluxTitresFinal);
            var dernier = ctx.snapshots && ctx.snapshots.length ? ctx.snapshots[ctx.snapshots.length - 1] : null;
            ctx.capitalInvestiUsd = dernier ? U.num(dernier.capital_investi_usd, null) : null;
            ctx.capitalInvestiEur = dernier ? U.num(dernier.capital_investi_eur, null) : null;
            return ctx;
        }).catch(function (e) {
            ctx.erreurs.push(String(e && e.message ? e.message : e));
            return ctx;
        });
    }

    function chargerApports(rows) {
        return (rows || []).map(function (r) {
            var d = U.parseDate(r.date || r.Date);
            var montantEur = U.num(r.montant_eur !== undefined ? r.montant_eur : r.montant, 0);
            return {
                id: r.id,
                date: d,
                type: String(r.sens || r.type || r.Type || 'apport'),
                montant_eur: montantEur,
                montant_or: U.num(r.montant_or, 0),
                cours_or: U.num(r.cours_or, 0),
                reference: r.reference || null,
                montant_usd: null
            };
        }).filter(function (a) { return a.date; })
            .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    }

    /* Les liquidités de la v1 (CHF, CNY, USD, EUR) n'étaient pas dans
       `Transaction` mais dans la table `Donnees`. On les rattache ici pour que
       l'épargne de précaution et le compte courant apparaissent. */
    function completerLiquiditesV1(ctx, jour) {
        var deja = {};
        ctx.actifs.forEach(function (a) { if (a.quantite > 0) deja[a.ticker] = 1; });
        if (deja['CHF'] || deja['CNY']) return Promise.resolve();

        var lignes = (ctx.donneesV1 || []).filter(function (r) {
            var t = String(r.Ticker || r.ticker || '').toUpperCase().trim();
            var typ = String(r.Type || r.type || '');
            return ((['CHF', 'CNY', 'USD', 'EUR'].indexOf(t) >= 0) || typ.toLowerCase().indexOf('cash') >= 0)
                && !deja[t];
        });

        return Promise.all(lignes.map(function (r) {
            var t = String(r.Ticker || r.ticker || '').toUpperCase().trim();
            var typ = String(r.Type || r.type || '');
            var qte = U.num(String(r['Quantité'] !== undefined ? r['Quantité'] : r.Quantite || 0).replace(/ /g, '').replace(',', '.'), 0);
            if (!(qte > 0)) return Promise.resolve(null);
            return Promise.all([
                t === 'EUR' ? Promise.resolve(1) : PF.net.taux(t, jour, 'EUR'),
                t === 'USD' ? Promise.resolve(1) : PF.net.taux(t, jour, 'USD')
            ]).then(function (v) {
                if (v[0] === null || v[1] === null) return null;
                var poche = M.pocheDe(t);
                var clePoche = poche ? poche.cle : (typ.toLowerCase().indexOf('réserve') >= 0 || typ.toLowerCase().indexOf('reserve') >= 0 ? 'precaution' : 'courant');
                ctx.actifs.push({
                    ticker: t, classe: 'espece', deviseCotation: t, poche: clePoche,
                    quantite: qte, prix: 1, valeurEur: qte * v[0], valeurUsd: qte * v[1],
                    dernierTaux: v[0], dernierTauxUsd: v[1], pruEur: 1, pruUsd: 1,
                    coutTotalEur: qte * v[0], coutTotalUsd: qte * v[1],
                    pvLatenteEur: 0, pvLatenteUsd: 0, variationPct: 0
                });
                ctx.liquides[t] = { quantite: qte, type: typ };
                return null;
            });
        })).then(function () { return null; });
    }

    /* Variation depuis le dernier enregistrement : le cours Yahoo d'abord, la
       table `Donnees` de la v1 ensuite. */
    function variationsActifs(ctx) {
        var varsV1 = variationsDonneesV1(ctx.donneesV1 || []);
        return Promise.all(ctx.actifs.map(function (a) {
            if (a.variationPct !== null && a.variationPct !== undefined) return Promise.resolve(a);
            return PF.net.deviseDe(a.ticker).then(function () {
                a.variationPct = PF.net.variationRecente(a.ticker);
                return a;
            });
        })).then(function () {
            ctx.actifs.forEach(function (a) {
                var v = a.variationPct;
                var info = varsV1[a.ticker.toUpperCase()] || {};
                if ((v === null || v === undefined || Math.abs(v) <= 1e-6) && info) {
                    if (info.cours_usd && info.cours_usd > 0 && a.deviseCotation === 'USD' && a.prix > 0
                        && Math.abs(a.prix - info.cours_usd) > 1e-4) {
                        v = a.prix / info.cours_usd - 1;
                    } else if (info.var_fraction !== null && info.var_fraction !== undefined) {
                        v = info.var_fraction;
                    }
                }
                a.variationPct = (v === null || v === undefined) ? 0 : v;
                ctx.variationsActifs[a.ticker] = a.variationPct;
            });
        });
    }

    function variationsDonneesV1(rows) {
        var res = {};
        (rows || []).forEach(function (r) {
            var t = String(r.Ticker || r.ticker || '').toUpperCase().trim();
            if (!t) return;
            var coursU = null;
            ['Court Num', 'Court'].forEach(function (col) {
                if (coursU !== null) return;
                var v = r[col];
                if (v !== undefined && v !== null) {
                    var m = /([+-]?\d+(?:[.,]\d+)?)/.exec(String(v).replace(/ |\u202f/g, ''));
                    if (m) { var f = parseFloat(m[1].replace(',', '.')); if (f > 0) coursU = f; }
                }
            });
            var varF = null;
            ['Var. Jour 🔒', 'Var. Jour', 'Var Jour'].forEach(function (col) {
                if (varF !== null) return;
                var v = r[col];
                if (v !== undefined && v !== null) {
                    var s = String(v).trim();
                    var m = /([+-]?\d+(?:[.,]\d+)?)/.exec(s.replace(/ /g, ''));
                    if (m) {
                        var p = parseFloat(m[1].replace(',', '.'));
                        if (s.indexOf('↘') >= 0 || s.indexOf('-') >= 0) p = -Math.abs(p);
                        else if (s.indexOf('↗') >= 0 || s.indexOf('+') >= 0) p = Math.abs(p);
                        varF = p / 100;
                    }
                }
            });
            res[t] = { cours_usd: coursU, var_fraction: varF };
        });
        return res;
    }

    function agreger(ctx) {
        var perEur = { investi: 0, precaution: 0, courant: 0 };
        var perUsd = { investi: 0, precaution: 0, courant: 0 };
        ctx.actifs.forEach(function (a) {
            var p = M.etat.parCle[a.poche];
            var cle = p ? p.perimetre : 'investi';
            perEur[cle] = (perEur[cle] || 0) + a.valeurEur;
            perUsd[cle] = (perUsd[cle] || 0) + a.valeurUsd;
        });
        ctx.totalInvestiEur = perEur.investi || 0;
        ctx.totalPrecautionEur = perEur.precaution || 0;
        ctx.totalCourantEur = perEur.courant || 0;
        ctx.patrimoineTotalEur = perEur.investi + perEur.precaution + perEur.courant;
        ctx.totalInvestiUsd = perUsd.investi || 0;
        ctx.totalPrecautionUsd = perUsd.precaution || 0;
        ctx.totalCourantUsd = perUsd.courant || 0;
        ctx.patrimoineTotalUsd = perUsd.investi + perUsd.precaution + perUsd.courant;
        ctx.etats = agregerParPoche(ctx.actifs, ctx.totalInvestiEur, ctx.totalInvestiUsd);
    }

    /* Attache les colonnes en dollars aux apports et aux snapshots, puis ajoute
       un point distinct pour la valorisation en direct du jour. */
    function enrichirHistoriquesUsd(ctx) {
        var taux = ctx.tauxEurUsd > 0 ? ctx.tauxEurUsd : 1.125;

        // --- Apports en USD
        var usdParRef = {};
        (ctx.historiqueV1 || []).forEach(function (r) {
            var montant = r['Montant $'] !== undefined ? r['Montant $'] : r.montant_usd;
            if (r.id !== undefined && montant !== undefined && montant !== null) {
                usdParRef['v1:id' + r.id] = Math.abs(U.num(montant, 0));
            }
        });
        (ctx.apports || []).forEach(function (a) {
            var ref = String(a.reference || '');
            if (ref.indexOf('usd:') === 0) {
                var v = parseFloat(ref.split(':')[1]);
                if (isFinite(v)) { a.montant_usd = U.arrondi(Math.abs(v), 2); return; }
            }
            if (usdParRef[ref] !== undefined) { a.montant_usd = U.arrondi(usdParRef[ref], 2); return; }
            if (a.montant_or > 0 && a.cours_or > 0) { a.montant_usd = U.arrondi(a.montant_or * a.cours_or, 2); return; }
            a.montant_usd = U.arrondi(a.montant_eur * taux, 2);
        });

        // --- Snapshots : `Projections` (v1, en dollars) + `pf2_snapshots`
        var snaps = (ctx.snapshotsBruts || []).slice();
        var proj = (ctx.projections || []).slice();
        var parDate = {};
        snaps.forEach(function (s) {
            var d = U.parseDate(s.date || s.Date);
            if (d) parDate[d] = s;
        });

        var lignes = [];
        if (proj.length) {
            var projTriees = proj.map(function (r) {
                var d = U.parseDate(r.Date || r.date);
                return {
                    d: d,
                    invU: U.num(r['Actifs Stratégiques'] !== undefined ? r['Actifs Stratégiques'] : r.actifs_strategiques, 0),
                    totU: U.num(r['Total Global'] !== undefined ? r['Total Global'] : r.total_global, 0),
                    capU: U.num(r['Capital investi'] !== undefined ? r['Capital investi'] : r.capital_investi, 0)
                };
            }).filter(function (p) { return p.d && p.invU > 0; })
                .sort(function (a, b) { return a.d < b.d ? -1 : (a.d > b.d ? 1 : 0); });

            projTriees.forEach(function (p) {
                var s = parDate[p.d] || {};
                var invE = U.num(s.patrimoine_investi_eur, U.arrondi(p.invU / taux, 2));
                var ratio = invE > 0 ? p.invU / invE : taux;
                var totU = p.totU > 0 ? p.totU : p.invU;
                var totE = U.num(s.patrimoine_total_eur, U.arrondi(totU / ratio, 2));
                if (totU > p.invU && totE <= invE) totE = U.arrondi(invE + (totU - p.invU) / ratio, 2);
                lignes.push({
                    date: p.d,
                    patrimoine_investi_usd: U.arrondi(p.invU, 2),
                    patrimoine_total_usd: U.arrondi(totU, 2),
                    precaution_usd: U.arrondi(Math.max(totU - p.invU, 0), 2),
                    courant_usd: 0,
                    capital_investi_usd: p.capU > 0 ? U.arrondi(p.capU, 2) : null,
                    patrimoine_investi_eur: U.arrondi(invE, 2),
                    patrimoine_total_eur: U.arrondi(totE, 2),
                    precaution_eur: U.arrondi(Math.max(totE - invE, 0), 2),
                    courant_eur: 0,
                    cours_or_usd: U.num(s.cours_or_usd, null),
                    equivalent_or_oz: U.num(s.equivalent_or_oz, null)
                });
            });

            var maxProj = projTriees.length ? projTriees[projTriees.length - 1].d : '';
            snaps.forEach(function (s) {
                var d = U.parseDate(s.date || s.Date);
                if (!d || (maxProj && d <= maxProj)) return;
                lignes.push(snapshotVersUsd(s, d, taux, ctx));
            });
        } else {
            snaps.forEach(function (s) {
                var d = U.parseDate(s.date || s.Date);
                if (d) lignes.push(snapshotVersUsd(s, d, taux, ctx));
            });
        }

        lignes.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

        // La dernière référence pf2 fait foi même si Projections porte la
        // même date. Garder le capital v1, pas une autre valorisation USD.
        if (lignes.length) {
            var idxDernier = lignes.length - 1;
            var ref = parDate[lignes[idxDernier].date];
            if (ref) {
                var capDernier = lignes[idxDernier].capital_investi_usd;
                lignes[idxDernier] = snapshotVersUsd(ref, lignes[idxDernier].date, taux, ctx);
                lignes[idxDernier].capital_investi_usd = capDernier;
            }
        }

        ctx.snapshots = lignes;
        // Ne jamais remplacer le snapshot nocturne par le direct.
        var jourLive = U.todayISO();
        if (lignes.length && ctx.totalInvestiUsd > 0 && lignes[lignes.length - 1].date <= jourLive) {
            lignes.push({
                date: jourLive, _live: true,
                patrimoine_investi_usd: U.arrondi(ctx.totalInvestiUsd, 2),
                patrimoine_investi_eur: U.arrondi(ctx.totalInvestiEur, 2),
                patrimoine_total_usd: U.arrondi(ctx.patrimoineTotalUsd, 2),
                patrimoine_total_eur: U.arrondi(ctx.patrimoineTotalEur, 2),
                precaution_usd: U.arrondi(ctx.totalPrecautionUsd, 2),
                precaution_eur: U.arrondi(ctx.totalPrecautionEur, 2),
                courant_usd: U.arrondi(ctx.totalCourantUsd, 2),
                courant_eur: U.arrondi(ctx.totalCourantEur, 2),
                equivalent_or_oz: ctx.equivalentOrOz, cours_or_usd: ctx.coursOr
            });
        }

        // --- Achats et ventes de titres enregistrés APRÈS la dernière référence
        // Payer des titres avec des liquidités ne change pas la richesse : c'est
        // un transfert du périmètre « courant » vers le périmètre « investi ».
        // Compté comme un gain, il gonfle la performance du montant de l'achat —
        // c'est l'artefact du 07/10/2026 (68 FLXC.L, 1 943,91 $ : +2,85 %
        // affichés au lieu de -0,38 %).
        //
        // Le test décisif n'est pas la date de l'opération mais son
        // ENREGISTREMENT : une opération saisie après le snapshot ne peut pas y
        // figurer, même si elle porte la même date. L'horodatage `cree_le` le dit
        // exactement ; à défaut, on retient les opérations postérieures à la date
        // de la référence (jamais les mêmes, pour ne pas compter deux fois).
        var derniereRef = null, refTemps = NaN;
        for (var k = lignes.length - 1; k >= 0; k--) {
            if (!lignes[k]._live) {
                derniereRef = lignes[k].date;
                refTemps = lignes[k].cree_le ? Date.parse(lignes[k].cree_le) : NaN;
                break;
            }
        }
        ctx.fluxTitresFinal = 0;
        (ctx.transactions || []).forEach(function (t) {
            if (!derniereRef || !t.date) return;
            var m = U.num(t.montantNetUsd, null);
            if (m === null || !isFinite(m) || m === 0) return;
            var cree = t.cree_le ? Date.parse(t.cree_le) : NaN;
            var apres = (isFinite(cree) && isFinite(refTemps))
                ? cree > refTemps
                : t.date > derniereRef;
            if (!apres) return;
            var signe = t.type === 'achat' ? 1 : -1;
            ctx.fluxTitresFinal = U.arrondi(ctx.fluxTitresFinal + signe * Math.abs(m), 2);
        });

        propagerCapitalInvesti(ctx, taux);
    }

    function snapshotVersUsd(s, d, taux, ctx) {
        var invE = U.num(s.patrimoine_investi_eur, 0);
        var totE = U.num(s.patrimoine_total_eur, invE);
        var oz = U.num(s.equivalent_or_oz, 0);
        var co = U.num(s.cours_or_usd, 0);
        var invU, totU;
        if (oz > 0 && co > 0) {
            invU = oz * co;
            var ratio = invE > 0 ? invU / invE : taux;
            totU = totE * ratio;
        } else {
            invU = invE * taux;
            totU = totE * taux;
        }
        if (totE <= invE && ctx.totalPrecautionEur > 0) {
            totE = U.arrondi(invE + ctx.totalPrecautionEur + ctx.totalCourantEur, 2);
            totU = U.arrondi(invU + ctx.totalPrecautionUsd + ctx.totalCourantUsd, 2);
        }
        return {
            date: d,
            cree_le: s.cree_le || s.created_at || null,
            patrimoine_investi_usd: U.arrondi(invU, 2),
            patrimoine_total_usd: U.arrondi(totU, 2),
            precaution_usd: U.arrondi(Math.max(totU - invU, 0), 2),
            courant_usd: U.num(s.courant_usd, 0),
            capital_investi_usd: U.num(s.capital_investi_usd, null),
            patrimoine_investi_eur: U.arrondi(invE, 2),
            patrimoine_total_eur: U.arrondi(totE, 2),
            precaution_eur: U.arrondi(Math.max(totE - invE, 0), 2),
            courant_eur: U.num(s.courant_eur, 0),
            cours_or_usd: co || null,
            equivalent_or_oz: oz || null
        };
    }

    /* Un capital investi à 0 est une valeur manquante (NULL en base) : on
       propage le dernier connu augmenté des apports de la période. Aucune date
       n'affiche « — » à cause d'un trou. */
    function propagerCapitalInvesti(ctx, taux) {
        var snaps = ctx.snapshots || [];
        if (!snaps.length) return;
        var dates = snaps.map(function (s) { return s.date; });
        var fluxJour = {};
        (ctx.apports || []).forEach(function (a) {
            // Montants stockés positifs : le signe vient de `sens`. Sans cela,
            // un retrait ferait monter le capital investi.
            fluxJour[a.date] = (fluxJour[a.date] || 0) + PF.metrics.montantSigne(a, 'montant_usd');
        });
        var flux = PF.metrics.fluxParPeriode(dates, fluxJour, 0);

        var cumulConnu = 0, premierConnu = false;
        snaps.forEach(function (s, i) {
            var c = U.num(s.capital_investi_usd, 0);
            if (c > 0 && !premierConnu) { premierConnu = true; cumulConnu = c; }
            else if (c > 0) cumulConnu = c;
            else if (premierConnu) cumulConnu = U.arrondi(cumulConnu + (flux[i] || 0), 2);
            s.capital_investi_usd = premierConnu ? cumulConnu : null;
            if (s.capital_investi_usd) {
                var invU = U.num(s.patrimoine_investi_usd, 0), invE = U.num(s.patrimoine_investi_eur, 0);
                var ratio = (invU > 0 && invE > 0) ? invU / invE : taux;
                s.capital_investi_eur = U.arrondi(s.capital_investi_usd / ratio, 2);
            } else {
                s.capital_investi_eur = null;
            }
        });

        // Si aucun capital n'est connu, on le reconstitue par cumul des apports.
        if (!premierConnu) {
            var cumul = 0, aDates = Object.keys(fluxJour).sort();
            snaps.forEach(function (s) {
                cumul = 0;
                aDates.forEach(function (d) { if (d <= s.date) cumul += fluxJour[d]; });
                s.capital_investi_usd = cumul > 0 ? U.arrondi(cumul, 2) : null;
                if (s.capital_investi_usd) {
                    var invU = U.num(s.patrimoine_investi_usd, 0), invE = U.num(s.patrimoine_investi_eur, 0);
                    var ratio = (invU > 0 && invE > 0) ? invU / invE : taux;
                    s.capital_investi_eur = U.arrondi(s.capital_investi_usd / ratio, 2);
                } else s.capital_investi_eur = null;
            });
        }
    }

    PF.portefeuille = {
        agreger: agreger,
        chargerTransactions: chargerTransactions,
        calculerPositions: calculerPositions,
        valoriser: valoriser,
        agregerParPoche: agregerParPoche,
        charger: charger,
        lireConfig: lireConfig,
        sauverConfigCle: sauverConfigCle,
        contexteVide: contexteVide,
        enrichirHistoriquesUsd: enrichirHistoriquesUsd
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
