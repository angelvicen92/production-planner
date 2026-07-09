import test from "node:test";
import assert from "node:assert/strict";
import { buildPostMacroORCSelectionInput } from "./buildPostMacroORCSelectionInput";

const st = { tasks: [], resources: [], spaces: [], planning: [], operationalMetrics: { resourceIdleMinutes: {}, talentIdleMinutes: {}, makespanMinutes: 0 } } as any;
const sim = (id: string, cs = `cs:${id}`) => ({ id, candidateStateId: cs, operationalStateSnapshot: st, planningMaterialization: { source: "candidate_transformations", changedTaskCount: 1, selectedLineage: { candidateFamilies: ["macro-production-wave-day-shape"] }, selectedCandidateFamilies: ["macro-production-wave-day-shape"], materializationSourceCoverage: { explainedChangedTaskIds: [1], unexplainedChangedTaskIds: [], readOnly: true } } } as any);

test("buildPostMacroORCSelectionInput unifies shadow and macro pass simulations", () => {
  const shadow: any = { candidates: [{ id: "c:shadow" }], candidateStates: [{ id: "cs:shadow", candidateId: "c:shadow" }], simulatedStates: [sim("sim:shadow", "cs:shadow")], validationResults: [{ simulatedStateId: "sim:shadow", result: "VALID", violatedConstraints: [] }], operationalValues: [{ simulatedStateId: "sim:shadow", overallScore: 1 }], commitDecisions: [], summary: {}, operationalState: st };
  const macroSims = [0,1,2,3].map((i) => sim(`sim:macro-production-wave-day-shape:${i}`, `cs:macro:${i}`));
  const pass: any = { candidates: macroSims.map((_, i) => ({ id: `candidate:macro-production-wave-day-shape:${i}` })), pipeline: { transformation: { candidateStates: macroSims.map((x, i) => ({ id: x.candidateStateId, candidateId: `candidate:macro-production-wave-day-shape:${i}` })) }, simulation: { simulatedStates: macroSims }, validation: { validationResults: macroSims.map((x) => ({ simulatedStateId: x.id, result: "VALID", violatedConstraints: [] })) }, ranking: { rankedOperationalValues: macroSims.map((x, i) => ({ simulatedStateId: x.id, overallScore: 10 + i })) }, commit: { commitDecisions: [] } }, summary: { selectedAsCommit: false, lineage: { simulatedStateIds: macroSims.map((x) => x.id) }, macroProductionWaveDayShape: { simulatedStateCount: 4 }, netValue: { acceptedByGlobalMacroValueGate: false } } };
  const unified = buildPostMacroORCSelectionInput({ shadow, macroMainZoneBlockRelayoutPass: pass, preMacroSelection: { diagnostics: { selectedBucket: "valid-committed-macro-main-zone-block-relayout" } } });
  assert.equal(unified?.simulatedStates.length, 5);
  assert.equal(unified?.sourceBreakdown.simulatedStates.shadow, 1);
  assert.equal(unified?.sourceBreakdown.simulatedStates["macro-pass"], 4);
  assert.equal(unified?.sourceBreakdown.macroPassSimulationIdsMissingCount, 0);
  assert.equal(unified?.postMacroSelection.stalePreMacroSelectionDiscarded, true);
  assert.equal(unified?.postMacroSelection.stalePreMacroSelectionReason, "final_macro_summary_rejected_candidate");
});
