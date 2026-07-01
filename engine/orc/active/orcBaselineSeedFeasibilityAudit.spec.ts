import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { stableStringify } from "../structuralEquality";
import { auditORCBaselineSeedHardFeasibility } from "./orcBaselineSeedFeasibilityAudit";

const input = (tasks: EngineInput["tasks"], extra: Partial<EngineInput> = {}): EngineInput => ({
  planId: 205,
  workDay: { start: "09:00", end: "18:00" },
  tasks,
  locks: [],
  planResourceItems: [{ id: 7, resourceItemId: 70, typeId: 1, name: "Camera 1", isAvailable: true }],
  spaceConcurrencyById: { 10: 1, 20: 1 },
  spaceCapacityById: { 10: 1, 20: 1 },
  spaceIsExclusiveById: { 10: false, 20: false },
  spaceParentById: { 10: null, 20: null },
  spaceNameById: { 10: "A", 20: "B" },
  spacePriorityById: { 10: 0, 20: 0 },
  ...extra,
} as EngineInput);

const task = (id: number, start: string, end: string, patch: Partial<EngineInput["tasks"][number]> = {}): EngineInput["tasks"][number] => ({
  id,
  planId: 205,
  templateId: id,
  status: "pending",
  startPlanned: start,
  endPlanned: end,
  spaceId: 10,
  assignedResourceIds: [],
  ...patch,
});

test("baseline seed with valid planning is hard-feasible", () => {
  const audit = auditORCBaselineSeedHardFeasibility(input([task(1, "09:00", "09:30")]), { createdAt: null });
  assert.equal(audit.available, true);
  assert.equal(audit.hardFeasible, true);
  assert.equal(audit.reason, "baseline_seed_hard_feasible");
  assert.equal(audit.validationResult, "VALID");
  assert.equal(audit.readOnly, true);
});

test("baseline seed with broken direct dependency is hard-infeasible", () => {
  const audit = auditORCBaselineSeedHardFeasibility(input([task(1, "09:30", "10:00"), task(2, "09:00", "09:15", { dependsOnTaskIds: [1] })]), { createdAt: null });
  assert.equal(audit.hardFeasible, false);
  assert.equal(audit.reason, "baseline_seed_hard_infeasible");
  assert.ok(audit.violatedConstraints.includes("DIRECT_DEPENDENCY_BROKEN"));
  assert.equal(audit.violatedConstraintSummary.DIRECT_DEPENDENCY_BROKEN, 1);
});

test("baseline seed with space overlap reports SPACE_OVERLAP", () => {
  const audit = auditORCBaselineSeedHardFeasibility(input([task(1, "09:00", "10:00"), task(2, "09:30", "10:30")]), { createdAt: null });
  assert.equal(audit.hardFeasible, false);
  assert.ok(audit.violatedConstraints.includes("SPACE_OVERLAP"));
});

test("baseline seed crossing protected hard break reports protected break violation", () => {
  const audit = auditORCBaselineSeedHardFeasibility(input([task(1, "09:00", "10:00")], { protectedBreaks: [{ start: "09:30", end: "09:45", hard: true } as any] }), { createdAt: null });
  assert.equal(audit.hardFeasible, false);
  assert.ok(audit.violatedConstraints.includes("PLANNING_CROSSES_PROTECTED_HARD_BREAK"));
});

test("absence of planning returns stable unavailable reason", () => {
  const audit = auditORCBaselineSeedHardFeasibility(input([{ id: 1, planId: 205, templateId: 1, status: "pending" } as any]), { createdAt: null });
  assert.equal(audit.available, false);
  assert.equal(audit.hardFeasible, false);
  assert.equal(audit.reason, "baseline_seed_has_no_planning");
});

test("audit does not mutate input, is deterministic, serializable, bounded, and read-only", () => {
  const seed = input([task(1, "09:00", "09:30")]);
  const before = stableStringify(seed);
  const first = auditORCBaselineSeedHardFeasibility(seed, { createdAt: null });
  const second = auditORCBaselineSeedHardFeasibility(seed, { createdAt: null });
  assert.equal(stableStringify(seed), before);
  assert.equal(stableStringify(first), stableStringify(second));
  assert.equal(JSON.parse(JSON.stringify(first)).planningInfluence, "baseline-seed-feasibility-audit-only");
  assert.equal(first.mutatesOperationalState, false);
  assert.equal(first.commitsPlanning, false);
  assert.equal(first.evidence[0].kind, "baseline-seed-hard-feasibility-audited");
  assert.equal(first.evidence[0].data.readOnly, true);
  assert.equal(first.evidence[0].data.planningInfluence, "baseline-seed-feasibility-audit-only");
  assert.equal(Object.prototype.hasOwnProperty.call(first, "operationalStateSnapshot"), false);
});

test("baseline seed audit stratifies violation detail samples and counts dominant codes from details", () => {
  const tasks = [
    task(1, "09:00", "10:00", { spaceId: 10 }),
    task(2, "09:15", "09:45", { spaceId: 10 }),
    task(3, "09:20", "09:40", { spaceId: 20, dependsOnTaskIds: [1] }),
  ];
  const audit = auditORCBaselineSeedHardFeasibility(input(tasks, { protectedBreaks: [{ start: "09:25", end: "09:35", kind: "protected", spaceId: 20 } as any] }), { createdAt: null });
  const sampleCodes = new Set(audit.violationDetailsSample.map((item) => item.code));
  assert.equal(audit.hardFeasible, false);
  assert.ok(sampleCodes.has("DIRECT_DEPENDENCY_BROKEN"));
  assert.ok(sampleCodes.has("SPACE_OVERLAP"));
  assert.ok(sampleCodes.has("PLANNING_CROSSES_PROTECTED_HARD_BREAK"));
  assert.equal(audit.evidence[0].data.sampleStrategy, "stratified_by_violation_code");
  assert.ok(audit.dominantViolationCodes.includes("SPACE_OVERLAP"));
});

test("baseline seed audit does not treat duplicated flexible meal window as hard meal break", () => {
  const audit = auditORCBaselineSeedHardFeasibility(input([task(1, "13:15", "13:45")], { mealMode: "flexible_meal_window", meal: { start: "13:00", end: "16:30" }, mealWindow: { start: "13:00", end: "16:30" } } as any), { createdAt: null });
  assert.equal(audit.hardFeasible, true);
  assert.equal(audit.mealSemantics?.mealMode, "flexible_meal_window");
  assert.equal(audit.mealSemantics?.mode, "meal_placement_window");
  assert.equal(audit.violatedConstraints.includes("PLANNING_CROSSES_HARD_MEAL_BREAK"), false);
  assert.equal(audit.hardFeasibilityRootCauses?.includes("explicit_global_meal_break_conflict"), false);
});

test("baseline seed audit treats global_hard_break meal as hard and reports explicit root cause", () => {
  const audit = auditORCBaselineSeedHardFeasibility(input([task(1, "13:15", "13:45")], { mealMode: "global_hard_break", meal: { start: "13:00", end: "16:30" } } as any), { createdAt: null });
  assert.equal(audit.hardFeasible, false);
  assert.equal(audit.mealSemantics?.mealMode, "global_hard_break");
  assert.ok(audit.violatedConstraints.includes("PLANNING_CROSSES_HARD_MEAL_BREAK"));
  assert.ok(audit.hardFeasibilityRootCauses?.includes("explicit_global_meal_break_conflict"));
});
