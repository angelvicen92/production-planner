import type { OfficialOperationalMetric, OperationalDeltaMetrics, OperationalDeltaReport } from "./operationalDeltaBenchmark";

export const IMPROVEMENT_OPPORTUNITY_ANALYZER_VERSION = "ORC-IMPROVEMENT-OPPORTUNITY-ANALYZER-V1";
export const IMPROVEMENT_REPORT_PLANNING_INFLUENCE = "none" as const;

export type ImprovementCategory =
  | "continuity"
  | "makespan"
  | "permanence"
  | "resourceUtilization"
  | "conflicts"
  | "performance"
  | "computationalCost"
  | "robustness"
  | "explainability"
  | "operationalQuality";

export type ImprovementComparison = "orcBetter" | "equal" | "orcWorse";
export type ImprovementPriority = "high" | "medium" | "low" | "none";

export interface ImprovementOpportunity {
  metric: OfficialOperationalMetric;
  category: ImprovementCategory;
  comparison: ImprovementComparison;
  orcValue: unknown;
  v4Value: unknown;
  absoluteDelta: unknown;
  percentageDelta: unknown;
  estimatedImpact: number;
  priority: ImprovementPriority;
  priorityExplanation: string;
  objectiveJustification: string;
  rootCauseReferences: string[];
  benchmarkVersion: OperationalDeltaReport["benchmarkVersion"];
  scenario: OperationalDeltaReport["scenario"];
  operationalImpact: number;
  frequency: number;
  expectedCost: "low" | "medium" | "high";
  optimizationPriority: ImprovementPriority;
}

export interface ImprovementOpportunityReport {
  analyzerVersion: typeof IMPROVEMENT_OPPORTUNITY_ANALYZER_VERSION;
  benchmarkVersion: OperationalDeltaReport["benchmarkVersion"];
  generatedAt: string | null;
  scenario: OperationalDeltaReport["scenario"];
  summary: {
    orcBetter: OfficialOperationalMetric[];
    equal: OfficialOperationalMetric[];
    orcWorse: OfficialOperationalMetric[];
    highPriority: OfficialOperationalMetric[];
    mediumPriority: OfficialOperationalMetric[];
    lowPriority: OfficialOperationalMetric[];
  };
  opportunities: ImprovementOpportunity[];
  evidence: {
    metricsAnalyzed: OfficialOperationalMetric[];
    differencesDetected: string[];
    priorityExplanations: string[];
    objectiveJustification: string[];
    evidenceGateReadiness: string[];
  };
  planningInfluence: typeof IMPROVEMENT_REPORT_PLANNING_INFLUENCE;
}

const METRICS: OfficialOperationalMetric[] = [
  "makespan",
  "totalPermanence",
  "permanenceByTalent",
  "mainFlowContinuity",
  "resourceUtilization",
  "conflicts",
  "simulations",
  "candidatesGenerated",
  "candidatesSimulated",
  "candidatesConsolidated",
  "totalTime",
  "timeByIteration",
  "dependencyChainsProtected",
  "dependencyBlockagesAvoided",
  "dependencyAverageSlackRecovered",
  "dependencyCriticalityOperationalValueCorrelation",
  "operationalPlanningQuality",
];

const CATEGORY_BY_METRIC: Record<OfficialOperationalMetric, ImprovementCategory> = {
  makespan: "makespan",
  totalPermanence: "permanence",
  permanenceByTalent: "permanence",
  mainFlowContinuity: "continuity",
  resourceUtilization: "resourceUtilization",
  conflicts: "conflicts",
  simulations: "computationalCost",
  candidatesGenerated: "performance",
  candidatesSimulated: "performance",
  candidatesConsolidated: "robustness",
  totalTime: "computationalCost",
  timeByIteration: "computationalCost",
  dependencyChainsProtected: "robustness",
  dependencyBlockagesAvoided: "robustness",
  dependencyAverageSlackRecovered: "continuity",
  dependencyCriticalityOperationalValueCorrelation: "continuity",
  operationalPlanningQuality: "operationalQuality",
};

const LOWER_IS_BETTER = new Set<OfficialOperationalMetric>([
  "makespan",
  "totalPermanence",
  "permanenceByTalent",
  "mainFlowContinuity",
  "conflicts",
  "simulations",
  "candidatesGenerated",
  "candidatesSimulated",
  "totalTime",
  "timeByIteration",
  "operationalPlanningQuality",
]);

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const asRecord = (value: unknown): Record<string, number> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, number> : {};
const numericMagnitude = (value: unknown): number => {
  if (typeof value === "number") return Math.abs(value);
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + numericMagnitude(item), 0);
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).reduce<number>((sum, [key, item]) => key === "rootCauseAnalysis" ? sum : sum + numericMagnitude(item), 0);
  return 0;
};
const signedMagnitude = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + signedMagnitude(item), 0);
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).reduce<number>((sum, [key, item]) => key === "rootCauseAnalysis" ? sum : sum + signedMagnitude(item), 0);
  return 0;
};
const metricValue = (metrics: OperationalDeltaMetrics, metric: OfficialOperationalMetric) => metrics[metric];
const opportunityMetricValue = (metrics: OperationalDeltaMetrics, metric: OfficialOperationalMetric): unknown => {
  const value = metricValue(metrics, metric);
  if (metric !== "operationalPlanningQuality" || !value || typeof value !== "object") return value;
  const opq = value as Record<string, unknown>;
  return { ...opq, rootCauseAnalysis: null };
};

