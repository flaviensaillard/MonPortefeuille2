/* Historisation Supabase des collectes DGFiP — module `PF.fiscalHistorique`.

Ce jeu de test est HORS RÉSEAU : le pont Supabase est un bouchon qui enregistre
les appels. Il verrouille ce que le propriétaire doit pouvoir affirmer :

1. ce qui s'écrit : une ligne par document réellement lu du millésime demandé,
   avec l'adresse lue — et rien d'autre (aucune famille absente, aucune valeur
   d'une autre année, aucun état d'échec transformé en preuve) ;
2. ce qui ne s'écrit PAS : aucune donnée personnelle, et jamais la table des
   règles publiées `pf2_fiscal_annees` (l'APK ne publie aucune révision) ;
3. append-only : une collecte identique n'écrit rien, une rectification du même
   millésime crée la révision suivante ;
4. best effort : pont absent ou incomplet, historique illisible, contrainte qui
   refuse la ligne → aucune exception remontée, un état et un motif, et le cache
   local reste la référence du moteur ;
5. PARITÉ AVEC LA MIGRATION 013 : chaque `source` produite est autorisée par la
   contrainte et chaque `source_url` satisfait son expression. Sans cette parité
   le module produirait des lignes que la base refuserait, et l'historisation
   échouerait en silence sur le téléphone ;
6. millésime futur : revenus 2027, aucune liste d'années à modifier.

Les VALEURS de ce jeu sont des fictures de forme (mêmes structures que celles
des lecteurs) ; les ADRESSES sont celles que les lecteurs produisent réellement
pour les revenus 2025 et 2027, et sont identiques à celles du test SQL
`tests/test_fiscal_sql_dgfip.py` — les deux jeux doivent rester alignés. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const dir = path.join(__dirname, '../app/src/main/assets/www/js');
const MODULE = path.join(dir, 'fiscal_historique_supabase.js');
const SQL_013 = path.join(__dirname, '../migrations/013_collectes_dgfip.sql');
const TABLE = 'pf2_fiscal_collectes';

/* ------------------------------------------------------------------ fixtures */
const BOFIP = {
    ir: 'https://bofip.impots.gouv.fr/bofip/2491-PGP.html/identifiant=BOI-IR-LIQ-20-10-20260407',
    decote: 'https://bofip.impots.gouv.fr/bofip/2495-PGP.html/identifiant=BOI-IR-LIQ-20-20-30-20260407',
    qf: 'https://bofip.impots.gouv.fr/bofip/2494-PGP.html/identifiant=BOI-IR-LIQ-20-20-20-20260407'
};
const SIMU = an => 'https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/' + (an + 1) + '/aides/';
const BROCHURE = 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/';
const REPAS = 'https://www.impots.gouv.fr/particulier/frais-de-repas';
const NOTICE_2086 = 'https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf';
const NOUVEAUTES = BROCHURE + 'ir_2026/pdf_som/nouveautes.pdf';

const KM = [{ cv: '3CV et moins', jusquA5000: 0.529 }];

/* Forme exacte de `preuvesParAnnee(annee)` : des caches NUS (pas d'enveloppe
   `.valeurs`), comme les lisent déjà fiscal_couverture.js et le moteur. */
function preuves(an, options) {
    const o = options || {};
    const p = {
        boi: {
            ir: { tranches: [11600, 29579, 84577, 181917], taux: [0, .11, .30, .41, .45] },
            decote: { dc: 897, dcCouple: 1483, dcPlafond: 1982, dcPlafondCouple: 3277 },
            qf: 1807,
            sources: {
                ir: { url: BOFIP.ir, datePublication: '07/04/' + (an + 1) },
                decote: { url: BOFIP.decote, datePublication: '07/04/' + (an + 1) },
                qf: { url: BOFIP.qf, datePublication: '07/04/' + (an + 1) }
            }
        },
        frais: { km: KM, abatt: { min: 509, max: 14555 }, repas: 5.45 },
        titres: { ir: .128, ps: .186, pfu: .314 },
        notice2086: { revenus: an, seuilFoyer: 305, ligne51: true, report3AN: true, option3CN: true },
        brochureCrypto: { revenus: an, irForfaitaire: .128, seuilFoyer: 305, case3CN: true },
        brochureRcm: { revenus: an, case2CG: true, case2BH: true, case2DF: true, csg68: .068 },
        chargesRcm: { revenus: an, case6DE: true, csgPatrimoine: 'revenus 2024 payée en 2025' },
        brochure: { revenus: an, declaration: an + 1, ancienTauxCsg: .092, nouveauTauxCsg: .106 },
        urls: {
            frais: SIMU(an) + 'frais.htm',
            repas: REPAS,
            gains: SIMU(an) + 'gains.htm',
            notice2086: NOTICE_2086,
            brochureRcm: BROCHURE + 'ir_' + (an + 1) + '/pdf_som/08-RCM_121a136.pdf',
            charges: BROCHURE + 'ir_' + (an + 1) + '/pdf_som/12-charges_ded_rev_225a236.pdf',
            brochureCrypto: BROCHURE + 'ir_' + (an + 1) + '/pdf_som/09-plus_values_137a156.pdf'
        }
    };
    if (o.sans) o.sans.forEach(k => { delete p[k]; if (p.urls) delete p.urls[k]; });
    if (o.mauvaiseAnnee) {
        // Un cache PDF d'un AUTRE millésime : ne doit jamais être historisé ici.
        p[o.mauvaiseAnnee] = Object.assign({}, p[o.mauvaiseAnnee], { revenus: an - 1 });
    }
    if (o.etatSeul) p[o.etatSeul] = { etat: 'PDF inaccessible', enregistree: false };
    if (o.decote) p.boi.decote = o.decote;
    return p;
}

