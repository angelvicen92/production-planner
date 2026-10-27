/** Isolate root/whole-operation edge identity on the identical native input. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const input=JSON.parse(readFileSync(process.argv[2],'utf8')),results:any[]=[];
for(const repaired of [false,true]){
 const changes:any[]=[];
 const bundle=await build({stdin:{contents:"export {inspect} from './docs/evidence/p0-u00w/consumer';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'memory-edge-identity',setup(b){b.onLoad({filter:/nominalResourceChoice\.ts$/},args=>{
  const original=readFileSync(args.path,'utf8'),source=repaired?original:original.replace('task.id===taskId&&task.anchoredUnitChoice','task.anchoredUnitChoice');
  assert.equal(original.includes('task.id===taskId&&task.anchoredUnitChoice'),true);
  changes.push({path:'engine/planner-next/nominalResourceChoice.ts',sha256:createHash('sha256').update(source).digest('hex'),source});
  return {contents:source,loader:'ts',resolveDir:resolve(args.path,'..')};
 });}}]});
 const module={exports:{} as {inspect:typeof import('./consumer').inspect}};
 new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const r=module.exports.inspect(input);assert.ok('result' in r&&r.result.proposal);assert.equal(r.validation!.hardValid,true);
 results.push({repaired,changes,fingerprint:r.result.evidence.fingerprint,work:r.result.evidence.work,selections:r.operationSelections,proposal:r.result.proposal,scope:r.scope});
}
writeFileSync(process.argv[3],JSON.stringify({experimentIsStage:false,sameInput:true,remoteWrites:0,results},null,2));
console.log('PASS root/full-operation identity isolated with unchanged input and budgets');
