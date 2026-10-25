"""Verify native receipts, deterministic material results and all untouched baseline files."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parent
repo = root.parents[2]
sha = lambda value: hashlib.sha256(value).hexdigest()
read = lambda name: json.loads(gzip.decompress((root / 'native' / name).read_bytes()))
a, b = read('receipts.json.gz'), read('repeat-receipts.json.gz')
m, n = read('manifest.json.gz'), read('repeat-manifest.json.gz')
base = '8868ebc365a4941977050d337b4b00a5d2ca553f'
assert m['base'] == n['base'] == base
assert m['sourceHashes'] == n['sourceHashes']
assert m['journeyHash'] == n['journeyHash'] == sha((root / 'journey.ts').read_bytes())
assert m['baseTree'] == subprocess.check_output(['git', 'rev-parse', base + '^{tree}'], cwd=repo, text=True).strip()
for file, expected in m['sourceHashes'].items():
    assert sha((repo / file).read_bytes()) == expected, file
assert m['remoteWrites'] == n['remoteWrites'] == 0
assert m['dispatch']['before'] == m['sourceHashes']['script/demo/smokeNewDayIntegration.ts']
timing_keys = {'futureItinerantOperationalMealsMs', 'futureItinerantParticipantFutureMs', 'futureItinerantParticipantMealsMs', 'futureItinerantPrerequisiteSearchMs', 'futureItinerantPriorRevalidationMs', 'futureItinerantStructuralSearchMs', 'futureItinerantTechnicalFutureMs'}
def semantic(value):
    if isinstance(value, dict):
        return {k: semantic(v) for k, v in value.items() if k not in timing_keys}
    if isinstance(value, list):
        return [semantic(v) for v in value]
    return value
for bundle in [a, b]:
    integration = bundle['integration.json']
    assert integration['status'] == 'PASS' and integration['remoteWrites'] == 0
    assert integration['postgresVersion'].startswith('PostgreSQL 17.')
    assert len(integration['migrations']) == 117
    assert integration['journey']['explicitStagesAccepted'] == 0
    days = bundle['days.json']
    assert len(days) == 2 and set(days[0]['taskIds']).isdisjoint(days[1]['taskIds'])
    for label in ['A', 'B']:
        get = lambda suffix: bundle[f'{label}-{suffix}.json']
        assert not get('native-input').get('technicalChains')
        assert get('effective')['readiness']['status'] == 'READY'
        assert get('native-preflight')['adapter']['status'] == get('explicit-preflight')['adapter']['status'] == 'SUPPORTED'
        assert get('recommendations')['native']['selectedUnitKind'] == 'SPACE_FALLBACK'
        assert get('recommendations')['explicit']['selectedUnitKind'] == 'TECHNICAL_CHAIN'
        native = get('native-solver')['result']
        assert native['proposal'] and native['evidence']['hardValid']
        assert get('relaxed-solver')['result']['proposal']
        if label == 'B':
            assert get('explicit-solver')['result']['proposal'] is None
            ordered = native['proposal']
            assert [ordered[i+1]['start']-ordered[i]['end'] for i in [0,1]] == [20,5]
        assert get('authentic-revision-barrier')['code'] == 'STALE_CONFIG_REVISION'
        assert get('SQL-immutable')['message'] == 'PLANNER_NEXT_CONFIGURATION_IMMUTABLE'
        sql = get('SQL-replay-accepted-rollback')
        assert sql['transactionRolledBack'] and sql['plan'][0]['planner_next_configuration'] is None
        assert sql['revision'][0]['identity_json'] == get('identities')['explicit']
        assert sql['revision'][0]['replay_snapshot_json'] == get('identities')['explicitReplay']
        assert get('general-rejection')['status'] == get('daily-rejection')['status'] == 400
        for role in ['viewer','aux','norole']:
            assert get('permission-'+role)['status'] == 403
        for stage in ['S1','S2']:
            run = get(stage+'-run')['assisted_result_json']
            repeat = get(stage+'-repeat')['assisted_result_json']
            assert run['proposedDraftSnapshot'] == repeat['proposedDraftSnapshot']
            assert run['evidence']['fingerprint'] == repeat['evidence']['fingerprint']
            assert get(stage+'-validation')['hardCount'] == get(stage+'-validation')['requiredCount'] == 0
            assert get(stage+'-stale')['status'] == 409
        s1, s2 = [get(s+'-accepted')['activeStage'] for s in ['S1','S2']]
        assert len(s1['snapshotJson']['tasks']) == len(s2['snapshotJson']['tasks']) == 4
        assert sum(bool(t['startPlanned']) for t in s1['snapshotJson']['tasks']) == 3
        assert all(t['startPlanned'] and t['assignedResourceIds'] == [get('created')['kit']['id']] for t in s2['snapshotJson']['tasks'])
        assert get('restore')['redo']['activeStage'] == s2
        assert any('UNSUPPORTED_STANDALONE_TASK_KIND' in code for code in get('native-protected-prefix')['result']['evidence']['reasonCodes'])
        for name in ['missingMember','missingDependency']:
            assert get('negative-'+name)['adapter']['status'] == 'UNSUPPORTED'
        for name in ['unavailableResource','unavailableSpace']:
            r = get('negative-'+name+'-solver')['result']
            assert r['proposal'] is None
            assert not any('TIME_LIMIT' in c or 'BUDGET' in c for c in r['evidence']['reasonCodes'])
        for name in ['gap','substitution']:
            assert 'TECHNICAL_CHAIN_VIOLATION' in get(name+'-validation')['reasonCodes']
        assert get('substitution-candidates')['candidates'] == []
    future = bundle['A-future-causal-probes.json']
    assert future['prune']['status'] == 'PRUNE' and future['prune']['domainComplete']
    assert future['prune']['certifiedCausingTaskId'] == future['harmful']['id']
    assert future['kept']['status'] == 'PASS' and future['abstain']['status'] == 'ABSTAIN'
    assert len(bundle['A-future-exact-reservation.json']['reservation']['reservation']['scheduledTasks']) == 3
    assert bundle['A-native-prefix-continuation.json']['assisted_result_json']['outcome'] == 'NO_PROPOSAL'
    assert bundle['A-simulated-explicit-snapshot.json']['simulationOnly']
    fp = bundle['A-simulated-explicit-snapshot-fingerprint.json']
    assert fp['recomputed'] == fp['declared']
# Compare only exact material inputs/solvers/snapshots; actor IDs, timestamps and DB run IDs are not semantic equality claims.
for label in ['A','B']:
    for name in ['native-input','explicit-input','relaxed-input','native-solver','explicit-solver','relaxed-solver','native-protected-prefix','explicit-protected-prefix','native-single','native-tail','explicit-single','native-independent','explicit-independent','identities','substitution-candidates']:
        key = f'{label}-{name}.json'
        assert semantic(a[key]) == semantic(b[key]), key
    for stage in ['S1','S2']:
        key = f'{label}-{stage}-accepted.json'
        assert a[key]['activeStage']['snapshotFingerprint'] == b[key]['activeStage']['snapshotFingerprint']
        assert a[key]['activeStage']['snapshotJson'] == b[key]['activeStage']['snapshotJson']
a2 = json.loads((repo/'docs/evidence/p0-u00p/a2/comparison.json').read_text())
assert a2['completed'] == 266 and a2['stages'] == 11 and a2['branches'] == 27049
assert a2['fingerprint'] == '2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d'
if (root/'SHA256SUMS').exists():
    for line in (root/'SHA256SUMS').read_text().splitlines():
        digest, file = line.split('  ',1)
        assert sha((root/file).read_bytes()) == digest, file
print(json.dumps({'status':'PASS','nativeRuns':2,'receiptsPerRun':len(a),'protectedFiles':len(m['sourceHashes']),'realStagesPerRun':5,'completedDaysPerRun':2,'explicitStages':0,'a2':'HASH_PROTECTED_NOT_RERUN'}))
