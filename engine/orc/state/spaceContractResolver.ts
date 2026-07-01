import type { OperationalState, ORCRecord } from "../contracts";
export interface ORCSpaceContract { spaceId: number | string | null; capacity: number; occupancyMode: "exclusive" | "shared" | "non_blocking"; allowsSimultaneity: boolean; blocksByDefault: boolean; source: string | null; warnings: string[]; readOnly: true; planningInfluence: "validation-semantics-only"; }
const bool = (v: unknown) => v === true || v === "true";
const num = (v: unknown) => { const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN; return Number.isFinite(n) && n > 0 ? n : null; };
export function resolveORCSpaceContract(args: { spaceId?: number | string | null; spaceConfig?: OperationalState["spaces"] | null; space?: ORCRecord | null }): ORCSpaceContract {
  const id = args.spaceId ?? (args.space?.id as any) ?? null; const s = args.space ?? {}; const cfg = args.spaceConfig; const n = Number(id);
  const explicitCap = num(s.capacity) ?? num(s.maxConcurrentTasks) ?? num(s.concurrency) ?? (Number.isFinite(n) ? cfg?.concurrencyById?.[n] ?? cfg?.capacityById?.[n] : undefined) ?? null;
  const non = bool(s.nonBlocking) || bool(s.planningOnly) || bool(s.isVirtual); const shared = bool(s.allowsSimultaneity) || bool(s.allowOverlap) || bool(s.shared) || bool(s.isHoldingArea) || bool(s.isArrivalArea); const exclusive = bool(s.exclusive) || (Number.isFinite(n) && cfg?.exclusiveById?.[n] === true);
  const capacity = non ? Math.max(1, explicitCap ?? 1) : exclusive ? 1 : Math.max(1, explicitCap ?? 1);
  const occupancyMode = non ? "non_blocking" : shared || capacity > 1 ? "shared" : "exclusive";
  return Object.freeze({ spaceId: id, capacity, occupancyMode, allowsSimultaneity: occupancyMode === "shared" || occupancyMode === "non_blocking", blocksByDefault: occupancyMode !== "non_blocking", source: explicitCap != null || exclusive ? "space-config" : null, warnings: explicitCap == null ? ["space_capacity_configuration_missing"] : [], readOnly: true, planningInfluence: "validation-semantics-only" });
}
