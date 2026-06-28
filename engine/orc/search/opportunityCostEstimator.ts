import type { Candidate, CandidateAssignment, Evidence, OperationalState, ORCRecord } from "../contracts";
import { deepFreeze } from "../immutability";

export interface OpportunityCostFactor extends ORCRecord {
  readonly name: "scarce-window-consumption" | "future-alternative-reduction" | "resource-pressure" | "reassignment-flexibility-loss";
  readonly value: number;
  readonly weight: number;
  readonly contribution: number;
  readonly explanation: string;
}

export interface OpportunityCostEstimate extends ORCRecord {
  readonly candidateId: string;
  readonly estimatedCost: number;
  readonly factors: readonly OpportunityCostFactor[];
  readonly deterministic: true;
  readonly readOnly: true;
}

export interface OpportunityCostEstimationResult {
  readonly estimates: readonly OpportunityCostEstimate[];
  readonly evidence: readonly Evidence[];
}

const SOURCE = "orc-opportunity-cost-estimator";
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const finite = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function parseMinutes(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;
  return hours * 60 + minutes;
}

function durationMinutes(assignment: CandidateAssignment): number {
  const start = parseMinutes(assignment.startPlanned);
  const end = parseMinutes(assignment.endPlanned);
  return start === null || end === null || end <= start ? 0 : end - start;
}

function assignmentSignature(assignment: CandidateAssignment): string {
  return [assignment.taskId, assignment.startPlanned ?? "", assignment.endPlanned ?? "", assignment.spaceId ?? "", [...assignment.resourceIds].sort((a, b) => a - b).join(",")].join(":");
}

function estimateCandidate(candidate: Candidate, state?: OperationalState | null): OpportunityCostEstimate {
  const assignments = [...candidate.assignments].sort((a, b) => assignmentSignature(a).localeCompare(assignmentSignature(b)));
  const totalDuration = assignments.reduce((sum, assignment) => sum + durationMinutes(assignment), 0);
  const workStart = parseMinutes(state?.workDay?.start ?? null);
  const workEnd = parseMinutes(state?.workDay?.end ?? null);
  const workDuration = workStart === null || workEnd === null || workEnd <= workStart ? 8 * 60 : workEnd - workStart;
  const resourceUse = new Map<number, number>();
  const spaceUse = new Map<number, number>();
  for (const assignment of assignments) {
    const duration = durationMinutes(assignment);
    for (const resourceId of assignment.resourceIds) resourceUse.set(resourceId, (resourceUse.get(resourceId) ?? 0) + duration);
    if (typeof assignment.spaceId === "number") spaceUse.set(assignment.spaceId, (spaceUse.get(assignment.spaceId) ?? 0) + duration);
  }
  const scarceWindow = clamp01(totalDuration / Math.max(1, workDuration));
  const alternativeReduction = clamp01(assignments.filter((item) => item.startPlanned && item.endPlanned).length / Math.max(1, assignments.length || 1));
  const maxResourcePressure = clamp01(Math.max(0, ...resourceUse.values()) / Math.max(1, workDuration));
  const exclusiveSpacePressure = clamp01([...spaceUse.entries()].reduce((sum, [spaceId, minutes]) => sum + (state?.spaces.exclusiveById?.[spaceId] ? minutes : minutes * 0.5), 0) / Math.max(1, workDuration));
  const resourcePressure = clamp01(Math.max(maxResourcePressure, exclusiveSpacePressure));
  const reassignmentFlexibilityLoss = clamp01(assignments.reduce((sum, assignment) => sum + assignment.resourceIds.length + (typeof assignment.spaceId === "number" ? 1 : 0), 0) / Math.max(1, assignments.length * 4));
  const rawFactors: Array<[OpportunityCostFactor["name"], number, number, string]> = [
    ["scarce-window-consumption", scarceWindow, 0.3, "Share of known operating window consumed by the candidate assignments."],
    ["future-alternative-reduction", alternativeReduction, 0.25, "Share of assignments with fixed start/end information before simulation."],
    ["resource-pressure", resourcePressure, 0.25, "Maximum deterministic pressure introduced on resources or spaces."],
    ["reassignment-flexibility-loss", reassignmentFlexibilityLoss, 0.2, "Assignments requiring specific resources or spaces reduce later reassignment freedom."],
  ];
  const factors = rawFactors.map(([name, value, weight, explanation]) => deepFreeze({ name, value: round(value), weight, contribution: round(value * weight), explanation }) as OpportunityCostFactor);
  return deepFreeze({ candidateId: candidate.id, estimatedCost: round(factors.reduce((sum, factor) => sum + factor.contribution, 0)), factors, deterministic: true, readOnly: true }) as OpportunityCostEstimate;
}

export function estimateOpportunityCosts(candidates: readonly Candidate[], state?: OperationalState | null, createdAt: string | null = null): OpportunityCostEstimationResult {
  const estimates = [...(candidates ?? [])].map((candidate) => estimateCandidate(candidate, state));
  const evidence = estimates.map((estimate) => deepFreeze({
    id: `evidence:${SOURCE}:${estimate.candidateId}`,
    source: SOURCE,
    kind: "candidate-opportunity-cost-estimated",
    subjectId: estimate.candidateId,
    createdAt,
    data: estimate,
  }) as Evidence);
  return deepFreeze({ estimates, evidence }) as OpportunityCostEstimationResult;
}

export function opportunityCostByCandidateId(estimates: readonly OpportunityCostEstimate[]): ReadonlyMap<string, OpportunityCostEstimate> {
  return new Map(estimates.map((estimate) => [estimate.candidateId, estimate]));
}
