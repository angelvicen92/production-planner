export type PlanningRunUpdateError = {
  message?: string;
  code?: string;
};

export type PlanningRunUpdateResult =
  | { ok: true; skipped: false; fallback: boolean }
  | { ok: false; skipped: true; reason: string };

type UpdateAttempt = (patch: Record<string, unknown>, onlyWhileRunning: boolean) => Promise<{ error?: PlanningRunUpdateError | null } | void>;
type Warn = (message: string, context: Record<string, unknown>) => void;

const LEGACY_PROGRESS_FIELDS = new Set([
  "status",
  "phase",
  "message",
  "planned_count",
  "finished_at",
  "updated_at",
  "last_task_id",
  "last_task_name",
  "last_reasons",
]);

const errorDetails = (error: unknown): { message: string; code: string | null } => {
  if (error && typeof error === "object") {
    const candidate = error as PlanningRunUpdateError;
    return {
      message: typeof candidate.message === "string" ? candidate.message : String(error),
      code: typeof candidate.code === "string" ? candidate.code : null,
    };
  }
  return { message: String(error ?? "Unknown planning progress update error"), code: null };
};

const runAttempt = async (attempt: UpdateAttempt, patch: Record<string, unknown>, onlyWhileRunning: boolean) => {
  const result = await attempt(patch, onlyWhileRunning);
  if (result?.error) throw result.error;
};

export const legacyPlanningRunPatch = (patch: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(
  Object.entries(patch).filter(([key]) => LEGACY_PROGRESS_FIELDS.has(key)),
);

export async function persistPlanningRunUpdateBestEffort(options: {
  planningRunId: number | null;
  phase?: string | null;
  patch: Record<string, unknown>;
  onlyWhileRunning?: boolean;
  attempt: UpdateAttempt;
  warn?: Warn;
}): Promise<PlanningRunUpdateResult> {
  const { planningRunId, phase = null, patch, onlyWhileRunning = false, attempt } = options;
  if (!planningRunId) return { ok: false, skipped: true, reason: "missing_planning_run_id" };
  const warn = options.warn ?? ((message, context) => console.warn(message, context));

  try {
    await runAttempt(attempt, patch, onlyWhileRunning);
    return { ok: true, skipped: false, fallback: false };
  } catch (error) {
    const details = errorDetails(error);
    warn("[planning-progress] progress update failed; retrying legacy fields", {
      planningRunId,
      phase,
      error: details.message,
      code: details.code,
    });

    const legacyPatch = legacyPlanningRunPatch(patch);
    if (Object.keys(legacyPatch).length === 0) {
      return { ok: false, skipped: true, reason: details.message };
    }

    try {
      await runAttempt(attempt, legacyPatch, onlyWhileRunning);
      return { ok: true, skipped: false, fallback: true };
    } catch (legacyError) {
      const legacyDetails = errorDetails(legacyError);
      warn("[planning-progress] ignored legacy progress update failure", {
        planningRunId,
        phase,
        error: legacyDetails.message,
        code: legacyDetails.code,
      });
      return { ok: false, skipped: true, reason: legacyDetails.message };
    }
  }
}

export function queuePlanningRunUpdateBestEffort(
  chain: Promise<unknown>,
  update: () => Promise<unknown>,
  context: { planningRunId: number | null; phase?: string | null },
  warn: Warn = (message, details) => console.warn(message, details),
): Promise<void> {
  return chain
    .catch(() => undefined)
    .then(() => update())
    .then(() => undefined)
    .catch((error) => {
      const details = errorDetails(error);
      warn("[planning-progress] ignored progress update failure", {
        planningRunId: context.planningRunId,
        phase: context.phase ?? null,
        error: details.message,
        code: details.code,
      });
    });
}
