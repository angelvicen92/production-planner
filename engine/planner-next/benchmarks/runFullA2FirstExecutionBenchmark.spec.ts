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
      engineInput: { maxBranchExpansions: number; mainFlowBlockPolicy:{domainAuthority:string;projectedTechnicalMaximum:number};
        projectedArrivalTransportPolicy:{targetGroupSize:number;minimumGroupSize:number;maximumGroupSize:number;minGapMinutes:number};
        effectiveCameraProjection:Record<string,string[]> };
      preflight: { status: string; reasonCodes: string[] };
      adapter: { status: string; reasonCodes: string[] };
      execution: null | { kind: string; reasonCodes: string[]; status: string | null; complete: boolean;
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
          standaloneCompleteLeafCount:number;lastExhaustionPhase:string|null };
        diagnosticReport: null | { criticalRejectionReasons: Array<{ id: string; count: number }>;
          topBlockingPlacedTasks: Array<{ id: string; count: number }>;
          topFeederBlockerPairs: Array<{ id: string; count: number }>;
          criticalRejectionCount: number; recommendation: string | null; waterfallReconciles:boolean } };
      result: { publishedCanonicalObligations: number; diagnosticScheduledCanonicalObligations: number; targetCanonicalObligations: number; fullHardValidEligible: boolean };
    };
    assert.equal(evidence.canonicalObligationCount, 269);
    assert.equal(evidence.result.targetCanonicalObligations, 269);
    const cameras=evidence.engineInput.effectiveCameraProjection;
    assert.deepEqual(cameras.REDES,cameras.PASILLO,"Recursos and Pasillo share CAM4");
    assert.ok(cameras.REDES.some((id)=>id===cameras.PASILLO.find((other)=>other===id)));
    assert.ok(cameras.GIRATUTO.every((id)=>!cameras.REDES.includes(id)),"Giratuto does not consume CAM4");
    assert.deepEqual(cameras.CROMA,cameras.SILLON);
    assert.deepEqual(cameras.CROMA,cameras.ESTRELLAS);
    assert.ok(cameras.TOTALES_1.every((id)=>!cameras.TOTALES_COREO.includes(id)),"Totales lanes use distinct CAM5/CAM6");
    assert.equal(evidence.engineInput.mainFlowBlockPolicy.domainAuthority,"UNBOUNDED");
    assert.ok(evidence.engineInput.mainFlowBlockPolicy.projectedTechnicalMaximum>2);
    assert.deepEqual({target:evidence.engineInput.projectedArrivalTransportPolicy.targetGroupSize,minimum:evidence.engineInput.projectedArrivalTransportPolicy.minimumGroupSize,
      maximum:evidence.engineInput.projectedArrivalTransportPolicy.maximumGroupSize,gap:evidence.engineInput.projectedArrivalTransportPolicy.minGapMinutes},
      {target:3,minimum:1,maximum:6,gap:30});
    assert.ok(evidence.result.publishedCanonicalObligations === 0 || evidence.result.publishedCanonicalObligations === 269);
    const report = evidence.execution?.diagnosticReport;
    assert.ok(report);
    const executionEvidence=evidence.execution!.evidence;
    assert.ok(Object.values(executionEvidence.structuralRejectionsByReason).some((count)=>count>0));
    assert.ok((executionEvidence.structuralRejectionsByReason.FEEDER_PREREQUISITE_PREFIX_CAPACITY??0)>0);
    assert.ok(executionEvidence.feederRunPrePartialChecks>0);
    assert.ok(executionEvidence.coreMaximumDepth>0);
    assert.ok(executionEvidence.deepestCoreDepthReached>0);
    assert.ok(executionEvidence.deepestPartialScheduledTaskCount>0);
    assert.ok(executionEvidence.deepestPartialMainRunsClosed>0);
    assert.ok(executionEvidence.firstFeedableRunSizes.length>0);
    assert.ok(executionEvidence.firstFeedableRunSizes.every((size)=>Number.isInteger(size)&&size>0));
    assert.equal(executionEvidence.deepestPartialMainRunsClosed,executionEvidence.deepestPartialFeederRunsClosed);
    assert.ok(executionEvidence.coreCompleteLeafCount>0);
    assert.equal(executionEvidence.deepestPartialCoreTasksRemaining,0);
    assert.equal(executionEvidence.lastExhaustionPhase,"STANDALONE");
    assert.equal(executionEvidence.feederSlotMatchingBranchesExplored,
      executionEvidence.feederSlotMatchingEdgeChecks+executionEvidence.feederSlotMatchingAugmentTraversals
        +executionEvidence.feederMatchingWitnessRepairs);
    assert.ok(executionEvidence.branchesExplored>0 && executionEvidence.branchesExplored<=300000);
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
