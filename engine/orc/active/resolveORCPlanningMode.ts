import type { EngineInput, TaskInput } from "../../types";

export type ORCPlanningMode = "INITIAL_CONSTRUCTION" | "REPLANNING" | "IMPROVEMENT";
export interface ORCPlanningModeResolution { planningMode: ORCPlanningMode; planifiableTaskCount: number; assignedPlanifiableTaskCount: number; protectedPlanningCount: number; lockCount: number; reasons: string[]; readOnly: true; }
const hasWindow = (t: TaskInput) => typeof t.startPlanned === "string" && typeof t.endPlanned === "string" && t.startPlanned.length > 0 && t.endPlanned.length > 0;
const isPlanifiable = (t: TaskInput) => t.status !== "cancelled";
export const isORCProtectedTask = (task: TaskInput, input?: Pick<EngineInput,"locks">): boolean => task.status === "done" || task.status === "in_progress" || (input?.locks ?? []).some((l) => Number(l.taskId) === Number(task.id));
export function resolveORCPlanningMode(input: EngineInput): ORCPlanningModeResolution {
  const tasks = [...(input.tasks ?? [])];
  const planifiable = tasks.filter(isPlanifiable);
  const lockCount = input.locks?.length ?? 0;
  const protectedPlanningCount = planifiable.filter((t) => isORCProtectedTask(t, input) && hasWindow(t)).length;
  const hasExecution = planifiable.some((t) => t.status === "done" || t.status === "in_progress");
  const hasPartialProtected = protectedPlanningCount > 0 || lockCount > 0;
  const assignedPlanifiableTaskCount = planifiable.filter(hasWindow).length;
  const completeByAssignment = planifiable.length > 0 && assignedPlanifiableTaskCount === planifiable.length;
  const validFlag = (input as any).canonicalValidation?.result === "VALID" || (input as any).canonicalValidationResult === "VALID" || (input as any).officialPlanningHardValid === true || (input as any).hardValid === true;
  const reasons: string[] = [];
  let planningMode: ORCPlanningMode;
  if (completeByAssignment && validFlag && !hasExecution && lockCount === 0) { planningMode = "IMPROVEMENT"; reasons.push("complete_official_planning_with_canonical_hard_valid_evidence"); }
  else if (hasExecution || hasPartialProtected) { planningMode = "REPLANNING"; if (hasExecution) reasons.push("executed_or_in_progress_tasks_present"); if (hasPartialProtected) reasons.push("locks_or_protected_planning_present"); }
  else { planningMode = "INITIAL_CONSTRUCTION"; reasons.push("pending_planifiable_tasks_without_official_complete_hard_valid_planning"); }
  return { planningMode, planifiableTaskCount: planifiable.length, assignedPlanifiableTaskCount, protectedPlanningCount, lockCount, reasons, readOnly: true };
}
