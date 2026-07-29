import type { PlannerNextProblem, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, SetupPolicy, Window } from "./contracts";
import { contains, overlaps } from "./time";

export type TemporalOccupation = { id:string; start:number; end:number };
export const setupPreparationDuration = (policy:SetupPolicy|undefined, family:string):number|undefined => policy?.preparationMinutesByFamily?.[family];
export const requiresSetupPreparation = (policy:SetupPolicy|undefined, family:string):boolean => setupPreparationDuration(policy,family) !== undefined;
export const setupPreparationId = (spaceId:string,family:string,entryIndex=1):string => `setup-preparation:${spaceId}:${family}:${entryIndex}`;
export function createSetupPreparation(spaceId:string,setupFamilyId:string,entryIndex:number,duration:number,start:number):ScheduledSetupPreparation { return {id:setupPreparationId(spaceId,setupFamilyId,entryIndex),kind:"setup-preparation",spaceId,setupFamilyId,entryIndex,duration,start,end:start+duration}; }
export const sortSetupPreparations = (items:ScheduledSetupPreparation[]) => [...items].sort((a,b)=>a.start-b.start||a.end-b.end||a.id.localeCompare(b.id));
export const setupPreparationSequence = (items:ScheduledSetupPreparation[]) => sortSetupPreparations(items).map(x=>x.setupFamilyId);
export function setupPreparationMinutesBySpace(items:ScheduledSetupPreparation[]):Record<string,number>{const out:Record<string,number>={};for(const x of items)out[x.spaceId]=(out[x.spaceId]??0)+x.duration;return out;}
export function setupPreparationCounts(items:ScheduledSetupPreparation[]):Record<string,number>{const out:Record<string,number>={};for(const x of items){const k=`${x.spaceId}|${x.setupFamilyId}`;out[k]=(out[k]??0)+1;}return out;}
export function spaceOccupations(tasks:ScheduledTask[], preparations:ScheduledSetupPreparation[], spaceId:string, meals:ScheduledSpaceMeal[]=[]):TemporalOccupation[]{return [...tasks.filter(x=>x.spaceId===spaceId),...preparations.filter(x=>x.spaceId===spaceId),...meals.filter(x=>x.spaceId===spaceId)].sort((a,b)=>a.start-b.start||a.end-b.end||a.id.localeCompare(b.id));}
export const preparationWithinDay=(problem:Pick<PlannerNextProblem,"day">,p:ScheduledSetupPreparation)=>p.start>=problem.day.start&&p.end<=problem.day.end&&p.end-p.start===p.duration;
export const preparationWithinAvailability=(availability:Window[],p:ScheduledSetupPreparation)=>contains(availability,p.start,p.end);
export const preparationAvoidsMeal=(meal:Window,p:ScheduledSetupPreparation)=>!overlaps(meal,p);
export const preparationAvoidsOccupations=(p:ScheduledSetupPreparation,items:TemporalOccupation[])=>items.every(x=>x===p||!overlaps(p,x));
