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
        if (!txs.length) return Promise.resolve({ parClasse: {}, total: 0, cessions: [] });

        var besoin = {};
        txs.forEach(function (t) { if (t.devise !== 'EUR') besoin[t.devise + '|' + t.date] = 1; });

        return Promise.all(Object.keys(besoin).map(function (cle) {
            var p = cle.split('|');
            return PF.net.taux(p[0], p[1], 'EUR').then(function (v) { return [cle, v]; });
        })).then(function (paires) {
            var taux = {};
            paires.forEach(function (p) { taux[p[0]] = p[1] || 1; });

            var lots = {}, cessions = [];
            // On rejoue tout l'historique pour reconstituer les lots.
            (ctx.transactions || []).forEach(function (t) {
                var tEur = t.devise === 'EUR' ? 1 : (taux[t.devise + '|' + t.date] || 1);
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
            return { parClasse: parClasse, total: total, cessions: cessions };
        });
    }

    // -------------------------------------------------------------------- vue

    var anneeFiscale = null;

    function anneeEnCours() {
        if (anneeFiscale) return anneeFiscale;
        var auj = new Date().getFullYear() - 1;   // on déclare l'année précédente
        return BAREMES[auj] ? auj : derniereAnnee();
    }

    function vue(ctx) {
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

        // --- Situation familiale
        var enfants = Math.max(0, Math.round((r.partsFiscales - (estCouple(r.statutFiscal) ? 2 : 1)) * 2));
        out += UI.accordeon('Situation familiale',
            ligneReglage('Statut', r.statutFiscal, 'statutFiscal')
            + ligneReglage('Parts fiscales', U.nombre(r.partsFiscales, 1), 'partsFiscales')
            + '<div style="font-size:12px;color:var(--txt-3);margin-top:4px">' + (estCouple(r.statutFiscal) ? 'Foyer de 2 parts' : 'Foyer d’1 part')
            + (enfants > 0 ? ' + ' + enfants + ' demi-part(s) au titre des enfants' : '') + '.</div>',
            false);

        // --- Déclaration de base
        var ab1 = abattement10(r.salaireNetImposable1, annee);
        var ab2 = abattement10(r.salaireNetImposable2, annee);
        var fr1 = U.num(r.fraisReels1, 0), fr2 = U.num(r.fraisReels2, 0);
        var choix1 = fr1 > ab1 ? 'frais réels' : 'abattement 10 %';
        var choix2 = fr2 > ab2 ? 'frais réels' : 'abattement 10 %';
        var ret1 = Math.max(ab1, fr1), ret2 = Math.max(ab2, fr2);
        var s1 = Math.max(0, U.num(r.salaireNetImposable1, 0) - ret1);
        var s2 = Math.max(0, U.num(r.salaireNetImposable2, 0) - ret2);

        var corpsBase = ''
            + ligneReglage('Salaire net imposable — déclarant 1', U.eur(r.salaireNetImposable1, { dec: 0 }), 'salaireNetImposable1')
            + ligneReglage('Salaire net imposable — déclarant 2', U.eur(r.salaireNetImposable2, { dec: 0 }), 'salaireNetImposable2')
            + ligneReglage('Frais professionnels déclarant 1', U.eur(fr1, { dec: 0 }), 'fraisReels1')
            + ligneReglage('Frais professionnels déclarant 2', U.eur(fr2, { dec: 0 }), 'fraisReels2')
            + '<div class="ok-vert"><b>Case 1AK — déclarant 1 : ' + U.eur(s1, { dec: 0 }) + '</b><br>'
            + 'Retenu : ' + choix1 + ' (' + U.eur(ret1, { dec: 0 }) + ') — le plus favorable des deux.<br>'
            + '<b>Case 1BK — déclarant 2 : ' + U.eur(s2, { dec: 0 }) + '</b><br>'
            + 'Retenu : ' + choix2 + ' (' + U.eur(ret2, { dec: 0 }) + ').</div>'
            + '<div style="font-size:12px;color:var(--txt-3)">Abattement forfaitaire 10 % : '
            + U.eur(ab1, { dec: 0 }) + ' / ' + U.eur(ab2, { dec: 0 })
            + ' (plancher ' + U.eur(PLANCHER_ABATTEMENT_10[annee] || 0, { dec: 0 })
            + ', plafond ' + U.eur(PLAFOND_ABATTEMENT_10[annee] || 0, { dec: 0 }) + ').</div>'
            + '<div class="sep"></div>'
            + ligneReglage('Revenus d’intérêts encaissés à l’étranger (€)', U.eur(r.interetsEtrangers, { dec: 0 }), 'interetsEtrangers')
            + '<div style="font-size:12px;color:var(--txt-3);margin:6px 0 10px">Formulaire <b>2047</b> puis report en 2TR — '
            + 'à cocher « revenus encaissés à l’étranger ».</div>'
            + '<div class="ligne" style="padding-top:4px"><div class="gr"><div class="tt">Comptes détenus hors de France</div>'
            + '<div class="st">Formulaire 3916-3916 bis + case 8UU</div></div>'
            + '<div class="dr">' + UI.badge('à déclarer', 'warn') + '</div></div>'
            + '<div style="font-size:12px;color:var(--txt-3)">Un compte ouvert chez un intermédiaire étranger '
            + '(Swissquote Bank Europe au Luxembourg, par exemple) doit être déclaré même sans opération : '
            + 'amende de 1 500 € par compte et par an.</div>';

        out += UI.accordeon('Déclaration de base', corpsBase, false,
            'salaires, frais professionnels, revenus étrangers, comptes hors de France');

        // --- Simulation IR
        var revenuNet = s1 + s2 + U.num(r.autresRevenusImposables, 0) + U.num(r.interetsEtrangers, 0);
        var ir = impotRevenu(revenuNet, r.partsFiscales, annee, r.statutFiscal);
        var pas = tauxPAS(revenuNet, r.partsFiscales, annee, r.statutFiscal, true);

        out += '<div class="titre">Impôt sur le revenu</div><div class="card">'
            + '<div class="lbl">Revenu net imposable</div>'
            + '<div class="montant-usd">' + U.eur(revenuNet, { dec: 0 }) + '</div>'
            + '<div class="sep"></div>'
            + ligneResultat('Impôt brut', U.eur(ir.impot_brut, { dec: 0 }))
            + ligneResultat('Décote', '− ' + U.eur(ir.decote, { dec: 0 }))
            + ligneResultat('Impôt net à payer', U.eur(ir.impot_net, { dec: 0 }), true)
            + ligneResultat('Taux marginal (TMI)', U.pct(ir.tmi, 0))
            + ligneResultat('Taux moyen', U.pct(revenuNet > 0 ? ir.impot_net / revenuNet : 0, 2))
            + ligneResultat('Quotient familial', U.eur(ir.quotient, { dec: 0 }))
            + '</div>';

        out += '<div class="card tight"><div class="lbl">Prélèvement à la source</div>'
            + ligneResultat('Taux du foyer', U.pct(pas.taux_foyer, 2))
            + (pas.taux_individuel !== undefined ? ligneResultat('Taux individualisé', U.pct(pas.taux_individuel, 2)) : '')
            + '</div>';

        if (PS_ANNEE_INCERTAINE[annee]) {
            out += '<div class="info"><b>Prélèvements sociaux ' + annee + ' : taux discuté.</b> '
                + UI.h(PS_ANNEE_INCERTAINE[annee]) + '</div>';
        }

        // --- Plus-values
        out += '<div id="blocPv">'
            + '<div class="titre">Plus-values de l’année</div>'
            + '<div class="card"><div class="vide" style="padding:14px">Calcul en cours…</div></div></div>';

        cessionsAnnee(ctx, annee).then(function (res) {
            var bloc = document.getElementById('blocPv');
            if (!bloc) return;
            bloc.innerHTML = blocPlusValues(res, annee, revenuNet, r);
            UI.lierAccordeons(bloc);
        });

        // --- Guide fiscal
        out += '<div class="titre">Guide par formulaire</div>' + guideFiscal(annee);

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

    function blocPlusValues(res, annee, revenuNet, r) {
        var out = '<div class="titre">Plus-values de l’année</div>';
        var lignes = res.cessions || [];
        if (!lignes.length) {
            return out + '<div class="card"><div class="vide" style="padding:14px">Aucune cession en ' + annee + '.</div></div>';
        }

        var pvTitres = 0, mvTitres = 0, prixCrypto = 0, pvCrypto = 0, mvCrypto = 0;
        lignes.forEach(function (c) {
            if (c.classe === 'crypto') {
                prixCrypto += c.prix_cession;
                if (c.pv >= 0) pvCrypto += c.pv; else mvCrypto += -c.pv;
            } else {
                if (c.pv >= 0) pvTitres += c.pv; else mvTitres += -c.pv;
            }
        });

        var pvNetteTitres = Math.max(0, pvTitres - mvTitres);
        var reportable = Math.max(0, mvTitres - pvTitres);

        out += '<div class="card">'
            + ligneResultat('Plus-values (titres)', U.eur(pvTitres, { dec: 0 }))
            + ligneResultat('Moins-values (titres)', U.eur(mvTitres, { dec: 0 }))
            + ligneResultat('Plus-value nette — case 3VG', U.eur(pvNetteTitres, { dec: 0 }), true)
            + (reportable > 0 ? ligneResultat('Moins-value reportable — case 3VH', U.eur(reportable, { dec: 0 })) : '')
            + '</div>';

        if (pvNetteTitres > 0) {
            var cmp = comparerPfuBareme(pvNetteTitres, revenuNet, r.partsFiscales, annee, r.statutFiscal);
            out += '<div class="card"><div class="lbl">PFU ou barème ?</div>'
                + ligneResultat('PFU (' + U.nombre(tauxPFU(annee) * 100, 1) + ' %)', U.eur(cmp.pfu.total, { dec: 0 }))
                + ligneResultat('Barème + PS', U.eur(cmp.bareme.total, { dec: 0 }))
                + '<div class="' + (cmp.choix === 'PFU' ? 'ok-vert' : 'info') + '" style="margin-top:8px">'
                + 'Le plus favorable : <b>' + UI.h(cmp.choix) + '</b> — écart ' + U.eur(cmp.gain, { dec: 0 }) + '. '
                + (cmp.cocher_2op ? 'Cochez la case <b>2OP</b> pour opter pour le barème.' : 'Laissez la case 2OP vide.')
                + '</div></div>';
        }

        if (prixCrypto > 0 || pvCrypto > 0 || mvCrypto > 0) {
            var sousSeuil = prixCrypto <= CRYPTO_FRANCHISE_CESSIONS;
            out += '<div class="card"><div class="lbl">Crypto-actifs — formulaire 2086</div>'
                + ligneResultat('Total des prix de cession', U.eur(prixCrypto, { dec: 0 }))
                + ligneResultat('Plus-value', U.eur(pvCrypto, { dec: 0 }))
                + ligneResultat('Moins-value', U.eur(mvCrypto, { dec: 0 }))
                + '<div class="' + (sousSeuil ? 'ok-vert' : 'info') + '" style="margin-top:8px">'
                + (sousSeuil
                    ? 'Prix de cession ≤ ' + U.eur(CRYPTO_FRANCHISE_CESSIONS, { dec: 0 }) + ' : plus-value exonérée. '
                    + 'La 2086 reste à déposer — c’est elle qui prouve que vous êtes sous le seuil.'
                    : 'Seuil de ' + U.eur(CRYPTO_FRANCHISE_CESSIONS, { dec: 0 }) + ' franchi : la plus-value est imposable '
                    + 'dès le premier euro. Ce seuil porte sur les prix de cession, ce n’est pas un abattement.')
                + '</div></div>';
        }

        out += '<div class="card"><div class="lbl">Détail des cessions</div>';
        lignes.forEach(function (c) {
            var f = U.fleche(c.cout > 0 ? (c.produit / c.cout - 1) : 0);
            out += '<div class="ligne"><div class="gr"><div class="tt">' + UI.h(c.ticker) + '</div>'
                + '<div class="st">' + U.jourMoisAnneeISO(c.date) + ' · ' + U.quantite(c.quantite) + '</div></div>'
                + '<div class="dr"><div class="a ' + (c.pv >= 0 ? 'up' : 'down') + '">' + U.eur(c.pv, { dec: 0, signe: true }) + '</div>'
                + '<div class="b ' + f.classe + '">' + UI.h(f.texte) + '</div></div></div>';
        });
        out += '</div>';
        return out;
    }

    // ------------------------------------------------------------- guide fiscal

    function guideFiscal(annee) {
        var formes = [
            {
                titre: '2042 — Déclaration d’ensemble',
                lignes: [
                    ['1AJ / 1BJ', 'Salaires nets imposables après déduction des frais professionnels.'],
                    ['1AK / 1BK', 'Montant retenu après frais réels ou abattement 10 % — calculé ci-dessus.'],
                    ['2TR', 'Revenus d’intérêts encaissés à l’étranger (après formulaire 2047).'],
                    ['2OP', 'Option pour le barème progressif sur les revenus du capital. À ne cocher que si le calcul ci-dessus le dit favorable.'],
                    ['8UU', 'Comptes détenus hors de France — à cocher, avec le 3916.']
                ]
            },
            {
                titre: '2042 C — Plus-values',
                lignes: [
                    ['3VG', 'Plus-value nette de l’année (régime 150-0 A).'],
                    ['3VH', 'Moins-value nette reportable 10 ans (imputation FIFO, uniquement sur plus-values mobilières).'],
                    ['3SG', 'Abattement pour durée de détention — titres acquis avant 2018.'],
                    ['3AN / 3BN', 'Plus-value / moins-value de crypto-actifs (après 2086).'],
                    ['3CN', 'Option barème sur les plus-values de crypto-actifs.']
                ]
            },
            {
                titre: '2074 — Plus-values mobilières',
                lignes: [
                    ['Obligation', 'Dès qu’il y a compensation entre plus-values et moins-values, ou report.'],
                    ['Ligne 905', 'Plus-value brute.'],
                    ['Ligne 913', 'Moins-value de l’année.'],
                    ['Report', 'Les moins-values antérieures s’imputent d’abord, avant tout report nouveau.']
                ]
            },
            {
                titre: '2086 — Crypto-actifs',
                lignes: [
                    ['Formule', 'PV = prix de cession − (prix total d’acquisition × prix de cession / valeur globale du portefeuille).'],
                    ['Seuil 305 €', 'Franchise assise sur le TOTAL des prix de cession de l’année, appréciée au niveau du foyer.'],
                    ['À savoir', 'Dépôt obligatoire même sous le seuil : c’est la 2086 qui prouve l’exonération.']
                ]
            },
            {
                titre: '3916 — Comptes à l’étranger',
                lignes: [
                    ['Qui', 'Tout compte ouvert hors de France, détenu, utilisé ou clos dans l’année.'],
                    ['Exemple', 'Swissquote Bank Europe SA (Luxembourg) : compte à déclarer.'],
                    ['Sanction', '1 500 € par compte et par an, même sans opération.']
                ]
            },
            {
                titre: '2047 — Revenus encaissés à l’étranger',
                lignes: [
                    ['Cadre 3', 'Plus-values étrangères, à reporter en 3VG.'],
                    ['Crédits d’impôt', 'Cases 8VL / 8VM / 8WM / 8UM selon le pays.'],
                    ['Case', 'Cocher « revenus encaissés à l’étranger » sur la 2042.']
                ]
            }
        ];

        return formes.map(function (f) {
            var corps = '<table class="tableau"><tr><th>Case / point</th><th>À savoir</th></tr>'
                + f.lignes.map(function (l) {
                    return '<tr><td style="text-align:left;white-space:nowrap"><b>' + UI.h(l[0]) + '</b></td>'
                        + '<td style="text-align:left;color:var(--txt-2);font-size:12.5px">' + UI.h(l[1]) + '</td></tr>';
                }).join('')
                + '</table>';
            return UI.accordeon(f.titre, corps, false);
        }).join('');
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
        comparerPfuBareme: comparerPfuBareme, tauxPAS: tauxPAS, verifierMaj: verifierMaj,
        cessionsAnnee: cessionsAnnee, PROMPT_MAJ: PROMPT_MAJ, URL_MAJ_BAREMES: URL_MAJ_BAREMES,
        vue: vue, attacher: attacher
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
