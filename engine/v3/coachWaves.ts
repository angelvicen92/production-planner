import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { getCoachResourceIds } from "./coachDetection";
import { toMinutes } from "./metrics";

export interface CoachWaveCandidate {
  coachOrder: number[];
  talentOrder: number[];
  output: EngineOutput;
}

type PlannedRow = {
  taskId: number;
  contestantId: number;
  coachId: number | null;
  start: number;
  end: number;
  role: string;
};

const normalize = (value: unknown): string => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase();

const taskLabel = (input: EngineV3Input, task: any): string => normalize([
  task?.templateName,
  task?.name,
  task?.templateId ? input.taskTemplateNameById?.[Number(task.templateId)] : null,
].filter(Boolean).join(" "));

const isTransportOrMeal = (input: EngineV3Input, task: any): boolean => (
  /(transport|traslado|llegada|salida|recogida|pickup|dropoff|comida|almuerzo|meal|lunch)/.test(taskLabel(input, task))
);

const fixedTaskIds = (input: EngineV3Input): Set<number> => {
  const fixed = new Set<number>();
  for (const task of input.tasks ?? []) {
    const taskId = Number((task as any).id ?? NaN);
    const status = String((task as any).status ?? "pending");
    if (Number.isFinite(taskId) && (status === "done" || status === "in_progress" || Boolean((task as any).isManualBlock))) fixed.add(taskId);
  }
  for (const lock of input.locks ?? []) {
    const taskId = Number((lock as any).taskId ?? NaN);
    const lockType = String((lock as any).lockType ?? "").toLowerCase();
    if (Number.isFinite(taskId) && (lockType === "time" || lockType === "full")) fixed.add(taskId);
  }
  return fixed;
};

const roleKey = (task: any, duration: number, coachTask: boolean): string => [
  Number(task?.zoneId ?? 0),
  Number(task?.spaceId ?? 0),
  duration,
  coachTask ? "coach" : "regular",
].join(":");

const buildRows = (input: EngineV3Input, output: EngineOutput): PlannedRow[] => {
  const taskById = new Map((input.tasks ?? []).map((task: any) => [Number(task.id), task]));
  const coachIds = getCoachResourceIds(input);
  const rawRows = (output.plannedTasks ?? [])
    .map((planned) => {
      const taskId = Number(planned.taskId);
      const task: any = taskById.get(taskId);
      const contestantId = Number(task?.contestantId ?? NaN);
      const start = toMinutes(planned.startPlanned);
      const end = toMinutes(planned.endPlanned);
      if (!task || !Number.isFinite(contestantId) || contestantId <= 0 || start === null || end === null || end <= start) return null;
      const coachId = (planned.assignedResources ?? []).map(Number).find((id) => coachIds.has(id)) ?? null;
      return { taskId, contestantId, coachId, start, end, baseRole: roleKey(task, end - start, coachId !== null) };
    })
    .filter((row): row is Omit<PlannedRow, "role"> & { baseRole: string } => row !== null)
    .sort((a, b) => a.start - b.start || a.taskId - b.taskId);
  const roleOrdinals = new Map<string, number>();
  return rawRows.map(({ baseRole, ...row }) => {
    const ordinalKey = `${row.contestantId}:${baseRole}`;
    const ordinal = roleOrdinals.get(ordinalKey) ?? 0;
    roleOrdinals.set(ordinalKey, ordinal + 1);
    return { ...row, role: `${baseRole}:${ordinal}` };
  });
};

/**
 * Builds at most two deterministic coach-wave permutations over existing talent slots.
 * No new times are invented: compatible talent bundles exchange their current slots, so
 * a continuous main-stage sequence remains continuous before hard validation.
 */
export const generateCoachWaveCandidates = (input: EngineV3Input, output: EngineOutput): CoachWaveCandidate[] => {
  const rows = buildRows(input, output);
  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  if (!Number.isFinite(mainZoneId)) return [];
  const taskById = new Map((input.tasks ?? []).map((task: any) => [Number(task.id), task]));
  const fixed = fixedTaskIds(input);

  const coachesByTalent = new Map<number, Set<number>>();
  for (const row of rows) {
    if (row.coachId === null) continue;
    const coaches = coachesByTalent.get(row.contestantId) ?? new Set<number>();
    coaches.add(row.coachId);
    coachesByTalent.set(row.contestantId, coaches);
  }
  const coachByTalent = new Map([...coachesByTalent.entries()]
    .filter(([, coaches]) => coaches.size === 1)
    .map(([talentId, coaches]) => [talentId, [...coaches][0]]));

  const mainTalentOrder = rows
    .filter((row) => Number((taskById.get(row.taskId) as any)?.zoneId ?? NaN) === mainZoneId)
    .map((row) => row.contestantId)
    .filter((talentId, index, all) => all.indexOf(talentId) === index && coachByTalent.has(talentId));
  const coachOrder = mainTalentOrder
    .map((talentId) => coachByTalent.get(talentId)!)
    .filter((coachId, index, all) => all.indexOf(coachId) === index);
  if (mainTalentOrder.length < 3 || coachOrder.length < 2) return [];

  const waveOrders = [coachOrder, [...coachOrder].reverse()]
    .filter((order, index, all) => all.findIndex((other) => other.join(",") === order.join(",")) === index)
    .slice(0, 2);
  const rowsByTalent = new Map<number, PlannedRow[]>();
  for (const row of rows) {
    const task: any = taskById.get(row.taskId);
    if (isTransportOrMeal(input, task)) continue;
    const bucket = rowsByTalent.get(row.contestantId) ?? [];
    bucket.push(row);
    rowsByTalent.set(row.contestantId, bucket);
  }

  const candidates: CoachWaveCandidate[] = [];
  for (const order of waveOrders) {
    const desiredTalentOrder = order.flatMap((coachId) => mainTalentOrder.filter((talentId) => coachByTalent.get(talentId) === coachId));
    if (desiredTalentOrder.every((talentId, index) => talentId === mainTalentOrder[index])) continue;
    const startsByTask = new Map<number, number>();
    let valid = true;
    for (let index = 0; index < mainTalentOrder.length && valid; index++) {
      const slotTalent = mainTalentOrder[index];
      const movingTalent = desiredTalentOrder[index];
      const slotRows = rowsByTalent.get(slotTalent) ?? [];
      const movingRows = rowsByTalent.get(movingTalent) ?? [];
      const slotByRole = new Map(slotRows.map((row) => [row.role, row]));
      if (slotRows.length !== movingRows.length || movingRows.some((row) => !slotByRole.has(row.role))) {
        valid = false;
        break;
      }
      for (const moving of movingRows) {
        const slot = slotByRole.get(moving.role)!;
        if (fixed.has(moving.taskId) && moving.start !== slot.start) {
          valid = false;
          break;
        }
        startsByTask.set(moving.taskId, slot.start);
      }
    }
    if (!valid || !startsByTask.size) continue;
    const plannedTasks = (output.plannedTasks ?? []).map((planned) => {
      const start = startsByTask.get(Number(planned.taskId));
      if (start === undefined) return { ...planned };
      const oldStart = toMinutes(planned.startPlanned);
      const oldEnd = toMinutes(planned.endPlanned);
      if (oldStart === null || oldEnd === null) return { ...planned };
      const duration = oldEnd - oldStart;
      const toHHMM = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      return { ...planned, startPlanned: toHHMM(start), endPlanned: toHHMM(start + duration) };
    });
    candidates.push({ coachOrder: order, talentOrder: desiredTalentOrder, output: { ...output, plannedTasks } });
  }
  return candidates;
};
