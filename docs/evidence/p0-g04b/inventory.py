"""Independently reconcile native obligations and the effective partial order."""
import json, pathlib, sys
root, output = map(pathlib.Path, sys.argv[1:])
read = lambda n: json.loads((root / (n + '.json')).read_text())
source = read('authored-input')
a = read('authored-adapter')
catalogue = read('styling-catalogue')
assert a['status'] == 'SUPPORTED'
p = a['problem']
entry_id = catalogue['entry']['id']
exit_ids = {v['id'] for v in catalogue['exitTemplates'].values()}
meal_id = catalogue['meal']['id']
rows = source['tasks']
assert len(rows) == len({t['id'] for t in rows}) == 141
assert len(p['tasks']) == 122 and len(p['participantMeals']) == 19
assert len(source['locks']) == 0
by_id = {t['id']: t for t in rows}
graph = {t['id']: set() for t in rows}
edges = []
for t in rows:
    for predecessor in t.get('dependsOnTaskIds', []):
        assert predecessor in by_id
        graph[predecessor].add(t['id'])
        edges.append({'from': predecessor, 'to': t['id'], 'authority': 'TEMPLATE_SNAPSHOT'})
counts = {}
inventory = []
for t in rows:
    family = ('entrada' if t['templateId'] == entry_id else 'salida' if t['templateId'] in exit_ids
              else 'Sodexo' if t['templateId'] == meal_id else t.get('operationalRole') if t.get('operationalRole') in ['transport_arrival', 'transport_departure']
              else t.get('plannerNextKind') if t.get('plannerNextKind') in ['main', 'vocal'] else 'macro')
    counts[family] = counts.get(family, 0) + 1
    inventory.append({'id': t['id'], 'participantId': t['contestantId'], 'participant': t['contestantName'],
        'family': family, 'templateId': t['templateId'], 'spaceId': t['spaceId'],
        'duration': t['durationOverrideMin'], 'dependencies': t.get('dependsOnTaskIds', []),
        'marginBefore': t.get('participantMarginBeforeMinutes'), 'marginAfter': t.get('participantMarginAfterMinutes')})
assert counts == {'transport_arrival': 19, 'transport_departure': 19, 'entrada': 19, 'Sodexo': 19, 'vocal': 19, 'main': 19, 'macro': 8, 'salida': 19}, counts
for participant in p['participants']:
    pid = int(participant['id'].split(':')[1])
    tasks = [t for t in rows if t['contestantId'] == pid]
    arrival = next(t for t in tasks if t['operationalRole'] == 'transport_arrival')
    departure = next(t for t in tasks if t['operationalRole'] == 'transport_departure')
    entry = next(t for t in tasks if t['templateId'] == entry_id)
    exit = next(t for t in tasks if t['templateId'] in exit_ids)
    vocal = next(t for t in tasks if t.get('plannerNextKind') == 'vocal')
    # The existing transport authority requires IN first / OUT last including meals.
    for t in tasks:
        if t != arrival:
            graph[arrival['id']].add(t['id']); edges.append({'from': arrival['id'], 'to': t['id'], 'authority': 'TRANSPORT_FIRST'})
        if t != departure:
            graph[t['id']].add(departure['id']); edges.append({'from': t['id'], 'to': departure['id'], 'authority': 'TRANSPORT_LAST'})
    def descendants(tid):
        seen, pending = set(), list(graph[tid])
        while pending:
            cur = pending.pop()
            if cur in seen: continue
            seen.add(cur); pending.extend(graph[cur])
        return seen
    assert entry['id'] not in descendants(vocal['id']) and vocal['id'] not in descendants(entry['id'])
    assert all(t['id'] in descendants(entry['id']) for t in tasks if t not in [entry, arrival, vocal])
    assert all(exit['id'] in descendants(t['id']) for t in tasks if t not in [exit, departure])
    assert exit['participantMarginAfterMinutes'] == departure['participantMarginBeforeMinutes'] == 0
    assert entry['durationOverrideMin'] == 10 and exit['durationOverrideMin'] == 5
    assert all(t['id'] not in descendants(t['id']) for t in tasks)
styles = [t for t in rows if t['templateId'] == entry_id or t['templateId'] in exit_ids]
spaces = {t['spaceId'] for t in styles}; assert len(spaces) == 1
space = next(s for s in p['spaces'] if s['id'] == 'space:' + str(next(iter(spaces))))
assert 'mealPolicy' not in space and space.get('secondaryContinuity') != 'REQUIRED'
assert all(t.get('blocksSpace') is not False and not t.get('declaredResourceIds') and not t.get('assignedResourceIds') and t.get('itinerantTeamRequirement') in [None, 'none'] for t in styles)
assert not [t for t in p['tasks'] if t['id'] in {'task:'+str(s['id']) for s in styles} and t.get('requiredResourceIds')]
result = {'status': 'PASS', 'counts': counts, 'total': len(rows), 'sourceTaskCount': len(p['tasks']), 'mealCount': len(p['participantMeals']),
    'stylingSpace': space, 'stylingMinutes': 285, 'capacity': 'HARD exclusive shared space = 1',
    'cycleFree': True, 'vocalAndEntryUnordered': True, 'OUTBoundaryAuthority': 'transportPolicy.departure (all other obligations, including meals)',
    'explicitOUTDependencies': [t['id'] for t in rows if t['operationalRole'] == 'transport_departure' and t.get('dependsOnTaskIds')],
    'obligations': inventory, 'edges': edges}
output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({k: v for k, v in result.items() if k not in ['obligations', 'edges', 'stylingSpace']}))
