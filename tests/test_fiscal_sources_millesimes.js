/* node tests/test_fiscal_sources_millesimes.js — inventaire pérenne des sources
   DGFiP : une seule table décrit, par année de REVENUS, le document attendu, son
   URL vérifiée, la date de vérification et l'autorisation de lecture. Aucune URL
   inventée, aucune valeur portée d'une année sur l'autre, et cohérence obligatoire
   avec les URL que construisent les lecteurs existants. Hors réseau. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const id = '6511ae04-2496-4ce5-840b-5d365c1d6ff2';
const memoire = new Map();
const ctx = vm.createContext({
    PF: { ui: { h: String }, store: { reglages: () => ({}) },
        net: { auth: { utilisateur: () => ({ id }) }, req: async () => ({ ok: false }),
            reqPdf: async () => { throw new Error('aucun appel réseau attendu dans cette suite'); } } },
    localStorage: { getItem: k => (memoire.has(k) ? memoire.get(k) : null),
        setItem: (k, v) => memoire.set(k, v) },
    Date, Promise, Number, Object, String, JSON, Math, Array, Error, RegExp, isFinite
});
ctx.globalThis = ctx;
for (const f of ['fiscal_sources_millesimes.js', 'fiscal_dgfip_sources.js', 'fiscal_frais_sources.js',
    'fiscal_regimes_sources.js', 'fiscal_brochure_sources.js', 'fiscal_rcm_pdf_sources.js',
    'fiscal_crypto_pdf_sources.js', 'fiscal_couverture.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);

const S = ctx.PF.fiscalSourcesMillesimes;
const boi = ctx.PF.fiscalDgfipSources;
const frais = ctx.PF.fiscalFraisSources;
const regimes = ctx.PF.fiscalRegimesSources;
const rcm = ctx.PF.fiscalRcmPdfSources;
const crypto = ctx.PF.fiscalCryptoPdfSources;
const C = ctx.PF.fiscalCouverture;

// ------------------------------------------------------------------- périmètre
assert.equal(S.millésimes().join(','), '2023,2024,2025,2026', 'revenus 2023 à 2026');
assert.equal(S.familles().length, 11, 'onze familles de documents');
['boi_ir', 'boi_decote', 'boi_qf', 'aide_frais', 'aide_gains', 'aide_repas', 'brochure_rcm',
    'brochure_charges', 'brochure_plus_values', 'notice_2086', 'nouveautes'].forEach(f =>
    assert.ok(S.familles().includes(f), `famille ${f} inventoriée`));
S.millésimes().forEach(an => {
    assert.equal(S.MILLESIMES[an].declaration, an + 1, `revenus ${an} déclarés en ${an + 1}`);
    assert.equal(S.toutes(an).length, S.familles().length, `revenus ${an} : toutes les familles décrites`);
});
assert.equal(S.MILLESIMES[2023].publicationBoi, '2024-06-18');
assert.equal(S.MILLESIMES[2024].publicationBoi, '2025-04-14');
assert.equal(S.MILLESIMES[2025].publicationBoi, '2026-04-07');
assert.equal(S.MILLESIMES[2026].publicationBoi, null, 'revenus 2026 : rien de publié');
assert.equal(S.MILLESIMES[2026].documentsAttendus, false);
assert.equal(S.prochainMillésime(), 2026, 'le millésime à venir est nommé');

// ------------------------------------------------ aucune URL inventée, jamais
const HOTES = ['https://bofip.impots.gouv.fr/', 'https://www.impots.gouv.fr/',
    'https://simulateur-ir-ifi.impots.gouv.fr/'];
S.millésimes().forEach(an => S.familles().forEach(f => {
    const s = S.source(an, f);
    assert.ok(s, `revenus ${an} · ${f} : décrit`);
    assert.match(s.verifieeLe, /^\d{4}-\d{2}-\d{2}$/, `revenus ${an} · ${f} : date de vérification`);
    assert.ok(s.verifieeLe <= '2026-10-16', `revenus ${an} · ${f} : vérification datée`);
    assert.ok(s.constat && s.constat.length > 12, `revenus ${an} · ${f} : constat écrit`);
    assert.ok(s.motif && s.motif.length > 8, `revenus ${an} · ${f} : motif de recherche`);
    if (s.url) {
        assert.ok(HOTES.some(h => s.url.startsWith(h)),
            `revenus ${an} · ${f} : hôte DGFiP uniquement (${s.url})`);
        assert.ok(!/[<>]/.test(s.url), `revenus ${an} · ${f} : URL concrète, sans joker`);
    } else {
        assert.equal(s.lectureVerifiee, false,
            `revenus ${an} · ${f} : sans URL, aucune lecture prétendue vérifiée`);
    }
    assert.equal(typeof s.lectureAutorisee, 'boolean', `revenus ${an} · ${f} : autorisation explicite`);
    if (s.lectureVerifiee) assert.equal(s.lectureAutorisee, true,
        `revenus ${an} · ${f} : un jeu de preuves vérifié autorise la lecture`);
    assert.equal(S.url(an, f), s.url && s.lectureAutorisee ? s.url : null,
        `revenus ${an} · ${f} : url() ne renvoie que ce qui est repéré ET autorisé`);
}));
// Les motifs contiennent des emplacements à vérifier, jamais des adresses devinées.
['boi_ir', 'brochure_rcm', 'brochure_charges', 'notice_2086', 'aide_frais'].forEach(f =>
    assert.match(S.motif(f), /<[A-ZÉ+\s][^>]*>/, `${f} : motif à compléter, pas une URL`));
S.familles().forEach(f => assert.equal(S.source(2026, f).url, null,
    `revenus 2026 · ${f} : rien n’est publié, aucune URL`));
S.familles().forEach(f => assert.equal(S.url(2026, f), null));
assert.equal(S.source(2022, 'boi_ir'), null, 'millésime hors inventaire');
// Un millésime à venir est DÉCRIT, jamais inventé : les 11 familles sont absentes,
// aucune adresse n'est fabriquée, aucune lecture n'est autorisée.
const s27 = S.source(2027, 'boi_ir');
assert.equal(s27.url, null, 'revenus 2027 : aucune adresse inventée');
assert.equal(s27.lectureVerifiee, false);
assert.equal(s27.lectureAutorisee, false);
assert.equal(s27.publiee, false);
assert.equal(S.etatDe(s27), 'absente');
assert.equal(s27.anneeDeclaration, 2028, 'revenus 2027 = déclaration 2028');
assert.match(s27.constat, /printemps 2028/);
assert.match(s27.constat, /adresse à construire d’après le motif/);
assert.equal(S.url(2027, 'boi_ir'), null);
assert.equal(S.toutes(2027).length, 11, 'les 11 familles sont décrites pour 2027');
assert.equal(S.lisibles(2027).length, 0, 'rien n’est lisible avant publication');
assert.equal(S.manquantes(2027).length, 11);
assert.equal(S.millésimes().join(','), '2023,2024,2025,2026',
    'les comptes de l’inventaire ne bougent pas : 2027 n’est pas un millésime décrit');
const cal27 = S.calendrier(2027);
assert.equal(cal27.anneeDeclaration, 2028);
assert.equal(cal27.publié, false);
assert.match(cal27.bofip, /attendue au printemps 2028/);
assert.match(cal27.brochures, /ir_2028/);
assert.match(cal27.simulateur, /calcul_impot\/2028/);
assert.match(cal27.formulaire2086, /notice 2086 du millésime 2028/);
const h27 = S.horizon(2027);
assert.equal(h27.anneeDeclaration, 2028);
assert.equal(h27.automatique.join(','), 'boi_ir,boi_decote,boi_qf,aide_frais,aide_gains,aide_repas',
    'six familles se collectent sans inscription nouvelle');
assert.equal(h27.aInscrire.join(','),
    'brochure_rcm,brochure_charges,brochure_plus_values,notice_2086,nouveautes',
    'cinq familles PDF exigent une inscription : leur nom de fichier ne se devine pas');
assert.match(h27.rappel, /refusent sans appel réseau/);
assert.equal(S.horizon(2026), null, 'horizon réservé aux millésimes à venir');
assert.equal(S.millésime(2022), null, 'millésime antérieur à l’inventaire');

// Trois états : vérifiée, autorisée sous réserve, absente.
assert.equal(S.etatDe(S.source(2025, 'brochure_charges')), 'lisible-vérifiée');
assert.equal(S.etatDe(S.source(2024, 'brochure_charges')), 'lisible-sous-réserve');
assert.equal(S.etatDe(S.source(2023, 'brochure_rcm')), 'repérée-non-autorisée');
assert.equal(S.etatDe(S.source(2024, 'brochure_rcm')), 'absente');
assert.equal(S.etatDe(S.source(2026, 'boi_ir')), 'absente');

// Documents repérés le 16/10/2026 pour les revenus 2023 et 2024.
assert.equal(S.url(2024, 'notice_2086'),
    'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2025/pdf_som/2086.pdf');
assert.equal(S.url(2023, 'notice_2086'),
    'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2024/pdf_som/2086.pdf');
assert.match(S.source(2024, 'notice_2086').constat, /16043\*06/);
assert.match(S.source(2024, 'notice_2086').constat, /NOTICE \(revenus 2024\)/);
assert.match(S.source(2023, 'notice_2086').constat, /16043\*05/);
assert.match(S.source(2023, 'notice_2086').constat, /réalisées en 2023/);
assert.equal(S.url(2023, 'brochure_charges'),
    'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2024/pdf_som/12-charges_ded_rev_219a230.pdf');
assert.equal(S.url(2024, 'brochure_charges'),
    'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2025/pdf_som/12-charges_ded_rev_215a226.pdf');
// L'ancre portante (l'année des revenus) est vérifiée verbatim sur ces chapitres.
assert.match(S.source(2023, 'brochure_charges').constat, /REVENUS 2022, PAYÉE EN 2023/);
assert.match(S.source(2024, 'brochure_charges').constat, /REVENUS 2023, PAYÉE EN 2024/);
assert.match(S.source(2024, 'brochure_charges').constat, /REVENUS 2024, PAYÉE EN 2024/);
// Autoriser ≠ vérifier : ce qui n'a pas été relu est écrit, et le lecteur refuse
// toute preuve manquante.
[S.source(2023, 'brochure_charges'), S.source(2024, 'brochure_charges'),
    S.source(2023, 'notice_2086'), S.source(2024, 'notice_2086')].forEach(x => {
    assert.equal(x.lectureVerifiee, false, `${x.famille} ${x.anneeRevenus} : jeu de preuves non vérifié en entier`);
    assert.equal(x.lectureAutorisee, true, `${x.famille} ${x.anneeRevenus} : lecture autorisée sous réserve`);
    assert.match(x.constat, /SOUS RÉSERVE/, `${x.famille} ${x.anneeRevenus} : la réserve est écrite`);
    assert.match(x.constat, /exige ses \d preuves/, `${x.famille} ${x.anneeRevenus} : le nombre de preuves exigées est dit`);
});
// Un document repéré sans lecteur dédié n'autorise rien.
assert.equal(S.url(2024, 'nouveautes'), null,
    'nouveautés ir_2025 repérées et relues, mais aucun lecteur dédié : aucune collecte');
assert.match(S.source(2024, 'nouveautes').constat, /PRINCIPALES NOUVEAUTÉS REVENUS 2024/);
assert.match(S.source(2024, 'nouveautes').constat, /augmentent de 1,8 %/);
assert.match(S.motif('notice_2086'), /brochure/, 'les deux emplacements de la notice 2086 sont documentés');

// Repéré ≠ lisible : le chapitre RCM ir_2024 existe, sa lecture n'est pas vérifiée.
const rcm2023 = S.source(2023, 'brochure_rcm');
assert.ok(rcm2023.url.includes('ir_2024/pdf_som/08-RCM_123a137.pdf'), 'document 2023 repéré');
assert.equal(rcm2023.lectureVerifiee, false, 'jeu de 8 preuves non confirmé sur ce millésime');
assert.equal(S.url(2023, 'brochure_rcm'), null, 'donc aucune collecte déclenchée');
assert.match(rcm2023.constat, /4 passages vérifiés/);
assert.match(rcm2023.constat, /lecture refusée, aucune valeur produite/);

// ------------------------------------------------------------------- inventaire
const inv = {};
S.inventaire().forEach(l => { inv[l.anneeRevenus] = l; });
assert.equal(inv[2025].lisibles + '/' + inv[2025].total, '11/11', 'revenus 2025 : tout est lisible');
assert.equal(inv[2025].verifiees + '/' + inv[2025].total, '11/11', 'et tout est vérifié');
assert.equal(inv[2023].lisibles + '/' + inv[2023].total, '8/11',
    'revenus 2023 : charges et notice 2086 repérées et autorisées sous réserve');
assert.equal(inv[2023].verifiees + '/' + inv[2023].total, '6/11');
assert.equal(inv[2024].lisibles + '/' + inv[2024].total, '8/11');
assert.equal(inv[2024].verifiees + '/' + inv[2024].total, '6/11');
assert.equal(inv[2026].lisibles + '/' + inv[2026].total, '0/11');
assert.ok(inv[2023].familles.includes('brochure_rcm:repérée-non-autorisée'));
assert.ok(inv[2023].familles.includes('brochure_charges:lisible-sous-réserve'));
assert.ok(inv[2024].familles.includes('notice_2086:lisible-sous-réserve'));
assert.ok(inv[2024].familles.includes('nouveautes:repérée-non-autorisée'));
assert.ok(inv[2024].familles.includes('brochure_rcm:absente'));
assert.equal(S.lisibles(2026).length, 0);
assert.equal(S.verifiees(2023).length, 6);
assert.equal(S.manquantes(2025).length, 0);
assert.equal(S.manquantes(2023).length, 3);
assert.equal(S.manquantes(2026).length, 11);
assert.equal(S.aVerifier(2024).length, 5);
S.aVerifier(2024).forEach(x => assert.ok(x.motif && x.manque, 'ce qui manque est nommé'));

// ------------------------------------- cohérence avec les URL des lecteurs réels
[2023, 2024, 2025].forEach(an => {
    assert.equal(S.url(an, 'boi_ir'), boi.url('ir', an), 'barème : même permalien que le lecteur');
    assert.equal(S.url(an, 'boi_decote'), boi.url('decote', an), 'décote : même permalien');
    assert.equal(S.url(an, 'boi_qf'), boi.url('qf', an), 'quotient familial : même permalien');
    assert.equal(S.url(an, 'aide_frais'), frais.KM(an), 'aide frais : même adresse');
    assert.equal(S.url(an, 'aide_gains'), regimes.url(an), 'aide gains : même adresse');
    assert.equal(S.url(an, 'aide_repas'), frais.repasUrl(an), 'forfait repas : même adresse');
});
assert.equal(S.url(2025, 'brochure_rcm'), rcm.urls.rcm, 'RCM 2025 : URL identique au lecteur');
assert.equal(S.url(2025, 'brochure_charges'), rcm.urls.charges, 'charges 2025 : URL identique');
assert.equal(S.url(2025, 'notice_2086'), crypto.urls.notice, 'notice 2086 : URL identique');
assert.equal(S.url(2025, 'brochure_plus_values'), crypto.urls.brochure, 'plus-values : URL identique');
assert.equal(rcm.urlPour('rcm', 2025), S.url(2025, 'brochure_rcm'));
assert.equal(rcm.urlPour('charges', 2024), S.url(2024, 'brochure_charges'));
assert.equal(crypto.urlPour('notice', 2025), S.url(2025, 'notice_2086'));
assert.equal(crypto.urlPour('notice', 2024), S.url(2024, 'notice_2086'));
assert.equal(crypto.urlPour('notice', 2023), S.url(2023, 'notice_2086'));
assert.equal(crypto.urlPour('brochure', 2024), S.url(2024, 'brochure_plus_values'));
assert.equal(crypto.urlPour('brochure', 2023), null);
assert.equal(rcm.urlPour('charges', 2023), S.url(2023, 'brochure_charges'));
assert.equal(rcm.urlPour('charges', 2024), S.url(2024, 'brochure_charges'));
// Les familles non vérifiées pour un millésime ne sont pas lues par les modules.
assert.equal(rcm.urlPour('rcm', 2023), null);
assert.equal(rcm.urlPour('rcm', 2026), null);

// ------------------------------------- liens avec la matrice et les divergences
const t2024 = S.texte(2024);
assert.match(t2024, /8\/11 familles lisibles/);
assert.match(t2024, /dont 6\/11 au jeu de preuves vérifié/);
assert.match(t2024, /aucune URL inventée/);
assert.match(t2024, /Calendrier :/);
assert.match(S.texte(2026), /0\/11/);
assert.equal(S.texte(2022), 'Millésime hors inventaire : 2022.', 'millésime antérieur');
assert.match(S.texte(2027), /revenus 2027 \(déclaration 2028\) : 0\/11 familles lisibles/,
    'millésime à venir : décrit, rien de lisible');
assert.match(S.texte(2027), /attendue au printemps 2028/);
assert.doesNotMatch(S.texte(2027), /https?:\/\//, 'aucune adresse inventée dans le texte');
// Chaque famille dont le constat dit « corrigé le 16/10/2026 » a sa correction
// tracée dans le journal, avec la valeur officielle et la valeur d'avant.
S.millésimes().forEach(an => S.toutes(an).forEach(s => {
    if (!/corrigé le 16\/10\/2026/.test(s.constat)) return;
    const cat = s.famille === 'boi_ir' ? 'ir_bareme'
        : s.famille === 'boi_decote' ? 'decote' : 'qf_general';
    const c = C.corrections(an, cat);
    assert.ok(c.length >= 1, `revenus ${an} · ${s.famille} : correction consignée`);
    assert.equal(c[0].corrigee, true);
    assert.equal(c[0].corrigeLe, '2026-10-16');
    assert.notEqual(JSON.stringify(c[0].officiel), JSON.stringify(c[0].avantCorrection));
}));
assert.equal(C.corrections().length, 6,
    'six corrections : décote et QF 2022, décote 2023, barème, décote et QF 2024');
assert.equal(C.corrections(2022).length, 2, 'le millésime 2022 est hors matrice mais pas hors moteur');
assert.equal(C.corrections(2025).length, 0, 'revenus 2025 : déjà recoupés, rien à corriger');
assert.equal(C.corrections(2026).length, 0, 'revenus 2026 : rien de publié, rien à corriger');

// --------------------------------------------------------- calendrier pérenne
const cal26 = S.calendrier(2026);
assert.equal(cal26.publié, false);
assert.equal(cal26.anneeDeclaration, 2027);
assert.match(cal26.bofip, /printemps 2027/);
assert.match(cal26.bofip, /18\/06\/2024 pour 2023, 14\/04\/2025 pour 2024, 07\/04\/2026 pour 2025/,
    'les fenêtres observées servent à savoir QUAND chercher, jamais à deviner une valeur');
assert.match(cal26.brochures, /ir_2027/);
assert.match(cal26.simulateur, /calcul_impot\/2027/);
assert.match(cal26.formulaire2086, /2086 du millésime 2027/);
assert.equal(S.calendrier(2025).publié, true);
assert.match(S.calendrier(2025).bofip, /2026-04-07/, 'date de publication du BOFiP revenus 2025');

// ------------------------------------------ non-régression : rien n'est activé
assert.equal(rcm.lireCache('rcm'), null, 'aucune valeur RCM sans collecte');
assert.equal(crypto.lireCache('notice'), null);
const vide = C.matrice({});
assert.equal(vide.synthese.etablis, 0, 'un inventaire de sources n’établit rien par lui-même');
assert.equal(vide.synthese.basculeComplete, false, 'bascule DGFiP totale : non');
[2023, 2024, 2026].forEach(an => C.CATEGORIES.forEach(c =>
    assert.equal(vide.cellules[an][c.id].statut, C.STATUTS.NON_DISPONIBLE,
        `revenus ${an} · ${c.id} : non disponible sans collecte`)));

console.log('OK — inventaire pérenne des sources DGFiP par millésime, sans URL inventée');
