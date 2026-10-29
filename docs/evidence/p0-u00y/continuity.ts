import {archiveEvidenceSource} from '../../../script/demo/archiveEvidenceSource';
/** Literal continuity regression with system Chromium selected in an archive.
 * No assertions, timeouts, budgets or product behavior are changed. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const out=resolve(process.argv[2]);assert.ok(!existsSync(out));const source=join(out,'source');mkdirSync(source,{recursive:true});
for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[k];
archiveEvidenceSource(out,source);symlinkSync(join(process.cwd(),'node_modules'),join(source,'node_modules'),'dir');
const files=['supabase/migrations/120_native_joint_groups.sql','script/demo/a2Preflight.ts','script/demo/assistedSQLContracts.ts','script/demo/dataApiGrantsGate.ts'];
for(const file of files){mkdirSync(dirname(join(source,file)),{recursive:true});copyFileSync(file,join(source,file));}
const traceFile=join(source,'server/dayConfigurationService.ts'),traceBefore=readFileSync(traceFile,'utf8'),traceFrom='if (error) throw error;\n  return Number(data);',traceTo="if(error){console.error('U00Y_CAUSAL_INIT',{code:error.code,message:error.message,details:error.details});throw error;}\n  return Number(data);";assert.equal(traceBefore.split(traceFrom).length,2);writeFileSync(traceFile,traceBefore.replace(traceFrom,traceTo));
const target=join(source,'script/demo/smokeOperationContinuityJourney.ts'),before=readFileSync(target,'utf8'),from='chromium.launch({headless:true})',to="chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH})";assert.equal(before.split(from).length,2);writeFileSync(target,before.replace(from,to));
const vite=join(source,'vite.config.ts');writeFileSync(vite,readFileSync(vite,'utf8').replace('export default defineConfig({','export default defineConfig({\n cacheDir: path.resolve(import.meta.dirname,"work/vite-cache"),'));
writeFileSync(join(out,'manifest.json'),JSON.stringify({base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),remoteWrites:0,sourceHashes:Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')])),browserSelection:{file:'script/demo/smokeOperationContinuityJourney.ts',from,to},assertionsChanged:false,readOnlyTrace:{file:'server/dayConfigurationService.ts',from:traceFrom,to:traceTo}},null,2));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeA2Integration.ts',join(out,'native'),'--operation-continuity'],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:out},stdio:'inherit'});assert.equal(run.status,0);
