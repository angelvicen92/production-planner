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
function fourParticipants() {
  const ids = ["a", "b", "c", "d"],
    availability = [{ start: 0, end: 160 }];
  const source: PlannerNextProblem = {
    day: availability[0]!,
    spaces: [
      "main",
      "entry",
      "close",
      "in",
      "out",
      "work",
      ...ids.map((id) => `vocal-${id}`),
    ].map((id) => ({ id, availability })),
    participants: ids.map((id) => ({
      id,
      availability: id === "a" ? [{ start: 0, end: 75 }] : availability,
    })),
    coaches: ids.map((id) => ({ id: `coach-${id}`, availability })),
    resources: [
      {
        id: "stylist",
        availability,
        presencePreference: "OFF",
        transitionMinutes: 0,
      },
    ],
    tasks: ids.flatMap(
      (id) =>
        [
          {
            id: `in-${id}`,
            kind: "auxiliary",
            participantId: id,
            duration: 5,
            spaceId: "in",
            dependencies: [],
          },
          {
            id: `entry-${id}`,
            kind: "auxiliary",
            participantId: id,
            duration: 10,
            spaceId: "entry",
            requiredResourceIds: ["stylist"],
            dependencies: [`in-${id}`],
          },
          {
            id: `vocal-${id}`,
            kind: "vocal",
            participantId: id,
            coachId: `coach-${id}`,
            duration: 15,
            spaceId: `vocal-${id}`,
            dependencies: [`in-${id}`],
          },
          {
            id: `main-${id}`,
            kind: "main",
            participantId: id,
            coachId: `coach-${id}`,
            duration: 15,
            spaceId: "main",
            blockKey: `coach-${id}`,
            dependencies: [`entry-${id}`, `vocal-${id}`],
          },
          {
            id: `work-${id}`,
            kind: "auxiliary",
            participantId: id,
            duration: 5,
            spaceId: "work",
            dependencies: [`main-${id}`],
          },
          {
            id: `close-${id}`,
            kind: "auxiliary",
            participantId: id,
            duration: 5,
            spaceId: "close",
            requiredResourceIds: ["stylist"],
            dependencies: [`work-${id}`, `entry-${id}`],
          },
          {
            id: `out-${id}`,
            kind: "auxiliary",
            participantId: id,
            duration: 5,
            spaceId: "out",
            dependencies: [`close-${id}`],
          },
        ] as Task[],
    ),
    mainFlow: {
      spaceId: "main",
      preferredEnd: 150,
      continuity: "REQUIRED",
      maxBlocksByKey: 1,
      minTasksPerBlock: 1,
    },
    participantTransitionMinutes: 0,
    resourceTransitionMinutes: 0,
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
    transportPolicy: {
      arrival: {
        taskIds: ids.map((id) => `in-${id}`),
        minimumGroupSize: 1,
        maximumGroupSize: 4,
        targetGroupSize: 4,
        minGapMinutes: 0,
        groupingWeight: 0,
      },
      departure: {
        taskIds: ids.map((id) => `out-${id}`),
        minimumGroupSize: 1,
        maximumGroupSize: 4,
        targetGroupSize: 1,
        minGapMinutes: 0,
        groupingWeight: 0,
      },
    },
    budget: {
      bestK: 1,
      maxPatterns: 20,
      maxBacktracks: 0,
      maxBranchExpansions: 10000,
    },
    searchPolicy: "EXACT_CONSTRUCTIVE",
  };
  const starts: Record<string, number> = {};
  for (const [i, id] of ids.entries()) {
    starts[`in-${id}`] = 0;
    starts[`vocal-${id}`] = id === "b" ? 25 : 5;
    starts[`main-${id}`] = 45 + i * 15;
    starts[`work-${id}`] = 60 + i * 15;
    starts[`close-${id}`] = 65 + i * 15;
    starts[`out-${id}`] = 70 + i * 15;
    starts[`entry-${id}`] = 5 + i * 10;
  }
  Object.assign(starts, {
    "entry-a": 25,
    "entry-b": 5,
    "entry-c": 15,
    "vocal-c": 25,
  });
  Object.assign(starts, {
    "main-b": 90,
    "work-b": 105,
    "close-b": 110,
    "out-b": 115,
    "main-d": 60,
    "work-d": 75,
    "close-d": 80,
    "out-d": 85,
  });
  const body = {
    kind: "JOINT_COMPLETION" as const,
    version: 1 as const,
    tasks: source.tasks.map((t) => ({
      ...t,
      start: starts[t.id]!,
      end: starts[t.id]! + t.duration,
    })),
    preparations: [],
    roundPreparations: [],
    participantMeals: [],
    operationalMeals: [],
    spaceMeals: [],
  };
  const prior = {
    ...body,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex"),
  };
  assert.equal(
    validatePlan(source, prior.tasks).hardValid,
    true,
    JSON.stringify(validatePlan(source, prior.tasks)),
  );
  const refreshed = structuredClone(source);
  for (const t of refreshed.tasks)
    if (t.id.startsWith("entry-")) t.duration = 20;
  const fixed = prior.tasks.filter((t) => t.id === "main-a");
  return { source, refreshed, prior, fixed };
}
function sixParticipants() {
  const ids = ["a", "b", "c", "d", "e", "f"],
    availability = [{ start: 0, end: 220 }];
  const source: PlannerNextProblem = {
    day: availability[0]!,
    spaces: [
      "main",
      "entry",
      "close",
      "in",
      "out",
      "work",
      ...ids.map((id) => `vocal-${id}`),
    ].map((id) => ({ id, availability })),
    participants: ids.map((id) => ({
      id,
      availability: id === "a" ? [{ start: 0, end: 105 }] : availability,
    })),
    coaches: ids.map((id) => ({ id: `coach-${id}`, availability })),
    resources: [
      {
        id: "stylist",
        availability,
        presencePreference: "OFF",
        transitionMinutes: 0,
      },
    ],
    tasks: ids.flatMap(
      (id) =>
        [
          {
            id: `in-${id}`,
            kind: "auxiliary",
            participantId: id,
            duration: 5,
            spaceId: "in",
            dependencies: [],
          },
          {
            id: `entry-${id}`,
            kind: "auxiliary",
            participantId: id,
            duration: 10,
            spaceId: "entry",
            requiredResourceIds: ["stylist"],
            dependencies: [`in-${id}`],
          },
          {
            id: `vocal-${id}`,
            kind: "vocal",
            participantId: id,
            coachId: `coach-${id}`,
            duration: 15,
            spaceId: `vocal-${id}`,
            dependencies: [`in-${id}`],
          },
          {
            id: `main-${id}`,
            kind: "main",
            participantId: id,
            coachId: `coach-${id}`,
            duration: 20,
            spaceId: "main",
            blockKey: `coach-${id}`,
            dependencies: [`entry-${id}`, `vocal-${id}`],
          },
          {
            id: `work-${id}`,
            kind: "auxiliary",
            participantId: id,
            duration: 5,
            spaceId: "work",
            dependencies: [`main-${id}`],
          },
          {
            id: `close-${id}`,
            kind: "auxiliary",
            participantId: id,
            duration: 5,
            spaceId: "close",
            requiredResourceIds: ["stylist"],
            dependencies: [`work-${id}`, `entry-${id}`],
          },
          {
            id: `out-${id}`,
            kind: "auxiliary",
            participantId: id,
            duration: 5,
            spaceId: "out",
            dependencies: [`close-${id}`],
          },
        ] as Task[],
    ),
    mainFlow: {
      spaceId: "main",
      preferredEnd: 150,
      continuity: "REQUIRED",
      maxBlocksByKey: 1,
      minTasksPerBlock: 1,
    },
    participantTransitionMinutes: 5,
    resourceTransitionMinutes: 0,
    auxiliaryPolicy: { participantPresencePreference: "OFF" },
    transportPolicy: {
      arrival: {
        taskIds: ids.map((id) => `in-${id}`),
        minimumGroupSize: 1,
        maximumGroupSize: 6,
        targetGroupSize: 6,
        minGapMinutes: 0,
        groupingWeight: 0,
      },
      departure: {
        taskIds: ids.map((id) => `out-${id}`),
        minimumGroupSize: 1,
        maximumGroupSize: 6,
        targetGroupSize: 1,
        minGapMinutes: 0,
        groupingWeight: 0,
      },
    },
    budget: {
      bestK: 1,
      maxPatterns: 20,
      maxBacktracks: 0,
      maxBranchExpansions: 10000,
    },
    searchPolicy: "EXACT_CONSTRUCTIVE",
  };
  source.spaces.push({ id: "cam-space", availability });
  source.resources.push({
    id: "cam",
    availability,
    presencePreference: "OFF",
    transitionMinutes: 0,
  });
  for (const id of ["e", "f"])
    source.tasks.push({
      id: `cam-${id}`,
      kind: "auxiliary",
      participantId: id,
      duration: 5,
      spaceId: "cam-space",
      requiredResourceIds: ["cam"],
      dependencies: [`entry-${id}`],
    });
  source.technicalChains = [
    {
      id: "chain",
      orderedTaskIds: ["cam-e", "cam-f"],
      adjacency: "REQUIRED",
      resourceContinuity: "REQUIRED",
      requiredResourceIds: ["cam"],
    },
  ];
  source.participantMeals = ids.map((id) => ({
    id: `meal-${id}`,
    sourceTaskId: `meal-source-${id}`,
    participantId: id,
    duration: 5,
    window: { start: 25, end: id === "a" ? 105 : 200 },
    status: "pending",
  }));
  source.participantMealCapacity = { maxSimultaneous: 2 };
  for (const t of source.tasks.filter((t) => t.id.startsWith("close-"))) {
    t.dependencies.push(`meal-source-${t.participantId}`);
    if (t.participantId === "e" || t.participantId === "f")
      t.dependencies.push(`cam-${t.participantId}`);
  }
  const starts: Record<string, number> = {};
  for (const [i, id] of ids.entries()) {
    starts[`in-${id}`] = 0;
    starts[`vocal-${id}`] = id === "b" ? 30 : 10;
    starts[`main-${id}`] = 55 + i * 20;
    starts[`work-${id}`] = 80 + i * 20;
    starts[`close-${id}`] = 90 + i * 20;
    starts[`out-${id}`] = 100 + i * 20;
    starts[`entry-${id}`] = 10 + i * 10;
  }
  Object.assign(starts, {
    "entry-a": 30,
    "entry-b": 10,
    "entry-c": 20,
    "vocal-c": 35,
    "cam-e": 75,
    "cam-f": 80,
  });
  const body = {
    kind: "JOINT_COMPLETION" as const,
    version: 1 as const,
    tasks: source.tasks.map((t) => ({
      ...t,
      start: starts[t.id]!,
      end: starts[t.id]! + t.duration,
    })),
    preparations: [],
    roundPreparations: [],
    participantMeals: ids.map((id, i) => ({
      id: `meal-${id}`,
      sourceTaskId: `meal-source-${id}`,
      participantId: id,
      duration: 5,
      start: 45 + i * 5,
      end: 50 + i * 5,
    })),
    operationalMeals: [],
    spaceMeals: [],
  };
  const prior = {
    ...body,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex"),
  };
  assert.equal(
    validatePlan(source, prior.tasks, [], [], prior.participantMeals).hardValid,
    true,
    JSON.stringify(
      validatePlan(source, prior.tasks, [], [], prior.participantMeals),
    ),
  );
  const refreshed = structuredClone(source);
  for (const t of refreshed.tasks)
    if (t.id.startsWith("entry-")) t.duration = 20;
  const fixed = prior.tasks.filter((t) => t.id === "main-c");
  return { source, refreshed, prior, fixed };
}

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
