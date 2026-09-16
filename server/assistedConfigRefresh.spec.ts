import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
import {buildEffectivePlanConfigReplaySnapshotV1} from "./assistedPlanningConfigRevision";
import {normalizePlanOptimizerSnapshotV1} from "./planOptimizerSnapshot";
import {normalizeTaskTemplateCatalogEntry} from "./taskTemplateSnapshot";
process.env.SUPABASE_URL??="http://localhost";process.env.SUPABASE_SERVICE_ROLE_KEY??="test";process.env.SUPABASE_ANON_KEY??="test";
const {AssistedConfigRefreshError,AssistedConfigRefreshService,buildTaskTemplateRefreshChanges,isAuthoritativeLocalTemplateOverride,buildLocalOverrideProjection,buildOptimizerRefreshChange}=await import("./assistedConfigRefresh");
type ConfigRefreshCandidate=import("./assistedConfigRefresh").ConfigRefreshCandidate;

const optimizer=normalizePlanOptimizerSnapshotV1({optimizationMode:"basic",heuristics:{},groupingZoneIds:[],arrivalGroupingTarget:0,departureGroupingTarget:0,arrivalMinGapMinutes:0,departureMinGapMinutes:0,vanCapacity:0,weightArrivalDepartureGrouping:0,nearHardBreaksMax:0}, {}, "INHERITED");
const authorities:any={plan_workday:{semanticValue:[{workDay:"2026-09-16"}],provenance:{authority:"plans",authorityContractVersion:1}},contestant_availability:{semanticValue:[],provenance:{authority:"contestants",authorityContractVersion:1}},spatial_configuration:{semanticValue:[],provenance:{authority:"spatial",authorityContractVersion:1}},resource_configuration:{semanticValue:[],provenance:{authority:"resources",authorityContractVersion:1}},resource_assignments_and_requirements:{semanticValue:[],provenance:{authority:"assignments",authorityContractVersion:1}}};
const oldTemplate=normalizeTaskTemplateCatalogEntry({id:1,name:"Entrevista",defaultDuration:20},"inherited");const nextTemplate=normalizeTaskTemplateCatalogEntry({id:1,name:"Entrevista",defaultDuration:30},"inherited");
const current=buildEffectivePlanConfigReplaySnapshotV1({taskTemplateSnapshots:[oldTemplate],optimizerSnapshot:optimizer,authorities});
const candidateReplay=buildEffectivePlanConfigReplaySnapshotV1({taskTemplateSnapshots:[nextTemplate],optimizerSnapshot:optimizer,authorities});
const candidate:ConfigRefreshCandidate={currentReplay:current,candidateReplay,preview:{contractVersion:1,expectedConfigRevisionId:8,unsupportedAuthorities:[],localOverrides:[],changes:[{key:"task_templates:1",authority:"task_templates",kind:"MODIFIED",label:"Entrevista",localOverride:true}]}};

test("preview is read-only and exposes a local override",async()=>{let writes=0;const service=new AssistedConfigRefreshService({} as any,async()=>{writes++;return {data:null,error:null};},async()=>candidate);const result=await service.preview(5);assert.equal(writes,0);assert.equal(result.changes[0].localOverride,true);});
test("selective apply creates one versioned atomic request and stale/no-op fail closed",async()=>{const calls:any[]=[];const service=new AssistedConfigRefreshService({} as any,async(name,args)=>{calls.push({name,args});return {data:9,error:null};},async()=>candidate);const result=await service.apply(5,"user",8,["task_templates:1"]);assert.equal(result.revisionId,9);assert.equal(calls.length,1);assert.equal(calls[0].args.p_expected_revision,8);assert.deepEqual((calls[0].args.p_diff as any).selectedChanges.map((x:any)=>x.key),["task_templates:1"]);await assert.rejects(service.apply(5,"user",7,["task_templates:1"]),(e:any)=>e instanceof AssistedConfigRefreshError&&e.code==="STALE_CONFIG_REVISION");await assert.rejects(service.apply(5,"user",8,[]),(e:any)=>e.code==="NO_CHANGES");});
test("migration preserves accepted history and placements while invalidating only draft validation",()=>{const sql=readFileSync(new URL("../supabase/migrations/083_assisted_config_refresh.sql",import.meta.url),"utf8");assert.doesNotMatch(sql,/UPDATE public\.assisted_planning_stages|UPDATE public\.planning_accepted_exceptions|UPDATE public\.daily_tasks/);assert.match(sql,/draft_validation_id=NULL/);assert.match(sql,/current_config_revision_id=new_revision/);assert.match(sql,/FOR UPDATE/);assert.match(sql,/SECURITY INVOKER/);assert.match(sql,/REFRESH_REPLAY_NOT_MATERIALIZED/);assert.match(sql,/GET DIAGNOSTICS affected_rows = ROW_COUNT/);});

