import { buildCanonicalFullA2EngineInput } from '../../engine/planner-next/benchmarks/canonicalFullA2EngineInput';
import { normalizeTaskTemplateCatalogEntry,taskTemplateSnapshotToPersistenceRow } from '../../server/taskTemplateSnapshot';
import { normalizePlanOptimizerSnapshotV1 } from '../../server/planOptimizerSnapshot';
import { buildPlanOptimizerSnapshotPersistenceBundleV1 } from '../../server/planOptimizerSnapshotPersistence';
import { planPlannerNextConfigurationSchema } from '../../server/planPlannerNextConfiguration';
import type { EngineInput } from '../../engine/types';

export function buildA2ImportRows(date:string,offset=0){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)throw Error('A valid explicit demo date is required');
 const canonical=buildCanonicalFullA2EngineInput({planId:27001,branchBudget:100_000});
 const source=canonical.input;
 // Numeric identities are translated uniformly; durations, clock times and labels are never translated.
 const rid=(n:number)=>n+offset,arr=(a:number[]|readonly number[])=>a.map(rid);
 const mapRecord=(record:Record<number,any>,values:(v:any)=>any=(v)=>v)=>Object.fromEntries(Object.entries(record).map(([k,v])=>[rid(Number(k)),values(v)]));
 const input:EngineInput={...source,planId:rid(source.planId),
  tasks:source.tasks.map(t=>({...t,id:rid(t.id),planId:rid(t.planId),templateId:rid(t.templateId),contestantId:t.contestantId==null?null:rid(t.contestantId),spaceId:t.spaceId==null?undefined:rid(t.spaceId),zoneId:t.zoneId==null?undefined:rid(t.zoneId),assignedResourceIds:t.assignedResourceIds?arr(t.assignedResourceIds):undefined,dependsOnTaskIds:arr(t.dependsOnTaskIds??[]),itinerantTeamId:t.itinerantTeamId==null?undefined:rid(t.itinerantTeamId),allowedItinerantTeamIds:t.allowedItinerantTeamIds?arr(t.allowedItinerantTeamIds):undefined})),
  planZoneSettings:source.planZoneSettings!.map(z=>({...z,zoneId:rid(z.zoneId)})),planSpaceSettings:source.planSpaceSettings!.map(s=>({...s,spaceId:rid(s.spaceId),zoneId:rid(s.zoneId)})),
  contestantAvailabilityById:mapRecord(source.contestantAvailabilityById!),vocalCoachPlanResourceItemIdByContestantId:mapRecord(source.vocalCoachPlanResourceItemIdByContestantId!,rid),coachResourceIds:arr(source.coachResourceIds!),
  planResourceItems:source.planResourceItems.map(r=>({...r,id:rid(r.id),typeId:rid(r.typeId),resourceItemId:rid(r.resourceItemId)})),spaceResourceAssignments:mapRecord(source.spaceResourceAssignments,arr),
  resourcePresenceConcentrationPolicies:mapRecord(source.resourcePresenceConcentrationPolicies!),mealTaskTemplateId:rid(source.mealTaskTemplateId!),
  plannerNext:{...source.plannerNext!,mainFlow:{...source.plannerNext!.mainFlow,spaceId:rid(source.plannerNext!.mainFlow.spaceId)}},
  anchoredAccompaniments:source.anchoredAccompaniments!.map(p=>({...p,anchorTaskId:rid(p.anchorTaskId),beforeTaskIds:arr(p.beforeTaskIds),afterTaskIds:arr(p.afterTaskIds)})),
  setupPolicies:source.setupPolicies!.map(p=>({...p,spaceId:rid(p.spaceId)})),roundSynchronizations:source.roundSynchronizations!.map(p=>({...p,lanes:p.lanes.map(l=>({...l,spaceId:rid(l.spaceId),taskIds:arr(l.taskIds)}))})),
  technicalChains:source.technicalChains!.map(p=>({...p,orderedTaskIds:arr(p.orderedTaskIds),phases:p.phases?.map(arr),requiredResourceIds:arr(p.requiredResourceIds)})),
  coachRouteTransitions:source.coachRouteTransitions!.map(p=>({...p,coachPlanResourceItemId:rid(p.coachPlanResourceItemId),fromSpaceId:rid(p.fromSpaceId),toSpaceId:rid(p.toSpaceId)})),
  operationalMealPolicies:source.operationalMealPolicies!.map(p=>({...p,planResourceItemIds:arr(p.planResourceItemIds),spaceIds:arr(p.spaceIds??[])})),
  itinerantTeamAvailability:source.itinerantTeamAvailability!.map(p=>({...p,itinerantTeamId:rid(p.itinerantTeamId),planResourceItemIds:arr(p.planResourceItemIds??[])})),
 };
 const configuration=planPlannerNextConfigurationSchema.parse({contractVersion:1,legacyGroupingMode:'DISABLED',mealTaskTemplateId:input.mealTaskTemplateId,plannerNext:input.plannerNext,
  taskOperations:input.tasks.map(t=>({taskId:t.id,plannerNextKind:t.plannerNextKind,operationalRole:t.operationalRole,dependsOnTaskIds:t.dependsOnTaskIds??[],breakKind:t.breakKind,mealOccupiesSpace:t.mealOccupiesSpace,jointGroupId:t.jointGroupId,setupFamilyId:t.setupFamilyId,itinerantTeamId:t.itinerantTeamId,itinerantTeamRequirement:t.itinerantTeamRequirement,allowedItinerantTeamIds:t.allowedItinerantTeamIds})),
  anchoredAccompaniments:input.anchoredAccompaniments,setupPolicies:input.setupPolicies,roundSynchronizations:input.roundSynchronizations,technicalChains:input.technicalChains,coachRouteTransitions:input.coachRouteTransitions,operationalMealPolicies:input.operationalMealPolicies,itinerantTeamAvailability:input.itinerantTeamAvailability,resourcePresenceConcentrationPolicies:input.resourcePresenceConcentrationPolicies,arrivalMaximumGroupSize:input.arrivalMaximumGroupSize,departureMaximumGroupSize:input.departureMaximumGroupSize});
 const tables:Record<string,Record<string,any>[]>={};
 // All operational settings are materialized on the new day. Global defaults
 // are deliberately absent, including on a project that already has days.
 tables.zones=canonical.expansion.spaces.map((s,i)=>({id:rid(6001+i),name:s.id}));
 tables.spaces=canonical.expansion.spaces.map((s,i)=>({id:rid(3001+i),zone_id:rid(6001+i),name:s.id}));
 tables.resource_types=input.planResourceItems.map(r=>({id:r.typeId,code:`a2-${r.typeId}`,name:r.name.startsWith('cam-')?'Cámara':r.name}));
 tables.resource_items=input.planResourceItems.map(r=>({id:r.resourceItemId,type_id:r.typeId,name:r.name,is_active:false}));
 const templateIds=[...new Set(input.tasks.map(t=>t.templateId))].sort((a,b)=>a-b);
 tables.task_templates=templateIds.map(id=>{const t=input.tasks.find(t=>t.templateId===id)!;return {id,name:t.templateName,default_duration:t.durationOverrideMin,auto_create_on_contestant_create:false,zone_id:t.zoneId??null,space_id:t.spaceId??null};});
 const templateSnapshots=tables.task_templates.map(t=>normalizeTaskTemplateCatalogEntry(t,'ad_hoc_from_default'));
 tables.plan_task_template_snapshots=templateSnapshots.map((s,i)=>({id:rid(9001+i),...taskTemplateSnapshotToPersistenceRow(input.planId,s)}));
 const snapId=(name:string)=>tables.plan_task_template_snapshots.find(s=>s.template_name===name)!.id;
 const optimizer=normalizePlanOptimizerSnapshotV1({optimization_mode:'BASIC',group_by_space_and_template:false,main_zone_id:input.tasks.find(t=>t.plannerNextKind==='main')!.zoneId,arrival_grouping_target:input.arrivalGroupingTarget,departure_grouping_target:input.departureGroupingTarget,arrival_min_gap_minutes:input.arrivalMinGapMinutes,departure_min_gap_minutes:input.departureMinGapMinutes,van_capacity:input.vanCapacity,weight_arrival_departure_grouping:input.transportSettings!.groupingWeight},{arrivalPlanTemplateSnapshotId:snapId('IN'),departurePlanTemplateSnapshotId:snapId('OUT')},'DAY_OVERRIDE');
 const optimizerRows=buildPlanOptimizerSnapshotPersistenceBundleV1(input.planId,optimizer);
 tables.plans=[{id:input.planId,date,work_start:input.workDay.start,work_end:input.workDay.end,meal_start:input.meal.start,meal_end:input.meal.end,meal_mode:input.mealMode,
  work_baseline_start:input.workDay.start,work_baseline_end:input.workDay.end,work_config_source:'DAY_OVERRIDE',work_override_by:null,work_override_at:null,meal_baseline_start:input.meal.start,meal_baseline_end:input.meal.end,meal_baseline_mode:input.mealMode,meal_config_source:'DAY_OVERRIDE',meal_override_by:null,meal_override_at:null,participant_transition_minutes:5,participant_transition_baseline_minutes:5,participant_transition_config_source:'DAY_OVERRIDE',participant_transition_override_by:null,participant_transition_override_at:null,contestant_meal_duration_minutes:input.contestantMealDurationMinutes,contestant_meal_max_simultaneous:input.contestantMealMaxSimultaneous,cameras_available:4,status:'draft',optimizer_engine:'v3',planner_next_configuration:configuration}];
 tables.plan_zone_settings=tables.zones.map((z,i)=>({id:rid(11001+i),plan_id:input.planId,zone_id:z.id,name:z.name,availability_start:null,availability_end:null,source:'default',config_source:'INHERITED'}));
 tables.plan_space_settings=tables.spaces.map((s,i)=>({id:rid(12001+i),plan_id:input.planId,space_id:s.id,zone_id:s.zone_id,name:s.name,availability_start:null,availability_end:null,source:'default',config_source:'INHERITED'}));
 tables.plan_resource_items=input.planResourceItems.map(r=>({id:r.id,plan_id:input.planId,resource_item_id:r.resourceItemId,type_id:r.typeId,name:r.name,is_available:r.isAvailable,source:'adhoc',availability_start:r.availabilityStart,availability_end:r.availabilityEnd}));
 tables.contestants=canonical.expansion.participants.map((name,i)=>({id:rid(201+i),plan_id:input.planId,name,availability_start:input.contestantAvailabilityById![rid(201+i)].start,availability_end:input.contestantAvailabilityById![rid(201+i)].end,vocal_coach_plan_resource_item_id:input.vocalCoachPlanResourceItemIdByContestantId![rid(201+i)]}));
 tables.daily_tasks=input.tasks.map(t=>({id:t.id,plan_id:input.planId,template_id:t.templateId,contestant_id:t.contestantId,duration_override:t.durationOverrideMin,zone_id:t.zoneId??null,space_id:t.spaceId??null,assigned_resource_ids:t.assignedResourceIds??[],participant_margin_before_minutes:t.participantMarginBeforeMinutes??null,participant_margin_after_minutes:t.participantMarginAfterMinutes??null,status:'pending',start_planned:null,end_planned:null}));
 tables.plan_space_resource_assignments=Object.entries(input.spaceResourceAssignments).flatMap(([space,resources])=>resources.map(resource=>({plan_id:input.planId,space_id:Number(space),plan_resource_item_id:resource}))).map((row,i)=>({id:rid(16001+i),...row}));
 tables.plan_resource_bundle_snapshots=[{id:rid(13001),plan_id:input.planId,source:'DAY_OVERRIDE',bundles:[],components:[],space_affinities:[]}];
 tables.plan_optimizer_snapshots=[{id:rid(14001),...optimizerRows.snapshot,baseline_snapshot:optimizer}];
 tables.plan_optimizer_snapshot_heuristics=optimizerRows.heuristics.map((h,i)=>({id:rid(15001+i),snapshot_id:rid(14001),...h}));
 const order=['zones','spaces','resource_types','resource_items','task_templates','plans','plan_task_template_snapshots','plan_zone_settings','plan_space_settings','plan_resource_items','contestants','daily_tasks','plan_space_resource_assignments','plan_resource_bundle_snapshots','plan_optimizer_snapshots','plan_optimizer_snapshot_heuristics'];
 return {input,configuration,tables,order,optimizer};
}
