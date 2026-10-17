/* Onglet de mise à jour fiscale (2.2.5) — la pastille vert / orange / rouge.

   Ce que le propriétaire a demandé : tous les messages d'une mise à jour dans un
   onglet replié, vert si tout est ok, orange si des informations manquent, rouge
   si la récupération n'a pas été possible, et UNIQUEMENT les informations
   manquantes affichées — aucune alerte quand tout va bien.

   Le risque réel d'une telle pastille est de mentir par optimisme : un vert qui
   cache une panne, ou une alerte permanente qui devient du bruit. Ces tests
   verrouillent donc les deux sens de l'erreur.

   §1  les motifs réellement produits par les lecteurs sont classés comme il faut
   §2  une panne masquée par des valeurs en cache reste une panne (rouge)
   §3  un motif inconnu ne rassure jamais : il signale
   §4  revenus 2025 réellement lus ⇒ vert, et AUCUNE alerte
   §5  un millésime non publié ⇒ orange, et l'alerte ne liste QUE ce qui manque
   §6  la couleur agrégée est la pire des millésimes, jamais la moyenne
   §7  une mise à jour interrompue ⇒ rouge, bornée aux millésimes demandés
   §8  le motif affiché ne contient aucune adresse et reste court
   §9  aucune ligne n'est inventée pour une famille absente du rapport
   §10 parité avec les lecteurs : aucun motif de succès inattendu
   §11 rendu : onglet replié, pastille présente, aucune alerte quand rien à dire
   §12 repli sans le module : messages à plat, aucune pastille inventée */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'app/src/main/assets/www/js');

/* Harnais repris de `tests/test_fiscal_millesime_futur.js`, qui teste déjà
   `vue()` : `util.js` puis `ui.js` AVANT `fiscal.js` (le moteur capture `PF.ui`
   à l'initialisation), un `document` minimal, et les services dont l'écran se
   sert. Inventer un stub `PF.util` partiel ferait passer le test à côté du vrai
   rendu — c'est ce qui s'est produit avant cette reprise. */
function charger(fichiers) {
    const ctx = vm.createContext({
        Date, Number, String, Object, Array, Error, Promise, Math, JSON, RegExp, isFinite,
        localStorage: { getItem: () => null, setItem: () => {} },
        document: { getElementById: () => null, querySelector: () => null,
            querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {} } }) },
        PF: { ui: { h: String, accordeon: (t, c) => '<div class="accordeon">' + t + c + '</div>' },
            store: { reglages: () => ({}) }, modele: { classeDe: () => 'action_etf' },
            net: { auth: { utilisateur: () => null }, req: async () => ({ ok: false, body: '' }) } }
    });
    ctx.globalThis = ctx;
    fichiers.forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx));
    return ctx;
}

const ECRAN = ['util.js', 'ui.js'];   // prérequis de fiscal.js pour tracer l'écran

const M = charger(['fiscal_etat_collecte.js']).PF.fiscalEtatCollecte;

/* --------------------------------------------------------------- §1 motifs réels
   Chaque motif vient textuellement d'un lecteur du dépôt. Le troisième terme est
   la présence de `valeurs` : plusieurs lecteurs renvoient des valeurs ET un motif
   de portée partielle, et c'est précisément le cas ambigu à trancher. */
