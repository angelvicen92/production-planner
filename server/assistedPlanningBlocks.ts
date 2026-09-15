import { createHash } from "node:crypto";
import type { AssistedPlanningBlockV1, AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";
import { assertPlanningBlockTemporalOrder, reorderPlanningBlockTasks } from "../shared/assistedPlanningTaskOrdering";

export type PlanningBlockOperation =
  | { readonly kind: "CREATE_BLOCK"; readonly memberTaskIds: readonly number[] }
  | { readonly kind: "SPLIT_BLOCK"; readonly blockId: string; readonly splitAfter: number }
  | { readonly kind: "MERGE_BLOCKS"; readonly blockIds: readonly [string, string] }
  | { readonly kind: "REMOVE_BLOCK_GROUPING"; readonly blockId: string }
  | { readonly kind: "REORDER_BLOCK_MEMBERS"; readonly blockId: string; readonly memberTaskIds: readonly number[] }
  | { readonly kind: "MOVE_BLOCK"; readonly blockId: string; readonly deltaMinutes: number };

export interface PlanningBlockTaskAuthority {
  readonly id: number;
  readonly status: string;
  readonly templateId: number;
  readonly spaceId?: number | null;
}

const canonicalJson = (value: unknown): unknown => Array.isArray(value) ? value.map(canonicalJson) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonicalJson(item)])) : value;
const idFor = (members: readonly number[], scope: Readonly<Record<string, unknown>>) =>
  `block:${createHash("sha256").update(JSON.stringify({ members, scope:canonicalJson(scope) })).digest("hex").slice(0, 20)}`;
const canonicalString = (value: unknown) => JSON.stringify(canonicalJson(value));
const mergeProvenance = (left: Readonly<Record<string, unknown>>, right: Readonly<Record<string, unknown>>) => {
  if (canonicalString(left) === canonicalString(right)) return structuredClone(left);
  const sources = [left, right].flatMap(source => Array.isArray(source.sources) ? source.sources : [source]);
  const unique = new Map(sources.map(source => [canonicalString(source), canonicalJson(source)]));
  return { sources: [...unique.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, source]) => source) };
};

