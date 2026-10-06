// Université de l'Épargne — Cloudflare Worker 100 % gratuit.
 //
-// Version 1.7.1 « analyse long terme + garde-temps ». Ce que fait ce service, dans l'ordre :
+// Version 1.7.2 « analyse long terme + garde-temps + réponse de secours ». Ce que fait ce service, dans l'ordre :
 //   1. cherche dans le corpus (Vectorize) les passages proches de la question ;
 //   2. va chercher sur le web des informations extérieures (DuckDuckGo, Brave,
 //      SearXNG, Wikipédia, ou l'API Web Search de Cloudflare) — c'est ce qui
@@ -17,6 +17,12 @@
 //      anti-invention qui distingue les chiffres du corpus, ceux des sources
 //      extérieures et les chiffres orphelins.
 //
+// 1.7.2 — LA RÉPONSE DE SECOURS. Un plafond de 1000 jetons demandait au
+// modèle jusqu'à 25 s d'écriture : le budget de 22 s était dépassé, et le
+// porteur voyait une réponse se couper une fois sur deux. Le plafond passe à
+// 700 jetons, et si la génération est tout de même coupée, le service
+// redemande une réponse COURTE avec un prompt réduit : elle arrive toujours.
+//
 // 1.7.1 — UN GARDE-TEMPS. Cloudflare interrompt toute réponse HTTP au bout
 // d'environ 30 secondes sur l'offre gratuite, et l'application Android
 // abandonne la sienne à 25 s. Avant, la recherche extérieure pouvait à elle
@@ -55,7 +61,9 @@ const TEMPS_MIN_REPONSE = 7000;    // ce qui reste toujours pour rédiger
 const TEMPS_REPARATION_MAX = 9000; // seconde passe de mise en forme
 const TEMPS_MOTEUR_MAX = 5000;     // un moteur de recherche, un essai
 const TEMPS_PAGE_MAX = 5000;       // une page ouverte
