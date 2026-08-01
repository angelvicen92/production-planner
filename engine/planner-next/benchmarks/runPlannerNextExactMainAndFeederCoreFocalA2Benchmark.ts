import assert from "node:assert/strict";
import { constructExactMainAndFeederCore } from "../exactMainAndFeederCore";
import { validatePlan } from "../validate";
import { projectCombinedFocalA2ItinerantProblem } from "./focal-a2/focalA2RealityReference";

const reverseProblem = () => {
  const problem = projectCombinedFocalA2ItinerantProblem();
  problem.tasks.reverse(); problem.participants.reverse(); problem.spaces.reverse(); problem.resources.reverse();
  problem.anchoredAccompaniments?.reverse();
  for (const contract of problem.anchoredAccompaniments ?? []) {
    contract.beforeTaskIds.reverse(); contract.afterTaskIds.reverse();
  }
  return problem;
};
const problem = projectCombinedFocalA2ItinerantProblem(), before = JSON.stringify(problem);
const started = performance.now(), first = constructExactMainAndFeederCore(problem), runtimeMs = performance.now() - started;
const second = constructExactMainAndFeederCore(projectCombinedFocalA2ItinerantProblem());
const reversed = constructExactMainAndFeederCore(reverseProblem());
assert.equal(JSON.stringify(problem), before); assert.equal(first.status, second.status); assert.equal(first.status, reversed.status);
assert.deepEqual(first.evidence, second.evidence); assert.deepEqual(first.evidence, reversed.evidence);
assert.deepEqual(first.scheduledTasks, second.scheduledTasks); assert.deepEqual(first.scheduledSpaceMeals, second.scheduledSpaceMeals);
assert.ok(first.evidence.branchesExplored <= problem.budget.maxBranchExpansions);
const coreIds = new Set(first.scheduledTasks.map(({ id }) => id));
const reduced = { ...problem, tasks: problem.tasks.filter(({ id }) => coreIds.has(id)) };
const operations = (problem.anchoredAccompaniments ?? []).filter((contract) =>
  [contract.anchorTaskId, ...contract.beforeTaskIds, ...contract.afterTaskIds].every((id) => coreIds.has(id)));
if (first.status === "COMPLETE") {
  assert.equal(first.complete, true); assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "main").length, 19);
  assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "vocal").length, 19);
  assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "auxiliary").length, 6);
  assert.equal(first.scheduledTasks.length, 44); assert.equal(first.remainingTaskIds.length, 9);
  assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "technical").length, 0);
  assert.equal(validatePlan(reduced, first.scheduledTasks, [], first.scheduledSpaceMeals).hardValid, true);
  assert.equal(operations.length, 3);
} else {
  assert.equal(first.status, "BRANCH_BUDGET_EXHAUSTED"); assert.equal(first.complete, false);
  assert.deepEqual(first.scheduledTasks, []); assert.deepEqual(first.scheduledSpaceMeals, []);
}
process.stdout.write(`${JSON.stringify({ status: first.status, complete: first.complete, runtimeMs,
  taskCounts: { main: first.scheduledTasks.filter(({ kind }) => kind === "main").length,
    vocal: first.scheduledTasks.filter(({ kind }) => kind === "vocal").length,
    anchoredSegments: first.scheduledTasks.filter(({ kind }) => kind === "auxiliary").length,
    total: first.scheduledTasks.length, remaining: first.remainingTaskIds.length },
  anchoredOperationCount: operations.length, hardValid: first.status === "COMPLETE"
    ? validatePlan(reduced, first.scheduledTasks, [], first.scheduledSpaceMeals).hardValid : false,
  inputUnchanged: JSON.stringify(problem) === before, deterministic: first.status === second.status && JSON.stringify(first.evidence) === JSON.stringify(second.evidence),
  orderInvariant: first.status === reversed.status && JSON.stringify(first.evidence) === JSON.stringify(reversed.evidence),
  remainingTaskIds: first.remainingTaskIds, evidence: first.evidence }, null, 2)}\n`);
