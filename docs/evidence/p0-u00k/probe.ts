import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {preflightEngineInputForPlannerNext} from '../../../engine/planner-next/integration/engineInputPreflight';
import {resolveNominalResourceRequirements} from '../../../engine/planner-next/integration/nominalResourceRequirements';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {executePlannerNext} from '../../../engine/planner-next/executePlannerNext';
import {validatePlan} from '../../../engine/planner-next/validate';
import {buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import type {EngineInput} from '../../../engine/types';
import {characterize} from './characterize';
import {resolveConcreteTaskResourceRequirements} from '../../../engine/concreteTaskResourceRequirements';

const [source,target]=process.argv.slice(2).map(p=>resolve(p));mkdirSync(target,{recursive:true});
const save=(name:string,value:unknown)=>writeFileSync(`${target}/${name}.json`,JSON.stringify(value,(_,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:v,2)+'\n');
const input:EngineInput=JSON.parse(readFileSync(source,'utf8'));
(globalThis as any).__u00k={placementRejections:[],hardGate:[]};
const before=JSON.stringify(input),preflight=preflightEngineInputForPlannerNext(input),adapter=adaptEngineInputToPlannerNextProblem(input);
save('preflight',preflight);save('adapter',adapter);save('resolver',resolveNominalResourceRequirements(input,input.tasks.find(t=>t.id===4)!));
if((globalThis as any).__u00kAdaptedProblem)save('observed-adapted-problem',(globalThis as any).__u00kAdaptedProblem);
if(adapter.status==='SUPPORTED'){
  const problem=adapter.problem,ids=problem.tasks.map(t=>t.id),scope=createPlanningScope({kind:'TASK_IDS',value:'U00k all obligations'},{},ids);
  const snapshotRow=(t:EngineInput['tasks'][number])=>({...t,itinerantTeamId:t.itinerantTeamId??undefined,durationOverride:t.durationOverrideMin});
  const base=buildAssistedPlanningSnapshotV1(input.tasks.map(snapshotRow));
  save('base',{kind:'OFFLINE_S0_PENDING_SNAPSHOT',persisted:false,snapshot:base,fingerprint:fingerprintAssistedPlanningSnapshotV1(base),protectedPlacements:[]});
  const assisted=buildAssistedProblem(problem,scope,[]),result=executeAssistedPlanning(assisted);
  save('scope',{scope,automaticTaskIds:assisted.automaticTaskIds,supportingTaskIds:assisted.supportingTaskIds});save('assisted',result);
  const execution=executePlannerNext(problem,{causalDiagnostic:true});save('execution',execution);
  save('search-taps',structuredClone((globalThis as any).__u00k));
  save('characterization',characterize(problem));
  if(result.proposal){
    const validation=validatePlan(problem,[...result.proposal]);save('validation',validation);
    const byId=new Map(result.proposal.map(t=>[t.id,t]));
    const clock=(minute:number)=>`${Math.floor(minute/60).toString().padStart(2,'0')}:${(minute%60).toString().padStart(2,'0')}`;
    const draft=buildAssistedPlanningSnapshotV1(input.tasks.map(t=>{
      const placed=byId.get(`task:${t.id}`)!;
      const concrete=resolveConcreteTaskResourceRequirements(input,t).resourceIds;
      return {...snapshotRow(t),startPlanned:clock(placed.start),endPlanned:clock(placed.end),
        ...(placed.nominalResourceChoice?{assignedResourceIds:placed.requiredResourceIds!.map(id=>Number(id.split(':')[1]))}:
          concrete.length?{assignedResourceIds:[...new Set([...(t.assignedResourceIds??[]),...concrete])].sort((a,b)=>a-b)}:{})};
    }));
    save('draft',{kind:'OFFLINE_DRAFT_PROJECTION',persisted:false,snapshot:draft,fingerprint:fingerprintAssistedPlanningSnapshotV1(draft)});
  }
}
save('neutral-taps',(globalThis as any).__u00k);
assert.equal(JSON.stringify(input),before,'diagnostic must preserve input');
