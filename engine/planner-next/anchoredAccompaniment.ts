import type { AnchoredAccompaniment, PlannerNextProblem, Task } from "./contracts";

export function anchoredAccompanimentPreflight(problem: PlannerNextProblem): string[] {
  const raw = problem.anchoredAccompaniments;
  if (raw === undefined) return Object.prototype.hasOwnProperty.call(problem,"anchoredClosures") ? ["INVALID_ANCHORED_ACCOMPANIMENT_CONTRACT"] : [];
  if (!Array.isArray(raw)) return ["ANCHORED_ACCOMPANIMENT_NOT_SUPPORTED","INVALID_ANCHORED_ACCOMPANIMENT_CONTRACT"].sort();
  if (raw.length === 0) return [];
  const reasons = new Set<string>(["ANCHORED_ACCOMPANIMENT_NOT_SUPPORTED"]);
  const tasks = new Map(problem.tasks.map(task => [task.id, task]));
  const resources = new Set(problem.resources.map(resource => resource.id));
  const spaces = new Set(problem.spaces.map(space => space.id));
  const ids = new Set<string>(), usedAnchors = new Set<string>(), usedSegments = new Set<string>();
  for (const value of raw) {
    const c = value as Partial<AnchoredAccompaniment>, id = typeof c.id === "string" ? c.id : "";
    let invalid = !id || ids.has(id) || !Array.isArray(c.beforeTaskIds) || !Array.isArray(c.afterTaskIds)
      || c.adjacency !== "REQUIRED" || c.internalTransition !== "INCLUDED" || c.resourceContinuity !== "REQUIRED";
    ids.add(id);
    const segments = [...(Array.isArray(c.beforeTaskIds) ? c.beforeTaskIds : []), ...(Array.isArray(c.afterTaskIds) ? c.afterTaskIds : [])];
    if (segments.length === 0) invalid = true;
    const anchor = tasks.get(c.anchorTaskId ?? "");
    if (!anchor) reasons.add(`ANCHORED_ACCOMPANIMENT_UNKNOWN_ANCHOR:${id}:${c.anchorTaskId ?? ""}`);
    else {
      if (usedAnchors.has(anchor.id)) reasons.add(`ANCHORED_ACCOMPANIMENT_TASK_REUSED:${anchor.id}`); usedAnchors.add(anchor.id);
      if (anchor.kind !== "main") reasons.add(`ANCHORED_ACCOMPANIMENT_UNSUPPORTED_ANCHOR_KIND:${id}:${anchor.kind}`);
      invalid ||= !validTaskReferences(anchor, resources, spaces);
    }
    const local = new Set<string>();
    for (const taskId of segments) {
      if (local.has(taskId)) reasons.add(`ANCHORED_ACCOMPANIMENT_DUPLICATE_TASK:${id}:${taskId}`); local.add(taskId);
      if (usedSegments.has(taskId)) reasons.add(`ANCHORED_ACCOMPANIMENT_TASK_REUSED:${taskId}`); usedSegments.add(taskId);
      if (taskId === c.anchorTaskId) reasons.add(`ANCHORED_ACCOMPANIMENT_NESTING_NOT_SUPPORTED:${id}`);
      const task = tasks.get(taskId);
      if (!task) reasons.add(`ANCHORED_ACCOMPANIMENT_UNKNOWN_SEGMENT:${id}:${taskId}`);
      else {
        if (task.kind !== "auxiliary") reasons.add(`ANCHORED_ACCOMPANIMENT_INVALID_SEGMENT_KIND:${id}:${taskId}`);
        if (anchor && task.participantId !== anchor.participantId) reasons.add(`ANCHORED_ACCOMPANIMENT_PARTICIPANT_MISMATCH:${id}:${taskId}`);
        invalid ||= !validTaskReferences(task, resources, spaces);
      }
    }
    if (anchor && usedSegments.has(anchor.id)) reasons.add(`ANCHORED_ACCOMPANIMENT_NESTING_NOT_SUPPORTED:${id}`);
    if (invalid) reasons.add(`ANCHORED_ACCOMPANIMENT_INVALID_CONTRACT:${id}`);
  }
  return [...reasons].sort();
}

function validTaskReferences(task: Task, resources: Set<string>, spaces: Set<string>): boolean {
  const ids = task.requiredResourceIds ?? [];
  return task.duration > 0 && spaces.has(task.spaceId) && new Set(ids).size === ids.length && ids.every(id => resources.has(id));
}
