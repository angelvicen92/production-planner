import type { EngineInput } from "../../types";
import { deepFreeze } from "../immutability";

const isRec=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null;
const toNum=(v:unknown):number|null=>{ const n=typeof v==="number"?v:typeof v==="string"&&v.trim()!==""?Number(v):NaN; return Number.isFinite(n)?n:null; };
const valid=(v:unknown)=>{ const n=toNum(v); return n!=null&&n>0?n:null; };
const keys=(r:unknown)=>isRec(r)?Object.keys(r).map(valid).filter((n):n is number=>n!=null):[];
const vals=(r:unknown)=>isRec(r)?Object.values(r).map(valid).filter((n):n is number=>n!=null):[];
const arr=(v:unknown)=>Array.isArray(v)?v:[];
const uniq=(a:number[])=>[...new Set(a)].sort((x,y)=>x-y);
const invalids=(a:unknown[])=>uniq(a.map(toNum).filter((n):n is number=>n!=null&&n<=0));

export interface InitialConstructionResourceInventoryItem { readonly planResourceItemId:number; readonly resourceItemId:number; readonly typeId:number|null; readonly isAvailable:boolean; readonly name:string|null; readonly readOnly:true }
export interface InitialConstructionInputCatalog {
  readonly contestantIds:number[]; readonly contestantIdsFromTasks:number[]; readonly contestantIdsFromAvailability:number[]; readonly productiveContestantIds:number[];
  readonly spaceIds:number[]; readonly usedSpaceIds:number[]; readonly unknownUsedSpaceIds:number[]; readonly invalidTaskSpaceIds:number[];
  readonly zoneIds:number[]; readonly usedZoneIds:number[]; readonly unknownUsedZoneIds:number[]; readonly invalidTaskZoneIds:number[];
  readonly zoneIdBySpaceId:Record<number,number>; readonly spaceIdsByZoneId:Record<number,number[]>;
  readonly planResourceItemIds:number[]; readonly resourceItemIds:number[]; readonly resourceInventory:InitialConstructionResourceInventoryItem[];
  readonly planResourceItemById:Record<number,InitialConstructionResourceInventoryItem>; readonly planResourceItemsByResourceItemId:Record<number,InitialConstructionResourceInventoryItem[]>; readonly availablePlanResourceItemsByResourceItemId:Record<number,number[]>;
  readonly invalidTaskContestantIds:number[]; readonly invalidSpaceIdsIgnored:number[]; readonly invalidZoneIdsIgnored:number[]; readonly invalidResourceInventoryItems:unknown[];
  readonly resourceInventoryItemCount:number; readonly resourceInventoryResourceItemCount:number; readonly availableResourceInventoryItemCount:number; readonly unavailableResourceInventoryItemCount:number; readonly duplicateResourceItemMappings:number[];
  readonly warnings:string[]; readonly readOnly:true;
}

