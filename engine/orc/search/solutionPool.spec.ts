import assert from "node:assert/strict";
import { test } from "node:test";

import { structuralEquals } from "../structuralEquality";
import {
  addSolution,
  compareSolutions,
  initializeSolutionPool,
  selectBestSolution,
  type SolutionPool,
  type SolutionSnapshot,
} from "./solutionPool";

const solution = (solutionId: string, score: number | null, branchId = solutionId): SolutionSnapshot => ({
  solutionId,
  originatingBranchId: branchId,
  score,
  metadata: { branchId, readOnly: true },
});

test("initializeSolutionPool creates an empty serializable pool", () => {
  const pool = initializeSolutionPool();

  assert.deepEqual(pool, { solutions: [], bestSolutionId: null });
  assert.equal(selectBestSolution(pool), null);
  assert.deepEqual(JSON.parse(JSON.stringify(pool)), pool);
});

test("addSolution stores one solution and marks it as best", () => {
  const pool = addSolution(initializeSolutionPool(), solution("solution:a", 10, "a"));

  assert.deepEqual(pool.solutions, [solution("solution:a", 10, "a")]);
  assert.equal(pool.bestSolutionId, "solution:a");
  assert.deepEqual(selectBestSolution(pool), solution("solution:a", 10, "a"));
});

test("addSolution keeps multiple solutions in insertion order", () => {
  const pool = [solution("solution:a", 1, "a"), solution("solution:b", 3, "b"), solution("solution:c", 2, "c")]
    .reduce<SolutionPool>(addSolution, initializeSolutionPool());

  assert.deepEqual(pool.solutions.map((item) => item.solutionId), ["solution:a", "solution:b", "solution:c"]);
  assert.equal(pool.bestSolutionId, "solution:b");
});

test("addSolution updates the best solution only when a higher comparable score appears", () => {
  const first = addSolution(initializeSolutionPool(), solution("solution:a", null, "a"));
  const second = addSolution(first, solution("solution:b", 5, "b"));
  const third = addSolution(second, solution("solution:c", 5, "c"));
  const fourth = addSolution(third, solution("solution:d", 6, "d"));

  assert.equal(first.bestSolutionId, "solution:a");
  assert.equal(second.bestSolutionId, "solution:b");
  assert.equal(third.bestSolutionId, "solution:b");
  assert.equal(fourth.bestSolutionId, "solution:d");
});

test("solution pool selection is deterministic and stable for equal scores", () => {
  const inputs = [solution("solution:a", 7, "a"), solution("solution:b", 7, "b"), solution("solution:c", 6, "c")];
  const first = inputs.reduce<SolutionPool>(addSolution, initializeSolutionPool());
  const second = inputs.reduce<SolutionPool>(addSolution, initializeSolutionPool());

  assert.deepEqual(first, second);
  assert.equal(first.bestSolutionId, "solution:a");
});

test("solution pool results remain structurally equal after serialization", () => {
  const pool = [solution("solution:a", 1, "a"), solution("solution:b", 2, "b")]
    .reduce<SolutionPool>(addSolution, initializeSolutionPool());
  const roundTrip = JSON.parse(JSON.stringify(pool));

  assert.equal(structuralEquals(pool, roundTrip), true);
  assert.deepEqual(roundTrip, pool);
});

test("solution pool operations do not mutate inputs", () => {
  const pool = addSolution(initializeSolutionPool(), solution("solution:a", 1, "a"));
  const next = solution("solution:b", 2, "b");
  const beforePool = JSON.parse(JSON.stringify(pool));
  const beforeSolution = JSON.parse(JSON.stringify(next));

  const updated = addSolution(pool, next);

  assert.deepEqual(pool, beforePool);
  assert.deepEqual(next, beforeSolution);
  assert.notEqual(updated, pool);
  assert.notEqual(updated.solutions, pool.solutions);
});

test("compareSolutions reports deterministic winner without mutating the pool", () => {
  const pool = [solution("solution:a", 2, "a")]
    .reduce<SolutionPool>(addSolution, initializeSolutionPool());
  const candidate = solution("solution:b", 3, "b");
  const beforePool = JSON.parse(JSON.stringify(pool));
  const beforeCandidate = JSON.parse(JSON.stringify(candidate));

  assert.deepEqual(compareSolutions(pool, candidate), {
    candidateSolutionId: "solution:b",
    previousBestSolutionId: "solution:a",
    winnerSolutionId: "solution:b",
    candidateScore: 3,
    previousBestScore: 2,
    bestChanged: true,
  });
  assert.deepEqual(pool, beforePool);
  assert.deepEqual(candidate, beforeCandidate);
});
