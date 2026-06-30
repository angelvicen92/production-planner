import type { OperationalState, ValidationViolationDetail } from "../contracts";

export type ScopedHardBreakType = "global" | "space" | "contestant" | "itinerant_team" | "resource";
export interface ScopedHardBreak {
  readonly start: string;
  readonly end: string;
  readonly code: string;
  readonly kind: string;
  readonly scopeType: ScopedHardBreakType;
  readonly spaceId: number | null;
  readonly contestantId: number | null;
  readonly itinerantTeamId: number | null;
  readonly resourceIds: readonly number[];
  readonly sourceId: string | null;
  readonly label: string | null;
}

type PlanningEntry = OperationalState["planning"][number];
type Task = OperationalState["tasks"][number];

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? value as Record<string, unknown> : {});
const finiteNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const sourceIdOf = (value: unknown): string | null => {
  const id = asRecord(value).id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
};
const labelOf = (value: unknown): string | null => typeof asRecord(value).label === "string" ? asRecord(value).label as string : null;
const resourceIdsOf = (value: unknown): number[] => {
  const record = asRecord(value);
  const ids = [finiteNumber(record.resourceId), finiteNumber(record.resourceItemId), ...(Array.isArray(record.resourceIds) ? record.resourceIds.map(finiteNumber) : [])]
    .filter((item): item is number => item != null);
  return [...new Set(ids)].sort((a, b) => a - b);
};

function protectedBreakHardSignal(value: unknown): boolean {
  const record = asRecord(value);
  return record.hard === true || record.isHard === true || record.hardConstraint === true || record.kind === "protected" || record.kind === "global";
}

function scopedBreak(base: Omit<ScopedHardBreak, "sourceId" | "label">, source?: unknown): ScopedHardBreak {
  return { ...base, resourceIds: [...base.resourceIds], sourceId: sourceIdOf(source), label: labelOf(source) };
}

export function configuredHardBreaks(snapshot: OperationalState): ScopedHardBreak[] {
  const availability = snapshot.availability;
  const breaks: ScopedHardBreak[] = [];
  for (const key of ["meal", "actualMeal", "mealWindow"] as const) {
    const window = availability?.[key];
    if (window?.start && window?.end) breaks.push(scopedBreak({ start: window.start, end: window.end, code: "PLANNING_CROSSES_HARD_MEAL_BREAK", kind: "meal", scopeType: "global", spaceId: null, contestantId: null, itinerantTeamId: null, resourceIds: [] }, window));
  }
  for (const window of availability?.globalHardBreaks ?? []) {
    const kind = typeof asRecord(window).kind === "string" ? asRecord(window).kind as string : "global";
    breaks.push(scopedBreak({ start: window.start, end: window.end, code: "PLANNING_CROSSES_GLOBAL_HARD_BREAK", kind, scopeType: "global", spaceId: null, contestantId: null, itinerantTeamId: null, resourceIds: [] }, window));
  }
  for (const window of availability?.protectedBreaks ?? []) {
    const record = asRecord(window);
    const resourceIds = resourceIdsOf(window);
    const spaceId = finiteNumber(record.spaceId);
    const contestantId = finiteNumber(record.contestantId);
    const itinerantTeamId = finiteNumber(record.itinerantTeamId);
    const kind = typeof record.kind === "string" ? record.kind : "protected";
    if (spaceId != null) breaks.push(scopedBreak({ start: window.start, end: window.end, code: "PLANNING_CROSSES_PROTECTED_HARD_BREAK", kind, scopeType: "space", spaceId, contestantId: null, itinerantTeamId: null, resourceIds: [] }, window));
    else if (contestantId != null) breaks.push(scopedBreak({ start: window.start, end: window.end, code: "PLANNING_CROSSES_PROTECTED_HARD_BREAK", kind, scopeType: "contestant", spaceId: null, contestantId, itinerantTeamId: null, resourceIds: [] }, window));
    else if (itinerantTeamId != null) breaks.push(scopedBreak({ start: window.start, end: window.end, code: "PLANNING_CROSSES_PROTECTED_HARD_BREAK", kind, scopeType: "itinerant_team", spaceId: null, contestantId: null, itinerantTeamId, resourceIds: [] }, window));
    else if (resourceIds.length > 0) breaks.push(scopedBreak({ start: window.start, end: window.end, code: "PLANNING_CROSSES_PROTECTED_HARD_BREAK", kind, scopeType: "resource", spaceId: null, contestantId: null, itinerantTeamId: null, resourceIds }, window));
    else if (protectedBreakHardSignal(window)) breaks.push(scopedBreak({ start: window.start, end: window.end, code: "PLANNING_CROSSES_PROTECTED_HARD_BREAK", kind, scopeType: "global", spaceId: null, contestantId: null, itinerantTeamId: null, resourceIds: [] }, window));
  }
  return breaks;
}

