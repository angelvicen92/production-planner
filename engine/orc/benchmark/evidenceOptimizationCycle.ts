import { stableStringify } from "../structuralEquality";
import { analyzeImprovementOpportunities, type ImprovementOpportunity, type ImprovementOpportunityReport } from "./improvementOpportunityAnalyzer";
import { type OperationalDeltaReport } from "./operationalDeltaBenchmark";
import { runProductionScenarioBenchmarkSuite, type ProductionScenarioBenchmarkSuiteOptions, type ProductionScenarioBenchmarkSuiteReport } from "./scenarioSuite";

export const EVIDENCE_OPTIMIZATION_CYCLE_VERSION = "ORC-EVIDENCE-OPTIMIZATION-CYCLE-V1";
export const EVIDENCE_OPTIMIZATION_PLANNING_INFLUENCE = "none" as const;

export type OptimizationPriorityLevel = "high" | "medium" | "low";

export interface ActiveOptimizationPriority {
  id: string;
  metric: ImprovementOpportunity["metric"];
  category: ImprovementOpportunity["category"];
  priority: OptimizationPriorityLevel;
  operationalImpact: number;
  frequency: number;
  expectedCost: ImprovementOpportunity["expectedCost"];
  benchmarkEvidence: Array<{
    benchmarkVersion: OperationalDeltaReport["benchmarkVersion"];
    scenario: OperationalDeltaReport["scenario"];
    comparison: ImprovementOpportunity["comparison"];
    absoluteDelta: ImprovementOpportunity["absoluteDelta"];
    percentageDelta: ImprovementOpportunity["percentageDelta"];
    priorityExplanation: string;
    objectiveJustification: string;
  }>;
  explanation: string;
}

export interface EvidenceOptimizationReport {
  cycleVersion: typeof EVIDENCE_OPTIMIZATION_CYCLE_VERSION;
  generatedAt: string | null;
  benchmarkUsed: {
    suiteVersion: ProductionScenarioBenchmarkSuiteReport["suiteVersion"] | null;
    benchmarkVersions: OperationalDeltaReport["benchmarkVersion"][];
    scenarioCount: number;
    passedCount: number;
    failedCount: number;
  };
  operationalDelta: {
    differencesDetected: string[];
    reportsAnalyzed: number;
  };
  improvementReports: ImprovementOpportunityReport[];
  optimizationPriorities: ActiveOptimizationPriority[];
  evidence: {
    officialMetricsOnly: true;
    planningUnchanged: boolean;
    inputUnchanged: boolean;
    explanations: string[];
  };
  planningInfluence: typeof EVIDENCE_OPTIMIZATION_PLANNING_INFLUENCE;
}

