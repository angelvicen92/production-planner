"""Read-only reconciliation by (participant code, canonical family); never remap source IDs."""
import csv,io,json,re,sys,hashlib
from pathlib import Path
from collections import Counter
root=Path(__file__).resolve().parents[3]
out=Path(__file__).resolve().parent
native=Path(sys.argv[1])
source=root/'docs/source/official/06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.10.md'
canon=source.read_text()
historical=root/'docs/audits/p0-integral/2026-10-28/M01_266_obligaciones_A2.csv'
s=historical.read_text();rows=list(csv.DictReader(io.StringIO(s[s.index('index,'):])));
counts=Counter(r['task_family'] for r in rows)
source_counts={name.strip():int(n) for name,n in re.findall(r'^\| ([^|]+) \| (\d+) \|$',canon.split('## 5. Conteo por tipo de tarea')[1],re.M)}
assert counts==source_counts and len(rows)==266 and len(counts)==31
identities=json.loads((native/'semantic-identities.json').read_text())
input=json.loads((native/'engine-input.json').read_text())
adapter=json.loads((native/'adapter.json').read_text())
assert adapter['status']=='SUPPORTED', adapter.get('issues')
assert len(adapter['problem']['participantMeals'])==19
mapping=json.loads((native/'identity-map.json').read_text())
seen={(r['participant'],r['family']):r for r in identities};assert len(seen)==len(identities)
actual={t['id']:t for t in input['tasks']}
# Dimensions describe present contracts, never certify a whole family from an isolated example.
meta={}
for family in counts:
 evidence='p0-u00h/README.md';ui='BASE_FIELDS_PRESENT';composition='NOT_CERTIFIED_WITH_ALL_A2';block='No nuevo intento tras primera frontera HARD'
 if family in ['IN','OUT']:evidence='p0-u00f/README.md';block='Transporte nativo aislado; requiredPhaseCompositionSupported excluye transportSettings'
 elif family in ['Estilismo entrada','Estilismo salida']:evidence='p0-u00f/README.md';block='Pipeline completo con fases/transporte/comidas no certificado'
 elif family=='Sodexo':evidence='p0-u00g/README.md';ui='COMPLETE_OWN_CONTRACT';composition='HARD_REJECTED_WITH_REQUIRED_PHASES';block='mealMode flexible_meal_window excluido por requiredPhaseCompositionSupported'
 elif family=='Ensayo vocal - Estudio 7' or family.startswith('Prueba vocal'):
  evidence='p0-g02/README.md';block='Main/Vocal y rutas nativos; bandas y A2 completo no certificados'
 elif family in ['Sillón','Estrellas']:evidence='p0-u00e/README.md';block='setupPolicies excluidas por requiredPhaseCompositionSupported'
 elif family in ['Totales 1','Totales Coreo']:evidence='p0-u00p/README.md';block='roundSynchronizations excluidas por requiredPhaseCompositionSupported'
 elif family.startswith('Reality Plató'):evidence='p0-u02d/README.md';block='U02d compone anclajes fijos/transición0; A/B positivo y comidas pendientes no certificados'
 elif family.startswith('Reality') or family.startswith('Alfombra') or family=='Totales Post conjunto':
  evidence='p0-u02d/README.md';block='Fases/conjuntas sólo en intersección certificada; comidas flexibles rechazadas'
  if family not in ['Reality Corner Music','Reality Influencer','Reality Manzano','Totales Post conjunto']:
   composition='HARD_REJECTED_A2_PHASE_INTERSECTION'
 if family in ['Redes','Pasillo','Giratuto','Corner Influencer','Corner Music','Corner Influencer + Music','Croma']:evidence='p0-g01/README.md';block='byItem nativo; unidad completa P14/P15 con fases no certificada'
 producer='client/src/pages/settings.tsx::TaskTemplatesSettings + client/src/components/add-task-dialog.tsx'
 consumer='engine/buildInput.ts + server/newDayPlannerConfiguration.ts + engine/planner-next/integration/engineInputAdapter.ts'
 if family=='Sodexo':producer+=' + client/src/components/general-program-settings.tsx';consumer+=' + engine/planner-next/integration/flexibleParticipantMealTasks.ts'
 if family in ['Totales 1','Totales Coreo']:producer+=' + client/src/components/round-synchronization-editor.tsx'
 if family.startswith('Reality') or family.startswith('Alfombra'):producer+=' + client/src/components/technical-chain-editor.tsx';consumer+=' + server/technicalChainStructure.ts + server/itinerantComposition.ts'
 meta[family]=dict(ui_own_contract=ui,api_only_dimension='OPTIONAL: byType/anyOf sin editor físico general (coach tiene control propio); no necesarios para items canónicos fijos',persisted_not_consumed='NONE_DEMONSTRATED_FOR_THIS_FAMILY',native_rejected=composition if composition.startswith('HARD') else 'NO_NEW_REJECTION_TEST',composition=composition,stage_sql_contract=evidence,stage_sql_new_a2='NOT_REACHED',frontier=block,producer_path=producer,consumer_path=consumer)
