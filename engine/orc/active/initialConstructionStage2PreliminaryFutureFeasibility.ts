import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import type { InitialConstructionCanonicalContext } from "../understanding/initialConstructionCanonicalContext";

const CHECKED = ["contestant_remaining_load", "fixed_resource_inventory"] as const;
const UNCOVERED = ["future_space_capacity", "future_itinerant_team_capacity", "future_camera_capacity", "future_zone_changes", "future_setups", "pending_dependency_chains"] as const;
const min = (s?: string | null): number | null => /^\d{2}:\d{2}$/.test(String(s ?? "")) ? Number(String(s).slice(0, 2)) * 60 + Number(String(s).slice(3)) : null;
const dur = (t: any): number | null => { const n = Number(t?.durationOverrideMin ?? t?.durationMin ?? t?.durationMinutes ?? t?.duration); return Number.isFinite(n) && n > 0 ? n : null; };
const ids = (v: any): number[] => Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : v != null ? [Number(v)].filter(Number.isFinite) : [];
const uniq = (xs: readonly number[]) => [...new Set(xs.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
const fp = (x: unknown) => createHash("sha256").update(stableStringify(x)).digest("hex");

type Interval = { start: number; end: number; taskId: number };

function normalizedAssignment(a: any): CandidateAssignment | any { return { taskId: Number(a.taskId), startPlanned: a.startPlanned ?? a.start ?? null, endPlanned: a.endPlanned ?? a.end ?? null, spaceId: a.spaceId ?? null, resourceIds: ids(a.resourceIds ?? a.assignedResourceIds) }; }
function taskRequiresContestant(task: any, contestantId: number): boolean { return Number(task?.contestantId) === contestantId; }
function contestantsOfTasks(tasks: readonly any[]): number[] { return uniq(tasks.map((t: any) => Number(t.contestantId)).filter((v) => Number.isFinite(v) && v > 0)); }
function clipMerge(assignments: readonly any[], tasksById: Map<number, any>, contestantId: number, avStart: number, avEnd: number) {
  const raw: Interval[] = [];
  for (const a0 of assignments) {
    const a = normalizedAssignment(a0); const task = tasksById.get(Number(a.taskId));
    if (!taskRequiresContestant(task, contestantId)) continue;
    const s = min(a.startPlanned), e = min(a.endPlanned);
    if (s == null || e == null || e <= s) continue;
    const start = Math.max(avStart, s), end = Math.min(avEnd, e);
    if (end > start) raw.push({ start, end, taskId: Number(a.taskId) });
  }
  raw.sort((a, b) => a.start - b.start || a.end - b.end || a.taskId - b.taskId);
  const merged: { start: number; end: number; taskIds: number[] }[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) { last.end = Math.max(last.end, r.end); last.taskIds = uniq([...last.taskIds, r.taskId]); }
    else merged.push({ start: r.start, end: r.end, taskIds: [r.taskId] });
  }
  return { merged, minutes: merged.reduce((s, i) => s + i.end - i.start, 0), taskIds: uniq(raw.map((r) => r.taskId)) };
}

function resourceItemIdOf(item: any): number | null { const n = Number(item?.resourceItemId ?? item?.id); return Number.isFinite(n) ? n : null; }

export function evaluateInitialConstructionStage2PreliminaryFutureFeasibility(args: { originInput: EngineInput; originOperationalState: OperationalState; baseProvisionalAssignments?: readonly any[]; branchAssignments?: readonly any[]; canonicalContext?: InitialConstructionCanonicalContext | null; constructiveTargetTaskIds: readonly number[]; }) {
  const input: any = args.originInput;
  const tasks = [...(input.tasks ?? [])].sort((a: any, b: any) => Number(a.id) - Number(b.id));
  const tasksById = new Map(tasks.map((t: any) => [Number(t.id), t]));
  const targetSet = new Set(uniq(args.constructiveTargetTaskIds));
  const base = [...(args.baseProvisionalAssignments ?? [])].map(normalizedAssignment);
  const branch = [...(args.branchAssignments ?? [])].map(normalizedAssignment);
  const assigned = new Set([...base, ...branch, ...(args.originOperationalState?.planning ?? []).map(normalizedAssignment)].map((a: any) => Number(a.taskId)).filter(Number.isFinite));
  const pendingTargets = tasks.filter((t: any) => targetSet.has(Number(t.id)) && (t.status === "pending" || t.status === "interrupted" || t.status == null) && !assigned.has(Number(t.id)));
  const hardProofs: string[] = [], risks: string[] = [];
  const contestantCapacityEvidence: any[] = [];
  const resourceInventoryEvidence: any[] = [];
  const uncovered = new Set<string>(UNCOVERED as readonly string[]);

  for (const contestantId of contestantsOfTasks([...pendingTargets, ...base.map((a: any) => tasksById.get(Number(a.taskId))).filter(Boolean), ...branch.map((a: any) => tasksById.get(Number(a.taskId))).filter(Boolean)])) {
    const availability = input.contestantAvailabilityById?.[contestantId] ?? input.contestantAvailabilityById?.[String(contestantId)] ?? null;
    const avStart = min(availability?.start ?? input.workDay?.start), avEnd = min(availability?.end ?? input.workDay?.end);
    const pendingForContestant = pendingTargets.filter((t: any) => taskRequiresContestant(t, contestantId));
    const durations = pendingForContestant.map(dur);
    const complete = avStart != null && avEnd != null && avEnd > avStart && durations.every((d) => d != null);
    const occupied = complete ? clipMerge([...(args.originOperationalState?.planning ?? []), ...base, ...branch], tasksById, contestantId, avStart!, avEnd!) : { merged: [], minutes: 0, taskIds: [] as number[] };
    const pendingLoad = durations.reduce((sum: number, d) => sum + (d ?? 0), 0);
    const span = complete ? avEnd! - avStart! : null;
    const free = span == null ? null : Math.max(0, span - occupied.minutes);
    const excess = free == null ? null : pendingLoad - free;
    const evidence = { contestantId, availabilityStart: availability?.start ?? input.workDay?.start ?? null, availabilityEnd: availability?.end ?? input.workDay?.end ?? null, availabilitySpanMinutes: span, knownOccupiedMinutes: occupied.minutes, optimisticFreeMinutes: free, pendingMandatoryTargetLoadMinutes: pendingLoad, excessMinutes: excess != null ? Math.max(0, excess) : null, pendingTargetTaskIds: pendingForContestant.map((t: any) => Number(t.id)).sort((a: number, b: number) => a - b), capacityOccupyingAssignmentTaskIds: occupied.taskIds, proofComplete: complete, readOnly: true };
    contestantCapacityEvidence.push(evidence);
    if (!complete) risks.push("CONTESTANT_CAPACITY_EVIDENCE_INCOMPLETE");
    else if (excess! > 0) { hardProofs.push("CONTESTANT_REMAINING_LOAD_EXCEEDS_AVAILABILITY"); }
    else risks.push("CONTESTANT_CAPACITY_RISK");
  }

  const availableResourceItemIds = new Set((input.planResourceItems ?? []).filter((i: any) => i.isAvailable !== false).map(resourceItemIdOf).filter((x: any) => x != null));
  for (const task of pendingTargets) {
    const byItem = task.resourceRequirements?.byItem ?? {};
    for (const resourceItemId of Object.keys(byItem).map(Number).filter(Number.isFinite).sort((a, b) => a - b)) {
      const ok = availableResourceItemIds.has(resourceItemId);
      const ev = { taskId: Number(task.id), resourceItemId, requirementKind: "byItem", officialInventoryUnitAvailable: ok, proofComplete: true, readOnly: true };
      resourceInventoryEvidence.push(ev);
      if (!ok) hardProofs.push("RESOURCE_WITHOUT_INVENTORY");
    }
    for (const group of task.resourceRequirements?.anyOf ?? []) {
      const alternatives = ids(group.resourceItemIds).sort((a, b) => a - b);
      const ok = alternatives.some((id) => availableResourceItemIds.has(id));
      resourceInventoryEvidence.push({ taskId: Number(task.id), requirementKind: "anyOf", alternativeResourceItemIds: alternatives, officialInventoryUnitAvailable: ok, proofComplete: alternatives.length > 0, readOnly: true });
      if (!ok) risks.push("RESOURCE_ALTERNATIVE_INVENTORY_RISK");
    }
  }

  const hardProofReasonCodes = [...new Set(hardProofs)].sort();
  const riskReasonCodes = [...new Set(risks)].sort();
  const status = hardProofReasonCodes.length > 0 ? "INFEASIBLE" : "UNKNOWN";
  const result: any = { status, checkedDimensions: [...CHECKED], uncoveredDimensions: [...uncovered].sort(), hardProofReasonCodes, riskReasonCodes, contestantCapacityEvidence: contestantCapacityEvidence.sort((a, b) => a.contestantId - b.contestantId), resourceInventoryEvidence: resourceInventoryEvidence.sort((a, b) => Number(a.taskId) - Number(b.taskId) || Number(a.resourceItemId ?? 0) - Number(b.resourceItemId ?? 0) || String(a.requirementKind).localeCompare(String(b.requirementKind))), hardProofCount: hardProofReasonCodes.length, riskSignalCount: riskReasonCodes.length, confidence: hardProofReasonCodes.length ? "medium" : "low", preliminary: true, fingerprint: "", readOnly: true };
  result.fingerprint = fp({ ...result, fingerprint: undefined });
  return deepFreeze(result) as Readonly<typeof result>;
}
