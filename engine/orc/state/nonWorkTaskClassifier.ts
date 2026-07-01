import type { OperationalState } from "../contracts";
import type { TaskInput, TimeWindow } from "../../types";
export type ORCPlanningEntryOperationalRole = "productive_task" | "transport_arrival" | "transport_departure" | "meal_break_placeholder" | "arrival_placeholder" | "call_time_placeholder" | "space_break_placeholder" | "global_break_placeholder" | "non_operational_placeholder" | "unknown";
export type ORCSpaceOccupancyMode = "exclusive" | "shared" | "non_blocking";
export interface ORCOperationalRoleMetadata { role: ORCPlanningEntryOperationalRole; countsAsWork: boolean; blocksSpace: boolean; countsForMainFlow: boolean; countsForResourceLoad: boolean; countsForTalentLoad: boolean; allowsSpaceOverlap: boolean; spaceOccupancyMode: ORCSpaceOccupancyMode; warnings: string[]; readOnly: true; transportGroupCapacity?: number | null; transportGroupingTarget?: number | null; transportGroupingWeight?: number | null; roleSource?: string | null; }
export interface ORCTransportRoleContract { configured: boolean; arrivalTemplateId: number | string | null; departureTemplateId: number | string | null; vehicleCapacity: number | null; arrivalTargetGroupSize?: number | null; departureTargetGroupSize?: number | null; groupingWeight?: number | null; source?: string | null; }
const text = (value: unknown): string => typeof value === "string" ? value.toLowerCase() : "";
const bool = (value: unknown): boolean => value === true || value === "true";
const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const toMinutes = (value: unknown): number | null => { if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null; const [h, m] = value.split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const overlapsWindow = (entry: { startPlanned?: string | null; endPlanned?: string | null }, win?: TimeWindow | null): boolean => { const a = toMinutes(entry.startPlanned), b = toMinutes(entry.endPlanned), c = toMinutes(win?.start), d = toMinutes(win?.end); return a != null && b != null && c != null && d != null && a < d && c < b; };
function roleFlags(role: ORCPlanningEntryOperationalRole, task: Record<string, unknown>, source: Record<string, unknown>, transportContract?: ORCTransportRoleContract | null): ORCOperationalRoleMetadata {
  const warnings: string[] = [];
  const explicitCounts = has(task, "countsAsWork") || has(source, "countsAsWork");
  const explicitBlocks = has(task, "blocksSpace") || has(source, "blocksSpace");
  const allows = bool(task.allowsSimultaneity) || bool(source.allowsSimultaneity) || bool(task.allowsSpaceOverlap) || bool(source.allowsSpaceOverlap);
  const isTransport = role === "transport_arrival" || role === "transport_departure";
  const placeholder = role !== "productive_task";
  if (isTransport) return { role, countsAsWork: false, blocksSpace: explicitBlocks ? (bool(task.blocksSpace) || bool(source.blocksSpace)) : false, countsForMainFlow: false, countsForResourceLoad: false, countsForTalentLoad: false, allowsSpaceOverlap: true, spaceOccupancyMode: explicitBlocks ? "exclusive" : "shared", warnings, readOnly: true, transportGroupCapacity: transportContract?.vehicleCapacity ?? 1, transportGroupingTarget: role === "transport_arrival" ? transportContract?.arrivalTargetGroupSize ?? null : transportContract?.departureTargetGroupSize ?? null, transportGroupingWeight: transportContract?.groupingWeight ?? null, roleSource: transportContract?.source ?? null };
  const countsAsWork = explicitCounts ? (bool(task.countsAsWork) || bool(source.countsAsWork)) : !placeholder;
  const blocksSpace = explicitBlocks ? (bool(task.blocksSpace) || bool(source.blocksSpace)) : (!placeholder || role === "space_break_placeholder");
  const mode: ORCSpaceOccupancyMode = !blocksSpace ? "non_blocking" : allows ? "shared" : "exclusive";
  if (role === "unknown") warnings.push("Unclassified operational role; hard constraints remain conservative.");
  return { role, countsAsWork, blocksSpace, countsForMainFlow: countsAsWork, countsForResourceLoad: countsAsWork, countsForTalentLoad: countsAsWork, allowsSpaceOverlap: allows, spaceOccupancyMode: mode, warnings, readOnly: true };
}
function templateIds(task: Record<string, unknown>): Array<number | string> { return [task.templateId, task.taskTemplateId, task.template_id, task.typeId, (task.template as any)?.id, (task.taskType as any)?.id].filter((v): v is number | string => typeof v === "number" || typeof v === "string"); }
const sameId = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b);
function classifyRole(args: { entry?: OperationalState["planning"][number] | null; task?: TaskInput | Record<string, unknown> | null; mealWindow?: TimeWindow | null; source?: Record<string, unknown> | null; transportContract?: ORCTransportRoleContract | null }): ORCOperationalRoleMetadata {
  const entry = args.entry ?? null; const task = (args.task ?? {}) as Record<string, unknown>; const source = args.source ?? {};
  const fields = [task.operationalRole, task.kind, task.type, task.category, task.templateCode, task.code, task.status, task.templateName, task.name, task.breakKind, source.operationalRole, source.kind, source.type, source.category, source.templateCode, source.code, source.name].map(text).join(" ");
  const explicitProductive = bool(task.productive) || bool(task.countsAsWork) || bool(source.productive) || bool(source.countsAsWork) || text(task.operationalRole) === "productive_task";
  const hasResources = (entry?.assignedResourceIds?.length ?? 0) > 0 || Array.isArray(task.assignedResourceIds) && task.assignedResourceIds.length > 0;
  const negativeId = Number(task.id ?? entry?.taskId) < 0;
  const placeholder = bool(task.isPlaceholder) || bool(task.nonOperational) || bool(task.planningOnly) || bool(task.blockingOnly) || bool(source.isPlaceholder) || bool(source.nonOperational) || bool(source.planningOnly) || bool(source.blockingOnly);
  const explicitBreak = bool(task.isBreak) || bool(source.isBreak) || /(^|[_\s-])(break|pause|pausa|descanso)([_\s-]|$)/i.test(fields);
  const explicitMeal = bool(task.isMeal) || bool(source.isMeal) || /(^|[_\s-])(meal|comida|lunch|sodexo)([_\s-]|$)/i.test(fields) || text(task.breakKind).includes("meal");
  const explicitArrival = bool(task.isArrival) || bool(source.isArrival) || /(^|[_\s-])(arrival|check-in|checkin|entrada|llegada)([_\s-]|$)/i.test(fields);
  const explicitCall = bool(task.isCallTime) || bool(source.isCallTime) || /(^|[_\s-])(call time|calltime|cita|citacion|citación|espera|standby)([_\s-]|$)/i.test(fields);
  const explicitVisual = /(^|[_\s-])(placeholder|visual block|visual_block|bloqueo visual)([_\s-]|$)/i.test(fields);
  const explicitBlocker = bool(task.blocksSpace) || bool(task.spaceBlocker) || bool(task.blockingOnly) || bool(source.blocksSpace) || bool(source.spaceBlocker) || bool(source.blockingOnly);
  let role: ORCPlanningEntryOperationalRole = "productive_task";
  const tids = templateIds(task);
  if (args.transportContract?.configured && tids.some((v) => sameId(v, args.transportContract?.arrivalTemplateId))) role = "transport_arrival";
  else if (args.transportContract?.configured && tids.some((v) => sameId(v, args.transportContract?.departureTemplateId))) role = "transport_departure";
  else if (explicitProductive) role = "productive_task";
  else if ((explicitMeal || (negativeId && overlapsWindow(entry ?? {}, args.mealWindow) && !hasResources)) && (placeholder || explicitBreak || negativeId || overlapsWindow(entry ?? {}, args.mealWindow))) role = "meal_break_placeholder";
  else if (explicitArrival && (placeholder || negativeId || !hasResources)) role = "arrival_placeholder";
  else if (explicitCall && (placeholder || negativeId || !hasResources)) role = "call_time_placeholder";
  else if ((explicitBreak || explicitVisual) && explicitBlocker && (task.spaceId != null || entry?.spaceId != null)) role = "space_break_placeholder";
  else if (explicitBreak && (placeholder || negativeId)) role = "global_break_placeholder";
  else if ((placeholder || explicitVisual) && (bool(task.nonOperational) || bool(task.planningOnly) || bool(source.nonOperational) || bool(source.planningOnly) || explicitVisual)) role = "non_operational_placeholder";
  return roleFlags(role, task, source, args.transportContract);
}
export const isORCProductiveRole = (role: ORCPlanningEntryOperationalRole | ORCOperationalRoleMetadata): boolean => (typeof role === "string" ? role : role.role) === "productive_task";
export const isORCSpaceBlockingRole = (role: ORCPlanningEntryOperationalRole | ORCOperationalRoleMetadata, blocksSpace?: boolean): boolean => blocksSpace === true || (typeof role === "string" ? role === "productive_task" || role === "space_break_placeholder" : role.blocksSpace);

export function resolveORCPlanningEntryOperationalRoleMetadata(args: { entry?: OperationalState["planning"][number] | null; task?: TaskInput | Record<string, unknown> | null; mealWindow?: TimeWindow | null; source?: Record<string, unknown> | null; transportContract?: ORCTransportRoleContract | null }): ORCOperationalRoleMetadata { return classifyRole(args); }
export function classifyORCPlanningEntryOperationalRole(args: { entry?: OperationalState["planning"][number] | null; task?: TaskInput | Record<string, unknown> | null; mealWindow?: TimeWindow | null; source?: Record<string, unknown> | null; transportContract?: ORCTransportRoleContract | null }): ORCPlanningEntryOperationalRole { return classifyRole(args).role; }
