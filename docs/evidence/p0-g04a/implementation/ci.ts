/** Materialize the preserved original witness as a diagnostic input, then run
 * authentic UI authoring in two independently owned databases. */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(process.argv[2]??'work/g04a');mkdirSync(root,{recursive:true});
const original=resolve(root,'original-probe');mkdirSync(original);
const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-g04a/probe/receipts.json.gz')).toString());
for(const [name,value]of Object.entries(receipts)){assert.match(name,/^[a-z-]+\.json$/);writeFileSync(`${original}/${name}`,JSON.stringify(value));}
const env:NodeJS.ProcessEnv={...process.env,G04A_ORIGINAL_PROBE:original};delete env.G04A_DEV_HOLD;delete env.G04A_SKIP_FOCAL;delete env.G04A_GENERIC_ONLY;delete env.G03E_CONTROL;
for(const name of ['a','b'])execFileSync(process.execPath,['--import','tsx','docs/evidence/p0-g04a/implementation/run.ts',`${root}/${name}`],{env,stdio:'inherit'});
for(const name of ['a','b'])execFileSync('python3',['docs/evidence/p0-g04a/implementation/verify.py',`${root}/${name}/native`,`${root}/verification-${name}.json`],{stdio:'inherit'});
execFileSync('python3',['docs/evidence/p0-g04a/implementation/compare.py',`${root}/a/native`,`${root}/b/native`,`${root}/determinism.json`],{stdio:'inherit'});
