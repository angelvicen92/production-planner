import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput, TaskInput } from "../../types";
import { realProductionScenarios } from "../../orc/benchmarks/fixtures/real-scenarios/realProductionScenarios";
import { preflightEngineInputForPlannerNext, type EngineInputPreflightIssue } from "./engineInputPreflight";
import { projectPlanResourceItemsForEngineInput } from "../../buildInput";

const clone = <T>(value: T): T => structuredClone(value);
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    Object.values(value as object).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

function task(id: number, overrides: Partial<TaskInput> = {}): TaskInput {
  return { id, planId: 1, templateId: id + 100, status: "pending", durationOverrideMin: 30, ...overrides };
}

function input(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    planId: 1,
    workDay: { start: "08:00", end: "18:00" },
    meal: { start: "13:00", end: "14:00" },
    camerasAvailable: 1,
    tasks: [task(1)],
    locks: [],
    zoneResourceAssignments: {},
    spaceResourceAssignments: {},
    zoneResourceTypeRequirements: {},
    spaceResourceTypeRequirements: {},
    planResourceItems: [],
    resourceItemComponents: {},
    groupingZoneIds: [],
    ...overrides,
  };
}

function issue(source: EngineInput, code: string, entityId?: string): EngineInputPreflightIssue {
  const found = preflightEngineInputForPlannerNext(source).issues.find((candidate) => candidate.code === code && (entityId === undefined || candidate.entityId === entityId));
  assert.ok(found, `${code}:${entityId ?? "*"}`);
  assert.equal(found.blocking, true);
  assert.ok(found.entityKind);
  assert.ok(found.path);
  return found;
}

function reverseRecord<T>(value: Record<number, T> | undefined): Record<number, T> | undefined {
  return value && Object.fromEntries(Object.entries(value).reverse()) as Record<number, T>;
}

function reversed(source: EngineInput): EngineInput {
  const value = clone(source);
  value.tasks.reverse().forEach((entry) => {
    entry.dependsOnTaskIds?.reverse();
    entry.assignedResourceIds?.reverse();
    entry.allowedItinerantTeamIds?.reverse();
    entry.resourceRequirements?.anyOf?.forEach((group) => group.resourceItemIds.reverse());
  });
  value.locks.reverse();
  value.planResourceItems.reverse();
  value.protectedBreaks?.reverse();
  value.globalHardBreaks?.reverse();
  value.coachResourceIds?.reverse();
  value.groupingZoneIds.reverse();
  value.spaceIdsByZoneId = reverseRecord(value.spaceIdsByZoneId);
  Object.values(value.spaceIdsByZoneId ?? {}).forEach((ids) => ids.reverse());
  value.spaceResourceAssignments = reverseRecord(value.spaceResourceAssignments) ?? {};
  Object.values(value.spaceResourceAssignments).forEach((ids) => ids.reverse());
  value.zoneResourceAssignments = reverseRecord(value.zoneResourceAssignments) ?? {};
  Object.values(value.zoneResourceAssignments).forEach((ids) => ids.reverse());
  value.resourceItemComponents = reverseRecord(value.resourceItemComponents) ?? {};
  Object.values(value.resourceItemComponents).forEach((components) => components.reverse());
  value.contestantAvailabilityById = reverseRecord(value.contestantAvailabilityById);
  value.spaceParentById = reverseRecord(value.spaceParentById);
  return value;
}

function identityKeys(source: EngineInput): string[] {
  return preflightEngineInputForPlannerNext(source).identityMap.map((entry) => `${entry.namespace}:${entry.sourceId}`);
}

test("SPEC10-005: conflicto espacio-zona activo es blocker exacto y determinista", () => {
  const source = input({ tasks: [task(1, { spaceId: 20, zoneId: 30 })], planZoneSettings: [{ zoneId: 31, availabilityStart: null, availabilityEnd: null }], planSpaceSettings: [{ spaceId: 20, zoneId: 31, availabilityStart: null, availabilityEnd: null }], zoneIdBySpaceId: { 20: 99 }, spaceResourceAssignments: { 20: [] } });
  const first = preflightEngineInputForPlannerNext(source); const second = preflightEngineInputForPlannerNext(source);
  const found = first.issues.find((entry) => entry.code === "INCONSISTENT_SPACE_ZONE_REFERENCE");
  assert.deepEqual(found, { code: "INCONSISTENT_SPACE_ZONE_REFERENCE", entityKind: "task", entityId: "1", path: "tasks.1.zoneId", message: "Task zone contradicts the zone mapped from its exact space.", blocking: true, details: { explicitZoneId: 30, mappedZoneId: 31, spaceId: 20, taskId: 1, zoneResourcesApplied: false } });
  assert.equal(first.status, "UNSUPPORTED"); assert.deepEqual(first, second);
});

test("SPEC10-005: conflicto espacio-zona de cancelled no produce issue", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { status: "cancelled", spaceId: 20, zoneId: 30 })], zoneIdBySpaceId: { 20: 31 }, spaceResourceAssignments: { 20: [] } }));
  assert.ok(!result.reasonCodes.includes("INCONSISTENT_SPACE_ZONE_REFERENCE"));
});

test("SPEC10-005: asignación directa cancelled no cambia el preflight completo", () => {
  const base = input({ tasks: [task(1, { status: "cancelled" })] });
  const changed = clone(base); changed.tasks[0].assignedResourceIds = [999, 998];
  assert.deepEqual(preflightEngineInputForPlannerNext(base), preflightEngineInputForPlannerNext(changed));
});

test("SPEC10-005: referencia inexistente cancelled no crea blocker ni incrementa diagnostics", () => {
  const base = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { status: "cancelled" })] }));
  const changed = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { status: "cancelled", assignedResourceIds: [999] })] }));
  assert.equal(changed.diagnostics.resourceAssignmentReferenceCount, base.diagnostics.resourceAssignmentReferenceCount);
  assert.equal(changed.diagnostics.missingResourceReferenceCount, base.diagnostics.missingResourceReferenceCount);
  assert.ok(!changed.issues.some((entry) => entry.code === "MISSING_RESOURCE_REFERENCE" && entry.path === "tasks.1.assignedResourceIds"));
});

test("SPEC10-005: referencia concreta inexistente activa conserva blocker", () => {
  const found = issue(input({ tasks: [task(1, { assignedResourceIds: [999] })] }), "MISSING_RESOURCE_REFERENCE", "1");
  assert.equal(found.path, "tasks.1.assignedResourceIds"); assert.deepEqual(found.details, { namespace: "plan-resource", referencedId: "999" });
});

test("SPEC10-005: mismo recurso en tres niveles mantiene identidad canónica única", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { spaceId: 20, zoneId: 30, assignedResourceIds: [9] })], spaceResourceAssignments: { 20: [9] }, zoneResourceAssignments: { 30: [9] }, planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true }] }));
  assert.equal(result.identityMap.filter((entry) => entry.canonicalId === "plan-resource:9").length, 1);
  assert.ok(!result.reasonCodes.includes("DUPLICATE_ID")); assert.equal(result.diagnostics.resourceAssignmentReferenceCount, 3);
  assert.ok(!result.issues.some((entry) => entry.code === "MISSING_RESOURCE_REFERENCE" && entry.details?.referencedId === "9"));
});

test("SPEC10-005: misma obligación con procedencia distinta cambia sólo source fingerprint", () => {
  const common = { tasks: [task(1, { zoneId: 30 })], planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true }] };
  const direct = preflightEngineInputForPlannerNext(input({ ...common, tasks: [task(1, { zoneId: 30, assignedResourceIds: [9] })], zoneResourceAssignments: { 30: [] } }));
  const zone = preflightEngineInputForPlannerNext(input({ ...common, zoneResourceAssignments: { 30: [9] } }));
  assert.notEqual(direct.sourceFingerprint, zone.sourceFingerprint); assert.equal(direct.identityMapFingerprint, zone.identityMapFingerprint);
  assert.deepEqual(direct.identityMap, zone.identityMap);
});

test("SPEC10-005: relación de coach sin canal efectivo no añade inferencias", () => {
  const without = preflightEngineInputForPlannerNext(input({ planResourceItems: [{ id: 335, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true }] }));
  const withReference = preflightEngineInputForPlannerNext(input({ vocalCoachPlanResourceItemIdByContestantId: { 7: 335 }, coachResourceIds: [335], planResourceItems: [{ id: 335, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true }] }));
  assert.equal(withReference.diagnostics.resourceAssignmentReferenceCount, without.diagnostics.resourceAssignmentReferenceCount);
  assert.ok(!withReference.issues.some((entry) => entry.path.includes("assignedResourceIds")));
});

test("SPEC10-005: inversión conserva conflicto y fingerprints", () => {
  const source = input({ tasks: [task(2, { spaceId: 21, zoneId: 31 }), task(1, { spaceId: 20, zoneId: 30 })], zoneIdBySpaceId: { 20: 32, 21: 31 }, spaceResourceAssignments: { 20: [], 21: [] } });
  assert.deepEqual(preflightEngineInputForPlannerNext(source), preflightEngineInputForPlannerNext(reversed(source)));
});

test("pureza: no modifica un EngineInput profundamente congelado", () => {
  const source = deepFreeze(input({ tasks: [task(1, { startPlanned: "09:00", endPlanned: "09:30" })] }));
  const before = clone(source);
  preflightEngineInputForPlannerNext(source);
  assert.deepEqual(source, before);
});

test("output profundamente frozen", () => {
  const result = preflightEngineInputForPlannerNext(input());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.identityMap));
  assert.ok(Object.isFrozen(result.issues));
  assert.ok(Object.isFrozen(result.diagnostics));
  assert.ok(Object.isFrozen(result.diagnostics.missingAvailabilityCounts));
});

test("determinismo: misma entrada produce resultado idéntico", () => {
  const source = input();
  assert.deepEqual(preflightEngineInputForPlannerNext(source), preflightEngineInputForPlannerNext(source));
});

test("invariancia completa de colecciones set-like y claves de mapas", () => {
  const source = input({
    tasks: [
      task(1, { dependsOnTaskIds: [3, 2], assignedResourceIds: [11, 10], allowedItinerantTeamIds: [8, 7], resourceRequirements: { anyOf: [{ quantity: 1, resourceItemIds: [101, 100] }] } }),
      task(2), task(3),
    ],
    locks: [{ id: 2, planId: 1, taskId: 2, lockType: "resource", lockedResourceId: 11 }, { id: 1, planId: 1, taskId: 1, lockType: "resource", lockedResourceId: 10 }],
    planResourceItems: [
      { id: 11, resourceItemId: 101, typeId: 2, name: "B", isAvailable: true },
      { id: 10, resourceItemId: 100, typeId: 2, name: "A", isAvailable: true },
    ],
    protectedBreaks: [{ id: 2, start: "15:00", end: "15:10", spaceId: 20 }, { id: 1, start: "14:00", end: "14:10", zoneId: 30 }],
    globalHardBreaks: [{ start: "17:00", end: "17:10" }, { start: "16:00", end: "16:10" }],
    coachResourceIds: [11, 10],
    spaceResourceAssignments: { 20: [11, 10] },
    zoneResourceAssignments: { 30: [11, 10] },
    spaceIdsByZoneId: { 30: [21, 20] },
    resourceItemComponents: { 100: [{ componentResourceItemId: 101, quantity: 1 }, { componentResourceItemId: 100, quantity: 1 }] },
  });
  assert.deepEqual(preflightEngineInputForPlannerNext(source), preflightEngineInputForPlannerNext(reversed(source)));
});

test("namespaces separados y round-trip exacto", () => {
  const source = input({ tasks: [task(9, { contestantId: 9, spaceId: 9, zoneId: 9, breakId: 9, itinerantTeamId: 9, assignedResourceIds: [9] })], locks: [{ id: 9, planId: 1, taskId: 9, lockType: "resource", lockedResourceId: 9 }], planResourceItems: [{ id: 9, resourceItemId: 9, typeId: 9, name: "x", isAvailable: true }] });
  const entries = preflightEngineInputForPlannerNext(source).identityMap.filter((entry) => entry.sourceId === "9");
  assert.deepEqual(entries.map((entry) => entry.namespace), ["break", "itinerant-team", "lock", "participant", "plan-resource", "resource-item", "resource-type", "space", "task", "template", "zone"].filter((namespace) => entries.some((entry) => entry.namespace === namespace)));
  entries.forEach((entry) => assert.equal(entry.canonicalId, `${entry.namespace}:${entry.sourceId}`));
});

test("identity map cubre referencias explícitas de tareas, mapas, componentes y breaks", () => {
  const source = input({
    tasks: [task(1, { breakId: 70, itinerantTeamId: 80, allowedItinerantTeamIds: [81], assignedResourceIds: [10], resourceRequirements: { byItem: { 100: 1 }, byType: { 200: 1 }, anyOf: [{ quantity: 1, resourceItemIds: [101] }] } })],
    planResourceItems: [{ id: 10, resourceItemId: 100, typeId: 200, name: "r", isAvailable: true }], coachResourceIds: [11],
    spaceParentById: { 20: 21 }, spaceResourceAssignments: { 20: [10] }, zoneResourceAssignments: { 30: [10] }, zoneIdBySpaceId: { 20: 30 }, spaceIdsByZoneId: { 30: [20, 22] },
    resourceItemComponents: { 100: [{ componentResourceItemId: 101, quantity: 1 }] }, actualMeal: { id: 71, start: "13:00", end: "13:30", itinerantTeamId: 82 },
  });
  const keys = identityKeys(source);
  for (const expected of ["break:70", "break:71", "itinerant-team:80", "itinerant-team:81", "itinerant-team:82", "plan-resource:10", "plan-resource:11", "resource-item:100", "resource-item:101", "resource-type:200", "space:20", "space:21", "zone:30"]) assert.ok(keys.includes(expected), expected);
});

test("DUPLICATE_ID sólo para definiciones autoritativas", () => {
  const natural = input({ tasks: [task(1, { contestantId: 5 }), task(2, { contestantId: 5 })] });
  assert.ok(!preflightEngineInputForPlannerNext(natural).reasonCodes.includes("DUPLICATE_ID"));
  const duplicate = input({ tasks: [task(1), task(1)] });
  const found = issue(duplicate, "DUPLICATE_ID", "1");
  assert.equal(found.entityKind, "task");
  assert.deepEqual(found.details, { namespace: "task" });
});

test("tiempos y aliases incompletos, inválidos y contradictorios", () => {
  const incomplete = issue(input({ mealWindowStart: "12:00" }), "UNSUPPORTED_TIME_VALUE");
  assert.equal(incomplete.path, "mealWindowAliases");
  assert.deepEqual(incomplete.details, { aliasStart: "12:00" });
  const invalid = issue(input({ actualMealStart: "18:30", actualMealEnd: "19:00" }), "UNSUPPORTED_TIME_VALUE");
  assert.equal(invalid.path, "actualMealAliases");
  const contradiction = issue(input({ mealWindow: { start: "12:00", end: "13:00" }, mealWindowStart: "12:30", mealWindowEnd: "13:30" }), "UNSUPPORTED_TIME_VALUE");
  assert.equal(contradiction.path, "mealWindowAliases");
  assert.deepEqual(contradiction.details, { aliasEnd: "13:30", aliasStart: "12:30", objectEnd: "13:00", objectStart: "12:00" });
});

