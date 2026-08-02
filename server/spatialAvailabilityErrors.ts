export const spatialAvailabilityReasonCodes = [
  "INVALID_WORKDAY", "MISSING_ZONE_WINDOW_ENDPOINT", "MIXED_ZONE_WINDOW",
  "INVALID_ZONE_TIME_FORMAT", "INVALID_ZONE_TIME_ORDER", "ZONE_OUTSIDE_WORKDAY",
  "MISSING_SPACE_WINDOW_ENDPOINT", "MIXED_SPACE_WINDOW", "INVALID_SPACE_TIME_FORMAT",
  "INVALID_SPACE_TIME_ORDER", "SPACE_OUTSIDE_ZONE", "WORKDAY_REQUEST_PARTIAL",
  "SPACE_ZONE_NOT_FOUND",
] as const;

export type SpatialAvailabilityValidationReason = typeof spatialAvailabilityReasonCodes[number];
const reasons = new Set<string>(spatialAvailabilityReasonCodes);

export class SpatialAvailabilityValidationError extends Error {
  constructor(public readonly reasonCode: SpatialAvailabilityValidationReason, message: string = reasonCode) {
    super(message);
    this.name = "SpatialAvailabilityValidationError";
  }
}

export function runSpatialAvailabilityValidation<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    if (error instanceof SpatialAvailabilityValidationError) throw error;
    const message = error instanceof Error ? error.message : "";
    const reasonCode = message.match(/^([A-Z_]+)(?::|$)/)?.[1];
    if (reasonCode && reasons.has(reasonCode)) throw new SpatialAvailabilityValidationError(reasonCode as SpatialAvailabilityValidationReason, message);
    throw error;
  }
}
