import assert from "node:assert/strict";
import { constructExactMainAndFeederCore } from "../exactMainAndFeederCore";
import { validatePlan } from "../validate";
import { projectCombinedFocalA2ItinerantProblem } from "./focal-a2/focalA2RealityReference";

const reverseProblem = () => {
  const problem = projectCombinedFocalA2ItinerantProblem();
  problem.tasks.reverse(); problem.participants.reverse(); problem.spaces.reverse(); problem.resources.reverse();
  return problem;
};
const problem = projectCombinedFocalA2ItinerantProblem(), before = JSON.stringify(problem);
const started = performance.now(), first = constructExactMainAndFeederCore(problem), runtimeMs = performance.now() - started;
const second = constructExactMainAndFeederCore(projectCombinedFocalA2ItinerantProblem());
const reversed = constructExactMainAndFeederCore(reverseProblem());
assert.equal(first.status, "COMPLETE"); assert.equal(first.complete, true);
assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "main").length, 19);
assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "vocal").length, 19);
assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "auxiliary").length, 6);
assert.equal(first.scheduledTasks.length, 44); assert.equal(first.remainingTaskIds.length, 9);
assert.equal(first.scheduledTasks.filter(({ kind }) => kind === "technical").length, 0);
assert.equal(JSON.stringify(problem), before); assert.equal(first.evidence.coreFingerprint, second.evidence.coreFingerprint);
assert.equal(first.evidence.coreFingerprint, reversed.evidence.coreFingerprint);
assert.deepEqual(first.scheduledTasks, second.scheduledTasks); assert.deepEqual(first.scheduledSpaceMeals, second.scheduledSpaceMeals);
assert.ok(first.evidence.branchesExplored <= problem.budget.maxBranchExpansions);
assert.ok(first.evidence.backtracks > 0); assert.ok(first.evidence.residualMatchingChecks > 0);
const coreIds = new Set(first.scheduledTasks.map(({ id }) => id));
const reduced = { ...problem, tasks: problem.tasks.filter(({ id }) => coreIds.has(id)) };
assert.equal(validatePlan(reduced, first.scheduledTasks, [], first.scheduledSpaceMeals).hardValid, true);
const operations = (problem.anchoredAccompaniments ?? []).filter((contract) =>
  [contract.anchorTaskId, ...contract.beforeTaskIds, ...contract.afterTaskIds].every((id) => coreIds.has(id)));
assert.equal(operations.length, 3);
process.stdout.write(`${JSON.stringify({ status: first.status, complete: first.complete, runtimeMs,
  taskCounts: { main: 19, vocal: 19, anchoredSegments: 6, total: first.scheduledTasks.length, remaining: first.remainingTaskIds.length },
  anchoredOperationCount: operations.length, hardValid: true, inputUnchanged: JSON.stringify(problem) === before,
  deterministic: first.evidence.coreFingerprint === second.evidence.coreFingerprint,
  orderInvariant: first.evidence.coreFingerprint === reversed.evidence.coreFingerprint,
  remainingTaskIds: first.remainingTaskIds, evidence: first.evidence }, null, 2)}\n`);
