import { isDeepStrictEqual } from "node:util";
import type { EngineInput } from "../engine/types";
import { dailyResourceRouteTransitionsSchema, persistedDailyResourceRouteTransitionsSchema,
  type DailyResourceRouteTransitions } from "../shared/resourceRouteTransitions";
import { resolveEngineInputResourceRouteTransitions } from "../engine/planner-next/integration/engineInputCoachRouteTransitions";
import { resolveEffectivePlanResourceAvailability } from "../engine/planner-next/integration/effectivePlanResourceAvailability";
import { resolveEffectivePlanSpatialAvailability } from "../engine/planner-next/integration/effectivePlanSpatialAvailability";

const defect = (message:string) => Object.assign(new Error(message),{status:422});
export function dailyResourceRouteAuthority(row:Record<string,any>) {
  if (row.daily_resource_route_transitions == null) return null;
  const parsed = persistedDailyResourceRouteTransitionsSchema.safeParse(row.daily_resource_route_transitions);
  if (!parsed.success || !row.planner_next_profile?.configuration || row.planner_next_configuration != null)
    throw defect("RESOURCE_ROUTE_AUTHORITY_CONFLICT");
  return parsed.data;
}
export function withDailyResourceRoutes(input:EngineInput, raw:DailyResourceRouteTransitions):EngineInput {
  const {routes} = dailyResourceRouteTransitionsSchema.parse(raw);
  const candidate = {...input,resourceRouteTransitions:routes.length ? routes : undefined};
  const resolved = resolveEngineInputResourceRouteTransitions(candidate,input.plannerNext?.timeGridMinutes);
  if (resolved.invalidContainer || resolved.defects.length) throw defect("INVALID_RESOURCE_ROUTE_TRANSITION");
  const spatial = resolveEffectivePlanSpatialAvailability(input.workDay,input.planZoneSettings,input.planSpaceSettings);
  for (const route of routes) {
    const resource = input.planResourceItems.find(r => r.id === route.planResourceItemId);
    if (!resource || resolveEffectivePlanResourceAvailability(input.workDay,resource).status !== "AVAILABLE"
      || !spatial.spacesById.get(route.fromSpaceId)?.effectiveWindow || !spatial.spacesById.get(route.toSpaceId)?.effectiveWindow)
      throw defect("RESOURCE_ROUTE_UNAVAILABLE_CATALOG");
  }
  return candidate;
}
export function applyDailyResourceRoutes(input:EngineInput,row:Record<string,any>,replay?:Record<string,any>):EngineInput {
  const raw = dailyResourceRouteAuthority(row);
  if (!raw) return input;
  const effective = withDailyResourceRoutes(input,{contractVersion:1,routes:raw.routes});
  if (row.current_config_revision_id != null && !isDeepStrictEqual(
    replay?.authorities?.plan_workday?.[0]?.plannerNextAuthorities?.resourceRouteTransitions,effective.resourceRouteTransitions))
    throw defect("RESOURCE_ROUTE_REVISION_NOT_MATERIALIZED");
  return effective;
}
