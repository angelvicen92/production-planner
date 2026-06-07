import type { EngineV3Input } from "./types";

export type SpaceCapacityInterval = {
  start: number;
  end: number;
  taskId?: number;
};

const positiveInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.floor(parsed))
    : null;
};

/** Spaces remain exclusive unless an explicit positive capacity is supplied. */
export const getSpaceCapacity = (
  input: EngineV3Input,
  spaceId: number | null | undefined,
): number => {
  const id = positiveInteger(spaceId);
  if (id === null) return 1;

  const explicit =
    positiveInteger(input.spaceCapacityById?.[id]) ??
    positiveInteger(input.spaceConcurrencyById?.[id]);
  return explicit ?? 1;
};

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
