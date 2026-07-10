import test from "node:test";
import assert from "node:assert/strict";
import type { EngineInput } from "./types";
import { buildEngineScenarioSnapshot, hashEngineInput, parseEngineScenarioSnapshot, validateEngineScenarioSnapshot } from "./scenarioSnapshot";

const input = (): EngineInput => ({ planId: 259, workDay: { start: "09:00", end: "10:00" }, meal: { start: "13:00", end: "14:00" }, camerasAvailable: 1, tasks: [{ id: 2, planId: 259, templateId: 20, status: "pending", contestantId: null, zoneId: 1, spaceId: 1, dependsOnTaskIds: [1], resourceRequirements: undefined as any }, { id: 1, planId: 259, templateId: 10, status: "done", contestantId: 7, zoneId: 1, spaceId: 1, startPlanned: "09:00", endPlanned: "09:10" }], locks: [], zoneResourceAssignments: {}, spaceResourceAssignments: {}, zoneResourceTypeRequirements: {}, spaceResourceTypeRequirements: {}, planResourceItems: [], resourceItemComponents: {}, groupingZoneIds: [] });

test("scenario snapshot serializes, preserves order/null, strips undefined, and does not mutate", () => { const original = input(); const before = structuredClone(original); const snapshot = buildEngineScenarioSnapshot(259, original, "2026-07-10T00:00:00.000Z"); assert.deepEqual(original, before); assert.equal(snapshot.exportVersion, "optiplan-engine-scenario-v1"); assert.equal(snapshot.counts.tasks, 2); assert.equal(snapshot.counts.pendingTasks, 1); assert.deepEqual(snapshot.engineInput.tasks.map((t) => t.id), [2, 1]); assert.equal(snapshot.engineInput.tasks[0].contestantId, null); assert.equal("resourceRequirements" in snapshot.engineInput.tasks[0], false); const parsed = parseEngineScenarioSnapshot(JSON.stringify(snapshot)); assert.deepEqual(parsed.engineInput, snapshot.engineInput); });

test("engine input hash is stable with object keys sorted but array order preserved", () => { const a = input(); const b = { ...input(), tasks: [...input().tasks] } as EngineInput; assert.equal(hashEngineInput(a), hashEngineInput(b)); b.tasks = [...b.tasks].reverse(); assert.notEqual(hashEngineInput(a), hashEngineInput(b)); });

test("scenario snapshot rejects tampering and unknown versions", () => { const snapshot: any = buildEngineScenarioSnapshot(259, input()); snapshot.engineInput.tasks[0].templateId = 999; assert.throws(() => validateEngineScenarioSnapshot(snapshot), /inputHash mismatch/); const unknown = buildEngineScenarioSnapshot(259, input()) as any; unknown.exportVersion = "other"; assert.throws(() => validateEngineScenarioSnapshot(unknown), /Unsupported/); });

test("countEngineInput counts only real contestants and availability, not null meal placeholders", () => {
  const base = input();
  base.contestantAvailabilityById = Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 1, { start: "09:00", end: "18:00" }]));
  base.tasks = [
    ...Array.from({ length: 19 }, (_, i) => ({ id: i + 1, planId: 259, templateId: 10, status: "pending" as const, contestantId: i + 1, spaceId: 1, zoneId: 1 })),
    ...Array.from({ length: 26 }, (_, i) => ({ id: 100 + i, planId: 259, templateId: 99, templateName: "Comida", status: "pending" as const, contestantId: null, spaceId: 1, zoneId: 1, operationalRole: "meal_break_placeholder" as const, breakKind: "space_meal" }))
  ];
  assert.equal(buildEngineScenarioSnapshot(259, base).counts.contestants, 19);
});
