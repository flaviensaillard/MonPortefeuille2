// Université de l'Épargne — Cloudflare Worker 100 % gratuit.
// Recherche Vectorize, réponse Workers AI, lecture agrégée de Supabase,
// état du corpus, filet anti-invention et interprétation explicitement marquée.

const SEUIL = 0.30;
const GENERATION = '@cf/meta/llama-3.1-8b-instruct';
const EMBEDDING = '@cf/baai/bge-base-en-v1.5';
const CORS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-cle-service,x-cle-admin',
  'access-control-allow-methods': 'GET,POST,OPTIONS'
};
const REGLES = `Tu es l'assistant de l'Université de l'Épargne. Réponds en français, directement et sans complaisance.
Sépare toujours : 1. CE QUE DIT LE CORPUS ; 2. MON INTERPRÉTATION ; 3. CE QUI DÉPEND DE VOUS.
Tu cites chaque affirmation tirée du corpus. Tu n'inventes aucune citation, date, titre ni chiffre.
Si aucun passage ne répond, commence exactement par : « Le corpus ne le dit pas, mais selon mon interprétation: » puis donne une idée prudente. Dis que c'est une interprétation, pas une source fiable.
Tu peux analyser les agrégats du portefeuille, signaler concentration, incohérence ou poche hors bande. Tu ne donnes jamais d'ordre d'achat ou de vente et tu ne te présentes jamais comme conseiller réglementé.
Explique brièvement tout terme technique (TWR, CAGR, duration, ETF…).`;

function rep(obj, status=200) { return new Response(JSON.stringify(obj), {status, headers:CORS}); }
function okCle(a,b) { if(!a||!b||String(a).length!==String(b).length)return false; let d=0; for(let i=0;i<String(a).length;i++)d|=String(a).charCodeAt(i)^String(b).charCodeAt(i); return d===0; }
async function hash(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,32);}

export default {
 async fetch(req, env) {
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:CORS});
  const p=new URL(req.url).pathname.replace(/\/+$/,'')||'/';
  try {
   if(p==='/sante') return rep(await sante(env));
   if(p==='/admin/etat') return rep(await etatCorpus(env,true));
   if(req.method!=='POST') return rep({erreur:'Méthode non autorisée'},405);
   const b=await req.json().catch(()=>({}));
   if(p==='/discussion') {
    if(!okCle(b.service||req.headers.get('x-cle-service'),env.CLE_SERVICE))return rep({erreur:'Clé de service invalide'},401);
    return rep(await discuter(b,env));
   }
   if(p==='/contexte') {
    if(!okCle(b.service||req.headers.get('x-cle-service'),env.CLE_SERVICE))return rep({erreur:'Clé de service invalide'},401);
    const c=await lireSupabase(env); return c?rep(c):rep({erreur:'Supabase non configuré ou inaccessible'},503);
   }
   if(p==='/admin/indexation') {
    if(!okCle(b.admin||req.headers.get('x-cle-admin'),env.CLE_ADMIN))return rep({erreur:'Clé admin invalide'},401);
    return rep(await indexer(b,env));
   }
   if(p==='/admin/presents') {
    if(!okCle(b.admin||req.headers.get('x-cle-admin'),env.CLE_ADMIN))return rep({erreur:'Clé admin invalide'},401);
    return rep(await presents(b,env));
   }
   return rep({erreur:'Route inconnue'},404);
  } catch(e){return rep({erreur:String(e.message||e)},500);}
 }
};

async function etatCorpus(env,vrai=false){
 let e=null;
 if(env.CACHE){const x=await env.CACHE.get('corpus:etat');if(x)try{e=JSON.parse(x)}catch(err){}}
 if(!e)e={passages:null,majLe:null,sources:[]};
 // Le compte réel vient de Vectorize : d'office si le cache ne dit rien, et sur
 // demande (`vrai`, c'est-à-dire /admin/etat). Le compte du cache peut mentir :
 // un même passage envoyé deux fois n'est stocké qu'une fois.
 if(vrai||e.passages===null){const n=await compterVecteurs(env,vrai?3:1);if(n!==null){e.vecteurs=n;if(e.passages===null)e.passages=n;}}
 return e;
}
// Le compte réel de l'index, lu après coup : les écritures Vectorize sont
// asynchrones, le premier chiffre peut donc être en retard de quelques secondes.
async function compterVecteurs(env,essais=3,minimum=0){
 let n=null;
 for(let i=0;i<essais;i++){
  try{const d=await env.VECTORIZE.describe();if(typeof d.vectorCount==='number')n=n===null?d.vectorCount:Math.max(n,d.vectorCount);}catch(e){}
  if(n!==null&&n>=minimum)break; // un chiffre plausible suffit : on ne réessaie que s'il est en retard
  if(i<essais-1)await new Promise(r=>setTimeout(r,1000));
 }
 return n;
}
async function sauverEtat(env,e){if(env.CACHE)await env.CACHE.put('corpus:etat',JSON.stringify(e));}
async function sante(env){return {ok:true,corpus:await etatCorpus(env),branchements:{supabase:!!(env.SUPABASE_URL&&env.SUPABASE_CLE),github:!!env.GITHUB_DEPOT,vectorize:!!env.VECTORIZE,ia:!!env.AI}};}

