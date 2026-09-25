import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const EVIDENCE_PATH = "docs/evidence/A2-FULL-EXEC-001-first-execution.json";

test("Full A2 first executable integration reports an atomic completion count", () => {
  const originalEvidence = existsSync(EVIDENCE_PATH) ? readFileSync(EVIDENCE_PATH) : null;
  const child = spawnSync(process.execPath, ["--import", "tsx", "engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts"], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    assert.equal(child.status, 0, child.stderr || child.stdout);
    const lines = child.stdout.trim().split(/\n/).filter(Boolean);
    const evidence = JSON.parse(lines.at(-1)!) as {
      canonicalObligationCount: number;
      canonicalProjection: { fakeTechnicalTaskCount:number; technicalChainCount:number;
        technicalChains:Array<{id:string;representativeTaskIds:string[];representativeCount:number}>;
        jointGroups:Array<{id:string;taskIds:string[]}>;evaAvailabilityStart:string|null;participantTransitionMinutes:number|null };
      engineInput: { taskCount:number;fakeTechnicalTaskCount:number;maxBranchExpansions: number };
      preflight: { status: string; reasonCodes: string[] };
      adapter: { status: string; reasonCodes: string[] };
      execution: null | { kind: string; reasonCodes: string[]; status: string | null; complete: boolean;
        branchBudget:{consumed:number;maximum:number;remaining:number};firstMaterialDeadEnd:unknown;
        blocker:null|{phase:string;reasonCode:string;authority:string|null;configuredMaxPatterns?:number|null;
          materialTaskIds:string[];materialEngineTaskIds?:number[]};
        evidence: { branchesExplored:number;coreBranches:number;standaloneBranches:number;
          architecturesStructurallyRejected:number;
          coreMaximumDepth:number;coreCompleteLeafCount:number;deepestCoreDepthReached:number;
          deepestPartialScheduledTaskCount:number;deepestPartialMainRunsClosed:number;
          deepestPartialFeederRunsClosed:number;deepestPartialCoreTasksRemaining:number;
          firstFeedableRunSizes:number[];
          structuralRejectionsByReason:Record<string,number>;
          standaloneForwardBranches:number;participantMealBranchesExplored:number;
          standaloneForwardWitnessCacheHits:number;standaloneForwardWitnessCacheMisses:number;
          standaloneForwardWitnessCacheEntries:number;standaloneForwardWitnessBranchesAvoided:number;
          residualMatchingBranchesExplored:number;feederRunPrePartialChecks:number;feederRunPrePartialPrunes:number;
          feederRunPrePartialPrunesByDepth:Record<string,number>;feederRunPreFeederChecks:number;
          feederRunPreFeederPrunes:number;feederRunPreFeederPrunesByDepth:Record<string,number>;
          feederOrderBranches:number;feederSlotMatchingChecks:number;feederSlotMatchingPrunes:number;
          feederSlotAnalyticChecks:number;feederSlotAnalyticPrunes:number;feederSlotAnalyticAbstentions:number;
          feederSlotMatchingEdgeChecks:number;feederSlotMatchingAugmentTraversals:number;
          feederSlotMatchingBranchesExplored:number;feederMatchingWitnessRepairs:number;
          standaloneCompleteLeafCount:number;lastExhaustionPhase:string|null;reasonCodes:string[] };
        diagnosticReport: null | { criticalRejectionReasons: Array<{ id: string; count: number }>;
          topBlockingPlacedTasks: Array<{ id: string; count: number }>;
          topFeederBlockerPairs: Array<{ id: string; count: number }>;
          criticalRejectionCount: number; recommendation: string | null; waterfallReconciles:boolean } };
      result: { publishedCanonicalObligations: number; diagnosticScheduledCanonicalObligations: number; targetCanonicalObligations: number; fullHardValidEligible: boolean };
    };
    assert.equal(evidence.canonicalObligationCount, 266);
    assert.equal(evidence.result.targetCanonicalObligations, 266);
    assert.equal(evidence.engineInput.taskCount, 266);
    assert.equal(evidence.engineInput.fakeTechnicalTaskCount, 0);
    assert.equal(evidence.canonicalProjection.fakeTechnicalTaskCount, 0);
    assert.equal(evidence.canonicalProjection.technicalChainCount, 1);
    assert.deepEqual(evidence.canonicalProjection.technicalChains, [{
      id: "continuity.reality-c-eva-alfombra",
      representativeTaskIds: ["C06.reality_hall", "C12.reality_control_eva", "C11.reality_buggy",
        "C04.alfombra_roja_eva", "C13.alfombra_roja_eva", "C06.alfombra_roja_conjunta", "C16.alfombra_roja"],
      representativeCount: 7,
    }]);
    assert.deepEqual(evidence.canonicalProjection.jointGroups, [
      { id: "joint.alfombra-roja.C06-C10", taskIds: ["C06.alfombra_roja_conjunta", "C10.alfombra_roja_conjunta"] },
      { id: "joint.totales-post.C06-C10", taskIds: ["C06.totales_post_conjunto", "C10.totales_post_conjunto"] },
    ]);
    assert.equal(evidence.canonicalProjection.evaAvailabilityStart, "16:00");
    assert.equal(evidence.canonicalProjection.participantTransitionMinutes, 5);
    assert.equal(evidence.preflight.status, "SUPPORTED");
    assert.equal(evidence.adapter.status, "SUPPORTED");
    assert.ok(evidence.result.publishedCanonicalObligations === 0 || evidence.result.publishedCanonicalObligations === 266);
    const report = evidence.execution?.diagnosticReport;
    assert.ok(report);
    const executionEvidence=evidence.execution!.evidence;
    assert.deepEqual(executionEvidence.reasonCodes,["CORE_BRANCH_BUDGET_EXHAUSTED"]);
    const structuralRejectionEntries=Object.entries(executionEvidence.structuralRejectionsByReason);
    assert.ok(structuralRejectionEntries.length>0);
    assert.ok(structuralRejectionEntries.every(([,count])=>count>0));
    assert.equal(structuralRejectionEntries.reduce((sum,[,count])=>sum+count,0),
      executionEvidence.architecturesStructurallyRejected);
    assert.ok(executionEvidence.coreMaximumDepth>=0);
    assert.ok(executionEvidence.deepestCoreDepthReached>=0);
    assert.ok(executionEvidence.deepestPartialScheduledTaskCount>=0);
    assert.ok(executionEvidence.deepestPartialMainRunsClosed>=0);
    assert.equal(executionEvidence.coreCompleteLeafCount,0);
    assert.ok(executionEvidence.deepestPartialCoreTasksRemaining>=0);
    assert.equal(evidence.execution!.complete,false);
    assert.equal(evidence.result.publishedCanonicalObligations,0);
    assert.equal(evidence.result.fullHardValidEligible,false);
    assert.equal(evidence.execution!.branchBudget.consumed,executionEvidence.branchesExplored);
    assert.equal(evidence.execution!.branchBudget.remaining,
      evidence.execution!.branchBudget.maximum-evidence.execution!.branchBudget.consumed);
    assert.equal(evidence.execution!.firstMaterialDeadEnd,null);
    if(evidence.execution!.blocker)
      assert.ok(executionEvidence.reasonCodes.includes(evidence.execution!.blocker.reasonCode)
        || evidence.execution!.reasonCodes.includes(evidence.execution!.blocker.reasonCode));
    assert.equal(executionEvidence.branchesExplored,
      executionEvidence.coreBranches+executionEvidence.standaloneBranches);
    assert.equal(executionEvidence.standaloneForwardWitnessCacheEntries,
      executionEvidence.standaloneForwardWitnessCacheMisses);
    assert.equal(executionEvidence.standaloneForwardWitnessBranchesAvoided,
      executionEvidence.standaloneForwardWitnessCacheHits);
    assert.equal(report.waterfallReconciles,true);
    console.log("FULL_A2_EXEC_RESULT", JSON.stringify({
      preflightStatus: evidence.preflight.status,
      preflightReasonCodes: evidence.preflight.reasonCodes,
      adapterStatus: evidence.adapter.status,
      adapterReasonCodes: evidence.adapter.reasonCodes,
      execution: {
        complete: evidence.execution!.complete,
        evidence: {
          branchesExplored: executionEvidence.branchesExplored,
          coreBranches: executionEvidence.coreBranches,
          standaloneBranches: executionEvidence.standaloneBranches,
          coreCompleteLeafCount: executionEvidence.coreCompleteLeafCount,
          deepestPartialCoreTasksRemaining: executionEvidence.deepestPartialCoreTasksRemaining,
          standaloneCompleteLeafCount: executionEvidence.standaloneCompleteLeafCount,
          lastExhaustionPhase: executionEvidence.lastExhaustionPhase,
        },
      },
      publishedCanonicalObligations: evidence.result.publishedCanonicalObligations,
      diagnosticScheduledCanonicalObligations: evidence.result.diagnosticScheduledCanonicalObligations,
      targetCanonicalObligations: evidence.result.targetCanonicalObligations,
      fullHardValidEligible: evidence.result.fullHardValidEligible,
      maxBranchExpansions: evidence.engineInput.maxBranchExpansions,
    }));
  } finally {
    if (originalEvidence === null) {
      rmSync(EVIDENCE_PATH, { force: true });
    } else {
      writeFileSync(EVIDENCE_PATH, originalEvidence);
    }
  }
});
