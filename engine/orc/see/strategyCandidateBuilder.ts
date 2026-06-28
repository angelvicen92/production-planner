import type { AdaptiveSearchSpaceProfile, Candidate, CandidateStrategyType, CandidateTransformation, CognitiveState, Evidence, OperationalState, OpportunityPropagation, SearchSpace } from "../contracts";
import type { OperationalGoal } from "../search/operationalGoalBuilder";
import { shouldSkipCandidate, shouldSkipSearchSpace } from "../cognitive/cognitiveFeedback";
import { remainingBudget } from "../cognitive/reasoningBudget";

export interface StrategyCandidateResult {
  candidates: Candidate[];
  evidence: Evidence[];
  summary: {
    generatedCandidates: number;
    discardedEquivalentCandidates: number;
    strategyTypes: number;
    generatedVariants: number;
    discardedVariants: number;
  };
}

const MAX_CANDIDATES_PER_SEARCH_SPACE = 3;

const DEFAULT_COGNITIVE_STATE: CognitiveState = {
  exploredOpportunityIds: [],
  exhaustedSearchSpaceIds: [],
  discardedCandidateIds: [],
  simulatedCandidateIds: [],
  committedCandidateIds: [],
  temporaryKnowledge: {},
  confidence: 1,
  createdAt: null,
  reasoningBudget: {
    maxOpportunities: 20,
    maxSearchSpaces: 10,
    maxCandidates: 20,
    maxSimulations: 20,
    consumedOpportunities: 0,
    consumedSearchSpaces: 0,
    consumedCandidates: 0,
    consumedSimulations: 0,
  },
};

type StrategyVariant = {
  variantId: string;
  variantIndex: number;
  variantReason: string;
  assignmentMode: "base" | "advance" | "delay" | "alternate-resource" | "alternate-space";
};

type StrategyDefinition = {
  strategy: string;
  strategyType: CandidateStrategyType;
  family: string;
  transformationHints: string[];
  impact: string;
  baseConfidence: number;
  cost: "low" | "medium" | "high";
  transformationPlan: Array<{ kind: CandidateTransformation["kind"]; role: CandidateTransformation["coordinationRole"]; reason: string }>;
};

const STRATEGIES: StrategyDefinition[] = [
  { strategy: "CLOSE_MAIN_FLOW_GAP", strategyType: "close_gap", family: "continuity", transformationHints: ["GAP", "MOVE", "FLOW"], impact: "improve-operational-continuity", baseConfidence: 0.64, cost: "low", transformationPlan: [{ kind: "MOVE_CHAIN", role: "primary", reason: "Close the visible flow gap." }, { kind: "REORDER_REGION", role: "supporting", reason: "Keep the local sequence coherent after the gap closure." }] },
  { strategy: "COMPACT_REGION", strategyType: "compact_resource", family: "compaction", transformationHints: ["COMPACT", "PACK", "DENS", "RESOURCE"], impact: "compact-affected-resource-agenda", baseConfidence: 0.66, cost: "low", transformationPlan: [{ kind: "COMPACT_REGION", role: "primary", reason: "Compact idle intervals in the affected region." }, { kind: "REORDER_REGION", role: "supporting", reason: "Preserve feasible local ordering while compacting." }] },
  { strategy: "REORDER_LOCAL_SEQUENCE", strategyType: "advance_chain", family: "chain-advance", transformationHints: ["CHAIN", "DEPEND", "MOVE"], impact: "advance-dependent-chain", baseConfidence: 0.63, cost: "medium", transformationPlan: [{ kind: "MOVE_CHAIN", role: "primary", reason: "Advance the dependent chain as a coordinated block." }, { kind: "REORDER_REGION", role: "supporting", reason: "Protect predecessor/successor sequence around the chain." }] },
  { strategy: "SCHEDULE_PENDING_TASKS", strategyType: "reduce_wait", family: "wait-reduction", transformationHints: ["PENDING", "SCHEDULE", "WAIT"], impact: "reduce-unplanned-waiting", baseConfidence: 0.72, cost: "medium", transformationPlan: [{ kind: "SCHEDULE_PENDING", role: "primary", reason: "Insert pending work into the feasible window." }, { kind: "COMPACT_REGION", role: "supporting", reason: "Recover slack created around inserted work." }] },
  { strategy: "REDUCE_RESOURCE_PRESSURE", strategyType: "relieve_pressure", family: "pressure-relief", transformationHints: ["RESOURCE", "REASSIGN", "PRESSURE", "LOCK"], impact: "relieve-local-pressure", baseConfidence: 0.64, cost: "medium", transformationPlan: [{ kind: "REASSIGN_RESOURCE", role: "primary", reason: "Move load away from the pressured resource." }, { kind: "MOVE_CHAIN", role: "supporting", reason: "Move the affected chain consistently with the reassignment." }] },
  { strategy: "REDUCE_LOCK_PRESSURE", strategyType: "protect_main_flow", family: "flow-protection", transformationHints: ["FLOW", "LOCK", "CONSTRAIN", "MAIN"], impact: "protect-main-flow", baseConfidence: 0.61, cost: "high", transformationPlan: [{ kind: "REORDER_REGION", role: "protective", reason: "Keep critical main-flow tasks stable." }, { kind: "COMPACT_REGION", role: "supporting", reason: "Use local slack before disrupting the main flow." }] },
];