test("valida hard breaks, fixed windows, disponibilidad y horarios protegidos", () => {
  assert.equal(issue(input({ globalHardBreaks: [{ start: "bad", end: "12:00" }] }), "UNSUPPORTED_TIME_VALUE").entityKind, "break");
  assert.equal(issue(input({ tasks: [task(1, { fixedWindowStart: "17:00", fixedWindowEnd: "19:00" })] }), "UNSUPPORTED_TIME_VALUE").path, "tasks.1.fixedWindow");
  assert.equal(issue(input({ contestantAvailabilityById: { 5: { start: "10:00", end: "09:00" } } }), "UNSUPPORTED_TIME_VALUE").entityKind, "participant");
  assert.equal(issue(input({ tasks: [task(1, { status: "done", spaceId: 2, startPlanned: "10:00", endPlanned: "09:00" })] }), "PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE").entityId, "1");
});

test("duración ausente usa MISSING_TASK_DURATION", () => {
  const found = issue(input({ tasks: [task(1, { durationOverrideMin: null })] }), "MISSING_TASK_DURATION", "1");
  assert.equal(found.path, "tasks.1.durationOverrideMin");
});

for (const [name, duration, expectedDetail] of [["cero", 0, 0], ["negativa", -1, -1], ["NaN", Number.NaN, "NaN"]] as const) {
  test(`duración ${name} usa UNSUPPORTED_TIME_VALUE`, () => {
    const found = issue(input({ tasks: [task(1, { durationOverrideMin: duration })] }), "UNSUPPORTED_TIME_VALUE", "1");
    assert.deepEqual(found.details, { receivedValue: expectedDetail });
    assert.ok(!preflightEngineInputForPlannerNext(input({ tasks: [task(1, { durationOverrideMin: duration })] })).reasonCodes.includes("MISSING_TASK_DURATION"));
  });
}

test("duración válida no genera issue de duración", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { durationOverrideMin: 15 })] }));
  assert.ok(!result.reasonCodes.includes("MISSING_TASK_DURATION"));
  assert.ok(!result.issues.some((entry) => entry.path === "tasks.1.durationOverrideMin"));
});

test("pending, interrupted y cancelled tienen contadores y semántica separada", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1), task(2, { status: "interrupted" }), task(3, { status: "cancelled" })] }));
  assert.equal(result.diagnostics.planifiableTaskCount, 2);
  assert.equal(result.diagnostics.cancelledTaskCount, 1);
  assert.equal(result.diagnostics.unresolvedTaskRoleCount, 2);
});

test("done e in_progress completos e incompletos", () => {
  const complete = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { status: "done", spaceId: 2, startPlanned: "09:00", endPlanned: "09:30" }), task(2, { status: "in_progress", spaceId: 2, startReal: "10:00", endReal: "10:30" })], spaceParentById: { 2: null } }));
  assert.ok(!complete.reasonCodes.includes("PROTECTED_TASK_WITHOUT_FIXED_PLANNING"));
  const incomplete = input({ tasks: [task(1, { status: "done" }), task(2, { status: "in_progress" })] });
  assert.equal(preflightEngineInputForPlannerNext(incomplete).issues.filter((entry) => entry.code === "PROTECTED_TASK_WITHOUT_FIXED_PLANNING").length, 2);
});

test("posible tarea técnica sin concursante no crea falso participante", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { contestantId: null })] }));
  assert.ok(result.reasonCodes.includes("UNSUPPORTED_TASK_ROLE"));
  assert.ok(!result.reasonCodes.includes("MISSING_PARTICIPANT_REFERENCE"));
});

test("plannerNextKind ausente emite el blocker contractual exacto", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1)] }));
  const found = result.issues.find((entry) => entry.code === "UNSUPPORTED_TASK_ROLE" && entry.entityId === "1");
  assert.ok(found);
  assert.equal(found.entityKind, "task");
  assert.equal(found.path, "tasks.1.plannerNextKind");
  assert.deepEqual(found.details, {
    allowedValues: ["main", "vocal", "auxiliary", "technical"],
    receivedValue: null,
  });
  assert.equal(result.diagnostics.unresolvedTaskRoleCount, 1);
});

for (const plannerNextKind of ["main", "vocal", "auxiliary", "technical"] as const) {
  test(`plannerNextKind válido ${plannerNextKind} elimina exclusivamente el blocker de role`, () => {
    const participant = plannerNextKind === "technical" ? {} : { contestantId: 7 };
    const source = input({
      tasks: [task(1, { plannerNextKind, ...participant })],
      contestantAvailabilityById: plannerNextKind === "technical" ? {} : { 7: { start: "08:00", end: "18:00" } },
    });
    const result = preflightEngineInputForPlannerNext(source);
    assert.ok(!result.reasonCodes.includes("UNSUPPORTED_TASK_ROLE"));
    assert.equal(result.diagnostics.unresolvedTaskRoleCount, 0);
    assert.equal(result.status, "UNSUPPORTED");
  });
}

for (const [name, plannerNextKind] of [
  ["undefined", undefined], ["null", null], ["vacío", ""], ["casing", "MAIN"],
  ["operationalRole", "productive_task"], ["unknown", "unknown"], ["número", 1],
  ["objeto", { kind: "main" }], ["array", ["main"]],
] as const) {
  test(`plannerNextKind runtime inválido: ${name}`, () => {
    const runtimeTask = task(1) as unknown as Record<string, unknown>;
    runtimeTask.plannerNextKind = plannerNextKind;
    const result = preflightEngineInputForPlannerNext(input({ tasks: [runtimeTask as unknown as TaskInput] }));
    const blockers = result.issues.filter((entry) => entry.code === "UNSUPPORTED_TASK_ROLE" && entry.entityId === "1");
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0]?.path, "tasks.1.plannerNextKind");
    assert.equal(result.diagnostics.unresolvedTaskRoleCount, 1);
  });
}

for (const [name, suggestion] of [
  ["operationalRole", { operationalRole: "productive_task" }],
  ["main-flow flag", { countsForMainFlow: true }],
  ["template name", { templateName: "Main vocal technical" }],
  ["main space", { spaceId: 20 }], ["main zone", { zoneId: 30 }],
  ["participant", { contestantId: 7 }], ["resource", { assignedResourceIds: [10] }],
  ["dependency", { dependsOnTaskIds: [2] }],
] as const) {
  test(`plannerNextKind no se infiere desde ${name}`, () => {
    const source = input({
      tasks: [task(1, suggestion as Partial<TaskInput>), task(2)],
      coachResourceIds: [10], groupingZoneIds: [30], spaceParentById: { 20: null },
      planResourceItems: [{ id: 10, resourceItemId: 100, typeId: 2, name: "Coach", isAvailable: true }],
    });
    assert.ok(preflightEngineInputForPlannerNext(source).issues.some((entry) => entry.code === "UNSUPPORTED_TASK_ROLE" && entry.entityId === "1"));
  });
}

for (const plannerNextKind of ["main", "vocal", "auxiliary"] as const) {
  for (const [name, contestantId, valid] of [
    ["válido", 7, true], ["ausente", undefined, false], ["cero", 0, false],
    ["negativo", -1, false], ["decimal", 1.5, false], ["NaN", Number.NaN, false],
    ["string runtime", "7", false],
  ] as const) {
    test(`${plannerNextKind} exige participante positivo entero: ${name}`, () => {
      const runtimeTask = task(1, { plannerNextKind }) as unknown as Record<string, unknown>;
      runtimeTask.contestantId = contestantId;
      const result = preflightEngineInputForPlannerNext(input({
        tasks: [runtimeTask as unknown as TaskInput],
        contestantAvailabilityById: valid ? { 7: { start: "08:00", end: "18:00" } } : {},
      }));
      assert.equal(result.issues.some((entry) => entry.code === "MISSING_PARTICIPANT_REFERENCE" && entry.entityId === "1"), !valid);
      assert.ok(!result.reasonCodes.includes("UNSUPPORTED_TASK_ROLE"));
      assert.equal(result.diagnostics.unresolvedTaskRoleCount, 0);
    });
  }
}

test("technical sin participante conserva una clasificación compatible", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { plannerNextKind: "technical" })] }));
  assert.ok(!result.reasonCodes.includes("UNSUPPORTED_TASK_ROLE"));
});

for (const withAvailability of [false, true]) {
  test(`technical con participante${withAvailability ? " y disponibilidad" : ""} rechaza la relación sin mutarla`, () => {
    const source = input({ tasks: [task(1, { plannerNextKind: "technical", contestantId: 7 })], contestantAvailabilityById: withAvailability ? { 7: { start: "08:00", end: "18:00" } } : {} });
    const before = clone(source);
    const result = preflightEngineInputForPlannerNext(source);
    const found = result.issues.find((entry) => entry.code === "UNSUPPORTED_TASK_ROLE" && entry.entityId === "1");
    assert.equal(found?.path, "tasks.1.plannerNextKind");
    assert.deepEqual(found?.details, { incompatibleFields: ["contestantId"], plannerNextKind: "technical" });
    assert.equal(result.diagnostics.unresolvedTaskRoleCount, 1);
    assert.deepEqual(source, before);
    assert.ok(result.identityMap.some((entry) => entry.namespace === "participant" && entry.sourceId === "7"));
  });
}

for (const status of ["pending", "interrupted", "in_progress", "done"] as const) {
  test(`${status} exige plannerNextKind`, () => {
    assert.ok(preflightEngineInputForPlannerNext(input({ tasks: [task(1, { status })] })).reasonCodes.includes("UNSUPPORTED_TASK_ROLE"));
  });
}

test("cancelled ignora plannerNextKind por completo", () => {
  const base = input({ tasks: [task(1, { status: "cancelled" })] });
  const classified = clone(base);
  classified.tasks[0]!.plannerNextKind = "vocal";
  assert.deepEqual(preflightEngineInputForPlannerNext(base), preflightEngineInputForPlannerNext(classified));
});

test("plannerNextKind cambia sólo el source fingerprint y nunca identidades", () => {
  const values = [undefined, "main", "vocal", "auxiliary", "technical", "MAIN"] as const;
  const results = values.map((plannerNextKind) => {
    const runtimeTask = task(1, { contestantId: 7 }) as unknown as Record<string, unknown>;
    runtimeTask.plannerNextKind = plannerNextKind;
    return preflightEngineInputForPlannerNext(input({ tasks: [runtimeTask as unknown as TaskInput] }));
  });
  assert.equal(new Set(results.map((result) => result.sourceFingerprint)).size, values.length);
  results.slice(1).forEach((result) => {
    assert.deepEqual(result.identityMap, results[0]!.identityMap);
    assert.equal(result.identityMapFingerprint, results[0]!.identityMapFingerprint);
  });
});

test("plannerNextKind explícito preserva pureza, frozen e invariancia", () => {
  const source = deepFreeze(input({ tasks: [task(2, { plannerNextKind: "technical" }), task(1, { plannerNextKind: "main", contestantId: 7 })], contestantAvailabilityById: { 7: { start: "08:00", end: "18:00" } } }));
  const before = clone(source);
  const result = preflightEngineInputForPlannerNext(source);
  assert.deepEqual(source, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.issues));
  assert.deepEqual(result, preflightEngineInputForPlannerNext(reversed(source)));
});

test("dependencias: array autoritativo y fallback legacy", () => {
  const authoritative = input({ tasks: [task(1, { dependsOnTaskIds: [], dependsOnTaskId: 999 }), task(2)] });
  assert.ok(!preflightEngineInputForPlannerNext(authoritative).reasonCodes.includes("MISSING_DEPENDENCY_REFERENCE"));
  const fallback = issue(input({ tasks: [task(1, { dependsOnTaskIds: null, dependsOnTaskId: 999 })] }), "MISSING_DEPENDENCY_REFERENCE", "1");
  assert.deepEqual(fallback.details, { dependencyTaskId: "999" });
});

test("dependencia duplicada no es ciclo", () => {
  const source = input({ tasks: [task(1, { dependsOnTaskIds: [2, 2] }), task(2)] });
  const found = issue(source, "DUPLICATE_DEPENDENCY_REFERENCE", "1");
  assert.deepEqual(found.details, { duplicateTaskIds: ["2"] });
  assert.ok(!preflightEngineInputForPlannerNext(source).reasonCodes.includes("DEPENDENCY_CYCLE"));
});

test("dependencias detectan autorreferencia, ciclo de dos y transitivo", () => {
  assert.deepEqual(issue(input({ tasks: [task(1, { dependsOnTaskIds: [1] })] }), "DEPENDENCY_CYCLE", "1").details, { cycleTaskIds: ["1"] });
  const two = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { dependsOnTaskIds: [2] }), task(2, { dependsOnTaskIds: [1] })] }));
  assert.deepEqual(two.issues.filter((entry) => entry.code === "DEPENDENCY_CYCLE").map((entry) => entry.entityId), ["1", "2"]);
  const transitive = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { dependsOnTaskIds: [2] }), task(2, { dependsOnTaskIds: [3] }), task(3, { dependsOnTaskIds: [1] })] }));
  assert.deepEqual(transitive.issues.filter((entry) => entry.code === "DEPENDENCY_CYCLE").map((entry) => entry.entityId), ["1", "2", "3"]);
});

test("dependencias protegida↔pendiente son verificadas sin falsos issues", () => {
  const source = input({ tasks: [task(1, { status: "done", spaceId: 2, startPlanned: "09:00", endPlanned: "09:30", dependsOnTaskIds: [2] }), task(2, { dependsOnTaskIds: [1] })], spaceParentById: { 2: null } });
  assert.equal(preflightEngineInputForPlannerNext(source).diagnostics.dependencyCount, 2);
  assert.ok(!preflightEngineInputForPlannerNext(source).reasonCodes.includes("MISSING_DEPENDENCY_REFERENCE"));
});

test("locks usan MISSING_TASK_REFERENCE y auditan plan y tipo", () => {
  const missing = issue(input({ locks: [{ id: 1, planId: 1, taskId: 99, lockType: "time", lockedStart: "09:00", lockedEnd: "10:00" }] }), "MISSING_TASK_REFERENCE", "1");
  assert.deepEqual(missing.details, { taskId: "99" });
  assert.equal(issue(input({ locks: [{ id: 1, planId: 2, taskId: 1, lockType: "time", lockedStart: "09:00", lockedEnd: "10:00" }] }), "PLAN_ID_MISMATCH").path, "locks.1.planId");
  const invalid = input({ locks: [{ id: 1, planId: 1, taskId: 1, lockType: "invalid" as "time" }] });
  assert.deepEqual(issue(invalid, "UNSUPPORTED_LOCK_TYPE").details, { lockType: "invalid" });
});

