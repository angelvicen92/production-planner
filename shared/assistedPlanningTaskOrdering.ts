import type { AssistedPlanningBlockV1, AssistedPlanningSnapshotV1, AssistedPlanningTaskSnapshotV1 } from "./assistedPlanningSnapshotContracts";

const minute = (value: string) => {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) throw new Error("INVALID_PLANNING_BLOCK_TIME");
  return Number(match[1]) * 60 + Number(match[2]);
};
const clock = (value: number) => {
  if (!Number.isInteger(value) || value < 0 || value >= 1440) throw new Error("PLANNING_BLOCK_OUTSIDE_DAY");
  return `${String(Math.floor(value / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`;
};

export function assertPlanningBlockTemporalOrder(snapshot: AssistedPlanningSnapshotV1): void {
  const tasks = new Map(snapshot.tasks.map(task => [task.taskId, task]));
  for (const block of snapshot.planningBlocks ?? []) {
    const planned = block.memberTaskIds.map(id => tasks.get(id));
    if (planned.some(task => !task?.startPlanned || !task.endPlanned)) continue;
    const temporal = [...planned as AssistedPlanningTaskSnapshotV1[]]
      .sort((left, right) => minute(left.startPlanned!) - minute(right.startPlanned!) || left.taskId - right.taskId)
      .map(task => task.taskId);
    if (temporal.some((id, index) => id !== block.memberTaskIds[index])) throw new Error("PLANNING_BLOCK_ORDER_CONFLICT");
  }
}

export function reorderPlanningBlockTasks(snapshot: AssistedPlanningSnapshotV1, block: AssistedPlanningBlockV1,
  memberTaskIds: readonly number[]): AssistedPlanningTaskSnapshotV1[] {
  if (memberTaskIds.length !== block.memberTaskIds.length || new Set(memberTaskIds).size !== memberTaskIds.length
    || block.memberTaskIds.some(id => !memberTaskIds.includes(id))) throw new Error("INVALID_PLANNING_BLOCK_REORDER");
  const byId = new Map(snapshot.tasks.map(task => [task.taskId, task]));
  const members = memberTaskIds.map(id => byId.get(id));
  if (members.some(task => !task?.startPlanned || !task.endPlanned)) throw new Error("PLANNING_BLOCK_MEMBER_UNPLANNED");
  let cursor = Math.min(...(members as AssistedPlanningTaskSnapshotV1[]).map(task => minute(task.startPlanned!)));
  const replacements = new Map<number, AssistedPlanningTaskSnapshotV1>();
  for (const task of members as AssistedPlanningTaskSnapshotV1[]) {
    const duration = minute(task.endPlanned!) - minute(task.startPlanned!);
    if (duration <= 0) throw new Error("INVALID_PLANNING_BLOCK_DURATION");
    replacements.set(task.taskId, { ...task, startPlanned: clock(cursor), endPlanned: clock(cursor + duration) });
    cursor += duration;
  }
  return snapshot.tasks.map(task => replacements.get(task.taskId) ?? task);
}
