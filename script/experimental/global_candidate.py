"""Isolated experimental generator. Reads authorities, never a witness or a hint."""
import json,sys,time,math,resource
from ortools.sat.python import cp_model
limit=float(sys.argv[3]) if len(sys.argv)>3 else 30
resource.setrlimit(resource.RLIMIT_CPU,(math.ceil(limit)+15,math.ceil(limit)+16))
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
data=json.load(open(sys.argv[1]));source=data['source'];grid=data['grid']
model=cp_model.CpModel();starts={};ends={};intervals={};selectors={};presence={};preparations=[];round_preps=[]
lo,hi=source['day']['start'],source['day']['end']
def var(name,values,duration):
 s=model.new_int_var_from_domain(cp_model.Domain.from_values(values),name)
 e=model.new_int_var(lo,hi,name+'-end');model.add(e==s+duration)
 return s,e,model.new_interval_var(s,duration,e,name+'-interval')
def disjoint(sa,ea,sb,eb,name,conditions=[]):
 b=model.new_bool_var(name);model.add(sb>=ea).only_enforce_if([b,*conditions]);model.add(sa>=eb).only_enforce_if([b.Not(),*conditions])
def path(nodes,name):
 # Mandatory nodes; dummy closes one chronologically ordered contiguous path.
 arcs=[]
 for i,(s,e) in enumerate(nodes,1):
  arcs.extend([(0,i,model.new_bool_var(f'{name}-first-{i}')),(i,0,model.new_bool_var(f'{name}-last-{i}'))])
  for j,(s2,e2) in enumerate(nodes,1):
   if i==j:continue
   b=model.new_bool_var(f'{name}-{i}-{j}');arcs.append((i,j,b));model.add(s2==e).only_enforce_if(b)
 if nodes:model.add_circuit(arcs)
 return arcs
for row in data['tasks']:
 id=row['id'];values=sorted(set(v for variant in row['variants'] for v in variant['starts']))
 if not values:raise ValueError('EMPTY_STATIC_DOMAIN:'+id)
 starts[id],ends[id],intervals[id]=var(id,values,row['duration'])
 sel=model.new_int_var(0,len(row['variants'])-1,id+'-variant');selectors[id]=sel
 for i,v in enumerate(row['variants']):
  b=model.new_bool_var(id+f'-variant-{i}');presence[id,i]=b;model.add(sel==i).only_enforce_if(b);model.add(sel!=i).only_enforce_if(b.Not())
  if v['starts']:model.add_linear_expression_in_domain(starts[id],cp_model.Domain.from_values(v['starts'])).only_enforce_if(b)
  else:model.add(b==0)
for row in data['meals']:
 id=row['sourceTaskId'];starts[id],ends[id],intervals[id]=var(id,row['starts'],row['duration'])
 for task in source['tasks']:
  if task.get('participantId')==row['participantId']:disjoint(starts[id],ends[id],starts[task['id']],ends[task['id']],id+'-'+task['id'])
 for dep in row.get('dependencies',[]):model.add(starts[id]>=ends[dep])
if data['meals']:model.add_cumulative([intervals[m['sourceTaskId']] for m in data['meals']],[1]*len(data['meals']),source.get('participantMealCapacity',{}).get('maxSimultaneous',len(data['meals'])))
for row in data['tasks']:
 for dep in row['dependencies']:model.add(starts[row['id']]>=ends[dep])
for n,pair in enumerate(data['paired']):
 a,b=pair['a'],pair['b'];order=model.new_bool_var(f'pair-{n}');conditions=[presence[a,pair['ai']],presence[b,pair['bi']]]
 model.add(starts[b]>=ends[a]+pair['gapAB']).only_enforce_if([order,*conditions])
 model.add(starts[a]>=ends[b]+pair['gapBA']).only_enforce_if([order.Not(),*conditions])
for contract in source.get('anchoredAccompaniments',[]):
 ids=[*contract['beforeTaskIds'],contract['anchorTaskId'],*contract['afterTaskIds']]
 for a,b in zip(ids,ids[1:]):model.add(starts[b]==ends[a])
groups={}
for task in source['tasks']:
 if task.get('jointGroupId'):groups.setdefault(task['jointGroupId'],[]).append(task['id'])
for ids in groups.values():
 for id in ids[1:]:model.add(starts[id]==starts[ids[0]])
