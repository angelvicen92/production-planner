export interface ResourceAvailabilityWindowInput {
  start?: string | null;
  end?: string | null;
}

export type NormalizedResourceAvailabilityWindow =
  | Readonly<{ mode: "FULL_WORKDAY"; start: null; end: null }>
  | Readonly<{ mode: "EXPLICIT"; start: string; end: string }>;

export class ResourceAvailabilityWindowError extends Error {
  readonly code = "INVALID_RESOURCE_AVAILABILITY_WINDOW";

  constructor(message: string) {
    super(message);
    this.name = "ResourceAvailabilityWindowError";
  }
}

const CANONICAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function normalizeResourceAvailabilityWindow(
  input: ResourceAvailabilityWindowInput,
): NormalizedResourceAvailabilityWindow {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ResourceAvailabilityWindowError("Availability window must be an object");
  }

  const { start, end } = input;
  const startIsNull = start === null || start === undefined;
  const endIsNull = end === null || end === undefined;

  if (startIsNull && endIsNull) {
    return Object.freeze({ mode: "FULL_WORKDAY", start: null, end: null });
  }
  if (startIsNull !== endIsNull) {
    throw new ResourceAvailabilityWindowError(
      "Availability start and end must both be null or both be provided",
    );
  }
  if (typeof start !== "string" || typeof end !== "string") {
    throw new ResourceAvailabilityWindowError("Availability times must be strings in HH:mm format");
  }
  if (!CANONICAL_TIME.test(start) || !CANONICAL_TIME.test(end)) {
    throw new ResourceAvailabilityWindowError("Availability times must use canonical HH:mm format");
  }
  if (start >= end) {
    throw new ResourceAvailabilityWindowError("Availability start must be earlier than end");
  }

  return Object.freeze({ mode: "EXPLICIT", start, end });
}

export interface GlobalResourceAvailabilityDefault {
  defaultAvailabilityStart?: string | null;
  defaultAvailabilityEnd?: string | null;
}

export function mapGlobalAvailabilityDefaultToSnapshot(
  resource: GlobalResourceAvailabilityDefault,
): Readonly<{ availabilityStart: string | null; availabilityEnd: string | null }> {
  const normalized = normalizeResourceAvailabilityWindow({
    start: resource.defaultAvailabilityStart,
    end: resource.defaultAvailabilityEnd,
  });
  return Object.freeze({
    availabilityStart: normalized.start,
    availabilityEnd: normalized.end,
  });
}

export interface ResourceItemSnapshotSource extends GlobalResourceAvailabilityDefault {
  id: number;
  typeId: number;
  name: string;
}

export function buildDefaultPlanResourceItemSnapshotRows(
  planId: number,
  items: readonly ResourceItemSnapshotSource[],
) {
  const rows = items.map((item) => {
    let availability: ReturnType<typeof mapGlobalAvailabilityDefaultToSnapshot>;
    try {
      availability = mapGlobalAvailabilityDefaultToSnapshot(item);
    } catch (error) {
      if (error instanceof ResourceAvailabilityWindowError) {
        throw new ResourceAvailabilityWindowError(
          `Invalid availability default for resource item ${item.id}: ${error.message}`,
        );
      }
      throw error;
    }
    return Object.freeze({
      plan_id: planId,
      type_id: item.typeId,
      resource_item_id: item.id,
      name: item.name,
      is_available: true,
      source: "default" as const,
      availability_start: availability.availabilityStart,
      availability_end: availability.availabilityEnd,
    });
  });
  return Object.freeze(rows);
}

export function buildAdHocPlanResourceItemRow(input: {
  planId: number;
  typeId: number;
  name: string;
  availability?: ResourceAvailabilityWindowInput;
}) {
  const availability = normalizeResourceAvailabilityWindow(input.availability ?? {});
  return Object.freeze({
    plan_id: input.planId,
    type_id: input.typeId,
    resource_item_id: null,
    name: input.name,
    is_available: true,
    source: "adhoc" as const,
    availability_start: availability.start,
    availability_end: availability.end,
  });
}

export function buildAvailabilityWindowPatch(input: ResourceAvailabilityWindowInput) {
  const availability = normalizeResourceAvailabilityWindow(input);
  return Object.freeze({
    availability_start: availability.start,
    availability_end: availability.end,
  });
}