test("locks time, resource, space y full auditan cada dimensión", () => {
  assert.equal(issue(input({ locks: [{ id: 1, planId: 1, taskId: 1, lockType: "time" }] }), "UNREPRESENTABLE_TIME_LOCK").entityId, "1");
  assert.equal(issue(input({ locks: [{ id: 1, planId: 1, taskId: 1, lockType: "time", lockedStart: "10:00", lockedEnd: "09:00" }] }), "UNREPRESENTABLE_TIME_LOCK").entityId, "1");
  assert.deepEqual(issue(input({ locks: [{ id: 1, planId: 1, taskId: 1, lockType: "resource" }] }), "UNREPRESENTABLE_RESOURCE_LOCK").details, { lockedResourceId: null });
  assert.equal(issue(input({ locks: [{ id: 1, planId: 1, taskId: 1, lockType: "space" }] }), "UNREPRESENTABLE_SPACE_LOCK").path, "locks.1");
  const full = preflightEngineInputForPlannerNext(input({ locks: [{ id: 1, planId: 1, taskId: 1, lockType: "full" }] }));
  assert.ok(full.reasonCodes.includes("UNREPRESENTABLE_TIME_LOCK"));
  assert.ok(full.reasonCodes.includes("UNREPRESENTABLE_SPACE_LOCK"));
  assert.ok(full.reasonCodes.includes("UNREPRESENTABLE_RESOURCE_LOCK"));
  const validResource = input({ planResourceItems: [{ id: 10, resourceItemId: 100, typeId: 1, name: "r", isAvailable: true }], locks: [{ id: 1, planId: 1, taskId: 1, lockType: "full", lockedStart: "09:00", lockedEnd: "10:00", lockedResourceId: 10 }] });
  const result = preflightEngineInputForPlannerNext(validResource);
  assert.ok(result.reasonCodes.includes("UNREPRESENTABLE_SPACE_LOCK"));
  assert.ok(!result.reasonCodes.includes("UNREPRESENTABLE_RESOURCE_LOCK"));
});

test("coaches existentes, inexistentes y renombrados", () => {
  const source = input({ planResourceItems: [{ id: 10, resourceItemId: 100, typeId: 1, name: "not-used", isAvailable: true }], coachResourceIds: [10, 11] });
  const result = preflightEngineInputForPlannerNext(source);
  assert.equal(result.diagnostics.coachReferenceCount, 2);
  assert.equal(result.diagnostics.missingCoachReferenceCount, 1);
  assert.deepEqual(issue(source, "MISSING_COACH_REFERENCE", "11").details, { referencedId: "11" });
  const renamed = clone(source); renamed.planResourceItems[0].name = "other"; renamed.planResourceItems[0].typeName = "other";
  assert.deepEqual(result, preflightEngineInputForPlannerNext(renamed));
  assert.ok(!result.issues.some((entry) => entry.code === "MISSING_COACH_REFERENCE" && entry.entityId === "10"));
});

test("recursos, asignaciones, alternativas y componentes auditan namespaces", () => {
  const source = input({ tasks: [task(1, { assignedResourceIds: [99], resourceRequirements: { byItem: { 999: 2 }, byType: { 888: 1 }, anyOf: [{ quantity: 1, resourceItemIds: [777] }] } })], spaceResourceAssignments: { 2: [98] }, zoneResourceAssignments: { 3: [97] }, resourceItemComponents: { 100: [{ componentResourceItemId: 666, quantity: 1 }] } });
  const result = preflightEngineInputForPlannerNext(source);
  assert.equal(result.diagnostics.resourceAssignmentReferenceCount, 3);
  assert.equal(result.diagnostics.resourceComponentReferenceCount, 1);
  assert.equal(result.diagnostics.missingResourceReferenceCount, 8);
  const component = result.issues.find((entry) => entry.code === "MISSING_RESOURCE_REFERENCE" && entry.details?.referencedId === "666");
  assert.deepEqual(component?.details, { namespace: "resource-item", referencedId: "666" });
  assert.ok(result.reasonCodes.includes("UNSUPPORTED_RESOURCE_REQUIREMENT"));
});

test("espacio ausente, sólo referenciado y descrito sin disponibilidad", () => {
  const absent = preflightEngineInputForPlannerNext(input());
  assert.equal(absent.diagnostics.referencedSpaceCount, 0);
  assert.equal(absent.issues.filter((entry) => entry.code === "MISSING_SPACE_REFERENCE" && entry.path === "tasks.1.spaceId").length, 1);
  const referenced = input({ tasks: [task(1, { spaceId: 20, zoneId: 20 })] });
  assert.equal(issue(referenced, "MISSING_SPACE_REFERENCE", "20").path, "planSpaceSettings.20");
  const described = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { spaceId: 20, zoneId: 30 })], spaceParentById: { 20: null } }));
  assert.equal(described.diagnostics.referencedSpaceCount, 1);
  assert.equal(described.diagnostics.describedSpaceCount, 1);
  assert.ok(described.issues.some((entry) => entry.code === "MISSING_SPACE_REFERENCE" && entry.entityId === "20"));
  assert.ok(described.identityMap.some((entry) => entry.namespace === "zone" && entry.sourceId === "30"));
});

test("SPEC10-009: toda tarea activa sin identidad espacial positiva bloquea exactamente una vez", () => {
  const invalidCases: Array<[TaskInput["status"], unknown, Partial<TaskInput>]> = [
    ["pending", undefined, {}], ["interrupted", undefined, {}],
    ["in_progress", undefined, { startPlanned: "09:00", endPlanned: "10:00" }],
    ["done", undefined, { startPlanned: "09:00", endPlanned: "10:00" }],
    ["pending", undefined, { plannerNextKind: "technical" }], ["pending", 0, {}], ["pending", -2, {}], ["pending", Number.NaN, {}],
  ];
  const tasks = invalidCases.map(([status, spaceId, extra], index) => task(index + 1, { status, spaceId: spaceId as number, ...extra }));
  tasks.push(task(99, { status: "cancelled" }));
  const source = input({ tasks }); const before = clone(source);
  const normal = preflightEngineInputForPlannerNext(source);
  const inverted = preflightEngineInputForPlannerNext(input({ ...source, tasks: [...tasks].reverse() }));
  const missing = normal.issues.filter((entry) => entry.code === "MISSING_SPACE_REFERENCE");
  assert.deepEqual(missing.map((entry) => entry.entityId), tasks.filter((entry) => entry.status !== "cancelled").map((entry) => String(entry.id)));
  missing.forEach((entry) => assert.equal(entry.path, `tasks.${entry.entityId}.spaceId`));
  assert.equal(missing.some((entry) => entry.entityId === "99"), false);
  assert.equal(normal.issues.some((entry) => entry.code === "MISSING_SPACE_AVAILABILITY"), false);
  assert.deepEqual({ required: normal.diagnostics.requiredSpaceCount, usable: normal.diagnostics.usableRequiredSpaceCount, unusable: normal.diagnostics.unusableRequiredSpaceCount }, { required: 0, usable: 0, unusable: 0 });
  assert.equal(normal.identityMap.some((entry) => entry.namespace === "space"), false);
  assert.deepEqual(normal, inverted); assert.deepEqual(source, before);
});

test("SPEC10-009: snapshots diarios duplicados bloquean sin last-write-wins ni blockers espaciales falsos", () => {
  const base = input({
    tasks: [task(1, { spaceId: 20, zoneId: 30 })],
    planZoneSettings: [{ id: 1, zoneId: 30, availabilityStart: null, availabilityEnd: null }, { id: 2, zoneId: 30, availabilityStart: "09:00", availabilityEnd: "17:00" }],
    planSpaceSettings: [{ id: 3, spaceId: 20, zoneId: 30, availabilityStart: null, availabilityEnd: null }, { id: 4, spaceId: 20, zoneId: 30, availabilityStart: "10:00", availabilityEnd: "16:00" }],
  });
  const before = clone(base);
  const normal = preflightEngineInputForPlannerNext(base);
  const inverted = preflightEngineInputForPlannerNext(input({ ...base, planZoneSettings: [...base.planZoneSettings!].reverse(), planSpaceSettings: [...base.planSpaceSettings!].reverse() }));
  const duplicateIssues = normal.issues.filter((entry) => entry.code === "DUPLICATE_ID" && (entry.entityKind === "zone" || entry.entityKind === "space"));
  assert.deepEqual(duplicateIssues.map((entry) => entry.details?.reason), ["DUPLICATE_SPACE_SNAPSHOT", "DUPLICATE_ZONE_SNAPSHOT"]);
  assert.equal(normal.issues.filter((entry) => entry.code === "MISSING_SPACE_REFERENCE" || entry.code === "MISSING_SPACE_AVAILABILITY").length, 0);
  assert.equal(normal.diagnostics.usableRequiredSpaceCount, 0);
  assert.equal(normal.diagnostics.unusableRequiredSpaceCount, 1);
  assert.deepEqual(normal, inverted);
  assert.deepEqual(base, before);
});

test("SPEC10-009: relación diaria gobierna recursos y el catálogo legacy es irrelevante", () => {
  const common = input({
    tasks: [task(1, { spaceId: 20, assignedResourceIds: [1] })],
    planZoneSettings: [{ zoneId: 40, availabilityStart: null, availabilityEnd: null }],
    planSpaceSettings: [{ spaceId: 20, zoneId: 40, availabilityStart: null, availabilityEnd: null }],
    spaceResourceAssignments: { 20: [2] }, zoneResourceAssignments: { 30: [3], 40: [4] },
    planResourceItems: [1, 2, 3, 4].map((id) => ({ id, resourceItemId: id, typeId: 1, name: `r${id}`, isAvailable: true, availabilityStart: null, availabilityEnd: null })),
  });
  const a = preflightEngineInputForPlannerNext({ ...common, zoneIdBySpaceId: { 20: 30 }, spaceIdsByZoneId: { 30: [20] } });
  const b = preflightEngineInputForPlannerNext({ ...common, zoneIdBySpaceId: { 20: 99 }, spaceIdsByZoneId: { 99: [20] } });
  assert.deepEqual(a, b);
  assert.equal(a.reasonCodes.includes("INCONSISTENT_SPACE_ZONE_REFERENCE"), false);
  assert.deepEqual(a.issues.filter((entry) => entry.entityKind === "plan-resource").map((entry) => entry.entityId), []);
});

test("SPEC10-009: partial-real no cae a planificación para espacio ni recursos", () => {
  for (const real of [{ startReal: "08:30" }, { endReal: "10:00" }]) {
    const source = input({
      tasks: [task(1, { status: "done", spaceId: 20, zoneId: 40, startPlanned: "08:30", endPlanned: "10:00", assignedResourceIds: [9], ...real })],
      planZoneSettings: [{ zoneId: 40, availabilityStart: "09:00", availabilityEnd: "17:00" }],
      planSpaceSettings: [{ spaceId: 20, zoneId: 40, availabilityStart: null, availabilityEnd: null }],
      planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true, availabilityStart: "09:00", availabilityEnd: "17:00" }],
    });
    const before = clone(source); const result = preflightEngineInputForPlannerNext(source);
    assert.equal(result.issues.filter((entry) => entry.path === "tasks.1.realPlanning").length, 1);
    assert.equal(result.issues.some((entry) => entry.path.includes("spatialAvailability") || entry.path.includes("resourceAvailability")), false);
    assert.deepEqual(source, before);
  }
});

test("SPEC10-009: locks time/full se auditan contra la ventana espacial diaria", () => {
  const make = (lock: EngineInput["locks"][number], snapshot: "valid" | "missing" | "duplicate" = "valid", status: "pending" | "interrupted" = "pending") => input({
    tasks: [task(1, { status, spaceId: 20, zoneId: 40 })], locks: [lock],
    planZoneSettings: [{ zoneId: 40, availabilityStart: "09:00", availabilityEnd: "17:00" }],
    planSpaceSettings: snapshot === "missing" ? [] : snapshot === "duplicate"
      ? [{ spaceId: 20, zoneId: 40, availabilityStart: null, availabilityEnd: null }, { spaceId: 20, zoneId: 40, availabilityStart: "10:00", availabilityEnd: "16:00" }]
      : [{ spaceId: 20, zoneId: 40, availabilityStart: null, availabilityEnd: null }],
  });
  for (const [lockType, status] of [["time", "pending"], ["full", "interrupted"]] as const) {
    const inside = preflightEngineInputForPlannerNext(make({ id: 7, planId: 1, taskId: 1, lockType, lockedStart: "10:00", lockedEnd: "11:00" }, "valid", status));
    assert.equal(inside.issues.some((entry) => entry.code === "UNREPRESENTABLE_TIME_LOCK"), false);
    const outside = preflightEngineInputForPlannerNext(make({ id: 7, planId: 1, taskId: 1, lockType, lockedStart: "08:30", lockedEnd: "10:00" }, "valid", status));
    const issue = outside.issues.filter((entry) => entry.code === "UNREPRESENTABLE_TIME_LOCK");
    assert.equal(issue.length, 1); assert.equal(issue[0].path, "locks.7.spatialAvailability");
    assert.deepEqual(issue[0].details, { effectiveWindow: { start: "09:00", end: "17:00" }, lockId: 7, lockedInterval: { start: "08:30", end: "10:00" }, reason: "LOCK_OUTSIDE_EFFECTIVE_SPACE_WINDOW", spaceId: 20, taskId: 1, zoneId: 40 });
  }
  for (const snapshot of ["missing", "duplicate"] as const) {
    const result = preflightEngineInputForPlannerNext(make({ id: 8, planId: 1, taskId: 1, lockType: "time", lockedStart: "10:00", lockedEnd: "11:00" }, snapshot));
    assert.equal(result.issues.filter((entry) => entry.code === "UNREPRESENTABLE_TIME_LOCK").length, 1);
  }
  for (const endpoints of [{ lockedStart: "10:00" }, { lockedStart: "bad", lockedEnd: "11:00" }]) {
    const result = preflightEngineInputForPlannerNext(make({ id: 9, planId: 1, taskId: 1, lockType: "time", ...endpoints }));
    assert.equal(result.issues.filter((entry) => entry.code === "UNREPRESENTABLE_TIME_LOCK").length, 1);
    assert.equal(result.issues.find((entry) => entry.code === "UNREPRESENTABLE_TIME_LOCK")?.path, "locks.9");
  }
});

test("capacidad mayor que uno y aliases contradictorios", () => {
  assert.deepEqual(issue(input({ spaceCapacityById: { 20: 2 } }), "UNSUPPORTED_SPACE_CAPACITY", "20").details, { capacity: 2 });
  const contradiction = issue(input({ spaceCapacityById: { 20: 1 }, spaceConcurrencyById: { 20: 2 } }), "UNSUPPORTED_SPACE_CAPACITY", "20");
  assert.equal(contradiction.path, "spaceCapacityAliases.20");
  assert.deepEqual(contradiction.details, { capacity: 1, concurrency: 2 });
});

test("breaks distinguen legacy, flexible, actual global/scoped y global hard", () => {
  assert.ok(!preflightEngineInputForPlannerNext(input()).reasonCodes.includes("UNSUPPORTED_BREAK_SCOPE"));
  assert.deepEqual(issue(input({ mealMode: "flexible_meal_window", mealWindow: { start: "12:00", end: "14:00" } }), "UNSUPPORTED_BREAK_SCOPE").details, { scope: "flexible-window" });
  assert.ok(!preflightEngineInputForPlannerNext(input({ actualMeal: { id: 1, kind: "meal", start: "13:00", end: "14:00" } })).reasonCodes.includes("UNSUPPORTED_BREAK_SCOPE"));
  assert.deepEqual(issue(input({ actualMeal: { id: 1, kind: "meal", start: "13:00", end: "13:30", spaceId: 2 } }), "UNSUPPORTED_BREAK_SCOPE", "1").details, { scope: "space" });
  assert.deepEqual(issue(input({ globalHardBreaks: [{ start: "15:00", end: "15:10" }] }), "UNSUPPORTED_BREAK_SCOPE").details, { scope: "global-hard-break" });
});

