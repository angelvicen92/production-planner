import type { ReasoningBudgetProfile } from "../contracts";

export type InitialConstructionBudgetLimit =
  | "MAX_ACCEPTED_CYCLES"
  | "MAX_ELAPSED_MS"
  | "MAX_ANCHOR_ATTEMPTS"
  | "MAX_BRANCHES"
  | "MAX_TRANSFORMATIONS"
  | "MAX_SIMULATIONS"
  | "MAX_VALIDATIONS"
  | "MAX_RESIDUAL_STATES"
  | "MAX_LOGICAL_STEPS";

export interface InitialConstructionIterationBudget {
  maxAcceptedCycles: number;
  maxElapsedMs: number;
  maxAnchorsPerCycle: number;
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
  const maxAcceptedCycles = 24;
  const maxAnchorsPerCycle = 12;
  return {
    maxAcceptedCycles,
    maxElapsedMs: 60_000,
    maxAnchorsPerCycle,
    maxTotalAnchorAttempts: maxAcceptedCycles * maxAnchorsPerCycle,
    maxTotalBranches: maxAcceptedCycles * maxAnchorsPerCycle * 6,
    maxTransformations: maxAcceptedCycles * maxAnchorsPerCycle * 8,
    maxSimulations: maxAcceptedCycles * maxAnchorsPerCycle * 8,
    maxValidations: maxAcceptedCycles * maxAnchorsPerCycle * 8,
    maxResidualStates: maxAcceptedCycles + 1,
    maxLogicalSteps: maxAcceptedCycles * maxAnchorsPerCycle * 16,
  };
}

export function initialConstructionIterationBudgetFromReasoningBudget(b?: (ReasoningBudgetProfile & Record<string, unknown>) | null): InitialConstructionIterationBudget {
  const d = defaultInitialConstructionIterationBudget();
  const maxAcceptedCycles = nonNegative(b?.maxAcceptedCycles, d.maxAcceptedCycles);
  const maxAnchorsPerCycle = positive(b?.maxAnchorsPerCycle ?? b?.maxCandidates, d.maxAnchorsPerCycle);
  return {
    maxAcceptedCycles,
    maxElapsedMs: nonNegative(b?.maxElapsedMs, d.maxElapsedMs),
    maxAnchorsPerCycle,
    maxTotalAnchorAttempts: nonNegative(b?.maxTotalAnchorAttempts, Math.max(maxAcceptedCycles * maxAnchorsPerCycle, maxAnchorsPerCycle)),
    maxTotalBranches: nonNegative(b?.maxTotalBranches, Math.max(maxAcceptedCycles * maxAnchorsPerCycle * positive(b?.branchesPerAnchorLimit, 6), 1)),
    maxTransformations: nonNegative(b?.maxTransformations, Math.max(maxAcceptedCycles * maxAnchorsPerCycle * 8, 1)),
    maxSimulations: nonNegative(b?.maxSimulations, Math.max(maxAcceptedCycles * maxAnchorsPerCycle * 8, 1)),
    maxValidations: nonNegative(b?.maxValidations, Math.max(maxAcceptedCycles * maxAnchorsPerCycle * 8, 1)),
    maxResidualStates: nonNegative(b?.maxResidualStates, Math.max(maxAcceptedCycles + 1, 1)),
    maxLogicalSteps: nonNegative(b?.maxLogicalSteps, Math.max(maxAcceptedCycles * maxAnchorsPerCycle * 16, 1)),
  };
}
