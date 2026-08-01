import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { constructExactMainAndFeederCore } from "./exactMainAndFeederCore";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import { validatePlan } from "./validate";
import type { PlannerNextProblem, Task } from "./contracts";

function syntheticProblem(tasks: Task[], participantIds: string[], spaceIds: string[]): PlannerNextProblem {
  const availability = [{ start: 0, end: 120 }];
  return { day: { start: 0, end: 120 }, protectedMeal: { start: 110, end: 120 }, resources: [],
    spaces: ["main", ...spaceIds].map((id) => ({ id, availability })),
    participants: participantIds.map((id) => ({ id, availability })), coaches: [{ id: "coach", availability }],
    tasks: tasks.map((task) => task.kind === "main" || task.kind === "vocal" ? ({ ...task, coachId: task.coachId ?? "coach",
      blockKey: task.kind === "main" ? "coach" : task.blockKey }) : task),
    mainFlow: { spaceId: "main", preferredEnd: 100, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 20, maxBranchExpansions: 20_000 } };
}

function mainBacktrackingProblem(): PlannerNextProblem {
  return syntheticProblem([
    { id: "vocal-a-flex", kind: "vocal", participantId: "a", duration: 10, spaceId: "vocal-a", dependencies: [] },
    { id: "a-main-flex", kind: "main", participantId: "a", duration: 10, spaceId: "main", dependencies: ["vocal-a-flex"], blockKey: "block" },
    { id: "vocal-b-fixed", kind: "vocal", participantId: "b", duration: 10, spaceId: "vocal-b", dependencies: [] },
    { id: "b-main-fixed", kind: "main", participantId: "b", duration: 10, spaceId: "main", dependencies: ["vocal-b-fixed"], blockKey: "block", availability: [{ start: 80, end: 90 }] },
  ], ["a", "b"], ["vocal-a", "vocal-b"]);
}

function feederStartBacktrackingProblem(): PlannerNextProblem {
  const problem = syntheticProblem([
    { id: "vocal-a", kind: "vocal", participantId: "a", duration: 10, spaceId: "vocal", dependencies: [] },
    { id: "main-a", kind: "main", participantId: "a", duration: 10, spaceId: "main", dependencies: ["vocal-a"], blockKey: "a" },
    { id: "vocal-b", kind: "vocal", participantId: "b", duration: 10, spaceId: "vocal", dependencies: [], availability: [{ start: 70, end: 80 }] },
    { id: "main-b", kind: "main", participantId: "b", duration: 10, spaceId: "main", dependencies: ["vocal-b"], blockKey: "b" },
  ], ["a", "b"], ["vocal"]);
  problem.participants.find(({ id }) => id === "b")!.availability = [{ start: 70, end: 100 }];
  problem.tasks.find(({ id }) => id === "main-b")!.availability = [{ start: 90, end: 100 }];
  return problem;
}

test("constructs main and direct vocal feeders atomically, deterministically and immutably", () => {
  const problem = mainFlowVocalScenario(), snapshot = structuredClone(problem);
  const first = constructExactMainAndFeederCore(problem), second = constructExactMainAndFeederCore(mainFlowVocalScenario());
  assert.equal(first.status, "COMPLETE"); assert.equal(first.complete, true);
  assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "main").length, 8);
  assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "vocal").length, 8);
  assert.equal(first.evidence.coreFingerprint, second.evidence.coreFingerprint);
  assert.equal(first.evidence.feederCandidatesEvaluated,
    first.evidence.constructiveFeederStartChecks + first.evidence.matchingFeederStartChecks);
  assert.deepEqual(problem, snapshot); assert.deepEqual(first.remainingTaskIds, []);
  for (const main of first.scheduledTasks.filter(({ kind }) => kind === "main")) {
    const feeder = first.scheduledTasks.find(({ id }) => id === main.dependencies[0]);
    assert.ok(feeder && feeder.end <= main.start);
  }
});

