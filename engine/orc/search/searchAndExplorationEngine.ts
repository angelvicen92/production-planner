import type { AdaptiveSearchSpaceProfile, CognitiveState, Evidence, OperationalState, Opportunity, OpportunityPropagation, ReasoningBudgetProfile } from "../contracts";
import { createReasoningBudget, type ReasoningBudget } from "../cognitive/reasoningBudget";
import type { ImprovementOpportunityReport } from "../benchmark/improvementOpportunityAnalyzer";
import { calibrateReasoningBudgetProfilesFromImprovementReport, type ImprovementDrivenCalibrationResult } from "./improvementDrivenCalibration";
import type { DynamicBottleneckAnalysis } from "../analysis/dynamicBottleneckAnalyzer";
import { deepFreeze } from "../immutability";
import { applyDependencyChainFlowToReasoningBudgets, optimizeDependencyChainFlow, type DependencyChainFlowOptimizationResult } from "./dependencyChainFlowOptimizer";
import { calculateOperationalReasoningScores, operationalReasoningScoreBySubjectId, type OperationalReasoningScore } from "./operationalReasoningScore";
import { buildOperationalGoals, type OperationalGoal } from "./operationalGoalBuilder";
import { buildProgressiveCommitmentStrategy, type ProgressiveCommitmentDecision } from "./progressiveCommitmentStrategy";
import { understandOpportunityPropagation } from "../understanding/opportunityPropagation";
import {
  buildCriticalityDrivenReasoningBudgetEvidence,
  buildReasoningBudgetProfiles,
  understandOperationalCriticality,
  type OperationalCriticality,
  type ReasoningBudgetProfileConfig,
} from "../understanding/operationalCriticality";

export interface SearchAndExplorationUnderstanding {
  readonly operationalCriticality: OperationalCriticality;
  readonly reasoningBudgetProfiles: readonly ReasoningBudgetProfile[];
  readonly improvementDrivenCalibration: ImprovementDrivenCalibrationResult | null;
  readonly opportunityPropagation: readonly OpportunityPropagation[];
  readonly dependencyChainFlow: DependencyChainFlowOptimizationResult;
  readonly operationalReasoningScores: readonly OperationalReasoningScore[];
  readonly adaptiveSearchSpaceProfiles: readonly AdaptiveSearchSpaceProfile[];
  readonly operationalGoals: readonly OperationalGoal[];
  readonly progressiveCommitments: readonly ProgressiveCommitmentDecision[];
  readonly cognitiveState: CognitiveState | null;
  readonly evidence: readonly Evidence[];
  readonly informationalOnly: true;
}


const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

export function buildAdaptiveSearchSpaceProfiles(
  reasoningBudgetProfiles: readonly ReasoningBudgetProfile[],
  opportunityPropagation: readonly OpportunityPropagation[],
): readonly AdaptiveSearchSpaceProfile[] {
  const propagationByOpportunityId = new Map(opportunityPropagation.map((item) => [item.opportunityId, item]));
  return deepFreeze([...reasoningBudgetProfiles].sort((a, b) => a.opportunityId.localeCompare(b.opportunityId)).map((budgetProfile) => {
    const propagationScore = propagationByOpportunityId.get(budgetProfile.opportunityId)?.propagationScore ?? 0;
    const reasoningBudget = budgetProfile.explorationBudget;
    const expectedExplorationValue = round((budgetProfile.criticalityLevel * reasoningBudget) + propagationScore);
    const maxDepth = Math.max(1, budgetProfile.maxDepth + Math.floor(propagationScore * budgetProfile.criticalityLevel));
    const maxBreadth = Math.max(1, Math.min(budgetProfile.maxSearchSpaceSize + Math.ceil(propagationScore * reasoningBudget), reasoningBudget + budgetProfile.maxSearchSpaceSize));
    return {
      opportunityId: budgetProfile.opportunityId,
      criticalityLevel: budgetProfile.criticalityLevel,
      propagationScore,
      reasoningBudget,
      maxDepth,
      maxBreadth,
      expectedExplorationValue,
    };
  })) as readonly AdaptiveSearchSpaceProfile[];
}

export function buildAdaptiveSearchSpaceProfileEvidence(profiles: readonly AdaptiveSearchSpaceProfile[], createdAt: string | null = null): readonly Evidence[] {
  return profiles.map((profile) => deepFreeze({
    id: `evidence:orc-see:adaptive-search-space-profile:${profile.opportunityId}`,
    source: "orc-see",
    kind: "adaptive-search-space-profile",
    subjectId: profile.opportunityId,
    createdAt,
    data: { profile, reason: "Derived from OCM criticality, OPA propagation and criticality-driven reasoning budget.", deterministic: true, shadowModeOnly: true, readOnly: true },
  }) as Evidence);
}

export interface SearchAndExplorationBudgetOptions extends ReasoningBudgetProfileConfig {
  readonly opportunities?: readonly Opportunity[];
  readonly reasoningBudget?: ReasoningBudget;
  readonly dynamicBottleneckAnalysis?: DynamicBottleneckAnalysis | null;
  readonly improvementReport?: ImprovementOpportunityReport | null;
}

