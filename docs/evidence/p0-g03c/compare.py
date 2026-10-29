"""Compare operational data literally; exclude observed execution durations only."""
import json,pathlib,sys
native_a,native_b,probe_a,probe_b,macro_a,macro_b,out=map(pathlib.Path,sys.argv[1:])
read=lambda root,n:json.loads((root/(n+'.json')).read_text())
observed=set();ignored={'durationMs','totalDurationMs','elapsedMs','executionMs'}
def stable(v):
    if isinstance(v,dict):
        observed.update(k for k in v if k in ignored or k.endswith('Ms'))
        return {k:stable(x) for k,x in v.items() if k not in ignored and not k.endswith('Ms')}
    if isinstance(v,list):return [stable(x) for x in v]
    return v
assert read(native_a,'native-input')==read(native_b,'native-input'),'native EngineInput differs'
assert read(native_a,'native-sql-readonly-rejection')==read(native_b,'native-sql-readonly-rejection')
sql=[read(root,'native-sql-state') for root in [native_a,native_b]]
assert sql[0]['resources']==sql[1]['resources'] and sql[0]['stages']==sql[1]['stages'] and sql[0]['runs']==sql[1]['runs']
for left,right in zip(sql[0]['plans'],sql[1]['plans']):
    assert {k:v for k,v in left.items() if k!='daily_technical_chains'}=={k:v for k,v in right.items() if k!='daily_technical_chains'}
    assert {k:v for k,v in left['daily_technical_chains'].items() if k not in ['by','at']}=={k:v for k,v in right['daily_technical_chains'].items() if k not in ['by','at']}
for a,b in [(probe_a,probe_b),(macro_a,macro_b)]:
    files=[p.stem for p in a.glob('*.json')]
    assert files
    for n in files:assert stable(read(a,n))==stable(read(b,n)),(a,n)
for root in [native_a,native_b]:
    state=read(root,'native-sql-state');assert state['runs']==[]
    assert all(s['ordinal']==0 for s in state['stages'])
    assert state['plans'][0]['daily_joint_groups'] is None
    assert read(root,'native-resource-authoring')['resourceWindowsAuthored'] is False
    assert json.loads((root.parent/'checkout-delta.json').read_text())==[]
assert json.loads((native_a.parent/'manifest.json').read_text())['sourceHashes']==json.loads((native_b.parent/'manifest.json').read_text())['sourceHashes']
result={'status':'PASS_DIAGNOSTIC','nativeInputsLiteral':True,'problemsWitnessesDecisionsFingerprintsBranchesLiteral':True,'sourceHashesEqual':True,'sqlStateEqual':True,'sqlAdministrativeFieldsExcluded':['daily_technical_chains.by','daily_technical_chains.at'],'newCombinedSQLStages':0,'ignoredExecutionDurationKeys':sorted(observed),'idRemapping':False,'remoteWrites':0}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
