/* Guide de REPORT sur les imprimés DGFiP, pas une déclaration déposée.
   Sources relues le 17/10/2026 (revenus 2025 / déclaration 2026) :
   2042  10330*30 : …/formulaires/2042/2026/2042_5535.pdf
   2042 C 11222*28 : …/formulaires/2042/2026/2042_5472.pdf
   2047  11226*28 : …/formulaires/2047/2026/2047_5488.pdf
   2074  11905*26 : …/formulaires/2074/2026/2074_5497.pdf
   2074-CMV 15484*11 : …/formulaires/2074-cmv/2026/2074-cmv_5494.pdf
   2086  16043*07 : …/formulaires/2086/2026/2086_5515.pdf
   3916  11916    : …/formulaires/3916/2026/3916_5454.pdf
   Un millésime non publié n'a PAS de lignes officiellement numérotées : les
   repères de 2025 sont montrés comme maquette à revalider, et ses montants
   ne sont jamais présentés comme directement reportables. Hors réseau. */
(function (root) {
    'use strict';
    var PF = root.PF || (root.PF = {});
    var BASE = 'https://www.impots.gouv.fr/sites/default/files/formulaires/';
    var SOURCES = {
        '2042': BASE + '2042/2026/2042_5535.pdf',
        '2042 C': BASE + '2042/2026/2042_5472.pdf',
        '2047': BASE + '2047/2026/2047_5488.pdf',
        '2074': BASE + '2074/2026/2074_5497.pdf',
        '2074-CMV': BASE + '2074-cmv/2026/2074-cmv_5494.pdf',
        '2086': BASE + '2086/2026/2086_5515.pdf',
        '3916 / 3916-bis': BASE + '3916/2026/3916_5454.pdf'
    };
    var DERNIER_VERIFIE = 2025;
    function structure(annee) {
        annee = Number(annee);
        if (!Number.isInteger(annee) || annee < 2022 || annee > 9999) return null;
        return {
            anneeRevenus: annee, anneeDeclaration: annee + 1,
            structureVerifiee: annee === DERNIER_VERIFIE,
            modeleDe: DERNIER_VERIFIE,
            sources: SOURCES,
            avertissement: annee === DERNIER_VERIFIE ? ''
                : 'Les imprimés des revenus ' + annee + ' (déclaration ' + (annee + 1)
                    + ') ne sont pas vérifiés ici. Les fiches et sources ci-dessous sont les REPÈRES des revenus 2025, '
                    + 'sans numéros de case officiels pour ' + annee + ' : consultez les imprimés '
                    + 'DGFiP du bon millésime avant tout report.'
        };
    }

    function h(x) { return PF.ui && PF.ui.h ? PF.ui.h(String(x)) : String(x); }
    function eur(x, dec) {
        return Number.isFinite(x) ? (PF.util ? PF.util.eur(x, { dec: dec === undefined ? 0 : dec }) : String(x) + ' €') : '—';
    }
    function date(x) { return x && PF.util ? PF.util.jourMoisAnneeISO(x) : '—'; }
    function ligne(numero, intitule, valeur, etat, note) {
        return { numero: String(numero), intitule: intitule, valeur: String(valeur),
            etat: etat || 'calcule', note: note || '' };
    }
    /* Une carte par case : code, montant et explication restent côte à côte
       sur téléphone. Ne pas intercaler un tableau de cases vides. */
    function tableau(lignes) {
        return '<div class="fisc-lignes" role="list">' + lignes.map(function (l) {
            return '<div class="fisc-ligne" role="listitem" data-fisc-etat="' + h(l.etat) + '">'
                + '<div class="fisc-ligne-haut"><b>' + h(l.numero) + '</b>'
                + '<b class="' + (l.etat === 'calcule' ? 'up' : 'dim') + '">'
                + h(l.valeur) + '</b></div><div class="fisc-ligne-intitule">' + h(l.intitule) + '</div>'
                + (l.note ? '<div class="st fisc-ligne-note">' + h(l.note) + '</div>' : '')
                + '</div>';
        }).join('') + '</div>';
    }
    function cadre(titre, lignes, note) {
        if (!lignes.length) return '';
        return '<section class="fisc-cadre"><h4>' + h(titre) + '</h4>'
            + (note ? '<p class="st">' + h(note) + '</p>' : '') + tableau(lignes) + '</section>';
    }
    function message(texte, classe) {
        return '<p class="' + (classe || 'st') + '">' + h(texte) + '</p>';
    }
    function cession(cle, titre, montant, corps, ouverts) {
        return '<details class="fisc-cession" data-fisc-cession="' + h(cle) + '"'
            + (ouverts && ouverts[cle] ? ' open' : '') + '><summary><span>'
            + h(titre) + '</span><b>' + h(montant) + '</b></summary><div class="fisc-cession-corps">'
            + corps + '</div></details>';
    }
    function complet(resultat) {
        return !!resultat && !(resultat.indisponible && resultat.indisponible.length);
    }
    function completPour(resultat, annee) {
        return complet(resultat) && Number(resultat.annee) === Number(annee);
    }
    function resumeFormulaire(nom, s, data) {
        if (!s.structureVerifiee) return 'Repères 2025 uniquement · aucun montant reportable';
        var t = completPour(data.t2074, s.anneeRevenus) ? data.t2074 : null;
        var c = completPour(data.t2086, s.anneeRevenus) ? data.t2086 : null;
        var r = data.reglages || {}, interets = Number(r.interetsEtrangers);
        var salaires = data.sim && data.sim.annee === s.anneeRevenus
            ? data.sim : data.base || {};
        if (nom === '2074') return data.t2074 && !t ? 'Total suspendu · cours ou position absent'
            : t && t.operations && t.operations.length
                ? '903/PV ' + eur(t.ligne_903_pv, 2) + ' · 903/MV ' + eur(t.ligne_903_mv, 2)
                : 'Ventes de titres · aucune cession chiffrée';
        if (nom === '2086') return data.t2086 && !c ? 'Total suspendu · cours ou position absent'
            : c && c.cessions && c.cessions.length
                ? '224 estimée ' + eur(c.plus_value_globale_224, 2) + ' · 51 ' + eur(c.total_cessions_218, 2)
                : 'Crypto · aucune cession chiffrée';
        if (nom === '2042 C') return t && t.operations && t.operations.length
            ? 'Titres : 3VG ' + eur(t.case_3vg, 2) + ' · 3VH ' + eur(t.case_3vh, 2)
                + (c && c.cessions && c.cessions.length ? ' · crypto : 224 estimée '
                    + eur(c.plus_value_globale_224, 2) : '')
            : c && c.cessions && c.cessions.length
                ? 'Crypto : 224 estimée ' + eur(c.plus_value_globale_224, 2) + ' · seuil du foyer'
                : 'Résultat titres et crypto · lire les cessions';
        if (nom === '2042') return (Number.isFinite(salaires.case_1aj) && salaires.case_1aj > 0
            ? '1AJ ' + eur(salaires.case_1aj, 0) : 'Salaires')
            + (Number.isFinite(interets) && interets > 0 ? ' · 2TR ' + eur(interets, 0) : ' · intérêts');
        if (nom === '2047') return Number.isFinite(interets) && interets > 0
            ? 'Intérêts saisis ' + eur(interets, 0) + ' · qualification à confirmer'
            : 'Revenus de source étrangère · si concernés';
        if (nom === '2074-CMV') return 'Parcours alternatif · ne pas doubler la 2074';
        if (nom === '3916 / 3916-bis') return (data.comptes || []).length
            + ' compte(s) répertorié(s) · informations personnelles absentes';
        return 'Voir les chiffres de l’application';
    }
    /* <details> est repliable au clavier et au toucher, sans gestionnaire JS.
       Son état open est restitué lors du remplacement asynchrone des montants. */
    function formulaire(nom, corps, sousTitre, s, resume, ouvert) {
        return '<details class="card fisc-imprime" data-fisc-imprime="' + h(nom) + '"'
            + (ouvert ? ' open' : '') + '><summary><span class="fisc-imprime-tete"><h3>'
            + h(nom) + ' · revenus ' + h(s.anneeRevenus) + '</h3>'
            + '<span class="fisc-imprime-resume">' + h(resume) + '</span></span>'
            + '<span class="fisc-imprime-chevron" aria-hidden="true">⌄</span></summary>'
            + '<div class="fisc-imprime-corps"><div class="st">' + h(sousTitre) + ' · '
            + (s.structureVerifiee ? 'repères du formulaire 2026 vérifiés'
                : 'modèle 2026 / cases du millésime NON vérifiées') + '</div>'
            + corps + '<p class="st">Source : <a href="' + h(s.sources[nom])
            + '" target="_blank" rel="noopener noreferrer">imprimé DGFiP revenus 2025</a>.</p></div></details>';
    }
    function raison(liste) {
        return (liste || []).map(function (m) {
            return (m.actif ? m.actif + ' · ' : '') + (m.devise || 'cours/position')
                + (m.date ? ' au ' + date(m.date) : '');
        }).join(' ; ');
    }
    /* Les additions portent sur les seules cessions calculées. 903 additionne
       séparément les gains/pertes DE CHAQUE VENTE : le net par ticker ne remplace
       jamais les deux colonnes de l'imprimé. */
    function resumeTitres(operations) {
        var groupes = Object.create(null), ordre = [];
        operations.forEach(function (op) {
            var cle = String(op.actif);
            if (!groupes[cle]) {
                groupes[cle] = { actif: cle, n: 0, brut: 0, frais: 0, net: 0,
                    cout: 0, pv: 0, mv: 0, bilan: 0 };
                ordre.push(groupes[cle]);
            }
            var g = groupes[cle];
            g.n++;
            g.brut += op.ligne_516; g.frais += op.ligne_517;
            g.net += op.ligne_518; g.cout += op.ligne_523;
            g.pv += Math.max(0, op.ligne_524);
            g.mv += Math.max(0, -op.ligne_524);
            g.bilan += op.ligne_524;
        });
        return '<div class="fisc-cadre"><h4>Montants par titre · contrôle de vos ventes</h4>'
            + '<p class="st">Synthèse du portefeuille, PAS une ligne de l’imprimé : '
            + 'les colonnes 903/PV et 903/MV additionnent les résultats de chaque cession, même '
            + 'si des ventes du même titre se compensent.</p>'
            + ordre.map(function (g) {
                return '<div class="fisc-titre"><b>' + h(g.actif) + ' · ' + g.n
                    + ' cession(s) · résultat net ' + h(eur(g.bilan, 2)) + '</b>'
                    + '<div>516 brut ' + h(eur(g.brut, 2)) + ' − 517 frais '
                    + h(eur(g.frais, 2)) + ' = 518 net ' + h(eur(g.net, 2))
                    + ' ; 523 coût ' + h(eur(g.cout, 2)) + '</div>'
                    + '<div>Contribution 903/PV ' + h(eur(g.pv, 2))
                    + ' · 903/MV ' + h(eur(g.mv, 2)) + '</div></div>';
            }).join('') + '</div>';
    }
    function resumeCrypto(cessions) {
        var groupes = Object.create(null), ordre = [];
        cessions.forEach(function (op) {
            var cle = String(op.actif);
            if (!groupes[cle]) {
                groupes[cle] = { actif: cle, n: 0, brut: 0, frais: 0, net: 0, bilan: 0 };
                ordre.push(groupes[cle]);
            }
            var g = groupes[cle];
            g.n++; g.brut += op.ligne_213; g.frais += op.ligne_214;
            g.net += op.ligne_218; g.bilan += op.ligne_224;
        });
        return '<div class="fisc-cadre"><h4>Montants par crypto-actif · contrôle des cessions</h4>'
            + '<p class="st">Calcul intermédiaire par actif du seul portefeuille sous hypothèse '
            + 'sans soulte ; seule la ligne 224 totalise le déclarant, la 52 concerne le foyer.</p>'
            + ordre.map(function (g) {
                return '<div class="fisc-titre"><b>' + h(g.actif) + ' · ' + g.n
                    + ' cession(s) · résultat estimé ' + h(eur(g.bilan, 2)) + '</b>'
                    + '<div>213 brut ' + h(eur(g.brut, 2)) + ' − 214 frais '
                    + h(eur(g.frais, 2)) + ' = 218 net si aucune soulte ' + h(eur(g.net, 2))
                    + '</div></div>';
            }).join('') + '</div>';
    }

    /* Le guide commence par les données de l'application, pas par des lignes
       vides. Les montants du portefeuille restent distincts des cases du foyer.
       Un segment incomplet ne fournit aucun total partiel, sans effacer l'autre. */
    function donnees(annee, data, ouverts) {
        var a = {};
        if (annee !== DERNIER_VERIFIE) {
            Object.keys(SOURCES).forEach(function (imprime) {
                a[imprime] = message('Modèle des revenus 2025 seulement : aucune case ni valeur '
                    + 'du formulaire des revenus ' + annee + ' n’est vérifiée ici. Consultez l’imprimé '
                    + 'publié pour ce millésime avant de reporter un montant.', 'info');
            });
            return a;
        }
        var sim = data.sim && data.sim.annee === annee ? data.sim : null;
        var salaires = sim || data.base || {};
        var r = data.reglages || {};
        var comptes = Array.isArray(data.comptes) ? data.comptes : [];
        var t = completPour(data.t2074, annee) ? data.t2074 : null;
        var c = completPour(data.t2086, annee) ? data.t2086 : null;
        var ventes = !!(t && t.operations && t.operations.length);
        var crypto = !!(c && c.cessions && c.cessions.length);
        var interets = Number(r.interetsEtrangers);
        var interetsConnus = Number.isFinite(interets) && interets > 0;
        var etatCessions = ouverts && ouverts.cessions;
        function anomalie(resultat, libelle, consequences) {
            if (!resultat || completPour(resultat, annee)) return '';
            return message(libelle + ' non chiffrables : '
                + (resultat.annee !== annee ? 'données d’une autre année refusées'
                    : raison(resultat.indisponible)) + '. ' + consequences, 'erreur');
        }
        function limites(titre, texte) {
            return '<details class="fisc-limites"><summary>' + h(titre) + '</summary>'
                + message(texte) + '</details>';
        }

        var salaireLignes = [];
        if (Number.isFinite(salaires.case_1aj) && salaires.case_1aj > 0) {
            salaireLignes.push(ligne('1AJ', 'Salaire net imposable · déclarant 1', eur(salaires.case_1aj, 0)));
            if (salaires.case_1ak === null) salaireLignes.push(ligne('1AK', 'Frais réels',
                'Case vide · abattement automatique de 10 %'));
            else if (Number.isFinite(salaires.case_1ak)) salaireLignes.push(ligne('1AK',
                'Frais réels · déclarant 1', eur(salaires.case_1ak, 0)));
        }
        if (salaires.couple && Number.isFinite(salaires.case_1bj) && salaires.case_1bj > 0) {
            salaireLignes.push(ligne('1BJ', 'Salaire net imposable · déclarant 2', eur(salaires.case_1bj, 0)));
            if (salaires.case_1bk === null) salaireLignes.push(ligne('1BK', 'Frais réels',
                'Case vide · abattement automatique de 10 %'));
            else if (Number.isFinite(salaires.case_1bk)) salaireLignes.push(ligne('1BK',
                'Frais réels · déclarant 2', eur(salaires.case_1bk, 0)));
        }
        var revenus = interetsConnus ? [ligne('2TR', 'Intérêts étrangers saisis', eur(interets, 0),
            'calcule', 'Montant de l’application ; ajouter, le cas échéant, les autres intérêts du foyer.')] : [];
        if (sim && sim.options_fiscales && sim.options_fiscales.assiette_2op > 0)
            revenus.push(ligne('2OP', 'Option globale pour le barème · revenus mobiliers et titres',
                sim.cocher_2op ? 'Envisagée par la simulation' : 'Non retenue par la simulation',
                'conditionnel', 'Décision du foyer entier ; indépendante de l’option crypto 3CN.'));
        a['2042'] = cadre('1 · Salaires et frais saisis', salaireLignes)
            + cadre('2 · Intérêts et option sur les titres', revenus)
            + (comptes.length ? cadre('8 · Comptes à l’étranger', [ligne('8UU',
                'Déclaration de comptes étrangers', comptes.length + ' compte(s) répertorié(s)',
                'conditionnel', 'Vérifier les titulaires et les autres comptes du foyer dans la 3916.')]) : '')
            + (salaireLignes.length || revenus.length || comptes.length ? ''
                : message('Aucun salaire, intérêt ou compte enregistré dans ce guide pour cette année.', 'info'))
            + limites('Ce que l’application ne renseigne pas · précompte et CSG',
                'Les cases 2CG, 2BH et 2DF dépendent des prélèvements sociaux déjà acquittés ; '
                + '6DE dépend de la CSG déductible du patrimoine effectivement payée par le foyer. '
                + 'Elles ne valent pas zéro par défaut. Ne pas compter deux fois la CSG liée à 2BH/2DF dans 6DE.');

        var resultats = [];
        if (ventes) {
            resultats.push(ligne('3VG', 'Gain sur titres après compensation · avant abattement',
                eur(t.case_3vg, 0), 'calcule', 'Part de ce portefeuille ; tenir compte des autres comptes du foyer.'));
            resultats.push(ligne('3VH', 'Perte nette sur titres (montant positif)',
                eur(t.case_3vh, 0), 'calcule', '0 € signifie aucune perte nette dans ce portefeuille seulement.'));
        }
        if (crypto) {
            resultats.push(ligne('3AN', 'Gain crypto · projection si le foyer se limite à ces cessions',
                eur(c.case_3an, 0), 'conditionnel',
                'Calcul avec le seuil de 305 € sur les seules cessions enregistrées, sans soulte ; '
                    + 'ne pas reporter tel quel sans connaître la ligne 51 du foyer. 224 estimée : '
                    + eur(c.plus_value_globale_224, 2) + '.'));
            resultats.push(ligne('3BN', 'Perte crypto · projection si le foyer se limite à ces cessions',
                eur(c.case_3bn, 0), 'conditionnel',
                'Les autres cessions du foyer peuvent changer le seuil et le signe du résultat.'));
        }
        if (sim && sim.options_fiscales && sim.options_fiscales.assiette_3cn > 0)
            resultats.push(ligne('3CN', 'Option barème des gains crypto',
                sim.cocher_3cn ? 'Envisagée par la simulation' : 'Non retenue par la simulation',
                'conditionnel', 'Décision du foyer entier, distincte de 2OP.'));
        a['2042 C'] = cadre('3 · Résultat de vos titres et crypto-actifs', resultats)
            + anomalie(data.t2074, 'Titres', 'Aucune 3VG/3VH partielle proposée.')
            + anomalie(data.t2086, 'Crypto-actifs', 'Aucune 3AN/3BN partielle proposée.')
            + (!resultats.length && !data.t2074 && !data.t2086
                ? message('Les résultats des ventes apparaîtront après lecture des opérations.', 'info') : '')
            + limites('Données du foyer et abattement éventuel (3SG)',
                '3VG/3VH ne totalisent que les titres de l’application. 3AN/3BN et la ligne 52 '
                + 'dépendent de toutes les cessions du foyer et du seuil calculé avec la ligne 51. '
                + (t && t.abattementsNonVerifies
                    ? 'Un titre acquis avant 2018 nécessite de vérifier l’abattement 3SG et l’option 2OP ; aucun 0 € n’est présumé.'
                    : '3SG concerne seulement un éventuel abattement éligible avec option 2OP ; 3CN est une autre option.'));

        a['2047'] = (interetsConnus ? cadre('2 · Intérêts saisis dans l’application', [
            ligne('252 → 2TR', 'Intérêts étrangers enregistrés', eur(interets, 0), 'calcule',
                'Montant saisi : pas d’autre calcul requis pour afficher ce chiffre.'),
            ligne('250', 'Intérêts sans crédit d’impôt étranger', eur(interets, 0), 'conditionnel',
                'Même montant si la qualification sans crédit d’impôt est confirmée.'),
            ligne('251', 'Total 238 + 240 + 250', eur(interets, 0), 'conditionnel',
                'Même montant seulement si les lignes 238 et 240 du foyer sont nulles.')
        ]) : message('Aucun intérêt étranger positif saisi pour cette année.', 'info'))
            + limites('Si la source fiscale ou la retenue étrangère diffère',
                'Une banque étrangère ne prouve pas la source des intérêts ou des plus-values. '
                + 'Si un crédit d’impôt s’applique, examiner les lignes 231–240 et le cadre 7. '
                + 'Le cadre 3 / ligne 30 ne concerne que les plus-values de source étrangère : '
                + 'la source et la retenue ne sont pas déduites du pays du courtier.');

        var recapTitres = ventes ? cadre('900 · Totaux des ventes de ce portefeuille', [
            ligne('903 / PV', 'Somme des résultats positifs de chaque vente', eur(t.ligne_903_pv, 2)),
            ligne('903 / MV', 'Somme des résultats négatifs de chaque vente, en positif', eur(t.ligne_903_mv, 2)),
            ligne('913 / total', 'Part connue du total du cadre 900',
                'PV ' + eur(t.ligne_903_pv, 2) + ' · MV ' + eur(t.ligne_903_mv, 2),
                'conditionnel', 'Inclure, s’il y en a, les autres rubriques du cadre et du foyer.')
        ], '913 existe : c’est le total du cadre 900 ; 905 concerne les instruments à terme, pas les ventes de titres.') : '';
        var ventesTitres = ventes ? t.par_actif.map(function (op, idx) {
            var montants = [
                ligne('511', 'Titre suivi', op.actif, 'calcule', 'Intermédiaire financier non renseigné dans ces transactions.'),
                ligne('512', 'Date de la cession', date(op.ligne_512)),
                ligne('514', 'Prix unitaire de cession', eur(op.ligne_514, 4)),
                ligne('515', 'Nombre de titres cédés', PF.util ? PF.util.quantite(op.ligne_515) : String(op.ligne_515)),
                ligne('516', 'Prix brut de cession', eur(op.ligne_516, 2)),
                ligne('517', 'Frais de cession', eur(op.ligne_517, 2)),
                ligne('518', 'Prix net de cession (516 − 517)', eur(op.ligne_518, 2)),
                ligne('520', 'Prix d’acquisition unitaire hors frais', eur(op.ligne_520, 4)),
                ligne('521', 'Prix d’acquisition global', eur(op.ligne_521, 2)),
                ligne('522', 'Frais d’acquisition', eur(op.ligne_522, 2)),
                ligne('523', 'Coût de revient (521 + 522)', eur(op.ligne_523, 2)),
                ligne('524', 'Résultat de cette vente (518 − 523)', eur(op.ligne_524, 2))
            ];
            return cession('2074|' + op.actif + '|' + op.ligne_512 + '|' + idx,
                op.actif + ' · ' + date(op.ligne_512) + ' · 510', eur(op.ligne_524, 2),
                cadre('510 · détail de cette cession', montants,
                    'Chaque cession occupe une colonne ; une même action peut avoir plusieurs dates et prix.'),
                etatCessions);
        }).join('') : '';
        var pertesPassees = t && t.cadre_10 ? t.cadre_10.map(function (x) {
            return ligne(String(x.annee), '10 · perte antérieure enregistrée', eur(x.montant, 2),
                'conditionnel', 'Portefeuille suivi seulement ; tenir compte du foyer.');
        }) : [];
        var colonnes = t && t.cadre_11 ? t.cadre_11.reduce(function (lignes, x, idx) {
            var prefixe = '1133 / ' + (idx + 1) + ' · ', titre = x.actif + ' · ';
            [['A', 'Gain avant abattement', x.col_a], ['B', 'Pertes de l’année imputées', x.col_b],
                ['C', 'Solde A − B', x.col_c], ['D', 'Pertes antérieures imputées', x.col_d],
                ['E', 'Solde C − D', x.col_e], ['F', 'Abattement de droit commun', x.col_f],
                ['G', 'Abattement renforcé', x.col_g], ['H', 'Solde E − F − G', x.col_h]]
                .forEach(function (col) {
                    if (col[2] !== null) lignes.push(ligne(prefixe + col[0], titre + col[1],
                        eur(col[2], 2), 'calcule', 'Parts calculées pour ce portefeuille.'));
                });
            return lignes;
        }, []) : [];
        var pertesRestantes = t && t.cadre_12 ? t.cadre_12.map(function (x) {
            return ligne(String(x.annee), '12 · perte restant reportable dans ce portefeuille',
                eur(x.montant, 2), 'conditionnel', 'Historique fiscal du foyer à réunir.');
        }) : [];
        a['2074'] = anomalie(data.t2074, 'Titres', 'Aucun total 903 ou 3VG/3VH partiel proposé.')
            + recapTitres
            + (ventes ? resumeTitres(t.par_actif)
                + '<h4 class="fisc-details-titre">Détail par cession · toucher une vente pour ses lignes 510</h4>'
                + ventesTitres
                : t ? message('Aucune vente de titres enregistrée pour ' + annee + '.', 'info')
                    : !data.t2074 ? message('Lecture des ventes de titres en cours.', 'info') : '')
            + cadre('10 · Pertes antérieures connues du portefeuille', pertesPassees)
            + cadre('11 · Compensation des gains · colonnes A à H', colonnes,
                'Un titre peut figurer plusieurs fois au cadre 510 ; ici la compensation suit les ventes.')
            + (t && t.abattementsNonVerifies ? limites('Abattements F/G/H non chiffrés',
                'Une acquisition avant 2018 et l’option 2OP peuvent modifier ces colonnes : '
                + 'aucun zéro n’est déduit des opérations seules.') : '')
            + (colonnes.length ? cadre('11 · Somme des pertes imputées', [ligne('1164',
                'Total de la colonne D connue', eur(t.ligne_1164, 2), 'conditionnel',
                'Ajouter les pertes des autres comptes du foyer, si elles existent.')]) : '')
            + cadre('12 · Pertes encore reportables', pertesRestantes)
            + limites('Autres éléments éventuels de la 2074',
                'L’application calcule les ventes de titres présentes ici. L’intermédiaire financier, '
                + 'les ventes et pertes antérieures hors application, les abattements avant 2018 '
                + 'et les autres rubriques du cadre 900 ne sont pas établis par ces transactions.');

        a['2074-CMV'] = message('Parcours alternatif : la fiche 2074-CMV est réservée aux cas '
            + 'de dispense de la 2074 avec calculs par un intermédiaire. Ne pas reporter les '
            + 'mêmes ventes sur la 2074 et la 2074-CMV.')
            + (ventes ? cadre('Montants de l’application · rappel de la 2074, PAS cases CMV', [
                ligne('903 / PV', 'Gains calculés par vos ventes', eur(t.ligne_903_pv, 2)),
                ligne('903 / MV', 'Pertes calculées par vos ventes', eur(t.ligne_903_mv, 2))
            ]) : '')
            + limites('Quand les lignes 21–25 de la CMV sont utiles',
                'Les lignes 21 et 25 reposent sur les calculs de l’intermédiaire financier ; '
                + 'la ligne 1 reprend le stock antérieur du foyer et 22–24 concernent des produits '
                + 'spécifiques (PEA/PEAC). Ces lignes ne sont pas déduites automatiquement de 903.');

        var totalsCrypto = crypto ? cadre('2 · Total de vos cessions / 5 · part connue du foyer', [
            ligne('224', 'Résultat estimé du déclarant avec les cessions enregistrées',
                eur(c.plus_value_globale_224, 2), 'conditionnel', 'Sous hypothèse sans soulte.'),
            ligne('51', 'Prix nets 218 de ces cessions · part connue du foyer',
                eur(c.total_cessions_218, 2), 'conditionnel',
                'Ce total ne suffit pas à prouver l’exonération du foyer fiscal : le seuil de 305 € '
                    + 'porte aussi sur les cessions du conjoint hors de ce portefeuille, des personnes '
                    + 'à charge et des autres supports.'),
            ligne('52', 'Résultat de ces cessions · projection si foyer = application',
                eur(c.plus_value_globale_224, 2), 'conditionnel',
                '52 totalise le foyer entier (224 + autres déclarants), pas seulement cette application.')
        ], '224 totalise les cessions du déclarant, 51 et 52 concernent tout le foyer ; '
            + 'aucune projection 3AN/3BN n’est définitive sans ces autres opérations.') : '';
        var ventesCrypto = crypto ? c.cessions.map(function (op, idx) {
            return cession('2086|' + op.actif + '|' + op.date + '|' + idx,
                op.actif + ' · ' + date(op.date) + ' · 2086', eur(op.ligne_224, 2) + ' estimés',
                cadre('2 · cession ' + (idx + 1), [
                    ligne('211', 'Date de cession', date(op.date)),
                    ligne('212', 'Valeur globale du portefeuille crypto suivi', eur(op.ligne_212, 2),
                        'conditionnel', 'Autres plateformes ou wallets non connus de l’application.'),
                    ligne('213', 'Prix brut de cession', eur(op.ligne_213, 2)),
                    ligne('214', 'Frais de cession', eur(op.ligne_214, 2)),
                    ligne('215', 'Prix net des frais (213 − 214)', eur(op.ligne_215, 2)),
                    ligne('217', 'Prix net des soultes · si aucune soulte (213 ± 216)',
                        eur(op.ligne_217, 2), 'conditionnel'),
                    ligne('218', 'Prix net des frais et soultes · si aucune soulte (215 ± 216)',
                        eur(op.ligne_218, 2), 'conditionnel'),
                    ligne('220', 'Prix total d’acquisition du portefeuille suivi', eur(op.ligne_220, 2), 'conditionnel'),
                    ligne('221', 'Capital déjà déduit sur les cessions précédentes', eur(op.ligne_221, 2), 'conditionnel'),
                    ligne('223', 'Coût restant · si aucune soulte antérieure (220 − 221 − 222)',
                        eur(op.ligne_223, 2), 'conditionnel'),
                    ligne('Calcul (hors case)', 'Contribution de cette vente à 224',
                        eur(op.ligne_224, 2) + ' · sans soulte', 'conditionnel')
                ], 'Chaque cession occupe une colonne, avec sa vraie date.'), etatCessions);
        }).join('') : '';
        a['2086'] = anomalie(data.t2086, 'Crypto-actifs',
                'Aucun total 224/51 ou 3AN/3BN partiel proposé.')
            + totalsCrypto
            + (crypto ? resumeCrypto(c.cessions)
                + '<h4 class="fisc-details-titre">Détail par cession · toucher une vente pour ses lignes 211–223</h4>'
                + ventesCrypto
                : c ? message('Aucune cession crypto enregistrée pour ' + annee + '.', 'info')
                    : !data.t2086 ? message('Lecture des cessions crypto en cours.', 'info') : '')
            + limites('Informations non présentes dans les transactions · 2086',
                'Identité du déclarant (cadre 2), soultes éventuelles des lignes 216/222 et '
                + 'avoirs crypto sur d’autres plateformes ou du foyer : l’application ne les '
                + 'invente pas. Les lignes 217/218/223/224 et la projection 52 sont estimées sans soulte.');

        a['3916 / 3916-bis'] = (comptes.length
            ? message(comptes.length + ' compte(s) étranger(s) répertorié(s) dans l’application.')
                + '<ul class="fisc-comptes">' + comptes.map(function (compte) {
                    return '<li>' + h(compte) + '</li>';
                }).join('') + '</ul>'
            : message('Aucun compte étranger répertorié dans ce guide ; cela ne prouve pas '
                + 'qu’il n’existe aucun autre compte du foyer.', 'info'))
            + limites('Champs non enregistrés pour chaque 3916 / 3916-bis',
                'Un imprimé par compte : identité et adresse du titulaire (cadre 1), type de compte (2), '
                + 'numéro, dates et coordonnées bancaires (3.1–3.2) ou prestataire crypto (4.1–4.3), '
                + 'usage (5). Les titulaires et comptes du foyer hors application restent à identifier.');
        return a;
    }
    function apercu(data, annee) {
        var salaires = data.sim && data.sim.annee === annee ? data.sim : data.base || {};
        var interets = Number((data.reglages || {}).interetsEtrangers);
        var t = completPour(data.t2074, annee) ? data.t2074 : null;
        var c = completPour(data.t2086, annee) ? data.t2086 : null;
        var connus = [];
        if (Number.isFinite(salaires.case_1aj) && salaires.case_1aj > 0)
            connus.push(ligne('1AJ', 'Salaire saisi', eur(salaires.case_1aj, 0)));
        if (salaires.couple && Number.isFinite(salaires.case_1bj) && salaires.case_1bj > 0)
            connus.push(ligne('1BJ', 'Salaire du conjoint saisi', eur(salaires.case_1bj, 0)));
        if (Number.isFinite(interets) && interets > 0)
            connus.push(ligne('2TR', 'Intérêts saisis', eur(interets, 0)));
        if (t && t.operations && t.operations.length) {
            connus.push(ligne('3VG', 'Gain net de ces titres', eur(t.case_3vg, 0)));
            connus.push(ligne('3VH', 'Perte nette de ces titres', eur(t.case_3vh, 0)));
            connus.push(ligne('2074 · 903/PV', 'Somme des ventes positives', eur(t.ligne_903_pv, 2)));
            connus.push(ligne('2074 · 903/MV', 'Somme des ventes négatives', eur(t.ligne_903_mv, 2)));
        }
        if (c && c.cessions && c.cessions.length) {
            connus.push(ligne('2086 · 224', 'Résultat de ces cessions · sans soulte',
                eur(c.plus_value_globale_224, 2), 'conditionnel'));
            connus.push(ligne('2086 · 51', 'Prix nets connus · partie du foyer',
                eur(c.total_cessions_218, 2), 'conditionnel'));
        }
        return '<section class="fisc-apercu" aria-label="Montants issus de l’application">'
            + '<h3>Vos chiffres dans l’application · revenus ' + h(annee) + '</h3>'
            + message('Les montants ci-dessous viennent de vos saisies et ventes enregistrées. '
                + 'Les détails par titre et par cession sont dans les imprimés repliables ; '
                + 'seules les données absentes du foyer restent à identifier.')
            + (connus.length ? tableau(connus)
                : message('Aucun montant encore calculable : lecture des opérations en cours '
                    + 'ou aucune vente enregistrée.', 'info'))
            + ((data.t2074 && !t) || (data.t2086 && !c)
                ? message('Un segment sans cours, position ou année valide ne fournit aucun total partiel ; '
                    + 'les autres montants affichés restent calculés.', 'attention') : '')
            + '</section>';
    }
    function render(annee, data, ouverts) {
        var s = structure(annee);
        if (!s) return '<div class="erreur">Année des revenus invalide (2025 à 9999).</div>';
        annee = s.anneeRevenus;
        data = data || {};
        var d = donnees(annee, data, ouverts);
        var etat = s.structureVerifiee ? 'Revenus ' + annee + ' · déclaration ' + s.anneeDeclaration
            + ' : numéros des imprimés DGFiP vérifiés pour ce millésime.' : s.avertissement;
        var estimations = [];
        if (!s.structureVerifiee) {
            if (completPour(data.t2074, annee) && data.t2074.operations && data.t2074.operations.length) {
                estimations.push('titres ' + eur(data.t2074.bilan_net, 2));
                (data.t2074.par_actif || []).forEach(function (op) {
                    estimations.push(op.actif + ' le ' + date(op.ligne_512) + ' : ' + eur(op.ligne_524, 2));
                });
            }
            if (completPour(data.t2086, annee) && data.t2086.cessions && data.t2086.cessions.length) {
                estimations.push('crypto ' + eur(data.t2086.plus_value_globale_224, 2));
                data.t2086.cessions.forEach(function (op) {
                    estimations.push(op.actif + ' le ' + date(op.date) + ' : ' + eur(op.ligne_224, 2)
                        + ' (hypothèse sans soulte)');
                });
            }
        }
        var estimation = estimations.length
            ? '<div class="info">Calcul des seules écritures connues, NON reportable avant publication des imprimés '
                + '(ni garantie de complétude du foyer) : ' + h(estimations.join(' · ')) + '.</div>' : '';
        var simulation = data.erreurSim
            ? '<div class="attention">Simulation d’impôt du foyer indisponible : ' + h(data.erreurSim)
                + '. Les cases calculées ci-dessus restent consultables ; ce bilan ne valide '
                + 'pas les autres opérations du foyer.</div>' : '';
        return '<div class="fisc-guide"><div class="' + (s.structureVerifiee ? 'info' : 'attention') + '">'
            + h(etat) + '</div>'
            + (s.structureVerifiee ? apercu(data, annee) : estimation)
            + (data.erreur ? message('Calcul suspendu : ' + data.erreur, 'attention') : '')
            + simulation
            + (s.structureVerifiee ? message('Ouvrez un imprimé pour voir ses cases. '
                + 'Touchez une vente pour afficher toutes ses lignes de calcul.') : '')
            + Object.keys(SOURCES).map(function (n) {
                return formulaire(n, d[n], n === '2074' ? 'Cadres 5, 900, 10, 11, 12' :
                    n === '2086' ? 'Cadres 2 et 5' : n === '3916 / 3916-bis'
                        ? 'Cadres 1, 2, 3/4 et 5' : 'Cases/cadres utiles à ce portefeuille',
                    s, resumeFormulaire(n, s, data), !!(ouverts && ouverts[n]));
            }).join('') + '</div>';
    }
    PF.fiscalFormulairesDgfip = { SOURCES: SOURCES, DERNIER_VERIFIE: DERNIER_VERIFIE,
        structure: structure, donnees: donnees, render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