test("breaks participant, space, zone, itinerant y multiplicidad conservan scope", () => {
  for (const [field, value, scope] of [["contestantId", 1, "participant"], ["spaceId", 2, "space"], ["zoneId", 3, "zone"], ["itinerantTeamId", 4, "itinerant-team"]] as const) {
    const entry = { id: value, start: "15:00", end: "15:10", [field]: value };
    assert.deepEqual(issue(input({ protectedBreaks: [entry] }), "UNSUPPORTED_BREAK_SCOPE", String(value)).details, { scope });
  }
  const multiple = preflightEngineInputForPlannerNext(input({ protectedBreaks: [{ id: 1, start: "15:00", end: "15:10", zoneId: 3 }, { id: 2, start: "16:00", end: "16:10", spaceId: 2 }] }));
  assert.equal(multiple.diagnostics.breakCount, 3);
});

test("transporte detectado sólo por contrato estructurado", () => {
  const found = issue(input({ transportSettings: { source: "engine-buildInput-optimizer-transport", vehicleCapacity: 8 } }), "UNSUPPORTED_TRANSPORT_CONTRACT");
  assert.equal(found.path, "transportSettings");
  assert.equal(preflightEngineInputForPlannerNext(input({ tasks: [task(1, { templateName: "IN" })] })).diagnostics.transportConfigured, false);
});

test("setup detectado sin inferir familia por nombre", () => {
  const found = issue(input({ groupingBySpaceId: { 2: { key: "S:2", level: 2, minChain: 2 } } }), "UNSUPPORTED_SETUP_MAPPING");
  assert.equal(found.path, "groupingBySpaceId");
  assert.equal(preflightEngineInputForPlannerNext(input({ tasks: [task(1, { templateName: "setup" })] })).diagnostics.setupConfigurationDetected, false);
});

test("política y presupuesto se comprueban sin selección implícita", () => {
  const result = preflightEngineInputForPlannerNext(input());
  assert.equal(result.diagnostics.searchPolicyConfigurationPresent, false);
  assert.equal(result.diagnostics.searchBudgetConfigurationComplete, false);
  assert.ok(result.reasonCodes.includes("MISSING_SEARCH_POLICY_CONFIGURATION"));
  assert.ok(result.reasonCodes.includes("MISSING_SEARCH_BUDGET_CONFIGURATION"));
});

test("fingerprint ignora nombres, orden y valores descartados pero cambia con presencia del seed", () => {
  const source = input({ tasks: [task(1, { contestantName: "A", templateName: "A", startPlanned: "09:00", endPlanned: "09:30" })] });
  const baseline = preflightEngineInputForPlannerNext(source).sourceFingerprint;
  const renamed = clone(source); renamed.tasks[0].contestantName = "B"; renamed.tasks[0].templateName = "B";
  assert.equal(baseline, preflightEngineInputForPlannerNext(renamed).sourceFingerprint);
  const changedTimes = clone(source); changedTimes.tasks[0].startPlanned = "11:00"; changedTimes.tasks[0].endPlanned = "11:30";
  assert.equal(baseline, preflightEngineInputForPlannerNext(changedTimes).sourceFingerprint);
  const removed = clone(source); removed.tasks[0].startPlanned = null; removed.tasks[0].endPlanned = null;
  assert.notEqual(baseline, preflightEngineInputForPlannerNext(removed).sourceFingerprint);
});

test("fingerprint cambia con duración, dependencia, lock y scope", () => {
  const source = input({ tasks: [task(1), task(2)] });
  const baseline = preflightEngineInputForPlannerNext(source).sourceFingerprint;
  for (const changed of [
    input({ tasks: [task(1, { durationOverrideMin: 31 }), task(2)] }),
    input({ tasks: [task(1, { dependsOnTaskIds: [2] }), task(2)] }),
    input({ tasks: [task(1), task(2)], locks: [{ id: 1, planId: 1, taskId: 1, lockType: "space" }] }),
    input({ tasks: [task(1), task(2)], protectedBreaks: [{ id: 1, start: "15:00", end: "15:10", zoneId: 2 }] }),
  ]) assert.notEqual(baseline, preflightEngineInputForPlannerNext(changed).sourceFingerprint);
});

const concreteMealIssue = (source: EngineInput) => preflightEngineInputForPlannerNext(source).issues.find((entry) => entry.path === "concreteMeals");

test("comida concreta: sólo meal cuenta un único contrato", () => {
  const result = preflightEngineInputForPlannerNext(input());
  assert.equal(result.diagnostics.breakCount, 1);
  assert.equal(concreteMealIssue(input()), undefined);
});

for (const [name, overrides] of [
  ["meal y actualMeal idénticos", { actualMeal: { id: 1, kind: "meal", start: "13:00", end: "14:00" } }],
  ["meal y aliases idénticos", { actualMealStart: "13:00", actualMealEnd: "14:00" }],
  ["actualMeal y aliases idénticos", { actualMeal: { id: 1, kind: "meal", start: "13:00", end: "14:00" }, actualMealStart: "13:00", actualMealEnd: "14:00" }],
  ["meal y protected meal idénticos", { protectedBreaks: [{ id: 1, kind: "meal", start: "13:00", end: "14:00" }] }],
  ["las cuatro representaciones idénticas", { actualMeal: { id: 1, kind: "meal", start: "13:00", end: "14:00" }, actualMealStart: "13:00", actualMealEnd: "14:00", protectedBreaks: [{ id: 2, kind: "meal", start: "13:00", end: "14:00" }] }],
] as const) {
  test(`comida concreta equivalente: ${name}`, () => {
    const source = input(overrides);
    const result = preflightEngineInputForPlannerNext(source);
    assert.equal(concreteMealIssue(source), undefined);
    assert.equal(result.diagnostics.breakCount, 1);
  });
}

test("comidas concretas: meal y actualMeal diferentes producen un issue canónico", () => {
  const source = input({ actualMeal: { id: 1, kind: "meal", start: "12:00", end: "12:30" } });
  assert.deepEqual(concreteMealIssue(source)?.details, { representations: [
    { end: "12:30", sources: ["actualMeal"], start: "12:00" },
    { end: "14:00", sources: ["meal"], start: "13:00" },
  ] });
});

test("comidas concretas: meal y aliases diferentes producen un issue canónico", () => {
  const source = input({ actualMealStart: "12:00", actualMealEnd: "12:30" });
  assert.deepEqual(concreteMealIssue(source)?.details, { representations: [
    { end: "12:30", sources: ["actualMealAliases"], start: "12:00" },
    { end: "14:00", sources: ["meal"], start: "13:00" },
  ] });
});

test("comidas concretas: actualMeal y aliases contradictorios conservan ambas fuentes", () => {
  const source = input({ actualMeal: { id: 1, kind: "meal", start: "13:00", end: "14:00" }, actualMealStart: "12:00", actualMealEnd: "12:30" });
  assert.deepEqual(concreteMealIssue(source)?.details, { representations: [
    { end: "12:30", sources: ["actualMealAliases"], start: "12:00" },
    { end: "14:00", sources: ["actualMeal", "meal"], start: "13:00" },
  ] });
  assert.ok(preflightEngineInputForPlannerNext(source).issues.some((entry) => entry.path === "actualMealAliases"));
});

test("comidas concretas: dos protected meals diferentes producen un único issue", () => {
  const source = input({ protectedBreaks: [
    { id: 1, kind: "meal", start: "13:00", end: "14:00" },
    { id: 2, kind: "meal", start: "15:00", end: "15:30" },
  ] });
  assert.equal(preflightEngineInputForPlannerNext(source).issues.filter((entry) => entry.path === "concreteMeals").length, 1);
  assert.equal(preflightEngineInputForPlannerNext(source).diagnostics.breakCount, 2);
});

test("comida concreta y hard break global mantienen contratos separados", () => {
  const source = input({ globalHardBreaks: [{ start: "15:00", end: "15:15" }] });
  const result = preflightEngineInputForPlannerNext(source);
  assert.equal(concreteMealIssue(source), undefined);
  assert.equal(result.diagnostics.breakCount, 2);
  assert.ok(result.issues.some((entry) => entry.path === "globalHardBreaks.15:00-15:15"));
});

test("comida concreta y break scoped mantienen contratos separados", () => {
  const source = input({ protectedBreaks: [{ id: 1, kind: "meal", start: "15:00", end: "15:15", contestantId: 5 }] });
  const result = preflightEngineInputForPlannerNext(source);
  assert.equal(concreteMealIssue(source), undefined);
  assert.equal(result.diagnostics.breakCount, 2);
  assert.ok(result.issues.some((entry) => entry.entityId === "1" && entry.code === "UNSUPPORTED_BREAK_SCOPE"));
});

const runtimeInput = (source: EngineInput, fields: Record<string, unknown>): EngineInput => Object.assign(source, fields);

const validPlannerNext = () => ({
  searchPolicy: "COMPATIBILITY_PRESERVING" as const,
  searchBudget: { bestK: 1, maxBacktracks: 2, maxPatterns: 3, maxBranchExpansions: 4 },
  timeGridMinutes: 5,
  participantTransitionMinutes: 0,
  resourceTransitionMinutes: 5,
  mainFlow: { spaceId: 2, preferredEnd: "17:00", continuity: "REQUIRED" as const, maxBlocksByKey: 2, minTasksPerBlock: 1 },
});
const configuredInput = (configuration: unknown = validPlannerNext(), overrides: Partial<EngineInput> = {}): EngineInput =>
  runtimeInput(input({ spaceParentById: { 2: null }, ...overrides }), { plannerNext: configuration });

test("contrato ausente y canales top-level legacy ignorados", () => {
  const baseline = preflightEngineInputForPlannerNext(input());
  for (const code of ["MISSING_SEARCH_POLICY_CONFIGURATION", "MISSING_SEARCH_BUDGET_CONFIGURATION", "MISSING_MAIN_FLOW_CONFIGURATION", "UNSUPPORTED_TIME_GRID", "MISSING_TRANSITION_CONFIGURATION"]) {
    assert.ok(baseline.reasonCodes.includes(code as never), code);
  }
  assert.equal(baseline.diagnostics.integrationConfigurationPresent, false);
  assert.equal(baseline.diagnostics.transitionConfigurationComplete, false);
  assert.notEqual(baseline.sourceFingerprint, preflightEngineInputForPlannerNext(runtimeInput(input(), { plannerNext: {} })).sourceFingerprint);
  const legacy = runtimeInput(input(), {
    searchPolicy: "EXACT_CONSTRUCTIVE", searchBudget: { bestK: 1, maxBacktracks: 2, maxPatterns: 3, maxBranchExpansions: 4 },
    timeGridMinutes: 5, participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    mainFlow: { spaceId: 2, preferredEnd: "17:00", continuity: "REQUIRED", maxBlocksByKey: 2, minTasksPerBlock: 1 },
  });
  const ignored = preflightEngineInputForPlannerNext(legacy);
  assert.deepEqual(ignored.reasonCodes, baseline.reasonCodes);
  assert.equal(ignored.sourceFingerprint, baseline.sourceFingerprint);
});

test("configuración completa válida elimina exclusivamente blockers de integración", () => {
  const result = preflightEngineInputForPlannerNext(configuredInput());
  for (const code of ["MISSING_SEARCH_POLICY_CONFIGURATION", "MISSING_SEARCH_BUDGET_CONFIGURATION", "INVALID_SEARCH_BUDGET", "INVALID_SEARCH_POLICY_CONFIGURATION", "MISSING_MAIN_FLOW_CONFIGURATION", "UNSUPPORTED_TIME_GRID", "MISSING_TRANSITION_CONFIGURATION", "INVALID_TRANSITION_CONFIGURATION"]) {
    assert.ok(!result.reasonCodes.includes(code as never), code);
  }
  assert.equal(result.status, "UNSUPPORTED");
  assert.equal(result.diagnostics.integrationConfigurationPresent, true);
  assert.equal(result.diagnostics.transitionConfigurationComplete, true);
});

test("política acepta sólo los dos valores explícitos", () => {
  for (const value of ["COMPATIBILITY_PRESERVING", "EXACT_CONSTRUCTIVE"]) {
    const result = preflightEngineInputForPlannerNext(configuredInput({ ...validPlannerNext(), searchPolicy: value }));
    assert.equal(result.diagnostics.searchPolicyConfigurationPresent, true);
  }
  for (const value of [undefined, "AUTO", null, 1, "exact_constructive"]) {
    const configuration = { ...validPlannerNext(), searchPolicy: value };
    const result = preflightEngineInputForPlannerNext(configuredInput(configuration));
    assert.ok(result.reasonCodes.includes(value === undefined ? "MISSING_SEARCH_POLICY_CONFIGURATION" : "INVALID_SEARCH_POLICY_CONFIGURATION"));
  }
});

test("presupuesto distingue ausencia, incompletitud e inválidos y omite extras", () => {
  assert.ok(preflightEngineInputForPlannerNext(configuredInput({ ...validPlannerNext(), searchBudget: undefined })).reasonCodes.includes("MISSING_SEARCH_BUDGET_CONFIGURATION"));
  assert.deepEqual(issue(configuredInput({ ...validPlannerNext(), searchBudget: { bestK: 1 } }), "MISSING_SEARCH_BUDGET_CONFIGURATION").details, { invalidEntries: [], missingKeys: ["maxBacktracks", "maxPatterns", "maxBranchExpansions"], receivedValue: { bestK: 1 } });
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1"]) {
    const found = issue(configuredInput({ ...validPlannerNext(), searchBudget: { ...validPlannerNext().searchBudget, bestK: value } }), "INVALID_SEARCH_BUDGET");
    assert.equal((found.details?.invalidEntries as { key: string }[])[0].key, "bestK");
  }
  const plain = configuredInput();
  const extra = configuredInput({ ...validPlannerNext(), searchBudget: { ...validPlannerNext().searchBudget, ignored: 99 } });
  assert.equal(preflightEngineInputForPlannerNext(plain).sourceFingerprint, preflightEngineInputForPlannerNext(extra).sourceFingerprint);
});

