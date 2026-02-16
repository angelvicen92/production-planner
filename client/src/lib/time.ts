export function hhmmToMinutes(time?: string | null): number | null {
  if (!time || typeof time !== "string") return null;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function minutesToHHMM(minutes?: number | null): string {
  if (!Number.isFinite(minutes as number)) return "00:00";
  const safe = Math.max(0, Math.floor(minutes as number));
  const h = Math.floor(safe / 60) % 24;
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}

export function contains(start: number, end: number, point: number): boolean {
  return point >= start && point < end;
}

export function formatRange(start?: string | null, end?: string | null): string {
  const safeStart = start && /^\d{2}:\d{2}$/.test(start) ? start : "--:--";
  const safeEnd = end && /^\d{2}:\d{2}$/.test(end) ? end : "--:--";
  return `${safeStart}–${safeEnd}`;
}

export function sampleEveryFiveMinutes(start: number, end: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const first = Math.floor(start / 5) * 5;
  const points: number[] = [];
  for (let t = first; t <= end; t += 5) points.push(t);
  return points;
}

// Backward compatibility with existing imports
export const timeToMinutes = (time: string) => hhmmToMinutes(time) ?? 0;
export const minutesToTime = (minutes: number) => minutesToHHMM(minutes);
