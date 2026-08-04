import type { EngineInput, ProtectedBreakInput, TimeWindow } from "../../types";
import type { Window } from "../contracts";
import { engineTimeToMinute } from "./engineTime";

export type ParticipantMealDefect = "INVALID_ID" | "INVALID_PARTICIPANT" | "INVALID_TIME" | "MIXED_SCOPE" | "MISSING_PARTICIPANT" | "MISSING_AVAILABILITY" | "OUTSIDE_AVAILABILITY" | "OVERLAP" | "EMPTY_AVAILABILITY";

export interface ResolvedParticipantMeal {
  readonly participantId: number;
  readonly canonicalParticipantId: string;
  readonly breakId: string;
  readonly canonicalBreakId: string;
  readonly interval: Readonly<TimeWindow>;
  readonly minuteInterval: Readonly<Window>;
  readonly sourcePath: string;
  readonly status: "SUPPORTED" | "UNSUPPORTED";
  readonly defects: readonly ParticipantMealDefect[];
  readonly readOnly: true;
}

export interface ParticipantScopedMealsResolution {
  readonly meals: readonly ResolvedParticipantMeal[];
  readonly availabilityByParticipantId: ReadonlyMap<number, readonly Window[]>;
  readonly readOnly: true;
}

const compare = (a: string, b: string): number => a.localeCompare(b, "en");
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(freeze);
  }
  return value;
};

export function resolveParticipantScopedMeals(input: EngineInput): ParticipantScopedMealsResolution {
  const entries: Array<{ entry: ProtectedBreakInput; sourcePath: string }> = [];
  if (input.actualMeal?.kind === "meal" && input.actualMeal.contestantId != null) entries.push({ entry: input.actualMeal, sourcePath: "actualMeal" });
  input.protectedBreaks?.forEach((entry, index) => {
    if (entry.kind === "meal" && entry.contestantId != null) entries.push({ entry, sourcePath: `protectedBreaks.${index}` });
  });
  const participantIds = new Set(input.tasks.filter((task) => task.contestantId != null).map((task) => task.contestantId));
  const seenIds = new Set<string>();
  const meals = entries.map(({ entry, sourcePath }): ResolvedParticipantMeal => {
    const defects: ParticipantMealDefect[] = [];
    const id = entry.id == null || entry.id === "" ? "" : String(entry.id);
    if (!id || seenIds.has(id)) defects.push("INVALID_ID");
    if (id) seenIds.add(id);
    if (!Number.isInteger(entry.contestantId) || Number(entry.contestantId) <= 0) defects.push("INVALID_PARTICIPANT");
    const participantId = Number(entry.contestantId);
    if (!participantIds.has(participantId)) defects.push("MISSING_PARTICIPANT");
    if (entry.kind !== "meal" || entry.spaceId != null || entry.zoneId != null || entry.itinerantTeamId != null) defects.push("MIXED_SCOPE");
    let start = -1, end = -1;
    try { start = engineTimeToMinute(entry.start); end = engineTimeToMinute(entry.end); } catch { defects.push("INVALID_TIME"); }
    if (start >= end && !defects.includes("INVALID_TIME")) defects.push("INVALID_TIME");
    const availability = input.contestantAvailabilityById?.[participantId];
    let availableStart = -1, availableEnd = -1;
    if (!availability) defects.push("MISSING_AVAILABILITY");
    else try { availableStart = engineTimeToMinute(availability.start); availableEnd = engineTimeToMinute(availability.end); } catch { defects.push("MISSING_AVAILABILITY"); }
    if (start >= 0 && availableStart >= 0 && (start < availableStart || end > availableEnd)) defects.push("OUTSIDE_AVAILABILITY");
    return { participantId, canonicalParticipantId: `participant:${participantId}`, breakId: id, canonicalBreakId: `break:${id}`, interval: { start: entry.start, end: entry.end }, minuteInterval: { start, end }, sourcePath, status: defects.length ? "UNSUPPORTED" : "SUPPORTED", defects: [...new Set(defects)].sort(compare), readOnly: true };
  }).sort((a, b) => a.participantId - b.participantId || a.minuteInterval.start - b.minuteInterval.start || a.minuteInterval.end - b.minuteInterval.end || compare(a.breakId, b.breakId));

  for (let index = 1; index < meals.length; index++) {
    const previous = meals[index - 1], current = meals[index];
    if (previous.participantId === current.participantId && previous.minuteInterval.end > current.minuteInterval.start) {
      for (const meal of [previous, current]) if (!meal.defects.includes("OVERLAP")) {
        (meal.defects as ParticipantMealDefect[]).push("OVERLAP");
        (meal as { status: "SUPPORTED" | "UNSUPPORTED" }).status = "UNSUPPORTED";
      }
    }
  }
  const availabilityByParticipantId = new Map<number, readonly Window[]>();
  for (const [rawId, source] of Object.entries(input.contestantAvailabilityById ?? {}).sort(([a], [b]) => Number(a) - Number(b))) {
    const participantId = Number(rawId);
    let windows: Window[];
    try { windows = [{ start: engineTimeToMinute(source.start), end: engineTimeToMinute(source.end) }]; }
    catch { continue; }
    for (const meal of meals.filter((item) => item.participantId === participantId && item.status === "SUPPORTED")) {
      windows = windows.flatMap((item) => item.end <= meal.minuteInterval.start || item.start >= meal.minuteInterval.end ? [item] : [
        ...(item.start < meal.minuteInterval.start ? [{ start: item.start, end: meal.minuteInterval.start }] : []),
        ...(meal.minuteInterval.end < item.end ? [{ start: meal.minuteInterval.end, end: item.end }] : []),
      ]);
    }
    if (windows.length === 0) {
      for (const meal of meals.filter((item) => item.participantId === participantId)) {
        if (!meal.defects.includes("EMPTY_AVAILABILITY")) (meal.defects as ParticipantMealDefect[]).push("EMPTY_AVAILABILITY");
        (meal as { status: "SUPPORTED" | "UNSUPPORTED" }).status = "UNSUPPORTED";
      }
    }
    availabilityByParticipantId.set(participantId, freeze(windows));
  }
  return freeze({ meals, availabilityByParticipantId, readOnly: true });
}
