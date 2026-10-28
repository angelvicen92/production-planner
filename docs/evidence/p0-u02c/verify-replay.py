"""Literal comparison of cold memory replays; timings are not a physical decision."""
import argparse,json,pathlib
p=argparse.ArgumentParser();p.add_argument('native',type=pathlib.Path);p.add_argument('replay',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);p.add_argument('--two-stacks',action='store_true');a=p.parse_args()
results=[]
for label in ['integrated','reverse-order','segmented-joint','segmented-reverse']:
 for scope in ['full','partial','continuation','anchor-partial','anchor-continuation','supporting-scope']:
  first=a.native/(label+'-'+scope+'.json');second=a.replay/first.name
  if not first.exists():assert not second.exists();continue
  x=json.loads(first.read_text());y=json.loads(second.read_text())
  assert x['adapter']['problemFingerprint']==y['adapter']['problemFingerprint']
  assert x['result']['proposal']==y['result']['proposal']
  for key in ['work','nominalPhysicalFutureWitness','technicalChainCertificate','fingerprint','acceptedSupportingPlacements']:
   assert x['result']['evidence'].get(key)==y['result']['evidence'].get(key),(label,scope,key)
  results.append({'label':label,'scope':scope,'literalDecisionsWitnessWork':True})
a.output.write_text(json.dumps({'status':'PASS','separateProcesses':0 if a.two_stacks else 4,'sameInputs':True,'newSQLStacksCompared':a.two_stacks,'acceptedIntegratedStages':0,'results':results},indent=2)+'\n')
print('PASS',len(results),'cold memory replay comparisons; no new SQL Stage claimed')
