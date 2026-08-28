import assert from "node:assert/strict";
import test from "node:test";
import { findCanonicalPerfectMatching, selectMostConstrainedUnit } from "./macroScheduling";

test("exact slot matching repairs the canonical greedy trap", () => {
  const matching = findCanonicalPerfectMatching(["A", "B"], ["P1", "P2"],
    (person, slot) => person === "P1" || slot === "A");
  assert.deepEqual([...matching!], [["A", "P2"], ["B", "P1"]]);
});

test("exact slot matching reports absence of complete coverage", () => {
  assert.equal(findCanonicalPerfectMatching(["A", "B"], ["P1", "P2"], (_person, slot) => slot === "A"), null);
});

test("MRV selector is deterministic and input-order invariant", () => {
  const flexible = { id: "flexible", domainSize: 8, hardResourceAvailabilityMinutes: 60, exclusiveResourceCount: 0, synchronizedSlotCount: 0, totalDuration: 10, affectedTaskCount: 2 };
  const scarce = { id: "scarce", domainSize: 2, hardResourceAvailabilityMinutes: 20, exclusiveResourceCount: 1, synchronizedSlotCount: 0, totalDuration: 10, affectedTaskCount: 1 };
  assert.equal(selectMostConstrainedUnit([flexible, scarce])?.id, "scarce");
  assert.equal(selectMostConstrainedUnit([scarce, flexible])?.id, "scarce");
});

test("selector uses coupling, duration and canonical id only after equal domains", () => {
  const base = { domainSize: 3, hardResourceAvailabilityMinutes: 100, exclusiveResourceCount: 0, affectedTaskCount: 2 };
  const short = { ...base, id: "short", synchronizedSlotCount: 0, totalDuration: 10 };
  const synchronized = { ...base, id: "sync", synchronizedSlotCount: 4, totalDuration: 120 };
  assert.equal(selectMostConstrainedUnit([short, synchronized])?.id, "sync");
  assert.equal(selectMostConstrainedUnit([{ ...short, id: "b" }, { ...short, id: "a" }])?.id, "a");
});
