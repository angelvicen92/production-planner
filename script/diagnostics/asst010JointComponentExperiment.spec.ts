import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { produce } from "./asst010JointComponentExperiment";
import {
  searchDomains,
  type Capacity,
  type Distinct,
  type Relation,
} from "./asst010JointComponentDomains";
import { validatePlan } from "../../engine/planner-next/validate";
import { revalidateJointCompletionWitness } from "../../engine/planner-next/jointCompletionWitness";
import { PreparedFutureCollectiveParticipantClosure } from "../../engine/planner-next/futureCollectiveParticipantClosure";
import type {
  PlannerNextProblem,
  Task,
} from "../../engine/planner-next/contracts";
// Fixtures supply an old, valid ten-minute lineage, never a post-refresh solution.
import { fourParticipants,sixParticipants } from "./asst010JointComponentFixtures";
for (const [name, build] of [
  ["dense geometry and closure", fourParticipants],
  [
    "protected Main, coupled entries, chain, meals and transport",
    sixParticipants,
  ],
] as const) {
  test(`joint component diagnostic certifies ${name} deterministically`, () => {
    const { source, refreshed, prior, fixed } = build();
    const before = structuredClone({ source, refreshed, prior, fixed });
    const entries = refreshed.tasks.filter((t) => t.id.startsWith("entry-"));
    assert.equal(
      entries.length * 20 + 5 >
        refreshed.participants.find((p) => p.id === "a")!.availability[0]!.end,
      true,
    );
    // Dense entries released after IN cannot accommodate a's required stylist closure.
    assert.equal(
      revalidateJointCompletionWitness(refreshed, prior, fixed, () => true),
      "STALE",
    );
    const run = () => {
      let charges = 0;
      const result = produce(refreshed, prior, fixed, () =>
        charges < 10000 ? (charges++, true) : false,
      );
      return { result, charges };
    };
    const started = performance.now();
    const first = run();
    const wallMs = performance.now() - started;
    const second = run();
    assert.deepEqual(first, second);
    const witness = first.result.witness;
    assert.ok(witness);
    assert.equal(first.result.result!.stats.leaves, 1);
    assert.equal(
      revalidateJointCompletionWitness(refreshed, witness, fixed, () => true),
      "PASS",
    );
    const closure = new PreparedFutureCollectiveParticipantClosure(
      refreshed,
    ).evaluate(
      [...witness.tasks],
      [...witness.participantMeals],
      () => true,
      "CERTIFY",
    );
    assert.equal(closure.certified, true);
    assert.equal(closure.status, "PASS");
    assert.deepEqual(
      witness.tasks.filter((t) => fixed.some((f) => f.id === t.id)),
      fixed,
    );
    assert.equal(witness.tasks.length, refreshed.tasks.length);
    assert.equal(
      validatePlan(
        refreshed,
        [...witness.tasks],
        [],
        [],
        [...witness.participantMeals],
      ).hardValid,
      true,
    );
    assert.ok(
      witness.tasks.some(
        (t) =>
          t.kind === "main" &&
          !fixed.some((f) => f.id === t.id) &&
          prior.tasks.find((p) => p.id === t.id)!.start !== t.start,
      ),
    );
    assert.ok(
      witness.tasks.some(
        (t) =>
          t.kind === "vocal" &&
          prior.tasks.find((p) => p.id === t.id)!.start !== t.start,
      ),
    );
    const stats = first.result.result!.stats;
    const replayVertices =
      witness.tasks.length +
      witness.preparations.length +
      witness.roundPreparations.length +
      witness.participantMeals.length +
      witness.operationalMeals.length;
    assert.equal(
      first.charges,
      stats.relations + stats.decisions + stats.propagations + replayVertices,
    );
    console.error(
      JSON.stringify({
        fixture: name,
        wallMs,
        charges: first.charges,
        stats,
        closureCertified: closure.certified,
        witnessFingerprint: witness.fingerprint,
        changedMainIds: witness.tasks
          .filter(
            (t) =>
              t.kind === "main" &&
              prior.tasks.find((p) => p.id === t.id)!.start !== t.start,
          )
          .map((t) => t.id),
        changedVocalIds: witness.tasks
          .filter(
            (t) =>
              t.kind === "vocal" &&
              prior.tasks.find((p) => p.id === t.id)!.start !== t.start,
          )
          .map((t) => t.id),
      }),
    );
    assert.ok(first.charges <= 10000);
    assert.deepEqual({ source, refreshed, prior, fixed }, before);
  });
}

