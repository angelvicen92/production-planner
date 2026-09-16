import test from "node:test";
import assert from "node:assert/strict";
import { runA2Assist7Evidence } from "./runA2Assist7Evidence";

test("ASST-010 proves the canonical assisted chain through rollback and divergence", async () => {
  const evidence = await runA2Assist7Evidence();
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.sourceObligationCount, 266);
  assert.equal(evidence.divergence.oldFutureArchived, true);
  assert.equal(evidence.divergence.activeAcceptedExceptionCount, 0);
});
