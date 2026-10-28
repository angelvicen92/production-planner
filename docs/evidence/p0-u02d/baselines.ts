/** Existing native baselines and their original assertions; runtime is the candidate. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const [unit,output]=process.argv.slice(2);assert.ok(['p0-u00x','p0-u02b'].includes(unit));
const run=spawnSync(process.execPath,['--import','tsx',`docs/evidence/${unit}/run.ts`,output,'--native'],{stdio:'inherit',env:process.env});assert.equal(run.status,0);
