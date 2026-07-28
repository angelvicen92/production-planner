import { execFileSync } from "node:child_process";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { jointAuxiliaryTasksScenario } from "../scenarios/jointAuxiliaryTasksScenario";
import { technicalOperationScenario } from "../scenarios/technicalOperationScenario";

const legacy = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "engine/planner-next/benchmarks/runPlannerNextJointAuxiliaryTasksBenchmark.ts"], { encoding: "utf8" }));
const problem = technicalOperationScenario(), snapshot = structuredClone(problem);
const control = planMainFlowAndFeeders(jointAuxiliaryTasksScenario());
const plan = planMainFlowAndFeeders(problem), again = planMainFlowAndFeeders(technicalOperationScenario());
const task = plan.scheduledTasks.find(({ kind }) => kind === "technical"), metrics = plan.metrics;
const originalIds = new Set(control.scheduledTasks.map(({ id }) => id));
const projection = (tasks: typeof plan.scheduledTasks) => tasks.filter(({ id }) => originalIds.has(id)).map(({ id, start, end, spaceId }) => ({ id, start, end, spaceId })).sort((a,b)=>a.id.localeCompare(b.id));
const stable = (value: unknown) => JSON.stringify(value);
const violationCount = metrics.dependencyViolationCount + metrics.overlapViolationCount + metrics.transitionViolationCount + metrics.availabilityViolationCount + metrics.blockViolationCount + metrics.resourceAvailabilityViolationCount + metrics.resourceOverlapViolationCount + metrics.resourceTransitionViolationCount + metrics.secondaryContinuityViolationCount + metrics.setupViolationCount + metrics.setupPreparationViolationCount + metrics.jointGroupViolationCount + metrics.technicalOperationViolationCount;
const technicalOperation = {
  complete: plan.complete, hardValid: metrics.hardValid, plannedTaskCount: metrics.plannedTaskCount,
  taskId: task?.id, kind: task?.kind, participantId: task?.participantId, coachId: task?.coachId,
  start: task?.start, end: task?.end, duration: task?.duration, spaceId: task?.spaceId,
  resourceIds: task?.requiredResourceIds, candidateCount: metrics.technicalOperationCandidateCountWhenSelectedById["technical-camera-positioning"],
  workItemSelectionOrder: metrics.auxiliaryWorkItemSelectionOrder,
  technicalResourcePresence: metrics.resourcePresenceMinutesById["technical-unit"], technicalResourceInternalGap: metrics.resourceInternalGapMinutesById["technical-unit"],
  technicalOperationCount: metrics.technicalOperationCount, technicalOperationPlannedCount: metrics.technicalOperationPlannedCount,
  technicalOperationViolationCount: metrics.technicalOperationViolationCount,
  originalProjectionEqual: stable(projection(plan.scheduledTasks)) === stable(projection(control.scheduledTasks)),
  participantPresenceEqual: stable(metrics.participantPresenceMinutesById) === stable(control.metrics.participantPresenceMinutesById),
  inputUnchanged: stable(problem) === stable(snapshot), fingerprint: metrics.planFingerprint,
  branches: metrics.branchesExplored, branchBudgetConsumed: metrics.branchBudgetConsumed, branchBudgetMaximum: problem.budget.maxBranchExpansions,
  runtimeMs: metrics.runtimeMs, deterministic: metrics.planFingerprint === again.metrics.planFingerprint, violationCount,
};
const technicalAccepted = plan.complete && metrics.hardValid && metrics.plannedTaskCount === 27 && task?.kind === "technical"
  && !("participantId" in task) && !("coachId" in task) && task.duration === 20 && task.spaceId === "technical-room"
  && stable(task.requiredResourceIds) === stable(["technical-unit"]) && technicalOperation.candidateCount === 3
  && metrics.auxiliaryWorkItemSelectionOrder[0] === "task:technical-camera-positioning" && technicalOperation.technicalResourcePresence === 20
  && technicalOperation.technicalResourceInternalGap === 0 && metrics.technicalOperationCount === 1 && metrics.technicalOperationPlannedCount === 1
  && metrics.technicalOperationViolationCount === 0 && violationCount === 0 && technicalOperation.originalProjectionEqual
  && technicalOperation.participantPresenceEqual && technicalOperation.inputUnchanged && technicalOperation.deterministic
  && metrics.branchBudgetConsumed <= problem.budget.maxBranchExpansions && metrics.runtimeMs < 2000;
const scenarios = { ...legacy.scenarios, technicalOperation };
const accepted = legacy.acceptance.accepted && Object.keys(scenarios).length === 16 && technicalAccepted;
process.stdout.write(JSON.stringify({ version: "planner-next-technical-operation-v1", scenarios, jointFutureFeasibilityEvidence: legacy.jointFutureFeasibilityEvidence, setupEvidence: legacy.setupEvidence, boundedBlockConstruction: legacy.boundedBlockConstruction, branchHistoryInvariance: legacy.branchHistoryInvariance, acceptance: { ...legacy.acceptance, accepted, technicalOperationAccepted: technicalAccepted, historicalRegressionIntact: legacy.acceptance.accepted } }, null, 2) + "\n");
