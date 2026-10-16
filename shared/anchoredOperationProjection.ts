export interface AnchoredProjectionContract { id:string;anchorTaskId:number;beforeTaskIds:readonly number[];afterTaskIds:readonly number[] }
export interface AnchoredProjectionTask { id:number;startPlanned?:string|null;endPlanned?:string|null;spaceId?:number|null;assignedResources?:readonly number[];contestantId?:number|null;itinerantTeamId?:number|null }
const minute=(value:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
/** A projection, never an additional task/occupancy. Retains every technical ID. */
export function projectAnchoredOperations(contracts:readonly AnchoredProjectionContract[],tasks:readonly AnchoredProjectionTask[]){
 const byId=new Map(tasks.map(task=>[task.id,task]));
 return contracts.map(contract=>{
  const ids=[...contract.beforeTaskIds,contract.anchorTaskId,...contract.afterTaskIds];
  const members=ids.map(id=>byId.get(id));
  const intervals=members.map(task=>{const start=task?.startPlanned?minute(task.startPlanned):null,end=task?.endPlanned?minute(task.endPlanned):null;return start==null||end==null||end<=start?null:{start,end};});
  const complete=new Set(ids).size===ids.length&&members.every(Boolean)&&intervals.every(Boolean);
  const continuous=complete&&intervals.slice(1).every((interval,index)=>interval!.start===intervals[index]!.end);
  const anchorIndex=contract.beforeTaskIds.length,anchor=members[anchorIndex];
  const duration=continuous?intervals.at(-1)!.end-intervals[0]!.start:null;
  const teams=[...new Set(members.flatMap(task=>task?.itinerantTeamId==null?[]:[task.itinerantTeamId]))];
  return {...(teams.length===1?{itinerantTeamId:teams[0]}:{}),id:contract.id,logicalOperationCount:1 as const,technicalTaskIds:ids,anchorTaskId:contract.anchorTaskId,
   status:continuous?'CONTINUOUS' as const:complete?'INVALID_ADJACENCY' as const:'INCOMPLETE' as const,
   start:continuous?members[0]!.startPlanned:null,end:continuous?members.at(-1)!.endPlanned:null,durationMinutes:duration,
   participantId:anchor?.contestantId??null,resourceIds:[...new Set(members.flatMap(task=>task?.assignedResources??[]))].sort((a,b)=>a-b),
   anchorOccupation:intervals[anchorIndex]?{spaceId:anchor?.spaceId??null,start:anchor?.startPlanned,end:anchor?.endPlanned,durationMinutes:intervals[anchorIndex]!.end-intervals[anchorIndex]!.start}:null,
   additionalParticipantOccupation:false as const};
 });
}
