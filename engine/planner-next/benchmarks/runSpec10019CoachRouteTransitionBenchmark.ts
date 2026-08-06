import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EngineInput } from "../../types";
import type { PlannerNextProblem, ScheduledTask, Task } from "../contracts";
import { effectiveCoachTransitionMinutes } from "../coachRouteTransitions";
import { canPlaceTask } from "../placement";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { preflight as preflightPlannerNextProblem, validatePlan } from "../validate";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "../integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";

const evidencePath = "docs/evidence/SPEC10-019-coach-route-transition.json";
const coveragePath = "docs/coverage/SPEC10-019-COACH-ROUTE-TRANSITION.md";
const compare = (left: string, right: string): number => left.localeCompare(right, "en");

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "runtimeMs")
      .sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}
const canonicalJson = (value: unknown): string => JSON.stringify(canonical(value));
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

export function createSpec10019CoachRouteTransitionFixture(): EngineInput {
  const input = createSupportedEngineInputAdapterFixture();
  input.tasks = input.tasks.filter((task) => task.id === 101 || task.id === 102).map((task) => task.id === 101
    ? { ...task, durationOverrideMin: 15, fixedWindowStart: "10:45", fixedWindowEnd: "11:00", assignedResourceIds: [501], dependsOnTaskIds: [102], dependsOnTaskId: undefined }
    : { ...task, durationOverrideMin: 15, fixedWindowStart: "10:00", fixedWindowEnd: "10:15", assignedResourceIds: [501], dependsOnTaskIds: [], dependsOnTaskId: undefined });
  input.locks = [];
  input.planResourceItems = input.planResourceItems.filter((resource) => resource.id === 501);
  input.planZoneSettings = input.planZoneSettings?.filter((zone) => zone.zoneId === 401 || zone.zoneId === 402);
  input.planSpaceSettings = input.planSpaceSettings?.filter((space) => space.spaceId === 301 || space.spaceId === 302);
  input.contestantAvailabilityById = { 201: { start: "08:00", end: "17:00" } };
  input.vocalCoachPlanResourceItemIdByContestantId = { 201: 501 };
  input.coachResourceIds = [501];
  input.spaceResourceAssignments = {};
  input.zoneResourceAssignments = {};
  input.groupingZoneIds = [];
  input.plannerNext = {
    ...input.plannerNext!,
    participantTransitionMinutes: 10,
    resourceTransitionMinutes: 5,
    searchBudget: { bestK: 5, maxBacktracks: 100, maxPatterns: 100, maxBranchExpansions: 10000 },
    mainFlow: { ...input.plannerNext!.mainFlow, preferredEnd: "11:00" },
  };
  input.coachRouteTransitions = [{
    coachPlanResourceItemId: 501,
    fromSpaceId: 302,
    toSpaceId: 301,
    minutes: 30,
  }];
  return input;
}

export interface Spec10019ProbeRun {
  inputSnapshot: EngineInput;
  engineInputPreflightStatus: "SUPPORTED" | "UNSUPPORTED";
  adapterStatus: "SUPPORTED" | "UNSUPPORTED";
  plannerNextPreflightReasonCodes: readonly string[];
  sourceFingerprint: string;
  identityMapFingerprint: string;
  problemFingerprint: string;
  planFingerprint: string;
  globalResourceTransitionMinutes: number;
  projectedRouteCount: number;
  routeMinutes: number | null;
  complete: boolean;
  hardValid: boolean;
  plannedTaskCount: number;
  unplannedTaskCount: number;
  scheduledGapMinutes: number;
  rejectsTwentyNineMinutes: boolean;
  acceptsThirtyMinutes: boolean;
  validationAtTwentyNine: { transitionViolationCount: number; hardValid: boolean };
  validationAtThirty: { transitionViolationCount: number; hardValid: boolean };
  reverseDirectionMinutes: number;
  unrelatedCoachMinutes: number;
  inputImmutable: boolean;
}

function withoutAvailability(task: Task): Task {
  const { availability: _availability, ...copy } = task;
  return copy as Task;
}

export function logicalProjection(
  run: Spec10019ProbeRun,
): Omit<Spec10019ProbeRun, "inputSnapshot"> {
  const { inputSnapshot: _inputSnapshot, ...projection } = run;
  return projection;
}