const FALLBACK_FAMILIES = ["continuity", "compaction", "chain-advance", "wait-reduction", "pressure-relief", "flow-protection"];

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

function candidateKey(searchSpace: SearchSpace, definition: StrategyDefinition, variant: StrategyVariant, assignments: readonly CandidateAssignment[]): string {
  const sourceOpportunityId = metadataString(searchSpace.metadata.sourceOpportunityId, searchSpace.id);
  const region = metadataString(searchSpace.metadata.affectedRegion, "unknown-region");
  const tasks = [...new Set(searchSpace.taskIds)].sort((a, b) => a - b).join(",");
  const assignmentSignature = assignments.length > 0
    ? assignments
      .map((assignment) => `${assignment.taskId}:${assignment.startPlanned ?? ""}:${assignment.endPlanned ?? ""}:${assignment.spaceId ?? ""}:${[...assignment.resourceIds].sort((a, b) => a - b).join("+")}`)
      .sort()
      .join("|")
    : `abstract:${tasks}`;
  return `${sourceOpportunityId}|${region}|${definition.family}|${definition.strategy}|${assignmentSignature}`;
}

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

function buildTransformations(searchSpace: SearchSpace, definition: StrategyDefinition): CandidateTransformation[] {
  const taskIds = [...new Set(searchSpace.taskIds)].sort((a, b) => a - b);
  return definition.transformationPlan.map((step) => ({ kind: step.kind, reason: step.reason, taskIds, coordinationRole: step.role }));
}


type CandidateAssignment = Candidate["assignments"][number];

interface AssignmentSynthesisResult {
  readonly assignments: CandidateAssignment[];
  readonly discardedTasks: Array<{ taskId: number; reason: string }>;
  readonly synthesisReason: string;
}

interface StrategyVariantBuildResult {
  readonly variant: StrategyVariant;
  readonly assignments: CandidateAssignment[];
  readonly discarded: boolean;
  readonly discardReason: string | null;
}

const sortedUniqueTaskIds = (taskIds: readonly number[]): number[] => [...new Set(taskIds)].sort((a, b) => a - b);
const sameResources = (left: readonly number[], right: readonly number[]): boolean => left.length === right.length && left.every((value, index) => value === right[index]);
const hasLock = (state: OperationalState, taskId: number, lockType: OperationalState["locks"][number]["lockType"]): boolean => state.locks.some((lock) => lock.taskId === taskId && lock.lockType === lockType);

function changedFieldsFor(planningEntry: OperationalState["planning"][number] | undefined, assignment: CandidateAssignment): string[] {
  const changed: string[] = [];
  if (assignment.startPlanned != null && planningEntry?.startPlanned !== assignment.startPlanned) changed.push("startPlanned");
  if (assignment.endPlanned != null && planningEntry?.endPlanned !== assignment.endPlanned) changed.push("endPlanned");
  if (assignment.spaceId !== undefined && planningEntry?.spaceId !== assignment.spaceId) changed.push("spaceId");
  if (!sameResources(planningEntry?.assignedResourceIds ?? [], assignment.resourceIds)) changed.push("resourceIds");
  return changed;
}

