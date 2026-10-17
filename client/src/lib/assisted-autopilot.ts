import type { AutopilotApi, AutopilotPlan, AutopilotState, AutopilotProgress } from "@shared/assistedAutopilot";
import type { AssistedPlanningSnapshotV1 } from "@shared/assistedPlanningSnapshotContracts";
import { buildAssistedPlanningView } from "./assisted-planning-view";
import { collectAssistedDraftWarnings } from "./assisted-draft-warnings";

type Request = <T>(method: string, path: string, body?: unknown) => Promise<T>;

/** Reuse the controller's reads, publishing only after its persistence checks.
 * Intermediate apply/validate reads must never become visible placements.
 */
export function observeAutopilotCheckpoints(api: AutopilotApi, publish: (state: AutopilotState, plan: AutopilotPlan) => void) {
  let state: AutopilotState | undefined;
  let plan: AutopilotPlan | undefined;
  let publishedStage: number | undefined;
  return {
    api: {
      ...api,
      state: async () => (state = await api.state()),
      plan: async () => (plan = await api.plan()),
    },
    onProgress(progress: AutopilotProgress) {
      if ((progress.phase !== "READING" && progress.phase !== "VERIFYING") || !state || !plan
        || state.activeStage.ordinal !== progress.stage || publishedStage === state.activeStage.id) return;
      publishedStage = state.activeStage.id;
      publish(state, plan);
    },
  };
}
/** The same authenticated product endpoints as the manual operator flow. */
export function assistedAutopilotApi(planId: number, request: Request): AutopilotApi {
  const path = `/api/plans/${planId}/assisted`;
  return {
    state: () => request("GET", path),
    plan: () => request("GET", `/api/plans/${planId}`),
    nextScope: () => request("GET", `${path}/next-scope`),
    propose: body => request("POST", `${path}/proposals`, body),
    run: id => request("GET", `${path}/proposals/${id}`),
    apply: (id, body) => request("POST", `${path}/proposals/${id}/apply`, body),
    validate: body => request("POST", `${path}/validate`, body),
    accept: body => request("POST", `${path}/accept-stage`, body),
  };
}
export function hasAutopilotDraftAlerts(plan: AutopilotPlan, draft: AssistedPlanningSnapshotV1): boolean {
  return collectAssistedDraftWarnings(buildAssistedPlanningView(plan.dailyTasks, draft), {
    start: plan.workStart ?? plan.startTime ?? plan.workdayStart,
    end: plan.workEnd ?? plan.endTime ?? plan.workdayEnd,
  }, plan.plannerNextConfiguration).length > 0;
}
