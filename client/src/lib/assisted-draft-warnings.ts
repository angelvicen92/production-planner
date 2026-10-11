export type AssistedDraftWarningKind = "AVAILABILITY"|"PARTICIPANT_OVERLAP"|"SPACE_OVERLAP"|"RESOURCE_OVERLAP"|"DIRECT_DEPENDENCY";
export interface AssistedDraftWarning { readonly kind: AssistedDraftWarningKind; readonly taskIds: readonly number[]; }
export interface AssistedWarningConfiguration {
  readonly taskOperations?: readonly {taskId:number;operationalRole?:string;jointGroupId?:string}[];
  readonly arrivalMaximumGroupSize?:number;
  readonly departureMaximumGroupSize?:number;
}

const minute=(value:string|null|undefined)=>{if(!value)return null;const match=/^(\d{2}):(\d{2})/.exec(value);return match?Number(match[1])*60+Number(match[2]):null;};
const overlaps=(a:any,b:any)=>{const as=minute(a.startPlanned),ae=minute(a.endPlanned),bs=minute(b.startPlanned),be=minute(b.endPlanned);return as!==null&&ae!==null&&bs!==null&&be!==null&&as<be&&bs<ae;};
const ids=(value:any):number[]=>Array.isArray(value)?value.map(Number).filter(Number.isFinite):[];

/** Fast, conservative feedback only. The authoritative validator remains server-side. */
export function collectAssistedDraftWarnings(tasks:readonly any[],workday?:{start?:string;end?:string},configuration?:AssistedWarningConfiguration|null):AssistedDraftWarning[]{
  const warnings:AssistedDraftWarning[]=[];
  const operations=new Map((configuration?.taskOperations??[]).map(operation=>[Number(operation.taskId),operation]));
  const synchronized=(a:any,b:any)=>{
    if(minute(a.startPlanned)!==minute(b.startPlanned)||minute(a.endPlanned)!==minute(b.endPlanned))return false;
    const left=operations.get(Number(a.id)),right=operations.get(Number(b.id));
    if(left?.jointGroupId&&left.jointGroupId===right?.jointGroupId)return true;
    const role=left?.operationalRole;
    if(!role||role!==right?.operationalRole||!['transport_arrival','transport_departure'].includes(role))return false;
    const maximum=role==='transport_arrival'?configuration?.arrivalMaximumGroupSize:configuration?.departureMaximumGroupSize;
    const count=tasks.filter(task=>operations.get(Number(task.id))?.operationalRole===role&&minute(task.startPlanned)===minute(a.startPlanned)&&minute(task.endPlanned)===minute(a.endPlanned)).length;
    return Number.isInteger(maximum)&&maximum!>0&&count<=maximum!;
  };
  for(const task of tasks){
    const start=minute(task.startPlanned),end=minute(task.endPlanned),dayStart=minute(workday?.start),dayEnd=minute(workday?.end);
    if(start!==null&&end!==null&&((dayStart!==null&&start<dayStart)||(dayEnd!==null&&end>dayEnd))) warnings.push({kind:"AVAILABILITY",taskIds:[Number(task.id)]});
    for(const dependency of ids(task.dependsOnTaskIds??task.dependencies)){const prior=tasks.find(row=>Number(row.id)===dependency);if(prior&&minute(prior.endPlanned)!>start!)warnings.push({kind:"DIRECT_DEPENDENCY",taskIds:[dependency,Number(task.id)]});}
  }
  for(let left=0;left<tasks.length;left++)for(let right=left+1;right<tasks.length;right++){
    const a=tasks[left],b=tasks[right];if(!overlaps(a,b)||synchronized(a,b))continue;
    const pair=[Number(a.id),Number(b.id)];
    if(a.spaceId!=null&&Number(a.spaceId)===Number(b.spaceId))warnings.push({kind:"SPACE_OVERLAP",taskIds:pair});
    if(a.contestantId!=null&&Number(a.contestantId)===Number(b.contestantId))warnings.push({kind:"PARTICIPANT_OVERLAP",taskIds:pair});
    const ar=ids(a.resourceIds??a.assignedResourceIds),br=new Set(ids(b.resourceIds??b.assignedResourceIds));
    if(ar.some(id=>br.has(id)))warnings.push({kind:"RESOURCE_OVERLAP",taskIds:pair});
  }
  return warnings;
}
