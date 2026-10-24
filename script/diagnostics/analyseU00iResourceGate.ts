import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {EngineInput} from '../../engine/types';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../engine/planner-next/assistedPlanning';
import {validatePlan} from '../../engine/planner-next/validate';
import {fingerprint} from '../../engine/planner-next/fingerprint';

/** Read-only probes of the captured API day, using only existing constructors. */
export function analyseU00iResourceGate(input:EngineInput,guardReleased=false){
  const before=structuredClone(input);
  const flexible=input.tasks.find(task=>task.resourceRequirements?.anyOf?.length)!;
  assert.ok(flexible);const group=flexible.resourceRequirements!.anyOf![0];
  assert.equal(group.quantity,1);assert.equal(group.resourceItemIds.length,2);
  const critical=input.tasks.find(task=>task!==flexible)!;
  const fixedGlobal=Number(Object.keys(critical.resourceRequirements!.byItem!)[0]);
  const otherGlobal=group.resourceItemIds.find(id=>id!==fixedGlobal)!;
  const daily=(id:number)=>input.planResourceItems.find(item=>item.resourceItemId===id)!.id;
  const concrete=(selected:number)=>{
    const copy=structuredClone(input);
    copy.tasks.find(task=>task.id===flexible.id)!.resourceRequirements={byItem:{[selected]:1}};
    const adapter=adaptEngineInputToPlannerNextProblem(copy);
    assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter));
    if(adapter.status!=='SUPPORTED')throw Error('unsupported concrete counterpart');return adapter.problem;
  };
  const full=(problem:ReturnType<typeof concrete>)=>executeAssistedPlanning(buildAssistedProblem(problem,
    createPlanningScope({kind:'DAY',value:'diagnostic'},{},problem.tasks.map(task=>task.id)),[]));
  const pA=concrete(fixedGlobal),pB=concrete(otherGlobal),allA=full(pA),allB=full(pB);
  assert.equal(allA.evidence.completeForScope,false);assert.equal(allA.proposal,null);
  assert.equal(allB.evidence.completeForScope,true);assert.ok(allB.proposal);
  assert.equal(validatePlan(pB,[...allB.proposal]).hardValid,true);
  const repeat=full(pB);assert.deepEqual(allB.proposal,repeat.proposal);
  assert.equal(allB.evidence.fingerprint,repeat.evidence.fingerprint);assert.deepEqual(allB.evidence.work,repeat.evidence.work);
  // Same scope/future-eligibility authority used by Assisted. The future task
  // belongs to a different participant but competes for the same physical A.
  const split=(problem:ReturnType<typeof concrete>)=>{
    const scope=createPlanningScope({kind:'TASK_IDS',value:'flexible first'},{},[`task:${flexible.id}`]);
    const projected=buildAssistedProblem(problem,scope,[],new Set(problem.tasks.map(task=>task.id)));
    const first=executeAssistedPlanning(projected);assert.equal(first.evidence.completeForScope,true);assert.ok(first.proposal);
    const second=executeAssistedPlanning(buildAssistedProblem(problem,
      createPlanningScope({kind:'TASK_IDS',value:'critical next'},{},[`task:${critical.id}`]),[...first.proposal],new Set(problem.tasks.map(task=>task.id))));
    return {projected,first,second};
  };
  const splitA=split(pA),splitB=split(pB);
  assert.equal(splitA.second.evidence.completeForScope,false);assert.equal(splitA.second.proposal,null);
  assert.equal(splitB.second.evidence.completeForScope,true);
  assert.ok(splitA.projected.problem.analyticalFutureParticipantTasks?.some(task=>task.id===`task:${critical.id}`));
  // Existing physical validation checks the resources supplied in the result;
  // it has no ordinary-task choice-domain integrity authority to reuse.
  const omitted=allB.proposal.map(task=>task.id===`task:${flexible.id}`?{...task,requiredResourceIds:[]}:task);
  const omittedValidation=validatePlan(pB,omitted);assert.equal(omittedValidation.hardValid,true);
  const alternativeOnly=allB.proposal.map(task=>task.id===`task:${flexible.id}`?{...task,requiredResourceIds:[`plan-resource:${daily(fixedGlobal)}`]}:task);
  assert.equal(validatePlan(pB,alternativeOnly).hardValid,false);
  const report={status:'BOUNDARY_REPRODUCED',guardReleased,
    fixedGlobal,otherGlobal,dailyIds:{fixed:daily(fixedGlobal),other:daily(otherGlobal)},
    completeWithA:allA,completeWithB:allB,
    differentParticipantFuture:{A:{first:splitA.first,second:splitA.second},B:{first:splitB.first,second:splitB.second},
      analyticalFutureTaskIds:splitA.projected.problem.analyticalFutureParticipantTasks!.map(task=>task.id)},
    ordinaryResultIntegrity:{omittedValidation,originalFingerprint:fingerprint([...allB.proposal]),omittedFingerprint:fingerprint(omitted),
      fingerprintsEqual:fingerprint([...allB.proposal])===fingerprint(omitted)},
    released:undefined as unknown};
  const adapter=adaptEngineInputToPlannerNextProblem(input);
  if(guardReleased){
    assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter));
    if(adapter.status!=='SUPPORTED')throw Error('guard-only counterfactual unsupported');
    const result=full(adapter.problem);assert.equal(result.evidence.completeForScope,true);assert.ok(result.proposal);
    const canonicalFlexible=adapter.problem.tasks.find(task=>task.id===`task:${flexible.id}`)!;
    assert.equal(canonicalFlexible.requiredResourceIds?.length??0,0);
    assert.equal(adapter.problem.resources.some(resource=>resource.id===`plan-resource:${daily(otherGlobal)}`),false);
    const missing=result.proposal.find(task=>task.id===canonicalFlexible.id)!;
    assert.equal(missing.requiredResourceIds?.length??0,0);
    report.released={adapter,result,lostAlternativeResourceId:`plan-resource:${daily(otherGlobal)}`};
  }else{
    assert.equal(adapter.status,'UNSUPPORTED');
    assert.ok(adapter.reasonCodes.includes('UNSUPPORTED_RESOURCE_REQUIREMENT'));
  }
  assert.deepEqual(input,before);return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const input=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
  const report=analyseU00iResourceGate(input,process.argv.includes('--guard-released'));
  writeFileSync(resolve(process.argv[3]),JSON.stringify(report,null,2));
  console.log(report.status);
}
