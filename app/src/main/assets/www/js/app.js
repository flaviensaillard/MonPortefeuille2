/* Coque applicative : navigation, chargement, actions.
   Le contexte est calculé une fois puis réutilisé par les cinq écrans ; un
   appui sur ⟳ relance une lecture complète (cours + base) en arrière-plan. */
(function (root) {
    'use strict';
    var PF = root.PF;
    var U = PF.util, M = PF.modele, UI = PF.ui;

    var DEVISES = [
        { valeur: 'USD', texte: 'USD — dollar ($)' },
        { valeur: 'EUR', texte: 'EUR — euro (€)' },
        { valeur: 'CHF', texte: 'CHF — franc suisse' },
        { valeur: 'GBP', texte: 'GBP — livre (£)' },
        { valeur: 'JPY', texte: 'JPY — yen' },
        { valeur: 'CNY', texte: 'CNY — yuan' },
        { valeur: 'CAD', texte: 'CAD — dollar canadien' },
        { valeur: 'AUD', texte: 'AUD — dollar australien' },
        { valeur: 'HKD', texte: 'HKD — dollar de Hong Kong' },
        { valeur: 'SGD', texte: 'SGD — dollar de Singapour' },
        { valeur: 'NOK', texte: 'NOK — couronne norvégienne' },
        { valeur: 'SEK', texte: 'SEK — couronne suédoise' },
        { valeur: 'DKK', texte: 'DKK — couronne danoise' }
    ];

    var COMPTES = [
        { valeur: 'courant_usd', texte: 'Compte courant USD', ticker: 'USD' },
        { valeur: 'courant_eur', texte: 'Compte courant EUR', ticker: 'EUR' },
        { valeur: 'precaution_chf', texte: 'Épargne de précaution CHF', ticker: 'CHF' },
        { valeur: 'precaution_cny', texte: 'Épargne de précaution CNY', ticker: 'CNY' },
        { valeur: 'courtier', texte: 'Compte titres (Swissquote)', ticker: null }
    ];

    var ONGLETS = {
        bord: { titre: 'Tableau de bord', sous: '' },
        portefeuille: { titre: 'Portefeuille', sous: 'positions & opérations' },
        performance: { titre: 'Performance', sous: 'mesure corrigée des apports' },
        retraite: { titre: 'Retraite', sous: 'projection & rente réelle' },
        fiscalite: { titre: 'Fiscalité', sous: 'déclaration & simulation' }
    };

    var etat = {
        onglet: 'bord',
        ctx: null,
        chargement: false,
        synchroniseLe: null,
        demo: false
    };

    // ------------------------------------------------------------ démarrage

    function demarrer() {
        UI.$('#nav').addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('button[data-onglet]') : null;
            if (!b) return;
            naviguer(b.getAttribute('data-onglet'));
        });

        UI.$('#btnRefresh').addEventListener('click', function () { rafraichir(true); });
        UI.$('#btnReglages').addEventListener('click', feuilleReglages);
        UI.$('#view').addEventListener('click', gererClic);
        installerPullToRefresh();

        etat.onglet = PF.store.ongletCourant('bord');
        naviguer(etat.onglet, true);

        var cache = PF.store.lireCache();
        if (cache && cache.ctx) {
            try { etat.ctx = rehydrater(cache.ctx); rendre(); } catch (e) { /* cache illisible */ }
        }

        if (!PF.store.estConfigure()) { feuilleConnexion(true); return; }
        rafraichir(false);
    }

    function rehydrater(c) {
        if (c.allocationCfg) { try { M.appliquer(c.allocationCfg); } catch (e) { /* cfg invalide */ } }
        if (c.snapshots) c.serie = PF.metrics.seriePerformance(c.snapshots, c.apports || []);
        return c;
    }

    function naviguer(onglet, silencieux) {
        etat.onglet = onglet;
        PF.store.sauverOnglet(onglet);
        UI.$$('#nav button').forEach(function (b) {
            b.classList.toggle('actif', b.getAttribute('data-onglet') === onglet);
        });
        if (typeof root.Native !== 'undefined' && root.Native.haptic) {
            try { root.Native.haptic(10); } catch (e) { /* pas de vibreur */ }
        }
        var t = ONGLETS[onglet] || ONGLETS.bord;
        var sous = etat.chargement ? 'mise à jour…'
            : (etat.synchroniseLe ? 'synchronisé ' + etat.synchroniseLe : 'chargement…');
        UI.$('#titreOnglet').innerHTML = UI.h(t.titre) + '<span class="sub">' + UI.h(sous) + '</span>';
        rendre(silencieux);
    }

    function rendre(silencieux) {
        var vue = UI.$('#view');
        if (!etat.ctx) {
            vue.innerHTML = ''
                + '<div class="card gold" style="text-align:center;padding:26px 18px">'
                + '<div style="font-size:34px;margin-bottom:10px">◈</div>'
                + '<div style="font-size:19px;font-weight:700;margin-bottom:6px">Porte-feuille</div>'
                + '<div style="font-size:13.5px;color:var(--txt-2);line-height:1.5">Votre patrimoine, en dollars, '
                + 'avec l’indication en euros. Deux champs à remplir une seule fois : l’application lit '
                + 'ensuite directement vos tables.</div>'
                + '<button class="btn" id="btnAccueilConnexion" style="margin-top:16px">Se connecter à ma base</button>'
                + '<button class="btn ghost" id="btnAccueilDemo" style="margin-top:9px">Découvrir sans me connecter</button>'
                + '</div>';
            return;
        }
        var fn = PF.vues[etat.onglet] || PF.vues.bord;
        var entete = '';
        (etat.ctx.erreurs || []).forEach(function (e) {
            entete += '<div class="erreur">' + UI.h(e) + '</div>';
        });
        (etat.ctx.anomaliesTransactions || []).slice(0, 3).forEach(function (e) {
            entete += '<div class="info">' + UI.h(e) + '</div>';
        });
        vue.innerHTML = entete + fn(etat.ctx);
        if (!silencieux) {
            vue.classList.remove('enter');
            void vue.offsetWidth;
            vue.classList.add('enter');
        }
        UI.lierAccordeons(vue);
        if (etat.onglet === 'fiscalite' && PF.fiscal && PF.fiscal.attacher) {
            vue.dataset.fiscal = '';
            PF.fiscal.attacher();
        }
    }

    function rafraichir(viderCours) {
        if (etat.chargement) return;
        etat.chargement = true;
        var bouton = UI.$('#btnRefresh');
        bouton.classList.add('spin');
        if (viderCours) PF.net.viderCache();

        var promesse = etat.demo ? Promise.resolve(demoContexte()) : PF.portefeuille.charger();

        promesse.then(function (ctx) {
            etat.ctx = ctx;
            etat.chargement = false;
            bouton.classList.remove('spin');
            var maintenant = new Date();
            etat.synchroniseLe = String(maintenant.getHours()).padStart(2, '0') + 'h'
                + String(maintenant.getMinutes()).padStart(2, '0');
            naviguer(etat.onglet, true);
            if (!etat.demo) {
                PF.store.sauverCache({ ctx: alleger(ctx) });
            }
            var nbErr = (ctx.erreurs || []).length;
            if (nbErr) UI.toast('Données partiellement chargées');
        }).catch(function (e) {
            etat.chargement = false;
            bouton.classList.remove('spin');
            UI.toast('Actualisation impossible : ' + (e && e.message ? e.message : 'réseau'));
        });
    }

    /* Le cache local ne garde que le nécessaire : les cours sont re-téléchargés. */
    function alleger(ctx) {
        return {
            allocationCfg: ctx.allocationCfg,
            snapshots: ctx.snapshots,
            apports: ctx.apports,
            inflation: ctx.inflation,
            tauxEurUsd: ctx.tauxEurUsd,
            capitalInvestiUsd: ctx.capitalInvestiUsd,
            erreurs: ctx.erreurs
        };
    }

    // ============================================================= ACTIONS

    function gererClic(e) {
        var cible = e.target.closest ? e.target : null;
        if (!cible) return;

        var chip = cible.closest('[data-chip]');
        if (chip) {
            PF.vues.definirOngletPortefeuille(chip.getAttribute('data-chip'));
            rendre();
            return;
        }
        var periode = cible.closest('[data-periode]');
        if (periode) {
            PF.vues.definirPeriode(periode.getAttribute('data-periode'));
            rendre();
            return;
        }
        if (cible.closest('#btnAccueilConnexion')) { feuilleConnexion(false); return; }
        if (cible.closest('#btnAccueilDemo')) {
            etat.demo = true;
            rafraichir(false);
            return;
        }
        if (cible.closest('#btnNouveau')) { feuilleNouveau(); return; }
        if (cible.closest('#btnNouvelActif')) { feuilleNouvelActif(); return; }
        if (cible.closest('#btnReinitAlloc')) {
            UI.confirmer('Rétablir l’allocation par défaut',
                'Les cibles et bandes reviendront aux valeurs d’origine (Or 15 %, Bitcoin 5 %, Énergie 30 %, Asie 30 %, JGB 20 %).',
                'Rétablir', function () {
                    var def = M.allocationDefaut();
                    M.appliquer(def);
                    sauvegarderAllocation(def);
                });
            return;
        }
        if (cible.closest('#btnExecuter')) { feuilleOrdres(); return; }

        var alloc = cible.closest('[data-alloc]');
        if (alloc) { feuilleAllocActif(alloc.getAttribute('data-alloc')); return; }

        var poche = cible.closest('[data-pochealloc]');
        if (poche) { feuilleAllocPoche(poche.getAttribute('data-pochealloc')); return; }

        var tx = cible.closest('[data-tx]');
        if (tx) { feuilleTransaction(tx.getAttribute('data-tx')); return; }

        var ap = cible.closest('[data-apport]');
        if (ap) { feuilleApport(ap.getAttribute('data-apport')); return; }

        var pos = cible.closest('[data-pos]');
        if (pos) { feuillePosition(pos.getAttribute('data-pos')); return; }

        var reg = cible.closest('[data-reglage]');
        if (reg) { feuilleReglage(reg.getAttribute('data-reglage')); return; }

        var ord = cible.closest('[data-ordre]');
        if (ord) { feuilleOrdre(Number(ord.getAttribute('data-ordre'))); return; }
    }

    // ------------------------------------------------------------- connexion

    function feuilleConnexion(premiereFois) {
        var r = PF.store.reglages();
        var corps = ''
            + UI.champ({ id: 'cxUrl', label: 'URL du projet Supabase', valeur: r.supabaseUrl, placeholder: 'https://xxxx.supabase.co' })
            + UI.champ({ id: 'cxCle', label: 'Clé publique (anon key)', valeur: r.supabaseKey, placeholder: 'eyJhbGci…' })
            + '<div style="font-size:12px;color:var(--txt-3);margin:2px 0 6px">Ces deux valeurs restent sur votre téléphone. '
            + 'Elles ne sont envoyées à personne d’autre qu’à votre base Supabase.</div>'
            + '<button class="btn ghost" id="cxTest" style="margin-bottom:10px">Tester la connexion</button>'
            + '<button class="btn sec" id="cxDemo" style="margin-bottom:4px">Découvrir sans me connecter</button>';

        function enregistrer() {
            var url = String(UI.lire('cxUrl') || '').trim().replace(/\/+$/, '');
            var cle = String(UI.lire('cxCle') || '').trim();
            if (!url || !cle) { UI.toast('URL et clé sont nécessaires'); return false; }
            PF.store.sauverReglages({ supabaseUrl: url, supabaseKey: cle, onboardingFait: true });
            UI.toast('Connexion enregistrée');
            rafraichir(true);
            return true;
        }

        var f = UI.feuille({
            titre: premiereFois ? 'Bienvenue dans Porte-feuille' : 'Connexion Supabase',
            aide: premiereFois ? 'Deux champs à remplir, une seule fois. L’application lit ensuite vos tables directement.' : '',
            corps: corps,
            boutons: [
                { texte: 'Annuler', sorte: 'ghost' },
                { texte: 'Enregistrer', sorte: '', garder: true, action: enregistrer }
            ]
        });

        var corpsEl = f.corps;
        if (corpsEl) {
            var bt = corpsEl.querySelector('#cxTest');
            if (bt) bt.addEventListener('click', function () {
                var url = String(UI.lire('cxUrl') || '').trim().replace(/\/+$/, '');
                var cle = String(UI.lire('cxCle') || '').trim();
                if (!url || !cle) { UI.toast('Renseignez les deux champs'); return; }
                PF.store.sauverReglages({ supabaseUrl: url, supabaseKey: cle });
                bt.textContent = 'Test en cours…';
                PF.net.supabase.tester().then(function (res) {
                    bt.textContent = res.ok ? '✓ Connexion établie' : '✗ ' + res.detail.slice(0, 60);
                });
            });
            var bd = corpsEl.querySelector('#cxDemo');
            if (bd) bd.addEventListener('click', function () {
                document.querySelector('#voile').click();
                etat.demo = true;
                rafraichir(false);
            });
        }
    }

    // ------------------------------------------------------------- opérations

    function feuilleNouveau() {
        UI.choix('Que voulez-vous enregistrer ?', [
            { texte: 'Un achat de titres', icone: '＋', cle: 'achat' },
            { texte: 'Une vente de titres', icone: '－', cle: 'vente' },
            { texte: 'Un apport de fonds', icone: '↓', cle: 'apport' },
            { texte: 'Un retrait de fonds', icone: '↑', cle: 'retrait' }
        ], function (o) {
            if (o.cle === 'achat' || o.cle === 'vente') feuilleTransaction(null, o.cle);
            else feuilleApport(null, o.cle);
        });
    }

    function feuilleTransaction(id, sensForce) {
        var ctx = etat.ctx || {};
        var existante = null;
        if (id) {
            existante = (ctx.transactions || []).filter(function (t) { return String(t.id) === String(id); })[0] || null;
        }
        var tickers = Object.keys((ctx.positions || {}));
        (M.etat.actifs || []).forEach(function (a) { if (tickers.indexOf(a.ticker) < 0) tickers.push(a.ticker); });
        if (!tickers.length) tickers = ['IGLN.L', 'BTCUSDT', 'XDW0.L', 'FLXC.L', 'XJSE.SW'];

        var sens = sensForce || (existante ? existante.type : 'achat');
        var corps = ''
            + UI.champ({ id: 'txSens', label: 'Sens', type: 'select', valeur: sens, options: [{ valeur: 'achat', texte: 'Achat' }, { valeur: 'vente', texte: 'Vente' }] })
            + UI.champ({
                id: 'txTicker', label: 'Titre', type: 'select', valeur: existante ? existante.ticker : tickers[0],
                options: tickers.map(function (t) { return { valeur: t, texte: t + ' — ' + M.nomDe(t) }; })
            })
            + '<div style="display:flex;gap:10px">'
            + '<div style="flex:1">' + UI.champ({ id: 'txDate', label: 'Date', type: 'date', valeur: existante ? existante.date : U.todayISO() }) + '</div>'
            + '<div style="flex:1">' + UI.champ({ id: 'txQuantite', label: 'Quantité', type: 'number', valeur: existante ? existante.quantite : '' }) + '</div>'
            + '</div>'
            + '<div style="display:flex;gap:10px">'
            + '<div style="flex:1">' + UI.champ({ id: 'txCours', label: 'Cours', type: 'number', valeur: existante ? existante.cours : '' }) + '</div>'
            + '<div style="flex:1">' + UI.champ({ id: 'txFrais', label: 'Frais', type: 'number', valeur: existante ? existante.frais : 0 }) + '</div>'
            + '</div>'
            + UI.champ({ id: 'txDevise', label: 'Devise de cotation', type: 'select', valeur: existante ? existante.devise : 'USD', options: DEVISES })
            + UI.champ({ id: 'txCompte', label: 'Compte', type: 'select', valeur: 'courtier', options: COMPTES });

        var f = UI.feuille({
            titre: existante ? 'Modifier l’opération' : 'Nouvelle opération',
            corps: corps,
            boutons: existante ? [
                { texte: 'Supprimer', sorte: 'danger', action: function () { supprimerTransaction(existante); } },
                { texte: 'Enregistrer', sorte: '', garder: true, action: function () { enregistrerTransaction(existante); } }
            ] : [
                { texte: 'Annuler', sorte: 'ghost' },
                { texte: 'Enregistrer', sorte: '', garder: true, action: function () { enregistrerTransaction(null); } }
            ]
        });

        var corpsEl = f.corps;
        if (corpsEl) {
            corpsEl.querySelector('#txTicker').addEventListener('change', function () {
                var t = this.value;
                var d = M.deviseDe(t);
                if (d) corpsEl.querySelector('#txDevise').value = d;
            });
        }
    }

    function lireForm(noms) {
        var o = {};
        noms.forEach(function (n) { o[n] = UI.lire(n); });
        return o;
    }

    function enregistrerTransaction(existante) {
        var v = lireForm(['txSens', 'txTicker', 'txDate', 'txQuantite', 'txCours', 'txFrais', 'txDevise', 'txCompte']);
        var ticker = String(v.txTicker || '').toUpperCase().trim();
        var date = U.parseDate(v.txDate);
        var quantite = U.num(v.txQuantite, NaN);
        var cours = U.num(v.txCours, NaN);
        var frais = U.num(v.txFrais, 0);
        var devise = String(v.txDevise || '').toUpperCase();

        if (!ticker || !date || !(quantite > 0) || !(cours > 0)) { UI.toast('Titre, date, quantité et cours sont requis'); return; }

        var ligne = {
            ticker: ticker, sens: v.txSens === 'vente' ? 'vente' : 'achat', date: date,
            quantite: quantite, cours: cours, frais: frais, devise: devise,
            source: 'appli', reference: null, note: null
        };

        var compte = COMPTES.filter(function (c) { return c.valeur === v.txCompte; })[0];
        var montantDevise = quantite * cours + (ligne.sens === 'achat' ? frais : -frais);

        var promesse;
        if (existante && existante.id) {
            promesse = PF.net.supabase.update('pf2_transactions', ligne, 'id=eq.' + existante.id);
        } else {
            promesse = PF.net.supabase.insert('pf2_transactions', [ligne]);
        }

        promesse.then(function () {
            if (compte && compte.ticker) {
                return ajusterSoldeCompte(compte.ticker, devise, montantDevise * (ligne.sens === 'achat' ? -1 : 1), date);
            }
            return null;
        }).then(function () {
            UI.toast('Opération enregistrée');
            document.querySelector('#voile').click();
            rafraichir(true);
        }).catch(function (e) {
            UI.toast('Échec : ' + (e && e.message ? e.message : 'écriture refusée'));
        });
    }

    function supprimerTransaction(existante) {
        if (!existante || existante.id === null) { UI.toast('Opération non identifiable'); return; }
        UI.confirmer('Supprimer l’opération', 'La position sera recalculée depuis les transactions restantes.',
            'Supprimer', function () {
                PF.net.supabase.supprimer('pf2_transactions', 'id=eq.' + existante.id)
                    .then(function () { UI.toast('Supprimé'); rafraichir(true); })
                    .catch(function (e) { UI.toast('Échec : ' + e.message); });
            });
    }

    function feuilleApport(id, sensForce) {
        var ctx = etat.ctx || {};
        var existant = null;
        if (id) existant = (ctx.apports || []).filter(function (a) { return String(a.id) === String(id); })[0] || null;
        var sens = sensForce || (existant ? (String(existant.type).indexOf('retrait') >= 0 ? 'retrait' : 'apport') : 'apport');

        var corps = ''
            + UI.champ({ id: 'apSens', label: 'Sens', type: 'select', valeur: sens, options: [{ valeur: 'apport', texte: 'Apport de fonds' }, { valeur: 'retrait', texte: 'Retrait de fonds' }] })
            + UI.champ({ id: 'apDate', label: 'Date', type: 'date', valeur: existant ? existant.date : U.todayISO() })
            + UI.champ({ id: 'apMontant', label: 'Montant', type: 'number', valeur: existant ? existant.montant_eur : '' })
            + UI.champ({ id: 'apDevise', label: 'Devise du montant', type: 'select', valeur: 'EUR', options: DEVISES })
            + UI.champ({ id: 'apCompte', label: 'Compte', type: 'select', valeur: 'courant_usd', options: COMPTES });

        UI.feuille({
            titre: existant ? 'Modifier le mouvement' : 'Apport ou retrait de fonds',
            corps: corps,
            boutons: existant ? [
                { texte: 'Supprimer', sorte: 'danger', action: function () {
                    PF.net.supabase.supprimer('pf2_apports', 'id=eq.' + existant.id)
                        .then(function () { UI.toast('Supprimé'); rafraichir(true); })
                        .catch(function (e) { UI.toast('Échec : ' + e.message); });
                } },
                { texte: 'Enregistrer', sorte: '', garder: true, action: function () { enregistrerApport(existant); } }
            ] : [
                { texte: 'Annuler', sorte: 'ghost' },
                { texte: 'Enregistrer', sorte: '', garder: true, action: function () { enregistrerApport(null); } }
            ]
        });
    }

    function enregistrerApport(existant) {
        var v = lireForm(['apSens', 'apDate', 'apMontant', 'apDevise', 'apCompte']);
        var date = U.parseDate(v.apDate);
        var montant = U.num(v.apMontant, NaN);
        var devise = String(v.apDevise || 'EUR').toUpperCase();
        if (!date || !(montant > 0)) { UI.toast('Date et montant sont requis'); return; }

        var compte = COMPTES.filter(function (c) { return c.valeur === v.apCompte; })[0];

        PF.net.taux(devise, date, 'EUR').then(function (tEur) {
            var tauxEur = tEur || 1;
            return PF.net.taux(devise, date, 'USD').then(function (tUsd) {
                return { eur: tauxEur, usd: tUsd || tauxEur * (etat.ctx ? etat.ctx.tauxEurUsd : 1.125) };
            });
        }).then(function (tx) {
            var montantEur = U.arrondi(montant * tx.eur, 2);
            var montantUsd = U.arrondi(montant * tx.usd, 2);
            var signe = v.apSens === 'retrait' ? -1 : 1;
            var coursOr = (etat.ctx && etat.ctx.coursOr) || 0;

            var ligne = {
                date: date,
                sens: v.apSens === 'retrait' ? 'retrait' : 'apport',
                montant_eur: U.arrondi(montantEur, 2),
                montant_or: coursOr ? U.arrondi(montantUsd / coursOr, 6) : null,
                cours_or: coursOr || null,
                compte: compte ? compte.valeur : null,
                reference: montantUsd ? ('usd:' + U.arrondi(montantUsd, 2)) : null,
                note: null
            };

            var promesse = existant && existant.id
                ? PF.net.supabase.update('pf2_apports', ligne, 'id=eq.' + existant.id)
                : PF.net.supabase.insert('pf2_apports', [ligne]);

            return promesse.then(function () {
                // Miroir dans l'historique de la v1, pour que les deux versions
                // du projet restent parfaitement synchronisées.
                return ajouterHistoriqueV1(date, ligne.sens, montantUsd, montantEur,
                    coursOr ? montantUsd / coursOr : 0);
            }).then(function () {
                if (compte && compte.ticker) {
                    return ajusterSoldeCompte(compte.ticker, devise, montant * signe, date);
                }
                return null;
            });
        }).then(function () {
            UI.toast('Mouvement enregistré');
            document.querySelector('#voile').click();
            rafraichir(true);
        }).catch(function (e) {
            UI.toast('Échec : ' + (e && e.message ? e.message : 'écriture refusée'));
        });
    }

    /* Le solde d'un compte de liquidités vit dans la table `Donnees` de la v1. */
    function ajusterSoldeCompte(tickerCompte, deviseMouvement, montant, date) {
        return PF.net.supabase.select('Donnees', 'select=*').then(function (rows) {
            var t = String(tickerCompte).toUpperCase();
            var ligne = (rows || []).filter(function (r) {
                return String(r.Ticker || r.ticker || '').toUpperCase().trim() === t;
            })[0];
            if (!ligne) return null;
            var actuel = U.num(String(ligne['Quantité'] !== undefined ? ligne['Quantité'] : 0).replace(/ /g, '').replace(',', '.'), 0);
            var taux = 1;
            if (deviseMouvement !== t) {
                // Conversion au taux du jour : le compte est tenu dans sa devise.
                return PF.net.taux(deviseMouvement, date, t).then(function (tx) {
                    return ecrireSolde(ligne, actuel + montant * (tx || 1), t, date);
                });
            }
            return ecrireSolde(ligne, actuel + montant, t, date);
        }).catch(function () { return null; });
    }

    function ecrireSolde(ligne, nouveau, ticker, date) {
        var q = U.arrondi(Math.max(0, nouveau), 6);
        var tauxUsd = 1;
        return PF.net.taux(ticker, date, 'USD').then(function (t) {
            tauxUsd = t || 1;
            var maj = {
                Quantité: q,
                'Valeur totale': '$ ' + U.nombre(U.arrondi(q * tauxUsd, 2), 2)
            };
            var filtre = ligne.id !== undefined ? 'id=eq.' + ligne.id : 'Ticker=eq.' + encodeURIComponent(ticker);
            return PF.net.supabase.update('Donnees', maj, filtre);
        }).catch(function () { return null; });
    }

    /* L'historique v1 porte le cumul des apports nets : on le recalcule. */
    function ajouterHistoriqueV1(dateFr, sens, montantUsd, montantEur, montantOr) {
        return PF.net.supabase.select('Historique', 'select=*').then(function (rows) {
            var cumul = 0;
            (rows || []).forEach(function (r) {
                var m = U.num(String(r['Montant $'] || 0).replace(/[$\s]/g, '').replace(',', '.'), 0);
                var t = String(r.Type || '').toLowerCase();
                cumul += (t.indexOf('ajout') >= 0 || t.indexOf('apport') >= 0) ? m : -m;
            });
            var estApport = String(sens).toLowerCase().indexOf('retrait') < 0;
            var nouveau = U.arrondi(cumul + (estApport ? montantUsd : -montantUsd), 2);
            return PF.net.supabase.insert('Historique', [{
                Date: U.jourMoisAnneeISO(dateFr),
                Type: estApport ? 'Ajout de fond propre' : 'Retrait',
                'Montant $': U.arrondi(montantUsd, 2),
                'Montant €': U.arrondi(montantEur, 2),
                'Montant Or': U.arrondi(montantOr, 6),
                Total_Apports_nets: nouveau
            }]);
        }).catch(function () { return null; });
    }

    // ------------------------------------------------------------ allocation

    function sauvegarderAllocation(cfg) {
        var brut = JSON.stringify(cfg);
        PF.portefeuille.sauverConfigCle('pf2_allocation_json', brut)
            .then(function () { UI.toast('Allocation enregistrée'); rafraichir(false); })
            .catch(function (e) { UI.toast('Échec : ' + e.message); });
    }

    function feuilleAllocActif(ticker) {
        var actif = (M.etat.actifs || []).filter(function (a) { return a.ticker === ticker; })[0];
        if (!actif) return;
        var bandes = [0.5, 1, 2, 3, 5, 7.5, 10].map(function (b) {
            return { valeur: b, texte: '± ' + U.nombre(b, 1).replace(/,0$/, '') + ' pt' };
        });
        var corps = ''
            + '<div class="info">' + UI.h(actif.nom) + ' — poche « ' + UI.h(PF.vues.nomPoche(actif.poche)) + ' »</div>'
            + UI.champ({ id: 'alCible', label: 'Allocation cible (%)', type: 'number', valeur: actif.cible_pct })
            + UI.champ({ id: 'alBande', label: 'Fenêtre de dérive', type: 'select', valeur: actif.bande_pct, options: bandes })
            + UI.champ({ id: 'alClasse', label: 'Classe fiscale', type: 'select', valeur: actif.classe, options: [
                { valeur: 'action_etf', texte: 'Action / ETF' },
                { valeur: 'obligation_etf', texte: 'Obligation / ETF' },
                { valeur: 'or', texte: 'Or (ETC, valeurs mobilières)' },
                { valeur: 'or_physique', texte: 'Or physique (lingots, pièces)' },
                { valeur: 'crypto', texte: 'Crypto-actif' }
            ] })
            + UI.champ({ id: 'alDevise', label: 'Devise de cotation', type: 'select', valeur: actif.devise, options: DEVISES });

        UI.feuille({
            titre: ticker,
            corps: corps,
            boutons: [
                { texte: 'Retirer l’actif', sorte: 'danger', action: function () {
                    var cfg = configActuelle();
                    cfg.actifs = cfg.actifs.filter(function (a) { return a.ticker !== ticker; });
                    M.appliquer(cfg);
                    sauvegarderAllocation(cfg);
                } },
                { texte: 'Enregistrer', sorte: '', garder: true, action: function () {
                    var cfg = configActuelle();
                    cfg.actifs.forEach(function (a) {
                        if (a.ticker !== ticker) return;
                        a.cible_pct = U.num(UI.lire('alCible'), 0);
                        a.bande_pct = U.num(UI.lire('alBande'), 5);
                        a.classe = UI.lire('alClasse');
                        a.devise = UI.lire('alDevise');
                    });
                    var verif = M.verifier(cfg);
                    M.appliquer(cfg);
                    if (verif.depasse_100) {
                        UI.toast('Attention : total ' + U.nombre(verif.total_pct, 1) + ' %');
                    }
                    document.querySelector('#voile').click();
                    sauvegarderAllocation(cfg);
                } }
            ]
        });
    }

    function feuilleAllocPoche(cle) {
        var poche = M.etat.parCle[cle];
        if (!poche) return;
        var bandes = [0.5, 1, 2, 3, 5, 7.5, 10].map(function (b) {
            return { valeur: b, texte: '± ' + U.nombre(b, 1).replace(/,0$/, '') + ' pt' };
        });
        var corps = UI.champ({
            id: 'poBande', label: 'Bande par défaut de la poche', type: 'select',
            valeur: U.arrondi(poche.bande * 100, 1), options: bandes
        })
            + '<div style="font-size:12px;color:var(--txt-3)">La bande d’un actif, si elle est définie, prime sur celle de la poche.</div>';

        UI.feuille({
            titre: poche.nom,
            aide: 'Membres : ' + poche.membres.join(', '),
            corps: corps,
            boutons: [
                { texte: 'Annuler', sorte: 'ghost' },
                { texte: 'Enregistrer', sorte: '', garder: true, action: function () {
                    var cfg = configActuelle();
                    cfg.poches.forEach(function (p) {
                        if (p.cle !== cle) return;
                        p.bande_pct = U.num(UI.lire('poBande'), 5);
                        delete p.bande;
                    });
                    M.appliquer(cfg);
                    document.querySelector('#voile').click();
                    sauvegarderAllocation(cfg);
                } }
            ]
        });
    }

    function configActuelle() {
        return U.clone({ poches: M.etat.poches.filter(function (p) { return p.perimetre === 'investi'; }).map(function (p) {
            return { cle: p.cle, nom: p.nom, bande_pct: U.arrondi(p.bande * 100, 2), description: p.description };
        }), actifs: M.etat.actifs.map(function (a) {
            return { ticker: a.ticker, nom: a.nom, poche: a.poche, cible_pct: a.cible_pct, bande_pct: a.bande_pct, classe: a.classe, devise: a.devise };
        }) });
    }

    function feuilleNouvelActif() {
        var cfg = configActuelle();
        var optionsPoches = cfg.poches.map(function (p) { return { valeur: p.cle, texte: p.nom }; });
        optionsPoches.push({ valeur: '__nouvelle__', texte: '＋ Créer une nouvelle poche' });

        var corps = ''
            + UI.champ({ id: 'naTicker', label: 'Ticker (symbole Yahoo)', placeholder: 'ex. CW8.PA' })
            + UI.champ({ id: 'naNom', label: 'Nom', placeholder: 'ex. Amundi MSCI World' })
            + UI.champ({ id: 'naPoche', label: 'Poche', type: 'select', valeur: optionsPoches[0].valeur, options: optionsPoches })
            + UI.champ({ id: 'naPocheNom', label: 'Nom de la nouvelle poche', placeholder: 'laisser vide si poche existante' })
            + '<div style="display:flex;gap:10px">'
            + '<div style="flex:1">' + UI.champ({ id: 'naCible', label: 'Cible (%)', type: 'number', valeur: 0 }) + '</div>'
            + '<div style="flex:1">' + UI.champ({ id: 'naBande', label: 'Dérive', type: 'select', valeur: 5, options: [0.5, 1, 2, 3, 5, 7.5, 10].map(function (b) { return { valeur: b, texte: '± ' + b + ' pt' }; }) }) + '</div>'
            + '</div>'
            + UI.champ({ id: 'naClasse', label: 'Classe fiscale', type: 'select', valeur: 'action_etf', options: [
                { valeur: 'action_etf', texte: 'Action / ETF' },
                { valeur: 'obligation_etf', texte: 'Obligation / ETF' },
                { valeur: 'or', texte: 'Or (ETC)' },
                { valeur: 'or_physique', texte: 'Or physique' },
                { valeur: 'crypto', texte: 'Crypto-actif' }
            ] })
            + UI.champ({ id: 'naDevise', label: 'Devise de cotation', type: 'select', valeur: 'EUR', options: DEVISES });

        UI.feuille({
            titre: 'Nouvel actif',
            aide: 'Le ticker doit exister sur Yahoo Finance : c’est la source des cours.',
            corps: corps,
            boutons: [
                { texte: 'Annuler', sorte: 'ghost' },
                { texte: 'Ajouter', sorte: '', garder: true, action: function () {
                    var ticker = String(UI.lire('naTicker') || '').toUpperCase().trim();
                    if (!ticker) { UI.toast('Le ticker est requis'); return; }
                    if (cfg.actifs.some(function (a) { return a.ticker === ticker; })) { UI.toast('Cet actif existe déjà'); return; }

                    var pocheChoisie = UI.lire('naPoche');
                    var nomNouvelle = String(UI.lire('naPocheNom') || '').trim();
                    if (pocheChoisie === '__nouvelle__') {
                        if (!nomNouvelle) { UI.toast('Nommez la nouvelle poche'); return; }
                        pocheChoisie = M.slugPoche(nomNouvelle);
                        cfg.poches.push({ cle: pocheChoisie, nom: nomNouvelle, bande_pct: 5, description: '' });
                    }

                    cfg.actifs.push({
                        ticker: ticker,
                        nom: String(UI.lire('naNom') || '').trim() || ticker,
                        poche: pocheChoisie,
                        cible_pct: U.num(UI.lire('naCible'), 0),
                        bande_pct: U.num(UI.lire('naBande'), 5),
                        classe: UI.lire('naClasse'),
                        devise: UI.lire('naDevise')
                    });

                    var verif = M.verifier(cfg);
                    M.appliquer(cfg);
                    document.querySelector('#voile').click();
                    if (verif.depasse_100) UI.toast('Total ' + U.nombre(verif.total_pct, 1) + ' % : réduisez une cible');
                    sauvegarderAllocation(cfg);
                } }
            ]
        });
    }

    // --------------------------------------------------------------- ordres

    function ordresProposes() {
        if (!etat.ctx) return [];
        var diag = PF.rebalance.diagnostiquer(etat.ctx);
        return PF.rebalance.genererOrdres(diag.ecarts, PF.store.reglages().seuilMinOrdreEur).ordres;
    }

    function feuilleOrdres() {
        var ordres = ordresProposes();
        if (!ordres.length) { UI.toast('Aucun ordre à proposer'); return; }
        var corps = '<div style="font-size:13px;color:var(--txt-2);margin-bottom:10px">'
            + 'Ces ordres ramènent chaque poche dans sa bande. Enregistrez celui que vous passez vraiment chez votre courtier.</div>';
        ordres.forEach(function (o, i) {
            corps += '<div class="ligne" data-ordre="' + i + '">'
                + '<div class="gr"><div class="tt">' + UI.h(o.ticker) + ' — ' + UI.h(o.sens) + '</div>'
                + '<div class="st">' + UI.h(o.pocheNom) + '</div></div>'
                + '<div class="dr"><div class="a">' + U.usd(o.montantUsd, { dec: 0 }) + '</div>'
                + '<div class="b">' + U.quantite(o.quantite) + ' titres</div></div></div>';
        });
        UI.feuille({ titre: 'Ordres proposés', corps: corps, boutons: [{ texte: 'Fermer', sorte: 'ghost' }] });
    }

    function feuilleOrdre(index) {
        var o = ordresProposes()[index];
        if (!o) return;
        var ctx = etat.ctx;
        var actif = (ctx.actifs || []).filter(function (a) { return a.ticker === o.ticker; })[0];
        var prix = actif ? actif.prix : 0;
        var corps = ''
            + '<div class="info">' + UI.h(o.motif) + '</div>'
            + UI.champ({ id: 'orSens', label: 'Sens', type: 'select', valeur: o.sens, options: [{ valeur: 'achat', texte: 'Achat' }, { valeur: 'vente', texte: 'Vente' }] })
            + UI.champ({ id: 'orTicker', label: 'Titre', valeur: o.ticker })
            + UI.champ({ id: 'orDate', label: 'Date', type: 'date', valeur: U.todayISO() })
            + UI.champ({ id: 'orQuantite', label: 'Quantité', type: 'number', valeur: o.quantite })
            + UI.champ({ id: 'orCours', label: 'Cours', type: 'number', valeur: prix })
            + UI.champ({ id: 'orFrais', label: 'Frais', type: 'number', valeur: 0 })
            + UI.champ({ id: 'orDevise', label: 'Devise de cotation', type: 'select', valeur: actif ? actif.deviseCotation : 'USD', options: DEVISES })
            + UI.champ({ id: 'orCompte', label: 'Compte', type: 'select', valeur: 'courtier', options: COMPTES });

        UI.feuille({
            titre: 'Enregistrer l’ordre',
            corps: corps,
            boutons: [
                { texte: 'Annuler', sorte: 'ghost' },
                { texte: 'Enregistrer', sorte: '', garder: true, action: function () {
                    var ticker = String(UI.lire('orTicker') || '').toUpperCase().trim();
                    var date = U.parseDate(UI.lire('orDate'));
                    var quantite = U.num(UI.lire('orQuantite'), 0);
                    var cours = U.num(UI.lire('orCours'), 0);
                    var frais = U.num(UI.lire('orFrais'), 0);
                    var devise = UI.lire('orDevise');
                    if (!ticker || !date || !(quantite > 0) || !(cours > 0)) { UI.toast('Saisie incomplète'); return; }
                    PF.net.supabase.insert('pf2_transactions', [{
                        ticker: ticker, sens: UI.lire('orSens') === 'vente' ? 'vente' : 'achat',
                        date: date, quantite: quantite, cours: cours, frais: frais, devise: devise,
                        source: 'reequilibrage', reference: 'ordre proposé', note: null
                    }]).then(function () {
                        UI.toast('Ordre enregistré');
                        document.querySelector('#voile').click();
                        rafraichir(true);
                    }).catch(function (e) { UI.toast('Échec : ' + e.message); });
                } }
            ]
        });
    }

    // ------------------------------------------------------------- positions

    function feuillePosition(ticker) {
        var ctx = etat.ctx;
        if (!ctx) return;
        var a = (ctx.actifs || []).filter(function (x) { return x.ticker === ticker; })[0];
        if (!a) return;
        var f = U.fleche(a.variationPct);
        var pvPct = a.coutTotalUsd > 0 ? (a.valeurUsd / a.coutTotalUsd - 1) : null;

        function mini(titre, valeur, sous) {
            return '<div class="mini"><div class="l">' + UI.h(titre) + '</div>'
                + '<div class="v">' + valeur + '</div>'
                + '<div class="e">' + sous + '</div></div>';
        }

        var corps = ''
            + '<div class="card tight" style="margin-bottom:12px">'
            + '<div class="lbl">Valeur</div>'
            + UI.montant(a.valeurUsd, a.valeurEur)
            + '<div style="margin-top:7px">' + UI.fleche(a.variationPct) + ' <span class="dim" style="font-size:12px">depuis le dernier enregistrement</span></div>'
            + '</div>'
            + '<div class="grille g2">'
            + mini('Quantité', U.quantite(a.quantite), 'titres')
            + mini('PRU', U.nombre(a.pruUsd, 2), U.nombre(a.pruEur, 2) + ' €')
            + '</div>'
            + '<div class="grille g2" style="margin-top:10px">'
            + mini('Plus-value latente', U.usd(a.pvLatenteUsd, { dec: 0 }), U.eur(a.pvLatenteEur, { dec: 0 }))
            + mini('Performance', U.pctSigne(pvPct || 0), 'depuis l’achat')
            + '</div>'
            + '<div class="sep"></div>'
            + '<div style="font-size:12px;color:var(--txt-3)">Poche : ' + UI.h(PF.vues.nomPoche(a.poche))
            + ' · cotation en ' + UI.h(a.deviseCotation) + ' · cours ' + U.nombre(a.prix, 4) + '</div>';

        UI.feuille({
            titre: a.ticker,
            aide: M.nomDe(a.ticker),
            corps: corps,
            boutons: [
                { texte: 'Acheter', sorte: 'sec', action: function () { setTimeout(function () { feuilleTransaction(null, 'achat'); }, 220); } },
                { texte: 'Vendre', sorte: 'ghost', action: function () { setTimeout(function () { feuilleTransaction(null, 'vente'); }, 220); } }
            ]
        });
    }

    // -------------------------------------------------------------- réglages

    var REGLES_REGLAGES = {
        anneeDepartRetraite: { label: 'Année de départ à la retraite', type: 'number' },
        apportMensuelEur: { label: 'Apport mensuel (€)', type: 'number' },
        rendementAnnuelCible: { label: 'Rendement annuel (0,06 = 6 %)', type: 'number' },
        inflationReelleEstimee: { label: 'Inflation retenue (0,045 = 4,5 %)', type: 'number' },
        tauxImpositionPV: { label: 'Fiscalité des plus-values (0,314 = PFU)', type: 'number' },
        seuilMinOrdreEur: { label: 'Seuil minimal d’un ordre (€)', type: 'number' },
        partsFiscales: { label: 'Parts fiscales du foyer', type: 'number' },
        salaireNetImposable1: { label: 'Salaire net imposable — déclarant 1 (€)', type: 'number' },
        salaireNetImposable2: { label: 'Salaire net imposable — déclarant 2 (€)', type: 'number' },
        fraisReels1: { label: 'Frais professionnels déclarant 1 (€)', type: 'number' },
        fraisReels2: { label: 'Frais professionnels déclarant 2 (€)', type: 'number' },
        interetsEtrangers: { label: 'Revenus d’intérêts encaissés à l’étranger (€)', type: 'number' },
        statutFiscal: {
            label: 'Situation familiale', type: 'select', options: [
                { valeur: 'Célibataire', texte: 'Célibataire' },
                { valeur: 'Marié(e) / Pacsé(e)', texte: 'Marié(e) / Pacsé(e)' },
                { valeur: 'Divorcé(e) / Séparé(e)', texte: 'Divorcé(e) / Séparé(e)' },
                { valeur: 'Veuf(ve)', texte: 'Veuf(ve)' }
            ]
        }
    };

    function feuilleReglage(cle) {
        var regle = REGLES_REGLAGES[cle];
        if (!regle) return;
        var r = PF.store.reglages();
        UI.feuille({
            titre: regle.label,
            corps: UI.champ({ id: 'rgValeur', label: regle.label, type: regle.type, valeur: r[cle] }),
            boutons: [
                { texte: 'Annuler', sorte: 'ghost' },
                { texte: 'Enregistrer', sorte: '', garder: true, action: function () {
                    var brut = UI.lire('rgValeur');
                    var patch = {};
                    patch[cle] = regle.type === 'select' ? brut : U.num(brut, r[cle]);
                    PF.store.sauverReglages(patch);
                    UI.toast('Enregistré');
                    document.querySelector('#voile').click();
                    rendre();
                } }
            ]
        });
    }

    function feuilleReglages() {
        var r = PF.store.reglages();
        var corps = ''
            + '<button class="btn sec" id="rgConnexion" style="margin-bottom:9px">🔑 Connexion Supabase</button>'
            + '<button class="btn sec" id="rgInflation" style="margin-bottom:9px">📈 Inflation annuelle</button>'
            + '<button class="btn sec" id="rgFiscal" style="margin-bottom:9px">§ Situation fiscale</button>'
            + '<button class="btn ghost" id="rgVider" style="margin-bottom:9px">Vider le cache de l’application</button>'
            + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:10px">'
            + 'Inflation retenue : ' + U.pct(r.inflationReelleEstimee, 1) + ' · rendement : '
            + U.pct(r.rendementAnnuelCible, 1) + ' · parts : ' + U.nombre(r.partsFiscales, 1) + '</div>'
            + '<div class="sep"></div>'
            + '<div style="font-size:11.5px;color:var(--txt-3);line-height:1.6">'
            + '<b style="color:var(--txt-2)">Porte-feuille</b> — application Android autonome. '
            + 'Cours : Yahoo Finance. Inflation : INSEE (Mélodi). Vos données restent dans votre base Supabase : '
            + 'l’application ne possède aucun serveur et ne transmet rien à des tiers.<br>'
            + 'Unité de compte : le dollar. L’euro est une indication.</div>';

        var f = UI.feuille({ titre: 'Réglages', corps: corps, boutons: [{ texte: 'Fermer', sorte: 'ghost' }] });
        var c = f.corps;
        if (c) {
            c.querySelector('#rgConnexion').addEventListener('click', function () {
                document.querySelector('#voile').click();
                setTimeout(function () { feuilleConnexion(false); }, 220);
            });
            c.querySelector('#rgInflation').addEventListener('click', function () {
                document.querySelector('#voile').click();
                setTimeout(feuilleInflation, 220);
            });
            c.querySelector('#rgFiscal').addEventListener('click', function () {
                document.querySelector('#voile').click();
                setTimeout(feuilleSituationFiscale, 220);
            });
            c.querySelector('#rgVider').addEventListener('click', function () {
                PF.store.viderCache();
                PF.net.viderCache();
                UI.toast('Cache vidé');
                document.querySelector('#voile').click();
            });
        }
    }

    /* L'inflation doit être trouvée par l'application, pas saisie à la main :
       on interroge l'INSEE (Mélodi) et on enregistre le résultat dans
       `pf2_inflation` pour toute l'année. */
    function feuilleInflation() {
        var ctx = etat.ctx || {};
        var anneeCourante = new Date().getFullYear();
        var lignes = Object.keys(ctx.inflation || {}).sort().map(function (a) {
            return '<div class="ligne"><div class="gr"><div class="tt">' + UI.h(a) + '</div></div>'
                + '<div class="dr"><div class="a">' + U.pct(U.num(ctx.inflation[a], 0)) + '</div></div></div>';
        }).join('') || '<div class="vide" style="padding:14px">Aucune donnée.</div>';

        var corps = lignes
            + '<button class="btn" id="inMaj" style="margin-top:10px">⟳ Récupérer l’inflation officielle (INSEE)</button>'
            + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:8px">Source : INSEE, indice des prix à la consommation '
            + '(base 2025, ensemble des ménages). La valeur est enregistrée dans votre base.</div>';

        var f = UI.feuille({ titre: 'Inflation annuelle', corps: corps, boutons: [{ texte: 'Fermer', sorte: 'ghost' }] });
        var c = f.corps;
        if (c) {
            c.querySelector('#inMaj').addEventListener('click', function () {
                var bt = this;
                bt.textContent = 'Récupération…';
                majInflation().then(function (res) {
                    bt.textContent = res || 'Terminé';
                    rafraichir(false);
                });
            });
        }
    }

    var inflationEnAttente = null;

    function majInflation() {
        if (typeof root.Native === 'undefined' || !root.Native.telechargerInflationInsee) {
            return Promise.resolve('Disponible sur la version en ligne');
        }
        return new Promise(function (resoudre) {
            inflationEnAttente = resoudre;
            try {
                root.Native.telechargerInflationInsee('insee');
            } catch (e) {
                inflationEnAttente = null;
                resoudre('Source INSEE injoignable');
            }
        });
    }

    /* Retour de Java : l'IPC a été téléchargé et analysé nativement. */
    function retourInflation(id, charge) {
        var data = charge;
        if (typeof charge === 'string') {
            try { data = JSON.parse(charge); } catch (e) { data = null; }
        }
        var resoudre = inflationEnAttente;
        inflationEnAttente = null;
        if (!data || !data.ok) {
            if (resoudre) resoudre('INSEE : ' + ((data && data.erreur) ? data.erreur : 'source injoignable'));
            return;
        }
        var lignes = (data.annees || []).map(function (a) {
            return { annee: Number(a.annee), inflation: U.num(a.inflation, 0), source: 'INSEE IPC (Mélodi)' };
        });
        if (!lignes.length) { if (resoudre) resoudre('Aucune année complète'); return; }
        PF.net.supabase.upsert('pf2_inflation', lignes, 'annee')
            .then(function () { if (resoudre) resoudre('Inflation mise à jour (' + lignes.length + ' ans)'); rafraichir(false); })
            .catch(function (e) { if (resoudre) resoudre('Enregistrement impossible : ' + e.message); });
    }

    function feuilleSituationFiscale() {
        var r = PF.store.reglages();
        var corps = ''
            + UI.champ({ id: 'fiStatut', label: 'Situation familiale', type: 'select', valeur: r.statutFiscal, options: [
                { valeur: 'Célibataire', texte: 'Célibataire' },
                { valeur: 'Marié(e) / Pacsé(e)', texte: 'Marié(e) / Pacsé(e)' },
                { valeur: 'Divorcé(e) / Séparé(e)', texte: 'Divorcé(e) / Séparé(e)' },
                { valeur: 'Veuf(ve)', texte: 'Veuf(ve)' }
            ] })
            + UI.champ({ id: 'fiParts', label: 'Parts fiscales', type: 'number', valeur: r.partsFiscales })
            + UI.champ({ id: 'fiRevenus', label: 'Autres revenus imposables (€)', type: 'number', valeur: r.autresRevenusImposables })
            + UI.champ({ id: 'fiSalaire1', label: 'Salaire net imposable — déclarant 1 (€)', type: 'number', valeur: r.salaireNetImposable1 })
            + UI.champ({ id: 'fiSalaire2', label: 'Salaire net imposable — déclarant 2 (€)', type: 'number', valeur: r.salaireNetImposable2 });

        UI.feuille({
            titre: 'Situation fiscale',
            corps: corps,
            boutons: [
                { texte: 'Annuler', sorte: 'ghost' },
                { texte: 'Enregistrer', sorte: '', garder: true, action: function () {
                    PF.store.sauverReglages({
                        statutFiscal: UI.lire('fiStatut'),
                        partsFiscales: U.num(UI.lire('fiParts'), 1),
                        autresRevenusImposables: U.num(UI.lire('fiRevenus'), 0),
                        salaireNetImposable1: U.num(UI.lire('fiSalaire1'), 0),
                        salaireNetImposable2: U.num(UI.lire('fiSalaire2'), 0)
                    });
                    UI.toast('Enregistré');
                    document.querySelector('#voile').click();
                    rendre();
                } }
            ]
        });
    }

    // --------------------------------------------------- geste « tirer pour actualiser »

    function installerPullToRefresh() {
        var app = document.getElementById('app');
        var pull = document.getElementById('pull');
        var debutY = null, distance = 0, actif = false;
        var seuil = 72;

        app.addEventListener('touchstart', function (e) {
            if (window.scrollY > 0) { actif = false; return; }
            debutY = e.touches[0].clientY;
            distance = 0;
            actif = true;
        }, { passive: true });

        app.addEventListener('touchmove', function (e) {
            if (!actif || debutY === null) return;
            distance = e.touches[0].clientY - debutY;
            if (distance <= 0 || window.scrollY > 0) {
                distance = 0;
                if (pull) pull.style.opacity = '0';
                return;
            }
            if (pull) {
                pull.style.opacity = String(Math.min(1, distance / seuil));
                pull.style.transform = 'translateX(-50%) translateY(' + Math.min(40, distance * 0.5) + 'px)';
            }
        }, { passive: true });

        app.addEventListener('touchend', function () {
            if (pull) { pull.style.opacity = '0'; pull.style.transform = 'translateX(-50%)'; }
            var declenche = actif && distance >= seuil;
            actif = false;
            debutY = null;
            if (declenche) {
                if (typeof root.Native !== 'undefined' && root.Native.haptic) {
                    try { root.Native.haptic(14); } catch (e) { /* pas de vibreur */ }
                }
                rafraichir(true);
            }
            distance = 0;
        });
    }

    // ------------------------------------------------------------------ démo

    /* Jeu de démonstration : des ordres de grandeur plausibles, une allocation
       au plus près des cibles, pour que l'on puisse juger l'ergonomie avant
       même d'avoir branché sa base. */
    function demoContexte() {
        var ctx = PF.portefeuille.contexteVide();
        var aujourd = U.todayISO();

        var positions = [
            { ticker: 'IGLN.L', qte: 350, cours: 34.2, devise: 'USD', tauxUsd: 1, varPct: 0.0081 },
            { ticker: 'BTCUSDT', qte: 0.0656, cours: 61000, devise: 'USD', tauxUsd: 1, varPct: -0.0152 },
            { ticker: 'XDW0.L', qte: 578, cours: 41.5, devise: 'USD', tauxUsd: 1, varPct: 0.0043 },
            { ticker: 'FLXC.L', qte: 968, cours: 24.8, devise: 'USD', tauxUsd: 1, varPct: 0.0 },
            { ticker: 'XJSE.SW', qte: 1094, cours: 2150, devise: 'JPY', tauxUsd: 0.0068, varPct: -0.0021 }
        ];

        ctx.transactions = positions.map(function (p, i) {
            return {
                id: i + 1, ticker: p.ticker, type: 'achat', date: U.ajouterJours(aujourd, -400 + i * 7),
                quantite: p.qte, cours: p.cours, frais: 9.9, devise: p.devise,
                montantNet: p.qte * p.cours + 9.9, source: 'demo', reference: null
            };
        });

        ctx.actifs = positions.map(function (p) {
            var valeurUsd = p.qte * p.cours * p.tauxUsd;
            return {
                ticker: p.ticker, classe: M.classeDe(p.ticker), deviseCotation: p.devise,
                poche: (M.pocheDe(p.ticker) || { cle: 'inconnu' }).cle, quantite: p.qte, prix: p.cours,
                valeurUsd: valeurUsd, valeurEur: valeurUsd / 1.125,
                dernierTaux: p.devise === 'JPY' ? 0.006 : 1, dernierTauxUsd: p.tauxUsd,
                pruUsd: p.cours * 0.88, pruEur: p.cours * 0.88 / 1.125,
                coutTotalUsd: valeurUsd * 0.88, coutTotalEur: valeurUsd * 0.88 / 1.125,
                pvLatenteUsd: valeurUsd * 0.12, pvLatenteEur: valeurUsd * 0.12 / 1.125,
                variationPct: p.varPct
            };
        });

        ctx.actifs.push({
            ticker: 'CHF', classe: 'espece', deviseCotation: 'CHF', poche: 'precaution', quantite: 8694,
            prix: 1, valeurUsd: 10433, valeurEur: 9274, dernierTaux: 1.06, dernierTauxUsd: 1.2,
            pruUsd: 1, pruEur: 1, coutTotalUsd: 10433, coutTotalEur: 9274,
            pvLatenteUsd: 0, pvLatenteEur: 0, variationPct: 0
        });
        ctx.actifs.push({
            ticker: 'USD', classe: 'espece', deviseCotation: 'USD', poche: 'courant', quantite: 1240,
            prix: 1, valeurUsd: 1240, valeurEur: 1102, dernierTaux: 0.889, dernierTauxUsd: 1,
            pruUsd: 1, pruEur: 1, coutTotalUsd: 1240, coutTotalEur: 1102,
            pvLatenteUsd: 0, pvLatenteEur: 0, variationPct: 0
        });

        var investi = ctx.actifs.filter(function (a) { return a.poche !== 'precaution' && a.poche !== 'courant'; })
            .reduce(function (s, a) { return s + a.valeurUsd; }, 0);

        var base = investi;
        ctx.snapshots = [];
        for (var d = 330; d >= 0; d -= 3) {
            var variation = Math.sin(d / 44) * 0.045 + (330 - d) / 330 * 0.16;
            ctx.snapshots.push({
                date: U.ajouterJours(aujourd, -d),
                patrimoine_investi_usd: U.arrondi(base * (1 + variation) / 1.16, 2),
                patrimoine_total_usd: U.arrondi(base * (1 + variation) / 1.16 + 10433, 2),
                precaution_usd: 10433, courant_usd: 0,
                capital_investi_usd: U.arrondi(base * 0.84, 2),
                patrimoine_investi_eur: U.arrondi(base * (1 + variation) / 1.16 / 1.125, 2),
                patrimoine_total_eur: U.arrondi((base * (1 + variation) / 1.16 + 10433) / 1.125, 2),
                precaution_eur: 9274, courant_eur: 0,
                cours_or_usd: 2650, equivalent_or_oz: U.arrondi(base * (1 + variation) / 1.16 / 2650, 4)
            });
        }
        // Le dernier point reflète la valorisation du jour.
        var dernier = ctx.snapshots[ctx.snapshots.length - 1];
        dernier.patrimoine_investi_usd = U.arrondi(investi, 2);
        dernier.patrimoine_investi_eur = U.arrondi(investi / 1.125, 2);
        dernier.patrimoine_total_usd = U.arrondi(investi + 10433 + 1240, 2);
        dernier.patrimoine_total_eur = U.arrondi((investi + 10433 + 1240) / 1.125, 2);
        dernier.equivalent_or_oz = U.arrondi(investi / 2650, 4);

        ctx.apports = [
            { id: 1, date: U.ajouterJours(aujourd, -280), type: 'apport', montant_eur: 5000, montant_usd: 5625, montant_or: 2.12, cours_or: 2650, reference: null },
            { id: 2, date: U.ajouterJours(aujourd, -150), type: 'apport', montant_eur: 3000, montant_usd: 3375, montant_or: 1.27, cours_or: 2650, reference: null },
            { id: 3, date: U.ajouterJours(aujourd, -40), type: 'apport', montant_eur: 2500, montant_usd: 2812, montant_or: 1.06, cours_or: 2650, reference: null }
        ];
        ctx.inflation = { 2023: 0.049, 2024: 0.02, 2025: 0.017, 2026: 0.015 };
        ctx.tauxEurUsd = 1.125;
        ctx.coursOr = 2650;
        ctx.capitalInvestiUsd = U.arrondi(investi * 0.84, 2);
        ctx.capitalInvestiEur = U.arrondi(investi * 0.84 / 1.125, 2);
        PF.portefeuille.agreger(ctx);
        ctx.equivalentOrOz = investi / 2650;
        ctx.serie = PF.metrics.seriePerformance(ctx.snapshots, ctx.apports);
        ctx.erreurs = [];
        return ctx;
    }

    // ----------------------------------------------------------- pont Android

    var App = {
        onBack: function () {
            var voile = document.getElementById('voile');
            if (voile && voile.classList.contains('ouvert')) { voile.click(); return true; }
            if (etat.onglet === 'portefeuille' && PF.vues.ongletPortefeuille() !== 'positions') {
                PF.vues.definirOngletPortefeuille('positions');
                rendre();
                return true;
            }
            if (etat.onglet !== 'bord') { naviguer('bord'); return true; }
            return false;
        },
        onPause: function () { },
        onResume: function () { },
        rafraichir: function () { rafraichir(true); }
    };

    root.App = App;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', demarrer);
    } else {
        demarrer();
    }

    PF.app = {
        etat: etat,
        retourInflation: retourInflation,
        naviguer: naviguer,
        rafraichir: rafraichir,
        rendre: rendre,
        demo: demoContexte
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
