"""Verify checked-in native receipts and all protected source/Evidence hashes."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
repo = root.parents[2]
read = lambda name: json.loads(gzip.decompress((root / 'native' / name).read_bytes()))
sha = lambda value: hashlib.sha256(value).hexdigest()
base = '3b5f5de5bb534f9f0fcd8cc46614895bc0845ee8'
a, b = read('receipts.json.gz'), read('repeat-receipts.json.gz')
m, n = read('manifest.json.gz'), read('repeat-manifest.json.gz')
assert m['base'] == n['base'] == base
assert m['sourceHashes'] == n['sourceHashes']
assert m['journeyHash'] == n['journeyHash'] == sha((root / 'journey.ts').read_bytes())
assert m['baseTree'] == subprocess.check_output(['git', 'rev-parse', base + '^{tree}'], cwd=repo, text=True).strip()
for file, expected in m['sourceHashes'].items():
    assert sha((repo / file).read_bytes()) == expected, file
assert m['dispatch']['before'] == m['sourceHashes']['script/demo/smokeNewDayIntegration.ts']
assert m['remoteWrites'] == n['remoteWrites'] == 0
timing_keys = {
    'futureItinerantOperationalMealsMs', 'futureItinerantParticipantFutureMs',
    'futureItinerantParticipantMealsMs', 'futureItinerantPrerequisiteSearchMs',
    'futureItinerantPriorRevalidationMs', 'futureItinerantStructuralSearchMs', 'futureItinerantTechnicalFutureMs',
}
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
    assert len(integration['migrations']) == 116
    assert integration['journey']['synchronizedStagesAccepted'] == 0
    days = bundle['days.json']
    assert len(days) == 2 and set(days[0]['spaceIds']).isdisjoint(days[1]['spaceIds'])
    assert set(days[0]['taskIds']).isdisjoint(days[1]['taskIds'])
    for label in ['A', 'B']:
        get = lambda suffix: bundle[f'{label}-{suffix}.json']
        assert not get('before-input').get('roundSynchronizations')
        assert get('effective')['readiness']['status'] == 'READY'
        assert get('general-structure-rejection')['status'] == 400
        assert get('mixed-preflight')['adapter']['status'] == 'UNSUPPORTED'
        assert get('counterfactual-preflight')['adapter']['status'] == 'SUPPORTED'
        solver = get('solver')
        assert solver == get('solver-repeat')
        assert solver['evidence']['completeForScope'] and solver['evidence']['hardValid']
        assert len(solver['proposal']) == 4 and len(solver['evidence']['selectedRoundPreparations']) == 2
        assert get('validation')['hardValid']
        assert not get('missing-preparation-validation')['hardValid']
        assert not get('desynchronized-validation')['hardValid']
        assert 'UNPLANNED_TASKS' in get('global-incomplete-validation')['reasonCodes']
        for name in ['wrongSpace', 'missingTask']:
            assert get('negative-' + name)['adapter']['status'] == 'UNSUPPORTED'
        for name in ['preparation', 'impossible']:
            r = get(f'negative-{name}-solver')
            assert r['proposal'] is None
            assert not any('BUDGET' in c or 'TIME_LIMIT' in c for c in r['evidence']['reasonCodes'])
        assert get('negative-impossible-without-sync')['proposal']
        future = get('independent-scope')
        assert len(future['problem']['problem']['analyticalFutureRoundSynchronizations']) == 1
        assert len(future['result']['proposal']) == 1
        assert len([w for w in future['result']['evidence']['futureStructuralWitnesses'] if w['kind'] == 'ROUND_SYNCHRONIZATION']) == 1
        assert get('stage-barrier')['code'] == 'STALE_CONFIG_REVISION'
        assert get('SQL-authority-barrier')['message'] == 'PLANNER_NEXT_CONFIGURATION_IMMUTABLE'
        assert get('SQL-replay-barrier')['message'] == 'STALE_ROUND_PREPARATION_CANDIDATE'
        simulated = get('simulated-product-proposal')
        assert simulated['simulationOnly'] and simulated['result']['outcome'] == 'PROPOSAL'
        assert len(simulated['result']['proposedDraftSnapshot']['tasks']) == 5
        assert len(simulated['result']['proposedDraftSnapshot']['roundPreparations']) == 2
        assert get('simulated-draft-validation')['hardValid']
        stage = get('product-stage')['activeStage']
        assert stage['ordinal'] == 1 and len(stage['snapshotJson']['tasks']) == 5
        assert not stage['snapshotJson'].get('roundPreparations')
        assert stage == get('product-restore')['redo']['activeStage']
        assert get('product-validation')['hardCount'] == get('product-validation')['requiredCount'] == 0
        for suffix in ['counterfactual-input', 'solver', 'identities', 'independent-scope']:
            key = f'{label}-{suffix}.json'
            assert semantic(a[key]) == semantic(b[key]), key
        sa = a[f'{label}-simulated-product-proposal.json']['result']
        sb = b[f'{label}-simulated-product-proposal.json']['result']
        assert sa['proposedDraftSnapshot'] == sb['proposedDraftSnapshot']
        assert sa['proposedDraftFingerprint'] == sb['proposedDraftFingerprint']

a2 = json.loads((repo / 'docs/evidence/p0-u00n/a2/comparison.json').read_text())
assert (a2['completed'], a2['stages'], a2['branches']) == (266, 11, 27049)
assert a2['fingerprint'] == '2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d'
for line in (root / 'SHA256SUMS').read_text().splitlines():
    expected, file = line.split('  ', 1)
    assert sha((root / file).read_bytes()) == expected, file
print(f'PASS: two native stacks, 4 ordinary Stages across runs; zero synchronized Stages; {len(m["sourceHashes"])} protected files; A2 receipt unchanged')
