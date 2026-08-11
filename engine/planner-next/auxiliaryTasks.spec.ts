import assert from "node:assert/strict";
import test from "node:test";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { participantPresenceIncrement, participantPresenceSpan } from "./participantPresence";
import { auxiliaryScarcityScenario } from "./scenarios/auxiliaryScarcityScenario";
import { preflight, validatePlan } from "./validate";

test("presence helpers are pure, order independent, and handle empty input", () => {
  const tasks = [{ id:"x",kind:"auxiliary" as const,participantId:"p",duration:5,spaceId:"s",dependencies:[],start:20,end:25 }, { id:"y",kind:"auxiliary" as const,participantId:"p",duration:5,spaceId:"s",dependencies:[],start:10,end:15 }];
  assert.equal(participantPresenceSpan("none", tasks), 0);
  assert.equal(participantPresenceSpan("p", tasks), 15);
  assert.equal(participantPresenceIncrement("p", tasks, { ...tasks[0]!, id:"z", start:30, end:35 }), 10);
  assert.deepEqual(tasks.map((x) => x.id), ["x", "y"]);
});

test("dynamic scarcity is deterministic, array-order independent, and HIGH reduces presence", () => {
  const offProblem = auxiliaryScarcityScenario("OFF");
  const snapshot = JSON.stringify(offProblem);
  const off = planMainFlowAndFeeders(offProblem);
  const high = planMainFlowAndFeeders(auxiliaryScarcityScenario("HIGH"));
  assert.equal(JSON.stringify(offProblem), snapshot);
  for (const result of [off, high]) {
    assert.equal(result.complete, true); assert.equal(result.scheduledTasks.length, 20); assert.equal(validatePlan(auxiliaryScarcityScenario(result === off ? "OFF" : "HIGH"), result.scheduledTasks).hardValid, true);
    assert.match(result.metrics.auxiliarySelectionOrder[0]!, /scarce/);
    assert.equal(result.metrics.resourceTransitionViolationCount, 0);
  }
  assert.ok(high.metrics.totalParticipantPresenceMinutes < off.metrics.totalParticipantPresenceMinutes);
  const reordered = auxiliaryScarcityScenario("HIGH"); reordered.tasks.reverse(); reordered.participants.reverse(); reordered.spaces.reverse();
  assert.equal(planMainFlowAndFeeders(reordered).metrics.planFingerprint, high.metrics.planFingerprint);
  assert.equal(planMainFlowAndFeeders(auxiliaryScarcityScenario("HIGH")).metrics.planFingerprint, high.metrics.planFingerprint);
});

test("auxiliary contract failures are stable and crash safe", () => {
  for (const [mutate, code] of [
    [(p:any) => { delete p.auxiliaryPolicy; }, "MISSING_AUXILIARY_POLICY"],
    [(p:any) => { p.auxiliaryPolicy.participantPresencePreference="WRONG"; }, "INVALID_AUXILIARY_POLICY"],
    [(p:any) => { p.tasks.find((x:any)=>x.kind==="auxiliary").coachId="coach-a"; }, "AUXILIARY_COACH_UNSUPPORTED"],
    [(p:any) => { p.tasks.find((x:any)=>x.kind==="auxiliary").blockKey="x"; }, "AUXILIARY_BLOCK_KEY_UNSUPPORTED"],
    [(p:any) => { p.tasks.find((x:any)=>x.kind==="auxiliary").dependencies=["missing-task"]; }, "MISSING_TASK_REFERENCE"],
  ] as const) { const p=auxiliaryScarcityScenario("OFF") as any; mutate(p); assert.ok(preflight(p).includes(code)); }
});

test("impossible auxiliary planning is atomic", () => {
  const problem=auxiliaryScarcityScenario("HIGH"); problem.resources[0]!.availability=[{start:540,end:545}];
  const result=planMainFlowAndFeeders(problem); assert.equal(result.complete,false); assert.deepEqual(result.scheduledTasks,[]);
});
