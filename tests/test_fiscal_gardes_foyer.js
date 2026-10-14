/* Garde-fous du FOYER : CSG 6DE sans double compte, portée réelle de l'annexe
   2086 et cas particuliers du quotient familial. Aucun montant personnel n'est
   déduit de la seule lecture des brochures DGFiP. Hors réseau. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ctx = vm.createContext({ Number, Object, String, JSON, Math, Array, Error, RegExp });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/js/fiscal_gardes_foyer.js'), 'utf8'), ctx);
const G = ctx.PF.fiscalGardesFoyer;

// ---------------------------------------------------------------- CSG / 6DE
// Sans montant personnel saisi : « non disponible », jamais un calcul issu des
// brochures.
const rien = G.csgDeductible6DE({ annee: 2025 });
assert.equal(rien.etat, 'non disponible');
assert.equal(rien.disponible, false);
assert.equal(rien.montant6DE, null);
assert.match(rien.blocages[0], /lecture des brochures/);
assert.equal(rien.regles.length, 5);
assert.ok(rien.regles.some(r => /2BH\/2DF/.test(r) && /ne pas ajouter en 6DE/.test(r)));
assert.ok(rien.regles.some(r => /patrimoine 2024 payée en 2025/.test(r)), 'calendrier N-1 payé en N');
assert.ok(rien.regles.some(r => /avis 2026/.test(r)), 'gains 2025 acquittés sur l’avis 2026');
assert.equal(G.csgDeductible6DE({}).etat, 'non disponible');
assert.match(G.csgDeductible6DE({}).blocages[0], /année des revenus absente/);

// CSG sur revenus du patrimoine 2024 payée en 2025 : déductible du revenu 2025.
const patrimoine = G.csgDeductible6DE({ annee: 2025, csgPatrimoinePayee: 320 });
assert.equal(patrimoine.disponible, true);
assert.equal(patrimoine.montant6DE, 320);
assert.equal(patrimoine.partAuto2BH2DF, null);
assert.match(patrimoine.origine, /montants personnels saisis/);

// 2BH sans option 2OP du foyer : avertissement, pas de déduction 2BH.
const bh = G.csgDeductible6DE({ annee: 2025, lignes2BH: 1000 });
assert.equal(bh.disponible, true);
assert.equal(bh.partAuto2BH2DF, 68);
assert.equal(bh.montant6DE, 0, 'sans 2OP, la ligne 2BH n’ouvre pas droit à déduction');
assert.match(bh.avertissements[0], /option globale 2OP/);
const bh2op = G.csgDeductible6DE({ annee: 2025, lignes2BH: 1000, impositionAuBareme: true });
assert.equal(bh2op.montant6DE, 0, 'la part 2BH est calculée automatiquement, jamais saisie en 6DE');
assert.equal(bh2op.partAuto2BH2DF, 68);
assert.equal(bh2op.csgDeductibleTotale, 68);
// 2DF : déduction possible même sans 2OP, selon le produit.
const df = G.csgDeductible6DE({ annee: 2025, lignes2DF: 500 });
assert.equal(df.montant6DE, 0);
assert.equal(df.partAuto2BH2DF, 34, '2DF : part automatique, déduction indépendante de 2OP');
assert.equal(df.csgDeductibleTotale, 34);

// DOUBLE COMPTE : un 6DE qui reprend la part 2BH/2DF calculée automatiquement.
const double1 = G.csgDeductible6DE({ annee: 2025, lignes2BH: 1000, lignes2DF: 500,
    impositionAuBareme: true, montant6DE: 102 });
assert.equal(double1.doubleCompte, true);
assert.equal(double1.disponible, false);
assert.equal(double1.montant6DE, null);
assert.match(double1.blocages[0], /comptée deux fois/);
assert.equal(double1.montant6DEDu, 0);
const double2 = G.csgDeductible6DE({ annee: 2025, lignes2BH: 1000, csgPatrimoinePayee: 320,
    impositionAuBareme: true, montant6DE: 388 });
assert.equal(double2.doubleCompte, true, 'patrimoine + part automatique cumulés');
assert.match(double2.blocages[0], /comptée deux fois/);
assert.equal(double2.montant6DEDu, 320);
// Le même foyer, sans reporter la part automatique : pas de double compte.
const sain = G.csgDeductible6DE({ annee: 2025, lignes2BH: 1000, csgPatrimoinePayee: 320,
    impositionAuBareme: true, montant6DE: 320 });
assert.equal(sain.doubleCompte, false);
assert.equal(sain.disponible, true);
assert.equal(sain.montant6DE, 320, 'seule la CSG patrimoine payée en 2025 va en 6DE');
assert.equal(sain.csgDeductibleTotale, 388, '320 € + 68 € automatiques sur 2BH');
assert.ok(!G.csgDeductible6DE({ annee: 2025, lignes2BH: 1000, impositionAuBareme: true,
    csgAuto2BH2DF: 68 }).avertissements.some(a => /diffère/.test(a)), 'montant automatique concordant');
assert.match(G.csgDeductible6DE({ annee: 2025, lignes2BH: 1000, impositionAuBareme: true,
    csgAuto2BH2CF: 0, csgAuto2BH2DF: 90 }).avertissements.join(' '), /diffère de 6,8 %/,
'un montant automatique divergent est signalé, jamais recalculé de force');
assert.equal(G.csgDeductible6DE({ annee: 2025, lignes2BH: 1000, impositionAuBareme: true }).tauxCsgDeductible, .068);

// ------------------------------------------------------------------- 2086
function portee(total, opts) {
    return G.portee2086Foyer(Object.assign({ annee: 2025, totalPrixCessionPortefeuille: total,
        operationsPortefeuille: 3, seuilOfficiel: 305 }, opts || {}));
}
assert.equal(portee(1000).certifieFoyer, false, 'jamais certifié par l’application');
assert.equal(portee(1000).reportable, false, 'complétude du foyer non attestée');
assert.match(portee(1000).etat, /portefeuille seul/);
assert.equal(portee(1000).exonereFoyer, false, 'le seul portefeuille dépasse le seuil : exonération exclue');
assert.match(portee(1000).seuilApplicable, /exonération exclue/);
assert.equal(portee(200).exonereFoyer, null, 'sous le seuil : l’exonération du foyer n’est pas prouvée');
assert.match(portee(200).avertissements[0], /ne prouve pas que le foyer reste sous 305/);
assert.equal(portee(200, { attestationFoyerComplet: true }).reportable, true);
assert.equal(portee(200, { attestationFoyerComplet: true }).certifieFoyer, false,
    'une attestation ne certifie pas : elle rend le report possible sous la responsabilité du foyer');
assert.match(portee(200, { attestationFoyerComplet: true }).etat, /attestée par le propriétaire/);
assert.equal(portee(200).options.troisCN.includes('indépendante de 2OP'), true);
assert.equal(portee(200).options.deuxOP.includes('distincte de 3CN'), true);
assert.equal(portee(200).options.jamaisConfondues, true);
assert.ok(portee(200).exclusions.some(e => /autres portefeuilles/.test(e)));
assert.equal(G.portee2086Foyer({}).etat, 'non disponible');
assert.equal(G.portee2086Foyer({ annee: 2025 }).etat, 'non disponible');
assert.match(G.portee2086Foyer({ annee: 2025 }).blocages[0], /total des prix de cession/);
assert.match(portee(1000).limite, /cases 3AN\/3BN sont celles du FOYER/);

// ---------------------------------------------------------------------- QF
const qfSimple = G.casParticuliersQF({ parts: 1, statut: 'Célibataire', enfants: 0 });
assert.equal(qfSimple.certifie, true);
assert.equal(qfSimple.blocages.length, 0);
assert.equal(qfSimple.plafondsSpeciauxModelises, false);
assert.equal(G.casParticuliersQF({ parts: 2, statut: 'Marié(e) / Pacsé(e)', enfants: 0 }).certifie, true);
assert.equal(G.casParticuliersQF({ parts: 4, statut: 'Marié(e) / Pacsé(e)', enfants: 3 }).certifie, true,
    '2 + 0,5 + 0,5 + 1 = 4 parts : règle générale');
const isole = G.casParticuliersQF({ parts: 1.5, statut: 'Célibataire', enfants: 1, parentIsole: true });
assert.equal(isole.certifie, false);
assert.match(isole.blocages[0], /parentIsole/);
assert.match(isole.blocages[0], /2OP non certifiés/);
const invalide = G.casParticuliersQF({ parts: 1.5, statut: 'Célibataire', enfants: 0, invalidite: true });
assert.equal(invalide.certifie, false);
const demiPart = G.casParticuliersQF({ parts: 2.5, statut: 'Célibataire', enfants: 1 });
assert.equal(demiPart.certifie, false, 'demi-part non expliquée par la règle générale');
assert.match(demiPart.blocages[0], /plafond QF particulier non modélisé/);
assert.match(demiPart.avertissements[0], /règle générale \(1,5\)/);
assert.equal(G.casParticuliersQF({ parts: 1, statut: 'Célibataire' }).avertissements.length, 0);
assert.match(G.casParticuliersQF({ statut: 'Célibataire', enfants: 1 }).avertissements[0], /parts absent/);
assert.equal(G.casParticuliersQF({ parts: 3, statut: 'Marié(e) / Pacsé(e)', enfants: 2,
    residenceAlternee: true }).certifie, false);

// ------------------------------------------------- séparation public / personnel
const perim = G.perimetreDonnees({ salaires: { source: 'saisie_proprietaire' },
    bareme: { source: 'collecte_publique' } });
assert.equal(perim.conforme, true);
assert.ok(perim.publiques.includes('bareme') && perim.personnelles.includes('taux_pas'));
assert.ok(perim.personnelles.includes('montants_2BH_2DF_6DE'));
const melange = G.perimetreDonnees({ taux_pas: { source: 'collecte_publique' } });
assert.equal(melange.conforme, false);
assert.equal(melange.melangeInterdit.join(','), 'taux_pas');
assert.match(melange.regle, /hors des caches publics/);
assert.equal(G.perimetreDonnees().conforme, true);

console.log('Garde-fous du foyer : CSG 6DE anti double compte, 2086 non certifiée, '
    + 'QF particuliers bloqués, séparation public/personnel OK');
