import test from 'node:test';import assert from 'node:assert/strict';
import {buildA2ImportRows} from './a2ImportRows';import {buildA2ImportSQL} from './prepareA2Import';
import {a2HistoricalCatalog} from './a2HistoricalCatalog';import {a2RealSpatialManifest} from './a2SpatialTopology';
import {buildCanonicalFullA2EngineInput} from '../../engine/planner-next/benchmarks/canonicalFullA2EngineInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {canPlaceTask,exactTaskStartDomain} from '../../engine/planner-next/placement';import {validatePlan} from '../../engine/planner-next/validate';
import {a2ImportStorageFixture} from './a2ImportStorageFixture';import {buildEngineInput} from '../../engine/buildInput';
const options={historicalCatalog:a2HistoricalCatalog,planId:27002};
const adapted=(input:ReturnType<typeof buildA2ImportRows>['input'])=>{const a=adaptEngineInputToPlannerNextProblem(input);assert.equal(a.status,'SUPPORTED',JSON.stringify(a.issues));if(a.status!=='SUPPORTED')throw Error('unsupported');return a.problem;};
const independent=(problem:ReturnType<typeof adapted>,name:string,input:ReturnType<typeof buildA2ImportRows>['input'])=>({...problem.tasks.find(t=>t.id===`task:${input.tasks.find(t=>t.templateName===name)!.id}`)!,dependencies:[]});
test('complete versioned manifest covers all 23 original identities plus authorized Redes extension without unresolved destinations',()=>{
 assert.equal(a2RealSpatialManifest.length,24);assert.equal(new Set(a2RealSpatialManifest.map(m=>m.sourceId)).size,24);
 assert.equal(a2RealSpatialManifest.filter(m=>m.currentA2SpaceId!=null&&m.currentA2SpaceId<=3023).length,23);
 assert.ok(a2RealSpatialManifest.every(m=>m.decision!=='UNRESOLVED'));
 const d=buildA2ImportRows('2026-10-30',100000,options);assert.equal(d.input.planId,27002);assert.equal(d.input.tasks.length,266);
 assert.deepEqual(d.tables.spaces.map(s=>s.id),[103030,103031,103032]);assert.equal(d.tables.zones.length,0);
 assert.equal(d.tables.resource_items.length,0);assert.equal(d.tables.resource_types.length,0);
 assert.equal(d.tables.task_templates.length,0,'no new global template identities');
 assert.equal(d.reusedTaskTemplateReferences?.length,31);
 assert.ok(d.input.tasks.every(t=>t.templateId>=20001&&t.templateId<=20031));
 assert.ok(d.tables.daily_tasks.every(t=>t.template_id>=20001&&t.template_id<=20031));
 assert.ok(d.tables.plan_task_template_snapshots.every(t=>t.source_template_id>=20001&&t.source_template_id<=20031));
 assert.equal(d.tables.plan_task_template_snapshots.find(t=>t.template_name==='REDES')!.default_space_id,39);
 assert.equal(d.tables.plan_task_template_snapshots.find(t=>t.template_name==='ENSAYO_ESTUDIO_7')!.default_space_id,48);
 assert.equal(d.configuration.mealTaskTemplateId,d.input.mealTaskTemplateId);
 for(const task of d.input.tasks.filter(t=>['REALITY_INFLUENCER','REALITY_CORNER_MUSIC','CORNER_MUSIC','CORNER_INFLUENCER'].includes(t.templateName!)))assert.equal(task.spaceId,31);
 assert.ok(d.input.tasks.filter(t=>t.templateName==='REDES').every(t=>t.spaceId===39&&t.zoneId===14));
 assert.ok(d.input.tasks.filter(t=>t.operationalRole?.startsWith('transport_')).every(t=>t.spaceId===49&&t.blocksSpace===false));
});
test('Redes/Pasillo overlap is admitted by domains/placement/validator; Corner/Pasillo is still hard rejected',()=>{
 const d=buildA2ImportRows('2026-10-30',100000,options),p=adapted(d.input),redes=independent(p,'REDES',d.input),pasillo=independent(p,'PASILLO',d.input),corner=independent(p,'CORNER_INFLUENCER',d.input);
 // Distinct participants isolate the spatial/resource causal decision.
 const other={...pasillo,participantId:'participant:100212'};
 const start=785,placed={...redes,start,end:start+redes.duration};
 assert.deepEqual(redes.requiredResourceIds??[],[]);assert.equal(canPlaceTask(p,other,start,[placed]),true);
 assert.ok([...exactTaskStartDomain(p,other,[placed]).starts()].includes(start));
 assert.equal(validatePlan(p,[placed,{...other,start,end:start+other.duration}]).resourceOverlapViolationCount,0);
 const busy={...corner,start,end:start+corner.duration};assert.equal(canPlaceTask(p,other,start,[busy]),false);
 assert.equal(validatePlan(p,[busy,{...other,start,end:start+other.duration}]).resourceOverlapViolationCount,1);
});
test('a distinct explicit Redes resource survives projection; no inherited CAM1 is created',()=>{
 const d=buildA2ImportRows('2026-10-30',100000,options),r=d.input.planResourceItems.find(r=>r.name==='son-2')!;
 const task=d.input.tasks.find(t=>t.templateName==='REDES')!;task.assignedResourceIds=[r.id];
 const p=adapted(d.input),actual=p.tasks.find(t=>t.id===`task:${task.id}`)!;
 assert.deepEqual(actual.requiredResourceIds,[`plan-resource:${r.id}`]);
});
test('real day snapshots preserve parent identity, resources, setup, separate Post and nonphysical occupancy through real builder',async()=>{
 const d=buildA2ImportRows('2026-10-30',100000,options);
 const actual=adapted(await buildEngineInput(d.input.planId,a2ImportStorageFixture(d).storage));assert.deepEqual(actual,adapted(d.input));
 assert.equal(d.tables.plan_space_settings.find(s=>s.space_id===103030)!.parent_space_id,42);
 assert.equal(d.input.setupPolicies![0].preparationMinutesBetweenFamilies,10);
 assert.ok(d.input.tasks.filter(t=>['SILLON','ESTRELLAS'].includes(t.templateName!)).every(t=>t.spaceId===103030));
 assert.ok(d.input.tasks.filter(t=>t.templateName==='TOTALES_POST_CONJUNTO').every(t=>t.spaceId===103032));
 assert.ok(!d.input.operationalMealPolicies!.flatMap(m=>m.spaceIds??[]).some(id=>[39,40,103031,103032].includes(id)));
 assert.ok(actual.spaces.find(s=>s.id==='space:40')?.secondaryContinuity==null);
 const p15=d.input.tasks.filter(t=>[43,103030].includes(t.spaceId!));const cam2=d.input.planResourceItems.find(r=>r.name==='cam-2')!;
 assert.ok(p15.every(t=>actual.tasks.find(a=>a.id===`task:${t.id}`)?.requiredResourceIds?.includes(`plan-resource:${cam2.id}`)));
});
test('nonphysical projection removes only physical exclusivity and never removes resource or participant conflicts',()=>{
 const c=buildCanonicalFullA2EngineInput(),p=adapted(c.input),a=independent(p,'REALITY_PLATO_ANTES',c.input);
 const b={...a,id:'independent',participantId:'participant:212',itinerantUnitId:undefined,requiredResourceIds:[]};
 const start=650,busy={...a,start,end:start+a.duration};
 assert.equal(a.blocksSpace,false);assert.equal(canPlaceTask(p,b,start,[busy]),true);
 assert.ok([...exactTaskStartDomain(p,b,[busy]).starts()].includes(start));
 assert.equal(validatePlan(p,[busy,{...b,start,end:start+b.duration}]).overlapViolationCount,0);
 assert.equal(canPlaceTask(p,{...b,participantId:a.participantId},start,[busy]),false);
 assert.equal(canPlaceTask(p,{...b,requiredResourceIds:a.requiredResourceIds},start,[busy]),false);
});
test('catalog identity/parent drift aborts preparation; SQL checks historical rows and concrete resource identities before insertion',()=>{
 const changed=structuredClone(a2HistoricalCatalog);changed.spaces.find(s=>s.id===31)!.parent_space_id=null;
 assert.throws(()=>buildA2ImportRows('2026-10-30',100000,{...options,historicalCatalog:changed}),/HISTORICAL_SPACE_DRIFT/);
 const {sql}=buildA2ImportSQL('2026-10-30',100000,'dyqusivzgxebkxkwohwn',options);
 assert.match(sql,/HISTORICAL_CATALOG_DRIFT:spaces:31/);assert.match(sql,/HISTORICAL_RESOURCE_DRIFT/);assert.match(sql,/HISTORICAL_TEMPLATE_DRIFT/);assert.match(sql,/EXISTING_ROWS_CHANGED/);
 assert.doesNotMatch(sql,/\b(UPDATE|DELETE|TRUNCATE)\b/);
});
test('Totales lane construction retains the longer structural lane when catalog IDs reverse the two rooms',()=>{
 const d=buildA2ImportRows('2026-10-30',100000,options),p=adapted(d.input),policy=p.roundSynchronizations![0];
 assert.equal(policy.lanes[0].taskIds.length,10);assert.equal(policy.lanes[0].spaceId,'space:34');
 assert.equal(policy.lanes[1].taskIds.length,9);assert.equal(policy.lanes[1].spaceId,'space:33');
 const permuted=structuredClone(d.input);permuted.roundSynchronizations![0].lanes.reverse();
 assert.deepEqual(adapted(permuted),p,'input iteration order cannot change effective lane geometry');
});

