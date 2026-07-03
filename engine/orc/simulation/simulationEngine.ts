import type { CandidateState, Evidence, OperationalState, SimulatedState } from "../contracts";
import { deepFreeze } from "../immutability";
import { applyCandidateAssignments } from "./applyCandidateAssignments";
import { materializeSimulatedPlanning } from "./materializeSimulatedPlanning";

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
const READ_ONLY_SIMULATION_MODE = "READ_ONLY_BASELINE";
const ASSIGNMENT_SIMULATION_MODE = "ASSIGNMENT_APPLICATION_SHADOW";

function normalizeBudget(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_SIMULATIONS;
  return Math.max(0, Math.floor(value));
}

function emptyCognitive(): OperationalState["cognitive"] {
  return { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} };
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
    const officialStateBefore = JSON.stringify(state);
    const mutableSnapshot = cloneOperationalState(state);
    const application = applyCandidateAssignments(mutableSnapshot, candidateState.sourceAssignments ?? []);
    const materialization = materializeSimulatedPlanning(candidateState, state);
    mutableSnapshot.planning = materialization.planning.map((entry) => ({
      taskId: entry.taskId,
      startPlanned: entry.startPlanned,
      endPlanned: entry.endPlanned,
      assignedResourceIds: [...entry.assignedResourceIds],
      spaceId: entry.spaceId ?? null,
      zoneId: (entry as any).zoneId ?? null,
      seedSource: entry.seedSource,
      operationalRole: entry.operationalRole,
      blocksSpace: entry.blocksSpace,
      countsAsWork: entry.countsAsWork,
      countsForMainFlow: entry.countsForMainFlow,
      countsForResourceLoad: entry.countsForResourceLoad,
      countsForTalentLoad: entry.countsForTalentLoad,
      allowsSpaceOverlap: entry.allowsSpaceOverlap,
      spaceOccupancyMode: entry.spaceOccupancyMode,
    } as OperationalState["planning"][number]));
    const officialStateUnchanged = JSON.stringify(state) === officialStateBefore;
    const simulationMode = (candidateState.sourceAssignments?.length ?? 0) > 0 ? ASSIGNMENT_SIMULATION_MODE : READ_ONLY_SIMULATION_MODE;
    const snapshot = deepFreeze(mutableSnapshot) as OperationalState;
    const simulatedState: SimulatedState = deepFreeze({
      id: simulatedStateId,
      candidateStateId: candidateState.id,
      baseStateId: state.id,
      operationalStateSnapshot: snapshot,
      appliedTransformations: application.appliedTransformations,
      simulationMode,
      readOnly: true,
      createdAt,
      planningMaterialization: materialization.diagnostics,
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
        simulationMode,
        readOnly: true,
        appliedTransformationCount: application.appliedTransformations.length,
        appliedTransformations: application.appliedTransformations,
        assignmentsReceived: candidateState.sourceAssignments?.length ?? 0,
        assignmentApplication: application.evidenceData,
        realChangeCount: application.realChangeCount,
        planningMaterialization: materialization.diagnostics,
        officialStateUnchanged,
        mutatesOperationalState: false,
        executesTransformations: application.realChangeCount > 0,
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
