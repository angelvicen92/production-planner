import test from "node:test";
import assert from "node:assert/strict";
import { runInitialConstructionBenchmarkFromInput } from "./runInitialConstructionBenchmark";

const input:any={planId:1,workDay:{start:"09:00",end:"14:00"},meal:{start:"13:00",end:"14:00"},contestantAvailabilityById:{1:{start:"09:00",end:"14:00"},2:{start:"09:00",end:"14:00"}},planResourceItems:[],tasks:[{id:1,planId:1,templateId:1,status:"pending",contestantId:1,spaceId:1,durationOverrideMin:20,dependsOnTaskIds:[2]},{id:2,planId:1,templateId:2,status:"pending",contestantId:1,spaceId:1,durationOverrideMin:20},{id:3,planId:1,templateId:3,status:"pending",contestantId:2,spaceId:2,durationOverrideMin:20},{id:4,planId:1,templateId:4,status:"pending",contestantId:2,spaceId:2,durationOverrideMin:20,dependsOnTaskIds:[3]}]};

test("isolated initial construction benchmark runs Stage 1, Stage 2, and iterative session only", () => {
  const result = runInitialConstructionBenchmarkFromInput(input, { maxAcceptedCycles: 1, maxCandidates: 4 });
  assert.ok(result.exclusiveConstructiveRuntimeMs >= 0);
  assert.ok(result.assignmentsReached >= 2);
  assert.ok(result.cycles <= 1);
  assert.equal(typeof result.terminalBlockerEvidenceFingerprint === "string" || result.terminalBlockerEvidenceFingerprint === null, true);
  assert.equal(typeof result.terminalPrimaryBlockerCodeCounts, "object");
  assert.equal(Array.isArray(result.terminalBlockedAnchorSample), true);
  assert.ok(result.fingerprint);
  for (const key of ["repairCandidateProfileCount","repairableCandidateProfileCount","candidateProfilesByAnchor","candidateEjectionSetsByAnchor","repairAttemptedAnchorIdsByRound","repairNeighborhoodSessionCount","repairSearchNodeCount","repairExpansionChildNodeCount","anchorBranchBacktrackCount","searchNodeSequenceFingerprint","searchNodeTransitionFingerprint","searchNodeTransitionInvalidCount","cumulativeEjectionLimitRejectedCount","cumulativeNeighborhoodLimitRejectedCount","cumulativeClosureRemovalFailureCount","repairAttemptStopReasonCounts","closureContractValid","finalProductiveAssignedTaskIds"] as const) assert.equal(Object.prototype.hasOwnProperty.call(result,key), true, key);
  for(const key of ["structuredCausalConflictBuildCount","structuredCausalConflictEvidenceCompleteCount","structuredCausalConflictEvidenceIncompleteCount","causalConflictAllActiveAssignmentsFallbackCount","causalBlockerTaskIdUnsupportedByFailureEvidenceCount","causalConflictTaskIdMissingFromActiveAssignmentsCount","decisionLineageLookupCount","decisionLineageLookupMissCount","decisionPathStringParseCount","conflictDirectedSelectionChangedLegacyChoiceCount","conflictDirectedSelectionMatchedLegacyChoiceCount","incompleteCausalEvidenceLegacyFallbackCount","changesOnlyNonBlockingDecisionsSkippedCount","causalBlockerAssignmentChangedCount","causalBlockerAssignmentRemovedCount","structuredCausalConflictSamples","structuredCausalBackjumpSamples"] as const) {
    assert.equal(Object.prototype.hasOwnProperty.call(result,key),true,key);
    assert.notEqual(result[key],undefined,key);
  }
  assert.equal(result.causalConflictAllActiveAssignmentsFallbackCount,0);
  assert.equal(result.causalBlockerTaskIdUnsupportedByFailureEvidenceCount,0);
  assert.equal(result.decisionPathStringParseCount,0);
  JSON.stringify(result);
  for(const key of ["staticHardBlockerProfileCount","shiftableDependencyBoundProfileCount","uncoveredHardBlockerProfileCount","executableCandidateProfileCount","effectiveRepairRootCount","equivalentRepairRootDedupCount","effectiveRepairRootsByAnchor","terminalRankByAnchor","scheduledEffectiveRootFingerprintsByRound","repairAttemptedEffectiveRootFingerprintsByRound","duplicateEffectiveRootAttemptCount","effectiveRepairRootPortfolioFingerprint","rootRejectedReasonCounts","rootStaticWindowConflictCountsByAnchor","rootShiftableWindowConflictCountsByAnchor"] as const) {
    assert.equal(Object.prototype.hasOwnProperty.call(result,key),true,key);
    assert.notEqual(result[key],undefined,key);
  }
});
