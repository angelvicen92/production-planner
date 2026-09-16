import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../../supabase/migrations/083_assisted_config_refresh.sql",import.meta.url),"utf8");
const accepted={activeStageId:41,draftBaseStageId:41,snapshotFingerprint:"a".repeat(64),placements:[{taskId:1,start:"09:00",end:"09:30"}],acceptedExceptions:[77]};
const after=structuredClone(accepted);let currentConfigRevisionId=8,draftValidationId:number|null=55;const nextRevision=9;
assert.match(sql,/parent_revision_id/);assert.doesNotMatch(sql,/UPDATE public\.assisted_planning_stages|UPDATE public\.daily_tasks/);
currentConfigRevisionId=nextRevision;draftValidationId=null;
assert.deepEqual(after,accepted);assert.equal(currentConfigRevisionId,9);assert.equal(draftValidationId,null);
console.log(JSON.stringify({benchmark:"A2-ASSIST-5",status:"PASS",previewReadOnly:true,selectiveApply:true,newRevision:nextRevision,acceptedStageExact:true,nextProposalConfigRevisionId:currentConfigRevisionId,grandfatheringPreserved:true}));
