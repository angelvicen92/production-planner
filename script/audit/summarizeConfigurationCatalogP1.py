"""Offline typed reference inventory. Reads only an allowlisted GET observation."""
import json,sys,pathlib,collections,hashlib,unicodedata
src=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'work/configuration-audit/catalog-allowlisted.json')
out=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else 'docs/audit/configuration-p1/generated');out.mkdir(parents=True,exist_ok=True)
x=json.loads(src.read_text())
if x.get('failures') or x.get('complete') is False:raise RuntimeError('Incomplete observation: do not infer missing references or empty catalog')
rows=x['rows'];edges=[]
key=lambda t,i:f'{t}:{i}'
def add(t,row,col,target,values=None):
 v=row.get(col) if values is None else values
 if v is None:return
 for val in v if isinstance(v,list) else [v]:
  if val is not None:edges.append({'from':key(t,row['id']),'to':key(target,val),'path':col,'planId':row.get('plan_id')})
cols={'plan_id':'plans','source_template_id':'task_templates','template_id':'task_templates','task_template_id':'task_templates','zone_id':'zones','default_zone_id':'zones','space_id':'spaces','default_space_id':'spaces','parent_space_id':'spaces','type_id':'resource_types','resource_type_id':'resource_types','resource_item_id':'resource_items','component_resource_item_id':'resource_items','parent_resource_item_id':'resource_items','plan_resource_item_id':'plan_resource_items','bundle_id':'resource_bundles','dependency_template_ids':'task_templates','depends_on_template_ids':'task_templates','depends_on_template_id':'task_templates','allowed_itinerant_team_ids':'itinerant_teams','itinerant_team_id':'itinerant_teams','vocal_coach_resource_item_id':'resource_items','vocal_coach_plan_resource_item_id':'plan_resource_items','assigned_resource_ids':'plan_resource_items','arrival_plan_template_snapshot_id':'plan_task_template_snapshots','departure_plan_template_snapshot_id':'plan_task_template_snapshots','main_zone_id':'zones','snapshot_id':'plan_optimizer_snapshots','config_revision_id':'plan_config_revisions','current_config_revision_id':'plan_config_revisions','session_id':'assisted_planning_sessions'}
for t,rs in rows.items():
 for r in rs:
  for col,target in cols.items():
   if col in r:add(t,r,col,target)
  if t=='plan_config_revisions':add(t,r,'parent_revision_id','plan_config_revisions')
  if t=='task_templates':add(t,r,'rules_json.itinerantTeamAllowedIds','itinerant_teams',(r.get('rules_json')or{}).get('itinerantTeamAllowedIds',[]))
  rr=r.get('resource_requirements') or {}
  if isinstance(rr,dict):
   for field,target in [('byItem','resource_items'),('byType','resource_types')]:
    vals=rr.get(field)or rr.get('by_item' if field=='byItem' else 'by_type')or{}
    if isinstance(vals,dict):add(t,r,'resource_requirements.'+field,target,[int(k) for k in vals if str(k).isdigit()])
   for i,alt in enumerate(rr.get('anyOf',[]) or []):
    if isinstance(alt,dict):add(t,r,f'resource_requirements.anyOf[{i}].resourceItemIds','resource_items',alt.get('resourceItemIds',[]))