export function hardBreakAppliesToPlanningEntry(br: ScopedHardBreak, entry: PlanningEntry, task?: Task | null): boolean {
  if (br.scopeType === "global") return true;
  if (br.scopeType === "space") return (entry.spaceId ?? null) === br.spaceId;
  if (br.scopeType === "contestant") return (task?.contestantId ?? null) === br.contestantId;
  if (br.scopeType === "itinerant_team") return (task?.itinerantTeamId ?? null) === br.itinerantTeamId;
  const assigned = [...(entry.assignedResourceIds ?? []), ...((task as any)?.assignedResourceIds ?? [])];
  return br.resourceIds.some((id) => assigned.includes(id));
}

export function protectedBreakDiagnostic(br: ScopedHardBreak): { message: string; diagnosticHint: string } {
  if (br.scopeType === "space") return { message: `Task overlaps protected break scoped to space ${br.spaceId}.`, diagnosticHint: "Task overlaps a space-scoped protected break. Verify whether the task space matches the break space and whether V4 should avoid this space window." };
  if (br.scopeType === "contestant") return { message: `Task overlaps protected break scoped to contestant ${br.contestantId}.`, diagnosticHint: "Task overlaps a contestant-scoped protected break. Verify contestant availability mapping." };
  if (br.scopeType === "itinerant_team") return { message: `Task overlaps protected break scoped to itinerant team ${br.itinerantTeamId}.`, diagnosticHint: "Task overlaps an itinerant-team-scoped protected break. Verify itinerant team availability mapping." };
  if (br.scopeType === "resource") return { message: `Task overlaps protected break scoped to resource(s) ${br.resourceIds.join(", ")}.`, diagnosticHint: "Task overlaps a resource-scoped protected break. Verify resource assignment mapping and whether V4 should avoid this resource window." };
  return { message: "Task overlaps a global protected hard break.", diagnosticHint: "Task overlaps a global protected hard break. Verify whether this break should be global." };
}

export function sampleViolationDetailsByCode(details: readonly ValidationViolationDetail[], options: { maxTotal?: number; minPerCode?: number } = {}): ValidationViolationDetail[] {
  const maxTotal = Math.max(0, Math.floor(options.maxTotal ?? 20));
  const minPerCode = Math.max(1, Math.floor(options.minPerCode ?? 2));
  if (maxTotal === 0 || details.length === 0) return [];
  const stable = [...details].map((detail, index) => ({ detail, index }));
  const byCode = new Map<string, typeof stable>();
  for (const item of stable) if (item.detail.code !== "VALIDATION_DETAILS_TRUNCATED") byCode.set(item.detail.code, [...(byCode.get(item.detail.code) ?? []), item]);
  const codes = [...byCode.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([code]) => code);
  const selected = new Map<number, ValidationViolationDetail>();
  for (const code of codes) {
    for (const item of (byCode.get(code) ?? []).slice(0, minPerCode)) {
      if (selected.size >= maxTotal) break;
      selected.set(item.index, item.detail);
    }
    if (selected.size >= maxTotal) break;
  }
  for (const item of stable) {
    if (selected.size >= maxTotal) break;
    if (item.detail.code === "VALIDATION_DETAILS_TRUNCATED") continue;
    selected.set(item.index, item.detail);
  }
  if (selected.size < maxTotal) for (const item of stable) { if (selected.size >= maxTotal) break; selected.set(item.index, item.detail); }
  return [...selected.entries()].sort((a, b) => a[0] - b[0]).map(([, detail]) => detail);
}

export function dominantViolationCodes(details: readonly ValidationViolationDetail[], fallback: readonly string[]): string[] {
  const counts: Record<string, number> = {};
  const source = details.length > 0 ? details.map((item) => item.code).filter((code) => code !== "VALIDATION_DETAILS_TRUNCATED") : fallback;
  for (const code of source) counts[code] = (counts[code] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code]) => code);
}
