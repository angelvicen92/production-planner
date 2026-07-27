import type { Window } from "./contracts";

export function hm(value: string): number {
  const parts = value.split(":");
  const hours = Number(parts[0] ?? Number.NaN);
  const minutes = Number(parts[1] ?? Number.NaN);
  return hours * 60 + minutes;
}

export function formatMinute(minute: number | null): string | null {
  if (minute === null) return null;
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function contains(windows: Window[], start: number, end: number): boolean {
  return windows.some((window) => window.start <= start && end <= window.end);
}

export function overlaps(first: Window, second: Window): boolean {
  return first.start < second.end && second.start < first.end;
}
