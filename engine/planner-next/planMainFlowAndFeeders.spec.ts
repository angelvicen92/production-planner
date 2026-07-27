import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { mainFlowVocalBacktrackingScenario } from "./scenarios/mainFlowVocalBacktrackingScenario";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import { hm } from "./time";

const BASELINE_FINGERPRINT = "070b4d4a2259b629b8e818fd6e34ea4bba63c05f87d60b4b5f4cbfc7b1b6848b";

test("NEXT-001 retains its frozen complete, hard-valid result", () => {
  const problem = mainFlowVocalScenario();
  const before = JSON.stringify(problem);
  const result = planMainFlowAndFeeders(problem);
  assert.equal(result.complete, true);
  assert.equal(result.metrics.hardValid, true);
  assert.equal(result.metrics.plannedTaskCount, 16);
  assert.equal(result.metrics.unplannedTaskCount, 0);
  assert.equal(result.metrics.mainFlowStart, hm("13:00"));
  assert.equal(result.metrics.mainFlowEnd, hm("15:00"));
  assert.equal(result.metrics.mainFlowGapMinutes, 0);
  assert.equal(result.metrics.maxParticipantPresenceMinutes <= 90, true);
  assert.equal(result.metrics.planFingerprint, BASELINE_FINGERPRINT);
  assert.equal(JSON.stringify(problem), before);
});

test("the adversarial scenario proves genuine bounded backtracking", () => {
  const zeroBudget = mainFlowVocalBacktrackingScenario();
  zeroBudget.budget.maxBacktracks = 0;
  const stopped = planMainFlowAndFeeders(zeroBudget);
  assert.equal(stopped.complete, false);
  assert.deepEqual(stopped.scheduledTasks, []);
  assert.deepEqual(stopped.metrics.reasonCodes, ["BACKTRACK_BUDGET_EXHAUSTED"]);
  assert.equal(stopped.metrics.backtracks, 0);

  const problem = mainFlowVocalBacktrackingScenario();
  const result = planMainFlowAndFeeders(problem);
  assert.equal(result.complete, true);
  assert.equal(result.metrics.hardValid, true);
  assert.equal(result.metrics.backtracks >= 1, true);
  assert.equal(result.metrics.backtracks <= problem.budget.maxBacktracks, true);
  assert.equal(result.metrics.plannedTaskCount, 16);
  assert.equal(result.metrics.mainFlowEnd, hm("15:00"));
  assert.equal(result.metrics.mainFlowGapMinutes, 0);
  assert.equal(
    result.metrics.dependencyViolationCount
      + result.metrics.overlapViolationCount
      + result.metrics.transitionViolationCount
      + result.metrics.availabilityViolationCount
      + result.metrics.blockViolationCount,
    0,
  );
});

test("partial branch rejection is not counted as backtracking", () => {
  const result = planMainFlowAndFeeders(mainFlowVocalScenario());
  assert.equal(result.complete, true);
  assert.equal(result.metrics.branchesExplored > result.metrics.alternativesGenerated, true);
  assert.equal(result.metrics.backtracks, 0);
});

test("logical search budgets stop atomically with specific reasons", () => {
  const patternLimited = mainFlowVocalScenario();
  patternLimited.budget.maxPatterns = 1;
  const patternResult = planMainFlowAndFeeders(patternLimited);
  assert.equal(patternResult.complete, false);
  assert.deepEqual(patternResult.scheduledTasks, []);
  assert.deepEqual(patternResult.metrics.reasonCodes, ["PATTERN_BUDGET_EXHAUSTED"]);

  const branchLimited = mainFlowVocalScenario();
  branchLimited.budget.maxBranchExpansions = 1;
  const branchResult = planMainFlowAndFeeders(branchLimited);
  assert.equal(branchResult.complete, false);
  assert.deepEqual(branchResult.scheduledTasks, []);
  assert.deepEqual(branchResult.metrics.reasonCodes, ["BRANCH_BUDGET_EXHAUSTED"]);
  assert.equal(branchResult.metrics.branchBudgetConsumed, 1);
});

