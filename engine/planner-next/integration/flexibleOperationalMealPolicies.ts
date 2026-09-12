import type { EngineInput } from "../../types";
import type { Window } from "../contracts";
import { engineTimeToMinute } from "./engineTime";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES } from "./plannerNextCapabilities";

export type FlexibleOperationalMealPolicyDefect =
  | "INVALID_ID"
  | "DUPLICATE_ID"
  | "INVALID_WINDOW"
  | "OUTSIDE_DAY"
  | "OFF_GRID"
  | "INVALID_DURATION"
  | "INVALID_RESOURCE"
  | "MISSING_RESOURCE"
  | "INVALID_SPACE"
  | "MISSING_SPACE"
  | "SCOPE_REUSED_ACROSS_POLICIES";

export interface ResolvedFlexibleOperationalMealPolicy {
  readonly id: string;
  readonly window: Readonly<Window>;
  readonly duration: number;
  readonly resourceIds: readonly number[];
  readonly spaceIds: readonly number[];
  readonly defects: readonly FlexibleOperationalMealPolicyDefect[];
  readonly status: "SUPPORTED" | "UNSUPPORTED";
}

const compare = (left: string, right: string): number => left.localeCompare(right, "en");
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(freeze);
  }
  return value;
};

/**
 * Resolves one flexible operational meal obligation per effective work scope.
 * The identity is independent from itinerant-unit aliases so the same physical
 * resources keep exactly one meal across recomposition.
 */
export function resolveFlexibleOperationalMealPolicies(
  input: EngineInput,
): readonly ResolvedFlexibleOperationalMealPolicy[] {
  const policies = [...(input.operationalMealPolicies ?? [])];
  const resourceIds = new Set(input.planResourceItems.map(({ id }) => id));
  const spaceIds = new Set((input.planSpaceSettings ?? []).map(({ spaceId }) => spaceId));
  const idCounts = new Map<string, number>();
  for (const policy of policies) {
    const id = typeof policy?.id === "string" ? policy.id : "";
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  const dayStart = (() => { try { return engineTimeToMinute(input.workDay.start); } catch { return null; } })();
  const dayEnd = (() => { try { return engineTimeToMinute(input.workDay.end); } catch { return null; } })();
  const drafts = policies.map((policy) => {
    const defects: FlexibleOperationalMealPolicyDefect[] = [];
    const id = typeof policy?.id === "string" ? policy.id : "";
    if (!id || id.trim() !== id) defects.push("INVALID_ID");
    if (id && (idCounts.get(id) ?? 0) > 1) defects.push("DUPLICATE_ID");

    let start = -1, end = -1;
    try {
      start = engineTimeToMinute(policy.window.start);
      end = engineTimeToMinute(policy.window.end);
    } catch {
      defects.push("INVALID_WINDOW");
    }
    if (start >= end) defects.push("INVALID_WINDOW");
    if (dayStart !== null && dayEnd !== null && start >= 0 && end >= 0 && (start < dayStart || end > dayEnd)) defects.push("OUTSIDE_DAY");
    if (start >= 0 && end >= 0 && (start % PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES !== 0 || end % PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES !== 0)) defects.push("OFF_GRID");

    const duration = policy.durationMinutes;
    if (!Number.isInteger(duration) || duration <= 0 || duration % PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES !== 0 || (start >= 0 && end >= 0 && duration > end - start)) defects.push("INVALID_DURATION");

    const rawResources = Array.isArray(policy.planResourceItemIds) ? policy.planResourceItemIds : [];
    const canonicalResources = [...new Set(rawResources.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
    if (canonicalResources.length !== rawResources.length) defects.push("INVALID_RESOURCE");
    if (canonicalResources.some((id) => !resourceIds.has(id))) defects.push("MISSING_RESOURCE");

    const rawSpaces = Array.isArray(policy.spaceIds) ? policy.spaceIds : [];
    const canonicalSpaces = [...new Set(rawSpaces.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
    if (canonicalSpaces.length !== rawSpaces.length) defects.push("INVALID_SPACE");
    if (canonicalSpaces.some((id) => !spaceIds.has(id))) defects.push("MISSING_SPACE");
    if (canonicalResources.length === 0 && canonicalSpaces.length === 0) defects.push("INVALID_RESOURCE");

    return { id, window: { start, end }, duration, resourceIds: canonicalResources, spaceIds: canonicalSpaces, defects };
  }).sort((left, right) => compare(left.id, right.id));

  const ownerByScope = new Map<string, number>();
  drafts.forEach((draft, index) => {
    for (const scopeId of [
      ...draft.resourceIds.map((id) => `resource:${id}`),
      ...draft.spaceIds.map((id) => `space:${id}`),
    ]) {
      const owner = ownerByScope.get(scopeId);
      if (owner === undefined) ownerByScope.set(scopeId, index);
      else {
        for (const target of [drafts[owner]!, draft]) {
          if (!target.defects.includes("SCOPE_REUSED_ACROSS_POLICIES")) target.defects.push("SCOPE_REUSED_ACROSS_POLICIES");
        }
      }
    }
  });

  return freeze(drafts.map((draft) => {
    const defects = [...draft.defects].sort(compare);
    return { ...draft, defects, status: defects.length ? "UNSUPPORTED" as const : "SUPPORTED" as const };
  }));
}
