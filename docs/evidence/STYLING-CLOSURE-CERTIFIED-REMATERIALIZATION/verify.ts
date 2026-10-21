import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FutureJointCompletionWitnessV1 } from "../../../engine/planner-next/anonymousPipelineWitness";
import { buildCanonicalA2AssistedStage1Fixture } from "../../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { createExactSearchLedger } from "../../../engine/planner-next/exactMainAndFeederCore";
import { PreparedFutureCollectiveParticipantClosure } from "../../../engine/planner-next/futureCollectiveParticipantClosure";
import { jointCompletionCanonicalJson, revalidateJointCompletionWitness } from "../../../engine/planner-next/jointCompletionWitness";
import { participantGapMinutes } from "../../../engine/planner-next/participantTransition";
import { collectA2TopologyMetrics } from "../../../script/demo/a2TopologyMetrics";
import { materializeAssistedSnapshotOccupations, validateManualAssistedDelta } from "../../../server/assistedProposalService";
import type { AssistedPlanningSnapshotV1 } from "../../../server/assistedPlanningSnapshot";

const baselineDirectory = resolve(process.argv[2]!);
const candidateDirectory = resolve(process.argv[3]!);
const repeatDirectory = resolve(process.argv[4]!);
const output = resolve(process.argv[5] ?? candidateDirectory);
mkdirSync(output, { recursive: true });
const read = (directory: string, name: string) => JSON.parse(readFileSync(resolve(directory, name), "utf8"));
const before = read(baselineDirectory, "run.json"), after = read(candidateDirectory, "run.json"), repeat = read(repeatDirectory, "run.json");
const snapshotsBefore: AssistedPlanningSnapshotV1[] = read(baselineDirectory, "snapshots.json");
const snapshotsAfter: AssistedPlanningSnapshotV1[] = read(candidateDirectory, "snapshots.json");
const fixture = buildCanonicalA2AssistedStage1Fixture(), { input, adapter } = fixture;
const source = adapter.problem;
const joint = (stage: any): FutureJointCompletionWitnessV1 => stage.futureStructuralWitnesses.find((item: any) => item.kind === "JOINT_COMPLETION");
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const material = (run: any) => ({ ...run, iterations: run.iterations.map(({ durationMs: _time, ...stage }: any) => stage) });
assert.deepEqual(material(after), material(repeat), "entire repeated run must match except Stage duration");
assert.deepEqual(snapshotsAfter, read(repeatDirectory, "snapshots.json"));
assert.deepEqual(read(baselineDirectory, "runtime.json"), read(candidateDirectory, "runtime.json"));
assert.deepEqual(read(candidateDirectory, "runtime.json"), read(repeatDirectory, "runtime.json"));
assert.deepEqual(material(before).iterations.slice(0, 10), material(after).iterations.slice(0, 10));
assert.deepEqual(snapshotsBefore.slice(0, 10), snapshotsAfter.slice(0, 10));
function audit(run: any, snapshots: AssistedPlanningSnapshotV1[]) {
  assert.equal(run.status, "PASS"); assert.equal(run.completedObligationCount, 266); assert.equal(run.stageCount, 11);
  assert.equal(run.finalHardViolationCount, 0); assert.equal(run.finalRequiredViolationCount, 0);
  assert.equal(run.dailyTasksMatchesLastAcceptedStage, true);
  assert.equal(run.duplicateFinalIds, 0); assert.equal(run.finalObligationIdsMatchSource, true);
  return run.iterations.map((stage: any, index: number) => {
    const w = joint(stage), fixed = index ? materializeAssistedSnapshotOccupations(source, adapter.identityMap, snapshots[index - 1]!) : null;
    const ledger = createExactSearchLedger(source.budget.maxBranchExpansions);
    const consume = () => ledger.consume("STANDALONE");
    const replay = revalidateJointCompletionWitness(source, w, fixed?.protectedPlacements ?? [], consume);
    assert.equal(replay, "PASS");
    const closure = new PreparedFutureCollectiveParticipantClosure(source).evaluate(w.tasks, w.participantMeals, consume, "CERTIFY", w.spaceMeals);
    assert.equal(closure.certified, true);
    assert.equal(w.tasks.length + w.participantMeals.length, 266);
    assert.equal(stage.hardRequiredValidation.hardValid, true); assert.equal(stage.hardRequiredValidation.requiredValid, true);
    assert.equal(stage.protectedEqualityProof.equal, true); assert.equal(stage.participantMealPreservationProof.equal, true);
    assert.deepEqual(stage.acceptedSupportingPlacements, []);
    assert.ok(stage.branchesExplored <= source.budget.maxBranchExpansions);
    assert.equal(stage.branchesExplored, stage.work.coreBranches + stage.work.standaloneBranches);
    const priorRows = index ? snapshots[index - 1]!.tasks.filter(row => row.startPlanned) : [];
    for (const row of priorRows) assert.deepEqual(snapshots[index]!.tasks.find(item => item.taskId === row.taskId), row);
    return { ordinal: stage.ordinal, selector: stage.scopeSelector, resolvedTaskIds: stage.resolvedTaskIds,
      orchestration: stage.orchestration, visibleTaskCount: stage.visibleScopeCount, supportingTaskCount: stage.supportingTaskCount,
      acceptedSupportingPlacements: stage.acceptedSupportingPlacements, protected: stage.protectedEqualityProof,
      validation: stage.hardRequiredValidation, completed: stage.completedObligationCount, branches: stage.branchesExplored,
      coreBranches: stage.work.coreBranches, standaloneBranches: stage.work.standaloneBranches, durationMs: stage.durationMs,
      jointFingerprint: w.fingerprint, stageFingerprint: stage.acceptedStageFingerprint,
      earlyClosureMaterialization: stage.standaloneDiagnostic?.earlyClosureMaterialization ?? null,
      independentAudit: { replay, closureCertified: closure.certified, closureFingerprint: closure.witnessFingerprint,
        branches: ledger.branchesExplored, accounting: "OFFLINE_AUDIT_SEPARATE_FROM_PRODUCT_LEDGER" } };
  });
}
const stagesBefore = audit(before, snapshotsBefore), stagesAfter = audit(after, snapshotsAfter);
assert.deepEqual(before.iterations.map((stage: any) => stage.resolvedTaskIds), after.iterations.map((stage: any) => stage.resolvedTaskIds));
const original = joint(before.iterations.at(-1)), selected = joint(after.iterations.at(-1));
const closureIds = new Set(new PreparedFutureCollectiveParticipantClosure(source).closureTaskIds());
const departureIds = new Set(source.transportPolicy!.departure.taskIds);
const changedIds = new Set([...closureIds, ...departureIds]);
const changes = selected.tasks.flatMap(task => {
  const old = original.tasks.find(item => item.id === task.id)!;
  if (jointCompletionCanonicalJson(task) === jointCompletionCanonicalJson(old)) return [];
  assert.ok(changedIds.has(task.id), "only terminal closure placements may change");
  assert.ok(task.start < old.start);
  assert.deepEqual({ ...task, start: old.start, end: old.end }, old);
  return [{ taskId: task.id, participantId: task.participantId, before: old.start, after: task.start, advanceMinutes: old.start - task.start }];
});
assert.ok(changes.some(row => departureIds.has(row.taskId)));
for (const key of ["preparations", "roundPreparations", "participantMeals", "operationalMeals", "spaceMeals"] as const)
  assert.deepEqual(selected[key], original[key]);
