import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput, TaskInput } from "../../types";
import { realProductionScenarios } from "../../orc/benchmarks/fixtures/real-scenarios/realProductionScenarios";
import { preflightEngineInputForPlannerNext, type EngineInputPreflightIssue } from "./engineInputPreflight";

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
  for (const expected of ["break:70", "break:71", "itinerant-team:80", "itinerant-team:81", "itinerant-team:82", "plan-resource:10", "plan-resource:11", "resource-item:100", "resource-item:101", "resource-type:200", "space:20", "space:21", "space:22", "zone:30"]) assert.ok(keys.includes(expected), expected);
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
  assert.ok(absent.issues.some((entry) => entry.code === "MISSING_SPACE_REFERENCE" && entry.path === "tasks.1.spaceId"));
  const referenced = input({ tasks: [task(1, { spaceId: 20, zoneId: 20 })] });
  assert.equal(issue(referenced, "MISSING_SPACE_REFERENCE", "1").path, "tasks.1.spaceId");
  const described = preflightEngineInputForPlannerNext(input({ tasks: [task(1, { spaceId: 20, zoneId: 30 })], spaceParentById: { 20: null } }));
  assert.equal(described.diagnostics.referencedSpaceCount, 1);
  assert.equal(described.diagnostics.describedSpaceCount, 1);
  assert.ok(described.issues.some((entry) => entry.code === "MISSING_SPACE_AVAILABILITY" && entry.entityId === "20"));
  assert.ok(described.identityMap.some((entry) => entry.namespace === "zone" && entry.sourceId === "30"));
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
  assert.ok(!preflightEngineInputForPlannerNext(input({ actualMeal: { id: 1, kind: "meal", start: "13:00", end: "13:30" } })).reasonCodes.includes("UNSUPPORTED_BREAK_SCOPE"));
  assert.deepEqual(issue(input({ actualMeal: { id: 1, kind: "meal", start: "13:00", end: "13:30", spaceId: 2 } }), "UNSUPPORTED_BREAK_SCOPE", "1").details, { scope: "space" });
  assert.deepEqual(issue(input({ globalHardBreaks: [{ start: "15:00", end: "15:10" }] }), "UNSUPPORTED_BREAK_SCOPE").details, { scope: "global-hard-break" });
});