test("explores the first valid feeder start immediately without enumerating earlier starts", () => {
  const problem = syntheticProblem([
    { id: "vocal", kind: "vocal", participantId: "p", duration: 10, spaceId: "vocal-room", dependencies: [] },
    { id: "main", kind: "main", participantId: "p", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "coach" },
  ], ["p"], ["vocal-room"]);
  const result = constructExactMainAndFeederCore(problem);
  assert.equal(result.status, "COMPLETE"); assert.equal(result.evidence.constructiveFeederStartChecks, 1);
  assert.equal(result.evidence.matchingFeederStartChecks, 0);
  assert.equal(result.evidence.feederCandidatesEvaluated, 1);
  assert.equal(result.scheduledTasks.find(({ id }) => id === "vocal")!.start, 80);
});

test("is invariant to canonical input collection order", () => {
  const baseline = mainFlowVocalScenario(), reversed = mainFlowVocalScenario();
  reversed.tasks.reverse(); reversed.participants.reverse(); reversed.spaces.reverse(); reversed.resources.reverse();
  assert.equal(constructExactMainAndFeederCore(reversed).evidence.coreFingerprint,
    constructExactMainAndFeederCore(baseline).evidence.coreFingerprint);
});

test("unsupported feeder shapes and failures are atomic", () => {
  const missing = mainFlowVocalScenario(); missing.tasks = missing.tasks.filter(({ id }) => id !== "vocal-participant-z");
  const unsupported = constructExactMainAndFeederCore(missing);
  assert.equal(unsupported.status, "UNSUPPORTED_CORE_SHAPE");
  assert.deepEqual(unsupported.scheduledTasks, []); assert.deepEqual(unsupported.scheduledSpaceMeals, []);
  const multiple = mainFlowVocalScenario(); multiple.tasks.push({ ...multiple.tasks.find(({ id }) => id === "vocal-participant-z")!, id: "second-vocal" });
  assert.equal(constructExactMainAndFeederCore(multiple).status, "UNSUPPORTED_CORE_SHAPE");
  const impossible = mainFlowVocalScenario(); impossible.participants.forEach((participant) => { participant.availability = [{ start: 540, end: 560 }]; });
  const infeasible = constructExactMainAndFeederCore(impossible);
  assert.equal(infeasible.status, "INFEASIBLE"); assert.deepEqual(infeasible.scheduledTasks, []);
  const bounded = mainFlowVocalScenario(); bounded.budget.maxBranchExpansions = 1;
  const exhausted = constructExactMainAndFeederCore(bounded);
  assert.equal(exhausted.status, "BRANCH_BUDGET_EXHAUSTED"); assert.deepEqual(exhausted.scheduledTasks, []);
});

test("a deferred main survives bestK=1 after the stable-id first choice is causally pruned", () => {
  const problem = mainBacktrackingProblem(), result = constructExactMainAndFeederCore(problem);
  const firstOrderedMain = "a-main-flex";
  const selectedFirstMain = result.scheduledTasks.filter(({ kind }) => kind === "main").sort((a, b) => a.start - b.start)[0]!.id;
  assert.equal(result.status, "COMPLETE"); assert.equal(firstOrderedMain, "a-main-flex");
  assert.equal(selectedFirstMain, "b-main-fixed"); assert.notEqual(selectedFirstMain, firstOrderedMain);
  assert.ok(result.evidence.backtracks > 0); assert.ok(result.evidence.residualMatchingPrunes > 0);
});

test("a deferred earlier feeder start survives after the latest valid start blocks the next feeder", () => {
  const result = constructExactMainAndFeederCore(feederStartBacktrackingProblem());
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.scheduledTasks.find(({ id }) => id === "vocal-a")!.start, 60);
  assert.equal(result.scheduledTasks.find(({ id }) => id === "vocal-b")!.start, 70);
  assert.ok(result.evidence.backtracks > 0); assert.ok(result.evidence.residualMatchingPrunes > 0);
  assert.equal(result.evidence.feederCandidatesEvaluated,
    result.evidence.constructiveFeederStartChecks + result.evidence.matchingFeederStartChecks);
});

