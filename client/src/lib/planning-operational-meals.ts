import type { AssistedPlanningSnapshotV1 } from "@shared/assistedPlanningSnapshotContracts";

/** Presentation needs only explicit scopes; policy windows never supply placement. */
export interface OperationalMealConfiguration {
  operationalMealPolicies?: readonly {
    id: string;
    spaceIds?: readonly number[];
    planResourceItemIds: readonly number[];
  }[];
  itinerantTeamAvailability?: readonly {
    itinerantTeamId: number;
    planResourceItemIds?: readonly number[];
  }[];
}
export interface PlanningOperationalMeals {
  authority: "legacy" | "accepted" | "draft";
  unavailable: boolean;
  meals: readonly {
    policyId: string;
    spaceIds: readonly number[];
    resourceIds: readonly number[];
    teamIds: readonly number[];
    interval: { startPlanned: string; endPlanned: string } | null;
  }[];
}

const ids = (values?: readonly number[]) => [...new Set((values ?? []).filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
// EngineInput adapter namespaces policy identities when materializing snapshots.
const policyIdentity = (id: string) => `break:${id}`;

/** A missing structured snapshot must never reactivate legacy catalogue breaks.
 * Select the authoritative snapshot once, upstream of every renderer/variant.
 * Proposal previews deliberately have no place in this contract. */
export function resolvePlanningOperationalMeals(
  configuration: OperationalMealConfiguration | null | undefined,
  snapshot: Pick<AssistedPlanningSnapshotV1, "operationalMeals"> | null | undefined,
  authority: "accepted" | "draft",
): PlanningOperationalMeals {
  if (configuration == null && snapshot?.operationalMeals === undefined)
    return { authority: "legacy", unavailable: false, meals: [] };
  const policies = configuration?.operationalMealPolicies ?? [];
  const materialized = snapshot?.operationalMeals ?? [];
  const keys = [...new Set([...policies.map(p => policyIdentity(p.id)), ...materialized.map(m => m.policyId)])].sort();
  const meals = keys.map(policyId => {
    const matchingPolicies = policies.filter(p => policyIdentity(p.id) === policyId);
    const policy = matchingPolicies.length === 1 ? matchingPolicies[0] : undefined;
    const matchingMeals = materialized.filter(m => m.policyId === policyId);
    const meal = matchingMeals.length === 1 ? matchingMeals[0] : undefined;
    const spaceIds = ids(policy?.spaceIds), resourceIds = ids(policy?.planResourceItemIds);
    const hasScope = spaceIds.length > 0 || resourceIds.length > 0;
    const validTime = (time: unknown): time is string => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    const interval = policy && hasScope && meal && validTime(meal.startPlanned) && validTime(meal.endPlanned) && meal.startPlanned < meal.endPlanned
      ? { startPlanned: meal.startPlanned, endPlanned: meal.endPlanned } : null;
    // A recomposed team is affected by its explicitly configured members' meals.
    // Reuse the same policy identity; this does not create a team obligation.
    const teamIds = ids(configuration?.itinerantTeamAvailability?.filter(team => team.planResourceItemIds?.some(id => resourceIds.includes(id))).map(team => team.itinerantTeamId));
    return { policyId, spaceIds, resourceIds, teamIds, interval };
  });
  return { authority, unavailable: !snapshot || !configuration || !configuration.operationalMealPolicies, meals };
}

export interface OperationalMealVisualTask {
  id: number;
  templateId: number;
  contestantId: null;
  status: string;
  startPlanned: string;
  endPlanned: string;
  template: { name: string; abbrev: string; uiColor: string };
  spaceId: number | null;
  itinerantTeamId: number | null;
  breakKind: string;
  operationalMealPolicyId: string;
  operationalMealScope: "space" | "resource" | "team";
  assignedResources: number[];
}

/** Multiple lanes are projections of one meal, never independent obligations. */
export function operationalMealVisualTasks(presentation: PlanningOperationalMeals): OperationalMealVisualTask[] {
  const tasks: OperationalMealVisualTask[] = [];
  for (const meal of presentation.meals) {
    const interval = meal.interval;
    if (!interval) continue;
    const add = (scope: OperationalMealVisualTask["operationalMealScope"], spaceId: number | null, itinerantTeamId: number | null, assignedResources: number[]) => tasks.push({
      id: -Number.MAX_SAFE_INTEGER + tasks.length, templateId: -1, contestantId: null,
      status: presentation.authority === "accepted" ? "accepted" : "draft",
      ...interval, template: { name: `${scope === "team" ? "Comida de recursos" : "Comida operativa"} · ${presentation.authority === "accepted" ? "aceptada" : "borrador"}`, abbrev: "COMIDA", uiColor: "#d6d3d1" },
      spaceId, itinerantTeamId, assignedResources, breakKind: scope === "team" ? "itinerant_meal" : "space_meal",
      operationalMealPolicyId: meal.policyId, operationalMealScope: scope,
    });
    meal.spaceIds.forEach(id => add("space", id, null, []));
    if (meal.resourceIds.length) add("resource", null, null, [...meal.resourceIds]);
    meal.teamIds.forEach(id => add("team", null, id, []));
  }
  return tasks;
}