const CAS_REELS = [
    // --- documents lus : la portée partielle est écrite ailleurs, pas ici ---
    ['brochure charges revenus 2025 : paiement 2024 documenté, avis et montants du foyer non lus', true, 'ok'],
    ['notice 2086 revenus 2025 : méthode et foyer partiellement vérifiés, PS non déterminés par ce lecteur', true, 'ok'],
    ['brochure RCM revenus 2025 : 2CG/2BH/2DF distinguées, produit du foyer non déterminé', true, 'ok'],
    ['brochure crypto revenus 2025 : IR 12,8 %, PS non déterminés par ce lecteur', true, 'ok'],
    ['RCM 2025 : taux à l’encaissement et sur avis distingués, produit non déterminé', true, 'ok'],
    ['brochure revenus 2025 lue : portée partielle, aucun taux crypto attribué', true, 'ok'],
    ['FAQ crypto privée actuelle : année des cessions non attestée, taux non activé', true, 'ok'],
    ['taux IR/PS des titres et année explicites', true, 'ok'],
    ['valeur du millésime trouvée (07/04/2026)', true, 'ok'],
    ['valeur explicite trouvée', true, 'ok'],
    ['valeur explicite collectée', true, 'ok'],
    ['PS crypto revenus 2025 établis par recoupement de deux textes DGFiP ; aucun taux activé, contradiction BOFiP signalée', false, 'ok'],
    ['historisée', false, 'ok'],
    ['inchangée', false, 'ok'],
    // --- informations manquantes : rien n'est publié ou rien n'est attribuable ---
    ['millésime revenus 2026 hors inventaire des sources DGFiP : aucune lecture', false, 'manquant'],
    ['document du millésime revenus 2024 non repéré : aucune URL inventée — brochure non publiée', false, 'manquant'],
    ['document repéré pour les revenus 2023 mais jeu de preuves non vérifié sur ce millésime : lecture refusée, aucune valeur produite', false, 'manquant'],
    ['documents du millésime revenus 2026 non publiés', false, 'manquant'],
    ['revenus 2024 : aucune source DGFiP ne date le taux PS crypto de ce millésime', false, 'manquant'],
    ['revenus 2023 : documents du millésime non publiés, taux non établi', false, 'manquant'],
    ['preuve RCM de ce millésime non disponible', false, 'manquant'],
    ['brochure de ce millésime non prise en charge', false, 'manquant'],
    ['FAQ crypto actuelle non attribuable à ce millésime', false, 'manquant'],
    ['millésime non pris en charge', false, 'manquant'],
    ['millésime de gains invalide', false, 'manquant'],
    ['rien à historiser', false, 'manquant'],
    ['année absente ou format non reconnu', false, 'manquant'],
    ['année trouvée, table automobile non reconnus', false, 'manquant'],
    ['année des revenus 2024 absente ou texte illisible', false, 'manquant'],
    ['recoupement PS crypto refusé : article 150 VH bis absent', false, 'manquant'],
    ['contradiction documentaire : recoupement 18,6 % contre BOFiP 17,2 %', false, 'manquant'],
    ['dérivation incohérente : 17.2 + 1.4 ≠ 18,6 %', false, 'manquant'],
    ['CSG 6DE refusée : double compte détecté', false, 'manquant'],
    ['aucune valeur explicite', false, 'manquant'],
    ['valeur incompatible', false, 'manquant'],
    ['taux RCM hors bornes ou contradictoires', false, 'manquant'],
    ['taux IR + PS différents du PFU publié', false, 'manquant'],
    ['précompte 2025 ou avis des revenus 2025 non documenté', false, 'manquant'],
    ['BOFiP : taux de PS inattendu (0.172)', false, 'manquant'],
    // --- récupération impossible ---
    ['document inaccessible', false, 'echec'],
    ['source officielle inaccessible', false, 'echec'],
    ['source inaccessible', false, 'echec'],
    ['preuve PDF impossible à relire', false, 'echec'],
    ['PDF non disponible (HTTP 503)', false, 'echec'],
    ['PDF DGFiP non disponible (réseau indisponible)', false, 'echec'],
    ['preuve RCM insuffisante pour relecture', false, 'echec'],
    ['preuve FAQ crypto insuffisante pour relecture', false, 'echec'],
    ['preuve insuffisante pour relecture', false, 'echec'],
    ['recoupement interrompu : Session changée', false, 'echec'],
    ['recoupement PS crypto impossible (BOFiP inaccessible)', false, 'echec'],
    ['module de recoupement absent', false, 'echec'],
    ['non historisée', false, 'echec'],
    ['format inattendu', false, 'echec'],
    ['Actualisation interrompue : Session changée pendant la recherche.', false, 'echec'],
];
CAS_REELS.forEach(([motif, valeurs, attendu]) => {
    assert.equal(M.classerMotif(motif, valeurs), attendu,
        `motif mal classé : « ${motif.slice(0, 60)}… »`);
});
console.log(`§1 ${CAS_REELS.length} motifs réels des lecteurs classés correctement`);

