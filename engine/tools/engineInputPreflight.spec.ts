import test from "node:test";
import assert from "node:assert/strict";
import type { EngineInput } from "../types";
import { inspectEngineInput } from "./engineInputPreflight";
const input = (): EngineInput => ({
  planId: 1,
  workDay: { start: "09:00", end: "18:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 1,
  tasks: [
    {
      id: 1,
      planId: 1,
      templateId: 10,
      templateName: "A",
      status: "pending",
      contestantId: 1,
      spaceId: 1,
      zoneId: 1,
      durationOverrideMin: 10,
    },
  ],
  locks: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [
    { id: 5, resourceItemId: 5, typeId: 1, name: "R", isAvailable: true },
  ],
  resourceItemComponents: {},
  groupingZoneIds: [],
  contestantAvailabilityById: { 1: { start: "09:00", end: "18:00" } },
  spaceNameById: { 1: "S" },
  taskTemplateNameById: { 10: "A" },
});
test("preflight valid input", () => {
  const r = inspectEngineInput(input());
  assert.equal(r.valid, true);
  assert.equal(r.facts.contestants, 1);
});
test("missing dependency, self dependency, and cycle are errors", () => {
  const i = input();
  i.tasks.push(
    {
      id: 2,
      planId: 1,
      templateId: 10,
      status: "pending",
      contestantId: 1,
      spaceId: 1,
      zoneId: 1,
      dependsOnTaskIds: [999, 2],
      durationOverrideMin: 10,
    },
    {
      id: 3,
      planId: 1,
      templateId: 10,
      status: "pending",
      contestantId: 1,
      spaceId: 1,
      zoneId: 1,
      dependsOnTaskIds: [4],
      durationOverrideMin: 10,
    },
    {
      id: 4,
      planId: 1,
      templateId: 10,
      status: "pending",
      contestantId: 1,
      spaceId: 1,
      zoneId: 1,
      dependsOnTaskIds: [3],
      durationOverrideMin: 10,
    },
  );
  const codes = inspectEngineInput(i).errors.map((e) => e.code);
  assert.ok(codes.includes("DEPENDENCY_TASK_NOT_FOUND"));
  assert.ok(codes.includes("SELF_DEPENDENCY"));
  assert.ok(codes.includes("DEPENDENCY_CYCLE"));
});
test("space and resource missing are errors", () => {
  const i = input();
  i.tasks[0].spaceId = 99;
  i.tasks[0].assignedResourceIds = [42];
  const codes = inspectEngineInput(i).errors.map((e) => e.code);
  assert.ok(codes.includes("SPACE_NOT_FOUND"));
  assert.ok(codes.includes("RESOURCE_NOT_FOUND"));
});
test("configuration contradictions are warnings and unchanged", () => {
  const i = input();
  i.optimizerMainZoneId = 1;
  i.optimizerPrioritizeMainZone = false;
  i.optimizerMainZonePriorityLevel = 0;
  i.optimizerMainZoneOptKeepBusy = true;
  i.optimizerMainZoneOptFinishEarly = false;
  i.optimizerContestantCompactLevel = 0;
  i.optimizerContestantStayInZoneLevel = 0;
  i.optimizerGroupBySpaceAndTemplate = true;
  i.optimizerGroupingLevel = 0;
  const r = inspectEngineInput(i);
  assert.equal(r.valid, true);
  assert.equal(r.configuration.mainZoneId, 1);
  assert.equal(r.configuration.prioritizeMainZone, false);
  assert.ok(
    r.warnings.some(
      (w) => w.code === "MAIN_ZONE_IDENTIFIED_BUT_NOT_PRIORITIZED",
    ),
  );
  assert.ok(
    r.warnings.some(
      (w) => w.code === "GROUPING_LEVEL_ZERO_WITH_GROUPING_FLAG_ENABLED",
    ),
  );
});
test("meal placeholders without contestant are synthetic and not contestants", () => {
  const i = input();
  i.tasks = [
    ...Array.from({ length: 19 }, (_, idx) => ({
      id: idx + 1,
      planId: 1,
      templateId: 10,
      status: "pending" as const,
      contestantId: idx + 1,
      spaceId: 1,
      zoneId: 1,
      durationOverrideMin: 10,
    })),
    ...Array.from({ length: 26 }, (_, idx) => ({
      id: 100 + idx,
      planId: 1,
      templateId: 99,
      templateName: "Comida",
      status: "pending" as const,
      contestantId: null,
      spaceId: 1,
      zoneId: 1,
      breakKind: "space_meal",
      operationalRole: "meal_break_placeholder" as const,
      durationOverrideMin: 30,
    })),
  ];
  i.contestantAvailabilityById = Object.fromEntries(
    Array.from({ length: 19 }, (_, idx) => [
      idx + 1,
      { start: "09:00", end: "18:00" },
    ]),
  );
  const r = inspectEngineInput(i);
  assert.equal(r.facts.contestants, 19);
  assert.equal(r.facts.syntheticTasks, 26);
  assert.equal(r.facts.meal.syntheticSpaceMealTasks, 26);
});

test("contestant meals use official template classification and may omit space", () => {
  const i = input();
  i.mealTaskTemplateId = 14;
  i.mealTaskTemplateName = "Sodexo";
  i.taskTemplateNameById = { 14: "Sodexo" };
  i.tasks = [
    {
      id: 1,
      planId: 1,
      templateId: 14,
      templateName: "Sodexo",
      status: "pending",
      contestantId: 1,
      spaceId: 0,
      zoneId: null,
      durationOverrideMin: 40,
    },
  ];
  const r = inspectEngineInput(i);
  assert.equal(r.valid, true);
  assert.equal(r.facts.productiveTasks, 0);
  assert.equal(r.facts.meal.contestantMealTasks, 1);
  assert.equal(r.facts.tasksByOperationalKind.contestant_meal, 1);
  assert.equal(
    r.errors.some((e) => e.code === "PRODUCTIVE_TASK_WITHOUT_SPACE"),
    false,
  );
});

test("contestant meals fall back to meal-like names when no template config exists", () => {
  const i = input();
  i.tasks = [
    {
      id: 1,
      planId: 1,
      templateId: 14,
      templateName: "Sodexo",
      status: "pending",
      contestantId: 1,
      spaceId: 0,
      zoneId: null,
      durationOverrideMin: 40,
    },
  ];
  const r = inspectEngineInput(i);
  assert.equal(r.valid, true);
  assert.equal(r.facts.meal.contestantMealTasks, 1);
  assert.equal(r.facts.productiveTasks, 0);
});

test("productive task without real space still errors", () => {
  const i = input();
  i.tasks = [
    {
      id: 1,
      planId: 1,
      templateId: 10,
      templateName: "A",
      status: "pending",
      contestantId: 1,
      spaceId: 0,
      zoneId: 1,
      durationOverrideMin: 10,
    },
  ];
  const r = inspectEngineInput(i);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.code === "PRODUCTIVE_TASK_WITHOUT_SPACE"));
  assert.equal(r.facts.productiveTasks, 1);
});