test("mainFlow exige espacio físico descrito y preferredEnd HH:mm dentro de jornada", () => {
  for (const flow of [
    { ...validPlannerNext().mainFlow, spaceId: undefined },
    { ...validPlannerNext().mainFlow, spaceId: 3 },
    { ...validPlannerNext().mainFlow, preferredEnd: "17:0" },
    { ...validPlannerNext().mainFlow, preferredEnd: "19:00" },
    { ...validPlannerNext().mainFlow, continuity: "OPTIONAL" },
    { ...validPlannerNext().mainFlow, maxBlocksByKey: 0 },
    { ...validPlannerNext().mainFlow, minTasksPerBlock: 1.5 },
  ]) assert.ok(preflightEngineInputForPlannerNext(configuredInput({ ...validPlannerNext(), mainFlow: flow })).reasonCodes.includes("MISSING_MAIN_FLOW_CONFIGURATION"));
  const zoneOnly = configuredInput({ ...validPlannerNext(), mainFlow: { ...validPlannerNext().mainFlow, spaceId: 9 } }, { optimizerMainZoneId: 9 });
  assert.ok(preflightEngineInputForPlannerNext(zoneOnly).reasonCodes.includes("MISSING_MAIN_FLOW_CONFIGURATION"));
});

test("rejilla valida forma, jornada, duraciones, tiempos y preferredEnd desde inicio de jornada", () => {
  for (const grid of [undefined, 0, -1, 1.5, 601]) {
    assert.ok(preflightEngineInputForPlannerNext(configuredInput({ ...validPlannerNext(), timeGridMinutes: grid })).reasonCodes.includes("UNSUPPORTED_TIME_GRID"));
  }
  assert.equal(preflightEngineInputForPlannerNext(configuredInput()).diagnostics.timeGridVerifiable, true);
  assert.deepEqual(issue(configuredInput({ ...validPlannerNext(), timeGridMinutes: 5 }, { tasks: [task(1, { durationOverrideMin: 17 })] }), "UNSUPPORTED_TIME_GRID").details?.incompatibleDurations, [17]);
  assert.deepEqual(issue(configuredInput({ ...validPlannerNext(), timeGridMinutes: 10 }, { globalHardBreaks: [{ start: "15:05", end: "15:15" }] }), "UNSUPPORTED_TIME_GRID").details?.incompatibleTimes, [905, 915]);
  assert.deepEqual(issue(configuredInput({ ...validPlannerNext(), timeGridMinutes: 10, mainFlow: { ...validPlannerNext().mainFlow, preferredEnd: "17:01" } }), "UNSUPPORTED_TIME_GRID").details?.incompatibleTimes, [1021]);
  const offset = configuredInput({ ...validPlannerNext(), timeGridMinutes: 15, mainFlow: { ...validPlannerNext().mainFlow, preferredEnd: "17:05" } }, { workDay: { start: "08:05", end: "18:05" }, meal: { start: "13:05", end: "14:05" } });
  assert.equal(preflightEngineInputForPlannerNext(offset).diagnostics.timeGridVerifiable, true);
});

test("transiciones requieren ambos enteros finitos no negativos", () => {
  assert.deepEqual(issue(configuredInput({ ...validPlannerNext(), participantTransitionMinutes: undefined, resourceTransitionMinutes: undefined }), "MISSING_TRANSITION_CONFIGURATION").details, { missingKeys: ["participantTransitionMinutes", "resourceTransitionMinutes"] });
  assert.deepEqual(issue(configuredInput({ ...validPlannerNext(), resourceTransitionMinutes: undefined }), "MISSING_TRANSITION_CONFIGURATION").details, { missingKeys: ["resourceTransitionMinutes"] });
  for (const pair of [[0, 0], [2, 3]]) assert.equal(preflightEngineInputForPlannerNext(configuredInput({ ...validPlannerNext(), participantTransitionMinutes: pair[0], resourceTransitionMinutes: pair[1] })).diagnostics.transitionConfigurationComplete, true);
  for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1"]) {
    assert.ok(preflightEngineInputForPlannerNext(configuredInput({ ...validPlannerNext(), participantTransitionMinutes: value })).reasonCodes.includes("INVALID_TRANSITION_CONFIGURATION"));
    assert.ok(preflightEngineInputForPlannerNext(configuredInput({ ...validPlannerNext(), resourceTransitionMinutes: value })).reasonCodes.includes("INVALID_TRANSITION_CONFIGURATION"));
  }
});

test("identidad y fingerprints dependen sólo de configuración canónica auditada", () => {
  const baseline = preflightEngineInputForPlannerNext(configuredInput());
  assert.ok(baseline.identityMap.some((entry) => entry.namespace === "space" && entry.sourceId === "2"));
  assert.ok(!baseline.identityMap.some((entry) => entry.namespace === "zone" && entry.sourceId === "2"));
  assert.ok(!baseline.reasonCodes.includes("DUPLICATE_ID"));
  for (const configuration of [
    { ...validPlannerNext(), searchPolicy: "EXACT_CONSTRUCTIVE" },
    { ...validPlannerNext(), searchBudget: { ...validPlannerNext().searchBudget, bestK: 9 } },
    { ...validPlannerNext(), timeGridMinutes: 10 },
    { ...validPlannerNext(), participantTransitionMinutes: 2 },
    { ...validPlannerNext(), resourceTransitionMinutes: 2 },
    { ...validPlannerNext(), mainFlow: { ...validPlannerNext().mainFlow, preferredEnd: "16:00" } },
  ]) assert.notEqual(baseline.sourceFingerprint, preflightEngineInputForPlannerNext(configuredInput(configuration)).sourceFingerprint);
  const policyChanged = preflightEngineInputForPlannerNext(configuredInput({ ...validPlannerNext(), searchPolicy: "EXACT_CONSTRUCTIVE" }));
  assert.equal(baseline.identityMapFingerprint, policyChanged.identityMapFingerprint);
  const bothSpaces = { spaceParentById: { 2: null, 3: null } };
  const spaceTwo = preflightEngineInputForPlannerNext(configuredInput(validPlannerNext(), bothSpaces));
  const spaceThree = preflightEngineInputForPlannerNext(configuredInput({ ...validPlannerNext(), mainFlow: { ...validPlannerNext().mainFlow, spaceId: 3 } }, bothSpaces));
  assert.notEqual(spaceTwo.identityMapFingerprint, spaceThree.identityMapFingerprint);
  const reversedConfiguration = { mainFlow: validPlannerNext().mainFlow, resourceTransitionMinutes: 5, participantTransitionMinutes: 0, timeGridMinutes: 5, searchBudget: validPlannerNext().searchBudget, searchPolicy: "COMPATIBILITY_PRESERVING" };
  assert.equal(baseline.sourceFingerprint, preflightEngineInputForPlannerNext(configuredInput(reversedConfiguration)).sourceFingerprint);
  const extra = { ...validPlannerNext(), ignored: true, mainFlow: { ...validPlannerNext().mainFlow, label: "ignored" } };
  assert.equal(baseline.sourceFingerprint, preflightEngineInputForPlannerNext(configuredInput(extra)).sourceFingerprint);
});

test("canonicaliza la referencia runtime de mainFlow.spaceId para el identity-map fingerprint", () => {
  const numericInput = deepFreeze(configuredInput());
  const stringInput = deepFreeze(configuredInput({
    ...validPlannerNext(),
    mainFlow: { ...validPlannerNext().mainFlow, spaceId: "2" },
  }));
  const numericBefore = clone(numericInput);
  const stringBefore = clone(stringInput);

  const numericResult = preflightEngineInputForPlannerNext(numericInput);
  const stringResult = preflightEngineInputForPlannerNext(stringInput);

  assert.deepEqual(numericResult.identityMap, stringResult.identityMap);
  assert.equal(numericResult.identityMapFingerprint, stringResult.identityMapFingerprint);
  assert.notEqual(numericResult.sourceFingerprint, stringResult.sourceFingerprint);
  assert.ok(!numericResult.reasonCodes.includes("MISSING_MAIN_FLOW_CONFIGURATION"));
  assert.ok(stringResult.reasonCodes.includes("MISSING_MAIN_FLOW_CONFIGURATION"));
  assert.equal(stringResult.status, "UNSUPPORTED");
  assert.deepEqual(numericInput, numericBefore);
  assert.deepEqual(stringInput, stringBefore);
  for (const result of [numericResult, stringResult]) {
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.identityMap));
    assert.ok(Object.isFrozen(result.diagnostics));
    assert.ok(Object.isFrozen(result.issues));
    result.identityMap.forEach((entry) => assert.ok(Object.isFrozen(entry)));
    result.issues.forEach((entry) => {
      assert.ok(Object.isFrozen(entry));
      if (entry.details) assert.ok(Object.isFrozen(entry.details));
    });
  }
});

test("cambiar sólo searchBudget.bestK no cambia identidades", () => {
  const baseline = preflightEngineInputForPlannerNext(configuredInput());
  const changed = preflightEngineInputForPlannerNext(configuredInput({
    ...validPlannerNext(),
    searchBudget: { ...validPlannerNext().searchBudget, bestK: 2 },
  }));

  assert.notEqual(baseline.sourceFingerprint, changed.sourceFingerprint);
  assert.deepEqual(baseline.identityMap, changed.identityMap);
  assert.equal(baseline.identityMapFingerprint, changed.identityMapFingerprint);
  assert.equal(baseline.diagnostics.searchBudgetConfigurationComplete, true);
  assert.equal(changed.diagnostics.searchBudgetConfigurationComplete, true);
  assert.ok(!baseline.reasonCodes.includes("INVALID_SEARCH_BUDGET"));
  assert.ok(!changed.reasonCodes.includes("INVALID_SEARCH_BUDGET"));
});

test("operaciones ancladas runtime distinguen incompletitud y ambigüedad", () => {
  const incomplete = issue(runtimeInput(input(), { anchoredAccompaniments: [{ id: "a", anchorTaskId: 1 }] }), "INCOMPLETE_ANCHORED_OPERATION", "a");
  assert.equal(incomplete.path, "anchoredAccompaniments.0");
  const validOperation = { id: "a", anchorTaskId: 1, beforeTaskIds: [2], afterTaskIds: [3], adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED" };
  const complete = preflightEngineInputForPlannerNext(runtimeInput(input({ tasks: [task(1), task(2), task(3)] }), { anchoredAccompaniments: [validOperation] }));
  assert.equal(complete.diagnostics.anchoredOperationContractPresent, true);
  const ambiguous = runtimeInput(input({ tasks: [task(1), task(2), task(3)] }), { anchoredAccompaniments: [validOperation, { ...validOperation }] });
  assert.ok(preflightEngineInputForPlannerNext(ambiguous).reasonCodes.includes("AMBIGUOUS_ANCHORED_OPERATION"));
});

const anchoredOperation = (id: string, anchorTaskId: number, beforeTaskIds: number[], afterTaskIds: number[]) => ({
  id, anchorTaskId, beforeTaskIds, afterTaskIds,
  adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED",
});

for (const [name, operation, missingTaskIds] of [
  ["anchor inexistente", anchoredOperation("a", 9, [2], []), ["9"]],
  ["before inexistente", anchoredOperation("a", 1, [9], []), ["9"]],
  ["after inexistente", anchoredOperation("a", 1, [], [9]), ["9"]],
  ["varios IDs inexistentes", anchoredOperation("a", 8, [9], [7]), ["7", "8", "9"]],
] as const) {
  test(`operación anclada rechaza ${name}`, () => {
    const source = runtimeInput(input({ tasks: [task(1), task(2)] }), { anchoredAccompaniments: [operation] });
    const found = issue(source, "INCOMPLETE_ANCHORED_OPERATION", "a");
    assert.deepEqual(found.details, { hasEffectiveSegments: true, missingTaskIds });
    assert.equal(preflightEngineInputForPlannerNext(source).diagnostics.anchoredOperationContractPresent, false);
  });
}

test("operación anclada sin contrato de segmentos es incompleta", () => {
  const operation = { id: "a", anchorTaskId: 1, adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED" };
  assert.deepEqual(issue(runtimeInput(input(), { anchoredAccompaniments: [operation] }), "INCOMPLETE_ANCHORED_OPERATION", "a").details, {
    hasEffectiveSegments: false, missingTaskIds: [],
  });
});

test("operación anclada con before/after vacíos es incompleta", () => {
  const source = runtimeInput(input(), { anchoredAccompaniments: [anchoredOperation("a", 1, [], [])] });
  assert.deepEqual(issue(source, "INCOMPLETE_ANCHORED_OPERATION", "a").details, { hasEffectiveSegments: false, missingTaskIds: [] });
});

test("operación anclada completa exige y encuentra todas sus tareas", () => {
  const source = runtimeInput(input({ tasks: [task(1), task(2), task(3)] }), { anchoredAccompaniments: [anchoredOperation("a", 1, [2], [3])] });
  const result = preflightEngineInputForPlannerNext(source);
  assert.equal(result.diagnostics.anchoredOperationContractPresent, true);
  assert.ok(!result.reasonCodes.includes("INCOMPLETE_ANCHORED_OPERATION"));
});

test("operación anclada completa pero ambigua permanece rechazada", () => {
  const operation = anchoredOperation("a", 1, [2], [2]);
  const result = preflightEngineInputForPlannerNext(runtimeInput(input({ tasks: [task(1), task(2)] }), { anchoredAccompaniments: [operation] }));
  assert.equal(result.diagnostics.anchoredOperationContractPresent, false);
  assert.ok(result.reasonCodes.includes("AMBIGUOUS_ANCHORED_OPERATION"));
});

const twoIndependentAnchoredOperations = () => [
  anchoredOperation("a", 1, [2], []),
  anchoredOperation("b", 3, [], [4]),
];

test("dos operaciones ancladas válidas e independientes son completas", () => {
  const source = runtimeInput(input({ tasks: [task(1), task(2), task(3), task(4)] }), { anchoredAccompaniments: twoIndependentAnchoredOperations() });
  assert.equal(preflightEngineInputForPlannerNext(source).diagnostics.anchoredOperationContractPresent, true);
});

test("orden exterior de operaciones ancladas no cambia Evidence", () => {
  const tasks = [task(1), task(2), task(3), task(4)];
  const normal = runtimeInput(input({ tasks }), { anchoredAccompaniments: twoIndependentAnchoredOperations() });
  const inverted = runtimeInput(input({ tasks: clone(tasks) }), { anchoredAccompaniments: twoIndependentAnchoredOperations().reverse() });
  const normalResult = preflightEngineInputForPlannerNext(normal);
  const invertedResult = preflightEngineInputForPlannerNext(inverted);
  assert.deepEqual(normalResult, invertedResult);
  assert.equal(normalResult.sourceFingerprint, invertedResult.sourceFingerprint);
  assert.deepEqual(normalResult.identityMap, invertedResult.identityMap);
  assert.deepEqual(normalResult.issues, invertedResult.issues);
});

for (const [value, expected] of [[undefined, false], [0, false], [1, true], [2, true], [-1, true], [Number.NaN, true]] as const) {
  test(`camerasOverride ${String(value)} audita cantidad sin elegir recurso`, () => {
    const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { camerasOverride: value })] }));
    assert.equal(result.issues.some((entry) => entry.code === "UNSUPPORTED_RESOURCE_REQUIREMENT" && entry.path === "tasks.1.camerasOverride"), expected);
  });
}

for (const [field, value] of [["blocksSpace", false], ["allowsSpaceOverlap", true], ["spaceOccupancyMode", "shared"], ["spaceOccupancyMode", "non_blocking"]] as const) {
  test(`ocupación de tarea ${field}=${String(value)} no se degrada a exclusiva`, () => {
    const found = issue(input({ tasks: [task(1, { [field]: value })] }), "UNSUPPORTED_SPACE_OCCUPANCY", "1");
    assert.equal(found.path, "tasks.1.spaceOccupancy");
  });
}

