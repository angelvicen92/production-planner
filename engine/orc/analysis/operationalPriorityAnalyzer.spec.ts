import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { analyzeOperationalPriorities, type OperationalPriorityMap } from "./operationalPriorityAnalyzer";
import type { CriticalBottleneckAnalysis } from "./criticalBottleneckAnalyzer";
import type { ResourceCriticalityAnalysis } from "./resourceCriticalityAnalyzer";
import type { ConstraintPressureAnalysis } from "./constraintPressureAnalyzer";

const emptyBottlenecks = (): CriticalBottleneckAnalysis => ({ bottlenecks: [] });
const emptyResources = (): ResourceCriticalityAnalysis => ({ resources: [] });
const emptyConstraints = (): ConstraintPressureAnalysis => ({ constraints: [] });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const bottlenecks = (items: CriticalBottleneckAnalysis["bottlenecks"]): CriticalBottleneckAnalysis => ({ bottlenecks: items });
const resources = (items: ResourceCriticalityAnalysis["resources"]): ResourceCriticalityAnalysis => ({ resources: items });
const constraints = (items: ConstraintPressureAnalysis["constraints"]): ConstraintPressureAnalysis => ({ constraints: items });

const assertSerializable = (map: OperationalPriorityMap): void => {
  assert.deepEqual(JSON.parse(JSON.stringify(map)), map);
};

test("Operational Priority Analyzer supports an empty analysis", () => {
  assert.deepEqual(analyzeOperationalPriorities(emptyBottlenecks(), emptyResources(), emptyConstraints()), { priorities: [] });
});

test("Operational Priority Analyzer explains a single element", () => {
  const result = analyzeOperationalPriorities(
    bottlenecks([{ id: "continuity:pending-tasks", category: "UNPLANNED_PENDING_TASKS", severity: 3, explanation: "pending" }]),
    emptyResources(),
    emptyConstraints(),
  );

  assert.deepEqual(result.priorities, [{
    id: "continuity:pending-tasks",
    priorityScore: 3,
    bottlenecks: ["continuity:pending-tasks"],
    criticalResources: [],
    activeConstraints: [],
    explanation: "Priority continuity:pending-tasks scored 3. Evidence: bottlenecks=[continuity:pending-tasks], criticalResources=[], activeConstraints=[]. Contributions: bottleneck:continuity:pending-tasks:severity:3.",
  }]);
});

test("Operational Priority Analyzer fuses multiple related elements", () => {
  const result = analyzeOperationalPriorities(
    bottlenecks([{ id: "resource:2:overlap", category: "RESOURCE_PRESSURE", severity: 4, explanation: "overlap" }]),
    resources([{ resourceId: "2", criticalityScore: 6, contributingFactors: ["resource-overlap"], explanation: "critical" }]),
    constraints([{ constraintId: "constraints:locks", pressureScore: 2, contributingFactors: ["lock-count:1"], explanation: "locked" }]),
  );

  assert.deepEqual(result.priorities.map((item) => item.id), ["resource:2", "constraints:locks"]);
  assert.deepEqual(result.priorities.map((item) => item.priorityScore), [10, 2]);
  assert.deepEqual(result.priorities[0]?.bottlenecks, ["resource:2:overlap"]);
  assert.deepEqual(result.priorities[0]?.criticalResources, ["2"]);
  assert.deepEqual(result.priorities[1]?.activeConstraints, ["constraints:locks"]);
});

test("Operational Priority Analyzer breaks ties by priority id", () => {
  const result = analyzeOperationalPriorities(
    bottlenecks([
      { id: "zeta", category: "Z", severity: 2, explanation: "z" },
      { id: "alpha", category: "A", severity: 2, explanation: "a" },
    ]),
    emptyResources(),
    emptyConstraints(),
  );
  assert.deepEqual(result.priorities.map((item) => item.id), ["alpha", "zeta"]);
});

test("Operational Priority Analyzer is deterministic, structurally equal and serializable", () => {
  const b = bottlenecks([{ id: "main-flow:5:gaps", category: "MAIN_FLOW_GAP", severity: 2, explanation: "gap" }]);
  const r = resources([{ resourceId: "7", criticalityScore: 1, contributingFactors: [], explanation: "resource" }]);
  const c = constraints([{ constraintId: "constraints:main-flow:5", pressureScore: 3, contributingFactors: [], explanation: "flow" }]);
  const first = analyzeOperationalPriorities(b, r, c);
  const second = analyzeOperationalPriorities(b, r, c);
  assert.equal(structuralEquals(first, second), true);
  assert.equal(stableStringify(first), stableStringify(second));
  assertSerializable(first);
});

test("Operational Priority Analyzer preserves structural equality for equivalent input order", () => {
  const first = analyzeOperationalPriorities(
    bottlenecks([{ id: "resource:2:overlap", category: "RESOURCE_PRESSURE", severity: 1, explanation: "b" }]),
    resources([{ resourceId: "2", criticalityScore: 1, contributingFactors: [], explanation: "r" }]),
    constraints([{ constraintId: "constraints:locks", pressureScore: 2, contributingFactors: [], explanation: "c" }]),
  );
  const second = analyzeOperationalPriorities(
    bottlenecks([{ id: "resource:2:overlap", category: "RESOURCE_PRESSURE", severity: 1, explanation: "b" }]),
    resources([{ resourceId: "2", criticalityScore: 1, contributingFactors: [], explanation: "r" }]),
    constraints([{ constraintId: "constraints:locks", pressureScore: 2, contributingFactors: [], explanation: "c" }]),
  );
  assert.deepEqual(first, second);
});

test("Operational Priority Analyzer does not mutate its input", () => {
  const b = bottlenecks([{ id: "resource:1:overlap", category: "RESOURCE_PRESSURE", severity: 4, explanation: "overlap" }]);
  const r = resources([{ resourceId: "1", criticalityScore: 6, contributingFactors: ["resource-overlap"], explanation: "critical" }]);
  const c = constraints([{ constraintId: "constraints:locks", pressureScore: 2, contributingFactors: ["lock-count:1"], explanation: "locked" }]);
  const before = clone({ b, r, c });
  analyzeOperationalPriorities(b, r, c);
  assert.deepEqual({ b, r, c }, before);
});
