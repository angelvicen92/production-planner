import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { compareAuxiliaryStates, placeAuxiliaryTasks } from "./placeAuxiliaryTasks";
import { branchHistoryControlScenario, branchHistoryIsolatedPruningScenario, isolatedParticipantIds, isolatedTaskIds } from "./scenarios/branchHistoryInvarianceScenario";

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
  const originalParticipants=new Set(controlProblem.tasks.map(t=>t.participantId)), isolatedTasks=variantProblem.tasks.filter(t=>isolatedTaskIds.includes(t.id as typeof isolatedTaskIds[number]));
  assert.ok(isolatedParticipantIds.every(id=>variantProblem.participants.some(person=>person.id===id)&&!originalParticipants.has(id)));
  assert.ok(isolatedTasks.every(task=>isolatedParticipantIds.includes(task.participantId as typeof isolatedParticipantIds[number])));
  assert.ok(isolatedTasks.every(task=>!controlProblem.spaces.some(space=>space.id===task.spaceId)));
  assert.ok(isolatedTasks.flatMap(task=>task.requiredResourceIds??[]).every(id=>!controlProblem.resources.some(resource=>resource.id===id)));
  assert.ok(isolatedTasks.every(task=>task.dependencies.length===0&&!task.coachId&&!task.blockKey));
  assert.deepEqual(Object.fromEntries([...originalParticipants].map(id=>[id,variant.metrics.participantPresenceMinutesById[id]])),Object.fromEntries([...originalParticipants].map(id=>[id,control.metrics.participantPresenceMinutesById[id]])));
  assert.deepEqual(Object.fromEntries(originalIds.map(id=>[id,variant.metrics.auxiliaryCandidateCountWhenSelectedByTaskId[id]]).filter(([,value])=>value!==undefined)),Object.fromEntries(originalIds.map(id=>[id,control.metrics.auxiliaryCandidateCountWhenSelectedByTaskId[id]]).filter(([,value])=>value!==undefined)));
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

test("every hard-valid individual position is probed before Best-K retention", () => {
  const problem: PlannerNextProblem = {
    day:{start:540,end:570}, protectedMeal:{start:720,end:780}, participantTransitionMinutes:0, resourceTransitionMinutes:0,
    spaces:[{id:"space-a",availability:[{start:540,end:550},{start:550,end:560},{start:560,end:570}]},{id:"space-b",availability:[{start:540,end:570}]}],
    resources:[], coaches:[], participants:[{id:"participant-a",availability:[{start:540,end:570}]},{id:"participant-b",availability:[{start:540,end:570}]}],
    tasks:[
      {id:"task-a",kind:"auxiliary",participantId:"participant-a",duration:10,spaceId:"space-a",dependencies:[]},
      {id:"task-b",kind:"auxiliary",participantId:"participant-b",duration:5,spaceId:"space-b",dependencies:[]},
    ],
    mainFlow:{spaceId:"space-a",preferredEnd:570,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
    budget:{bestK:1,maxBacktracks:0,maxPatterns:1,maxBranchExpansions:100}, auxiliaryPolicy:{participantPresencePreference:"OFF"},
  };
  const snapshot=JSON.stringify(problem), result=placeAuxiliaryTasks(problem,[],problem.budget.maxBranchExpansions);
  assert.equal(result.futureChecks,3);
  assert.equal(result.tasks?.length,2);
  assert.equal(result.exhausted,false);
  assert.equal(result.futurePruned,0);
  assert.equal(JSON.stringify(problem),snapshot);
});