test("espacio explícitamente no exclusivo no se degrada", () => {
  assert.deepEqual(issue(input({ spaceIsExclusiveById: { 2: false } }), "UNSUPPORTED_SPACE_OCCUPANCY", "2").details, { exclusive: false });
});

test("transporte detecta aliases, pesos y metadata de tarea e inventaría IDs", () => {
  const sources = [
    input({ arrivalMinGapMinutes: 5 }), input({ departureMinGapMinutes: 5 }), input({ arrivalTaskTemplateName: "present" }),
    input({ departureTaskTemplateName: "present" }), input({ optimizerWeights: { arrivalDepartureGrouping: 1 } }),
    input({ tasks: [task(1, { transportGroupCapacity: 2 })] }), input({ tasks: [task(1, { transportGroupingTarget: 2 })] }),
    input({ tasks: [task(1, { transportGroupingWeight: 1 })] }),
  ];
  sources.forEach((source) => assert.ok(preflightEngineInputForPlannerNext(source).reasonCodes.includes("UNSUPPORTED_TRANSPORT_CONTRACT")));
  const configured = input({ transportSpaceId: 20, transportSettings: { source: "engine-buildInput-optimizer-transport", transportSpaceId: 21, arrivalTemplateId: 30, departureTemplateId: "31" } });
  const keys = identityKeys(configured);
  ["space:20", "space:21", "template:30", "template:31"].forEach((key) => assert.ok(keys.includes(key), key));
});

test("setup detecta zonas, niveles y pesos activos sin colapsar main zone a espacio", () => {
  const sources = [input({ groupingZoneIds: [3] }), input({ optimizerGroupingLevel: 1 }), input({ optimizerWeights: { groupBySpaceActive: 1 } }), input({ maxTemplateChangesByZoneId: { 4: 2 } })];
  sources.forEach((source) => assert.ok(preflightEngineInputForPlannerNext(source).reasonCodes.includes("UNSUPPORTED_SETUP_MAPPING")));
  const keys = identityKeys(input({ optimizerMainZoneId: 2, groupingZoneIds: [3], maxTemplateChangesByZoneId: { 4: 2 } }));
  ["zone:2", "zone:3", "zone:4"].forEach((key) => assert.ok(keys.includes(key), key));
  assert.ok(!keys.includes("space:2"));
});

test("comidas adicionales auditan aliases, concursantes, zonas y tareas", () => {
  const aliases = preflightEngineInputForPlannerNext(input({ actualMealStart: "13:00", actualMealEnd: "13:30" }));
  assert.equal(aliases.diagnostics.breakCount, 2);
  assert.ok(aliases.issues.some((entry) => entry.path === "concreteMeals"));
  assert.deepEqual(issue(input({ protectedBreaks: [{ id: 1, start: "15:00", end: "15:10" }] }), "UNSUPPORTED_BREAK_SCOPE", "1").details, { scope: "unspecified-protected-break" });
  assert.equal(issue(input({ contestantMealDurationMinutes: 30 }), "UNSUPPORTED_BREAK_SCOPE").path, "contestantMeal");
  const zoned = input({ spaceMealBreakMinutesByZoneId: { 7: 30 } });
  assert.equal(issue(zoned, "UNSUPPORTED_BREAK_SCOPE").path, "spaceMealBreakMinutesByZoneId");
  assert.ok(identityKeys(zoned).includes("zone:7"));
  assert.equal(issue(input({ tasks: [task(1, { breakKind: "space_meal", mealOccupiesSpace: true })] }), "UNSUPPORTED_BREAK_SCOPE", "1").path, "tasks.1.breakContract");
});

test("identity map incluye locks y dependencias aunque sus referencias falten", () => {
  const source = input({ tasks: [task(1, { dependsOnTaskIds: [9], dependsOnTemplateIds: [19], dependsOnTemplateId: 20 })], locks: [{ id: 1, planId: 1, taskId: 8, lockType: "resource", lockedResourceId: 7 }] });
  const keys = identityKeys(source);
  ["task:8", "task:9", "plan-resource:7", "template:19"].forEach((key) => assert.ok(keys.includes(key), key));
  assert.ok(!keys.includes("template:20"), "array dependency is authoritative over legacy template dependency");
});

test("diagnostics de recursos cuentan definiciones y no referencias inexistentes", () => {
  const source = input({ planResourceItems: [{ id: 1, resourceItemId: 10, typeId: 100, name: "defined", isAvailable: true }], tasks: [task(1, { assignedResourceIds: [2, 3] })] });
  const result = preflightEngineInputForPlannerNext(source);
  assert.equal(result.diagnostics.planResourceCount, 1);
  assert.equal(result.diagnostics.resourceItemCount, 1);
  assert.equal(result.diagnostics.missingResourceReferenceCount, 2);
});

test("fingerprint excluye bundles soft y unifica cualquier planning pending presente", () => {
  const baselineInput = input({ tasks: [task(1, { startPlanned: "09:00" })] });
  const baseline = preflightEngineInputForPlannerNext(baselineInput).sourceFingerprint;
  const both = input({ tasks: [task(1, { startPlanned: "11:00", endPlanned: "11:30" })] });
  assert.equal(baseline, preflightEngineInputForPlannerNext(both).sourceFingerprint);
  const soft = clone(baselineInput);
  soft.resourceBundles = [{ id: "bundle", name: "soft", metadata: { changed: true } }];
  soft.resourceBundleLoadWarnings = [{ source: "resource_bundles", message: "soft" }];
  assert.equal(baseline, preflightEngineInputForPlannerNext(soft).sourceFingerprint);
  assert.notEqual(baseline, preflightEngineInputForPlannerNext(input()).sourceFingerprint);
});

test("tareas protegidas no mezclan extremos reales y planificados", () => {
  const described = { 2: null };
  for (const protectedTask of [
    task(1, { status: "done", spaceId: 2, startReal: "09:00", endReal: "09:30" }),
    task(1, { status: "done", spaceId: 2, startPlanned: "09:00", endPlanned: "09:30" }),
  ]) assert.ok(!preflightEngineInputForPlannerNext(input({ tasks: [protectedTask], spaceParentById: described })).reasonCodes.includes("PROTECTED_TASK_WITHOUT_FIXED_PLANNING"));
  for (const protectedTask of [
    task(1, { status: "done", spaceId: 2, startReal: "09:00", endPlanned: "09:30" }),
    task(1, { status: "done", spaceId: 2, endReal: "09:30", startPlanned: "09:00" }),
  ]) assert.equal(issue(input({ tasks: [protectedTask], spaceParentById: described }), "PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE", "1").path, "tasks.1.realPlanning");
  assert.ok(preflightEngineInputForPlannerNext(input({ tasks: [task(1, { status: "done", spaceId: 2, startReal: "10:00", endReal: "09:00" })], spaceParentById: described })).reasonCodes.includes("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE"));
  assert.ok(preflightEngineInputForPlannerNext(input({ tasks: [task(1, { status: "done", startReal: "09:00", endReal: "09:30", assignedResourceIds: [99] })] })).reasonCodes.includes("MISSING_RESOURCE_REFERENCE"));
});

const EXPECTED_SCENARIOS: Record<string, unknown> = {
  "real-main-stage-with-backlog": {
    "scenarioId": "real-main-stage-with-backlog",
    "status": "UNSUPPORTED",
    "reasonCodes": [
      "MISSING_MAIN_FLOW_CONFIGURATION",
      "MISSING_PARTICIPANT_AVAILABILITY",
      "MISSING_SEARCH_BUDGET_CONFIGURATION",
      "MISSING_SEARCH_POLICY_CONFIGURATION",
      "MISSING_SPACE_REFERENCE",
      "MISSING_TASK_DURATION",
      "MISSING_TRANSITION_CONFIGURATION",
      "UNSUPPORTED_RESOURCE_REQUIREMENT",
      "UNSUPPORTED_SETUP_MAPPING",
      "UNSUPPORTED_TASK_ROLE",
      "UNSUPPORTED_TIME_GRID"
    ],
    "diagnostics": {
      "taskCount": 3,
      "planifiableTaskCount": 3,
      "protectedTaskCount": 0,
      "cancelledTaskCount": 0,
      "pendingPlanningDiscardCount": 2,
      "lockCount": 0,
      "participantCount": 2,
      "coachReferenceCount": 0,
      "missingCoachReferenceCount": 0,
      "spaceCount": 1,
      "referencedSpaceCount": 1,
      "describedSpaceCount": 1,
      "zoneCount": 1,
      "planResourceCount": 3,
      "requiredPlanResourceCount": 1,
      "usableRequiredPlanResourceCount": 1,
      "unusableRequiredPlanResourceCount": 0,
      "protectedTaskResourceAvailabilityConflictCount": 0,
      "requiredSpaceCount": 1,
      "usableRequiredSpaceCount": 1,
      "unusableRequiredSpaceCount": 0,
      "requiredZoneCount": 1,
      "protectedTaskSpatialAvailabilityConflictCount": 0,
      "resourceItemCount": 3,
      "resourceAssignmentReferenceCount": 2,
      "resourceComponentReferenceCount": 0,
      "missingResourceReferenceCount": 0,
      "dependencyCount": 0,
      "breakCount": 1,
      "transportConfigured": false,
      "setupConfigurationDetected": true,
      "integrationConfigurationPresent": false,
      "mainFlowConfigurationComplete": false,
      "searchPolicyConfigurationPresent": false,
      "searchBudgetConfigurationComplete": false,
      "timeGridVerifiable": false,
      "transitionConfigurationComplete": false,
      "anchoredOperationContractPresent": false,
      "unresolvedTaskRoleCount": 3,
      "missingDurationTaskCount": 2,
      "missingAvailabilityCounts": {
        "participants": 2,
        "spaces": 0,
        "resources": 0
      },
      "unsupportedCapabilityCodes": [
        "UNSUPPORTED_RESOURCE_REQUIREMENT",
        "UNSUPPORTED_SETUP_MAPPING",
        "UNSUPPORTED_TASK_ROLE",
        "UNSUPPORTED_TIME_GRID"
      ],
      "readOnly": true
    },
    "sourceFingerprint": "ee7f89bdabfaa57bec7720013da926abb5beeb9e2504353c48a3fca4d42f79a8",
    "identityMapFingerprint": "68a72d0ac8f1d2246d5a7a8132c0090b43d76bb9a2dcb59f9f4b1cdb7b5c3b89"
  },
  "real-resource-lock-pressure": {
    "scenarioId": "real-resource-lock-pressure",
    "status": "UNSUPPORTED",
    "reasonCodes": [
      "MISSING_MAIN_FLOW_CONFIGURATION",
      "MISSING_PARTICIPANT_AVAILABILITY",
      "MISSING_SEARCH_BUDGET_CONFIGURATION",
      "MISSING_SEARCH_POLICY_CONFIGURATION",
      "MISSING_TASK_DURATION",
      "MISSING_TRANSITION_CONFIGURATION",
      "UNREPRESENTABLE_RESOURCE_LOCK",
      "UNREPRESENTABLE_SPACE_LOCK",
      "UNSUPPORTED_SETUP_MAPPING",
      "UNSUPPORTED_TASK_ROLE",
      "UNSUPPORTED_TIME_GRID"
    ],
    "diagnostics": {
      "taskCount": 3,
      "planifiableTaskCount": 3,
      "protectedTaskCount": 0,
      "cancelledTaskCount": 0,
      "pendingPlanningDiscardCount": 3,
      "lockCount": 1,
      "participantCount": 3,
      "coachReferenceCount": 0,
      "missingCoachReferenceCount": 0,
      "spaceCount": 3,
      "referencedSpaceCount": 3,
      "describedSpaceCount": 3,
      "zoneCount": 2,
      "planResourceCount": 3,
      "requiredPlanResourceCount": 2,
      "usableRequiredPlanResourceCount": 2,
      "unusableRequiredPlanResourceCount": 0,
      "protectedTaskResourceAvailabilityConflictCount": 0,
      "requiredSpaceCount": 3,
      "usableRequiredSpaceCount": 3,
      "unusableRequiredSpaceCount": 0,
      "requiredZoneCount": 2,
      "protectedTaskSpatialAvailabilityConflictCount": 0,
      "resourceItemCount": 3,
      "resourceAssignmentReferenceCount": 3,
      "resourceComponentReferenceCount": 0,
      "missingResourceReferenceCount": 0,
      "dependencyCount": 0,
      "breakCount": 1,
      "transportConfigured": false,
      "setupConfigurationDetected": true,
      "integrationConfigurationPresent": false,
      "mainFlowConfigurationComplete": false,
      "searchPolicyConfigurationPresent": false,
      "searchBudgetConfigurationComplete": false,
      "timeGridVerifiable": false,
      "transitionConfigurationComplete": false,
      "anchoredOperationContractPresent": false,
      "unresolvedTaskRoleCount": 3,
      "missingDurationTaskCount": 3,
      "missingAvailabilityCounts": {
        "participants": 3,
        "spaces": 0,
        "resources": 0
      },
      "unsupportedCapabilityCodes": [
        "UNREPRESENTABLE_RESOURCE_LOCK",
        "UNREPRESENTABLE_SPACE_LOCK",
        "UNSUPPORTED_SETUP_MAPPING",
        "UNSUPPORTED_TASK_ROLE",
        "UNSUPPORTED_TIME_GRID"
      ],
      "readOnly": true
    },
    "sourceFingerprint": "208712de676bfdd5d6edac56d9f50cc30b5dd076f1db13c9b8435649888b4614",
    "identityMapFingerprint": "794472d65522cebf41bbc687d25dccb474e8579766fd01de4a45fda48941cc65"
  },
  "real-protected-break-recovery": {
    "scenarioId": "real-protected-break-recovery",
    "status": "UNSUPPORTED",
    "reasonCodes": [
      "MISSING_MAIN_FLOW_CONFIGURATION",
      "MISSING_PARTICIPANT_AVAILABILITY",
      "MISSING_SEARCH_BUDGET_CONFIGURATION",
      "MISSING_SEARCH_POLICY_CONFIGURATION",
      "MISSING_SPACE_REFERENCE",
      "MISSING_TASK_DURATION",
      "MISSING_TRANSITION_CONFIGURATION",
      "UNSUPPORTED_RESOURCE_REQUIREMENT",
      "UNSUPPORTED_SETUP_MAPPING",
      "UNSUPPORTED_TASK_ROLE",
      "UNSUPPORTED_TIME_GRID"
    ],
    "diagnostics": {
      "taskCount": 3,
      "planifiableTaskCount": 3,
      "protectedTaskCount": 0,
      "cancelledTaskCount": 0,
      "pendingPlanningDiscardCount": 2,
      "lockCount": 0,
      "participantCount": 2,
      "coachReferenceCount": 0,
      "missingCoachReferenceCount": 0,
      "spaceCount": 2,
      "referencedSpaceCount": 2,
      "describedSpaceCount": 2,
      "zoneCount": 1,
      "planResourceCount": 3,
      "requiredPlanResourceCount": 2,
      "usableRequiredPlanResourceCount": 2,
      "unusableRequiredPlanResourceCount": 0,
      "protectedTaskResourceAvailabilityConflictCount": 0,
      "requiredSpaceCount": 2,
      "usableRequiredSpaceCount": 2,
      "unusableRequiredSpaceCount": 0,
      "requiredZoneCount": 1,
      "protectedTaskSpatialAvailabilityConflictCount": 0,
      "resourceItemCount": 3,
      "resourceAssignmentReferenceCount": 2,
      "resourceComponentReferenceCount": 0,
      "missingResourceReferenceCount": 0,
      "dependencyCount": 0,
      "breakCount": 1,
      "transportConfigured": false,
      "setupConfigurationDetected": true,
      "integrationConfigurationPresent": false,
      "mainFlowConfigurationComplete": false,
      "searchPolicyConfigurationPresent": false,
      "searchBudgetConfigurationComplete": false,
      "timeGridVerifiable": false,
      "transitionConfigurationComplete": false,
      "anchoredOperationContractPresent": false,
      "unresolvedTaskRoleCount": 3,
      "missingDurationTaskCount": 2,
      "missingAvailabilityCounts": {
        "participants": 2,
        "spaces": 0,
        "resources": 0
      },
      "unsupportedCapabilityCodes": [
        "UNSUPPORTED_RESOURCE_REQUIREMENT",
        "UNSUPPORTED_SETUP_MAPPING",
        "UNSUPPORTED_TASK_ROLE",
        "UNSUPPORTED_TIME_GRID"
      ],
      "readOnly": true
    },
    "sourceFingerprint": "d157c50703c595ba04dd4a80972a6b42cca90618bbf78b77095172a0464e1bb9",
    "identityMapFingerprint": "fd6782b3ba5a6104c13e70baeff7303baf48b9f1561eea76e37e4a33f58eb01a"
  }
};


