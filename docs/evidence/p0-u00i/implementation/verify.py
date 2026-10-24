#!/usr/bin/env python3
"""Offline audit of the limited productive contract; never contacts a service."""
import gzip
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent
repo = root.parents[3]


def read(path):
    path = Path(path)
    if not path.exists():
        path = Path(str(path) + '.gz')
    return json.loads(gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


authority = read(root / 'source-authority.json')
assert authority['base'] == 'e79f8ee1a13ef5f5df58371abc851b4746385412'
for name, digest in authority['sourceHashes'].items():
    assert sha(repo / name) == digest, name
for name, digest in authority['historicalMigrationHashes'].items():
    assert sha(repo / name) == digest, name
# This is an explicit invariant, including the fixtures used by the public API gate.
demo_hashes = {str(p.relative_to(repo)): sha(p) for p in (repo / 'script/demo').rglob('*') if p.is_file()}
assert demo_hashes == authority['historicalDemoHashes'], 'Demo changed'

native = root / 'native'
manifest = read(root / 'native-manifest.json')
assert manifest['remoteWrites'] == 0 and manifest['node'] == '20.20.2'
for name, digest in manifest['sourceHashes'].items():
    assert digest == sha(repo / name), name
assert manifest['lockfileSha256'] == sha(repo / 'package-lock.json')
integration = read(native / 'integration.json')
assert integration['status'] == 'PASS' and integration['remoteWrites'] == 0
security = read(native / 'guard-security.json')
assert security['privateSchema'] and not security['publicRpcAdded']
assert len(security['roles']) == 3
assert all(not row['prosecdef'] and not row['schema_usage'] and not row['executable']
           and row['proconfig'] == ['search_path=""'] for row in security['roles'])
summary = read(native / 'summary.json')
assert summary['status'] == 'PASS' and summary['remoteWrites'] == 0
assert [(d['label'], d['obligations'], len(d['stages'])) for d in summary['days']] == [('A', 2, 1), ('B', 4, 2)]
adversary_count = 0
for day in summary['days']:
    label = day['label']
    source = read(native / f'{label}-input.json')
    by_id = {task['id']: task for task in source['tasks']}
    inventory = {r['resourceItemId']: r['id'] for r in source['planResourceItems']}
    previous = {}
    for stage in day['stages']:
        prefix = f"{label}-S{stage['stage']}"
        result = read(native / f'{prefix}-run.json')['assisted_result_json']
        accepted = read(native / f'{prefix}-stage.json')['activeStage']
        draft = read(native / f'{prefix}-draft.json')['draft']
        validation = read(native / f'{prefix}-validation.json')
        replay = read(native / f'{prefix}-replay.json')['assisted_result_json']
        rows = {int(r['id']): r for r in read(native / f'{prefix}-daily.json')}
        assert validation['hardCount'] == validation['requiredCount'] == 0
        assert validation['reportJson']['nominalResourceFuture'] == 'CERTIFIED'
        assert accepted['snapshotJson'] == draft == result['proposedDraftSnapshot']
        assert replay['proposedDraftSnapshot'] == draft
        assert replay['evidence']['fingerprint'] == result['evidence']['fingerprint']
        assert replay['evidence']['work'] == result['evidence']['work']
        assert result['evidence']['work']['branchBudgetLimit'] == 10000
        witness = result['evidence']['nominalPhysicalFutureWitness']['tasks']
        assert len(witness) == day['obligations']
        current = {}
        for row in accepted['snapshotJson']['tasks']:
            task = by_id[row['taskId']]
            assert rows[row['taskId']]['status'] == 'pending'
            if not row['startPlanned']:
                assert not row.get('assignedResourceIds') and not rows[row['taskId']]['assigned_resource_ids']
                continue
            current[row['taskId']] = row
            assert row.get('assignedResourceIds', []) == rows[row['taskId']]['assigned_resource_ids']
            requirements = task.get('resourceRequirements') or {}
            fixed = {inventory[int(i)] for i in requirements.get('byItem', {})}
            assigned = set(row.get('assignedResourceIds', []))
            assert fixed <= assigned
            if requirements.get('anyOf'):
                domain = {inventory[i] for i in requirements['anyOf'][0]['resourceItemIds']}
                assert len(assigned & domain) == 1
                assert assigned == fixed | (assigned & domain)
                chosen = next(t for t in witness if t['id'] == f"task:{row['taskId']}")
                assert chosen['nominalResourceChoice']['selectedResourceId'] == f'plan-resource:{next(iter(assigned & domain))}'
        for task_id, row in previous.items():
            assert current[task_id] == row, 'Protected identity changed'
        previous = current
        attacks = read(native / f'{prefix}-sql-adversaries.json')
        assert all(a['hashesRecomputed'] and a['rolledBack'] and a['error'] for a in attacks)
        assert {'omit', 'double', 'invented', 'missing-choice', 'future-omission', 'future-collision', 'draft', 'base', 'revision', 'permission'} <= {a['guard'] for a in attacks}
        adversary_count += len(attacks)
    assert len(previous) == day['obligations']
assert adversary_count >= 37
a = read(native / 'A-S1-stage.json')['activeStage']['snapshotJson']['tasks']
assert a[0]['assignedResourceIds'] == [summary['days'][0]['resources'][1]]
assert a[1]['assignedResourceIds'] == [summary['days'][0]['resources'][0]]
b1 = read(native / 'B-S1-stage.json')['activeStage']['snapshotJson']['tasks']
assert sum(bool(t['startPlanned']) for t in b1) == 1
assert read(root / 'before-integrity' / 'sql-omission-before-110.json') == {'accepted': True, 'hashesRecomputed': True, 'rolledBack': True}
assert read(root / 'cold-replay.json')['status'] == 'PASS'
regressions = read(root / 'regression-comparison.json')
assert regressions['status'] == 'PASS'
for scenario, labels in [('main', ['first', 'second']), ('standalone', ['first', 'second']),
                         ('itinerant', ['technical', 'auxiliary'])]:
    for label in labels:
        old = read(repo / 'docs/evidence/p0-u00e/v2' / f'regression-{scenario}' / f'{label}-preflight.json')
        new = read(root / 'regressions' / scenario / f'{label}-preflight.json')
        for field in ['problem', 'problemFingerprint', 'identityMapFingerprint']:
            assert old[field] == new[field], (scenario, label, field)
        old = read(repo / 'docs/evidence/p0-u00e/v2' / f'regression-{scenario}' / f'{label}-stage.json')['activeStage']
        new = read(root / 'regressions' / scenario / f'{label}-stage.json')['activeStage']
        assert old['snapshotJson'] == new['snapshotJson'] and old['snapshotFingerprint'] == new['snapshotFingerprint']
for scenario, label in [('main', 'main'), ('standalone', 'technical')]:
    old = read(repo / 'docs/evidence/p0-u00e/v2' / f'regression-{scenario}' / f'{label}-additions-rebootstrap.json')
    new = read(root / 'regressions' / scenario / f'{label}-additions-rebootstrap.json')
    for phase in ['before', 'after']:
        assert old[phase]['activeStage']['snapshotJson'] == new[phase]['activeStage']['snapshotJson']
    assert old['historical']['snapshot_json'] == new['historical']['snapshot_json']
for scenario in ['main', 'standalone', 'itinerant', 'setup', 'transport', 'meals', 'resources']:
    assert read(root / 'regressions' / scenario / 'integration.json')['status'] == 'PASS'
assert read(root / 'regressions/setup-base-frozen.json') == read(root / 'regressions/setup-candidate-frozen.json')
assert read(root / 'regressions/transport-frozen.json')['status'] == 'PASS'
for scenario, baseline, counts in [('meals', 'docs/evidence/p0-u00g/implementation/native', {'A': 2, 'B': 3}),
                                  ('resources', 'docs/evidence/p0-u00h/native', {'A': 1, 'B': 2})]:
    for label, count in counts.items():
        for stage in range(1, count + 1):
            name = f'{label}-S{stage}-stage.json'
            old = read(repo / baseline / name)['activeStage']
            new = read(root / 'regressions' / scenario / name)['activeStage']
            assert old['snapshotJson'] == new['snapshotJson'] and old['snapshotFingerprint'] == new['snapshotFingerprint']
series = [root / 'a2' / name for name in ['base', 'candidate', 'repeat']]
runs = [read(folder / 'run.json') for folder in series]
snapshots = [read(folder / 'snapshots.json') for folder in series]
assert snapshots[0] == snapshots[1] == snapshots[2]
without_times = lambda run: {**run, 'iterations': [{k: v for k, v in s.items() if k != 'durationMs'} for s in run['iterations']]}
assert without_times(runs[0]) == without_times(runs[1]) == without_times(runs[2])
assert read(series[0] / 'runtime.json') == read(series[1] / 'runtime.json') == read(series[2] / 'runtime.json')
assert all(run['status'] == 'PASS' and run['completedObligationCount'] == 266 and run['stageCount'] == 11 for run in runs)
assert [sum(s['branchesExplored'] for s in run['iterations']) for run in runs] == regressions['a2']['branches']
audit = read(root / 'a2/canonical-audit.json')
assert audit['status'] == 'PASS' and audit['snapshotsUnchanged']
assert len(audit['stagesBefore']) == len(audit['stagesAfter']) == 11
assert regressions['a2']['branches'] == [27049, 27049, 27049]
assert regressions['a2']['allSnapshotsIdentical'] and regressions['a2']['fullReportsIdenticalExceptDurations']
assert regressions['a2']['fingerprint'] == '2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d'
checks = read(root / 'checks' / 'suite-execution.json')
assert checks['exitCode'] == 0
tap = gzip.decompress((root / 'checks/product-suite.tap.gz').read_bytes()).decode()
counts = {key: int(re.findall(rf'^# {key} (\d+)$', tap, re.M)[-1]) for key in ['tests', 'pass', 'fail', 'skipped']}
assert counts['tests'] == counts['pass'] == 3168 and counts['fail'] == counts['skipped'] == 0
print(json.dumps({'status': 'PASS', 'days': [2, 4], 'acceptedStages': 3,
                  'sqlAttacksRejected': adversary_count, 'a2': '266/266; 11 Stages; 27049 branches',
                  'suite': counts, 'remoteWrites': 0}))