result=[]
for r in rows:
 key=(r['participant_id'],r['task_family']);observed=seen.get(key);t=actual[observed['taskId']] if observed else None
 if t:
  assert t['contestantId']==mapping['participants'][key[0]]['id']
  assert t['durationOverrideMin']==int(r['duration_minutes']), (key,t['durationOverrideMin'])
  expected_end='15:30' if key[0]=='C01' else '19:00'
  availability=input['contestantAvailabilityById'][str(t['contestantId'])]
  assert availability['start']=='09:00' and availability['end']==expected_end
  assert t['startPlanned'] is None and t['endPlanned'] is None
 result.append({**{k:r[k] for k in ['obligation_id','participant_id','coach','task_family','duration_minutes','time_window_person','space_or_scope','operation_group_id','specific_semantics']},**meta[r['task_family']],
  'current_ui_task_id':t['id'] if t else '', 'ui_attempt':'AUTHORED_BASE_FIELDS' if t else 'NOT_ATTEMPTED_STOPPED_AT_HARD',
  'engine_input_scalar_match':'PASS_IDENTITY_DURATION_WINDOW' if t else 'NOT_REACHED',
  'complete_canonical_semantics':'NOT_CERTIFIED', 'preflight_new_a2':'NOT_CERTIFIED',
  'evidence':'native/semantic-identities.json + native/engine-input.json' if t else meta[r['task_family']]['stage_sql_contract']})
def csvwrite(name,values):
 with (out/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(values[0]),lineterminator='\n');w.writeheader();w.writerows(values)
csvwrite('crosswalk-266.csv',result)
families=[{'family':family,'canonical_obligations':n,'new_ui_base_fields':sum(r['task_family']==family and bool(r['current_ui_task_id']) for r in result),**meta[family]} for family,n in counts.items()]
csvwrite('families-31.csv',families)
(out/'reconciliation.json').write_text(json.dumps({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'historical_inventory_sha256':hashlib.sha256(historical.read_bytes()).hexdigest(),'canonical_obligations':266,'families':31,'new_ui_base_fields':len(identities),'unattempted_after_hard':266-len(identities),'complete_canonical_obligations_certified':0,'new_stages':0,'semantic_join':['participant code','canonical task family'],'source_ids_copied':False,'placements_copied':False,'duration_window_identity_checks':'PASS','full_EngineInput_equivalence':'NOT_REACHED','notes':['Base fields authored are not complete A2 semantics.','No ratio of Assisted completion is claimed.','Prior Stage evidence certifies only the linked contract/topology, not these new IDs.']},indent=2))
print(f'PASS: 266 canonical rows / 31 families; {len(identities)} new UI scalar matches; no whole-A2 certification')