/* ------------------------------------------------------------------- §2 et §3 */
// Une panne ne doit JAMAIS être masquée par des valeurs restées en cache :
// l'échec est testé avant la présence de valeurs.
assert.equal(M.classerMotif('document inaccessible', true), 'echec',
    'une source inaccessible reste un échec même si le cache contient des valeurs');
assert.equal(M.classerMotif('PDF non disponible (HTTP 503)', true), 'echec');
// Symétrie : dans le doute on signale, on ne rassure pas.
assert.equal(M.classerMotif('motif jamais vu', false), 'manquant',
    'un motif inconnu sans valeurs ne doit jamais conclure « ok »');
assert.equal(M.classerMotif(null, false), 'manquant');
assert.equal(M.classerMotif('', false), 'manquant');
console.log('§2-3 panne non masquée par le cache, motif inconnu jamais rassurant');

/* ------------------------------------------------------------------------ §4
   Revenus 2025 tels que le téléphone les a réellement rendus le 15/10/2026 :
   les 11 documents lus et historisés à l'identique. Attendu : VERT, et aucune
   alerte — c'est la demande explicite « si tout est ok, pas besoin d'alerte ». */
const RAPPORT_2025 = {
    annee: 2025,
    boi: {
        etats: { ir: 'valeur du millésime trouvée (07/04/2026)',
            decote: 'valeur du millésime trouvée (07/04/2026)',
            qf: 'valeur du millésime trouvée (07/04/2026)' },
        enregistree: true,
        valeurs: { ir: { tranches: [11600] }, decote: { dc: 897 }, qf: 1807 }
    },
    frais: {
        etats: { abatt: 'valeur explicite trouvée', repas: 'valeur explicite trouvée',
            km: 'valeur explicite trouvée' },
        enregistree: true, valeurs: { abatt: { min: 509 }, repas: 5.45, km: [{}] }
    },
    titres: { etat: 'taux IR/PS des titres et année explicites', valeurs: { ir: .128, ps: .186 } },
    rcm: { etat: 'RCM 2025 : taux à l’encaissement et sur avis distingués, produit non déterminé',
        valeurs: { precompte2025: .186 } },
    crypto: { etat: 'FAQ crypto privée actuelle : année des cessions non attestée, taux non activé',
        valeurs: { pfuCourant: .314 } },
    brochure: { etat: 'brochure revenus 2025 lue : portée partielle, aucun taux crypto attribué',
        valeurs: { revenus: 2025 } },
    cryptoPdf: {
        notice: { etat: 'notice 2086 revenus 2025 : méthode et foyer partiellement vérifiés, PS non déterminés par ce lecteur', valeurs: { seuilFoyer: 305 } },
        brochure: { etat: 'brochure crypto revenus 2025 : IR 12,8 %, PS non déterminés par ce lecteur', valeurs: { irForfaitaire: .128 } }
    },
    rcmPdf: {
        rcm: { etat: 'brochure RCM revenus 2025 : 2CG/2BH/2DF distinguées, produit du foyer non déterminé', valeurs: { case2CG: true } },
        charges: { etat: 'brochure charges revenus 2025 : paiement 2024 documenté, avis et montants du foyer non lus', valeurs: { revenus: 2025 } }
    },
    recoupement: { statut: 'recoupement', taux: .186,
        etat: 'PS crypto revenus 2025 établis par recoupement de deux textes DGFiP ; aucun taux activé, contradiction BOFiP signalée' },
    historique: { etat: 'inchangée', motif: 'documents déjà historisés à l’identique',
        ajoutees: [], corrigees: [], ignorees: ['dgfip_bofip_ir'] }
};
const s2025 = M.synthese(2025, RAPPORT_2025, null);
assert.equal(s2025.couleur, 'ok', 'les 11 documents des revenus 2025 sont lus ⇒ vert');
assert.equal(s2025.echecs.length, 0);
assert.equal(s2025.manquants.length, 0);
assert.equal(s2025.lus, s2025.total, 'tout est lu');
assert.equal(M.texteManquants(s2025), '', 'tout est ok ⇒ AUCUNE alerte');
assert.match(M.libelle(s2025), /^tout est lu \(\d+\/\d+\)$/, 'libellé du vert');
console.log(`§4 revenus 2025 : vert (${s2025.lus}/${s2025.total} lus), aucune alerte`);

