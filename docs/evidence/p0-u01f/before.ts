/** Reproduce the first rejection using the exact authorized base, no overlay. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,symlinkSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const base='f5d56eeb477e86e1c3b960e3ac37db37d3046c84',output=resolve(process.argv[2]),repo=process.cwd(),source=join(output,'source');assert.ok(!existsSync(output));mkdirSync(source,{recursive:true});
for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[key];
execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive',base],{maxBuffer:256*1024*1024})});symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const path=join(source,'script/demo/smokeNewDayIntegration.ts'),original=readFileSync(path,'utf8'),from='const journey=process.argv.includes("--daily-rounds")?',to='const journey=process.argv.includes("--u01e")?(await import("../../docs/evidence/p0-u01e/journey")).journey:process.argv.includes("--daily-rounds")?';assert.ok(original.includes(from));writeFileSync(path,original.replace(from,to));
writeFileSync(join(output,'manifest.json'),JSON.stringify({base,tree:execFileSync('git',['rev-parse',base+'^{tree}'],{encoding:'utf8'}).trim(),remoteWrites:0,productionOverlay:[],dispatch:{file:'script/demo/smokeNewDayIntegration.ts',from,to,before:createHash('sha256').update(original).digest('hex')}},null,2));
const result=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(output,'native'),'--u01e'],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:output},stdio:'inherit'});assert.equal(result.status,0);
