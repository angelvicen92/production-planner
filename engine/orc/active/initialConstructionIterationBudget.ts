import type { ReasoningBudgetProfile } from "../contracts";

export type InitialConstructionBudgetLimit =
  | "MAX_ACCEPTED_CYCLES"
  | "MAX_ELAPSED_MS"
  | "MAX_ANCHOR_ATTEMPTS"
  | "MAX_ANCHOR_RANKS_SCANNED"
  | "MAX_BRANCHES"
  | "MAX_TRANSFORMATIONS"
  | "MAX_SIMULATIONS"
  | "MAX_VALIDATIONS"
  | "MAX_RESIDUAL_STATES"
  | "MAX_LOGICAL_STEPS";

export interface InitialConstructionIterationBudget {
  maxAcceptedCycles: number;
  maxElapsedMs: number;
  /** @deprecated Use anchorBatchSize. Kept as a compatibility alias. */
  maxAnchorsPerCycle: number;
  anchorBatchSize: number;
  maxAnchorRanksScannedPerCycle: number;
  maxTotalAnchorAttempts: number;
  maxTotalBranches: number;
  maxTransformations: number;
  maxSimulations: number;
  maxValidations: number;
  maxResidualStates: number;
  maxLogicalSteps: number;
}

const nonNegative = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
};
const positive = (value: unknown, fallback: number) => Math.max(1, nonNegative(value, fallback));

export function defaultInitialConstructionIterationBudget(): InitialConstructionIterationBudget {
  const maxAcceptedCycles = 48;
  const anchorBatchSize = 12;
  const maxAnchorRanksScannedPerCycle = 128;
  return {
    maxAcceptedCycles,
    maxElapsedMs: 60_000,
    maxAnchorsPerCycle: anchorBatchSize,
    anchorBatchSize,
    maxAnchorRanksScannedPerCycle,
    maxTotalAnchorAttempts: maxAcceptedCycles * maxAnchorRanksScannedPerCycle,
    maxTotalBranches: maxAcceptedCycles * maxAnchorRanksScannedPerCycle * 6,
    maxTransformations: maxAcceptedCycles * maxAnchorRanksScannedPerCycle * 8,
    maxSimulations: maxAcceptedCycles * maxAnchorRanksScannedPerCycle * 8,
    maxValidations: maxAcceptedCycles * maxAnchorRanksScannedPerCycle * 8,
    maxResidualStates: maxAcceptedCycles + 1,
    maxLogicalSteps: maxAcceptedCycles * maxAnchorRanksScannedPerCycle * 16,
  };
}

export function initialConstructionIterationBudgetFromReasoningBudget(b?: (ReasoningBudgetProfile & Record<string, unknown>) | null): InitialConstructionIterationBudget {
  const d = defaultInitialConstructionIterationBudget();
  const maxAcceptedCycles = nonNegative(b?.maxAcceptedCycles, d.maxAcceptedCycles);
  const anchorBatchSize = positive(b?.anchorBatchSize ?? b?.maxAnchorsPerCycle ?? b?.maxCandidates, d.anchorBatchSize);
  const maxAnchorRanksScannedPerCycle = positive(b?.maxAnchorRanksScannedPerCycle, d.maxAnchorRanksScannedPerCycle);
  const scanWidth = Math.max(anchorBatchSize, maxAnchorRanksScannedPerCycle);
  return {
    maxAcceptedCycles,
    maxElapsedMs: nonNegative(b?.maxElapsedMs, d.maxElapsedMs),
    maxAnchorsPerCycle: anchorBatchSize,
    anchorBatchSize,
    maxAnchorRanksScannedPerCycle: scanWidth,
    maxTotalAnchorAttempts: nonNegative(b?.maxTotalAnchorAttempts, Math.max(maxAcceptedCycles * scanWidth, scanWidth)),
    maxTotalBranches: nonNegative(b?.maxTotalBranches, Math.max(maxAcceptedCycles * scanWidth * positive(b?.branchesPerAnchorLimit, 6), 1)),
    maxTransformations: nonNegative(b?.maxTransformations, Math.max(maxAcceptedCycles * scanWidth * 8, 1)),
    maxSimulations: nonNegative(b?.maxSimulations, Math.max(maxAcceptedCycles * scanWidth * 8, 1)),
    maxValidations: nonNegative(b?.maxValidations, Math.max(maxAcceptedCycles * scanWidth * 8, 1)),
    maxResidualStates: nonNegative(b?.maxResidualStates, Math.max(maxAcceptedCycles + 1, 1)),
    maxLogicalSteps: nonNegative(b?.maxLogicalSteps, Math.max(maxAcceptedCycles * scanWidth * 16, 1)),
  };
}
