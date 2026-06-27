import { performance } from "node:perf_hooks";

import type { EngineInput } from "../../types";
import { benchmarkScenarios } from "../../v3/benchmarks/scenarios";
import { generatePlanV4 } from "../../v4";
import { roundBenchmarkMetric } from "./orcBenchmarkHarness";
import { runORCShadowMode } from "../shadow/runORCShadowMode";
import { stableStringify } from "../structuralEquality";

export interface ShadowBenchmarkMetrics {
  exploredSolutions: number;

  bestSolutionScore: number | null;

  executionTimeMs: number;

  matchesV4Output: boolean;
}

export interface ShadowBenchmarkResult {
  v4: ShadowBenchmarkMetrics;

  orc: ShadowBenchmarkMetrics;

  differences: string[];
}

export interface ShadowSearchBenchmarkOptions {
  scenarios?: ReadonlyArray<{ input: EngineInput }>;
  now?: () => number;
}

const cloneInput = (input: EngineInput): EngineInput => JSON.parse(JSON.stringify(input)) as EngineInput;

const elapsed = (start: number, end: number): number => roundBenchmarkMetric(Math.max(0, end - start));

const addDifference = (differences: string[], difference: string): string[] => (
  differences.includes(difference) ? differences : [...differences, difference]
);

const defaultBenchmarkScenarios = benchmarkScenarios.slice(0, 1);

const planningFingerprint = (input: EngineInput): string => {
  const output = generatePlanV4(cloneInput(input), { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any).output;
  return stableStringify({
    feasible: output.feasible,
    complete: output.complete,
    hardFeasible: output.hardFeasible,
    plannedTasks: output.plannedTasks,
    unplanned: output.unplanned ?? [],
    reasons: output.reasons ?? [],
  });
};

const extractORCSolutionMetrics = (input: EngineInput): Pick<ShadowBenchmarkMetrics, "exploredSolutions" | "bestSolutionScore"> => {
  const shadow = runORCShadowMode(cloneInput(input), { enabled: true, createdAt: null });
  if (shadow === null) return { exploredSolutions: 0, bestSolutionScore: null };

  const completionEvidence = shadow.evidence.find((item) => item.kind === "iterative-search-completed");
  const exploredSolutions = Number((completionEvidence?.data as Record<string, unknown> | undefined)?.solutionCount ?? shadow.searchSpaces.length);

  return {
    exploredSolutions: Number.isFinite(exploredSolutions) ? exploredSolutions : 0,
    bestSolutionScore: shadow.summary.evaluation.bestOverallScore,
  };
};

const runV4Metrics = (inputs: EngineInput[], now: () => number): Omit<ShadowBenchmarkMetrics, "matchesV4Output"> => {
  const start = now();
  const metrics = inputs.reduce(
    (summary, input) => {
      const result = generatePlanV4(cloneInput(input), { v4Profile: "balanced", maxRuntimeMs: 1000, maxStrategies: 1 } as any);
      const explored = result.diagnostics.candidateRunner.applied
        ? result.diagnostics.candidateRunner.candidates.filter((candidate) => !candidate.skipped).length
        : result.diagnostics.candidateRunner.candidateCount;
      const score = result.diagnostics.quality.qualityScore;

      return {
        exploredSolutions: summary.exploredSolutions + explored,
        bestSolutionScore: summary.bestSolutionScore == null ? score : Math.max(summary.bestSolutionScore, score),
      };
    },
    { exploredSolutions: 0, bestSolutionScore: null as number | null },
  );

  return { ...metrics, executionTimeMs: elapsed(start, now()) };
};

const runORCMetrics = (inputs: EngineInput[], now: () => number): Omit<ShadowBenchmarkMetrics, "matchesV4Output"> => {
  const start = now();
  const metrics = inputs.reduce(
    (summary, input) => {
      const result = extractORCSolutionMetrics(input);
      return {
        exploredSolutions: summary.exploredSolutions + result.exploredSolutions,
        bestSolutionScore: result.bestSolutionScore == null
          ? summary.bestSolutionScore
          : summary.bestSolutionScore == null
            ? result.bestSolutionScore
            : Math.max(summary.bestSolutionScore, result.bestSolutionScore),
      };
    },
    { exploredSolutions: 0, bestSolutionScore: null as number | null },
  );

  return { ...metrics, executionTimeMs: elapsed(start, now()) };
};

export function runShadowSearchBenchmark(options: ShadowSearchBenchmarkOptions = {}): ShadowBenchmarkResult {
  const scenarios = options.scenarios ?? defaultBenchmarkScenarios;
  const inputs = scenarios.map((scenario) => cloneInput(scenario.input));
  const now = options.now ?? (() => performance.now());
  const differences: string[] = [];

  const beforeFingerprints = inputs.map(planningFingerprint);
  const v4Metrics = runV4Metrics(inputs, now);
  const orcMetrics = runORCMetrics(inputs, now);
  const afterFingerprints = inputs.map(planningFingerprint);

  const matchesV4Output = beforeFingerprints.every((fingerprint, index) => fingerprint === afterFingerprints[index]);
  let nextDifferences = differences;

  if (!matchesV4Output) nextDifferences = addDifference(nextDifferences, "V4 planning output changed after ORC Shadow Search execution.");
  if (v4Metrics.exploredSolutions !== orcMetrics.exploredSolutions) nextDifferences = addDifference(nextDifferences, `Explored solutions differ: V4=${v4Metrics.exploredSolutions}, ORC=${orcMetrics.exploredSolutions}.`);
  if (v4Metrics.bestSolutionScore !== orcMetrics.bestSolutionScore) nextDifferences = addDifference(nextDifferences, `Best solution score differs: V4=${v4Metrics.bestSolutionScore}, ORC=${orcMetrics.bestSolutionScore}.`);
  if (v4Metrics.executionTimeMs !== orcMetrics.executionTimeMs) nextDifferences = addDifference(nextDifferences, `Execution time differs: V4=${v4Metrics.executionTimeMs}ms, ORC=${orcMetrics.executionTimeMs}ms.`);

  return {
    v4: { ...v4Metrics, matchesV4Output },
    orc: { ...orcMetrics, matchesV4Output },
    differences: nextDifferences,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runShadowSearchBenchmark(), null, 2));
}