async function discuter(b,env){
 const q=String(b.question||'').trim();if(!q)throw Error('Question vide');
 let contexte=b.contexte||null,origine=contexte?'application':null;
 if(!contexte){const s=await lireSupabase(env);if(s){contexte=s.aggregats;origine='supabase';}}
 const cacheKey='rep:'+(await hash(q+'|'+JSON.stringify(contexte||{})));
 if(env.CACHE){const x=await env.CACHE.get(cacheKey);if(x){const r=JSON.parse(x);r.cache=true;r.corpus=await etatCorpus(env);return r;}}
 const emb=await env.AI.run(env.MODELE_EMBEDDING||EMBEDDING,{text:[q]});
 let matches=[];try{matches=(await env.VECTORIZE.query(emb.data[0],{topK:6,returnMetadata:true})).matches||[]}catch(e){}
 const passages=matches.filter(m=>m.score>=SEUIL).map(m=>({score:m.score,...(m.metadata||{})}));
 const sait=passages.length>0;
 let system=REGLES;
 if(sait) system+='\n\nPASSAGES À UTILISER :\n'+passages.map((p,i)=>`[${i+1}] ${p.titre||''} — ${p.source||''} ${p.date||''}\n${p.texte||''}`).join('\n\n');
 else system+='\n\nAucun passage ne répond. Commence OBLIGATOIREMENT par la phrase imposée puis donne une interprétation prudente.';
 if(contexte)system+='\n\nAGRÉGATS DU PORTEFEUILLE ('+origine+') :\n'+JSON.stringify(contexte);
 const ai=await env.AI.run(env.MODELE_GENERATION||GENERATION,{messages:[{role:'system',content:system},{role:'user',content:q}],max_tokens:900});
 let texte=String(ai.response||ai.result||'').trim();
 const marque='Le corpus ne le dit pas, mais selon mon interprétation:';
 let interpretation=!sait;
 if(!sait&&!texte.toLowerCase().startsWith('le corpus ne le dit pas'))texte=marque+' '+texte;
 if(texte.toLowerCase().includes('selon mon interprétation'))interpretation=true;
 const verification=verifier(texte,passages,contexte);
 const resultat={reponse:texte,interpretation,verification,sources:passages.slice(0,4).map(p=>({titre:p.titre,source:p.source,date:p.date,url:p.url,score:+p.score.toFixed(3)})),contexteUtilise:origine,corpus:await etatCorpus(env),cache:false};
 if(env.CACHE)await env.CACHE.put(cacheKey,JSON.stringify(resultat),{expirationTtl:86400});
 return resultat;
}

// Filet anti-invention : tout nombre absent des passages et des agrégats est signalé.
function nombres(t){return [...new Set((String(t||'').match(/\d[\d\s.,]*\d\s?%?|\d+\s?%/g)||[]).map(x=>x.trim()).filter(x=>{const n=parseFloat(x.replace(/\s/g,'').replace(',','.'));return !(/^\d{4}$/.test(x)&&n>=1900&&n<=2100)&&!(/^\d{1,2}$/.test(x));}))];}
function norm(t){return String(t||'').replace(/\s/g,'').replace(/,/g,'.').replace(/%/g,'');}
function verifier(texte,passages,contexte){
 const ref=norm(passages.map(p=>(p.texte||'')+' '+(p.titre||'')).join(' ')+JSON.stringify(contexte||{}));
 if(!ref)return {verifie:false,suspects:[],note:null};
 const suspects=nombres(texte).filter(x=>!ref.includes(norm(x))).slice(0,6);
 return suspects.length?{verifie:false,suspects,note:'Chiffres non retrouvés dans les passages cités : '+suspects.join(', ')+'. Ce sont des ordres de grandeur du modèle, pas des données sourcées.'}:{verifie:true,suspects:[],note:null};
}

