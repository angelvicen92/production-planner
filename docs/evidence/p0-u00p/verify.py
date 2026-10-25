"""Verify public receipts or a fresh, real native run. No credentials/database needed."""
import gzip,hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def bundle(path=None):
    if path:return {p.name:json.loads(p.read_text()) for p in Path(path).glob('*.json')}
    return json.loads(gzip.decompress((HERE/'native/receipts.json.gz').read_bytes()))
def verify(data):
    report=data['integration.json']
    assert report['status']=='PASS' and report['remoteWrites']==0
    assert report['postgresVersion'].startswith('PostgreSQL 17.')
    expected=[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((ROOT/'supabase/migrations').glob('*.sql'))]
    assert report['migrations']==expected
    days=data['days.json'];assert len(days)==2
    assert set(days[0]['spaceIds']).isdisjoint(days[1]['spaceIds'])
    assert set(days[0]['taskIds']).isdisjoint(days[1]['taskIds'])
    for label in ['A','B']:
        get=lambda suffix:data[f'{label}-{suffix}.json']
        effective=get('effective')['roundSynchronization'];policy=effective['authority']['policies'][0]
        assert get('before-input').get('roundSynchronizations') is None
        assert get('removed-input')==get('before-input')
        assert get('input')['roundSynchronizations']==[policy]
        assert get('preflight')['status']=='SUPPORTED' and get('adapter')['status']=='SUPPORTED'
        revision=get('revision');assert int(revision['id'])==effective['revisionId']
        assert revision['fingerprint']==revision['identity_json']['configurationFingerprint']==get('canonical')['identity']['configurationFingerprint']
        assert revision['replay_snapshot_json']==get('canonical')['replay']
        transition=revision['diff_json']['roundSynchronizationTransition']
        assert transition['after']['policies']==[policy] and transition['contractVersion']==1
        members=[t for lane in policy['lanes'] for t in lane['taskIds']]
        assert len(members)==len(set(members))==4
        independent=next(t for t in get('input')['tasks'] if t['id'] not in members)
        assert independent['id'] not in members
        assert get('member-scope')['resolution']['productTaskIds']==sorted(members)
        assert get('space-scope')['resolution']['productTaskIds']==sorted(members)
        witness=get('independent-scope')['result']
        assert len(witness['proposal'])==1 and len([w for w in witness['evidence']['futureStructuralWitnesses'] if w['kind']=='ROUND_SYNCHRONIZATION'])==1
        assert get('S0-after-structure-additions-preview')['reason']=='REBOOTSTRAP_NO_ADDITIONS'
        s0,s1,s2=get('S0'),get('S1'),get('S2')
        assert s1['activeStage']['ordinal']==1 and s2['activeStage']['ordinal']==2
        assert s0['session']['id']==s1['session']['id']==s2['session']['id']
        assert s1['currentConfigRevisionId']!=s0['currentConfigRevisionId']
        assert len(s1['activeStage']['snapshotJson']['roundPreparations'])==2
        assert all(p['duration']==5 and p['end']-p['start']==5 for p in s1['activeStage']['snapshotJson']['roundPreparations'])
        assert s1['activeStage']['snapshotJson']['roundPreparations']==s2['activeStage']['snapshotJson']['roundPreparations']
        assert len([t for t in s1['draft']['tasks'] if t['startPlanned']])==4
        assert len([t for t in s2['draft']['tasks'] if t['startPlanned']])==5
        for t in s1['draft']['tasks']:
            if t['startPlanned']:assert next(x for x in s2['draft']['tasks'] if x['taskId']==t['taskId'])==t
        persisted=get('persisted-placements')
        lanes=[[t for t in persisted if t['id'] in lane['taskIds']] for lane in policy['lanes']]
        assert len(lanes[0])==len(lanes[1])==2
        assert [[t['start_planned'],t['end_planned']] for t in lanes[0]]==[[t['start_planned'],t['end_planned']] for t in lanes[1]]
        assert get('validation')['hardCount']==get('validation')['requiredCount']==0
        assert get('restore')['redo2']['activeStage']==s2['activeStage']
        assert get('restore')['rollback']['currentConfigRevisionId']==s2['currentConfigRevisionId']
        assert sorted(r['status'] for r in get('writer-race'))==[200,409]
        assert get('production-removal')['status']==200
        impossible=get('impossible-product-proposal')['assisted_result_json']
        assert impossible['outcome']=='NO_PROPOSAL' and not any('BUDGET' in c or 'TIME_LIMIT' in c for c in impossible['reasonCodes'])
        for name in ['aux','viewer','norole','anonymous','stale','duplicate','heterogeneous','missing','wrong-space','preparation','pending-proposal','dirty-draft','protected-preparation','protected-removal']:
            assert get('negative-'+name)['status']>=400,name
        if label=='B':assert get('negative-other-day')['status']>=400
        for name in ['actor-aux','actor-viewer','actor-norole','grant-anon','grant-authenticated','executed-done','executed-in_progress','lock','cas','replay','identity','recomputed-identity-and-replay','direct-authority','profile-088','historical-stage','frozen-profile']:
            assert get('SQL-'+name)['accepted'] is False,name
        assert get('SQL-concurrent-source-http')['status']==409
        for name in ['missing-preparation','move-one-lane','foreign-policy','replay']:
            assert get('certificate-'+name)['accepted'] is False and get('certificate-'+name)['hashesRecomputed']
        for name,r in data.items():
            if name.startswith(label+'-negative-'):assert r['status']>=400,name
            if name.endswith('-SQL-concurrent-source-http.json'):assert r['status']==409,name
            elif name.startswith(label+'-SQL-') or name.startswith(label+'-certificate-'):assert r['accepted'] is False,name
        assert get('stale-run')['status']==409
    independent=data['A-independent-first-stage.json'];compatible=data['A-compatible-post-stage-accepted.json'];admitted=data['A-after-rounds-admission.json'];complete=data['A-after-rounds-admission-stage.json']
    assert independent['session']['id']==compatible['session']['id']==admitted['session']['id']==complete['session']['id']
    assert compatible['currentConfigRevisionId']!=independent['currentConfigRevisionId']
    assert all(p['duration']==10 for p in compatible['activeStage']['snapshotJson']['roundPreparations'])
    assert len([t for t in complete['draft']['tasks'] if t['startPlanned']])==6
    assert len(data['A-admission-rollback.json']['draft']['tasks'])==6
    assert all(t['startPlanned'] is None for t in data['A-admission-rollback.json']['draft']['tasks'])
    assert data['A-admission-redo.json']['activeStage']==complete['activeStage']
    for label in ['A','B']:
        assert data[f'{label}-S1.json']['activeStage']['snapshotJson']['roundPreparations']
    return {'days':2,'acceptedStages':7,'synchronizedStages':6,'sqlAndCertificateRejections':sum(('-SQL-' in n or '-certificate-' in n) and 'accepted' in v for n,v in data.items()),'publicReceipts':len(data),'migrations':len(expected)}
data=bundle(sys.argv[1] if len(sys.argv)>1 else None)
result=verify(data)
if len(sys.argv)>2:
    other=bundle(sys.argv[2]);verify(other)
    for label in ['A','B']:
        for suffix in ['persisted-placements']:
            assert data[f'{label}-{suffix}.json']==other[f'{label}-{suffix}.json']
        for suffix in ['S1','S2']:
            assert data[f'{label}-{suffix}.json']['draft']['tasks']==other[f'{label}-{suffix}.json']['draft']['tasks']
    result['independentFreshGeometryRepeat']=True
if len(sys.argv)==1 and (HERE/'SHA256SUMS').exists():
    for line in (HERE/'SHA256SUMS').read_text().splitlines():
        digest,name=line.split('  ',1);assert hashlib.sha256((HERE/name).read_bytes()).hexdigest()==digest,name
print(json.dumps({'status':'PASS',**result},indent=2))
