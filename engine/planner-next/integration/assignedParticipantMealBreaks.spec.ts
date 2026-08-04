import assert from "node:assert/strict";
import test from "node:test";
import { createSupportedEngineInputAdapterFixture } from "./engineInputAdapter.fixture";
import { resolveParticipantScopedMeals } from "./assignedParticipantMealBreaks";

test("resuelve comidas de participante y divide su disponibilidad sin mutar el input", () => {
  const input = createSupportedEngineInputAdapterFixture();
  input.protectedBreaks = [{ id: "meal-201", kind: "meal", contestantId: 201, start: "14:30", end: "15:00" }];
  const before = structuredClone(input);
  const result = resolveParticipantScopedMeals(input);
  assert.deepEqual(result.availabilityByParticipantId.get(201), [{ start: 480, end: 870 }, { start: 900, end: 1020 }]);
  assert.deepEqual(result.availabilityByParticipantId.get(202), [{ start: 540, end: 990 }]);
  assert.equal(result.meals[0].canonicalBreakId, "break:meal-201");
  assert.equal(result.meals[0].status, "SUPPORTED");
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(result));
});

test("ordena múltiples comidas y rechaza solape y consumo total", () => {
  const input = createSupportedEngineInputAdapterFixture();
  input.protectedBreaks = [
    { id: "b", kind: "meal", contestantId: 201, start: "12:00", end: "13:00" },
    { id: "a", kind: "meal", contestantId: 201, start: "11:30", end: "12:30" },
  ];
  assert.ok(resolveParticipantScopedMeals(input).meals.every((meal) => meal.defects.includes("OVERLAP")));
  input.protectedBreaks = [{ id: "all", kind: "meal", contestantId: 201, start: "08:00", end: "17:00" }];
  assert.ok(resolveParticipantScopedMeals(input).meals[0].defects.includes("EMPTY_AVAILABILITY"));
});
