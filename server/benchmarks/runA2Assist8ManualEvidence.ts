import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildCanonicalFullA2EngineInput } from "../../engine/planner-next/benchmarks/canonicalFullA2EngineInput";
import type { AssistedScopeSelector } from "../../shared/assistedProposalContracts";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";

/** Fixture-only product selections: these are user choices, never planner ordering policy. */
export function canonicalA2ManualSelectors():readonly AssistedScopeSelector[]{
  const {input}=buildCanonicalFullA2EngineInput();
  const mainSpaceId=input.plannerNext?.mainFlow?.spaceId;assert.ok(mainSpaceId);
  const totals=input.roundSynchronizations?.find(policy=>policy.id==="a2-totales-rounds");assert.ok(totals);
  const itinerary=input.tasks.filter(task=>{
    const ids=[...(task.allowedItinerantTeamIds??[])].sort((a,b)=>a-b);
    return JSON.stringify(ids)===JSON.stringify([5001,5002]);
  }).map(task=>task.id).sort((a,b)=>a-b);assert.ok(itinerary.length>0);
  return [
    {kind:"SPACE",spaceId:mainSpaceId},
    {kind:"TASK_IDS",taskIds:[10009,10024,10037,10050,10063,10080,10095,10108,10123,10138,10153,10168,10183,10197,10210,10224,10236,10249,10262]},
    {kind:"TASK_IDS",taskIds:[10041,10069,10081,10129,10154,10169,10173,10215]},
    {kind:"TASK_IDS",taskIds:[...new Set(totals.lanes.flatMap(lane=>lane.taskIds))].sort((a,b)=>a-b)},
    {kind:"TASK_IDS",taskIds:itinerary},
  ];
}

export async function runA2Assist8ManualEvidence(){
  return runA2Assist8Evidence({explicitSelectors:canonicalA2ManualSelectors(),stopAfterIterationCount:5,reportIterationDurations:true});
}

if(import.meta.url===`file://${process.argv[1]}`){const result=await runA2Assist8ManualEvidence();mkdirSync(".artifacts",{recursive:true});
  writeFileSync(".artifacts/A2-ASSIST-8-manual.json",`${JSON.stringify(result,null,2)}\n`);console.log(JSON.stringify(result,null,2));}
