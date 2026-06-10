export const COMMITTABLE_PLANNING_RUN_STATUSES = new Set(["running"]);
export const CANCELLED_PLANNING_RUN_STATUSES = new Set(["cancelling", "cancelled", "canceled", "stale"]);
export const TERMINAL_PLANNING_RUN_STATUSES = new Set(["cancelled", "canceled", "success", "failed", "infeasible"]);

export function buildPlanningCancellationPatch(cancelledAt: string, cancelRequestedAt?: string | null) {
  return {
    status: "cancelled",
    phase: "cancelled",
    message: "Cancelado por el usuario",
    cancel_requested_at: cancelRequestedAt ?? cancelledAt,
    cancelled_at: cancelledAt,
    cancel_reason: "user_cancelled",
    finished_at: cancelledAt,
    last_progress_at: cancelledAt,
    updated_at: cancelledAt,
  } as const;
}

export class PlanningCancelledError extends Error {
  readonly code = "GENERATION_CANCELLED";
  constructor(
    public readonly planningRunId: number,
    public readonly phase: string,
    message = "Planning generation was cancelled",
  ) {
    super(message);
    this.name = "PlanningCancelledError";
  }
}

export class PlanningRunNoLongerActiveError extends PlanningCancelledError {
  constructor(planningRunId: number, phase: string, status: string) {
    super(planningRunId, phase, `Planning run is no longer active (status=${status})`);
    this.name = "PlanningRunNoLongerActiveError";
  }
}

export type PlanningRunCommitState = {
  id: number;
  planId: number;
  status: string;
  cancelRequestedAt?: string | null;
};

export function assertPlanningRunStateActive(state: PlanningRunCommitState | null, planningRunId: number, planId: number, phase: string): void {
  if (!state || Number(state.id) !== planningRunId || Number(state.planId) !== planId) {
    throw new PlanningRunNoLongerActiveError(planningRunId, phase, "missing_or_superseded");
  }
  const status = String(state.status ?? "").toLowerCase();
  if (state.cancelRequestedAt || CANCELLED_PLANNING_RUN_STATUSES.has(status)) {
    throw new PlanningCancelledError(planningRunId, phase);
  }
  if (!COMMITTABLE_PLANNING_RUN_STATUSES.has(status)) {
    throw new PlanningRunNoLongerActiveError(planningRunId, phase, status || "unknown");
  }
}

const planCommitChains = new Map<number, Promise<void>>();
const planningRollbackFailures = new Map<number, string>();

export async function waitForPlanningCommitIdle(planId: number): Promise<void> {
  await (planCommitChains.get(planId) ?? Promise.resolve()).catch(() => undefined);
}

export function consumePlanningRollbackFailure(planId: number): string | null {
  const failure = planningRollbackFailures.get(planId) ?? null;
  planningRollbackFailures.delete(planId);
  return failure;
}

async function withPlanCommitLock<T>(planId: number, operation: () => Promise<T>): Promise<T> {
  const previous = planCommitChains.get(planId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.catch(() => undefined).then(() => current);
  planCommitChains.set(planId, queued);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (planCommitChains.get(planId) === queued) planCommitChains.delete(planId);
  }
}

export type PlanningCommitOperation = {
  key: string;
  apply: () => Promise<boolean | void>;
};

export async function commitPlanningResultSafely(options: {
  planningRunId: number;
  planId: number;
  assertActive: (phase: string) => Promise<void>;
  takeSnapshot: () => Promise<unknown>;
  operations: PlanningCommitOperation[];
  restoreSnapshot: (snapshot: unknown) => Promise<void>;
  markSuccess: (appliedCount: number) => Promise<boolean>;
  onProgress?: (appliedCount: number, operation: PlanningCommitOperation) => Promise<void>;
  onRollbackFailure?: (error: unknown) => void;
}): Promise<{ appliedCount: number }> {
  return withPlanCommitLock(options.planId, async () => {

    const { planningRunId, assertActive, operations } = options;
    await assertActive("before_commit");
    const snapshot = await options.takeSnapshot();
    let appliedCount = 0;
    let writesStarted = false;

    try {
      for (const operation of operations) {
        await assertActive(`before_write:${operation.key}`);
        writesStarted = true;
        const applied = await operation.apply();
        if (applied !== false) appliedCount += 1;
        if (options.onProgress) await options.onProgress(appliedCount, operation);
      }

      await assertActive("before_success");
      const success = await options.markSuccess(appliedCount);
      if (!success) {
        throw new PlanningRunNoLongerActiveError(planningRunId, "mark_success", "cancelled_or_superseded");
      }
      return { appliedCount };
    } catch (error) {
      if (writesStarted) {
        try {
          await options.restoreSnapshot(snapshot);
        } catch (rollbackError) {
          options.onRollbackFailure?.(rollbackError);
          (error as any).rollbackError = rollbackError;
        }
      }
      throw error;
    }
  });
}
