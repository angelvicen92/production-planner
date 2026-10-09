import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "../contracts";
import { probeSingleChainClosureContinuation } from "./collectiveClosureSufficiencyProbe";
import { PreparedFutureCollectiveParticipantClosure } from "../futureCollectiveParticipantClosure";
import { exactTaskStartDomain } from "../placement";
import { validatePlan } from "../validate";

export function singleChainClosureFixture(): PlannerNextProblem {
  const availability = [{ start: 0, end: 50 }];
  const priors: Task[] = ["a", "b"].map(id => ({ id: `prior-${id}`, kind: "auxiliary", participantId: id,
    duration: 10, spaceId: `prior-${id}`, requiredResourceIds: ["exclusive"], dependencies: [],
    availability: [{ start: 0, end: 30 }] }));
  const policy = { id: "chain", orderedTaskIds: priors.map(task => task.id), adjacency: "REQUIRED" as const,
    resourceContinuity: "REQUIRED" as const, requiredResourceIds: ["exclusive"] };
  const terminal: Task[] = ["a", "b"].flatMap(id => [
    { id: `close-${id}`, kind: "auxiliary", participantId: id, duration: 5, spaceId: "styling",
      dependencies: [`prior-${id}`], availability: [{ start: 20, end: 30 }], participantMarginAfterMinutes: 0 },
    { id: `out-${id}`, kind: "auxiliary", participantId: id, duration: 5, spaceId: "exit",
      dependencies: [`close-${id}`], participantMarginBeforeMinutes: 0 },
  ]);
  const current: Task = { id: "current", kind: "auxiliary", participantId: "core", duration: 10,
    spaceId: "current", requiredResourceIds: ["exclusive"], dependencies: [],
    availability: [{ start: 0, end: 10 }, { start: 30, end: 40 }] };
  const direction = { minimumGroupSize: 1, maximumGroupSize: 2, minGapMinutes: 0, groupingWeight: 0 };
  return { day: availability[0]!, tasks: [...priors, ...terminal, current],
    spaces: ["prior-a", "prior-b", "styling", "exit", "current"].map(id => ({ id, availability })),
    resources: [{ id: "exclusive", availability, transitionMinutes: 0, presencePreference: "OFF" }],
    participants: ["a", "b", "core"].map(id => ({ id, availability })), coaches: [],
    mainFlow: { spaceId: "current", preferredEnd: 50, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0, technicalChains: [policy],
    analyticalFutureTechnicalChains: [{ policy, tasks: priors }],
    transportPolicy: { arrival: { ...direction, taskIds: [] }, departure: { ...direction, taskIds: ["out-a", "out-b"] } },
    budget: { bestK: 1, maxPatterns: 20, maxBacktracks: 0, maxBranchExpansions: 1000 } };
}
const currentAt = (problem: PlannerNextProblem, start: number): ScheduledTask =>
  ({ ...problem.tasks.find(task => task.id === "current")!, start, end: start + 10 });

test("isolated Stage continuation rejects the first destructive decision and advances with a joint certificate", () => {
  const problem = singleChainClosureFixture(), saved = structuredClone(problem);
  const current = problem.tasks.find(task => task.id === "current")!;
  const attempts = [...exactTaskStartDomain(problem, current, []).starts()].map(start =>
    ({ placement: currentAt(problem, start), result: probeSingleChainClosureContinuation(problem, [currentAt(problem, start)]) }));
  assert.deepEqual(attempts.map(attempt => attempt.result.outcome), ["REJECTED_CANDIDATE", "CERTIFIED_FRONTIER"]);
  const acceptedA = attempts[1]!.placement;
  const priorA = attempts[1]!.result.witness!.tasks.find(task => task.id === "prior-a")!;
  const next = probeSingleChainClosureContinuation(problem, [acceptedA, priorA]);
  assert.equal(next.outcome, "CERTIFIED_FRONTIER");
  assert.deepEqual(next.witness!.tasks.find(task => task.id === acceptedA.id), acceptedA);
  assert.deepEqual(next.witness!.tasks.find(task => task.id === priorA.id), priorA);
  assert.equal(validatePlan(problem, next.witness!.tasks).hardValid, true);
  assert.deepEqual(problem, saved);
  assert.equal(attempts[0]!.result.witness, null);
});

test("individually possible ancestors sharing an exclusive resource never become a positive certificate", () => {
  const problem = singleChainClosureFixture();
  for (const task of problem.analyticalFutureTechnicalChains![0]!.tasks) task.availability = [{ start: 0, end: 10 }];
  const necessary = new PreparedFutureCollectiveParticipantClosure(problem).evaluate([currentAt(problem, 30)], [], undefined, "NECESSARY_ONLY");
  assert.equal(necessary.status, "PASS"); assert.equal(necessary.certified, false);
  const result = probeSingleChainClosureContinuation(problem, [currentAt(problem, 30)]);
  assert.equal(result.outcome, "REJECTED_CANDIDATE"); assert.equal(result.witness, null);
});

test("collective slot loss and individually impossible OUT both prevent acceptance", () => {
  for (const scenario of ["HALL", "OUT"]) {
    const problem = singleChainClosureFixture();
    if (scenario === "HALL") for (const task of problem.tasks.filter(task => task.id.startsWith("close-")))
      task.availability = [{ start: 20, end: 25 }];
    else problem.tasks.find(task => task.id === "out-b")!.availability = [{ start: 0, end: 5 }];
    const result = probeSingleChainClosureContinuation(problem, [currentAt(problem, 30)]);
    assert.equal(result.outcome, "REJECTED_CANDIDATE", scenario); assert.equal(result.witness, null);
  }
});

test("an ordinary unrepresented ancestor is an exact missing dependency, never a dropped transitive vertex", () => {
  const problem = singleChainClosureFixture();
  problem.tasks.push({ id: "residual", kind: "auxiliary", spaceId: "current", participantId: "a", duration: 5, dependencies: [] });
  problem.tasks.find(task => task.id === "prior-a")!.dependencies = ["residual"];
  const result = probeSingleChainClosureContinuation(problem, [currentAt(problem, 30)]);
  assert.equal(result.outcome, "INCONCLUSIVE"); assert.deepEqual(result.missingContextTaskIds, ["residual"]);
  assert.equal(result.branches, 0); assert.equal(result.witness, null);
});

test("a placement/closure certificate does not replace the REQUIRED technical-chain authority", () => {
  const problem = singleChainClosureFixture(), priors = problem.analyticalFutureTechnicalChains![0]!.tasks;
  const fixed = [currentAt(problem, 30), { ...priors[0]!, start: 0, end: 10 }, { ...priors[1]!, start: 15, end: 25 }];
  const closure = new PreparedFutureCollectiveParticipantClosure(problem).evaluate(fixed);
  assert.equal(closure.certified, true, "placement replay and OUT do not enforce chain adjacency");
  const continuation = probeSingleChainClosureContinuation(problem, fixed);
  assert.equal(continuation.outcome, "REJECTED_CANDIDATE"); assert.equal(continuation.witness, null);
});

test("protected singleton domains cannot override the original canonical availability", () => {
  const problem = singleChainClosureFixture(), priors = problem.analyticalFutureTechnicalChains![0]!.tasks;
  priors[0]!.availability = [{ start: 10, end: 20 }];
  const outsideSource = { ...priors[0]!, start: 0, end: 10 };
  const result = probeSingleChainClosureContinuation(problem, [currentAt(problem, 30), outsideSource]);
  assert.notEqual(result.outcome, "CERTIFIED_FRONTIER"); assert.equal(result.witness, null);
});

test("budget uncertainty, determinism and diagnostic neutrality preserve the original product result", () => {
  const problem = singleChainClosureFixture();
  const fixed = [currentAt(problem, 30)], saved = structuredClone({ problem, fixed });
  const first = probeSingleChainClosureContinuation(problem, fixed), second = probeSingleChainClosureContinuation(problem, fixed);
  assert.deepEqual(first, second); assert.deepEqual({ problem, fixed }, saved);
  problem.budget.maxBranchExpansions = 1;
  const exhausted = probeSingleChainClosureContinuation(problem, fixed);
  assert.equal(exhausted.outcome, "BUDGET_EXHAUSTED"); assert.equal(exhausted.witness, null); assert.ok(exhausted.branches <= 1);
});