function synthesizeAssignments(searchSpace: SearchSpace, definition: StrategyDefinition, context: StrategyContext): AssignmentSynthesisResult {
  const state = context.operationalState;
  const discardedTasks: AssignmentSynthesisResult["discardedTasks"] = [];
  if (state == null) {
    return { assignments: [], discardedTasks: sortedUniqueTaskIds(searchSpace.taskIds).map((taskId) => ({ taskId, reason: "operational-state-unavailable" })), synthesisReason: "No OperationalState was supplied, so the strategy remains abstract." };
  }

  const assignments: CandidateAssignment[] = [];
  for (const taskId of sortedUniqueTaskIds(searchSpace.taskIds)) {
    const task = state.tasks.find((item) => item.id === taskId);
    const planningEntry = state.planning.find((item) => item.taskId === taskId);
    if (task == null) { discardedTasks.push({ taskId, reason: "task-not-found" }); continue; }
    if (task.status === "done" || task.status === "in_progress") { discardedTasks.push({ taskId, reason: `task-status-protected:${task.status}` }); continue; }
    if (hasLock(state, taskId, "full")) { discardedTasks.push({ taskId, reason: "lock-protected:full" }); continue; }

    const assignment: CandidateAssignment = {
      taskId,
      startPlanned: task.startPlanned ?? planningEntry?.startPlanned ?? null,
      endPlanned: task.endPlanned ?? planningEntry?.endPlanned ?? null,
      spaceId: task.spaceId ?? planningEntry?.spaceId ?? null,
      resourceIds: [...(task.assignedResourceIds ?? planningEntry?.assignedResourceIds ?? [])].sort((a, b) => a - b),
    };
    const changedFields = changedFieldsFor(planningEntry, assignment);
    if (changedFields.length === 0) { discardedTasks.push({ taskId, reason: "assignment-matches-existing-planning" }); continue; }
    if ((changedFields.includes("startPlanned") || changedFields.includes("endPlanned")) && hasLock(state, taskId, "time")) { discardedTasks.push({ taskId, reason: "lock-protected:time" }); continue; }
    if (changedFields.includes("spaceId") && hasLock(state, taskId, "space")) { discardedTasks.push({ taskId, reason: "lock-protected:space" }); continue; }
    if (changedFields.includes("resourceIds") && hasLock(state, taskId, "resource")) { discardedTasks.push({ taskId, reason: "lock-protected:resource" }); continue; }
    assignments.push(assignment);
  }

  return { assignments, discardedTasks, synthesisReason: assignments.length > 0 ? `Synthesized ${assignments.length} ${definition.strategyType} assignment(s) from OperationalState/SearchSpace task data.` : `No safe ${definition.strategyType} assignment could be synthesized from the available task data.` };
}


const BASE_VARIANT: StrategyVariant = { variantId: "base", variantIndex: 0, variantReason: "Base deterministic realization of the strategy.", assignmentMode: "base" };

const minutesFromTime = (value: string | null | undefined): number | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match == null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
};

const timeFromMinutes = (value: number): string => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

const shiftAssignments = (assignments: readonly CandidateAssignment[], deltaMinutes: number, state: OperationalState): CandidateAssignment[] | null => {
  const dayStart = minutesFromTime(state.workDay?.start) ?? 0;
  const dayEnd = minutesFromTime(state.workDay?.end) ?? 24 * 60;
  const shifted: CandidateAssignment[] = [];
  for (const assignment of assignments) {
    const start = minutesFromTime(assignment.startPlanned);
    const end = minutesFromTime(assignment.endPlanned);
    if (start == null || end == null) return null;
    const nextStart = start + deltaMinutes;
    const nextEnd = end + deltaMinutes;
    if (nextStart < dayStart || nextEnd > dayEnd || nextStart >= nextEnd) return null;
    shifted.push({ ...assignment, startPlanned: timeFromMinutes(nextStart), endPlanned: timeFromMinutes(nextEnd), resourceIds: [...assignment.resourceIds] });
  }
  return shifted;
};

const withAlternateResource = (assignments: readonly CandidateAssignment[], state: OperationalState): CandidateAssignment[] | null => {
  const available = [...state.resources].filter((resource) => resource.isAvailable !== false).map((resource) => resource.id).sort((a, b) => a - b);
  const mapped = assignments.map((assignment) => {
    const alternative = available.find((resourceId) => !assignment.resourceIds.includes(resourceId));
    return alternative == null ? null : { ...assignment, resourceIds: [alternative] };
  });
  return mapped.every((assignment): assignment is CandidateAssignment => assignment != null) ? mapped : null;
};

