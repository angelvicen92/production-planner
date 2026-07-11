import type { Candidate, OperationalState } from "../contracts";
import { deepFreeze } from "../immutability";
import { auditBaselineRepairClosurePreview, buildBaselineRepairClosurePreview, type ClosureBlockReason } from "./baselineOverlapRepairConflictClosure";

export type BaselineRepairCandidateSource = "simple_variant" | "conflict_closure";

export interface BaselineRepairCandidateAdmissionResult {
  previewClean: boolean;
  residualConflictCount: number;
  residualConflictCodes: string[];
  residualConflictTaskPairs: number[][];
  assignmentFingerprint: string;
  candidateSource: BaselineRepairCandidateSource;
  rejectedReason: string | null;
  readOnly: true;
}

const toMinutes = (v: unknown): number | null => {
  if (typeof v !== "string" || !/^\d{2}:\d{2}$/.test(v)) return null;
  const [h, m] = v.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export function fingerprintBaselineRepairAssignments(candidate: Candidate): string {
  return JSON.stringify([...(candidate.assignments ?? [])].map((a: any) => ({
    taskId: Number(a.taskId),
    startPlanned: String(a.startPlanned ?? ""),
    endPlanned: String(a.endPlanned ?? ""),
    spaceId: a.spaceId ?? null,
    resourceIds: [...(a.resourceIds ?? [])].map(Number).filter(Number.isFinite).sort((x, y) => x - y),
  })).sort((a, b) => a.taskId - b.taskId || a.startPlanned.localeCompare(b.startPlanned) || a.endPlanned.localeCompare(b.endPlanned) || String(a.spaceId).localeCompare(String(b.spaceId))));
}

export function admitBaselineRepairCandidate(args: {
  operationalState: OperationalState;
  candidate: Candidate;
  candidateSource: BaselineRepairCandidateSource;
  originalConflictTaskIds: readonly number[];
  displacedTaskIds?: readonly number[];
}): BaselineRepairCandidateAdmissionResult {
  const assignmentFingerprint = fingerprintBaselineRepairAssignments(args.candidate);
  const assignments = new Map<number, { start: number; end: number }>();
  for (const a of args.candidate.assignments ?? []) {
    const start = toMinutes((a as any).startPlanned);
    const end = toMinutes((a as any).endPlanned);
    if (!Number.isFinite(Number((a as any).taskId)) || start == null || end == null || end <= start) {
      return deepFreeze({ previewClean: false, residualConflictCount: 1, residualConflictCodes: ["invalid_assignment"], residualConflictTaskPairs: [], assignmentFingerprint, candidateSource: args.candidateSource, rejectedReason: "invalid_assignment", readOnly: true });
    }
    assignments.set(Number((a as any).taskId), { start, end });
  }
  const moved = (args.candidate.metadata as any)?.movedTaskIds;
  const focus = new Set<number>([
    ...args.originalConflictTaskIds.map(Number).filter(Number.isFinite),
    ...(Array.isArray(moved) ? moved : []).map(Number).filter(Number.isFinite),
    ...(args.candidate.assignments ?? []).map((a: any) => Number(a.taskId)).filter(Number.isFinite),
    ...(args.displacedTaskIds ?? []).map(Number).filter(Number.isFinite),
  ]);
  const preview = buildBaselineRepairClosurePreview(args.operationalState, assignments);
  const movedTaskIds = new Set(assignments.keys());
  const conflicts = auditBaselineRepairClosurePreview(args.operationalState, preview, focus)
    .filter((c) => !(["protected_task", "locked_task", "outside_workday", "availability_violation", "hard_break_overlap", "meal_overlap"].includes(c.code) && c.taskIds.every((id) => !movedTaskIds.has(id))));
  const codes = [...new Set(conflicts.map((c) => c.code))].sort();
  const pairs = conflicts.map((c) => [...c.taskIds].sort((a, b) => a - b)).filter((p) => p.length > 1).sort((a, b) => a.join("-").localeCompare(b.join("-")));
  const rejectedReason = conflicts[0]?.code ?? null;
  return deepFreeze({ previewClean: conflicts.length === 0, residualConflictCount: conflicts.length, residualConflictCodes: codes, residualConflictTaskPairs: pairs, assignmentFingerprint, candidateSource: args.candidateSource, rejectedReason, readOnly: true });
}

export function incrementReasonCount(counts: Record<string, number>, reason: string | null | undefined) {
  const key = reason ?? "unknown";
  counts[key] = (counts[key] ?? 0) + 1;
}
