import type { LearnedSearchPattern, OnlineSearchMemory } from "../contracts";

export type { LearnedSearchPattern, OnlineSearchMemory } from "../contracts";

const clonePattern = (pattern: LearnedSearchPattern): LearnedSearchPattern => ({
  patternId: pattern.patternId,
  observations: pattern.observations,
  averageScore: pattern.averageScore,
  lastScore: pattern.lastScore,
  explanation: pattern.explanation,
});

export function initializeOnlineSearchMemory(): OnlineSearchMemory {
  return { patterns: [] };
}

export function registerSearchObservation(
  memory: OnlineSearchMemory,
  pattern: LearnedSearchPattern,
): OnlineSearchMemory {
  const incoming = clonePattern(pattern);
  const existing = memory.patterns.find((item) => item.patternId === incoming.patternId) ?? null;

  if (existing == null) {
    return {
      patterns: [...memory.patterns.map(clonePattern), incoming],
    };
  }

  const observations = existing.observations + incoming.observations;
  const averageScore = observations === 0
    ? incoming.lastScore
    : ((existing.averageScore * existing.observations) + (incoming.averageScore * incoming.observations)) / observations;

  return {
    patterns: memory.patterns.map((item) => item.patternId === incoming.patternId
      ? {
        patternId: incoming.patternId,
        observations,
        averageScore,
        lastScore: incoming.lastScore,
        explanation: incoming.explanation,
      }
      : clonePattern(item)),
  };
}

export function queryLearnedPattern(
  memory: OnlineSearchMemory,
  patternId: string,
): LearnedSearchPattern | null {
  const pattern = memory.patterns.find((item) => item.patternId === patternId) ?? null;
  return pattern == null ? null : clonePattern(pattern);
}
