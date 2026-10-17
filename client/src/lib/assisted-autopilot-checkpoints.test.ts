import assert from "node:assert/strict";
import test from "node:test";
import type { AutopilotApi, AutopilotState, AutopilotProgress } from "@shared/assistedAutopilot";
import { observeAutopilotCheckpoints } from "./assisted-autopilot";

test("only verified checkpoints publish the exact state and consolidated plan once, without extra requests", async () => {
  let reads = 0;
  let state = { activeStage: { id: 10, ordinal: 0 } } as AutopilotState;
  let plan = { dailyTasks: [] as any[] };
  const published: unknown[] = [];
  const observed = observeAutopilotCheckpoints({
    state: async () => { reads++; return state; },
    plan: async () => { reads++; return plan; },
  } as AutopilotApi, (s, p) => published.push([s, p]));
  const progress = (phase: AutopilotProgress["phase"], stage = 0) => observed.onProgress({ phase, stage } as AutopilotProgress);
  await observed.api.state(); await observed.api.plan();
  progress("READING");
  assert.deepEqual(published, [[state, plan]]);
  for (const phase of ["GENERATING", "APPLYING", "VALIDATING", "ACCEPTING"] as const) {
    state = { ...state, draft: { contractVersion: 1, tasks: [{ taskId: 1 } as any] } };
    await observed.api.state(); await observed.api.plan(); progress(phase);
    assert.equal(published.length, 1, "unaccepted drafts stay hidden");
  }
  for (let ordinal = 1; ordinal <= 3; ordinal++) {
    progress("VERIFYING", ordinal - 1); // before the controller's verification read
    assert.equal(published.length, ordinal);
    state = { ...state, activeStage: { id: 10 + ordinal, ordinal } as any };
    plan = { dailyTasks: Array.from({ length: ordinal }, (_, id) => ({ id })) };
    await observed.api.state(); await observed.api.plan();
    progress("VERIFYING", ordinal);
    assert.deepEqual(published.at(-1), [state, plan]);
    progress("VERIFYING", ordinal); // requestStop can repeat the same phase
    progress("READING", ordinal);
    assert.equal(published.length, ordinal + 1);
  }
  for (const phase of ["FAILED", "STOPPED", "COMPLETE"] as const) progress(phase, 3);
  assert.equal(published.length, 4);
  assert.equal(reads, 16, "the observer never polls or refetches");
});
