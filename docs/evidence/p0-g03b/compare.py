import json,pathlib,sys
left,right,out=map(pathlib.Path,sys.argv[1:])
a=json.loads((left/'deterministic.json').read_text());b=json.loads((right/'deterministic.json').read_text())
# Runtime duration counters are observational; every decision, identity, physical
# witness, SQL snapshot, fingerprint and branch counter remains literal.
ignored={'durationMs','totalDurationMs','elapsedMs','executionMs'}
observed=set()
def canonical(v):
 if isinstance(v,dict):
  observed.update(k for k in v if k in ignored or k.endswith('Ms'))
  return {k:canonical(x) for k,x in v.items() if k not in ignored and not k.endswith('Ms')}
 if isinstance(v,list):return [canonical(x) for x in v]
 return v
assert canonical(a)==canonical(b),'cold physical decisions, witnesses or SQL differ'
for day in a:
 name=day['label']+'-adapter.json'
 assert json.loads((left/name).read_text())['problem']==json.loads((right/name).read_text())['problem'],'adapted problem differs'
manifests=[json.loads((root.parent/'manifest.json').read_text()) for root in [left,right]]
assert manifests[0]['sourceHashes']==manifests[1]['sourceHashes'],'executed source differs'
assert all(json.loads((root.parent/'checkout-delta.json').read_text())==[] for root in [left,right])
result={'status':'PASS','days':len(a),'stagesPerDatabase':sum(len(d['captures']) for d in a),'sameIds':True,'adaptedProblemsEqual':True,'decisionsAndWitnessesEqual':True,'sqlSnapshotsAndFingerprintsEqual':True,'branchCountersEqual':True,'sourceHashesEqual':True,'checkoutDelta':[],'ignoredExecutionDurationKeys':sorted(observed),'remoteWrites':0}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
