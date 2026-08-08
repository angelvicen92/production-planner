import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem } from "./contracts";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";
import { preflight } from "./validate";

function problem(): PlannerNextProblem {
  const value = mainFlowVocalScenario();
  value.transportPolicy = {
    arrival: { taskIds: [value.tasks[0]!.id], minimumGroupSize: 3, maximumGroupSize: 6, minGapMinutes: 0, groupingWeight: 0 },
    departure: { taskIds: [value.tasks[1]!.id], minimumGroupSize: 3, maximumGroupSize: 6, minGapMinutes: 20, groupingWeight: 3 },
  };
  return value;
}

test("transport policy structural preflight accepts the complete canonical contract", () => {
  assert.equal(preflight(problem()).includes("INVALID_TRANSPORT_POLICY"), false);
});

test("transport policy rejects missing, duplicate, unknown, and cross-direction task IDs", () => {
  const mutations: Array<(value: PlannerNextProblem) => void> = [
    (value) => { (value.transportPolicy!.arrival as any).taskIds = undefined; },
    (value) => { value.transportPolicy!.arrival.taskIds.push(value.transportPolicy!.arrival.taskIds[0]!); },
    (value) => { value.transportPolicy!.arrival.taskIds = ["missing-task"]; },
    (value) => { value.transportPolicy!.departure.taskIds = [...value.transportPolicy!.arrival.taskIds]; },
  ];
  for (const mutate of mutations) {
    const value = problem(); mutate(value);
    assert.ok(preflight(value).includes("INVALID_TRANSPORT_POLICY"));
  }
});

test("transport policy rejects incomplete and invalid numeric contracts", () => {
  const mutations: Array<(value: PlannerNextProblem) => void> = [
    (value) => { (value.transportPolicy as any).departure = undefined; },
    (value) => { (value.transportPolicy!.arrival as any).minimumGroupSize = undefined; },
    (value) => { value.transportPolicy!.arrival.minimumGroupSize = 1.5; },
    (value) => { value.transportPolicy!.arrival.maximumGroupSize = 0; },
    (value) => { value.transportPolicy!.arrival.minimumGroupSize = 7; },
    (value) => { value.transportPolicy!.arrival.minGapMinutes = -1; },
    (value) => { value.transportPolicy!.arrival.minGapMinutes = 0.5; },
    (value) => { value.transportPolicy!.arrival.groupingWeight = Number.NaN; },
    (value) => { value.transportPolicy!.arrival.groupingWeight = -1; },
  ];
  for (const mutate of mutations) {
    const value = problem(); mutate(value);
    assert.ok(preflight(value).includes("INVALID_TRANSPORT_POLICY"));
  }
});
