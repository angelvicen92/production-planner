import { focalA2RealityTasks } from "./focalA2RealityReference";
type T={id:string;participantId?:string;start:number;end:number;spaceId:string;requiredResourceIds?:string[]};
export function evaluateFocalA2RealityUnits(tasks:ReadonlyArray<T>,inputUnchanged:boolean){
 const definitions=new Map(focalA2RealityTasks.map(x=>[x.id,x]));
 const reality=tasks.filter(x=>definitions.has(x.id));
 const units=Object.fromEntries((["MORNING_A","MORNING_B","AFTERNOON_COMBINED"] as const).map(unit=>{
  const selected=reality.filter(x=>definitions.get(x.id)!.unit===unit).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
  const productiveMinutes=selected.reduce((n,x)=>n+x.end-x.start,0),start=selected.length?Math.min(...selected.map(x=>x.start)):null,end=selected.length?Math.max(...selected.map(x=>x.end)):null;
  let blocks=0,last:number|null=null; for(const x of selected){if(last===null||x.start>last)blocks++;last=Math.max(last??x.end,x.end)}
  return [unit,{taskCount:focalA2RealityTasks.filter(x=>x.unit===unit).length,plannedTaskCount:selected.length,productiveMinutes,start,end,spanMinutes:start===null?0:end!-start,internalGapMinutes:start===null?0:end!-start-productiveMinutes,operationalBlockCount:blocks,locationSequence:selected.map(x=>x.spaceId),moveCount:selected.slice(1).filter((x,i)=>x.spaceId!==selected[i].spaceId).length,resourceComposition:Object.fromEntries(selected.map(x=>[x.id,[...(x.requiredResourceIds??[])].sort()]))}];
 }));
 const conflict=(key:(x:T)=>string[])=>{const out:string[]=[];for(let i=0;i<reality.length;i++)for(let j=i+1;j<reality.length;j++)if(reality[i].start<reality[j].end&&reality[j].start<reality[i].end&&key(reality[i]).some(v=>key(reality[j]).includes(v)))out.push(`${reality[i].id}:${reality[j].id}`);return out};
 const a=reality.filter(x=>definitions.get(x.id)!.unit==="MORNING_A"),b=reality.filter(x=>definitions.get(x.id)!.unit==="MORNING_B");
 return {plannedTaskCount:reality.length,units,parallelMorningUnits:a.some(x=>b.some(y=>x.start<y.end&&y.start<x.end)),sharedResourceConflicts:conflict(x=>x.requiredResourceIds??[]),participantOverlapConflicts:conflict(x=>x.participantId?[x.participantId]:[]),inputUnchanged};
}
