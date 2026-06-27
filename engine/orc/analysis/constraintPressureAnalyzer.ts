import type { OperationalAnalysis } from "./operationalStateAnalyzer";

type ConstraintPressureInput = Omit<OperationalAnalysis, "constraintPressureAnalysis"> | OperationalAnalysis;

export interface ConstraintPressure {
  readonly constraintId: string;
  readonly pressureScore: number;
  readonly contributingFactors: readonly string[];
  readonly explanation: string;
}

export interface ConstraintPressureAnalysis {
  readonly constraints: readonly ConstraintPressure[];
}

const uniqueSortedNumbers = (values: readonly number[] = []): number[] =>
  [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);

const pressure = (
  constraintId: string,
  pressureScore: number,
  contributingFactors: readonly string[],
  explanation: string,
): ConstraintPressure => ({ constraintId, pressureScore, contributingFactors: [...contributingFactors], explanation });

const byPressureThenId = (a: ConstraintPressure, b: ConstraintPressure): number =>
  b.pressureScore - a.pressureScore || a.constraintId.localeCompare(b.constraintId);

export function analyzeConstraintPressure(analysis: ConstraintPressureInput): ConstraintPressureAnalysis {
  const constraints: ConstraintPressure[] = [];

  if (analysis.dependencySummary.lockCount > 0) {
    const lockedTaskIds = uniqueSortedNumbers(analysis.dependencySummary.lockedTaskIds);
    const factors = [`lock-count:${analysis.dependencySummary.lockCount}`, `locked-task-count:${lockedTaskIds.length}`];
    constraints.push(pressure(
      "constraints:locks",
      analysis.dependencySummary.lockCount + lockedTaskIds.length,
      factors,
      `Constraint constraints:locks pressure is ${analysis.dependencySummary.lockCount + lockedTaskIds.length}. Evidence: lockCount=${analysis.dependencySummary.lockCount}, lockedTaskIds=[${lockedTaskIds.join(", ")}]. Factors: ${factors.join(", ")}.`,
    ));
  }

  if (analysis.dependencySummary.dependencyCount > 0) {
    const taskIdsWithDependencies = uniqueSortedNumbers(analysis.dependencySummary.taskIdsWithDependencies);
    const factors = [`dependency-count:${analysis.dependencySummary.dependencyCount}`, `dependency-linked-task-count:${taskIdsWithDependencies.length}`];
    constraints.push(pressure(
      "constraints:dependencies",
      analysis.dependencySummary.dependencyCount + taskIdsWithDependencies.length,
      factors,
      `Constraint constraints:dependencies pressure is ${analysis.dependencySummary.dependencyCount + taskIdsWithDependencies.length}. Evidence: dependencyCount=${analysis.dependencySummary.dependencyCount}, taskIdsWithDependencies=[${taskIdsWithDependencies.join(", ")}]. Factors: ${factors.join(", ")}.`,
    ));
  }

  if (analysis.continuity.mainFlow.configured && analysis.continuity.mainFlow.gapCount > 0) {
    const constraintId = `constraints:main-flow:${analysis.continuity.mainFlow.spaceOrZoneId ?? "unknown"}`;
    const gapPressure = analysis.continuity.mainFlow.gapCount + Math.ceil(analysis.continuity.mainFlow.internalGapMinutes / 30);
    const factors = [`main-flow-gap-count:${analysis.continuity.mainFlow.gapCount}`, `main-flow-gap-minutes:${analysis.continuity.mainFlow.internalGapMinutes}`];
    constraints.push(pressure(
      constraintId,
      gapPressure,
      factors,
      `Constraint ${constraintId} pressure is ${gapPressure}. Evidence: configured=${analysis.continuity.mainFlow.configured}, plannedTaskIds=[${analysis.continuity.mainFlow.plannedTaskIds.join(", ")}], gapCount=${analysis.continuity.mainFlow.gapCount}, internalGapMinutes=${analysis.continuity.mainFlow.internalGapMinutes}. Factors: ${factors.join(", ")}.`,
    ));
  }

  return { constraints: constraints.sort(byPressureThenId) };
}
