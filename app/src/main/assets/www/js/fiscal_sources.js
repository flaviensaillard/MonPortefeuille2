/* Collecte annuelle OpenFisca (source structurée, pas le Journal officiel).
   Le moteur fiscal ne consomme PAS ces données incomplètes. Chaque correction
   d'une année ajoute une révision ; les anciennes restent dans Supabase. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var SOURCE = 'https://api.fr.openfisca.org/latest/parameter/impot_revenu/bareme_ir_depuis_1945/bareme';
    var TABLE = 'pf2_fiscal_collectes';

    function entier(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }

    function validerBareme(annee, donnees) {
        if (!entier(annee) || annee < 2000 || annee > new Date().getFullYear()) {
            throw new Error('Année de revenus invalide.');
        }
        // Pas de reprise de la dernière valeur antérieure : le millésime doit
        // figurer explicitement dans la source, même s'il n'a pas changé.
        var cle = annee + '-01-01';
        var br = donnees && donnees.brackets && donnees.brackets[cle];
        if (!br || typeof br !== 'object') return null;
        var seuils = Object.keys(br).map(Number).sort(function (a, b) { return a - b; });
        if (seuils.length !== 5 || seuils[0] !== 0 || !seuils.every(entier)) {
            throw new Error('Format du barème inconnu : année non enregistrée.');
        }
        var taux = seuils.map(function (s) { return br[String(s)]; });
        if (taux[0] !== 0 || !taux.every(function (t, i) {
            return typeof t === 'number' && isFinite(t) && t >= 0 && t <= 0.6
                && (i === 0 || t > taux[i - 1]);
        })) throw new Error('Taux IR inattendus : année non enregistrée.');
        if (seuils.some(function (v, i) { return i > 0 && (v <= seuils[i - 1] || v > 1000000); })) {
            throw new Error('Tranches IR incohérentes : année non enregistrée.');
        }
        return { tranches: seuils.slice(1), taux: taux.slice(1), periode: cle };
    }

    function chercher(anneeCible) {
        return PF.net.req('GET', SOURCE, { Accept: 'application/json' }).then(function (rep) {
            if (!rep.ok) {
                if (typeof rep.error === 'string' && rep.error.indexOf('Hôte non autorisé') >= 0) {
                    throw new Error('Accès à OpenFisca bloqué par cette version de l’APK : installez la version corrigée. Aucun chiffre enregistré.');
                }
                var code = Number(rep.status);
                throw new Error('Source OpenFisca inaccessible'
                    + (entier(code) && code >= 100 && code <= 599 ? ' (HTTP ' + code + ')' : ' (réseau)')
                    + ' : aucun chiffre enregistré.');
            }
            if (!rep.json || rep.json.id !== 'impot_revenu.bareme_ir_depuis_1945.bareme') {
                throw new Error('Format de la réponse OpenFisca inattendu : aucun chiffre enregistré.');
            }
            var maintenant = new Date().getFullYear();
            var annees = [];
            for (var an = anneeCible === undefined ? 2022 : anneeCible;
                an <= (anneeCible === undefined ? maintenant : anneeCible); an++) {
                var bareme = validerBareme(an, rep.json);
                if (bareme) annees.push({ annee_revenus: an, source: 'openfisca_bareme_ir',
                    valeurs: bareme, source_url: SOURCE });
            }
            return annees;
        });
    }

    /* Même contrôle lors d'une relecture de la base : une ligne enregistrée
       n'est pas, à elle seule, une source fiable pour la simulation. */
    function validerCollecte(annee, valeurs) {
        if (!valeurs || valeurs.periode !== annee + '-01-01' ||
            !Array.isArray(valeurs.tranches) || valeurs.tranches.length !== 4 ||
            !Array.isArray(valeurs.taux) || valeurs.taux.length !== 4) return null;
        var br = { '0': 0 };
        valeurs.tranches.forEach(function (s, i) { br[String(s)] = valeurs.taux[i]; });
        try {
            var donnees = { brackets: {} };
            donnees.brackets[valeurs.periode] = br;
            var bareme = validerBareme(annee, donnees);
            return bareme && identiques(bareme, valeurs) ? bareme : null;
        } catch (_) { return null; }
    }

    function consulter() {
        return PF.net.supabase.select(TABLE,
            'select=annee_revenus,source,revision,valeurs,source_url,recupere_le');
    }

    function identiques(a, b) {
        return a && a.periode === b.periode
            && JSON.stringify(a.tranches) === JSON.stringify(b.tranches)
            && JSON.stringify(a.taux) === JSON.stringify(b.taux);
    }

    function synchroniser(anneeCible) {
        if (anneeCible !== undefined && (!entier(anneeCible) || anneeCible < 2000 ||
            anneeCible > new Date().getFullYear())) {
            return Promise.reject(new Error('Année de revenus invalide.'));
        }
        return consulter().then(function (existantes) {
            return chercher(anneeCible).then(function (publiees) {
                var dernier = {}, ajoutees = [], corrigees = [];
                (existantes || []).forEach(function (r) {
                    var cle = r.annee_revenus + '|' + r.source;
                    if (!dernier[cle] || Number(r.revision) > Number(dernier[cle].revision)) dernier[cle] = r;
                });
                var aInserer = [];
                publiees.forEach(function (r) {
                    var ancien = dernier[r.annee_revenus + '|' + r.source];
                    if (ancien && identiques(ancien.valeurs, r.valeurs)) return;
                    r.revision = ancien ? Number(ancien.revision) + 1 : 1;
                    if (!entier(r.revision) || r.revision < 1) {
                        throw new Error('Historique de révisions invalide : aucune donnée ajoutée.');
                    }
                    aInserer.push(r);
                    (ancien ? corrigees : ajoutees).push(r.annee_revenus);
                });
                function ajouter(i) {
                    if (i >= aInserer.length) return Promise.resolve();
                    // La clé primaire protège des clics simultanés. En cas de
                    // conflit entre deux téléphones, recharger avant de réessayer.
                    return PF.net.supabase.insert(TABLE, [aInserer[i]])
                        .then(function () { return ajouter(i + 1); });
                }
                return ajouter(0).then(function () {
                    return { ajoutees: ajoutees, corrigees: corrigees,
                        disponibles: publiees.map(function (r) { return r.annee_revenus; }),
                        derniere: publiees.length ? publiees[publiees.length - 1].annee_revenus : null,
                        annee_cible: anneeCible === undefined ? null : anneeCible };
                });
            });
        });
    }

    PF.fiscalSources = { validerBareme: validerBareme, validerCollecte: validerCollecte,
        chercher: chercher, consulter: consulter, synchroniser: synchroniser, SOURCE: SOURCE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
