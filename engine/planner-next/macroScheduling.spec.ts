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
  const flexible = { id: "flexible", domainSize: 8, domainExact: true, hardResourceAvailabilityMinutes: 60, exclusiveResourceCount: 0, synchronizedSlotCount: 0, totalDuration: 10, affectedTaskCount: 2 };
  const scarce = { id: "scarce", domainSize: 2, domainExact: true, hardResourceAvailabilityMinutes: 20, exclusiveResourceCount: 1, synchronizedSlotCount: 0, totalDuration: 10, affectedTaskCount: 1 };
  assert.equal(selectMostConstrainedUnit([flexible, scarce])?.id, "scarce");
  assert.equal(selectMostConstrainedUnit([scarce, flexible])?.id, "scarce");
});

test("selector uses coupling, duration and canonical id only after equal domains", () => {
  const base = { domainSize: 3, domainExact: true, hardResourceAvailabilityMinutes: 100, exclusiveResourceCount: 0, affectedTaskCount: 2 };
  const short = { ...base, id: "short", synchronizedSlotCount: 0, totalDuration: 10 };
  const synchronized = { ...base, id: "sync", synchronizedSlotCount: 4, totalDuration: 120 };
  assert.equal(selectMostConstrainedUnit([short, synchronized])?.id, "sync");
  assert.equal(selectMostConstrainedUnit([{ ...short, id: "b" }, { ...short, id: "a" }])?.id, "a");
});

test("inexact domains use semantic pressure rather than numeric upper-bound size", () => {
  const flexible = { id: "small-upper-bound", domainSize: 2, domainExact: false, hardResourceAvailabilityMinutes: 100,
    exclusiveResourceCount: 0, synchronizedSlotCount: 0, totalDuration: 10, affectedTaskCount: 1 };
  const constrained = { id: "large-upper-bound", domainSize: 80, domainExact: false, hardResourceAvailabilityMinutes: 20,
    exclusiveResourceCount: 0, synchronizedSlotCount: 4, totalDuration: 80, affectedTaskCount: 4 };
  assert.equal(selectMostConstrainedUnit([flexible, constrained])?.id, "large-upper-bound");
  assert.equal(selectMostConstrainedUnit([constrained, flexible])?.id, "large-upper-bound");
});

test("a semantically narrow inexact domain beats a clearly flexible exact domain", () => {
  const exact = { id: "flexible-exact", domainSize: 2, domainExact: true, hardResourceAvailabilityMinutes: 100,
    exclusiveResourceCount: 0, synchronizedSlotCount: 0, totalDuration: 10, affectedTaskCount: 1 };
  const narrowRound = { id: "narrow-round", domainSize: 80, domainExact: false, hardResourceAvailabilityMinutes: 20,
    exclusiveResourceCount: 0, synchronizedSlotCount: 4, totalDuration: 80, affectedTaskCount: 4 };
  assert.equal(selectMostConstrainedUnit([exact, narrowRound])?.id, "narrow-round");
  assert.equal(selectMostConstrainedUnit([narrowRound, exact])?.id, "narrow-round");
});

test("a scarce exact domain beats a semantically less constrained inexact domain", () => {
  const scarceExact = { id: "scarce-exact", domainSize: 2, domainExact: true, hardResourceAvailabilityMinutes: 20,
    exclusiveResourceCount: 2, synchronizedSlotCount: 0, totalDuration: 80, affectedTaskCount: 2 };
  const flexibleInexact = { id: "flexible-inexact", domainSize: 1, domainExact: false, hardResourceAvailabilityMinutes: 100,
    exclusiveResourceCount: 0, synchronizedSlotCount: 1, totalDuration: 10, affectedTaskCount: 1 };
  assert.equal(selectMostConstrainedUnit([scarceExact, flexibleInexact])?.id, "scarce-exact");
  assert.equal(selectMostConstrainedUnit([flexibleInexact, scarceExact])?.id, "scarce-exact");
});

test("an exact singleton wins mixed selection regardless of semantic pressure", () => {
  const singleton = { id: "singleton", domainSize: 1, domainExact: true, hardResourceAvailabilityMinutes: 100,
    exclusiveResourceCount: 0, synchronizedSlotCount: 0, totalDuration: 10, affectedTaskCount: 1 };
  const constrainedInexact = { id: "constrained-inexact", domainSize: 100, domainExact: false, hardResourceAvailabilityMinutes: 1,
    exclusiveResourceCount: 4, synchronizedSlotCount: 4, totalDuration: 100, affectedTaskCount: 4 };
  assert.equal(selectMostConstrainedUnit([singleton, constrainedInexact])?.id, "singleton");
  assert.equal(selectMostConstrainedUnit([constrainedInexact, singleton])?.id, "singleton");
});

test("a sound zero wins independently of exactness and input order", () => {
  const base = { hardResourceAvailabilityMinutes: 100, exclusiveResourceCount: 0,
    synchronizedSlotCount: 0, totalDuration: 10, affectedTaskCount: 1 };
  const candidates = [{ ...base, id: "positive", domainSize: 1, domainExact: true },
    { ...base, id: "zero", domainSize: 0, domainExact: false }];
  assert.equal(selectMostConstrainedUnit(candidates)?.id, "zero");
  assert.equal(selectMostConstrainedUnit([...candidates].reverse())?.id, "zero");
});