test("mapping ausente conserva compatibilidad y mapping vacío cambia sólo source fingerprint", () => {
  const absent = preflightEngineInputForPlannerNext(input());
  const empty = preflightEngineInputForPlannerNext(input({ vocalCoachPlanResourceItemIdByContestantId: {} }));
  assert.equal(absent.issues.filter((entry) => entry.code === "MISSING_COACH_REFERENCE").length, 0);
  assert.equal(empty.issues.filter((entry) => entry.code === "MISSING_COACH_REFERENCE").length, 0);
  assert.notEqual(absent.sourceFingerprint, empty.sourceFingerprint);
  assert.deepEqual(absent.identityMap, empty.identityMap);
  assert.equal(absent.identityMapFingerprint, empty.identityMapFingerprint);
});

test("mapping válido conserva participantes y plan-resources aunque compartan coach", () => {
  const result = preflightEngineInputForPlannerNext(input({
    tasks: [],
    planResourceItems: [
      { id: 335, resourceItemId: 35, typeId: 3, name: "A", isAvailable: false },
      { id: 336, resourceItemId: 36, typeId: 3, name: "B", isAvailable: true },
    ],
    vocalCoachPlanResourceItemIdByContestantId: { 7: 335, 8: 335, 9: 336 },
  }));
  for (const canonicalId of ["participant:7", "participant:8", "participant:9", "plan-resource:335", "plan-resource:336"]) {
    assert.ok(result.identityMap.some((entry) => entry.canonicalId === canonicalId), canonicalId);
  }
  assert.equal(result.diagnostics.coachReferenceCount, 3);
  assert.equal(result.diagnostics.missingCoachReferenceCount, 0);
  assert.equal(result.issues.filter((entry) => entry.code === "MISSING_COACH_REFERENCE").length, 0);
  assert.equal(result.issues.filter((entry) => entry.code === "MISSING_PARTICIPANT_AVAILABILITY").length, 0);
});

for (const [label, mapping, receivedType] of [
  ["null", null, "null"], ["array", [], "array"], ["string", "x", "string"], ["number", 7, "number"],
] as const) {
  test(`contenedor runtime inválido: ${label}`, () => {
    const source = input() as unknown as Record<string, unknown>;
    source.vocalCoachPlanResourceItemIdByContestantId = mapping;
    const coachIssues = preflightEngineInputForPlannerNext(source as unknown as EngineInput).issues.filter((entry) => entry.code === "MISSING_COACH_REFERENCE");
    assert.equal(coachIssues.length, 1);
    assert.deepEqual(coachIssues[0], {
      code: "MISSING_COACH_REFERENCE", entityKind: "plan", entityId: "1",
      path: "vocalCoachPlanResourceItemIdByContestantId",
      message: "Contestant vocal-coach assignment mapping is not an indexable object.", blocking: true,
      details: { mappingPresent: true, mappingValid: false, receivedType },
    });
  });
}

for (const contestantKey of ["0", "-1", "1.5", "01", " 1 ", "NaN", "abc"]) {
  test(`clave runtime inválida: ${JSON.stringify(contestantKey)}`, () => {
    const source = input({ planResourceItems: [{ id: 335, resourceItemId: 35, typeId: 3, name: "x", isAvailable: true }] }) as unknown as Record<string, unknown>;
    source.vocalCoachPlanResourceItemIdByContestantId = { [contestantKey]: 335 };
    const found = issue(source as unknown as EngineInput, "MISSING_COACH_REFERENCE", contestantKey);
    assert.equal(found.entityKind, "contestant");
    assert.equal(found.path, `vocalCoachPlanResourceItemIdByContestantId.${contestantKey}`);
    assert.deepEqual(found.details, { contestantIdValid: false, receivedContestantId: contestantKey });
    assert.ok(!preflightEngineInputForPlannerNext(source as unknown as EngineInput).identityMap.some((entry) => entry.canonicalId === `participant:${contestantKey}`));
  });
}

test("clave inválida conserva independientemente la identidad de un coach existente", () => {
  const source = deepFreeze(input({
    tasks: [],
    planResourceItems: [{ id: 335, resourceItemId: 35, typeId: 3, name: "coach", isAvailable: true }],
    vocalCoachPlanResourceItemIdByContestantId: { "01": 335 } as unknown as Record<number, number>,
  }));
  const before = clone(source);
  const result = preflightEngineInputForPlannerNext(source);
  const coachIssues = result.issues.filter((entry) => entry.code === "MISSING_COACH_REFERENCE");
  assert.equal(coachIssues.length, 1);
  assert.equal(coachIssues[0].entityId, "01");
  assert.equal(coachIssues[0].path, "vocalCoachPlanResourceItemIdByContestantId.01");
  assert.ok(!result.identityMap.some((entry) => entry.canonicalId === "participant:01"));
  assert.ok(result.identityMap.some((entry) => entry.canonicalId === "plan-resource:335"));
  assert.ok(!coachIssues.some((entry) => entry.details?.planResourceItemDefined === false));
  assert.deepEqual(source, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.identityMap));
  assert.ok(Object.isFrozen(result.issues));
});

test("clave inválida deduplica el blocker legacy equivalente sin convertir la relación en válida", () => {
  const source = deepFreeze(input({
    tasks: [],
    coachResourceIds: [335],
    planResourceItems: [],
    vocalCoachPlanResourceItemIdByContestantId: { "01": 335 } as unknown as Record<number, number>,
  }));
  const before = clone(source);
  const first = preflightEngineInputForPlannerNext(source);
  const repeated = preflightEngineInputForPlannerNext(source);
  const coachIssues = first.issues.filter((entry) => entry.code === "MISSING_COACH_REFERENCE");
  assert.equal(coachIssues.length, 1);
  assert.equal(coachIssues[0].entityId, "01");
  assert.equal(coachIssues[0].path, "vocalCoachPlanResourceItemIdByContestantId.01");
  assert.ok(first.identityMap.some((entry) => entry.canonicalId === "plan-resource:335"));
  assert.ok(!first.identityMap.some((entry) => entry.canonicalId === "participant:01"));
  assert.equal(first.diagnostics.missingCoachReferenceCount, 1);
  assert.equal(first.diagnostics.coachReferenceCount, 2);
  assert.deepEqual(first, repeated);
  assert.deepEqual(source, before);
});

test("clave válida y coach inexistente deduplican exactamente el agregado legacy", () => {
  const result = preflightEngineInputForPlannerNext(input({
    tasks: [],
    coachResourceIds: [335],
    planResourceItems: [],
    vocalCoachPlanResourceItemIdByContestantId: { 7: 335 },
  }));
  const coachIssues = result.issues.filter((entry) => entry.code === "MISSING_COACH_REFERENCE");
  assert.equal(coachIssues.length, 1);
  assert.equal(coachIssues[0].entityId, "7");
  assert.deepEqual(coachIssues[0].details, { contestantId: 7, planResourceItemDefined: false, vocalCoachPlanResourceItemId: 335 });
  assert.ok(result.identityMap.some((entry) => entry.canonicalId === "participant:7"));
  assert.ok(result.identityMap.some((entry) => entry.canonicalId === "plan-resource:335"));
  assert.equal(result.diagnostics.coachReferenceCount, 1);
  assert.equal(result.diagnostics.missingCoachReferenceCount, 1);
});

test("identidades válidas de coach son independientes de dos claves no canónicas", () => {
  const withKey = (key: string): EngineInput => input({
    tasks: [],
    planResourceItems: [{ id: 335, resourceItemId: 35, typeId: 3, name: "coach", isAvailable: true }],
    vocalCoachPlanResourceItemIdByContestantId: { [key]: 335 } as unknown as Record<number, number>,
  });
  const first = preflightEngineInputForPlannerNext(withKey("01"));
  const second = preflightEngineInputForPlannerNext(withKey("02"));
  assert.notEqual(first.sourceFingerprint, second.sourceFingerprint);
  assert.deepEqual(first.identityMap, second.identityMap);
  assert.equal(first.identityMapFingerprint, second.identityMapFingerprint);
  for (const result of [first, second]) {
    assert.ok(result.identityMap.some((entry) => entry.canonicalId === "plan-resource:335"));
    assert.ok(!result.identityMap.some((entry) => entry.namespace === "participant"));
  }
});

for (const [label, coachId] of [
  ["zero", 0], ["negative", -1], ["decimal", 1.5], ["NaN", Number.NaN], ["infinite", Infinity],
  ["numeric string", "335"], ["null", null], ["object", {}], ["array", []],
] as const) {
  test(`valor runtime inválido: ${label}`, () => {
    const source = input() as unknown as Record<string, unknown>;
    source.vocalCoachPlanResourceItemIdByContestantId = { 7: coachId };
    const found = issue(source as unknown as EngineInput, "MISSING_COACH_REFERENCE", "7");
    assert.equal(found.path, "vocalCoachPlanResourceItemIdByContestantId.7");
    assert.equal(found.details?.contestantId, 7);
    assert.equal(found.details?.coachReferenceValid, false);
  });
}

test("recurso asignado inexistente conserva referencia reversible y details exactos", () => {
  const source = input({ tasks: [], vocalCoachPlanResourceItemIdByContestantId: { 7: 335 } });
  const found = issue(source, "MISSING_COACH_REFERENCE", "7");
  assert.equal(found.path, "vocalCoachPlanResourceItemIdByContestantId.7");
  assert.deepEqual(found.details, { contestantId: 7, planResourceItemDefined: false, vocalCoachPlanResourceItemId: 335 });
  assert.ok(preflightEngineInputForPlannerNext(source).identityMap.some((entry) => entry.canonicalId === "plan-resource:335"));
});

test("agregado legacy y metadata no reconstruyen una relación", () => {
  const source = input({
    tasks: [task(1, { contestantId: 7, plannerNextKind: "vocal", assignedResourceIds: [335], resourceRequirements: { byItem: { 35: 1 } } }), task(2, { contestantId: 8 })],
    coachResourceIds: [335, 336],
    planResourceItems: [
      { id: 335, resourceItemId: 35, typeId: 3, typeCode: "vc", typeName: "Vocal Coach", category: "coach", name: "Vocal Coach", isAvailable: true },
      { id: 336, resourceItemId: 36, typeId: 3, name: "Other", isAvailable: true },
    ],
  });
  const result = preflightEngineInputForPlannerNext(source);
  assert.ok(!Object.prototype.hasOwnProperty.call(source, "vocalCoachPlanResourceItemIdByContestantId"));
  assert.equal(result.diagnostics.coachReferenceCount, 2);
  assert.ok(!result.issues.some((entry) => entry.path.startsWith("vocalCoachPlanResourceItemIdByContestantId")));
});

test("intercambiar asignaciones cambia source pero no las identidades", () => {
  const resources = [
    { id: 335, resourceItemId: 35, typeId: 3, name: "A", isAvailable: true },
    { id: 336, resourceItemId: 36, typeId: 3, name: "B", isAvailable: true },
  ];
  const left = preflightEngineInputForPlannerNext(input({ tasks: [], planResourceItems: resources, vocalCoachPlanResourceItemIdByContestantId: { 7: 335, 8: 336 } }));
  const right = preflightEngineInputForPlannerNext(input({ tasks: [], planResourceItems: resources, vocalCoachPlanResourceItemIdByContestantId: { 7: 336, 8: 335 } }));
  assert.notEqual(left.sourceFingerprint, right.sourceFingerprint);
  assert.deepEqual(left.identityMap, right.identityMap);
  assert.equal(left.identityMapFingerprint, right.identityMapFingerprint);
});

test("orden y display metadata no afectan Evidence de la relación", () => {
  const first = input({ tasks: [], coachResourceIds: [336, 335], planResourceItems: [
    { id: 336, resourceItemId: 36, typeId: 3, typeCode: "old", typeName: "Old", category: "old", name: "Old", isAvailable: true },
    { id: 335, resourceItemId: 35, typeId: 3, name: "A", isAvailable: true },
  ], vocalCoachPlanResourceItemIdByContestantId: { 7: 335, 8: 336 } });
  const second = clone(first);
  second.planResourceItems.reverse();
  second.coachResourceIds?.reverse();
  second.vocalCoachPlanResourceItemIdByContestantId = Object.fromEntries(Object.entries(second.vocalCoachPlanResourceItemIdByContestantId ?? {}).reverse());
  Object.assign(second.planResourceItems.find((entry) => entry.id === 336)!, { name: "Renamed", typeName: "New", typeCode: "new", category: "new" });
  assert.deepEqual(preflightEngineInputForPlannerNext(first), preflightEngineInputForPlannerNext(second));
});

test("diagnostics deduplican mapping explícito y agregado legacy derivado", () => {
  const resource = { id: 335, resourceItemId: 35, typeId: 3, name: "A", isAvailable: true };
  const cases: Array<[Partial<EngineInput>, number, number]> = [
    [{ tasks: [], planResourceItems: [resource], vocalCoachPlanResourceItemIdByContestantId: { 7: 335 } }, 1, 0],
    [{ tasks: [], planResourceItems: [resource], coachResourceIds: [335] }, 1, 0],
    [{ tasks: [], planResourceItems: [resource], vocalCoachPlanResourceItemIdByContestantId: { 7: 335 }, coachResourceIds: [335] }, 1, 0],
    [{ tasks: [], planResourceItems: [resource], vocalCoachPlanResourceItemIdByContestantId: { 7: 335 }, coachResourceIds: [335, 336] }, 2, 1],
    [{ tasks: [], vocalCoachPlanResourceItemIdByContestantId: { 7: 335 }, coachResourceIds: [335] }, 1, 1],
    [{ tasks: [], planResourceItems: [resource], vocalCoachPlanResourceItemIdByContestantId: { 7: 335, 8: 335 }, coachResourceIds: [335] }, 2, 0],
  ];
  cases.forEach(([overrides, references, missing]) => {
    const diagnostics = preflightEngineInputForPlannerNext(input(overrides)).diagnostics;
    assert.equal(diagnostics.coachReferenceCount, references);
    assert.equal(diagnostics.missingCoachReferenceCount, missing);
  });
});

