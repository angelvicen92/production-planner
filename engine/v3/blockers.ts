export type StructuredBlockerType =
  | "space"
  | "contestant"
  | "resource"
  | "coach"
  | "availability"
  | "dependency"
  | "meal"
  | "lock"
  | "executed"
  | "unknown";

export type StructuredBlockerSeverity = "hard" | "soft" | "unknown";

export type StructuredBlocker = {
  blockerType: StructuredBlockerType;
  blockedTaskId: number;
  blockingTaskId?: number;
  blockingLockId?: number;
  spaceId?: number;
  contestantId?: number;
  resourceId?: number;
  dependencyTaskId?: number;
  start?: string;
  end?: string;
  suggestedAlternativeStart?: string;
  reasonCode?: string;
  severity: StructuredBlockerSeverity;
  movable: boolean;
  status?: string;
  lockType?: string;
  availabilityStart?: string;
  availabilityEnd?: string;
  duration?: number;
};

const isFinitePositive = (value: unknown): value is number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
};

export const getStructuredBlockers = (details: any): StructuredBlocker[] => {
  if (!details || typeof details !== "object") return [];
  const raw = Array.isArray(details.structuredBlockers) ? details.structuredBlockers : [];
  return raw
    .filter((blocker: any) => blocker && typeof blocker === "object")
    .map((blocker: any) => ({
      ...blocker,
      blockerType: String(blocker.blockerType ?? "unknown") as StructuredBlockerType,
      blockedTaskId: Number(blocker.blockedTaskId ?? 0),
      blockingTaskId: isFinitePositive(blocker.blockingTaskId) ? Number(blocker.blockingTaskId) : undefined,
      severity: String(blocker.severity ?? "unknown") as StructuredBlockerSeverity,
      movable: Boolean(blocker.movable),
    }))
    .filter((blocker: StructuredBlocker) => isFinitePositive(blocker.blockedTaskId));
};

export const makeStructuredBlocker = (params: Partial<StructuredBlocker> & {
  blockerType: StructuredBlockerType;
  blockedTaskId: number;
}): StructuredBlocker => ({
  blockerType: params.blockerType,
  blockedTaskId: Number(params.blockedTaskId),
  blockingTaskId: isFinitePositive(params.blockingTaskId) ? Number(params.blockingTaskId) : undefined,
  blockingLockId: isFinitePositive(params.blockingLockId) ? Number(params.blockingLockId) : undefined,
  spaceId: isFinitePositive(params.spaceId) ? Number(params.spaceId) : undefined,
  contestantId: isFinitePositive(params.contestantId) ? Number(params.contestantId) : undefined,
  resourceId: isFinitePositive(params.resourceId) ? Number(params.resourceId) : undefined,
  dependencyTaskId: isFinitePositive(params.dependencyTaskId) ? Number(params.dependencyTaskId) : undefined,
  start: params.start,
  end: params.end,
  suggestedAlternativeStart: params.suggestedAlternativeStart,
  reasonCode: params.reasonCode,
  severity: params.severity ?? "hard",
  movable: Boolean(params.movable),
  status: params.status,
  lockType: params.lockType,
  availabilityStart: params.availabilityStart,
  availabilityEnd: params.availabilityEnd,
  duration: Number.isFinite(Number(params.duration)) ? Number(params.duration) : undefined,
});

export const summarizeStructuredBlockers = (output: any) => {
  const blockers = (Array.isArray(output?.unplanned) ? output.unplanned : [])
    .flatMap((item: any) => getStructuredBlockers(item?.reason?.details));
  return {
    structuredBlockersCount: blockers.length,
    movableBlockersCount: blockers.filter((blocker: StructuredBlocker) => blocker.movable).length,
    immovableBlockersCount: blockers.filter((blocker: StructuredBlocker) => !blocker.movable && blocker.blockerType !== "unknown").length,
    unknownBlockersCount: blockers.filter((blocker: StructuredBlocker) => blocker.blockerType === "unknown").length,
  };
};
