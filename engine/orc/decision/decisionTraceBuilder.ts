import type { Evidence } from "../contracts";
import { deepFreeze } from "../immutability";
import type { DecisionPipelineResult } from "./decisionPipelineOrchestrator";

export interface DecisionTrace {
  decisionId: string;

  stages: {
    transformation: Evidence[];
    simulation: Evidence[];
    validation: Evidence[];
    evaluation: Evidence[];
    ranking: Evidence[];
    commit: Evidence[];
  };

  summary: Evidence[];

  generatedAt: string | null;
}

function evidenceList(evidence: ReadonlyArray<Evidence> | undefined): Evidence[] {
  return [...(evidence ?? [])];
}

function firstCreatedAt(evidence: ReadonlyArray<Evidence>): string | null {
  return evidence.find((item) => item.createdAt != null)?.createdAt ?? null;
}

function decisionIdFor(pipeline: DecisionPipelineResult): string {
  const subjectId = pipeline.evidence.find((item) => item.subjectId != null)?.subjectId;
  return `decision:${subjectId == null ? "unknown" : String(subjectId)}`;
}

export function buildDecisionTrace(
  pipeline: DecisionPipelineResult,
): DecisionTrace {
  const summary = evidenceList(pipeline.evidence);

  return deepFreeze({
    decisionId: decisionIdFor(pipeline),
    stages: {
      transformation: evidenceList(pipeline.transformation.evidence),
      simulation: evidenceList(pipeline.simulation.evidence),
      validation: evidenceList(pipeline.validation.evidence),
      evaluation: evidenceList(pipeline.evaluation.evidence),
      ranking: evidenceList(pipeline.ranking.evidence),
      commit: evidenceList(pipeline.commit.evidence),
    },
    summary,
    generatedAt: firstCreatedAt(summary),
  }) as DecisionTrace;
}