const withAlternateSpace = (assignments: readonly CandidateAssignment[], state: OperationalState): CandidateAssignment[] | null => {
  const spaces = Object.keys(state.spaces.nameById ?? {}).map(Number).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const mapped: Array<CandidateAssignment | null> = assignments.map((assignment) => {
    const alternative = spaces.find((spaceId) => spaceId !== assignment.spaceId);
    return alternative == null ? null : { ...assignment, spaceId: alternative, resourceIds: [...assignment.resourceIds] };
  });
  return mapped.every((assignment): assignment is CandidateAssignment => assignment != null) ? mapped : null;
};

function variantsFor(searchSpace: SearchSpace, synthesis: AssignmentSynthesisResult, context: StrategyContext): StrategyVariantBuildResult[] {
  const baseAssignments = synthesis.assignments.map((assignment) => ({ ...assignment, resourceIds: [...assignment.resourceIds] }));
  const results: StrategyVariantBuildResult[] = [{ variant: BASE_VARIANT, assignments: baseAssignments, discarded: false, discardReason: null }];
  const state = context.operationalState;
  if (state == null || baseAssignments.length === 0) return results;
  const candidates: Array<{ variant: StrategyVariant; assignments: CandidateAssignment[] | null }> = [
    { variant: { variantId: "advance-15", variantIndex: 1, variantReason: "Advance all synthesized assignments by 15 minutes within the work day.", assignmentMode: "advance" }, assignments: shiftAssignments(baseAssignments, -15, state) },
    { variant: { variantId: "delay-15", variantIndex: 2, variantReason: "Delay all synthesized assignments by 15 minutes within the work day.", assignmentMode: "delay" }, assignments: shiftAssignments(baseAssignments, 15, state) },
    { variant: { variantId: "alternate-resource", variantIndex: 3, variantReason: "Use the first deterministic available alternative resource.", assignmentMode: "alternate-resource" }, assignments: withAlternateResource(baseAssignments, state) },
    { variant: { variantId: "alternate-space", variantIndex: 4, variantReason: "Use the first deterministic alternative space.", assignmentMode: "alternate-space" }, assignments: withAlternateSpace(baseAssignments, state) },
  ];
  for (const candidate of candidates) {
    results.push(candidate.assignments == null
      ? { variant: candidate.variant, assignments: [], discarded: true, discardReason: "variant-not-valid-for-search-space" }
      : { variant: candidate.variant, assignments: candidate.assignments, discarded: false, discardReason: null });
  }
  return results;
}

