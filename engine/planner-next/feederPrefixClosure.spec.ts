import assert from "node:assert/strict";
import test from "node:test";
import { assessPlacedMainFeederClosure } from "./feederPrefixClosure";
import { planMainFlowAndFeeders, diagnoseGreedyFeederClosure } from "./planMainFlowAndFeeders";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import { mainFlowVocalBacktrackingScenario } from "./scenarios/mainFlowVocalBacktrackingScenario";

const firstScheduledMain = () => {
  const problem = mainFlowVocalScenario();
  const planned = planMainFlowAndFeeders(problem);
  const task = planned.scheduledTasks.find(candidate => candidate.kind === "main")!;
  return { problem, structural: [task] };
};

test("a feedable placed-main prefix returns a bounded deterministic witness without mutation", () => {
  const { problem, structural } = firstScheduledMain(); const before = JSON.stringify(problem);
  const first = assessPlacedMainFeederClosure(problem, structural, [], 10_000, 1);
  const second = assessPlacedMainFeederClosure(problem, [...structural].reverse(), [], 10_000, 1);
  assert.equal(first.feasible, true); assert.equal(first.exhausted, false); assert.equal(first.completeClosureCount, 1);
  assert.equal(first.witnessFeeders?.length, 1); assert.equal(first.consumedBranches, 0);
  assert.deepEqual(first, second); assert.equal(JSON.stringify(problem), before);
});

test("an impossible feeder prefix is pruned with canonical feeder and main blockers", () => {
  const { problem, structural } = firstScheduledMain();
  const feeder = problem.tasks.find(task => task.kind === "vocal" && task.participantId === structural[0]!.participantId)!;
  feeder.availability = [{ start: problem.day.start, end: problem.day.start + 1 }];
  const result = assessPlacedMainFeederClosure(problem, structural, [], 10_000, 1);
  assert.equal(result.feasible, false); assert.equal(result.exhausted, false);
  assert.deepEqual(result.blockingFeederIds, [feeder.id]);
  assert.deepEqual(result.blockingMainTaskIds, [structural[0]!.id]);
});

test("allowance exhaustion is explicit and publishes no closure", () => {
  const { problem, structural } = firstScheduledMain();
  const feeder = problem.tasks.find(task => task.kind === "vocal" && task.participantId === structural[0]!.participantId)!;
  feeder.availability = [{ start: problem.day.start, end: problem.day.start + 1 }];
  const result = assessPlacedMainFeederClosure(problem, structural, [], 0, 1);
  assert.equal(result.feasible, false); assert.equal(result.exhausted, true);
  assert.equal(result.consumedBranches, 0); assert.equal(result.completeClosureCount, 0);
  assert.equal(result.witnessFeeders, undefined);
});

test("closeFeeders remains authoritative when the greedy diagnostic fails", () => {
  const problem = mainFlowVocalBacktrackingScenario();
  const planned = planMainFlowAndFeeders(problem);
  const mains = planned.scheduledTasks.filter(task => task.kind === "main");
  const greedy = diagnoseGreedyFeederClosure(problem, mains, planned.scheduledSpaceMeals);
  const authoritative = assessPlacedMainFeederClosure(problem, mains, planned.scheduledSpaceMeals, 20_000, problem.budget.bestK);
  assert.equal(greedy.complete, false);
  assert.equal(authoritative.feasible, true);
});

test("planner prefix pruning is structural, budgeted once, and never fabricates backtracks", () => {
  const problem = mainFlowVocalScenario();
  const feeder = problem.tasks.find(task => task.kind === "vocal")!;
  feeder.availability = [{ start: problem.day.start, end: problem.day.start + 1 }];
  const result = planMainFlowAndFeeders(problem);
  assert.equal(result.complete, false); assert.deepEqual(result.scheduledTasks, []);
  assert.equal(result.metrics.feederPrefixClosureCheckCount > 0, true);
  assert.equal(result.metrics.feederPrefixClosurePruneCount > 0, true);
  assert.equal(result.metrics.feederPrefixClosureBranchesExplored <= result.metrics.branchesExplored, true);
  assert.equal(result.metrics.mainCompleteLeafAttemptCount, 0);
  assert.equal(result.metrics.mainBacktrackCount, 0);
});
