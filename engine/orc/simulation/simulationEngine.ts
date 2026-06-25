import type { CandidateState, Evidence, OperationalState, SimulatedState } from "../contracts";
import { deepFreeze } from "../immutability";

export interface SimulationEngineOptions {
  maxSimulations?: number;
  createdAt?: string | null;
}

export interface SimulationEngineResult {
  simulatedStates: SimulatedState[];
  evidence: Evidence[];
  summary: {
    candidateStateCount: number;
    simulatedCount: number;
    truncatedByBudget: boolean;
  };
}

const DEFAULT_MAX_SIMULATIONS = 20;
const SIMULATION_MODE = "READ_ONLY_BASELINE";

function normalizeBudget(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_SIMULATIONS;
  return Math.max(0, Math.floor(value));
}

function cloneOperationalState(state: OperationalState): OperationalState {
  return JSON.parse(JSON.stringify(state)) as OperationalState;
}

export function simulateCandidateStates(
  state: OperationalState,
  candidateStates: CandidateState[],
  options: SimulationEngineOptions = {},
): SimulationEngineResult {
  const maxSimulations = normalizeBudget(options.maxSimulations);
  const createdAt = options.createdAt ?? null;
  const simulatedStates: SimulatedState[] = [];
  const evidence: Evidence[] = [];
  let truncatedByBudget = false;

  for (const candidateState of candidateStates ?? []) {
    if (simulatedStates.length >= maxSimulations) {
      truncatedByBudget = true;
      evidence.push({
        id: `evidence:orc-simulation:budget:${candidateState.id}`,
        source: "orc-simulation",
        kind: "simulated-state-budget-truncated",
        subjectId: candidateState.id,
        createdAt,
        data: { candidateStateId: candidateState.id, baseStateId: state.id, maxSimulations, readOnly: true },
      });
      break;
    }

    const simulatedStateId = `orc-simulation:simulated-state:${candidateState.id}`;
    const snapshot = deepFreeze(cloneOperationalState(state)) as OperationalState;
    const simulatedState: SimulatedState = deepFreeze({
      id: simulatedStateId,
      candidateStateId: candidateState.id,
      baseStateId: state.id,
      operationalStateSnapshot: snapshot,
      appliedTransformations: [],
      simulationMode: SIMULATION_MODE,
      readOnly: true,
      createdAt,
    }) as SimulatedState;

    simulatedStates.push(simulatedState);
    evidence.push({
      id: `evidence:orc-simulation:simulated-state:${candidateState.id}`,
      source: "orc-simulation",
      kind: "simulated-state-generated",
      subjectId: simulatedStateId,
      createdAt,
      data: {
        candidateStateId: candidateState.id,
        simulatedStateId,
        baseStateId: state.id,
        simulationMode: SIMULATION_MODE,
        readOnly: true,
        appliedTransformationCount: 0,
        appliedTransformations: [],
        mutatesOperationalState: false,
        executesTransformations: false,
      },
    });
  }

  return deepFreeze({
    simulatedStates,
    evidence,
    summary: {
      candidateStateCount: (candidateStates ?? []).length,
      simulatedCount: simulatedStates.length,
      truncatedByBudget,
    },
  }) as SimulationEngineResult;
}
