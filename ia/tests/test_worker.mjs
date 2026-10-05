import worker from '../worker/src/index.js';

function env(avecPassage=false){
 const store=new Map();
 const journal={insert:0,upsert:0,vecteurs:new Set()};
 return {
  CLE_SERVICE:'service-test',CLE_ADMIN:'admin-test',
  MODELE_GENERATION:'test',MODELE_EMBEDDING:'test',
  AI:{run:async(model,input)=> input.text?{data:input.text.map(()=>[.1,.2])}:{response:avecPassage?'Le corpus indique un rendement de 12,5 %.':'Voici une idée avec 99 % de confiance.'}},
  VECTORIZE:{
   query:async()=>({matches:avecPassage?[{id:'a',score:.81,metadata:{titre:'Texte test',source:'IDL',date:'2025-01-01',url:'https://example.test',texte:'Le rendement observé est 12,5 %.'}}]:[]}),
   describe:async()=>({vectorCount:avecPassage?1:journal.vecteurs.size}),
   insert:async v=>{journal.insert+=(v||[]).length},
   upsert:async v=>{(v||[]).forEach(x=>journal.vecteurs.add(x.id));journal.upsert+=(v||[]).length},
   getByIds:async ids=>(ids||[]).filter(id=>journal.vecteurs.has(id)).map(id=>({id}))
  },
  CACHE:{get:async k=>store.get(k)||null,put:async(k,v)=>store.set(k,v)},
  journal
 };
}
async function post(e,q){return (await worker.fetch(new Request('https://x/discussion',{method:'POST',headers:{'content-type':'application/json','x-cle-service':'service-test'},body:JSON.stringify({question:q})}),e)).json();}
async function admin(e,route,corps,cle='admin-test'){
 return worker.fetch(new Request('https://x'+route,{method:'POST',headers:{'content-type':'application/json','x-cle-admin':cle},body:JSON.stringify(corps||{})}),e);
}
let erreurs=0;function test(n,condition){if(condition)console.log('✔',n);else{console.error('✗',n);erreurs++;}}

// --- les règles de réponse ---
const vide=await post(env(false),'Que faire ?');
test('phrase imposée sans passage',vide.reponse.startsWith('Le corpus ne le dit pas, mais selon mon interprétation:'));
test('interprétation signalée',vide.interpretation===true);
const source=await post(env(true),'Quel rendement ?');
test('source rendue',source.sources.length===1&&source.sources[0].titre==='Texte test');
test('chiffre sourcé accepté',source.verification.verifie===true);
const sante=await (await worker.fetch(new Request('https://x/sante'),env(true))).json();
test('date et compte exposables',sante.corpus.passages===1&&'majLe' in sante.corpus);

// --- l'indexation : reprise, doublons, compte réel ---
const e2=env(false);
const r1=await (await admin(e2,'/admin/indexation',{morceaux:[
 {id:'c-1',texte:'Premier passage du corpus, assez long pour être mesuré.',source:'IDL',titre:'A'},
 {id:'c-2',texte:'Deuxième passage.',source:'IDL',titre:'B'},
 {id:'c-2',texte:'Doublon du deuxième passage.',source:'IDL',titre:'B'}
]})).json();
test('indexation : le doublon du lot n’est pas renvoyé',r1.inseres===2&&r1.ignores===1);
test('indexation : upsert et jamais insert',e2.journal.upsert===2&&e2.journal.insert===0);
test('indexation : compte réel de l’index',r1.corpus.vecteurs===2&&r1.corpus.passages===2);
test('clé admin exigée',(await admin(e2,'/admin/indexation',{morceaux:[{id:'x',texte:'y'}]},'mauvaise-cle')).status===401);

const presents=await (await admin(e2,'/admin/presents',{ids:['c-1','c-2','inconnu']})).json();
test('presents : ce que l’index contient déjà',presents.presents.length===2&&!presents.presents.includes('inconnu'));
test('presents : clé admin exigée',(await admin(e2,'/admin/presents',{ids:['c-1']},'mauvaise-cle')).status===401);

// Un passage déjà indexé renvoyé volontairement : il remplace, sans doubler le compte.
const r2=await (await admin(e2,'/admin/indexation',{morceaux:[{id:'c-1',texte:'Premier passage, corrigé.',source:'IDL',titre:'A'}]})).json();
test('réenvoi d’un passage connu : le compte ne bouge pas',r2.corpus.vecteurs===2&&r2.inseres===1);

process.exit(erreurs?1:0);
