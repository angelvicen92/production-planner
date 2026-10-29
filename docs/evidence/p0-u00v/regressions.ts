import {archiveEvidenceSource} from '../../../script/demo/archiveEvidenceSource';
/** Diagnostic only: reuse the native disposable stack without changing product. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
const mode=process.argv[3]??'newday';
const output=resolve(process.argv[2]);assert.ok(!existsSync(output),'Choose fresh output');
for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[k];
const repo=process.cwd(),source=join(output,'source');mkdirSync(source,{recursive:true});
archiveEvidenceSource(output,source);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','engine','server','client','shared','supabase','script','docs/source/official','docs/evidence/p0-u00v','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n').filter(f=>existsSync(f)&&(!f.startsWith('docs/evidence/p0-u00v/')||f.endsWith('.ts')));
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const hashes=Object.fromEntries(files.map(f=>[f,sha(readFileSync(join(repo,f)))]));
for(const f of files){mkdirSync(dirname(join(source,f)),{recursive:true});copyFileSync(join(repo,f),join(source,f));}
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const file=join(source,'script/demo/smokeNewDayIntegration.ts'),before=readFileSync(file,'utf8');
const from='const journey=process.argv.includes("--daily-rounds")?';
const modules:Record<string,[string,string]>={newday:['script/demo/smokeNewDayJourney.ts','runNewDayJourney'],transport:['script/demo/smokeNewDayTransportJourney.ts','runNewDayTransportJourney'],itinerant:['script/demo/smokeNewDayItinerantJourney.ts','runNewDayItinerantJourney'],meals:['script/validation/u00gFunctionalJourney.ts','runU00gFunctionalJourney'],nominal:['script/validation/u00lFunctionalJourney.ts','runU00lFunctionalJourney'],additions:['docs/evidence/p0-u00n/journey.ts','journey'],rounds:['docs/evidence/p0-u00p/journey.ts','journey'],required:['docs/evidence/p0-u00s/journey.ts','journey'],anchored:['docs/evidence/p0-u00u/native.ts','journey']};
const [modulePath,exportName]=modules[mode];assert.ok(modulePath,mode);
const to=`const journey=process.argv.includes("--u00v")?(await import("../../${modulePath.slice(0,-3)}")).${exportName}:process.argv.includes("--daily-rounds")?`;
// Read-only failure/success capture at the existing browser close, without changing
// timeouts, assertions, product dispatch, decisions or any HTTP operation.
const journeyFile=join(source,modulePath),journeyBefore=readFileSync(journeyFile,'utf8');
const capture=`save('browser-final',{url:page.url(),text:await page.locator('body').innerText(),cards:await page.locator('[data-planning-task-id]').count()});`;
if(mode==='anchored')writeFileSync(journeyFile,journeyBefore.replace('await browser.close();',capture+'await browser.close();'));
assert.equal(before.split(from).length,2);const changed=before.replace(from,to);writeFileSync(file,changed);
writeFileSync(join(output,'manifest.json'),JSON.stringify({base:'b1895fa90f52018abbdefab1c224cb7387f54a39',mode,journeyCapture:mode==='anchored'?{file:modulePath,before:sha(journeyBefore),after:sha(readFileSync(journeyFile))}:null,node:process.version,remoteWrites:0,sourceHashes:hashes,dispatch:{file:'script/demo/smokeNewDayIntegration.ts',from,to,before:sha(before),after:sha(changed)}},null,2));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(output,'native'),'--u00v'],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:output},stdio:'inherit'});
for(const [f,hash] of Object.entries(hashes))if(f!=='script/demo/smokeNewDayIntegration.ts'&&f!==modulePath)assert.equal(sha(readFileSync(join(source,f))),hash,'executed archive '+f);
writeFileSync(join(output,'checkout-delta.json'),JSON.stringify(Object.keys(hashes).filter(f=>sha(readFileSync(join(repo,f)))!==hashes[f]),null,2));
assert.equal(run.status,0);