export function buildSearchAndExplorationUnderstanding(
  state: OperationalState,
  cognitiveState?: CognitiveState | null,
  createdAt: string | null = null,
  options: SearchAndExplorationBudgetOptions = {},
): SearchAndExplorationUnderstanding {
  const result = understandOperationalCriticality(state, cognitiveState, createdAt);
  const propagation = understandOpportunityPropagation(state, options.opportunities ?? state.cognitive?.opportunities ?? [], result.cognitiveState, createdAt, result.operationalCriticality);
  const reasoningBudget = options.reasoningBudget ?? cognitiveState?.reasoningBudget ?? createReasoningBudget();
  const reasoningBudgetProfiles = buildReasoningBudgetProfiles(
    state,
    options.opportunities ?? state.cognitive?.opportunities ?? [],
    result.operationalCriticality,
    { ...options, reasoningBudget },
  );
  const improvementDrivenCalibration = options.improvementReport === undefined ? null : calibrateReasoningBudgetProfilesFromImprovementReport(reasoningBudgetProfiles, options.improvementReport, reasoningBudget, createdAt);
  const dependencyChainFlow = optimizeDependencyChainFlow(state, options.opportunities ?? state.cognitive?.opportunities ?? [], createdAt);
  const calibratedReasoningBudgetProfiles = improvementDrivenCalibration?.calibratedProfiles ?? reasoningBudgetProfiles;
  const chainAdjustedReasoningBudgetProfiles = applyDependencyChainFlowToReasoningBudgets(calibratedReasoningBudgetProfiles, dependencyChainFlow.opportunityInfluences);
  const ors = calculateOperationalReasoningScores({
    opportunities: options.opportunities ?? state.cognitive?.opportunities ?? [],
    reasoningBudgetProfiles: chainAdjustedReasoningBudgetProfiles,
    opportunityPropagation: propagation.opportunityPropagation,
    dependencyChainInfluences: dependencyChainFlow.opportunityInfluences,
    dynamicBottleneckImpacts: options.dynamicBottleneckAnalysis?.opportunityImpacts ?? [],
    createdAt,
  });
  const operationalGoals = buildOperationalGoals({
    opportunities: options.opportunities ?? state.cognitive?.opportunities ?? [],
    operationalReasoningScores: ors.scores,
    dependencyChainInfluences: dependencyChainFlow.opportunityInfluences,
    createdAt,
  });
  const progressiveCommitment = buildProgressiveCommitmentStrategy({
    operationalReasoningScores: ors.scores,
    operationalGoals: operationalGoals.goals,
    dependencyChainInfluences: dependencyChainFlow.opportunityInfluences,
    createdAt,
  });
  const commitmentByOpportunityId = progressiveCommitment.decisionsBySubjectId;
  const orsByOpportunityId = operationalReasoningScoreBySubjectId(ors.scores);
  const effectiveReasoningBudgetProfiles = deepFreeze([...chainAdjustedReasoningBudgetProfiles].sort((a, b) => {
    const commitmentDelta = (commitmentByOpportunityId.get(b.opportunityId)?.commitmentScore ?? 0) - (commitmentByOpportunityId.get(a.opportunityId)?.commitmentScore ?? 0);
    const scoreDelta = (orsByOpportunityId.get(b.opportunityId)?.score ?? 0) - (orsByOpportunityId.get(a.opportunityId)?.score ?? 0);
    return commitmentDelta || scoreDelta || a.opportunityId.localeCompare(b.opportunityId);
  }).map((profile) => {
    const score = orsByOpportunityId.get(profile.opportunityId)?.score ?? 0;
    const extra = Math.ceil(score * 2);
    const commitment = commitmentByOpportunityId.get(profile.opportunityId);
    const stableExtra = commitment?.stableDuringSearch ? 1 : 0;
    return { ...profile, explorationBudget: profile.explorationBudget + extra + stableExtra, maxCandidates: profile.maxCandidates + extra, maxSearchSpaceSize: profile.maxSearchSpaceSize + extra, simulationBudget: profile.simulationBudget + extra, reason: `${profile.reason} ORS ${score} consolidates existing SEE reasoning signals.${commitment ? ` Progressive commitment ${commitment.commitmentScore} organizes exploration and remains reversible.` : ""}` };
  })) as readonly ReasoningBudgetProfile[];
  const adaptiveSearchSpaceProfiles = buildAdaptiveSearchSpaceProfiles(effectiveReasoningBudgetProfiles, propagation.opportunityPropagation);
  const budgetEvidence = buildCriticalityDrivenReasoningBudgetEvidence(state, effectiveReasoningBudgetProfiles, createdAt);
  const profileEvidence = buildAdaptiveSearchSpaceProfileEvidence(adaptiveSearchSpaceProfiles, createdAt);
  return deepFreeze({
    operationalCriticality: result.operationalCriticality,
    reasoningBudgetProfiles: effectiveReasoningBudgetProfiles,
    improvementDrivenCalibration,
    opportunityPropagation: propagation.opportunityPropagation,
    dependencyChainFlow,
    operationalReasoningScores: ors.scores,
    adaptiveSearchSpaceProfiles,
    operationalGoals: operationalGoals.goals,
    progressiveCommitments: progressiveCommitment.decisions,
    cognitiveState: propagation.cognitiveState,
    evidence: [...result.evidence, ...(options.dynamicBottleneckAnalysis?.evidence ?? []), ...budgetEvidence, ...propagation.evidence, ...dependencyChainFlow.evidence, ...ors.evidence, ...operationalGoals.evidence, ...progressiveCommitment.evidence, ...(improvementDrivenCalibration?.evidence ?? []), ...profileEvidence],
    informationalOnly: true,
  }) as SearchAndExplorationUnderstanding;
}