/* ------------------------------------------------------------------------ §5
   Revenus 2024 : les lecteurs renvoient des refus de millésime, sans valeurs.
   Attendu : ORANGE, et l'alerte ne liste QUE ce qui manque — jamais les
   documents lus, qui n'ont pas besoin d'être signalés. */
const RAPPORT_2024 = {
    annee: 2024,
    boi: { etats: { ir: 'valeur du millésime trouvée (14/04/2025)',
        decote: 'valeur du millésime trouvée (14/04/2025)',
        qf: 'valeur du millésime trouvée (14/04/2025)' },
        enregistree: true, valeurs: { ir: { tranches: [11497] }, decote: { dc: 889 }, qf: 1791 } },
    frais: { etats: { abatt: 'valeur explicite trouvée', repas: 'valeur explicite trouvée',
        km: 'valeur explicite trouvée' }, enregistree: true,
        valeurs: { abatt: { min: 504 }, repas: 5.35, km: [{}] } },
    cryptoPdf: {
        notice: { etat: 'document repéré pour les revenus 2024 mais jeu de preuves non vérifié sur ce millésime : lecture refusée, aucune valeur produite', enregistree: false },
        brochure: { etat: 'millésime revenus 2024 hors inventaire des sources DGFiP : aucune lecture', enregistree: false }
    },
    rcmPdf: {
        rcm: { etat: 'document du millésime revenus 2024 non repéré : aucune URL inventée — brochure non publiée', enregistree: false },
        charges: { etat: 'document repéré pour les revenus 2024 mais jeu de preuves non vérifié sur ce millésime : lecture refusée', enregistree: false }
    },
    brochure: { etat: 'brochure de ce millésime non prise en charge', enregistree: false },
    historique: { etat: 'rien à historiser', motif: 'aucun document de ce millésime lu',
        ajoutees: [], corrigees: [], ignorees: [] }
};
const s2024 = M.synthese(2024, RAPPORT_2024, null);
assert.equal(s2024.couleur, 'manquant', 'des documents ne sont pas publiés pour 2024 ⇒ orange');
assert.equal(s2024.echecs.length, 0, 'aucune panne : rien n’a échoué, rien n’est publié');
assert.ok(s2024.manquants.length >= 6, 'les familles non lues sont listées');
const alerte2024 = M.texteManquants(s2024);
assert.match(alerte2024, /Informations manquantes \(\d+\) :/);
assert.doesNotMatch(alerte2024, /Récupération impossible/, 'orange ⇒ pas de rubrique rouge');
// Ce qui est lu ne doit PAS apparaître dans l'alerte.
assert.doesNotMatch(alerte2024, /BOFiP \(barème/, 'un document lu n’est pas une info manquante');
assert.doesNotMatch(alerte2024, /Frais salariés/, 'un document lu n’est pas une info manquante');
// Ce qui manque doit apparaître, avec son millésime.
assert.match(alerte2024, /revenus 2024 — Notice 2086/);
assert.match(alerte2024, /Brochure nouveautés \(CSG\)/);
assert.match(alerte2024, /Historisation Supabase/);
console.log(`§5 revenus 2024 : orange, ${s2024.manquants.length} infos manquantes listées, aucune ligne sur ce qui est lu`);

/* ------------------------------------------------------------------------ §6
   Un clic sur « Vérifier les revenus 2023 à 2025 » produit trois rapports. La
   pastille doit dire la PIRE des trois situations, jamais une moyenne : un échec
   sur un seul millésime met tout l'onglet en rouge. */
const rapportPanne = { annee: 2023,
    boi: { etats: { ir: 'document inaccessible', decote: 'document inaccessible',
        qf: 'document inaccessible' }, enregistree: false } };
const agg = M.syntheseTout({ 2024: RAPPORT_2024, 2025: RAPPORT_2025, 2023: rapportPanne }, null, []);
assert.equal(agg.couleur, 'echec', 'la pire situation l’emporte : une panne ⇒ rouge');
assert.ok(agg.echecs.length >= 3, 'les trois documents inaccessibles sont comptés');
assert.match(M.texteManquants(agg), /Récupération impossible \(\d+\) :/);
assert.match(M.texteManquants(agg), /revenus 2023 — BOFiP \(barème, décote, plafond QF\) \(ir\)/);
assert.match(M.texteManquants(agg), /Informations manquantes/, 'les manques des autres millésimes restent listés');
// Sans la panne, l'agrégat retombe sur l'orange de 2024.
const aggSansPanne = M.syntheseTout({ 2024: RAPPORT_2024, 2025: RAPPORT_2025 }, null, []);
assert.equal(aggSansPanne.couleur, 'manquant');
// Et si tous les millésimes sont lus, l'agrégat est vert — sans alerte.
const aggVert = M.syntheseTout({ 2025: RAPPORT_2025 }, null, []);
assert.equal(aggVert.couleur, 'ok');
assert.equal(M.texteManquants(aggVert), '', 'agrégat vert ⇒ aucune alerte');
console.log('§6 agrégation : la pire couleur l’emporte, jamais une moyenne');

/* ------------------------------------------------------------------------ §7 */
const aggInterrompu = M.syntheseTout({ 2025: RAPPORT_2025 },
    'Actualisation interrompue : Session changée pendant la recherche.', [2023, 2024, 2025]);
assert.equal(aggInterrompu.couleur, 'echec', 'une mise à jour interrompue est une récupération impossible');
const texteInterrompu = M.texteManquants(aggInterrompu);
assert.match(texteInterrompu, /Récupération impossible \(1\) :/,
    'une seule panne pour tout le clic, pas une par millésime');
assert.match(texteInterrompu, /Mise à jour \(revenus 2023, 2024, 2025\)/,
    'les millésimes réellement demandés sont nommés');
assert.match(texteInterrompu, /Session changée/, 'la raison est nommée');
console.log('§7 mise à jour interrompue ⇒ rouge, une seule ligne, millésimes nommés');

/* ------------------------------------------------------------------------ §8 */
const long = 'PDF non disponible (https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/09-plus_values_137a156.pdf '
    + 'x'.repeat(300) + ')';
const court = M.motifCourt(long);
assert.doesNotMatch(court, /https?:/, 'aucune adresse de document dans l’alerte');
assert.match(court, /<adresse>/, 'l’adresse est remplacée, pas supprimée en silence');
assert.ok(court.length <= 140, `motif borné (${court.length} caractères)`);
assert.equal(M.motifCourt(null), 'motif absent', 'un motif absent est dit, jamais tu');
assert.equal(M.motifCourt('  a   b  '), 'a b', 'les blancs sont normalisés');
console.log('§8 motif affiché : sans adresse, borné, jamais vide');

/* ------------------------------------------------------------------------ §9 */
// Une famille absente du rapport n'a pas été tentée : inventer une ligne pour
// elle fabriquerait un manque imaginaire.
const sVide = M.synthese(2026, { annee: 2026 }, null);
assert.equal(sVide.total, 0, 'aucune famille dans le rapport ⇒ aucune ligne');
assert.equal(sVide.couleur, null, 'rien à dire ⇒ aucun état, pas un orange muet');
assert.equal(M.texteManquants(sVide), '', 'aucun état ⇒ aucune alerte');
assert.equal(M.libelle(sVide), 'aucune mise à jour lancée');
// Comparaison par JSON.stringify : `assert.deepEqual` échoue entre royaumes
// node:vm (prototypes distincts) alors que les structures sont identiques.
assert.equal(JSON.stringify(M.etatsFamille({ annee: 2026 }, { cle: 'rcm', libelle: 'RCM' })), '[]');
assert.equal(JSON.stringify(M.etatsFamille(null, { cle: 'rcm', libelle: 'RCM' })), '[]');
assert.equal(JSON.stringify(M.etatsFamille({ annee: 2026, rcm: null },
    { cle: 'rcm', libelle: 'RCM' })), '[]');
console.log('§9 aucune ligne inventée pour une famille non tentée');

/* ----------------------------------------------------------------------- §10
   Parité avec les lecteurs : on relit TOUS les motifs littéraux écrits dans les
   modules fiscaux et on vérifie que ceux classés « ok » sans valeurs sont
   exactement les motifs de succès connus. Un nouveau motif de succès ajouté sans
   mise à jour de cette liste, ou un motif d'échec qui matcherait une règle « ok »,
   fait échouer ce test. */
const LECTEURS = ['fiscal_dgfip_sources.js', 'fiscal_frais_sources.js', 'fiscal_regimes_sources.js',
    'fiscal_rcm_sources.js', 'fiscal_crypto_sources.js', 'fiscal_brochure_sources.js',
    'fiscal_crypto_pdf_sources.js', 'fiscal_rcm_pdf_sources.js', 'fiscal_crypto_ps_recoupement.js',
    'fiscal_historique_supabase.js', 'fiscal_sources.js', 'fiscal_gardes_foyer.js'];
const SUCCES_ATTENDUS = new Set(['taux IR/PS des titres et année explicites',
    'valeur du millésime trouvée', 'valeur explicite trouvée', 'valeur explicite collectée']);
const litteraux = new Set();
LECTEURS.forEach(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    // Les trois formes réelles : `etat: '…'` dans un objet, `etats[nom] = '…'`
    // dans une table, et `etat = '…'` en réaffectation (fiscal_regimes_sources.js).
    // Oublier la troisième laisserait un motif réel hors du contrôle de parité.
    for (const m of src.matchAll(/(?:etat|etats\[\w+\])\s*(?::|=)\s*'([^']*)'/g)) litteraux.add(m[1]);
});
assert.ok(litteraux.size >= 40, `assez de motifs extraits pour être significatif (${litteraux.size})`);
const classesOk = [...litteraux].filter(t => M.classerMotif(t, false) === 'ok');
const inattendus = classesOk.filter(t => !SUCCES_ATTENDUS.has(t));
assert.deepEqual(inattendus, [],
    'un motif de lecteur est classé « ok » sans valeurs alors qu’il n’est pas un succès connu : '
    + inattendus.join(' | '));
