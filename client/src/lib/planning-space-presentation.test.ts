import assert from "node:assert/strict";
import test from "node:test";
import { spaceParticipantNames, spaceHeadingColor, spaceForeground } from "./planning-space-presentation";

test("participants use explicit joint membership, preserve both names and ignore absent relations", () => {
  const tasks = Object.freeze([
    { id: 1, templateId: 1, contestantId: 10 },
    { id: 2, templateId: 1, contestantId: 20 },
    { id: 3, templateId: 1, contestantId: 10 },
    { id: 4, templateId: 1, contestantId: null },
    { id: 5, templateId: 1, contestantId: 99 },
    { id: 6, templateId: 1, contestantId: 10, isManualBlock: true },
  ]);
  const operations = [{ taskId: 1, jointGroupId: "pair" }, { taskId: 2, jointGroupId: "pair" }, { taskId: 3, jointGroupId: "pair" }];
  const labels = spaceParticipantNames(tasks, { 10: "Ana", 20: "Bea" }, operations);
  assert.deepEqual(labels.get(1), ["Ana", "Bea"]);
  assert.deepEqual(labels.get(2), ["Ana", "Bea"]);
  assert.deepEqual(labels.get(3), ["Ana", "Bea"]);
  for (const id of [4, 5, 6]) assert.deepEqual(labels.get(id), []);
  assert.deepEqual(spaceParticipantNames(tasks, { 10: "Ana", 20: "Bea" }).get(1), ["Ana"]);
  assert.deepEqual(spaceParticipantNames(tasks, { 10: "Ana", 20: "Bea" }).get(2), ["Bea"]);
  assert.equal(spaceParticipantNames([], {}, operations).size, 0);
});

test("heading color reuses zone configuration then the deterministic task palette without inventing a color", () => {
  const tasks = Object.freeze([
    { id: 2, templateId: 2, contestantId: null, template: { uiColor: "#ffffff" } },
    { id: 1, templateId: 1, contestantId: null, template: { uiColor: "#ff0000", uiColorSecondary: "#123abc" } },
  ]);
  assert.equal(spaceHeadingColor("#abc", tasks), "#aabbcc");
  assert.equal(spaceHeadingColor(null, tasks), "#123abc");
  assert.equal(spaceHeadingColor("invalid", [...tasks].reverse()), "#123abc");
  assert.equal(spaceHeadingColor(null, [{ ...tasks[1], template: { uiColorSecondary: "invalid", uiColor: "#135790" } }]), "#135790");
  assert.equal(spaceHeadingColor(null, [{ ...tasks[1], isManualBlock: true }]), undefined);
  assert.equal(spaceHeadingColor(null, [{ ...tasks[1], breakKind: "space_meal" }]), undefined);
  assert.equal(spaceHeadingColor(null, []), undefined);
  assert.equal(spaceForeground(), undefined);
  assert.equal(spaceForeground("#ffffff"), "#000000");
  assert.equal(spaceForeground("#000000"), "#ffffff");
  assert.equal(spaceForeground("#1d4ed8"), "#ffffff");
  assert.equal(spaceForeground("#facc15"), "#000000");
});
