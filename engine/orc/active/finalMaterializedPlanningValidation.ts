import type { EngineInput } from "../../types";
import type { OperationalState, SimulatedState, ValidationResult, ValidationViolationDetail } from "../contracts";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { validateSimulatedStates } from "../validation/validationEngine";

export const FINAL_MATERIALIZED_HARD_VALIDATION_VERSION = "ORC-FINAL-MATERIALIZED-HARD-VALIDATION-V1" as const;

type OutputPlanningEntry = {
  taskId: number;
  startPlanned: string;
  endPlanned: string;
  assignedResourceIds?: readonly number[];
  assignedResources?: readonly number[];
  spaceId?: number | null;
  assignedSpace?: number | null;
  zoneId?: number | null;
};

export interface FinalMaterializedPlanningValidationResult {
  readonly version: typeof FINAL_MATERIALIZED_HARD_VALIDATION_VERSION;
  readonly sourceSimulationId: string | null;
  readonly selectedCandidateId: string | null;
  readonly associatedValidationSimulatedStateId: string | null;
  readonly validationBelongsToSimulation: boolean;
  readonly materializedPlanningFingerprint: string;
  readonly validatedPlanningFingerprint: string;
  readonly planningFingerprintMatches: boolean;
  readonly result: "VALID" | "INVALID";
  readonly violatedConstraints: readonly string[];
  readonly violationCount: number;
  readonly boundedViolationDetails: readonly ValidationViolationDetail[];
  readonly violationDetailsSample: readonly ValidationViolationDetail[];
  readonly contestantOverlapCount: number;
  readonly contestantOverlapTaskPairs: readonly (readonly [number, number])[];
  readonly finalGatePassed: boolean;
  readonly readOnly: true;
  readonly canonicalSimulatedState: SimulatedState;
  readonly validation: ValidationResult;
}

const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
const asNumberArray = (value: unknown): number[] => Array.isArray(value) ? value.map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [];

export function fingerprintORCPlanning(planning: readonly OutputPlanningEntry[] | readonly OperationalState["planning"][number][]): string {
  const normalized = (planning ?? []).map((entry: any) => ({
    taskId: Number(entry.taskId),
    startPlanned: String(entry.startPlanned ?? ""),
    endPlanned: String(entry.endPlanned ?? ""),
    spaceId: entry.spaceId ?? entry.assignedSpace ?? null,
    assignedResourceIds: asNumberArray(entry.assignedResourceIds ?? entry.assignedResources),
  })).sort((a, b) => a.taskId - b.taskId || a.startPlanned.localeCompare(b.startPlanned) || a.endPlanned.localeCompare(b.endPlanned));
  return stableStringify(normalized);
}

function normalizePlanningEntry(input: EngineInput, base: OperationalState, item: OutputPlanningEntry): OperationalState["planning"][number] {
  const taskId = Number(item.taskId);
  const task = (input.tasks ?? []).find((candidate) => candidate.id === taskId) as any;
  const existing = base.planning.find((entry) => entry.taskId === taskId) as any;
  return {
    ...(existing ?? {}),
    taskId,
    startPlanned: String(item.startPlanned),
    endPlanned: String(item.endPlanned),
    assignedResourceIds: asNumberArray(item.assignedResourceIds ?? item.assignedResources ?? task?.assignedResourceIds ?? []),
    spaceId: item.spaceId ?? item.assignedSpace ?? task?.spaceId ?? existing?.spaceId ?? null,
    zoneId: item.zoneId ?? task?.zoneId ?? existing?.zoneId ?? null,
    operationalRole: existing?.operationalRole ?? task?.operationalRole,
    blocksSpace: existing?.blocksSpace ?? task?.blocksSpace,
    countsAsWork: existing?.countsAsWork ?? task?.countsAsWork,
    countsForMainFlow: existing?.countsForMainFlow ?? task?.countsForMainFlow,
    countsForResourceLoad: existing?.countsForResourceLoad ?? task?.countsForResourceLoad,
    countsForTalentLoad: existing?.countsForTalentLoad ?? task?.countsForTalentLoad,
    allowsSpaceOverlap: existing?.allowsSpaceOverlap ?? task?.allowsSpaceOverlap,
    spaceOccupancyMode: existing?.spaceOccupancyMode ?? task?.spaceOccupancyMode,
  } as OperationalState["planning"][number];
}

export function validateFinalMaterializedORCPlanning(args: {
  input: EngineInput;
  simulation: SimulatedState | null | undefined;
  planning: readonly OutputPlanningEntry[];
  candidate?: any;
  validation?: ValidationResult | null;
  planningMaterialization?: any;
  source?: string | null;
}): FinalMaterializedPlanningValidationResult {
  const base = buildOperationalStateFromEngineInput(args.input);
  const canonicalPlanning = (args.planning ?? []).map((entry) => normalizePlanningEntry(args.input, base, entry));
  const snapshot = deepFreeze({ ...clone(base), planning: canonicalPlanning, id: `${base.id}:final-materialized:${args.simulation?.id ?? "none"}` }) as OperationalState;
  const simulatedState: SimulatedState = deepFreeze({
    id: `${args.simulation?.id ?? "no-simulation"}:final-materialized-validation`,
    candidateStateId: args.simulation?.candidateStateId ?? args.candidate?.state?.id ?? args.candidate?.id ?? "final-materialized",
    baseStateId: snapshot.id,
    operationalStateSnapshot: snapshot,
    appliedTransformations: [],
    simulationMode: "ASSIGNMENT_APPLICATION_SHADOW",
    planningMaterialization: args.planningMaterialization,
    readOnly: true,
    createdAt: null,
  }) as SimulatedState;
  const validation = validateSimulatedStates([simulatedState], { createdAt: null }).validationResults[0];
  const materializedPlanningFingerprint = fingerprintORCPlanning(args.planning);
  const validatedPlanningFingerprint = fingerprintORCPlanning(canonicalPlanning);
  const validationBelongsToSimulation = args.validation?.simulatedStateId === args.simulation?.id;
  const planningFingerprintMatches = materializedPlanningFingerprint === validatedPlanningFingerprint;
  const details = validation.violationDetails ?? [];
  const pairs = details.filter((detail) => detail.code === "CONTESTANT_OVERLAP").map((detail) => [detail.taskIds[0], detail.taskIds[1]].filter(Number.isFinite).sort((a, b) => a - b) as [number, number]);
  const result = validation.result;
  const finalGatePassed = planningFingerprintMatches && validationBelongsToSimulation && result === "VALID" && validation.violatedConstraints.length === 0;
  return deepFreeze({
    version: FINAL_MATERIALIZED_HARD_VALIDATION_VERSION,
    sourceSimulationId: args.simulation?.id ?? null,
    selectedCandidateId: args.candidate?.id ?? args.candidate?.state?.candidateId ?? args.simulation?.candidateStateId ?? null,
    associatedValidationSimulatedStateId: args.validation?.simulatedStateId ?? null,
    validationBelongsToSimulation,
    materializedPlanningFingerprint,
    validatedPlanningFingerprint,
    planningFingerprintMatches,
    result,
    violatedConstraints: [...validation.violatedConstraints],
    violationCount: details.length,
    boundedViolationDetails: details,
    violationDetailsSample: details.slice(0, 20),
    contestantOverlapCount: pairs.length,
    contestantOverlapTaskPairs: pairs.slice(0, 20),
    finalGatePassed,
    readOnly: true,
    canonicalSimulatedState: simulatedState,
    validation,
  });
}
