export type { OperationalMap } from "./operationalMap";
export { buildOperationalMap } from "./operationalMap";
export type { OpportunityDetectionOptions } from "./opportunityDetection";
export type { ORCOpportunityKind, OpportunityDetectionResult } from "../analysis/opportunityDetectionEngine";
export { buildOpportunityDetectionEvidence, detectOpportunitiesFromOperationalAnalysis, detectOpportunitiesFromOperationalMap, detectOpportunitiesWithPruning, detectOpportunitiesWithPruningFromOperationalAnalysis } from "./opportunityDetection";
export { opportunityPriorityValue } from "./opportunityPriority";
export type { SearchSpaceBuildOptions, SearchSpaceBuildResult, SearchSpaceBuilderResult } from "./searchSpaceBuilder";
export { buildSearchSpaces, buildSearchSpacesForOpportunities } from "./searchSpaceBuilder";
export type { CandidateBuilderResult } from "./candidateBuilder";
export type { CandidatePreselectionOptions, CandidatePreselectionResult, PreselectedCandidate } from "./candidatePreselectionEngine";
export { buildCandidates, buildCandidatesFromSearchSpaces } from "./candidateBuilder";
export { buildBaselinePreservationCandidate } from "./baselinePreservationCandidate";
export { preselectCandidates } from "./candidatePreselectionEngine";
export type { AdaptivePriorityResult } from "./adaptivePriority";
export { reprioritizeOpportunities } from "./adaptivePriority";

export type { AdaptiveSearchSpaceResult } from "./adaptiveSearchSpaceBuilder";
export { buildAdaptiveSearchSpaces } from "./adaptiveSearchSpaceBuilder";
export type { StrategyCandidateBuildOptions, StrategyCandidateResult } from "./strategyCandidateBuilder";
export { buildStrategyCandidates } from "./strategyCandidateBuilder";

export type { OpportunityDiagnosis, OpportunityDiagnosisResult } from "./opportunityDiagnosis";
export { diagnoseOpportunities } from "./opportunityDiagnosis";

export type { ClassifiedOpportunity, OpportunityClassification, OpportunityClassificationResult } from "../analysis/opportunityClassificationEngine";
export { classifyOpportunities } from "../analysis/opportunityClassificationEngine";
export type { OpportunityPrioritizationResult, PrioritizedOpportunity } from "../analysis/opportunityPrioritizationEngine";
export { prioritizeOpportunities } from "../analysis/opportunityPrioritizationEngine";

export type { DiscardedPartialPlanComposition, PartialPlanComposerOptions, PartialPlanComposerResult } from "./partialPlanComposer";
export { composePartialPlans } from "./partialPlanComposer";

export type { CandidateHardPrefilterOptions, CandidateHardPrefilterResult, CandidateHardPrefilterSummary, CandidateHardPrefilterDiscard } from "./candidateHardPrefilter";
export { prefilterCandidatesByHardConstraints } from "./candidateHardPrefilter";
