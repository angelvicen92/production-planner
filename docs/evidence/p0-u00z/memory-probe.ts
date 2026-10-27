/** Before implementation: two exact predicate extensions in a write:false bundle. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const directory=resolve(process.argv[2]),output=resolve(process.argv[3]);mkdirSync(output,{recursive:true});const changes:any[]=[];
const bundle=await build({stdin:{contents:`export {inspect} from './docs/evidence/p0-u00y/consumer'; export {validatePlan} from './engine/planner-next/validate';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'memory-only',setup(b){b.onLoad({filter:/\.ts$/},async args=>{const original=readFileSync(args.path,'utf8');let changed=original;
 if(args.path.endsWith('/integration/engineInputAdapter.ts')){const needle='...(input.dailyJointGroupsVersion===1?{nativeJointGroupsVersion:1}:{})';assert.equal(changed.split(needle).length,2);changed=changed.replace(needle,needle+',\n    ...(input.dailyOperationalMealsVersion===1?{nativeOperationalMealsVersion:1}:{})');}
 if(args.path.endsWith('/assistedPlanning.ts')){for(const owner of ['source','searchProblem']){const needle=`${owner}.nativeJointGroupsVersion===1||${owner}.nativeAnchoredAccompanimentsVersion===2`;assert.equal(changed.split(needle).length,2);changed=changed.replace(needle,`${owner}.nativeOperationalMealsVersion===1||`+needle);}}
 if(changed!==original)changes.push({file:args.path.slice(process.cwd().length+1),before:createHash('sha256').update(original).digest('hex'),after:createHash('sha256').update(changed).digest('hex'),source:changed});return {contents:changed,loader:'ts',resolveDir:resolve(args.path,'..')};});}}]});
const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const summary:any={remoteWrites:0,experimentIsStage:false};
for(const label of ['A','B']){
 const input=JSON.parse(readFileSync(`${directory}/${label}-declared.json`,'utf8'));input.dailyOperationalMealsVersion=1;
 const partial=module.exports.inspect(input,[input.tasks.at(-1).id]);writeFileSync(`${output}/${label}-partial.json`,JSON.stringify(partial,null,2));
 assert.ok(partial.result.proposal);const proof=partial.result.evidence.nominalPhysicalFutureWitness;
 assert.equal(proof.tasks.length,input.tasks.length);assert.equal(proof.operationalMeals.length,input.operationalMealPolicies.length);
 const validation=module.exports.validatePlan(partial.adapter.problem,proof.tasks,proof.setupPreparations??[],proof.spaceMeals??[],proof.participantMeals??[],proof.resourceMeals??[],proof.itinerantUnitMeals??[],proof.roundPreparations??[],proof.operationalMeals??[]);
 assert.ok(validation.hardValid,JSON.stringify(validation));
 assert.deepEqual(partial.result.proposal.map((t:any)=>t.id),[`task:${input.tasks.at(-1).id}`]);
 const continuation=module.exports.inspect(input,input.tasks.slice(0,-1).map((t:any)=>t.id),partial.result.proposal);assert.ok(continuation.result.proposal);writeFileSync(`${output}/${label}-continuation.json`,JSON.stringify(continuation,null,2));
 summary[label]={partial:partial.result.proposal,globalWitness:proof,validation,partialWork:partial.result.evidence.work,continuationWork:continuation.result.evidence.work};
}
writeFileSync(`${output}/interventions.json`,JSON.stringify(changes,null,2));writeFileSync(`${output}/summary.json`,JSON.stringify(summary,null,2));console.log('PASS: existing collective search certifies pending tasks and every meal; continuation preserves the scope decision');
