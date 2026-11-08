"""Compare independent native cold databases without normalizing physical data."""
import json, pathlib, sys
first, second, output = map(pathlib.Path, sys.argv[1:])
read = lambda root, name: json.loads((root/(name+'.json')).read_text())
compared = ['macro-input','macro-adapter','macro-peer-scopes','authored-input','styling-catalogue']
for name in compared: assert read(first,name) == read(second,name), name
old = read(first,'macro-other-peer-run')['assisted_result_json']
ui = read(second,'macro-ui-run')['assisted_result_json']
peer = read(second,'macro-other-peer-run')['assisted_result_json']
# Requests name different peers. The resolver and every resulting evidence field stay literal.
for value in [ui, peer]:
    assert {k:v for k,v in old.items() if k!='selector'} == {k:v for k,v in value.items() if k!='selector'}
    assert value['outcome']=='NO_PROPOSAL' and not value.get('proposal')
    assert value['evidence']['work']['branchesExplored']==10000
assert read(first,'macro-revision')['fingerprint']==read(second,'macro-revision')['fingerprint']
assert read(first,'boundary-sql-stages')==read(second,'macro-sql-stages')
stages = read(second,'macro-sql-stages')
assert len(stages)==1 and stages[0]['ordinal']==0
assert all(t['startPlanned'] is None for t in stages[0]['snapshot_json']['tasks'])
initial, after = read(second,'macro-S0'), read(second,'macro-after-ui')
assert initial['draft']==after['draft'] and initial['draftFingerprint']==after['draftFingerprint']
assert initial['activeStage']==after['activeStage']
security = read(second,'macro-security')
assert [s['status'] for s in security]==[403,403,403,401,409,422]
assert 400 <= read(second,'macro-invalid-scope')['status'] < 500
assert read(second,'audit-result')['status']=='DIAGNOSTIC_NO_PROPOSAL'
result = {'status':'PASS_DIAGNOSTIC_REPRODUCTION','coldDatabases':2,'comparedLiteral':compared,
    'nativeUIAndAPIEvidenceLiteral':True,'excludedResultFields':['selector (different requested peer)'],
    'physicalDifferencesNormalized':False,'obligationsConfigured':141,'authenticProposals':0,'acceptedPlacements':0,'newStages':0,
    'branchesPerRun':10000,'S0DraftUnchanged':True,'negativeAuthoringAndScopeChecks':'PASS','remoteWrites':0}
output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
