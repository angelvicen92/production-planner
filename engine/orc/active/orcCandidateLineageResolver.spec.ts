import assert from "node:assert/strict";
import test from "node:test";
import { resolveORCCandidateLineage } from "./orcCandidateLineageResolver";

test("Candidate lineage resolver: pure day-shape", () => {
  const r = resolveORCCandidateLineage({ candidateId: "candidate:macro-production-wave-day-shape:gap-next-main-only" });
  assert.equal(r.containsMacroProductionWaveDayShape, true);
  assert.equal(r.containsMacroMainZoneBlockRelayout, false);
  assert.equal(r.primaryFamily, "macro-production-wave-day-shape");
  assert.equal(r.compositeFamily, false);
});

test("Candidate lineage resolver: composite macro-main + day-shape", () => {
  const id = "candidate:macro-main-zone-block-relayout:1+candidate:macro-production-wave-day-shape:gap-next-main-only";
  const r = resolveORCCandidateLineage({ candidateId: id });
  assert.equal(r.containsMacroProductionWaveDayShape, true);
  assert.equal(r.containsMacroMainZoneBlockRelayout, true);
  assert.equal(r.compositeFamily, true);
  assert.deepEqual(r.candidateIds, id.split("+").sort());
});

test("Candidate lineage resolver: partial-plan wrapper pure day-shape", () => {
  const r = resolveORCCandidateLineage({ candidateId: "candidate:partial-plan:candidate:macro-production-wave-day-shape:gap-next-main-only" });
  assert.deepEqual(r.baseCandidateIds, ["candidate:macro-production-wave-day-shape:gap-next-main-only"]);
  assert.equal(r.containsMacroProductionWaveDayShape, true);
  assert.equal(r.containsMacroMainZoneBlockRelayout, false);
  assert.deepEqual(r.candidateFamilies, ["macro-production-wave-day-shape"]);
  assert.equal(r.compositeFamily, false);
  assert.equal(r.compositeReason, null);
});

test("Candidate lineage resolver: simulated-state wrapper pure day-shape", () => {
  const r = resolveORCCandidateLineage({ simulatedStateId: "orc-simulation:simulated-state:orc-transformation:candidate-state:candidate:partial-plan:candidate:macro-production-wave-day-shape:gap-next-main-only" });
  assert.deepEqual(r.baseCandidateIds, ["candidate:macro-production-wave-day-shape:gap-next-main-only"]);
  assert.equal(r.containsMacroProductionWaveDayShape, true);
  assert.equal(r.compositeFamily, false);
  assert.equal(r.compositeReason, null);
});
