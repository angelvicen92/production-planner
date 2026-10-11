import assert from "node:assert/strict";
import test from "node:test";
import { sortContestantLanes } from "./contestant-lane-sort";

test("earliest selected template orders entire lanes, breaks ties by name and puts missing tasks last; name order is recoverable", () => {
  const task = (id: number, templateId: number, startPlanned: string | null) => ({ id, templateId, startPlanned });
  const lanes: Array<[string, { name: string; tasks: ReturnType<typeof task>[] }]> = [
    ["1", { name: "Zoe", tasks: [task(1, 7, "12:00"), task(2, 8, "08:00"), task(3, 7, "09:00")] }],
    ["2", { name: "Ana", tasks: [task(4, 7, "09:00"), task(5, 8, "10:00")] }],
    ["3", { name: "Berta", tasks: [task(6, 8, "08:00")] }],
    ["4", { name: "Luis", tasks: [task(7, 7, null)] }],
    ["5", { name: "Celia", tasks: [task(8, 7, "08:55")] }],
  ];
  const before = structuredClone(lanes);
  const byTask = sortContestantLanes(lanes, 7);
  assert.deepEqual(byTask.map(lane => lane[1].name), ["Celia", "Ana", "Zoe", "Berta", "Luis"]);
  assert.equal(byTask.find(lane => lane[0] === "1")![1].tasks, lanes[0][1].tasks);
  assert.equal(byTask.flatMap(lane => lane[1].tasks).length, 8);
  assert.deepEqual(sortContestantLanes(byTask).map(lane => lane[1].name), ["Ana", "Berta", "Celia", "Luis", "Zoe"]);
  assert.deepEqual(lanes, before, "visual ordering must not edit any task or placement");
});
