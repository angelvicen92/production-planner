import type { PlannerNextProblem, PlannerSearchPolicy } from "./contracts";

export type PlannerSearchPolicySelectionSource = "EXPLICIT" | "MIGRATION_DEFAULT";

export type PlannerCapability = "ANCHORED_ACCOMPANIMENT";

export interface PlannerCapabilityRequirement {
  capability: PlannerCapability;
  supportedPolicies: readonly PlannerSearchPolicy[];
  requiredPolicy?: PlannerSearchPolicy;
}

export type PlannerSearchPolicyReasonCode =
  | "IMPLICIT_SEARCH_POLICY_DEPRECATED"
  | "SEARCH_POLICY_CAPABILITY_UNSUPPORTED";

export interface PlannerSearchPolicyResolution {
  requestedPolicy: PlannerSearchPolicy | undefined;
  effectivePolicy: PlannerSearchPolicy;
  selectionSource: PlannerSearchPolicySelectionSource;
  requiredCapabilities: readonly PlannerCapability[];
  supportedCapabilities: readonly PlannerCapability[];
  unsupportedCapabilities: readonly PlannerCapability[];
  compatible: boolean;
  reasonCodes: readonly PlannerSearchPolicyReasonCode[];
  warnings: readonly PlannerSearchPolicyReasonCode[];
}

export const PLANNER_CAPABILITY_REQUIREMENTS: Readonly<
  Record<PlannerCapability, Readonly<PlannerCapabilityRequirement>>
> = Object.freeze({
  ANCHORED_ACCOMPANIMENT: defineCapabilityRequirement({
    capability: "ANCHORED_ACCOMPANIMENT",
    supportedPolicies: ["EXACT_CONSTRUCTIVE"],
    requiredPolicy: "EXACT_CONSTRUCTIVE",
  }),
});

const MIGRATION_DEFAULT_POLICY: PlannerSearchPolicy = "COMPATIBILITY_PRESERVING";

function canonical<T extends string>(values: Iterable<T>): readonly T[] {
  return [...new Set(values)].sort();
}

function defineCapabilityRequirement(
  requirement: PlannerCapabilityRequirement,
): Readonly<PlannerCapabilityRequirement> {
  return Object.freeze({
    ...requirement,
    supportedPolicies: Object.freeze(canonical(requirement.supportedPolicies)),
  });
}

export function isPlannerCapabilitySupported(
  requirement: Readonly<PlannerCapabilityRequirement>,
  policy: PlannerSearchPolicy,
): boolean {
  return requirement.supportedPolicies.includes(policy);
}

export function detectPlannerCapabilities(
  problem: Readonly<PlannerNextProblem>,
): readonly PlannerCapability[] {
  return problem.anchoredAccompaniments !== undefined &&
    problem.anchoredAccompaniments.length > 0
    ? ["ANCHORED_ACCOMPANIMENT"]
    : [];
}

export function resolvePlannerSearchPolicy(
  problem: Readonly<PlannerNextProblem>,
): PlannerSearchPolicyResolution {
  const requestedPolicy = problem.searchPolicy;
  const effectivePolicy = requestedPolicy ?? MIGRATION_DEFAULT_POLICY;
  const requiredCapabilities = canonical(detectPlannerCapabilities(problem));
  const supportedCapabilities = canonical(
    requiredCapabilities.filter(
      (capability) =>
        isPlannerCapabilitySupported(
          PLANNER_CAPABILITY_REQUIREMENTS[capability],
          effectivePolicy,
        ),
    ),
  );
  const unsupportedCapabilities = canonical(
    requiredCapabilities.filter(
      (capability) =>
        !isPlannerCapabilitySupported(
          PLANNER_CAPABILITY_REQUIREMENTS[capability],
          effectivePolicy,
        ),
    ),
  );
  const warnings = canonical<PlannerSearchPolicyReasonCode>(
    requestedPolicy === undefined ? ["IMPLICIT_SEARCH_POLICY_DEPRECATED"] : [],
  );
  const reasonCodes = canonical<PlannerSearchPolicyReasonCode>(
    unsupportedCapabilities.length > 0
      ? ["SEARCH_POLICY_CAPABILITY_UNSUPPORTED"]
      : [],
  );

  return {
    requestedPolicy,
    effectivePolicy,
    selectionSource: requestedPolicy === undefined ? "MIGRATION_DEFAULT" : "EXPLICIT",
    requiredCapabilities,
    supportedCapabilities,
    unsupportedCapabilities,
    compatible: unsupportedCapabilities.length === 0,
    reasonCodes,
    warnings,
  };
}
