import type { OperationalState } from "../contracts";
import type { TaskInput, TimeWindow } from "../../types";
export type ORCPlanningEntryOperationalRole = "productive_task" | "meal_break_placeholder" | "global_break_placeholder" | "space_break_placeholder" | "non_operational_placeholder";
const text = (value: unknown): string => typeof value === "string" ? value.toLowerCase() : "";
const bool = (value: unknown): boolean => value === true || value === "true";
const sameWindow = (entry: { startPlanned?: string | null; endPlanned?: string | null }, win?: TimeWindow | null): boolean => entry.startPlanned === win?.start && entry.endPlanned === win?.end;
export function classifyORCPlanningEntryOperationalRole(args: { entry?: OperationalState["planning"][number] | null; task?: TaskInput | Record<string, unknown> | null; mealWindow?: TimeWindow | null; source?: Record<string, unknown> | null }): ORCPlanningEntryOperationalRole {
  const entry = args.entry ?? null; const task = (args.task ?? {}) as Record<string, unknown>; const source = args.source ?? {};
  const fields = [task.kind, task.type, task.category, task.templateCode, task.status, task.templateName, task.name, task.breakKind, source.kind, source.type, source.category].map(text).join(" ");
  const placeholder = bool(task.isPlaceholder) || bool(task.nonOperational) || bool(task.planningOnly) || bool(task.blockingOnly) || bool(source.isPlaceholder) || bool(source.nonOperational) || bool(source.planningOnly) || bool(source.blockingOnly) || Number(task.id ?? entry?.taskId) < 0;
  const explicitBreak = bool(task.isBreak) || bool(source.isBreak) || /(^|[_\s-])(break|pause|descanso)([_\s-]|$)/i.test(fields);
  const explicitMeal = bool(task.isMeal) || bool(source.isMeal) || /(^|[_\s-])(meal|comida|lunch|sodexo)([_\s-]|$)/i.test(fields) || text(task.breakKind).includes("meal");
  const explicitBlocker = bool(task.blocksSpace) || bool(task.spaceBlocker) || bool(task.blockingOnly) || bool(source.blocksSpace) || bool(source.spaceBlocker) || bool(source.blockingOnly);
  if (explicitMeal && (placeholder || explicitBreak || sameWindow(entry ?? {}, args.mealWindow))) return "meal_break_placeholder";
  if (explicitBreak && explicitBlocker && (task.spaceId != null || entry?.spaceId != null)) return "space_break_placeholder";
  if (explicitBreak && placeholder) return "global_break_placeholder";
  if (placeholder && (bool(task.nonOperational) || bool(task.planningOnly) || bool(source.nonOperational) || bool(source.planningOnly))) return "non_operational_placeholder";
  return "productive_task";
}
export const isORCProductiveRole = (role: ORCPlanningEntryOperationalRole): boolean => role === "productive_task";
export const isORCSpaceBlockingRole = (role: ORCPlanningEntryOperationalRole): boolean => role === "productive_task" || role === "space_break_placeholder";
