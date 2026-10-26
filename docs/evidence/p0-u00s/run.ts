/** Run the working candidate in a disposable archive; dispatch changes only there. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
const output=resolve(process.argv[2]);assert.ok(!existsSync(output),'Choose fresh output');
const repo=process.cwd(),source=join(output,'source');mkdirSync(source,{recursive:true});
execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive','HEAD'],{maxBuffer:256*1024*1024})});
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','engine','server','client','shared','supabase','script','docs/source/official','docs/evidence/p0-u00s','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n').filter(existsSync).filter(f=>!f.startsWith('docs/evidence/p0-u00s/')||['docs/evidence/p0-u00s/journey.ts','docs/evidence/p0-u00s/run.ts','docs/evidence/p0-u00s/attacks.ts'].includes(f));
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const hashes=Object.fromEntries(files.map(f=>[f,sha(readFileSync(join(repo,f)))]));
for(const f of files){mkdirSync(dirname(join(source,f)),{recursive:true});copyFileSync(join(repo,f),join(source,f));}
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const file=join(source,'script/demo/smokeNewDayIntegration.ts'),before=readFileSync(file,'utf8');
const from='const journey=process.argv.includes("--daily-rounds")?';
const to='const journey=process.argv.includes("--u00s")?(await import("../../docs/evidence/p0-u00s/journey")).journey:process.argv.includes("--daily-rounds")?';
assert.equal(before.split(from).length,2);writeFileSync(file,before.replace(from,to).replace('await db.query(sql);',`try{await db.query(sql);}catch(e:any){console.error(JSON.stringify({file,code:e.code,position:e.position,internalPosition:e.internalPosition,internalQuery:e.internalQuery,message:e.message}));throw e;}`));
writeFileSync(join(output,'manifest.json'),JSON.stringify({base:'ed4cc0b32c6a5850292c7157f07dee570180696b',node:process.version,repeat:process.env.U00S_REPEAT==='1',remoteWrites:0,sourceHashes:hashes,dispatch:{file:'script/demo/smokeNewDayIntegration.ts',from,to,before:sha(before),after:sha(readFileSync(file))}},null,2));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(output,'native'),'--u00s'],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:output},stdio:'inherit'});
for(const [f,hash] of Object.entries(hashes))assert.equal(sha(readFileSync(join(repo,f))),hash,'checkout '+f);
assert.equal(run.status,0);