const manual = validateManualAssistedDelta(input, snapshotsAfter.at(-1)!, input.tasks.map(task => task.id));
assert.equal(manual.hardValid, true); assert.deepEqual(manual.validationSummary.violations, []);
const metrics = (w: FutureJointCompletionWitnessV1) => source.participants.map((person, index) => {
  const tasks = w.tasks.filter(task => task.participantId === person.id).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
  const close = tasks.find(task => closureIds.has(task.id))!;
  const out = tasks.find(task => departureIds.has(task.id))!;
  const previous = tasks.filter(task => !changedIds.has(task.id)).at(-1)!;
  const lastDutyEnd = Math.max(previous.end, ...w.participantMeals.filter(meal=>meal.participantId===person.id).map(meal=>meal.end));
  const gap = close.start - previous.end, required = participantGapMinutes(source, previous, close);
  return { participant: `C${String(index + 1).padStart(2,"0")}`, participantId: person.id, in: tasks[0]!.start,
    stylingExit: close.start, out: out.start, end: out.end, presence: out.end-tasks[0]!.start,
    preStylingGrossWait: close.start-lastDutyEnd, postStylingGrossWait: out.start-close.end,
    terminalGrossWait: close.start-lastDutyEnd+out.start-close.end, predecessor: previous.id,
    predecessorEnd: previous.end, observedGap: gap, requiredGap: required, localSlack: gap-required };
});
const rowsBefore = metrics(original), rowsAfter = metrics(selected);
const distribution = (values: number[]) => {
  const sorted = [...values].sort((a,b)=>a-b), n=sorted.length;
  return { total:sorted.reduce((sum,value)=>sum+value,0),mean:sorted.reduce((sum,value)=>sum+value,0)/n,
    median:n%2?sorted[Math.floor(n/2)]!:(sorted[n/2-1]!+sorted[n/2]!)/2,
    p90:sorted[Math.ceil(n*.9)-1]!,min:sorted[0]!,max:sorted.at(-1)!,zeroCount:sorted.filter(value=>value===0).length };
};
for (let i=0;i<rowsBefore.length;i++) assert.ok(rowsAfter[i]!.presence <= rowsBefore[i]!.presence);
const sum = (rows: ReturnType<typeof metrics>, key: "presence"|"terminalGrossWait") => rows.reduce((total,row)=>total+row[key],0);
const topology = (snapshot: AssistedPlanningSnapshotV1) => collectA2TopologyMetrics(input.tasks, snapshot.tasks, input.contestantAvailabilityById ?? {});
const topologyBefore = topology(snapshotsBefore.at(-1)!), topologyAfter = topology(snapshotsAfter.at(-1)!);
assert.equal(topologyBefore.participantPresenceTotalMinutes, sum(rowsBefore,"presence"));
assert.equal(topologyAfter.participantPresenceTotalMinutes, sum(rowsAfter,"presence"));
assert.equal(topologyAfter.styling.productiveMinutes, topologyBefore.styling.productiveMinutes);
const total = (run: any) => ({ branches: run.iterations.reduce((sum: number, stage: any) => sum + stage.branchesExplored, 0),
  durationMs: run.iterations.reduce((sum: number, stage: any) => sum + stage.durationMs, 0),
  stageCount: run.stageCount, completed: run.completedObligationCount, hard: run.finalHardViolationCount,
  required: run.finalRequiredViolationCount, fingerprint: run.deterministicFingerprint });
