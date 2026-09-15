import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "./assistedPlanning";
import { validatePlan } from "./validate";

function fixture(): PlannerNextProblem {
  return {
    day: { start: 0, end: 180 }, spaces: [
      { id: "main-space", availability: [{ start: 0, end: 180 }] },
      { id: "vocal-space", availability: [{ start: 0, end: 180 }] },
      { id: "other-space", availability: [{ start: 0, end: 180 }] },
    ], resources: [{ id: "coach", availability: [{ start: 0, end: 180 }], presencePreference: "OFF" }],
    participants: [{ id: "p1", availability: [{ start: 0, end: 180 }] }, { id: "p2", availability: [{ start: 0, end: 180 }] }],
    coaches: [{ id: "coach", availability: [{ start: 0, end: 180 }] }],
    tasks: [
      { id: "feed", kind: "vocal", duration: 10, spaceId: "vocal-space", participantId: "p1", coachId: "coach", dependencies: [] },
      { id: "main", kind: "main", duration: 15, spaceId: "main-space", participantId: "p1", coachId: "coach", blockKey: "coach", dependencies: ["feed"], requiredResourceIds: ["coach"] },
      { id: "protected", kind: "auxiliary", duration: 10, spaceId: "other-space", participantId: "p2", dependencies: [] },
      { id: "outside", kind: "auxiliary", duration: 10, spaceId: "other-space", participantId: "p2", dependencies: [] },
    ],
    mainFlow: { spaceId: "main-space", preferredEnd: 120, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 5, resourceTransitionMinutes: 0,
    budget: { bestK: 2, maxBacktracks: 100, maxPatterns: 20, maxBranchExpansions: 5_000 },
    auxiliaryPolicy: { participantPresencePreference: "OFF" }, searchPolicy: "EXACT_CONSTRUCTIVE",
  };
}

test("scope resolution is canonical and rejects duplicate or unknown task IDs", () => {
  const scope = createPlanningScope({ kind: "space", value: "main-space" }, { z: 1, a: true }, ["main"]);
  assert.deepEqual(scope.resolvedTaskIds, ["main"]);
  assert.deepEqual(Object.keys(scope.metadata), ["a", "z"]);
  assert.throws(() => createPlanningScope({ kind: "ids", value: "x" }, {}, ["main", "main"]), /DUPLICATE/);
  assert.throws(() => buildAssistedProblem(fixture(), createPlanningScope({ kind: "ids", value: "x" }, {}, ["missing"]), []), /UNKNOWN/);
});

test("assisted projection is immutable, fixes accepted placements and never moves outside scope", () => {
  const source = fixture();
  const before = structuredClone(source);
  const protectedPlacement: ScheduledTask = { ...source.tasks.find(({ id }) => id === "protected")!, start: 140, end: 150 } as ScheduledTask;
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), [protectedPlacement]);
  assert.deepEqual(source, before);
  assert.deepEqual(assisted.automaticTaskIds, ["feed", "main"]);
  assert.deepEqual(assisted.supportingTaskIds, ["feed"]);
  assert.equal(assisted.problem.tasks.some(({ id }) => id === "outside"), false);
  const first = executeAssistedPlanning(assisted);
  const second = executeAssistedPlanning(buildAssistedProblem(source, assisted.scope, [protectedPlacement]));
  assert.equal(first.evidence.completeForScope, true, first.evidence.reasonCodes.join(","));
  assert.equal(first.evidence.hardValid, true);
  assert.equal(first.evidence.requiredValid, true);
  assert.equal(first.evidence.proposalCount, 1);
  assert.deepEqual(first.evidence.supportingTaskIds, ["feed"]);
  assert.equal(first.evidence.fingerprint, second.evidence.fingerprint);
  assert.deepEqual(first.proposal?.map(({ id }) => id), ["main"]);
  assert.equal(first.proposal?.some(({ id }) => id === "feed" || id === "outside" || id === "protected"), false);
  const scheduledProtected = executeAssistedPlanning(assisted).evidence;
  assert.equal(scheduledProtected.protectedPlacementCount, 1);
  assert.equal(scheduledProtected.protectedPlacementsPreserved, true);
  assert.deepEqual(source, before);
});

test("protected placements remain traversal roots without becoming automatic variables", () => {
  const source = fixture();
  source.tasks.find(({ id }) => id === "protected")!.dependencies = ["outside"];
  const protectedPlacement = { ...source.tasks.find(({ id }) => id === "protected")!, start: 140, end: 150 } as ScheduledTask;
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), [protectedPlacement]);
  assert.deepEqual(assisted.supportingTaskIds, ["feed", "outside"]);
  assert.equal(assisted.automaticTaskIds.includes("protected"), false);
  assert.equal(assisted.problem.tasks.some(({ id }) => id === "outside"), true);
});

test("supporting closure does not infer feeders from task kind and participant", () => {
  const source = fixture();
  source.tasks.find(({ id }) => id === "main")!.dependencies = [];
  source.tasks.push({ ...source.tasks.find(({ id }) => id === "feed")!, id: "another-vocal" });
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), []);
  assert.deepEqual(assisted.supportingTaskIds, []);
  assert.deepEqual(assisted.problem.tasks.map(({ id }) => id), ["main"]);
});

