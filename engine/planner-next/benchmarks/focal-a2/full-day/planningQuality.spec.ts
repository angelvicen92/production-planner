import assert from "node:assert/strict";
import test from "node:test";
import { createCanonicalFullA2Template } from "./manifest";
import { expandCanonicalFullA2Template } from "./expand";
import { createHumanA2Reference } from "./humanReference";
import { evaluatePlanningQuality } from "./planningQuality";

const expanded = expandCanonicalFullA2Template(createCanonicalFullA2Template());
const reference = createHumanA2Reference(expanded);
const report = evaluatePlanningQuality(expanded, reference.intervals, {
  authorizedMainFlowBreaks: [{ start: 840, end: 915 }],
  scheduledPreparations: reference.preparations,
});

test("shared planning-quality evaluator computes the human P01 baseline without using the reference as planner input", () => {
  const p01 = report.kpis.P01_MAIN_FLOW_CONTINUITY;
  assert.equal(p01.status, "AVAILABLE");
  if (p01.status !== "AVAILABLE") return;
  assert.deepEqual(p01.value, { firstStart: 675, lastEnd: 1035, productiveMinutes: 285, authorizedPauseMinutes: 75, unauthorizedGapMinutes: 0, unauthorizedGapCount: 0, maximumUnauthorizedGapMinutes: 0, continuityRatio: 1 });
});

test("human P02 baseline is the canonical 09:00-18:35 day and main flow ends at 17:15", () => {
  const p02 = report.kpis.P02_MAKESPAN;
  assert.equal(p02.status, "AVAILABLE");
  if (p02.status !== "AVAILABLE") return;
  assert.equal(p02.value.firstCanonicalObligationStart, 540);
  assert.equal(p02.value.lastCanonicalObligationEnd, 1115);
  assert.equal(p02.value.makespanMinutes, 575);
  assert.equal(p02.value.mainFlowEnd, 1035);
});

test("human P03 participant presence baseline is frozen from canonical obligations", () => {
  const p03 = report.kpis.P03_PARTICIPANT_PRESENCE;
  assert.equal(p03.status, "AVAILABLE");
  if (p03.status !== "AVAILABLE") return;
  assert.equal(p03.value.totalMinutes, 7585);
  assert.ok(Math.abs(p03.value.meanMinutes - 399.2105263157895) < 1e-9);
  assert.equal(p03.value.medianMinutes, 385);
  assert.equal(p03.value.p90Minutes, 515);
  assert.equal(p03.value.maximumMinutes, 545);
  assert.deepEqual(p03.value.byParticipantId, { C01: 385, C02: 385, C03: 325, C04: 510, C05: 355, C06: 545, C07: 300, C08: 265, C09: 435, C10: 515, C11: 495, C12: 380, C13: 465, C14: 405, C15: 380, C16: 440, C17: 350, C18: 350, C19: 300 });
});

test("human P09 baseline proves anchored, joint, technical and Totales synchronization semantics", () => {
  const p09 = report.kpis.P09_SPECIAL_SYNCHRONIZATION;
  assert.equal(p09.status, "AVAILABLE");
  if (p09.status !== "AVAILABLE") return;
  assert.deepEqual(p09.value, { anchoredOperationCount: 3, anchoredViolationCount: 0, jointOperationCount: 2, jointViolationCount: 0, technicalChainCount: 1, technicalChainViolationCount: 0, synchronizedTotalesRoundCount: 9, totalesSynchronizationViolationCount: 0, residualTotales1RoundCount: 1, residualTotalesCoreoRoundCount: 0, completeAndSynchronized: true });
});

test("quality evaluator blocks KPIs whose required operational configuration is not yet available instead of guessing", () => {
  assert.equal(report.comparisonReady, false);
  for (const id of ["P04_AVOIDABLE_PARTICIPANT_WAIT", "P05_CRITICAL_RESOURCE_PRESENCE", "P06_SPACE_CONTINUITY_UTILIZATION", "P08_MOVES_ZONES", "P10_ROBUSTNESS_SLACK"] as const) {
    assert.equal(report.kpis[id].status, "BLOCKED_BY_CONFIGURATION", id);
    assert.ok(report.kpis[id].missing.length > 0, id);
  }
});

test("P01 is also blocked rather than guessing when authorized main-flow breaks are absent", () => {
  const withoutBreakConfig = evaluatePlanningQuality(expanded, reference.intervals);
  assert.equal(withoutBreakConfig.kpis.P01_MAIN_FLOW_CONTINUITY.status, "BLOCKED_BY_CONFIGURATION");
});

test("human P07 baseline captures coach blocks, setup blocks and explicit preparation work", () => {
  const p07 = report.kpis.P07_BLOCKS_SETUPS;
  assert.equal(p07.status, "AVAILABLE");
  if (p07.status !== "AVAILABLE") return;
  assert.deepEqual(p07.value, {
    mainBlockCount: 4,
    mainBlocksByCoachId: { "coach-jose-maria": 2, "coach-lucia": 2 },
    mainBlockLimitViolationCount: 0,
    setupFamilyBlockCount: 2,
    setupFamilyBlocksByFamilyId: { estrellas: 1, sillon: 1 },
    setupSwitchCount: 1,
    setupReentryCount: 0,
    preparationCount: 18,
    setupPreparationCount: 1,
    roundPreparationCount: 17,
    preparationMinutes: 95,
    setupPreparationMinutes: 10,
    roundPreparationMinutes: 85,
  });
});

test("P07 is blocked rather than inferring preparation work when explicit occupations are absent", () => {
  const withoutPreparations = evaluatePlanningQuality(expanded, reference.intervals, { authorizedMainFlowBreaks: [{ start: 840, end: 915 }] });
  assert.equal(withoutPreparations.kpis.P07_BLOCKS_SETUPS.status, "BLOCKED_BY_CONFIGURATION");
});

test("quality evaluator rejects partial or non-canonical planning identity sets", () => {
  assert.throws(() => evaluatePlanningQuality(expanded, reference.intervals.slice(1), { authorizedMainFlowBreaks: [{ start: 840, end: 915 }] }), /exact canonical task identity set/);
});