test('all eleven resources reuse original assets; Totales consumes existing CAM5/CAM6, without new catalog rows',()=>{
 const d=buildA2ImportRows('2026-10-30',100000,options),p=adapted(d.input);
 assert.equal(d.input.planResourceItems.length,11);assert.equal(d.input.planResourceItems.find(r=>r.name==='cam-1')!.resourceItemId,4);
 assert.equal(d.input.planResourceItems.find(r=>r.name==='cam-2')!.resourceItemId,5);
 for(const [name,asset,type] of [['cam-5',6,'TOTALES_1'],['cam-6',14,'TOTALES_COREO']] as const){const resource=d.input.planResourceItems.find(r=>r.name===name)!;assert.equal(resource.resourceItemId,asset);assert.equal(resource.typeId,3);assert.ok(d.input.tasks.filter(t=>t.templateName===type).every(t=>p.tasks.find(task=>task.id===`task:${t.id}`)?.requiredResourceIds?.includes(`plan-resource:${resource.id}`)));}
 assert.equal(d.tables.resource_items.length,0);assert.equal(d.tables.resource_types.length,0);
});

test('Post relocation is ordinary location configuration and acquires the destination resource and meal authorities',()=>{
 const d=buildA2ImportRows('2026-10-30',100000,options);
 for(const task of d.input.tasks.filter(t=>t.templateName==='TOTALES_POST_CONJUNTO')){task.spaceId=34;task.zoneId=12;}
 const p=adapted(d.input),post=independent(p,'TOTALES_POST_CONJUNTO',d.input),cam5=d.input.planResourceItems.find(r=>r.name==='cam-5')!;
 assert.equal(post.spaceId,'space:34');assert.ok(post.requiredResourceIds?.includes(`plan-resource:${cam5.id}`));
 assert.ok(p.operationalMealPolicies?.some(policy=>policy.spaceIds.includes(post.spaceId)));
 const other=p.tasks.find(t=>t.spaceId==='space:34'&&t.participantId!==post.participantId&&!t.jointGroupId)!;
 assert.equal(canPlaceTask(p,post,785,[{...other,start:785,end:785+other.duration}]),false);
});
