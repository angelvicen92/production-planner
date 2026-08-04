import type { EngineInput, TaskInput, TimeWindow } from "../../types";
import type { ParticipantMealObligation, Window } from "../contracts";
import { engineTimeToMinute } from "./engineTime";

export function isFlexibleParticipantMealTask(input: EngineInput, task: TaskInput): boolean {
  return input.mealMode === "flexible_meal_window" && (task.operationalRole === "meal_break_placeholder"
    || task.breakKind === "participant_meal"
    || (input.mealTaskTemplateId != null && task.templateId === input.mealTaskTemplateId));
}

function intersect(windows: TimeWindow[]): Window | null {
  try {
    const start = Math.max(...windows.map((window) => engineTimeToMinute(window.start)));
    const end = Math.min(...windows.map((window) => engineTimeToMinute(window.end)));
    return start < end ? { start, end } : null;
  } catch { return null; }
}

export interface FlexibleParticipantMealTaskResolution {
  obligations: ParticipantMealObligation[];
  defects: Array<{ taskId: number; code: "MISSING_PARTICIPANT_MEAL_WINDOW" | "INVALID_PARTICIPANT_MEAL_DURATION" | "INVALID_PARTICIPANT_MEAL_CAPACITY" | "UNREPRESENTABLE_PARTICIPANT_MEAL_TASK" | "PROTECTED_PARTICIPANT_MEAL_WITHOUT_FIXED_INTERVAL"; details: Record<string, unknown> }>;
}

export function resolveFlexibleParticipantMealTasks(input: EngineInput): FlexibleParticipantMealTaskResolution {
  const obligations: ParticipantMealObligation[] = [], defects: FlexibleParticipantMealTaskResolution["defects"] = [];
  const mealTasks = input.tasks.filter((task) => task.status !== "cancelled" && isFlexibleParticipantMealTask(input, task)).sort((a,b)=>a.id-b.id);
  if (mealTasks.length && (!Number.isInteger(input.contestantMealMaxSimultaneous) || Number(input.contestantMealMaxSimultaneous) <= 0)) defects.push({ taskId: mealTasks[0]!.id, code: "INVALID_PARTICIPANT_MEAL_CAPACITY", details: { value: input.contestantMealMaxSimultaneous ?? null } });
  for (const task of mealTasks) {
    const duration = Number.isInteger(task.durationOverrideMin) && Number(task.durationOverrideMin) > 0 ? task.durationOverrideMin! : input.contestantMealDurationMinutes;
    if (!Number.isInteger(duration) || Number(duration) <= 0) { defects.push({ taskId: task.id, code: "INVALID_PARTICIPANT_MEAL_DURATION", details: { durationOverrideMin: task.durationOverrideMin ?? null, contestantMealDurationMinutes: input.contestantMealDurationMinutes ?? null } }); continue; }
    const availability = input.contestantAvailabilityById?.[task.contestantId!];
    const configuredWindow = input.mealWindow ?? (input.mealWindowStart != null && input.mealWindowEnd != null ? { start: input.mealWindowStart, end: input.mealWindowEnd } : undefined);
    const taskWindow = task.fixedWindowStart != null && task.fixedWindowEnd != null ? { start: task.fixedWindowStart, end: task.fixedWindowEnd } : undefined;
    if (!availability || !configuredWindow) { defects.push({ taskId: task.id, code: "MISSING_PARTICIPANT_MEAL_WINDOW", details: { participantAvailability: availability ?? null, mealWindow: configuredWindow ?? null } }); continue; }
    const window = intersect([input.workDay, availability, configuredWindow, ...(taskWindow ? [taskWindow] : [])]);
    if (!window || duration! > window.end-window.start) { defects.push({ taskId: task.id, code: "UNREPRESENTABLE_PARTICIPANT_MEAL_TASK", details: { participantId: task.contestantId ?? null, duration, window } }); continue; }
    let fixedInterval: Window | undefined;
    if (task.status === "done" || task.status === "in_progress") {
      const interval = task.startReal != null && task.endReal != null ? { start: task.startReal, end: task.endReal } : task.startPlanned != null && task.endPlanned != null ? { start: task.startPlanned, end: task.endPlanned } : null;
      if (!interval || (task.startReal == null) !== (task.endReal == null)) { defects.push({ taskId: task.id, code: "PROTECTED_PARTICIPANT_MEAL_WITHOUT_FIXED_INTERVAL", details: { hasCompleteInterval: false } }); continue; }
      fixedInterval = { start: engineTimeToMinute(interval.start), end: engineTimeToMinute(interval.end) };
      if (fixedInterval.end-fixedInterval.start !== duration || fixedInterval.start<window.start || fixedInterval.end>window.end) { defects.push({ taskId: task.id, code: "UNREPRESENTABLE_PARTICIPANT_MEAL_TASK", details: { fixedInterval, duration, window } }); continue; }
    }
    obligations.push({ id: `participant-meal:${task.id}`, sourceTaskId: `task:${task.id}`, participantId: `participant:${task.contestantId}`, duration: duration!, window, status: task.status as ParticipantMealObligation["status"], ...(fixedInterval ? { fixedInterval } : {}) });
  }
  return { obligations, defects };
}
