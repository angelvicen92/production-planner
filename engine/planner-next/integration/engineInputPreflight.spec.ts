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
      "MISSING_RESOURCE_AVAILABILITY",
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
        "resources": 3
      },
      "unsupportedCapabilityCodes": [
        "UNSUPPORTED_RESOURCE_REQUIREMENT",
        "UNSUPPORTED_SETUP_MAPPING",
        "UNSUPPORTED_TASK_ROLE",
        "UNSUPPORTED_TIME_GRID"
      ],
      "readOnly": true
    },
    "sourceFingerprint": "74fb3271d7a4441c2ea4b4c0c04db7193b4a9bf69d5a88bdf8a4850e260f0812",
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
      "describedSpaceCount": 0,
      "zoneCount": 2,
      "planResourceCount": 3,
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
        "resources": 3
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
    "sourceFingerprint": "968d5e471bfe73c829ec5ac1a1c35c2f8e1a1f617310b26c0543fcd0755fb9c0",
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
        "resources": 3
      },
      "unsupportedCapabilityCodes": [
        "UNSUPPORTED_RESOURCE_REQUIREMENT",
        "UNSUPPORTED_SETUP_MAPPING",
        "UNSUPPORTED_TASK_ROLE",
        "UNSUPPORTED_TIME_GRID"
      ],
      "readOnly": true
    },
    "sourceFingerprint": "852d269d9f0c873423001cc173d6cf0c9918e6fd0f9e2b64761198badf9fc56b",
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
