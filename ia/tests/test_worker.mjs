/* Tests du service IA — exécutés sans réseau réel : le faux Cloudflare, le faux
   moteur de recherche et les fausses pages suffisent.
   Ce qu'ils verrouillent, dans l'ordre du cahier des charges :
     1. la réponse commence par « Selon le corpus, » ;
     2. le second bloc commence par « En me basant sur tes données, sur le corpus
        et sur les informations extérieures que j'ai trouvées, » ;
     3. l'horizon de long terme (retraite 2055) est transmis au modèle ;
     4. la recherche extérieure complète le corpus, ses sources sont numérotées
        [E1], et un chiffre qui n'existe que côté web est signalé comme tel ;
     5. une question peut désactiver la recherche extérieure (`web:false`) ;
     6. si le modèle oublie la structure, une seconde passe la rétablit ;
     7. l'indexation reste sans doublon et le compte vient de l'index. */

import worker from '../worker/src/index.js';

const ANNEE_COURANTE = new Date().getUTCFullYear();

// --- Le faux web. Aucune requête ne sort de la machine.
const PAGE_URL = 'https://exemple.test/or-et-moyenne-mobile';
const PAGE_HTML = `<html><head><style>p{color:red}</style></head><body>
<nav>Menu Accueil Contact</nav>
<article><p>La moyenne mobile sept ans de l'or se lit sur le cours en dollars. Une cassure durable
s'observe quand le prix clôture sous sa moyenne mobile pendant plusieurs mois consécutifs.</p>
<p>Cette règle est utilisée comme un signal de tendance de fond, pas comme un signal de court terme :
elle a donné 3,8 % de rendement réel annualisé sur les périodes étudiées.</p></article>
<script>console.log('bruit')</script></body></html>`;

const HTML_DDG = `<html><body>
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(PAGE_URL)}&amp;rut=abc">Or et moyenne mobile 7 ans</a></h2>
    <a class="result__snippet">La moyenne mobile sept ans sert de jauge de tendance de fond sur l'or.</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://exemple.test/banque-centrale')}&amp;rut=def">Banques centrales et or</a></h2>
    <a class="result__snippet">Les achats des banques centrales soutiennent la demande d'or depuis 2022.</a>
  </div>
</div>
</body></html>`;

let modeWeb = 'resultats';   // 'resultats' | 'vide'
let appelsWeb = [];
const vraieFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const u = String(url);
  appelsWeb.push(u);
  if (modeWeb === 'vide') return new Response('', { status: 404 });
  if (u.includes('duckduckgo')) return new Response(HTML_DDG, { status: 200, headers: { 'content-type': 'text/html' } });
  if (u.startsWith(PAGE_URL)) return new Response(PAGE_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  return new Response('', { status: 404 });
};

// Réponse attendue quand seul le corpus parle : aucun chiffre extérieur.
const REPONSE_CORPUS = `Selon le corpus, la règle de la moyenne mobile longue sert de jauge de tendance de fond [1].
En me basant sur tes données, sur le corpus et sur les informations extérieures que j'ai trouvées, le rendement observé de 12,5 % [1] plaide pour la patience à l'horizon 2055.
Ce qui dépend de toi : la décision de couper une poche reste la tienne.`;

// Réponse attendue quand une page extérieure a été lue : elle est citée [E1].
const REPONSE_EXTERNE = `Selon le corpus, ce point n'y est pas traité.
En me basant sur tes données, sur le corpus et sur les informations extérieures que j'ai trouvées, la page lue indique 3,8 % de rendement réel annualisé [E1], ce qui plaide pour la patience à l'horizon 2055.
Ce qui dépend de toi : la décision de couper une poche reste la tienne.`;

const REPONSE_HORS_FORME = `L'or a cassé sa moyenne mobile. Il faut peut-être vendre.`;