const historicDirectory = resolve("docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC");
const historic = read(historicDirectory,"baseline-witness.json") as FutureJointCompletionWitnessV1;
const counterfactual = read(historicDirectory,"closure-earlier-witness.json") as FutureJointCompletionWitnessV1;
const historicStages = read(historicDirectory,"stage-evidence.json");
const historicVerification = read(historicDirectory,"verification.json");
const report = { status:"PASS", base:"78fc59b2e980ec3d86a27eaef95e5c77d3035f93", authority:"OFFLINE_PRODUCT_SERVICES_WITH_IN_MEMORY_PERSISTENCE",
  runtime:read(candidateDirectory,"runtime.json"), branchBudgetPerStage:source.budget.maxBranchExpansions,
  fixtureHashes:{ input:sha(JSON.stringify(input)), problem:sha(JSON.stringify(source)) },
  runtimeHashes:Object.fromEntries(["engine/planner-next/earlyClosureMaterialization.ts","engine/planner-next/exactItinerantPlan.ts",
    "engine/planner-next/assistedPlanning.ts","engine/planner-next/executePlannerNext.ts","engine/planner-next/futureCollectiveParticipantClosure.ts",
    "engine/planner-next/transportGrouping.ts","package.json","package-lock.json"].map(path=>[path,sha(readFileSync(path))])),
  baseline:total(before),candidate:total(after),repeat:total(repeat),
  preserved:{ stagesS1ToS10Literal:true, scopeSequence:true, protectedHistory:true, allNonClosureTasksLiteral:true,
    mealsAndPreparationsLiteral:true, acceptedEntryAndINLiteral:true, finalManualValidation:manual.hardValid },
  determinism:{ entireRunEqualExceptStageDuration:true,acceptedSnapshotsEqual:true,sha256:sha(JSON.stringify(material(after))) },
  changes,stagesBefore,stagesAfter,
  quality:{ before:{ presence:sum(rowsBefore,"presence"),terminalGrossWait:sum(rowsBefore,"terminalGrossWait"),individual:rowsBefore,presenceDistribution:distribution(rowsBefore.map(row=>row.presence)),terminalWaitDistribution:distribution(rowsBefore.map(row=>row.terminalGrossWait)),slackDistribution:distribution(rowsBefore.map(row=>row.localSlack)),topology:topologyBefore },
    after:{ presence:sum(rowsAfter,"presence"),terminalGrossWait:sum(rowsAfter,"terminalGrossWait"),individual:rowsAfter,presenceDistribution:distribution(rowsAfter.map(row=>row.presence)),terminalWaitDistribution:distribution(rowsAfter.map(row=>row.terminalGrossWait)),slackDistribution:distribution(rowsAfter.map(row=>row.localSlack)),topology:topologyAfter },
    robustnessThreshold:null, limitations:"Local predecessor slack is measured; no new HARD threshold or complete P10/Pareto claim. Gross terminal wait includes effective margins." },
  pr1164:{ baseline:{ fingerprint:historicVerification.neutralCapture.fingerprints[0],witnessFingerprint:historic.fingerprint,individual:metrics(historic),presence:sum(metrics(historic),"presence") },
    counterfactual:{ fingerprint:counterfactual.fingerprint,individual:metrics(counterfactual),presence:sum(metrics(counterfactual),"presence") },
    historicalRuntime:historicVerification.runtime,
    historicalTotalDurationMs: [historicVerification.neutralCapture.withCaptureDurationsMs,historicVerification.neutralCapture.withoutCaptureDurationsMs].map((times:number[])=>times.reduce((sum,time)=>sum+time,0)),
    historicalBranches:historicStages.reduce((sum:number,stage:any)=>sum+stage.work.branchesExplored,0),
    historicalStageFingerprints:historicStages.map((stage:any)=>({stage:stage.stage,fingerprint:stage.fingerprint,work:stage.work})),
    limits:"Historical timing is a different runtime; #1164 counterfactual was offline, outside the original search ledger." },
  rawHashes:Object.fromEntries([["before",baselineDirectory],["after",candidateDirectory],["repeat",repeatDirectory]].map(([name,directory])=>
    [name,{run:sha(readFileSync(resolve(directory!,"run.json"))),snapshots:sha(readFileSync(resolve(directory!,"snapshots.json")))}])) };
writeFileSync(resolve(output,"report.json"),JSON.stringify(report,null,2));
writeFileSync(resolve(output,"candidate-witness.json"),JSON.stringify(selected,null,2));
writeFileSync(resolve(output,"participants.csv"),"participant,in,styling_before,styling_after,out_before,out_after,presence_before,presence_after,terminal_wait_before,terminal_wait_after,slack_before,slack_after\n"+
  rowsBefore.map((row,i)=>[row.participant,row.in,row.stylingExit,rowsAfter[i]!.stylingExit,row.out,rowsAfter[i]!.out,row.presence,rowsAfter[i]!.presence,
    row.terminalGrossWait,rowsAfter[i]!.terminalGrossWait,row.localSlack,rowsAfter[i]!.localSlack].join(",")).join("\n")+"\n");
console.log(JSON.stringify({status:"PASS",before:report.baseline,after:report.candidate,presence:[report.quality.before.presence,report.quality.after.presence]}));
