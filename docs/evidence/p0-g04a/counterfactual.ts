/** Disposable admission-only counterfactual. Run from the archived work/.../source.
 * No operational SQL write, schedule hint, new resource or budget change. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {validatePlan} from '../../../engine/planner-next/validate';
import {requiredPhaseCompositionSupported} from '../../../server/technicalChainStructure';
import {jointCombinationSupported} from '../../../server/jointGroupStructure';
const native=resolve(process.argv[2]),dir=resolve(process.argv[3]);
assert.ok(process.cwd().includes('/work/')&&!existsSync('.git'),'Only an archived disposable checkout may host shadow modules');
mkdirSync(dir,{recursive:true});
const save=(n:string,v:unknown)=>writeFileSync(`${dir}/${n}.json`,JSON.stringify(v,null,2));
const read=(n:string)=>JSON.parse(readFileSync(`${native}/${n}.json`,'utf8'));
const original=read('native-input'),authorities=read('attempted-authorities');
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const replacements=[];
for(const [file,needle] of [['technicalChainStructure.ts',' && !input.transportSettings'],['jointGroupStructure.ts','&&!input.transportSettings']] as const){
 const before=readFileSync('server/'+file,'utf8');assert.equal(before.split(needle).length,2);
 let after=before.replace(needle,'');
 if(file==='jointGroupStructure.ts')after=after.replace('"./technicalChainStructure"','"./__g04a_technicalChainStructure"');
 writeFileSync('server/__g04a_'+file,after);
 replacements.push({file,needle,replacement:'',before:sha(before),after:sha(after),shadowOnly:true});
}
save('admission-counterfactual',{replacements,nativeInputSha256:sha(JSON.stringify(original)),authorityFields:['dailyTechnicalChainsVersion','technicalChains','dailyJointGroupsVersion','dailyJointGroups','tasks[*].jointGroupId'],persisted:false,sqlWrites:0,stage:false});
const phase=await import(pathToFileURL(resolve('server/__g04a_technicalChainStructure.ts')).href);
const joint=await import(pathToFileURL(resolve('server/__g04a_jointGroupStructure.ts')).href);
let input=phase.validateDailyTechnicalChains(structuredClone(original),authorities.technicalChains);
input=joint.withDailyJointGroups(input,authorities.jointGroups);
input=phase.validateDailyTechnicalChains(input,authorities.technicalChains);
assert.equal(requiredPhaseCompositionSupported(input),false);assert.equal(jointCombinationSupported(input),false);
assert.equal(input.tasks.length,103);assert.deepEqual(input.transportSettings,original.transportSettings);
const untouched=structuredClone(input);delete untouched.dailyTechnicalChainsVersion;delete untouched.technicalChains;delete untouched.dailyJointGroupsVersion;delete untouched.dailyJointGroups;
for(const t of untouched.tasks)delete t.jointGroupId;
assert.deepEqual(untouched,original,'Only attempted phase/joint declarations change');save('input',input);
const a=adapt(input);save('adapter',a);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
const selected=process.argv.includes('--all')?input.tasks.map((t:any)=>t.id):[authorities.jointGroups.groups[0].taskIds[1]];
const scope=resolveAssistedScope(input,a,{kind:'TASK_IDS',taskIds:selected}),eligible=analyticalFutureEligibleTaskIds(input,a.identityMap);
const b=buildAssistedProblem(a.problem,scope.scope,[],eligible);save('scope',scope);save('assisted-problem',b);
const run=executeAssistedPlanning(b);save('run',run);
const proof=run.evidence.nominalPhysicalFutureWitness;
let validation=null;if(proof)validation=validatePlan(a.problem,proof.tasks,proof.setupPreparations as any,proof.spaceMeals as any,proof.participantMeals as any,proof.resourceMeals as any,proof.itinerantUnitMeals as any,proof.roundPreparations as any,proof.operationalMeals as any);
save('validation',validation);
const summary={status:run.proposal&&proof&&validation?.hardValid&&proof.tasks.length+(proof.participantMeals as any[]).length===103?'MEMORY_COMPLETE_WITNESS':'NO_COMPLETE_WITNESS',
 sourceObligations:103,scope:scope.productTaskIds,supporting:b.supportingTaskIds,automatic:b.automaticTaskIds,
 adaptedTasks:a.problem.tasks.length,adaptedMeals:a.problem.participantMeals?.length,transport:a.problem.transportPolicy,
 hasProposal:!!run.proposal,proposalCount:run.proposal?.length??0,witnessTasks:proof?.tasks.length??0,
 witnessMeals:(proof?.participantMeals as any[])?.length??0,reasons:run.evidence.reasonCodes,work:run.evidence.work,validation,acceptedStages:0};
save('summary',summary);console.log(JSON.stringify(summary));
