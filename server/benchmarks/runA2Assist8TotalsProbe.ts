import assert from "node:assert/strict";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";
import type { MacroCandidateCausalTrace } from "../../engine/planner-next/exactItinerantPlan";

// Replays only the accepted prefix needed to reconstruct S3 and stops after the
// Totales attempt. It never executes the later A2 completion stages.
const evidence=await runA2Assist8Evidence({stopAfterIterationCount:4});
const totals=evidence.iterations[3];
assert.equal(totals?.orchestration.selectedUnitId,"ROUND_SYNCHRONIZATION:a2-totales-rounds");
const reconciliation=totals.standaloneDiagnostic?.macroCandidateCausalReconciliation;
assert.ok(reconciliation,"Totales must expose macro-candidate causal reconciliation");
assert.equal(reconciliation.total,reconciliation.pruned+reconciliation.deadEndedByAuthority+reconciliation.enteredResidualOrTerminal);
const candidates=(totals.standaloneDiagnostic?.macroCandidateCausalTraces??[]) as MacroCandidateCausalTrace[];
assert.equal(new Set(candidates.map(candidate=>candidate.fingerprint)).size,candidates.length);
assert.ok(candidates.every(candidate=>candidate.participantFuture.status!=="NOT_CHECKED"));
assert.ok(candidates.every(candidate=>candidate.outcome!=="DEAD_ENDED_BY_AUTHORITY"||candidate.firstDescendantDeadEnd!==null));
console.log(JSON.stringify({benchmark:"A2-ASSIST-8-TOTALES-CAUSAL-PROBE",milestone:"S3",proposalOutcome:totals.proposalOutcome,
  branches:totals.work?.branchesExplored??0,reconciliation,
  candidates},null,2));