// Et aucun motif de panne ne doit être pris pour un simple manque.
const pannesConnues = ['document inaccessible', 'source officielle inaccessible', 'source inaccessible',
    'preuve PDF impossible à relire', 'preuve RCM insuffisante pour relecture',
    'preuve FAQ crypto insuffisante pour relecture', 'preuve insuffisante pour relecture',
    'format inattendu', 'non historisée'];
pannesConnues.forEach(t => assert.ok(litteraux.has(t), `le lecteur produit toujours « ${t} »`));
console.log(`§10 parité lecteurs : ${litteraux.size} motifs relus, aucun succès inattendu`);

/* ----------------------------------------------------------------------- §11
   Rendu réel de l'écran : l'onglet est replié (pas d'attribut `open`), la
   pastille porte la couleur, et aucune alerte n'est écrite quand il n'y a rien à
   signaler. */
const ctxEcran = charger(ECRAN.concat(['fiscal_etat_collecte.js', 'fiscal.js']));
const ecran = ctxEcran.PF.fiscal.vue({ transactions: [] });
assert.match(ecran, /<details class="onglet-collecte" data-etat="aucun">/,
    'l’onglet est présent et replié par défaut');
assert.doesNotMatch(ecran, /<details class="onglet-collecte"[^>]*\sopen/,
    'l’onglet doit être REFERMÉ par défaut');