export function runSpec10019Probe(
  factory: () => EngineInput = createSpec10019CoachRouteTransitionFixture,
): Spec10019ProbeRun {
  const input = factory();
  const inputSnapshot = structuredClone(input);
  const engineInputPreflight = preflightEngineInputForPlannerNext(input);
  assert.equal(engineInputPreflight.status, "SUPPORTED", engineInputPreflight.reasonCodes.join(","));
  const adapter = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapter.status, "SUPPORTED", adapter.status === "UNSUPPORTED" ? adapter.reasonCodes.join(",") : "");
  assert.ok(adapter.problem);
  const problem = adapter.problem;
  const plannerNextPreflightReasonCodes = preflightPlannerNextProblem(problem);
  assert.deepEqual(plannerNextPreflightReasonCodes, []);
  const plan = planMainFlowAndFeeders(problem);
  const validation = validatePlan(
    problem,
    plan.scheduledTasks,
    plan.scheduledSetupPreparations,
    plan.scheduledSpaceMeals,
    plan.scheduledParticipantMeals,
    plan.scheduledResourceMeals,
    plan.scheduledItinerantUnitMeals,
  );
  const vocal = plan.scheduledTasks.find((task) => task.kind === "vocal");
  const main = plan.scheduledTasks.find((task) => task.kind === "main");
  assert.ok(vocal);
  assert.ok(main);
  const primaryRoute = problem.coachRouteTransitions?.[0];
  assert.ok(primaryRoute);

  const boundaryTasks = problem.tasks.map(withoutAvailability);
  const boundaryProblem: PlannerNextProblem = {
    ...problem,
    tasks: boundaryTasks,
    mainFlow: { ...problem.mainFlow, preferredEnd: 660 },
    anchoredAccompaniments: undefined,
  };
  const boundaryVocal = boundaryTasks.find((task) => task.kind === "vocal");
  const boundaryMain = boundaryTasks.find((task) => task.kind === "main");
  assert.ok(boundaryVocal);
  assert.ok(boundaryMain);
  const scheduledVocal: ScheduledTask = { ...boundaryVocal, start: 600, end: 615 };
  const mainAtTwentyNine: ScheduledTask = { ...boundaryMain, start: 644, end: 659 };
  const mainAtThirty: ScheduledTask = { ...boundaryMain, start: 645, end: 660 };
  const rejectsTwentyNineMinutes = !canPlaceTask(boundaryProblem, boundaryMain, 644, [scheduledVocal]);
  const acceptsThirtyMinutes = canPlaceTask(boundaryProblem, boundaryMain, 645, [scheduledVocal]);
  const validationAtTwentyNine = validatePlan(boundaryProblem, [scheduledVocal, mainAtTwentyNine]);
  const validationAtThirty = validatePlan(boundaryProblem, [scheduledVocal, mainAtThirty]);

  const result: Spec10019ProbeRun = {
    inputSnapshot,
    engineInputPreflightStatus: engineInputPreflight.status,
    adapterStatus: adapter.status,
    plannerNextPreflightReasonCodes,
    sourceFingerprint: adapter.sourceFingerprint,
    identityMapFingerprint: adapter.identityMapFingerprint,
    problemFingerprint: adapter.problemFingerprint,
    planFingerprint: plan.metrics.planFingerprint,
    globalResourceTransitionMinutes: problem.resourceTransitionMinutes,
    projectedRouteCount: problem.coachRouteTransitions?.length ?? 0,
    routeMinutes: primaryRoute.minutes,
    complete: plan.complete,
    hardValid: validation.hardValid,
    plannedTaskCount: plan.metrics.plannedTaskCount,
    unplannedTaskCount: plan.metrics.unplannedTaskCount,
    scheduledGapMinutes: main.start - vocal.end,
    rejectsTwentyNineMinutes,
    acceptsThirtyMinutes,
    validationAtTwentyNine: { transitionViolationCount: validationAtTwentyNine.transitionViolationCount, hardValid: validationAtTwentyNine.hardValid },
    validationAtThirty: { transitionViolationCount: validationAtThirty.transitionViolationCount, hardValid: validationAtThirty.hardValid },
    reverseDirectionMinutes: effectiveCoachTransitionMinutes(problem, primaryRoute.coachId, primaryRoute.toSpaceId, primaryRoute.fromSpaceId),
    unrelatedCoachMinutes: effectiveCoachTransitionMinutes(problem, "plan-resource:999", primaryRoute.fromSpaceId, primaryRoute.toSpaceId),
    inputImmutable: canonicalJson(input) === canonicalJson(inputSnapshot),
  };

  assert.equal(result.complete, true);
  assert.equal(result.hardValid, true);
  assert.equal(result.plannedTaskCount, 2);
  assert.equal(result.unplannedTaskCount, 0);
  assert.equal(result.globalResourceTransitionMinutes, 5);
  assert.equal(result.projectedRouteCount, 1);
  assert.equal(result.routeMinutes, 30);
  assert.equal(result.scheduledGapMinutes, 30);
  assert.equal(result.rejectsTwentyNineMinutes, true);
  assert.equal(result.acceptsThirtyMinutes, true);
  assert.equal(result.validationAtTwentyNine.transitionViolationCount, 1);
  assert.equal(result.validationAtThirty.transitionViolationCount, 0);
  assert.equal(result.validationAtThirty.hardValid, true);
  assert.equal(result.reverseDirectionMinutes, 5);
  assert.equal(result.unrelatedCoachMinutes, 5);
  assert.equal(result.inputImmutable, true);
  return result;
}

