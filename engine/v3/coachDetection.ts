import type { EngineOutput, PlanResourceItemInput, TaskInput } from "../types";
import type { EngineV3Input } from "./types";

export interface CoachAssignmentInterval {
  taskId: number;
  start: number;
  end: number;
}

export interface CoachTaskGroup {
  coachId: number | null;
  coachName: string;
  taskIds: number[];
  intervals: CoachAssignmentInterval[];
}

type CoachResourceLike = Partial<PlanResourceItemInput> & {
  type?: unknown;
  typeCode?: unknown;
  typeName?: unknown;
  category?: unknown;
  resourceType?: unknown;
  resourceTypeCode?: unknown;
  resourceTypeName?: unknown;
  isCoach?: unknown;
};

const normalize = (value: unknown): string => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase();

const coachText = (value: unknown): boolean => /(^|[^a-z])(coach|vocal)([^a-z]|$)/.test(normalize(value));

export const isCoachResource = (resource: CoachResourceLike | null | undefined): boolean => {
  if (!resource) return false;
  if (resource.isCoach === true) return true;
  const structured = [
    resource.category,
    resource.type,
    resource.typeCode,
    resource.typeName,
    resource.resourceType,
    resource.resourceTypeCode,
    resource.resourceTypeName,
  ];
  if (structured.some(coachText)) return true;
  return coachText(resource.name);
};

const taskLooksCoachSpecific = (input: EngineV3Input, task: TaskInput | undefined): boolean => coachText([
  task?.templateName,
  task?.templateId ? input.taskTemplateNameById?.[Number(task.templateId)] : null,
].filter(Boolean).join(" "));

const minutes = (value: unknown): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const parsed = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(parsed) && Number(match[2]) < 60 ? parsed : null;
};

export const getCoachResourceIds = (input: EngineV3Input): Set<number> => {
  const explicit = new Set((input.coachResourceIds ?? []).map(Number).filter((id) => Number.isFinite(id) && id > 0));
  for (const resource of input.planResourceItems ?? []) {
    const id = Number(resource.id);
    if (Number.isFinite(id) && id > 0 && isCoachResource(resource)) explicit.add(id);
  }
  return explicit;
};

export const detectCoachAssignments = (input: EngineV3Input, output: EngineOutput): CoachTaskGroup[] => {
  const resources = new Map((input.planResourceItems ?? []).map((resource) => [Number(resource.id), resource]));
  const taskById = new Map((input.tasks ?? []).map((task) => [Number(task.id), task]));
  const coachIds = getCoachResourceIds(input);
  const grouped = new Map<number, CoachAssignmentInterval[]>();

  for (const planned of output.plannedTasks ?? []) {
    const taskId = Number(planned.taskId);
    const start = minutes(planned.startPlanned);
    const end = minutes(planned.endPlanned);
    if (!Number.isFinite(taskId) || start === null || end === null || end <= start) continue;
    const assigned = (planned.assignedResources ?? []).map(Number).filter((id) => Number.isFinite(id) && id > 0);
    const detected = assigned.filter((id) => coachIds.has(id));
    const inferred = detected.length
      ? detected
      : taskLooksCoachSpecific(input, taskById.get(taskId)) && assigned.length === 1 ? assigned : [];
    for (const coachId of inferred) {
      const bucket = grouped.get(coachId) ?? [];
      bucket.push({ taskId, start, end });
      grouped.set(coachId, bucket);
    }
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([coachId, intervals]) => ({
      coachId,
      coachName: String(resources.get(coachId)?.name ?? `Coach ${coachId}`),
      taskIds: [...new Set(intervals.map((interval) => interval.taskId))],
      intervals: intervals.sort((a, b) => a.start - b.start || a.end - b.end || a.taskId - b.taskId),
    }));
};

export const getCoachTaskGroups = detectCoachAssignments;
