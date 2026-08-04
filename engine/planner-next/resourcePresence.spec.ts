import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { evaluateResourcePresence, resourcePresenceMetrics } from "./resourcePresence";
import { mainFlowResourcePresenceScenario } from "./scenarios/mainFlowResourcePresenceScenario";
import { validatePlan } from "./validate";
test("REQUIRED presence treats only the assigned-space meal as an authorized bridge", () => {
  const resource = { id: "r", availability: [{ start: 0, end: 200 }], presencePreference: "MAXIMUM" as const,
    presenceConcentrationPolicy: "REQUIRED" as const, assignedSpaceId: "main" };
  const tasks = [
    { id: "a", kind: "main", participantId: "p1", coachId: "c", blockKey: "c", duration: 15,
      spaceId: "main", dependencies: [], requiredResourceIds: ["r"], start: 0, end: 15 },
    { id: "b", kind: "main", participantId: "p2", coachId: "c", blockKey: "c", duration: 15,
      spaceId: "main", dependencies: [], requiredResourceIds: ["r"], start: 90, end: 105 },
  ] as ScheduledTask[];
  const authorized = evaluateResourcePresence(resource, tasks,
    [{ id: "meal", kind: "space-meal", spaceId: "main", entryIndex: 1, duration: 75, start: 15, end: 90 }]);
  assert.deepEqual(authorized.preferredLexicographicTuple, [1, 105, 0]);
  assert.equal(authorized.crossesAuthorizedMeal, true);
  assert.equal(authorized.requiredPolicySatisfied, true);
  const foreign = evaluateResourcePresence(resource, tasks,
    [{ id: "meal", kind: "space-meal", spaceId: "other", entryIndex: 1, duration: 75, start: 15, end: 90 }]);
  assert.equal(foreign.operationalBlockCount, 2);
  assert.equal(foreign.requiredPolicySatisfied, false);
});

test("HIGH compacts shared-resource main tasks while OFF remains separated", () => {
  const offProblem = mainFlowResourcePresenceScenario("OFF");
  const before = JSON.stringify(offProblem);
  const off = planMainFlowAndFeeders(offProblem);
  const high = planMainFlowAndFeeders(mainFlowResourcePresenceScenario("HIGH"));
  assert.equal(off.complete && off.metrics.hardValid, true);
  assert.equal(high.complete && high.metrics.hardValid, true);
  assert.equal(high.metrics.plannedTaskCount, 16);
  assert.equal(high.metrics.mainFlowGapMinutes, 0);
  assert.equal(high.metrics.mainFlowEnd, 15 * 60);
  assert.equal(high.metrics.resourcePresenceMinutesById["shared-production-resource"], 60);
  assert.equal(high.metrics.resourceInternalGapMinutesById["shared-production-resource"], 0);
  assert.ok(off.metrics.resourcePresenceMinutesById["shared-production-resource"] > 60);
  const requiredPositions = high.scheduledTasks.filter((task) => task.kind === "main")
    .map((task, index) => ({ task, index })).filter(({ task }) => task.requiredResourceIds?.length).map(({ index }) => index);
  assert.equal(requiredPositions.length, 4);
  assert.equal(requiredPositions.at(-1)! - requiredPositions[0]!, 3);
  assert.equal(JSON.stringify(offProblem), before);
});

test("resource presence helpers include unused resources without mutation", () => {
  const resources = [{ id: "unused", availability: [{ start: 0, end: 10 }], presencePreference: "OFF" as const }];
  const before = JSON.stringify(resources);
  assert.deepEqual(resourcePresenceMetrics(resources, []), {
    presenceMinutesById: { unused: 0 }, internalGapMinutesById: { unused: 0 },
    operationalBlockCountById: { unused: 0 }, authorizedMealMinutesById: { unused: 0 },
  });
  assert.equal(JSON.stringify(resources), before);
});

