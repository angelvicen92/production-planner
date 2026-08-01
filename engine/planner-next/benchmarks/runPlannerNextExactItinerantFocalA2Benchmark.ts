import assert from "node:assert/strict";
import { constructExactMainAndFeederCore } from "../exactMainAndFeederCore";
import { constructExactItinerantPlan } from "../exactItinerantPlan";
import { validatePlan } from "../validate";
import { evaluateFocalA2RealityUnits } from "./focal-a2/evaluateFocalA2RealityUnits";
import {
  itinerantOperationProfiles,
  projectCombinedFocalA2ItinerantProblem,
  realityReferenceValidation,
} from "./focal-a2/focalA2RealityReference";

function reversedProblem() {
  const problem = projectCombinedFocalA2ItinerantProblem([...itinerantOperationProfiles].reverse());
  problem.tasks.reverse(); problem.participants.reverse(); problem.spaces.reverse(); problem.resources.reverse();
  problem.anchoredAccompaniments?.reverse();
  return problem;
}

const problem = projectCombinedFocalA2ItinerantProblem();
problem.searchPolicy = "EXACT_CONSTRUCTIVE";
const before = JSON.stringify(problem);
const started = performance.now();
const first = constructExactItinerantPlan(problem);
const runtimeMs = performance.now() - started;
const secondProblem = projectCombinedFocalA2ItinerantProblem(); secondProblem.searchPolicy = "EXACT_CONSTRUCTIVE";
const second = constructExactItinerantPlan(secondProblem);
const reversed = constructExactItinerantPlan(reversedProblem());
const core = constructExactMainAndFeederCore(problem);
const coreIds = new Set(core.scheduledTasks.map(({ id }) => id));
const resultCore = first.scheduledTasks.filter(({ id }) => coreIds.has(id));
const standaloneIds = new Set(itinerantOperationProfiles.filter(({ type }) => type === "STANDALONE").map(({ id }) => id));
const standalone = first.scheduledTasks.filter(({ id }) => standaloneIds.has(id));
const evaluation = evaluateFocalA2RealityUnits(first.scheduledTasks, JSON.stringify(problem) === before);
const validation = validatePlan(problem, first.scheduledTasks, [], first.scheduledSpaceMeals);
const artifact = {
  status: first.status, runtimeMs, complete: first.complete,
  taskCounts: { total: first.scheduledTasks.length, main: first.scheduledTasks.filter(({ kind }) => kind === "main").length,
    vocal: first.scheduledTasks.filter(({ kind }) => kind === "vocal").length, standalone: standalone.length,
    anchoredSegments: first.scheduledTasks.filter(({ kind, id }) => kind === "auxiliary" && !standaloneIds.has(id)).length,
    remaining: first.remainingTaskIds.length },
  anchoredOperationCount: problem.anchoredAccompaniments?.length ?? 0,
  itinerantOperationCount: standalone.length + (problem.anchoredAccompaniments?.length ?? 0),
  productiveMinutes: standalone.reduce((sum, task) => sum + task.duration, 0)
    + (problem.anchoredAccompaniments?.length ?? 0) * 45,
  hardValid: validation.hardValid, partialOperationCount: evaluation.exactMembershipSatisfied ? 0 : 1,
  inputUnchanged: JSON.stringify(problem) === before,
  deterministic: JSON.stringify(first) === JSON.stringify(second),
  orderInvariant: first.evidence.fullFingerprint === reversed.evidence.fullFingerprint,
  coreIdentical: JSON.stringify(resultCore) === JSON.stringify(core.scheduledTasks), evidence: first.evidence,
};
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);

assert.equal(first.status, "COMPLETE");
assert.equal(first.scheduledTasks.length, realityReferenceValidation.projectedTaskCountWhenSupported);
assert.equal(artifact.taskCounts.main, 19); assert.equal(artifact.taskCounts.vocal, 19);
assert.equal(artifact.taskCounts.standalone, 9); assert.equal(artifact.taskCounts.anchoredSegments, 6);
assert.equal(artifact.anchoredOperationCount, 3); assert.equal(artifact.itinerantOperationCount, 12);
assert.equal(artifact.productiveMinutes, 375); assert.equal(first.remainingTaskIds.length, 0);
assert.equal(validation.hardValid, true); assert.equal(artifact.partialOperationCount, 0);
assert.deepEqual(resultCore, core.scheduledTasks);
assert.equal(core.evidence.coreFingerprint, "c85b9b2cfbbf9434135f08e2b293b0ab6c23e5ff070e880cbb5406022dd52785");
assert.equal(artifact.inputUnchanged, true); assert.equal(artifact.deterministic, true); assert.equal(artifact.orderInvariant, true);
assert.ok(first.evidence.fullFingerprint); assert.equal(first.evidence.fullFingerprint, second.evidence.fullFingerprint);
assert.equal(first.evidence.fullFingerprint, reversed.evidence.fullFingerprint);
assert.ok(first.evidence.branchesExplored <= 300_000);
