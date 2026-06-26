import type { Evidence, OperationalValue } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";

export interface RankingEngineOptions {
  createdAt?: string | null;
}

export interface RankingEngineResult {
  rankedOperationalValues: OperationalValue[];
  evidence: Evidence[];
  summary: {
    rankedCount: number;
    tieCount: number;
  };
}

const RANKING_ENGINE_SOURCE = "orc-ranking-engine";
const SCORE_FIELDS = [
  "overallScore",
  "continuity",
  "makespan",
  "permanence",
  "compaction",
  "resourcePressure",
  "robustness",
  "stability",
  "futureFreedom",
] as const;

function compareNullableStrings(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left.localeCompare(right);
}

function compareOperationalValues(left: OperationalValue, right: OperationalValue): number {
  for (const field of SCORE_FIELDS) {
    const difference = right[field] - left[field];
    if (difference !== 0) return difference;
  }

  const simulatedStateDifference = left.simulatedStateId.localeCompare(right.simulatedStateId);
  if (simulatedStateDifference !== 0) return simulatedStateDifference;

  const evaluatedAtDifference = compareNullableStrings(left.evaluatedAt, right.evaluatedAt);
  if (evaluatedAtDifference !== 0) return evaluatedAtDifference;

  return stableStringify(left).localeCompare(stableStringify(right));
}

function isScoreTie(left: OperationalValue, right: OperationalValue): boolean {
  return SCORE_FIELDS.every((field) => left[field] === right[field]);
}

function tieBreakReason(operationalValue: OperationalValue, previous: OperationalValue | null): string {
  if (previous == null || !isScoreTie(previous, operationalValue)) {
    return "No tie at this ranking position.";
  }
  if (previous.simulatedStateId !== operationalValue.simulatedStateId) {
    return "Tied score vector resolved by ascending simulatedStateId.";
  }
  if (previous.evaluatedAt !== operationalValue.evaluatedAt) {
    return "Tied score vector and simulatedStateId resolved by ascending evaluatedAt, with nulls last.";
  }
  return "Tied score vector, simulatedStateId and evaluatedAt resolved by stable structural serialization.";
}

function countTies(rankedOperationalValues: OperationalValue[]): number {
  let tieCount = 0;
  for (let index = 1; index < rankedOperationalValues.length; index += 1) {
    if (isScoreTie(rankedOperationalValues[index - 1], rankedOperationalValues[index])) tieCount += 1;
  }
  return tieCount;
}

export function rankOperationalValues(
  operationalValues: OperationalValue[],
  options: RankingEngineOptions = {},
): RankingEngineResult {
  const createdAt = options.createdAt ?? null;
  const rankedOperationalValues = [...(operationalValues ?? [])].sort(compareOperationalValues);
  const topCandidateId = rankedOperationalValues[0]?.simulatedStateId ?? null;
  const tieCount = countTies(rankedOperationalValues);
  const evidence = rankedOperationalValues.map((operationalValue, index): Evidence => {
    const previous = index > 0 ? rankedOperationalValues[index - 1] : null;
    const position = index + 1;
    return deepFreeze({
      id: `evidence:orc-ranking-engine:operational-value:${operationalValue.simulatedStateId}:rank:${position}`,
      source: RANKING_ENGINE_SOURCE,
      kind: "operational-value-ranked",
      subjectId: operationalValue.simulatedStateId,
      createdAt,
      data: {
        position,
        operationalValueId: operationalValue.simulatedStateId,
        topCandidateId,
        isTopCandidate: position === 1,
        scoreVector: Object.fromEntries(SCORE_FIELDS.map((field) => [field, operationalValue[field]])),
        tieBreakReason: tieBreakReason(operationalValue, previous),
        rankingPolicy: "score-vector-desc-then-stable-contained-fields",
        readOnly: true,
        mutatesOperationalState: false,
        commitsPlanning: false,
      },
    }) as Evidence;
  });

  return deepFreeze({
    rankedOperationalValues,
    evidence,
    summary: {
      rankedCount: rankedOperationalValues.length,
      tieCount,
    },
  }) as RankingEngineResult;
}
