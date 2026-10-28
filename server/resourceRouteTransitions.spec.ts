import assert from "node:assert/strict";
import test from "node:test";
import { dailyResourceRouteTransitionsSchema } from "../shared/resourceRouteTransitions";
import { dayConfigEditSchema } from "../shared/dayConfig";
import { applyDailyResourceRoutes, withDailyResourceRoutes } from "./resourceRouteTransitions";
import { createSpec10019CoachRouteTransitionFixture } from "../engine/planner-next/benchmarks/runSpec10019CoachRouteTransitionBenchmark";
import { projectEffectiveAuthoritiesFromEngineInputV1 } from "./effectivePlanConfigRevision";

function fixture() {
  const input = createSpec10019CoachRouteTransitionFixture();
  const legacy = input.coachRouteTransitions![0]!;
  input.coachRouteTransitions = [];
  const route = {planResourceItemId:legacy.coachPlanResourceItemId,fromSpaceId:legacy.fromSpaceId,toSpaceId:legacy.toSpaceId,minutes:30};
  return {input,route};
}
test("native route contract is canonical, positive, directional and revision guarded",()=>{
  const {route}=fixture();
  const raw={contractVersion:1 as const,routes:[{...route,fromSpaceId:route.toSpaceId,toSpaceId:route.fromSpaceId},route]};
  const parsed=dailyResourceRouteTransitionsSchema.parse(raw);
  assert.equal(parsed.routes.length,2);assert.equal(raw.routes[0]!.fromSpaceId,route.toSpaceId);
  for(const invalid of [{...route,minutes:0},{...route,minutes:7},{...route,fromSpaceId:route.toSpaceId},{...route,planResourceItemId:-1}])
    assert.equal(dailyResourceRouteTransitionsSchema.safeParse({contractVersion:1,routes:[invalid]}).success,false);
  assert.equal(dailyResourceRouteTransitionsSchema.safeParse({contractVersion:1,routes:[route,route]}).success,false);
  assert.equal(dayConfigEditSchema.safeParse({resourceRouteTransitions:raw}).success,false);
  assert.equal(dayConfigEditSchema.safeParse({resourceRouteTransitions:raw,expectedRevisionId:null}).success,true);
  assert.equal(dayConfigEditSchema.safeParse({resourceRouteTransitions:raw,expectedRevisionId:null,workday:{start:"09:00",end:"18:00"}}).success,false);
});
test("native route validates daily identity, effective catalog and compatibility without mutating input",()=>{
  const {input,route}=fixture(),before=structuredClone(input);
  const effective=withDailyResourceRoutes(input,{contractVersion:1,routes:[route]});
  assert.deepEqual(input,before);assert.deepEqual(effective.resourceRouteTransitions,[route]);
  assert.throws(()=>withDailyResourceRoutes(input,{contractVersion:1,routes:[{...route,planResourceItemId:999}]}));
  input.planResourceItems.find(r=>r.id===route.planResourceItemId)!.isAvailable=false;
  assert.throws(()=>withDailyResourceRoutes(input,{contractVersion:1,routes:[route]}),/UNAVAILABLE_CATALOG/);
});
test("daily storage and revision replay must agree; empty removal preserves historical absence",()=>{
  const {input,route}=fixture();
  const stored={contractVersion:1,routes:[route],by:"00000000-0000-4000-8000-000000000001",at:"2026-10-28T00:00:00Z"};
  const row={planner_next_profile:{configuration:{}},current_config_revision_id:1,daily_resource_route_transitions:stored};
  assert.throws(()=>applyDailyResourceRoutes(input,row,{}),/REVISION_NOT_MATERIALIZED/);
  const effective=withDailyResourceRoutes(input,{contractVersion:1,routes:[route]});
  const authority=projectEffectiveAuthoritiesFromEngineInputV1(effective).plan_workday!;
  const replay={authorities:{plan_workday:authority.semanticValue}};
  assert.deepEqual(applyDailyResourceRoutes(input,row,replay),effective);
  assert.throws(()=>applyDailyResourceRoutes(input,{...row,planner_next_configuration:{}},replay),/AUTHORITY_CONFLICT/);
  assert.equal(withDailyResourceRoutes(effective,{contractVersion:1,routes:[]}).resourceRouteTransitions,undefined);
  assert.equal(applyDailyResourceRoutes(input,{planner_next_profile:{configuration:{}}}),input);
});
