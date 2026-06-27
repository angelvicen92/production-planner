import test from "node:test";
import assert from "node:assert/strict";
import type { SearchSpace } from "../contracts";
import type { SearchSpaceSelectionResult } from "./searchSpaceSelectionEngine";
import { propagateFutureConstraints } from "./futureConstraintPropagationEngine";

const selected = (spaces: SearchSpace[]): SearchSpaceSelectionResult => ({
  selected: spaces.map((searchSpace) => ({ searchSpace, selected: true, selectionReason: `selected ${searchSpace.id}` })),
});

const space = (id: string, taskIds = [1, 2], metadata: Record<string, unknown> = {}): SearchSpace => ({
  id,
  description: `space ${id}`,
  taskIds,
  candidates: [],
  evidenceIds: [`evidence:${id}`],
  metadata: { readOnly: true, ...metadata },
});

test("propagateFutureConstraints supports an empty collection", () => {
  assert.deepEqual(propagateFutureConstraints({ selected: [] }), { effects: [] });
});

test("propagateFutureConstraints analyzes one SearchSpace", () => {
  const result = propagateFutureConstraints(selected([space("space:a", [2, 1], { sourceOpportunityId: "opp:a", allowedTransformations: ["MOVE_CHAIN"] })]));
  assert.equal(result.effects.length, 1);
  assert.equal(result.effects[0]?.searchSpaceId, "space:a");
  assert.deepEqual(result.effects[0]?.propagatedConstraints, ["search-space:space:a", "task:2", "task:1", "transformation:MOVE_CHAIN", "opportunity:opp:a"]);
  assert.equal(result.effects[0]?.propagationScore, 0.5);
  assert.match(result.effects[0]?.explanation ?? "", /space:a/);
});

test("propagateFutureConstraints preserves multiple SearchSpaces in stable input order", () => {
  const result = propagateFutureConstraints(selected([space("space:b", [3]), space("space:a", [1])]));
  assert.deepEqual(result.effects.map((effect) => effect.searchSpaceId), ["space:b", "space:a"]);
});

test("propagateFutureConstraints is deterministic", () => {
  const input = selected([space("space:a", [1], { activeConstraints: ["capacity"], propagatedConstraints: ["capacity"] })]);
  assert.deepEqual(propagateFutureConstraints(input), propagateFutureConstraints(input));
});

test("FutureConstraintPropagationAnalysis is structurally serializable", () => {
  const result = propagateFutureConstraints(selected([space("space:a")]));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("propagateFutureConstraints does not mutate inputs", () => {
  const input = selected([space("space:a", [1], { allowedTransformations: ["MOVE_CHAIN"] })]);
  const before = JSON.parse(JSON.stringify(input));
  propagateFutureConstraints(input);
  assert.deepEqual(JSON.parse(JSON.stringify(input)), before);
});
