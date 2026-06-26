import assert from "node:assert/strict";
import test from "node:test";
import type { EngineOutput } from "../../types";
import type { ORCBenchmarkResult } from "../benchmarks/orcBenchmarkHarness";
import type { CalibrationReport } from "../benchmarks/calibrationFramework";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { REAL_SCENARIO_VALIDATION_VERSION, validateRealScenario } from "./realScenarioValidation";

const benchmark = (overrides: Partial<ORCBenchmarkResult> = {}): ORCBenchmarkResult => ({
  executionTimeMs: 0,
  opportunitiesDetected: 0,
  diagnosesGenerated: 0,
  searchSpacesGenerated: 0,
  candidatesGenerated: 0,
  candidateStatesGenerated: 0,
  simulatedStatesGenerated: 0,
  validationResultsGenerated: 0,
  operationalValuesGenerated: 0,
  commitDecisionsGenerated: 0,
  reasoningBudgetConsumed: {
    maxOpportunities: 0,
    maxSearchSpaces: 0,
    maxCandidates: 0,
    maxSimulations: 0,
    consumedOpportunities: 0,
    consumedSearchSpaces: 0,
    consumedCandidates: 0,
    consumedSimulations: 0,
  },
  summary: {
    benchmarkVersion: "ORC-BENCHMARK-HARNESS-V1",
    evidence: {
      benchmarkVersion: "ORC-BENCHMARK-HARNESS-V1",
      timestamp: "2026-06-26T20:35:00.000Z",
      configuration: {
        inputPlanId: 117,
        shadowMode: true,
        planningInfluence: "none",
      },
    },
  },
  ...overrides,
});

const calibration = (overrides: Partial<CalibrationReport> = {}): CalibrationReport => ({
  generatedAt: null,
  benchmarkVersion: "GOLDEN-BENCHMARK-SUITE-V1:CALIBRATION-V1",
  quality: {
    opportunitiesPerSearchSpace: 0,
    candidatesPerSearchSpace: 0,
    simulationsPerCandidate: 0,
    validSimulationRate: 0,
    averageOperationalScore: 0,
    reasoningBudgetEfficiency: 0,
  },
  recommendations: [],
  ...overrides,
});

const planningResult = (overrides: Partial<EngineOutput> = {}): EngineOutput => ({
  feasible: true,
  complete: true,
  hardFeasible: true,
  plannedTasks: [],
  warnings: [],
  unplanned: [],
  ...overrides,
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("validateRealScenario generates a minimum deterministic report", () => {
  const report = validateRealScenario(benchmark(), calibration(), planningResult());

  assert.equal(report.scenarioId, "117");
  assert.equal(report.comparedAt, "2026-06-26T20:35:00.000Z");
  assert.deepEqual(report.metrics, {
    detectedOpportunities: 0,
    evaluatedCandidates: 0,
    topRankAgreement: 1,
    reasoningCoverage: 0,
    planningDifferences: 13,
  });
  assert.ok(report.summary.startsWith(`${REAL_SCENARIO_VALIDATION_VERSION}: scenario 117`));
});

test("validateRealScenario compares complete ORC evidence against V4 structural evidence", () => {
  const report = validateRealScenario(
    benchmark({
      opportunitiesDetected: 3,
      searchSpacesGenerated: 2,
      candidatesGenerated: 5,
      validationResultsGenerated: 5,
      operationalValuesGenerated: 5,
      commitDecisionsGenerated: 1,
    }),
    calibration({
      quality: {
        opportunitiesPerSearchSpace: 1.5,
        candidatesPerSearchSpace: 2.5,
        simulationsPerCandidate: 1,
        validSimulationRate: 0.8,
        averageOperationalScore: 0.75,
        reasoningBudgetEfficiency: 0.6666666,
      },
    }),
    planningResult({
      plannedTasks: [
        { taskId: 10, startPlanned: "09:00", endPlanned: "09:30", assignedResources: [1] },
        { taskId: 20, startPlanned: "09:30", endPlanned: "10:00", assignedResources: [2] },
      ],
      warnings: [{ code: "SOFT_GAP", message: "Gap detected" }],
      insights: [{ code: "V4_TRACE", message: "Trace" }],
    }),
  );

  assert.deepEqual(report.differences.common, ["scenario:117"]);
  assert.ok(report.differences.onlyORC.includes("opportunities:3"));
  assert.ok(report.differences.onlyV4.includes("planned-task:10"));
  assert.equal(report.metrics.topRankAgreement, 1);
  assert.equal(report.metrics.reasoningCoverage, 0.666667);
});

test("validateRealScenario output is deterministic", () => {
  const inputBenchmark = benchmark({ opportunitiesDetected: 1, candidatesGenerated: 2 });
  const inputCalibration = calibration();
  const output = planningResult({ plannedTasks: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:10" }] });

  assert.equal(structuralEquals(
    validateRealScenario(inputBenchmark, inputCalibration, output),
    validateRealScenario(inputBenchmark, inputCalibration, output),
  ), true);
});

test("validateRealScenario preserves structural equality after JSON serialization", () => {
  const report = validateRealScenario(benchmark(), calibration(), planningResult());

  assert.equal(structuralEquals(JSON.parse(JSON.stringify(report)), report), true);
});

test("validateRealScenario does not mutate inputs", () => {
  const inputBenchmark = benchmark({ opportunitiesDetected: 1 });
  const inputCalibration = calibration();
  const output = planningResult({ unplanned: [{ taskId: 99, reason: { code: "OTHER", message: "No slot" } }] });
  const before = stableStringify({ inputBenchmark: clone(inputBenchmark), inputCalibration: clone(inputCalibration), output: clone(output) });

  validateRealScenario(inputBenchmark, inputCalibration, output);

  assert.equal(stableStringify({ inputBenchmark, inputCalibration, output }), before);
});

test("validateRealScenario report can be serialized to JSON", () => {
  const report = validateRealScenario(benchmark(), calibration(), planningResult());

  assert.doesNotThrow(() => JSON.stringify(report));
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});
