/** Run existing gates with current runtime; only harness dispatch/catalog version changes. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const [directory,unit]=process.argv.slice(2);assert.ok(['p0-u01f','p0-u01d','p0-u01b','p0-u00s','p0-u00a'].includes(unit));
mkdirSync('work/p0-u02b',{recursive:true});
let runner=readFileSync('docs/evidence/p0-u02b/run.ts','utf8');
const dispatch=unit==='p0-u00a'?'./smokeNewDayJourney':'../../docs/evidence/'+unit+'/journey';
runner=runner.replace('../../docs/evidence/p0-u02b/journey',dispatch);
if(unit==='p0-u01f')runner=runner.replace("writeFileSync(join(output,'manifest.json')",`const gate='docs/evidence/p0-u01f/journey.ts';copyFileSync(join(repo,gate),join(source,gate));writeFileSync(join(output,'control-overlay.json'),JSON.stringify({file:gate,sha256:sha(readFileSync(join(source,gate))),catalog:'current literal migration bodies; fixtures and assertions unchanged'}));\nwriteFileSync(join(output,'manifest.json')`);
if(unit==='p0-u00a')runner=runner.replace('(await import("./smokeNewDayJourney")).journey','(await import("./smokeNewDayJourney")).runNewDayJourney');
const path=resolve('work/p0-u02b/'+unit+'-runner.ts');writeFileSync(path,runner);
const result=spawnSync(process.execPath,['--import','tsx',path,resolve(directory)],{stdio:'inherit',env:process.env});assert.equal(result.status,0);
