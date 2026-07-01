import type { OperationalState } from "../contracts";
import type { TaskInput } from "../../types";
import { resolveORCPlanningEntryOperationalRoleMetadata, type ORCOperationalRoleMetadata, type ORCTransportRoleContract } from "./nonWorkTaskClassifier";
import { resolveORCSpaceContract } from "./spaceContractResolver";
export type ORCSpaceOccupancyMode = "exclusive" | "shared" | "non_blocking";
export interface ORCSpaceOccupancy { blocksSpace: boolean; allowsSpaceOverlap: boolean; effectiveSpaceCapacityContribution: number; spaceOccupancyMode: ORCSpaceOccupancyMode; reason: string; readOnly: true; transportGroupCapacity?: number | null; spaceCapacity?: number | null; spaceContractSource?: string | null; transportContractSource?: string | null; }
export function resolveORCSpaceOccupancy(args: { entry?: OperationalState["planning"][number] | null; task?: TaskInput | Record<string, unknown> | null; roleMetadata?: ORCOperationalRoleMetadata | null; spaceConfig?: OperationalState["spaces"] | null; templateConfig?: Record<string, unknown> | null; transportContract?: ORCTransportRoleContract | null }): ORCSpaceOccupancy {
  const meta = args.roleMetadata ?? resolveORCPlanningEntryOperationalRoleMetadata({ entry: args.entry, task: args.task, transportContract: args.transportContract }) ;
  const task = (args.task ?? {}) as Record<string, unknown>;
  const entry = args.entry as any;
  const spaceContract = resolveORCSpaceContract({ spaceId: entry?.spaceId ?? (task as any).spaceId ?? null, spaceConfig: args.spaceConfig });
  if ((meta.role === "transport_arrival" || meta.role === "transport_departure") && entry?.blocksSpace !== true && task.blocksSpace !== true && args.templateConfig?.blocksSpace !== true) return Object.freeze({ blocksSpace: false, allowsSpaceOverlap: true, effectiveSpaceCapacityContribution: 0, spaceOccupancyMode: "shared", reason: "transport-template-occupancy-contract", readOnly: true, transportGroupCapacity: meta.transportGroupCapacity ?? args.transportContract?.vehicleCapacity ?? 1, spaceCapacity: spaceContract.capacity, spaceContractSource: spaceContract.source, transportContractSource: meta.roleSource ?? args.transportContract?.source ?? null });
  const allows = meta.allowsSpaceOverlap || task.allowsSimultaneity === true || task.allowsSpaceOverlap === true || args.templateConfig?.allowsSimultaneity === true || spaceContract.allowsSimultaneity;
  const explicitBlocks = entry?.blocksSpace === true || task.blocksSpace === true;
  const mode: ORCSpaceOccupancyMode = explicitBlocks ? "exclusive" : allows ? "shared" : meta.spaceOccupancyMode;
  const blocksSpace = mode !== "non_blocking" && (explicitBlocks || meta.blocksSpace);
  return Object.freeze({ blocksSpace, allowsSpaceOverlap: allows || mode === "shared", effectiveSpaceCapacityContribution: blocksSpace && mode === "exclusive" ? 1 : 0, spaceOccupancyMode: blocksSpace ? mode : "non_blocking", reason: blocksSpace ? (allows || mode === "shared" ? "shared-space-config" : "exclusive-space-occupancy") : "non-blocking-operational-role", readOnly: true, spaceCapacity: spaceContract.capacity, spaceContractSource: spaceContract.source });
}