test("migration verifies every materialized replay group before creating a revision",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/083_assisted_config_refresh.sql",import.meta.url),"utf8");
  const guard=sql.slice(sql.indexOf("IF (SELECT count(*) FROM public.plan_task_template_snapshots"),sql.indexOf("INSERT INTO public.plan_config_revisions"));
  for(const field of ["source","template_name","default_duration","default_cameras","default_zone_id","default_space_id","auto_create_on_contestant_create","requires_auxiliar","requires_coach","requires_presenter","exclusive_auxiliar","has_dependency","dependency_template_ids","resource_requirements","itinerant_team_requirement","itinerant_team_id","allowed_itinerant_team_ids","setup_id"])assert.match(guard,new RegExp(`t\\.${field}`));
  for(const field of ["source","editing_mode","main_zone_id","arrival_plan_template_snapshot_id","departure_plan_template_snapshot_id","arrival_grouping_target","departure_grouping_target","arrival_min_gap_minutes","departure_min_gap_minutes","van_capacity","grouping_weight","near_hard_breaks_max"])assert.match(guard,new RegExp(`o\\.${field}`));
  assert.match(guard,/jsonb_each\(optimizer->'heuristics'\)/);assert.match(guard,/plan_optimizer_snapshot_heuristics/);
  assert.match(guard,/plan_optimizer_snapshot_grouping_zones/);assert.match(guard,/jsonb_agg\(g\.zone_id ORDER BY g\.zone_id\)/);
  assert.match(guard,/jsonb_agg\(v ORDER BY v::text\)/);
});

test("template refresh compares operational semantics independently from provenance",()=>{
  const legacy={...oldTemplate,source:"legacy_backfill" as const};
  assert.deepEqual(buildTaskTemplateRefreshChanges([legacy],[oldTemplate]),[]);
  assert.equal(isAuthoritativeLocalTemplateOverride(legacy),false);
  assert.deepEqual(buildTaskTemplateRefreshChanges([oldTemplate],[nextTemplate]).map(x=>[x.kind,x.localOverride]),[["MODIFIED",false]]);
  const adHoc={...oldTemplate,source:"ad_hoc_from_default" as const};
  assert.deepEqual(buildTaskTemplateRefreshChanges([adHoc],[]).map(x=>[x.kind,x.localOverride]),[["REMOVED",true]]);
  assert.deepEqual(buildTaskTemplateRefreshChanges([], [oldTemplate]).map(x=>x.kind),["NEW"]);
});

test("local template provenance remains visible without manufacturing a semantic change",()=>{
  const adHoc={...oldTemplate,source:"ad_hoc_from_default" as const};
  assert.deepEqual(buildTaskTemplateRefreshChanges([adHoc],[oldTemplate]),[]);
  assert.deepEqual(buildLocalOverrideProjection([adHoc],"INHERITED"),[{key:"task_templates:1",authority:"task_templates",label:"Entrevista",source:"ad_hoc_from_default"}]);
  assert.deepEqual(buildTaskTemplateRefreshChanges([adHoc],[nextTemplate]).map(x=>[x.kind,x.localOverride]),[["MODIFIED",true]]);
  assert.deepEqual(buildLocalOverrideProjection([{...oldTemplate,source:"legacy_backfill"}],"INHERITED"),[]);
});

test("optimizer refresh uses canonical semantic diff while keeping DAY_OVERRIDE provenance visible",()=>{
  const samePreview:any={status:"READY",current:{source:"DAY_OVERRIDE"},diff:{hasSemanticChanges:false}};
  assert.equal(buildOptimizerRefreshChange(samePreview),null);
  assert.deepEqual(buildLocalOverrideProjection([],"DAY_OVERRIDE"),[{key:"optimizer:settings",authority:"optimizer",label:"Preferencias de optimización",source:"DAY_OVERRIDE"}]);
  const changedPreview:any={status:"READY",current:{source:"DAY_OVERRIDE"},diff:{hasSemanticChanges:true}};
  assert.deepEqual(buildOptimizerRefreshChange(changedPreview),{key:"optimizer:settings",authority:"optimizer",kind:"MODIFIED",label:"Preferencias de optimización",localOverride:true});
});

test("unsupported coverage is operator-facing and prevents a false fully-current claim",()=>{
  const source=readFileSync(new URL("../client/src/components/planning/assisted-planning-workspace.tsx",import.meta.url),"utf8");
  assert.match(source,/Categorías aún no comparables/);assert.match(source,/No hay cambios en las categorías compatibles/);
  assert.match(source,/Seleccionar todos los cambios compatibles/);assert.doesNotMatch(source,/unsupportedAuthorities\.map\(\(authority/);
  assert.match(source,/Ajustes locales existentes en el día/);
});
