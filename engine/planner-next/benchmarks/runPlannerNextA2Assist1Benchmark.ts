import assert from "node:assert/strict";
import { executeAssistedPlanning } from "../assistedPlanning";
import { buildCanonicalA2AssistedStage1Fixture } from "./canonicalA2AssistedStage1Fixture";

export function runA2Assist1Benchmark(branchBudget=100_000) {
  const fixture=buildCanonicalA2AssistedStage1Fixture(branchBudget);
  assert.equal(fixture.input.tasks.filter(task=>task.contestantId!=null).length,266);
  const result=executeAssistedPlanning(fixture.assisted);
  return {benchmarkId:"A2-ASSIST-1",sourceHumanTimesUsed:false,participantTransitionMinutes:fixture.adapter.problem.participantTransitionMinutes,
    resolvedProductTaskIds:fixture.resolution.productTaskIds,automaticTaskIds:fixture.assisted.automaticTaskIds,
    supportingTaskIds:fixture.assisted.supportingTaskIds,proposalTaskIds:result.proposal?.map(task=>task.id)??[],...result.evidence};
}

if(process.argv[1]?.endsWith("runPlannerNextA2Assist1Benchmark.ts"))console.log(JSON.stringify(runA2Assist1Benchmark(),null,2));