/* ------------------------------------------------------------------- bouchon */
function charger(options) {
    const o = options || {};
    const appels = { select: [], insert: [] };
    const table = o.existantes ? o.existantes.slice() : [];
    /* PostgreSQL `jsonb` ne conserve pas l'ordre des clés : il les réordonne par
       longueur puis par octets. Un bouchon qui rendrait les objets dans l'ordre
       d'envoi masquerait ce comportement — et c'est précisément lui qui faisait
       dire « différent » à une collecte identique. */
    const reordonne = (v) => {
        if (Array.isArray(v)) return v.map(reordonne);
        if (v && typeof v === 'object') {
            const out = {};
            Object.keys(v).sort().reverse().forEach(k => { out[k] = reordonne(v[k]); });
            return out;
        }
        return v;
    };
    let ecritures = 0;
    const supabase = {
        select: (t, q) => {
            appels.select.push({ table: t, query: q });
            if (o.selectRefuse) return Promise.reject(new Error('Lecture impossible (réseau)'));
            if (o.selectNul) return Promise.resolve(null);
            const an = /annee_revenus=eq\.(\d+)/.exec(q || '');
            const rows = table.filter(r => !an || r.annee_revenus === Number(an[1]))
                .map(r => JSON.parse(JSON.stringify(r)));
            return Promise.resolve(o.jsonb ? rows.map(r => Object.assign({}, r,
                { valeurs: reordonne(r.valeurs) })) : rows);
        }
    };
    if (!o.sansInsert) {
        supabase.insert = (t, lignes) => {
            appels.insert.push({ table: t, lignes: JSON.parse(JSON.stringify(lignes)) });
            ecritures += 1;
            if (o.refus) {
                return Promise.reject(new Error('Écriture ' + t
                    + ' refusée : new row violates check constraint'));
            }
            if (o.erreurInsert) return Promise.reject(new Error(o.erreurInsert));
            if (o.conflit && ecritures <= o.conflit) {
                return Promise.reject(new Error('Écriture ' + t + ' refusée : duplicate key value '
                    + 'violates unique constraint "pf2_fiscal_collectes_pkey" (23505)'));
            }
            if (o.echecApres && ecritures > o.echecApres) {
                return Promise.reject(new Error('Écriture ' + t + ' refusée : ' + (o.erreurTardive
                    || 'new row violates check constraint "pf2_fiscal_collectes_source_url_check"')));
            }
            lignes.forEach(l => table.push(JSON.parse(JSON.stringify(l))));
            return Promise.resolve(lignes);
        };
    }
    const ctx = {
        console, Promise, Number, String, Object, Array, JSON, RegExp, Error, Math,
        PF: {
            net: o.sansPont ? {} : { supabase },
            fiscalBrochureSources: { url: NOUVEAUTES }
        }
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(MODULE, 'utf8'), ctx,
        { filename: 'fiscal_historique_supabase.js' });
    return { H: ctx.PF.fiscalHistorique, appels, table: () => table, ctx };
}

/* --------------------------------------------- contraintes de la migration 013 */
/* Les commentaires SQL contiennent des apostrophes françaises (« barème de
   l'impôt », « d'actifs numériques ») : les extraire sans retirer les
   commentaires décalerait toutes les chaînes. Aucun littéral de ce fichier ne
   contient « -- », le retrait est donc sans risque ici. */
