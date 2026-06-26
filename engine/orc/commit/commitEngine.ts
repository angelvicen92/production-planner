import type { CommitDecision, Evidence, OperationalValue } from "../contracts";
import { deepFreeze } from "../immutability";
import { rankOperationalValues } from "../decision/rankingEngine";

export interface CommitEngineOptions {
  createdAt?: string | null;
}

export interface CommitEngineResult {
  commitDecisions: CommitDecision[];
  evidence: Evidence[];
  summary: {
    evaluatedCount: number;
    commitCount: number;
    rejectCount: number;
  };
}

const COMMIT_ENGINE_SOURCE = "orc-commit-engine";
const BASELINE_COMMIT_REASON = "OperationalValue is present and structurally eligible for shadow-mode logical commit.";
const BASELINE_REJECT_REASON = "OperationalValue is missing and cannot produce a logical commit decision.";

function operationalValueId(operationalValue: OperationalValue, index: number): string {
  return operationalValue.simulatedStateId || `missing-operational-value:${index}`;
}

function buildDecision(
  operationalValue: OperationalValue | null | undefined,
  index: number,
  evidenceId: string,
  createdAt: string | null,
): CommitDecision {
  const id = operationalValue == null ? null : operationalValueId(operationalValue, index);
  const hasOperationalValue = operationalValue != null;

  return deepFreeze({
    decision: hasOperationalValue ? "COMMIT" : "REJECT",
    operationalValueId: id,
    reason: hasOperationalValue ? BASELINE_COMMIT_REASON : BASELINE_REJECT_REASON,
    differences: [],
    evidenceId,
    createdAt,
  }) as CommitDecision;
}

function buildEvidence(
  operationalValue: OperationalValue | null | undefined,
  decision: CommitDecision,
  evidenceId: string,
  createdAt: string | null,
): Evidence {
  return deepFreeze({
    id: evidenceId,
    source: COMMIT_ENGINE_SOURCE,
    kind: "operational-value-commit-decision-built",
    subjectId: decision.operationalValueId,
    createdAt,
    data: {
      operationalValue: operationalValue ?? null,
      commitDecision: decision,
      reason: decision.reason,
      decision: decision.decision,
      operationalValueId: decision.operationalValueId,
      readOnly: true,
      mutatesOperationalState: false,
      commitsPlanning: false,
      replacesPlanning: false,
    },
  }) as Evidence;
}

export function buildCommitDecisions(
  operationalValues: OperationalValue[],
  options: CommitEngineOptions = {},
): CommitEngineResult {
  const createdAt = options.createdAt ?? null;
  const commitDecisions: CommitDecision[] = [];
  const evidence: Evidence[] = [];
  let commitCount = 0;
  let rejectCount = 0;

  const rankingResult = rankOperationalValues(operationalValues ?? [], { createdAt });

  for (const [index, operationalValue] of rankingResult.rankedOperationalValues.entries()) {
    const valueId = operationalValueId(operationalValue, index);
    const evidenceId = `evidence:orc-commit-engine:operational-value:${valueId}`;
    const decision = buildDecision(operationalValue, index, evidenceId, createdAt);
    if (decision.decision === "COMMIT") commitCount += 1;
    else rejectCount += 1;
    commitDecisions.push(decision);
    evidence.push(buildEvidence(operationalValue, decision, evidenceId, createdAt));
  }

  return deepFreeze({
    commitDecisions,
    evidence,
    summary: {
      evaluatedCount: commitDecisions.length,
      commitCount,
      rejectCount,
    },
  }) as CommitEngineResult;
}