units=[]
jsonCols={'spaceId':'spaces','fromSpaceId':'spaces','toSpaceId':'spaces','spaceIds':'spaces','taskId':'daily_tasks','anchorTaskId':'daily_tasks','beforeTaskIds':'daily_tasks','afterTaskIds':'daily_tasks','orderedTaskIds':'daily_tasks','dependsOnTaskIds':'daily_tasks','taskIds':'daily_tasks','planResourceItemIds':'plan_resource_items','coachPlanResourceItemId':'plan_resource_items','requiredResourceIds':'plan_resource_items','mealTaskTemplateId':'task_templates'}
for p in rows['plans']:
 cfg=p.get('planner_next_configuration')
 if not cfg:continue
 for u in cfg.get('itinerantTeamAvailability',[]):
  units.append({'table':'plan_itinerant_units','id':f"{p['id']}/{u['itinerantTeamId']}",'planId':p['id'],'unitId':u['itinerantTeamId'],'windows':u['windows'],'planResourceItemIds':u.get('planResourceItemIds',[]),'transitionMinutes':u.get('transitionMinutes')})
 def walk(obj,trail):
  if isinstance(obj,dict):
   for k,v in obj.items():
    target=jsonCols.get(k)
    if target:
     vals=v if isinstance(v,list) else [v]
     for val in vals:
      if isinstance(val,int):edges.append({'from':key('plans',p['id']),'to':key(target,val),'path':trail+'.'+k,'planId':p['id']})
    elif k in ['itinerantTeamId','allowedItinerantTeamIds']:
     for val in v if isinstance(v,list) else [v]:edges.append({'from':key('plans',p['id']),'to':key('plan_itinerant_units',f"{p['id']}/{val}"),'path':trail+'.'+k,'planId':p['id']})
    elif k=='resourcePresenceConcentrationPolicies':
     for val in v:edges.append({'from':key('plans',p['id']),'to':key('plan_resource_items',val),'path':trail+'.'+k+'.'+val,'planId':p['id']})
    elif k=='phases':
     for val in [a for phase in v for a in phase]:edges.append({'from':key('plans',p['id']),'to':key('daily_tasks',val),'path':trail+'.phases','planId':p['id']})
    walk(v,trail+'.'+k)
  elif isinstance(obj,list):
   for i,v in enumerate(obj):walk(v,f'{trail}[{i}]')
 walk(cfg,'planner_next_configuration')
 for u in units:
  if u['planId']==p['id']:
   for rid in u['planResourceItemIds']:edges.append({'from':key('plan_itinerant_units',u['id']),'to':key('plan_resource_items',rid),'path':'planResourceItemIds','planId':p['id']})
# Resolve resource requirements through the global identity, never by numeric coincidence.
byFrom=collections.defaultdict(list);byTo=collections.defaultdict(list)
for e in edges:byFrom[e['from']].append(e);byTo[e['to']].append(e)
def closure(start,direction):
 seen=set();todo=[start]
 while todo:
  v=todo.pop()
  if direction is byTo and v.startswith('plans:'):continue
  for e in direction.get(v,[]):
   nxt=e['to'] if direction is byFrom else e['from']
   if nxt not in seen and nxt!=start:seen.add(nxt);todo.append(nxt)
 return sorted(seen)
def norm(s):return ' '.join(unicodedata.normalize('NFKC',s).casefold().split())
nominal=collections.defaultdict(list)
for t in ['task_templates','zones','spaces','resource_items','itinerant_teams','resource_bundles']:
 for r in rows[t]:nominal[(t,norm(r['name']))].append(r['id'])
duplicates=[{'table':t,'normalizedName':n,'ids':ids,'equivalence':'NOT_CERTIFIED: equal label is not operational equivalence'} for (t,n),ids in nominal.items() if len(ids)>1]
nodePlan={key(t,r['id']):r.get('plan_id') for t,rs in rows.items() for r in rs}
nodePlan.update({key('plans',p['id']):p['id'] for p in rows['plans']})
entities=[]
for t in ['task_templates','zones','spaces','resource_types','resource_items','itinerant_teams','resource_bundles']:
 for r in rows[t]:
  k=key(t,r['id']);incoming=byTo.get(k,[]);dependents=closure(k,byTo)
  plans=sorted({nodePlan[v] for v in dependents if nodePlan.get(v) is not None}|{e['planId'] for e in incoming if e.get('planId') is not None})
  transitiveTasks=sorted({int(v.split(':')[1]) for v in dependents if v.startswith('daily_tasks:')})
  tasks=sorted(trow['id'] for trow in rows['daily_tasks'] if (t=='task_templates' and trow['template_id']==r['id']) or (t=='zones' and trow.get('zone_id')==r['id']) or (t=='spaces' and trow.get('space_id')==r['id'])) if t in ['task_templates','zones','spaces'] else transitiveTasks
  snapshots=sorted({int(v.split(':')[1]) for v in dependents if v.startswith('plan_task_template_snapshots:')})
  demo=t=='task_templates' and (20000<=r['id']<21000 or 120000<=r['id']<121000)
  same=next((d['ids'] for d in duplicates if d['table']==t and r['id'] in d['ids']),[])
  classes=[]
  if demo:classes.append('ESPECIFICA_DEMO_A2')
  if plans:classes.append('OPERATIVA_REFERENCIADA; vigencia humana no inferida de status draft')
  else:classes.append('CANDIDATA_ARCHIVO_PENDIENTE_REFERENCIAS_HISTORICAS')
  if 27001 in plans:classes.append('HISTORICA_A2_27001_ACCESIBLE')
  if same:classes.append('POSIBLE_DUPLICADO_CONSOLIDABLE_TRAS_COMPARACION')
  entities.append({'table':t,'id':r['id'],'name':r['name'],'provenance':('FAMILIA_A2_120xxx' if r['id']>=120000 else 'FAMILIA_A2_20xxx') if demo else 'CATALOGO_EXISTENTE; no autor/fecha de alta certificado','active':r.get('is_active','NO_COLUMN_IS_ACTIVE'),'classification':classes,'planIds':plans,'linkedDailyTaskIds':tasks,'transitiveDailyTaskIds':transitiveTasks,'templateSnapshotIds':snapshots,'directIncomingReferences':incoming,'outgoingDependencies':byFrom.get(k,[]),'transitiveDependents':dependents,'nominalDuplicateIds':same,'deleteAuthorized':False,'authorityAtRisk':['Identidad histórica de tarea/snapshot','Relaciones/defaults y autoridad JSON listadas','Referencias históricas no leídas siguen pendientes']})
