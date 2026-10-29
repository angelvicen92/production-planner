import {archiveEvidenceSource} from '../../../script/demo/archiveEvidenceSource';
/** Run the working candidate in a disposable archive; dispatch changes only there. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
const output=resolve(process.argv[2]);assert.ok(!existsSync(output),'Choose fresh output');
const repo=process.cwd(),source=join(output,'source');mkdirSync(source,{recursive:true});
archiveEvidenceSource(output,source);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','engine','server','client','shared','supabase','script','docs/source/official','docs/evidence/p0-u00r','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n').filter(existsSync).filter(f=>!f.startsWith('docs/evidence/p0-u00r/')||['docs/evidence/p0-u00r/journey.ts','docs/evidence/p0-u00r/run.ts'].includes(f));
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const hashes=Object.fromEntries(files.map(f=>[f,sha(readFileSync(join(repo,f)))]));
for(const f of files){mkdirSync(dirname(join(source,f)),{recursive:true});copyFileSync(join(repo,f),join(source,f));}
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const file=join(source,'script/demo/smokeNewDayIntegration.ts'),before=readFileSync(file,'utf8');
const from='const journey=process.argv.includes("--daily-rounds")?';
const to='const journey=process.argv.includes("--u00r")?(await import("../../docs/evidence/p0-u00r/journey")).journey:process.argv.includes("--daily-rounds")?';
assert.equal(before.split(from).length,2);writeFileSync(file,before.replace(from,to));
writeFileSync(join(output,'manifest.json'),JSON.stringify({base:'eb3facfb6a935ee4d7daf84770e9b6a20ae91b2d',node:process.version,repeat:process.env.U00R_REPEAT==='1',remoteWrites:0,sourceHashes:hashes,dispatch:{file:'script/demo/smokeNewDayIntegration.ts',from,to,before:sha(before),after:sha(readFileSync(file))}},null,2));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(output,'native'),'--u00r'],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:output},stdio:'inherit'});
for(const [f,hash] of Object.entries(hashes))assert.equal(sha(readFileSync(join(repo,f))),hash,'checkout '+f);
assert.equal(run.status,0);