for chain in source.get('technicalChains',[]):
 ids=chain['orderedTaskIds'];path([(starts[id],ends[id]) for id in ids],chain['id'])
 if chain.get('phases'):
  for a,phase in enumerate(chain['phases']):
   for b in range(a+1,len(chain['phases'])):
    for x in phase:
     for y in chain['phases'][b]:model.add(starts[y]>=ends[x])
 else:
  for a,b in zip(ids,ids[1:]):model.add(starts[b]==ends[a])
operational=[]
for meal in source.get('operationalMealPolicies',[]):
 fixed=next((m for m in data['protectedOperationalMeals'] if m['id']==meal['id']),None)
 values=[fixed['start']] if fixed else list(range(meal['window']['start'],meal['window']['end']-meal['duration']+1,grid))
 s,e,interval=var(meal['id'],values,meal['duration']);operational.append((meal,s,e));
 for row in data['tasks']:
  for i,v in enumerate(row['variants']):
   t=v['task'];blocked=t['spaceId'] in meal['spaceIds'] or any(r in meal['resourceIds'] for r in [*t.get('requiredResourceIds',[]),t.get('coachId')])
   if blocked:disjoint(s,e,starts[t['id']],ends[t['id']],meal['id']+'-'+t['id']+str(i),[presence[t['id'],i]])
for direction,policy in source.get('transportPolicy',{}).items():
 ids=policy['taskIds']
 for i,a in enumerate(ids):
  same=[]
  for j,b in enumerate(ids):
   eq=model.new_bool_var(f'{direction}-same-{i}-{j}');model.add(starts[a]==starts[b]).only_enforce_if(eq);model.add(starts[a]!=starts[b]).only_enforce_if(eq.Not());same.append(eq)
   if i<j:
    order=model.new_bool_var(f'{direction}-order-{i}-{j}')
    model.add(starts[b]>=starts[a]+max(grid,policy['minGapMinutes'])).only_enforce_if([order,eq.Not()])
    model.add(starts[a]>=starts[b]+max(grid,policy['minGapMinutes'])).only_enforce_if([order.Not(),eq.Not()])
  model.add(sum(same)>=policy['minimumGroupSize']);model.add(sum(same)<=policy['maximumGroupSize'])
main=[t for t in source['tasks'] if t['kind']=='main']
if source['mainFlow']['continuity']=='REQUIRED':
 nodes=[(starts[t['id']],ends[t['id']]) for t in main]
 nodes += [(s,e) for m,s,e in operational if source['mainFlow']['spaceId'] in m['spaceIds']]
 path(nodes,'main-flow')
# Setup families are generated from policy. No previous ordering or slot set is read.
for space in source['spaces']:
 policy=space.get('setupPolicy');own=[t for t in source['tasks'] if t['spaceId']==space['id']]
 if policy:
  families=[f for f in policy['familyOrder'] if any(t.get('setupFamilyId')==f for t in own)]
  fs={};fe={}
  for family in families:
   tasks=[t for t in own if t.get('setupFamilyId')==family]
   s=model.new_int_var(lo,hi,family+'-start');e=model.new_int_var(lo,hi,family+'-end')
   model.add_min_equality(s,[starts[t['id']] for t in tasks]);model.add_max_equality(e,[ends[t['id']] for t in tasks]);fs[family]=s;fe[family]=e
   model.add(e-s==sum(t['duration'] for t in tasks))
  # Circuit orders contiguous family blocks, placing preparation before the next family.
  arcs=[];incoming={f:[] for f in families}
  for i,a in enumerate(families,1):
   first=model.new_bool_var(a+'-first');last=model.new_bool_var(a+'-last');arcs.extend([(0,i,first),(i,0,last)])
   for j,b in enumerate(families,1):
    if i==j:continue
    order=model.new_bool_var(a+'-to-'+b);arcs.append((i,j,order));incoming[b].append(order)
    if not policy.get('flexibleFamilyOrder') and j!=i+1:model.add(order==0)
    duration=policy.get('preparationMinutesBetweenFamilies',policy.get('preparationMinutesByFamily',{}).get(b,0))
    model.add(fs[b]==fe[a]+duration).only_enforce_if(order)
   if not policy.get('flexibleFamilyOrder'):model.add(first==(i==1));model.add(last==(i==len(families)))
  if families:model.add_circuit(arcs)
  for f in families:
   duration=policy.get('preparationMinutesBetweenFamilies',policy.get('preparationMinutesByFamily',{}).get(f,0))
   if not duration:continue
   active=model.new_bool_var(f+'-prep-active');model.add(active==sum(incoming[f]))
   pstart=fs[f]-duration;preparations.append((space['id'],f,duration,pstart,fs[f],active))
   model.add(pstart>=lo).only_enforce_if(active)
   for t in own:disjoint(pstart,fs[f],starts[t['id']],ends[t['id']],f+'-prep-'+t['id'],[active])
   for m,s,e in operational:
    if space['id'] in m['spaceIds']:disjoint(pstart,fs[f],s,e,f+'-prep-'+m['id'],[active])
 elif space.get('secondaryContinuity')=='REQUIRED':
  nodes=[(starts[t['id']],ends[t['id']]) for t in own];nodes += [(s,e) for m,s,e in operational if space['id'] in m['spaceIds']];path(nodes,space['id'])
