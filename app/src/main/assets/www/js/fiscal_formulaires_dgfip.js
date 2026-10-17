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
            + '<thead><tr><th>Case / ligne</th><th>Intitulé DGFiP</th><th>À renseigner / à contrôler</th></tr></thead><tbody>'
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
    function formulaire(nom, corps, sousTitre, s) {
        return '<section class="card tight fisc-imprime"><h3>' + h(nom) + ' · revenus ' + h(s.anneeRevenus)
            + '</h3><div class="st">' + h(sousTitre) + ' · '
            + (s.structureVerifiee ? 'repères du formulaire 2026 vérifiés'
                : 'modèle 2026 / cases du millésime NON vérifiées') + '</div>'
            + corps + '<p class="st">Source : <a href="' + h(s.sources[nom])
            + '" target="_blank" rel="noopener noreferrer">imprimé DGFiP revenus 2025</a>.</p></section>';
    }
    function vide() { return 'À compléter depuis vos justificatifs'; }

    /* Lignes fiscales utiles à ce portefeuille : chaque cadre et ligne de
       calcul réellement susceptible d'être reportée est affiché, y compris
       lorsqu'une donnée (foyer, précompte, comptes) n'existe pas dans l'app.
       Ce n'est PAS la transcription des cadres sans rapport avec ce portefeuille
       (immobilier, PEA, actions gratuites, activité professionnelle, etc.). */
    function donnees(annee, data) {
        // Seuls les revenus 2025 portent des numéros/valeurs relus sur LEURS
        // imprimés. Pour toute autre année, les tableaux sont un gabarit à
        // revalider ; aucun montant n'y est injecté comme s'il était officiel.
        var sim = annee === DERNIER_VERIFIE ? data.sim || null : null;
        var t = annee === DERNIER_VERIFIE ? data.t2074 || null : null;
        var c = annee === DERNIER_VERIFIE ? data.t2086 || null : null;
        var r = annee === DERNIER_VERIFIE ? data.reglages || {} : {};
        var compte = data.comptes || [];
        var actif = !!sim && !!t && !!c && !data.erreur;
        var cessionsTitres = !!(t && t.operations && t.operations.length);
        var cessionsCrypto = !!(c && c.cessions && c.cessions.length);
        var euros = function (n) { return eur(n, 0); };
        var a = {};
        a['2042'] = [
            cadre('Cadre 1 · traitements et salaires · page 3 de la 2042', [
                calcul('1AJ', 'Traitements et salaires — déclarant 1', actif ? euros(sim.case_1aj) : null, actif,
                    'Comparer au salaire prérempli par l’employeur.'),
                calcul('1AK', 'Frais réels — déclarant 1', actif ? (sim.case_1ak === null ? 'LAISSER VIDE (abattement 10 %)' : euros(sim.case_1ak)) : null, actif),
                ...(sim && sim.couple ? [
                    calcul('1BJ', 'Traitements et salaires — déclarant 2', actif ? euros(sim.case_1bj) : null, actif),
                    calcul('1BK', 'Frais réels — déclarant 2', actif ? (sim.case_1bk === null ? 'LAISSER VIDE (abattement 10 %)' : euros(sim.case_1bk)) : null, actif)
                ] : [])
            ]),
            cadre('Cadre 2 · revenus de capitaux mobiliers · page 3 de la 2042', [
                calcul('2TR', 'Intérêts et autres produits de placement à revenu fixe',
                    actif && r.interetsEtrangers !== undefined && r.interetsEtrangers !== ''
                        ? euros(Number(r.interetsEtrangers)) : null,
                    actif && r.interetsEtrangers !== undefined && r.interetsEtrangers !== '' && Number.isFinite(Number(r.interetsEtrangers)),
                    'Reporter la ligne 252 de la 2047 ; contrôler les intérêts du foyer, pas uniquement ce portefeuille.'),
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
                cessionsTitres && t.case_3vh > 0 ? euros(t.case_3vh) : null,
                cessionsTitres && t.case_3vh > 0,
                'Un gain et une perte de l’année se compensent ; les pertes reportables ne sont pas des 3VH de l’année.'),
            ligne('3SG', 'Abattement pour durée de détention de droit commun', 'À vérifier si titres acquis avant 2018 et option 2OP',
                'verifier', 'Ne jamais afficher 0 € comme établi sans contrôle des dates de chaque lot.'),
            ligne('3AN', 'Plus-value globale du foyer sur actifs numériques (report ligne 52 du 2086)',
                cessionsCrypto ? 'À compléter au niveau du foyer (part connue : ' + euros(Math.max(0, c.plus_value_globale_224)) + ')' : 'À vérifier', 'verifier',
                'Une annexe 2086 calculée sur ce seul portefeuille n’est pas exhaustive.'),
            ligne('3BN', 'Moins-value globale du foyer sur actifs numériques (report ligne 52 du 2086)',
                cessionsCrypto ? 'À compléter au niveau du foyer (part connue : ' + euros(Math.max(0, -c.plus_value_globale_224)) + ')' : 'À vérifier', 'verifier'),
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
        a['2074'] = (titres.length ? titres.join('') : '<p class="info">Aucune vente de titres détectée '
            + h(annee) + ' dans ce portefeuille ; contrôlez vos autres intermédiaires.</p>')
            + cadre('Cadre 900 · récapitulation · 2074', [
                calcul('903 / PV', 'Cessions déterminées par vous-même (total des 524 positives)',
                    cessionsTitres ? eur(t.ligne_903_pv, 2) : null, cessionsTitres),
                calcul('903 / MV', 'Cessions déterminées par vous-même (total des 524 négatives, en positif)',
                    cessionsTitres ? eur(t.ligne_903_mv, 2) : null, cessionsTitres),
                ligne('913 / total', 'Total du cadre 900, colonne PV / colonne MV',
                    cessionsTitres ? 'À vérifier : autres cadres de la 2074 non suivis' : vide(), 'verifier',
                    'La ligne 913 existe : c’est le total du cadre, pas la ligne des moins-values seules.')
            ], 'La ligne 905 correspond aux profits sur instruments financiers à terme : n’y reportez pas vos ventes de titres.')
            + cadre('Cadre 10 · pertes antérieures au 31/12/' + (annee - 1),
                t && t.cadre_10 && t.cadre_10.length ? t.cadre_10.map(function (x) {
                    return ligne(String(x.annee), 'Stock de moins-value de ' + x.annee + ' encore reportable',
                        eur(x.montant, 2), 'verifier', 'À rapprocher des déclarations antérieures de TOUT le foyer.');
                }) : [ligne('2015–2024', 'Stock antérieur (cases de la 2074 revenus 2025)', vide(), 'verifier',
                    'Les années exactes glissent avec chaque formulaire : aucune perte historique du foyer certifiée ici.')])
            + cadre('Cadre 11 · §1133 · compensation A à H · 2074 (pages 7–14)',
                t && t.cadre_11 && t.cadre_11.length ? t.cadre_11.map(function (x, idx) {
                    return ligne('1133 / ' + (idx + 1), x.actif + ' · A ' + eur(x.col_a, 2)
                        + ' · B ' + eur(x.col_b, 2) + ' · C ' + eur(x.col_c, 2)
                        + ' · D ' + eur(x.col_d, 2) + ' · E ' + eur(x.col_e, 2),
                        x.col_h === null ? 'F/G/H à vérifier (abattements non établis)'
                            : 'F/G 0 € (achats connus ≥ 2018) · H ' + eur(x.col_h, 2), 'verifier',
                        'F/G : abattements uniquement si éligibles ; 2OP porte sur tout le foyer.');
                }) : [ligne('1133', 'A/B/C/D/E/F/G/H : imputation par catégorie', vide(), 'verifier')],
                'Pertes seules : ne pas remplir ce tableau ; reporter 3VH et actualiser le cadre 12.')
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
                vide(), 'verifier', 'À vérifier sur l’IFU. Les résultats déterminés par vous-même au 2074/510 '
                    + 'ne sont pas la ligne 21 de cette fiche.'),
            ligne('22–24', 'Gains PEA (retrait avant cinq ans / ORA) et PEAC',
                vide(), 'verifier', 'Seulement si ces opérations existent : hors des écritures suivies ici.'),
            ligne('25', 'Total des moins-values de l’année calculées par vos intermédiaires financiers',
                vide(), 'verifier', 'À vérifier sur l’IFU, pas à recopier automatiquement depuis la 2074.'),
            ligne('étape 2 / A–F', 'Imputation des MV de l’année et antérieures, puis abattement éventuel',
                vide(), 'verifier', 'Ne pas saisir le résultat de la 2074 une deuxième fois dans la 2074-CMV.'),
            ligne('5', 'Stock des pertes encore reportables au 31/12/' + annee,
                vide(), 'verifier', 'La situation 1 (pertes seules) renvoie le total de la ligne 25 en 3VH.')
        ], 'La 2074-CMV et la 2074 ne sont pas deux reports cumulables. Choisir le parcours correspondant '
            + 'à la notice 2074-NOT-BIS et à l’IFU de l’intermédiaire, sinon double déclaration.');
        var crypto = [];
        if (cessionsCrypto) c.cessions.forEach(function (op, idx) {
            crypto.push(cadre('Cadre 2 · déclarant 1 · cession ' + (idx + 1) + ' · 2086', [
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
                    + ' si aucune soulte antérieure', 'verifier')
            ], 'Le montant de cette cession ne peut être certifié sans toutes les plateformes, '
                + 'tous les actifs et les éventuelles soultes.'));
        });
        a['2086'] = cadre('Cadre 2 · identité du déclarant 1 · 2086', [
                ligne('2101', 'Nom', vide(), 'verifier'), ligne('2102', 'Prénoms', vide(), 'verifier'),
                ligne('2103', 'Adresse', vide(), 'verifier')
            ], 'Chaque cession occupe une colonne ; 5 cessions par déclaration, puis une 2086 supplémentaire.')
            + (crypto.length ? crypto.join('') : '<p class="info">Aucune cession crypto détectée ' + h(annee)
                + ' dans ce portefeuille ; vérifier les autres plateformes du foyer.</p>')
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
    function render(annee, data) {
        var s = structure(annee), d;
        if (!s) return '<div class="erreur">Année des revenus invalide (2025 à 9999).</div>';
        d = donnees(annee, data || {});
        var ok = s.structureVerifiee && !!(data && data.sim && data.t2074 && data.t2086 && !data.erreur);
        var etat = s.structureVerifiee ? 'Revenus ' + annee + ' : repères des imprimés publiés.'
            : s.avertissement;
        var estimation = !s.structureVerifiee && data && data.t2074 && data.t2086
            && ((data.t2074.operations || []).length || (data.t2086.cessions || []).length)
            ? '<div class="info">Calcul des seules écritures connues, NON reportable avant publication des imprimés : '
                + 'titres ' + h(eur(data.t2074.bilan_net)) + ', crypto '
                + h(eur(data.t2086.plus_value_globale_224))
                + '. Ces montants ne prouvent pas la complétude du foyer.</div>' : '';
        return '<div class="fisc-guide"><div class="' + (ok ? 'info' : 'attention') + '">'
            + h(etat + (data && data.erreur ? ' Calcul suspendu : ' + data.erreur + '.' : ''))
            + (ok ? ' Les montants des autres comptes, du conjoint et les justificatifs restent à contrôler.'
                : ' Les montants non établis ne sont jamais remplis à la place du foyer.') + '</div>'
            + estimation + Object.keys(SOURCES).map(function (n) {
                return formulaire(n, d[n], n === '2074' ? 'Cadres 5, 900, 10, 11, 12' :
                    n === '2086' ? 'Cadres 2 et 5' : n === '3916 / 3916-bis'
                        ? 'Cadres 1, 2, 3/4 et 5' : 'Cases/cadres utiles à ce portefeuille', s);
            }).join('') + '</div>';
    }
    PF.fiscalFormulairesDgfip = { SOURCES: SOURCES, DERNIER_VERIFIE: DERNIER_VERIFIE,
        structure: structure, donnees: donnees, render: render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
