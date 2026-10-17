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
                    + ') ne sont pas vérifiés ici. Les numéros ci-dessous sont les REPÈRES des revenus 2025, '
                    + 'pas des cases officielles ' + annee + ' : recontrôlez chaque case et intitulé sur les '
                    + 'formulaires DGFiP du bon millésime avant tout report.'
        };
    }

    function h(x) { return PF.ui && PF.ui.h ? PF.ui.h(String(x)) : String(x); }
    function eur(x, dec) {
        return Number.isFinite(x) ? (PF.util ? PF.util.eur(x, { dec: dec === undefined ? 0 : dec }) : String(x) + ' €') : '—';
    }
    function date(x) { return x && PF.util ? PF.util.jourMoisAnneeISO(x) : '—'; }
    function ligne(numero, intitule, valeur, etat, note) {
        return { numero: String(numero), intitule: intitule,
            valeur: valeur === undefined || valeur === null ? 'À vérifier' : String(valeur),
            etat: etat || 'verifier', note: note || '' };
    }
    function calcul(numero, intitule, valeur, disponible, note) {
        return ligne(numero, intitule, disponible ? valeur : 'Non disponible',
            disponible ? 'calcule' : 'verifier', note);
    }
    function tableau(lignes) {
        return '<div class="fisc-table-scroll"><table class="tableau compact fisc-formulaire-table">'
            + '<thead><tr><th scope="col">Case / ligne</th><th scope="col">Intitulé DGFiP</th><th scope="col">Montant connu / à contrôler</th></tr></thead><tbody>'
            + lignes.map(function (l) {
                return '<tr><td><b>' + h(l.numero) + '</b></td><td>' + h(l.intitule)
                    + (l.note ? '<div class="st">' + h(l.note) + '</div>' : '')
                    + '</td><td><b class="' + (l.etat === 'calcule' ? 'up' : 'dim') + '">'
                    + h(l.valeur) + '</b></td></tr>';
            }).join('') + '</tbody></table></div>';
    }
    function cadre(titre, lignes, note) {
        return '<div class="fisc-cadre"><h4>' + h(titre) + '</h4>'
            + (note ? '<p class="st">' + h(note) + '</p>' : '') + tableau(lignes) + '</div>';
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
        if (nom === '2074' && data.t2074 && !t) return 'Montants indisponibles · cours/position à vérifier';
        if (nom === '2086' && data.t2086 && !c) return 'Montants indisponibles · cours/position à vérifier';
        if (nom === '2074' && t && t.operations && t.operations.length)
            return t.operations.length + ' cession(s) · 903/PV ' + eur(t.ligne_903_pv, 2)
                + ' · 903/MV ' + eur(t.ligne_903_mv, 2) + ' (portefeuille)';
        if (nom === '2086' && c && c.cessions && c.cessions.length)
            return c.cessions.length + ' cession(s) · total connu 224 ' + eur(c.plus_value_globale_224, 2)
                + ' (à contrôler pour le foyer)';
        if (nom === '2042 C') {
            var parties = [];
            if (t && t.operations && t.operations.length)
                parties.push('Titres : 3VG ' + eur(t.case_3vg, 2) + ' · 3VH ' + eur(t.case_3vh, 2));
            if (c && c.cessions && c.cessions.length)
                parties.push('Crypto : part connue 224 ' + eur(c.plus_value_globale_224, 2)
                    + ' · 3AN/3BN du foyer à vérifier');
            if (parties.length) return parties.join(' · ') + ' (portefeuille seul)';
        }
        if (nom === '2042' || nom === '2047') {
            var interets = data.reglages && Number(data.reglages.interetsEtrangers);
            if (Number.isFinite(interets) && interets > 0)
                return 'Intérêts saisis : ' + eur(interets, 2) + ' · IFU/foyer à vérifier';
            var salaires = data.sim && data.sim.annee === s.anneeRevenus
                ? data.sim : data.base || {};
            if (nom === '2042' && Number.isFinite(salaires.case_1aj) && salaires.case_1aj > 0)
                return 'Salaire 1AJ saisi : ' + eur(salaires.case_1aj, 0) + ' · foyer à vérifier';
        }
        return 'Ouvrir les cases et montants connus';
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
    function vide() { return 'À compléter depuis vos justificatifs'; }
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

    /* Lignes fiscales utiles à ce portefeuille : chaque cadre et ligne de
       calcul réellement susceptible d'être reportée est affiché, y compris
       lorsqu'une donnée (foyer, précompte, comptes) n'existe pas dans l'app.
       Ce n'est PAS la transcription des cadres sans rapport avec ce portefeuille
       (immobilier, PEA, actions gratuites, activité professionnelle, etc.). */
    function donnees(annee, data) {
        // Seuls les revenus 2025 portent des numéros/valeurs relus sur LEURS
        // imprimés. Pour toute autre année, les tableaux sont un gabarit à
        // revalider ; aucun montant n'y est injecté comme s'il était officiel.
        var sim = annee === DERNIER_VERIFIE && data.sim && data.sim.annee === annee
            ? data.sim : null;
        var base = annee === DERNIER_VERIFIE ? data.base || {} : {};
        var t = annee === DERNIER_VERIFIE && completPour(data.t2074, annee) ? data.t2074 : null;
        var c = annee === DERNIER_VERIFIE && completPour(data.t2086, annee) ? data.t2086 : null;
        var r = annee === DERNIER_VERIFIE ? data.reglages || {} : {};
        var compte = data.comptes || [];
        // Un prélèvement d'intérêts inconnu bloque l'IR, PAS les cases des
        // titres, des crypto-actifs ou le montant d'intérêts déjà saisi.
        // Une crypto non chiffrable ne doit pas effacer une 2074 complète.
        var salaires = sim || base;
        var cessionsTitres = !!(t && t.operations && t.operations.length);
        var cessionsCrypto = !!(c && c.cessions && c.cessions.length);
        var interets = Number(r.interetsEtrangers);
        var interetsConnus = Number.isFinite(interets) && interets > 0;
        var euros = function (n) { return eur(n, 0); };
        var a = {};
        a['2042'] = [
            cadre('Cadre 1 · traitements et salaires · page 3 de la 2042', [
                calcul('1AJ', 'Traitements et salaires — déclarant 1', euros(salaires.case_1aj),
                    Number.isFinite(salaires.case_1aj), 'Montant saisi à rapprocher du salaire prérempli par l’employeur.'),
                calcul('1AK', 'Frais réels — déclarant 1',
                    salaires.case_1ak === null ? 'LAISSER VIDE (abattement 10 %)' : euros(salaires.case_1ak),
                    Number.isFinite(salaires.case_1aj) && (salaires.case_1ak === null || Number.isFinite(salaires.case_1ak))),
                ...(salaires.couple ? [
                    calcul('1BJ', 'Traitements et salaires — déclarant 2', euros(salaires.case_1bj),
                        Number.isFinite(salaires.case_1bj)),
                    calcul('1BK', 'Frais réels — déclarant 2',
                        salaires.case_1bk === null ? 'LAISSER VIDE (abattement 10 %)' : euros(salaires.case_1bk),
                        Number.isFinite(salaires.case_1bj) && (salaires.case_1bk === null || Number.isFinite(salaires.case_1bk)))
                ] : [])
            ]),
            cadre('Cadre 2 · revenus de capitaux mobiliers · page 3 de la 2042', [
                calcul('2TR', 'Intérêts et autres produits de placement à revenu fixe',
                    euros(interets), interetsConnus,
                    'Montant saisi pour cette année ; vérifier la ligne 252 de la 2047, la qualification et les autres intérêts du foyer.'),
                ligne('2CG', 'Revenus déjà soumis aux prélèvements sociaux sans CSG déductible',
                    vide(), 'verifier', 'Produit et précompte du foyer non connus : ne pas inventer de 0 €.'),
                ligne('2BH', 'Revenus déjà soumis aux prélèvements sociaux avec CSG déductible si option barème',
                    vide(), 'verifier', 'Sous conditions (dont option 2OP) ; précompte réel à contrôler.'),
                ligne('2DF', 'Autres revenus déjà soumis aux prélèvements sociaux avec CSG déductible',
                    vide(), 'verifier', 'Selon la nature du produit et la date de versement ; précompte à contrôler.'),
                ligne('2OP', 'Option globale pour le barème des revenus mobiliers et plus-values sur titres (cochez)',
                    sim && sim.options_fiscales && sim.options_fiscales.assiette_2op > 0
                        ? (sim.cocher_2op ? 'À ENVISAGER, après contrôle du foyer' : 'NON RETENUE selon simulation')
                        : 'À contrôler sur TOUS les revenus du foyer', 'verifier',
                    'Indépendante de la case crypto 3CN ; une simulation du seul portefeuille ne décide pas pour le foyer.')
            ]),
            cadre('Cadre 6 · charges déductibles · page 4 de la 2042', [
                ligne('6DE', 'CSG déductible sur les revenus du patrimoine', vide(), 'verifier',
                    'Période de paiement et avis officiel du foyer requis. NE PAS additionner ici les '
                        + '6,8 % des cases 2BH/2DF : déjà déduits automatiquement, sans double compte.')
            ]),
            cadre('Cadre 8 · divers · page 4 de la 2042', [
                ligne('8UU', 'Comptes ouverts, détenus, utilisés ou clos à l’étranger (cochez)',
                    'À cocher après vérification des comptes du foyer et du/des 3916', 'verifier',
                    compte.length + ' compte(s) décrits dans l’application : activité et titulaire à confirmer.')
            ])
        ].join('');
        a['2042 C'] = cadre('Cadre 3 · plus-values et gains divers · 2042 C', [
            calcul('3VG', 'Plus-value mobilière avant abattement, après imputation des moins-values',
                cessionsTitres ? euros(t.case_3vg) : null, cessionsTitres,
                'Portefeuille seul ; rapprocher des autres cessions/moins-values du foyer et des abattements éventuels.'),
            calcul('3VH', 'Moins-value mobilière de l’année (montant positif)',
                cessionsTitres ? euros(t.case_3vh) : null, cessionsTitres,
                '0 € signifie seulement aucune perte NETTE sur les titres de ce portefeuille. Un gain et une perte de l’année se compensent ; vérifier les autres comptes du foyer.'),
            ligne('3SG', 'Abattement pour durée de détention de droit commun', 'À vérifier si titres acquis avant 2018 et option 2OP',
                'verifier', 'Ne jamais afficher 0 € comme établi sans contrôle des dates de chaque lot.'),
            ligne('3AN', 'Plus-value globale du foyer sur actifs numériques (report ligne 52 du 2086)',
                cessionsCrypto ? 'À compléter au niveau du foyer (portefeuille seul, si complet : '
                    + euros(c.case_3an) + ' ; résultat 224 ' + eur(c.plus_value_globale_224, 2) + ')'
                    : 'À vérifier', 'verifier',
                'Le seuil de 305 € dépend de la ligne 51 du foyer entier, pas de ce seul portefeuille. '
                    + 'Une annexe 2086 calculée ici n’est pas exhaustive.'),
            ligne('3BN', 'Moins-value globale du foyer sur actifs numériques (report ligne 52 du 2086)',
                cessionsCrypto ? 'À compléter au niveau du foyer (portefeuille seul, si complet : '
                    + euros(c.case_3bn) + ' ; résultat 224 ' + eur(c.plus_value_globale_224, 2) + ')'
                    : 'À vérifier', 'verifier',
                'Les autres cessions du foyer peuvent changer le signe et le seuil : montant non reportable tel quel.'),
            ligne('3CN', 'Option pour le barème des plus-values sur actifs numériques (cochez)',
                sim && sim.options_fiscales && sim.options_fiscales.assiette_3cn > 0
                    ? (sim.cocher_3cn ? 'À ENVISAGER, après contrôle du foyer' : 'NON RETENUE selon simulation')
                    : 'À contrôler sur TOUS les gains crypto du foyer', 'verifier',
                'Option distincte de 2OP.')
        ]);
        a['2047'] = [
            cadre('Cadre 2 · revenus de valeurs mobilières étrangères · intérêts · page 2', [
                ligne('250', 'Intérêts n’ouvrant pas droit à crédit d’impôt',
                    Number(r.interetsEtrangers) > 0 ? euros(Number(r.interetsEtrangers)) : vide(), 'verifier',
                    'Pays, source du revenu, retenue éventuelle et convention fiscale à confirmer sur justificatif ; '
                        + 'ne pas conclure « aucun crédit d’impôt » du seul pays du courtier.'),
                ligne('251', 'Total des intérêts imposables (238 + 240 + 250)',
                    Number(r.interetsEtrangers) > 0 ? euros(Number(r.interetsEtrangers)) + ' si autres lignes nulles' : vide(), 'verifier'),
                ligne('252', 'Dont intérêts et autres produits de placement à revenu fixe → case 2TR',
                    Number(r.interetsEtrangers) > 0 ? euros(Number(r.interetsEtrangers)) + ' si montant et qualification confirmés' : vide(), 'verifier')
            ], 'Si un crédit d’impôt étranger s’applique : remplir plutôt les lignes 231 à 240 et le cadre 7 ; montants non connus.'),
            cadre('Cadre 3 · plus-values imposables en France · page 3', [
                ligne('30', 'Plus-values sur valeurs mobilières, pays d’origine/encaissement et montant en euros',
                    'À vérifier depuis les justificatifs et la convention fiscale', 'verifier',
                    'La localisation du courtier seule ne prouve PAS que la plus-value est de source étrangère.')
            ], 'Ne pas déduire un éventuel impôt étranger ; le crédit d’impôt (cadre 7 / 8VL) est à justifier séparément.')
        ].join('');
        var titres = [];
        if (cessionsTitres) t.par_actif.forEach(function (op, idx) {
            titres.push(cadre('Cadre 5 · §510 · cession ' + (idx + 1) + ' / ' + t.par_actif.length
                + ' · ' + op.actif + ' · page 2 de la 2074', [
                ligne('511', 'Nommez les titres ; nommez les intermédiaires financiers',
                    op.actif + ' ; intermédiaire à confirmer', 'verifier'),
                calcul('512', 'Date de la cession ou du rachat', date(op.ligne_512), true),
                calcul('514', 'Valeur unitaire de cession', eur(op.ligne_514, 4), true),
                calcul('515', 'Nombre de titres cédés', PF.util ? PF.util.quantite(op.ligne_515) : String(op.ligne_515), true),
                calcul('516', 'Montant global = 514 × 515 (brut)', eur(op.ligne_516, 2), true),
                calcul('517', 'Frais de cession', eur(op.ligne_517, 2), true),
                calcul('518', 'Prix net de cession = 516 − 517', eur(op.ligne_518, 2), true),
                calcul('520', 'Prix ou valeur d’acquisition unitaire hors frais', eur(op.ligne_520, 4), true),
                calcul('521', 'Prix d’acquisition global', eur(op.ligne_521, 2), true),
                calcul('522', 'Frais d’acquisition', eur(op.ligne_522, 2), true),
                calcul('523', 'Prix de revient = 521 + 522', eur(op.ligne_523, 2), true),
                calcul('524', 'Résultat signé = 518 − 523', eur(op.ligne_524, 2), true,
                    'Reporter les gains/pertes en ligne 903, col. PV ou MV.')
            ], 'Le formulaire a trois colonnes « Titres A/B/C » ; continuer sur un imprimé supplémentaire si nécessaire.'));
        });
        var erreurTitres = annee === DERNIER_VERIFIE && data.t2074 && !t
            ? '<div class="erreur">Titres non chiffrables : '
                + h(data.t2074.annee !== annee
                    ? 'données d’une autre année refusées' : raison(data.t2074.indisponible))
                + '. Aucun total 903 ou 3VG/3VH partiel ne peut être reporté.</div>' : '';
        a['2074'] = erreurTitres
            + (titres.length ? resumeTitres(t.par_actif) + titres.join('') : '<p class="info">'
                + (t ? 'Aucune vente de titres détectée ' + h(annee) + ' dans ce portefeuille ; '
                    + 'contrôlez vos autres intermédiaires.'
                    : 'Montants par titre en attente des écritures et cours de change de ' + h(annee) + '.')
                + '</p>')
            + cadre('Cadre 900 · récapitulation · 2074', [
                calcul('903 / PV', 'Cessions déterminées par vous-même (total des 524 positives)',
                    cessionsTitres ? eur(t.ligne_903_pv, 2) : null, cessionsTitres,
                    'Total du portefeuille uniquement ; autres gains éventuels du foyer à ajouter.'),
                calcul('903 / MV', 'Cessions déterminées par vous-même (total des 524 négatives, en positif)',
                    cessionsTitres ? eur(t.ligne_903_mv, 2) : null, cessionsTitres,
                    'Total du portefeuille uniquement ; autres pertes éventuelles du foyer à ajouter.'),
                ligne('913 / total', 'Total du cadre 900, colonne PV / colonne MV',
                    cessionsTitres ? 'Part connue : PV ' + eur(t.ligne_903_pv, 2) + ' · MV '
                        + eur(t.ligne_903_mv, 2) + ' ; compléter les autres cadres' : vide(), 'verifier',
                    'La ligne 913 existe : c’est le total du cadre, pas la ligne des moins-values seules.')
            ], 'La ligne 905 correspond aux profits sur instruments financiers à terme : n’y reportez pas vos ventes de titres.')
            + cadre('Cadre 10 · pertes antérieures au 31/12/' + (annee - 1),
                t && t.cadre_10 && t.cadre_10.length ? t.cadre_10.map(function (x) {
                    return ligne(String(x.annee), 'Stock de moins-value de ' + x.annee + ' encore reportable',
                        eur(x.montant, 2), 'verifier', 'À rapprocher des déclarations antérieures de TOUT le foyer.');
                }) : [ligne('2015–2024', 'Stock antérieur (cases de la 2074 revenus 2025)', vide(), 'verifier',
                    'Les années exactes glissent avec chaque formulaire : aucune perte historique du foyer certifiée ici.')])
            + cadre('Cadre 11 · §1133 · compensation A à H · 2074 (pages 7–14)',
                t && t.cadre_11 && t.cadre_11.length ? t.cadre_11.reduce(function (lignes, x, idx) {
                    var prefixe = '1133 / ' + (idx + 1) + ' · ', titre = x.actif + ' · ';
                    [['A', 'Plus-value de l’année avant abattement', x.col_a],
                        ['B', 'Moins-value de l’année imputée', x.col_b],
                        ['C', 'Solde A − B', x.col_c],
                        ['D', 'Moins-values antérieures imputées', x.col_d],
                        ['E', 'Solde C − D', x.col_e],
                        ['F', 'Abattement de droit commun', x.col_f],
                        ['G', 'Abattement renforcé', x.col_g],
                        ['H', 'Solde E − F − G', x.col_h]].forEach(function (col) {
                        lignes.push(ligne(prefixe + col[0], titre + col[1],
                            col[2] === null ? 'À vérifier (acquisition avant 2018 / option 2OP)'
                                : eur(col[2], 2), col[2] === null ? 'verifier' : 'calcule',
                            'Montants des seuls titres suivis ; pertes et abattements du foyer à vérifier.'));
                    });
                    return lignes;
                }, []) : [ligne('1133', 'A/B/C/D/E/F/G/H : imputation par catégorie', vide(), 'verifier')],
                'Une ligne par titre et par colonne : 0 € est calculé seulement si aucune acquisition éligible '
                + 'à l’abattement n’est connue. Pertes seules : ne pas remplir ce tableau ; reporter 3VH et actualiser le cadre 12.')
            + cadre('Cadre 11 · ligne 1164 / cadre 12 · pertes reportables', [
                calcul('1164', 'Total des pertes antérieures imputées (colonne D du cadre 11)',
                    t && t.cadre_11 && t.cadre_11.length ? eur(t.ligne_1164, 2) : null,
                    !!(t && t.cadre_11 && t.cadre_11.length)),
                ...(t && t.cadre_12 && t.cadre_12.length
                    ? t.cadre_12.map(function (x) { return ligne(String(x.annee),
                        'Cadre 12 · moins-value de ' + x.annee + ' restant au 31/12/' + annee,
                        eur(x.montant, 2), 'verifier', 'Stock du foyer à confirmer avec les déclarations antérieures.'); })
                    : [ligne('12', 'Suivi du stock des moins-values', vide(), 'verifier')])
            ]);
        a['2074-CMV'] = cadre('Alternative : fiche 2074-CMV si DISPENSÉ de déposer la 2074', [
            ligne('1', 'Rappel des moins-values antérieures reportables au 31/12/' + (annee - 1),
                vide(), 'verifier', 'À confirmer à l’aide des déclarations antérieures du foyer.'),
            ligne('21', 'Total des plus-values de l’année calculées par vos intermédiaires financiers',
                vide(), 'verifier', 'À vérifier sur l’IFU. Le portefeuille donne 2074/903 PV = '
                    + (cessionsTitres ? eur(t.ligne_903_pv, 2) : 'non disponible')
                    + ', mais ce montant n’est PAS la ligne 21 de la 2074-CMV sans preuve de dispense de 2074.'),
            ligne('22–24', 'Gains PEA (retrait avant cinq ans / ORA) et PEAC',
                vide(), 'verifier', 'Seulement si ces opérations existent : hors des écritures suivies ici.'),
            ligne('25', 'Total des moins-values de l’année calculées par vos intermédiaires financiers',
                vide(), 'verifier', 'À vérifier sur l’IFU. Le portefeuille donne 2074/903 MV = '
                    + (cessionsTitres ? eur(t.ligne_903_mv, 2) : 'non disponible')
                    + ', mais ne recopiez pas la 2074 dans la 2074-CMV sans qualification de l’intermédiaire.'),
            ligne('étape 2 / A–F', 'Imputation des MV de l’année et antérieures, puis abattement éventuel',
                vide(), 'verifier', 'Ne pas saisir le résultat de la 2074 une deuxième fois dans la 2074-CMV.'),
            ligne('5', 'Stock des pertes encore reportables au 31/12/' + annee,
                vide(), 'verifier', 'La situation 1 (pertes seules) renvoie le total de la ligne 25 en 3VH.')
        ], 'La 2074-CMV et la 2074 ne sont pas deux reports cumulables. Choisir le parcours correspondant '
            + 'à la notice 2074-NOT-BIS et à l’IFU de l’intermédiaire, sinon double déclaration.');
        var crypto = [];
        if (cessionsCrypto) c.cessions.forEach(function (op, idx) {
            crypto.push(cadre('Cadre 2 · déclarant 1 · cession ' + (idx + 1) + ' · '
                + op.actif + ' le ' + date(op.date) + ' · 2086', [
                calcul('211', 'Date de cession', date(op.date), true),
                calcul('212', 'Valeur globale du portefeuille crypto au moment de la cession',
                    eur(op.ligne_212, 2), true,
                    'Portefeuille du détenteur sur TOUS les supports, y compris hors application : à compléter si nécessaire.'),
                calcul('213', 'Prix brut de cession', eur(op.ligne_213, 2), true),
                calcul('214', 'Frais de cession', eur(op.ligne_214, 2), true),
                calcul('215', 'Prix net des frais (213 − 214)', eur(op.ligne_215, 2), true),
                ligne('216', 'Soulte reçue ou versée', 'À vérifier sur les autres échanges', 'verifier',
                    'Les écritures de cette application ne prouvent pas l’absence de soulte.'),
                ligne('217', 'Prix net des soultes (213 ± 216)', eur(op.ligne_217, 2) + ' si aucune soulte', 'verifier'),
                ligne('218', 'Prix net des frais et soultes (215 ± 216)', eur(op.ligne_218, 2) + ' si aucune soulte', 'verifier'),
                ligne('220', 'Prix total d’acquisition du portefeuille', eur(op.ligne_220, 2) + ' (portefeuille suivi)', 'verifier'),
                ligne('221', 'Fractions de capital initial déjà déduites', eur(op.ligne_221, 2) + ' (portefeuille suivi)', 'verifier'),
                ligne('222', 'Soultes reçues lors d’échanges antérieurs', 'À vérifier', 'verifier'),
                ligne('223', 'Prix total d’acquisition net (220 − 221 − 222)', eur(op.ligne_223, 2)
                    + ' si aucune soulte antérieure', 'verifier'),
                ligne('Calcul (hors case)', 'Contribution de ' + op.actif
                    + ' à la ligne 224 : 218 − 223 × 217 / 212',
                    eur(op.ligne_224, 2) + ' sous hypothèse sans soulte', 'verifier',
                    'La 224 totalise toutes les cessions du déclarant, pas une ligne par vente.')
            ], 'Le montant de cette cession ne peut être certifié sans toutes les plateformes, '
                + 'tous les actifs et les éventuelles soultes.'));
        });
        var erreurCrypto = annee === DERNIER_VERIFIE && data.t2086 && !c
            ? '<div class="erreur">Crypto-actifs non chiffrables : '
                + h(data.t2086.annee !== annee
                    ? 'données d’une autre année refusées' : raison(data.t2086.indisponible))
                + '. Aucun total 224/51 ou 3AN/3BN partiel ne peut être reporté.</div>' : '';
        a['2086'] = erreurCrypto + cadre('Cadre 2 · identité du déclarant 1 · 2086', [
                ligne('2101', 'Nom', vide(), 'verifier'), ligne('2102', 'Prénoms', vide(), 'verifier'),
                ligne('2103', 'Adresse', vide(), 'verifier')
            ], 'Chaque cession occupe une colonne ; 5 cessions par déclaration, puis une 2086 supplémentaire.')
            + (crypto.length ? resumeCrypto(c.cessions) + crypto.join('') : '<p class="info">'
                + (c ? 'Aucune cession crypto détectée ' + h(annee)
                    + ' dans ce portefeuille ; vérifier les autres plateformes du foyer.'
                    : 'Montants crypto en attente des écritures, cours et positions de ' + h(annee) + '.')
                + '</p>')
            + cadre('Cadre 2 · total du déclarant / cadre 5 · récapitulatif du FOYER · 2086', [
                ligne('224', 'Plus ou moins-value globale du déclarant 1',
                    cessionsCrypto ? eur(c.plus_value_globale_224, 2) + ' — part connue, sous réserve'
                        : vide(), 'verifier', 'Somme des cessions du déclarant 1, pas une ligne 224 par cession.'),
                ligne('51', 'Total des prix de cession du foyer (218 + 258 + 318 + 413 + 423 + 433)',
                    cessionsCrypto ? eur(c.total_cessions_218, 2) + ' — part connue seulement'
                        : vide(), 'verifier',
                    'Ce total ne suffit pas à prouver l’exonération du foyer fiscal : vérifiez aussi les cessions '
                        + 'éventuelles du conjoint hors de ce portefeuille, des personnes à charge, et celles faites '
                        + 'par personnes interposées ; vérifiez les soultes.'),
                ligne('52', 'Total des plus et moins-values du foyer (224 + 264 + 324 + 415 + 425 + 435)',
                    'À compléter après contrôle de toutes les cessions du foyer', 'verifier',
                    'Reporter ensuite en 3AN (gain) ou 3BN (perte) de la 2042 C ; 3CN est une option distincte.')
            ], 'Seuil de 305 € sur la ligne 51 : si ≤ 305 €, les cessions sont exonérées ; annexe à établir '
                + 'même sous le seuil. Ne laisser 3AN/3BN vides que si le seuil du foyer est respecté. '
                + 'Le portefeuille suivi n’est pas le foyer.');
        a['3916 / 3916-bis'] = (compte.length ? compte : ['Compte du foyer']).map(function (nom, i) {
            return cadre('Un 3916-3916 bis par compte · ' + nom, [
                ligne('1.1', 'Titulaire : nom, prénoms, date et lieu de naissance ; adresse au 1er janvier', vide(), 'verifier'),
                ligne('2', 'Nature : compte bancaire (cadres 3 et 5) ou actifs numériques (cadres 4 et 5)',
                    'À vérifier dans le contrat', 'verifier'),
                ligne('3.1', 'Compte bancaire : numéro, type, date d’ouverture/clôture, organisme et adresse', vide(), 'verifier'),
                ligne('3.2', 'Compte bancaire : titulaire ou bénéficiaire de procuration', vide(), 'verifier'),
                ligne('4.1', 'Compte crypto : numéro ou e-mail, date d’ouverture/clôture', vide(), 'verifier'),
                ligne('4.2', 'Compte crypto : PSAN, adresse et URL si non référencé', vide(), 'verifier'),
                ligne('4.3', 'Compte crypto : titulaire ou bénéficiaire de procuration', vide(), 'verifier'),
                ligne('5', 'Usage : personnel, professionnel ou mixte', vide(), 'verifier')
            ], 'L’application ne détient ni le numéro de compte ni ses dates d’ouverture et de clôture. '
                + 'Vérifier aussi les comptes du conjoint et ceux non représentés ici.');
        }).join('');
        return a;
    }
    function render(annee, data, ouverts) {
        var s = structure(annee);
        if (!s) return '<div class="erreur">Année des revenus invalide (2025 à 9999).</div>';
        annee = s.anneeRevenus;
        data = data || {};
        var d = donnees(annee, data);
        var ok = s.structureVerifiee && !!data.sim && data.sim.annee === annee
            && completPour(data.t2074, annee) && completPour(data.t2086, annee)
            && !data.erreur && !data.erreurSim;
        var etat = s.structureVerifiee ? 'Revenus ' + annee + ' : repères des imprimés publiés.'
            : s.avertissement;
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
            ? '<div class="attention">Simulation d’impôt indisponible : ' + h(data.erreurSim)
                + '. Les montants effectivement chiffrables restent visibles par titre et par case ; '
                + 'les autres restent inconnus. Aucun total du foyer n’est certifié par ce guide.</div>' : '';
        return '<div class="fisc-guide"><div class="' + (ok ? 'info' : 'attention') + '">'
            + h(etat + (data.erreur ? ' Calcul suspendu : ' + data.erreur + '.' : ''))
            + (ok ? ' Les montants des autres comptes, du conjoint et les justificatifs restent à contrôler.'
                : ' Les montants non établis ne sont jamais remplis à la place du foyer.') + '</div>'
            + estimation + simulation + Object.keys(SOURCES).map(function (n) {
                return formulaire(n, d[n], n === '2074' ? 'Cadres 5, 900, 10, 11, 12' :
                    n === '2086' ? 'Cadres 2 et 5' : n === '3916 / 3916-bis'
                        ? 'Cadres 1, 2, 3/4 et 5' : 'Cases/cadres utiles à ce portefeuille',
                    s, resumeFormulaire(n, s, data), !!(ouverts && ouverts[n]));
            }).join('') + '</div>';
    }
    PF.fiscalFormulairesDgfip = { SOURCES: SOURCES, DERNIER_VERIFIE: DERNIER_VERIFIE,
        structure: structure, donnees: donnees, render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