function candidateFor(searchSpace: SearchSpace, definition: StrategyDefinition, variant: StrategyVariant, synthesis: AssignmentSynthesisResult, evidenceId: string, candidateId: string, cognitiveState: CognitiveState, context: StrategyContext): Candidate {
  const sourceOpportunityId = metadataString(searchSpace.metadata.sourceOpportunityId, searchSpace.id);
  const sourceOpportunityKind = metadataString(searchSpace.metadata.sourceOpportunityKind, "UNKNOWN");
  const region = metadataString(searchSpace.metadata.affectedRegion, "unknown-region");
  const profile = context.adaptiveSearchSpaceProfiles.get(sourceOpportunityId);
  const propagation = context.opportunityPropagation.get(sourceOpportunityId);
  const goal = context.operationalGoalByOpportunityId.get(sourceOpportunityId);
  const expectedOperationalImpact = round((profile?.expectedExplorationValue ?? 1) + (propagation?.estimatedConflictReduction ?? 0) + (propagation?.estimatedFreedomGain ?? 0));
  const transformations = buildTransformations(searchSpace, definition);
  const confidence = Math.max(0.1, Math.min(0.95, Number((definition.baseConfidence + Math.min(searchSpace.taskIds.length, 5) * 0.02 + Math.min(expectedOperationalImpact, 10) * 0.005).toFixed(2))));
  const repeatedByCognitiveMemory = shouldSkipCandidate(cognitiveState, candidateId);
  const executable = synthesis.assignments.length > 0;
  return {
    id: candidateId,
    state: { status: "draft", reason: "read-only strategy ORC SEE candidate", evidenceIds: [evidenceId], metadata: { readOnly: true } },
    assignments: synthesis.assignments.map((assignment) => ({ ...assignment, resourceIds: [...assignment.resourceIds] })),
    operationalValues: [],
    evidenceIds: [evidenceId],
    metadata: {
      readOnly: true,
      abstract: !executable,
      strategyCandidate: true,
      executesTransformations: executable,
      searchSpaceId: searchSpace.id,
      sourceOpportunityId,
      sourceOpportunityKind,
      strategy: definition.strategy,
      strategyId: definition.strategy,
      variantId: variant.variantId,
      variantIndex: variant.variantIndex,
      variantReason: variant.variantReason,
      parentStrategy: definition.strategy,
      strategyType: definition.strategyType,
      originOpportunity: sourceOpportunityId,
      synthesisReason: synthesis.synthesisReason,
      assignmentSynthesis: { strategyType: definition.strategyType, originOpportunity: sourceOpportunityId, abstract: !executable, executable, generatedAssignmentCount: synthesis.assignments.length, discardedTaskCount: synthesis.discardedTasks.length, discardedTasks: synthesis.discardedTasks, assignments: synthesis.assignments },
      strategyFamily: definition.family,
      operationalGoalId: goal?.id ?? null,
      operationalGoalSignature: goal?.signature ?? [],
      operationalGoalAggregateOperationalReasoningScore: goal?.aggregateOperationalReasoningScore ?? null,
      affectedRegion: region,
      taskIds: [...searchSpace.taskIds],
      confidence,
      expectedImpact: definition.impact,
      expectedOperationalImpact,
      transformations,
      candidateStrategy: { strategyId: definition.strategy, variantId: variant.variantId, variantIndex: variant.variantIndex, variantReason: variant.variantReason, parentStrategy: definition.strategy, strategyType: definition.strategyType, originOpportunity: sourceOpportunityId, expectedOperationalImpact, transformations, generationReason: `Generated ${definition.strategyType} strategy variant ${variant.variantId} from ${searchSpace.id} using OCM/OPA/adaptive profile and operational-goal context.` },
      estimatedCost: searchSpace.taskIds.length > 8 && definition.cost === "low" ? "medium" : definition.cost,
      generationReason: `Strategy candidate variant ${variant.variantId} generated for ${definition.family} from search space ${searchSpace.id} with ${transformations.length} coordinated transformations`,
      cognitiveFeedback: { repeatedByCognitiveMemory, potentialOmittable: repeatedByCognitiveMemory, observationalOnly: true },
    },
  };
}

function evidence(id: string, kind: string, subjectId: string, data: Record<string, unknown>): Evidence {
  return { id, source: "orc-see", kind, subjectId, createdAt: null, data: data as Record<string, never> };
}

export interface StrategyCandidateBuildOptions {
  readonly candidateBudgetBySearchSpaceId?: Readonly<Record<string, number>> | ReadonlyMap<string, number> | null;
  readonly adaptiveSearchSpaceProfiles?: readonly AdaptiveSearchSpaceProfile[];
  readonly opportunityPropagation?: readonly OpportunityPropagation[];
  readonly operationalState?: OperationalState | null;
  readonly operationalGoals?: readonly OperationalGoal[];
}

interface StrategyContext {
  readonly adaptiveSearchSpaceProfiles: ReadonlyMap<string, AdaptiveSearchSpaceProfile>;
  readonly opportunityPropagation: ReadonlyMap<string, OpportunityPropagation>;
  readonly operationalState: OperationalState | null;
  readonly operationalGoalByOpportunityId: ReadonlyMap<string, OperationalGoal>;
}

const contextFrom = (options: StrategyCandidateBuildOptions): StrategyContext => ({
  adaptiveSearchSpaceProfiles: new Map((options.adaptiveSearchSpaceProfiles ?? []).map((profile) => [profile.opportunityId, profile])),
  opportunityPropagation: new Map((options.opportunityPropagation ?? []).map((propagation) => [propagation.opportunityId, propagation])),
  operationalState: options.operationalState ?? null,
  operationalGoalByOpportunityId: new Map((options.operationalGoals ?? []).flatMap((goal) => goal.opportunityIds.map((opportunityId) => [opportunityId, goal] as const))),
});

const budgetForSearchSpace = (budgetBySearchSpaceId: StrategyCandidateBuildOptions["candidateBudgetBySearchSpaceId"], searchSpaceId: string): number | null => {
  if (budgetBySearchSpaceId == null) return null;
  const raw = budgetBySearchSpaceId instanceof Map ? budgetBySearchSpaceId.get(searchSpaceId) : (budgetBySearchSpaceId as Readonly<Record<string, number>>)[searchSpaceId];
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
};

