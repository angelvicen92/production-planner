export const PLANNING_RUN_STALE_AFTER_MS = 10 * 60 * 1000;
export const PLANNING_RUN_MAX_NO_PROGRESS_MS = 5 * 60 * 1000;
export const PLANNING_RUN_TIMEOUT_MARGIN_MS = 30 * 1000;

export const ACTIVE_PLANNING_RUN_STATUSES = new Set([
  "running",
  "pending",
  "queued",
  "optimizing",
]);

export const FINAL_PLANNING_RUN_STATUSES = new Set([
  "success",
  "infeasible",
  "invalid",
  "error",
  "failed",
  "cancelled",
  "canceled",
  "stale",
]);

export type PlanningRunStateInput = {
  status?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  totalPending?: number | null;
  plannedCount?: number | null;
  requestedTimeLimitMs?: number | null;
  phase?: string | null;
  stale?: boolean | null;
};

export type PlanningRunUiState =
  | "active"
  | "stale"
  | "success"
  | "no_work"
  | "failed"
  | "cancelled"
  | "idle";

export function isActivePlanningRunStatus(status?: string | null): boolean {
  return ACTIVE_PLANNING_RUN_STATUSES.has(String(status ?? "").toLowerCase());
}

export function isFinalPlanningRunStatus(status?: string | null): boolean {
  return FINAL_PLANNING_RUN_STATUSES.has(String(status ?? "").toLowerCase());
}

export function isPlanningRunStale(
  run: PlanningRunStateInput,
  nowMs = Date.now(),
  staleAfterMs = PLANNING_RUN_STALE_AFTER_MS,
): boolean {
  if (run.stale === true || String(run.status).toLowerCase() === "stale")
    return true;
  if (!isActivePlanningRunStatus(run.status)) return false;
  const timestamp = Date.parse(String(run.updatedAt ?? run.startedAt ?? ""));
  return Number.isFinite(timestamp) && nowMs - timestamp > staleAfterMs;
}

export function getFrontendStaleAfterMs(
  requestedTimeLimitMs?: number | null,
): number {
  const timeLimit = Number(requestedTimeLimitMs);
  if (!Number.isFinite(timeLimit) || timeLimit <= 0)
    return PLANNING_RUN_MAX_NO_PROGRESS_MS;
  return Math.min(
    PLANNING_RUN_MAX_NO_PROGRESS_MS,
    Math.max(
      PLANNING_RUN_TIMEOUT_MARGIN_MS,
      timeLimit * 2 + PLANNING_RUN_TIMEOUT_MARGIN_MS,
    ),
  );
}

export function getPlanningRunUiState(
  run: PlanningRunStateInput | null | undefined,
  nowMs = Date.now(),
): PlanningRunUiState {
  if (!run) return "idle";

  const status = String(run.status ?? "").toLowerCase();
  const totalPending = Math.max(0, Number(run.totalPending ?? 0));
  const plannedCount = Math.max(0, Number(run.plannedCount ?? 0));

  if (status === "success" || String(run.phase ?? "").toLowerCase() === "success") {
    return totalPending === 0 ? "no_work" : "success";
  }
  if (["cancelling", "cancelled", "canceled"].includes(status)) return "cancelled";
  if (["infeasible", "invalid", "error", "failed"].includes(status))
    return "failed";
  if (
    isPlanningRunStale(
      run,
      nowMs,
      getFrontendStaleAfterMs(run.requestedTimeLimitMs),
    )
  )
    return "stale";
  if (isActivePlanningRunStatus(status)) {
    if (totalPending === 0) return "no_work";
    if (plannedCount >= totalPending) return "success";
    return "active";
  }
  return isFinalPlanningRunStatus(status) ? "failed" : "idle";
}

export type PlanningRunCancellationDecision = "cancel" | "already_cancelled" | "already_terminal" | "no_active_run";

export function getPlanningRunCancellationDecision(status?: string | null, _phase?: string | null): PlanningRunCancellationDecision {
  const normalized = String(status ?? "").toLowerCase();
  if (["cancelled", "canceled"].includes(normalized)) return "already_cancelled";
  if (normalized === "cancelling") return "cancel";
  if (["success", "failed", "error", "invalid", "infeasible"].includes(normalized)) return "already_terminal";
  if (["queued", "running", "pending", "optimizing", "stale"].includes(normalized)) return "cancel";
  return "no_active_run";
}

export function shouldCancelPlanningRunOnDismiss(run: PlanningRunStateInput | null | undefined, nowMs = Date.now()): boolean {
  const state = getPlanningRunUiState(run, nowMs);
  return state === "active" || state === "stale";
}