# Entity edges intentionally point to absent IDs too: this is evidence, not silent repair.
known={key(t,r['id']) for t,rs in rows.items() for r in rs}|{key('plan_itinerant_units',u['id']) for u in units}
missing=[e for e in edges if e['to'] not in known]
result={'contract':'CONFIGURATION-P1-CATALOG-V1','observation':{k:v for k,v in x.items() if k!='rows'},'readOnly':True,'deletionCertified':False,'referenceCoverage':'Typed FKs/arrays and daily Next JSON only; no numeric/text-wide false-positive scan','entities':entities,'dailyUnits':units,'nominalDuplicates':duplicates,'edges':edges,'unresolvedTypedReferences':missing,'plans':[{'id':p['id'],'date':p['date'],'status':p['status'],'dailyTaskCount':sum(t['plan_id']==p['id'] for t in rows['daily_tasks']),'nextTaskOperationCount':len((p.get('planner_next_configuration')or{}).get('taskOperations',[])),'hasExplicitNextConfiguration':bool(p.get('planner_next_configuration'))} for p in rows['plans']]}
parts=[]
for field,value in result.items():
 serialized='[\n'+',\n'.join('    '+json.dumps(row,ensure_ascii=False,separators=(',',':')) for row in value)+'\n  ]' if isinstance(value,list) else json.dumps(value,ensure_ascii=False,separators=(',',':'))
 parts.append('  '+json.dumps(field)+': '+serialized)
(out/'catalog.json').write_text('{\n'+',\n'.join(parts)+'\n}\n')
esc=lambda s:str(s).replace('|','\\|').replace('\n',' ')
lines=['# Catálogo y dependencias verificados por lectura','',f"Observación UTC: {x['observedAt']}. No escrituras. No autorización de eliminación. Las listas completas de tareas/snapshots y caminos JSON están en catalog.json.",'','| Tabla | ID | Nombre | Activo | Días relacionados | Tasks / snapshots | Clasificación |','|---|---:|---|---|---|---|---|']
for e in entities:lines.append('| '+' | '.join(map(esc,[e['table'],e['id'],e['name'],e['active'],','.join(map(str,e['planIds'])) or 'No encontrado en cobertura',f"{len(e['linkedDailyTaskIds'])} / {len(e['templateSnapshotIds'])}",'; '.join(e['classification'])]))+' |')
lines+=['','## Grupos nominales','', '| Tabla | Nombre normalizado | IDs | Equivalencia |','|---|---|---|---|']
for d in duplicates:lines.append(f"| {d['table']} | {esc(d['normalizedName'])} | {', '.join(map(str,d['ids']))} | NO CERTIFICADA |")
lines+=['','## Referencias que no resuelven en la selección','',f"{len(missing)} referencias tipadas. Inspeccionar catalog.json; no corregir ni borrar automáticamente. Ceros de UI o aliases deben contrastarse con el contrato, no declararse FKs válidas."]
(out/'catalog.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'entities':len(entities),'edges':len(edges),'nominalDuplicateGroups':len(duplicates),'unresolvedTypedReferences':len(missing),'plans':result['plans']}))
