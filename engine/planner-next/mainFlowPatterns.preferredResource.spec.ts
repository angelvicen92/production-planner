import assert from "node:assert/strict";
import test from "node:test";
import { generateMainFlowPatterns } from "./mainFlowPatterns";

test("PREFERRED concentration ranks mixed resource membership inside the same block keys", () => {
  const mains = [
    ...["a1", "a2", "a3"].map((id) => ({ id, kind: "main" as const, duration: 10,
      spaceId: "main", blockKey: "a", dependencies: [], requiredResourceIds: ["continuous"] })),
    { id: "a4", kind: "main" as const, duration: 10, spaceId: "main", blockKey: "a", dependencies: [] },
    { id: "b1", kind: "main" as const, duration: 10, spaceId: "main", blockKey: "b",
      dependencies: [], requiredResourceIds: ["continuous"] },
    ...["b2", "b3", "b4"].map((id) => ({ id, kind: "main" as const, duration: 10,
      spaceId: "main", blockKey: "b", dependencies: [] })),
  ];
  const resource = { id: "continuous", availability: [{ start: 0, end: 100 }],
    presencePreference: "OFF" as const, presenceConcentrationPolicy: "PREFERRED" as const,
    assignedSpaceId: "main" };

  const result = generateMainFlowPatterns(mains, 2, 2, 100, [resource]);
  const ordered = result.patterns.map((pattern) => pattern.join(","));

  assert.equal(ordered[0], "a,a,a,a,b,b,b,b",
    "the first architecture can place the three resource-a mains next to the resource-b main");
  const fragmented = "a,a,b,b,b,b,a,a";
  assert.ok(ordered.includes(fragmented), "PREFERRED must retain the fragmented exact alternative");
  assert.ok(ordered.indexOf(fragmented) > 0,
    "mixed membership must influence structural ordering without pruning the alternative");
});