export interface EvidenceOptimizationCycleOptions extends ProductionScenarioBenchmarkSuiteOptions {
  suiteReport?: ProductionScenarioBenchmarkSuiteReport;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const priorityWeight = (priority: ImprovementOpportunity["optimizationPriority"]): number => priority === "high" ? 3 : priority === "medium" ? 2 : priority === "low" ? 1 : 0;
const costWeight = (cost: ImprovementOpportunity["expectedCost"]): number => cost === "low" ? 3 : cost === "medium" ? 2 : cost === "high" ? 1 : 0;
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

function priorityId(metric: ImprovementOpportunity["metric"], priority: OptimizationPriorityLevel): string {
  return `optimization:${priority}:${metric}`;
}

function aggregatePriorities(reports: ImprovementOpportunityReport[]): ActiveOptimizationPriority[] {
  const grouped = new Map<ImprovementOpportunity["metric"], ImprovementOpportunity[]>();
  for (const report of reports) {
    for (const opportunity of report.opportunities) {
      if (opportunity.optimizationPriority === "none") continue;
      if (opportunity.objectiveJustification.includes("baseline_seed_hard_infeasible_blocks_candidate_optimization") && (opportunity.metric === "candidatesGenerated" || opportunity.metric === "candidatesSimulated" || opportunity.metric === "candidatesConsolidated" || opportunity.metric === "simulations")) continue;
      grouped.set(opportunity.metric, [...(grouped.get(opportunity.metric) ?? []), opportunity]);
    }
  }

  return [...grouped.entries()].map(([metric, opportunities]) => {
    const sorted = [...opportunities].sort((a, b) => priorityWeight(b.optimizationPriority) - priorityWeight(a.optimizationPriority) || b.operationalImpact - a.operationalImpact || costWeight(b.expectedCost) - costWeight(a.expectedCost));
    const top = sorted[0];
    const frequency = opportunities.length;
    const operationalImpact = round(opportunities.reduce((sum, item) => sum + item.operationalImpact, 0) / frequency);
    const priority = (top.optimizationPriority === "none" ? "low" : top.optimizationPriority) as OptimizationPriorityLevel;
    const benchmarkEvidence = opportunities.map((item) => ({
      benchmarkVersion: item.benchmarkVersion,
      scenario: item.scenario,
      comparison: item.comparison,
      absoluteDelta: item.absoluteDelta,
      percentageDelta: item.percentageDelta,
      priorityExplanation: item.priorityExplanation,
      objectiveJustification: item.objectiveJustification,
    })).sort((a, b) => a.scenario.planId - b.scenario.planId || a.scenario.taskCount - b.scenario.taskCount || stableStringify(a.absoluteDelta).localeCompare(stableStringify(b.absoluteDelta)));
    return {
      id: priorityId(metric, priority),
      metric,
      category: top.category,
      priority,
      operationalImpact,
      frequency,
      expectedCost: top.expectedCost,
      benchmarkEvidence,
      explanation: `${metric}: ${priority} optimization priority from ${frequency} benchmark occurrence(s), average operational impact ${operationalImpact}, expected cost ${top.expectedCost}.`,
    };
  }).sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || b.frequency - a.frequency || b.operationalImpact - a.operationalImpact || a.metric.localeCompare(b.metric));
}

export function buildEvidenceOptimizationReport(suiteReport: ProductionScenarioBenchmarkSuiteReport): EvidenceOptimizationReport {
  const safeSuite = clone(suiteReport);
  const reports = safeSuite.results.map((result) => result.report).filter((report): report is OperationalDeltaReport => report !== null);
  const improvementReports = reports.map((report) => analyzeImprovementOpportunities(report));
  const differencesDetected = improvementReports.flatMap((report) => report.evidence.differencesDetected.map((difference) => `plan ${report.scenario.planId}: ${difference}`)).sort();
  return {
    cycleVersion: EVIDENCE_OPTIMIZATION_CYCLE_VERSION,
    generatedAt: safeSuite.generatedAt,
    benchmarkUsed: {
      suiteVersion: safeSuite.suiteVersion,
      benchmarkVersions: [...new Set(reports.map((report) => report.benchmarkVersion))].sort(),
      scenarioCount: safeSuite.scenarioCount,
      passedCount: safeSuite.passedCount,
      failedCount: safeSuite.failedCount,
    },
    operationalDelta: {
      differencesDetected,
      reportsAnalyzed: reports.length,
    },
    improvementReports,
    optimizationPriorities: aggregatePriorities(improvementReports),
    evidence: {
      officialMetricsOnly: true,
      planningUnchanged: reports.every((report) => report.planningUnchanged),
      inputUnchanged: safeSuite.results.every((result) => result.inputUnchanged),
      explanations: [
        "Evidence Optimization Cycle is Benchmark → Operational Delta → Improvement Report → Optimization Priorities → Evidence Optimization Report.",
        "Optimization priorities are derived only from existing official benchmark metrics and improvement reports.",
        "This cycle is read-only and has no influence on V4 or ORC planning behavior.",
      ],
    },
    planningInfluence: EVIDENCE_OPTIMIZATION_PLANNING_INFLUENCE,
  };
}

export function runEvidenceOptimizationCycle(options: EvidenceOptimizationCycleOptions = {}): EvidenceOptimizationReport {
  const suiteReport = options.suiteReport ?? runProductionScenarioBenchmarkSuite(options);
  return buildEvidenceOptimizationReport(suiteReport);
}