test("residual matching prunes an uncovered state and preserves a covered real solution", () => {
  const pruned = constructExactMainAndFeederCore(mainBacktrackingProblem());
  assert.equal(pruned.status, "COMPLETE"); assert.ok(pruned.evidence.residualMatchingPrunes > 0);
  const covered = mainBacktrackingProblem(); covered.tasks.find(({ id }) => id === "b-main-fixed")!.availability = [{ start: 80, end: 100 }];
  const solution = constructExactMainAndFeederCore(covered);
  assert.equal(solution.status, "COMPLETE");
  assert.equal(solution.scheduledTasks.filter(({ kind }) => kind === "main").length, 2);
});

test("the exact branch threshold completes at B and exhausts atomically at B-1", () => {
  const generous = feederStartBacktrackingProblem(), complete = constructExactMainAndFeederCore(generous);
  assert.equal(complete.status, "COMPLETE"); const branchThreshold = complete.evidence.branchesExplored;
  const exact = feederStartBacktrackingProblem(); exact.budget.maxBranchExpansions = branchThreshold;
  const atThreshold = constructExactMainAndFeederCore(exact);
  assert.equal(atThreshold.status, "COMPLETE"); assert.deepEqual(atThreshold.scheduledTasks, complete.scheduledTasks);
  const below = feederStartBacktrackingProblem(); below.budget.maxBranchExpansions = branchThreshold - 1;
  const exhausted = constructExactMainAndFeederCore(below);
  assert.equal(exhausted.status, "BRANCH_BUDGET_EXHAUSTED"); assert.equal(exhausted.evidence.branchesExplored, branchThreshold - 1);
  assert.deepEqual(exhausted.scheduledTasks, []); assert.deepEqual(exhausted.scheduledSpaceMeals, []);
});

test("a minimal anchored core is adjacent, fed before its first obligation, and hard-valid", () => {
  const problem = syntheticProblem([
    { id: "vocal", kind: "vocal", participantId: "p", duration: 10, spaceId: "vocal-room", dependencies: [] },
    { id: "before", kind: "auxiliary", participantId: "p", duration: 5, spaceId: "side", dependencies: [] },
    { id: "main", kind: "main", participantId: "p", duration: 10, spaceId: "main", dependencies: ["vocal"], blockKey: "block" },
    { id: "after", kind: "auxiliary", participantId: "p", duration: 5, spaceId: "side", dependencies: [] },
  ], ["p"], ["vocal-room", "side"]);
  problem.auxiliaryPolicy = { participantPresencePreference: "OFF" };
  problem.anchoredAccompaniments = [{ id: "operation", anchorTaskId: "main", beforeTaskIds: ["before"], afterTaskIds: ["after"], adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED" }];
  const result = constructExactMainAndFeederCore(problem);
  assert.equal(result.status, "COMPLETE"); assert.equal(result.scheduledTasks.length, 4);
  for (const contract of problem.anchoredAccompaniments ?? []) {
    const sequence = [...contract.beforeTaskIds, contract.anchorTaskId, ...contract.afterTaskIds]
      .map((id) => result.scheduledTasks.find((task) => task.id === id)!);
    assert.ok(sequence.every(Boolean)); assert.ok(sequence.slice(1).every((task, index) => sequence[index]!.end === task.start));
    const feeder = result.scheduledTasks.find(({ id }) => id === sequence.find(({ kind }) => kind === "main")!.dependencies[0])!;
    assert.ok(feeder.end <= sequence[0]!.start);
  }
  const coreIds = new Set(result.scheduledTasks.map(({ id }) => id));
  const reduced = { ...problem, tasks: problem.tasks.filter(({ id }) => coreIds.has(id)) };
  assert.equal(validatePlan(reduced, result.scheduledTasks, [], result.scheduledSpaceMeals).hardValid, true);
});

test("the internal core has no routing, historical search, scenario oracle or public PlanResult surface", () => {
  const source = readFileSync(new URL("./exactMainAndFeederCore.ts", import.meta.url), "utf8");
  assert.equal(source.includes("resolvePlannerSearchPolicy"), false);
  assert.equal(source.includes("compatibilityPreservingSearch"), false);
  assert.equal(source.includes("PlanResult"), false);
  assert.equal(source.includes("Focal A2"), false);
  assert.equal(source.includes("expectedFingerprint"), false);
  assert.equal(source.includes("PartialPlan"), false);
});
