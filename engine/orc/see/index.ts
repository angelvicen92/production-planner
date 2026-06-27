export type { OperationalMap } from "./operationalMap";
export { buildOperationalMap } from "./operationalMap";
export type { OpportunityDetectionOptions } from "./opportunityDetection";
export type { ORCOpportunityKind, OpportunityDetectionResult } from "../analysis/opportunityDetectionEngine";
export { buildOpportunityDetectionEvidence, detectOpportunitiesFromOperationalAnalysis, detectOpportunitiesFromOperationalMap, detectOpportunitiesWithPruning, detectOpportunitiesWithPruningFromOperationalAnalysis } from "./opportunityDetection";
export { opportunityPriorityValue } from "./opportunityPriority";
export type { SearchSpaceBuildOptions, SearchSpaceBuildResult } from "./searchSpaceBuilder";
export { buildSearchSpacesForOpportunities } from "./searchSpaceBuilder";
export type { CandidateBuilderOptions, CandidateBuilderResult } from "./candidateBuilder";
export { buildCandidatesFromSearchSpaces } from "./candidateBuilder";
export type { AdaptivePriorityResult } from "./adaptivePriority";
export { reprioritizeOpportunities } from "./adaptivePriority";

export type { AdaptiveSearchSpaceResult } from "./adaptiveSearchSpaceBuilder";
export { buildAdaptiveSearchSpaces } from "./adaptiveSearchSpaceBuilder";
export type { StrategyCandidateResult } from "./strategyCandidateBuilder";
export { buildStrategyCandidates } from "./strategyCandidateBuilder";

export type { OpportunityDiagnosis, OpportunityDiagnosisResult } from "./opportunityDiagnosis";
export { diagnoseOpportunities } from "./opportunityDiagnosis";

export type { ClassifiedOpportunity, OpportunityClassification, OpportunityClassificationResult } from "../analysis/opportunityClassificationEngine";
export { classifyOpportunities } from "../analysis/opportunityClassificationEngine";
export type { OpportunityPrioritizationResult, PrioritizedOpportunity } from "../analysis/opportunityPrioritizationEngine";
export { prioritizeOpportunities } from "../analysis/opportunityPrioritizationEngine";
