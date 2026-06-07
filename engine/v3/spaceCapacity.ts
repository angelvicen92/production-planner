import type { EngineV3Input } from "./types";

export type SpaceCapacityInterval = {
  start: number;
  end: number;
  taskId?: number;
};

export type SpaceCapacitySource =
  | "transport_van_capacity"
  | "space_max_concurrency"
  | "default_exclusive";

export type SpaceCapacityResolution = {
  capacity: number;
  capacitySource: SpaceCapacitySource;
};

const positiveInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.floor(parsed))
    : null;
};

const normalizedName = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const resolveTransportSpaceId = (input: EngineV3Input): number | null => {
  const explicit = positiveInteger(input.transportSpaceId);
  if (explicit !== null) return explicit;

  const transportTemplateNames = new Set(
    [input.arrivalTaskTemplateName, input.departureTaskTemplateName]
      .map(normalizedName)
      .filter(Boolean),
  );
  if (transportTemplateNames.size > 0) {
    const taskSpaceIds = new Set<number>();
    for (const task of input.tasks ?? []) {
      if (!transportTemplateNames.has(normalizedName(task.templateName))) continue;
      const taskSpaceId = positiveInteger(task.spaceId);
      if (taskSpaceId !== null) taskSpaceIds.add(taskSpaceId);
    }
    if (taskSpaceIds.size === 1) return taskSpaceIds.values().next().value ?? null;
  }

  // Defensive legacy fallback: old inputs may only identify the space by label.
  const namedMatches = Object.entries(input.spaceNameById ?? {})
    .filter(([, name]) => normalizedName(name) === "transporte")
    .map(([id]) => positiveInteger(id))
    .filter((id): id is number => id !== null);
  return namedMatches.length === 1 ? namedMatches[0] : null;
};

export const getSpaceCapacityResolution = (
  input: EngineV3Input,
  spaceId: number | null | undefined,
): SpaceCapacityResolution => {
  const id = positiveInteger(spaceId);
  if (id === null) return { capacity: 1, capacitySource: "default_exclusive" };

  const transportSpaceId = resolveTransportSpaceId(input);
  const transportCapacity =
    positiveInteger(input.transportVanCapacity) ?? positiveInteger(input.vanCapacity);
  if (transportSpaceId === id && transportCapacity !== null) {
    return {
      capacity: transportCapacity,
      capacitySource: "transport_van_capacity",
    };
  }

  const explicit =
    positiveInteger(input.spaceCapacityById?.[id]) ??
    positiveInteger(input.spaceConcurrencyById?.[id]);
  if (explicit !== null) {
    return { capacity: explicit, capacitySource: "space_max_concurrency" };
  }

  return { capacity: 1, capacitySource: "default_exclusive" };
};

/** Spaces remain exclusive unless an explicit or transport-specific capacity is supplied. */
export const getSpaceCapacity = (
  input: EngineV3Input,
  spaceId: number | null | undefined,
): number => getSpaceCapacityResolution(input, spaceId).capacity;

export const wouldExceedSpaceCapacity = (
  intervals: SpaceCapacityInterval[],
  start: number,
  end: number,
  capacity: number,
): boolean => {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return true;
  const normalizedCapacity = positiveInteger(capacity) ?? 1;
  const events: Array<{ time: number; delta: number }> = [
    { time: start, delta: 1 },
    { time: end, delta: -1 },
  ];
  for (const interval of intervals) {
    if (interval.start >= end || interval.end <= start) continue;
    events.push({ time: Math.max(start, interval.start), delta: 1 });
    events.push({ time: Math.min(end, interval.end), delta: -1 });
  }
  events.sort((a, b) => a.time - b.time || a.delta - b.delta); // End before start at equal timestamps.

  let concurrency = 0;
  for (const event of events) {
    concurrency += event.delta;
    if (concurrency > normalizedCapacity) return true;
  }
  return false;
};

export const findEarliestSpaceCapacityGap = (
  intervals: SpaceCapacityInterval[],
  earliest: number,
  duration: number,
  capacity: number,
): number => {
  let candidate = earliest;
  const normalizedDuration = Math.max(1, duration);
  const normalizedCapacity = positiveInteger(capacity) ?? 1;
  const sorted = [...intervals].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );

  for (let guard = 0; guard < sorted.length + 2; guard += 1) {
    if (
      !wouldExceedSpaceCapacity(
        sorted,
        candidate,
        candidate + normalizedDuration,
        normalizedCapacity,
      )
    ) {
      return candidate;
    }
    const activeEnds = sorted
      .filter(
        (interval) =>
          interval.start < candidate + normalizedDuration &&
          interval.end > candidate,
      )
      .map((interval) => interval.end)
      .filter((end) => end > candidate);
    if (activeEnds.length === 0) return candidate;
    candidate = Math.min(...activeEnds);
  }

  return candidate;
};
