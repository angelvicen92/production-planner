import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyExecutionFilters,
  filterExecutionRows,
  projectExecutionRows,
  type ExecutionTask,
} from "./day-execution-view";
const tasks: ExecutionTask[] = [
  {
    id: 1,
    templateId: 7,
    contestantId: 2,
    spaceId: 3,
    zoneId: 4,
    status: "pending",
    template: { name: "Ensayo", defaultDuration: 15 },
    startPlanned: "10:00",
    endPlanned: "10:15",
    assignedResources: [11],
  },
  {
    id: 2,
    templateId: 8,
    contestantId: null,
    status: "pending",
    name: "Preparación técnica",
    startPlanned: null,
    endPlanned: null,
  },
  {
    id: 3,
    templateId: 7,
    contestantId: 2,
    spaceId: 3,
    zoneId: 4,
    status: "done",
    name: "Ensayo",
    startReal: "09:00",
    endReal: "09:16",
  },
];
const rows = () =>
  projectExecutionRows(
    tasks,
    [{ id: 2, name: "Ana" }],
    [{ id: 4, name: "Estudio" }],
    [{ id: 3, zoneId: 4, name: "Escenario" }],
    { 11: "Cámara", 12: "Sonido", 13: "Luz" },
    { 3: [12] },
    { 4: [13] },
    "11:00",
  );
test("execution combines real direct, space and zone resources without inventing a participant", () => {
  const result = rows();
  assert.deepEqual(result[0].resources, [11, 12, 13]);
  assert.equal(result[1].contestant, "Sin concursante");
  assert.equal(result[1].location, "Sin ubicación");
  assert.equal(result[0].late, true);
  assert.equal(result[2].late, false);
});
test("execution filters are combinable, preserve unscheduled tasks on clear and never mutate source data", () => {
  const before = structuredClone(tasks);
  const selected = filterExecutionRows(
    rows(),
    {
      ...emptyExecutionFilters,
      search: "Ana",
      resource: "12",
      status: "pending",
      template: "7",
      late: true,
    },
    "startPlanned",
  );
  assert.deepEqual(
    selected.map((row) => row.task.id),
    [1],
  );
  assert.deepEqual(
    filterExecutionRows(
      rows(),
      { ...emptyExecutionFilters, unscheduled: true, unlocated: true },
      "startPlanned",
    ).map((row) => row.task.id),
    [2],
  );
  assert.equal(
    filterExecutionRows(rows(), emptyExecutionFilters, "title").length,
    3,
  );
  assert.deepEqual(tasks, before);
});
test("missing real times are last in both sort directions with deterministic identities", () => {
  for (const descending of [false, true])
    assert.equal(
      filterExecutionRows(
        rows(),
        emptyExecutionFilters,
        "startReal",
        descending,
      )[0].task.id,
      3,
    );
});