-const MAX_TOKENS_DEFAUT = 1000;    // longueur maximale de la réponse écrite
+const MAX_TOKENS_DEFAUT = 700;     // longueur maximale de la réponse écrite
+const MAX_TOKENS_SECOURS = 300;    // réponse courte de secours, quand le temps manque
+const TEMPS_RESERVE_SECOURS = 6000; // temps toujours gardé de côté pour la réponse de secours
 
 function budgets(env) {
   const nombre = (v, defaut, mini, maxi) => {
@@ -154,6 +162,16 @@ Structure imposée : paragraphe 1 commence par « Selon le corpus, » ; paragrap
 L'horizon de long terme est ${horizon.anneeDepartRetraite} (${horizon.anneesRestantes} ans) et l'objectif est de ${horizon.objectif}. Réponds en français, en trois paragraphes séparés par une ligne vide, 400 mots au maximum.`;
 }
 
+function construireReglesSecours(horizon) {
+  /* Version minimale des règles : elle sert quand le temps manque. Un prompt de
+     cinq lignes s'analyse et s'écrit beaucoup plus vite qu'un prompt de trente,
+     et la tournure imposée reste respectée. */
+  return `Tu réponds en français, en trois paragraphes TRÈS COURTS — 150 mots au total, pas plus.
+Paragraphe 1 commence par « Selon le corpus, ». Paragraphe 2 commence par « En me basant sur tes données, sur le corpus et sur les informations extérieures que j'ai trouvées, ». Paragraphe 3 commence par « Ce qui dépend de toi : ».
+Tu tutoies le porteur. Horizon : départ à la retraite en ${horizon.anneeDepartRetraite} (${horizon.anneesRestantes} ans).
+Aucun chiffre inventé, aucun ordre d'achat ou de vente. Pas d'émoji.`;
+}
+
 function rep(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: CORS }); }
 function okCle(a, b) { if (!a || !b || String(a).length !== String(b).length) return false; let d = 0; for (let i = 0; i < String(a).length; i++) d |= String(a).charCodeAt(i) ^ String(b).charCodeAt(i); return d === 0; }
 async function hash(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32); }
@@ -267,7 +285,7 @@ function historiqueDe(b) {
 async function sante(env) {
   return {
     ok: true,
-    version: '1.7.1',
+    version: '1.7.2',
     corpus: await etatCorpus(env),
     horizon: horizonDe({}, null, env),
     budgets: (() => { const b = budgets(env); return { totalS: b.total / 1000, rechercheS: b.recherche / 1000, maxTokens: b.maxTokens }; })(),
@@ -349,14 +367,32 @@ async function discuter(b, env) {
   system += `\n\nRAPPEL DE FORME POUR CETTE RÉPONSE : paragraphe 1 = « Selon le corpus, … », paragraphe 2 = ${rappelAnalyse}, paragraphe 3 = « Ce qui dépend de toi : … ». Horizon ${horizon.anneeDepartRetraite} (${horizon.anneesRestantes} ans).`;
 
   const messages = [{ role: 'system', content: system }].concat(historique, [{ role: 'user', content: q }]);
-  const tempsEcriture = () => Math.max(1500, restant() - 800);
+  /* Le temps d'écriture de la version complète ne prend pas TOUT ce qui reste :
+     six secondes sont gardées de côté pour la réponse de secours. Sans cette
+     réserve, une première tentative trop lente consommait le budget entier et le
+     repli n'avait plus une seconde pour s'écrire — le défaut constaté. */
+  const tempsEcriture = () => Math.max(1800, restant() - TEMPS_RESERVE_SECOURS);
   let texte = await avecDelai(generer(env, messages, budget.maxTokens), tempsEcriture());
-  // Un modèle qui ne répond rien est une panne, pas une réponse vide : mieux
-  // vaut une erreur visible, que la question reste dans le fil et puisse être
-  // renvoyée. La seconde tentative n'a lieu que si le temps le permet encore.
-  if (!texte && restant() > 8000) texte = await avecDelai(generer(env, messages, budget.maxTokens), tempsEcriture());
+
+  // --- Réponse de secours : un prompt réduit, pour qu'une réponse arrive
+  // toujours. Une réponse brève vaut mieux qu'une réponse qui « se coupe ».
+  let repli = null;
+  if (!texte) {
+    const reste = restant() - 900;
+    if (reste > 2500) {
+      const court = [{ role: 'system', content: construireReglesSecours(horizon) }];
+      if (passages.length) court.push({ role: 'system', content: `EXTRAIT DU CORPUS [1] :\n${String(passages[0].texte || '').slice(0, 400)}` });
+      if (web.texte) court.push({ role: 'system', content: `EXTRAIT EXTÉRIEUR [E1] :\n${String(web.texte).slice(0, 500)}` });
+      if (contexte) court.push({ role: 'system', content: `DONNÉES DU PORTEFEUILLE :\n${JSON.stringify(contexte)}` });
+      if (!passages.length && !web.texte) court.push({ role: 'system', content: 'Ni passage du corpus ni source extérieure : dis-le au paragraphe 1, et donne seulement ton analyse.' });
+      court.push({ role: 'user', content: q });
+      texte = await avecDelai(generer(env, court, Math.min(MAX_TOKENS_SECOURS, budget.maxTokens)), reste);
+      if (texte) repli = 'court';
+    }
+  }
+
   if (!texte) {
-    throw Error(`Le service a manqué de temps (${Math.round(budget.total / 1000)} s au total, dont ${Math.round(budget.recherche / 1000)} s de recherche extérieure). Reposez la question, ou baissez TEMPS_RECHERCHE.`);
+    throw Error(`Le service a manqué de temps (${Math.round(budget.total / 1000)} s au total, dont ${Math.round(budget.recherche / 1000)} s de recherche extérieure). Reposez la question — la seconde fois utilise le cache de la recherche — ou baissez TEMPS_RECHERCHE et MAX_TOKENS.`);
   }
 
   // --- Filet déterministe : le corpus muet ne doit jamais être présenté comme
@@ -376,7 +412,7 @@ async function discuter(b, env) {
   // qu'elle est, avec `format.conforme` à false — un texte imparfait vaut mieux
   // qu'un abandon.
   const tempsPourReparer = () => Math.min(TEMPS_REPARATION_MAX, restant() - 1000);
-  if (!forme.conforme && String(env.REPARATION || 'oui').toLowerCase() !== 'non' && texte.length > 60 && tempsPourReparer() > 4000) {
+  if (!repli && !forme.conforme && String(env.REPARATION || 'oui').toLowerCase() !== 'non' && texte.length > 60 && tempsPourReparer() > 4000) {
     const corrige = await avecDelai((async () => {
       const m = [{ role: 'system', content: construireReglesCourtes(horizon) }, { role: 'user', content: 'RÉPONSE À RÉÉCRIRE :\n\n' + texte }];
       return generer(env, m, 700);
@@ -405,7 +441,8 @@ async function discuter(b, env) {
     contexteUtilise: origine,
     corpus: await etatCorpus(env),
     modele: env.MODELE_GENERATION || GENERATION,
-    version: '1.7.1',
+    version: '1.7.2',
+    repli,
     temps: {
       totalMs: Date.now() - debut,
       budgetTotalMs: budget.total,
