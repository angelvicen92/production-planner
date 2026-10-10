import json,pathlib,time,sys
from ortools.sat.python import cp_model
# External diagnostic only. Install ortools in a scratch venv, not project dependencies.
p=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else 'work/asst010-protected-oracle');data=json.loads((p/'full-oracle-input.json').read_text());source=data['source']
model=cp_model.CpModel();starts={};ends={};task_intervals={}
for row in data['domains']:
 if not row['starts']:raise SystemExit('Zero static task domain: '+row['id'])
 s=model.new_int_var_from_domain(cp_model.Domain.from_values(row['starts']),row['id'])
 e=model.new_int_var(min(row['starts'])+row['duration'],max(row['starts'])+row['duration'],row['id']+'-end')
 starts[row['id']]=s;ends[row['id']]=e;task_intervals[row['id']]=model.new_interval_var(s,row['duration'],e,row['id'])
meal_intervals=[]
for meal in source['participantMeals']:
 id=meal['sourceTaskId'];lo=meal['window']['start'];hi=meal['window']['end']-meal['duration']
 values=list(range(lo,hi+1,5));s=model.new_int_var_from_domain(cp_model.Domain.from_values(values),id);e=model.new_int_var(lo+meal['duration'],hi+meal['duration'],id+'-end')
 starts[id]=s;ends[id]=e;interval=model.new_interval_var(s,meal['duration'],e,id)
 meal_intervals.append(interval)
 model.add_no_overlap([interval,*[task_intervals[t['id']] for t in data['tasks'] if t.get('participantId')==meal['participantId']]])
 for dep in meal.get('dependencies',[]):model.add(s>=ends[dep])
model.add_cumulative(meal_intervals,[1]*len(meal_intervals),source['participantMealCapacity']['maxSimultaneous'])
for row in data['domains']:
 for dep in row['dependencies']:model.add(starts[row['id']]>=ends[dep])
mode=sys.argv[1] if len(sys.argv)>1 else 'fixed-core'
if mode in ('fixed-core','fixed-main'):
 for row in data['fixedStarts']:
  if mode=='fixed-core' or any(t['id']==row['id'] and t['kind']=='main' for t in data['tasks']):model.add(starts[row['id']]==row['start'])
else:
 for row in data['protectedTasks']:model.add(starts[row['id']]==row['start'])
 mains=[t for t in data['tasks'] if t['kind']=='main']
 slots=sorted(t['start'] for t in data['priorJoint']['tasks'] if t['kind']=='main')
 indices=[]
 for task in mains:
  index=model.new_int_var(0,len(slots)-1,task['id']+'-slot');indices.append(index)
  model.add_element(index,slots,starts[task['id']])
 model.add_all_different(indices)
for row in data['equalities']:model.add(starts[row['b']]==starts[row['a']]+row['offset'])
for row in data['transportPairs']:model.add(starts[row['b']]>=starts[row['a']]+row['gap'])
for n,row in enumerate(data['pairwise']):
 a,b=row['a'],row['b'];order=model.new_bool_var(f'order-{n}')
 model.add(starts[b]>=ends[a]+row['gapAB']).only_enforce_if(order)
 model.add(starts[a]>=ends[b]+row['gapBA']).only_enforce_if(order.Not())
for prep in data['preparations']+data['roundPreparations']:
 if not prep.get('reference'):continue
 s=starts[prep['reference']]+prep['offset'];duration=prep['end']-prep['start']
 # Preparations must not collide with tasks or fixed operational breaks in their spaces.
 for task in data['tasks']:
  if task['spaceId']!=prep['spaceId']:continue
  before=model.new_bool_var(prep['id']+'-'+task['id'])
  model.add(ends[task['id']]<=s).only_enforce_if(before)
  model.add(starts[task['id']]>=s+duration).only_enforce_if(before.Not())
 for meal in data['priorJoint']['operationalMeals']:
  if prep['spaceId'] not in meal['spaceIds']:continue
  before=model.new_bool_var(prep['id']+'-'+meal['id'])
  model.add(s+duration<=meal['start']).only_enforce_if(before)
  model.add(s>=meal['end']).only_enforce_if(before.Not())
solver=cp_model.CpSolver();solver.parameters.max_time_in_seconds=60;solver.parameters.num_search_workers=1;solver.parameters.random_seed=0
t=time.monotonic();status=solver.solve(model)
result={'mode':mode,'status':solver.status_name(status),'wallMs':(time.monotonic()-t)*1000,'branches':solver.num_branches,'conflicts':solver.num_conflicts,'globalFeasibility':'INCONCLUSIVE','qualification':data['qualification']}
if status in [cp_model.OPTIMAL,cp_model.FEASIBLE]:result['starts']={id:solver.value(s) for id,s in starts.items()}
(p/f'full-oracle-{mode}-result.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='starts'}))