function compareMetric(metric: OfficialOperationalMetric, absoluteDelta: unknown): ImprovementComparison {
  const magnitude = numericMagnitude(absoluteDelta);
  if (magnitude === 0) return "equal";
  const signed = signedMagnitude(absoluteDelta);
  const lowerIsBetter = LOWER_IS_BETTER.has(metric);
  return lowerIsBetter ? (signed < 0 ? "orcBetter" : "orcWorse") : (signed > 0 ? "orcBetter" : "orcWorse");
}

function expectedCostFor(metric: OfficialOperationalMetric): "low" | "medium" | "high" {
  if (metric === "totalTime" || metric === "timeByIteration" || metric === "simulations") return "low";
  if (metric === "candidatesGenerated" || metric === "candidatesSimulated" || metric === "candidatesConsolidated") return "medium";
  return "high";
}

function priorityFor(comparison: ImprovementComparison, impact: number): ImprovementPriority {
  if (comparison !== "orcWorse") return "none";
  if (impact >= 25) return "high";
  if (impact >= 10) return "medium";
  return "low";
}

export function analyzeImprovementOpportunities(report: OperationalDeltaReport): ImprovementOpportunityReport {
  const opportunities = METRICS.map((metric): ImprovementOpportunity => {
    const abs = metricValue(report.absoluteDelta, metric);
    const pct = metricValue(report.percentageDelta, metric);
    const comparison = compareMetric(metric, abs);
    const impact = round(Math.max(numericMagnitude(abs), numericMagnitude(pct)));
    const priority = priorityFor(comparison, impact);
    const direction = LOWER_IS_BETTER.has(metric) ? "lower values are objectively better" : "higher values are objectively better";
    const rootCauseReferences = metric === "operationalPlanningQuality"
      ? (report.metrics.orc.operationalPlanningQuality?.rootCauseAnalysis?.diagnoses ?? []).filter((item) => item.severity !== "none").map((item) => `${item.metric} -> ${item.entities.join(" -> ") || "no entity"} -> ${item.explanation}`)
      : [];
    return {
      metric,
      category: CATEGORY_BY_METRIC[metric],
      comparison,
      orcValue: opportunityMetricValue(report.metrics.orc, metric),
      v4Value: opportunityMetricValue(report.metrics.v4, metric),
      absoluteDelta: metric === "operationalPlanningQuality" ? opportunityMetricValue(report.absoluteDelta, metric) : abs,
      percentageDelta: metric === "operationalPlanningQuality" ? opportunityMetricValue(report.percentageDelta, metric) : pct,
      estimatedImpact: impact,
      priority,
      priorityExplanation: priority === "none" ? `${metric}: no improvement priority because ORC is ${comparison}.` : `${metric}: ${priority} priority because ORC is worse and objective impact is ${impact}.`,
      objectiveJustification: `${metric}: classified using official delta metrics only; ${direction}; absolute and percentage deltas are ORC minus V4.${rootCauseReferences.length > 0 ? ` Root cause evidence: ${rootCauseReferences[0]}` : ""}`,
      rootCauseReferences,
      benchmarkVersion: report.benchmarkVersion,
      scenario: report.scenario,
      operationalImpact: impact,
      frequency: comparison === "equal" ? 0 : 1,
      expectedCost: expectedCostFor(metric),
      optimizationPriority: priority,
    };
  });
  const byComparison = (comparison: ImprovementComparison) => opportunities.filter((item) => item.comparison === comparison).map((item) => item.metric);
  const byPriority = (priority: ImprovementPriority) => opportunities.filter((item) => item.priority === priority).map((item) => item.metric);
  const differencesDetected = opportunities.filter((item) => item.comparison !== "equal").map((item) => `${item.metric}: ${item.comparison} (impact ${item.estimatedImpact})`);
  return {
    analyzerVersion: IMPROVEMENT_OPPORTUNITY_ANALYZER_VERSION,
    benchmarkVersion: report.benchmarkVersion,
    generatedAt: report.generatedAt,
    scenario: report.scenario,
    summary: {
      orcBetter: byComparison("orcBetter"),
      equal: byComparison("equal"),
      orcWorse: byComparison("orcWorse"),
      highPriority: byPriority("high"),
      mediumPriority: byPriority("medium"),
      lowPriority: byPriority("low"),
    },
    opportunities,
    evidence: {
      metricsAnalyzed: [...METRICS],
      differencesDetected,
      priorityExplanations: opportunities.map((item) => item.rootCauseReferences.length === 0 ? item.priorityExplanation : `${item.priorityExplanation} Root causes: ${item.rootCauseReferences.join(" | ")}`),
      objectiveJustification: opportunities.map((item) => item.objectiveJustification),
      evidenceGateReadiness: opportunities.map((item) => `${item.metric}: benchmark ${item.benchmarkVersion} / plan ${item.scenario.planId} provides reproducible absolute and percentage delta metrics.`),
    },
    planningInfluence: IMPROVEMENT_REPORT_PLANNING_INFLUENCE,
  };
}
