import type { Candidate, CognitiveState, Evidence, SearchSpace } from "../contracts";
import { shouldSkipCandidate, shouldSkipSearchSpace } from "../cognitive/cognitiveFeedback";
import { remainingBudget } from "../cognitive/reasoningBudget";

export interface StrategyCandidateResult {
  candidates: Candidate[];
  evidence: Evidence[];
  summary: {
    generatedCandidates: number;
    discardedEquivalentCandidates: number;
    strategyTypes: number;
  };
}

const MAX_CANDIDATES_PER_SEARCH_SPACE = 3;

type StrategyDefinition = {
  strategy: string;
  family: string;
  transformationHints: string[];
  impact: string;
  baseConfidence: number;
  cost: "low" | "medium" | "high";
};

const STRATEGIES: StrategyDefinition[] = [
  { strategy: "COMPACT_REGION", family: "compaction", transformationHints: ["COMPACT", "PACK", "DENS"], impact: "compact-affected-region", baseConfidence: 0.66, cost: "low" },
  { strategy: "CLOSE_MAIN_FLOW_GAP", family: "continuity", transformationHints: ["MOVE", "FLOW", "CHAIN"], impact: "improve-operational-continuity", baseConfidence: 0.64, cost: "low" },
  { strategy: "REDUCE_RESOURCE_PRESSURE", family: "pressure-relief", transformationHints: ["RESOURCE", "REASSIGN", "PRESSURE"], impact: "relieve-local-pressure", baseConfidence: 0.64, cost: "low" },
  { strategy: "SCHEDULE_PENDING_TASKS", family: "wait-reduction", transformationHints: ["PENDING", "SCHEDULE", "WAIT"], impact: "reduce-unplanned-waiting", baseConfidence: 0.72, cost: "medium" },
  { strategy: "REORDER_LOCAL_SEQUENCE", family: "local-reorganization", transformationHints: ["REORDER", "SEQUENCE", "LOCAL"], impact: "reorganize-local-ordering", baseConfidence: 0.64, cost: "low" },
  { strategy: "REDUCE_LOCK_PRESSURE", family: "pressure-relief", transformationHints: ["LOCK", "CONSTRAIN"], impact: "relieve-locked-region-pressure", baseConfidence: 0.58, cost: "high" },
];

const FALLBACK_FAMILIES = ["continuity", "compaction", "local-reorganization"];

const metadataString = (value: unknown, fallback: string): string => (typeof value === "string" && value.length > 0 ? value : fallback);
const metadataStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9:_-]/g, "-");

const uniqueStable = <T>(values: T[]): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

function strategiesFor(searchSpace: SearchSpace): StrategyDefinition[] {
  const allowed = metadataStrings(searchSpace.metadata.allowedTransformations).map((value) => value.toUpperCase());
  const derived = allowed
    .flatMap((item) => STRATEGIES.filter((definition) => definition.transformationHints.some((hint) => item.includes(hint))))
    .filter((definition, index, all) => all.findIndex((candidate) => candidate.strategy === definition.strategy) === index);
  if (derived.length > 0) return derived.slice(0, MAX_CANDIDATES_PER_SEARCH_SPACE);
  return FALLBACK_FAMILIES.map((family) => STRATEGIES.find((definition) => definition.family === family)).filter((definition): definition is StrategyDefinition => definition != null).slice(0, MAX_CANDIDATES_PER_SEARCH_SPACE);
}

function candidateKey(searchSpace: SearchSpace, definition: StrategyDefinition): string {
  const sourceOpportunityId = metadataString(searchSpace.metadata.sourceOpportunityId, searchSpace.id);
  const region = metadataString(searchSpace.metadata.affectedRegion, "unknown-region");
  const tasks = [...new Set(searchSpace.taskIds)].sort((a, b) => a - b).join(",");
  return `${sourceOpportunityId}|${region}|${definition.family}|${definition.strategy}|${tasks}`;
}

function candidateFor(searchSpace: SearchSpace, definition: StrategyDefinition, evidenceId: string, candidateId: string, cognitiveState: CognitiveState): Candidate {
  const sourceOpportunityId = metadataString(searchSpace.metadata.sourceOpportunityId, searchSpace.id);
  const sourceOpportunityKind = metadataString(searchSpace.metadata.sourceOpportunityKind, "UNKNOWN");
  const region = metadataString(searchSpace.metadata.affectedRegion, "unknown-region");
  const confidence = Math.max(0.1, Math.min(0.95, Number((definition.baseConfidence + Math.min(searchSpace.taskIds.length, 5) * 0.02).toFixed(2))));
  const repeatedByCognitiveMemory = shouldSkipCandidate(cognitiveState, candidateId);
  return {
    id: candidateId,
    state: { status: "draft", reason: "read-only strategy ORC SEE candidate", evidenceIds: [evidenceId], metadata: { readOnly: true } },
    assignments: [],
    operationalValues: [],
    evidenceIds: [evidenceId],
    metadata: {
      readOnly: true,
      abstract: true,
      strategyCandidate: true,
      executesTransformations: false,
      searchSpaceId: searchSpace.id,
      sourceOpportunityId,
      sourceOpportunityKind,
      strategy: definition.strategy,
      strategyFamily: definition.family,
      affectedRegion: region,
      taskIds: [...searchSpace.taskIds],
      confidence,
      expectedImpact: definition.impact,
      estimatedCost: searchSpace.taskIds.length > 8 && definition.cost === "low" ? "medium" : definition.cost,
      generationReason: `Strategy candidate generated for ${definition.family} from search space ${searchSpace.id}`,
      cognitiveFeedback: { repeatedByCognitiveMemory, potentialOmittable: repeatedByCognitiveMemory, observationalOnly: true },
    },
  };
}

