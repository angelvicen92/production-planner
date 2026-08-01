import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { classifyFixedCoreExploration, evaluateStandaloneCompletion, fixedCoreStandaloneExplorationFingerprint,
  updateStandaloneParetoFrontier, type StandaloneCompletionPoint } from "./fixedCoreStandaloneExploration";
import { evaluateParticipantItineraryQuality } from "./participantItineraryQuality";

const problem = (): PlannerNextProblem => ({ day: { start: 0, end: 300 }, protectedMeal: { start: 290, end: 300 },
  spaces: ["a", "b"].map((id) => ({ id, availability: [{ start: 0, end: 300 }] })), resources: [],
  participants: ["p", "empty"].map((id) => ({ id, availability: [{ start: 0, end: 300 }] })), coaches: [], tasks: [],
  mainFlow: { spaceId: "a", preferredEnd: 280, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
  participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
  budget: { bestK: 1, maxBacktracks: 1, maxPatterns: 1, maxBranchExpansions: 100 } });
const tasks = (gap: number): ScheduledTask[] => [
  { id: "a", kind: "auxiliary", participantId: "p", duration: 10, start: 0, end: 10, spaceId: "a", dependencies: [] },
  { id: "b", kind: "auxiliary", participantId: "p", duration: 10, start: 10 + gap, end: 20 + gap, spaceId: "b", dependencies: [] },
];
const fake = (fingerprint: string, values: number[], flags = {}): StandaloneCompletionPoint => ({ metrics: {
  fullFingerprint: fingerprint, qualityFingerprint: fingerprint, totalPresence: 0, productive: 0, idleRatio: 0,
  improvedParticipants: 0, worsenedParticipants: 0, unchangedParticipants: 0, grossImprovement: 0, netIdleImprovement: 0,
  maximumIndividualImprovement: 0, idleByParticipant: {}, standaloneStarts: {}, selectionOrder: [],
  grossHarm: values[0]!, maximumIndividualHarm: values[1]!, totalIdle: values[2]!, maximumIdle: values[3]!,
  maximumGap: values[4]!, gapCount: values[5]!, spaceChanges: values[6]!, maximumPresence: 0,
}, flags: { operationalDominance: false, baselineSafe: false, harmReducing: false, equityDominant: false, ...flags } });

test("computes equity deltas, dominance, participants without tasks, and preserves inputs", () => {
  const p = problem(), before = structuredClone(p), baseline = evaluateParticipantItineraryQuality(p, tasks(20));
  const current = evaluateParticipantItineraryQuality(p, tasks(15));
  const point = evaluateStandaloneCompletion(p, tasks(5), "leaf", baseline, current, { b: 15 }, ["b"]);
  assert.equal(point.metrics.grossHarm, 0); assert.equal(point.metrics.maximumIndividualHarm, 0);
  assert.equal(point.metrics.grossImprovement, 15); assert.equal(point.flags.operationalDominance, true);
  assert.equal(point.flags.baselineSafe, true); assert.equal(point.flags.harmReducing, true); assert.deepEqual(p, before);
  assert.equal(point.metrics.idleByParticipant.empty, 0);
});

test("Pareto frontier removes dominated points, retains equals, and is order invariant", () => {
  const best = fake("b", [1, 1, 1, 1, 1, 1, 1]), equal = fake("a", [1, 1, 1, 1, 1, 1, 1]);
  const bad = fake("z", [2, 2, 2, 2, 2, 2, 2]);
  const first = [bad, equal, best].reduce(updateStandaloneParetoFrontier, [] as StandaloneCompletionPoint[]);
  const reversed = [best, equal, bad].reduce(updateStandaloneParetoFrontier, [] as StandaloneCompletionPoint[]);
  assert.deepEqual(first, reversed); assert.deepEqual(first.map((p) => p.metrics.fullFingerprint), ["a", "b"]);
});

test("classifies all six Evidence outcomes in priority order", () => {
  const neutral = fake("first", [400, 130, 2600, 440, 320, 30, 40]);
  assert.equal(classifyFixedCoreExploration([], true, false, "first"), "CASE_6_NO_COMPLETION");
  assert.equal(classifyFixedCoreExploration([fake("x", [0, 0, 0, 0, 0, 0, 0], { operationalDominance: true })], false, true, "first"), "CASE_1_FIXED_CORE_DOMINANCE");
  assert.equal(classifyFixedCoreExploration([fake("x", [0, 0, 0, 0, 0, 0, 0], { harmReducing: true })], false, true, "first"), "CASE_2_CONTROLLED_EQUITY_IMPROVEMENT");
  assert.equal(classifyFixedCoreExploration([neutral], false, true, "first"), "CASE_5_INCONCLUSIVE_BUDGET");
  assert.equal(classifyFixedCoreExploration([neutral], true, false, "first"), "CASE_4_UNIQUE_STANDALONE_COMPLETION");
  assert.equal(classifyFixedCoreExploration([neutral, fake("other", [401, 130, 2600, 440, 320, 30, 40])], true, false, "first"), "CASE_3_ALTERNATIVES_WITHOUT_RELEVANT_IMPROVEMENT");
});

test("fingerprint is deterministic for canonical analysis and changes with Evidence", () => {
  const value = { core: "core", points: [fake("a", [1, 2, 3, 4, 5, 6, 7])] };
  assert.equal(fixedCoreStandaloneExplorationFingerprint(value), fixedCoreStandaloneExplorationFingerprint(structuredClone(value)));
  assert.notEqual(fixedCoreStandaloneExplorationFingerprint(value), fixedCoreStandaloneExplorationFingerprint({ ...value, core: "other" }));
});
