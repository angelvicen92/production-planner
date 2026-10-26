/** Consumer negatives use native authorities; no schedules are given to search or persistence. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning as execute} from '../../../engine/planner-next/assistedPlanning';
import {materializeAnchoredOperation} from '../../../engine/planner-next/anchoredAccompaniment';
const input=JSON.parse(readFileSync(process.argv[2],'utf8')),adapted=adapt(input);assert.equal(adapted.status,'SUPPORTED');if(adapted.status!=='SUPPORTED')throw Error('unsupported');
const base=adapted.problem,policy=base.anchoredAccompaniments![0]!,anchorId=policy.anchorTaskId;
const cases:any[]=[];
for(const name of ['incompatible-windows','unavailable-unit','capacity-competition','exhausted-budget']){
 const p=structuredClone(base),anchor=p.tasks.find(t=>t.id===anchorId)!;
 const before=p.tasks.find(t=>t.id===policy.beforeTaskIds[0])!,after=p.tasks.find(t=>t.id===policy.afterTaskIds[0])!;
 if(name==='incompatible-windows'){
  before.availability=[{start:p.day.start,end:p.day.start+before.duration}];anchor.availability=[{start:p.day.start+60,end:p.day.start+60+anchor.duration}];
 }
 if(name==='unavailable-unit')p.itinerantUnits!.find(u=>u.id===policy.itinerantUnitId)!.availability=[{start:p.day.start,end:p.day.start+5}];
 if(name==='capacity-competition'){
  const start=p.day.start+60;
  anchor.availability=[{start,end:start+anchor.duration}];p.mainFlow!.preferredEnd=start+anchor.duration;
  const peer=p.tasks.find(t=>t.kind==='auxiliary'&&![before.id,after.id].includes(t.id))!;
  peer.participantId='independent-participant';p.participants.push({id:peer.participantId,availability:[{...p.day}]});peer.availability=[{start,end:start+peer.duration}];
 }
 if(name==='exhausted-budget')p.budget.maxBranchExpansions=1;
 const scope=createPlanningScope({kind:'DAY',value:name},{},p.tasks.map(t=>t.id)),result=execute(buildAssistedProblem(p,scope,[]));
 assert.equal(result.proposal,null,name);
 const budget=result.evidence.reasonCodes.some(c=>/BUDGET|EXHAUST/.test(c));
 assert.equal(budget,name==='exhausted-budget',name);
 const starts=[];for(let start=p.day.start;start+anchor.duration<=p.day.end;start+=5)if(materializeAnchoredOperation(p,anchor,start,[]))starts.push(start);
 if(name==='incompatible-windows'||name==='unavailable-unit')assert.equal(starts.length,0,name);
 cases.push({name,classification:budget?'SEARCH_EXHAUSTED':'PHYSICAL_IMPOSSIBILITY',problem:p,materializerStarts:starts,result,experimentIsStage:false});
}
const original=execute(buildAssistedProblem(base,createPlanningScope({kind:'DAY',value:'original'},{},base.tasks.map(t=>t.id)),[]));assert.ok(original.proposal);
writeFileSync(process.argv[3],JSON.stringify({status:'PASS',cases,original,remoteWrites:0},null,2));
console.log('PASS consumer negatives distinguish empty physical domains and exhausted search');
