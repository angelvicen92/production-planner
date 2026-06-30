import type { EngineInput } from "../../types";
import { stableStringify } from "../structuralEquality";
import { runOperationalDeltaBenchmark, type OperationalDeltaBenchmarkOptions, type OperationalDeltaReport } from "./operationalDeltaBenchmark";
import { productionBenchmarkScenarios, type ProductionBenchmarkScenario, type ProductionScenarioId } from "./scenarios";

export const PRODUCTION_SCENARIO_BENCHMARK_SUITE_VERSION = "ORC-PRODUCTION-SCENARIO-BENCHMARK-SUITE-V1";
export const PRODUCTION_SCENARIO_BENCHMARK_CREATED_AT = "2026-06-28T10:00:00.000Z";

export interface ProductionScenarioResult {
  scenario: Omit<ProductionBenchmarkScenario, "input"> & { taskCount: number };
  status: "passed" | "failed";
  report: OperationalDeltaReport | null;
  error: string | null;
  inputUnchanged: boolean;
}

export interface ProductionScenarioBenchmarkSuiteReport {
  suiteVersion: typeof PRODUCTION_SCENARIO_BENCHMARK_SUITE_VERSION;
  generatedAt: string | null;
  scenarioCount: number;
  passedCount: number;
  failedCount: number;
  results: ProductionScenarioResult[];
  globalSummary: {
    totalTasks: number;
    officialMetricsOnly: true;
    planningInfluence: "none";
    orcBetterOpportunityCount: number;
    orcWorseOpportunityCount: number;
    equalOpportunityCount: number;
    evidenceExplanation: string[];
  };
}

export interface ProductionScenarioBenchmarkSuiteOptions extends OperationalDeltaBenchmarkOptions {
  scenarioIds?: ProductionScenarioId[];
  continueOnFailure?: boolean;
  runner?: (input: EngineInput, options: OperationalDeltaBenchmarkOptions, scenario: ProductionBenchmarkScenario) => OperationalDeltaReport;
}

const cloneInput = (input: EngineInput): EngineInput => JSON.parse(JSON.stringify(input)) as EngineInput;
const stableError = (error: unknown): string => error instanceof Error ? error.message : String(error);

function selectScenarios(ids?: ProductionScenarioId[]): ProductionBenchmarkScenario[] {
  if (!ids || ids.length === 0) return productionBenchmarkScenarios;
  const requested = new Set(ids);
  return productionBenchmarkScenarios.filter((scenario) => requested.has(scenario.id));
}

function summarize(results: ProductionScenarioResult[]): ProductionScenarioBenchmarkSuiteReport["globalSummary"] {
  const reports = results.map((result) => result.report).filter((report): report is OperationalDeltaReport => report !== null);
  const allOpportunities = reports.flatMap((report) => report.improvementReport.opportunities);
  return {
    totalTasks: results.reduce((sum, result) => sum + result.scenario.taskCount, 0),
    officialMetricsOnly: true,
    planningInfluence: "none",
    orcBetterOpportunityCount: allOpportunities.filter((item) => item.comparison === "orcBetter").length,
    orcWorseOpportunityCount: allOpportunities.filter((item) => item.comparison === "orcWorse").length,
    equalOpportunityCount: allOpportunities.filter((item) => item.comparison === "equal").length,
    evidenceExplanation: [
      `Executed ${results.length} deterministic production scenario(s) with identical cloned input for V4, V4-seeded ORC Shadow Mode, and raw ORC Shadow diagnostics.`,
      "Each scenario report is produced by the Operational Delta Benchmark and its associated Improvement Opportunity Report.",
      "The suite is read-only: it does not persist planning, mutate official planning, or change V4/ORC pipeline behavior.",
    ],
  };
}

export function runProductionScenarioBenchmarkSuite(options: ProductionScenarioBenchmarkSuiteOptions = {}): ProductionScenarioBenchmarkSuiteReport {
  const scenarios = selectScenarios(options.scenarioIds);
  const results: ProductionScenarioResult[] = [];
  const runner = options.runner ?? runOperationalDeltaBenchmark;
  const createdAt = Object.prototype.hasOwnProperty.call(options, "createdAt") ? options.createdAt : PRODUCTION_SCENARIO_BENCHMARK_CREATED_AT;
  for (const scenario of scenarios) {
    const safeInput = cloneInput(scenario.input);
    const before = stableStringify(safeInput);
    try {
      const report = runner(cloneInput(safeInput), { ...options, createdAt }, scenario);
      results.push({
        scenario: { id: scenario.id, name: scenario.name, category: scenario.category, description: scenario.description, expectation: scenario.expectation, taskCount: safeInput.tasks.length },
        status: "passed",
        report,
        error: null,
        inputUnchanged: stableStringify(safeInput) === before,
      });
    } catch (error) {
      results.push({
        scenario: { id: scenario.id, name: scenario.name, category: scenario.category, description: scenario.description, expectation: scenario.expectation, taskCount: safeInput.tasks.length },
        status: "failed",
        report: null,
        error: stableError(error),
        inputUnchanged: stableStringify(safeInput) === before,
      });
      if (options.continueOnFailure === false) break;
    }
  }
  return {
    suiteVersion: PRODUCTION_SCENARIO_BENCHMARK_SUITE_VERSION,
    generatedAt: createdAt,
    scenarioCount: results.length,
    passedCount: results.filter((result) => result.status === "passed").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    results,
    globalSummary: summarize(results),
  };
}

export function runProductionScenarioBenchmark(scenarioId: ProductionScenarioId, options: Omit<ProductionScenarioBenchmarkSuiteOptions, "scenarioIds"> = {}): ProductionScenarioResult {
  const report = runProductionScenarioBenchmarkSuite({ ...options, scenarioIds: [scenarioId] });
  const result = report.results[0];
  if (!result) throw new Error(`Unknown production scenario: ${scenarioId}`);
  return result;
}