test("mapping congelado permanece inmutable y output frozen", () => {
  const source = deepFreeze(input({ tasks: [], planResourceItems: [{ id: 335, resourceItemId: 35, typeId: 3, name: "A", isAvailable: true }], vocalCoachPlanResourceItemIdByContestantId: { 7: 335 } }));
  const before = clone(source);
  const result = preflightEngineInputForPlannerNext(source);
  assert.deepEqual(source, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.identityMap));
  assert.ok(Object.isFrozen(result.issues));
});

test("escenarios representativos quedan congelados exactamente", () => {
  assert.equal(realProductionScenarios.length, 3);
  for (const scenario of realProductionScenarios) {
    const source = deepFreeze(clone(scenario.input));
    const before = clone(source);
    const normal = preflightEngineInputForPlannerNext(source);
    const repeated = preflightEngineInputForPlannerNext(source);
    const inverted = preflightEngineInputForPlannerNext(deepFreeze(reversed(source)));
    assert.deepEqual(normal, repeated, scenario.id);
    assert.deepEqual(normal, inverted, scenario.id);
    assert.deepEqual(source, before, scenario.id);
    assert.equal(normal.status, "UNSUPPORTED", scenario.id);
    assert.ok(Object.isFrozen(normal), scenario.id);
    assert.ok(Object.isFrozen(normal.diagnostics), scenario.id);
    assert.ok(Object.isFrozen(normal.issues), scenario.id);
    assert.deepEqual({
      scenarioId: scenario.id,
      status: normal.status,
      reasonCodes: normal.reasonCodes,
      diagnostics: normal.diagnostics,
      sourceFingerprint: normal.sourceFingerprint,
      identityMapFingerprint: normal.identityMapFingerprint,
    }, EXPECTED_SCENARIOS[scenario.id], scenario.id);
  }
});

test("SPEC10-007: sólo recursos efectivos activos requieren disponibilidad y se deduplican", () => {
  const result = preflightEngineInputForPlannerNext(input({
    tasks: [task(1, { spaceId: 20, zoneId: 30, assignedResourceIds: [9] }), task(2, { status: "cancelled", assignedResourceIds: [10] })],
    spaceResourceAssignments: { 20: [9] }, zoneResourceAssignments: { 30: [9] },
    planResourceItems: [
      { id: 9, resourceItemId: 90, typeId: 1, name: "used", isAvailable: true, availabilityStart: null, availabilityEnd: null },
      { id: 10, resourceItemId: 100, typeId: 1, name: "cancelled", isAvailable: true },
      { id: 11, resourceItemId: 110, typeId: 1, name: "inventory", isAvailable: true },
    ],
  }));
  assert.equal(result.diagnostics.requiredPlanResourceCount, 1); assert.equal(result.diagnostics.usableRequiredPlanResourceCount, 1);
  assert.equal(result.diagnostics.unusableRequiredPlanResourceCount, 0); assert.ok(!result.reasonCodes.includes("MISSING_RESOURCE_AVAILABILITY"));
});

test("SPEC10-007: causas primarias de disponibilidad son únicas y tipadas", () => {
  const cases: Array<[Partial<{ availabilityStart: string | null; availabilityEnd: string | null; isAvailable: boolean }>, string, string]> = [
    [{}, "MISSING_RESOURCE_AVAILABILITY", "MISSING_SNAPSHOT_WINDOW"],
    [{ availabilityStart: "09:00" }, "UNSUPPORTED_TIME_VALUE", "PARTIAL_SNAPSHOT_WINDOW"],
    [{ availabilityStart: null, availabilityEnd: "10:00" }, "UNSUPPORTED_TIME_VALUE", "MIXED_NULL_AND_STRING"],
    [{ availabilityStart: "9:00", availabilityEnd: "10:00" }, "UNSUPPORTED_TIME_VALUE", "INVALID_TIME_FORMAT"],
    [{ availabilityStart: "10:00", availabilityEnd: "09:00" }, "UNSUPPORTED_TIME_VALUE", "INVALID_TIME_ORDER"],
    [{ availabilityStart: null, availabilityEnd: null, isAvailable: false }, "MISSING_RESOURCE_AVAILABILITY", "RESOURCE_DISABLED"],
    [{ availabilityStart: "19:00", availabilityEnd: "20:00" }, "MISSING_RESOURCE_AVAILABILITY", "EMPTY_WORKDAY_INTERSECTION"],
  ];
  for (const [overrides, code, reason] of cases) {
    const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { assignedResourceIds: [9] })], planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true, ...overrides }] }));
    const primary = result.issues.filter((entry) => entry.entityKind === "plan-resource" && entry.entityId === "9" && ["MISSING_RESOURCE_AVAILABILITY", "UNSUPPORTED_TIME_VALUE"].includes(entry.code));
    assert.equal(primary.length, 1, reason); assert.equal(primary[0].code, code); assert.equal(primary[0].details?.reason, reason);
  }
});

test("SPEC10-007: lock aplicable requiere recurso pero lock de cancelada no", () => {
  const resource = { id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true };
  const active = preflightEngineInputForPlannerNext(input({ locks: [{ id: 1, planId: 1, taskId: 1, lockType: "resource", lockedResourceId: 9 }], planResourceItems: [resource] }));
  const cancelled = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { status: "cancelled" })], locks: [{ id: 1, planId: 1, taskId: 1, lockType: "resource", lockedResourceId: 9 }], planResourceItems: [resource] }));
  assert.equal(active.diagnostics.requiredPlanResourceCount, 1); assert.equal(cancelled.diagnostics.requiredPlanResourceCount, 0);
});

test("SPEC10-007: disponibilidad protege intervalos reales completos sin mezclar extremos", () => {
  const base = input({ tasks: [task(1, { status: "done", spaceId: 20, assignedResourceIds: [9], startPlanned: "09:00", endPlanned: "10:00", startReal: "07:00", endReal: "08:00" })], planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true, availabilityStart: "08:30", availabilityEnd: "12:00" }] });
  const outside = preflightEngineInputForPlannerNext(base);
  assert.equal(outside.diagnostics.protectedTaskResourceAvailabilityConflictCount, 1);
  const conflict = outside.issues.find((entry) => entry.path === "tasks.1.resourceAvailability.9")!;
  assert.equal(conflict.details?.intervalSource, "real"); assert.deepEqual(conflict.details?.assignmentSources, ["direct"]);
  const partial = clone(base); partial.tasks[0].endReal = undefined;
  assert.ok(!preflightEngineInputForPlannerNext(partial).issues.some((entry) => entry.path === "tasks.1.resourceAvailability.9"));
});

test("SPEC10-007: ventana e isAvailable cambian source pero no identidad", () => {
  const make = (availabilityStart: string | null | undefined, availabilityEnd: string | null | undefined, isAvailable = true) => input({ tasks: [task(1, { assignedResourceIds: [9] })], planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable, ...(availabilityStart !== undefined ? { availabilityStart } : {}), ...(availabilityEnd !== undefined ? { availabilityEnd } : {}) }] });
  const full = preflightEngineInputForPlannerNext(make(null, null)); const explicit = preflightEngineInputForPlannerNext(make("09:00", "17:00"));
  const disabled = preflightEngineInputForPlannerNext(make(null, null, false)); const omitted = preflightEngineInputForPlannerNext(make(undefined, undefined));
  for (const changed of [explicit, disabled, omitted]) { assert.notEqual(full.sourceFingerprint, changed.sourceFingerprint); assert.equal(full.identityMapFingerprint, changed.identityMapFingerprint); assert.deepEqual(full.identityMap, changed.identityMap); }
});

test("SPEC10-007: ausencia omitida, undefined y build projection son Evidence equivalente", () => {
  const common = { id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true };
  const make = (resource: typeof common) => input({ tasks: [task(1, { assignedResourceIds: [9] })], planResourceItems: [resource] });
  const omitted = preflightEngineInputForPlannerNext(make(common));
  const ownUndefined = preflightEngineInputForPlannerNext(make({ ...common, availabilityStart: undefined, availabilityEnd: undefined } as typeof common));
  const projected = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { assignedResourceIds: [9] })], planResourceItems: projectPlanResourceItemsForEngineInput([common]) }));
  assert.deepEqual(omitted, ownUndefined); assert.deepEqual(omitted, projected);
  const fullDay = preflightEngineInputForPlannerNext(make({ ...common, availabilityStart: null, availabilityEnd: null } as typeof common));
  assert.notEqual(omitted.sourceFingerprint, fullDay.sourceFingerprint);
  assert.deepEqual(omitted.identityMap, fullDay.identityMap); assert.equal(omitted.identityMapFingerprint, fullDay.identityMapFingerprint);
  assert.equal(omitted.diagnostics.unusableRequiredPlanResourceCount, 1); assert.equal(fullDay.diagnostics.usableRequiredPlanResourceCount, 1);
});

test("SPEC10-007: recurso requerido sólo por espacio exacto", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { spaceId: 20 })], spaceResourceAssignments: { 20: [9] },
    zoneResourceAssignments: {}, planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true, availabilityStart: "09:00", availabilityEnd: "17:00" }] }));
  assert.equal(result.diagnostics.requiredPlanResourceCount, 1); assert.equal(result.diagnostics.usableRequiredPlanResourceCount, 1);
  assert.equal(result.diagnostics.unusableRequiredPlanResourceCount, 0); assert.ok(!result.reasonCodes.includes("MISSING_RESOURCE_AVAILABILITY"));
});

test("SPEC10-007: recurso requerido sólo por zona efectiva", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { zoneId: 30 })], spaceResourceAssignments: {}, zoneResourceAssignments: { 30: [9] },
    planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true, availabilityStart: null, availabilityEnd: null }] }));
  assert.equal(result.diagnostics.requiredPlanResourceCount, 1); assert.equal(result.diagnostics.usableRequiredPlanResourceCount, 1);
  assert.ok(!result.reasonCodes.includes("MISSING_RESOURCE_AVAILABILITY"));
});

test("SPEC10-007: coach sólo de referencia no consume disponibilidad", () => {
  const result = preflightEngineInputForPlannerNext(input({ vocalCoachPlanResourceItemIdByContestantId: { 7: 9 }, coachResourceIds: [9],
    planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "coach", isAvailable: true }] }));
  assert.equal(result.diagnostics.requiredPlanResourceCount, 0); assert.equal(result.diagnostics.unusableRequiredPlanResourceCount, 0);
  assert.ok(!result.reasonCodes.includes("MISSING_RESOURCE_AVAILABILITY"));
});

test("SPEC10-007: lock es el único origen requerido y publica su procedencia", () => {
  const result = preflightEngineInputForPlannerNext(input({ locks: [{ id: 44, planId: 1, taskId: 1, lockType: "resource", lockedResourceId: 9 }],
    planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true }] }));
  const primary = result.issues.filter((entry) => entry.code === "MISSING_RESOURCE_AVAILABILITY" && entry.entityId === "9");
  assert.equal(result.diagnostics.requiredPlanResourceCount, 1); assert.equal(primary.length, 1);
  assert.deepEqual(primary[0].details?.requiredByTaskIds, []); assert.deepEqual(primary[0].details?.requiredByLockIds, [44]);
});

test("SPEC10-007: varias tareas comparten una sola causa primaria no utilizable", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(2, { assignedResourceIds: [9] }), task(1, { assignedResourceIds: [9] }), task(2, { assignedResourceIds: [9] })],
    planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: false, availabilityStart: null, availabilityEnd: null }] }));
  const primary = result.issues.filter((entry) => entry.code === "MISSING_RESOURCE_AVAILABILITY" && entry.entityId === "9");
  assert.equal(primary.length, 1); assert.deepEqual(primary[0].details?.requiredByTaskIds, [1, 2]);
  assert.equal(result.diagnostics.unusableRequiredPlanResourceCount, 1); assert.equal(result.diagnostics.missingAvailabilityCounts.resources, 1);
});

test("SPEC10-007: intervalo protegido planificado se contiene o explica conflicto", () => {
  const make = (startPlanned: string, endPlanned: string) => input({ tasks: [task(1, { status: "done", spaceId: 20, assignedResourceIds: [9], startPlanned, endPlanned })],
    planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true, availabilityStart: "09:00", availabilityEnd: "12:00" }] });
  assert.equal(preflightEngineInputForPlannerNext(make("09:30", "10:00")).diagnostics.protectedTaskResourceAvailabilityConflictCount, 0);
  const outside = preflightEngineInputForPlannerNext(make("08:30", "10:00"));
  const conflict = outside.issues.find((entry) => entry.path === "tasks.1.resourceAvailability.9")!;
  assert.equal(outside.diagnostics.protectedTaskResourceAvailabilityConflictCount, 1);
  assert.deepEqual(conflict.details, { assignmentSources: ["direct"], effectiveWindow: { start: "09:00", end: "12:00" }, intervalSource: "planned",
    planResourceItemId: 9, protectedInterval: { start: "08:30", end: "10:00" }, taskId: 1 });
});

test("SPEC10-007: conflicto protegido conserva las tres procedencias una sola vez", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { status: "in_progress", spaceId: 20, zoneId: 30, assignedResourceIds: [9], startPlanned: "08:30", endPlanned: "10:00" })],
    planZoneSettings: [{ zoneId: 30, availabilityStart: null, availabilityEnd: null }], planSpaceSettings: [{ spaceId: 20, zoneId: 30, availabilityStart: null, availabilityEnd: null }],
    spaceResourceAssignments: { 20: [9] }, zoneResourceAssignments: { 30: [9] },
    planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: true, availabilityStart: "09:00", availabilityEnd: "12:00" }] }));
  const conflicts = result.issues.filter((entry) => entry.path === "tasks.1.resourceAvailability.9");
  assert.equal(conflicts.length, 1); assert.deepEqual(conflicts[0].details?.assignmentSources, ["direct", "space", "zone"]);
});

test("SPEC10-007: recurso requerido inexistente conserva identidad sin issue temporal inventada", () => {
  const result = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { assignedResourceIds: [999] })] }));
  assert.ok(result.reasonCodes.includes("MISSING_RESOURCE_REFERENCE"));
  assert.ok(result.identityMap.some((entry) => entry.canonicalId === "plan-resource:999"));
  assert.equal(result.diagnostics.requiredPlanResourceCount, 1); assert.equal(result.diagnostics.unusableRequiredPlanResourceCount, 1);
  assert.ok(!result.issues.some((entry) => entry.code === "MISSING_RESOURCE_AVAILABILITY" && entry.entityId === "999"));
});