test("breaks participant, space, zone, itinerant y multiplicidad conservan scope", () => {
  for (const [field, value, scope] of [["contestantId", 1, "participant"], ["spaceId", 2, "space"], ["zoneId", 3, "zone"], ["itinerantTeamId", 4, "itinerant-team"]] as const) {
    const entry = { id: value, start: "15:00", end: "15:10", [field]: value };
    assert.deepEqual(issue(input({ protectedBreaks: [entry] }), "UNSUPPORTED_BREAK_SCOPE", String(value)).details, { scope });
  }
  const multiple = preflightEngineInputForPlannerNext(input({ protectedBreaks: [{ id: 1, start: "15:00", end: "15:10", zoneId: 3 }, { id: 2, start: "16:00", end: "16:10", spaceId: 2 }] }));
  assert.deepEqual(multiple.issues.find((entry) => entry.code === "UNSUPPORTED_BREAK_SCOPE" && entry.path === "breaks")?.details, { breakCount: 2 });
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

const EXPECTED_SCENARIOS: Record<string, unknown> = {
  "real-main-stage-with-backlog": {
    "scenarioId": "real-main-stage-with-backlog",
    "status": "UNSUPPORTED",
    "reasonCodes": [
      "MISSING_MAIN_FLOW_CONFIGURATION",
      "MISSING_PARTICIPANT_AVAILABILITY",
      "MISSING_RESOURCE_AVAILABILITY",
      "MISSING_SEARCH_BUDGET_CONFIGURATION",
      "MISSING_SEARCH_POLICY_CONFIGURATION",
      "MISSING_SPACE_REFERENCE",
      "MISSING_TASK_DURATION",
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
      "describedSpaceCount": 0,
      "zoneCount": 1,
      "planResourceCount": 3,
      "resourceItemCount": 3,
      "resourceAssignmentReferenceCount": 2,
      "resourceComponentReferenceCount": 0,
      "missingResourceReferenceCount": 0,
      "dependencyCount": 0,
      "breakCount": 0,
      "transportConfigured": false,
      "setupConfigurationDetected": false,
      "mainFlowConfigurationComplete": false,
      "searchPolicyConfigurationPresent": false,
      "searchBudgetConfigurationComplete": false,
      "timeGridVerifiable": false,
      "anchoredOperationContractPresent": false,
      "unresolvedTaskRoleCount": 3,
      "missingDurationTaskCount": 2,
      "missingAvailabilityCounts": {
        "participants": 2,
        "spaces": 0,
        "resources": 3
      },
      "unsupportedCapabilityCodes": [
        "UNSUPPORTED_TASK_ROLE",
        "UNSUPPORTED_TIME_GRID"
      ],
      "readOnly": true
    },
    "sourceFingerprint": "360a5a376e2714a6e9b849b7bd1a6af1b7052d766c98373f3b08572c2241ee3c",
    "identityMapFingerprint": "68a72d0ac8f1d2246d5a7a8132c0090b43d76bb9a2dcb59f9f4b1cdb7b5c3b89"
  },
  "real-resource-lock-pressure": {
    "scenarioId": "real-resource-lock-pressure",
    "status": "UNSUPPORTED",
    "reasonCodes": [
      "MISSING_MAIN_FLOW_CONFIGURATION",
      "MISSING_PARTICIPANT_AVAILABILITY",
      "MISSING_RESOURCE_AVAILABILITY",
      "MISSING_SEARCH_BUDGET_CONFIGURATION",
      "MISSING_SEARCH_POLICY_CONFIGURATION",
      "MISSING_SPACE_REFERENCE",
      "MISSING_TASK_DURATION",
      "UNREPRESENTABLE_RESOURCE_LOCK",
      "UNREPRESENTABLE_SPACE_LOCK",
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
      "describedSpaceCount": 0,
      "zoneCount": 2,
      "planResourceCount": 3,
      "resourceItemCount": 3,
      "resourceAssignmentReferenceCount": 3,
      "resourceComponentReferenceCount": 0,
      "missingResourceReferenceCount": 0,
      "dependencyCount": 0,
      "breakCount": 0,
      "transportConfigured": false,
      "setupConfigurationDetected": false,
      "mainFlowConfigurationComplete": false,
      "searchPolicyConfigurationPresent": false,
      "searchBudgetConfigurationComplete": false,
      "timeGridVerifiable": false,
      "anchoredOperationContractPresent": false,
      "unresolvedTaskRoleCount": 3,
      "missingDurationTaskCount": 3,
      "missingAvailabilityCounts": {
        "participants": 3,
        "spaces": 0,
        "resources": 3
      },
      "unsupportedCapabilityCodes": [
        "UNREPRESENTABLE_RESOURCE_LOCK",
        "UNREPRESENTABLE_SPACE_LOCK",
        "UNSUPPORTED_TASK_ROLE",
        "UNSUPPORTED_TIME_GRID"
      ],
      "readOnly": true
    },
    "sourceFingerprint": "fffb162050a5ad34928c4ca035faa13f4c9b4af6ee5a1b3aa50198048ff011bc",
    "identityMapFingerprint": "794472d65522cebf41bbc687d25dccb474e8579766fd01de4a45fda48941cc65"
  },
  "real-protected-break-recovery": {
    "scenarioId": "real-protected-break-recovery",
    "status": "UNSUPPORTED",
    "reasonCodes": [
      "MISSING_MAIN_FLOW_CONFIGURATION",
      "MISSING_PARTICIPANT_AVAILABILITY",
      "MISSING_RESOURCE_AVAILABILITY",
      "MISSING_SEARCH_BUDGET_CONFIGURATION",
      "MISSING_SEARCH_POLICY_CONFIGURATION",
      "MISSING_SPACE_REFERENCE",
      "MISSING_TASK_DURATION",
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
      "describedSpaceCount": 0,
      "zoneCount": 1,
      "planResourceCount": 3,
      "resourceItemCount": 3,
      "resourceAssignmentReferenceCount": 2,
      "resourceComponentReferenceCount": 0,
      "missingResourceReferenceCount": 0,
      "dependencyCount": 0,
      "breakCount": 1,
      "transportConfigured": false,
      "setupConfigurationDetected": false,
      "mainFlowConfigurationComplete": false,
      "searchPolicyConfigurationPresent": false,
      "searchBudgetConfigurationComplete": false,
      "timeGridVerifiable": false,
      "anchoredOperationContractPresent": false,
      "unresolvedTaskRoleCount": 3,
      "missingDurationTaskCount": 2,
      "missingAvailabilityCounts": {
        "participants": 2,
        "spaces": 0,
        "resources": 3
      },
      "unsupportedCapabilityCodes": [
        "UNSUPPORTED_TASK_ROLE",
        "UNSUPPORTED_TIME_GRID"
      ],
      "readOnly": true
    },
    "sourceFingerprint": "a43fdb467155531899b9d86824865d7504c07988b07ece00a3c4283346df7838",
    "identityMapFingerprint": "fd6782b3ba5a6104c13e70baeff7303baf48b9f1561eea76e37e4a33f58eb01a"
  }
};

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
    assert.deepEqual({ scenarioId: scenario.id, status: normal.status, reasonCodes: normal.reasonCodes, diagnostics: normal.diagnostics, sourceFingerprint: normal.sourceFingerprint, identityMapFingerprint: normal.identityMapFingerprint }, EXPECTED_SCENARIOS[scenario.id], scenario.id);
  }
});