# Rank variables permit every lane permutation, with shared active round starts/ends.
for policy in source.get('roundSynchronizations',[]):
 n=max(len(l['taskIds']) for l in policy['lanes']);rs=[model.new_int_var(lo,hi,policy['id']+f'-round-{i}') for i in range(n)]
 re=[model.new_int_var(lo,hi,policy['id']+f'-end-{i}') for i in range(n)]
 for lane in policy['lanes']:
  ids=lane['taskIds'];ranks=[]
  for id in ids:
   rank=model.new_int_var(0,len(ids)-1,id+'-rank');ranks.append(rank);model.add_element(rank,rs[:len(ids)],starts[id]);model.add_element(rank,re[:len(ids)],ends[id])
  model.add_all_different(ranks)
  for i in range(1,len(ids)):
   duration=lane['preparationMinutesBetweenRounds'];ps=rs[i]-duration
   bridges=[m for m in operational if lane['spaceId'] in m[0]['spaceIds']]
   if bridges:
    alternatives=[model.new_bool_var(policy['id']+lane['spaceId']+f'-bridge-{i}-{j}') for j in range(len(bridges)+1)]
    model.add_exactly_one(alternatives);model.add(ps==re[i-1]).only_enforce_if(alternatives[0])
    for j,(m,s,e) in enumerate(bridges,1):model.add(re[i-1]==s).only_enforce_if(alternatives[j]);model.add(ps==e).only_enforce_if(alternatives[j])
   else:model.add(ps==re[i-1])
   if duration:round_preps.append((policy['id'],lane['spaceId'],i+1,duration,ps,rs[i]))
   for m,s,e in bridges:disjoint(ps,rs[i],s,e,policy['id']+lane['spaceId']+str(i)+m['id'])
solver=cp_model.CpSolver();solver.parameters.max_time_in_seconds=limit;solver.parameters.num_search_workers=1;solver.parameters.random_seed=0
# Fixed deterministic work ceiling supplements the wall timeout; never reports global INFEASIBLE.
solver.parameters.max_deterministic_time=limit
start=time.monotonic();status=solver.solve(model)
result={'status':solver.status_name(status),'wallMs':(time.monotonic()-start)*1000,'deterministicTime':solver.response_proto.deterministic_time,'branches':solver.num_branches,'conflicts':solver.num_conflicts,'globalFeasibility':'INCONCLUSIVE','hints':0,'workers':1,'qualification':data['qualification']}
if status in (cp_model.FEASIBLE,cp_model.OPTIMAL):
 result['starts']={id:solver.value(s) for id,s in starts.items()};result['variants']={id:solver.value(v) for id,v in selectors.items()}
 result['operationalMeals']=[{**m,'start':solver.value(s),'end':solver.value(e)} for m,s,e in operational]
 result['preparations']=[{'spaceId':s,'setupFamilyId':f,'duration':d,'start':solver.value(ps),'end':solver.value(pe)} for s,f,d,ps,pe,b in preparations if solver.boolean_value(b)]
 result['roundPreparations']=[{'synchronizationId':p,'spaceId':s,'roundIndex':i,'duration':d,'start':solver.value(ps),'end':solver.value(pe)} for p,s,i,d,ps,pe in round_preps]
json.dump(result,open(sys.argv[2],'w'),indent=2)
print(json.dumps({k:v for k,v in result.items() if k not in ('starts','variants','operationalMeals','preparations','roundPreparations')}))
