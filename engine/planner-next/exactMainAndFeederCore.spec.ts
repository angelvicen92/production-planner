import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { projectCombinedFocalA2ItinerantProblem } from "./benchmarks/focal-a2/focalA2RealityReference";
import { constructExactMainAndFeederCore } from "./exactMainAndFeederCore";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import { validatePlan } from "./validate";

test("constructs main and direct vocal feeders atomically, deterministically and immutably", () => {
  const problem = mainFlowVocalScenario(), snapshot = structuredClone(problem);
  const first = constructExactMainAndFeederCore(problem), second = constructExactMainAndFeederCore(mainFlowVocalScenario());
  assert.equal(first.status, "COMPLETE"); assert.equal(first.complete, true);
  assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "main").length, 8);
  assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "vocal").length, 8);
  assert.equal(first.evidence.coreFingerprint, second.evidence.coreFingerprint);
  assert.deepEqual(problem, snapshot); assert.deepEqual(first.remainingTaskIds, []);
  for (const main of first.scheduledTasks.filter(({ kind }) => kind === "main")) {
    const feeder = first.scheduledTasks.find(({ id }) => id === main.dependencies[0]);
    assert.ok(feeder && feeder.end <= main.start);
  }
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

test("Focal A2 proves anchored adjacency, meal split, matching and real deferred backtracking", () => {
  const problem = projectCombinedFocalA2ItinerantProblem(); problem.budget.bestK = 1;
  const result = constructExactMainAndFeederCore(problem);
  assert.equal(result.status, "COMPLETE"); assert.equal(result.scheduledTasks.length, 44);
  assert.equal(result.remainingTaskIds.length, 9); assert.equal(result.scheduledSpaceMeals.length, 1);
  assert.ok(result.evidence.backtracks > 0); assert.ok(result.evidence.residualMatchingPrunes > 0);
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
