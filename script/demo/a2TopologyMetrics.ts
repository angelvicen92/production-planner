/** Measurement only; never imported by planning/search. */
export interface MetricTask { id:number;templateName?:string|null;contestantId?:number|null;spaceId?:number|null;participantMarginBeforeMinutes?:number|null;participantMarginAfterMinutes?:number|null }
export interface MetricPlacement { taskId:number;startPlanned:string|null;endPlanned:string|null }
const minute=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const overlap=(a:{start:number;end:number},b:{start:number;end:number})=>Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start));
const union=(rs:{start:number;end:number}[])=>{const out:{start:number;end:number}[]=[];for(const r of rs.slice().sort((a,b)=>a.start-b.start)){const last=out.at(-1);if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else out.push({...r});}return out;};
export function collectA2TopologyMetrics(tasks:readonly MetricTask[],placements:readonly MetricPlacement[],availability:Record<number,{start:string;end:string}>,effectiveResources:Record<number,readonly number[]>={}){
 const byId=new Map(placements.filter(p=>p.startPlanned&&p.endPlanned).map(p=>[p.taskId,p]));
 const rows=tasks.flatMap(t=>{const p=byId.get(t.id);return p?[{...t,start:minute(p.startPlanned!),end:minute(p.endPlanned!)}]:[];});
 const participants=[...new Set(rows.flatMap(r=>r.contestantId==null?[]:[r.contestantId]))].sort((a,b)=>a-b).map(id=>{
  const rs=rows.filter(r=>r.contestantId===id),get=(name:string)=>rs.find(r=>r.templateName===name);
  const arrival=get('IN'),entry=get('ESTILISMO_ENTRADA'),exit=get('ESTILISMO_SALIDA'),departure=get('OUT');
  const last=rs.filter(r=>!['ESTILISMO_SALIDA','OUT'].includes(r.templateName!)).sort((a,b)=>b.end-a.end)[0];
  const busy=union(rs).reduce((n,r)=>n+r.end-r.start,0),start=Math.min(...rs.map(r=>r.start)),end=Math.max(...rs.map(r=>r.end));
  return {id,inToEntryMinutes:arrival&&entry?entry.start-arrival.end:null,lastToExitMinutes:exit&&last?exit.start-last.end:null,
   exitToOutMinutes:exit&&departure?departure.start-exit.end:null,presenceMinutes:end-start,unoccupiedPresenceMinutes:end-start-busy,
   remainingAvailabilityMinutes:availability[id]?minute(availability[id].end)-end:null,
   definition:'Elapsed gaps include applicable hard margins and intervening obligations; unoccupied time is an upper bound, not proven avoidable waiting.'};
 });
 const styling=rows.filter(r=>['ESTILISMO_ENTRADA','ESTILISMO_SALIDA'].includes(r.templateName!)),styleUnion=union(styling);
 const stylingOverlapPairs=styling.flatMap((a,i)=>styling.slice(i+1).filter(b=>overlap(a,b)>0).map(b=>({taskIds:[a.id,b.id],minutes:overlap(a,b)})));
 const redes=rows.filter(r=>r.templateName==='REDES'),pasillo=rows.filter(r=>r.templateName==='PASILLO'),corner=rows.filter(r=>r.templateName?.startsWith('CORNER_'));
 const simultaneous=(left:typeof rows,right:typeof rows)=>left.flatMap(a=>right.filter(b=>a.contestantId!==b.contestantId&&overlap(a,b)>0).map(b=>({taskIds:[a.id,b.id],minutes:overlap(a,b)})));
 const resources=Object.fromEntries([...new Set(Object.values(effectiveResources).flat())].sort((a,b)=>a-b).map(id=>{const rs=rows.filter(t=>effectiveResources[t.id]?.includes(id)),intervals=union(rs);return [id,{taskCount:rs.length,busyMinutes:intervals.reduce((n,r)=>n+r.end-r.start,0),spanMinutes:rs.length?Math.max(...rs.map(r=>r.end))-Math.min(...rs.map(r=>r.start)):0,blocks:intervals.length,dayUtilization:intervals.reduce((n,r)=>n+r.end-r.start,0)/720}];}));
 return {placedObligations:rows.length,dayClosureMinute:rows.length?Math.max(...rows.map(r=>r.end)):null,
  participantPresenceTotalMinutes:participants.reduce((n,p)=>n+p.presenceMinutes,0),participants,
  styling:{productiveMinutes:styling.reduce((n,r)=>n+r.end-r.start,0),unionBusyMinutes:styleUnion.reduce((n,r)=>n+r.end-r.start,0),spanMinutes:styling.length?Math.max(...styling.map(r=>r.end))-Math.min(...styling.map(r=>r.start)):0,dayUtilization:styleUnion.reduce((n,r)=>n+r.end-r.start,0)/720,overlapPairs:stylingOverlapPairs,internalGaps:styleUnion.slice(1).map((r,i)=>({start:styleUnion[i].end,end:r.start,minutes:r.start-styleUnion[i].end,avoidability:'NOT_PROVEN'}))},
  redesPasillo:simultaneous(redes,pasillo),redesCorner:simultaneous(redes,corner),resources};
}
