import type { OperationalState } from "../contracts";
import { resolveORCPlanningEntryOperationalRoleMetadata, type ORCOperationalRoleMetadata, type ORCTransportRoleContract } from "./nonWorkTaskClassifier";
import { resolveORCSpaceOccupancy, type ORCSpaceOccupancy } from "./spaceOccupancyResolver";

export type SpaceCapacityEntry = OperationalState["planning"][number];

export interface SpaceCapacityViolation {
  code: "SPACE_OVERLAP";
  spaceId: number;
  taskIds: number[];
  start: string;
  end: string;
  capacity: number;
  occupied: number;
  roleLabels: string[];
  spaceOccupancyModes: string[];
  blocksSpaceFlags: boolean[];
  spaceContractSource?: string | null;
  readOnly: true;
}

const min = (value?: string | null): number | null => /^\d{2}:\d{2}$/.test(String(value ?? "")) ? Number(String(value).slice(0, 2)) * 60 + Number(String(value).slice(3)) : null;
const hh = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

function capacityFor(spaceId: number, spaces?: OperationalState["spaces"] | null, fallback?: number | null): number {
  if (spaces?.exclusiveById?.[spaceId] === true) return 1;
  return Math.max(1, Number(spaces?.concurrencyById?.[spaceId] ?? spaces?.capacityById?.[spaceId] ?? fallback ?? 1) || 1);
}

export function evaluateORCSpaceCapacitySemantics(args: {
  entries: SpaceCapacityEntry[];
  tasks: Map<number, Record<string, unknown> | undefined>;
  spaces?: OperationalState["spaces"] | null;
  mealWindow?: any;
  transportContract?: ORCTransportRoleContract | null;
}): SpaceCapacityViolation[] {
  const items = (args.entries ?? []).map((entry) => {
    const task = args.tasks.get(entry.taskId);
    const role = resolveORCPlanningEntryOperationalRoleMetadata({ entry, task, mealWindow: args.mealWindow, transportContract: args.transportContract });
    const occupancy = resolveORCSpaceOccupancy({ entry, task, roleMetadata: role, spaceConfig: args.spaces, transportContract: args.transportContract });
    return { entry, task, role, occupancy, start: min(entry.startPlanned), end: min(entry.endPlanned), spaceId: entry.spaceId == null ? null : Number(entry.spaceId) };
  }).filter((item) => item.spaceId != null && item.start != null && item.end != null && item.start < item.end && item.occupancy.blocksSpace);

  const violations: SpaceCapacityViolation[] = [];
  for (const spaceId of uniq(items.map((item) => item.spaceId!)).sort((a, b) => a - b)) {
    const spaceItems = items.filter((item) => item.spaceId === spaceId);
    const points = uniq(spaceItems.flatMap((item) => [item.start!, item.end!])).sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i], end = points[i + 1];
      if (start === end) continue;
      const active = spaceItems.filter((item) => item.start! < end && start < item.end!);
      if (active.length <= 1) continue;
      const capacity = capacityFor(spaceId, args.spaces, active[0]?.occupancy.spaceCapacity ?? null);
      const exclusiveActive = active.some((item) => item.occupancy.spaceOccupancyMode === "exclusive" || !item.occupancy.allowsSpaceOverlap);
      const occupied = active.reduce((sum, item) => sum + (item.occupancy.spaceOccupancyMode === "non_blocking" ? 0 : 1), 0);
      if (exclusiveActive || occupied > capacity) {
        violations.push(Object.freeze({
          code: "SPACE_OVERLAP", spaceId, taskIds: active.map((item) => item.entry.taskId).sort((a, b) => a - b), start: hh(start), end: hh(end), capacity, occupied,
          roleLabels: active.map((item) => (item.role as ORCOperationalRoleMetadata).role), spaceOccupancyModes: active.map((item) => (item.occupancy as ORCSpaceOccupancy).spaceOccupancyMode), blocksSpaceFlags: active.map((item) => item.occupancy.blocksSpace), spaceContractSource: active.find((item) => item.occupancy.spaceContractSource)?.occupancy.spaceContractSource ?? null, readOnly: true,
        }));
      }
    }
  }
  const key = (v: SpaceCapacityViolation) => `${v.spaceId}|${v.start}|${v.end}|${v.taskIds.join(",")}`;
  return [...new Map(violations.map((v) => [key(v), v])).values()].sort((a, b) => key(a).localeCompare(key(b), undefined, { numeric: true }));
}
