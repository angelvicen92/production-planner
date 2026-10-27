import type { MainFlowPreference } from "./mainFlowPreference";
import type { RoundPreparationValue } from "./roundPreparation";
import type { CapabilityStatus, ConfigurationCategory } from "./configurability";

export type EffectiveValueAvailability = "AVAILABLE" | "UNKNOWN" | "UNAVAILABLE";
export type EffectiveValueSource = "INHERITED" | "DAY_OVERRIDE" | "LEGACY_BACKFILL" | "DAY_SNAPSHOT" | "MIXED" | "PROTECTED" | "UNKNOWN";
export type EffectiveValidationStatus = "VALID" | "INCOMPLETE" | "INCOMPATIBLE" | "UNSUPPORTED" | "UNKNOWN";
export type ReadinessStatus = "READY" | "INCOMPLETE" | "INCOMPATIBLE" | "UNSUPPORTED";
export interface EffectiveConfigurationValue {
  capabilityId:string; label:string; category:ConfigurationCategory; value:unknown;
  availability:EffectiveValueAvailability; unit:string; severity?:string;
  source:EffectiveValueSource; effectiveRevision?:number; fingerprint?:string;
  baseline?:unknown; defaultGeneral?:unknown; canRestoreInherited?:boolean;
  overrideMetadata?:{createdBy:string|null;createdAt:string|null};
  validationStatus:EffectiveValidationStatus; requiresReplan:"YES"|"NO"|"UNKNOWN";
  implementationStatus:CapabilityStatus; blockers:readonly string[];
  /** True only when the concrete day demonstrates that this capability is required. */
  requiredForDay:boolean;
}
export interface ReadinessIssue { capabilityId:string; category:ConfigurationCategory; status:Exclude<ReadinessStatus,"READY">; message:string; navigationTarget:string; }
export interface EffectiveConfigurationView {
  contractVersion:2; planId:number; generatedFrom:"PRODUCTIVE_AUTHORITIES";
  values:readonly EffectiveConfigurationValue[];
  readiness:{status:ReadinessStatus;issues:readonly ReadinessIssue[]};
  plannerProfile?:{sourceRevision:number;configured:boolean;scenario?:string;setupFamilies?:import("./newDayPlannerConfiguration").SetupFamiliesConfiguration;setupSpaceLabels?:{id:number;name:string}[]};
  mainFlowPreference?:{value:MainFlowPreference;baseline:MainFlowPreference;defaultGeneral:MainFlowPreference;
    available:boolean;mealApplicable:boolean;zeroBeforeRepresentable:boolean;counts:number[]};
  operationContinuity?: { revisionId:number|null; groups: ReturnType<typeof import("../server/operationContinuity").operationContinuityValues> };
  roundPreparations?: { revisionId: number | null; timeGridMinutes: number; lanes: RoundPreparationValue[] };
  technicalChains?: {
    revisionId:number|null; authority:import("./technicalChainStructure").TechnicalChainStructure|null;
    supported:boolean; blockedReason:string|null; by:string|null; at:string|null;
    tasks:{id:number;label:string;duration:number;space:string;availability?:{availabilityStart?:string|null;availabilityEnd?:string|null};eligible:boolean;resourceIds:number[]}[];
    resources:{id:number;name:string;start:string;end:string}[];
  };
  anchoredAccompaniments?: {
    revisionId:number|null;authority:import('./anchoredAccompanimentStructure').AnchoredAccompanimentStructure|null;
    supported:boolean;by:string|null;at:string|null;blockedReason?:string|null;
    tasks:{id:number;label:string;kind:string;participantId:number|null;space:string;duration:number;eligible:boolean;selectedUnitId?:number|null}[];
    units:{id:number;name:string;resources?:{id:number;name:string}[];windows?:{start:string;end:string}[]}[];
  };
  jointGroups?: {
    revisionId:number|null;authority:import('./jointGroupStructure').JointGroupStructure|null;
    supported:boolean;blockedReason:string|null;by:string|null;at:string|null;
    tasks:{id:number;label:string;participantId:number|null;spaceId:number|null;space:string;duration:number;eligible:boolean;dependencies:number[];dependencyLabels:string[];resourceIds:readonly number[]}[];
    resources:{id:number;name:string}[];
  };
  taskOperationScopes?: {
    revisionId:number|null;authority:import('./dailyTaskOperationScopes').DailyTaskOperationScopes|null;
    supported:boolean;blockedReason:string|null;by:string|null;at:string|null;
    tasks:{id:number;label:string;space:string;eligible:boolean;agendaScope:'PHYSICAL_SPACE'|'ITINERANT_UNIT';resourceInheritance:'LOCATION'|'OPERATION_ONLY';blocksSpace:boolean;itinerantUnitId:number|null;directResourceIds:readonly number[]}[];
    units:{id:number;name:string}[];resources:{id:number;name:string}[];
  };
  roundSynchronization?: {
    revisionId:number|null; authority:import("./roundSynchronizationStructure").RoundSynchronizationStructure|null;
    supported:boolean; blockedReason:string|null; by:string|null; at:string|null;
    spaces:{id:number;name:string}[];
    tasks:{id:number;spaceId:number|null;label:string;duration:number;eligible:boolean}[];
  };
  itinerantComposition?: {units: NonNullable<import('../engine/types').EngineInput['itinerantTeamAvailability']>; resources:{id:number;name:string}[]; labels?:{id:number;name:string}[]; presencePolicies?:Record<number,'OFF'|'PREFERRED'|'REQUIRED'>};
  productCoverage:Record<CapabilityStatus,number>;
}
