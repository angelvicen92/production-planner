/** Focal entry point: reuses the native disposable A2 infrastructure without
 * modifying its shared runner or journeys. Only the browser journey is replaced
 * in a temporary runner; the product server uses the original entry point.
 * Run from the repository root with: node --import tsx .../a2-native.test.ts
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const sourcePath = resolve(root, 'script/demo/smokeA2Integration.ts');
const directory = resolve(root, process.argv[2] ?? 'work/my-day-p1a');
mkdirSync(directory, { recursive: true });
const runner = resolve(directory, 'focal-runner.ts');
const journey = resolve(root, 'client/src/components/my-day/a2-journey.test.ts');
let source = readFileSync(sourcePath, 'utf8').replaceAll("'./smokeLiveExecutionJourney'", JSON.stringify(journey));
source = source.replace(/(['"])(\.{1,2}\/[^'"\n]+)\1/g, (_match, _quote, path) => JSON.stringify(resolve(dirname(sourcePath), path)));
source = source.replace('const runtimeFiles=[', "const runtimeFiles=['client/src/pages/my-day.tsx','client/src/lib/my-day-operational.ts','client/src/components/my-day/activity-information.tsx','client/src/components/my-day/a2-journey.test.ts',");
writeFileSync(runner, source, { mode: 0o600 });
try {
  const child = spawn(process.execPath, ['--import', 'tsx', runner, directory, '--historical-topology', '--live-execution-snapshot'], { cwd: root, env: process.env, stdio: 'inherit' });
  process.exitCode = await new Promise<number>((done, reject) => { child.once('error', reject); child.once('exit', code => done(code ?? 1)); });
} finally { rmSync(runner, { force: true }); }
