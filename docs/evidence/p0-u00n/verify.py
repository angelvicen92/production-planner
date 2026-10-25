"""Verify committed receipts, or a fresh native directory and optional repeat."""
import gzip
import hashlib
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def read_bundle(path=None, name='receipts.json.gz'):
    if path:
        return {p.name: json.loads(p.read_text()) for p in pathlib.Path(path).glob('*.json')}
    return json.loads(gzip.decompress((HERE / 'native' / name).read_bytes()))


def verify(data):
    checks = []
    def check(value, name):
        assert value, name
        checks.append(name)
    integration = data['integration.json']
    check(integration['status'] == 'PASS' and integration['remoteWrites'] == 0, 'native stack, no remote writes')
    check('PostgreSQL 17' in integration['postgresVersion'], 'PostgreSQL 17')
    check(len(integration['migrations']) == 116 and integration['migrations'][-1]['file'].startswith('113_'), 'complete ledger through 113')
    for day in data['days.json']:
        label, added = day['label'], day['addedTaskId']
        def get(name): return data[f'{label}-{name}.json']
        s1, admitted, s2 = get('S1'), get('admitted'), get('S2')
        check(s1['activeStage']['ordinal'] == 1, f'{label}: actual accepted S1')
        check(get('preview')['allowed'] and get('preview')['mode'] == 'POST_STAGE' and get('preview')['addedTaskIds'] == [added], f'{label}: exact pure-addition review')
        check(admitted['session']['id'] == s1['session']['id'] == s2['session']['id'], f'{label}: same session')
        check(admitted['activeStage'] == s1['activeStage'], f'{label}: literal S1 unchanged')
        check(admitted['currentConfigRevisionId'] != s1['currentConfigRevisionId'], f'{label}: new effective revision')
        check(admitted['workingOrigin']['pendingLaterTaskIds'] == [added], f'{label}: explicit pending projection')
        check([t for t in admitted['draft']['tasks'] if t['taskId'] != added] == s1['draft']['tasks'], f'{label}: all previous snapshot decisions preserved')
        check(next(t for t in admitted['draft']['tasks'] if t['taskId'] == added)['startPlanned'] is None, f'{label}: admission accepts no placement')
        transition = get('transition')[0]
        check(transition['added_task_ids_json'] == [added] and int(transition['previous_revision_id']) == s1['currentConfigRevisionId'] and int(transition['config_revision_id']) == admitted['currentConfigRevisionId'], f'{label}: immutable versioned provenance')
        check([t for t in transition['sources_json']['daily_tasks'] if t['id'] != added] == get('sources-S1')['daily_tasks'], f'{label}: admission leaves consolidated work untouched')
        causal=get('source-comparison-causal')['value'];check(causal['comparison']=={'legacy_contains':True,'exact_equal':False} and causal['current']['reason']=='REBOOTSTRAP_TASK_CHANGED_OR_REMOVED', f'{label}: exact source equality rejects a nested-array extension')
        revision = get('revision')
        check(revision['parentRevisionId'] == s1['currentConfigRevisionId'] and revision['identityJson']['configurationFingerprint'] == revision['fingerprint'] and revision['replaySnapshotJson']['authorities'], f'{label}: full revision identity and replay')
        result = get('S2-proposal')['assisted_result_json']
        check(result['outcome'] == 'PROPOSAL' and any(t['taskId'] == added for t in result['proposal']) and any(t['taskId'] == added for t in result['proposedDraftSnapshot']['tasks']), f'{label}: obligation in solution and complete snapshot')
        check(result['evidence']['completeForScope'] and result['evidence']['protectedPlacementsPreserved'] and result['evidence']['hardValid'] and result['evidence']['requiredValid'], f'{label}: real validation and automatic protection')
        check(s2['activeStage']['parentStageId'] == s1['activeStage']['id'] and s2['activeStage']['configRevisionId'] == admitted['currentConfigRevisionId'], f'{label}: accepted S2 provenance')
        check([t for t in s2['draft']['tasks'] if t['taskId'] != added] == s1['draft']['tasks'], f'{label}: accepted placements and assignments unchanged')
        added_row = next(t for t in s2['draft']['tasks'] if t['taskId'] == added)
        protected = [t for t in s1['draft']['tasks'] if t['startPlanned']]
        check(max(t['endPlanned'] for t in protected) <= added_row['startPlanned'], f'{label}: compatible later interval')
        if label == 'B': check(protected[0]['assignedResourceIds'] == added_row['assignedResourceIds'] and len(added_row['assignedResourceIds']) == 1, 'B: one physical camera, no duplicate capacity')
        restored, redone, branch = get('rollback'), get('redo'), get('branch')
        check(restored['activeStage'] == s1['activeStage'] and restored['draft'] == admitted['draft'], f'{label}: exact decisions plus pending later obligation')
        check(restored['currentConfigRevisionId'] == admitted['currentConfigRevisionId'] and restored['workingOrigin']['pendingLaterTaskIds'] == [added], f'{label}: current configuration separate from historical provenance')
        check(get('rollback-S0')['activeStage'] == data[f'{label}-S0.json']['activeStage'] and len(get('rollback-S0')['draft']['tasks']) == len(s2['draft']['tasks']) and all(t['startPlanned'] is None for t in get('rollback-S0')['draft']['tasks']), f'{label}: S0 projection retains every current obligation')
        check(get('redo-S1')['draft'] == admitted['draft'], f'{label}: redo across both older universes')
        check(redone['activeStage'] == s2['activeStage'] and redone['draft'] == s2['draft'], f'{label}: redo')
        check(next(s for s in branch['history'] if s['id'] == s2['activeStage']['id'])['archivedAt'] and next(s for s in branch['history'] if s['id'] == s1['activeStage']['id']) == s1['activeStage'], f'{label}: divergence archives future, S1 untouched')
        check(get('continuation')['assisted_result_json']['outcome'] == 'PROPOSAL', f'{label}: continuation after S2')
        for name in ['cas','base','config','token','list','actor','missing-historical-fingerprint','forged-origin','finish-after-source-addition','task-writer','config-writer','atomic-rollback']:
            check(get('attack-' + name)['ok'] is False, f'{label}: rejection {name}')
        check(get('attack-finish-versus-admission')['code'] == '55P03', f'{label}: two-connection finish race')
        check(get('attack-atomic-counts')['before'] == get('attack-atomic-counts')['after'], f'{label}: no partial transaction effects')
        for name in ['edit','delete','participant','assignment','authority','baseline','partial-baseline','task-row-baseline','participant-row-baseline']:
            check(get('negative-' + name)['ok'] and not get('negative-' + name)['value']['allowed'], f'{label}: pure-addition boundary {name}')
        for name in ['omit','move-protected']:
            attack = get('attack-' + name)
            check(not attack['accepted'] and attack['hashesRecomputed'] and attack['message'] == 'RUN_RESULT_INVALID', f'{label}: recalculated-hash attack {name}')
        check(get('permissions')['status'] == 403 and get('old-apply')['status'] == 409 and get('duplicate')['status'] == 409, f'{label}: permissions, obsolete proposal and duplicate admission')
        check(get('late-addition')['status'] == 409 and get('late-addition')['body']['code'] == 'STALE_OBLIGATION_SOURCES', f'{label}: insertion between validate and accept')
        check(get('finish-after-admission')['message'] == 'STALE_CONFIG_REVISION' and get('inflight-after')['status'] == 'error', f'{label}: no late run resurrection')
        for status in ['done','in_progress']:
            check(get('execution-conflict-' + status)['message'] == 'RESTORE_EXECUTION_CONFLICT', f'{label}: immutable execution {status}')
    check(data['B-stale-exception-accept.json']['message'] == 'STALE_VALIDATION', 'exception lifecycle stale between validation and accept')
    check(data['B-stale-exception.json']['message'] == 'VALIDATION_NOT_ACCEPTABLE', 'STALE stored exception cannot certify a proposal')
    continuation = data['B-exception-continuation.json']['activeStage']['validationSummaryJson']
    check(not continuation['hardValid'] and continuation['hardCount'] > 0 and continuation['report']['newHardCount'] == 0, 'ACTIVE exception retains material truth after further admission')
    check(data['B-new-violation.json']['reportJson']['newHardCount'] > 0 and data['B-new-violation-refused.json']['status'] == 422, 'new obligation violation never inherits old exception')
    check(all(e['status'] == 'SUPERSEDED' for e in data['B-exception-lifecycle.json']), 'material edit supersedes old exceptions')
    check(data['B-exception-attack-false-hard-valid.json']['message'] == 'VALIDATION_NOT_ACCEPTABLE', 'false HARD validity rejected despite recalculated hashes')
    return checks


