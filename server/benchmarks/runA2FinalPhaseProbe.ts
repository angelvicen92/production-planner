import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCanonicalA2AssistedStage1Fixture } from "../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { buildAssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";

const EVIDENCE_PATH="docs/evidence/A2-ASSIST-8-assisted-completion.json";

export async function runA2FinalPhaseProbe(){
  const prior=JSON.parse(readFileSync(EVIDENCE_PATH,"utf8"));
  const source=prior.iterations?.find((item:any)=>item.ordinal===6);
  assert.equal(source?.acceptedSnapshotBefore?.length,75,"canonical Evidence must expose the demonstrated 75-row prefix");
  const canonical=buildCanonicalA2AssistedStage1Fixture(6_000,711);
  const acceptedById=new Map(source.acceptedSnapshotBefore.map((row:any)=>[row.taskId,row]));
  const snapshot=buildAssistedPlanningSnapshotV1(canonical.input.tasks.map(task=>({
    id:task.id,startPlanned:null,endPlanned:null,zoneId:task.zoneId??null,spaceId:task.spaceId??null,
    ...(acceptedById.get(task.id)??{}),
  })),undefined,source.baseSnapshotOperationalMeals,source.baseSnapshotSetupPreparations,source.baseSnapshotRoundPreparations);
  const evidence=await runA2Assist8Evidence({branchBudget:6_000,writeEvidence:false,initialSnapshot:snapshot});
  const after169=evidence.iterations.slice(2);
  assert.ok(after169.every((row:any)=>row.orchestration.selectedUnitId!=="SPACE_FALLBACK:3018"));
  const kinds=after169.map((row:any)=>row.orchestration.selectedUnitKind);
  const closure=kinds.indexOf("PARTICIPANT_CLOSURE");
  if(process.env.A2_FINAL_PROBE_DIAGNOSTIC)console.error(JSON.stringify(evidence.iterations.map((row:any)=>({unit:row.orchestration.selectedUnitId,result:row.proposalOutcome,completed:row.completedObligationCount,reasonCodes:row.reasonCodes,fixedMainBundle:row.fixedMainBundle}))));
  if(evidence.status==="PASS"){
    assert.ok(kinds.includes("JOINT_OPERATION")&&kinds.includes("PARTICIPANT_OPENING"));
    assert.ok(closure>kinds.indexOf("JOINT_OPERATION")&&closure>kinds.indexOf("PARTICIPANT_OPENING"));
  }
  return evidence;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const result=await runA2FinalPhaseProbe();
  console.log(JSON.stringify({benchmark:"A2-FINAL-PHASE",status:result.status,
    completedObligationCount:result.completedObligationCount,remainingObligationCount:result.remainingObligationCount,
    sequence:result.iterations.map((row:any)=>({unit:row.orchestration.selectedUnitId,result:row.proposalOutcome,
      completed:row.completedObligationCount,coreBranches:row.work.coreBranches??0,
      standaloneBranches:row.work.standaloneBranches??0})) ,firstBlocker:result.firstBlocker},null,2));
}
