import assert from "node:assert/strict";
import test from "node:test";
import { projectContestantVocalCoachAssignments } from "./buildInput";

const frozenRows = <T>(rows: T): T => {
  if (rows && typeof rows === "object") {
    Object.values(rows as object).forEach(frozenRows);
    Object.freeze(rows);
  }
  return rows;
};

test("projects camelCase and snake_case assignments in contestant order without mutation", () => {
  const rows = frozenRows([
    { id: 8, vocal_coach_plan_resource_item_id: 336, name: "B" },
    { id: 7, vocalCoachPlanResourceItemId: 335, name: "A" },
  ]);
  const before = structuredClone(rows);
  const result = projectContestantVocalCoachAssignments(rows);
  assert.deepEqual(result, {
    vocalCoachPlanResourceItemIdByContestantId: { 7: 335, 8: 336 },
    coachResourceIds: [335, 336],
  });
  assert.deepEqual(rows, before);
  assert.deepEqual(Object.keys(result.vocalCoachPlanResourceItemIdByContestantId), ["7", "8"]);
});

test("omits null, undefined, and absent coach assignments", () => {
  const result = projectContestantVocalCoachAssignments([
    { id: 1, vocalCoachPlanResourceItemId: null },
    { id: 2, vocal_coach_plan_resource_item_id: undefined },
    { id: 3 },
  ]);
  assert.deepEqual(result, { vocalCoachPlanResourceItemIdByContestantId: {}, coachResourceIds: [] });
});

for (const [label, id] of [["zero", 0], ["negative", -1], ["decimal", 1.5], ["non-numeric string", "x"], ["infinite", Infinity]] as const) {
  test(`omits invalid contestant ID: ${label}`, () => {
    assert.deepEqual(projectContestantVocalCoachAssignments([{ id, vocalCoachPlanResourceItemId: 335 }]), {
      vocalCoachPlanResourceItemIdByContestantId: {}, coachResourceIds: [],
    });
  });
}

for (const [label, coachId] of [["zero", 0], ["negative", -1], ["decimal", 1.5], ["non-numeric string", "335"], ["infinite", Infinity]] as const) {
  test(`omits invalid coach ID: ${label}`, () => {
    assert.deepEqual(projectContestantVocalCoachAssignments([{ id: 7, vocalCoachPlanResourceItemId: coachId }]), {
      vocalCoachPlanResourceItemIdByContestantId: {}, coachResourceIds: [],
    });
  });
}

test("preserves multiple contestants sharing one coach and deduplicates only the legacy aggregate", () => {
  assert.deepEqual(projectContestantVocalCoachAssignments([
    { id: 8, vocalCoachPlanResourceItemId: 335 },
    { id: 7, vocalCoachPlanResourceItemId: 335 },
  ]), { vocalCoachPlanResourceItemIdByContestantId: { 7: 335, 8: 335 }, coachResourceIds: [335] });
});

test("preserves each contestant's coach rather than assigning by row position", () => {
  assert.deepEqual(projectContestantVocalCoachAssignments([
    { id: 8, vocalCoachPlanResourceItemId: 335 },
    { id: 7, vocalCoachPlanResourceItemId: 336 },
  ]), { vocalCoachPlanResourceItemIdByContestantId: { 7: 336, 8: 335 }, coachResourceIds: [335, 336] });
});