test("missing relationships and invalid availability never crash", () => {
  const missingFeeder = mainFlowVocalScenario();
  missingFeeder.tasks = missingFeeder.tasks.filter(({ id }) => id !== "vocal-participant-a");
  assert.ok(planMainFlowAndFeeders(missingFeeder).metrics.reasonCodes.includes("MISSING_FEEDER_TASK"));

  const missingCoach = mainFlowVocalScenario();
  missingCoach.tasks[0] = { ...missingCoach.tasks[0], coachId: "absent-coach" };
  assert.ok(planMainFlowAndFeeders(missingCoach).metrics.reasonCodes.includes("MISSING_COACH_REFERENCE"));

  const missingSpace = mainFlowVocalScenario();
  missingSpace.tasks[0] = { ...missingSpace.tasks[0], spaceId: "absent-space" };
  assert.ok(planMainFlowAndFeeders(missingSpace).metrics.reasonCodes.includes("MISSING_SPACE_REFERENCE"));

  const invalidAvailability = mainFlowVocalScenario();
  invalidAvailability.participants[0] = {
    ...invalidAvailability.participants[0],
    availability: [{ start: hm("12:00"), end: hm("11:00") }],
  };
  assert.ok(planMainFlowAndFeeders(invalidAvailability).metrics.reasonCodes.includes("INVALID_AVAILABILITY_WINDOW"));
});

test("unsupported focal structures are rejected explicitly", () => {
  const duplicateMain = mainFlowVocalScenario();
  const main = duplicateMain.tasks.find(({ kind }) => kind === "main");
  assert.ok(main);
  duplicateMain.tasks.push({ ...main, id: `${main.id}-duplicate` });
  assert.ok(planMainFlowAndFeeders(duplicateMain).metrics.reasonCodes.includes("MULTIPLE_MAIN_TASKS_FOR_PARTICIPANT"));

  const coachMismatch = mainFlowVocalScenario();
  const vocal = coachMismatch.tasks.find(({ kind }) => kind === "vocal");
  assert.ok(vocal);
  vocal.coachId = vocal.coachId === "coach-a" ? "coach-b" : "coach-a";
  assert.ok(planMainFlowAndFeeders(coachMismatch).metrics.reasonCodes.includes("MAIN_FEEDER_COACH_MISMATCH"));

  const mixedDuration = mainFlowVocalScenario();
  const firstMain = mixedDuration.tasks.find(({ kind }) => kind === "main");
  assert.ok(firstMain);
  firstMain.duration = 20;
  assert.ok(planMainFlowAndFeeders(mixedDuration).metrics.reasonCodes.includes("UNSUPPORTED_MAIN_DURATION_MIX"));
});

test("results and logical metrics are deterministic and array-order independent", () => {
  const problem = mainFlowVocalScenario();
  const reversed = {
    ...problem,
    participants: [...problem.participants].reverse(),
    coaches: [...problem.coaches].reverse(),
    spaces: [...problem.spaces].reverse(),
    tasks: [...problem.tasks].reverse(),
  };
  const first = planMainFlowAndFeeders(problem);
  const second = planMainFlowAndFeeders(problem);
  const reordered = planMainFlowAndFeeders(reversed);
  const logical = (result: typeof first) => ({
    fingerprint: result.metrics.planFingerprint,
    backtracks: result.metrics.backtracks,
    patternsGenerated: result.metrics.patternsGenerated,
    patternsEvaluated: result.metrics.patternsEvaluated,
    branchBudgetConsumed: result.metrics.branchBudgetConsumed,
  });
  assert.deepEqual(logical(first), logical(second));
  assert.deepEqual(logical(first), logical(reordered));
  assert.deepEqual(first.scheduledTasks, reordered.scheduledTasks);
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return sourceFiles(`${directory}/${entry.name}`);
    return /\.tsx?$/.test(entry.name) ? [`${directory}/${entry.name}`] : [];
  });
}

test("planner-next remains isolated from legacy and production", () => {
  for (const file of sourceFiles("engine/planner-next").filter((name) => !name.endsWith(".spec.ts"))) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /engine\/(v3|v4|orc)|generatePlanV[34]|orcActivePlanner/);
  }
  for (const root of ["server", "client", "shared"]) {
    for (const file of sourceFiles(root)) assert.doesNotMatch(readFileSync(file, "utf8"), /planner-next/);
  }
  for (const file of ["engine/solve.ts", "engine/buildInput.ts", "engine/types.ts"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /planner-next/);
  }
});
