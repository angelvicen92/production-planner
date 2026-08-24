import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import { runExactItinerantPlanSearch } from "./exactItinerantPlan";

const auxiliary = (id: string, participantId: string, availability: Array<{ start: number; end: number }>): Task => ({
  id,
  kind: "auxiliary",
  participantId,
  duration: 10,
  spaceId: `space-${id}`,
  dependencies: [],
  availability,
});

function memoizationProbeProblem(): PlannerNextProblem {
  const availability = [{ start: 0, end: 120 }];
  return {
    day: { start: 0, end: 120 },
    protectedMeal: { start: 110, end: 120 },
    spaces: [
      { id: "main", availability },
      { id: "vocal", availability },
      { id: "vocal-other", availability },
      { id: "space-standalone", availability },
    ],
    resources: [{ id: "unit", availability, presencePreference: "OFF", transitionMinutes: 0 }],
    participants: [
      { id: "core", availability },
      { id: "other", availability },
    ],
    coaches: [{ id: "coach", availability }],
    tasks: [
      {
        id: "vocal",
        kind: "vocal",
        participantId: "core",
        coachId: "coach",
        duration: 10,
        spaceId: "vocal",
        dependencies: [],
      },
      {
        id: "main",
        kind: "main",
        participantId: "core",
        coachId: "coach",
        duration: 10,
        spaceId: "main",
        dependencies: ["vocal"],
        blockKey: "coach",
      },
      {
        id: "vocal-other",
        kind: "vocal",
        participantId: "other",
        coachId: "coach",
        duration: 10,
        spaceId: "vocal-other",
        dependencies: [],
      },
      {
        id: "main-other",
        kind: "main",
        participantId: "other",
        coachId: "coach",
        duration: 10,
        spaceId: "main",
        dependencies: ["vocal-other"],
        blockKey: "coach",
      },
      auxiliary("standalone", "core", [{ start: 60, end: 70 }]),
    ],
    mainFlow: {
      spaceId: "main",
      preferredEnd: 100,
      continuity: "REQUIRED",
      maxBlocksByKey: 1,
      minTasksPerBlock: 1,
    },
    participantTransitionMinutes: 0,
    resourceTransitionMinutes: 0,
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 20, maxBranchExpansions: 20_000 },
    searchPolicy: "EXACT_CONSTRUCTIVE",
  };
}

test("positive standalone witness memoization preserves the first hard-valid route and can be disabled", () => {
  const enabledInput = memoizationProbeProblem();
  const disabledInput = memoizationProbeProblem();
  const enabledSnapshot = structuredClone(enabledInput);
  const disabledSnapshot = structuredClone(disabledInput);

  const enabled = runExactItinerantPlanSearch(enabledInput, {
    standaloneCompletionSelection: "FIRST_HARD_VALID",
    standaloneForwardWitnessMemoization: true,
  });
  const disabled = runExactItinerantPlanSearch(disabledInput, {
    standaloneCompletionSelection: "FIRST_HARD_VALID",
    standaloneForwardWitnessMemoization: false,
  });

  assert.equal(enabled.status, disabled.status);
  assert.equal(enabled.complete, disabled.complete);
  assert.deepEqual(enabled.scheduledTasks, disabled.scheduledTasks);
  assert.deepEqual(enabled.scheduledSpaceMeals, disabled.scheduledSpaceMeals);
  assert.equal(enabled.evidence.fullFingerprint, disabled.evidence.fullFingerprint);
  assert.equal(enabled.evidence.standaloneForwardPrunes, disabled.evidence.standaloneForwardPrunes);
  assert.equal(enabled.evidence.standaloneForwardWitnessesFound, disabled.evidence.standaloneForwardWitnessesFound);

  assert.equal(disabled.evidence.standaloneForwardWitnessCacheHits, 0);
  assert.equal(disabled.evidence.standaloneForwardWitnessCacheMisses, 0);
  assert.equal(disabled.evidence.standaloneForwardWitnessCacheEntries, 0);
  assert.equal(disabled.evidence.standaloneForwardWitnessBranchesAvoided, 0);
  assert.ok(enabled.evidence.standaloneForwardWitnessCacheMisses > 0);
  assert.ok(enabled.evidence.standaloneForwardWitnessCacheEntries > 0);

  assert.equal(enabled.evidence.branchesExplored, enabled.evidence.coreBranches + enabled.evidence.standaloneBranches);
  assert.equal(disabled.evidence.branchesExplored, disabled.evidence.coreBranches + disabled.evidence.standaloneBranches);
  assert.deepEqual(enabledInput, enabledSnapshot);
  assert.deepEqual(disabledInput, disabledSnapshot);
});
