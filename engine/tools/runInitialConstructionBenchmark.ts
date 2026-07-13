import { readFileSync } from "node:fs";
import { parseEngineScenarioSnapshot, cloneEngineScenarioValue } from "../scenarioSnapshot";
import { buildOperationalStateFromEngineInput } from "../orc/adapters/fromEngineInput";
import { runInitialConstructionStage1 } from "../orc/active/runInitialConstructionStage1";
import { runInitialConstructionStage2FirstPartialPlan } from "../orc/active/runInitialConstructionStage2FirstPartialPlan";
import { runInitialConstructionIterativeSession } from "../orc/active/runInitialConstructionIterativeSession";

export interface InitialConstructionBenchmarkResult {
  exclusiveConstructiveRuntimeMs: number;
  assignmentsReached: number;
  cycles: number;
  stopReason: string | null;
  budgetLimitReached: string | null;
  fingerprint: string | null;
}

export function runInitialConstructionBenchmarkFromInput(input: any, reasoningBudget: Record<string, unknown> = {}): InitialConstructionBenchmarkResult {
  const originInput = cloneEngineScenarioValue(input);
  const originOperationalState = buildOperationalStateFromEngineInput(originInput as any);
  const started = performance.now();
  const stage1 = runInitialConstructionStage1({ originInput, originOperationalState, createdAt: "benchmark" });
  const stage2 = runInitialConstructionStage2FirstPartialPlan({ originInput, originOperationalState, stage1, createdAt: "benchmark" });
  const session = runInitialConstructionIterativeSession({ originInput, originOperationalState, stage1, stage2, reasoningBudget: reasoningBudget as any, createdAt: "benchmark" });
  const ended = performance.now();
  return {
    exclusiveConstructiveRuntimeMs: Math.round(ended - started),
    assignmentsReached: session.evidence?.finalCombinedAssignmentCount ?? stage2.selectedAssignmentCount ?? 0,
    cycles: session.evidence?.acceptedCycleCount ?? 0,
    stopReason: session.evidence?.stopReason ?? null,
    budgetLimitReached: session.evidence?.budgetLimitReached ?? null,
    fingerprint: session.evidence?.finalCombinedAssignmentsFingerprint ?? null,
  };
}

export function runInitialConstructionBenchmarkSnapshot(snapshotPath: string, reasoningBudget: Record<string, unknown> = {}) {
  const snapshot = parseEngineScenarioSnapshot(readFileSync(snapshotPath));
  return runInitialConstructionBenchmarkFromInput(snapshot.engineInput, reasoningBudget);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const snapshotPath = process.argv[2];
  if (!snapshotPath) {
    console.error("Usage: tsx engine/tools/runInitialConstructionBenchmark.ts <snapshot.json> [budgetJson]");
    process.exit(1);
  }
  const budget = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  console.log(JSON.stringify(runInitialConstructionBenchmarkSnapshot(snapshotPath, budget), null, 2));
}
