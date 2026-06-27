import assert from "node:assert/strict";
import { test } from "node:test";

import { structuralEquals } from "../structuralEquality";
import {
  initializeOnlineSearchMemory,
  queryLearnedPattern,
  registerSearchObservation,
  type LearnedSearchPattern,
  type OnlineSearchMemory,
} from "./onlineSearchLearning";

const pattern = (patternId: string, score: number, observations = 1): LearnedSearchPattern => ({
  patternId,
  observations,
  averageScore: score,
  lastScore: score,
  explanation: `Pattern ${patternId} observed with score ${score}.`,
});

test("initializeOnlineSearchMemory creates empty serializable memory", () => {
  const memory = initializeOnlineSearchMemory();

  assert.deepEqual(memory, { patterns: [] });
  assert.equal(queryLearnedPattern(memory, "missing"), null);
  assert.deepEqual(JSON.parse(JSON.stringify(memory)), memory);
});

test("registerSearchObservation stores one learned pattern", () => {
  const observed = pattern("branch:a", 10);
  const memory = registerSearchObservation(initializeOnlineSearchMemory(), observed);

  assert.deepEqual(memory.patterns, [observed]);
  assert.deepEqual(queryLearnedPattern(memory, "branch:a"), observed);
});

test("registerSearchObservation keeps multiple patterns in deterministic insertion order", () => {
  const memory = [pattern("branch:a", 1), pattern("branch:b", 2), pattern("branch:c", 3)]
    .reduce<OnlineSearchMemory>(registerSearchObservation, initializeOnlineSearchMemory());

  assert.deepEqual(memory.patterns.map((item) => item.patternId), ["branch:a", "branch:b", "branch:c"]);
});

test("registerSearchObservation updates an existing pattern average and last score", () => {
  const first = registerSearchObservation(initializeOnlineSearchMemory(), pattern("branch:a", 4));
  const second = registerSearchObservation(first, pattern("branch:a", 10));

  assert.deepEqual(second.patterns, [{
    patternId: "branch:a",
    observations: 2,
    averageScore: 7,
    lastScore: 10,
    explanation: "Pattern branch:a observed with score 10.",
  }]);
});

test("queryLearnedPattern returns null for unknown patterns and a defensive copy for known patterns", () => {
  const memory = registerSearchObservation(initializeOnlineSearchMemory(), pattern("branch:a", 5));
  const found = queryLearnedPattern(memory, "branch:a");

  assert.equal(queryLearnedPattern(memory, "missing"), null);
  assert.deepEqual(found, pattern("branch:a", 5));
  assert.notEqual(found, memory.patterns[0]);
});

test("online search learning is deterministic", () => {
  const observations = [pattern("branch:b", 2), pattern("branch:a", 4), pattern("branch:b", 8)];
  const first = observations.reduce<OnlineSearchMemory>(registerSearchObservation, initializeOnlineSearchMemory());
  const second = observations.reduce<OnlineSearchMemory>(registerSearchObservation, initializeOnlineSearchMemory());

  assert.deepEqual(first, second);
});

test("online search memory remains structurally equal after serialization", () => {
  const memory = [pattern("branch:a", 1), pattern("branch:b", 2)]
    .reduce<OnlineSearchMemory>(registerSearchObservation, initializeOnlineSearchMemory());
  const roundTrip = JSON.parse(JSON.stringify(memory));

  assert.equal(structuralEquals(memory, roundTrip), true);
  assert.deepEqual(roundTrip, memory);
});

test("online search learning operations do not mutate inputs", () => {
  const memory = registerSearchObservation(initializeOnlineSearchMemory(), pattern("branch:a", 1));
  const observed = pattern("branch:a", 3);
  const beforeMemory = JSON.parse(JSON.stringify(memory));
  const beforeObserved = JSON.parse(JSON.stringify(observed));

  const updated = registerSearchObservation(memory, observed);

  assert.deepEqual(memory, beforeMemory);
  assert.deepEqual(observed, beforeObserved);
  assert.notEqual(updated, memory);
  assert.notEqual(updated.patterns, memory.patterns);
});
