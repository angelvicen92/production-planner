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
  | "explainability";

export type ImprovementComparison = "orcBetter" | "equal" | "orcWorse";
export type ImprovementPriority = "high" | "medium" | "low" | "none";

export interface ImprovementOpportunity {
  metric: OfficialOperationalMetric;
  category: ImprovementCategory;
  comparison: ImprovementComparison;
  orcValue: number | null | Record<string, number> | number[];
  v4Value: number | null | Record<string, number> | number[];
  absoluteDelta: number | null | Record<string, number> | number[];
  percentageDelta: number | null | Record<string, number> | number[];
  estimatedImpact: number;
  priority: ImprovementPriority;
  priorityExplanation: string;
  objectiveJustification: string;
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
]);

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const asRecord = (value: unknown): Record<string, number> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, number> : {};
const numericMagnitude = (value: unknown): number => {
  if (typeof value === "number") return Math.abs(value);
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + Math.abs(Number(item) || 0), 0);
  if (value && typeof value === "object") return Object.values(value as Record<string, number>).reduce((sum, item) => sum + Math.abs(Number(item) || 0), 0);
  return 0;
};
const metricValue = (metrics: OperationalDeltaMetrics, metric: OfficialOperationalMetric) => metrics[metric];

function compareMetric(metric: OfficialOperationalMetric, absoluteDelta: unknown): ImprovementComparison {
  const magnitude = numericMagnitude(absoluteDelta);
  if (magnitude === 0) return "equal";
  const signed = typeof absoluteDelta === "number" ? absoluteDelta : Array.isArray(absoluteDelta)
    ? absoluteDelta.reduce((sum, item) => sum + (Number(item) || 0), 0)
    : Object.values(asRecord(absoluteDelta)).reduce((sum, item) => sum + (Number(item) || 0), 0);
  const lowerIsBetter = LOWER_IS_BETTER.has(metric);
  return lowerIsBetter ? (signed < 0 ? "orcBetter" : "orcWorse") : (signed > 0 ? "orcBetter" : "orcWorse");
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
    return {
      metric,
      category: CATEGORY_BY_METRIC[metric],
      comparison,
      orcValue: metricValue(report.metrics.orc, metric),
      v4Value: metricValue(report.metrics.v4, metric),
      absoluteDelta: abs,
      percentageDelta: pct,
      estimatedImpact: impact,
      priority,
      priorityExplanation: priority === "none" ? `${metric}: no improvement priority because ORC is ${comparison}.` : `${metric}: ${priority} priority because ORC is worse and objective impact is ${impact}.`,
      objectiveJustification: `${metric}: classified using official delta metrics only; ${direction}; absolute and percentage deltas are ORC minus V4.`,
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
      priorityExplanations: opportunities.map((item) => item.priorityExplanation),
      objectiveJustification: opportunities.map((item) => item.objectiveJustification),
    },
    planningInfluence: IMPROVEMENT_REPORT_PLANNING_INFLUENCE,
  };
}
