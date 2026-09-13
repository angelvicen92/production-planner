import type { Task } from "./contracts";
import type { MacroUnitConstrainedness } from "./macroScheduling";

export type PostCoreScope = "HARD_BLOCKER" | "SCARCE_OPERATION" | "CONTINUOUS_STRUCTURE" | "SETUP" | "OTHER_STRUCTURE" | "FLEXIBLE";

export interface PostCoreDescriptor<T> extends MacroUnitConstrainedness {
  readonly unit: T;
  readonly kind: string;
  readonly resourcePressure?: number;
}

const order: readonly PostCoreScope[] = ["SCARCE_OPERATION", "CONTINUOUS_STRUCTURE", "SETUP", "OTHER_STRUCTURE", "FLEXIBLE"];

/**
 * Chooses the currently eligible constructive scope before MRV.  A certified
 * empty hard domain is deliberately the only cross-scope override.
 *
 * Kinds identify contractual geometry, not permanent phases. Resource scopes
 * are admitted as scarce operations only when their state-derived pressure is
 * positive; atomic resource use therefore remains flexible.
 */
export function determineCurrentlyEligiblePostCoreScope<T>(descriptors: readonly PostCoreDescriptor<T>[]): {
  scope: PostCoreScope; units: readonly PostCoreDescriptor<T>[];
} | undefined {
  const blockers = descriptors.filter((item) => item.domainExact && item.domainSize === 0);
  if (blockers.length) return { scope: "HARD_BLOCKER", units: blockers };
  const scopeOf = (item: PostCoreDescriptor<T>): PostCoreScope => {
    if (item.kind === "RESOURCE_SCOPE" && (item.resourcePressure ?? 0) > 0) return "SCARCE_OPERATION";
    if (item.kind === "TECHNICAL_CHAIN" || item.kind === "ROUND_SYNCHRONIZATION" || item.kind === "JOINT") return "CONTINUOUS_STRUCTURE";
    if (item.kind === "SETUP_GROUP") return "SETUP";
    if (item.kind === "ITINERANT_UNIT") return "OTHER_STRUCTURE";
    return "FLEXIBLE";
  };
  for (const scope of order) {
    const units = descriptors.filter((item) => scopeOf(item) === scope);
    if (units.length) return { scope, units };
  }
  return undefined;
}

export interface ResourceScope<T extends Task = Task> {
  readonly id: string;
  readonly kind: "RESOURCE_SCOPE";
  readonly resourceId: string;
  readonly tasks: readonly T[];
}

/** Assigns each eligible task to one explicit shared resource, never a graph component. */
export function buildResourceScopes<T extends Task>(tasks: readonly T[], availabilityMinutes: ReadonlyMap<string, number>): {
  scopes: readonly ResourceScope<T>[]; atomic: readonly T[];
} {
  const memberships = new Map<string, T[]>();
  for (const task of tasks) for (const id of [...new Set(task.requiredResourceIds ?? [])].sort())
    memberships.set(id, [...(memberships.get(id) ?? []), task]);
  const shared = new Set([...memberships].filter(([, members]) => members.length > 1).map(([id]) => id));
  const assigned = new Map<string, string>();
  for (const task of [...tasks].sort((a, b) => a.id.localeCompare(b.id, "en"))) {
    const candidates = [...new Set(task.requiredResourceIds ?? [])].filter((id) => shared.has(id)).sort((a, b) =>
      (availabilityMinutes.get(a) ?? Number.POSITIVE_INFINITY) - (availabilityMinutes.get(b) ?? Number.POSITIVE_INFINITY)
      || a.localeCompare(b, "en"));
    if (candidates[0]) assigned.set(task.id, candidates[0]);
  }
  const scopes = [...shared].sort().map((resourceId) => ({ id: `resource-scope:${resourceId}`, kind: "RESOURCE_SCOPE" as const,
    resourceId, tasks: tasks.filter((task) => assigned.get(task.id) === resourceId).sort((a, b) => a.id.localeCompare(b.id, "en")) }))
    .filter(({ tasks: members }) => members.length > 1);
  const grouped = new Set(scopes.flatMap(({ tasks: members }) => members.map(({ id }) => id)));
  return { scopes, atomic: tasks.filter(({ id }) => !grouped.has(id)).sort((a, b) => a.id.localeCompare(b.id, "en")) };
}
