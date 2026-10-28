"""Literal operational comparison; timestamps and actors never stand in for decisions."""
import sys,pathlib,json,gzip
left,right,out=map(pathlib.Path,sys.argv[1:])
def read(root,name):
 p=root/(name+'.json')
 return json.loads(p.read_text()) if p.exists() else json.loads(gzip.decompress((root/'receipts.json.gz').read_bytes()))[name+'.json']
rows=[]
for label in ['integrated','reverse-order','segmented-joint','segmented-reverse']:
 a,b=read(left,label+'-input'),read(right,label+'-input');assert a==b,(label,'literal EngineInput')
 for suffix in (['exhausted-run'] if label.startswith('segmented') else [route+'-S'+str(n)+'-run' for route in ['competitor','anchor'] for n in [1,2]]):
  x,y=(read(root,label+'-'+suffix)['assisted_result_json'] for root in [left,right])
  for key in ['proposal','proposedDraftSnapshot','proposedDraftFingerprint']:assert x.get(key)==y.get(key),(label,suffix,key)
  for key in ['work','nominalPhysicalFutureWitness','technicalChainCertificate','acceptedSupportingPlacements']:assert x['evidence'].get(key)==y['evidence'].get(key),(label,suffix,key)
  if not label.startswith('segmented'):
   stem=label+'-'+suffix.removesuffix('-run')
   assert read(left,stem+'-sql')==read(right,stem+'-sql'),(stem,'SQL row')
  rows.append({'label':label,'scope':suffix,'literalDecisionsCountersCertificatesDraftSQL':True})
out.write_text(json.dumps({'status':'PASS','coldDatabases':2,'acceptedSQLStages':16,'results':rows},indent=2)+'\n');print('PASS literal decisions, counters, certificates, Draft and Stage SQL across two cold databases')
