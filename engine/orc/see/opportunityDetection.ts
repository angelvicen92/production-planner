import type { OperationalAnalysis } from "../analysis/operationalStateAnalyzer";
import { analyzeOperationalState } from "../analysis/operationalStateAnalyzer";
import { detectOpportunities, type ORCOpportunityKind } from "../analysis/opportunityDetectionEngine";
import type { CognitiveState, Evidence, OperationalState, Opportunity } from "../contracts";
import { shouldSkipOpportunity } from "../cognitive/cognitiveFeedback";
import { pruneRepeatedOpportunities, type CognitivePruningStats } from "../cognitive/cognitivePruning";
import type { OperationalMap } from "./operationalMap";

export type { ORCOpportunityKind };

export interface OpportunityDetectionOptions {
  cognitiveState?: CognitiveState;
}

export function detectOpportunitiesFromOperationalAnalysis(_state: OperationalState, analysis: OperationalAnalysis, options: OpportunityDetectionOptions = {}): Opportunity[] {
  const opportunities = detectOpportunities(analysis, analysis.criticalBottleneckAnalysis).opportunities;
  return options.cognitiveState ? pruneRepeatedOpportunities(options.cognitiveState, opportunities).items : opportunities;
}

export function detectOpportunitiesFromOperationalMap(state: OperationalState, _map: OperationalMap, options: OpportunityDetectionOptions = {}): Opportunity[] {
  return detectOpportunitiesFromOperationalAnalysis(state, analyzeOperationalState(state), options);
}

export function detectOpportunitiesWithPruningFromOperationalAnalysis(state: OperationalState, analysis: OperationalAnalysis, options: OpportunityDetectionOptions = {}): { opportunities: Opportunity[]; pruning: CognitivePruningStats } {
  const unpruned = detectOpportunitiesFromOperationalAnalysis(state, analysis);
  const result = options.cognitiveState ? pruneRepeatedOpportunities(options.cognitiveState, unpruned) : { items: unpruned, stats: { generatedCount: unpruned.length, keptCount: unpruned.length, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] } };
  return { opportunities: result.items, pruning: result.stats };
}

export function detectOpportunitiesWithPruning(state: OperationalState, _map: OperationalMap, options: OpportunityDetectionOptions = {}): { opportunities: Opportunity[]; pruning: CognitivePruningStats } {
  return detectOpportunitiesWithPruningFromOperationalAnalysis(state, analyzeOperationalState(state), options);
}

export function buildOpportunityDetectionEvidence(state: OperationalState, map: OperationalMap, opportunities: Opportunity[], createdAt: string | null = null, cognitiveState?: CognitiveState): Evidence[] {
  return [{
    id: `evidence:orc-see:opportunity-detection:${state.id}`,
    source: "orc-see",
    kind: "opportunity-detection",
    subjectId: state.id,
    createdAt,
    data: {
      stateId: state.id,
      mapSummary: { taskCount: map.taskCount, plannedTaskCount: map.plannedTaskCount, pendingTaskCount: map.pendingTaskCount, lockCount: map.lockCount, mainFlowGapCount: map.mainFlow?.gapCount ?? 0, totalSpaceSwitches: map.fragmentation.totalSpaceSwitches },
      opportunityIds: opportunities.map((opportunity) => opportunity.id),
      opportunityKinds: opportunities.map((opportunity) => opportunity.kind),
      bottleneckOpportunityLinks: opportunities.map((opportunity) => ({
        opportunityId: opportunity.id,
        opportunityKind: opportunity.kind,
        bottleneckIds: opportunity.metadata.bottleneckIds ?? [],
        derivedFromCriticalBottleneck: opportunity.metadata.derivedFromCriticalBottleneck ?? false,
      })),
      priority: opportunities.map((opportunity) => ({ id: opportunity.id, priority: opportunity.metadata.priority ?? null })),
      cognitiveFeedback: {
        repeatedOpportunityIds: cognitiveState ? opportunities.filter((opportunity) => shouldSkipOpportunity(cognitiveState, opportunity)).map((opportunity) => opportunity.id) : [],
        potentialOmittableCount: cognitiveState ? opportunities.filter((opportunity) => shouldSkipOpportunity(cognitiveState, opportunity)).length : 0,
        observationalOnly: true,
      },
    },
  }];
}
