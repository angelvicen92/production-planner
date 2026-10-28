/** Real native input, memory-only physical/visual counterfactual. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {inspect} from '../p0-u00y/consumer';
const input=JSON.parse(readFileSync('work/u00z-diagnostic-2/native/B-declared.json','utf8'));
input.tasks[0]={...input.tasks[0],blocksSpace:false,agendaScope:'ITINERANT_UNIT',resourceInheritance:'OPERATION_ONLY'};
input.operationalMealPolicies.push({id:'physical-location-only',window:{start:'10:00',end:'10:20'},durationMinutes:20,planResourceItemIds:[],spaceIds:[input.tasks[0].spaceId]});
const before=inspect(input);assert.equal(before.adapter.status,'SUPPORTED');assert.equal(before.result?.proposal,null);
const changes:any[]=[];
const bundle=await build({stdin:{contents:`export {inspect} from './docs/evidence/p0-u00y/consumer';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'physical-scope-counterfactual',setup(b){b.onLoad({filter:/(operationalMeals|preparedOperationalMealAuthority)\.ts$/},args=>{
 const original=readFileSync(args.path,'utf8'),needle='policy.spaceIds.includes(task.spaceId)';assert.equal(original.split(needle).length,2);
 const changed=original.replace(needle,'(task.blocksSpace!==false&&policy.spaceIds.includes(task.spaceId))');changes.push({file:args.path.slice(process.cwd().length+1),needle,changed});return {contents:changed,loader:'ts',resolveDir:resolve(args.path,'..')};
});}}]});
const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const after=module.exports.inspect(input);assert.ok(after.result?.proposal);assert.equal(after.result.evidence.hardValid,true);
writeFileSync(process.argv[2],JSON.stringify({input,before,after,changes,firstBoundary:'taskConflictsWithPolicy and PreparedOperationalMealAuthority.affects consume a visual location despite blocksSpace:false',experimentIsStage:false,remoteWrites:0},null,2));
console.log('PASS physical/visual counterfactual: the same physical members still rest, while the nonoccupying location does not block them');