export function buildStrategyCandidates(searchSpaces: SearchSpace[], cognitiveState: CognitiveState = DEFAULT_COGNITIVE_STATE, options: StrategyCandidateBuildOptions = {}): StrategyCandidateResult {
  const candidates: Candidate[] = [];
  const emittedEvidence: Evidence[] = [];
  const seen = new Set<string>();
  const families = new Set<string>();
  let discardedEquivalentCandidates = 0;
  let generatedVariants = 0;
  let discardedVariants = 0;
  const maxCandidates = remainingBudget(cognitiveState.reasoningBudget).candidates;
  const budgetBySearchSpaceId = options.candidateBudgetBySearchSpaceId ?? null;
  const context = contextFrom(options);

  const orderedSearchSpaces = [...(searchSpaces ?? [])].sort((a, b) => {
    const leftGoal = context.operationalGoalByOpportunityId.get(metadataString(a.metadata.sourceOpportunityId, a.id));
    const rightGoal = context.operationalGoalByOpportunityId.get(metadataString(b.metadata.sourceOpportunityId, b.id));
    const goalDelta = (rightGoal?.aggregateOperationalReasoningScore ?? -1) - (leftGoal?.aggregateOperationalReasoningScore ?? -1);
    return goalDelta || (leftGoal?.id ?? "").localeCompare(rightGoal?.id ?? "") || a.id.localeCompare(b.id);
  });

  for (const searchSpace of orderedSearchSpaces) {
    if (shouldSkipSearchSpace(cognitiveState, searchSpace.id)) {
      emittedEvidence.push(evidence(`evidence:orc-see:strategy-candidate:discarded:exhausted:${searchSpace.id}`, "strategy-candidate-discarded", searchSpace.id, { searchSpaceId: searchSpace.id, reason: "exhausted-region", readOnly: true }));
      continue;
    }
    let producedForSpace = 0;
    const allocatedForSpace = budgetForSearchSpace(budgetBySearchSpaceId, searchSpace.id) ?? MAX_CANDIDATES_PER_SEARCH_SPACE;
    for (const definition of strategiesFor(searchSpace)) {
      const sourceOpportunityId = metadataString(searchSpace.metadata.sourceOpportunityId, searchSpace.id);
      const region = metadataString(searchSpace.metadata.affectedRegion, "unknown-region");
      const baseSynthesis = synthesizeAssignments(searchSpace, definition, context);
      const variants = variantsFor(searchSpace, baseSynthesis, context);
      emittedEvidence.push(evidence(`evidence:orc-see:strategy-candidate:variants:${searchSpace.id}:${definition.strategy}`, "strategy-variants-generated", searchSpace.id, { searchSpaceId: searchSpace.id, strategy: definition.strategy, strategyId: definition.strategy, parentStrategy: definition.strategy, variantsGenerated: variants.length, variants: variants.map((item) => ({ variantId: item.variant.variantId, variantIndex: item.variant.variantIndex, variantReason: item.variant.variantReason, discarded: item.discarded, discardReason: item.discardReason })), readOnly: true }));
      for (const variantResult of variants) {
        const variant = variantResult.variant;
        const variantSuffix = variant.variantId === "base" ? "base" : sanitize(variant.variantId);
        if (variantResult.discarded) {
          emittedEvidence.push(evidence(`evidence:orc-see:strategy-candidate:discarded:variant:${searchSpace.id}:${definition.strategy}:${variantSuffix}`, "strategy-variant-discarded", searchSpace.id, { searchSpaceId: searchSpace.id, strategy: definition.strategy, strategyId: definition.strategy, variantId: variant.variantId, variantIndex: variant.variantIndex, variantReason: variant.variantReason, parentStrategy: definition.strategy, reason: variantResult.discardReason ?? "invalid-variant", readOnly: true }));
          discardedVariants += 1;
          continue;
        }
        if (candidates.length >= maxCandidates || producedForSpace >= allocatedForSpace || producedForSpace >= MAX_CANDIDATES_PER_SEARCH_SPACE) {
          emittedEvidence.push(evidence(`evidence:orc-see:strategy-candidate:discarded:budget:${searchSpace.id}:${definition.strategy}:${variantSuffix}`, "strategy-candidate-discarded", searchSpace.id, { searchSpaceId: searchSpace.id, strategy: definition.strategy, strategyId: definition.strategy, variantId: variant.variantId, variantIndex: variant.variantIndex, variantReason: variant.variantReason, parentStrategy: definition.strategy, strategyFamily: definition.family, reason: "insufficient-candidate-budget", readOnly: true }));
          break;
        }
        const synthesis: AssignmentSynthesisResult = { ...baseSynthesis, assignments: variantResult.assignments.map((assignment) => ({ ...assignment, resourceIds: [...assignment.resourceIds] })), synthesisReason: `${baseSynthesis.synthesisReason} Variant ${variant.variantId}: ${variant.variantReason}` };
        const key = candidateKey(searchSpace, definition, variant, synthesis.assignments);
        if (seen.has(key)) {
          discardedEquivalentCandidates += 1;
          discardedVariants += 1;
          emittedEvidence.push(evidence(`evidence:orc-see:strategy-candidate:discarded:equivalent:${searchSpace.id}:${definition.strategy}:${variantSuffix}`, "strategy-candidate-discarded", searchSpace.id, { searchSpaceId: searchSpace.id, strategy: definition.strategy, strategyId: definition.strategy, variantId: variant.variantId, variantIndex: variant.variantIndex, variantReason: variant.variantReason, parentStrategy: definition.strategy, strategyFamily: definition.family, reason: "equivalent-candidate", equivalenceKey: key, readOnly: true }));
          continue;
        }
        seen.add(key);
        families.add(definition.family);
        const candidateId = `orc-see:strategy-candidate:${sanitize(sourceOpportunityId)}:${sanitize(region)}:${definition.strategy}:${variantSuffix}`;
        if (shouldSkipCandidate(cognitiveState, candidateId)) {
          emittedEvidence.push(evidence(`evidence:orc-see:strategy-candidate:discarded:cognitive:${searchSpace.id}:${definition.strategy}:${variantSuffix}`, "strategy-candidate-discarded", searchSpace.id, { searchSpaceId: searchSpace.id, candidateId, strategy: definition.strategy, strategyId: definition.strategy, variantId: variant.variantId, variantIndex: variant.variantIndex, variantReason: variant.variantReason, parentStrategy: definition.strategy, strategyFamily: definition.family, reason: "discarded-candidate-memory", readOnly: true }));
          continue;
        }
        const evidenceId = `evidence:orc-see:strategy-candidate:${sanitize(sourceOpportunityId)}:${sanitize(region)}:${definition.strategy}:${variantSuffix}`;
        const candidate = candidateFor(searchSpace, definition, variant, synthesis, evidenceId, candidateId, cognitiveState, context);
        candidates.push(candidate);
        producedForSpace += 1;
        generatedVariants += 1;
        emittedEvidence.push(evidence(evidenceId, "strategy-candidate-generated", candidateId, { candidateId, searchSpaceId: searchSpace.id, opportunityId: sourceOpportunityId, strategy: definition.strategy, strategyId: definition.strategy, variantId: variant.variantId, variantIndex: variant.variantIndex, variantReason: variant.variantReason, parentStrategy: definition.strategy, strategyType: definition.strategyType, strategyFamily: definition.family, selectedStrategy: definition.strategyType, originOpportunity: sourceOpportunityId, expectedOperationalImpact: candidate.metadata.expectedOperationalImpact, operationalGoalId: candidate.metadata.operationalGoalId, operationalGoalSignature: candidate.metadata.operationalGoalSignature, plannedTransformations: candidate.metadata.transformations, assignmentSynthesis: candidate.metadata.assignmentSynthesis, assignments: candidate.assignments.map((assignment) => ({ ...assignment, resourceIds: [...assignment.resourceIds] })), synthesisReason: candidate.metadata.synthesisReason, generationReason: candidate.metadata.generationReason, diversity: { achievedFamilies: families.size, equivalenceKey: key }, discardedEquivalentCandidates, acceptedVariant: { variantId: variant.variantId, variantIndex: variant.variantIndex, variantReason: variant.variantReason, parentStrategy: definition.strategy }, readOnly: true }));
      }
    }
  }

  emittedEvidence.push(evidence("evidence:orc-see:strategy-candidate:diversity-summary", "strategy-candidate-diversity", "orc-see:strategy-candidates", { generatedCandidates: candidates.length, discardedEquivalentCandidates, strategyFamilies: families.size, candidateIds: candidates.map((candidate) => candidate.id), generatedVariants, discardedVariants, readOnly: true }));
  return { candidates, evidence: emittedEvidence, summary: { generatedCandidates: candidates.length, discardedEquivalentCandidates, strategyTypes: families.size, generatedVariants, discardedVariants } };
}
