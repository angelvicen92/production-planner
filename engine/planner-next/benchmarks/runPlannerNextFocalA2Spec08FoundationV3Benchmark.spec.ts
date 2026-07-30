import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSpec08V3Acceptance, runSpec08FoundationV3Benchmark, type RepositoryValidationEvidence } from "./runPlannerNextFocalA2Spec08FoundationV3Benchmark";

const validation:RepositoryValidationEvidence={schemaVersion:"focal-a2-009r3-validator-v1",completedCommands:["npm ci","npm run check","npm run build","saturated-resource-window-tests","planner-next-suite","npm test"],mode:"current",protectedSubstrateObservedSha256:"c3ccc1fd8819bbbe641367d36fcc7acf223279829114bb3eb4c03f9b3af080a3"};
function capture<T>(run:()=>T):T{const write=process.stdout.write;process.stdout.write=(()=>true) as any;try{return run()}finally{process.stdout.write=write}}
function withoutRootArtifact<T>(run:()=>T):T{const cwd=process.cwd(),temporary=fs.mkdtempSync(path.join(os.tmpdir(),"focal-a2-v3-"));process.chdir(temporary);try{return run()}finally{process.chdir(cwd);fs.rmSync(temporary,{recursive:true,force:true})}}

test("direct benchmark execution cannot claim repository validation or final acceptance",{concurrency:false},()=>{const artifact=capture(()=>runSpec08FoundationV3Benchmark());assert.equal(artifact.checks.finalRepositoryTestsAccepted.passed,false);assert.equal(artifact.checks.benchmarkFreshWithoutCurrentArtifact.passed,false);assert.equal(artifact.acceptance.accepted,false);assert.equal(artifact.status,"FOCAL_A2_SPEC08_VALIDATION_REQUIRED")});

test("validator evidence plus an inaccessible root artifact produces fresh accepted Evidence",{concurrency:false},()=>{const artifact=withoutRootArtifact(()=>capture(()=>runSpec08FoundationV3Benchmark(validation)));assert.equal(artifact.acceptance.accepted,true);assert.equal(artifact.scenarioCount,32);assert.equal(artifact.scenarios.focalA2Spec08NeutralStandaloneBlockRepair.standalone.complete,true);assert.ok(artifact.scenarios.focalA2Spec08NeutralStandaloneBlockRepair.oracleValidOrderCount>0);assert.equal(artifact.checks.humanReferencePoisonInvariant.passed,true);assert.deepEqual(artifact.checks.acceptancePoisonControlsAccepted.expected,artifact.checks.acceptancePoisonControlsAccepted.actual)});

test("missing, incomplete, or forged-positive-fallback validation signals cannot accept",{concurrency:false},()=>{for(const evidence of [undefined,{...validation,completedCommands:validation.completedCommands.slice(1)},{...validation,protectedSubstrateObservedSha256:"poison"}] as Array<RepositoryValidationEvidence|undefined>){const artifact=withoutRootArtifact(()=>capture(()=>runSpec08FoundationV3Benchmark(evidence)));assert.equal(artifact.acceptance.accepted,false);assert.equal(artifact.checks.finalRepositoryTestsAccepted.passed,false)}});

test("acceptance closes when every derived required check is independently poisoned",()=>{const artifact=withoutRootArtifact(()=>capture(()=>runSpec08FoundationV3Benchmark(validation)));for(const id of artifact.requiredPositiveChecks){const checks=structuredClone(artifact.checks);checks[id].passed=false;assert.equal(buildSpec08V3Acceptance(checks,[]).accepted,false,id)}assert.equal(buildSpec08V3Acceptance(artifact.checks,["digest"]).accepted,false)});