test("authorized space meals join operational occupations without becoming productive time", () => {
  const resource = { id: "resource", availability: [{ start: 800, end: 950 }], presencePreference: "MAXIMUM" as const, assignedSpaceId: "space" };
  const tasks = [
    { id: "before", kind: "main" as const, participantId: "p1", coachId: "c", blockKey: "x", duration: 15, spaceId: "space", dependencies: [], requiredResourceIds: ["resource"], start: 825, end: 840 },
    { id: "after", kind: "main" as const, participantId: "p2", coachId: "c", blockKey: "x", duration: 15, spaceId: "space", dependencies: [], requiredResourceIds: ["resource"], start: 915, end: 930 },
  ];
  const meal = { id: "meal", kind: "space-meal" as const, spaceId: "space", entryIndex: 0, duration: 75, start: 840, end: 915 };
  const before = JSON.stringify({ resource, tasks, meal });
  assert.deepEqual(evaluateResourcePresence(resource, tasks, [meal]), {
    presenceStart: 825, presenceEnd: 930, presenceSpanMinutes: 105, productiveTaskMinutes: 30,
    authorizedMealMinutes: 75, internalGapMinutes: 0, operationalBlockCount: 1,
    preferredLexicographicTuple: [1, 105, 0],
    crossesAuthorizedMeal: true, requiredPolicySatisfied: true,
  });
  assert.deepEqual(evaluateResourcePresence(resource, tasks, [{ ...meal, spaceId: "other" }]), {
    presenceStart: 825, presenceEnd: 930, presenceSpanMinutes: 105, productiveTaskMinutes: 30,
    authorizedMealMinutes: 0, internalGapMinutes: 75, operationalBlockCount: 2,
    preferredLexicographicTuple: [2, 105, 75],
    crossesAuthorizedMeal: false, requiredPolicySatisfied: true,
  });
  assert.equal(JSON.stringify({ resource, tasks, meal }), before);
});

test("resource preflight errors are explicit and crash-safe", () => {
  const missing = mainFlowResourcePresenceScenario("HIGH");
  missing.resources = [];
  assert.ok(planMainFlowAndFeeders(missing).metrics.reasonCodes.includes("MISSING_RESOURCE_REFERENCE"));
  const duplicate = mainFlowResourcePresenceScenario("HIGH");
  duplicate.tasks.find((task) => task.requiredResourceIds)!.requiredResourceIds = ["shared-production-resource", "shared-production-resource"];
  assert.ok(planMainFlowAndFeeders(duplicate).metrics.reasonCodes.includes("DUPLICATE_TASK_RESOURCE_REQUIREMENT"));
  const feeder = mainFlowResourcePresenceScenario("HIGH");
  feeder.tasks.find(({ kind }) => kind === "vocal")!.requiredResourceIds = ["shared-production-resource"];
  assert.ok(planMainFlowAndFeeders(feeder).metrics.reasonCodes.includes("UNSUPPORTED_FEEDER_RESOURCE_REQUIREMENT"));
  const invalid = mainFlowResourcePresenceScenario("HIGH") as unknown as PlannerNextProblem;
  invalid.resources[0]!.presencePreference = "UNKNOWN" as never;
  assert.ok(planMainFlowAndFeeders(invalid).metrics.reasonCodes.includes("INVALID_RESOURCE_PREFERENCE"));
});

test("resource availability blocks construction and overlap is invalid", () => {
  const unavailable = mainFlowResourcePresenceScenario("HIGH");
  unavailable.resources[0]!.availability = [{ start: 9 * 60, end: 13 * 60 }];
  assert.equal(planMainFlowAndFeeders(unavailable).complete, false);
  const problem = mainFlowResourcePresenceScenario("HIGH");
  const mains = problem.tasks.filter((task) => task.requiredResourceIds).slice(0, 2);
  const scheduled = mains.map((task) => ({ ...task, start: 13 * 60, end: 13 * 60 + 15 })) as ScheduledTask[];
  const validation = validatePlan({ ...problem, tasks: mains }, scheduled);
  assert.equal(validation.resourceOverlapViolationCount, 1);
});

test("resource-scoped meal bridges presence without a false operational block",()=>{
  const resource={id:"r",availability:[{start:480,end:720},{start:780,end:1080}],presencePreference:"OFF" as const,presenceConcentrationPolicy:"REQUIRED" as const};
  const tasks=[{id:"before",kind:"technical" as const,spaceId:"a",dependencies:[],requiredResourceIds:["r"],duration:30,start:690,end:720},{id:"after",kind:"technical" as const,spaceId:"a",dependencies:[],requiredResourceIds:["r"],duration:30,start:780,end:810}];
  const result=evaluateResourcePresence(resource,tasks,[],[{id:"meal",sourceTaskId:"task:meal",resourceIds:["r"],start:720,end:780,duration:60}]);
  assert.deepEqual({span:result.presenceSpanMinutes,meal:result.authorizedMealMinutes,gap:result.internalGapMinutes,blocks:result.operationalBlockCount,crosses:result.crossesAuthorizedMeal,required:result.requiredPolicySatisfied},{span:120,meal:60,gap:0,blocks:1,crosses:true,required:true});
});
