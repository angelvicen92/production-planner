"""Independent checks over authentic public UI/API/SQL receipts; no DB writes."""
import json, pathlib, sys
root,out=map(pathlib.Path,sys.argv[1:])
read=lambda name:json.loads((root/(name+'.json')).read_text())
minute=lambda h:int(h[:2])*60+int(h[3:])
overlap=lambda a,b:a['start']<b['end'] and b['start']<a['end']
source=read('native-input');eva=next(r for r in source['planResourceItems'] if r['name']=='EVA')
assert (eva['availabilityStart'],eva['availabilityEnd'])==('16:00','21:00')
resources=read('native-sql-state')['resources'];sql=next(r for r in resources if int(r['id'])==eva['id'])
assert (sql['availability_start'],sql['availability_end'])==('16:00','21:00')
assert read('native-resource-preservation')['before']==read('native-resource-preservation')['after']
writes=read('ui-writes')
assert any(r['path']=='/api/resource-items' and r['method']=='POST' and r['request'].get('defaultAvailabilityStart')=='16:00' and r['request'].get('defaultAvailabilityEnd')=='21:00' and r['status']==200 for r in writes)
assert any(r['path'].startswith('/api/resource-items/') and r['method']=='PATCH' and r['request'].get('defaultAvailabilityStart')=='18:00' for r in writes)
assert any('/resource-items/' in r['path'] and '/plans/' in r['path'] and r['method']=='PATCH' and r['request'].get('availabilityStart')=='16:00' and 'expectedRevisionId' in r['request'] and r['status']==200 for r in writes)
adhoc=read('adhoc-inactive-window');assert adhoc['resourceItemId'] is None and adhoc['isAvailable'] is False and adhoc['availabilityStart']=='11:00'
reports=[]
for label,count,total in [('generic',4,15)]:
    source=read(label+'-input');problem=read(label+'-adapter')['problem']
    assert source['mealMode']=='flexible_meal_window'
    assert len(source['tasks'])==total and len(problem['participantMeals'])==count
    assert read(label+'-effective')['technicalChains']['authority']['policies']==source['technicalChains']
    assert read(label+'-revision')['replay_snapshot_json']['authorities']['plan_workday'][0]['plannerNextAuthorities']['technicalChains']==source['technicalChains']
    obligations={m['sourceTaskId']:m for m in problem['participantMeals']}
    previous=None;stages=[]
    for ordinal in [1,2]:
        prefix=f'{label}-S{ordinal}';result=read(prefix+'-run')['assisted_result_json'];e=result['evidence'];proof=e['nominalPhysicalFutureWitness']
        tasks=proof['tasks'];meals=proof['participantMeals'];by_id={t['id']:t for t in tasks}
        assert len(by_id)==len(tasks)==total-count
        assert len(meals)==len({m['sourceTaskId'] for m in meals})==count
        assert set(obligations)=={m['sourceTaskId'] for m in meals}
        assert e['globalMealGate']=='PASS' and e['globallyCertifiedParticipantMealCount']==count
        assert e['technicalChainCertificate']['status']=='WITNESS' and e['technicalChainCertificate']['consumed']==0
        assert not e['acceptedSupportingPlacements']
        for m in meals:
            o=obligations[m['sourceTaskId']]
            assert m['participantId']==o['participantId'] and m['duration']==o['duration']==40
            assert m['end']-m['start']==o['duration'] and o['window']['start']<=m['start'] and m['end']<=o['window']['end']
            assert not any(t.get('participantId')==m['participantId'] and overlap(t,m) for t in tasks)
        for m in meals:
            assert sum(x['start']<=m['start']<x['end'] for x in meals)<=problem['participantMealCapacity']['maxSimultaneous']
        all_ids={**by_id,**{m['sourceTaskId']:m for m in meals}}
        for resource in problem['resources']:
            for t in tasks:
                if resource['id'] in t.get('requiredResourceIds',[]):assert any(w['start']<=t['start'] and t['end']<=w['end'] for w in resource['availability'])
        for t in tasks:
            for dep in t.get('dependencies',[]):assert all_ids[dep]['end']<=t['start']
        for o in obligations.values():
            for dep in o.get('dependencies',[]):assert all_ids[dep]['end']<=all_ids[o['sourceTaskId']]['start']
        for i,a in enumerate(tasks):
            for b in tasks[i+1:]:
                if a.get('participantId') is not None and a.get('participantId')==b.get('participantId'):assert not overlap(a,b)
                if a['spaceId']==b['spaceId']:assert not overlap(a,b)
                ar=set(a.get('requiredResourceIds',[])+([a['coachId']] if a.get('coachId') else []))
                br=set(b.get('requiredResourceIds',[])+([b['coachId']] if b.get('coachId') else []))
                if ar&br:assert not overlap(a,b)
        policy=problem['technicalChains'][0];phase_by_id={t:i for i,phase in enumerate(policy['phases']) for t in phase}
        ordered=sorted([by_id[t] for t in policy['orderedTaskIds']],key=lambda t:t['start'])
        assert all(a['end']==b['start'] for a,b in zip(ordered,ordered[1:]))
        assert [phase_by_id[t['id']] for t in ordered]==sorted(phase_by_id[t['id']] for t in ordered)
        sql=read(prefix+'-sql');snapshot=sql['snapshot_json']
        assert snapshot==result['proposedDraftSnapshot']
        assert snapshot==read(prefix+'-draft')['draft']
        assert sql['snapshot_fingerprint']==result['proposedDraftFingerprint']
        placed=[t for t in snapshot['tasks'] if t['startPlanned'] is not None]
        assert len(placed)==(3 if ordinal==1 else total)
        for task in placed:
            physical=all_ids['task:'+str(task['taskId'])]
            assert minute(task['startPlanned'])==physical['start'] and minute(task['endPlanned'])==physical['end']
        if ordinal==1:
            assert all(t['startPlanned'] is None for t in snapshot['tasks'] if 'task:'+str(t['taskId']) in obligations)
        if previous:
            assert all(next(t for t in snapshot['tasks'] if t['taskId']==old['taskId'])==old for old in previous['tasks'] if old['startPlanned'] is not None)
        previous=snapshot
        validation=read(prefix+'-validated')['validation'];assert validation['hardCount']==validation['requiredCount']==0
        attacks=read(prefix+'-negatives');assert len(attacks)==12 and all(a['error']['code']=='P0001' for a in attacks)
        assert all(a['hashesRecomputed'] for a in attacks if a['category']=='PHYSICAL')
        stages.append({'ordinal':ordinal,'planned':len(placed),'pendingMealsCertified':count if ordinal==1 else 0,'branches':e['work']['branchesExplored'],'snapshotFingerprint':sql['snapshot_fingerprint']})
    assert read(label+'-cold-sql')[-1]['snapshot_json']==previous
    reports.append({'label':label,'obligations':total,'meals':count,'stages':stages,'physicalChecks':'PASS','coldSQL':'PASS','protectedContinuation':'EXACT'})
result={'status':'PASS','days':reports,'sqlStages':2,'remoteWrites':0}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
