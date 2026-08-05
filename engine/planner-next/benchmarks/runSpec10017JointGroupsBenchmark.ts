import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import type { EngineInput } from "../../types";
import type { PlannerNextProblem, ScheduledTask } from "../contracts";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { preflight as preflightPlannerNextProblem, validatePlan } from "../validate";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";
import { createSpec10017JointGroupEngineInputFixture } from "../integration/engineInputAdapter.fixture";

const baseCommit = "8dd69dde5ef83fbf460640addd70b00b10d9a66e";
const evidencePath = "docs/evidence/SPEC10-017-engine-input-joint-groups.json";
const coveragePath = "docs/coverage/SPEC10-017-ENGINE-INPUT-JOINT-GROUPS.md";
const firstGroupId = "joint-group:a2-c06-c10-alfombra-roja";
const secondGroupId = "joint-group:a2-c06-c10-totales-post";
const expectedSourceIds = ["a2-c06-c10-alfombra-roja", "a2-c06-c10-totales-post"] as const;
const expectedCanonicalIds = [firstGroupId, secondGroupId] as const;

function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function sha256Text(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function sha256File(path: string): string { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "runtimeMs")
      .sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalize(value)); }
function writeStable(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
function modifiedFiles(): string[] {
  const committed = execFileSync("git", ["diff", "--name-only", `${baseCommit}...HEAD`], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const unstaged = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  return [...new Set([...committed, ...unstaged, ...staged])].sort(compare);
}
function invertInput(input: EngineInput): EngineInput {
  return {
    ...input,
    tasks: [...input.tasks].reverse(),
    planResourceItems: [...input.planResourceItems].reverse(),
    planSpaceSettings: [...input.planSpaceSettings].reverse(),
    planZoneSettings: [...input.planZoneSettings].reverse(),
    locks: [...input.locks].reverse(),
  };
}
function activeSourceGroupIds(input: EngineInput): string[] {
  return [...new Set(input.tasks
    .filter((task) => task.status !== "cancelled" && typeof task.jointGroupId === "string" && task.jointGroupId.trim() === task.jointGroupId && task.jointGroupId !== "")
    .map((task) => task.jointGroupId!))].sort(compare);
}
function plannedByGroup(tasks: readonly ScheduledTask[]): Record<string, Array<{ taskId: string; participantId: string | undefined; duration: number; start: number; end: number; dependencies: string[] }>> {
  return Object.fromEntries(expectedCanonicalIds.map((groupId) => [groupId, tasks
    .filter((task) => task.jointGroupId === groupId)
    .sort((left, right) => compare(left.id, right.id))
    .map((task) => ({ taskId: task.id, participantId: task.participantId, duration: task.duration, start: task.start, end: task.end, dependencies: [...task.dependencies].sort(compare) }))]));
}
function adaptedByGroup(problem: PlannerNextProblem): Record<string, Array<{ taskId: string; participantId: string | undefined; duration: number; dependencies: string[] }>> {
  return Object.fromEntries(expectedCanonicalIds.map((groupId) => [groupId, problem.tasks
    .filter((task) => task.jointGroupId === groupId)
    .sort((left, right) => compare(left.id, right.id))
    .map((task) => ({ taskId: task.id, participantId: task.participantId, duration: task.duration, dependencies: [...task.dependencies].sort(compare) }))]));
}
function logicalMetrics(plan: ReturnType<typeof planMainFlowAndFeeders>) {
  const { runtimeMs: _runtimeMs, ...metrics } = plan.metrics;
  return metrics;
}
function projectionOf(run: Spec10017ProbeRun) {
  return {
    sourceFingerprint: run.sourceFingerprint,
    identityMapFingerprint: run.identityMapFingerprint,
    problemFingerprint: run.problemFingerprint,
    planFingerprint: run.planFingerprint,
    complete: run.complete,
    hardValid: run.hardValid,
    jointGroupViolationCount: run.jointGroupViolationCount,
    adaptedTasksByGroup: run.adaptedTasksByGroup,
    plannedTasksByGroup: run.plannedTasksByGroup,
    dependenciesByMember: run.dependenciesByMember,
    synchronization: run.synchronization,
    precedence: run.precedence,
    plannedTaskCount: run.plannedTaskCount,
    unplannedTaskCount: run.unplannedTaskCount,
    logicalMetrics: run.logicalMetrics,
  };
}

export interface Spec10017ProbeRun {
  readonly input: EngineInput;
  readonly inputSnapshot: EngineInput;
  readonly engineInputPreflightStatus: "SUPPORTED" | "UNSUPPORTED";
  readonly engineInputPreflightReasonCodes: readonly string[];
  readonly adapterStatus: "SUPPORTED" | "UNSUPPORTED";
  readonly adapterReasonCodes: readonly string[];
  readonly plannerNextPreflightReasonCodes: readonly string[];
  readonly sourceGroupIds: readonly string[];
  readonly canonicalGroupIds: readonly string[];
  readonly sourceGroupCount: number;
  readonly projectedGroupCount: number;
  readonly projectedMemberCount: number;
  readonly dependenciesPreserved: boolean;
  readonly adaptedTasksByGroup: Record<string, Array<{ taskId: string; participantId: string | undefined; duration: number; dependencies: string[] }>>;
  readonly plannedTasksByGroup: Record<string, Array<{ taskId: string; participantId: string | undefined; duration: number; start: number; end: number; dependencies: string[] }>>;
  readonly dependenciesByMember: Record<string, string[]>;
  readonly sourceFingerprint: string;
  readonly identityMapFingerprint: string;
  readonly problemFingerprint: string;
  readonly planFingerprint: string;
  readonly complete: boolean;
  readonly hardValid: boolean;
  readonly jointGroupViolationCount: number;
  readonly synchronization: { readonly firstGroupSynchronized: boolean; readonly secondGroupSynchronized: boolean };
  readonly precedence: { readonly sequencePreserved: boolean };
  readonly plannedTaskCount: number;
  readonly unplannedTaskCount: number;
  readonly logicalMetrics: Record<string, unknown>;
  readonly inputImmutable: boolean;
}

export function runSpec10017Probe(inputFactory = createSpec10017JointGroupEngineInputFixture): Spec10017ProbeRun {
  const input = inputFactory();
  const inputSnapshot = structuredClone(input);
  const sourceGroupIds = activeSourceGroupIds(input);
  const engineInputPreflight = preflightEngineInputForPlannerNext(input);
  assert.equal(engineInputPreflight.status, "SUPPORTED", engineInputPreflight.reasonCodes.join(","));
  const adapter = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapter.status, "SUPPORTED", adapter.status === "UNSUPPORTED" ? adapter.reasonCodes.join(",") : "");
  assert.ok(adapter.problem, "adapter.problem must exist");
  const plannerNextPreflightReasonCodes = preflightPlannerNextProblem(adapter.problem);
  assert.deepEqual(plannerNextPreflightReasonCodes, []);
  const plan = planMainFlowAndFeeders(adapter.problem);
  const hard = validatePlan(adapter.problem, plan.scheduledTasks, plan.scheduledSetupPreparations, plan.scheduledSpaceMeals, plan.scheduledParticipantMeals, plan.scheduledResourceMeals, plan.scheduledItinerantUnitMeals);
  const adaptedTasks = adaptedByGroup(adapter.problem);
  const plannedTasks = plannedByGroup(plan.scheduledTasks);
  const first = plannedTasks[firstGroupId] ?? [];
  const second = plannedTasks[secondGroupId] ?? [];
  const firstEnd = Math.max(...first.map((task) => task.end));
  const secondStart = Math.min(...second.map((task) => task.start));
  const dependenciesByMember = Object.fromEntries(Object.values(adaptedTasks).flat().map((task) => [task.taskId, task.dependencies]));
  const dependenciesPreserved = canonicalJson(dependenciesByMember) === canonicalJson({ "task:201": [], "task:202": [], "task:203": ["task:201"], "task:204": ["task:202"] });
  const projectedGroupIds = [...new Set(adapter.problem.tasks.flatMap((task) => task.jointGroupId ? [task.jointGroupId] : []))].sort(compare);
  const result: Spec10017ProbeRun = {
    input,
    inputSnapshot,
    engineInputPreflightStatus: engineInputPreflight.status,
    engineInputPreflightReasonCodes: [...engineInputPreflight.reasonCodes],
    adapterStatus: adapter.status,
    adapterReasonCodes: [...adapter.reasonCodes],
    plannerNextPreflightReasonCodes,
    sourceGroupIds,
    canonicalGroupIds: projectedGroupIds,
    sourceGroupCount: sourceGroupIds.length,
    projectedGroupCount: projectedGroupIds.length,
    projectedMemberCount: adapter.problem.tasks.filter((task) => task.jointGroupId !== undefined).length,
    dependenciesPreserved,
    adaptedTasksByGroup: adaptedTasks,
    plannedTasksByGroup: plannedTasks,
    dependenciesByMember,
    sourceFingerprint: adapter.sourceFingerprint,
    identityMapFingerprint: adapter.identityMapFingerprint,
    problemFingerprint: adapter.problemFingerprint,
    planFingerprint: plan.metrics.planFingerprint,
    complete: plan.complete,
    hardValid: hard.hardValid,
    jointGroupViolationCount: hard.jointGroupViolationCount,
    synchronization: {
      firstGroupSynchronized: first.length === 2 && new Set(first.map((task) => `${task.start}:${task.end}:${task.duration}`)).size === 1,
      secondGroupSynchronized: second.length === 2 && new Set(second.map((task) => `${task.start}:${task.end}:${task.duration}`)).size === 1,
    },
    precedence: { sequencePreserved: first.length === 2 && second.length === 2 && secondStart >= firstEnd },
    plannedTaskCount: plan.metrics.plannedTaskCount,
    unplannedTaskCount: plan.metrics.unplannedTaskCount,
    logicalMetrics: logicalMetrics(plan),
    inputImmutable: canonicalJson(input) === canonicalJson(inputSnapshot),
  };
  assert.deepEqual(result.sourceGroupIds, [...expectedSourceIds]);
  assert.deepEqual(result.canonicalGroupIds, [...expectedCanonicalIds]);
  assert.equal(result.projectedMemberCount, 4);
  assert.equal(result.dependenciesPreserved, true);
  assert.equal(result.synchronization.firstGroupSynchronized, true);
  assert.equal(result.synchronization.secondGroupSynchronized, true);
  assert.equal(result.precedence.sequencePreserved, true);
  assert.equal(result.complete, true);
  assert.equal(result.hardValid, true);
  assert.equal(result.jointGroupViolationCount, 0);
  assert.equal(result.inputImmutable, true);
  return result;
}

function runNegativeTests(): Array<{ caseId: string; passed: boolean; reasonCodes: readonly string[] }> {
  const cases: Array<{ caseId: string; mutate: (input: EngineInput) => void; expected: string }> = [
    { caseId: "blank-string", mutate: (input) => { input.tasks.find((task) => task.id === 201)!.jointGroupId = " "; }, expected: "UNSUPPORTED_JOINT_GROUP_MAPPING" },
    { caseId: "runtime-number", mutate: (input) => { (input.tasks.find((task) => task.id === 201) as unknown as Record<string, unknown>).jointGroupId = 7; }, expected: "UNSUPPORTED_JOINT_GROUP_MAPPING" },
    { caseId: "technical-task", mutate: (input) => { input.tasks.find((task) => task.id === 206)!.jointGroupId = "invalid"; }, expected: "UNSUPPORTED_JOINT_GROUP_MAPPING" },
    { caseId: "internal-dependency", mutate: (input) => { input.tasks.find((task) => task.id === 203)!.dependsOnTaskIds = [204]; }, expected: "ADAPTED_PROBLEM_NOT_REPRESENTABLE" },
  ];
  return cases.map(({ caseId, mutate, expected }) => {
    const input = createSpec10017JointGroupEngineInputFixture();
    mutate(input);
    const adapter = adaptEngineInputToPlannerNextProblem(input);
    const reasonCodes = adapter.status === "UNSUPPORTED" ? adapter.reasonCodes : preflightPlannerNextProblem(adapter.problem);
    return { caseId, passed: reasonCodes.includes(expected), reasonCodes };
  });
}

function buildEvidence() {
  const baseline = runSpec10017Probe();
  const repeated = runSpec10017Probe();
  const inverted = runSpec10017Probe(() => invertInput(createSpec10017JointGroupEngineInputFixture()));
  const deterministic = canonicalJson(projectionOf(baseline)) === canonicalJson(projectionOf(repeated));
  const orderInvariant = canonicalJson(projectionOf(baseline)) === canonicalJson(projectionOf(inverted));
  assert.equal(deterministic, true);
  assert.equal(orderInvariant, true);
  const negativeTests = runNegativeTests();
  assert.ok(negativeTests.every((entry) => entry.passed));
  const payloadWithoutHashes = {
    iterationId: "SPEC10-017",
    commitBase: baseCommit,
    contractAdded: "TaskInput.jointGroupId?: string | null",
    identityNamespace: "joint-group",
    sourceIds: baseline.sourceGroupIds,
    canonicalIds: baseline.canonicalGroupIds,
    sourceFingerprint: baseline.sourceFingerprint,
    identityMapFingerprint: baseline.identityMapFingerprint,
    problemFingerprint: baseline.problemFingerprint,
    planFingerprint: baseline.planFingerprint,
    adaptedTasksByGroup: baseline.adaptedTasksByGroup,
    plannedTasksByGroup: baseline.plannedTasksByGroup,
    dependenciesByMember: baseline.dependenciesByMember,
    engineInputPreflight: { status: baseline.engineInputPreflightStatus, reasonCodes: baseline.engineInputPreflightReasonCodes },
    adapter: { status: baseline.adapterStatus, reasonCodes: baseline.adapterReasonCodes },
    plannerNextPreflight: { supported: baseline.plannerNextPreflightReasonCodes.length === 0, reasonCodes: baseline.plannerNextPreflightReasonCodes },
    complete: baseline.complete,
    hardValid: baseline.hardValid,
    jointGroupViolationCount: baseline.jointGroupViolationCount,
    firstGroupSynchronized: baseline.synchronization.firstGroupSynchronized,
    secondGroupSynchronized: baseline.synchronization.secondGroupSynchronized,
    sequencePreserved: baseline.precedence.sequencePreserved,
    plannedTaskCount: baseline.plannedTaskCount,
    unplannedTaskCount: baseline.unplannedTaskCount,
    deterministic,
    orderInvariant,
    inputImmutable: baseline.inputImmutable,
    repeatedProjectionMatches: deterministic,
    invertedProjectionMatches: orderInvariant,
    negativeTests,
    modifiedFiles: modifiedFiles(),
  };
  return {
    ...payloadWithoutHashes,
    artifactHashes: {
      hashScope: "canonical evidence payload excluding artifactHashes",
      evidencePayloadSha256: sha256Text(canonicalJson(payloadWithoutHashes)),
      coverageSha256: sha256File(coveragePath),
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const evidence = buildEvidence();
  writeStable(evidencePath, evidence);
  const finalEvidenceSha256 = sha256File(evidencePath);
  console.log(JSON.stringify({
    complete: evidence.complete,
    hardValid: evidence.hardValid,
    jointGroupViolationCount: evidence.jointGroupViolationCount,
    firstGroupSynchronized: evidence.firstGroupSynchronized,
    secondGroupSynchronized: evidence.secondGroupSynchronized,
    sequencePreserved: evidence.sequencePreserved,
    deterministic: evidence.deterministic,
    orderInvariant: evidence.orderInvariant,
    sourceFingerprint: evidence.sourceFingerprint,
    problemFingerprint: evidence.problemFingerprint,
    planFingerprint: evidence.planFingerprint,
    evidencePayloadSha256: evidence.artifactHashes.evidencePayloadSha256,
    coverageSha256: evidence.artifactHashes.coverageSha256,
    finalEvidenceSha256,
  }, null, 2));
}
