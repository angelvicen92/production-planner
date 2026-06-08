import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { getCoachResourceIds } from "./coachDetection";
import { toMinutes } from "./metrics";

export type CoachWaveReason =
  | "coach_wave_candidates_generated"
  | "no_coaches_detected"
  | "not_enough_coach_groups"
  | "no_main_stage_sequence_detected"
  | "skipped_due_to_locks_or_executed"
  | "no_valid_wave_candidate";

export interface CoachWaveGenerationDiagnostics {
  orderingAttempted: boolean;
  reason: CoachWaveReason;
  rejectedReasons: Record<string, number>;
}

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

const dependencyIds = (task: any): number[] => {
  const raw = [
    ...(Array.isArray(task?.dependencyIds) ? task.dependencyIds : []),
    ...(Array.isArray(task?.dependsOnTaskIds) ? task.dependsOnTaskIds : []),
    task?.dependencyTaskId,
    task?.dependsOnTaskId,
  ];
  return [...new Set(raw.map(Number).filter(Number.isFinite))];
};

const isExplicitPreMainTask = (input: EngineV3Input, task: any): boolean => (
  /(vocal|coach|prep|pre[- ]?main|preparacion|ensayo)/.test(taskLabel(input, task))
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

const uniqueOrders = (orders: number[][]): number[][] => orders.filter((order, index, all) => (
  order.length > 0 && all.findIndex((other) => other.join(",") === order.join(",")) === index
));

const buildDesiredTalentOrders = (
  mainTalentOrder: number[],
  coachOrder: number[],
  coachByTalent: Map<number, number>,
): number[][] => {
  const talentsByCoach = new Map(coachOrder.map((coachId) => [
    coachId,
    mainTalentOrder.filter((talentId) => coachByTalent.get(talentId) === coachId),
  ]));
  const grouped = (order: number[], reverseWithinCoach = false) => order.flatMap((coachId) => {
    const talents = talentsByCoach.get(coachId) ?? [];
    return reverseWithinCoach ? [...talents].reverse() : talents;
  });
  const first = coachOrder[0];
  const second = coachOrder[1];
  const firstTalents = talentsByCoach.get(first) ?? [];
  const secondTalents = talentsByCoach.get(second) ?? [];
  const firstSplit = Math.ceil(firstTalents.length / 2);
  const secondSplit = Math.ceil(secondTalents.length / 2);
  const twoNaturalWaves = [
    ...firstTalents.slice(0, firstSplit),
    ...secondTalents.slice(0, secondSplit),
    ...firstTalents.slice(firstSplit),
    ...secondTalents.slice(secondSplit),
    ...coachOrder.slice(2).flatMap((coachId) => talentsByCoach.get(coachId) ?? []),
  ];

  return uniqueOrders([
    grouped(coachOrder),
    grouped([...coachOrder].reverse()),
    twoNaturalWaves,
    grouped(coachOrder, true),
  ]).filter((order) => order.length === mainTalentOrder.length).slice(0, 4);
};

const increment = (record: Record<string, number>, reason: string): void => {
  record[reason] = (record[reason] ?? 0) + 1;
};

/**
 * Builds up to four deterministic full-pipeline coach-wave permutations over existing
 * compatible slots. Vocal/pre-main, direct same-talent pipeline work and Plató 7 move
 * together; transport, meals, locks and executed work remain untouched. Reusing the
 * existing stage slots preserves durations and main-stage continuity before hard validation.
 */
export const generateCoachWaveCandidates = (
  input: EngineV3Input,
  output: EngineOutput,
  diagnostics?: CoachWaveGenerationDiagnostics,
): CoachWaveCandidate[] => {
  const report: CoachWaveGenerationDiagnostics = diagnostics ?? {
    orderingAttempted: false,
    reason: "no_valid_wave_candidate",
    rejectedReasons: {},
  };
  report.orderingAttempted = false;
  report.rejectedReasons = {};

  const rows = buildRows(input, output);
  const mainZoneId = Number(input.optimizerMainZoneId ?? NaN);
  const taskById = new Map((input.tasks ?? []).map((task: any) => [Number(task.id), task]));
  const fixed = fixedTaskIds(input);
  const coachesByTalent = new Map<number, Set<number>>();
  for (const row of rows) {
    if (row.coachId === null) continue;
    const coaches = coachesByTalent.get(row.contestantId) ?? new Set<number>();
    coaches.add(row.coachId);
    coachesByTalent.set(row.contestantId, coaches);
  }
  if (coachesByTalent.size === 0) {
    report.reason = "no_coaches_detected";
    return [];
  }
  const coachByTalent = new Map([...coachesByTalent.entries()]
    .filter(([, coaches]) => coaches.size === 1)
    .map(([talentId, coaches]) => [talentId, [...coaches][0]]));
  const uniqueCoachIds = new Set(coachByTalent.values());
  if (uniqueCoachIds.size < 2) {
    report.reason = "not_enough_coach_groups";
    return [];
  }
  if (!Number.isFinite(mainZoneId)) {
    report.reason = "no_main_stage_sequence_detected";
    return [];
  }

  const mainTalentOrder = rows
    .filter((row) => Number((taskById.get(row.taskId) as any)?.zoneId ?? NaN) === mainZoneId)
    .map((row) => row.contestantId)
    .filter((talentId, index, all) => all.indexOf(talentId) === index && coachByTalent.has(talentId));
  if (mainTalentOrder.length < 3) {
    report.reason = "no_main_stage_sequence_detected";
    return [];
  }
  const coachOrder = mainTalentOrder
    .map((talentId) => coachByTalent.get(talentId)!)
    .filter((coachId, index, all) => all.indexOf(coachId) === index);
  if (coachOrder.length < 2) {
    report.reason = "not_enough_coach_groups";
    return [];
  }

  report.orderingAttempted = true;
  const mainTaskIds = new Set(rows
    .filter((row) => Number((taskById.get(row.taskId) as any)?.zoneId ?? NaN) === mainZoneId)
    .map((row) => row.taskId));
  const movablePipelineIds = new Set(rows
    .filter((row) => row.coachId !== null || mainTaskIds.has(row.taskId) || isExplicitPreMainTask(input, taskById.get(row.taskId)))
    .map((row) => row.taskId));
  for (const task of input.tasks ?? []) {
    const taskId = Number((task as any).id ?? NaN);
    const relatedIds = dependencyIds(task);
    if (movablePipelineIds.has(taskId)) relatedIds.forEach((id) => movablePipelineIds.add(id));
    if (relatedIds.some((id) => movablePipelineIds.has(id)) && Number.isFinite(taskId)) movablePipelineIds.add(taskId);
  }
  const rowsByTalent = new Map<number, PlannedRow[]>();
  for (const row of rows) {
    const task: any = taskById.get(row.taskId);
    if (!movablePipelineIds.has(row.taskId) || isTransportOrMeal(input, task)) continue;
    const bucket = rowsByTalent.get(row.contestantId) ?? [];
    bucket.push(row);
    rowsByTalent.set(row.contestantId, bucket);
  }

  const candidates: CoachWaveCandidate[] = [];
  let blockedByFixed = false;
  for (const desiredTalentOrder of buildDesiredTalentOrders(mainTalentOrder, coachOrder, coachByTalent)) {
    if (desiredTalentOrder.every((talentId, index) => talentId === mainTalentOrder[index])) continue;
    const startsByTask = new Map<number, number>();
    let valid = true;
    for (let index = 0; index < mainTalentOrder.length && valid; index += 1) {
      const slotTalent = mainTalentOrder[index];
      const movingTalent = desiredTalentOrder[index];
      const slotRows = rowsByTalent.get(slotTalent) ?? [];
      const movingRows = rowsByTalent.get(movingTalent) ?? [];
      const slotByRole = new Map(slotRows.map((row) => [row.role, row]));
      if (slotRows.length !== movingRows.length || movingRows.some((row) => !slotByRole.has(row.role))) {
        increment(report.rejectedReasons, "incompatible_pipeline_shape");
        valid = false;
        break;
      }
      for (const moving of movingRows) {
        const slot = slotByRole.get(moving.role)!;
        if (fixed.has(moving.taskId) && moving.start !== slot.start) {
          blockedByFixed = true;
          increment(report.rejectedReasons, "skipped_due_to_locks_or_executed");
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
    const candidateCoachOrder = desiredTalentOrder
      .map((talentId) => coachByTalent.get(talentId)!)
      .filter((coachId, index, all) => all.indexOf(coachId) === index);
    candidates.push({ coachOrder: candidateCoachOrder, talentOrder: desiredTalentOrder, output: { ...output, plannedTasks } });
  }
  report.reason = candidates.length > 0
    ? "coach_wave_candidates_generated"
    : blockedByFixed ? "skipped_due_to_locks_or_executed" : "no_valid_wave_candidate";
  return candidates.slice(0, 4);
};
