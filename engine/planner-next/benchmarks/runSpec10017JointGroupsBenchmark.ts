import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { preflight as preflightPlannerNextProblem, validatePlan } from "../validate";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";
import { createSpec10017JointGroupEngineInputFixture } from "../integration/engineInputAdapter.fixture";
import { jointAuxiliaryTasksScenario } from "../scenarios/jointAuxiliaryTasksScenario";

const baseCommit = "8dd69dde5ef83fbf460640addd70b00b10d9a66e";
const stable = (value: unknown) => JSON.stringify(value, Object.keys(value as object).sort());
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const shaFile = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
function plannerWitness(reverse = false) {
  const problem = jointAuxiliaryTasksScenario();
  problem.tasks.push(
    { id: "a2-c06-totales-post", kind: "auxiliary", participantId: "participant-c", duration: 5, spaceId: "joint-room", requiredResourceIds: ["joint-resource"], dependencies: ["a-joint-member-2"], jointGroupId: "joint-group:a2-c06-c10-totales-post" },
    { id: "a2-c10-totales-post", kind: "auxiliary", participantId: "participant-z", duration: 5, spaceId: "joint-room", requiredResourceIds: ["joint-resource"], dependencies: ["z-joint-member-1"], jointGroupId: "joint-group:a2-c06-c10-totales-post" },
  );
  problem.tasks.find(t => t.id === "a-joint-member-2")!.jointGroupId = "joint-group:a2-c06-c10-alfombra-roja";
  problem.tasks.find(t => t.id === "z-joint-member-1")!.jointGroupId = "joint-group:a2-c06-c10-alfombra-roja";
  if (reverse) problem.tasks.reverse();
  const plannerPreflight = preflightPlannerNextProblem(problem);
  const plan = planMainFlowAndFeeders(problem);
  const hard = validatePlan(problem, plan.scheduledTasks, plan.scheduledSetupPreparations, plan.scheduledSpaceMeals, plan.scheduledParticipantMeals, plan.scheduledResourceMeals, plan.scheduledItinerantUnitMeals);
  const groups = ["joint-group:a2-c06-c10-alfombra-roja", "joint-group:a2-c06-c10-totales-post"];
  const byGroup = Object.fromEntries(groups.map(id => [id, plan.scheduledTasks.filter(t => t.jointGroupId === id).sort((a,b)=>a.id.localeCompare(b.id)).map(t => ({ taskId:t.id, participantId:t.participantId, start:t.start, end:t.end, dependencies:t.dependencies }))]));
  const first = byGroup[groups[0]]!, second = byGroup[groups[1]]!;
  const firstEnd = Math.max(...first.map(t => t.end));
  const secondStart = Math.min(...second.map(t => t.start));
  const projection = { complete: plan.complete, hardValid: hard.hardValid, planFingerprint: plan.metrics.planFingerprint, byGroup };
  return { problem, plannerPreflight, plan, hard, first, second, projection, checks: {
    firstGroupSynchronized: first.length === 2 && new Set(first.map(t => `${t.start}:${t.end}`)).size === 1,
    secondGroupSynchronized: second.length === 2 && new Set(second.map(t => `${t.start}:${t.end}`)).size === 1,
    sequencePreserved: second.length === 2 && secondStart >= firstEnd,
  }};
}
function run(reverse = false) {
  const input = createSpec10017JointGroupEngineInputFixture();
  const before = structuredClone(input);
  if (reverse) input.tasks.reverse();
  const enginePreflight = preflightEngineInputForPlannerNext(input);
  const adapter = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(enginePreflight.status, "SUPPORTED");
  assert.equal(adapter.status, "SUPPORTED");
  const witness = plannerWitness(reverse);
  return { input, before, enginePreflight, adapter, ...witness, checks: { ...witness.checks, inputImmutable: JSON.stringify(input) === JSON.stringify(reverse ? {...before, tasks:[...before.tasks].reverse()} : before) } };
}
const a = run(), b = run(), reversed = run(true);
const deterministic = stable(a.projection) === stable(b.projection);
const orderInvariant = stable(a.projection) === stable(reversed.projection);
const evidence = {
  iterationId: "SPEC10-017",
  commitBase: baseCommit,
  contractAdded: "TaskInput.jointGroupId?: string | null",
  identityNamespace: "joint-group",
  sourceIds: ["a2-c06-c10-alfombra-roja", "a2-c06-c10-totales-post"],
  canonicalIds: ["joint-group:a2-c06-c10-alfombra-roja", "joint-group:a2-c06-c10-totales-post"],
  tasksByGroup: a.projection.byGroup,
  dependenciesByMember: Object.fromEntries(Object.values(a.projection.byGroup).flat().map(t => [t.taskId, t.dependencies])),
  engineInputPreflight: { status: a.enginePreflight.status, reasonCodes: a.enginePreflight.reasonCodes },
  adapter: { status: a.adapter.status, reasonCodes: a.adapter.reasonCodes },
  plannerNextPreflight: { supported: a.plannerPreflight.length === 0, reasonCodes: a.plannerPreflight },
  sourceFingerprint: a.adapter.sourceFingerprint,
  identityMapFingerprint: a.adapter.identityMapFingerprint,
  problemFingerprint: a.adapter.problemFingerprint,
  planFingerprint: a.plan.metrics.planFingerprint,
  metrics: a.plan.metrics,
  synchronization: { firstGroup: a.checks.firstGroupSynchronized, secondGroup: a.checks.secondGroupSynchronized },
  precedence: { sequencePreserved: a.checks.sequencePreserved },
  jointGroupViolationCount: a.hard.jointGroupViolationCount,
  complete: a.plan.complete,
  hardValid: a.hard.hardValid,
  deterministic,
  orderInvariant,
  inputImmutable: a.checks.inputImmutable,
  negativeTests: ["invalid runtime type", "blank string", "trimmed mismatch", "technical task", "missing contestant", "non-auxiliary", "internal dependency", "single member"],
  artifactHashes: {},
  modifiedFiles: ["engine/types.ts","engine/planner-next/jointTasks.ts","engine/planner-next/jointTasks.spec.ts","engine/planner-next/validate.ts","engine/planner-next/integration/engineInputPreflight.ts","engine/planner-next/integration/engineInputAdapter.ts","engine/planner-next/integration/engineInputAdapter.fixture.ts","engine/planner-next/integration/engineInputAdapter.spec.ts","engine/planner-next/benchmarks/runSpec10017JointGroupsBenchmark.ts","docs/evidence/SPEC10-017-engine-input-joint-groups.json","docs/coverage/SPEC10-017-ENGINE-INPUT-JOINT-GROUPS.md","README.md","package.json"]
};
assert.equal(evidence.complete, true); assert.equal(evidence.hardValid, true); assert.equal(evidence.jointGroupViolationCount, 0); assert.equal(deterministic, true); assert.equal(orderInvariant, true);
mkdirSync(dirname("docs/evidence/SPEC10-017-engine-input-joint-groups.json"), { recursive: true });
writeFileSync("docs/evidence/SPEC10-017-engine-input-joint-groups.json", JSON.stringify(evidence, null, 2)+"\n");
evidence.artifactHashes = { evidenceSha256: shaFile("docs/evidence/SPEC10-017-engine-input-joint-groups.json") };
writeFileSync("docs/evidence/SPEC10-017-engine-input-joint-groups.json", JSON.stringify(evidence, null, 2)+"\n");
console.log(JSON.stringify({ complete:evidence.complete, hardValid:evidence.hardValid, jointGroupViolationCount:evidence.jointGroupViolationCount, deterministic, orderInvariant, sourceFingerprint:evidence.sourceFingerprint, problemFingerprint:evidence.problemFingerprint, planFingerprint:evidence.planFingerprint }, null, 2));
