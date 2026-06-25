import assert from "node:assert/strict";
import test from "node:test";
import { structuralEquals } from "../structuralEquality";
import {
  consumeCandidate,
  consumeOpportunity,
  consumeSearchSpace,
  consumeSimulation,
  createReasoningBudget,
  remainingBudget,
} from "./reasoningBudget";
import { runORCShadowMode } from "../shadow/runORCShadowMode";

const consumeTwice = <T>(value: T, fn: (value: T) => T): T => fn(fn(value));

test("createReasoningBudget creates the deterministic default budget", () => {
  const budget = createReasoningBudget();
  assert.deepEqual(budget, {
    maxOpportunities: 20,
    maxSearchSpaces: 10,
    maxCandidates: 20,
    maxSimulations: 20,
    consumedOpportunities: 0,
    consumedSearchSpaces: 0,
    consumedCandidates: 0,
    consumedSimulations: 0,
  });
  assert.equal(Object.isFrozen(budget), true);
});

test("budget consumption covers opportunities, SearchSpaces, candidates and simulations", () => {
  const budget = consumeSimulation(consumeCandidate(consumeSearchSpace(consumeOpportunity(createReasoningBudget()))));
  assert.equal(budget.consumedOpportunities, 1);
  assert.equal(budget.consumedSearchSpaces, 1);
  assert.equal(budget.consumedCandidates, 1);
  assert.equal(budget.consumedSimulations, 1);
  assert.deepEqual(remainingBudget(budget), { opportunities: 19, searchSpaces: 9, candidates: 19, simulations: 19 });
});

test("budget consumption does not mutate input budgets", () => {
  const initial = createReasoningBudget({ maxOpportunities: 2 });
  const updated = consumeOpportunity(initial);
  assert.equal(initial.consumedOpportunities, 0);
  assert.equal(updated.consumedOpportunities, 1);
  assert.notEqual(updated, initial);
});

test("budget consumption cannot exceed maximums", () => {
  const budget = consumeTwice(createReasoningBudget({ maxOpportunities: 1, maxSearchSpaces: 1, maxCandidates: 1, maxSimulations: 1 }), (value) =>
    consumeSimulation(consumeCandidate(consumeSearchSpace(consumeOpportunity(value)))),
  );
  assert.equal(budget.consumedOpportunities, 1);
  assert.equal(budget.consumedSearchSpaces, 1);
  assert.equal(budget.consumedCandidates, 1);
  assert.equal(budget.consumedSimulations, 1);
  assert.deepEqual(remainingBudget(budget), { opportunities: 0, searchSpaces: 0, candidates: 0, simulations: 0 });
});

test("budget creation prevents negative values", () => {
  assert.deepEqual(createReasoningBudget({ maxOpportunities: -1, consumedCandidates: -5 }), {
    maxOpportunities: 0,
    maxSearchSpaces: 10,
    maxCandidates: 20,
    maxSimulations: 20,
    consumedOpportunities: 0,
    consumedSearchSpaces: 0,
    consumedCandidates: 0,
    consumedSimulations: 0,
  });
});

test("budget operations are deterministic and structurally equal", () => {
  const build = () => consumeCandidate(consumeSearchSpace(consumeOpportunity(createReasoningBudget({ maxCandidates: 3 }))));
  assert.equal(structuralEquals(build(), build()), true);
  assert.deepEqual(build(), build());
});

test("Shadow Mode summary reflects reasoning budget consumption", () => {
  const shadow = runORCShadowMode({ planId: 103, tasks: [], assignments: [], resources: [], constraints: [] } as any, { enabled: true, createdAt: "2026-06-25T00:00:00.000Z" });
  assert.notEqual(shadow, null);
  assert.deepEqual(shadow?.summary.reasoningBudget, {
    consumedOpportunities: shadow?.cognitiveState.reasoningBudget.consumedOpportunities,
    consumedSearchSpaces: shadow?.cognitiveState.reasoningBudget.consumedSearchSpaces,
    consumedCandidates: shadow?.cognitiveState.reasoningBudget.consumedCandidates,
    consumedSimulations: shadow?.cognitiveState.reasoningBudget.consumedSimulations,
    remaining: remainingBudget(shadow!.cognitiveState.reasoningBudget),
  });
  assert.ok(shadow?.evidence.some((item) => item.kind === "cognitive-state-initial" && "reasoningBudget" in item.data));
  assert.ok(shadow?.evidence.some((item) => item.kind === "cognitive-state-final" && "reasoningBudget" in item.data));
  assert.ok(shadow?.evidence.some((item) => item.kind === "cognitive-state-diff" && "reasoningBudgetRemaining" in item.data));
});
