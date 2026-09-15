export function assistedSimpleDragEdit(task:{id:number|string;startPlanned:string|null;endPlanned:string|null},targetStart:number,startMin:number,endMin:number){
  const minute=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
  const time=(value:number)=>`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
  const currentStart=task.startPlanned?minute(task.startPlanned):targetStart;
  const currentEnd=task.endPlanned?minute(task.endPlanned):currentStart+30;
  const duration=Math.max(5,currentEnd-currentStart),start=Math.max(startMin,Math.min(endMin-duration,targetStart));
  return {nextEdits:{[Number(task.id)]:{start:time(start),end:time(start+duration)}},shiftedIds:[] as number[],clampedStart:start};
}