export function applyPlanningBlockOperation(
  snapshot: AssistedPlanningSnapshotV1,
  operation: PlanningBlockOperation,
  rows: readonly PlanningBlockTaskAuthority[],
  scopeProvenance: Readonly<Record<string, unknown>>,
): { snapshot: AssistedPlanningSnapshotV1; touchedTaskIds: number[] } {
  const authorities = new Map(rows.map((row) => [Number(row.id), row]));
  let blocks = structuredClone(snapshot.planningBlocks ?? []) as AssistedPlanningBlockV1[];
  let tasks = [...snapshot.tasks];
  const assertMembers = (ids: readonly number[]) => {
    if (ids.length < 2 || new Set(ids).size !== ids.length) throw new Error("INVALID_PLANNING_BLOCK_MEMBERS");
    const members = ids.map((id) => authorities.get(id));
    if (members.some((row) => !row) || members.some((row) => !["pending", "interrupted"].includes(row!.status))) throw new Error("IMMUTABLE_TASK");
    const first = members[0]!;
    if (members.some((row) => row!.templateId !== first.templateId || (row!.spaceId ?? null) !== (first.spaceId ?? null))) throw new Error("INCOMPATIBLE_PLANNING_BLOCKS");
    return first;
  };
  let touched: number[];
  if (operation.kind === "CREATE_BLOCK") {
    const selected = [...operation.memberTaskIds]; const authority = assertMembers(selected);
    const taskById = new Map(snapshot.tasks.map(task => [task.taskId, task]));
    if (selected.some(id => !taskById.get(id)?.startPlanned)) throw new Error("PLANNING_BLOCK_MEMBER_UNPLANNED");
    const members = selected.sort((left, right) => taskById.get(left)!.startPlanned!.localeCompare(taskById.get(right)!.startPlanned!) || left - right);
    if (blocks.some((block) => block.memberTaskIds.some((id) => members.includes(id)))) throw new Error("CONTRADICTORY_PLANNING_BLOCK_MEMBERSHIP");
    touched = members;
    blocks.push({ blockId: idFor(members, scopeProvenance), memberTaskIds: members, scopeProvenance: structuredClone(scopeProvenance), spaceId: authority.spaceId ?? null, activityTemplateId: authority.templateId, order: blocks.length });
  } else {
    const get = (id: string) => { const block = blocks.find((item) => item.blockId === id); if (!block) throw new Error("PLANNING_BLOCK_NOT_FOUND"); return block; };
    if (operation.kind === "SPLIT_BLOCK") {
      const block = get(operation.blockId); const at = operation.splitAfter;
      if (!Number.isInteger(at) || at < 1 || at > block.memberTaskIds.length - 1) throw new Error("INVALID_PLANNING_BLOCK_SPLIT");
      const left = block.memberTaskIds.slice(0, at), right = block.memberTaskIds.slice(at); touched = [...block.memberTaskIds];
      const replacements = [left, right].filter(memberTaskIds => memberTaskIds.length >= 2)
        .map(memberTaskIds => ({ ...block, blockId: idFor(memberTaskIds, block.scopeProvenance), memberTaskIds }));
      blocks.splice(blocks.indexOf(block), 1, ...replacements);
    } else if (operation.kind === "MERGE_BLOCKS") {
      if (operation.blockIds[0] === operation.blockIds[1]) throw new Error("INVALID_PLANNING_BLOCK_MERGE");
      const selected = operation.blockIds.map(get).sort((a, b) => a.order - b.order); touched = selected.flatMap((block) => [...block.memberTaskIds]);
      const authority = assertMembers(touched); const firstIndex = Math.min(...selected.map((block) => blocks.indexOf(block)));
      blocks = blocks.filter((block) => !operation.blockIds.includes(block.blockId));
      const scope = mergeProvenance(selected[0].scopeProvenance, selected[1].scopeProvenance);
      blocks.splice(firstIndex, 0, { blockId: idFor(touched, scope), memberTaskIds: touched, scopeProvenance: scope, spaceId: authority.spaceId ?? null, activityTemplateId: authority.templateId, order: firstIndex });
    } else if (operation.kind === "REMOVE_BLOCK_GROUPING") {
      const block = get(operation.blockId); touched = [...block.memberTaskIds]; blocks.splice(blocks.indexOf(block), 1);
    } else if (operation.kind === "REORDER_BLOCK_MEMBERS") {
      const block = get(operation.blockId); touched = [...block.memberTaskIds];
      tasks = reorderPlanningBlockTasks(snapshot, block, operation.memberTaskIds);
      blocks[blocks.indexOf(block)] = { ...block, memberTaskIds: [...operation.memberTaskIds] };
    } else {
      const block=get(operation.blockId); touched=[...block.memberTaskIds];
      if(!Number.isInteger(operation.deltaMinutes)) throw new Error("INVALID_PLANNING_BLOCK_MOVE");
      tasks=tasks.map(task=>{if(!touched.includes(task.taskId))return task;if(!task.startPlanned||!task.endPlanned)throw new Error("PLANNING_BLOCK_MEMBER_UNPLANNED");
        const move=(value:string)=>{const match=/^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);if(!match)throw new Error("INVALID_PLANNING_BLOCK_TIME");const minute=Number(match[1])*60+Number(match[2])+operation.deltaMinutes;if(minute<0||minute>=1440)throw new Error("PLANNING_BLOCK_OUTSIDE_DAY");return `${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;};
        return {...task,startPlanned:move(task.startPlanned),endPlanned:move(task.endPlanned)};});
    }
  }
  blocks = blocks.map((block, order) => ({ ...block, order }));
  const { planningBlocks: _discardedBlocks, ...blockless } = snapshot;
  const next: AssistedPlanningSnapshotV1 = blocks.length ? { ...blockless, tasks, planningBlocks: blocks } : { ...blockless, tasks };
  assertPlanningBlockTemporalOrder(next);
  return { snapshot: next, touchedTaskIds: [...new Set(touched)].sort((a, b) => a - b) };
}