test("diagnostic budget and timeout cannot create a completion or reject the full problem", () => {
  const { refreshed, prior, fixed } = fourParticipants(),
    before = structuredClone({ refreshed, prior, fixed });
  let charges = 0;
  const result = produce(refreshed, prior, fixed, () =>
    charges < 2 ? (charges++, true) : false,
  );
  assert.equal(result.witness, null);
  assert.equal(result.result!.outcome, "BUDGET_EXHAUSTED");
  assert.equal(charges, 2);
  assert.throws(
    () =>
      produce(
        refreshed,
        prior,
        fixed,
        () => true,
        () => {
          throw Error("DIAGNOSTIC_TIME_LIMIT");
        },
      ),
    /DIAGNOSTIC_TIME_LIMIT/,
  );
  assert.deepEqual({ refreshed, prior, fixed }, before);
});

test("necessary domain consistency is never sufficient canonical certification", () => {
  const result = searchDomains(
    [
      [0, 1],
      [0, 1],
    ],
    [],
    () => true,
    () => false,
  );
  assert.equal(result.outcome, "EXHAUSTED_RESTRICTED");
  assert.equal(result.solution, null);
  assert.ok(result.stats.leaves > 0);
});

test("value explanations, capacity, matching and scoped nogoods preserve exhaustive feasible alternatives", () => {
  let seed = 9137;
  const random = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let trial = 0; trial < 300; trial++) {
    const n = 3 + random(3),
      values = Array.from({ length: n }, () =>
        [0, 1, 2, 3].filter(() => random(4) !== 0),
      );
    const relations: Relation[] = [];
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        if (random(2)) {
          const table = Array.from({ length: 4 }, () =>
            Array.from({ length: 4 }, () => random(3) !== 0),
          );
          relations.push({ a, b, allows: (a, b) => table[a]![b]! });
        }
    const capacities: Capacity[] = random(2)
      ? [
          {
            maximum: 1 + random(2),
            members: values.map((_, variable) => ({
              variable,
              offset: 0,
              duration: 1 + random(2),
            })),
          },
        ]
      : [];
    const distinct: Distinct[] =
      trial % 3 === 0 && n === 4
        ? [
            {
              members: values.map((_, variable) => ({ variable, offset: 0 })),
              slots: [0, 1, 2, 3],
            },
          ]
        : [];
    const accepts = (point: number[]) =>
      relations.every((r) => r.allows(point[r.a]!, point[r.b]!)) &&
      distinct.every(
        (d) =>
          new Set(d.members.map((m) => point[m.variable]! + m.offset)).size ===
          d.members.length,
      ) &&
      capacities.every((c) =>
        Array.from(
          { length: 6 },
          (_, t) =>
            c.members.filter(
              (m) =>
                point[m.variable]! + m.offset <= t &&
                t < point[m.variable]! + m.offset + m.duration,
            ).length,
        ).every((count) => count <= c.maximum),
      );
    let exists = false;
    const brute = (point: number[]) => {
      if (point.length === n) {
        exists ||= accepts(point);
        return;
      }
      for (const v of values[point.length]!) brute([...point, v]);
    };
    brute([]);
    let charges = 0;
    const found = searchDomains(
      values,
      relations,
      () => ++charges <= 100000,
      accepts,
      undefined,
      undefined,
      capacities,
      distinct,
    );
    assert.equal(
      found.outcome === "COMPLETE",
      exists,
      JSON.stringify({ trial, values, capacities, distinct, found }),
    );
  }
});

test("first-conflict capture preserves a conditional counterexample without declaring full infeasibility", () => {
  const values = [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    relations: Relation[] = [
      { a: 0, b: 1, allows: (a, b) => a !== b },
      { a: 0, b: 2, allows: (a, b) => a !== b },
      { a: 1, b: 2, allows: (a, b) => a !== b },
    ];
  assert.throws(
    () =>
      searchDomains(
        values,
        relations,
        () => true,
        () => true,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      ),
    (e) => {
      const error = e as Error & {
        stats: {
          leaves: number;
          firstConflict: {
            assignedValues: Record<string, number>;
            remainingDomains: number[][];
          };
        };
      };
      assert.equal(error.message, "DIAGNOSTIC_FIRST_CONFLICT_CAPTURED");
      assert.equal(error.stats.leaves, 0);
      assert.ok(
        error.stats.firstConflict.remainingDomains.some((d) => d.length === 0),
      );
      assert.ok(
        Object.keys(error.stats.firstConflict.assignedValues).length > 0,
      );
      return true;
    },
  );
  assert.equal(
    searchDomains(
      values,
      relations,
      () => true,
      () => true,
    ).outcome,
    "EXHAUSTED_RESTRICTED",
  );
});