assert.match(ecran, /class="badge mut">aucune mise à jour lancée<\/span>/,
    'avant tout clic la pastille ne prétend rien');
assert.match(ecran, /Messages de la mise à jour fiscale<\/span><\/summary>/,
    'l’intitulé de l’onglet est dans le sommaire, à côté de la pastille');
assert.doesNotMatch(ecran, /class="attention"/, 'aucune alerte orange quand rien ne manque');
assert.doesNotMatch(ecran, /Informations manquantes/, 'aucune alerte quand rien ne manque');
assert.doesNotMatch(ecran, /Récupération impossible/, 'aucune alerte quand rien ne manque');
// Avant tout clic il n'y a aucun rapport : l'onglet est vide et le reste. On ne
// peut donc pas y chercher le résumé détaillé — c'est l'emboîtement dans le code
// qui garantit qu'il sera DANS l'onglet dès qu'une mise à jour aura eu lieu.
const codeFiscal = fs.readFileSync(path.join(dir, 'fiscal.js'), 'utf8');
assert.match(codeFiscal,
    /function htmlOngletCollecte[\s\S]{0,1200}\+ contenu \+ '<\/details>'/,
    'les messages détaillés (résumé, audit, matrice, autres millésimes) sont repliés DANS l’onglet');
assert.match(codeFiscal,
    /var contenu = htmlRapport\(annee\) \+ htmlMatrice\(\) \+ htmlAutresAnnees\(annee\);/,
    'l’onglet regroupe bien tous les messages d’une mise à jour');
