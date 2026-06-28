import type { Evidence, ReasoningBudgetProfile } from "../contracts";
import type { ReasoningBudget } from "../cognitive/reasoningBudget";
import type { ImprovementOpportunityReport, ImprovementPriority } from "../benchmark/improvementOpportunityAnalyzer";
import { deepFreeze } from "../immutability";

export const IMPROVEMENT_DRIVEN_SEARCH_CALIBRATION_VERSION = "ORC-IMPROVEMENT-DRIVEN-SEARCH-CALIBRATION-V1";

export interface ImprovementDrivenCalibrationResult {
  readonly calibrationVersion: typeof IMPROVEMENT_DRIVEN_SEARCH_CALIBRATION_VERSION;
  readonly originalProfiles: readonly ReasoningBudgetProfile[];
  readonly calibratedProfiles: readonly ReasoningBudgetProfile[];
  readonly secondaryExplorationOrder: readonly string[];
  readonly reason: string;
  readonly evidence: readonly Evidence[];
  readonly deterministic: true;
  readonly shadowModeOnly: true;
  readonly planningInfluence: "none";
}

const PRIORITY_RANK: Record<ImprovementPriority, number> = { none: 0, low: 1, medium: 2, high: 3 };

const activePriorityRank = (report: ImprovementOpportunityReport | null | undefined): number => {
  if (!report) return 0;
  return Math.max(0, ...report.opportunities.map((item) => PRIORITY_RANK[item.priority] ?? 0));
};

const priorityEvidence = (report: ImprovementOpportunityReport | null | undefined): readonly string[] => {
  if (!report) return [];
  return report.opportunities
    .filter((item) => item.priority !== "none")
    .sort((a, b) => (PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]) || b.estimatedImpact - a.estimatedImpact || a.metric.localeCompare(b.metric))
    .map((item) => `${item.metric}:${item.priority}:${item.estimatedImpact}`);
};

const cloneProfile = (profile: ReasoningBudgetProfile): ReasoningBudgetProfile => ({ ...profile });

const calibrateProfile = (profile: ReasoningBudgetProfile, priorityRank: number, budget: ReasoningBudget): ReasoningBudgetProfile => {
  if (priorityRank <= 0) return cloneProfile(profile);
  const depthIncrement = priorityRank >= 3 ? 2 : 1;
  const breadthIncrement = priorityRank;
  const opportunityIncrement = Math.max(1, priorityRank - 1);
  return {
    ...profile,
    explorationBudget: Math.max(1, Math.min(budget.maxSearchSpaces, profile.explorationBudget + opportunityIncrement)),
    maxDepth: Math.max(1, Math.min(budget.maxSearchSpaces, profile.maxDepth + depthIncrement)),
    maxSearchSpaceSize: Math.max(1, Math.min(budget.maxSearchSpaces, profile.maxSearchSpaceSize + breadthIncrement)),
    reason: `${profile.reason}-improvement-calibrated-priority-rank-${priorityRank}`,
  };
};

export function calibrateReasoningBudgetProfilesFromImprovementReport(
  profiles: readonly ReasoningBudgetProfile[],
  improvementReport: ImprovementOpportunityReport | null | undefined,
  budget: ReasoningBudget,
  createdAt: string | null = null,
): ImprovementDrivenCalibrationResult {
  const originalProfiles = profiles.map(cloneProfile).sort((a, b) => a.opportunityId.localeCompare(b.opportunityId));
  const priorityRank = activePriorityRank(improvementReport);
  const evidenceUsed = priorityEvidence(improvementReport);
  const calibratedProfiles = originalProfiles.map((profile) => calibrateProfile(profile, priorityRank, budget));
  const secondaryExplorationOrder = [...calibratedProfiles]
    .sort((a, b) => b.explorationBudget - a.explorationBudget || b.maxDepth - a.maxDepth || b.maxSearchSpaceSize - a.maxSearchSpaceSize || a.opportunityId.localeCompare(b.opportunityId))
    .map((profile) => profile.opportunityId);
  const reason = priorityRank <= 0
    ? "No improvement priority detected; original SEE parameters are preserved."
    : `Improvement Report contains priority rank ${priorityRank}; SEE exploration effort is calibrated within the current reasoning budget limits.`;
  const evidence: Evidence[] = [deepFreeze({
    id: "evidence:orc-see:improvement-driven-search-calibration",
    source: "orc-see",
    kind: "improvement-driven-search-calibration",
    createdAt,
    data: {
      calibrationVersion: IMPROVEMENT_DRIVEN_SEARCH_CALIBRATION_VERSION,
      originalProfiles,
      calibratedProfiles,
      secondaryExplorationOrder,
      reason,
      evidenceUsed,
      analyzerVersion: improvementReport?.analyzerVersion ?? null,
      reportGeneratedAt: improvementReport?.generatedAt ?? null,
      planningInfluence: "none",
      deterministic: true,
      shadowModeOnly: true,
      readOnly: true,
    },
  }) as Evidence];
  return deepFreeze({
    calibrationVersion: IMPROVEMENT_DRIVEN_SEARCH_CALIBRATION_VERSION,
    originalProfiles,
    calibratedProfiles,
    secondaryExplorationOrder,
    reason,
    evidence,
    deterministic: true,
    shadowModeOnly: true,
    planningInfluence: "none",
  }) as ImprovementDrivenCalibrationResult;
}
