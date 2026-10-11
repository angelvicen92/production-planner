import {buildA2ImportRows} from './a2ImportRows';
import {projectTaskTemplateSnapshotRow} from '../../server/taskTemplateSnapshot';
import {hydratePlanOptimizerSnapshotV1} from '../../server/planOptimizerSnapshotPersistence';
import type {IStorage} from '../../server/storage';

/** Persistence boundary fixture; buildEngineInput itself is never replaced. */
export function a2ImportStorageFixture(dataset:ReturnType<typeof buildA2ImportRows>){
 const t=JSON.parse(JSON.stringify(dataset.tables));
 const storage={getPlanEngineInputDetails:async()=>({plan:t.plans[0],tasks:t.daily_tasks,locks:[],breaks:[]}),getContestantsByPlan:async()=>t.contestants,
 getPlanTaskTemplateSnapshots:async()=>t.plan_task_template_snapshots.map(projectTaskTemplateSnapshotRow),getPlanOptimizerSnapshot:async()=>hydratePlanOptimizerSnapshotV1(t.plan_optimizer_snapshots[0],t.plan_optimizer_snapshot_heuristics,[]),
 getCamerasAvailableForPlan:async()=>4,getPlanZoneSettings:async()=>t.plan_zone_settings,getPlanSpaceSettings:async()=>t.plan_space_settings,
 getPlanResourceItemsForPlan:async()=>t.plan_resource_items,getZoneResourceAssignmentsForPlan:async()=>({}),getSpaceResourceAssignmentsForPlan:async()=>Object.fromEntries(t.plan_space_resource_assignments.map((r:any)=>[r.space_id,[r.plan_resource_item_id]])),
 getZoneResourceTypeRequirementsForPlan:async()=>({}),getSpaceResourceTypeRequirementsForPlan:async()=>({}),getResourceItemComponentsMap:async()=>({}),getPlanResourceBundleSnapshot:async()=>t.plan_resource_bundle_snapshots[0]};
 return {tables:t,storage:storage as unknown as IStorage};
}

export function importedTaskSnapshotSource(rows:Record<string,any>[]){return rows.map(r=>({id:r.id,startPlanned:r.start_planned,endPlanned:r.end_planned,zoneId:r.zone_id,spaceId:r.space_id,locationLabel:r.location_label,durationOverride:r.duration_override,camerasOverride:r.cameras_override,assignedResources:r.assigned_resource_ids}));}
