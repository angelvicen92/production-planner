/** esbuild write:false: no product source, database or schedule intervention. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {transform} from './memory-delta';
import {validatePlan} from '../../../engine/planner-next/validate';
const directory=resolve(process.argv[2]),output=resolve(process.argv[3]);mkdirSync(output,{recursive:true});const changes:any[]=[];
const bundle=await build({stdin:{contents:`export {inspect} from './docs/evidence/p0-u00y/consumer';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'u00y-memory-only',setup(b){b.onLoad({filter:/\.ts$/},async args=>{const original=readFileSync(args.path,'utf8'),changed=transform(args.path,original);if(changed!==original)changes.push({path:args.path.slice(process.cwd().length+1),before:createHash('sha256').update(original).digest('hex'),after:createHash('sha256').update(changed).digest('hex'),source:changed});return {contents:changed,loader:'ts',resolveDir:resolve(args.path,'..')};});}}]});
const module={exports:{} as {inspect:typeof import('./consumer').inspect}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const paired=JSON.parse(readFileSync(`${directory}/control-paired.json`,'utf8')).input;paired.dailyJointGroupsVersion=1;
const results:any={};
for(const [name,ids] of [['full',paired.tasks.map((t:any)=>t.id)],['scope',[2]],['future',[7]]] as const){
 const result=module.exports.inspect(paired,[...ids]);writeFileSync(`${output}/${name}.json`,JSON.stringify(result,null,2));
 assert.ok(result.result?.proposal,name);assert.equal(result.result!.evidence.hardValid,true,name);
 assert.ok(result.adapter.problem);const witness=result.result!.evidence.nominalPhysicalFutureWitness!;assert.equal(witness.tasks.length,paired.tasks.length);assert.equal(validatePlan(result.adapter.problem,witness.tasks).hardValid,true);
 const members=witness.tasks.filter(t=>t.jointGroupId);assert.equal(members.length,2);assert.equal(members[0].start,members[1].start);assert.equal(members[0].end,members[1].end);
 if(name==='scope')assert.deepEqual(result.scope?.productTaskIds,[2,5]);
 if(name==='future')assert.deepEqual(result.result!.proposal.map(t=>t.id),['task:7']);
 results[name]={proposal:result.result!.proposal.map(t=>t.id),work:result.result!.evidence.work,witnessMembers:members.map(t=>t.id)};
}
const full=module.exports.inspect(paired);const fixed=full.result!.proposal!.find(t=>t.id==='task:2')!;
assert.throws(()=>module.exports.inspect(paired,[5],[fixed]),/JOINT_GROUP_PARTIALLY_PROTECTED/);
const incompatible=JSON.parse(readFileSync(`${directory}/control-incompatible.json`,'utf8')).input;incompatible.dailyJointGroupsVersion=1;
const negative=module.exports.inspect(incompatible);writeFileSync(`${output}/incompatible.json`,JSON.stringify(negative,null,2));assert.equal(negative.result?.proposal,null);assert.ok(!negative.result!.evidence.reasonCodes.some(c=>/BUDGET|EXHAUST/.test(c)));
writeFileSync(`${output}/interventions.json`,JSON.stringify(changes,null,2));writeFileSync(`${output}/summary.json`,JSON.stringify({experimentIsStage:false,remoteWrites:0,results,halfProtected:'EXPLICIT_REJECTION',incompatible:negative.result?.evidence.reasonCodes},null,2));console.log('PASS memory counterfactual: whole visible group, shared physical witness, explicit half-protection rejection');
