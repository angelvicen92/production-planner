import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validatePlan } from "../../engine/planner-next/validate";
import type { PlannerNextProblem,Task } from "../../engine/planner-next/contracts";
export function fourParticipants() {
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
export function sixParticipants() {
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