async function indexer(b,env){
 const chunks=b.chunks||b.morceaux||[];if(!chunks.length)throw Error('Aucun passage à indexer');
 const lot=chunks.slice(0,Math.min(Number(b.limite||chunks.length),200));
 // Un identifiant ne doit apparaître qu'une fois dans la requête d'embedding,
 // sinon le vecteur est calculé deux fois pour rien (les neurons sont comptés).
 const vus=new Set(),propre=lot.filter(c=>{const id=String(c.id||'');if(!id||vus.has(id))return false;vus.add(id);return true;});
 if(!propre.length)throw Error('Aucun identifiant exploitable dans ce lot');
 const e=await env.AI.run(env.MODELE_EMBEDDING||EMBEDDING,{text:propre.map(c=>String(c.texte||'').slice(0,1200))});
 const vec=propre.map((c,i)=>({id:String(c.id),values:e.data[i],metadata:{titre:c.titre||'',source:c.source||'',date:c.date||'',url:c.url||'',type:c.type||'',texte:String(c.texte||'').slice(0,4000)}}));
 // upsert et non insert : réenvoyer un passage déjà présent le remplace au lieu
 // d'être silencieusement ignoré, donc les comptes ne mentent plus.
 for(let i=0;i<vec.length;i+=100)await env.VECTORIZE.upsert(vec.slice(i,i+100));
 const ancien=await etatCorpus(env),sources=new Set(ancien.sources||[]);propre.forEach(c=>c.source&&sources.add(c.source));
 // Le compte vient de l'index lui-même, jamais d'une addition : un passage
 // réenvoyé ne doit pas gonfler le total affiché dans l'application.
 const vecteurs=await compterVecteurs(env,3,Number(ancien.passages||ancien.vecteurs||0));
 const etat={passages:vecteurs===null?(ancien.passages||0)+vec.length:vecteurs,vecteurs,majLe:new Date().toISOString(),sources:[...sources].slice(0,50)};
 await sauverEtat(env,etat);
 return {ok:true,inseres:vec.length,ignores:lot.length-propre.length,restants:Math.max(0,chunks.length-vec.length),corpus:etat};
}

// Quels passages sont déjà dans l'index ? Route gratuite : elle lit l'index et
// ne fait tourner aucun modèle. Elle permet à l'indexeur de ne jamais dépenser
// deux fois les mêmes neurons, même si son point de reprise a été perdu.
async function presents(b,env){
 const ids=(Array.isArray(b.ids)?b.ids:[]).map(String).filter(Boolean).slice(0,500);
 if(!ids.length)return {presents:[]};
 const trouves=[];
 for(let i=0;i<ids.length;i+=20){
  try{
   const r=await env.VECTORIZE.getByIds(ids.slice(i,i+20));
   (r||[]).forEach(v=>{const id=typeof v==='string'?v:(v&&v.id);if(id)trouves.push(String(id));});
  }catch(e){}
 }
 return {presents:trouves,demandes:ids.length};
}


// La clé Supabase reste secrète dans Cloudflare. Seuls des agrégats quittent le Worker.
async function lireSupabase(env){
 if(!env.SUPABASE_URL||!env.SUPABASE_CLE)return null;
 const base=String(env.SUPABASE_URL).replace(/\/$/,'')+'/rest/v1/';
 const h={apikey:env.SUPABASE_CLE,Authorization:'Bearer '+env.SUPABASE_CLE};
 const get=async p=>{const r=await fetch(base+p,{headers:h});if(!r.ok)throw Error('Supabase '+r.status);return r.json();};
 try{
  const [sn,tx,inf]=await Promise.all([
   get('pf2_snapshots?select=date,patrimoine_total_eur,patrimoine_investi_eur,precaution_eur,courant_eur,equivalent_or_oz,poche_rv_eur,poche_energie_eur,poche_asie_eur,poche_jgb_eur&order=date.asc'),
   get('pf2_transactions?select=ticker,sens,date,quantite&order=date.asc'),
   get('pf2_inflation?select=annee,inflation&order=annee.desc')]);
  if(!sn.length)return null;const a=sn[0],z=sn[sn.length-1],n=x=>Number(x||0),r=(x,d=2)=>+Number(x).toFixed(d);
  const ans=Math.max(.08,(new Date(z.date)-new Date(a.date))/(365.25*864e5));const v0=n(a.patrimoine_investi_eur),v1=n(z.patrimoine_investi_eur);
  const q={};tx.forEach(t=>q[t.ticker]=(q[t.ticker]||0)+(t.sens==='vente'?-n(t.quantite):n(t.quantite)));
  const an=new Date().getFullYear(),closes=inf.filter(i=>+i.annee<an).slice(0,10);
  return {meta:{snapshots:sn.length,transactions:tx.length},aggregats:{devise:'EUR',dateDernierSnapshot:z.date,premierSnapshot:a.date,patrimoineTotalEur:r(n(z.patrimoine_total_eur),0),patrimoineInvestiEur:r(v1,0),precautionEur:r(n(z.precaution_eur),0),cagrInvestiPct:v0?r((Math.pow(v1/v0,1/ans)-1)*100):null,oncesOrEquivalent:z.equivalent_or_oz==null?null:r(n(z.equivalent_or_oz)),poches:{reserveValeur:r(n(z.poche_rv_eur),0),energie:r(n(z.poche_energie_eur),0),asie:r(n(z.poche_asie_eur),0),jgb:r(n(z.poche_jgb_eur),0)},principalesLignes:Object.entries(q).filter(x=>x[1]>0).sort((x,y)=>y[1]-x[1]).slice(0,8).map(x=>({ticker:x[0],quantite:r(x[1],4)})),inflation:{derniere:closes[0]||null,moyenne:closes.length>=3?r(closes.reduce((s,i)=>s+n(i.inflation),0)/closes.length):null,annees:closes.length}}};
 }catch(e){return null;}
}
