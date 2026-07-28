import assert from "node:assert/strict";
import test from "node:test";
import type { ScheduledTask } from "./contracts";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { compareAuxiliaryStates } from "./placeAuxiliaryTasks";
import { branchHistoryControlScenario, branchHistoryIsolatedPruningScenario, isolatedTaskIds } from "./scenarios/branchHistoryInvarianceScenario";

const projection = (tasks: ScheduledTask[], ids: string[]) => tasks.filter(t => ids.includes(t.id)).map(({id,start,end,spaceId})=>({taskId:id,start,end,spaceId})).sort((a,b)=>a.taskId.localeCompare(b.taskId));

test("auxiliary state ranking is pure and branch-history independent", () => {
  const task = (id:string): ScheduledTask => ({id,kind:"auxiliary",participantId:"p",duration:5,spaceId:"s",dependencies:[],start:0,end:5});
  const a={cost:1,placed:[task("a")]}, b={cost:1,placed:[task("b")]};
  const snapshots=JSON.stringify([a,b]); let external={futurePruned:0};
  const first=compareAuxiliaryStates(a,b); external.futurePruned += 100;
  assert.equal(compareAuxiliaryStates(a,b),first); assert.ok(first<0);
  assert.deepEqual([b,a].sort(compareAuxiliaryStates),[a,b]);
  assert.equal(JSON.stringify([a,b]),snapshots); assert.equal(external.futurePruned,100);
});

test("isolated pruning cannot alter the original region", () => {
  const controlProblem=branchHistoryControlScenario(), originalIds=controlProblem.tasks.map(t=>t.id), control=planMainFlowAndFeeders(controlProblem);
  const variantProblem=branchHistoryIsolatedPruningScenario(), snapshot=JSON.stringify(variantProblem), variant=planMainFlowAndFeeders(variantProblem);
  assert.equal(control.metrics.planFingerprint,"47fbb0653150918250be0b3b423b4a57c7ff20af48ad2943570e672b9d11b4f8");
  assert.equal(control.scheduledTasks.length,20); assert.equal(variant.complete,true); assert.equal(variant.metrics.hardValid,true); assert.equal(variant.scheduledTasks.length,22);
  assert.deepEqual(projection(variant.scheduledTasks,originalIds),projection(control.scheduledTasks,originalIds));
  const originalWork=(xs:string[])=>xs.filter(key=>originalIds.some(id=>key===`task:${id}`));
  assert.deepEqual(originalWork(variant.metrics.auxiliaryWorkItemSelectionOrder),originalWork(control.metrics.auxiliaryWorkItemSelectionOrder));
  assert.ok(variant.metrics.futureInfeasibleCandidatesPruned>=1); assert.ok(variant.metrics.futureTopRankedCandidatesPruned>=1);
  assert.ok(Object.keys(variant.metrics.futureBlockerCountByWorkItemKey).every(key=>isolatedTaskIds.some(id=>key===`task:${id}`)));
  assert.ok(isolatedTaskIds.every(id=>variant.scheduledTasks.some(t=>t.id===id))); assert.deepEqual(variant.metrics.reasonCodes,[]);
  assert.equal(JSON.stringify(variantProblem),snapshot);
  const again=planMainFlowAndFeeders(branchHistoryIsolatedPruningScenario()); assert.equal(again.metrics.planFingerprint,variant.metrics.planFingerprint);
  const reversed=branchHistoryIsolatedPruningScenario(); reversed.tasks.reverse(); reversed.spaces.reverse(); reversed.resources.reverse(); reversed.participants.reverse();
  assert.equal(planMainFlowAndFeeders(reversed).metrics.planFingerprint,variant.metrics.planFingerprint);
});
