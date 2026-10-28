/** Read-only diagnostic over the authentic builder output. Rejected authorities only exist in clones. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {inspect} from '../p0-u00y/consumer';
import {validatePlan} from '../../../engine/planner-next/validate';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
import {resolveEffectiveTaskResourceAssignments} from '../../../engine/planner-next/integration/effectiveTaskResourceAssignments';
const base=process.argv[2],output=process.argv[3];mkdirSync(output,{recursive:true});
const read=(n:string)=>JSON.parse(readFileSync(`${base}/${n}.json`,'utf8'));
const save=(n:string,v:unknown)=>writeFileSync(`${output}/${n}.json`,JSON.stringify(v,null,2));
const summary:any[]=[];
for(const label of ['integrated','reverse-order','impossible']){
 const source=read(label+'-memory-input'),original=JSON.stringify(source),map=read(label+'-obligations');
 const run=(name:string,ids?:number[],fixed:readonly any[]=[],include=false,input=source)=>{
  const started=performance.now();const r=inspect(input,ids,[...fixed],include);const w:any=r.result?.evidence.nominalPhysicalFutureWitness;
  const validation=w&&r.adapter.status==='SUPPORTED'?validatePlan(r.adapter.problem,w.tasks,w.setupPreparations??[],w.spaceMeals??[],w.participantMeals??[],w.resourceMeals??[],w.itinerantUnitMeals??[],w.roundPreparations??[],w.operationalMeals??[]):null;
  const certificate=w&&r.adapter.status==='SUPPORTED'?certifyDailyTechnicalChain(r.adapter.problem,[...fixed,...r.result?.proposal??[]],0,w):null;
  const value={memoryOnly:true,stage:false,elapsedMs:performance.now()-started,...r,globalValidation:validation,certificate};save(label+'-'+name,value);
  console.log(JSON.stringify({label,name,adapter:r.adapter.status,proposal:r.result?.proposal?.length,work:r.result?.evidence.work,reasons:r.result?.evidence.reasonCodes,valid:validation?.hardValid}));return value;
 };
 save(label+'-effective',resolveEffectiveTaskResourceAssignments(source));
 const full=run('full');summary.push({label,adapter:full.adapter.status,proposal:full.result?.proposal?.length??null,work:full.result?.evidence.work,reasons:full.result?.evidence.reasonCodes,valid:full.globalValidation?.hardValid});save('summary',summary);
 if(label!=='impossible'&&full.result?.proposal){
  assert.ok(full.globalValidation?.hardValid);assert.equal(full.certificate?.status,'WITNESS');
  const repeat=run('repeat');assert.deepEqual(repeat.result?.proposal,full.result?.proposal);
  const partial=run('partial',[map.competitors[0].id]);
  if(partial.result?.proposal){
   assert.equal(partial.result.proposal.length,1);assert.deepEqual(partial.result.evidence.acceptedSupportingPlacements,[]);
   const continuation=run('continuation',source.tasks.filter((t:any)=>t.id!==map.competitors[0].id).map((t:any)=>t.id),partial.result.proposal,true);
   assert.ok(continuation.globalValidation?.hardValid);assert.ok(continuation.result?.evidence.protectedPlacementsPreserved);
  }
  const scoped=run('scope-unit',[map.policy.phases[0][0]]);
  if(scoped.result?.proposal){assert.deepEqual(scoped.result.evidence.acceptedSupportingPlacements,[]);}
  const mains=source.tasks.filter((t:any)=>t.plannerNextKind==='main').map((t:any)=>t.id);run('main-only',mains);
  const w=structuredClone(full.result.evidence.nominalPhysicalFutureWitness) as any;
  const problem=full.adapter.status==='SUPPORTED'?full.adapter.problem:null;
  if(problem){const attacks=[];
   for(const mode of ['missing-unit-resource','split-peer','missing-rest','overlap-resource','coach-availability','unit-availability']){
    const proof=structuredClone(w),p=structuredClone(problem),member=proof.tasks.find((t:any)=>t.id==='task:'+map.policy.phases[0][0]);
    if(mode==='missing-unit-resource')member.requiredResourceIds=[];
    if(mode==='split-peer'){const peer=proof.tasks.find((t:any)=>t.id==='task:'+map.jointStructure.groups[0].taskIds[1]);peer.start+=5;peer.end+=5;}
    if(mode==='missing-rest')proof.operationalMeals=[];
    if(mode==='overlap-resource'){const rival=proof.tasks.find((t:any)=>t.id==='task:'+map.competitors[0].id);rival.start=member.start;rival.end=rival.start+rival.duration;}
    if(mode==='coach-availability'){const main=proof.tasks.find((t:any)=>t.kind==='main');p.coaches.find((r:any)=>r.id===main.coachId)!.availability=[];}
    if(mode==='unit-availability')p.itinerantUnits!.find((u:any)=>u.id===member.itinerantUnitId)!.availability=[];
    const v=validatePlan(p,proof.tasks,proof.setupPreparations??[],proof.spaceMeals??[],proof.participantMeals??[],proof.resourceMeals??[],proof.itinerantUnitMeals??[],proof.roundPreparations??[],proof.operationalMeals??[]);attacks.push({mode,validation:v});
    assert.equal(v.hardValid,false,mode);
   }save(label+'-attacks',attacks);}
 }
 assert.equal(JSON.stringify(source),original);
}
