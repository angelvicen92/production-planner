/** Reconstruct physical occupancy from accepted SQL snapshots and their proof.
 * Future occupations remain analytical and never count as accepted placements. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const directory=resolve(process.argv[2]),output=resolve(process.argv[3]);
const load=(n:string)=>JSON.parse(readFileSync(join(directory,'native',n+'.json'),'utf8'));
const minute=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));
const results:any[]=[];
for(const label of ['A','B'])for(let stage=1;stage<=(label==='B'?2:1);stage++){
 const authority=load(`${label}-configuration`).jointGroups.authority,sql=load(`${label}-S${stage}-sql`),run=load(`${label}-S${stage}-run`),proof=run.assisted_result_json.evidence.nominalPhysicalFutureWitness.tasks;
 const groups=new Map<number,string>(authority.groups.flatMap((g:any)=>g.taskIds.map((id:number)=>[id,g.id]))),occupations=new Map<string,any>();
 const scheduled=new Map<number,any>(sql.snapshot_json.tasks.filter((t:any)=>t.startPlanned!=null).map((t:any)=>[t.taskId,t]));
 for(const t of proof){
  const id=Number(t.id.slice(5)),accepted=scheduled.get(id);
  if(accepted){assert.equal(minute(accepted.startPlanned),t.start);assert.equal(minute(accepted.endPlanned),t.end);assert.equal(`space:${accepted.spaceId}`,t.spaceId);}
  const key=groups.has(id)?`joint:${groups.get(id)}`:t.id,resources=[...new Set([...(t.requiredResourceIds??[]),...(t.coachId?[t.coachId]:[])])].sort();
  const own=occupations.get(key);
  if(own){assert.equal(own.start,t.start);assert.equal(own.end,t.end);assert.equal(own.space,t.spaceId);assert.deepEqual(own.resources,resources);assert.equal(own.accepted,!!accepted);own.members.push(t.id);own.participants.push(t.participantId);}
  else occupations.set(key,{key,start:t.start,end:t.end,space:t.spaceId,blocks:t.blocksSpace!==false,resources,members:[t.id],participants:t.participantId?[t.participantId]:[],accepted:!!accepted});
 }
 const physical=[...occupations.values()];
 for(const g of authority.groups){const op=occupations.get(`joint:${g.id}`);assert.equal(op.members.length,g.taskIds.length);assert.equal(new Set(op.participants).size,g.taskIds.length);assert.equal(physical.filter(o=>o.key===op.key).length,1);}
 for(let i=0;i<physical.length;i++)for(const b of physical.slice(i+1)){
  const a=physical[i],overlap=a.start<b.end&&b.start<a.end;
  if(overlap){assert.ok(!(a.space===b.space&&a.blocks&&b.blocks),'one common space occupation');assert.ok(!a.resources.some((r:string)=>b.resources.includes(r)),'no duplicated physical capacity');assert.ok(!a.participants.some((p:string)=>b.participants.includes(p)),'each individual remains occupied');}
 }
 for(const t of proof)for(const dep of t.dependencies)assert.ok(proof.find((p:any)=>p.id===dep).end<=t.start);
 results.push({label,stage,sqlStageId:sql.id,individualObligations:proof.length,acceptedObligations:scheduled.size,physicalOccupations:physical.length,
  groups:authority.groups.map((g:any)=>occupations.get(`joint:${g.id}`)),physical,source:'accepted SQL snapshot + versioned daily authority + exact physical witness'});
}
writeFileSync(output,JSON.stringify({status:'PASS',remoteWrites:0,results},null,2));console.log('PASS one physical occupation per group, all individual participants and both dependency chains preserved');
