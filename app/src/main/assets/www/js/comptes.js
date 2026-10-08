/* Comptes de liquidités (MonPortefeuille 2.0) — règles métier, sans DOM ni réseau.

   Un compte porte une banque, une devise, un type (réserve / disponible) et un
   motif. Ses mouvements sont des OPÉRATIONS signées, dans la devise du compte.
   Le solde n'est jamais stocké : il se recalcule toujours comme la somme des
   opérations. Une seule source de vérité.

   Règles tenues ici, et verrouillées par tests/test_comptes.js :
   - aucun change : un mouvement ne se fait que dans une même devise ;
   - cloisonnement : un achat ou une vente ne passe JAMAIS par une réserve ;
   - un compte archivé ne reçoit plus d'opération, mais son solde reste compté
     dans le patrimoine (rien ne disparaît) ;
   - un solde ne devient jamais négatif par un retrait, un achat ou un virement. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util;

    var TYPES = { RESERVE: 'reserve', DISPONIBLE: 'disponible' };
    var LIBELLE_TYPE = { reserve: 'Réserve', disponible: 'Disponible' };
    /* Périmètre de patrimoine d'un compte, selon son type. Une réserve est
       l'épargne de précaution ; un compte disponible est le compte courant. */
    var POCHE_DE_TYPE = { reserve: 'precaution', disponible: 'courant' };
    var TYPES_OPERATION = ['ouverture', 'depot', 'retrait', 'virement',
        'achat_titres', 'vente_titres', 'frais'];
    var DEVISES_COURANTES = ['EUR', 'USD', 'CHF', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD',
        'HKD', 'SGD', 'NOK', 'SEK', 'DKK'];
    var TOLERANCE = 1e-6;

    // ------------------------------------------------------------ identifiants

    /* Identifiant uuid v4. Ce n'est pas un secret : on veut seulement l'unicité. */
    function genererId() {
        var octets = new Uint8Array(16);
        if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(octets);
        else for (var i = 0; i < 16; i++) octets[i] = Math.floor(Math.random() * 256);
        octets[6] = (octets[6] & 0x0f) | 0x40;
        octets[8] = (octets[8] & 0x3f) | 0x80;
        var h = '';
        for (var j = 0; j < 16; j++) h += (octets[j] + 0x100).toString(16).slice(1);
        return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-'
            + h.slice(16, 20) + '-' + h.slice(20, 32);
    }

    // ----------------------------------------------------------------- comptes

    function nettoyer(saisie) {
        saisie = saisie || {};
        return {
            nom: String(saisie.nom || '').trim(),
            banque: String(saisie.banque || '').trim(),
            devise: String(saisie.devise || '').trim().toUpperCase(),
            type: String(saisie.type || '').trim().toLowerCase(),
            motif: String(saisie.motif || '').trim(),
            note: String(saisie.note || '').trim()
        };
    }

    function erreursCompte(c) {
        var erreurs = [];
        if (!c.nom) erreurs.push('Le nom du compte est requis.');
        if (!/^[A-Z]{3}$/.test(c.devise)) {
            erreurs.push('La devise doit être un code à 3 lettres (USD, CHF, CNY…).');
        }
        if (c.type !== TYPES.RESERVE && c.type !== TYPES.DISPONIBLE) {
            erreurs.push('Le type doit être « réserve » ou « disponible ».');
        }
        return erreurs;
    }

    /* Crée un compte à partir de la saisie. Renvoie { compte, erreurs }. */
    function nouveauCompte(saisie) {
        var c = nettoyer(saisie);
        var erreurs = erreursCompte(c);
        if (erreurs.length) return { compte: null, erreurs: erreurs };
        return {
            compte: {
                id: genererId(), nom: c.nom, banque: c.banque || null, devise: c.devise,
                type: c.type, motif: c.motif || null, archive: false, note: c.note || null
            },
            erreurs: []
        };
    }

    /* Modifie un compte. La devise ne peut pas changer une fois que le compte a
       des opérations : sinon ses montants changeraient de sens. Le type, lui, reste
       modifiable (le cahier le prévoit pour le compte CNY migré). */
    function modifierCompte(compte, saisie, operations) {
        var c = nettoyer(saisie);
        var erreurs = erreursCompte(c);
        if (!erreurs.length && c.devise !== compte.devise
            && operationsDuCompte(compte.id, operations).length) {
            erreurs.push('La devise ne peut plus changer : ce compte a déjà des opérations en '
                + compte.devise + '.');
        }
        if (erreurs.length) return { compte: null, erreurs: erreurs };
        return {
            compte: U.clone(Object.assign({}, compte, {
                nom: c.nom, banque: c.banque || null, devise: c.devise, type: c.type,
                motif: c.motif || null, note: c.note || null
            })),
            erreurs: []
        };
    }

    function basculerArchive(compte, archive) {
        return Object.assign({}, compte, { archive: !!archive });
    }

    /* Ligne exacte envoyée à `pf2_comptes`. Ne contient QUE des colonnes du schéma. */
    function versLigneCompte(c) {
        return {
            id: c.id, nom: c.nom, banque: c.banque || null, devise: c.devise, type: c.type,
            motif: c.motif || null, archive: !!c.archive, note: c.note || null
        };
    }

    function comptesActifs(comptes) {
        return (comptes || []).filter(function (c) { return !c.archive; });
    }

    /* Banques déjà saisies, pour les suggestions du champ « banque ». */
    function banquesConnues(comptes) {
        var vues = {};
        (comptes || []).forEach(function (c) {
            if (c.banque) vues[String(c.banque).trim()] = true;
        });
        return Object.keys(vues).sort();
    }

    // -------------------------------------------------------------- opérations

    function operationsDuCompte(compteId, operations) {
        return (operations || []).filter(function (o) { return o.compte_id === compteId; })
            .sort(function (a, b) {
                if (a.date !== b.date) return a.date < b.date ? 1 : -1;
                return (Number(b.id) || 0) - (Number(a.id) || 0);
            });
    }

    /* Solde = somme signée des opérations. `idsExclus` permet de calculer le solde
       « sans » une opération qu'on est en train de modifier. */
    function soldeDuCompte(compteId, operations, idsExclus) {
        var exclus = idsExclus || [];
        var total = 0;
        (operations || []).forEach(function (o) {
            if (o.compte_id !== compteId) return;
            if (exclus.indexOf(o.id) >= 0) return;
            total += U.num(o.montant, 0);
        });
        return U.arrondi(total, 6);
    }

    function montantTitre(sens, quantite, cours, frais) {
        var brut = quantite * cours;
        var signe = sens === 'vente' ? 1 : -1;
        var net = sens === 'vente' ? brut - frais : brut + frais;
        return U.arrondi(signe * net, 6);
    }

    /* Ligne d'opération d'achat ou de vente, liée à sa transaction. Le montant est
       déjà signé (achat < 0, vente > 0). */
    function operationTitre(opts) {
        return {
            compte_id: opts.compte.id,
            type: opts.sens === 'vente' ? 'vente_titres' : 'achat_titres',
            montant: opts.montant,
            date: opts.date,
            contrepartie: null,
            groupe: null,
            transaction_id: opts.transactionId === undefined ? null : opts.transactionId,
            apport_id: null,
            note: opts.note || null
        };
    }

    /* Dépôt ou retrait, éventuellement lié à un apport de fonds. Montant saisi
       positif : le signe est porté par le type. */
    function operationMouvement(opts) {
        var m = U.arrondi(Math.abs(U.num(opts.montant, 0)), 6);
        return {
            compte_id: opts.compte.id,
            type: opts.type === 'retrait' ? 'retrait' : 'depot',
            montant: opts.type === 'retrait' ? -m : m,
            date: opts.date,
            contrepartie: null,
            groupe: null,
            transaction_id: null,
            apport_id: opts.apportId === undefined ? null : opts.apportId,
            note: opts.note || null
        };
    }

    function operationOuverture(compte, montant, date) {
        return {
            compte_id: compte.id, type: 'ouverture', montant: U.arrondi(U.num(montant, 0), 6),
            date: date, contrepartie: null, groupe: null, transaction_id: null, apport_id: null,
            note: 'Solde d’ouverture'
        };
    }

    /* Ligne exacte envoyée à `pf2_operations_compte`. */
    function versLigneOperation(o) {
        return {
            compte_id: o.compte_id, type: o.type, montant: o.montant, date: o.date,
            contrepartie: o.contrepartie || null, groupe: o.groupe || null,
            transaction_id: o.transaction_id === undefined ? null : o.transaction_id,
            apport_id: o.apport_id === undefined ? null : o.apport_id,
            note: o.note || null
        };
    }

    // ------------------------------------------------------------- contrôles

    function verifierMouvement(opts) {
        var erreurs = [];
        var c = opts.compte;
        var m = U.num(opts.montant, NaN);
        if (!c) erreurs.push('Choisissez un compte.');
        if (!(m > 0)) erreurs.push('Le montant doit être supérieur à zéro.');
        if (c && c.archive) erreurs.push('Ce compte est archivé : aucune opération n’y est possible.');
        if (c && opts.type === 'retrait' && m > 0) {
            var solde = soldeDuCompte(c.id, opts.operations, opts.idsExclus);
            if (solde - m < -TOLERANCE) {
                erreurs.push('Solde insuffisant : ' + U.nombre(solde, 2) + ' ' + c.devise
                    + ' disponibles, ' + U.nombre(m, 2) + ' ' + c.devise + ' demandés.');
            }
        }
        return erreurs;
    }

    /* Un achat : compte disponible, de la devise du titre, archivé ou non, et
       solde suffisant. Une réserve n'est JAMAIS acceptée ici. */
    function verifierAchat(opts) {
        var erreurs = verifierCloisonnement(opts.compte, opts.devise);
        if (erreurs.length) return erreurs;
        var montant = U.num(opts.montant, 0);
        var solde = soldeDuCompte(opts.compte.id, opts.operations, opts.idsExclus);
        if (solde - montant < -TOLERANCE) {
            erreurs.push('Solde insuffisant sur « ' + opts.compte.nom + ' » : '
                + U.nombre(solde, 2) + ' ' + opts.compte.devise + ' disponibles, '
                + U.nombre(montant, 2) + ' ' + opts.compte.devise + ' nécessaires. '
                + 'Faites d’abord un dépôt sur ce compte.');
        }
        return erreurs;
    }

    /* Une vente : le produit va sur un compte disponible de la devise du titre. */
    function verifierVente(opts) {
        return verifierCloisonnement(opts.compte, opts.devise);
    }

    function verifierCloisonnement(compte, devise) {
        var erreurs = [];
        if (!compte) { erreurs.push('Choisissez un compte disponible.'); return erreurs; }
        if (compte.archive) erreurs.push('Ce compte est archivé.');
        if (compte.type !== TYPES.DISPONIBLE) {
            erreurs.push('Un achat ou une vente ne passe jamais par une réserve : '
                + '« ' + compte.nom + ' » est une réserve.');
        }
        if (devise && compte.devise !== devise) {
            erreurs.push('« ' + compte.nom + ' » est en ' + compte.devise + ', le titre se cote en '
                + devise + ' : pas de change entre devises.');
        }
        return erreurs;
    }

    /* Comptes proposés pour un achat ou une vente : disponibles, non archivés, de la
       devise du titre. Chaque entrée porte son solde. Une réserve n'apparaît jamais. */
    function comptesPourTitre(comptes, devise, operations) {
        return (comptes || []).filter(function (c) {
            return !c.archive && c.type === TYPES.DISPONIBLE && c.devise === devise;
        }).map(function (c) {
            return { compte: c, solde: soldeDuCompte(c.id, operations) };
        }).sort(function (a, b) { return a.compte.nom < b.compte.nom ? -1 : 1; });
    }

    /* Comptes possibles pour un virement depuis `source` : même devise, non archivés,
       différents de la source. Le filtrage est dur : pas de change. */
    function comptesPourVirement(comptes, source) {
        if (!source) return [];
        return (comptes || []).filter(function (c) {
            return c.id !== source.id && !c.archive && !source.archive && c.devise === source.devise;
        });
    }

    function verifierVirement(opts) {
        var erreurs = [];
        var s = opts.source, d = opts.cible;
        var m = U.num(opts.montant, NaN);
        if (!s || !d) erreurs.push('Choisissez un compte débité et un compte crédité.');
        if (s && d && s.id === d.id) erreurs.push('Choisissez deux comptes différents.');
        if (s && d && s.devise !== d.devise) {
            erreurs.push('Virement impossible : ' + s.devise + ' → ' + d.devise
                + '. Un virement ne se fait que dans une même devise (pas de change).');
        }
        if (s && s.archive) erreurs.push('Le compte débité est archivé.');
        if (d && d.archive) erreurs.push('Le compte crédité est archivé.');
        if (!(m > 0)) erreurs.push('Le montant doit être supérieur à zéro.');
        if (s && m > 0) {
            var solde = soldeDuCompte(s.id, opts.operations, opts.idsExclus);
            if (solde - m < -TOLERANCE) {
                erreurs.push('Solde insuffisant sur « ' + s.nom + ' » : '
                    + U.nombre(solde, 2) + ' ' + s.devise + ' disponibles.');
            }
        }
        return erreurs;
    }

    /* Les deux jambes d'un virement, liées par `groupe`. */
    function construireVirement(opts) {
        var m = U.arrondi(Math.abs(U.num(opts.montant, 0)), 6);
        var groupe = opts.groupe || genererId();
        return [
            { compte_id: opts.source.id, type: 'virement', montant: -m, date: opts.date,
                contrepartie: opts.cible.id, groupe: groupe, transaction_id: null,
                apport_id: null, note: opts.note || null },
            { compte_id: opts.cible.id, type: 'virement', montant: m, date: opts.date,
                contrepartie: opts.source.id, groupe: groupe, transaction_id: null,
                apport_id: null, note: opts.note || null }
        ];
    }

    /* Les jambes d'un virement : celle qui sort (montant < 0) et celle qui entre. */
    function jambesDuVirement(operations, groupe) {
        var jambes = (operations || []).filter(function (o) {
            return o.groupe && o.groupe === groupe;
        });
        return {
            sortie: jambes.filter(function (o) { return U.num(o.montant, 0) < 0; })[0] || null,
            entree: jambes.filter(function (o) { return U.num(o.montant, 0) > 0; })[0] || null
        };
    }

    // -------------------------------------------------------- agrégation

    /* Liquidités regroupées par (devise, poche), pour les lignes `espece` du
       portefeuille. Les comptes archivés restent comptés : leur solde est du
       patrimoine. Un groupe sans solde n'est pas listé (il ne représente rien). */
    function grouperLiquidites(comptes, operations) {
        var groupes = {};
        (comptes || []).forEach(function (c) {
            var solde = soldeDuCompte(c.id, operations);
            var poche = POCHE_DE_TYPE[c.type] || 'courant';
            var cle = c.devise + '|' + poche;
            if (!groupes[cle]) {
                groupes[cle] = { devise: c.devise, poche: poche, quantite: 0, comptes: [] };
            }
            groupes[cle].quantite = U.arrondi(groupes[cle].quantite + solde, 6);
            groupes[cle].comptes.push({ id: c.id, nom: c.nom, solde: solde, archive: !!c.archive });
        });
        return Object.keys(groupes).sort().map(function (k) { return groupes[k]; })
            .filter(function (g) { return Math.abs(g.quantite) > TOLERANCE; });
    }

    // ---------------------------------------------------------- migration

    function nombreDepuisDonnees(v) {
        if (typeof v === 'number') return v;
        var s = String(v === undefined || v === null ? '' : v).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
        if (s === '') return NaN;
        return Number(s);
    }

    /* Plan de migration des lignes cash de la table v1 `Donnees`. Pur : renvoie ce
       qui sera créé, sans écrire. Une ligne illisible ou un doublon ARRÊTE la
       migration : on ne devine pas un solde. */
    function planMigration(donnees, jour) {
        var erreurs = [];
        var specs = {
            USD: { nom: 'Courtage USD', banque: null, type: TYPES.DISPONIBLE, motif: null, typeFixe: true },
            CHF: { nom: 'Livret CHF', banque: 'Swissquote', type: TYPES.RESERVE,
                motif: 'Épargne de précaution', typeFixe: true },
            CNY: { nom: 'Compte CNY', banque: null, type: TYPES.RESERVE, motif: null, typeFixe: false }
        };
        var lues = {};
        (donnees || []).forEach(function (r) {
            var t = String(r.Ticker || r.ticker || '').toUpperCase().trim();
            var typ = String(r.Type || r.type || '');
            var estCash = ['USD', 'EUR', 'CHF', 'CNY'].indexOf(t) >= 0 || /cash/i.test(typ);
            if (!t || !estCash) return;
            if (lues[t]) {
                erreurs.push('La table Donnees contient deux lignes « ' + t + ' ». '
                    + 'Corrigez-la avant la migration : aucun solde n’est deviné.');
                return;
            }
            var brut = r['Quantité'] !== undefined ? r['Quantité'] : (r.Quantite !== undefined ? r.Quantite : r.quantite);
            var solde = (brut === undefined || brut === null || brut === '') ? 0 : nombreDepuisDonnees(brut);
            if (!isFinite(solde)) {
                erreurs.push('Quantité illisible pour « ' + t + ' » : ' + String(brut)
                    + '. Corrigez la ligne Donnees avant la migration.');
                return;
            }
            lues[t] = { solde: solde, typ: typ };
        });
        if (erreurs.length) return { comptes: [], erreurs: erreurs };

        // Les trois comptes du cahier existent toujours, même si la ligne manque :
        // un compte à zéro ne crée aucun argent.
        var cles = Object.keys(specs);
        Object.keys(lues).forEach(function (t) { if (cles.indexOf(t) < 0) cles.push(t); });

        var plan = cles.map(function (t) {
            var spec = specs[t];
            var lue = lues[t] || { solde: 0, typ: '' };
            // USD et CHF : type fixé par le cahier (courtage disponible, livret réserve).
            // Les autres — CNY compris — reprennent le type qu'elles ont dans Donnees :
            // « Cash réserve » devient une réserve, « Cash » un disponible. Le porteur
            // peut le changer ensuite.
            var type;
            if (spec && spec.typeFixe) type = spec.type;
            else if (lue.typ) type = /réserve|reserve/i.test(lue.typ) ? TYPES.RESERVE : TYPES.DISPONIBLE;
            else type = spec ? spec.type : TYPES.DISPONIBLE;   // pas de ligne lue : défaut du cahier
            return {
                origine: t,
                nom: spec ? spec.nom : (t === 'EUR' ? 'Compte courant EUR' : 'Compte ' + t),
                banque: spec ? spec.banque : null,
                devise: t,
                type: type,
                motif: spec ? spec.motif : null,
                solde: U.arrondi(lue.solde, 6),
                note: 'Migré de la table Donnees (v1) le ' + U.jourMoisAnneeISO(jour) + '.'
            };
        });
        return { comptes: plan, erreurs: [] };
    }

    /* Vrai si la migration doit tourner : la table des comptes est lisible et vide. */
    function migrationRequise(comptesLus) {
        return Array.isArray(comptesLus) && comptesLus.length === 0;
    }

    PF.comptes = {
        TYPES: TYPES, LIBELLE_TYPE: LIBELLE_TYPE, POCHE_DE_TYPE: POCHE_DE_TYPE,
        TYPES_OPERATION: TYPES_OPERATION, DEVISES_COURANTES: DEVISES_COURANTES,
        genererId: genererId,
        nouveauCompte: nouveauCompte, modifierCompte: modifierCompte,
        basculerArchive: basculerArchive, versLigneCompte: versLigneCompte,
        erreursCompte: erreursCompte, comptesActifs: comptesActifs,
        banquesConnues: banquesConnues,
        operationsDuCompte: operationsDuCompte, soldeDuCompte: soldeDuCompte,
        montantTitre: montantTitre, operationTitre: operationTitre,
        operationMouvement: operationMouvement, operationOuverture: operationOuverture,
        versLigneOperation: versLigneOperation,
        verifierMouvement: verifierMouvement, verifierAchat: verifierAchat,
        verifierVente: verifierVente, comptesPourTitre: comptesPourTitre,
        comptesPourVirement: comptesPourVirement, verifierVirement: verifierVirement,
        construireVirement: construireVirement, jambesDuVirement: jambesDuVirement,
        grouperLiquidites: grouperLiquidites,
        planMigration: planMigration, migrationRequise: migrationRequise
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