test("a fixed placement violation requires its exact accepted baseline", () => {
  const source = fixture();
  const protectedTask = source.tasks.find(({ id }) => id === "protected")!;
  protectedTask.availability = [{ start: 0, end: 10 }];
  const protectedPlacement = { ...protectedTask, start: 140, end: 150 } as ScheduledTask;
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), [protectedPlacement]);
  const result = executeAssistedPlanning(assisted);
  assert.equal(result.proposal,null);
  assert.equal(result.evidence.protectedPlacementsPreserved, true);
  assert.equal(result.evidence.completeForScope, false);
  assert.equal(result.evidence.proposalCount, 0);
  assert.equal(result.evidence.hardValid, false);
  assert.equal(result.evidence.requiredValid, false);
});

test("protected-vs-protected inherited incompatibility remains an ASST-008 AcceptedException boundary", () => {
  const source = fixture();
  const first = source.tasks.find(({ id }) => id === "protected")!;
  const second = source.tasks.find(({ id }) => id === "outside")!;
  const protectedPlacements = [first, second].map((task) => ({ ...task, start: 140, end: 150 } as ScheduledTask));
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), protectedPlacements);
  const result = executeAssistedPlanning(assisted);

  // The strict solver sees both accepted rows as ordinary hard constraints. Teaching
  // it an accepted-exception delta would require the ASST-008 persistence/search contract.
  assert.equal(result.proposal, null);
  assert.equal(result.evidence.protectedPlacementCount, 2);
  assert.equal(result.evidence.proposalCount, 0);
  assert.ok(result.evidence.reasonCodes.includes("ASSISTED_SCOPE_INCOMPLETE")
    || result.evidence.reasonCodes.includes("ASSISTED_HARD_VALIDATION_FAILED"));
  const accepted=executeAssistedPlanning(assisted,{violations:validatePlan(assisted.originalValidationProblem,protectedPlacements).violations?.filter(item=>item.ruleCode==="OVERLAP_VIOLATION")??[]});
  assert.deepEqual(accepted.proposal?.map(task=>task.id),["main"]);
  assert.equal(accepted.evidence.hardValid,false);
});

test("canonical validator emits separate exact structured overlap identities",()=>{
  const problem=fixture();const tasks=problem.tasks.map((task,index)=>({...task,start:index<2?20:140,end:index===1?35:index<2?30:150})) as ScheduledTask[];
  const overlaps=validatePlan(problem,tasks).violations?.filter(item=>item.ruleCode==="OVERLAP_VIOLATION")??[];
  assert.equal(overlaps.length,2);assert.deepEqual(overlaps.map(item=>item.affectedTaskIds),[["feed","main"],["outside","protected"]]);
  assert.deepEqual(overlaps[1]?.affectedSpaceIds,["other-space"]);assert.equal(overlaps[0]?.severity,"HARD");
});

test("one shared closure keeps every hard-coupled structure intact and explains supporting members", () => {
  const source = fixture();
  source.tasks = [
    { ...source.tasks[0], id: "dependency" },
    { ...source.tasks[2], id: "seed", dependencies: ["dependency"], jointGroupId: "joint" },
    { ...source.tasks[2], id: "joint-peer", jointGroupId: "joint" },
    { ...source.tasks[2], id: "anchor" },
    { ...source.tasks[2], id: "chain-peer" },
    { ...source.tasks[2], id: "round-peer" },
    { ...source.tasks[2], id: "unrelated" },
  ];
  source.anchoredAccompaniments = [{ id: "a", anchorTaskId: "joint-peer", beforeTaskIds: [], afterTaskIds: ["anchor"], adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED" }];
  source.technicalChains = [{ id: "c", orderedTaskIds: ["anchor", "chain-peer"], adjacency: "REQUIRED", resourceContinuity: "REQUIRED", requiredResourceIds: [] }];
  source.roundSynchronizations = [{ id: "r", synchronization: "START_TOGETHER_WHILE_ALL_LANES_ACTIVE", lanes: [
    { spaceId: "other-space", taskIds: ["chain-peer"], preparationMinutesBetweenRounds: 0 },
    { spaceId: "vocal-space", taskIds: ["round-peer"], preparationMinutesBetweenRounds: 0 },
  ] }];
  const result = buildAssistedProblem(source, createPlanningScope({ kind: "ids", value: "seed" }, {}, ["seed"]), []);
  assert.deepEqual(result.problem.tasks.map(({ id }) => id).sort(), ["anchor", "chain-peer", "dependency", "joint-peer", "round-peer", "seed"].sort());
  assert.equal(result.problem.tasks.some(({ id }) => id === "unrelated"), false);
  assert.deepEqual(result.supportingTaskIds, ["anchor", "chain-peer", "dependency", "joint-peer", "round-peer"]);
  assert.match(result.supportingReasonByTaskId.dependency.join(), /DEPENDENCY_OF:seed/);
  assert.match(result.supportingReasonByTaskId["joint-peer"].join(), /JOINT_GROUP:joint/);
  assert.match(result.supportingReasonByTaskId.anchor.join(), /ANCHORED_WITH:joint-peer/);
  assert.match(result.supportingReasonByTaskId["chain-peer"].join(), /TECHNICAL_CHAIN:c/);
  assert.match(result.supportingReasonByTaskId["round-peer"].join(), /ROUND_SYNCHRONIZATION:r/);
});
