import worker from '../worker/src/index.js';

function env(avecPassage=false){
 const store=new Map();
 return {
  CLE_SERVICE:'service-test',CLE_ADMIN:'admin-test',
  MODELE_GENERATION:'test',MODELE_EMBEDDING:'test',
  AI:{run:async(model,input)=> input.text?{data:[[.1,.2]]}:{response:avecPassage?'Le corpus indique un rendement de 12,5 %.':'Voici une idée avec 99 % de confiance.'}},
  VECTORIZE:{
   query:async()=>({matches:avecPassage?[{id:'a',score:.81,metadata:{titre:'Texte test',source:'IDL',date:'2025-01-01',url:'https://example.test',texte:'Le rendement observé est 12,5 %.'}}]:[]}),
   describe:async()=>({vectorCount:avecPassage?1:0}),
   insert:async()=>{}
  },
  CACHE:{get:async k=>store.get(k)||null,put:async(k,v)=>store.set(k,v)}
 };
}
async function post(e,q){return (await worker.fetch(new Request('https://x/discussion',{method:'POST',headers:{'content-type':'application/json','x-cle-service':'service-test'},body:JSON.stringify({question:q})}),e)).json();}
let erreurs=0;function test(n,condition){if(condition)console.log('✔',n);else{console.error('✗',n);erreurs++;}}
const vide=await post(env(false),'Que faire ?');
test('phrase imposée sans passage',vide.reponse.startsWith('Le corpus ne le dit pas, mais selon mon interprétation:'));
test('interprétation signalée',vide.interpretation===true);
const source=await post(env(true),'Quel rendement ?');
test('source rendue',source.sources.length===1&&source.sources[0].titre==='Texte test');
test('chiffre sourcé accepté',source.verification.verifie===true);
const sante=await (await worker.fetch(new Request('https://x/sante'),env(true))).json();
test('date et compte exposables',sante.corpus.passages===1&&'majLe' in sante.corpus);
process.exit(erreurs?1:0);