test("space and itinerant meal placeholders stay synthetic and separate", () => {
  const i = input();
  i.tasks = [
    {
      id: 1,
      planId: 1,
      templateId: 99,
      templateName: "Comida",
      status: "pending",
      contestantId: null,
      spaceId: 1,
      zoneId: 1,
      breakKind: "space_meal",
      operationalRole: "meal_break_placeholder",
      durationOverrideMin: 30,
    },
    {
      id: 2,
      planId: 1,
      templateId: 99,
      templateName: "Comida",
      status: "pending",
      contestantId: null,
      spaceId: 0,
      zoneId: null,
      itinerantTeamId: 7,
      breakKind: "itinerant_meal",
      operationalRole: "meal_break_placeholder",
      durationOverrideMin: 30,
    },
  ];
  const r = inspectEngineInput(i);
  assert.equal(r.valid, true);
  assert.equal(r.facts.syntheticTasks, 2);
  assert.equal(r.facts.meal.syntheticSpaceMealTasks, 1);
  assert.equal(r.facts.meal.syntheticItinerantMealTasks, 1);
  assert.equal(r.facts.tasksByOperationalKind.synthetic_space_meal, 1);
  assert.equal(r.facts.tasksByOperationalKind.synthetic_itinerant_meal, 1);
});

test("plan 27 equivalent classification has no double counting and filters fake space/zone ids", () => {
  const i = input();
  i.mealTaskTemplateId = 14;
  i.spaceNameById = Object.fromEntries(
    Array.from({ length: 24 }, (_, idx) => [idx + 1, `S${idx + 1}`]),
  );
  i.spaceIdsByZoneId = Object.fromEntries(
    Array.from({ length: 7 }, (_, idx) => [idx + 1, [idx + 1]]),
  );
  i.zoneResourceAssignments = {};
  i.zoneResourceTypeRequirements = {};
  i.tasks = [
    ...Array.from({ length: 174 }, (_, idx) => ({
      id: idx + 1,
      planId: 1,
      templateId: 10,
      templateName: "A",
      status: "pending" as const,
      contestantId: (idx % 19) + 1,
      spaceId: (idx % 24) + 1,
      zoneId: (idx % 7) + 1,
      durationOverrideMin: 10,
    })),
    ...Array.from({ length: 19 }, (_, idx) => ({
      id: 1000 + idx,
      planId: 1,
      templateId: 14,
      templateName: "Sodexo",
      status: "pending" as const,
      contestantId: idx + 1,
      spaceId: 0,
      zoneId: null,
      durationOverrideMin: 40,
    })),
    ...Array.from({ length: 23 }, (_, idx) => ({
      id: 2000 + idx,
      planId: 1,
      templateId: 99,
      templateName: "Comida",
      status: "pending" as const,
      contestantId: null,
      spaceId: (idx % 24) + 1,
      zoneId: (idx % 7) + 1,
      breakKind: "space_meal",
      operationalRole: "meal_break_placeholder" as const,
      durationOverrideMin: 30,
    })),
    ...Array.from({ length: 3 }, (_, idx) => ({
      id: 3000 + idx,
      planId: 1,
      templateId: 99,
      templateName: "Comida",
      status: "pending" as const,
      contestantId: null,
      spaceId: 0,
      zoneId: null,
      itinerantTeamId: idx + 1,
      breakKind: "itinerant_meal",
      operationalRole: "meal_break_placeholder" as const,
      durationOverrideMin: 30,
    })),
  ];
  i.contestantAvailabilityById = Object.fromEntries(
    Array.from({ length: 19 }, (_, idx) => [
      idx + 1,
      { start: "09:00", end: "18:00" },
    ]),
  );
  const r = inspectEngineInput(i);
  assert.equal(r.valid, true);
  assert.equal(r.facts.tasks, 219);
  assert.equal(r.facts.productiveTasks, 174);
  assert.equal(r.facts.meal.contestantMealTasks, 19);
  assert.equal(r.facts.syntheticTasks, 26);
  assert.equal(r.facts.meal.syntheticSpaceMealTasks, 23);
  assert.equal(r.facts.meal.syntheticItinerantMealTasks, 3);
  assert.deepEqual(r.facts.tasksByOperationalKind, {
    productive_task: 174,
    contestant_meal: 19,
    synthetic_space_meal: 23,
    synthetic_itinerant_meal: 3,
  });
  assert.equal(r.facts.spaces, 24);
  assert.equal(r.facts.zones, 7);
});