function unsupportedCase(caseId: string, mutate: (input: EngineInput) => void) {
  const input = createSpec10019CoachRouteTransitionFixture();
  mutate(input);
  const preflight = preflightEngineInputForPlannerNext(input);
  const adapter = adaptEngineInputToPlannerNextProblem(input);
  return {
    caseId,
    passed: preflight.reasonCodes.includes("UNSUPPORTED_COACH_ROUTE_TRANSITION")
      && adapter.status === "UNSUPPORTED"
      && adapter.reasonCodes.includes("UNSUPPORTED_COACH_ROUTE_TRANSITION")
      && adapter.problem === null
      && adapter.problemFingerprint === null,
    preflightStatus: preflight.status,
    adapterStatus: adapter.status,
  };
}

function buildEvidence() {
  const baseline = runSpec10019Probe();
  const repeated = runSpec10019Probe();
  const inverted = runSpec10019Probe(() => {
    const input = createSpec10019CoachRouteTransitionFixture();
    input.tasks.reverse();
    input.planResourceItems.reverse();
    input.planSpaceSettings?.reverse();
    input.planZoneSettings?.reverse();
    input.coachRouteTransitions?.reverse();
    return input;
  });
  const deterministic = canonicalJson(logicalProjection(baseline)) === canonicalJson(logicalProjection(repeated));
  const orderInvariant = canonicalJson(logicalProjection(baseline)) === canonicalJson(logicalProjection(inverted));
  assert.equal(deterministic, true);
  assert.equal(orderInvariant, true);

  const absent = createSupportedEngineInputAdapterFixture();
  const explicitUndefined = structuredClone(absent);
  explicitUndefined.coachRouteTransitions = undefined;
  const empty = structuredClone(absent);
  empty.coachRouteTransitions = [];
  const historical = [absent, explicitUndefined, empty].map(adaptEngineInputToPlannerNextProblem);
  assert.ok(historical.every((result) => result.status === "SUPPORTED"));
  assert.ok(historical.every((result) =>
    result.sourceFingerprint === historical[0]!.sourceFingerprint
    && result.problemFingerprint === historical[0]!.problemFingerprint));

  const negativeTests = [
    unsupportedCase("non-array", (input) => { (input as unknown as Record<string, unknown>).coachRouteTransitions = {}; }),
    unsupportedCase("primitive-entry", (input) => { (input as unknown as Record<string, unknown>).coachRouteTransitions = [null]; }),
    unsupportedCase("duplicate", (input) => { input.coachRouteTransitions!.push(structuredClone(input.coachRouteTransitions![0]!)); }),
    unsupportedCase("missing-coach", (input) => { input.coachRouteTransitions![0]!.coachPlanResourceItemId = 999; }),
    unsupportedCase("missing-space", (input) => { input.coachRouteTransitions![0]!.fromSpaceId = 999; }),
    unsupportedCase("same-space", (input) => { input.coachRouteTransitions![0]!.fromSpaceId = 301; input.coachRouteTransitions![0]!.toSpaceId = 301; }),
    unsupportedCase("zero-minutes", (input) => { input.coachRouteTransitions![0]!.minutes = 0; }),
    unsupportedCase("off-grid-minutes", (input) => { input.coachRouteTransitions![0]!.minutes = 7; }),
  ];
  assert.ok(negativeTests.every(({ passed }) => passed));

  const payload = {
    iterationId: "SPEC10-019",
    operationalRule: "El mismo coach necesita 30 minutos desde Caracola hasta Estudio 7.",
    baseline: logicalProjection(baseline),
    deterministic,
    orderInvariant,
    inputImmutable: baseline.inputImmutable,
    historicalCompatibility: {
      absentUndefinedAndEmptyEquivalent: true,
      sourceFingerprint: historical[0]!.sourceFingerprint,
      problemFingerprint: historical[0]!.problemFingerprint,
    },
    negativeTests,
  };
  return {
    ...payload,
    artifactHashes: {
      hashScope: "canonical evidence payload excluding artifactHashes",
      evidencePayloadSha256: sha256(canonicalJson(payload)),
      coverageSha256: sha256(readFileSync(coveragePath)),
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const evidence = buildEvidence();
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({
    evidencePath,
    evidenceSha256: sha256(readFileSync(evidencePath)),
    sourceFingerprint: evidence.baseline.sourceFingerprint,
    problemFingerprint: evidence.baseline.problemFingerprint,
    planFingerprint: evidence.baseline.planFingerprint,
    complete: evidence.baseline.complete,
    hardValid: evidence.baseline.hardValid,
    scheduledGapMinutes: evidence.baseline.scheduledGapMinutes,
    rejectsTwentyNineMinutes: evidence.baseline.rejectsTwentyNineMinutes,
    acceptsThirtyMinutes: evidence.baseline.acceptsThirtyMinutes,
  }, null, 2));
}
