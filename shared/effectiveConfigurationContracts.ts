import type { CapabilityStatus, ConfigurationCategory } from "./configurability";

export type EffectiveValueAvailability = "AVAILABLE" | "UNKNOWN" | "UNAVAILABLE";
export type EffectiveValueSource = "INHERITED" | "DAY_OVERRIDE" | "LEGACY_BACKFILL" | "DAY_SNAPSHOT" | "MIXED" | "PROTECTED" | "UNKNOWN";
export type EffectiveValidationStatus = "VALID" | "INCOMPLETE" | "INCOMPATIBLE" | "UNSUPPORTED" | "UNKNOWN";
export type ReadinessStatus = "READY" | "INCOMPLETE" | "INCOMPATIBLE" | "UNSUPPORTED";
export interface EffectiveConfigurationValue {
  capabilityId:string; label:string; category:ConfigurationCategory; value:unknown;
  availability:EffectiveValueAvailability; unit:string; severity?:string;
  source:EffectiveValueSource; effectiveRevision?:number; fingerprint?:string;
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
  productCoverage:Record<CapabilityStatus,number>;
}
