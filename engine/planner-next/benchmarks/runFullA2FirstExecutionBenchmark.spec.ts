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
      preflight: { status: string; reasonCodes: string[] };
      adapter: { status: string; reasonCodes: string[] };
      execution: null | { kind: string; reasonCodes: string[]; status: string | null; complete: boolean;
        evidence: { branchesExplored:number;coreBranches:number;standaloneBranches:number;
          coreMaximumDepth:number;coreCompleteLeafCount:number;
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
          feederSlotMatchingBranchesExplored:number;lastExhaustionPhase:string|null };
        diagnosticReport: null | { criticalRejectionReasons: Array<{ id: string; count: number }>;
          topBlockingPlacedTasks: Array<{ id: string; count: number }>;
          topFeederBlockerPairs: Array<{ id: string; count: number }>;
          criticalRejectionCount: number; recommendation: string | null; waterfallReconciles:boolean } };
      result: { publishedCanonicalObligations: number; diagnosticScheduledCanonicalObligations: number; targetCanonicalObligations: number; fullHardValidEligible: boolean };
    };
    assert.equal(evidence.canonicalObligationCount, 269);
    assert.equal(evidence.result.targetCanonicalObligations, 269);
    assert.ok(evidence.result.publishedCanonicalObligations === 0 || evidence.result.publishedCanonicalObligations === 269);
    const report = evidence.execution?.diagnosticReport;
    assert.ok(report);
    const executionEvidence=evidence.execution!.evidence;
    assert.ok(executionEvidence.feederRunPrePartialChecks>0);
    assert.ok(executionEvidence.feederRunPreFeederChecks>0);
    assert.ok((executionEvidence.structuralRejectionsByReason.FEEDER_CONTIGUOUS_CAPACITY??0)>0);
    assert.equal(executionEvidence.feederRunPreFeederPrunes,0);
    assert.deepEqual(executionEvidence.feederRunPreFeederPrunesByDepth,{});
    assert.ok(executionEvidence.coreMaximumDepth>=14);
    assert.ok(executionEvidence.deepestCoreDepthReached>0
      &&executionEvidence.deepestCoreDepthReached<=executionEvidence.coreMaximumDepth);
    assert.ok(executionEvidence.deepestPartialScheduledTaskCount>0);
    assert.equal(executionEvidence.deepestPartialMainRunsClosed,executionEvidence.deepestPartialFeederRunsClosed);
    assert.ok(executionEvidence.deepestPartialCoreTasksRemaining>0);
    assert.match(executionEvidence.deepestPartialFrontierFingerprint,/^[a-f0-9]{64}$/);
    assert.ok(executionEvidence.feederOrderBranches<292524);
    assert.ok(executionEvidence.feederSlotMatchingChecks>0);
    assert.ok(executionEvidence.feederSlotMatchingPrunes>0);
    assert.ok(executionEvidence.feederSlotAnalyticChecks>0);
    assert.ok(executionEvidence.feederSlotAnalyticPrunes>0);
    assert.equal(executionEvidence.feederSlotMatchingBranchesExplored,
      executionEvidence.feederSlotMatchingEdgeChecks+executionEvidence.feederSlotMatchingAugmentTraversals
        +executionEvidence.feederMatchingWitnessRepairs);
    assert.ok(executionEvidence.branchesExplored>0 && executionEvidence.branchesExplored<=300000);
    assert.equal(executionEvidence.branchesExplored,
      executionEvidence.coreBranches+executionEvidence.standaloneBranches);
    assert.ok(executionEvidence.standaloneForwardWitnessCacheHits>0);
    assert.ok(executionEvidence.standaloneForwardWitnessCacheMisses>0);
    assert.ok(executionEvidence.standaloneForwardWitnessCacheEntries>0
      &&executionEvidence.standaloneForwardWitnessCacheEntries<=executionEvidence.standaloneForwardWitnessCacheMisses);
    assert.ok(executionEvidence.standaloneForwardWitnessBranchesAvoided
      >=executionEvidence.standaloneForwardWitnessCacheHits);
    assert.equal(report.waterfallReconciles,true);
    console.log("FULL_A2_EXEC_RESULT", JSON.stringify({
      preflightStatus: evidence.preflight.status,
      preflightReasonCodes: evidence.preflight.reasonCodes,
      adapterStatus: evidence.adapter.status,
      adapterReasonCodes: evidence.adapter.reasonCodes,
      execution: evidence.execution,
      publishedCanonicalObligations: evidence.result.publishedCanonicalObligations,
      diagnosticScheduledCanonicalObligations: evidence.result.diagnosticScheduledCanonicalObligations,
      targetCanonicalObligations: evidence.result.targetCanonicalObligations,
      fullHardValidEligible: evidence.result.fullHardValidEligible,
    }));
  } finally {
    if (originalEvidence === null) {
      rmSync(EVIDENCE_PATH, { force: true });
    } else {
      writeFileSync(EVIDENCE_PATH, originalEvidence);
    }
  }
});
