"""Independent physical checks; reads receipts, never calls Planner or SQL."""
import json,pathlib,sys
root,out=map(pathlib.Path,sys.argv[1:])
read=lambda n:json.loads((root/(n+'.json')).read_text())
a=read('adapter');p=a['problem'];run=read('run') if (root/'run.json').exists() else read('joint-run')
e=run['evidence'];w=e['nominalPhysicalFutureWitness'];tasks=w['tasks'];meals=w['participantMeals']
by={t['id']:t for t in tasks};expected={t['id']:t for t in p['tasks']}
assert len(tasks)==len(by)==len(expected) and set(by)==set(expected)
overlap=lambda a,b:a['start']<b['end'] and b['start']<a['end']
groups={}
for t in p['tasks']:
    if t.get('jointGroupId'):groups.setdefault(t['jointGroupId'],set()).add(t['id'])
for t in tasks:
    x=expected[t['id']]
    for key in ['kind','spaceId','participantId','jointGroupId','itinerantUnitId','duration']:assert t.get(key)==x.get(key),(t['id'],key)
    assert set(t.get('requiredResourceIds',[]))==set(x.get('requiredResourceIds',[]))
    assert t['end']-t['start']==x['duration']
    for dep in x['dependencies']:assert by[dep]['end']<=t['start']
for members in groups.values():
    rows=[by[t] for t in members];first=rows[0]
    assert len(rows)>=2 and len({t['participantId'] for t in rows})==len(rows)
    for t in rows[1:]:
        assert all(t.get(k)==first.get(k) for k in ['start','end','spaceId','itinerantUnitId'])
        assert set(t.get('requiredResourceIds',[]))==set(first.get('requiredResourceIds',[]))
for i,a in enumerate(tasks):
    for b in tasks[i+1:]:
        if a.get('participantId') and a.get('participantId')==b.get('participantId'):assert not overlap(a,b)
        internal=any({a['id'],b['id']}<=ids for ids in groups.values())
        if internal:continue
        if a['spaceId']==b['spaceId']:assert not overlap(a,b)
        ar=set(a.get('requiredResourceIds',[])+([a['coachId']] if a.get('coachId') else []));br=set(b.get('requiredResourceIds',[])+([b['coachId']] if b.get('coachId') else []))
        if ar&br:assert not overlap(a,b)
obligations={m['sourceTaskId']:m for m in p['participantMeals']}
assert len(meals)==len({m['sourceTaskId'] for m in meals})==len(obligations)
assert set(obligations)=={m['sourceTaskId'] for m in meals}
for m in meals:
    o=obligations[m['sourceTaskId']]
    for k in ['id','participantId','duration']:assert m[k]==o[k]
    assert o['window']['start']<=m['start']<m['end']<=o['window']['end'] and m['end']-m['start']==o['duration']
    assert not any(t.get('participantId')==m['participantId'] and overlap(t,m) for t in tasks)
    assert sum(x['start']<=m['start']<x['end'] for x in meals)<=p['participantMealCapacity']['maxSimultaneous']
    for dep in o.get('dependencies',[]):assert by[dep]['end']<=m['start']
policy=p['technicalChains'][0];phase={id:n for n,ids in enumerate(policy['phases']) for id in ids}
ordered=sorted([by[id] for id in policy['orderedTaskIds']],key=lambda t:t['start'])
for members in groups.values():assert len(members&set(policy['orderedTaskIds']))==1
assert all(a['end']==b['start'] for a,b in zip(ordered,ordered[1:]))
assert [phase[t['id']] for t in ordered]==sorted(phase[t['id']] for t in ordered)
cert=read('certificate') if (root/'certificate.json').exists() else read('joint-certificate')
assert cert['status']=='WITNESS' and cert['consumed']==0 and e['acceptedSupportingPlacements']==[]
for resource in p['resources']:
    for t in tasks:
        if resource['id'] in t.get('requiredResourceIds',[]):assert any(w['start']<=t['start'] and t['end']<=w['end'] for w in resource['availability'])
result={'status':'PASS_MEMORY_ONLY','productiveObligations':len(tasks),'productivePhysicalOperations':len(tasks)-sum(len(ids)-1 for ids in groups.values()),'participantMeals':len(meals),'jointGroups':len(groups),'physicalPhaseOperations':len(ordered),'physicalPhaseMinutes':sum(t['end']-t['start'] for t in ordered),'certificateSearch':0,'sqlStage':False}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
