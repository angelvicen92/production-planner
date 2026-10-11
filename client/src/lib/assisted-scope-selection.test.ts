import assert from "node:assert/strict";
import test from "node:test";
import { catalogScopeGroups, locationScopeTaskIds, pendingScopeTasks, taskIdsScopeSelector, toggleScopeSpaces } from "./assisted-scope-selection";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1 } from "../../../server/assistedPlanningSnapshot";
import { isAssistedDraftModified } from "./assisted-planning-view";
import { assistedProposalRequestSchema } from "../../../shared/assistedProposalContracts";
import { resolveAssistedScope } from "../../../server/assistedScopeResolver";

const spaces = [{ id: 4, zoneId: 20, name: "Same name" }, { id: 7, zoneId: 20, name: "Other" },
  { id: 8, zoneId: 30, name: "Same name" }, { id: 9, zoneId: 30, name: "Empty" }, { id: 10, zoneId: null, name: "Unlocated" }];
const zones = [{ id: 20, name: "Zone" }, { id: 30, name: "Zone" }];
const tasks = [{ id: 11, spaceId: 4, status: "pending" }, { id: 12, spaceId: 4, status: "interrupted" },
  { id: 13, spaceId: 7, status: "pending" }, { id: 14, spaceId: 8, status: "pending" },
  { id: 15, spaceId: 4, status: "cancelled" }, { id: 16, spaceId: 4, status: "done" },
  { id: 17, spaceId: 4, status: "in_progress" }, { id: 18, spaceId: 7, status: "pending" }];
const base = buildAssistedPlanningSnapshotV1(tasks.map(task => ({ ...task,
  startPlanned: task.id === 18 ? "09:00" : null, endPlanned: task.id === 18 ? "09:05" : null })));
const eligible = pendingScopeTasks(tasks, base);

test("individual and multiple spaces produce only pending, unaccepted obligations", () => {
  assert.deepEqual(locationScopeTaskIds(eligible, spaces, [4]), [11, 12]);
  assert.deepEqual(locationScopeTaskIds(eligible, spaces, [4, 7]), [11, 12, 13]);
  assert.deepEqual(locationScopeTaskIds(eligible, spaces, [4, 7, 8]), [11, 12, 13, 14]);
  assert.deepEqual(pendingScopeTasks(tasks, null).map(task => task.id), [11, 12, 13, 14, 18]);
});
test("real zone hierarchy uses only structured catalog membership, including incomplete relations", () => {
  const grouped = catalogScopeGroups(zones, [...spaces, { id: 22, zoneId: 404, name: "Other" }]);
  assert.deepEqual(grouped.zones.map(zone => zone.spaces.map(space => space.id)), [[4, 7], [8, 9]]);
  assert.deepEqual(grouped.ungrouped.map(space => space.id), [10, 22]);
  assert.deepEqual(locationScopeTaskIds(eligible, spaces, grouped.zones[0].spaces.map(space => space.id)), [11, 12, 13]);
  assert.equal(locationScopeTaskIds(eligible, spaces, [4, 7]).includes(14), false, "same name in another zone is excluded");
});
test("zone and individual selections combine, deduplicate and can be removed individually or together", () => {
  let selected = toggleScopeSpaces([8, 4], [4, 7], true);
  assert.deepEqual(selected, [4, 7, 8]);
  selected = toggleScopeSpaces(selected, [4], false); assert.deepEqual(selected, [7, 8]);
  selected = toggleScopeSpaces(selected, [4, 7], false); assert.deepEqual(selected, [8]);
  assert.deepEqual(locationScopeTaskIds([...eligible, eligible[0]], spaces, [4, 4, 7]), [11, 12, 13]);
});
test("empty, fully accepted and missing spaces never create an executable empty selector", () => {
  assert.equal(taskIdsScopeSelector(locationScopeTaskIds(eligible, spaces, [9, 404])), null);
  const accepted = buildAssistedPlanningSnapshotV1(tasks.map(task => ({ ...task, startPlanned: "09:00", endPlanned: "09:05" })));
  assert.deepEqual(locationScopeTaskIds(pendingScopeTasks(tasks, accepted), spaces, [4, 7]), []);
});
test("TASK_IDS is stable under order changes and delegates to the existing server contract", () => {
  const forward = taskIdsScopeSelector(locationScopeTaskIds(eligible, spaces, [4, 7]))!;
  const reverse = taskIdsScopeSelector(locationScopeTaskIds([...eligible].reverse(), [...spaces].reverse(), [7, 4]));
  assert.deepEqual(forward, { kind: "TASK_IDS", taskIds: [11, 12, 13] }); assert.deepEqual(reverse, forward);
  assistedProposalRequestSchema.parse({ selector: forward, includePrerequisites: false, expectedDraftFingerprint: fingerprintAssistedPlanningSnapshotV1(base), expectedBaseStageId: 1 });
  const adapter: any = { identityMap: tasks.map(task => ({ namespace: "task", sourceId: String(task.id), canonicalId: `task:${task.id}` })) };
  const resolved = resolveAssistedScope({ planId: 1, tasks } as any, adapter, forward);
  assert.deepEqual(resolved.productTaskIds, [11, 12, 13]);
  assert.equal(resolved.productTaskIds.includes(18), false);
});
test("selection is independent from Draft placement, accepted identity and fingerprint", () => {
  const before = JSON.stringify({ tasks, spaces, zones, base }); const fingerprint = fingerprintAssistedPlanningSnapshotV1(base);
  for (const selected of [[4], [4, 7], [8, 9], []]) {
    taskIdsScopeSelector(locationScopeTaskIds(pendingScopeTasks(tasks, base), spaces, selected));
    assert.equal(isAssistedDraftModified(base, base), false);
    assert.equal(fingerprintAssistedPlanningSnapshotV1(base), fingerprint);
  }
  assert.equal(JSON.stringify({ tasks, spaces, zones, base }), before);
});
