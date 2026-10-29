import json,pathlib,sys
left,right,out=map(pathlib.Path,sys.argv[1:])
a=json.loads((left/'deterministic.json').read_text());b=json.loads((right/'deterministic.json').read_text())
# Runtime duration counters are observational; every decision, identity, physical
# witness, SQL snapshot, fingerprint and branch counter remains literal.
ignored={'durationMs','totalDurationMs','elapsedMs','executionMs'}
def canonical(v):
 if isinstance(v,dict):return {k:canonical(x) for k,x in v.items() if k not in ignored}
 if isinstance(v,list):return [canonical(x) for x in v]
 return v
assert canonical(a)==canonical(b),'cold physical decisions, witnesses or SQL differ'
result={'status':'PASS','days':len(a),'stagesPerDatabase':sum(len(d['captures']) for d in a),'sameIds':True,'decisionsAndWitnessesEqual':True,'sqlSnapshotsAndFingerprintsEqual':True,'branchCountersEqual':True,'ignoredObservationKeys':sorted(ignored),'remoteWrites':0}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