function evidence(id: string, kind: string, subjectId: string, data: Record<string, unknown>): Evidence {
  return { id, source: "orc-see", kind, subjectId, createdAt: null, data: data as Record<string, never> };
}

export function buildStrategyCandidates(searchSpaces: SearchSpace[], cognitiveState: CognitiveState): StrategyCandidateResult {
  const candidates: Candidate[] = [];
  const emittedEvidence: Evidence[] = [];
  const seen = new Set<string>();
  const families = new Set<string>();
  let discardedEquivalentCandidates = 0;
  const maxCandidates = remainingBudget(cognitiveState.reasoningBudget).candidates;

  for (const searchSpace of [...(searchSpaces ?? [])]) {
    if (shouldSkipSearchSpace(cognitiveState, searchSpace.id)) {
      emittedEvidence.push(evidence(`evidence:orc-see:strategy-candidate:discarded:exhausted:${searchSpace.id}`, "strategy-candidate-discarded", searchSpace.id, { searchSpaceId: searchSpace.id, reason: "exhausted-region", readOnly: true }));
      continue;
    }
    let producedForSpace = 0;
    for (const definition of strategiesFor(searchSpace)) {
      const key = candidateKey(searchSpace, definition);
      const sourceOpportunityId = metadataString(searchSpace.metadata.sourceOpportunityId, searchSpace.id);
      const region = metadataString(searchSpace.metadata.affectedRegion, "unknown-region");
      if (candidates.length >= maxCandidates || producedForSpace >= MAX_CANDIDATES_PER_SEARCH_SPACE) {
        emittedEvidence.push(evidence(`evidence:orc-see:strategy-candidate:discarded:budget:${searchSpace.id}:${definition.strategy}`, "strategy-candidate-discarded", searchSpace.id, { searchSpaceId: searchSpace.id, strategy: definition.strategy, strategyFamily: definition.family, reason: "insufficient-candidate-budget", readOnly: true }));
        break;
      }
      if (seen.has(key)) {
        discardedEquivalentCandidates += 1;
        emittedEvidence.push(evidence(`evidence:orc-see:strategy-candidate:discarded:equivalent:${searchSpace.id}:${definition.strategy}`, "strategy-candidate-discarded", searchSpace.id, { searchSpaceId: searchSpace.id, strategy: definition.strategy, strategyFamily: definition.family, reason: "equivalent-candidate", equivalenceKey: key, readOnly: true }));
        continue;
      }
      seen.add(key);
      families.add(definition.family);
      const candidateId = `orc-see:strategy-candidate:${sanitize(sourceOpportunityId)}:${sanitize(region)}:${definition.strategy}`;
      if (shouldSkipCandidate(cognitiveState, candidateId)) {
        emittedEvidence.push(evidence(`evidence:orc-see:strategy-candidate:discarded:cognitive:${searchSpace.id}:${definition.strategy}`, "strategy-candidate-discarded", searchSpace.id, { searchSpaceId: searchSpace.id, candidateId, strategy: definition.strategy, strategyFamily: definition.family, reason: "discarded-candidate-memory", readOnly: true }));
        continue;
      }
      const evidenceId = `evidence:orc-see:strategy-candidate:${sanitize(sourceOpportunityId)}:${sanitize(region)}:${definition.strategy}`;
      const candidate = candidateFor(searchSpace, definition, evidenceId, candidateId, cognitiveState);
      candidates.push(candidate);
      producedForSpace += 1;
      emittedEvidence.push(evidence(evidenceId, "strategy-candidate-generated", candidateId, { candidateId, searchSpaceId: searchSpace.id, opportunityId: sourceOpportunityId, strategy: definition.strategy, strategyFamily: definition.family, diversity: { achievedFamilies: families.size, equivalenceKey: key }, discardedEquivalentCandidates, readOnly: true }));
    }
  }

  emittedEvidence.push(evidence("evidence:orc-see:strategy-candidate:diversity-summary", "strategy-candidate-diversity", "orc-see:strategy-candidates", { generatedCandidates: candidates.length, discardedEquivalentCandidates, strategyFamilies: families.size, candidateIds: candidates.map((candidate) => candidate.id), readOnly: true }));
  return { candidates, evidence: emittedEvidence, summary: { generatedCandidates: candidates.length, discardedEquivalentCandidates, strategyTypes: families.size } };
}