function sansCommentaires(texte) { return texte.replace(/--.*$/gm, ''); }
const sql = sansCommentaires(fs.readFileSync(SQL_013, 'utf8'));

function sourcesPermises() {
    const bloc = /pf2_fiscal_collectes_source_check check \(source in \(([\s\S]*?)\)\);/.exec(sql);
    assert.ok(bloc, 'la contrainte de sources doit être présente dans la migration 013');
    return [...bloc[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

/* Chaque clause « or (source … and source_url …) » devient un prédicat évaluable
   en JavaScript : c'est la garantie que le module ne propose jamais une ligne que
   la base refuserait. */
function clausesUrl() {
    const bloc = /pf2_fiscal_collectes_source_url_check check \(([\s\S]*?)\n\s*\);/.exec(sql);
    assert.ok(bloc, 'la contrainte d’adresse doit être présente dans la migration 013');
    return bloc[1].split(/\n\s*or \(/).map(brut => {
        const texte = brut.replace(/^\s*\(/, '');
        const tete = texte.split(/\band\b/)[0];
        return {
            sources: [...tete.matchAll(/'([^']+)'/g)].map(m => m[1]),
            motifs: [...texte.matchAll(/source_url ~ '([^']+)'/g)].map(m => new RegExp(m[1])),
            litteraux: [...texte.matchAll(/source_url =\s*'([^']+)'/g)].map(m => m[1])
        };
    }).filter(c => c.sources.length);
}

function autorisee(ligne) {
    return clausesUrl().some(c => c.sources.includes(ligne.source)
        && (c.motifs.some(r => r.test(ligne.source_url))
            || c.litteraux.includes(ligne.source_url)));
}

/* Retire les commentaires JavaScript avant de chercher des millésimes : la
   documentation du module cite des années, son code exécutable ne doit en
   porter qu'une, la borne basse du périmètre DGFiP. */
function codeModule() {
    return fs.readFileSync(MODULE, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

/* ---------------------------------------------------------------------- tests */
const PERMISES = sourcesPermises();
const DGFIP = PERMISES.filter(s => s.startsWith('dgfip_'));

// 1) Les onze familles DGFiP du module sont exactement celles de la contrainte.
{
    const { H } = charger();
    const familles = H.familles();
    assert.equal(familles.length, 11, 'onze documents DGFiP sont historisables');
    assert.equal(DGFIP.length, 11, 'la migration 013 autorise onze sources DGFiP');
    familles.forEach(s => assert.ok(DGFIP.includes(s), s + ' doit être autorisée par la 013'));
    DGFIP.forEach(s => assert.ok(familles.includes(s), s + ' doit être produite par le module'));
    assert.ok(PERMISES.includes('openfisca_bareme_ir') && PERMISES.includes('openfisca_parametres'),
        'les sources OpenFisca historiques restent autorisées : aucune ligne orpheline');
    assert.equal(H.TABLE, TABLE);
    assert.ok(clausesUrl().length >= 7, 'les clauses d’adresse sont bien analysées');
}

// 2) Une collecte complète des revenus 2025 produit onze lignes conformes.
{
    const { H } = charger();
    const lignes = H.lignes(2025, preuves(2025));
    assert.equal(lignes.length, 11);
    lignes.forEach(l => {
        assert.equal(l.annee_revenus, 2025);
        assert.ok(DGFIP.includes(l.source), 'source autorisée : ' + l.source);
        assert.ok(l.source_url.startsWith('https://'), 'adresse https : ' + l.source_url);
        assert.equal(l.valeurs.document.url, l.source_url, 'le document pointe l’adresse lue');
        assert.equal(l.valeurs.document.annee_revenus, 2025);
        assert.ok(typeof l.valeurs.document.libelle === 'string'
            && l.valeurs.document.libelle.length > 3);
        assert.ok(autorisee(l), 'la contrainte d’adresse de la 013 doit accepter '
            + l.source + ' → ' + l.source_url);
    });
    // Les familles BOFiP portent la date de publication de la version lue.
    const ir = lignes.find(l => l.source === 'dgfip_bofip_ir');
    assert.equal(ir.valeurs.document.date_publication, '07/04/2026');
    assert.equal(ir.valeurs.bareme.tranches.join(','), '11600,29579,84577,181917');
    // Adresses identiques à celles du test SQL : les deux jeux restent alignés.
    assert.equal(ir.source_url, BOFIP.ir);
    assert.ok(lignes.some(l => l.source === 'dgfip_frais_repas' && l.source_url === REPAS));
    assert.ok(lignes.some(l => l.source === 'dgfip_notice_2086' && l.source_url === NOTICE_2086));
    assert.ok(lignes.some(l => l.source === 'dgfip_nouveautes' && l.source_url === NOUVEAUTES));
    assert.ok(lignes.some(l => l.source === 'dgfip_regimes_titres'
        && l.source_url === SIMU(2025) + 'gains.htm'));
}

// 3) Seuls les documents réellement lus sont proposés : rien n'est inventé.
{
    const { H } = charger();
    const partielles = H.lignes(2025, preuves(2025, { sans: ['titres', 'notice2086'] }));
    assert.ok(!partielles.some(l => l.source === 'dgfip_regimes_titres'),
        'sans PS titres lu, aucune ligne dgfip_regimes_titres');
    assert.ok(!partielles.some(l => l.source === 'dgfip_notice_2086'),
        'sans notice 2086 lue, aucune ligne dgfip_notice_2086');
    assert.equal(partielles.length, 9);

    // Une adresse absente interdit la ligne : la contrainte l'exige, et une
    // adresse devinée est interdite.
    const sansUrl = preuves(2025);
    sansUrl.urls.frais = null;
    assert.ok(!H.lignes(2025, sansUrl).some(l => l.source === 'dgfip_frais'),
        'sans adresse lue, aucune ligne — même avec des valeurs');

    // Un cache PDF d'un AUTRE millésime n'établit rien pour celui-ci.
    const autre = H.lignes(2025, preuves(2025, { mauvaiseAnnee: 'brochureRcm' }));
    assert.ok(!autre.some(l => l.source === 'dgfip_brochure_rcm'),
        'un cache RCM des revenus 2024 ne doit pas être historisé pour 2025');

    // Un état d'échec n'est pas une valeur.
    const echec = H.lignes(2025, preuves(2025, { etatSeul: 'chargesRcm' }));
    assert.ok(!echec.some(l => l.source === 'dgfip_brochure_charges'),
        '« PDF inaccessible » ne doit produire aucune ligne');

    // Millésimes refusés : rien avant le périmètre DGFiP, rien sans preuves.
    assert.equal(H.lignes(2022, preuves(2022)).length, 0, '2022 hors périmètre DGFiP');
    assert.equal(H.lignes(2025, null).length, 0);
    assert.equal(H.lignes(2025, {}).length, 0);
    assert.equal(H.lignes('abc', preuves(2025)).length, 0);
}

// 4) Aucune donnée personnelle, et jamais la table des règles publiées.
async function ecritureInitiale() {
    const { H, appels, table } = charger();
    const lignes = H.lignes(2025, preuves(2025));
    const INTERDITS = ['numeroFiscal', 'nom', 'prenom', 'adresse', 'email', 'telephone', 'siren',
        'declarant', 'conjoint', 'situationFamiliale', 'tauxPersonnalise', 'tauxPas', 'pas',
        'revenuFiscalDeReference', 'parts', 'iban', 'montant', 'solde', 'valeur', 'transactions',
        'user_id', 'proprietaire'];
    lignes.forEach(l => {
        assert.equal(JSON.stringify(Object.keys(l).sort()).replace(/"/g, ''),
            '[annee_revenus,source,source_url,valeurs]',
            'une ligne ne porte que ces quatre champs avant insertion');
        const texte = JSON.stringify(l.valeurs).toLowerCase();
        INTERDITS.forEach(k => assert.ok(!texte.includes('"' + k.toLowerCase() + '"'),
            'clé personnelle interdite dans valeurs : ' + k));
    });

    const r = await H.historiser(2025, preuves(2025));
    assert.equal(r.etat, 'historisée');
    assert.equal(r.ajoutees.length, 11);
    assert.equal(r.corrigees.length, 0);
    assert.equal(r.revisionPubliee, false, 'aucune règle n’est publiée par ce module');
    assert.match(r.motif, /11 document\(s\) écrit\(s\) dans pf2_fiscal_collectes/);
    assert.equal(table().length, 11);

    // Une insertion par document, séquentielle, toujours sur la seule table
    // d'historique : la table des règles publiées n'est jamais approchée.
    assert.equal(appels.insert.length, 11);
    appels.insert.forEach(c => {
        assert.equal(c.table, TABLE, 'seule pf2_fiscal_collectes est écrite');
        assert.equal(c.lignes.length, 1, 'insertion séquentielle, une ligne à la fois');
        assert.equal(c.lignes[0].revision, 1, 'première écriture : révision 1');
    });
    appels.select.forEach(c => assert.equal(c.table, TABLE));
    assert.ok(!JSON.stringify(appels).includes('pf2_fiscal_annees'),
        'pf2_fiscal_annees ne doit jamais apparaître dans les appels');
    assert.doesNotMatch(codeModule(), /pf2_fiscal_annees/,
        'le code exécutable du module ne référence pas la table des règles publiées');
    assert.match(appels.select[0].query, /annee_revenus=eq\.2025/);
    assert.match(appels.select[0].query, /order=revision\.desc/);
}

// 5) Append-only : identique ⇒ rien ; rectification ⇒ révision suivante.
async function appendOnly() {
    const { H, appels, table } = charger();
    await H.historiser(2025, preuves(2025));
    const premiere = appels.insert.length;
    assert.equal(table().length, 11);

    // Même collecte : aucune écriture, aucune révision fantôme.
    const seconde = await H.historiser(2025, preuves(2025));
    assert.equal(seconde.etat, 'inchangée');
    assert.equal(appels.insert.length, premiere, 'une collecte identique n’écrit rien');
    assert.equal(seconde.ignorees.length, 11);
    assert.equal(seconde.ajoutees.length + seconde.corrigees.length, 0);
    assert.equal(table().length, 11);

    // Rectification du même millésime : seule la famille concernée est réécrite,
    // à la révision 2 ; les autres restent ignorées.
    const corrigee = await H.historiser(2025, preuves(2025, {
        decote: { dc: 900, dcCouple: 1490, dcPlafond: 1990, dcPlafondCouple: 3290 }
    }));
    assert.equal(corrigee.etat, 'historisée');
    assert.equal(JSON.stringify(corrigee.corrigees), '["dgfip_bofip_decote"]');
    assert.equal(JSON.stringify(corrigee.ajoutees), '[]');
    assert.equal(corrigee.ignorees.length, 10);
    assert.equal(table().length, 12, 'append-only : la révision 1 reste présente');
    const decote = table().filter(r => r.source === 'dgfip_bofip_decote');
    assert.equal(JSON.stringify(decote.map(r => r.revision).sort()), '[1,2]');
    assert.equal(decote.find(r => r.revision === 1).valeurs.decote.dc, 897,
        'la révision 1 n’est jamais écrasée');
    assert.equal(decote.find(r => r.revision === 2).valeurs.decote.dc, 900);

    // Un historique déjà fourni par le serveur enchaîne les révisions.
    const { H: H2 } = charger({ existantes: [{ annee_revenus: 2024, source: 'dgfip_bofip_ir',
        revision: 3, valeurs: { bareme: { tranches: [1] } }, source_url: 'https://x.invalid/a' }] });
    const suite = await H2.historiser(2024, preuves(2024));
    const irEcrit = suite && H2.lignes(2024, preuves(2024)).find(l => l.source === 'dgfip_bofip_ir');
    assert.ok(irEcrit, 'la famille BOFiP IR est bien proposée pour 2024');
    assert.equal(suite.etat, 'historisée');
}

// 6) Best effort : aucun échec ne remonte, chacun est expliqué.
async function bestEffort() {
    // Pont Supabase absent (APK sans session, ou module net non chargé).
    const sansPont = charger({ sansPont: true });
    const r1 = await sansPont.H.historiser(2025, preuves(2025));
    assert.equal(r1.etat, 'non historisée');
    assert.match(r1.motif, /pont Supabase absent/);
    assert.equal(sansPont.appels.insert.length, 0);
    assert.equal(r1.revisionPubliee, false);

    // Pont incomplet : lecture présente, écriture absente.
    const sansInsert = charger({ sansInsert: true });
    const r2 = await sansInsert.H.historiser(2025, preuves(2025));
    assert.equal(r2.etat, 'non historisée');
    assert.match(r2.motif, /pont Supabase absent/);
    assert.equal(sansInsert.appels.insert.length, 0);

    // Historique illisible : le SELECT rend la main vide.
    const selectNul = charger({ selectNul: true });
    const r3a = await selectNul.H.historiser(2025, preuves(2025));
    assert.equal(r3a.etat, 'non historisée');
    assert.match(r3a.motif, /historique illisible/);

    // Historique illisible : réseau en échec sur le SELECT.
    const selectRefuse = charger({ selectRefuse: true });
    const r3 = await selectRefuse.H.historiser(2025, preuves(2025));
    assert.equal(r3.etat, 'non historisée');
    assert.match(r3.motif, /historique illisible/);
    assert.equal(selectRefuse.appels.insert.length, 0, 'rien n’est écrit sans historique lisible');

    // Contrainte qui refuse la ligne : migration 013 non appliquée en production.
    const refus = charger({ refus: true });
    const r4 = await refus.H.historiser(2025, preuves(2025));
    assert.equal(r4.etat, 'non historisée');
    assert.match(r4.motif, /migration 013/, 'le motif doit nommer la migration attendue');
    assert.match(r4.motif, /refusée/);
    assert.ok(r4.motif.length < 320, 'le motif reste affichable sur téléphone');

    // Rien à historiser : aucun document de ce millésime lu.
    const vide = charger();
    const r5 = await vide.H.historiser(2025, {});
    assert.equal(r5.etat, 'rien à historiser');
    assert.equal(vide.appels.insert.length, 0);
    assert.equal(vide.appels.select.length, 0, 'sans candidat, aucune lecture réseau');

    // Aucune exception ne sort du module, même sur des entrées absurdes.
    const { H } = charger();
    await assert.doesNotReject(H.historiser(2025, preuves(2025)));
    await assert.doesNotReject(H.historiser(2025, undefined));
    await assert.doesNotReject(H.historiser(undefined, undefined));
    await assert.doesNotReject(H.consulter(2025));
}

// 7) Millésime futur : revenus 2027, aucune liste d'années à modifier.
{
    const { H } = charger();
    const lignes = H.lignes(2027, preuves(2027));
    assert.equal(lignes.length, 11, 'les revenus 2027 s’historisent comme 2025');
    lignes.forEach(l => {
        assert.equal(l.annee_revenus, 2027);
        assert.equal(l.valeurs.document.annee_revenus, 2027);
        assert.ok(autorisee(l), 'la contrainte 013 accepte les adresses 2027 : ' + l.source);
    });
    // Le code exécutable ne porte qu'un millésime : la borne basse du périmètre
    // DGFiP. `2086` est le NUMÉRO du formulaire, pas une année — il est écarté.
    const annees = [...codeModule().matchAll(/\b(20\d{2})\b/g)]
        .map(m => Number(m[1])).filter(a => a !== 2086);
    assert.equal(JSON.stringify([...new Set(annees)]), '[2023]',
        'aucun millésime n’est énuméré dans le code : 2027, 2028… fonctionnent sans modification');
}

// 8) L'état affiché reste court, sans adresse, et dit la vérité.
{
    const { H } = charger();
    const textes = [
        H.texte(2025, { etat: 'historisée', ajoutees: ['a'], corrigees: [], ignorees: [] }),
        H.texte(2025, { etat: 'historisée', ajoutees: ['a', 'b'], corrigees: ['c'], ignorees: ['d'] }),
        H.texte(2025, { etat: 'inchangée' }),
        H.texte(2025, { etat: 'rien à historiser' }),
        H.texte(2025, { etat: 'non historisée', motif: 'pont Supabase absent' }),
        H.texte(2025, undefined)
    ];
    textes.forEach(t => {
        assert.match(t, /Revenus 2025|Collecte des revenus 2025/);
        assert.ok(t.length < 220, 'une phrase d’état, pas un rapport : ' + t.length);
        assert.doesNotMatch(t, /https?:/, 'aucune adresse dans la ligne d’état');
    });
    assert.match(textes[0], /historisée dans Supabase : 1 document/);
    assert.match(textes[1], /3 document\(s\) écrit\(s\), 1 déjà à l’identique/);
    assert.match(textes[2], /déjà historisée à l’identique/);
    assert.match(textes[3], /rien à historiser/);
    assert.match(textes[4], /NON historisée/);
    assert.match(textes[4], /pont Supabase absent/);
    assert.match(textes[5], /raison inconnue/);
}

// 9) Le module est câblé : chargé par index.html, appelé par le bouton.
{
    const index = fs.readFileSync(path.join(dir, '../index.html'), 'utf8');
    assert.match(index, /<script src="js\/fiscal_historique_supabase\.js"><\/script>/,
        'le module doit être chargé par la page');
    assert.ok(index.indexOf('fiscal_couverture.js') < index.indexOf('fiscal_historique_supabase.js'),
        'chargé après la couverture');
    assert.ok(index.indexOf('fiscal_historique_supabase.js')
        < index.indexOf('fiscal_crypto_ps_recoupement.js'), 'chargé avant le recoupement');

    const fiscal = fs.readFileSync(path.join(dir, 'fiscal.js'), 'utf8');
    assert.match(fiscal, /function historiserCollectes\(/, 'le bouton appelle l’historisation');
    assert.match(fiscal, /PF\.fiscalHistorique\.historiser\(an, preuves\)/);
    assert.match(fiscal, /return historiserCollectes\(resultats\.map\(function \(r\) \{ return r\.annee; \}\)\)/,
        'l’historisation porte sur chaque millésime collecté');
    assert.match(fiscal, /clauseSupabase\(r\.historique\)/, 'le résumé copiable dit l’état');
    assert.match(fiscal, /PF\.fiscalHistorique\.texte\(annee, resultat\.historique\)/,
        'le bilan détaillé dit l’état');
    assert.match(fiscal, /catch\(function \(\) \{ \/\* jamais bloquant \*\/ }\)/,
        'un échec d’historisation ne bloque pas la collecte');
    assert.match(fiscal, /historiques = Object\.create\(null\);\s*\/\/ ni état d'historisation/,
        'l’état d’un compte ne survit pas au changement de compte');
    // L'application ne publie toujours aucune règle : seule la collecte est écrite.
    assert.doesNotMatch(fiscal, /supabase\.insert\('pf2_fiscal_annees'/);
    assert.doesNotMatch(fiscal, /supabase\.upsert\('pf2_fiscal_annees'/);
}

/* --------------------------------------------------------------- régressions
   Quatre défauts observés ou déduits du retour réel du 15/10/2026 (revenus 2023
   historisé, revenus 2024 et 2025 « NON historisé » sans raison affichée). */

// 10) jsonb réordonne les clés : une collecte identique relue depuis la base doit
//     rester « inchangée ». Sans cette garde, CHAQUE clic recréait une révision.
async function jsonbReordonne() {
    const { H, appels, table } = charger();
    await H.historiser(2025, preuves(2025));
    assert.equal(table().length, 11);
    const avant = appels.insert.length;

    const relue = charger({ existantes: table(), jsonb: true });
    const r = await relue.H.historiser(2025, preuves(2025));
    assert.equal(r.etat, 'inchangée',
        'des clés réordonnées par jsonb ne font pas une collecte différente');
    assert.equal(relue.appels.insert.length, 0, 'aucune révision fantôme au deuxième clic');
    assert.equal(r.ignorees.length, 11);
    assert.ok(avant === 11);

    // Une VRAIE différence reste détectée malgré le réordonnancement.
    const modifiee = charger({ existantes: table(), jsonb: true });
    const r2 = await modifiee.H.historiser(2025, preuves(2025, {
        decote: { dc: 900, dcCouple: 1483, dcPlafond: 1982, dcPlafondCouple: 3277 } }));
    assert.equal(r2.etat, 'historisée');
    assert.equal(JSON.stringify(r2.corrigees), '["dgfip_bofip_decote"]',
        'seule la valeur réellement changée est réécrite');
}

// 11) Conflit 23505 (deux clics, deux appareils) : relire et réessayer, comme le
//     fait déjà fiscal_sources.js pour OpenFisca. Jamais UPDATE ni UPSERT.
async function conflitRevision() {
    const { H, appels, table } = charger({ conflit: 1 });
    const r = await H.historiser(2025, preuves(2025));
    assert.equal(r.etat, 'historisée', 'un conflit de révision se résout par relecture');
    assert.equal(r.ajoutees.length, 11);
    assert.equal(table().length, 11, 'les onze documents finissent écrits, une seule fois chacun');
    assert.ok(appels.select.length >= 2, 'le conflit provoque une relecture de l’historique');
    assert.equal(new Set(table().map(l => l.source + '#' + l.revision)).size, 11,
        'aucun doublon de (source, revision)');
    assert.ok(table().every(l => l.revision === 1));

    // Un conflit qui persiste au-delà des relectures ne boucle pas indéfiniment.
    const bloque = charger({ conflit: 99 });
    const r2 = await bloque.H.historiser(2025, preuves(2025));
    assert.equal(r2.etat, 'non historisée');
    assert.match(r2.motif, /conflit de révision/, 'le conflit doit être nommé comme tel');
    assert.doesNotMatch(r2.motif, /migration 013/,
        'un conflit n’est pas une migration absente : ne pas envoyer sur une fausse piste');
    assert.ok(bloque.appels.insert.length <= 33, 'nombre de tentatives borné');
}

// 12) Diagnostic honnête : chaque code d'erreur a sa cause. Attribuer tout refus à
//     la migration 013 était le défaut qui rendait le retour du téléphone muet.
async function diagnosticParCause() {
    const cas = [
        ['Écriture pf2_fiscal_collectes refusée : {"code":"42501","message":"row-level security"}',
            /droits insuffisants/i, /migration 013/],
        ['Écriture pf2_fiscal_collectes refusée : {"code":"401","message":"JWT expired"}',
            /session expirée|reconnecter/i, /migration 013/],
        ['Écriture pf2_fiscal_collectes refusée : {"code":"429","message":"rate limit"}',
            /cadence/i, /migration 013/],
        ['Écriture pf2_fiscal_collectes refusée : duplicate key value violates unique (23505)',
            /conflit de révision/i, /migration 013/],
        ['Écriture pf2_fiscal_collectes refusée : new row violates check constraint (23514)',
            /migration 013/, null],
        ['Lecture pf2_fiscal_collectes impossible (réseau)', /historique illisible/, /migration 013/]
    ];
    for (const [message, attendu, interdit] of cas) {
        const { H, appels } = charger({ erreurInsert: message, selectRefuse: /^Lecture/.test(message) });
        const r = await H.historiser(2025, preuves(2025));
        assert.equal(r.etat, 'non historisée');
        assert.match(r.motif, attendu, 'motif pour : ' + message);
        if (interdit) assert.doesNotMatch(r.motif, interdit, 'fausse piste pour : ' + message);
        assert.equal(r.revisionPubliee, false);
        assert.ok(appels.insert.every(c => c.table === 'pf2_fiscal_collectes'));
    }
}

// 13) Échec partiel : les lignes déjà écrites restent en base (append-only) et
//     DOIVENT être dites — sinon on croit à tort que rien n'est parti.
async function echecPartiel() {
    const { H, appels, table } = charger({ echecApres: 3 });
    const r = await H.historiser(2025, preuves(2025));
    assert.equal(r.etat, 'non historisée');
    assert.equal(r.ajoutees.length, 3, 'les trois écritures réussies sont comptées');
    assert.equal(table().length, 3, 'elles sont bien en base, et aucune n’est retirée');
    assert.match(r.motif, /contrainte|migration 013/i);
    assert.ok(appels.insert.length >= 4);

    // Le résumé copiable doit le dire, sans adresse et sans exploser la limite.
    const resume = resumeAvec(r);
    assert.match(resume, /3 document\(s\) écrit\(s\), puis NON historisé/);
    assert.doesNotMatch(resume.slice(resume.indexOf('Supabase')), /https?:/);
}

// 14) Le résumé court porte la RAISON : sans elle, le retour du téléphone ne
//     permettait aucun diagnostic (c'est exactement ce qui s'est produit).
function resumeAvec(historique) {
    const ctx2 = { PF: { ui: { h: s => String(s) }, store: { reglages: () => ({}) } },
        Date, Number, String };
    ctx2.globalThis = ctx2;
    vm.createContext(ctx2);
    vm.runInContext(fs.readFileSync(path.join(dir, 'fiscal.js'), 'utf8'), ctx2,
        { filename: 'fiscal.js' });
    return ctx2.PF.fiscal.resumeRapport(2025, { boi: {}, frais: {}, historique });
}
async function raisonDansLeResume() {
    const long = 'Écriture pf2_fiscal_collectes refusée : '
        + 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co/rest/v1/pf2_fiscal_collectes '
        + 'x'.repeat(400);
    const r = resumeAvec({ etat: 'non historisée', motif: long,
        ajoutees: [], corrigees: [], ignorees: [] });
    assert.match(r, /NON historisé — /, 'la raison doit apparaître dans le résumé copiable');
    assert.doesNotMatch(r, /https?:/, 'aucune adresse dans le résumé');
    assert.ok(r.length < 600, 'le résumé reste copiable en un message : ' + r.length);

    const sansMotif = resumeAvec({ etat: 'non historisée',
        ajoutees: [], corrigees: [], ignorees: [] });
    assert.match(sansMotif, /raison inconnue/, 'un motif absent doit être dit, pas tu');
}

Promise.resolve()
    .then(() => ecritureInitiale())
    .then(() => appendOnly())
    .then(() => bestEffort())
    .then(() => jsonbReordonne())
    .then(() => conflitRevision())
    .then(() => diagnosticParCause())
    .then(() => echecPartiel())
    .then(() => raisonDansLeResume())
    .then(() => console.log('Historisation Supabase des collectes DGFiP : écritures, append-only, '
        + 'best effort, millésime futur, parité 013, jsonb, conflit 23505, diagnostic par cause '
        + 'et raison dans le résumé OK'))
    .catch(e => { console.error(e); process.exit(1); });
