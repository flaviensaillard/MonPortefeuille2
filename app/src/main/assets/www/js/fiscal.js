/* Fiscalité française. Portage de core/fiscal_bars.py et core/tax.py.
   Règle : aucun taux n'est deviné. Une année absente du barème est signalée,
   jamais extrapolée. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util, UI = PF.ui;

    // ------------------------------------------------------------------ barèmes

    var BAREMES = {
        2022: { tranches: [10777, 27478, 78570, 168994], taux: [0.11, 0.30, 0.41, 0.45], dc: 846, dcPlafond: 1870, dcCouple: 1395, dcPlafondCouple: 3100 },
        2023: { tranches: [11294, 28797, 82341, 177106], taux: [0.11, 0.30, 0.41, 0.45], dc: 906, dcPlafond: 2002, dcCouple: 1493, dcPlafondCouple: 3300 },
        2024: { tranches: [11520, 29370, 83984, 180648], taux: [0.11, 0.30, 0.41, 0.45], dc: 924, dcPlafond: 2042, dcCouple: 1523, dcPlafondCouple: 3365 },
        2025: { tranches: [11600, 29579, 84577, 181917], taux: [0.11, 0.30, 0.41, 0.45], dc: 898, dcPlafond: 1986, dcCouple: 1486, dcPlafondCouple: 3284 },
        2026: { tranches: [11600, 29579, 84577, 181917], taux: [0.11, 0.30, 0.41, 0.45], dc: 898, dcPlafond: 1986, dcCouple: 1486, dcPlafondCouple: 3284 }
    };
    var TAUX_DECOTE = 0.4525;
    var SOURCE_PAR_ANNEE = {
        2022: 'Vérifié — données historiques stables',
        2023: 'Vérifié — données historiques stables',
        2024: 'Vérifié — données historiques stables',
        2025: 'Sources publiques concordantes — à recouper BOFiP',
        2026: 'Sources publiques concordantes — à recouper BOFiP'
    };

    var IR_FORFAITAIRE = 0.128;               // part IR du PFU (CGI art. 200 A)
    var PS_PAR_ANNEE = {
        2018: 0.172, 2019: 0.172, 2020: 0.172, 2021: 0.172, 2022: 0.172,
        2023: 0.172, 2024: 0.172, 2025: 0.172, 2026: 0.186
    };
    var PS_ANNEE_INCERTAINE = {
        2025: 'LFSS 2026 art. 12 : la hausse de CSG s’applique aux revenus du patrimoine dès 2025, '
            + 'aux produits de placement à partir du 1ᵉʳ janvier 2026. Chez un courtier étranger aucune CSG '
            + 'n’est précomptée : l’assiette est celle du patrimoine, donc 18,6 %. Le module retient 17,2 % '
            + 'par prudence — la fourchette vous est montrée.'
    };
    var CSG_DEDUCTIBLE = 0.068;
    var CRYPTO_FRANCHISE_CESSIONS = 305.0;    // seuil sur le TOTAL des prix de cession
    var OR_PHYS_TFMP = 0.115, OR_PHYS_PV_IR = 0.19, OR_PHYS_PV_PS = 0.172;

    var PLANCHER_ABATTEMENT_10 = { 2022: 472, 2023: 495, 2024: 504, 2025: 509, 2026: 509 };
    var PLAFOND_ABATTEMENT_10 = { 2022: 13522, 2023: 14171, 2024: 14426, 2025: 14555, 2026: 14555 };
    var FORFAIT_REPAS = { 2022: 5.0, 2023: 5.2, 2024: 5.35, 2025: 5.45, 2026: 5.5 };
    var BAREME_KM = { 3: [0.529, 0.316, 1065, 0.370], 4: [0.606, 0.340, 1330, 0.407], 5: [0.636, 0.357, 1395, 0.427], 6: [0.665, 0.374, 1457, 0.447], 7: [0.697, 0.394, 1515, 0.470] };

    var URL_MAJ_BAREMES = 'https://arena.ai/agent/01a0f24c-13af-734b-9dd4-91b1ceafa74f';

    function annees() { return Object.keys(BAREMES).map(Number).sort(function (a, b) { return a - b; }); }
    function derniereAnnee() { var a = annees(); return a[a.length - 1]; }
    function baremeDe(annee) {
        if (!BAREMES[annee]) throw new Error('Aucun barème enregistré pour ' + annee + '. Années disponibles : ' + annees().join(', ') + '.');
        return BAREMES[annee];
    }
    function tauxPS(annee) {
        if (PS_PAR_ANNEE[annee] === undefined) throw new Error('Aucun taux de prélèvements sociaux pour ' + annee + '.');
        return PS_PAR_ANNEE[annee];
    }
    function tauxPFU(annee) { return IR_FORFAITAIRE + tauxPS(annee); }

    // ----------------------------------------------------------- impôt sur le revenu

    /* La première tranche est à 0 % : les taux sont préfixés d'un zéro. */
    function impotParPart(revenu, b) {
        var bornes = [0].concat(b.tranches);
        var taux = [0].concat(b.taux);
        var impot = 0;
        for (var i = 0; i < taux.length; i++) {
            var bas = bornes[i];
            var haut = i + 1 < bornes.length ? bornes[i + 1] : Infinity;
            if (revenu > bas) impot += (Math.min(revenu, haut) - bas) * taux[i];
        }
        return impot;
    }

    function estCouple(statut) {
        var s = String(statut || '').toLowerCase();
        return s.indexOf('mari') >= 0 || s.indexOf('pacs') >= 0;
    }

    function impotRevenu(revenu, parts, annee, statut) {
        var b = baremeDe(annee);
        revenu = Math.max(0, U.num(revenu, 0));
        parts = Math.max(0.5, U.num(parts, 1));
        var couple = estCouple(statut);
        var partsBase = couple ? 2 : 1;

        var qf = revenu / parts;
        var impotNonPlafonne = impotParPart(qf, b) * parts;
        var impot, gainMax;
        if (parts > partsBase) {
            var impotBase = impotParPart(revenu / partsBase, b) * partsBase;
            gainMax = (parts - partsBase) * 2 * 1759;
            if ((impotBase - impotNonPlafonne) > gainMax) {
                impot = Math.max(0, impotBase - gainMax);
                qf = revenu / partsBase;
            } else impot = impotNonPlafonne;
        } else impot = impotNonPlafonne;

        // TMI : taux de la tranche dans laquelle tombe le quotient familial.
        var tmi = b.taux[b.taux.length - 1];
        for (var i = 0; i < b.tranches.length; i++) {
            if (qf <= b.tranches[i]) {
                tmi = i > 0 ? b.taux[i - 1] : 0;
                break;
            }
        }

        var decote = 0;
        var base = couple ? b.dcCouple : b.dc;
        var plafond = couple ? b.dcPlafondCouple : b.dcPlafond;
        if (impot <= plafond) {
            decote = Math.max(0, base - impot * TAUX_DECOTE);
            decote = Math.min(decote, impot);
        }
        var net = impot - decote;
        if (net < 61) net = 0;  // seuil de non-recouvrement
        return { impot_brut: impot, decote: decote, impot_net: net, tmi: tmi, quotient: qf, annee: annee, plafonnement: gainMax || 0 };
    }

    function abattement10(salaire, annee) {
        var sal = Math.max(0, U.num(salaire, 0));
        if (sal <= 0) return 0;
        var plancher = PLANCHER_ABATTEMENT_10[annee] || PLANCHER_ABATTEMENT_10[derniereAnnee()];
        var plafond = PLAFOND_ABATTEMENT_10[annee] || PLAFOND_ABATTEMENT_10[derniereAnnee()];
        return Math.min(Math.max(sal * 0.10, Math.min(sal, plancher)), plafond);
    }

    /* Frais de repas aux frais réels : nombre de jours × forfait URSSAF/DGFiP
       de l'année. Pas de forfait connu pour l'année = pas de montant inventé. */
    function forfaitRepas(annee) {
        if (FORFAIT_REPAS[annee] === undefined) return null;
        return FORFAIT_REPAS[annee];
    }

    function fraisRepas(jours, annee) {
        var j = Math.max(0, Math.round(U.num(jours, 0)));
        var taux = forfaitRepas(annee);
        if (j <= 0) return { montant: 0, formule: '0 repas' };
        if (taux === null) {
            return { montant: 0, formule: 'Aucun forfait repas enregistré pour ' + annee + ' : montant non calculé' };
        }
        var montant = U.arrondi(j * taux, 2);
        return {
            montant: montant,
            formule: 'Repas : ' + U.nombre(j, 0) + ' j × ' + U.nombre(taux, 2) + ' € = ' + U.nombre(montant, 2) + ' €'
        };
    }

    /* Frais réels d'un déclarant : barème kilométrique + forfait repas,
       comparés à l'abattement automatique de 10 %. C'est la comparaison qui
       décide, pas la préférence déclarée. La case 1AK/1BK porte le MONTANT DES
       FRAIS, pas le salaire après déduction — l'erreur inverse était affichée
       avant ce correctif. */
    function fraisReelsDeclarant(reglages, n, annee) {
        var r = reglages || {};
        var salaire = U.num(r['salaireNetImposable' + n], 0);
        var abattement = abattement10(salaire, annee);
        var utilise = U.estVrai(r['utiliserFraisReels' + n]);
        var km = fraisKilometriques(r['fraisKm' + n], r['cvFiscal' + n], U.estVrai(r['vehiculeElectrique' + n]));
        var repas = fraisRepas(r['joursRepas' + n], annee);
        var total = U.arrondi(km.montant + repas.montant, 2);
        var retenir = utilise && total > abattement;
        return {
            salaire: salaire, abattement: abattement, km: km, repas: repas,
            total: total, utilise: utilise, retenir: retenir,
            deduction: retenir ? total : abattement,
            caseValeur: retenir ? Math.round(total) : null,
            gain: U.arrondi(Math.max(0, total - abattement), 2)
        };
    }

    function fraisKilometriques(km, cv, electrique) {
        var d = Math.max(0, U.num(km, 0));
        if (d <= 0) return { montant: 0, formule: '0 km' };
        var cle = Math.min(Math.max(Math.round(U.num(cv, 5)), 3), 7);
        var f = BAREME_KM[cle];
        var montant, formule;
        if (d <= 5000) { montant = d * f[0]; formule = U.nombre(d, 0) + ' km × ' + U.nombre(f[0], 3); }
        else if (d <= 20000) { montant = d * f[1] + f[2]; formule = '(' + U.nombre(d, 0) + ' km × ' + U.nombre(f[1], 3) + ') + ' + U.nombre(f[2], 0) + ' €'; }
        else { montant = d * f[3]; formule = U.nombre(d, 0) + ' km × ' + U.nombre(f[3], 3); }
        if (electrique) { montant *= 1.2; formule += ' × 1,20 (électrique)'; }
        return { montant: U.arrondi(montant, 2), formule: formule + ' = ' + U.nombre(montant, 2) + ' €' };
    }

    /* PFU ou barème ? La CSG déductible (6,8 %) réduit le revenu imposable en
       cas d'option pour le barème : l'omettre, c'est surévaluer le barème. */
    function comparerPfuBareme(pv, autresRevenus, parts, annee, statut) {
        pv = Math.max(0, U.num(pv, 0));
        if (pv <= 0) return { choix: 'PFU', gain: 0, detail: 'Aucune plus-value imposable.' };
        var pfuIr = pv * IR_FORFAITAIRE;
        var pfuPs = pv * tauxPS(annee);
        var pfuTotal = pfuIr + pfuPs;

        var csgDeductible = pv * CSG_DEDUCTIBLE;
        var irAvec = impotRevenu(autresRevenus + pv - csgDeductible, parts, annee, statut);
        var irSans = impotRevenu(autresRevenus, parts, annee, statut);
        var irMarginal = Math.max(0, irAvec.impot_net - irSans.impot_net);
        var ps = pv * tauxPS(annee);
        var baremeTotal = irMarginal + ps;
        var avantage = pfuTotal - baremeTotal;

        return {
            annee: annee, plus_value_nette: pv,
            pfu: { ir: pfuIr, ps: pfuPs, total: pfuTotal },
            bareme: { ir_marginal: irMarginal, ps: ps, total: baremeTotal, csg_deductible: csgDeductible },
            choix: baremeTotal < pfuTotal ? 'Barème progressif' : 'PFU',
            gain: Math.abs(avantage), tmi: irAvec.tmi, cocher_2op: baremeTotal < pfuTotal
        };
    }

    /* Taux de prélèvement à la source (CGI art. 204 H & 204 M). */
    function tauxPAS(revenuNet, parts, annee, statut, declarant) {
        var foyer = impotRevenu(revenuNet, parts, annee, statut);
        var tauxFoyer = revenuNet > 0 ? foyer.impot_net / revenuNet : 0;
        var res = { taux_foyer: tauxFoyer, impot: foyer.impot_net };
        if (declarant) {
            var couple = estCouple(statut);
            var partsIndiv = couple ? (parts - 1) : parts;
            if (partsIndiv >= 0.5) {
                var revenuIndiv = couple ? revenuNet / 2 : revenuNet;
                var parts1 = Math.max(0.5, partsIndiv < 1 ? 0.5 : partsIndiv);
                var ir1 = impotRevenu(revenuIndiv, parts1, annee, couple ? 'Célibataire' : statut);
                res.taux_individuel = revenuIndiv > 0 ? ir1.impot_net / revenuIndiv : 0;
                res.impot_individuel = ir1.impot_net;
            }
        }
        return res;
    }

    // --------------------------------------------------- mise à jour des barèmes

    function verifierMaj(anneeCible) {
        var auj = new Date();
        var an = auj.getFullYear();
        var cible = anneeCible || an;
        var derniere = derniereAnnee();
        if (an > derniere || cible > derniere) {
            return {
                disponible: true, derniere_annee: derniere, url: URL_MAJ_BAREMES,
                message: 'Les barèmes fiscaux pour les revenus ' + Math.max(an, cible)
                    + ' sont publiés, alors que l’application s’arrête au millésime ' + derniere + '.'
            };
        }
        var src = SOURCE_PAR_ANNEE[cible] || '';
        if (src.toLowerCase().indexOf('recouper') >= 0 && auj >= new Date(cible + 1, 3, 1)) {
            return {
                disponible: true, derniere_annee: derniere, url: URL_MAJ_BAREMES,
                message: 'La campagne de déclaration des revenus ' + cible + ' est ouverte au BOFiP : '
                    + 'une consolidation officielle des seuils est disponible.'
            };
        }
        return {
            disponible: false, derniere_annee: derniere, url: URL_MAJ_BAREMES,
            message: 'Barèmes à jour jusqu’aux revenus ' + derniere + ' (IR, décote, PFU '
                + U.nombre(tauxPFU(derniere) * 100, 1) + ' %, barème kilométrique et forfait repas).'
        };
    }

    var PROMPT_MAJ = 'Mets à jour le fichier core/fiscal_bars.py du projet MonPortefeuille2.\n\n'
        + 'Je veux le millésime {ANNEE} des revenus, au format du fichier existant :\n'
        + '- Bareme(annee, tranches=(4 plafonds), taux=(0.11, 0.30, 0.41, 0.45), '
        + 'decote_base_celibataire, decote_plafond_celibataire, decote_base_couple, decote_plafond_couple)\n'
        + '- taux de prélèvements sociaux sur le capital mobilier (PS_PAR_ANNEE)\n'
        + '- plafond/plancher de l’abattement forfaitaire de 10 % sur les salaires\n'
        + '- forfait repas et barème kilométrique\n\n'
        + 'Sources à citer explicitement : BOFiP, loi de finances, LFSS. '
        + 'N’invente aucune valeur : si un chiffre est introuvable, laisse l’année absente et dis-le. '
        + 'Rends le fichier complet, prêt à remplacer l’ancien, avec les commentaires de source.';

    // -------------------------------------------------------------- plus-values

    /* Cessions de l'année, lots FIFO, coût converti en euros à la date de
       chaque transaction (jamais une conversion manuelle). */
    function cessionsAnnee(ctx, annee) {
        var txs = (ctx.transactions || []).filter(function (t) { return String(t.date).slice(0, 4) === String(annee); });
        if (!txs.length) return Promise.resolve({ parClasse: {}, total: 0, cessions: [], indisponible: [] });

        // Les lots se reconstituent depuis le tout premier achat : les taux de
        // tout l'historique sont demandés, pas seulement ceux de l'année.
        var besoin = {};
        (ctx.transactions || []).forEach(function (t) { if (t.devise !== 'EUR') besoin[t.devise + '|' + t.date] = 1; });

        return Promise.all(Object.keys(besoin).map(function (cle) {
            var p = cle.split('|');
            return PF.net.taux(p[0], p[1], 'EUR').then(function (v) { return [cle, v]; });
        })).then(function (paires) {
            var taux = {};
            paires.forEach(function (p) { taux[p[0]] = PF.util.tauxValide(p[1]); });

            var manquants = tauxManquants(ctx.transactions || [], taux);
            if (manquants.length) {
                return { parClasse: {}, total: null, cessions: [], indisponible: manquants };
            }

            var lots = {}, cessions = [];
            // On rejoue tout l'historique pour reconstituer les lots.
            (ctx.transactions || []).forEach(function (t) {
                var tEur = tauxTransaction(t, taux);
                if (!lots[t.ticker]) lots[t.ticker] = [];
                if (t.type === 'achat') {
                    lots[t.ticker].push({ qte: t.quantite, cout: t.montantNet * tEur });
                } else {
                    var restant = t.quantite;
                    var produit = (t.quantite * t.cours - t.frais) * tEur;
                    var cout = 0;
                    while (restant > 1e-9 && lots[t.ticker].length) {
                        var lot = lots[t.ticker][0];
                        var pris = Math.min(lot.qte, restant);
                        cout += (lot.cout / lot.qte) * pris;
                        lot.qte -= pris;
                        lot.cout -= (lot.cout / (lot.qte + pris)) * pris;
                        restant -= pris;
                        if (lot.qte <= 1e-9) lots[t.ticker].shift();
                    }
                    if (String(t.date).slice(0, 4) === String(annee)) {
                        cessions.push({
                            ticker: t.ticker, date: t.date, quantite: t.quantite,
                            produit: produit, cout: cout, pv: produit - cout,
                            prix_cession: t.quantite * t.cours,
                            classe: PF.modele.classeDe(t.ticker)
                        });
                    }
                }
            });

            var parClasse = {};
            cessions.forEach(function (c) {
                if (!parClasse[c.classe]) parClasse[c.classe] = { pv: 0, mv: 0, prix_cession: 0, nb: 0 };
                var o = parClasse[c.classe];
                o.nb += 1;
                o.prix_cession += c.prix_cession;
                if (c.pv >= 0) o.pv += c.pv; else o.mv += -c.pv;
            });
            var total = cessions.reduce(function (s, c) { return s + c.pv; }, 0);
            return { parClasse: parClasse, total: total, cessions: cessions, indisponible: [] };
        });
    }


    // -------------------------------------------------- moteur de déclaration
    /* Portage de core/tax.py — detail_2074_de_lannee, detail_2086_de_lannee et
       simuler_foyer_complet. Un seul moteur alimente les cinq formulaires :
       deux lectures différentes des mêmes écritures donneraient deux montants
       pour la même case, et une case fausse se paie.

       Deux méthodes distinctes, et ce n'est pas une subtilité :
       - titres (actions, ETF, ETC, or) : prix de revient moyen, comme la v2 ;
       - crypto-actifs : méthode proportionnelle de l'article 150 VH bis, la
         seule que l'administration accepte pour les actifs numériques. */

    var CLASSES_2074 = ['action_etf', 'obligation_etf', 'or'];

    function estAchat(t) { return String(t.type).indexOf('achat') >= 0; }

    /* Montant net dans la devise de cotation, converti en euros au cours du
       jour de l'opération : les frais entrent dans le prix de revient à
       l'achat, et sortent du prix de cession à la vente. */
    function montantNetEur(t, taux) {
        var brut = U.num(t.quantite, 0) * U.num(t.cours, 0);
        var net = estAchat(t) ? brut + U.num(t.frais, 0) : brut - U.num(t.frais, 0);
        var tx = tauxTransaction(t, taux);
        return tx === null ? null : net * tx;
    }

    /* Taux de conversion de la transaction vers l'euro, ou null si le cours du
       jour n'est pas disponible. Jamais de repli sur 1 : un montant en euros
       fabriqué avec un taux inventé entre dans une base imposable. */
    function tauxTransaction(t, taux) {
        if (t.devise === 'EUR') return 1;
        return PF.util.tauxValide(taux[t.devise + '|' + t.date]);
    }

    /* Liste des cours de change qui manquent pour les transactions données. */
    function tauxManquants(txs, taux) {
        var vus = {}, liste = [];
        txs.forEach(function (t) {
            if (tauxTransaction(t, taux) !== null) return;
            var cle = t.devise + '|' + String(t.date);
            if (!vus[cle]) { vus[cle] = 1; liste.push({ devise: t.devise, date: String(t.date) }); }
        });
        return liste;
    }

    function ajouterManquants(liste, ajout) {
        var vus = {};
        liste.forEach(function (m) { vus[m.devise + '|' + m.date] = 1; });
        ajout.forEach(function (m) {
            if (!vus[m.devise + '|' + m.date]) { vus[m.devise + '|' + m.date] = 1; liste.push(m); }
        });
        return liste;
    }

    function ecrituresTriees(ctx, annee) {
        return (ctx.transactions || []).slice().sort(function (a, b) {
            var da = String(a.date), db = String(b.date);
            if (da !== db) return da < db ? -1 : 1;
            return estAchat(a) ? -1 : 1;          // achats avant ventes, à date égale
        }).filter(function (t) { return Number(String(t.date).slice(0, 4)) <= annee; });
    }

    function vide2074(annee) {
        return { annee: annee, operations: [], par_actif: [], ligne_905: 0, ligne_913: 0,
            bilan_net: 0, mv_anterieures_reportables: 0, case_3vg: 0, case_3vh: 0, cadre_11: [] };
    }

    function vide2086(annee) {
        return { annee: annee, cessions: [], total_cessions_213: 0, plus_value_globale_224: 0,
            exonere_305: false, case_3an: 0, case_3bn: 0 };
    }

    /* Formulaire 2074 : synthèse 905/913, cadre 5 ligne par ligne et cadre 11
       (imputation des moins-values, colonnes A à E). */
    function detail2074(txs, annee, taux) {
        var soldes = {}, operations = [], pvParAnnee = {}, manquants = [];

        txs.forEach(function (t) {
            if (CLASSES_2074.indexOf(PF.modele.classeDe(t.ticker)) < 0) return;
            var an = Number(String(t.date).slice(0, 4));
            var net = montantNetEur(t, taux);
            if (net === null) { manquants = ajouterManquants(manquants, [{ devise: t.devise, date: String(t.date) }]); return; }
            var qte = U.num(t.quantite, 0);
            if (!soldes[t.ticker]) soldes[t.ticker] = { qte: 0, cout: 0 };
            var etat = soldes[t.ticker];

            if (estAchat(t)) {
                etat.qte += qte;
                etat.cout += net;
                return;
            }
            if (etat.qte <= 1e-9) return;                  // vente sans lot : on ne invente pas de PRU

            var pru = etat.cout / etat.qte;
            var acq = pru * qte;
            var pv = net - acq;
            etat.qte = Math.max(0, etat.qte - qte);
            etat.cout = Math.max(0, etat.cout - acq);
            if (etat.qte <= 1e-6) { etat.qte = 0; etat.cout = 0; }

            pvParAnnee[an] = (pvParAnnee[an] || 0) + pv;
            if (an === annee) {
                operations.push({
                    actif: t.ticker, date: String(t.date), quantite: qte,
                    pru_unitaire_eur: pru, acq_globale_eur: acq,
                    cession_globale_eur: net, plus_value_eur: pv
                });
            }
        });

        /* Suivi des moins-values antérieures reportables dix ans
           (CGI art. 150-0 D, 11) : la plus ancienne s'impute la première. */
        var files = [];
        Object.keys(pvParAnnee).map(Number).sort(function (a, b) { return a - b; })
            .forEach(function (y) {
                if (y >= annee) return;
                files = files.filter(function (f) { return y - f[0] <= 10 && f[1] > 1e-6; });
                var solde = pvParAnnee[y];
                if (solde < 0) { files.push([y, Math.abs(solde)]); return; }
                var gain = solde;
                files.forEach(function (f) {
                    if (gain <= 0) return;
                    var conso = Math.min(gain, f[1]);
                    f[1] -= conso;
                    gain -= conso;
                });
                files = files.filter(function (f) { return f[1] > 1e-6; });
            });
        files = files.filter(function (f) { return annee - f[0] <= 10 && f[1] > 1e-6; });
        var mvAnterieures = U.arrondi(files.reduce(function (s, f) { return s + f[1]; }, 0), 2);

        // --- Cadre 5 : une ligne de 511 à 524 par titre, agrégée sur l'année
        var parActif = [], actifs = {};
        operations.forEach(function (op) { actifs[op.actif] = 1; });
        Object.keys(actifs).sort().forEach(function (actif) {
            var ops = operations.filter(function (o) { return o.actif === actif; });
            var qteTot = ops.reduce(function (s, o) { return s + o.quantite; }, 0);
            var cessionTot = ops.reduce(function (s, o) { return s + o.cession_globale_eur; }, 0);
            var acqTot = ops.reduce(function (s, o) { return s + o.acq_globale_eur; }, 0);
            var pvTot = ops.reduce(function (s, o) { return s + o.plus_value_eur; }, 0);
            parActif.push({
                actif: actif, nb_operations: ops.length,
                ligne_511: actif + ' (agrégé annuel) — Swissquote Bank Europe SA',
                ligne_512: '31/12/' + annee,
                ligne_514: qteTot > 0 ? cessionTot / qteTot : 0,
                ligne_515: qteTot, ligne_516: cessionTot, ligne_517: 0, ligne_518: cessionTot,
                ligne_520: qteTot > 0 ? acqTot / qteTot : 0,
                ligne_521: acqTot, ligne_522: 0, ligne_523: acqTot, ligne_524: pvTot
            });
        });

        var l905 = parActif.reduce(function (s, a) { return s + (a.ligne_524 > 0 ? a.ligne_524 : 0); }, 0);
        var l913 = Math.abs(parActif.reduce(function (s, a) { return s + (a.ligne_524 < 0 ? a.ligne_524 : 0); }, 0));
        var bilanNet = U.arrondi(l905 - l913, 2);
        // Une seule transaction sans cours et le bilan 2074 n'est plus juste :
        // on n'en présente aucun chiffre.
        if (manquants.length) return Object.assign(vide2074(annee), { indisponible: manquants });

        // --- Cadre 11 (bloc 1133) : colonnes A à E
        var cadre11 = [], mvRestante = l913, mvAntRestante = mvAnterieures;
        parActif.forEach(function (a) {
            if (a.ligne_524 <= 0) return;
            var gain = a.ligne_524;
            var imput = Math.min(gain, mvRestante);
            mvRestante = Math.max(0, mvRestante - imput);
            var colC = gain - imput;
            var imputAnt = Math.min(colC, mvAntRestante);
            mvAntRestante = Math.max(0, mvAntRestante - imputAnt);
            cadre11.push({
                actif: a.actif,
                col_a: U.arrondi(gain, 2), col_b: U.arrondi(imput, 2), col_c: U.arrondi(colC, 2),
                col_d: U.arrondi(imputAnt, 2), col_e: U.arrondi(colC - imputAnt, 2)
            });
        });

        return {
            annee: annee, operations: operations, par_actif: parActif,
            ligne_905: U.arrondi(l905, 2), ligne_913: U.arrondi(l913, 2), bilan_net: bilanNet,
            mv_anterieures_reportables: mvAnterieures,
            case_3vg: bilanNet > 0 ? U.arrondi(Math.max(0, bilanNet - mvAnterieures), 2) : 0,
            case_3vh: bilanNet < 0 ? U.arrondi(Math.abs(bilanNet), 2) : 0,
            cadre_11: cadre11
        };
    }

    /* Les cours historiques des autres crypto-actifs détenus le jour d'une
       cession : sans eux, la valeur globale du portefeuille — donc la fraction
       de capital déductible — serait fausse. */
    function besoinsPrixCrypto(txs, annee) {
        var qtes = {}, demandes = [];
        txs.forEach(function (t) {
            if (PF.modele.classeDe(t.ticker) !== 'crypto') return;
            var q = U.num(t.quantite, 0);
            if (estAchat(t)) { qtes[t.ticker] = (qtes[t.ticker] || 0) + q; return; }
            Object.keys(qtes).forEach(function (tk) {
                if ((qtes[tk] || 0) > 1e-8 && tk !== t.ticker) demandes.push({ ticker: tk, date: String(t.date) });
            });
            qtes[t.ticker] = Math.max(0, (qtes[t.ticker] || 0) - q);
        });
        if (!demandes.length) return Promise.resolve({});
        return Promise.all(demandes.map(function (d) {
            return PF.net.cours(d.ticker, d.date).then(function (c) { return [d.ticker + '|' + d.date, c]; });
        })).then(function (paires) {
            // Un cours absent reste absent : detail2086 le signale au lieu de
            // retirer la position de la valeur globale.
            var prix = {};
            paires.forEach(function (p) { prix[p[0]] = PF.util.estNombre(p[1]) && p[1] > 0 ? p[1] : null; });
            return prix;
        });
    }

    /* Formulaire 2086 — article 150 VH bis. La fraction de capital déduite
       (ligne 221) suit le rapport entre le prix de cession et la valeur
       globale du portefeuille d'actifs numériques au jour de la cession. */
    function detail2086(txs, annee, taux, prix) {
        var coutTotal = 0, fractions = 0, qtes = {}, cessions = [], manquants = [];

        txs.forEach(function (t) {
            if (PF.modele.classeDe(t.ticker) !== 'crypto') return;
            var net = montantNetEur(t, taux);
            var q = U.num(t.quantite, 0);
            var iso = String(t.date);

            if (net === null) { manquants = ajouterManquants(manquants, [{ devise: t.devise, date: iso }]); return; }
            if (estAchat(t)) { coutTotal += net; qtes[t.ticker] = (qtes[t.ticker] || 0) + q; return; }

            var prixUnitaire = q > 0 ? net / q : 0;
            var valeurGlobale = 0;
            Object.keys(qtes).forEach(function (tk) {
                var qte = qtes[tk] || 0;
                if (qte <= 1e-8) return;
                if (tk === t.ticker && prixUnitaire > 0) valeurGlobale += qte * prixUnitaire;
                else {
                    var c = prix[tk + '|' + iso];
                    var tUsd = PF.util.tauxValide(taux['USD|' + iso]);
                    if (!PF.util.estNombre(c) || !(c > 0)) {
                        manquants = ajouterManquants(manquants, [{ devise: 'cours ' + tk, date: iso }]);
                    } else if (tUsd === null) {
                        manquants = ajouterManquants(manquants, [{ devise: 'USD', date: iso }]);
                    } else {
                        valeurGlobale += qte * c * tUsd;
                    }
                }
            });
            if (valeurGlobale < net) valeurGlobale = net;      // garde-fou de la v2

            var l220 = coutTotal, l221 = fractions, l223 = Math.max(0, l220 - l221);
            var fraction = valeurGlobale > 0 ? l223 * (net / valeurGlobale) : 0;
            var l224 = net - fraction;
            fractions += fraction;
            qtes[t.ticker] = Math.max(0, (qtes[t.ticker] || 0) - q);

            if (Number(iso.slice(0, 4)) === annee) {
                cessions.push({
                    actif: t.ticker, date: iso, quantite: q,
                    ligne_213: U.arrondi(net, 2), ligne_220: U.arrondi(l220, 2),
                    ligne_221: U.arrondi(l221, 2), ligne_223: U.arrondi(l223, 2),
                    fraction_capital: U.arrondi(fraction, 2), ligne_224: U.arrondi(l224, 2)
                });
            }
        });

        if (manquants.length) return Object.assign(vide2086(annee), { indisponible: manquants });

        var total213 = U.arrondi(cessions.reduce(function (s, c) { return s + c.ligne_213; }, 0), 2);
        var total224 = U.arrondi(cessions.reduce(function (s, c) { return s + c.ligne_224; }, 0), 2);
        var exonere = cessions.length > 0 && total213 <= CRYPTO_FRANCHISE_CESSIONS;
        var case3an = 0, case3bn = 0;
        if (!exonere && cessions.length) {
            if (total224 > 0) case3an = total224; else case3bn = Math.abs(total224);
        }
        return {
            annee: annee, cessions: cessions, total_cessions_213: total213,
            plus_value_globale_224: total224, exonere_305: exonere,
            case_3an: U.arrondi(case3an, 2), case_3bn: U.arrondi(case3bn, 2), indisponible: []
        };
    }

    function bilanCessions(ctx, annee) {
        var txs = ecrituresTriees(ctx, annee);
        if (!txs.length) return Promise.resolve({ t2074: vide2074(annee), t2086: vide2086(annee), indisponible: [] });

        var besoin = {};
        txs.forEach(function (t) {
            if (t.devise !== 'EUR') besoin[t.devise + '|' + t.date] = 1;
            if (PF.modele.classeDe(t.ticker) === 'crypto') besoin['USD|' + t.date] = 1;
        });

        return Promise.all(Object.keys(besoin).map(function (cle) {
            var p = cle.split('|');
            return PF.net.taux(p[0], p[1], 'EUR').then(function (v) { return [cle, v]; });
        })).then(function (paires) {
            var taux = {};
            paires.forEach(function (p) { taux[p[0]] = PF.util.tauxValide(p[1]); });
            var t2074 = detail2074(txs, annee, taux);
            return besoinsPrixCrypto(txs, annee).then(function (prix) {
                var t2086 = detail2086(txs, annee, taux, prix);
                // Le bilan entier attend le cours : un 2074 juste et un 2086 faux
                // ne se présentent pas ensemble comme une déclaration complète.
                var indisponible = ajouterManquants(
                    ajouterManquants([], t2074.indisponible || []), t2086.indisponible || []);
                return { t2074: t2074, t2086: t2086, indisponible: indisponible };
            });
        });
    }

    /* Simulation complète du foyer. Portage de tax.simuler_foyer_complet :
       mêmes agrégats, mêmes arrondis, mêmes taux de prélèvement à la source
       individualisés (CGI art. 204 M) — le conjoint aux revenus les plus
       faibles est calculé en célibataire sur la moitié des parts, l'autre
       supporte le solde, de sorte que la somme des deux égale l'impôt du
       foyer. */
    function simulerFoyer(o) {
        var annee = o.annee;
        var couple = estCouple(o.statut);
        var sal1 = Math.max(0, U.num(o.salaire1, 0));
        var sal2 = couple ? Math.max(0, U.num(o.salaire2, 0)) : 0;

        var abatt1 = abattement10(sal1, annee);
        var km1 = fraisKilometriques(o.km1, o.cv1, o.elec1);
        var rep1 = fraisRepas(o.joursRepas1, annee);
        var frais1 = o.fraisReels1 ? U.arrondi(km1.montant + rep1.montant, 2) : 0;
        var retenir1 = !!(o.fraisReels1 && frais1 > abatt1);
        var ded1 = retenir1 ? frais1 : abatt1;

        var abatt2 = couple ? abattement10(sal2, annee) : 0;
        var km2 = couple ? fraisKilometriques(o.km2, o.cv2, o.elec2) : { montant: 0, formule: '' };
        var rep2 = couple ? fraisRepas(o.joursRepas2, annee) : { montant: 0, formule: '' };
        var frais2 = (couple && o.fraisReels2) ? U.arrondi(km2.montant + rep2.montant, 2) : 0;
        var retenir2 = !!(couple && o.fraisReels2 && frais2 > abatt2);
        var ded2 = retenir2 ? frais2 : abatt2;

        var revNet1 = Math.max(0, sal1 - ded1), revNet2 = Math.max(0, sal2 - ded2);
        var revNetSalaires = revNet1 + revNet2;
        var irSalaires = impotRevenu(revNetSalaires, o.parts, annee, o.statut);

        var pvActionsPos = Math.max(0, U.num(o.bilanPvActions, 0));
        var interetsPos = Math.max(0, U.num(o.interetsEtrangers, 0));
        var assiette2op = pvActionsPos + interetsPos;
        var arbitrage = assiette2op > 0
            ? comparerPfuBareme(assiette2op, revNetSalaires, o.parts, annee, o.statut)
            : null;

        var pvCryptoPos = Math.max(0, U.num(o.pvCryptoImposable, 0));
        var impotCrypto = pvCryptoPos * tauxPFU(annee);
        var impotCapital = (arbitrage ? Math.min(arbitrage.pfu.total, arbitrage.bareme.total) : 0) + impotCrypto;
        var impotTotal = irSalaires.impot_net + impotCapital;
        var tauxMoyenSalaires = (sal1 + sal2) > 0 ? irSalaires.impot_net / (sal1 + sal2) : 0;

        var tauxPas1 = tauxMoyenSalaires, tauxPas2 = 0;
        if (couple && sal1 > 0 && sal2 > 0) {
            var demi = Math.max(1, U.num(o.parts, 1) / 2);
            var impot1, impot2;
            if (revNet1 <= revNet2) {
                var irA = impotRevenu(revNet1, demi, annee, 'Célibataire');
                impot1 = Math.min(irSalaires.impot_net, irA.impot_net);
                impot2 = Math.max(0, irSalaires.impot_net - impot1);
            } else {
                var irB = impotRevenu(revNet2, demi, annee, 'Célibataire');
                impot2 = Math.min(irSalaires.impot_net, irB.impot_net);
                impot1 = Math.max(0, irSalaires.impot_net - impot2);
            }
            tauxPas1 = impot1 / sal1;
            tauxPas2 = impot2 / sal2;
        }

        return {
            annee: annee, couple: couple, parts: o.parts,
            salaire_1: sal1, salaire_2: sal2,
            abattement_10_1: abatt1, abattement_10_2: abatt2,
            frais_km_1: km1.montant, frais_km_formule_1: km1.formule,
            frais_repas_1: rep1.montant, frais_repas_formule_1: rep1.formule,
            frais_reels_1: frais1, retenir_frais_reels_1: retenir1,
            frais_km_2: km2.montant, frais_km_formule_2: km2.formule,
            frais_repas_2: rep2.montant, frais_repas_formule_2: rep2.formule,
            frais_reels_2: frais2, retenir_frais_reels_2: retenir2,
            case_1aj: Math.round(sal1), case_1ak: retenir1 ? Math.round(frais1) : null,
            case_1bj: (couple && sal2 > 0) ? Math.round(sal2) : null,
            case_1bk: retenir2 ? Math.round(frais2) : null,
            note_1ak: o.fraisReels1
                ? 'Déclarant 1 (' + annee + ') — ' + km1.formule + ' ; ' + rep1.formule
                  + ' ; Total frais réels (case 1AK) = ' + U.nombre(Math.round(frais1), 0) + ' €'
                : '',
            note_1bk: (couple && o.fraisReels2)
                ? 'Déclarant 2 (' + annee + ') — ' + km2.formule + ' ; ' + rep2.formule
                  + ' ; Total frais réels (case 1BK) = ' + U.nombre(Math.round(frais2), 0) + ' €'
                : '',
            interets_etrangers: interetsPos, pays: o.pays || '—',
            case_2tr: interetsPos > 0 ? Math.round(interetsPos) : null,
            revenu_net_imposable_salaires: U.arrondi(revNetSalaires, 2),
            ir_salaires: irSalaires, arbitrage: arbitrage,
            cocher_2op: !!(arbitrage && arbitrage.choix === 'Barème progressif'),
            impot_crypto: impotCrypto, impot_capital_retenu: impotCapital,
            impot_total_foyer: impotTotal, taux_moyen_salaires: tauxMoyenSalaires,
            taux_pas_foyer: tauxMoyenSalaires, taux_pas_1: tauxPas1, taux_pas_2: tauxPas2
        };
    }

    // -------------------------------------------------------------------- vue

    /* Les paramètres fiscaux sont mémorisés dans la table `Config` (clés f_*)
       par la v1 et la v2 : on les charge, sinon l'écran fiscalité affiche des
       zéros que le porteur doit ressaisir à la main. */
    var CORRESPONDANCE = {
        f_statut: 'statutFiscal', f_parts: 'partsFiscales', f_enf: 'nbEnfants',
        f_s1: 'salaireNetImposable1', f_s2: 'salaireNetImposable2',
        f_int_net: 'interetsEtrangers', f_pays_etr: 'paysEtranger',
        f_u1: 'utiliserFraisReels1', f_k1: 'fraisKm1', f_cv1: 'cvFiscal1',
        f_r1: 'joursRepas1', f_elec1: 'vehiculeElectrique1',
        f_u2: 'utiliserFraisReels2', f_k2: 'fraisKm2', f_cv2: 'cvFiscal2',
        f_r2: 'joursRepas2', f_elec2: 'vehiculeElectrique2'
    };

    var configAppliquee = false;

    function appliquerConfig(ctx) {
        var cfg = (ctx && ctx.config) || {};
        var cles = Object.keys(cfg);
        if (!cles.length) return false;
        var patch = {};
        cles.forEach(function (k) {
            var cible = CORRESPONDANCE[k];
            if (!cible) return;
            var v = cfg[k];
            if (v === null || v === undefined || String(v).trim() === '') return;
            patch[cible] = (typeof v === 'string' && /^-?\d+(?:[.,]\d+)?$/.test(v.trim()) && cible !== 'paysEtranger')
                ? U.num(v, 0) : String(v);
        });
        if (Object.keys(patch).length) PF.store.sauverReglages(patch);
        configAppliquee = true;
        return true;
    }

    var anneeFiscale = null;

    function anneeEnCours() {
        if (anneeFiscale) return anneeFiscale;
        var auj = new Date().getFullYear() - 1;   // on déclare l'année précédente
        return BAREMES[auj] ? auj : derniereAnnee();
    }

    function vue(ctx) {
        var prefait = ctx && ctx.config ? appliquerConfig(ctx) : false;
        var r = PF.store.reglages();
        var annee = anneeEnCours();
        var out = '';
        var maj = verifierMaj(annee);

        out += '<div class="chips">' + annees().map(function (a) {
            return '<button class="chip' + (a === annee ? ' actif' : '') + '" data-fisc="annee" data-valeur="' + a + '">Revenus ' + a + '</button>';
        }).join('') + '</div>';

        // --- Bandeau de mise à jour
        if (maj.disponible) {
            out += '<div class="info"><b>Nouveaux barèmes disponibles.</b> ' + UI.h(maj.message)
                + '<div style="margin-top:8px"><button class="btn sec" data-fisc="ouvrir-lien">Ouvrir l’assistant de mise à jour</button></div>'
                + '<div style="margin-top:8px"><button class="btn ghost" data-fisc="prompt">Voir le prompt à envoyer à l’IA</button></div></div>';
        } else {
            out += '<div class="ok-vert">' + UI.h(maj.message) + '</div>';
        }
        if (PS_ANNEE_INCERTAINE[annee]) {
            out += '<div class="info"><b>Prélèvements sociaux ' + annee + ' : taux discuté.</b> '
                + UI.h(PS_ANNEE_INCERTAINE[annee]) + '</div>';
        }

        // --- 1. Paramètres fiscaux
        var couple = estCouple(r.statutFiscal);
        var f1 = fraisReelsDeclarant(r, 1, annee);
        var f2 = couple ? fraisReelsDeclarant(r, 2, annee) : null;

        out += '<div class="titre">1. Vos paramètres fiscaux <span class="n">cliquez pour modifier</span></div>';

        var enfants = Math.max(0, Math.round((r.partsFiscales - (couple ? 2 : 1)) * 2));
        out += UI.accordeon('Situation familiale',
            ligneReglage('Statut', r.statutFiscal, 'statutFiscal')
            + ligneReglage('Parts fiscales', U.nombre(r.partsFiscales, 1), 'partsFiscales')
            + '<div style="font-size:12px;color:var(--txt-3);margin-top:4px">' + (couple ? 'Foyer de 2 parts' : 'Foyer d’1 part')
            + (enfants > 0 ? ' + ' + enfants + ' demi-part(s) au titre des enfants' : '') + '.</div>',
            false);

        var corpsBase = ''
            + (prefait ? '<div class="ok-vert" style="margin-bottom:10px">Paramètres chargés depuis votre base '
                + 'Supabase (table <b>Config</b>) : statut, salaires, kilomètres, CV, repas, intérêts étrangers.</div>'
                : '<div class="info" style="margin-bottom:10px">Aucun paramètre mémorisé dans la table '
                + '<b>Config</b> : saisissez vos valeurs, elles seront enregistrées et partagées avec '
                + 'l’application Streamlit.</div>')
            + ligneReglage('Salaire net imposable — déclarant 1 (case 1AJ)', U.eur(r.salaireNetImposable1, { dec: 0 }), 'salaireNetImposable1')
            + (couple ? ligneReglage('Salaire net imposable — déclarant 2 (case 1BJ)', U.eur(r.salaireNetImposable2, { dec: 0 }), 'salaireNetImposable2') : '')
            + blocFraisReels(1, f1, annee, r)
            + (f2 ? blocFraisReels(2, f2, annee, r) : '')
            + '<div class="sep"></div>'
            + ligneReglage('Revenus d’intérêts encaissés à l’étranger (€)', U.eur(r.interetsEtrangers, { dec: 0 }), 'interetsEtrangers')
            + ligneReglage('Pays d’origine de ces intérêts', String(r.paysEtranger || '—'), 'paysEtranger')
            + '<div style="font-size:12px;color:var(--txt-3);margin:6px 0 10px">Formulaire <b>2047</b> '
            + 'ligne 250, puis report en <b>2TR</b> sur la 2042 — en cochant « revenus encaissés à l’étranger ».</div>'
            + '<div class="ligne" style="padding-top:4px"><div class="gr"><div class="tt">Comptes détenus hors de France</div>'
            + '<div class="st">Formulaire 3916-3916 bis + case 8UU</div></div>'
            + '<div class="dr">' + UI.badge('à déclarer', 'warn') + '</div></div>'
            + '<div class="card tight" style="margin-top:6px">'
            + COMPTES_ETRANGER.map(function (c) {
                return '<div style="display:flex;gap:8px;padding:5px 0;font-size:12.5px;color:var(--txt-2)">'
                    + '<span style="color:var(--gold)">•</span><span>' + UI.h(c) + '</span></div>';
            }).join('')
            + '</div>'
            + '<div style="font-size:12px;color:var(--txt-3)">Un compte ouvert chez un intermédiaire étranger '
            + 'doit être déclaré même sans opération : amende de 1 500 € par compte et par an. Le compte '
            + 'courant Revolut n’est pas listé : selon votre contrat il est adossé à une entité française, '
            + 'irlandaise ou lituanienne — la réponse vous appartient, l’application ne la devine pas.</div>';

        out += UI.accordeon('Déclaration de base', corpsBase, false, resumeBase(f1, f2, r));

        // --- 2. Formulaires (remplis après lecture des écritures de l'année)
        out += '<div class="titre">2. Vos formulaires de déclaration ' + (annee + 1)
            + ' <span class="n">revenus ' + annee + '</span></div>';
        out += '<div id="fiscFormulaires"><div class="card"><div class="vide" style="padding:14px">'
            + 'Lecture de vos écritures ' + annee + ' en cours…</div></div></div>';

        // --- 3. Arbitrage, bilan et prélèvement à la source
        out += '<div class="titre">3. Impôt du foyer, arbitrage PFU / barème et taux à la source</div>';
        out += '<div id="fiscBilan"><div class="card"><div class="vide" style="padding:14px">Calcul en cours…</div></div></div>';

        bilanCessions(ctx, annee).then(function (b) {
            if (b.indisponible.length) {
                var f0 = document.getElementById('fiscFormulaires');
                if (f0) f0.innerHTML = formulairesIndisponibles(annee, b.indisponible);
                var g0 = document.getElementById('fiscBilan');
                if (g0) g0.innerHTML = bilanIndisponible(annee, b.indisponible);
                return;
            }
            var sim = simulerFoyer({
                annee: annee, statut: r.statutFiscal, parts: r.partsFiscales,
                salaire1: r.salaireNetImposable1, salaire2: r.salaireNetImposable2,
                fraisReels1: U.estVrai(r.utiliserFraisReels1), km1: r.fraisKm1, cv1: r.cvFiscal1,
                joursRepas1: r.joursRepas1, elec1: U.estVrai(r.vehiculeElectrique1),
                fraisReels2: U.estVrai(r.utiliserFraisReels2), km2: r.fraisKm2, cv2: r.cvFiscal2,
                joursRepas2: r.joursRepas2, elec2: U.estVrai(r.vehiculeElectrique2),
                interetsEtrangers: r.interetsEtrangers, pays: r.paysEtranger,
                bilanPvActions: b.t2074.bilan_net, pvCryptoImposable: b.t2086.case_3an
            });
            var f = document.getElementById('fiscFormulaires');
            if (f) { f.innerHTML = formulaires(annee, sim, b.t2074, b.t2086, r); UI.lierAccordeons(f); }
            var g = document.getElementById('fiscBilan');
            if (g) { g.innerHTML = bilanImpot(annee, sim, b.t2074, b.t2086); UI.lierAccordeons(g); }
        }).catch(function (err) {
            /* Sans les cours de change du jour, les montants ne peuvent pas être
               reconstitués : un formulaire à moitié rempli est pire qu'un
               formulaire vide, on le dit au lieu de deviner. */
            var msg = '<div class="erreur">Formulaires non préremplis : ' + UI.h(String(err && err.message || err))
                + '. Recopiez vos écritures depuis l’onglet Portefeuille › Opérations.</div>';
            var f2b = document.getElementById('fiscFormulaires');
            if (f2b) f2b.innerHTML = msg;
            var g2 = document.getElementById('fiscBilan');
            if (g2) g2.innerHTML = '<div class="card"><div class="vide" style="padding:14px">'
                + 'Bilan indisponible sans la lecture des écritures.</div></div>';
        });

        return out;
    }

    /* Un taux ou un cours manquant : aucun montant n'est calculé à sa place.
       La liste dit quel cours manque, et les chiffres restent à « — ». */
    function libelleManquant(m) {
        var quand = U.jourMoisAnneeISO(m.date);
        return /^cours /.test(m.devise)
            ? m.devise + ' au ' + quand
            : 'taux ' + m.devise + '/EUR au ' + quand;
    }

    function avisIndisponible(liste) {
        return '<div class=\"erreur\">Montant non calculé, taux indisponible au '
            + liste.map(function (m) { return UI.h(libelleManquant(m)); }).join(' ; ')
            + '. Réessayez plus tard, quand le cours est disponible : rien n’a été estimé à la place.</div>';
    }

    function formulairesIndisponibles(annee, liste) {
        return '<div class=\"card\"><div class=\"lbl\">Formulaires 2074 et 2086 ' + annee + '</div>'
            + avisIndisponible(liste)
            + ligneResultat('Plus-values de cession (2074, case 3VG / 3VH)', '—')
            + ligneResultat('Plus-values de cryptos-actifs (2086, case 3AN / 3BN)', '—')
            + '</div>';
    }

    function bilanIndisponible(annee, liste) {
        return '<div class=\"card\"><div class=\"lbl\">Flat tax (PFU) ou barème progressif ?</div>'
            + avisIndisponible(liste)
            + ligneResultat('Flat tax : total', '—')
            + ligneResultat('Barème : total', '—')
            + '</div>'
            + '<div class=\"card\"><div class=\"lbl\">Bilan de votre impôt sur le revenu ' + annee + '</div>'
            + ligneResultat('Impôt total du foyer', '—', true)
            + '<div style=\"font-size:11.5px;color:var(--txt-3);margin-top:6px\">Le bilan est calculé d’un seul tenant : '
            + 'tant que ce cours manque, aucun de ses montants n’est affiché.</div>'
            + '</div>';
    }

    /* Comptes à l'étranger connus du portefeuille : écrits dans les descriptions
       des poches à la création du portefeuille, jamais supposés. */
    var COMPTES_ETRANGER = [
        'Compte-titres Swissquote — Swissquote Bank Europe SA, Luxembourg',
        'Livret CHF Swissquote — Swissquote Bank Europe SA, Luxembourg'
    ];

    function resumeBase(f1, f2, r) {
        var morceaux = ['1AJ : ' + U.eur(f1.salaire, { dec: 0 })];
        morceaux.push('1AK : ' + (f1.caseValeur !== null ? U.eur(f1.caseValeur, { dec: 0 }) : 'vide'));
        if (f2) {
            morceaux.push('1BJ : ' + U.eur(f2.salaire, { dec: 0 }));
            morceaux.push('1BK : ' + (f2.caseValeur !== null ? U.eur(f2.caseValeur, { dec: 0 }) : 'vide'));
        }
        if (U.num(r.interetsEtrangers, 0) > 0) morceaux.push('2TR : ' + U.eur(r.interetsEtrangers, { dec: 0 }));
        return morceaux.join(' · ');
    }

    /* Un tableau de cases : c'est la seule forme qui se recopie sans se
       tromper — la case, ce qu'elle attend, et le montant exact. */
    function tableauCases(lignes) {
        if (!lignes.length) return '<div class="info">Rien à inscrire sur ce formulaire cette année.</div>';
        return '<table class="tableau compact"><tr><th>Case</th><th>Rubrique</th><th>À inscrire</th></tr>'
            + lignes.map(function (l) {
                return '<tr><td style="white-space:nowrap"><b>' + UI.h(l[0]) + '</b></td>'
                    + '<td style="text-align:left;font-size:12px;color:var(--txt-2)">' + UI.h(l[1])
                    + (l[3] ? '<div style="font-size:11px;color:var(--txt-3);margin-top:3px">' + UI.h(l[3]) + '</div>' : '')
                    + '</td>'
                    + '<td style="text-align:right;white-space:nowrap"><b>' + UI.h(l[2]) + '</b></td></tr>';
            }).join('') + '</table>';
    }

    // --------------------------------------------------- les cinq formulaires

    function formulaires(annee, sim, t2074, t2086, r) {
        var out = '';

        // ---- 2042 & 2042 C
        var resume2042 = ['1AJ : ' + U.eur(sim.case_1aj, { dec: 0 })];
        if (sim.case_1ak !== null) resume2042.push('1AK : ' + U.eur(sim.case_1ak, { dec: 0 }));
        if (sim.case_1bj) resume2042.push('1BJ : ' + U.eur(sim.case_1bj, { dec: 0 }));
        if (sim.case_1bk !== null) resume2042.push('1BK : ' + U.eur(sim.case_1bk, { dec: 0 }));
        if (t2074.case_3vg > 0) resume2042.push('3VG : ' + U.eur(t2074.case_3vg, { dec: 0 }));
        else if (t2074.case_3vh > 0) resume2042.push('3VH : ' + U.eur(t2074.case_3vh, { dec: 0 }));

        var cases2042 = [];
        if (sim.case_1aj > 0) cases2042.push(['1AJ', 'Traitements et salaires — déclarant 1',
            U.eur(sim.case_1aj, { dec: 0 }), 'Vérifier le montant prérempli par l’employeur.']);
        cases2042.push(['1AK', 'Frais réels — déclarant 1',
            sim.case_1ak !== null ? U.eur(sim.case_1ak, { dec: 0 }) : 'LAISSER VIDE',
            sim.case_1ak !== null ? sim.note_1ak
                : 'Abattement 10 % (' + U.eur(sim.abattement_10_1, { dec: 0 }) + ') plus avantageux.']);
        if (sim.couple && sim.case_1bj) {
            cases2042.push(['1BJ', 'Traitements et salaires — déclarant 2',
                U.eur(sim.case_1bj, { dec: 0 }), 'Vérifier le montant prérempli par l’employeur.']);
            cases2042.push(['1BK', 'Frais réels — déclarant 2',
                sim.case_1bk !== null ? U.eur(sim.case_1bk, { dec: 0 }) : 'LAISSER VIDE',
                sim.case_1bk !== null ? sim.note_1bk
                    : 'Abattement 10 % (' + U.eur(sim.abattement_10_2, { dec: 0 }) + ') plus avantageux.']);
        }
        if (sim.case_2tr) cases2042.push(['2TR', 'Intérêts et produits de placement à revenu fixe',
            U.eur(sim.case_2tr, { dec: 0 }), 'Reporté depuis la ligne 252 du formulaire 2047.']);
        if (sim.arbitrage) cases2042.push(['2OP', 'Option globale pour le barème progressif',
            sim.cocher_2op ? '☑ À COCHER' : '☐ LAISSER DÉCOCHÉE',
            sim.arbitrage.choix + ' plus avantageux (écart : ' + U.eur(sim.arbitrage.gain, { dec: 0 }) + ').']);
        if (t2074.case_3vg > 0) cases2042.push(['3VG', 'Plus-value nette imposable de cession de valeurs mobilières',
            U.eur(t2074.case_3vg, { dec: 0 }),
            'Calcul : ' + U.eur(t2074.ligne_905, { dec: 0 }) + ' − ' + U.eur(t2074.ligne_913, { dec: 0 }) + '.']);
        else if (t2074.case_3vh > 0) cases2042.push(['3VH', 'Moins-value nette reportable 10 ans',
            U.eur(t2074.case_3vh, { dec: 0 }), 'Inscrire en POSITIF, sans signe moins.']);
        if (t2086.cessions.length) {
            if (t2086.exonere_305) cases2042.push(['3AN / 3BN', 'Plus ou moins-value sur actifs numériques',
                'LAISSER VIDE (exonéré ≤ 305 €)',
                'Total des cessions : ' + U.eur(t2086.total_cessions_213, { dec: 0 }) + '.']);
            else if (t2086.case_3an > 0) cases2042.push(['3AN', 'Plus-value imposable sur actifs numériques',
                U.eur(t2086.case_3an, { dec: 0 }),
                'Total des cessions > 305 € — case 3AN après le formulaire 2086.']);
            else if (t2086.case_3bn > 0) cases2042.push(['3BN', 'Moins-value sur actifs numériques',
                U.eur(t2086.case_3bn, { dec: 0 }), 'Inscrire en POSITIF en case 3BN.']);
        }
        cases2042.push(['8UU', 'Comptes ouverts, détenus, utilisés ou clos à l’étranger',
            '☑ À COCHER', COMPTES_ETRANGER.length + ' compte(s) déclaré(s) sur l’annexe 3916 / 3916-bis.']);

        out += UI.accordeon('Formulaire 2042 & 2042-C',
            '<div style="font-size:12px;color:var(--txt-3);margin-bottom:8px">Déclaration principale — les montants '
            + 'sont ceux de vos écritures ' + annee + ' et de vos paramètres. Recopiez-les tels quels.</div>'
            + tableauCases(cases2042),
            false, resume2042.join(' · '));

        // ---- 2047
        var ligne2047 = t2074.case_3vg > 0
            ? 'Pays : Luxembourg / Suisse (Swissquote) · Plus-value nette : ' + U.eur(t2074.case_3vg, { dec: 0 })
            : 'Aucune plus-value nette imposable de valeurs mobilières à reporter au Cadre 3 cette année.';
        out += UI.accordeon('Formulaire 2047',
            '<div style="font-size:12px;color:var(--txt-3);margin-bottom:8px">Sur impots.gouv.fr : étape 3, '
            + 'cocher « Revenus encaissés à l’étranger par un contribuable domicilié en France », annexe 2047.</div>'
            + '<div style="font-size:13px;font-weight:650;margin:10px 0 4px">Rubrique 2 — revenus de capitaux mobiliers</div>'
            + (U.num(r.interetsEtrangers, 0) > 0
                ? tableauCases([
                    ['232 à 238', 'Crédits d’impôt conventionnels', 'VIDE', 'Aucun crédit d’impôt sur ces intérêts.'],
                    ['250', 'Intérêts n’ouvrant pas droit à crédit d’impôt', U.eur(r.interetsEtrangers, { dec: 0 }),
                        'Pays : ' + String(r.paysEtranger || '—')],
                    ['251', 'Total', U.eur(r.interetsEtrangers, { dec: 0 })],
                    ['252', 'Total à reporter en case 2TR de la 2042', U.eur(r.interetsEtrangers, { dec: 0 })]
                ])
                : '<div class="info">Aucun intérêt étranger saisi : rien à remplir dans la Rubrique 2.</div>')
            + '<div style="font-size:13px;font-weight:650;margin:12px 0 4px">Cadre 3 — plus-values de source étrangère</div>'
            + '<div class="' + (t2074.case_3vg > 0 ? 'ok-vert' : 'info') + '">' + UI.h(ligne2047) + '</div>',
            false,
            (U.num(r.interetsEtrangers, 0) > 0
                ? 'Ligne 250 / 2TR : ' + U.eur(r.interetsEtrangers, { dec: 0 }) + ' (' + String(r.paysEtranger || '—') + ')'
                : 'Aucun intérêt étranger saisi'));

        // ---- 2074
        out += UI.accordeon('Formulaire 2074 / 2074-CMV',
            t2074.operations.length ? bloc2074(annee, t2074)
                : '<div class="info">Aucune cession d’actions, d’ETF ou d’ETC détectée en ' + annee + '.</div>',
            false,
            t2074.operations.length
                ? t2074.operations.length + ' cession(s) · bilan ' + U.eur(t2074.bilan_net, { dec: 0 })
                : 'Aucune cession en ' + annee);

        // ---- 2086
        out += UI.accordeon('Formulaire 2086',
            t2086.cessions.length ? bloc2086(annee, t2086)
                : '<div class="info">Aucune cession de cryptomonnaie détectée en ' + annee + '.</div>',
            false,
            t2086.cessions.length
                ? t2086.cessions.length + ' cession(s) · cédé ' + U.eur(t2086.total_cessions_213, { dec: 0 })
                    + ' · bilan ' + U.eur(t2086.plus_value_globale_224, { dec: 0 })
                : 'Aucune cession en ' + annee);

        // ---- 3916
        out += UI.accordeon('Formulaire 3916 / 3916-bis',
            '<div style="font-size:12px;color:var(--txt-3);margin-bottom:8px">Tout compte ouvert, détenu, utilisé '
            + 'ou clos hors de France doit être déclaré — même sans aucune opération.</div>'
            + COMPTES_ETRANGER.map(function (c, i) {
                return '<div class="ligne"><div class="gr"><div class="tt">Compte ' + (i + 1) + '</div>'
                    + '<div class="st">' + UI.h(c) + '</div></div>'
                    + '<div class="dr">' + UI.badge('à déclarer', 'warn') + '</div></div>';
            }).join('')
            + '<div class="sep"></div>'
            + tableauCases([['8UU', 'Comptes détenus hors de France', '☑ À COCHER',
                'Un 3916 par compte, et la case 8UU sur la 2042.']])
            + '<div class="erreur" style="margin-top:10px">Défaut de déclaration : 1 500 € d’amende par compte '
            + 'et par an, ramenée à 750 € si le solde total est inférieur à 50 000 €.</div>',
            false, COMPTES_ETRANGER.length + ' compte(s) à déclarer · case 8UU');

        return out;
    }

    function bloc2074(annee, t) {
        var out = '<div style="font-size:13px;font-weight:650;margin-bottom:6px">1. Synthèse</div>'
            + ligneResultat('Ligne 905 — total des plus-values', U.eur(t.ligne_905, { dec: 0 }))
            + ligneResultat('Ligne 913 — total des moins-values', U.eur(t.ligne_913, { dec: 0 }))
            + ligneResultat('Bilan net (905 − 913)', U.eur(t.bilan_net, { dec: 0, signe: true }), true)
            + '<div class="info" style="margin-top:8px">Bilan ' + U.eur(t.bilan_net, { dec: 0 })
            + ' → case <b>' + (t.bilan_net >= 0 ? '3VG' : '3VH') + '</b> : <b>'
            + U.eur(Math.abs(t.bilan_net), { dec: 0 }) + '</b>.'
            + (t.mv_anterieures_reportables > 0
                ? ' Moins-values antérieures encore disponibles : ' + U.eur(t.mv_anterieures_reportables, { dec: 0 })
                  + ' — après imputation, la base imposable est de ' + U.eur(t.case_3vg, { dec: 0 }) + '.'
                : '') + '</div>';

        out += '<div class="sep"></div><div style="font-size:13px;font-weight:650;margin:4px 0 6px">'
            + '2. Cadre 5 — détail par titre (lignes 511 à 524)</div>';
        t.par_actif.forEach(function (a) {
            out += '<div class="card tight" style="margin-bottom:10px">'
                + '<div style="font-size:13.5px;font-weight:700;margin-bottom:6px">' + UI.h(a.actif)
                + ' <span class="dim" style="font-weight:400">— ' + a.nb_operations + ' vente(s)</span></div>'
                + ligneResultat('511 — désignation', UI.h(a.ligne_511))
                + ligneResultat('512 — date de cession', a.ligne_512)
                + ligneResultat('514 — valeur unitaire de cession', U.eur(a.ligne_514, { dec: 4 }))
                + ligneResultat('515 — nombre de titres cédés', U.quantite(a.ligne_515))
                + ligneResultat('516 / 518 — prix de cession net', U.eur(a.ligne_516, { dec: 2 }))
                + ligneResultat('520 — prix d’acquisition unitaire', U.eur(a.ligne_520, { dec: 4 }))
                + ligneResultat('521 / 523 — prix de revient', U.eur(a.ligne_521, { dec: 2 }))
                + ligneResultat('524 — résultat', U.eur(a.ligne_524, { dec: 2, signe: true }), true)
                + '</div>';
        });

        out += '<div style="font-size:13px;font-weight:650;margin:12px 0 6px">'
            + '3. GPS fiscal — cadres 11 et 12 (imputation des moins-values)</div>';
        if (t.bilan_net < 0) {
            out += '<div class="erreur">Vous êtes en <b>perte nette globale</b> cette année (' + U.eur(t.bilan_net, { dec: 0 }) + ').<br><br>'
                + '1. Laissez le <b>cadre 11</b> totalement <b>VIDE</b>.<br>'
                + '2. Allez au <b>cadre 12</b> « suivi des moins-values reportables au 31/12/' + annee + ' ».<br>'
                + '3. Sur la ligne ' + annee + ', inscrivez <b>' + U.eur(t.case_3vh, { dec: 0 }) + '</b> '
                + 'et reportez le même montant en case <b>3VH</b> de la 2042-C.</div>';
        } else if (t.bilan_net > 0 && t.ligne_913 > 0) {
            out += '<div class="ok-vert">Gain net de <b>' + U.eur(t.bilan_net, { dec: 0 }) + '</b>, mais avec '
                + U.eur(t.ligne_913, { dec: 0 }) + ' de moins-values à imputer :<br><br>'
                + '1. Laissez le bloc <b>1132</b> totalement <b>VIDE</b>.<br>'
                + '2. Remplissez le bloc <b>1133</b> avec les colonnes ci-dessous.</div>'
                + '<table class="tableau compact" style="margin-top:8px"><tr><th>Titre</th><th>A gain</th>'
                + '<th>B perte imputée</th><th>C solde</th><th>D pertes ant.</th><th>E net</th></tr>'
                + t.cadre_11.map(function (c) {
                    return '<tr><td><b>' + UI.h(c.actif) + '</b></td><td>' + U.eur(c.col_a, { dec: 0 })
                        + '</td><td>' + U.eur(c.col_b, { dec: 0 }) + '</td><td>' + U.eur(c.col_c, { dec: 0 })
                        + '</td><td>' + U.eur(c.col_d, { dec: 0 }) + '</td><td><b>' + U.eur(c.col_e, { dec: 0 })
                        + '</b></td></tr>';
                }).join('') + '</table>'
                + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:6px">Colonnes F et G (abattement pour '
                + 'durée de détention) : 0 € — les ETF, ETC et titres acquis après le 01/01/2018 n’y ouvrent pas droit.</div>';
        } else {
            out += '<div class="ok-vert">Gain net de <b>' + U.eur(t.bilan_net, { dec: 0 }) + '</b> et '
                + 'aucune moins-value cette année.<br><br>'
                + 'Dans le <b>cadre 11</b>, ne remplissez que la <b>colonne A</b> (et reportez le même montant '
                + 'en colonnes C et E). Colonnes F et G : 0 €.<br>'
                + 'Reportez <b>' + U.eur(t.case_3vg, { dec: 0 }) + '</b> en case <b>3VG</b> de la 2042-C.</div>';
        }

        out += '<div class="sep"></div><div style="font-size:13px;font-weight:650;margin:4px 0 6px">'
            + '4. Détail des ' + t.operations.length + ' ventes ' + annee + '</div>'
            + '<table class="tableau compact"><tr><th>Actif</th><th>Date</th><th>Quantité</th>'
            + '<th>PRU</th><th>Coût</th><th>Cession</th><th>PV</th></tr>'
            + t.operations.map(function (o) {
                return '<tr><td><b>' + UI.h(o.actif) + '</b></td><td>' + U.jourMoisAnneeISO(o.date) + '</td>'
                    + '<td>' + U.quantite(o.quantite) + '</td><td>' + U.eur(o.pru_unitaire_eur, { dec: 4 }) + '</td>'
                    + '<td>' + U.eur(o.acq_globale_eur, { dec: 0 }) + '</td>'
                    + '<td>' + U.eur(o.cession_globale_eur, { dec: 0 }) + '</td>'
                    + '<td class="' + (o.plus_value_eur >= 0 ? 'up' : 'down') + '">'
                    + U.eur(o.plus_value_eur, { dec: 0, signe: true }) + '</td></tr>';
            }).join('') + '</table>';

        return out;
    }

    function bloc2086(annee, t) {
        var out = '<div style="font-size:12.5px;color:var(--txt-2);margin-bottom:8px">' + t.cessions.length
            + ' cession(s) · total des prix de cession (cumul des lignes 213) : <b>'
            + U.eur(t.total_cessions_213, { dec: 0 }) + '</b> · résultat net global (cumul des lignes 224) : <b>'
            + U.eur(t.plus_value_globale_224, { dec: 0 }) + '</b>.</div>';

        if (t.exonere_305) {
            out += '<div class="ok-vert">Franchise de 305 € (CGI art. 150 VH bis) : le total de vos prix de '
                + 'cession (' + U.eur(t.total_cessions_213, { dec: 0 }) + ') ne dépasse pas le seuil. Vous êtes '
                + '<b>exonéré</b> — laissez les cases 3AN et 3BN vides, mais déposez quand même l’annexe 2086 : '
                + 'c’est elle qui prouve l’exonération.</div>';
        } else {
            out += '<div class="info">Seuil de 305 € franchi : la plus-value est imposable dès le premier euro. '
                + 'Ce seuil porte sur le <b>total des prix de cession</b> de l’année, ce n’est pas un abattement.<br>'
                + 'À reporter en case <b>' + (t.case_3an > 0 ? '3AN' : '3BN') + '</b> : <b>'
                + U.eur(t.case_3an > 0 ? t.case_3an : t.case_3bn, { dec: 0 }) + '</b>.</div>';
        }

        out += '<table class="tableau compact" style="margin-top:10px"><tr><th>Actif</th><th>Date</th>'
            + '<th>213 cession</th><th>220 coût total</th><th>221 déjà déduit</th><th>223</th>'
            + '<th>224 résultat</th></tr>'
            + t.cessions.map(function (c) {
                return '<tr><td><b>' + UI.h(c.actif) + '</b></td><td>' + U.jourMoisAnneeISO(c.date) + '</td>'
                    + '<td>' + U.eur(c.ligne_213, { dec: 0 }) + '</td><td>' + U.eur(c.ligne_220, { dec: 0 }) + '</td>'
                    + '<td>' + U.eur(c.ligne_221, { dec: 0 }) + '</td><td>' + U.eur(c.ligne_223, { dec: 0 }) + '</td>'
                    + '<td class="' + (c.ligne_224 >= 0 ? 'up' : 'down') + '">'
                    + U.eur(c.ligne_224, { dec: 0, signe: true }) + '</td></tr>';
            }).join('') + '</table>';

        out += '<div style="font-size:11.5px;color:var(--txt-3);margin-top:8px">La ligne 221 retrace les fractions '
            + 'de capital déjà déduites lors des cessions précédentes : sans elle, le même capital serait déduit '
            + 'deux fois. Chaque 224 s’obtient par 213 − (223 × 213 / valeur globale du portefeuille d’actifs '
            + 'numériques au jour de la cession).</div>';

        return out;
    }

    // ------------------------------------------- 3. arbitrage, bilan et source

    function bilanImpot(annee, sim, t2074, t2086) {
        var out = '';

        // --- Arbitrage PFU / barème
        if (sim.arbitrage) {
            var a = sim.arbitrage;
            out += '<div class="card">'
                + '<div class="lbl">Flat tax (PFU) ou barème progressif ?</div>'
                + '<div style="display:flex;gap:10px;margin-top:6px">'
                + '<div style="flex:1;background:rgba(255,255,255,.04);border-radius:12px;padding:10px">'
                + '<div style="font-size:11px;color:var(--txt-3);text-transform:uppercase;letter-spacing:.06em">Flat tax</div>'
                + ligneResultat('IR ' + U.nombre(IR_FORFAITAIRE * 100, 1) + ' %', U.eur(a.pfu.ir, { dec: 0 }))
                + ligneResultat('Prélèvements sociaux ' + U.nombre(tauxPS(annee) * 100, 1) + ' %', U.eur(a.pfu.ps, { dec: 0 }))
                + ligneResultat('Total', U.eur(a.pfu.total, { dec: 0 }), true)
                + '</div>'
                + '<div style="flex:1;background:rgba(255,255,255,.04);border-radius:12px;padding:10px">'
                + '<div style="font-size:11px;color:var(--txt-3);text-transform:uppercase;letter-spacing:.06em">Barème</div>'
                + ligneResultat('Supplément d’IR', U.eur(a.bareme.ir_marginal, { dec: 0 }))
                + ligneResultat('Prélèvements sociaux ' + U.nombre(tauxPS(annee) * 100, 1) + ' %', U.eur(a.bareme.ps, { dec: 0 }))
                + ligneResultat('Total', U.eur(a.bareme.total, { dec: 0 }), true)
                + '</div></div>'
                + '<div class="' + (sim.cocher_2op ? 'info' : 'ok-vert') + '" style="margin-top:10px">'
                + 'Le plus favorable : <b>' + UI.h(a.choix) + '</b> — écart ' + U.eur(a.gain, { dec: 0 }) + '. '
                + (sim.cocher_2op
                    ? 'Cochez la case <b>2OP</b> : l’option est globale et court jusqu’à révocation.'
                    : 'Laissez la case <b>2OP</b> vide.')
                + (a.bareme.csg_deductible > 0
                    ? ' Le barème déduit ' + U.eur(a.bareme.csg_deductible, { dec: 0 }) + ' de CSG déductible : '
                      + 'c’est ce qui, parfois, le rend gagnant.' : '')
                + '</div>'
                + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:6px">Assiette soumise à l’option : '
                + U.eur(a.plus_value_nette, { dec: 0 }) + ' — plus-values mobilières et intérêts étrangers réunis.</div>'
                + '</div>';
        } else {
            out += '<div class="card"><div class="lbl">Flat tax (PFU) ou barème progressif ?</div>'
                + '<div class="info" style="margin-top:6px">Aucune plus-value ni intérêt imposable cette année : '
                + 'l’arbitrage ne se pose pas.</div></div>';
        }

        // --- Bilan de l'impôt du foyer
        out += '<div class="card"><div class="lbl">Bilan de votre impôt sur le revenu ' + annee + '</div>'
            + ligneResultat('Impôt sur vos salaires', U.eur(sim.ir_salaires.impot_net, { dec: 0 }))
            + ligneResultat('Impôt + PS sur vos revenus du capital', U.eur(sim.impot_capital_retenu, { dec: 0 }))
            + ligneResultat('Impôt total du foyer', U.eur(sim.impot_total_foyer, { dec: 0 }), true)
            + ligneResultat('Taux marginal (TMI)', U.pct(sim.ir_salaires.tmi, 0))
            + ligneResultat('Revenu net imposable (salaires)', U.eur(sim.revenu_net_imposable_salaires, { dec: 0 }))
            + '</div>';

        // --- Prélèvement à la source
        var pas = '<div class="card"><div class="lbl">Taux de prélèvement à la source</div>'
            + ligneResultat('Taux du foyer (non personnalisé)', U.pct(sim.taux_pas_foyer, 2), true);
        if (sim.couple && sim.taux_pas_2 > 0) {
            pas += ligneResultat('Taux individualisé — déclarant 1', U.pct(sim.taux_pas_1, 2))
                + ligneResultat('Taux individualisé — déclarant 2', U.pct(sim.taux_pas_2, 2))
                + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:6px">Individualisation (CGI art. 204 M) '
                + 'calculée comme l’administration : le conjoint aux revenus les plus faibles est imposé en '
                + 'célibataire sur la moitié des parts, l’autre supporte le solde. La somme des deux égale '
                + 'exactement l’impôt du foyer.</div>';
        } else {
            pas += '<div style="font-size:11.5px;color:var(--txt-3);margin-top:6px">Taux appliqué à vos revenus '
                + 'salariaux. Il ne tient pas compte des revenus du capital, soumis au prélèvement forfaitaire.</div>';
        }
        pas += '</div>';

        return out + pas;
    }

    function blocFraisReels(n, f, annee, r) {
        var caseNom = n === 1 ? '1AK' : '1BK';
        var out = '<div class="sep"></div>'
            + '<div style="font-size:13px;font-weight:650;margin-bottom:6px">Déclarant ' + n
            + ' — frais professionnels (' + U.eur(f.abattement, { dec: 0 }) + ' d’abattement 10 %)</div>'
            + ligneReglage('Opter pour les frais réels', f.utilise ? 'Oui' : 'Non', 'utiliserFraisReels' + n);
        if (f.utilise) {
            out += ligneReglage('Kilomètres annuels', U.nombre(U.num(r['fraisKm' + n], 0), 0), 'fraisKm' + n)
                + ligneReglage('Puissance fiscale', U.num(r['cvFiscal' + n], 5) + ' CV', 'cvFiscal' + n)
                + ligneReglage('Jours de repas hors domicile', U.nombre(U.num(r['joursRepas' + n], 0), 0), 'joursRepas' + n)
                + ligneReglage('Véhicule 100 % électrique (+20 %)',
                    U.estVrai(r['vehiculeElectrique' + n]) ? 'Oui' : 'Non', 'vehiculeElectrique' + n);
        }
        out += '<div class="' + (f.retenir ? 'ok-vert' : 'info') + '" style="margin-top:8px">'
            + (f.retenir
                ? '<b>Case ' + caseNom + ' : inscrivez ' + U.eur(f.caseValeur, { dec: 0 }) + '</b><br>'
                    + UI.h('Frais kilométriques (' + U.num(r['cvFiscal' + n], 5) + ' CV) : ' + f.km.formule)
                    + '<br>' + UI.h(f.repas.formule) + '<br>'
                    + 'Total <b>' + U.eur(f.total, { dec: 0 }) + '</b> contre ' + U.eur(f.abattement, { dec: 0 })
                    + ' d’abattement 10 % : <b>' + U.eur(f.gain, { dec: 0 }) + '</b> de déduction supplémentaire.'
                : 'Abattement de 10 % retenu (' + U.eur(f.abattement, { dec: 0 }) + ') contre '
                    + U.eur(f.total, { dec: 0 }) + ' de frais réels : <b>laissez la case ' + caseNom + ' vide</b>.')
            + '</div>';
        return out;
    }

    function ligneResultat(label, valeur, fort) {
        return '<div class="ligne" style="padding:7px 0"><div class="gr"><div class="st">' + UI.h(label) + '</div></div>'
            + '<div class="dr"><div class="a"' + (fort ? ' style="font-size:17px;color:var(--gold)"' : '') + '>'
            + UI.h(valeur) + '</div></div></div>';
    }

    function ligneReglage(label, valeur, cle) {
        return '<div class="ligne" data-reglage="' + UI.h(cle) + '"><div class="gr"><div class="tt">' + UI.h(label) + '</div></div>'
            + '<div class="dr"><div class="a">' + UI.h(valeur) + '</div><div class="b">modifier</div></div></div>';
    }

    // -------------------------------------------------------------- événements

    function attacher() {
        var vue = document.getElementById('view');
        if (!vue || vue.dataset.fiscal === '1') return;
        vue.dataset.fiscal = '1';
        vue.addEventListener('click', function (e) {
            var cible = e.target.closest ? e.target : null;
            if (!cible) return;
            var anneeBtn = cible.closest('[data-fisc="annee"]');
            if (anneeBtn) { anneeFiscale = Number(anneeBtn.getAttribute('data-valeur')); PF.app.rendre(); return; }
            var lien = cible.closest('[data-fisc="ouvrir-lien"]');
            if (lien) {
                if (typeof root.Native !== 'undefined' && root.Native.openExternal) root.Native.openExternal(URL_MAJ_BAREMES);
                return;
            }
            var promptBtn = cible.closest('[data-fisc="prompt"]');
            if (promptBtn) {
                UI.feuille({
                    titre: 'Prompt de mise à jour des barèmes',
                    aide: 'À envoyer à l’assistant Arena : il régénère core/fiscal_bars.py avec les sources citées.',
                    corps: '<textarea id="fiscPrompt" rows="10" style="width:100%;background:rgba(255,255,255,.05);'
                        + 'border:1px solid var(--line);border-radius:13px;color:var(--txt);font-size:12.5px;padding:12px;font-family:monospace">'
                        + UI.h(PROMPT_MAJ.replace('{ANNEE}', String(derniereAnnee() + 1))) + '</textarea>',
                    boutons: [
                        { texte: 'Copier', sorte: '', garder: true, action: function () { copier('fiscPrompt'); } },
                        { texte: 'Ouvrir l’assistant', sorte: 'sec', action: function () {
                            if (typeof root.Native !== 'undefined' && root.Native.openExternal) root.Native.openExternal(URL_MAJ_BAREMES);
                        } },
                        { texte: 'Fermer', sorte: 'ghost' }
                    ]
                });
            }
        });
    }

    function copier(id) {
        var z = document.getElementById(id);
        if (!z) return;
        z.select();
        try {
            document.execCommand('copy');
            UI.toast('Prompt copié');
        } catch (e) {
            UI.toast('Copie impossible');
        }
    }

    PF.fiscal = {
        BAREMES: BAREMES, PS_PAR_ANNEE: PS_PAR_ANNEE, IR_FORFAITAIRE: IR_FORFAITAIRE,
        CSG_DEDUCTIBLE: CSG_DEDUCTIBLE, CRYPTO_FRANCHISE_CESSIONS: CRYPTO_FRANCHISE_CESSIONS,
        OR_PHYS_TFMP: OR_PHYS_TFMP, OR_PHYS_PV_IR: OR_PHYS_PV_IR, OR_PHYS_PV_PS: OR_PHYS_PV_PS,
        annees: annees, derniereAnnee: derniereAnnee, baremeDe: baremeDe, tauxPS: tauxPS, tauxPFU: tauxPFU,
        impotRevenu: impotRevenu, abattement10: abattement10, fraisKilometriques: fraisKilometriques,
        fraisRepas: fraisRepas, forfaitRepas: forfaitRepas, fraisReelsDeclarant: fraisReelsDeclarant,
        appliquerConfig: appliquerConfig,
        comparerPfuBareme: comparerPfuBareme, tauxPAS: tauxPAS, verifierMaj: verifierMaj,
        cessionsAnnee: cessionsAnnee, bilanCessions: bilanCessions,
        detail2074: detail2074, detail2086: detail2086, simulerFoyer: simulerFoyer,
        PROMPT_MAJ: PROMPT_MAJ, URL_MAJ_BAREMES: URL_MAJ_BAREMES,
        vue: vue, attacher: attacher
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
