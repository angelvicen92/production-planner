import { isMealBreakPlanningEntry } from "./mealBreakBlocks";
const DEFAULT_ZONE_TASK_CHANGE_LIMIT = 4;
const keyOf=(e:any)=>{
 if(e.taskGroupId!=null||e.task_group_id!=null) return {key:`taskGroup:${e.taskGroupId??e.task_group_id}`,source:"taskGroupId"};
 if(e.groupId!=null||e.group_id!=null) return {key:`group:${e.groupId??e.group_id}`,source:"groupId"};
 if(e.templateId!=null||e.template_id!=null) return {key:`template:${e.templateId??e.template_id}`,source:"templateId"};
 const name=String(e.templateName??e.template_name??e.taskName??e.name??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");
 if(name) return {key:`name:${name}`,source:"normalizedName"};
 return {key:`task:${e.taskId??e.id}`,source:"taskId_fallback"};
};
export function evaluateZoneTaskChangeLimit(args:{planning:any[]; spaces?:any; maxTemplateChangesByZoneId?:Record<string,number>|Record<number,number>|null; taskGroupingResolver?:(e:any)=>string|null|undefined}){
 const planning=[...(args.planning??[])].sort((a,b)=>String(a.startPlanned??a.start_planned).localeCompare(String(b.startPlanned??b.start_planned))||String(a.endPlanned??a.end_planned).localeCompare(String(b.endPlanned??b.end_planned))); const by:Record<string,any[]>={};
 const zoneBySpace=args.spaces?.zoneIdBySpaceId??args.spaces?.zone_id_by_space_id??{};
 for(const e of planning){const zid=e.zoneId??e.zone_id??(e.spaceId!=null?zoneBySpace[e.spaceId]??zoneBySpace[String(e.spaceId)]:null); if(zid==null) continue; (by[String(zid)]??=[]).push(e);}
 const counts:Record<string,number>={}, limits:Record<string,number>={}, seqs:Record<string,string[]>={}, groupingSources:Record<string,string[]>={}, ignored:Record<string,number>={}, violations:any[]=[], warnings:string[]=[];
 const limitOf=(zid:string)=>{const raw=(args.maxTemplateChangesByZoneId as any)?.[zid]; const n=Number(raw); return raw===null||raw===undefined||raw===""||!Number.isFinite(n)?DEFAULT_ZONE_TASK_CHANGE_LIMIT:Math.max(0,Math.floor(n));};
 for(const [zid,entries] of Object.entries(by)){const groups:string[]=[]; const sources:string[]=[]; ignored[zid]=0; for(const e of entries){if(isMealBreakPlanningEntry(e)||e.countsAsWork===false||(e.operationalRole&&e.operationalRole!=="productive_task")){ignored[zid]++; continue;} const custom=args.taskGroupingResolver?.(e); const kg=custom?{key:String(custom),source:"custom"}:keyOf(e); groups.push(kg.key); sources.push(kg.source); if(kg.source==="taskId_fallback") warnings.push("zone_task_change_grouping_used_task_id_fallback");} const compact=groups.filter((g,i)=>i===0||g!==groups[i-1]); const changes=Math.max(0,compact.length-1); counts[zid]=changes; limits[zid]=limitOf(zid); seqs[zid]=compact; groupingSources[zid]=[...new Set(sources)]; if(changes>limits[zid]) violations.push({zoneId:Number(zid), changeCount:changes, limit:limits[zid], sequence:compact, reason:"zone_task_change_limit_exceeded"});}
 return {checked:true, exceeded:violations.length>0, violations, changeCountByZoneId:counts, limitByZoneId:limits, sequenceByZoneId:seqs, groupingKeySourceByZoneId:groupingSources, ignoredMealBreaksByZoneId:ignored, warnings, readOnly:true as const};
}
export function evaluateSpaceTaskChangeLimit(args:{planning:any[]; spaces?:any; maxChangesBySpaceId?:Record<string,number>|Record<number,number>|null; maxTemplateChangesByZoneId?:Record<string,number>|Record<number,number>|null; taskGroupingResolver?:(e:any)=>string|null|undefined}){
 const zoneResult=evaluateZoneTaskChangeLimit({planning:args.planning,spaces:args.spaces,maxTemplateChangesByZoneId:args.maxTemplateChangesByZoneId??args.spaces?.maxTemplateChangesByZoneId,taskGroupingResolver:args.taskGroupingResolver});
 const planning=[...(args.planning??[])].sort((a,b)=>String(a.startPlanned).localeCompare(String(b.startPlanned))); const by:Record<string,any[]>={}; for(const e of planning){if(e.spaceId==null) continue; (by[String(e.spaceId)]??=[]).push(e);}
 const counts:Record<string,number>={}, limits:Record<string,number|null>={}, seqs:Record<string,string[]>={}, ignored:Record<string,number>={}, violations:any[]=[];
 for(const [sid,entries] of Object.entries(by)){const groups:string[]=[]; ignored[sid]=0; for(const e of entries){if(isMealBreakPlanningEntry(e)||e.countsAsWork===false||(e.operationalRole&&e.operationalRole!=="productive_task")){ignored[sid]++; continue;} const custom=args.taskGroupingResolver?.(e); groups.push(custom?String(custom):keyOf(e).key);} const compact=groups.filter((g,i)=>i===0||g!==groups[i-1]); const changes=Math.max(0,compact.length-1); counts[sid]=changes; const raw=(args.maxChangesBySpaceId as any)?.[sid]; const n=Number(raw); limits[sid]=raw==null?null:(Number.isFinite(n)?Math.max(0,Math.floor(n)):null); seqs[sid]=compact; if(limits[sid]!=null&&changes>(limits[sid] as number)) violations.push({spaceId:Number(sid),changeCount:changes,limit:limits[sid],sequence:compact,reason:"space_task_change_limit_exceeded"});}
 const legacyExceeded=violations.length>0;
 return {...zoneResult, exceeded: zoneResult.exceeded || legacyExceeded, violations:[...zoneResult.violations,...violations], changeCountBySpaceId:counts, limitBySpaceId:limits, sequenceBySpaceId:seqs, changesIgnoredByMealBreakBySpaceId:ignored};
}

export function enrichPlanningEntriesForTaskChangeLimit(args:{planning:any[]; tasks?:any[]|null; operationalState?:any|null}) {
 const taskById=new Map<number,any>();
 for(const t of [...(args.operationalState?.tasks??[]), ...(args.tasks??[])]){const id=Number(t?.id); if(Number.isFinite(id)) taskById.set(id,t);}
 return (args.planning??[]).map((e:any)=>{
  const task=taskById.get(Number(e.taskId??e.id)) ?? e.task ?? null;
  const metadata=task?.metadata ?? {};
  return {
   ...e,
   task,
   templateId:e.templateId??e.template_id??task?.templateId??task?.template_id,
   templateName:e.templateName??e.template_name??task?.templateName??task?.template_name,
   taskGroupId:e.taskGroupId??e.task_group_id??task?.taskGroupId??task?.task_group_id??metadata.taskGroupId??metadata.task_group_id,
   groupId:e.groupId??e.group_id??task?.groupId??task?.group_id??metadata.groupId??metadata.group_id,
   operationalRole:e.operationalRole??task?.operationalRole??metadata.operationalRole,
   countsAsWork:e.countsAsWork??task?.countsAsWork??task?.productive??metadata.countsAsWork,
   breakKind:e.breakKind??task?.breakKind??metadata.breakKind,
   isMealBreakBlock:e.isMealBreakBlock??task?.isMealBreakBlock??task?.isMeal,
   mealOccupiesSpace:e.mealOccupiesSpace??task?.mealOccupiesSpace,
   isTransport:e.isTransport??task?.isTransport,
   zoneId:e.zoneId??e.zone_id??task?.zoneId??task?.zone_id,
   spaceId:e.spaceId??e.space_id??e.assignedSpace??task?.spaceId??task?.space_id,
  };
 });
}

export function compareZoneTaskChangeAudits(args:{baseline:any; candidate:any}) {
 const baselineCounts=args.baseline?.changeCountByZoneId??{}, candidateCounts=args.candidate?.changeCountByZoneId??{};
 const baselineLimits=args.baseline?.limitByZoneId??{}, candidateLimits=args.candidate?.limitByZoneId??baselineLimits;
 const zones=[...new Set([...Object.keys(baselineCounts),...Object.keys(candidateCounts),...Object.keys(baselineLimits),...Object.keys(candidateLimits)])].sort();
 const baselineExcessByZoneId:Record<string,number>={}, candidateExcessByZoneId:Record<string,number>={};
 const newViolatingZoneIds:string[]=[], worsenedZoneIds:string[]=[], improvedZoneIds:string[]=[], unchangedViolatingZoneIds:string[]=[];
 for(const zid of zones){
  const bc=Number(baselineCounts[zid]??0), cc=Number(candidateCounts[zid]??0);
  const bl=Number(baselineLimits[zid]??candidateLimits[zid]??DEFAULT_ZONE_TASK_CHANGE_LIMIT), cl=Number(candidateLimits[zid]??baselineLimits[zid]??DEFAULT_ZONE_TASK_CHANGE_LIMIT);
  const be=Math.max(0,bc-bl), ce=Math.max(0,cc-cl);
  baselineExcessByZoneId[zid]=be; candidateExcessByZoneId[zid]=ce;
  if(be===0&&ce>0) newViolatingZoneIds.push(zid);
  if(cc>bc||ce>be) worsenedZoneIds.push(zid);
  else if(cc<bc||ce<be) improvedZoneIds.push(zid);
  else if(be>0&&ce===be) unchangedViolatingZoneIds.push(zid);
 }
 return {
  baselineExceeded:Object.values(baselineExcessByZoneId).some(v=>v>0),
  candidateExceeded:Object.values(candidateExcessByZoneId).some(v=>v>0),
  baselineChangeCountByZoneId:baselineCounts,
  candidateChangeCountByZoneId:candidateCounts,
  baselineExcessByZoneId,
  candidateExcessByZoneId,
  newViolatingZoneIds,
  worsenedZoneIds:[...new Set(worsenedZoneIds)].sort(),
  improvedZoneIds:[...new Set(improvedZoneIds)].sort(),
  unchangedViolatingZoneIds,
  passedNonRegression:newViolatingZoneIds.length===0&&worsenedZoneIds.length===0,
  acceptanceMode:"baseline_relative_non_regression" as const,
  readOnly:true as const,
 };
}
