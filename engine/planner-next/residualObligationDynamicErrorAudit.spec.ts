import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { auditResidualObligationDynamicError, classifyDynamicOpportunities, type DynamicOpportunity } from "./residualObligationDynamicErrorAudit";
import { auditResidualObligationOutcomes } from "./residualObligationOutcomeAudit";
import type { ResidualOrderingDecision, ResidualObligationCandidateTrace } from "./residualObligationAlignment";

const window = [{ start: 0, end: 200 }];
const problem = (): PlannerNextProblem => ({ day: { start: 0, end: 200 }, protectedMeal: { start: 190, end: 200 },
  spaces: ["main", "vocal", "aux"].map((id) => ({ id, availability: window })), resources: [],
  participants: [{ id: "p", availability: window }, { id: "empty", availability: window }], coaches: [{ id: "c", availability: window }],
  tasks: [], mainFlow: { spaceId: "main", preferredEnd: 180, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
  participantTransitionMinutes: 5, resourceTransitionMinutes: 5,
  budget: { bestK: 1, maxBacktracks: 1, maxPatterns: 1, maxBranchExpansions: 100 } });
const task = (id: string, kind: "main" | "vocal" | "auxiliary", start: number, spaceId: string): ScheduledTask =>
  ({ id, kind, participantId: "p", duration: 10, start, end: start + 10, spaceId, dependencies: kind === "main" ? ["v"] : [],
    ...(kind === "main" ? { blockKey: "b" } : {}) });
const key = { residualTaskCount: 1, currentPresenceSpan: 30, projectedPresenceLowerBound: 70, projectedMaximumGapLowerBound: 30,
  sumIndependentPresenceExpansion: 40, sumIndependentIdleExpansion: 30, sumIndependentMinimumGap: 30, emptyStaticDomainCount: 0,
  participantSlack: 20, firstObligation: 100, candidateId: "m" };
function decision(bestStaticStart: number | null = 140): ResidualOrderingDecision {
  const trace: ResidualObligationCandidateTrace = { stateFingerprint: "state", candidateId: "m", participantId: "p", depth: 0, slot: 100,
    firstObligation: 100, participantSlack: 20, operationTasks: [{ id: "m", start: 100, end: 110 }], placedParticipantTasks: [],
    feeder: { taskId: "v", duration: 10, idealStart: 85, idealEnd: 95, transition: 5 }, key,
    residualTasks: [{ taskId: "a", duration: 10, participantId: "p", spaceId: "aux", coachId: null, requiredResourceIds: [],
      staticStartsEvaluated: 39, staticStartsValid: bestStaticStart === null ? 0 : 39, missingReference: false, staticDomainEmpty: bestStaticStart === null,
      bestStaticStart, bestStaticEnd: bestStaticStart === null ? null : bestStaticStart + 10, resultingPresence: bestStaticStart === null ? null : 65,
      resultingIdle: bestStaticStart === null ? null : 35, resultingMaximumGap: bestStaticStart === null ? null : 30,
      presenceIncrement: bestStaticStart === null ? null : 35, idleIncrement: bestStaticStart === null ? null : 30,
      nearestObligationDistance: bestStaticStart === null ? null : 30 }] };
  return { stateFingerprint: "state", depth: 0, slot: 100, baselineOrder: ["m"], contextualOrder: ["m"], keys: [key],
    selectedCandidateId: "m", selectedParticipantId: "p", acceptedPath: true, selectedTrace: trace, explanation: "test" };
}
const baseline = [task("v", "vocal", 85, "vocal"), task("m", "main", 100, "main"), task("a", "auxiliary", 140, "aux")];
const experiment = [task("v", "vocal", 0, "vocal"), task("m", "main", 100, "main"), task("a", "auxiliary", 160, "aux")];

test("dynamic audit compares early feeder and later standalone, validates counterfactuals and is deterministic", () => {
  const p = problem(), d = decision(); p.tasks = baseline.map(({ start: _start, end: _end, ...t }) => t); const before = JSON.stringify({ p, baseline, experiment, d });
  const outcome = auditResidualObligationOutcomes(p, baseline, experiment, [d]);
  const first = auditResidualObligationDynamicError(p, experiment, [], outcome, [d]);
  const again = auditResidualObligationDynamicError(p, [...experiment].reverse(), [], outcome, [d]);
  const item = first.participants.find((x) => x.participantId === "p")!;
  assert.equal(item.feeder!.actualStartDeltaFromIdeal, -85); assert.equal(item.feeder!.minutesEarlierThanIdeal, 85);
  assert.equal(item.residualTasks[0]!.startDisplacement, 20); assert.equal(item.residualTasks[0]!.minutesLater, 20);
  assert.equal(item.feederOpportunity!.idle, 85); assert.equal(item.feederOpportunity!.diagnosticOnlyBlocked, !item.feederOpportunity!.hardValid);
  assert.equal(first.dynamicErrorAuditFingerprint, again.dynamicErrorAuditFingerprint);
  assert.equal(JSON.stringify({ p, baseline, experiment, d }), before);
});

test("classification covers feeder, residual, mixed, blocked, negative and incomplete without thresholds", () => {
  const opportunity = (idle: number, hardValid: boolean): DynamicOpportunity => ({ idle, presence: idle, maximumGap: 0, gapCount: 0,
    spaceChanges: 0, hardValid, diagnosticOnlyBlocked: !hardValid, reasonCodes: [], blockers: [] });
  assert.equal(classifyDynamicOpportunities(false, opportunity(10, true), opportunity(5, true), null), "FEEDER_DISPLACEMENT_VISIBLE");
  assert.equal(classifyDynamicOpportunities(false, opportunity(-1, true), opportunity(5, true), null), "RESIDUAL_DISPLACEMENT_VISIBLE");
  assert.equal(classifyDynamicOpportunities(false, opportunity(5, true), opportunity(5, true), null), "MIXED_DYNAMIC_OPPORTUNITY");
  assert.equal(classifyDynamicOpportunities(false, opportunity(5, false), opportunity(0, true), null), "STATIC_TARGETS_BLOCKED");
  assert.equal(classifyDynamicOpportunities(false, opportunity(-5, true), opportunity(0, true), null), "NO_STATIC_RECOVERY");
  assert.equal(classifyDynamicOpportunities(true, opportunity(10, true), null, null), "INCOMPLETE_DYNAMIC_TRACE");
});

test("blocked static targets are diagnostic only and canonical", () => {
  const p = problem(), conflicting = decision(100), outcome = auditResidualObligationOutcomes(p, baseline, experiment, [conflicting]);
  const audit = auditResidualObligationDynamicError(p, experiment, [], outcome, [conflicting]);
  const residual = audit.participants.find((x) => x.participantId === "p")!.residualTasks[0]!;
  assert.equal(residual.opportunity!.hardValid, false); assert.equal(residual.opportunity!.diagnosticOnlyBlocked, true);
  assert.ok(residual.opportunity!.blockers.some((b) => b.category === "PARTICIPANT_OVERLAP"));
  assert.deepEqual(residual.opportunity!.blockers, [...residual.opportunity!.blockers].sort((a, b) => a.category.localeCompare(b.category) || JSON.stringify(a).localeCompare(JSON.stringify(b))));
});

test("null best start and missing trace produce incomplete diagnostics without throwing", () => {
  const p = problem(), d = decision(null), outcome = auditResidualObligationOutcomes(p, baseline, experiment, [d]);
  const audit = auditResidualObligationDynamicError(p, experiment, [], outcome, [d]);
  const item = audit.participants.find((x) => x.participantId === "p")!;
  assert.equal(item.incomplete, true); assert.equal(item.residualTasks[0]!.opportunity, null);
  const missing = auditResidualObligationDynamicError(p, experiment, [], outcome, []);
  assert.equal(missing.participants.find((x) => x.participantId === "p")!.classification, "INCOMPLETE_DYNAMIC_TRACE");
  assert.equal(missing.classification, "INCOMPLETE_TRACE");
  assert.equal(missing.participants.some((x) => x.participantId === "empty"), false);
});
