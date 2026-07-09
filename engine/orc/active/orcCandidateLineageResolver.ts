export interface ORCCandidateLineageResolution {
  candidateFamilies: string[];
  candidateIds: string[];
  baseCandidateIds: string[];
  wrapperIds: string[];
  containsMacroProductionWaveDayShape: boolean;
  containsMacroMainZoneBlockRelayout: boolean;
  containsProductionWaveDependencyBundle: boolean;
  containsBaselineOverlapRepair: boolean;
  containsStrategyCandidate: boolean;
  primaryFamily: string | null;
  compositeFamily: boolean;
  compositeReason: "multiple-base-candidates" | "multiple-families" | null;
  readOnly: true;
}

const FAMILY_BY_MARKER: Array<[string, string]> = [
  ["macro-production-wave-day-shape", "macro-production-wave-day-shape"],
  ["macro-main-zone-block-relayout", "macro-main-zone-block-relayout"],
  ["production-wave-dependency-bundle", "production-wave-dependency-bundle"],
  ["baseline-overlap-repair", "baseline-overlap-repair"],
  ["critical-resource-idle-compression", "critical-resource-idle-compression"],
  ["post-repair-main-zone-continuity", "post-repair-main-zone-continuity"],
  ["strategy", "strategy-candidate"],
];

const WRAPPER_PREFIXES = [
  "evidence:orc-ranking-engine:operational-value:",
  "orc-ranking-engine:operational-value:",
  "orc-simulation:simulated-state:",
  "orc-transformation:candidate-state:",
  "candidate:partial-plan:",
];

function uniq<T>(values: T[]): T[] { return [...new Set(values)].sort(); }

function familyOf(candidateId: string): string {
  const normalized = candidateId.startsWith("candidate:") ? candidateId.slice("candidate:".length) : candidateId;
  for (const [marker, family] of FAMILY_BY_MARKER) if (normalized.includes(marker)) return family;
  const [first] = normalized.split(":");
  return first || "unknown";
}

function stripWrappers(part: string, wrappers: Set<string>): string {
  let current = part.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of WRAPPER_PREFIXES) {
      if (current.startsWith(prefix)) {
        wrappers.add(prefix.slice(0, -1));
        current = current.slice(prefix.length);
        changed = true;
      }
    }
  }
  return current;
}

function extractBaseCandidatesFromId(value: string | null | undefined, wrappers: Set<string>): { candidateIds: string[]; baseCandidateIds: string[] } {
  if (typeof value !== "string" || value.trim() === "") return { candidateIds: [], baseCandidateIds: [] };
  const candidateIds: string[] = [];
  const baseCandidateIds: string[] = [];
  for (const rawPart of value.split("+")) {
    const part = stripWrappers(rawPart, wrappers);
    if (!part) continue;
    candidateIds.push(part);
    if (part.startsWith("candidate:")) baseCandidateIds.push(part);
    else {
      const idx = part.indexOf("candidate:");
      if (idx >= 0) baseCandidateIds.push(part.slice(idx));
    }
  }
  return { candidateIds, baseCandidateIds };
}

export function resolveORCCandidateLineage(input: { candidateId?: string | null; simulatedStateId?: string | null; candidateStateId?: string | null }): ORCCandidateLineageResolution {
  const wrappers = new Set<string>();
  const extracted = [input.candidateId, input.candidateStateId, input.simulatedStateId].map((id) => extractBaseCandidatesFromId(id, wrappers));
  const candidateIds = uniq(extracted.flatMap((x) => x.candidateIds));
  const baseCandidateIds = uniq(extracted.flatMap((x) => x.baseCandidateIds));
  const realCandidates = baseCandidateIds.length ? baseCandidateIds : candidateIds;
  const families = uniq(realCandidates.map(familyOf).filter((family) => family !== "unknown"));
  const multipleFamilies = families.length > 1;
  const multipleBaseCandidates = baseCandidateIds.length > 1;
  const compositeReason = multipleFamilies ? "multiple-families" : multipleBaseCandidates ? "multiple-base-candidates" : null;
  return {
    candidateFamilies: families,
    candidateIds,
    baseCandidateIds,
    wrapperIds: uniq([...wrappers]),
    containsMacroProductionWaveDayShape: families.includes("macro-production-wave-day-shape"),
    containsMacroMainZoneBlockRelayout: families.includes("macro-main-zone-block-relayout"),
    containsProductionWaveDependencyBundle: families.includes("production-wave-dependency-bundle"),
    containsBaselineOverlapRepair: families.includes("baseline-overlap-repair"),
    containsStrategyCandidate: families.includes("strategy-candidate") || realCandidates.some((id) => id.includes("strategy")),
    primaryFamily: families[0] ?? null,
    compositeFamily: compositeReason != null,
    compositeReason,
    readOnly: true,
  };
}