console.log('§11 rendu : onglet refermé, pastille neutre avant clic, aucune alerte inutile');

/* ----------------------------------------------------------------------- §12
   Sans le module, l'écran doit afficher les messages à plat et SANS pastille :
   inventer une couleur qu'on ne sait pas calculer serait un mensonge. */
const ctxSansModule = charger(ECRAN.concat(['fiscal.js']));
const ecranSansModule = ctxSansModule.PF.fiscal.vue({ transactions: [] });
assert.doesNotMatch(ecranSansModule, /onglet-collecte/, 'pas d’onglet sans module de classement');
// Assertion bornée à la zone de collecte : l’écran contient d’autres pastilles
// sans rapport (« Comptes détenus hors de France — à déclarer »), et un
// doesNotMatch global les capturerait à tort.
const zone = ecranSansModule.slice(ecranSansModule.indexOf('id="etatCollecteFiscale"'));
const zoneCollecte = zone.slice(0, zone.indexOf('</div>'));
assert.equal(zoneCollecte.includes('class="badge'), false,
    'aucune pastille verte, orange ou rouge inventée sans module de classement');
console.log('§12 repli sans module : messages à plat, aucune couleur inventée');

/* Le câblage doit être réel : index.html charge le module et build.sh l'exige. */
const index = fs.readFileSync(path.join(dir, '..', 'index.html'), 'utf8');
const build = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
assert.ok(index.includes('js/fiscal_etat_collecte.js'), 'module chargé par la WebView');
assert.ok(build.includes('js/fiscal_etat_collecte.js'), 'module exigé par build.sh');
console.log('Câblage : module chargé par index.html et exigé par build.sh');

console.log('Onglet de mise à jour fiscale : vert/orange/rouge calculés, alerte limitée aux manques OK');
