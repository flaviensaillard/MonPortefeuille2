/* Historique Supabase des collectes DGFiP — table `pf2_fiscal_collectes`
   (migration 009, élargie aux sources DGFiP par la migration 013).

   Une collecte réussie est d'abord écrite dans le cache local de l'appareil : c'est
   lui que le moteur relit et REVALIDE à chaque ouverture. Ce module ajoute
   l'historisation côté serveur, pour que la preuve d'un document lu survive à une
   réinstallation et soit relue depuis un autre appareil.

   Règles :
   - append-only : une rectification du même millésime crée la révision suivante,
     jamais une mise à jour ni un écrasement ;
   - aucune donnée personnelle : `valeurs` ne porte que des paramètres publics
     (barème, décote, plafond, taux, forfaits) et les références du document lu.
     Aucun montant du foyer, aucun taux de prélèvement à la source, aucune ligne de
     déclaration ;
   - une ligne historisée n'est PAS une règle publiée : `pf2_fiscal_annees`
     (révisions activées, R2) reste écrit par `service_role`, jamais par
     l'application. Le moteur continue de n'utiliser que le cache local revérifié ;
   - best effort : pont Supabase absent, réseau en échec, ou migration 013 non
     appliquée (contrainte qui refuse une source DGFiP) → la collecte locale reste
     valable, l'état dit pourquoi rien n'a été écrit, et aucune exception n'est
     remontée au propriétaire ;
   - millésime strict : une valeur d'une autre année de revenus n'est jamais
     historisée pour ce millésime.

   Ce module n'appelle pas le réseau par lui-même : il passe par `PF.net.supabase`,
   qui porte la session et les en-têtes. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var TABLE = 'pf2_fiscal_collectes';

    /* Valeurs d'un cache PDF : acceptées seulement si elles portent l'année des
       revenus demandée. Un état d'échec (`{ etat: … }`) n'établit rien. */
    function valeursPdf(preuve, annee) {
        if (!preuve || typeof preuve !== 'object') return null;
        var v = preuve.valeurs && typeof preuve.valeurs === 'object' ? preuve.valeurs : preuve;
        if (v.etat && !v.revenus) return null;
        return Number(v.revenus) === Number(annee) ? v : null;
    }

    /* Une entrée par document que l'application sait lire : la source (telle que la
       contrainte de la migration 013 l'autorise), les valeurs publiques à conserver
       et l'adresse réellement lue. `null` = document absent ou illisible pour ce
       millésime : aucune ligne n'est alors proposée. */
    var FAMILLES = [
        {
            source: 'dgfip_bofip_ir', libelle: 'BOFiP — barème de l’impôt',
            valeurs: function (p) {
                return p.boi && p.boi.ir && p.boi.ir.tranches
                    ? { bareme: { tranches: p.boi.ir.tranches, taux: p.boi.ir.taux } } : null;
            },
            url: function (p) { return p.boi && p.boi.sources && p.boi.sources.ir && p.boi.sources.ir.url; },
            publication: function (p) {
                return p.boi && p.boi.sources && p.boi.sources.ir && p.boi.sources.ir.datePublication;
            }
        },
        {
            source: 'dgfip_bofip_decote', libelle: 'BOFiP — décote',
            valeurs: function (p) {
                return p.boi && p.boi.decote && p.boi.decote.dc
                    ? { decote: p.boi.decote } : null;
            },
            url: function (p) { return p.boi && p.boi.sources && p.boi.sources.decote && p.boi.sources.decote.url; },
            publication: function (p) {
                return p.boi && p.boi.sources && p.boi.sources.decote && p.boi.sources.decote.datePublication;
            }
        },
        {
            source: 'dgfip_bofip_qf', libelle: 'BOFiP — plafond du quotient familial',
            valeurs: function (p) {
                return p.boi && typeof p.boi.qf === 'number' ? { quotient_familial: { plafond_general: p.boi.qf } } : null;
            },
            url: function (p) { return p.boi && p.boi.sources && p.boi.sources.qf && p.boi.sources.qf.url; },
            publication: function (p) {
                return p.boi && p.boi.sources && p.boi.sources.qf && p.boi.sources.qf.datePublication;
            }
        },
        {
            source: 'dgfip_frais', libelle: 'aide du simulateur — barème km et abattement de 10 %',
            valeurs: function (p) {
                var f = p.frais;
                if (!f || !f.km || typeof f.km !== 'object' || !f.abatt) return null;
                return { frais_salaries: { bareme_km: f.km, abattement_10: f.abatt } };
            },
            url: function (p) { return p.urls && p.urls.frais; }
        },
        {
            source: 'dgfip_frais_repas', libelle: 'forfait repas',
            valeurs: function (p) {
                var f = p.frais;
                return f && typeof f.repas === 'number' ? { frais_salaries: { forfait_repas: f.repas } } : null;
            },
            url: function (p) { return p.urls && p.urls.repas; }
        },
        {
            source: 'dgfip_regimes_titres', libelle: 'aide du simulateur — PS et PFU des plus-values de titres',
            valeurs: function (p) {
                var t = p.titres;
                if (!t || typeof t.ps !== 'number') return null;
                return { plus_values_titres: { ps: t.ps, pfu: t.pfu } };
            },
            url: function (p) { return p.urls && p.urls.gains; }
        },
        {
            source: 'dgfip_notice_2086', libelle: 'notice du formulaire 2086',
            valeurs: function (p, annee) {
                var v = valeursPdf(p.notice2086, annee);
                return v ? { actifs_numeriques: v } : null;
            },
            url: function (p) { return p.urls && p.urls.notice2086; }
        },
        {
            source: 'dgfip_brochure_plus_values', libelle: 'brochure IR — plus-values de cession de titres',
            valeurs: function (p, annee) {
                var v = valeursPdf(p.brochureCrypto, annee);
                return v ? { plus_values_titres: v } : null;
            },
            url: function (p) { return p.urls && p.urls.brochureCrypto; }
        },
        {
            source: 'dgfip_brochure_rcm', libelle: 'brochure IR — revenus de capitaux mobiliers',
            valeurs: function (p, annee) {
                var v = valeursPdf(p.brochureRcm, annee);
                return v ? { revenus_capitaux_mobiliers: v } : null;
            },
            url: function (p) { return p.urls && p.urls.brochureRcm; }
        },
        {
            source: 'dgfip_brochure_charges', libelle: 'brochure IR — charges déductibles (CSG)',
            valeurs: function (p, annee) {
                var v = valeursPdf(p.chargesRcm, annee);
                return v ? { charges_deductibles: v } : null;
            },
            url: function (p) { return p.urls && p.urls.charges; }
        },
        {
            // Chapitre « principales nouveautés » : ce lecteur n'est pas encore
            // paramétré par millésime et ne rend des valeurs que pour les revenus
            // 2025 (garde `v.revenus === annee`). Aucune autre année n'est donc
            // historisée par cette famille, et l'adresse est celle réellement lue.
            source: 'dgfip_nouveautes', libelle: 'brochure IR — principales nouveautés (CSG)',
            valeurs: function (p, annee) {
                var v = valeursPdf(p.brochure, annee);
                return v ? { nouveautes_csg: v } : null;
            },
            url: function () {
                return PF.fiscalBrochureSources && PF.fiscalBrochureSources.url;
            }
        }
    ];

    function familles() { return FAMILLES.map(function (f) { return f.source; }); }

    /* Lignes proposées pour un millésime, d'après les preuves lues. Une ligne sans
       adresse lue n'est pas proposée : la contrainte de la table l'exige, et une
       adresse devinée est interdite. */
    function lignes(annee, preuves) {
        var p = preuves || {};
        var an = Number(annee);
        if (!Number.isInteger(an) || an < 2023) return [];
        var out = [];
        FAMILLES.forEach(function (f) {
            var v = null, u = null;
            try { v = f.valeurs(p, an); } catch (_) { v = null; }
            try { u = f.url(p, an); } catch (_) { u = null; }
            if (!v || !u || typeof u !== 'string' || u.indexOf('https://') !== 0) return;
            var pub = null;
            try { pub = f.publication ? f.publication(p, an) : null; } catch (_) { pub = null; }
            var valeurs = {};
            Object.keys(v).forEach(function (k) { valeurs[k] = v[k]; });
            valeurs.document = { url: u, annee_revenus: an, libelle: f.libelle };
            if (pub) valeurs.document.date_publication = pub;
            out.push({ annee_revenus: an, source: f.source, valeurs: valeurs, source_url: u });
        });
        return out;
    }

    function consulter(annee) {
        var sb = PF.net && PF.net.supabase;
        if (!sb || typeof sb.select !== 'function') return Promise.resolve(null);
        return sb.select(TABLE, 'select=source,revision,valeurs,source_url&annee_revenus=eq.' + Number(annee)
            + '&order=revision.desc');
    }

    function identiques(a, b) {
        try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
    }

    /* Écrit l'historique d'une collecte. Ne lève jamais d'exception : un échec
       (réseau, contrainte, migration 013 non appliquée) est rapporté dans `etat` et
       `motif`, et la collecte locale reste la référence du moteur. */
    function historiser(annee, preuves) {
        var sb = PF.net && PF.net.supabase;
        var candidats = lignes(annee, preuves);
        var vide = { ajoutees: [], corrigees: [], ignorees: [] };
        if (!sb || typeof sb.insert !== 'function' || typeof sb.select !== 'function') {
            var sansPont = { etat: 'non historisée', motif: 'pont Supabase absent', revisionPubliee: false };
            return Promise.resolve(Object.assign(sansPont, vide));
        }
        if (!candidats.length) {
            return Promise.resolve(Object.assign({ etat: 'rien à historiser',
                motif: 'aucun document de ce millésime lu', revisionPubliee: false }, vide));
        }
        return consulter(annee).then(function (existantes) {
            if (existantes === null) {
                return Object.assign({ etat: 'non historisée',
                    motif: 'historique illisible (pont Supabase incomplet)', revisionPubliee: false }, vide);
            }
            var dernier = {};
            (Array.isArray(existantes) ? existantes : []).forEach(function (r) {
                if (!r || !r.source) return;
                if (!dernier[r.source] || Number(r.revision) > Number(dernier[r.source].revision)) dernier[r.source] = r;
            });
            var aInserer = [], ignorees = [];
            candidats.forEach(function (c) {
                var ancien = dernier[c.source];
                if (ancien && identiques(ancien.valeurs, c.valeurs) && ancien.source_url === c.source_url) {
                    ignorees.push(c.source);
                    return;
                }
                var revision = ancien ? Number(ancien.revision) + 1 : 1;
                if (!Number.isInteger(revision) || revision < 1) { ignorees.push(c.source); return; }
                c.revision = revision;
                aInserer.push(c);
            });
            if (!aInserer.length) {
                return { etat: 'inchangée', motif: 'documents déjà historisés à l’identique',
                    ajoutees: [], corrigees: [], ignorees: ignorees, revisionPubliee: false };
            }
            var ecrites = [];
            function ecrire(i) {
                if (i >= aInserer.length) return Promise.resolve(null);
                // Insertion séquentielle : la clé primaire
                // (user_id, annee_revenus, source, revision) protège des clics
                // simultanés entre deux appareils.
                return sb.insert(TABLE, [aInserer[i]]).then(function () {
                    ecrites.push(aInserer[i].source);
                    return ecrire(i + 1);
                });
            }
            return ecrire(0).then(function () {
                return {
                    etat: 'historisée',
                    motif: aInserer.length + ' document(s) écrit(s) dans ' + TABLE,
                    ajoutees: ecrites.filter(function (s) { return ignorees.indexOf(s) < 0 && dernier[s] === undefined; }),
                    corrigees: ecrites.filter(function (s) { return dernier[s] !== undefined; }),
                    ignorees: ignorees, revisionPubliee: false
                };
            }).catch(function (err) {
                var msg = String(err && err.message || err);
                return {
                    etat: 'non historisée',
                    motif: /refusée/.test(msg)
                        ? 'écriture refusée par la table — la migration 013 (sources DGFiP) est-elle appliquée ? '
                            + msg.slice(0, 180)
                        : 'écriture interrompue : ' + msg.slice(0, 180),
                    ajoutees: ecrites.filter(function (s) { return dernier[s] === undefined; }),
                    corrigees: ecrites.filter(function (s) { return dernier[s] !== undefined; }),
                    ignorees: ignorees, revisionPubliee: false
                };
            });
        }).catch(function (err) {
            return Object.assign({ etat: 'non historisée',
                motif: 'historique illisible : ' + String(err && err.message || err).slice(0, 180),
                revisionPubliee: false }, vide);
        });
    }

    function texte(annee, resultat) {
        var r = resultat || {};
        if (r.etat === 'historisée') {
            return 'Collecte des revenus ' + annee + ' historisée dans Supabase : '
                + (r.ajoutees.length + r.corrigees.length) + ' document(s) écrit(s)'
                + (r.ignorees.length ? ', ' + r.ignorees.length + ' déjà à l’identique' : '') + '.';
        }
        if (r.etat === 'inchangée') return 'Collecte des revenus ' + annee
            + ' déjà historisée à l’identique : aucune ligne ajoutée.';
        if (r.etat === 'rien à historiser') return 'Revenus ' + annee
            + ' : aucun document lu, rien à historiser.';
        return 'Collecte des revenus ' + annee + ' conservée sur l’appareil, NON historisée dans '
            + 'Supabase : ' + (r.motif || 'raison inconnue') + '.';
    }

    PF.fiscalHistorique = {
        TABLE: TABLE, familles: familles, lignes: lignes, consulter: consulter,
        historiser: historiser, texte: texte
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
