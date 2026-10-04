/* Le modèle d'allocation : poches, actifs, cibles et bandes de tolérance.
   Portage fidèle de core/models.py — la répartition entre actifs est un choix
   du porteur, jamais une valeur que l'application « corrige ». */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util;

    var CLASSES_DEFAUT = {
        'IGLN.L': 'or',
        'BTCUSDT': 'crypto',
        'BTC-USD': 'crypto',
        'XDW0.L': 'action_etf',
        'FLXC.L': 'action_etf',
        'RI.PA': 'action_etf',
        'XJSE.SW': 'obligation_etf'
    };

    var DEVISES_COTATION = {
        'IGLN.L': 'USD', 'BTCUSDT': 'USD', 'BTC-USD': 'USD', 'XDW0.L': 'USD',
        'FLXC.L': 'USD', 'RI.PA': 'EUR', 'XJSE.SW': 'JPY',
        'CHF': 'CHF', 'CNY': 'CNY', 'EUR': 'EUR', 'USD': 'USD', 'GBP': 'GBP',
        'JPY': 'JPY', 'CAD': 'CAD', 'AUD': 'AUD', 'HKD': 'HKD', 'SGD': 'SGD',
        'NOK': 'NOK', 'SEK': 'SEK', 'DKK': 'DKK'
    };

    var DEVISES_ESPECES = ['EUR', 'USD', 'CHF', 'CNY', 'GBP', 'JPY', 'CAD', 'AUD', 'HKD', 'SGD', 'NOK', 'SEK', 'DKK'];

    var POCHES_HORS = [
        {
            cle: 'precaution', nom: 'Épargne de précaution', cible: 0, bande: 0,
            membres: ['CHF', 'CNY'], perimetre: 'precaution',
            description: 'Livret CHF. Disponible en 5 minutes. Jamais rééquilibré.'
        },
        {
            cle: 'courant', nom: 'Compte courant', cible: 0, bande: 0,
            membres: ['EUR', 'USD'], perimetre: 'courant',
            description: 'Liquidités courantes. Hors portefeuille d’investissement.'
        }
    ];

    var POCHES_INVESTIES_DEFAUT = [
        { cle: 'rv_physique', nom: 'Réserve de valeur physique', bande_pct: 3.0, description: 'Or (ETC). Réserve de valeur physique face à la dépréciation monétaire.' },
        { cle: 'rv_numerique', nom: 'Réserve de valeur numérique', bande_pct: 3.0, description: 'Bitcoin. Réserve de valeur numérique face à la dépréciation monétaire.' },
        { cle: 'energie', nom: 'Énergie', bande_pct: 5.0, description: 'ETF énergie. Surexposition volontaire à la croissance.' },
        { cle: 'asie', nom: 'Asie / Chine', bande_pct: 5.0, description: 'ETF Chine (Franklin FTSE China). Surexposition volontaire à la croissance.' },
        { cle: 'jgb', nom: 'Obligations japonaises', bande_pct: 5.0, description: 'ETF dettes d’État japonaises. Poche de désinflation et de récession.' }
    ];

    var ALLOCATION_ACTIFS_DEFAUT = [
        { ticker: 'IGLN.L', nom: 'Or (iShares Physical Gold ETC)', poche: 'rv_physique', cible_pct: 15.0, bande_pct: 3.0, classe: 'or', devise: 'USD' },
        { ticker: 'BTCUSDT', nom: 'Bitcoin', poche: 'rv_numerique', cible_pct: 5.0, bande_pct: 3.0, classe: 'crypto', devise: 'USD' },
        { ticker: 'XDW0.L', nom: 'Xtrackers MSCI World Energy', poche: 'energie', cible_pct: 30.0, bande_pct: 5.0, classe: 'action_etf', devise: 'USD' },
        { ticker: 'FLXC.L', nom: 'Franklin FTSE China UCITS ETF', poche: 'asie', cible_pct: 30.0, bande_pct: 5.0, classe: 'action_etf', devise: 'USD' },
        { ticker: 'XJSE.SW', nom: 'Xtrackers II Japan Govt Bond', poche: 'jgb', cible_pct: 20.0, bande_pct: 5.0, classe: 'obligation_etf', devise: 'JPY' }
    ];

    var POCHES_COULEURS = {
        rv_physique: '#F5C451', rv_numerique: '#F2994A', energie: '#2ECC71',
        asie: '#38BDF8', jgb: '#9B8CFF', precaution: '#5AA9FF', courant: '#7C8AA0',
        inconnu: '#6B7789', rv: '#F5C451'
    };

    function allocationDefaut() {
        return {
            poches: POCHES_INVESTIES_DEFAUT.map(function (p) { return JSON.parse(JSON.stringify(p)); }),
            actifs: ALLOCATION_ACTIFS_DEFAUT.map(function (a) { return JSON.parse(JSON.stringify(a)); })
        };
    }

    function slugPoche(nom) {
        var s = String(nom || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!s || s === 'precaution' || s === 'courant' || s === 'inconnu') s = 'poche_' + (s || 'nouvelle');
        return s;
    }

    function lireCiblePctActif(a) {
        if (a.cible !== undefined && a.cible !== null) {
            var v = U.num(a.cible, 0);
            return Math.max(0, v <= 1.0 + 1e-6 ? v * 100 : v);
        }
        if (a.cible_pct !== undefined && a.cible_pct !== null) return Math.max(0, U.num(a.cible_pct, 0));
        return 0;
    }

    function lireBandePctPoche(p) {
        if (p.bande !== undefined && p.bande !== null) {
            var v = U.num(p.bande, 5);
            return Math.max(0.5, v <= 1.0 + 1e-6 ? v * 100 : v);
        }
        if (p.bande_pct !== undefined && p.bande_pct !== null) return Math.max(0.5, U.num(p.bande_pct, 5));
        return 5;
    }

    function lireBandePctActif(a, defautPct) {
        if (a.bande !== undefined && a.bande !== null) {
            var v = U.num(a.bande, defautPct);
            return Math.max(0.5, v <= 1.0 + 1e-6 ? v * 100 : v);
        }
        if (a.bande_pct !== undefined && a.bande_pct !== null) return Math.max(0.5, U.num(a.bande_pct, defautPct));
        return Math.max(0.5, defautPct);
    }

    /* L'ancienne poche unique « rv » se sépare en physique (or) et numérique
       (bitcoin) — reprise de la migration automatique de la v2. */
    function migrerPocheRv(pochesCfg, actifsCfg) {
        var aMigrer = pochesCfg.some(function (p) { return String(p.cle || '').trim() === 'rv'; })
            || actifsCfg.some(function (a) { return String(a.poche || '').trim() === 'rv'; });
        if (!aMigrer) return [pochesCfg, actifsCfg];

        var nouvelles = [], vus = {};
        pochesCfg.forEach(function (p) {
            var cle = String(p.cle || '').trim();
            if (cle === 'rv') {
                POCHES_INVESTIES_DEFAUT.slice(0, 2).forEach(function (d) {
                    if (!vus[d.cle]) { nouvelles.push(JSON.parse(JSON.stringify(d))); vus[d.cle] = 1; }
                });
            } else if (cle && !vus[cle]) { nouvelles.push(JSON.parse(JSON.stringify(p))); vus[cle] = 1; }
        });
        POCHES_INVESTIES_DEFAUT.slice(0, 2).forEach(function (d) {
            if (!vus[d.cle]) { nouvelles.unshift(JSON.parse(JSON.stringify(d))); vus[d.cle] = 1; }
        });

        var ciblesRv = {};
        actifsCfg.forEach(function (a) {
            if (String(a.poche || '').trim() === 'rv') ciblesRv[String(a.ticker || '').toUpperCase().trim()] = lireCiblePctActif(a);
        });
        var ancienDefaut1010 = Math.abs((ciblesRv['IGLN.L'] || 0) - 10) < 1e-4 && Math.abs((ciblesRv['BTCUSDT'] || 0) - 10) < 1e-4;

        var actifs = actifsCfg.map(function (a) {
            var c = JSON.parse(JSON.stringify(a));
            var tk = String(c.ticker || '').toUpperCase().trim();
            var cls = String(c.classe || '').toLowerCase();
            if (String(c.poche || '').trim() === 'rv') {
                if (tk === 'BTCUSDT' || cls.indexOf('crypto') >= 0 || tk.indexOf('BTC') >= 0) {
                    c.poche = 'rv_numerique';
                    if (ancienDefaut1010 && tk === 'BTCUSDT') { c.cible_pct = 5; delete c.cible; }
                } else {
                    c.poche = 'rv_physique';
                    if (ancienDefaut1010 && tk === 'IGLN.L') { c.cible_pct = 15; delete c.cible; }
                }
            }
            return c;
        });
        return [nouvelles, actifs];
    }

    var etat = {
        poches: [],
        parCle: {},
        cibles: {},
        bandes: {},
        noms: {},
        classes: {},
        devises: {},
        actifs: []
    };

    /* Applique une configuration en mémoire. Retourne la configuration
       normalisée (celle qu'on peut réenregistrer telle quelle). */
    function appliquer(cfg) {
        if (!cfg || !cfg.actifs || !cfg.actifs.length) cfg = allocationDefaut();
        var pochesCfg = (cfg.poches || POCHES_INVESTIES_DEFAUT).map(function (p) { return JSON.parse(JSON.stringify(p)); });
        var actifsCfg = (cfg.actifs || []).map(function (a) { return JSON.parse(JSON.stringify(a)); });

        var migre = migrerPocheRv(pochesCfg, actifsCfg);
        pochesCfg = migre[0];
        actifsCfg = migre[1];

        var connues = {};
        pochesCfg.forEach(function (p) { if (p.cle) connues[String(p.cle)] = 1; });
        actifsCfg.forEach(function (a) {
            var cle = String(a.poche || 'rv_physique').trim();
            if (cle && !connues[cle] && cle !== 'precaution' && cle !== 'courant') {
                pochesCfg.push({
                    cle: cle,
                    nom: a.poche_nom || cle.replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }),
                    bande_pct: U.num(a.bande_pct, 5),
                    description: a.poche_description || ''
                });
                connues[cle] = 1;
            }
        });

        var cibles = {}, bandes = {}, noms = {}, classes = {}, devises = {};
        var membres = {}, ciblePoche = {}, bandesActifs = {}, bandeDefPoche = {};

        pochesCfg.forEach(function (p) {
            var cle = String(p.cle);
            membres[cle] = [];
            ciblePoche[cle] = 0;
            bandesActifs[cle] = [];
            bandeDefPoche[cle] = lireBandePctPoche(p);
        });

        actifsCfg.forEach(function (a) {
            var tk = String(a.ticker || '').toUpperCase().trim();
            if (!tk) return;
            var cle = String(a.poche || 'rv_physique').trim();
            var cPct = lireCiblePctActif(a);
            var bDef = bandeDefPoche[cle] !== undefined ? bandeDefPoche[cle] : (cle.indexOf('rv') === 0 ? 3 : 5);
            var bPct = lireBandePctActif(a, bDef);
            cibles[tk] = cPct / 100;
            bandes[tk] = bPct / 100;
            noms[tk] = a.nom || tk;
            classes[tk] = classeNormalisee(a.classe, tk);
            devises[tk] = String(a.devise || DEVISES_COTATION[tk] || '').toUpperCase();
            if (!membres[cle]) { membres[cle] = []; ciblePoche[cle] = 0; bandesActifs[cle] = []; }
            if (membres[cle].indexOf(tk) < 0) membres[cle].push(tk);
            ciblePoche[cle] = (ciblePoche[cle] || 0) + cPct / 100;
            if (a.bande !== undefined || a.bande_pct !== undefined) bandesActifs[cle].push([cPct, bPct]);
        });

        var poches = [];
        pochesCfg.forEach(function (pInfo) {
            var cle = String(pInfo.cle).trim();
            var mb = membres[cle] || [];
            if (!mb.length) return;
            var cible = U.arrondi(ciblePoche[cle] || 0, 6);
            var bListe = bandesActifs[cle] || [];
            var bande;
            if (bListe.length) {
                var tw = 0;
                bListe.forEach(function (b) { tw += b[0]; });
                if (tw > 0) {
                    var s = 0;
                    bListe.forEach(function (b) { s += b[0] * b[1]; });
                    bande = Math.max(0.005, U.arrondi((s / tw) / 100, 6));
                } else {
                    var s2 = 0;
                    bListe.forEach(function (b) { s2 += b[1]; });
                    bande = Math.max(0.005, U.arrondi((s2 / bListe.length) / 100, 6));
                }
            } else {
                bande = Math.max(0.005, lireBandePctPoche(pInfo) / 100);
            }
            poches.push({
                cle: cle,
                nom: pInfo.nom || cle,
                cible: cible,
                bande: bande,
                membres: mb,
                perimetre: 'investi',
                description: pInfo.description || '',
                couleur: POCHES_COULEURS[cle] || '#F5C451'
            });
        });

        POCHES_HORS.forEach(function (p) {
            poches.push({
                cle: p.cle, nom: p.nom, cible: p.cible, bande: p.bande,
                membres: p.membres.slice(), perimetre: p.perimetre,
                description: p.description, couleur: POCHES_COULEURS[p.cle]
            });
        });

        var parCle = {};
        poches.forEach(function (p) { parCle[p.cle] = p; });

        etat.poches = poches;
        etat.parCle = parCle;
        etat.cibles = cibles;
        etat.bandes = bandes;
        etat.noms = noms;
        etat.classes = classes;
        etat.devises = devises;
        etat.actifs = actifsCfg.map(function (a) {
            var tk = String(a.ticker || '').toUpperCase().trim();
            return {
                ticker: tk, nom: noms[tk] || tk, poche: String(a.poche || '').trim(),
                cible_pct: lireCiblePctActif(a), bande_pct: lireBandePctActif(a, 5),
                classe: classes[tk], devise: devises[tk] || DEVISES_COTATION[tk] || 'USD'
            };
        });

        return {
            poches: pochesCfg.map(function (p) {
                return { cle: p.cle, nom: p.nom, bande_pct: lireBandePctPoche(p), description: p.description || '' };
            }),
            actifs: etat.actifs.map(function (a) {
                return {
                    ticker: a.ticker, nom: a.nom, poche: a.poche,
                    cible_pct: a.cible_pct, bande_pct: a.bande_pct,
                    classe: a.classe, devise: a.devise
                };
            })
        };
    }

    var ALIAS_CLASSE = {
        action: 'action_etf', action_etf: 'action_etf',
        obligation: 'obligation_etf', obligation_etf: 'obligation_etf',
        or_papier: 'or', or_physique: 'or_physique', or: 'or',
        crypto: 'crypto', espece: 'espece'
    };

    function classeNormalisee(cls, tk) {
        var s = String(cls || '').toLowerCase().trim();
        if (s && ALIAS_CLASSE[s]) {
            // « or » reste « or » (ETC) : le régime des métaux précieux physiques
            // ne s'applique qu'aux lingots et pièces détenus en direct.
            return ALIAS_CLASSE[s] === 'or_physique' ? 'or_physique' : ALIAS_CLASSE[s];
        }
        if (s) return s;
        if (CLASSES_DEFAUT[tk]) return CLASSES_DEFAUT[tk];
        if (DEVISES_ESPECES.indexOf(tk) >= 0) return 'espece';
        return 'action_etf';
    }

    function cibleActif(ticker) {
        return etat.cibles[String(ticker || '').toUpperCase().trim()] || 0;
    }

    function bandeActif(ticker) {
        var tk = String(ticker || '').toUpperCase().trim();
        if (etat.bandes[tk] !== undefined) return etat.bandes[tk];
        var p = pocheDe(tk);
        return p ? p.bande : 0.05;
    }

    function pocheDe(ticker) {
        var tk = String(ticker || '').toUpperCase().trim();
        for (var i = 0; i < etat.poches.length; i++) {
            if (etat.poches[i].membres.indexOf(tk) >= 0) return etat.poches[i];
        }
        return null;
    }

    function classeDe(ticker) {
        var tk = String(ticker || '').toUpperCase().trim();
        if (etat.classes[tk]) return etat.classes[tk];
        if (CLASSES_DEFAUT[tk]) return CLASSES_DEFAUT[tk];
        if (DEVISES_ESPECES.indexOf(tk) >= 0) return 'espece';
        return 'action_etf';
    }

    function deviseDe(ticker) {
        var tk = String(ticker || '').toUpperCase().trim();
        return etat.devises[tk] || DEVISES_COTATION[tk] || null;
    }

    function nomDe(ticker) {
        var tk = String(ticker || '').toUpperCase().trim();
        return etat.noms[tk] || tk;
    }

    function couleurDe(clePoche) { return POCHES_COULEURS[clePoche] || '#F5C451'; }

    function pochesInvesties() {
        return etat.poches.filter(function (p) { return p.perimetre === 'investi'; });
    }

    /* Somme des cibles : 100 % attendu. Au-delà, alerte ; en deçà, avertissement. */
    function verifier(cfg) {
        var totalPct;
        if (cfg && cfg.actifs) {
            var s = 0;
            cfg.actifs.forEach(function (a) { s += lireCiblePctActif(a); });
            totalPct = U.arrondi(s, 2);
        } else {
            var t = 0;
            pochesInvesties().forEach(function (p) { t += p.cible * 100; });
            totalPct = U.arrondi(t, 2);
        }
        var depasse = totalPct > 100 + 1e-4;
        var inferieur = totalPct < 100 - 1e-4;
        var ecart = U.arrondi(totalPct - 100, 2);
        var message = '';
        if (depasse) {
            message = 'La répartition cible totale de vos actifs représente ' + U.nombre(totalPct, 1) + ' % '
                + '(soit +' + U.nombre(ecart, 1) + ' % au-dessus de 100 %). Réduisez l’allocation cible d’un ou plusieurs actifs.';
        } else if (inferieur) {
            message = 'La répartition cible totale est de ' + U.nombre(totalPct, 1) + ' % '
                + '(il manque ' + U.nombre(100 - totalPct, 1) + ' % pour atteindre 100 %).';
        }
        return {
            total_pct: totalPct, depasse_100: depasse, inferieur_100: inferieur,
            est_valide: !depasse && !inferieur, equilibre_100: !depasse && !inferieur,
            ecart_pct: ecart, ecart_100_pct: ecart, message: message
        };
    }

    PF.modele = {
        appliquer: appliquer,
        allocationDefaut: allocationDefaut,
        verifier: verifier,
        slugPoche: slugPoche,
        cibleActif: cibleActif,
        bandeActif: bandeActif,
        pocheDe: pocheDe,
        classeDe: classeDe,
        deviseDe: deviseDe,
        nomDe: nomDe,
        couleurDe: couleurDe,
        pochesInvesties: pochesInvesties,
        lireCiblePctActif: lireCiblePctActif,
        lireBandePctActif: lireBandePctActif,
        lireBandePctPoche: lireBandePctPoche,
        etat: etat,
        DEVISES_ESPECES: DEVISES_ESPECES,
        DEVISES_COTATION: DEVISES_COTATION,
        POCHES_COULEURS: POCHES_COULEURS,
        POCHES_HORS: POCHES_HORS
    };

    appliquer(allocationDefaut());
})(typeof globalThis !== 'undefined' ? globalThis : this);
