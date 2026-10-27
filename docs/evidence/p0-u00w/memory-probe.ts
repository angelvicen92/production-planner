/** Same exact core and budgets, transformed in memory before authorizing product edits. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {transform} from './memory-delta';
const inputDirectory=resolve(process.argv[2]),output=resolve(process.argv[3]);mkdirSync(output,{recursive:true});
const changes:unknown[]=[];
const bundle=await build({stdin:{contents:`export {inspect} from './docs/evidence/p0-u00w/consumer';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'u00w-memory-only',setup(b){b.onLoad({filter:/\.ts$/},async args=>{
 const original=readFileSync(args.path,'utf8'),changed=transform(args.path,original);
 if(original!==changed)changes.push({path:args.path.slice(process.cwd().length+1),before:createHash('sha256').update(original).digest('hex'),after:createHash('sha256').update(changed).digest('hex'),source:changed});
 return {contents:changed,loader:'ts',resolveDir:resolve(args.path,'..')};
 });}}]});
const module={exports:{} as {inspect:typeof import('./consumer').inspect}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const summary:unknown[]=[];
for(const label of ['choice','multi']){
 const before=JSON.parse(readFileSync(join(inputDirectory,`${label}-domain.json`),'utf8'));
 const input=before.input,result=module.exports.inspect(input);
 writeFileSync(join(output,`${label}-after.json`),JSON.stringify(result,null,2));
 assert.ok('result' in result&&result.result.proposal,label);
 assert.ok(result.operationSelections!.every(c=>c.oneCommonUnit),label);
 assert.equal(result.validation!.hardValid,true,label);
 if(label==='choice')assert.ok(result.operationSelections![0].selected[0].endsWith(':2'));
 const partial=module.exports.inspect(input,[input.anchoredAccompaniments[0].anchorTaskId]);
 writeFileSync(join(output,`${label}-partial-after.json`),JSON.stringify(partial,null,2));
 summary.push({label,complete:true,work:result.result.evidence.work,selections:result.operationSelections,partial:'result' in partial?partial.result.evidence:null});
}
writeFileSync(join(output,'interventions.json'),JSON.stringify(changes,null,2));
writeFileSync(join(output,'summary.json'),JSON.stringify({experimentIsStage:false,remoteWrites:0,summary},null,2));
console.log('PASS memory-only automatic whole-operation A/B and three operations');
