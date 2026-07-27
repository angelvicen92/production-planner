import type { Window } from "./contracts";
export const hm = (value: string): number => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
export const formatMinute = (minute: number | null): string | null => minute === null ? null : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const contains = (windows: Window[], start: number, end: number): boolean => windows.some(w => w.start <= start && end <= w.end);
export const overlaps = (a: Window, b: Window): boolean => a.start < b.end && b.start < a.end;
