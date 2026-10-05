#!/usr/bin/env python3
"""Indexe seulement les passages jamais envoyés, par tranches gratuites."""
import argparse, json, os, pathlib, sys, time, urllib.request, urllib.error
R=pathlib.Path(__file__).resolve().parents[1]; CHUNKS=R/'corpus/chunks.jsonl'; ETAT=R/'corpus/.indexation.json'

def main():
 p=argparse.ArgumentParser();p.add_argument('--taille',type=int,default=50);p.add_argument('--tranche',type=int,default=1800);p.add_argument('--recommencer',action='store_true');a=p.parse_args()
 url=os.getenv('UDE_URL','').rstrip('/');cle=os.getenv('UDE_CLE_ADMIN','')
 if not url or not cle:print('ERREUR : UDE_URL ou UDE_CLE_ADMIN manque.');return 1
 morceaux=[json.loads(x) for x in CHUNKS.read_text(encoding='utf-8').splitlines() if x.strip()]
 deja=set()
 if ETAT.exists() and not a.recommencer:
  try:deja=set(json.loads(ETAT.read_text()).get('ids',[]))
  except Exception:pass
 nouveaux=[m for m in morceaux if m.get('id') not in deja]
 lot_total=nouveaux[:a.tranche] if a.tranche else nouveaux
 if not lot_total:print('Tout ce corpus est déjà indexé.');return 0
 print(f'{len(lot_total)} nouveaux passages à indexer ({len(nouveaux)} en attente).')
 for i in range(0,len(lot_total),a.taille):
  lot=lot_total[i:i+a.taille];data=json.dumps({'morceaux':lot}).encode()
  req=urllib.request.Request(url+'/admin/indexation',data=data,headers={'content-type':'application/json','x-cle-admin':cle},method='POST')
  try:
   with urllib.request.urlopen(req,timeout=300) as r:res=json.loads(r.read())
  except urllib.error.HTTPError as e:print('HTTP',e.code,e.read().decode(errors='replace')[:500]);return 1
  deja.update(m['id'] for m in lot);ETAT.write_text(json.dumps({'ids':sorted(deja),'total':len(deja)},ensure_ascii=False),encoding='utf-8')
  print(f"  {min(i+len(lot),len(lot_total))}/{len(lot_total)} — {res.get('corpus',{}).get('majLe','?')}");time.sleep(.25)
 print('Tranche terminée. Restants :',max(0,len(nouveaux)-len(lot_total)));return 0
if __name__=='__main__':sys.exit(main())
