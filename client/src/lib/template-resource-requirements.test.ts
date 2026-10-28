import assert from "node:assert/strict";
import test from "node:test";
import { canEditTemplateByItem, setTemplateCoach, setTemplateResourceItem, templateResourceOptions, validateTemplateResourceChanges } from "./template-resource-requirements";

const coaches = new Set([3, 4]);
const types = [{ id: 10, code: "tools", name: "Tools", items: [{id: 1, name: "Kit"}, {id: 2, name: "Kit"}, {id: 5, name: "Inactive", isActive: false}] },
  {id: 20, code: "vocal_coach", name: "Coach", items: [{id: 3, name: "A"}, {id: 4, name: "B"}]},
  {id: 30, code: "auxiliar", name: "Auxiliar", items: [{id: 6, name: "Aux"}]}];
const options = templateResourceOptions(types, coaches);
test("item edits preserve hidden dimensions, unknown requirements and coach literally without mutating the original", () => {
  const before = { byType: {20: 1, 90: 2}, byItem: {1: 1, 3: 1, 999: 7}, anyOf: [{quantity: 2, resourceItemIds: [1, 2]}], metadata: {future: true} };
  const original = structuredClone(before);
  const after = setTemplateResourceItem(setTemplateResourceItem(before, 2, true, options), 1, false, options);
  assert.deepEqual(after, {...before, byItem: {2: 1, 3: 1, 999: 7}});
  assert.deepEqual(before, original);
  assert.strictEqual(after.byType, before.byType); assert.strictEqual(after.anyOf, before.anyOf);
  assert.equal(validateTemplateResourceChanges(before, after, options), null);
  assert.deepEqual(setTemplateCoach(after, 20, coaches, true, "specific", 4), {...after, byType: {90: 2}, byItem: {2: 1, 4: 1, 999: 7}});
});
test("legacy aliases and unsupported existing formats are retained", () => {
  const before = {by_type: {20: 1, 90: "2"}, by_item: {1: 1}, any_of: [{resourceItemIds: [2], quantity: 1}]};
  const after = setTemplateResourceItem(before, 2, true, options);
  assert.deepEqual(after, {...before, by_item: {1: 1, 2: 1}});
  assert.equal(canEditTemplateByItem({byItem: [{resourceItemId: 1, quantity: 2}]}), false);
  assert.throws(() => setTemplateResourceItem({byItem: []}, 2, true, options));
});
test("no missing IDs, duplicates, unsupported auxiliary, inactive resources, invalid quantities or stale catalog additions", () => {
  for (const id of [0, -1, 1.5, 999, 3, 5, 6]) assert.throws(() => setTemplateResourceItem(null, id, true, options));
  assert.throws(() => setTemplateResourceItem({byItem: {1: 1}}, 1, true, options));
  for (const quantity of [0, -1, 2, 0.5, "1"]) assert.ok(validateTemplateResourceChanges(null, {byItem: {1: quantity}}, options));
  assert.ok(validateTemplateResourceChanges(null, {byItem: {1: 1}}, []));
  assert.equal(validateTemplateResourceChanges({byItem: {999: 7}}, {byItem: {999: 7}}, options), null);
  assert.ok(options.find(option => option.id === 1)!.label.includes("#1"));
  assert.equal(templateResourceOptions([...types, types[0]], coaches).find(option => option.id === 1)!.available, false);
});
