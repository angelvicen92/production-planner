import type { PlanResult, PlannerNextProblem } from "../contracts";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { mainFlowVocalBacktrackingScenario } from "../scenarios/mainFlowVocalBacktrackingScenario";
import { mainFlowVocalScenario } from "../scenarios/mainFlowVocalScenario";
import { formatMinute } from "../time";
import { mainFlowResourcePresenceScenario } from "../scenarios/mainFlowResourcePresenceScenario";

function logicalMetrics(result: PlanResult) {
  const metrics = result.metrics;
  return {
    complete: result.complete,
    hardValid: metrics.hardValid,
    plannedTaskCount: metrics.plannedTaskCount,
    unplannedTaskCount: metrics.unplannedTaskCount,
    mainFlowStart: formatMinute(metrics.mainFlowStart),
    mainFlowEnd: formatMinute(metrics.mainFlowEnd),
    mainFlowGapMinutes: metrics.mainFlowGapMinutes,
    reasonCodes: metrics.reasonCodes,
    planFingerprint: metrics.planFingerprint,
    backtracks: metrics.backtracks,
    patternsGenerated: metrics.patternsGenerated,
    patternsEvaluated: metrics.patternsEvaluated,
    branchBudgetConsumed: metrics.branchBudgetConsumed,
    searchStopReason: metrics.searchStopReason,
    resourcePresenceMinutesById: metrics.resourcePresenceMinutesById,
    resourceInternalGapMinutesById: metrics.resourceInternalGapMinutesById,
    violationCount: metrics.dependencyViolationCount
      + metrics.overlapViolationCount
      + metrics.transitionViolationCount
      + metrics.availabilityViolationCount
      + metrics.blockViolationCount
      + metrics.resourceAvailabilityViolationCount
      + metrics.resourceOverlapViolationCount,
  };
}

function run(factory: () => PlannerNextProblem) {
  const first = planMainFlowAndFeeders(factory());
  const second = planMainFlowAndFeeders(factory());
  return {
    ...logicalMetrics(first),
    runtimeMs: first.metrics.runtimeMs,
    deterministic: JSON.stringify(logicalMetrics(first)) === JSON.stringify(logicalMetrics(second)),
  };
}

const baseline = run(mainFlowVocalScenario);
const adversarial = run(mainFlowVocalBacktrackingScenario);
const adversarialZeroBacktracks = run(() => {
  const problem = mainFlowVocalBacktrackingScenario();
  problem.budget.maxBacktracks = 0;
  return problem;
});
const resourceOff = run(() => mainFlowResourcePresenceScenario("OFF"));
const resourceHigh = run(() => mainFlowResourcePresenceScenario("HIGH"));
const accepted = baseline.complete
  && baseline.hardValid
  && baseline.planFingerprint === "070b4d4a2259b629b8e818fd6e34ea4bba63c05f87d60b4b5f4cbfc7b1b6848b"
  && adversarial.complete
  && adversarial.hardValid
  && adversarial.backtracks >= 1
  && adversarialZeroBacktracks.searchStopReason === "BACKTRACK_BUDGET_EXHAUSTED"
  && resourceOff.complete && resourceOff.hardValid
  && resourceHigh.complete && resourceHigh.hardValid
  && resourceHigh.resourcePresenceMinutesById["shared-production-resource"] === 60
  && resourceHigh.resourceInternalGapMinutesById["shared-production-resource"] === 0
  && resourceOff.resourcePresenceMinutesById["shared-production-resource"] > 60
  && [baseline, adversarial, adversarialZeroBacktracks, resourceOff, resourceHigh].every(
    (scenario) => scenario.deterministic && scenario.runtimeMs < 2_000,
  );

process.stdout.write(`${JSON.stringify({
  version: "planner-next-resource-presence-v1",
  scenarios: { baseline, adversarial, adversarialZeroBacktracks, resourceOff, resourceHigh },
  acceptance: { accepted },
}, null, 2)}\n`);
