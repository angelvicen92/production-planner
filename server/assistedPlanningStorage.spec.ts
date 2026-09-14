import assert from "node:assert/strict";
import test from "node:test";
import { mapAssistedPersistenceRow, toAssistedPersistenceRow } from "./assistedPlanningPersistenceMapping";

test("assisted persistence mapper round-trips database authority fields", () => {
  const mapped = mapAssistedPersistenceRow<{ planId: number; draftFingerprint: string; snapshotJson: object; acceptedAt: string }>({
    plan_id: 7, draft_fingerprint: "a".repeat(64), snapshot_json: { contractVersion: 1, tasks: [] }, accepted_at: "2026-01-01T00:00:00Z",
  });
  assert.deepEqual(mapped, { planId: 7, draftFingerprint: "a".repeat(64), snapshotJson: { contractVersion: 1, tasks: [] }, acceptedAt: "2026-01-01T00:00:00Z" });
  assert.deepEqual(toAssistedPersistenceRow(mapped), { plan_id: 7, draft_fingerprint: "a".repeat(64), snapshot_json: { contractVersion: 1, tasks: [] }, accepted_at: "2026-01-01T00:00:00Z" });
});
