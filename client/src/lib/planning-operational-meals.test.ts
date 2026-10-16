import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlanningOperationalMeals as resolve, operationalMealVisualTasks as project, type OperationalMealConfiguration } from "./planning-operational-meals";

const configuration: OperationalMealConfiguration = {
  operationalMealPolicies: [
    { id: "totales-operations", spaceIds: [33, 34], planResourceItemIds: [] },
    { id: "reality-a", spaceIds: [], planResourceItemIds: [3, 1] },
    { id: "coach", planResourceItemIds: [9] },
  ],
  itinerantTeamAvailability: [
    { itinerantTeamId: 10, planResourceItemIds: [1, 3] },
    { itinerantTeamId: 11, planResourceItemIds: [2, 4] },
    { itinerantTeamId: 12, planResourceItemIds: [1, 3, 4] },
  ],
};
const meal = (policyId = "break:totales-operations", startPlanned = "13:40", endPlanned = "14:55") => ({ policyId, startPlanned, endPlanned });

test("legacy days retain legacy authority, including old Assisted snapshots without meal decisions", () => {
  assert.equal(resolve(null, null, "accepted").authority, "legacy");
  assert.equal(resolve(undefined, {}, "draft").authority, "legacy");
});
test("structured missing, empty or historical snapshots never reactivate legacy breaks or invent a window start", () => {
  for (const snapshot of [null, {}, { operationalMeals: [] }]) {
    const result = resolve(configuration, snapshot, "accepted");
    assert.equal(result.authority, "accepted");
    assert.equal(result.meals.filter(m => m.interval === null).length, 3);
    assert.deepEqual(project(result), []);
  }
});
test("one accepted policy produces two space projections with identical actual interval and logical identity", () => {
  const result = resolve(configuration, { operationalMeals: [meal()] }, "accepted");
  const tasks = project(result);
  assert.deepEqual(tasks.map(t => t.spaceId), [33, 34]);
  assert.equal(new Set(tasks.map(t => t.operationalMealPolicyId)).size, 1);
  assert.equal(new Set(tasks.map(t => t.id)).size, 2);
  assert.ok(tasks.every(t => t.startPlanned === "13:40" && t.endPlanned === "14:55" && t.status === "accepted"));
  assert.ok(tasks.every(t => t.assignedResources.length === 0));
});
test("Stage changes, draft edits, restore, redo, restart and reload resolve solely from their selected snapshot", () => {
  const accepted = { operationalMeals: [meal()] };
  const draft = { operationalMeals: [meal(undefined, "15:00", "16:15")] };
  const sequence = [[accepted, "accepted", "13:40"], [draft, "draft", "15:00"], [accepted, "draft", "13:40"], [draft, "draft", "15:00"], [{}, "draft", null], [JSON.parse(JSON.stringify(accepted)), "accepted", "13:40"]] as const;
  for (const [snapshot, authority, expected] of sequence)
    assert.equal(project(resolve(configuration, snapshot, authority))[0]?.startPlanned ?? null, expected);
});
test("resource meals project only explicit resources and affected member teams, without inventing space or team policies", () => {
  const result = resolve(configuration, { operationalMeals: [meal("break:reality-a")] }, "draft");
  const tasks = project(result);
  assert.deepEqual(tasks.filter(t => t.operationalMealScope === "resource").map(t => t.assignedResources), [[1, 3]]);
  assert.deepEqual(tasks.filter(t => t.operationalMealScope === "team").map(t => t.itinerantTeamId), [10, 12]);
  assert.ok(tasks.every(t => t.spaceId === null && t.operationalMealPolicyId === "break:reality-a"));
});
test("unknown policies, duplicate decisions, duplicate policies and invalid intervals stay unavailable", () => {
  for (const meals of [[meal("break:unknown")], [meal(), meal()], [meal(undefined, "bad")], [meal(undefined, "15:00", "14:00")]]) {
    const result = resolve(configuration, { operationalMeals: meals }, "accepted");
    assert.deepEqual(project(result), []);
    assert.ok(result.meals.some(m => !m.interval));
  }
  assert.deepEqual(project(resolve({ operationalMealPolicies: [configuration.operationalMealPolicies![0], configuration.operationalMealPolicies![0]] }, { operationalMeals: [meal()] }, "accepted")), []);
  assert.equal(resolve(null, { operationalMeals: [meal()] }, "accepted").unavailable, true);
});
test("configuration scopes without catalogs or without materialized data cannot authorize extra meals", () => {
  const result = resolve({ operationalMealPolicies: [{ id: "empty", planResourceItemIds: [], spaceIds: [] }] }, { operationalMeals: [meal("break:empty")] }, "accepted");
  assert.deepEqual(project(result), []);
});
test("projection preserves frozen source configuration and snapshots", () => {
  const frozen = <T>(value: T): T => { if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
  const config = frozen(JSON.parse(JSON.stringify(configuration)));
  const snapshot = frozen({ operationalMeals: [meal(), meal("break:reality-a")] });
  const before = JSON.stringify({ config, snapshot });
  project(resolve(config, snapshot, "draft"));
  assert.equal(JSON.stringify({ config, snapshot }), before);
});
