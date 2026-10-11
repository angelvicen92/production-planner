import assert from "node:assert/strict";
import test from "node:test";
import { createSupportedEngineInputAdapterFixture } from "./integration/engineInputAdapter.fixture";
import { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";
import { buildAssistedProblem } from "./assistedPlanning";
import type { ScheduledTask } from "./contracts";
import { pendingScopeTasks, locationScopeTaskIds, taskIdsScopeSelector } from "../../client/src/lib/assisted-scope-selection";
import { resolveAssistedScope } from "../../server/assistedScopeResolver";
import { validatePlan } from "./validate";

test("multi-space TASK_IDS preserves independent capacity and simultaneous work, with no zone precedence", () => {
  const input = createSupportedEngineInputAdapterFixture();
  input.locks = []; input.tasks = [
    { id: 1, planId: input.planId, templateId: 1, status: "pending", plannerNextKind: "auxiliary", contestantId: 201, spaceId: 301, zoneId: 401, durationOverrideMin: 30 },
    { id: 2, planId: input.planId, templateId: 2, status: "pending", plannerNextKind: "auxiliary", contestantId: 202, spaceId: 302, zoneId: 401, durationOverrideMin: 30 },
    { id: 3, planId: input.planId, templateId: 3, status: "pending", plannerNextKind: "auxiliary", contestantId: 201, spaceId: 301, zoneId: 401, durationOverrideMin: 30 },
  ];
  input.spaceResourceAssignments = {}; input.zoneResourceAssignments = {};
  input.contestantAvailabilityById = { 201: { start: "08:00", end: "18:00" }, 202: { start: "08:00", end: "18:00" } };
  input.plannerNext!.participantTransitionMinutes = 0;
  input.planSpaceSettings = [301, 302].map(spaceId => ({ spaceId, zoneId: 401, availabilityStart: "08:00", availabilityEnd: "09:00", source: "fixture" }));
  const before = structuredClone(input), adapter = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapter.status, "SUPPORTED", JSON.stringify(adapter)); if (adapter.status !== "SUPPORTED") return;
  const spaces = [301, 302].map(id => ({ id, zoneId: 401, name: "Non-authoritative" }));
  const ids = locationScopeTaskIds(pendingScopeTasks(input.tasks.map(task => ({ ...task, spaceId: task.spaceId ?? null })), null), spaces, [302, 301]);
  const resolution = resolveAssistedScope(input, adapter, taskIdsScopeSelector(ids)!);
  const assisted = buildAssistedProblem(adapter.problem, resolution.scope, []);
  assert.ok(assisted.problem.tasks.every(task => task.dependencies.length === 0));
  const rows: ScheduledTask[] = assisted.problem.tasks.map(task => ({ ...task, start: task.id === "task:3" ? 510 : 480, end: task.id === "task:3" ? 540 : 510 }));
  const left = rows.find(task => task.id === "task:1")!, right = rows.find(task => task.id === "task:2")!, later = rows.find(task => task.id === "task:3")!;
  assert.equal(left.start, right.start, "independent spaces can run simultaneously");
  assert.ok(left.end <= later.start || later.end <= left.start, "one space retains its own capacity");
  assert.equal(validatePlan(assisted.originalValidationProblem, rows).hardValid, true);
  const overlapping = rows.map(task => task.id === "task:3" ? { ...task, start: 480, end: 510 } : task);
  assert.equal(validatePlan(assisted.originalValidationProblem, overlapping).hardValid, false, "capacity is still enforced within a space");
  assert.deepEqual(input, before);
});
