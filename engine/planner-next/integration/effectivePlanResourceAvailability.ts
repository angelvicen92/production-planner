import type { PlanResourceItemInput, TimeWindow } from "../../types";

export type EffectivePlanResourceAvailability =
  | Readonly<{ status: "AVAILABLE"; planResourceItemId: number; sourceMode: "FULL_WORKDAY" | "EXPLICIT"; rawStart: string | null; rawEnd: string | null; effectiveWindow: Readonly<TimeWindow> }>
  | Readonly<{ status: "UNAVAILABLE"; planResourceItemId: number; sourceMode: "FULL_WORKDAY" | "EXPLICIT"; rawStart: string | null; rawEnd: string | null; effectiveWindow: null; reason: "RESOURCE_DISABLED" | "EMPTY_WORKDAY_INTERSECTION" }>
  | Readonly<{ status: "INVALID"; planResourceItemId: number; effectiveWindow: null; reason: "INVALID_WORKDAY" | "MISSING_SNAPSHOT_WINDOW" | "PARTIAL_SNAPSHOT_WINDOW" | "MIXED_NULL_AND_STRING" | "INVALID_TIME_FORMAT" | "INVALID_TIME_ORDER" }>;

const minutes = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const frozen = <T extends object>(value: T): Readonly<T> => {
  Object.values(value).forEach((entry) => {
    if (entry && typeof entry === "object" && !Object.isFrozen(entry)) Object.freeze(entry);
  });
  return Object.freeze(value);
};

export function resolveEffectivePlanResourceAvailability(
  workDay: TimeWindow,
  resource: PlanResourceItemInput,
): EffectivePlanResourceAvailability {
  const dayStart = minutes(workDay?.start);
  const dayEnd = minutes(workDay?.end);
  const invalid = (reason: Extract<EffectivePlanResourceAvailability, { status: "INVALID" }>["reason"]): EffectivePlanResourceAvailability =>
    frozen({ status: "INVALID", planResourceItemId: resource.id, effectiveWindow: null, reason });
  if (dayStart === null || dayEnd === null || dayStart >= dayEnd) return invalid("INVALID_WORKDAY");

  const hasStart = Object.prototype.hasOwnProperty.call(resource, "availabilityStart") && resource.availabilityStart !== undefined;
  const hasEnd = Object.prototype.hasOwnProperty.call(resource, "availabilityEnd") && resource.availabilityEnd !== undefined;
  if (!hasStart && !hasEnd) return invalid("MISSING_SNAPSHOT_WINDOW");
  if (!hasStart || !hasEnd) return invalid("PARTIAL_SNAPSHOT_WINDOW");
  const rawStart = resource.availabilityStart;
  const rawEnd = resource.availabilityEnd;
  if ((rawStart === null) !== (rawEnd === null)) return invalid("MIXED_NULL_AND_STRING");
  const fullDay = rawStart === null && rawEnd === null;
  if (!fullDay && (minutes(rawStart) === null || minutes(rawEnd) === null)) return invalid("INVALID_TIME_FORMAT");
  const sourceMode = fullDay ? "FULL_WORKDAY" as const : "EXPLICIT" as const;
  const start = fullDay ? dayStart : minutes(rawStart)!;
  const end = fullDay ? dayEnd : minutes(rawEnd)!;
  if (start >= end) return invalid("INVALID_TIME_ORDER");
  if (!resource.isAvailable) return frozen({ status: "UNAVAILABLE", planResourceItemId: resource.id, sourceMode, rawStart: rawStart!, rawEnd: rawEnd!, effectiveWindow: null, reason: "RESOURCE_DISABLED" });
  const effectiveStart = Math.max(dayStart, start);
  const effectiveEnd = Math.min(dayEnd, end);
  if (effectiveStart >= effectiveEnd) return frozen({ status: "UNAVAILABLE", planResourceItemId: resource.id, sourceMode, rawStart: rawStart!, rawEnd: rawEnd!, effectiveWindow: null, reason: "EMPTY_WORKDAY_INTERSECTION" });
  const effectiveWindow = fullDay ? { start: workDay.start, end: workDay.end } : {
    start: effectiveStart === dayStart ? workDay.start : rawStart as string,
    end: effectiveEnd === dayEnd ? workDay.end : rawEnd as string,
  };
  return frozen({ status: "AVAILABLE", planResourceItemId: resource.id, sourceMode, rawStart: rawStart!, rawEnd: rawEnd!, effectiveWindow: Object.freeze(effectiveWindow) });
}