function env(avecPassage = false, options = {}) {
  const store = new Map();
  const journal = { insert: 0, upsert: 0, vecteurs: new Set(), prompts: [], appelsModele: 0, historiques: [] };
  return {
    CLE_SERVICE: 'service-test', CLE_ADMIN: 'admin-test',
    MODELE_GENERATION: 'test', MODELE_EMBEDDING: 'test',
    HORIZON_ANNEE: options.horizon,
    TEMPS_MAX: options.tempsMax,
    TEMPS_RECHERCHE: options.tempsRecherche,
    AI: {
      run: async (model, input) => {
        if (input.text) return { data: input.text.map(() => [.1, .2]) };
        journal.appelsModele++;
        journal.prompts.push(input.messages[0].content);
        journal.historiques.push(input.messages.slice(1).map(m => m.role + ':' + m.content));
        if (options.modele === 'pendant') return new Promise(() => { /* ne répond jamais */ });
        const sortie = typeof options.reponse === 'function' ? options.reponse(journal.appelsModele, input) : options.reponse;
        if (sortie) return { response: sortie };
        return { response: avecPassage ? REPONSE_CORPUS : REPONSE_EXTERNE };
      }
    },
    VECTORIZE: {
      query: async () => ({ matches: avecPassage ? [{ id: 'a', score: .81, metadata: { titre: 'Texte test', source: 'IDL', date: '2025-01-01', url: 'https://example.test', texte: 'La moyenne mobile longue est une jauge de tendance de fond. Le rendement observé est 12,5 %.' } }] : [] }),
      describe: async () => ({ vectorCount: avecPassage ? 1 : journal.vecteurs.size }),
      insert: async v => { journal.insert += (v || []).length; },
      upsert: async v => { (v || []).forEach(x => journal.vecteurs.add(x.id)); journal.upsert += (v || []).length; },
      getByIds: async ids => (ids || []).filter(id => journal.vecteurs.has(id)).map(id => ({ id }))
    },
    CACHE: { get: async k => store.get(k) || null, put: async (k, v) => store.set(k, v) },
    journal
  };
}

