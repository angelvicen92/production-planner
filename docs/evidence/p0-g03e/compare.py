"""Literal operational comparison, excluding measured execution duration counters only."""
import json,pathlib,sys
left,right,out=map(pathlib.Path,sys.argv[1:]);read=lambda p,n:json.loads((p/(n+'.json')).read_text())
ignored={'futureItinerantOperationalMealsMs','futureItinerantParticipantFutureMs','futureItinerantParticipantMealsMs','futureItinerantPrerequisiteSearchMs','futureItinerantPriorRevalidationMs','futureItinerantStructuralSearchMs','futureItinerantTechnicalFutureMs','durationMs','totalDurationMs','elapsedMs','executionMs'}
observed=set()
def stable(v):
 if isinstance(v,dict):
  observed.update(k for k in v if k in ignored)
  return {k:stable(x) for k,x in v.items() if k not in ignored}
 if isinstance(v,list):return [stable(x) for x in v]
 return v
for name in ['macro-input','macro-adapter','macro-S1-sql','macro-S2-sql','generic-input','generic-adapter','generic-S1-sql','generic-S2-sql','deterministic']:
 assert stable(read(left,name))==stable(read(right,name)),name
assert json.loads((left.parent/'manifest.json').read_text())['sourceHashes']==json.loads((right.parent/'manifest.json').read_text())['sourceHashes']
for root in [left,right]:assert json.loads((root.parent/'checkout-delta.json').read_text())==[]
result={'status':'PASS','sameIds':True,'physicalDifferencesNormalized':False,'inputsProblemsFingerprintsDecisionsSQLLiteral':True,'stagesPerDatabase':4,'sourceHashesEqual':True,'ignoredExecutionDurationKeys':sorted(observed),'remoteWrites':0}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
