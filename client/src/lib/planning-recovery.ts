export type RecoverablePlanningStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "stale"
  | "unknown";

const ACTIVE_RUN_KEY_PREFIX = "active-planning-run:";

export function isAbortLikeError(error: unknown): boolean {
  const value = error as { name?: unknown; message?: unknown; reason?: unknown } | null;
  const text = [value?.name, value?.message, value?.reason]
    .map((part) => String(part ?? "").toLowerCase())
    .join(" ");
  return text.includes("aborterror")
    || text.includes("aborted")
    || text.includes("operation was aborted")
    || text.includes("signal is aborted without reason");
}

export function activePlanningRunStorageKey(planId: number): string {
  return `${ACTIVE_RUN_KEY_PREFIX}${planId}`;
}

export function readActivePlanningRunId(planId: number, storage?: Pick<Storage, "getItem"> | null): number | null {
  if (!storage || !Number.isFinite(planId) || planId <= 0) return null;
  const value = Number(storage.getItem(activePlanningRunStorageKey(planId)));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function hasActivePlanningContext(planId: number, storage?: Pick<Storage, "getItem"> | null): boolean {
  return Boolean(storage?.getItem(activePlanningRunStorageKey(planId)));
}

export function markPlanningReconnectContext(planId: number, storage?: Pick<Storage, "setItem"> | null): void {
  if (!storage || !Number.isFinite(planId) || planId <= 0) return;
  storage.setItem(activePlanningRunStorageKey(planId), "pending");
}

export function persistActivePlanningRunId(
  planId: number,
  runId: number | null,
  storage?: Pick<Storage, "setItem" | "removeItem"> | null,
): void {
  if (!storage || !Number.isFinite(planId) || planId <= 0) return;
  const key = activePlanningRunStorageKey(planId);
  if (Number.isFinite(Number(runId)) && Number(runId) > 0) storage.setItem(key, String(runId));
  else storage.removeItem(key);
}

export function normalizeRecoverablePlanningStatus(status?: string | null): RecoverablePlanningStatus {
  const normalized = String(status ?? "").toLowerCase();
  if (["pending", "queued"].includes(normalized)) return "queued";
  if (["running", "optimizing"].includes(normalized)) return "running";
  if (normalized === "success") return "success";
  if (["failed", "error", "invalid", "infeasible"].includes(normalized)) return "failed";
  if (["cancelled", "canceled"].includes(normalized)) return "cancelled";
  if (normalized === "stale") return "stale";
  return "unknown";
}

export function shouldShowFinalPlanLoadError(error: unknown, hasRecoverableContext?: boolean): boolean {
  return !isAbortLikeError(error) && !hasRecoverableContext;
}
