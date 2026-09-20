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
    assert.deepEqual(executionEvidence.structuralRejectionsByReason,{});
    assert.equal(executionEvidence.feederRunPrePartialChecks,0);
    assert.equal(executionEvidence.coreMaximumDepth,0);
    assert.equal(executionEvidence.deepestCoreDepthReached,0);
    assert.equal(executionEvidence.deepestPartialScheduledTaskCount,0);
    assert.equal(executionEvidence.deepestPartialMainRunsClosed,0);
    assert.deepEqual(executionEvidence.firstFeedableRunSizes,[]);
    assert.equal(executionEvidence.deepestPartialMainRunsClosed,executionEvidence.deepestPartialFeederRunsClosed);
    assert.equal(executionEvidence.coreCompleteLeafCount,0);
    assert.equal(executionEvidence.deepestPartialCoreTasksRemaining,0);
    assert.equal(executionEvidence.lastExhaustionPhase,null);
    assert.equal(executionEvidence.feederSlotMatchingBranchesExplored,
      executionEvidence.feederSlotMatchingEdgeChecks+executionEvidence.feederSlotMatchingAugmentTraversals
        +executionEvidence.feederMatchingWitnessRepairs);
    assert.equal(executionEvidence.branchesExplored,0);
    assert.deepEqual(evidence.execution!.branchBudget,{consumed:0,maximum:300000,remaining:300000});
    assert.equal(evidence.execution!.firstMaterialDeadEnd,null);
    assert.deepEqual(evidence.execution!.blocker,{
      phase:"MAIN_FLOW_PATTERN_GENERATION",reasonCode:"PATTERN_SEARCH_BUDGET_EXHAUSTED",
      authority:"generateMainFlowPatterns",configuredMaxPatterns:200,
      materialTaskIds:Array.from({length:19},(_,index)=>`C${String(index+1).padStart(2,"0")}.ensayo_estudio_7`),
      materialEngineTaskIds:[10002,10017,10031,10043,10056,10072,10088,10102,10116,10131,
        10147,10161,10175,10190,10203,10218,10229,10243,10256],
    });
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
