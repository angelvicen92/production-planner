import assert from "node:assert/strict";
import type { PlannerNextProblem, Task } from "../contracts";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "../assistedPlanning";
import { createCanonicalFullA2Template, expandCanonicalFullA2Template } from "./focal-a2/full-day/canonicalFullA2Template";

const minute = (value: string): number => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

export function buildCanonicalA2PlannerNextProblem(branchBudget=100_000) {
  const expansion = expandCanonicalFullA2Template(createCanonicalFullA2Template());
  const config = expansion.effectiveConfiguration;
  const itinerantUnitId = new Map(expansion.itinerantUnits.map((unit, index) => [unit.id, `itinerant-team:${index + 1}`]));
  const tasks: Task[] = expansion.tasks.filter((task) => task.operationalKind !== "participant_meal").map((task) => ({
    id: task.id, kind: task.operationalKind === "main" || task.operationalKind === "vocal" || task.operationalKind === "technical"
      ? task.operationalKind : "auxiliary",
    duration: task.duration, spaceId: task.spaceId, dependencies: [...task.dependencies],
    ...(task.participantId ? { participantId: task.participantId } : {}),
    ...(task.coachId ? { coachId: task.coachId } : {}), ...(task.blockKey ? { blockKey: task.blockKey } : {}),
    ...(task.setupFamilyId ? { setupFamilyId: task.setupFamilyId } : {}),
    ...(task.jointGroupId ? { jointGroupId: task.jointGroupId } : {}),
    ...(task.requiredResourceIds.filter((id) => id !== task.coachId).length
      ? { requiredResourceIds: task.requiredResourceIds.filter((id) => id !== task.coachId) } : {}),
    ...(task.itinerantUnitId ? { itinerantUnitId: itinerantUnitId.get(task.itinerantUnitId)! } : {}),
  } as Task));
  const problem: PlannerNextProblem = {
    day: { start: minute(config.effectiveDayWindow.start), end: minute(config.effectiveDayWindow.end) },
    spaces: expansion.spaces.map(({ id }) => ({ id, availability: [{ start: minute(config.effectiveDayWindow.start), end: minute(config.effectiveDayWindow.end) }] })),
    resources: expansion.resources.map(({ id }) => ({ id, availability: [{ start: minute(config.effectiveDayWindow.start), end: minute(config.effectiveDayWindow.end) }], presencePreference: "OFF" })),
    participants: expansion.participants.map((id) => ({ id, availability: [{ start: minute(config.participantAvailability[id].start), end: minute(config.participantAvailability[id].end) }] })),
    coaches: ["coach-lucia", "coach-jose-maria"].map((id) => ({ id, availability: [{ start: minute(config.effectiveDayWindow.start), end: minute(config.effectiveDayWindow.end) }] })),
    itinerantUnits: expansion.itinerantUnits.map(({ id }) => ({ id: itinerantUnitId.get(id)!, availability: [{ start: minute(config.itinerantUnitAvailability[id].start), end: minute(config.itinerantUnitAvailability[id].end) }] })),
    tasks, mainFlow: { spaceId: expansion.rules.mainFlow.spaceId, preferredEnd: minute(config.meals.effectiveWindow.start), continuity: "REQUIRED", maxBlocksByKey: expansion.rules.mainFlow.maxBlocksPerCoach, minTasksPerBlock: 1 },
    participantTransitionMinutes: 5, resourceTransitionMinutes: 0,
    coachRouteTransitions: [["coach-lucia", "caracola-lucia"], ["coach-jose-maria", "caracola-jose-maria"]].map(([coachId, fromSpaceId]) => ({ coachId, fromSpaceId, toSpaceId: expansion.rules.mainFlow.spaceId, minutes: expansion.rules.coachTransition.minutes })),
    anchoredAccompaniments: expansion.anchoredOperations.map((operation) => ({ id: operation.id, anchorTaskId: operation.anchorTaskId, beforeTaskIds: [...operation.beforeTaskIds], afterTaskIds: [...operation.afterTaskIds], adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED", itinerantUnitId: itinerantUnitId.get(operation.itinerantUnitId)! })),
    technicalChains: expansion.technicalChains.map((chain) => ({ id: chain.id, orderedTaskIds: [...chain.orderedTaskIds],
      ...(chain.phases ? { phases: chain.phases.map((phase) => [...phase]) } : {}), adjacency: chain.adjacency,
      resourceContinuity: chain.resourceContinuity, requiredResourceIds: [...chain.requiredResourceIds] })),
    searchPolicy: "EXACT_CONSTRUCTIVE", budget: { bestK: 5, maxBacktracks: 500, maxPatterns: 200, maxBranchExpansions: branchBudget },
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
  };
  return { expansion, problem };
}

export function runA2Assist1Benchmark(branchBudget=100_000) {
  const { expansion, problem } = buildCanonicalA2PlannerNextProblem(branchBudget);
  const scopeIds = expansion.tasks.filter((task) => task.type === "ENSAYO_ESTUDIO_7").map(({ id }) => id);
  assert.equal(expansion.tasks.filter((task) => task.participantId).length, 266);
  const scope = createPlanningScope({ kind: "canonical-space", value: "estudio-7" }, { benchmarkId: "A2-ASSIST-1", sourceObligationCount: 266 }, scopeIds);
  const analyticalFutureEligibleTaskIds = new Set(expansion.technicalChains.flatMap((chain) => chain.orderedTaskIds));
  const assisted = buildAssistedProblem(problem, scope, [], analyticalFutureEligibleTaskIds);
  const result = executeAssistedPlanning(assisted);
  return { benchmarkId: "A2-ASSIST-1", sourceHumanTimesUsed: false, participantTransitionMinutes: 5, automaticTaskIds: assisted.automaticTaskIds, supportingTaskIds: assisted.supportingTaskIds, ...result.evidence };
}

if (process.argv[1]?.endsWith("runPlannerNextA2Assist1Benchmark.ts")) console.log(JSON.stringify(runA2Assist1Benchmark(), null, 2));
