import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem } from "./contracts";
import { constructExactMainAndFeederCore } from "./exactMainAndFeederCore";
import { runExactStandaloneSearchForFixedCore } from "./exactItinerantPlan";
import { validatePlan } from "./validate";

function fixture(budget = 20_000): PlannerNextProblem {
  const availability = [{ start: 0, end: 60 }];
  return { day: { start: 0, end: 60 }, protectedMeal: { start: 55, end: 60 },
    spaces: ["main", "vocal", "aux"].map((id) => ({ id, availability })), resources: [],
    participants: ["core", "aux"].map((id) => ({ id, availability })), coaches: [{ id: "coach", availability }],
    tasks: [
      { id: "vocal", kind: "vocal", participantId: "core", coachId: "coach", duration: 10, spaceId: "vocal", dependencies: [] },
      { id: "main", kind: "main", participantId: "core", coachId: "coach", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "coach" },
      { id: "standalone", kind: "auxiliary", participantId: "aux", duration: 10, spaceId: "aux", dependencies: [], availability: [{ start: 0, end: 20 }] },
    ], mainFlow: { spaceId: "main", preferredEnd: 50, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0, auxiliaryPolicy: { participantPresencePreference: "OFF" },
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 10, maxBranchExpansions: budget }, searchPolicy: "EXACT_CONSTRUCTIVE" };
}
function fixed(problem: PlannerNextProblem) {
  const core = constructExactMainAndFeederCore(problem);
  return { core: core.scheduledTasks, meals: core.scheduledSpaceMeals, pending: problem.tasks.filter(({ id }) => id === "standalone") };
}

test("default accepts and atomically publishes only the first hard-valid standalone leaf", () => {
  const problem = fixture(), before = structuredClone(problem), input = fixed(problem);
  const result = runExactStandaloneSearchForFixedCore(problem, input.core, input.meals, input.pending);
  assert.equal(result.outcome, "FOUND"); assert.equal(result.evidence.hardValidCompleteLeaves, 1);
  assert.equal(result.evidence.stopReason, "ACCEPTED"); assert.equal(result.selectionOrder[0], "standalone");
  assert.equal(validatePlan(problem, result.scheduledTasks!, [], input.meals).hardValid, true); assert.deepEqual(problem, before);
});

test("CONTINUE observes later leaves without publishing a counterfactual or consuming callback branches", () => {
  const problem = fixture(), input = fixed(problem); const seen: string[] = []; const snapshots: unknown[] = [];
  const result = runExactStandaloneSearchForFixedCore(problem, input.core, input.meals, input.pending, { onHardValidStandaloneLeaf(leaf) {
    seen.push(leaf.fullFingerprint); snapshots.push(leaf); assert.equal(Object.isFrozen(leaf), true);
    assert.equal(Object.isFrozen(leaf.scheduledTasks), true); assert.equal(Object.isFrozen(leaf.standaloneStarts), true); return "CONTINUE";
  }});
  assert.equal(result.outcome, "DEAD_END"); assert.equal(result.scheduledTasks, null); assert.ok(seen.length >= 2);
  assert.equal(result.evidence.searchExhaustedNaturally, true); assert.equal(result.evidence.uniqueHardValidFingerprints, new Set(seen).size);
  const again = runExactStandaloneSearchForFixedCore(problem, input.core, input.meals, [...input.pending].reverse(), { onHardValidStandaloneLeaf: () => "CONTINUE" });
  assert.deepEqual(again.evidence, result.evidence); assert.ok(snapshots.length > 1);
});

test("budget exhaustion is exact, deterministic, and publishes no partial plan", () => {
  const completeProblem = fixture(), input = fixed(completeProblem);
  const complete = runExactStandaloneSearchForFixedCore(completeProblem, input.core, input.meals, input.pending, { onHardValidStandaloneLeaf: () => "CONTINUE" });
  const limited = fixture(complete.evidence.branchesConsumed - 1), limitedInput = fixed(limited);
  const result = runExactStandaloneSearchForFixedCore(limited, limitedInput.core, limitedInput.meals, limitedInput.pending, { onHardValidStandaloneLeaf: () => "CONTINUE" });
  assert.equal(result.outcome, "BUDGET_EXHAUSTED"); assert.equal(result.evidence.branchesConsumed, result.evidence.branchLimit);
  assert.equal(result.scheduledTasks, null); assert.equal(result.evidence.stopReason, "BUDGET_EXHAUSTED");
});

test("invalid/dead-end standalone shapes never invoke the leaf callback", () => {
  const problem = fixture(); problem.tasks.find(({ id }) => id === "standalone")!.availability = [{ start: 0, end: 5 }];
  const input = fixed(problem); let calls = 0;
  const result = runExactStandaloneSearchForFixedCore(problem, input.core, input.meals, input.pending, { onHardValidStandaloneLeaf: () => { calls++; return "CONTINUE"; } });
  assert.equal(result.outcome, "DEAD_END"); assert.equal(calls, 0); assert.ok(result.evidence.zeroAlternativePrunes > 0);
});
