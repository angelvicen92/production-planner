import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput, TaskInput } from "../../types";
import { resolveEffectiveTaskResourceAssignments } from "./effectiveTaskResourceAssignments";

const task = (id: number, overrides: Partial<TaskInput> = {}): TaskInput => ({ id, planId: 1, templateId: 100 + id, status: "pending", ...overrides });
const input = (overrides: Partial<EngineInput> = {}): EngineInput => ({
  planId: 1, workDay: { start: "08:00", end: "18:00" }, meal: { start: "13:00", end: "14:00" }, camerasAvailable: 1,
  tasks: [task(1)], locks: [], zoneResourceAssignments: {}, spaceResourceAssignments: {}, zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {}, planResourceItems: [], resourceItemComponents: {}, groupingZoneIds: [], ...overrides,
});
const resolveOne = (source: EngineInput) => {
  const result = resolveEffectiveTaskResourceAssignments(source);
  assert.equal(result.assignments.length, 1);
  return result.assignments[0];
};
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object") { Object.values(value as object).forEach(freeze); Object.freeze(value); }
  return value;
};

test("sin asignaciones no infiere recursos", () => assert.deepEqual(resolveOne(input()).effectiveResourceIds, []));
test("asignación directa normaliza, deduplica y ordena", () => assert.deepEqual(resolveOne(input({ tasks: [task(1, { assignedResourceIds: [3, 1, 3, 2] })] })).directResourceIds, [1, 2, 3]));
test("asignación directa rechaza IDs no positivos, no enteros y no numéricos", () => {
  const assignedResourceIds = [1, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2", {}, []] as unknown as number[];
  assert.deepEqual(resolveOne(input({ tasks: [task(1, { assignedResourceIds })] })).directResourceIds, [1]);
});
test("aplica sólo el espacio exacto y conserva procedencia cruzada", () => {
  const value = resolveOne(input({ tasks: [task(1, { spaceId: 20, assignedResourceIds: [2] })], spaceResourceAssignments: { 20: [2, 1] } }));
  assert.deepEqual(value.spaceResourceIds, [1, 2]); assert.deepEqual(value.effectiveResourceIds, [1, 2]);
});
test("no hereda recursos del espacio padre", () => assert.deepEqual(resolveOne(input({ tasks: [task(1, { spaceId: 21 })], spaceParentById: { 21: 20 }, spaceResourceAssignments: { 20: [335] } })).spaceResourceIds, []));
test("el hijo usa su asignación exacta aunque exista padre", () => assert.deepEqual(resolveOne(input({ tasks: [task(1, { spaceId: 21 })], spaceParentById: { 21: 20 }, spaceResourceAssignments: { 20: [335], 21: [336] } })).spaceResourceIds, [336]));
test("zona explícita aplica su asignación", () => { const value = resolveOne(input({ tasks: [task(1, { zoneId: 30 })], zoneResourceAssignments: { 30: [3] } })); assert.equal(value.zoneResolution, "TASK"); assert.deepEqual(value.zoneResourceIds, [3]); });
test("zona del mapping de espacio aplica su asignación", () => { const value = resolveOne(input({ tasks: [task(1, { spaceId: 20 })], zoneIdBySpaceId: { 20: 30 }, zoneResourceAssignments: { 30: [3] } })); assert.equal(value.zoneResolution, "SPACE_MAP"); assert.deepEqual(value.zoneResourceIds, [3]); });
test("zonas explícita y mapeada coincidentes producen MATCH", () => assert.equal(resolveOne(input({ tasks: [task(1, { spaceId: 20, zoneId: 30 })], zoneIdBySpaceId: { 20: 30 } })).zoneResolution, "MATCH"));
test("conflicto de zona no elige zona y conserva directo y espacio", () => {
  const source = input({ tasks: [task(1, { spaceId: 20, zoneId: 30, assignedResourceIds: [1] })], spaceResourceAssignments: { 20: [2] }, zoneIdBySpaceId: { 20: 31 }, zoneResourceAssignments: { 30: [3], 31: [4] } });
  const result = resolveEffectiveTaskResourceAssignments(source); const value = result.assignments[0];
  assert.equal(value.zoneResolution, "CONFLICT"); assert.equal(value.effectiveZoneId, null); assert.deepEqual(value.zoneResourceIds, []); assert.deepEqual(value.effectiveResourceIds, [1, 2]);
  assert.deepEqual(result.zoneConflicts, [{ taskId: 1, spaceId: 20, explicitZoneId: 30, mappedZoneId: 31, path: "tasks.1.zoneId" }]);
});
test("unión exacta de tres niveles elimina sólo duplicados efectivos", () => {
  const value = resolveOne(input({ tasks: [task(1, { spaceId: 20, zoneId: 30, assignedResourceIds: [337] })], spaceResourceAssignments: { 20: [338] }, zoneResourceAssignments: { 30: [335, 338] } }));
  assert.deepEqual(value.zoneResourceIds, [335, 338]); assert.deepEqual(value.effectiveResourceIds, [335, 337, 338]);
});
test("coach de referencia y agregado legacy no se consumen", () => assert.deepEqual(resolveOne(input({ vocalCoachPlanResourceItemIdByContestantId: { 7: 335 }, coachResourceIds: [335], tasks: [task(1, { contestantId: 7 })] })).effectiveResourceIds, []));
test("edición humana distinta del coach de referencia prevalece", () => assert.deepEqual(resolveOne(input({ vocalCoachPlanResourceItemIdByContestantId: { 7: 335 }, tasks: [task(1, { contestantId: 7, assignedResourceIds: [336] })] })).effectiveResourceIds, [336]));
test("coach en espacio se trata como cualquier recurso", () => assert.deepEqual(resolveOne(input({ tasks: [task(1, { spaceId: 20 })], spaceResourceAssignments: { 20: [335] } })).effectiveResourceIds, [335]));
test("coach en zona se aplica a tareas de concursantes distintos", () => { const result = resolveEffectiveTaskResourceAssignments(input({ tasks: [task(2, { contestantId: 8, zoneId: 30 }), task(1, { contestantId: 7, zoneId: 30 })], zoneResourceAssignments: { 30: [335] } })); assert.deepEqual(result.assignments.map((entry) => entry.effectiveResourceIds), [[335], [335]]); });
test("no reconstruye coach retirado por una regla histórica", () => assert.deepEqual(resolveOne(input({ tasks: [Object.assign(task(1), { creationRule: "vocal" })] })).effectiveResourceIds, []));
for (const kind of ["main", "vocal", "auxiliary", "technical"] as const) test(`kind ${kind} puede consumir cualquier recurso explícito`, () => assert.deepEqual(resolveOne(input({ tasks: [task(1, { plannerNextKind: kind, assignedResourceIds: [335] })] })).effectiveResourceIds, [335]));
test("requisitos genéricos permanecen separados", () => assert.deepEqual(resolveOne(input({ tasks: [task(1, { resourceRequirements: { byType: { 1: 1 }, byItem: { 2: 1 }, anyOf: [{ quantity: 1, resourceItemIds: [3] }] } })] })).effectiveResourceIds, []));
test("conserva referencia concreta inexistente", () => assert.deepEqual(resolveOne(input({ tasks: [task(1, { assignedResourceIds: [999] })] })).effectiveResourceIds, [999]));
test("conserva recurso marcado no disponible", () => assert.deepEqual(resolveOne(input({ tasks: [task(1, { assignedResourceIds: [9] })], planResourceItems: [{ id: 9, resourceItemId: 90, typeId: 1, name: "r", isAvailable: false }] })).effectiveResourceIds, [9]));
test("dos tareas conservan individualmente el recurso compartido", () => assert.deepEqual(resolveEffectiveTaskResourceAssignments(input({ tasks: [task(1, { assignedResourceIds: [9] }), task(2, { assignedResourceIds: [9] })] })).assignments.map((entry) => entry.effectiveResourceIds), [[9], [9]]));
for (const status of ["pending", "interrupted", "in_progress", "done"] as const) test(`incluye tarea ${status}`, () => assert.equal(resolveEffectiveTaskResourceAssignments(input({ tasks: [task(1, { status })] })).assignments[0].status, status));
test("cancelled queda completamente excluida", () => assert.deepEqual(resolveEffectiveTaskResourceAssignments(input({ tasks: [task(1, { status: "cancelled", spaceId: 20, zoneId: 30, assignedResourceIds: [1] })], zoneIdBySpaceId: { 20: 31 }, spaceResourceAssignments: { 20: [2] }, zoneResourceAssignments: { 30: [3] } })), { assignments: [], zoneConflicts: [], readOnly: true }));
test("orden de tareas, arrays y maps no cambia el resultado", () => {
  const a = input({ tasks: [task(2, { spaceId: 20, assignedResourceIds: [3, 1] }), task(1, { zoneId: 30 })], spaceResourceAssignments: { 21: [4], 20: [2, 1] }, zoneResourceAssignments: { 31: [5], 30: [4, 3] } });
  const b = input({ tasks: [task(1, { zoneId: 30 }), task(2, { spaceId: 20, assignedResourceIds: [1, 3] })], spaceResourceAssignments: { 20: [1, 2], 21: [4] }, zoneResourceAssignments: { 30: [3, 4], 31: [5] } });
  assert.deepEqual(resolveEffectiveTaskResourceAssignments(a), resolveEffectiveTaskResourceAssignments(b));
});
test("es puro y devuelve output profundamente frozen", () => { const source = freeze(input({ tasks: [task(1, { assignedResourceIds: [2, 1] })] })); const before = structuredClone(source); const result = resolveEffectiveTaskResourceAssignments(source); assert.deepEqual(source, before); assert.ok(Object.isFrozen(result) && Object.isFrozen(result.assignments) && Object.isFrozen(result.assignments[0].effectiveResourceIds)); });
test("propiedades runtime extra no participan", () => { const a = input(); const b = Object.assign(structuredClone(a), { runtime: { elapsed: 10 } }); assert.deepEqual(resolveEffectiveTaskResourceAssignments(a), resolveEffectiveTaskResourceAssignments(b)); });
test("mismo efectivo conserva procedencia directa frente a zona", () => { const direct = resolveOne(input({ tasks: [task(1, { assignedResourceIds: [335] })] })); const zone = resolveOne(input({ tasks: [task(1, { zoneId: 30 })], zoneResourceAssignments: { 30: [335] } })); assert.deepEqual(direct.effectiveResourceIds, zone.effectiveResourceIds); assert.notDeepEqual(direct, zone); });
