import test from "node:test";
import assert from "node:assert/strict";
import type { SearchSpace } from "../contracts";
import type { OperationalPriorityMap } from "./operationalPriorityAnalyzer";
import type { ExplorationValueAnalysis } from "./explorationValueEstimator";
import { selectSearchSpaces, buildSearchSpaceSelectionEvidence } from "./searchSpaceSelectionEngine";

const space = (id: string, priority = 10): SearchSpace => ({
  id,
  description: `space ${id}`,
  taskIds: [2, 1],
  candidates: [],
  evidenceIds: [`evidence:${id}`],
  metadata: { sourceOpportunityId: id, sourceOpportunityPriority: priority, readOnly: true },
});

const priorities: OperationalPriorityMap = {
  priorities: [{ id: "priority:a", priorityScore: 42, bottlenecks: [], criticalResources: [], activeConstraints: [], explanation: "test" }],
};

const values: ExplorationValueAnalysis = {
  values: [
    { searchSpaceId: "space:a", expectedValue: 0.5, confidence: 0.8, explanation: "value a" },
    { searchSpaceId: "space:b", expectedValue: 0.5, confidence: 0.8, explanation: "value b" },
  ],
};

test("selectSearchSpaces supports an empty collection", () => {
  assert.deepEqual(selectSearchSpaces([], priorities, values), { selected: [] });
});

test("selectSearchSpaces selects one SearchSpace with traceable reason", () => {
  const result = selectSearchSpaces([space("space:a")], priorities, values);
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0]?.selected, true);
  assert.match(result.selected[0]?.selectionReason ?? "", /exploration value 0.5/);
  assert.equal(result.selected[0]?.futureConstraintEffect?.searchSpaceId, "space:a");
});

test("selectSearchSpaces preserves multiple SearchSpaces in input order", () => {
  const result = selectSearchSpaces([space("space:b"), space("space:a")], priorities, values);
  assert.deepEqual(result.selected.map((item) => item.searchSpace.id), ["space:b", "space:a"]);
});

test("selectSearchSpaces preserves ties deterministically", () => {
  const input = [space("space:b"), space("space:a")];
  const first = selectSearchSpaces(input, priorities, values);
  const second = selectSearchSpaces(input, priorities, values);
  assert.deepEqual(first, second);
});

test("SearchSpaceSelectionResult is structurally serializable", () => {
  const result = selectSearchSpaces([space("space:a")], priorities, values);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("selectSearchSpaces does not mutate inputs", () => {
  const input = [space("space:a")];
  const before = JSON.parse(JSON.stringify({ input, priorities, values }));
  selectSearchSpaces(input, priorities, values);
  assert.deepEqual(JSON.parse(JSON.stringify({ input, priorities, values })), before);
});

test("buildSearchSpaceSelectionEvidence records priority and ExplorationValue", () => {
  const result = selectSearchSpaces([space("space:a")], priorities, values);
  const evidence = buildSearchSpaceSelectionEvidence(result, priorities, values, "2026-06-27T00:00:00.000Z");
  assert.equal(evidence[0]?.kind, "search-space-selection");
  assert.equal(evidence[0]?.data.selected, true);
  assert.deepEqual((evidence[0]?.data.explorationValue as { searchSpaceId: string }).searchSpaceId, "space:a");
  assert.deepEqual((evidence[0]?.data.futureConstraintPropagation as { searchSpaceId: string }).searchSpaceId, "space:a");
});
