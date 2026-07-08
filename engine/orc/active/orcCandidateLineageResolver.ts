export interface ORCCandidateLineageResolution {
  candidateFamilies: string[];
  candidateIds: string[];
  baseCandidateIds: string[];
  containsMacroProductionWaveDayShape: boolean;
  containsMacroMainZoneBlockRelayout: boolean;
  containsProductionWaveDependencyBundle: boolean;
  containsBaselineOverlapRepair: boolean;
  containsStrategyCandidate: boolean;
  primaryFamily: string | null;
  compositeFamily: boolean;
  readOnly: true;
}

const FAMILY_BY_MARKER: Array<[string, string]> = [
  ["macro-production-wave-day-shape", "macro-production-wave-day-shape"],
  ["macro-main-zone-block-relayout", "macro-main-zone-block-relayout"],
  ["production-wave-dependency-bundle", "production-wave-dependency-bundle"],
  ["baseline-overlap-repair", "baseline-overlap-repair"],
  ["strategy", "strategy-candidate"],
  ["critical-resource-idle-compression", "critical-resource-idle-compression"],
  ["post-repair-main-zone-continuity", "post-repair-main-zone-continuity"],
];

function uniq<T>(values: T[]): T[] { return [...new Set(values)].sort(); }

function normalizeParts(...ids: Array<string | null | undefined>): string[] {
  return ids.flatMap((id) => typeof id === "string" ? id.split("+") : [])
    .map((id) => id.trim()).filter(Boolean);
}

function familyOf(candidateId: string): string {
  const normalized = candidateId.startsWith("candidate:") ? candidateId.slice("candidate:".length) : candidateId;
  for (const [marker, family] of FAMILY_BY_MARKER) if (normalized.includes(marker)) return family;
  const [first] = normalized.split(":");
  return first || "unknown";
}

export function resolveORCCandidateLineage(input: { candidateId?: string | null; simulatedStateId?: string | null; candidateStateId?: string | null }): ORCCandidateLineageResolution {
  const candidateIds = uniq(normalizeParts(input.candidateId, input.candidateStateId));
  const baseCandidateIds = uniq(candidateIds.filter((id) => id.startsWith("candidate:")));
  const families = uniq(candidateIds.map(familyOf).filter((family) => family !== "unknown"));
  return {
    candidateFamilies: families,
    candidateIds,
    baseCandidateIds,
    containsMacroProductionWaveDayShape: families.includes("macro-production-wave-day-shape"),
    containsMacroMainZoneBlockRelayout: families.includes("macro-main-zone-block-relayout"),
    containsProductionWaveDependencyBundle: families.includes("production-wave-dependency-bundle"),
    containsBaselineOverlapRepair: families.includes("baseline-overlap-repair"),
    containsStrategyCandidate: families.includes("strategy-candidate") || candidateIds.some((id) => id.includes("strategy")),
    primaryFamily: families[0] ?? null,
    compositeFamily: families.length > 1 || candidateIds.length > 1,
    readOnly: true,
  };
}