export function resolveInitialConstructionInputCatalog(input:EngineInput):InitialConstructionInputCatalog{
  const warnings:string[]=[]; const tasks=arr((input as any).tasks) as any[];
  const taskContestantRaw=tasks.map(t=>t.contestantId); const taskSpaceRaw=tasks.map(t=>t.spaceId); const taskZoneRaw=tasks.map(t=>t.zoneId);
  const contestantIdsFromTasks=uniq(taskContestantRaw.map(valid).filter((n):n is number=>n!=null));
  const contestantIdsFromAvailability=keys((input as any).contestantAvailabilityById);
  const productiveContestantIds=uniq(tasks.filter(t=>t.status!=="done"&&t.status!=="in_progress"&&t.countsAsWork!==false&&t.type!=="meal"&&t.type!=="break").map(t=>valid(t.contestantId)).filter((n):n is number=>n!=null));
  const zByS:Record<number,number>={}; for(const [s,z] of Object.entries((input as any).zoneIdBySpaceId??{})){ const sn=valid(s), zn=valid(z); if(sn&&zn) zByS[sn]=zn; }
  const sByZ:Record<number,number[]>={}; for(const [z,spaces] of Object.entries((input as any).spaceIdsByZoneId??{})){ const zn=valid(z); if(!zn) continue; sByZ[zn]=uniq(arr(spaces).map(valid).filter((n):n is number=>n!=null)); }
  for(const [s,z] of Object.entries(zByS)){ (sByZ[z]??=[]).push(Number(s)); sByZ[z]=uniq(sByZ[z]); }
  const usedSpaceIds=uniq(taskSpaceRaw.map(valid).filter((n):n is number=>n!=null));
  const spaceIds=uniq([...keys((input as any).spaceNameById),...keys((input as any).spaceCapacityById),...keys((input as any).spaceConcurrencyById),...keys((input as any).spaceIsExclusiveById),...keys((input as any).spaceParentById),...keys((input as any).zoneIdBySpaceId),...Object.values(sByZ).flat(),...keys((input as any).spaceResourceAssignments),...keys((input as any).spaceResourceTypeRequirements),...usedSpaceIds]);
  const usedZoneIds=uniq(taskZoneRaw.map(valid).filter((n):n is number=>n!=null));
  const zoneIds=uniq([...vals((input as any).zoneIdBySpaceId),...keys((input as any).spaceIdsByZoneId),...keys((input as any).maxTemplateChangesByZoneId),...keys((input as any).zoneResourceAssignments),...keys((input as any).zoneResourceTypeRequirements),...arr((input as any).groupingZoneIds).map(valid).filter((n):n is number=>n!=null),...usedZoneIds]);
  const invalidResourceInventoryItems:unknown[]=[]; const resourceInventory=arr((input as any).planResourceItems).map((it:any)=>{ const pid=valid(it?.id), rid=valid(it?.resourceItemId); if(!pid||!rid){ invalidResourceInventoryItems.push(it); return null; } return {planResourceItemId:pid,resourceItemId:rid,typeId:toNum(it.typeId??it.resourceTypeId),isAvailable:it.isAvailable!==false&&it.available!==false,name:typeof it.name==="string"?it.name:null,readOnly:true}; }).filter(Boolean) as InitialConstructionResourceInventoryItem[];
  const planResourceItemById:Record<number,InitialConstructionResourceInventoryItem>={}; const byRid:Record<number,InitialConstructionResourceInventoryItem[]>={}; const avail:Record<number,number[]>={};
  for(const it of resourceInventory){ planResourceItemById[it.planResourceItemId]=it; (byRid[it.resourceItemId]??=[]).push(it); if(it.isAvailable)(avail[it.resourceItemId]??=[]).push(it.planResourceItemId); }
  for(const k of Object.keys(avail)) avail[Number(k)]=uniq(avail[Number(k)]);
  const badC=invalids(taskContestantRaw), badS=invalids(taskSpaceRaw), badZ=invalids(taskZoneRaw); if(badC.length) warnings.push("invalid_task_contestant_ids_ignored"); if(badS.length) warnings.push("invalid_task_space_ids_ignored"); if(badZ.length) warnings.push("invalid_task_zone_ids_ignored");
  const result={contestantIds:uniq([...contestantIdsFromAvailability,...contestantIdsFromTasks]),contestantIdsFromTasks,contestantIdsFromAvailability,productiveContestantIds,spaceIds,usedSpaceIds,unknownUsedSpaceIds:usedSpaceIds.filter(id=>!spaceIds.includes(id)),invalidTaskSpaceIds:badS,zoneIds,usedZoneIds,unknownUsedZoneIds:usedZoneIds.filter(id=>!zoneIds.includes(id)),invalidTaskZoneIds:badZ,zoneIdBySpaceId:zByS,spaceIdsByZoneId:sByZ,planResourceItemIds:uniq(resourceInventory.map(i=>i.planResourceItemId)),resourceItemIds:uniq(resourceInventory.map(i=>i.resourceItemId)),resourceInventory,planResourceItemById,planResourceItemsByResourceItemId:byRid,availablePlanResourceItemsByResourceItemId:avail,invalidTaskContestantIds:badC,invalidSpaceIdsIgnored:badS,invalidZoneIdsIgnored:badZ,invalidResourceInventoryItems,resourceInventoryItemCount:resourceInventory.length,resourceInventoryResourceItemCount:uniq(resourceInventory.map(i=>i.resourceItemId)).length,availableResourceInventoryItemCount:resourceInventory.filter(i=>i.isAvailable).length,unavailableResourceInventoryItemCount:resourceInventory.filter(i=>!i.isAvailable).length,duplicateResourceItemMappings:Object.entries(byRid).filter(([,v])=>v.length>1).map(([k])=>Number(k)).sort((a,b)=>a-b),warnings,readOnly:true as const};
  return deepFreeze(result) as InitialConstructionInputCatalog;
}
