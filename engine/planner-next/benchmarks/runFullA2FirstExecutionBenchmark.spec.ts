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
  });
  try {
    assert.equal(child.status, 0, child.stderr || child.stdout);
    const lines = child.stdout.trim().split(/\n/).filter(Boolean);
    const evidence = JSON.parse(lines.at(-1)!) as {
      canonicalObligationCount: number;
      preflight: { status: string; reasonCodes: string[] };
      adapter: { status: string; reasonCodes: string[] };
      execution: null | { kind: string; reasonCodes: string[]; status: string | null; complete: boolean;
        diagnosticReport: null | { criticalRejectionReasons: Array<{ id: string; count: number }>;
          topBlockingPlacedTasks: Array<{ id: string; count: number }>;
          topFeederBlockerPairs: Array<{ id: string; count: number }>;
          criticalRejectionCount: number; recommendation: string | null } };
      result: { publishedCanonicalObligations: number; diagnosticScheduledCanonicalObligations: number; targetCanonicalObligations: number; fullHardValidEligible: boolean };
    };
    assert.equal(evidence.canonicalObligationCount, 269);
    assert.equal(evidence.result.targetCanonicalObligations, 269);
    assert.ok(evidence.result.publishedCanonicalObligations === 0 || evidence.result.publishedCanonicalObligations === 269);
    const report = evidence.execution?.diagnosticReport;
    assert.ok(report);
    assert.ok(report.criticalRejectionCount > 0);
    assert.ok(report.criticalRejectionReasons.length > 0);
    assert.ok(report.topBlockingPlacedTasks.length > 0);
    assert.ok(report.topFeederBlockerPairs.length > 0);
    assert.ok(report.recommendation);
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