def material(data):
    return {label: {name: data[f'{label}-{name}.json']['draft'] if name in ['S1','admitted','S2','rollback','redo','branch'] else data[f'{label}-{name}.json']['assisted_result_json']
                   for name in ['S1','admitted','S2','rollback','redo','branch','S2-proposal','continuation']} for label in ['A','B']}


def strip_runtime(value):
    if isinstance(value,list): return [strip_runtime(v) for v in value]
    if isinstance(value,dict): return {k:strip_runtime(v) for k,v in value.items() if k not in {'durationMs','elapsedMs','runtimeMs'}}
    return value


data=read_bundle(sys.argv[1] if len(sys.argv)>1 else None)
checks=verify(data)
if len(sys.argv)>2 or len(sys.argv)==1:
    repeat=read_bundle(sys.argv[2]) if len(sys.argv)>2 else read_bundle(name='repeat-receipts.json.gz')
    verify(repeat)
    assert strip_runtime(material(data)) == strip_runtime(material(repeat)), 'deterministic material outputs differ'
    checks.append('independent native repeat: snapshots and full proposal material identical')
if len(sys.argv)==1:
    checks_meta=json.loads((HERE/'validation.json').read_text())
    assert checks_meta['status']=='PASS'
    a2=json.loads((HERE/'a2/comparison.json').read_text())
    assert a2['certificatesRevalidated']==22 and a2['branches']==27049 and a2['completed']==266 and a2['stages']==11
    assert a2['fingerprint']=='2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d'
    for name,digest in checks_meta['artifacts'].items():assert hashlib.sha256((HERE/name).read_bytes()).hexdigest()==digest,name
    for name,digest in checks_meta['sourceHashes'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,name
    authorities=json.loads((HERE/'authorities.json').read_text())
    for name,digest in authorities['hashes'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,name
    regressions=json.loads((HERE/'regressions/summary.json').read_text())
    assert len(regressions['cases'])==10 and regressions['coldReplay']['status']=='PASS'
    for case in regressions['cases']:
        receipts=json.loads(gzip.decompress((HERE/'regressions'/case['bundle']).read_bytes()))
        integration=receipts['integration.json']
        assert integration['status']=='PASS' and integration['remoteWrites']==0
        assert len(integration['migrations'])==116 and integration['migrations'][-1]['file'].startswith('113_')
    checks.append('final A2, validation metadata and artifact hashes verified')
print(json.dumps({'status':'PASS','checks':len(checks),'details':checks},indent=2,ensure_ascii=False))
