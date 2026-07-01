import type { OperationalState } from "../contracts";
import type { TaskInput } from "../../types";
import { resolveORCPlanningEntryOperationalRoleMetadata, type ORCOperationalRoleMetadata } from "./nonWorkTaskClassifier";
export type ORCSpaceOccupancyMode = "exclusive" | "shared" | "non_blocking";
export interface ORCSpaceOccupancy { blocksSpace: boolean; allowsSpaceOverlap: boolean; effectiveSpaceCapacityContribution: number; spaceOccupancyMode: ORCSpaceOccupancyMode; reason: string; readOnly: true; }
export function resolveORCSpaceOccupancy(args: { entry?: OperationalState["planning"][number] | null; task?: TaskInput | Record<string, unknown> | null; roleMetadata?: ORCOperationalRoleMetadata | null; spaceConfig?: OperationalState["spaces"] | null; templateConfig?: Record<string, unknown> | null }): ORCSpaceOccupancy {
  const meta = args.roleMetadata ?? resolveORCPlanningEntryOperationalRoleMetadata({ entry: args.entry, task: args.task }) ;
  const task = (args.task ?? {}) as Record<string, unknown>;
  const entry = args.entry as any;
  const allows = meta.allowsSpaceOverlap || task.allowsSimultaneity === true || task.allowsSpaceOverlap === true || args.templateConfig?.allowsSimultaneity === true;
  const explicitBlocks = entry?.blocksSpace === true || task.blocksSpace === true;
  const mode: ORCSpaceOccupancyMode = explicitBlocks ? "exclusive" : allows ? "shared" : meta.spaceOccupancyMode;
  const blocksSpace = mode !== "non_blocking" && (explicitBlocks || meta.blocksSpace);
  return Object.freeze({ blocksSpace, allowsSpaceOverlap: allows || mode === "shared", effectiveSpaceCapacityContribution: blocksSpace && mode === "exclusive" ? 1 : 0, spaceOccupancyMode: blocksSpace ? mode : "non_blocking", reason: blocksSpace ? (allows || mode === "shared" ? "shared-space-config" : "exclusive-space-occupancy") : "non-blocking-operational-role", readOnly: true });
}
