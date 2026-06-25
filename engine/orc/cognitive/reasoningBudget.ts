export interface ReasoningBudget {
  maxOpportunities: number;
  maxSearchSpaces: number;
  maxCandidates: number;
  maxSimulations: number;

  consumedOpportunities: number;
  consumedSearchSpaces: number;
  consumedCandidates: number;
  consumedSimulations: number;
}

export interface RemainingReasoningBudget {
  opportunities: number;
  searchSpaces: number;
  candidates: number;
  simulations: number;
}

export interface ReasoningBudgetInput {
  maxOpportunities?: number;
  maxSearchSpaces?: number;
  maxCandidates?: number;
  maxSimulations?: number;
  consumedOpportunities?: number;
  consumedSearchSpaces?: number;
  consumedCandidates?: number;
  consumedSimulations?: number;
}

const DEFAULT_MAX_OPPORTUNITIES = 20;
const DEFAULT_MAX_SEARCH_SPACES = 10;
const DEFAULT_MAX_CANDIDATES = 20;
const DEFAULT_MAX_SIMULATIONS = 20;

const normalizeBudgetValue = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const clampConsumed = (value: number | undefined, max: number): number => Math.min(normalizeBudgetValue(value, 0), max);

const freezeBudget = (budget: ReasoningBudget): ReasoningBudget => Object.freeze(budget);

export function createReasoningBudget(input: ReasoningBudgetInput = {}): ReasoningBudget {
  const maxOpportunities = normalizeBudgetValue(input.maxOpportunities, DEFAULT_MAX_OPPORTUNITIES);
  const maxSearchSpaces = normalizeBudgetValue(input.maxSearchSpaces, DEFAULT_MAX_SEARCH_SPACES);
  const maxCandidates = normalizeBudgetValue(input.maxCandidates, DEFAULT_MAX_CANDIDATES);
  const maxSimulations = normalizeBudgetValue(input.maxSimulations, DEFAULT_MAX_SIMULATIONS);

  return freezeBudget({
    maxOpportunities,
    maxSearchSpaces,
    maxCandidates,
    maxSimulations,
    consumedOpportunities: clampConsumed(input.consumedOpportunities, maxOpportunities),
    consumedSearchSpaces: clampConsumed(input.consumedSearchSpaces, maxSearchSpaces),
    consumedCandidates: clampConsumed(input.consumedCandidates, maxCandidates),
    consumedSimulations: clampConsumed(input.consumedSimulations, maxSimulations),
  });
}

const consume = (budget: ReasoningBudget, consumedKey: keyof Pick<ReasoningBudget, "consumedOpportunities" | "consumedSearchSpaces" | "consumedCandidates" | "consumedSimulations">, maxKey: keyof Pick<ReasoningBudget, "maxOpportunities" | "maxSearchSpaces" | "maxCandidates" | "maxSimulations">): ReasoningBudget => {
  const current = normalizeBudgetValue(budget[consumedKey], 0);
  const max = normalizeBudgetValue(budget[maxKey], 0);
  return createReasoningBudget({ ...budget, [consumedKey]: Math.min(current + 1, max) });
};

export function consumeOpportunity(budget: ReasoningBudget): ReasoningBudget {
  return consume(budget, "consumedOpportunities", "maxOpportunities");
}

export function consumeSearchSpace(budget: ReasoningBudget): ReasoningBudget {
  return consume(budget, "consumedSearchSpaces", "maxSearchSpaces");
}

export function consumeCandidate(budget: ReasoningBudget): ReasoningBudget {
  return consume(budget, "consumedCandidates", "maxCandidates");
}

export function consumeSimulation(budget: ReasoningBudget): ReasoningBudget {
  return consume(budget, "consumedSimulations", "maxSimulations");
}

export function remainingBudget(budget: ReasoningBudget): RemainingReasoningBudget {
  return Object.freeze({
    opportunities: Math.max(0, budget.maxOpportunities - budget.consumedOpportunities),
    searchSpaces: Math.max(0, budget.maxSearchSpaces - budget.consumedSearchSpaces),
    candidates: Math.max(0, budget.maxCandidates - budget.consumedCandidates),
    simulations: Math.max(0, budget.maxSimulations - budget.consumedSimulations),
  });
}
