import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { resourcePresenceMetrics } from "./resourcePresence";
import { mainFlowResourcePresenceScenario } from "./scenarios/mainFlowResourcePresenceScenario";
import { validatePlan } from "./validate";

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
  assert.deepEqual(resourcePresenceMetrics(resources, []), { presenceMinutesById: { unused: 0 }, internalGapMinutesById: { unused: 0 } });
  assert.equal(JSON.stringify(resources), before);
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
