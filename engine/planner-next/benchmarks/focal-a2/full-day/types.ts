import type { EngineInput, TaskInput } from "../../../../types";
import type { PlannerNextProblem } from "../../../contracts";

export const CONTRACT_VERSION = "SPEC10-016.full-a2-template.v2";

export const PARTICIPANT_IDS = Array.from({ length: 19 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`) as readonly string[];

export type ParticipantId = typeof PARTICIPANT_IDS[number];
export type CoachId = "coach-lucia" | "coach-jose-maria";
export type OperationalKind =
  | "main"
  | "vocal"
  | "auxiliary"
  | "technical"
  | "participant_meal"
  | "transport_arrival"
  | "transport_departure"
  | "anchored_segment";

export type TaskType =
  | "IN"
  | "ESTILISMO_ENTRADA"
  | "CROMA"
  | "PRUEBA_VOCAL_LUCIA"
  | "PRUEBA_VOCAL_JOSE_MARIA"
  | "ENSAYO_ESTUDIO_7"
  | "REDES"
  | "PASILLO"
  | "TOTALES_1"
  | "TOTALES_COREO"
  | "SODEXO"
  | "GIRATUTO"
  | "SILLON"
  | "ESTRELLAS"
  | "CORNER_INFLUENCER"
  | "CORNER_MUSIC"
  | "CORNER_INFLUENCER_MUSIC"
  | "REALITY_PLATO_ANTES"
  | "REALITY_PLATO_DESPUES"
  | "REALITY_HALL"
  | "REALITY_INFLUENCER"
  | "REALITY_MANZANO"
  | "REALITY_BUGGY"
  | "REALITY_CONTROL_EVA"
  | "REALITY_CORNER_MUSIC"
  | "ALFOMBRA_ROJA"
  | "ALFOMBRA_ROJA_EVA"
  | "ALFOMBRA_ROJA_CONJUNTA"
  | "TOTALES_POST_CONJUNTO"
  | "ESTILISMO_SALIDA"
  | "OUT"
  | "TECH_REALITY_EVA"
  | "TECH_DESMONTAJE_TRASLADO"
  | "TECH_TOTALES_POST";

export interface CanonicalTaskTypeDefinition {
  readonly label: string;
  readonly duration: number;
  readonly spaceId: string;
  readonly operationalKind: OperationalKind;
  readonly exclusiveSpaceUse: boolean | "not_applicable";
  readonly knownResourceIds: readonly string[];
  readonly blocksParticipant: boolean;
  readonly countsForMainFlow?: boolean;
}

export interface CanonicalTask {
  readonly id: string;
  readonly type: TaskType;
  readonly participantId?: ParticipantId;
  readonly duration: number;
  readonly spaceId: string;
  readonly dependencies: readonly string[];
  readonly operationalKind: OperationalKind;
  readonly requiredResourceIds: readonly string[];
  readonly coachId?: CoachId;
  readonly blockKey?: CoachId;
  readonly setupFamilyId?: "sillon" | "estrellas";
  readonly jointGroupId?: string;
  readonly anchoredOperationId?: string;
  readonly technicalChainId?: string;
  readonly itinerantUnitId?: string;
  readonly meal?: { readonly kind: "participant_meal"; readonly duration: 40; readonly occupiesExclusiveSpace: false };
  readonly transport?: { readonly direction: "arrival" | "departure" };
  readonly isAnchoredSegment?: boolean;
  readonly editorialTags: readonly string[];
}

export interface CanonicalParticipantAssignment {
  readonly participantId: ParticipantId;
  readonly coachId: CoachId;
  readonly totales: Extract<TaskType, "TOTALES_1" | "TOTALES_COREO">;
  readonly corner: readonly TaskType[];
  readonly setup: readonly TaskType[];
  readonly extras: readonly TaskType[];
}

export interface CanonicalSpace {
  readonly id: string;
  readonly label: string;
  readonly exclusivity: "exclusive" | "independent" | "non_blocking" | "configuration_required";
  readonly capacityKnown?: number;
  readonly notes?: readonly string[];
}

export interface CanonicalResource {
  readonly id: string;
  readonly label: string;
  readonly kind: "camera" | "sound" | "coach" | "presenter";
  readonly availability: "creation_input_required";
}

export interface AnchoredOperationContract {
  readonly id: string;
  readonly participantId: ParticipantId;
  readonly beforeTaskIds: readonly string[];
  readonly anchorTaskId: string;
  readonly afterTaskIds: readonly string[];
  readonly adjacency: "REQUIRED";
  readonly internalTransition: "INCLUDED";
  readonly resourceContinuity: "REQUIRED";
  readonly orderedTaskIds: readonly string[];
  readonly itinerantUnitId: string;
  readonly memberResourceIds: readonly string[];
}


export interface CanonicalItinerantUnit {
  readonly id: string;
  readonly label: string;
  readonly memberResourceIds: readonly string[];
  readonly availability: "creation_input_required";
}

export interface CanonicalItinerantOperation {
  readonly id: string;
  readonly itinerantUnitId: string;
  readonly participantId: ParticipantId;
  readonly taskIds: readonly string[];
  readonly kind: "standalone" | "anchored";
  readonly memberResourceIds: readonly string[];
}

export interface JointOperationContract {
  readonly id: string;
  readonly taskType: Extract<TaskType, "ALFOMBRA_ROJA_CONJUNTA" | "TOTALES_POST_CONJUNTO">;
  readonly memberParticipantIds: readonly ["C06", "C10"];
  readonly taskIds: readonly string[];
  readonly duration: number;
  readonly spaceId: string;
  readonly synchronizedStartAndEnd: true;
  readonly sequenceAfterJointGroupId?: string;
}

export interface TechnicalChainContract {
  readonly id: string;
  readonly orderedTaskIds: readonly string[];
  readonly adjacency: "REQUIRED";
  readonly resourceContinuity: "REQUIRED";
  readonly requiredResourceIds: readonly ["cam-3", "cam-4", "son-1", "eva"];
}

export interface CanonicalTemplateRules {
  readonly noSeedSchedule: true;
  readonly noLocks: true;
  readonly mainFlow: {
    readonly spaceId: "estudio-7";
    readonly continuity: "REQUIRED";
    readonly maxBlocksPerCoach: 2;
    readonly blockKey: "coach";
    readonly optimizationAfterFeasibility: "minimize_coach_blocks";
  };
  readonly setup: {
    readonly spaceId: "p15-estrellas-sillon";
    readonly families: readonly ["sillon", "estrellas"];
    readonly oneBlockPerFamily: true;
    readonly orderConstraint: "UNSPECIFIED";
    readonly reentry: "FORBIDDEN";
    readonly preparationMinutesBetweenFamilies: 10;
  };
  readonly cornerSetupPolicy: {
    readonly taskTypes: readonly ["CORNER_INFLUENCER", "CORNER_MUSIC", "CORNER_INFLUENCER_MUSIC"];
    readonly setupRequired: false;
    readonly mandatoryGrouping: false;
  };
  readonly totalesSynchronization: {
    readonly taskTypes: readonly ["TOTALES_1", "TOTALES_COREO"];
    readonly synchronizedRounds: true;
    readonly microphoneChangeMinutesBetweenRounds: 5;
    readonly modelAsSpacePreparationOrTransition: true;
  };
  readonly coachTransition: {
    readonly from: "caracola";
    readonly to: "estudio-7";
    readonly minutes: 30;
    readonly scope: "coach";
  };
  readonly inTransport: {
    readonly minParticipantsPerGroup: 3;
    readonly minMinutesBetweenGroups: 30;
  };
  readonly outTransport: "creation_input_required";
  readonly ignoredEditorialNotes: readonly ["NO_P15", "instrument", "wardrobe", "prop"];
}

export interface CanonicalFullA2Template {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly participants: readonly ParticipantId[];
  readonly taskTypes: Readonly<Record<TaskType, CanonicalTaskTypeDefinition>>;
  readonly spaces: readonly CanonicalSpace[];
  readonly resources: readonly CanonicalResource[];
  readonly itinerantUnits: readonly CanonicalItinerantUnit[];
  readonly itinerantOperations: readonly CanonicalItinerantOperation[];
  readonly assignments: readonly CanonicalParticipantAssignment[];
  readonly requiredCreationInputs: readonly string[];
  readonly rules: CanonicalTemplateRules;
}

export interface ExpandedCanonicalFullA2Template {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly participants: readonly ParticipantId[];
  readonly tasks: readonly CanonicalTask[];
  readonly taskIds: readonly string[];
  readonly countsByType: Readonly<Record<TaskType, number>>;
  readonly anchoredOperations: readonly AnchoredOperationContract[];
  readonly jointOperations: readonly JointOperationContract[];
  readonly technicalChains: readonly TechnicalChainContract[];
  readonly spaces: readonly CanonicalSpace[];
  readonly resources: readonly CanonicalResource[];
  readonly itinerantUnits: readonly CanonicalItinerantUnit[];
  readonly itinerantOperations: readonly CanonicalItinerantOperation[];
  readonly rules: CanonicalTemplateRules;
  readonly requiredCreationInputs: readonly string[];
}

export interface ValidationIssue {
  readonly code: string;
  readonly invariantCode: string;
  readonly entityId: string;
  readonly message: string;
}

export interface ValidationInvariantResult {
  readonly code: string;
  readonly passed: boolean;
  readonly evaluated: true;
  readonly issueCodes: readonly string[];
  readonly affectedCanonicalIds: readonly string[];
}

export interface ValidationResult {
  readonly status: "VALID" | "INVALID";
  readonly issues: readonly ValidationIssue[];
  readonly invariants: readonly ValidationInvariantResult[];
}

export type RepresentabilityLayer = "SOURCE_CONFIGURATION" | "ENGINE_INPUT" | "ADAPTER" | "PLANNER_NEXT";

export interface RepresentabilityBlocker {
  readonly code: string;
  readonly layer: RepresentabilityLayer;
  readonly affectedRule: string;
  readonly canonicalIds: readonly string[];
  readonly operationalExplanation: string;
  readonly semanticLoss: string;
  readonly implementationRank?: number;
}

export interface RepresentabilityAnalysis {
  readonly status: "FULLY_REPRESENTABLE" | "BLOCKED";
  readonly requiredCreationInputs: readonly RepresentabilityBlocker[];
  readonly implementationBlockers: readonly RepresentabilityBlocker[];
  readonly blockers: readonly RepresentabilityBlocker[];
  readonly nextImplementationBlocker: RepresentabilityBlocker | null;
  readonly adapterProbe: {
    readonly executed: true;
    readonly supported: boolean;
    readonly projectedGlobalResourceTransitionMinutes: number | null;
    readonly supportsSpecificCoachRouteTransition: boolean;
    readonly problemHasRouteSpecificCoachTransition: boolean;
    readonly coachResourcesHaveOriginDestinationRule: boolean;
  };
}

export interface RepresentabilityGateResult {
  readonly status: "REJECTED_BLOCKED" | "EXECUTED";
  readonly analysis: RepresentabilityAnalysis;
  readonly executorCallCount: number;
  readonly engineInputBuilt: boolean;
  readonly preflightCalled: boolean;
  readonly adapterCalled: boolean;
  readonly executePlannerNextCalled: boolean;
}

export interface RepresentabilityExecutorTrace {
  readonly engineInputBuilt: boolean;
  readonly preflightCalled: boolean;
  readonly adapterCalled: boolean;
  readonly executePlannerNextCalled: boolean;
}

export type RepresentabilityExecutor = (analysis: RepresentabilityAnalysis) => RepresentabilityExecutorTrace;

export type TaskInputHasJointGroupId = "jointGroupId" extends keyof TaskInput ? true : false;
export type TaskInputHasSetupFamilyId = "setupFamilyId" extends keyof TaskInput ? true : false;
export type PlannerNextProblemHasRoundSynchronization = "roundSynchronization" extends keyof PlannerNextProblem ? true : false;
export type EngineInputHasSetupPolicies = "setupPolicies" extends keyof EngineInput ? true : false;

export const contractFieldPresence = {
  taskInputHasJointGroupId: false as TaskInputHasJointGroupId,
  taskInputHasSetupFamilyId: false as TaskInputHasSetupFamilyId,
  plannerNextProblemHasRoundSynchronization: false as PlannerNextProblemHasRoundSynchronization,
  engineInputHasSetupPolicies: false as EngineInputHasSetupPolicies,
} satisfies {
  readonly taskInputHasJointGroupId: TaskInputHasJointGroupId;
  readonly taskInputHasSetupFamilyId: TaskInputHasSetupFamilyId;
  readonly plannerNextProblemHasRoundSynchronization: PlannerNextProblemHasRoundSynchronization;
  readonly engineInputHasSetupPolicies: EngineInputHasSetupPolicies;
};
