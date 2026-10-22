import {createHash} from 'node:crypto';
import {a2HistoricalCatalog,type A2HistoricalCatalog} from './a2HistoricalCatalog';
import {a2RealSpatialManifest,A2_REAL_TOPOLOGY_VERSION,a2ResourceManifest} from './a2SpatialTopology';
import type {buildA2ImportRows} from './a2ImportRows';

export const a2CatalogFingerprint=(catalog:A2HistoricalCatalog)=>createHash('sha256').update(JSON.stringify({
 zones:[...catalog.zones].sort((a,b)=>a.id-b.id),spaces:[...catalog.spaces].sort((a,b)=>a.id-b.id),resource_types:[...catalog.resource_types].sort((a,b)=>a.id-b.id),resource_items:[...catalog.resource_items].sort((a,b)=>a.id-b.id),
})).digest('hex');

/** Offline import transformation only. Engine/runtime never knows A2 IDs. */
export function reconcileA2Topology(d:ReturnType<typeof buildA2ImportRows>,catalog:A2HistoricalCatalog,offset:number,planId:number) {
 const expected=a2HistoricalCatalog;
 for(const zone of expected.zones){const actual=catalog.zones.find(row=>row.id===zone.id);if(!actual||actual.name!==zone.name)throw Error(`HISTORICAL_ZONE_DRIFT:${zone.id}`);}
 for(const space of expected.spaces){const actual=catalog.spaces.find(row=>row.id===space.id);if(!actual||JSON.stringify(actual)!==JSON.stringify(space))throw Error(`HISTORICAL_SPACE_DRIFT:${space.id}`);}
 for(const key of ['resource_types','resource_items'] as const)for(const reference of expected[key]){const actual=catalog[key].find(row=>row.id===reference.id);if(!actual||JSON.stringify(actual)!==JSON.stringify(reference))throw Error(`HISTORICAL_RESOURCE_DRIFT:${key}:${reference.id}`);}
 const mapping=a2RealSpatialManifest.map(row=>({...row,targetSpaceId:row.historicalSpaceId==null?null:
  row.decision==='REUSE_EXISTING'?row.historicalSpaceId:row.historicalSpaceId+offset}));
 const byCurrent=new Map(mapping.map(row=>[row.sourceNumericSpaceId+offset,row]));
 const sid=(id:number)=>{const row=byCurrent.get(id);if(!row||row.targetSpaceId==null)throw Error(`UNRESOLVED_SPACE:${id}`);return row.targetSpaceId;};
 const zid=(id:number)=>byCurrent.get(id)!.zoneId!;
 const input=d.input;
 input.planId=planId;
 input.tasks=input.tasks.map(task=>({...task,planId,...(task.spaceId==null?{}:{spaceId:sid(task.spaceId),zoneId:zid(task.spaceId)})}));
 input.plannerNext={...input.plannerNext!,mainFlow:{...input.plannerNext!.mainFlow!,spaceId:sid(input.plannerNext!.mainFlow!.spaceId)}};
 input.spaceResourceAssignments=Object.fromEntries(Object.entries(input.spaceResourceAssignments).map(([id,rs])=>[sid(Number(id)),rs]));
 input.setupPolicies=input.setupPolicies!.map(row=>({...row,spaceId:sid(row.spaceId)}));
 input.roundSynchronizations=input.roundSynchronizations!.map(row=>({...row,lanes:row.lanes.map(lane=>({...lane,spaceId:sid(lane.spaceId)}))}));
 input.coachRouteTransitions=input.coachRouteTransitions!.map(row=>({...row,fromSpaceId:sid(row.fromSpaceId),toSpaceId:sid(row.toSpaceId)}));
 input.operationalMealPolicies=input.operationalMealPolicies!.map(row=>({...row,spaceIds:[...new Set(row.spaceIds!.map(sid))]}));
 const effective=new Map(mapping.filter(row=>row.targetSpaceId!=null).map(row=>[row.targetSpaceId!,{id:row.targetSpaceId!,name:row.name,zone_id:row.zoneId!,parent_space_id:row.parentSpaceId}]));
 // Retain observed parent identities for snapshots/UI without inheriting their resources.
 for(const id of [4,42]){const row=catalog.spaces.find(row=>row.id===id)!;effective.set(id,{...row});}
 const spaces=[...effective.values()].sort((a,b)=>a.id-b.id);
 input.planZoneSettings=catalog.zones.map(zone=>({zoneId:zone.id,availabilityStart:null,availabilityEnd:null,source:'A2_REAL_TOPOLOGY_V2'}));
 input.planSpaceSettings=spaces.map(space=>({spaceId:space.id,zoneId:space.zone_id,parentSpaceId:space.parent_space_id,availabilityStart:null,availabilityEnd:null,source:'A2_REAL_TOPOLOGY_V2'}));
 const tables=d.tables;
 // The global template is an identity/catalog reference, not the day's effective
 // location contract. Reuse existing identities and retain the translated,
 // immutable per-day snapshots. Never update historical global templates.
 const reusedTaskTemplateReferences=tables.task_templates.map(row=>({
  id:row.id-offset,name:row.name,default_duration:row.default_duration
 }));
 const originalIdByImportId=new Map(tables.task_templates.map(row=>[row.id,row.id-offset]));
 if(originalIdByImportId.size!==tables.task_templates.length)throw Error('DUPLICATE_A2_TEMPLATE_IDENTITY');
 const originalTemplateId=(id:number)=>{
  const sourceId=originalIdByImportId.get(id);
  if(sourceId===undefined||sourceId<=0)throw Error(`UNRESOLVED_A2_TEMPLATE:${id}`);
  return sourceId;
 };
 input.tasks=input.tasks.map(task=>({...task,templateId:originalTemplateId(task.templateId)}));
 if(input.mealTaskTemplateId!=null)input.mealTaskTemplateId=originalTemplateId(input.mealTaskTemplateId);
 for(const task of tables.daily_tasks)task.template_id=originalTemplateId(task.template_id);
 for(const snapshot of tables.plan_task_template_snapshots)
  snapshot.source_template_id=originalTemplateId(snapshot.source_template_id);
 tables.task_templates=[];
 // Use the observed product assets, including CAM5/CAM6 already required by 06.
 // Old ad-hoc A2 resource rows remain literal and are never activated or edited.
 const assetBySource=new Map(a2ResourceManifest.map(row=>[row.sourceId,catalog.resource_items.find(asset=>asset.id===row.resourceItemId)!]));
 const resourceReferences=[...assetBySource.values()];
 const resourceTypeReferences=catalog.resource_types.filter(type=>resourceReferences.some(asset=>asset.type_id===type.id));
 input.planResourceItems=input.planResourceItems.map(row=>{const asset=assetBySource.get(row.name);if(!asset)throw Error(`UNRESOLVED_RESOURCE:${row.name}`);return {...row,resourceItemId:asset.id,typeId:asset.type_id};});
 for(const row of tables.plan_resource_items){const asset=assetBySource.get(row.name)!;row.resource_item_id=asset.id;row.type_id=asset.type_id;}
 tables.resource_items=[];tables.resource_types=[];
 for(const rows of Object.values(tables))for(const row of rows)if(row.plan_id!=null)row.plan_id=planId;
 tables.plans[0].id=planId;
 tables.zones=[];
 tables.spaces=spaces.filter(space=>mapping.some(row=>row.targetSpaceId===space.id&&row.decision!=='REUSE_EXISTING'));
 tables.plan_zone_settings=catalog.zones.map((zone,index)=>({id:11001+offset+index,plan_id:planId,zone_id:zone.id,name:zone.name,availability_start:null,availability_end:null,source:'adhoc',config_source:'DAY_OVERRIDE'}));
 tables.plan_space_settings=spaces.map((space,index)=>({id:12001+offset+index,plan_id:planId,space_id:space.id,zone_id:space.zone_id,name:space.name,parent_space_id:space.parent_space_id,availability_start:null,availability_end:null,source:'adhoc',config_source:'DAY_OVERRIDE'}));
 for(const task of tables.daily_tasks)if(task.space_id!=null){const old=task.space_id;task.space_id=sid(old);task.zone_id=zid(old);}
 for(const row of tables.task_templates)if(row.space_id!=null){const old=row.space_id;row.space_id=sid(old);row.zone_id=zid(old);}
 for(const row of tables.plan_task_template_snapshots)if(row.default_space_id!=null){const old=row.default_space_id;row.default_space_id=sid(old);row.default_zone_id=zid(old);}
 for(const row of tables.plan_space_resource_assignments)row.space_id=sid(row.space_id);
 // Rewrite the already validated day contract with the translated authorities.
 const c=d.configuration;
 const configuration={...c,mealTaskTemplateId:input.mealTaskTemplateId,plannerNext:input.plannerNext,setupPolicies:input.setupPolicies,roundSynchronizations:input.roundSynchronizations,coachRouteTransitions:input.coachRouteTransitions,operationalMealPolicies:input.operationalMealPolicies};
 tables.plans[0].planner_next_configuration=configuration;
 tables.plan_optimizer_snapshots[0].main_zone_id=1;
 return {...d,input,configuration,spatialTopologyVersion:A2_REAL_TOPOLOGY_VERSION,
  historicalCatalogFingerprint:a2CatalogFingerprint(catalog),catalogReferences:catalog,reusedTaskTemplateReferences,resourceReferences,resourceTypeReferences,resourceManifest:a2ResourceManifest,spatialManifest:mapping.map(row=>({...row,
   operationalMealPolicyIds:(input.operationalMealPolicies??[]).filter(policy=>(policy.spaceIds??[]).includes(row.targetSpaceId!)).map(policy=>policy.id),
   explicitRequirementsByTask:input.tasks.filter(task=>task.spaceId===row.targetSpaceId).map(task=>({taskId:task.id,
    taskType:task.templateName,dependsOnTaskIds:task.dependsOnTaskIds??[],directResourceIds:task.assignedResourceIds??[],
    assignedSpaceResourceIds:task.spaceId==null?[]:input.spaceResourceAssignments[task.spaceId]??[],blocksSpace:task.blocksSpace!==false,
    itinerantTeamId:task.itinerantTeamId??null,allowedItinerantTeamIds:task.allowedItinerantTeamIds??[]})),
  })),
  topologyCounts:{originalSourceSpaces:23,explicitExtensions:1,hierarchyNodes:spaces.length,physicalDestinations:new Set(mapping.filter(row=>row.targetSpaceId!=null&&row.decision!=='VIRTUAL_NON_PHYSICAL').map(row=>row.targetSpaceId)).size}};
}