async function post(e, q, corps = {}) {
  const r = await worker.fetch(new Request('https://x/discussion', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cle-service': 'service-test' }, body: JSON.stringify({ question: q, ...corps }) }), e);
  return r.json();
}
async function admin(e, route, corps, cle = 'admin-test') {
  return worker.fetch(new Request('https://x' + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cle-admin': cle }, body: JSON.stringify(corps || {}) }), e);
}
let erreurs = 0;
function test(n, condition) { if (condition) console.log('✔', n); else { console.error('✗', n); erreurs++; } }

// --- 1. La tournure imposée et les sources ---------------------------------
const avecCorpus = await post(env(true, { reponse: () => REPONSE_CORPUS }), 'Que dit le corpus sur la moyenne mobile 7 ans de l’or ?');
test('le premier bloc commence par « Selon le corpus, »', avecCorpus.reponse.startsWith('Selon le corpus,'));
test('le second bloc reprend la phrase imposée', /En me basant sur tes données, sur le corpus et sur les informations extérieures que j’ai trouvées,|En me basant sur tes données, sur le corpus et sur les informations extérieures que j'ai trouvées,/.test(avecCorpus.reponse));
test('la structure est reconnue comme conforme', avecCorpus.format.conforme === true);
test('une source du corpus est rendue', avecCorpus.sources.length === 1 && avecCorpus.sources[0].titre === 'Texte test');
test('chiffre du corpus accepté', avecCorpus.verification.verifie === true && avecCorpus.verification.suspects.length === 0);

// --- 2. Le corpus muet ne se fait jamais passer pour une source ------------
modeWeb = 'vide';
const sansCorpus = await post(env(false), 'Que dit le corpus sur les obligations japonaises ?');
test('corpus muet : la phrase de silence est imposée', sansCorpus.reponse.startsWith("Selon le corpus, ce point n'y est pas traité."));
test('corpus muet et rien à l’extérieur : interprétation signalée', sansCorpus.interpretation === true);
test('aucun résultat extérieur : la recherche est signalée comme vaine', sansCorpus.internet.utilise === true && sansCorpus.sourcesExternes.length === 0);
modeWeb = 'resultats';

// --- 3. L'horizon de long terme est transmis au modèle ---------------------
const e3 = env(true, { horizon: 2055 });
const horizon = await post(e3, 'Dois-je alléger la poche énergie ?', { contexte: { capitalInvesti: 80000 } });
test('l’horizon 2055 est dans le prompt du modèle', e3.journal.prompts.every(p => p.includes('2055')));
test('le nombre d’années restantes est calculé', horizon.horizon.anneeDepartRetraite === 2055 && horizon.horizon.anneesRestantes === 2055 - ANNEE_COURANTE);
test('l’objectif de retraite est rappelé au modèle', e3.journal.prompts.some(p => /retraite/i.test(p) && /pouvoir d'achat|revenu réel/i.test(p)));
test('le prompt ordonne de traiter le court terme comme du bruit', e3.journal.prompts.some(p => /bruit/i.test(p)));

// --- 4. La recherche extérieure complète le corpus -------------------------
const avant = appelsWeb.length;
const questionActuelle = 'Où en est la moyenne mobile 7 ans de l’or aujourd’hui ?';
const avecWeb = await post(env(false), questionActuelle, { contexte: { capitalInvesti: 80000 }, web: true });
const appels = appelsWeb.slice(avant);
test('la recherche extérieure a bien été lancée', appels.some(u => u.includes('duckduckgo')));
test('les résultats extérieurs sont numérotés [E1]', avecWeb.sourcesExternes.length > 0 && avecWeb.sourcesExternes[0].numero === 'E1');
test('l’URL réelle est décodée, pas celle du moteur', avecWeb.sourcesExternes.some(s => s.url === PAGE_URL));
test('le domaine est exposé pour l’affichage', avecWeb.sourcesExternes.some(s => s.domaine === 'exemple.test'));
test('la page a été lue et son texte transmis au modèle', avecWeb.internet.pagesLues >= 1);
test('le chiffre venu du web est signalé comme extérieur', (avecWeb.verification.externes || []).some(x => x.includes('3,8')));
test('le chiffre extérieur n’est pas traité comme une invention', avecWeb.verification.gravite === 'info' || avecWeb.verification.gravite === null);

// --- 5. On peut couper la recherche extérieure -----------------------------
const avantCoupe = appelsWeb.length;
const sansWeb = await post(env(true), 'Dois-je rééquilibrer ?', { web: false });
test('web:false ne lance aucune requête extérieure', appelsWeb.length === avantCoupe);
test('web:false est signalé dans la réponse', sansWeb.internet.utilise === false);

// --- 6. Passe de remise en forme -------------------------------------------
const e6 = env(true, { reponse: (n) => (n === 1 ? REPONSE_HORS_FORME : REPONSE_CORPUS) });
const repare = await post(e6, 'Faut-il vendre l’or ?');
test('une seconde passe rétablit la structure', repare.format.conforme === true && repare.format.repasse === true);
test('la seconde passe ne garde pas la réponse hors forme', !repare.reponse.includes('Il faut peut-être vendre'));

// --- 6bis. Cas limites de la structure -------------------------------------
const REPONSE_SANS_DONNEES = `Selon le corpus, la règle de tendance est posée [1].
En me basant sur le corpus et sur les informations extérieures que j'ai trouvées, la tendance de fond est la seule chose qui compte ici.
Ce qui dépend de toi : la décision reste la tienne, mais aucune donnée de portefeuille n'a été jointe.`;
const e8 = env(true, { reponse: () => REPONSE_SANS_DONNEES });
const sansDonnees = await post(e8, 'Que disent les vidéos sur l’or ?');
test('sans données jointes : le modèle est prévenu et la structure reste valide', sansDonnees.format.conforme === true && e8.journal.prompts.every(p => p.includes('AUCUNE DONNÉE DE PORTEFEUILLE')));
test('sans données jointes : la phrase imposée s’adapte', !sansDonnees.reponse.includes('tes données') && /En me basant sur le corpus/.test(sansDonnees.reponse));

const REPONSE_SANS_EXTERNE = `Selon le corpus, ce point n'y est pas traité.
Je n'ai trouvé aucune information extérieure exploitable cette fois-ci. L'analyse s'appuie donc sur tes données et le corpus seuls.
Ce qui dépend de toi : la décision reste la tienne.`;
modeWeb = 'vide';
const e9 = env(false, { reponse: () => REPONSE_SANS_EXTERNE });
const rienTrouve = await post(e9, 'Que dire de la poche obligations ?');
test('rien trouvé à l’extérieur : la structure reste conforme, sans seconde passe', rienTrouve.format.conforme === true && rienTrouve.format.repasse === false);
modeWeb = 'resultats';

// --- 7. Historique de conversation ----------------------------------------
const e7 = env(true);
await post(e7, 'Et l’or, alors ?', { historique: [{ role: 'user', contenu: 'Parle-moi des poches' }, { role: 'assistant', contenu: 'La poche réserve de valeur…' }] });
test('l’historique de conversation est transmis au modèle', e7.journal.historiques.some(h => h.join('|').includes('user:Parle-moi des poches')));

// --- 8. État du service ----------------------------------------------------
const sante = await (await worker.fetch(new Request('https://x/sante'), env(true))).json();
test('date et compte exposables', sante.corpus.passages === 1 && 'majLe' in sante.corpus);
test('la version et l’horizon sont exposés', sante.version === '1.7.1' && sante.horizon.anneeDepartRetraite === 2055);
test('les budgets de temps sont exposés', sante.budgets.totalS === 22 && sante.budgets.rechercheS === 8);

// --- 9. L'indexation : reprise, doublons, compte réel ----------------------
const e2 = env(false);
const r1 = await (await admin(e2, '/admin/indexation', {
  morceaux: [
    { id: 'c-1', texte: 'Premier passage du corpus, assez long pour être mesuré.', source: 'IDL', titre: 'A' },
    { id: 'c-2', texte: 'Deuxième passage.', source: 'IDL', titre: 'B' },
    { id: 'c-2', texte: 'Doublon du deuxième passage.', source: 'IDL', titre: 'B' }
  ]
})).json();
test('indexation : le doublon du lot n’est pas renvoyé', r1.inseres === 2 && r1.ignores === 1);
test('indexation : upsert et jamais insert', e2.journal.upsert === 2 && e2.journal.insert === 0);
test('indexation : compte réel de l’index', r1.corpus.vecteurs === 2 && r1.corpus.passages === 2);
test('clé admin exigée', (await admin(e2, '/admin/indexation', { morceaux: [{ id: 'x', texte: 'y' }] }, 'mauvaise-cle')).status === 401);

const presents = await (await admin(e2, '/admin/presents', { ids: ['c-1', 'c-2', 'inconnu'] })).json();
test('presents : ce que l’index contient déjà', presents.presents.length === 2 && !presents.presents.includes('inconnu'));
test('presents : clé admin exigée', (await admin(e2, '/admin/presents', { ids: ['c-1'] }, 'mauvaise-cle')).status === 401);

// Un passage déjà indexé renvoyé volontairement : il remplace, sans doubler le compte.
const r2 = await (await admin(e2, '/admin/indexation', { morceaux: [{ id: 'c-1', texte: 'Premier passage, corrigé.', source: 'IDL', titre: 'A' }] })).json();
test('réenvoi d’un passage connu : le compte ne bouge pas', r2.corpus.vecteurs === 2 && r2.inseres === 1);

// --- 10. Le garde-temps : une recherche qui traîne ne vole plus l'écriture ---
/* Le défaut corrigé en 1.7.1 : la recherche extérieure pouvait consommer 27 s à
   elle seule (trois moteurs × 9 s), et Cloudflare comme Android coupaient la
   réponse avant que le modèle n'écrive. Ici le moteur ne répond JAMAIS : le
   service doit malgré tout rendre une réponse, dans le budget qu'on lui donne. */
const fetchNormal = globalThis.fetch;
globalThis.fetch = async () => new Promise(() => { /* ne se résout jamais */ });

const e10 = env(true, { horizon: 2055, reponse: () => REPONSE_CORPUS, tempsMax: 8, tempsRecherche: 2 });
const debut10 = Date.now();
const reponseLente = await post(e10, 'Où en est l’or aujourd’hui ?', { web: true, contexte: { capitalInvesti: 80000 } });
const duree10 = Date.now() - debut10;
globalThis.fetch = fetchNormal;

test('une recherche qui ne répond pas ne bloque plus la réponse', reponseLente.reponse && reponseLente.reponse.length > 40);
test('la recherche est bornée par le budget (TEMPS_MAX=8 s ici)', duree10 < 5000);
test('la note dit que le budget a été atteint', /budget de temps|Aucun résultat extérieur exploitable/.test(String(reponseLente.internet.note || '')));
test('la réponse porte son temps de calcul', reponseLente.temps && reponseLente.temps.totalMs < reponseLente.temps.budgetTotalMs);

// --- 11. Un modèle muet rend une erreur claire, jamais un abandon ----------
const e11 = env(true, { horizon: 2055, modele: 'pendant', tempsMax: 3, tempsRecherche: 2 });
const debut11 = Date.now();
const muet = await worker.fetch(new Request('https://x/discussion', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-cle-service': 'service-test' },
  body: JSON.stringify({ question: 'Faut-il alléger l’or ?', web: false })
}), e11);
const corps11 = await muet.json();
test('un modèle qui ne répond pas est coupé par le garde-temps', muet.status === 500 && /manqué de temps/.test(corps11.erreur || ''));
test('l’erreur arrive vite, pas après l’abandon du client', Date.now() - debut11 < 6000);

globalThis.fetch = vraieFetch;
process.exit(erreurs ? 1 : 0);
