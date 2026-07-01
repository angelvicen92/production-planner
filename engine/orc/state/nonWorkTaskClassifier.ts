import type { OperationalState } from "../contracts";
import type { TaskInput, TimeWindow } from "../../types";
export type ORCPlanningEntryOperationalRole = "productive_task" | "meal_break_placeholder" | "arrival_placeholder" | "space_break_placeholder" | "global_break_placeholder" | "non_operational_placeholder" | "unknown";
const text = (value: unknown): string => typeof value === "string" ? value.toLowerCase() : "";
const bool = (value: unknown): boolean => value === true || value === "true";
const toMinutes = (value: unknown): number | null => { if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null; const [h, m] = value.split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const overlapsWindow = (entry: { startPlanned?: string | null; endPlanned?: string | null }, win?: TimeWindow | null): boolean => { const a = toMinutes(entry.startPlanned), b = toMinutes(entry.endPlanned), c = toMinutes(win?.start), d = toMinutes(win?.end); return a != null && b != null && c != null && d != null && a < d && c < b; };
export function classifyORCPlanningEntryOperationalRole(args: { entry?: OperationalState["planning"][number] | null; task?: TaskInput | Record<string, unknown> | null; mealWindow?: TimeWindow | null; source?: Record<string, unknown> | null }): ORCPlanningEntryOperationalRole {
  const entry = args.entry ?? null; const task = (args.task ?? {}) as Record<string, unknown>; const source = args.source ?? {};
  const fields = [task.kind, task.type, task.category, task.templateCode, task.code, task.status, task.templateName, task.name, task.breakKind, source.kind, source.type, source.category, source.templateCode, source.code, source.name].map(text).join(" ");
  const explicitProductive = bool(task.productive) || bool(task.countsAsWork) || bool(source.productive) || bool(source.countsAsWork);
  const hasResources = (entry?.assignedResourceIds?.length ?? 0) > 0 || Array.isArray(task.assignedResourceIds) && task.assignedResourceIds.length > 0;
  const negativeId = Number(task.id ?? entry?.taskId) < 0;
  const placeholder = bool(task.isPlaceholder) || bool(task.nonOperational) || bool(task.planningOnly) || bool(task.blockingOnly) || bool(source.isPlaceholder) || bool(source.nonOperational) || bool(source.planningOnly) || bool(source.blockingOnly);
  const explicitBreak = bool(task.isBreak) || bool(source.isBreak) || /(^|[_\s-])(break|pause|pausa|descanso)([_\s-]|$)/i.test(fields);
  const explicitMeal = bool(task.isMeal) || bool(source.isMeal) || /(^|[_\s-])(meal|comida|lunch|sodexo)([_\s-]|$)/i.test(fields) || text(task.breakKind).includes("meal");
  const explicitArrival = bool(task.isArrival) || bool(source.isArrival) || /(^|[_\s-])(arrival|call time|calltime|check-in|checkin|entrada|llegada|cita|citacion|citación|espera|standby)([_\s-]|$)/i.test(fields);
  const explicitVisual = /(^|[_\s-])(placeholder|visual block|visual_block|bloqueo visual)([_\s-]|$)/i.test(fields);
  const explicitBlocker = bool(task.blocksSpace) || bool(task.spaceBlocker) || bool(task.blockingOnly) || bool(source.blocksSpace) || bool(source.spaceBlocker) || bool(source.blockingOnly);
  if (explicitProductive) return "productive_task";
  if ((explicitMeal || (negativeId && overlapsWindow(entry ?? {}, args.mealWindow) && !hasResources)) && (placeholder || explicitBreak || negativeId || overlapsWindow(entry ?? {}, args.mealWindow))) return "meal_break_placeholder";
  if (explicitArrival && (placeholder || negativeId || !hasResources)) return "arrival_placeholder";
  if ((explicitBreak || explicitVisual) && explicitBlocker && (task.spaceId != null || entry?.spaceId != null)) return "space_break_placeholder";
  if (explicitBreak && (placeholder || negativeId)) return "global_break_placeholder";
  if ((placeholder || explicitVisual) && (bool(task.nonOperational) || bool(task.planningOnly) || bool(source.nonOperational) || bool(source.planningOnly) || explicitVisual)) return "non_operational_placeholder";
  return "productive_task";
}
export const isORCProductiveRole = (role: ORCPlanningEntryOperationalRole): boolean => role === "productive_task";
export const isORCSpaceBlockingRole = (role: ORCPlanningEntryOperationalRole, blocksSpace?: boolean): boolean => role === "productive_task" || role === "space_break_placeholder" || blocksSpace === true;
