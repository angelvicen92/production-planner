/** All interventions are confined to a disposable archive of the authorized base. */
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,readdirSync,symlinkSync,writeFileSync} from "node:fs";
import {join,relative,resolve} from "node:path";

assert.equal(process.versions.node.split(".")[0],"20");
const repo=execFileSync("git",["rev-parse","--show-toplevel"],{encoding:"utf8"}).trim();
const base="4571cb993ae221832630f3ac1c60a72318f83f8c";
const directory=resolve(process.argv[2]??"work/u00g-isolated-gate");
assert.ok(!existsSync(directory),"Use a fresh directory; prior Evidence is never overwritten");
const source=join(directory,"source"),native=join(directory,"native"),marker=join(directory,"identity-active");
mkdirSync(source,{recursive:true,mode:0o700});
execFileSync("tar",["-x","-C",source],{input:execFileSync("git",["archive",base],{cwd:repo,maxBuffer:256*1024*1024})});
symlinkSync(join(repo,"node_modules"),join(source,"node_modules"),"dir");
const sha=(data:Buffer|string)=>createHash("sha256").update(data).digest("hex");
const solverHashes=()=>{
 const result:Record<string,string>={};
 const visit=(dir:string)=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const file=join(dir,entry.name);if(entry.isDirectory())visit(file);else if(entry.name.endsWith(".ts"))result[relative(source,file)]=sha(readFileSync(file));}};
 visit(join(source,"engine/planner-next"));return result;
};
const before=solverHashes(),builder=join(source,"engine/buildInput.ts"),original=readFileSync(builder,"utf8");
const needle="  let effectiveInput = applyPlanPlannerNextConfiguration(applyNewDayPlannerConfiguration(input,p.planner_next_profile,taskTemplateSnapshots),p.planner_next_configuration??p.plannerNextConfiguration);";
assert.equal(original.split(needle).length,2);
const modified='import {existsSync as u00gIdentityActive} from "node:fs";\n'+original.replace(needle,needle+`
  if (u00gIdentityActive(process.env.OPTIPLAN_U00G_MARKER??"/no-u00g-marker")) {
    effectiveInput={...effectiveInput,mealTaskTemplateId:input.mealTaskTemplateId};
  }
`);
writeFileSync(builder,modified);
const harness=join(source,"script/demo/smokeNewDayIntegration.ts"),oldHarness=readFileSync(harness,"utf8");
const dispatch='const {runNewDayJourney}=process.argv.includes("--transport")';assert.ok(oldHarness.includes(dispatch));
writeFileSync(harness,oldHarness.replace(dispatch,'const {runNewDayJourney}=process.argv.includes("--participant-meals-native-diagnostic")\n    ?{runNewDayJourney:(await import("../diagnostics/u00gMealJourney")).runU00gMealJourney}\n    :process.argv.includes("--transport")'));
mkdirSync(join(source,"script/diagnostics"),{recursive:true});
const journey=readFileSync(join(repo,"script/diagnostics/u00gMealJourney.ts"));writeFileSync(join(source,"script/diagnostics/u00gMealJourney.ts"),journey);
const diff=spawnSync("git",["diff","--no-index","--",join(repo,"engine/buildInput.ts"),builder],{encoding:"utf8"});
assert.equal(diff.status,1);writeFileSync(join(directory,"identity-counterfactual.patch"),diff.stdout);
const manifest={base,baseTree:execFileSync("git",["rev-parse",`${base}^{tree}`],{encoding:"utf8"}).trim(),node:process.versions.node,
 intervention:"restore only the builder's discarded mealTaskTemplateId after new-day profile; marker initially absent",
 originalBuilderSha256:sha(original),intervenedBuilderSha256:sha(modified),journeySha256:sha(journey),
 originalHarnessSha256:sha(oldHarness),intervenedHarnessSha256:sha(readFileSync(harness)),solverHashes:before,solverChanged:false,remoteWrites:0};
writeFileSync(join(directory,"intervention.json"),JSON.stringify(manifest,null,2));
const run=spawnSync(process.execPath,["--import","tsx","script/demo/smokeNewDayIntegration.ts",native,"--participant-meals-native-diagnostic"],{
 cwd:source,env:{...process.env,OPTIPLAN_U00G_MARKER:marker},stdio:"inherit"});
assert.deepEqual(solverHashes(),before);
assert.equal(run.status,0,"Native infrastructure/diagnostic failed; do not claim a proven gate");
console.log(JSON.stringify({status:"DIAGNOSTIC_ONLY",native,solverChanged:false,remoteWrites:0}));
