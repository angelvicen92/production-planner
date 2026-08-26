import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";

export function canonicalResourceIds(task: Task): string[] {
  return [...new Set(Array.isArray(task.requiredResourceIds) ? task.requiredResourceIds : [])].sort();
}
export function jointGroupIds(tasks: Task[]): string[] {
  return [...new Set(tasks.map(t => t.jointGroupId).filter((id): id is string => typeof id === "string" && id.trim() !== ""))].sort();
}
export function jointGroupMembers(tasks: Task[], id: string): Task[] { return tasks.filter(t => t.jointGroupId === id).sort((a,b)=>a.id.localeCompare(b.id)); }
export function jointGroups(tasks: Task[]): Map<string, Task[]> { return new Map(jointGroupIds(tasks).map(id=>[id,jointGroupMembers(tasks,id)])); }
export function jointParticipants(tasks: Task[]): string[] { return [...new Set(tasks.map(t=>t.participantId))].sort(); }
export function jointResources(tasks: Task[]): string[] { return tasks[0] ? canonicalResourceIds(tasks[0]) : []; }
export function jointWorkItemKey(id: string): string { return `joint:${id}`; }
export function structurallyCompatibleJointGroup(tasks: Task[]): boolean {
  if (tasks.length < 2) return false;
  const first=tasks[0]!; const resources=canonicalResourceIds(first).join("\0");
  const groupId = first.jointGroupId;
  const taskIds = new Set(tasks.map(t => t.id));
  return typeof groupId === "string" && groupId.trim() !== ""
    && new Set(tasks.map(t => t.id)).size === tasks.length
    && tasks.every(t=>t.kind==="auxiliary" && t.jointGroupId===groupId && t.duration===first.duration && t.spaceId===first.spaceId && t.setupFamilyId===first.setupFamilyId && canonicalResourceIds(t).join("\0")===resources && t.coachId===undefined && Array.isArray(t.dependencies) && !t.dependencies.some(id => taskIds.has(id)))
    && jointParticipants(tasks).length===tasks.length;
}
export function sameJointOperation(a: Task,b: Task): boolean { return typeof a.jointGroupId==="string" && a.jointGroupId.trim()!=="" && a.jointGroupId===b.jointGroupId; }
export function synchronizedJointTasks(a: ScheduledTask,b: ScheduledTask): boolean { return sameJointOperation(a,b) && a.start===b.start && a.end===b.end && a.spaceId===b.spaceId && a.participantId!==b.participantId && canonicalResourceIds(a).join("\0")===canonicalResourceIds(b).join("\0"); }
export function scheduleJointGroup(tasks: Task[],start:number): ScheduledTask[] { return [...tasks].sort((a,b)=>a.id.localeCompare(b.id)).map(t=>({...t,start,end:start+t.duration})); }
export function canPlaceJointGroup(problem: PlannerNextProblem,tasks: Task[],start:number,placed:ScheduledTask[]): boolean {
  if (!structurallyCompatibleJointGroup(tasks)) return false;
  // Search order is not temporal order. `canPlaceTask` enforces precedence against whichever
  // endpoint is already scheduled, so an unscheduled predecessor must not make a joint anchor
  // impossible merely because this search phase happens to visit the joint work item first.
  return tasks.every(task=>canPlaceTask(problem,task,start,placed));
}
export function jointGroupStarts(problem:PlannerNextProblem,tasks:Task[],placed:ScheduledTask[],limit=Number.POSITIVE_INFINITY):number[]{
  const starts:number[]=[]; const duration=tasks[0]?.duration ?? 0;
  for(let start=problem.day.start;start+duration<=problem.day.end;start+=5) if(canPlaceJointGroup(problem,tasks,start,placed)){starts.push(start);if(starts.length>=limit)break;}
  return starts;
}
