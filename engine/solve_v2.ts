import type { EngineInput, EngineOutput } from "./types";

export type MainZoneGapReasonType =
  | "CONTESTANT_BUSY"
  | "RESOURCE_BUSY"
  | "LOCKED_TASK"
  | "IN_PROGRESS_OR_DONE"
  | "HARD_DEPENDENCY"
  | "TIME_WINDOW"
  | "OTHER";

export type MainZoneGap = {
  zoneId: number;
  spaceId: number;
  start: number;
  end: number;
  durationMin: number;
  prevTaskId: number | null;
  nextTaskId: number | null;
};

export type MainZoneGapReason = {
  type: MainZoneGapReasonType;
  blockingTaskId?: number;
  blockingTaskLabel?: string;
  blockingInterval?: { start: string; end: string };
  blockedMainZoneTaskId?: number;
  blockedInterval: { start: string; end: string };
  entity?: { kind: "contestant" | "resource" | "space"; id: number };
  humanMessage: string;
};

const DIRECTOR_MODE_KEEP_BUSY_THRESHOLD = 8;
const DIRECTOR_MODE_MAX_ATTEMPTS_PER_GAP = 50;
const DIRECTOR_MODE_MAX_GLOBAL_ATTEMPTS = 300;
const FEED_MAIN_UNLOCK_BONUS = 300_000;
const FEED_MAIN_SWITCH_PENALTY = 500_000;

function toMinutes(hhmm: string) {
  const value = String(hhmm ?? "").trim();
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time format for workDay/meal: ${value || "<empty>"}`);
  }

  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time format for workDay/meal: ${value}`);
  }

  return h * 60 + m;
}
function toHHMM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const rangesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

export function computeMainZoneGaps(params: {
  zoneId: number | null;
  plannedTasks: Array<{ taskId: number; startPlanned: string; endPlanned: string; assignedSpace?: number | null }>;
  taskById: Map<number, any>;
  getSpaceId: (task: any) => number | null;
  getZoneId: (task: any) => number | null;
  getZoneIdForSpace: (spaceId: number | null | undefined) => number | null;
}): MainZoneGap[] {
  const { zoneId, plannedTasks, taskById, getSpaceId, getZoneId, getZoneIdForSpace } = params;
  if (!zoneId) return [];

  const intervalsBySpace = new Map<number, Array<{ taskId: number; start: number; end: number }>>();
  for (const p of plannedTasks) {
    const taskId = Number(p.taskId);
    const task = taskById.get(taskId);
    if (!task) continue;
    const candidateSpaceId = Number(p?.assignedSpace ?? getSpaceId(task) ?? NaN);
    if (!Number.isFinite(candidateSpaceId) || candidateSpaceId <= 0) continue;
    const taskZoneId = Number(getZoneId(task) ?? getZoneIdForSpace(candidateSpaceId) ?? NaN);
    if (!Number.isFinite(taskZoneId) || taskZoneId !== Number(zoneId)) continue;
    const list = intervalsBySpace.get(candidateSpaceId) ?? [];
    list.push({
      taskId,
      start: toMinutes(String(p.startPlanned)),
      end: toMinutes(String(p.endPlanned)),
    });
    intervalsBySpace.set(candidateSpaceId, list);
  }

  const gaps: MainZoneGap[] = [];
  for (const [spaceId, intervals] of intervalsBySpace.entries()) {
    intervals.sort((a, b) => a.start - b.start || a.end - b.end || a.taskId - b.taskId);
    for (let i = 1; i < intervals.length; i++) {
      const prev = intervals[i - 1];
      const next = intervals[i];
      if (next.start <= prev.end) continue;
      gaps.push({
        zoneId: Number(zoneId),
        spaceId,
        start: prev.end,
        end: next.start,
        durationMin: next.start - prev.end,
        prevTaskId: prev.taskId,
        nextTaskId: next.taskId,
      });
    }
  }

  return gaps.sort((a, b) => a.start - b.start || a.end - b.end || a.spaceId - b.spaceId);
}

export function explainMainZoneGaps(params: {
  gaps: MainZoneGap[];
  plannedTasks: Array<{ taskId: number; startPlanned: string; endPlanned: string; assignedResources?: number[]; assignedSpace?: number | null }>;
  taskById: Map<number, any>;
  getContestantId: (task: any) => number | null;
  getSpaceId: (task: any) => number | null;
  lockedTaskIds: Set<number>;
  relocationAttemptsByTaskId?: Map<number, { attempted: boolean; succeeded: boolean }>;
}): MainZoneGapReason[] {
  const { gaps, plannedTasks, taskById, getContestantId, getSpaceId, lockedTaskIds, relocationAttemptsByTaskId } = params;
  const reasons: MainZoneGapReason[] = [];
  const plannedRows = plannedTasks.map((p) => ({
    p,
    task: taskById.get(Number(p.taskId)),
    start: toMinutes(String(p.startPlanned)),
    end: toMinutes(String(p.endPlanned)),
  }));

  const fmtTask = (task: any, taskId: number) => String(task?.templateName ?? task?.manualTitle ?? `Tarea #${taskId}`);
  const getTaskStatus = (task: any) => String(task?.status ?? "pending");
  const searchGrid = 5;
  const dayStart = plannedRows.reduce((min, row) => Math.min(min, row.start), Number.POSITIVE_INFINITY);
  const dayEnd = plannedRows.reduce((max, row) => Math.max(max, row.end), 0);
  const isInProgressOrDone = (task: any) => {
    const status = getTaskStatus(task);
    return status === "in_progress" || status === "done";
  };
  const isReplannableTask = (task: any, taskId: number) =>
    !isInProgressOrDone(task) && !lockedTaskIds.has(taskId) && !Boolean(task?.isManualBlock);

  const resolveTimeWindowStart = (task: any) => {
    const candidates = [task?.forcedStart, task?.earliestStart, task?.fixedWindowStart];
    for (const c of candidates) {
      if (typeof c === "string" && c.includes(":")) return toMinutes(c);
      if (Number.isFinite(Number(c))) return Number(c);
    }
    return null;
  };

  const resolveTimeWindowEnd = (task: any) => {
    const candidates = [task?.latestEnd, task?.fixedWindowEnd];
    for (const c of candidates) {
      if (typeof c === "string" && c.includes(":")) return toMinutes(c);
      if (Number.isFinite(Number(c))) return Number(c);
    }
    return null;
  };

  const isRelocationFeasible = (blockingRow: (typeof plannedRows)[number], candidateStart: number) => {
    const blockerTask = blockingRow.task;
    const duration = blockingRow.end - blockingRow.start;
    const candidateEnd = candidateStart + duration;
    const candidateTaskId = Number(blockingRow.p.taskId);
    const blockerContestantId = getContestantId(blockerTask);
    const blockerSpaceId = Number(blockingRow.p.assignedSpace ?? getSpaceId(blockerTask) ?? NaN);
    const blockerResources = Array.isArray(blockingRow.p.assignedResources)
      ? blockingRow.p.assignedResources.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
      : [];

    if (!Number.isFinite(candidateStart) || !Number.isFinite(candidateEnd) || candidateEnd <= candidateStart) return false;
    if (Number.isFinite(dayStart) && candidateStart < dayStart) return false;
    if (candidateEnd > dayEnd) return false;

    const depIds = Array.isArray(blockerTask?.dependsOnTaskIds)
      ? blockerTask.dependsOnTaskIds.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
      : [];
    const depsEnd = depIds.reduce((mx: number, depId: number) => {
      const dep = plannedRows.find((row) => Number(row.p.taskId) === depId);
      return dep ? Math.max(mx, dep.end) : mx;
    }, Number.NEGATIVE_INFINITY);
    if (Number.isFinite(depsEnd) && candidateStart < depsEnd) return false;

    const earliestStart = resolveTimeWindowStart(blockerTask);
    const latestEnd = resolveTimeWindowEnd(blockerTask);
    if (earliestStart !== null && candidateStart < earliestStart) return false;
    if (latestEnd !== null && candidateEnd > latestEnd) return false;

    for (const row of plannedRows) {
      const rowTaskId = Number(row.p.taskId);
      if (rowTaskId === candidateTaskId) continue;
      if (!rangesOverlap(candidateStart, candidateEnd, row.start, row.end)) continue;

      if (Number(getContestantId(row.task)) === Number(blockerContestantId)) return false;
      const rowSpaceId = Number(row.p.assignedSpace ?? getSpaceId(row.task) ?? NaN);
      if (Number.isFinite(blockerSpaceId) && rowSpaceId === blockerSpaceId) return false;
      const rowResources = Array.isArray(row.p.assignedResources)
        ? row.p.assignedResources.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
        : [];
      if (blockerResources.some((rid) => rowResources.includes(rid))) return false;
    }

    return true;
  };

  const canRelocateOutsideGap = (blockingRow: (typeof plannedRows)[number], gapStart: number, gapEnd: number) => {
    const duration = blockingRow.end - blockingRow.start;
    const searchStart = Math.max(Number.isFinite(dayStart) ? dayStart : 0, blockingRow.start - 120);
    const searchEnd = Math.min(dayEnd, blockingRow.end + 120);

    for (let candidate = Math.max(blockingRow.start + searchGrid, searchStart); candidate + duration <= searchEnd; candidate += searchGrid) {
      if (rangesOverlap(candidate, candidate + duration, gapStart, gapEnd)) continue;
      if (isRelocationFeasible(blockingRow, candidate)) return true;
    }

    for (let candidate = Math.min(blockingRow.start - searchGrid, searchEnd - duration); candidate >= searchStart; candidate -= searchGrid) {
      if (rangesOverlap(candidate, candidate + duration, gapStart, gapEnd)) continue;
      if (isRelocationFeasible(blockingRow, candidate)) return true;
    }

    return false;
  };

  for (const gap of gaps) {
    const nextTask = gap.nextTaskId ? taskById.get(Number(gap.nextTaskId)) : null;
    const nextTaskId = gap.nextTaskId ?? undefined;
    const blockedInterval = { start: toHHMM(gap.start), end: toHHMM(gap.end) };
    const nextTaskStatus = getTaskStatus(nextTask);

    if (nextTask && isInProgressOrDone(nextTask)) {
      reasons.push({
        type: "IN_PROGRESS_OR_DONE",
        blockedMainZoneTaskId: nextTaskId,
        blockedInterval,
        humanMessage: `Hueco ${blockedInterval.start}-${blockedInterval.end}: la tarea siguiente está ${nextTaskStatus} y no se puede mover.`,
      });
      continue;
    }

    if (nextTaskId && lockedTaskIds.has(Number(nextTaskId))) {
      reasons.push({
        type: "LOCKED_TASK",
        blockedMainZoneTaskId: nextTaskId,
        blockedInterval,
        humanMessage: `Hueco ${blockedInterval.start}-${blockedInterval.end}: la tarea siguiente está bloqueada (lock) y no se puede adelantar.`,
      });
      continue;
    }

    if (nextTask) {
      const earliestStart = resolveTimeWindowStart(nextTask);
      const latestEnd = resolveTimeWindowEnd(nextTask);
      if ((earliestStart !== null && earliestStart > gap.start) || (latestEnd !== null && latestEnd <= gap.start)) {
        reasons.push({
          type: "TIME_WINDOW",
          blockedMainZoneTaskId: nextTaskId,
          blockedInterval,
          humanMessage: `Hueco ${blockedInterval.start}-${blockedInterval.end}: la tarea siguiente tiene ventana horaria y no puede iniciar antes de ${toHHMM(Math.max(earliestStart ?? gap.end, gap.start))}.`,
        });
        continue;
      }
    }

    if (nextTask) {
      const depIds = Array.isArray(nextTask?.dependsOnTaskIds)
        ? nextTask.dependsOnTaskIds.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
        : [];
      const depBlocker = depIds
        .map((depId: number) => plannedRows.find((row) => Number(row.p.taskId) === depId))
        .find((row: any) => row && Number(row.end) > gap.start);
      if (depBlocker) {
        const depTaskId = Number(depBlocker.p.taskId);
        reasons.push({
          type: "HARD_DEPENDENCY",
          blockingTaskId: depTaskId,
          blockingTaskLabel: fmtTask(depBlocker.task, depTaskId),
          blockingInterval: { start: toHHMM(depBlocker.start), end: toHHMM(depBlocker.end) },
          blockedMainZoneTaskId: nextTaskId,
          blockedInterval,
          humanMessage: `Hueco ${blockedInterval.start}-${blockedInterval.end}: la dependencia ${fmtTask(depBlocker.task, depTaskId)} termina a las ${toHHMM(depBlocker.end)}.`,
        });
        continue;
      }
    }

    const contestantId = nextTask ? getContestantId(nextTask) : null;
    if (contestantId) {
      const blocker = plannedRows.find((row) => {
        if (!row.task) return false;
        if (Number(row.p.taskId) === Number(nextTaskId)) return false;
        return Number(getContestantId(row.task)) === Number(contestantId) && rangesOverlap(gap.start, gap.end, row.start, row.end);
      });
      if (blocker) {
        const blockingTaskId = Number(blocker.p.taskId);
        const blockingTask = blocker.task;
        const locked = lockedTaskIds.has(blockingTaskId);
        const status = String(blockingTask?.status ?? "pending");
        const replannable = isReplannableTask(blockingTask, blockingTaskId);
        const relocationAttempt = relocationAttemptsByTaskId?.get(blockingTaskId);
        const failedRelocation = replannable && (
          (relocationAttempt?.attempted && !relocationAttempt?.succeeded) ||
          (!relocationAttempt?.attempted && !canRelocateOutsideGap(blocker, gap.start, gap.end))
        );
        const contestantName = String(nextTask?.contestantName ?? "").trim() || String(blockingTask?.contestantName ?? "").trim();
        reasons.push({
          type: "CONTESTANT_BUSY",
          blockingTaskId,
          blockingTaskLabel: fmtTask(blockingTask, blockingTaskId),
          blockingInterval: { start: toHHMM(blocker.start), end: toHHMM(blocker.end) },
          blockedMainZoneTaskId: nextTaskId,
          blockedInterval,
          entity: { kind: "contestant", id: Number(contestantId) },
          humanMessage: `Hueco ${blockedInterval.start}-${blockedInterval.end}: ${contestantName ? `el concursante ${contestantName}` : "el concursante"} está ocupado en ${fmtTask(blockingTask, blockingTaskId)} (${toHHMM(blocker.start)}-${toHHMM(blocker.end)})${locked ? ' [locked]' : ''}${status === 'in_progress' || status === 'done' ? ` [${status}]` : ''}.${failedRelocation ? ' La tarea bloqueadora era replanificable, pero no se encontró recolocación sin romper HARD (dep/ventana/recursos/ocupación).' : ''}`,
        });
        continue;
      }
    }

    if (nextTaskId) {
      const nextRow = plannedRows.find((row) => Number(row.p.taskId) === Number(nextTaskId));
      const assignedResources = Array.isArray(nextRow?.p?.assignedResources)
        ? nextRow!.p.assignedResources.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
        : [];
      for (const resourceId of assignedResources) {
        const blocker = plannedRows.find((row) => {
          if (!row.task) return false;
          if (Number(row.p.taskId) === Number(nextTaskId)) return false;
          const rowResources = Array.isArray(row.p.assignedResources)
            ? row.p.assignedResources.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
            : [];
          return rowResources.includes(resourceId) && rangesOverlap(gap.start, gap.end, row.start, row.end);
        });
        if (blocker) {
          const blockingTaskId = Number(blocker.p.taskId);
          const blockingTask = blocker.task;
          const replannable = isReplannableTask(blockingTask, blockingTaskId);
          const relocationAttempt = relocationAttemptsByTaskId?.get(blockingTaskId);
          const failedRelocation = replannable && (
            (relocationAttempt?.attempted && !relocationAttempt?.succeeded) ||
            (!relocationAttempt?.attempted && !canRelocateOutsideGap(blocker, gap.start, gap.end))
          );
          reasons.push({
            type: "RESOURCE_BUSY",
            blockingTaskId,
            blockingTaskLabel: fmtTask(blockingTask, blockingTaskId),
            blockingInterval: { start: toHHMM(blocker.start), end: toHHMM(blocker.end) },
            blockedMainZoneTaskId: nextTaskId,
            blockedInterval,
            entity: { kind: "resource", id: resourceId },
            humanMessage: `Hueco ${blockedInterval.start}-${blockedInterval.end}: el recurso ${resourceId} está ocupado por ${fmtTask(blockingTask, blockingTaskId)} (${toHHMM(blocker.start)}-${toHHMM(blocker.end)}).${failedRelocation ? ' La tarea bloqueadora era replanificable, pero no se encontró recolocación sin romper HARD (dep/ventana/recursos/ocupación).' : ''}`,
          });
          break;
        }
      }
      if (reasons.length > 0 && reasons[reasons.length - 1]?.blockedMainZoneTaskId === nextTaskId && reasons[reasons.length - 1]?.type === "RESOURCE_BUSY") {
        continue;
      }
    }

    if (gap.spaceId) {
      reasons.push({
        type: "OTHER",
        blockedMainZoneTaskId: nextTaskId,
        blockedInterval,
        entity: { kind: "space", id: Number(gap.spaceId) },
        humanMessage: `Hueco ${blockedInterval.start}-${blockedInterval.end}: no se encontró un movimiento factible en el espacio ${gap.spaceId} sin violar restricciones HARD.`,
      });
      continue;
    }

    reasons.push({
      type: "OTHER",
      blockedMainZoneTaskId: nextTaskId,
      blockedInterval,
      humanMessage: `Hueco ${blockedInterval.start}-${blockedInterval.end}: no se encontró movimiento factible sin violar restricciones HARD.`,
    });
  }

  return reasons;
}

function generatePlanV2Single(input: EngineInput, options?: { mainStartGateMin?: number; mealStartMin?: number }): EngineOutput {
  const reasons: { code: string; message: string }[] = [];
  const unplanned: { taskId: number; reason: { code: string; message: string; taskId?: number; details?: any } }[] = [];

  const hardInfeasible = (hardReasons: any[] = []): EngineOutput => ({
    feasible: false,
    complete: false,
    hardFeasible: false,
    plannedTasks: [],
    warnings: [],
    unplanned: [],
    reasons: hardReasons as any,
  });


  if (!input?.planId)
    reasons.push({ code: "VALIDATION_ERROR", message: "Falta planId." });
  if (!input?.workDay?.start || !input?.workDay?.end)
    reasons.push({
      code: "VALIDATION_ERROR",
      message: "Falta horario_base del día.",
    });
  if (!input?.meal?.start || !input?.meal?.end)
    reasons.push({
      code: "VALIDATION_ERROR",
      message: "Falta bloque de comida del día.",
    });

  const tasks = input?.tasks || [];

  // ✅ Helpers robustos (soportan camelCase/snake_case y casos anidados)
  const toId = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const getContestantId = (task: any) =>
    toId(
      task?.contestantId ?? task?.contestant_id ?? task?.contestant?.id ?? null,
    );

  const getSpaceId = (task: any) =>
    toId(task?.spaceId ?? task?.space_id ?? task?.space?.id ?? null);

  const getZoneId = (task: any) =>
    toId(task?.zoneId ?? task?.zone_id ?? task?.zone?.id ?? null);

  // ✅ Mapa defensivo: spaceId -> zoneId (para heurísticas por plató)
  // (Lo derivamos de las tareas porque el input del motor no trae catálogo de espacios.)
  const spaceZoneById = new Map<number, number>();
  for (const t of tasks as any[]) {
    const sid = toId(t?.spaceId ?? t?.space_id ?? t?.space?.id ?? null);
    const zid = toId(t?.zoneId ?? t?.zone_id ?? t?.zone?.id ?? null);
    if (!sid || !zid) continue;
    if (!spaceZoneById.has(sid)) spaceZoneById.set(sid, zid);
  }

  const groupingZoneIdSet = new Set<number>(
    (Array.isArray((input as any)?.groupingZoneIds) ? (input as any).groupingZoneIds : [])
      .map((v: any) => Number(v))
      .filter((n: number) => Number.isFinite(n) && n > 0),
  );

  const isGroupingEnabledForZone = (zoneId: number | null | undefined) =>
    Number.isFinite(Number(zoneId)) && groupingZoneIdSet.has(Number(zoneId));

  const getZoneIdForSpace = (spaceId: number | null | undefined) => {
    const sid = Number(spaceId);
    if (spaceId === null || spaceId === undefined) return null;
    if (!Number.isFinite(sid) || sid <= 0) return null;
    const zid = spaceZoneById.get(sid);
    return Number.isFinite(Number(zid)) && Number(zid) > 0 ? Number(zid) : null;
  };

  // ✅ NUEVO: tareas que requieren configuración (no rompen el solve, se excluyen)
  const warnings: { code: string; message: string; taskId?: number; details?: any }[] = [];
  const excludedTaskIds = new Set<number>();

  const mealName = String((input as any)?.mealTaskTemplateName ?? "")
    .trim()
    .toLowerCase();
  const mealTemplateIdRaw = Number((input as any)?.mealTaskTemplateId ?? NaN);
  const mealTemplateId = Number.isFinite(mealTemplateIdRaw) && mealTemplateIdRaw > 0
    ? mealTemplateIdRaw
    : null;

  const taskDisplay = (task: any) => {
    const templateName = String(task?.templateName ?? "").trim();
    const contestantName = String(task?.contestantName ?? "").trim();
    const base = templateName ? `"${templateName}"` : `Tarea #${Number(task?.id ?? "") || "?"}`;
    return contestantName ? `${base} (${contestantName})` : base;
  };

  const spaceLabel = (task: any) => {
    const sid = Number(task?.spaceId ?? task?.space_id ?? NaN);
    if (!Number.isFinite(sid) || sid <= 0) return null;
    const byId = ((input as any)?.spaceNameById ?? {}) as Record<number, string>;
    const name = String(byId[sid] ?? "").trim();
    return name ? `"${name}"` : `Espacio #${sid}`;
  };

  const isMealTask = (task: any) => {
    const tplId = Number(task?.templateId ?? NaN);
    if (mealTemplateId && Number.isFinite(tplId) && tplId === mealTemplateId) {
      return true;
    }
    const taskTemplateName = String(task?.templateName ?? "")
      .trim()
      .toLowerCase();
    return mealName.length > 0 && taskTemplateName === mealName;
  };
  const arrivalTemplateName = String((input as any)?.arrivalTaskTemplateName ?? "").trim().toLowerCase();
  const departureTemplateName = String((input as any)?.departureTaskTemplateName ?? "").trim().toLowerCase();
  const vanCapacity = Math.max(0, Number((input as any)?.vanCapacity ?? 0));
  const arrivalGroupingTarget = Math.max(0, Number((input as any)?.arrivalGroupingTarget ?? 0));
  const departureGroupingTarget = Math.max(0, Number((input as any)?.departureGroupingTarget ?? 0));
  const arrivalDepartureWeight = Number((input as any)?.optimizerWeights?.arrivalDepartureGrouping ?? 0);
  const arrivalBatchingEnabled = Boolean(arrivalTemplateName && arrivalDepartureWeight > 0 && vanCapacity > 0 && arrivalGroupingTarget > 0);
  const departureBatchingEnabled = Boolean(departureTemplateName && arrivalDepartureWeight > 0 && vanCapacity > 0 && departureGroupingTarget > 0);

  const isArrivalTask = (task: any) => String(task?.templateName ?? "").trim().toLowerCase() === arrivalTemplateName;
  const isDepartureTask = (task: any) => String(task?.templateName ?? "").trim().toLowerCase() === departureTemplateName;

  const isProtectedWrapTask = (task: any) => {
    if (!task) return false;
    if (isArrivalTask(task) || isDepartureTask(task) || isMealTask(task)) return true;
    const breakKind = String(task?.breakKind ?? "").trim().toLowerCase();
    if (breakKind.length > 0) return true;
    const templateName = String(task?.templateName ?? "").trim().toLowerCase();
    return templateName === "break";
  };

  const isItinerantWrapTask = (task: any) => {
    if (!task) return false;
    const teamId = Number(task?.itinerantTeamId ?? 0);
    if (!Number.isFinite(teamId) || teamId <= 0) return false;
    if (Boolean(task?.isManualBlock)) return false;
    return !isProtectedWrapTask(task);
  };

  const getWrapExtraMin = (task: any) => {
    const raw = Number(task?.durationOverrideMin ?? task?.durationMin ?? 0);
    const base = Number.isFinite(raw) ? raw : 0;
    const minExtra = Math.max(10, Math.floor(base));
    const wrapGrid = 5;
    return Math.max(wrapGrid, Math.ceil(minExtra / wrapGrid) * wrapGrid);
  };

  const wrapInnerByTaskId = new Map<number, number>();

  const canAllowContestantWrapOverlap = (leftTask: any, rightTask: any) => {
    if (!leftTask || !rightTask) return false;
    if (Boolean(leftTask?.isManualBlock) || Boolean(rightTask?.isManualBlock)) return false;
    if (isProtectedWrapTask(leftTask) || isProtectedWrapTask(rightTask)) return false;

    const leftContestantId = getContestantId(leftTask);
    const rightContestantId = getContestantId(rightTask);
    const leftSpaceId = getSpaceId(leftTask);
    const rightSpaceId = getSpaceId(rightTask);
    const leftItinerantTeamId = Number(leftTask?.itinerantTeamId ?? 0);
    const rightItinerantTeamId = Number(rightTask?.itinerantTeamId ?? 0);

    if (!leftContestantId || !rightContestantId || !leftSpaceId || !rightSpaceId) return false;
    if (Number(leftContestantId) !== Number(rightContestantId)) return false;
    if (Number(leftSpaceId) !== Number(rightSpaceId)) return false;
    if (leftItinerantTeamId > 0 && rightItinerantTeamId > 0) return false;

    const leftId = Number(leftTask?.id ?? 0);
    const rightId = Number(rightTask?.id ?? 0);
    if (!Number.isFinite(leftId) || !Number.isFinite(rightId) || leftId <= 0 || rightId <= 0) return false;

    if (leftItinerantTeamId > 0) return wrapInnerByTaskId.get(leftId) === rightId;
    if (rightItinerantTeamId > 0) return wrapInnerByTaskId.get(rightId) === leftId;
    return false;
  };

  // 1) Falta zoneId (no puede heredar recursos por plató ni ubicarse correctamente)
  for (const task of tasks as any[]) {
    const id = Number(task?.id);
    const zid = getZoneId(task) ?? getZoneIdForSpace(getSpaceId(task));

    if (!Number.isFinite(id)) continue;

    // ✅ EXCEPCIÓN: tareas de comida/break no requieren siempre plató/zona
    if (isMealTask(task)) continue;
    if (task?.breakKind === "space_meal" && Number.isFinite(Number(task?.spaceId))) continue;
    if (task?.breakKind === "itinerant_meal" && Number.isFinite(Number(task?.itinerantTeamId))) continue;

    if (zid === null || zid === undefined || !Number.isFinite(Number(zid))) {
      excludedTaskIds.add(id);

      const spLabel = spaceLabel(task);
      warnings.push({
        code: "REQUIRES_CONFIGURATION",
        taskId: id,
        message:
          `Requiere configuración: ${taskDisplay(task)} no tiene plató/zona.` +
          (spLabel ? ` Espacio: ${spLabel}.` : "") +
          " Asigna un plató (zona) en la tarea o en su espacio.",
      });
    }
  }

  const getDepTaskIds = (task: any): number[] => {
    const arr: any[] = Array.isArray(task?.dependsOnTaskIds)
      ? task.dependsOnTaskIds
      : [];
    const legacy = task?.dependsOnTaskId ?? null;

    return Array.from(
      new Set(
        [...arr, ...(legacy ? [legacy] : [])]
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    );
  };

  const getDepTemplateIds = (task: any): number[] => {
    const arr: any[] = Array.isArray(task?.dependsOnTemplateIds)
      ? task.dependsOnTemplateIds
      : [];
    const legacy = task?.dependsOnTemplateId ?? null;

    return Array.from(
      new Set(
        [...arr, ...(legacy ? [legacy] : [])]
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    );
  };

  const taskById = new Map<number, any>();
  for (const t of tasks as any[]) taskById.set(Number(t?.id), t);

  const dependentsByTaskId = new Map<number, number[]>();
  for (const t of tasks as any[]) {
    const tId = Number(t?.id ?? NaN);
    if (!Number.isFinite(tId) || tId <= 0) continue;
    for (const depId of getDepTaskIds(t)) {
      const list = dependentsByTaskId.get(Number(depId)) ?? [];
      list.push(tId);
      dependentsByTaskId.set(Number(depId), list);
    }
  }
  const getDependents = (taskId: number) => dependentsByTaskId.get(Number(taskId)) ?? [];

  const templatesByContestant = new Map<number, Set<number>>();
  for (const t of tasks as any[]) {
    const cid = Number(t?.contestantId ?? t?.contestant_id ?? 0);
    const tplId = Number(t?.templateId ?? t?.template_id ?? 0);
    if (!Number.isFinite(cid) || cid <= 0) continue;
    if (!Number.isFinite(tplId) || tplId <= 0) continue;

    if (!templatesByContestant.has(cid)) {
      templatesByContestant.set(cid, new Set<number>());
    }
    templatesByContestant.get(cid)?.add(tplId);
  }

  // 2) Si una tarea depende de otra excluida, también se excluye (en cascada)
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks as any[]) {
      const id = Number(task?.id);
      if (!Number.isFinite(id) || excludedTaskIds.has(id)) continue;

      const depIds = getDepTaskIds(task);
      const blocking =
        depIds.find((d) => excludedTaskIds.has(Number(d))) ?? null;

      if (blocking) {
        excludedTaskIds.add(id);
        changed = true;

        const blockingTask = taskById.get(Number(blocking));
        warnings.push({
          code: "REQUIRES_CONFIGURATION",
          taskId: id,
          message:
            `Requiere configuración: ${taskDisplay(task)} depende de ${taskDisplay(blockingTask)}, ` +
            `pero ${taskDisplay(blockingTask)} está sin configuración (sin plató/zona) y se ha excluido.`,
        });
      }
    }
  }

  const nonMealTasksCount = (tasks as any[]).filter((t) => !isMealTask(t)).length;
  if (nonMealTasksCount > 0 && excludedTaskIds.size >= nonMealTasksCount) {
    warnings.push({
      code: "ALL_TASKS_EXCLUDED",
      message: "Todas las tareas quedaron excluidas (probablemente falta zona/espacio en tareas o espacios).",
      details: { excluded: excludedTaskIds.size, total: tasks.length },
    });
  }

  // Lista de tareas que sí entran al solve
  const tasksForSolve = (tasks as any[])
    .filter((t) => !excludedTaskIds.has(Number(t?.id)))
    .slice()
    .sort((a, b) => {
      const weightA = Number(a?.priority ?? a?.weight ?? 0);
      const weightB = Number(b?.priority ?? b?.weight ?? 0);
      const contestantA = Number(a?.contestantId ?? 0);
      const contestantB = Number(b?.contestantId ?? 0);
      const templateA = Number(a?.templateId ?? 0);
      const templateB = Number(b?.templateId ?? 0);
      const taskA = Number(a?.id ?? 0);
      const taskB = Number(b?.id ?? 0);

      if (weightB !== weightA) return weightB - weightA;
      if (contestantA !== contestantB) return contestantA - contestantB;
      if (templateA !== templateB) return templateA - templateB;
      return taskA - taskB;
    });

  // Validación de dependencias:
  // - Si la tarea pertenece a un concursante: solo exigimos orden para las plantillas
  //   que realmente existen en ese concursante (dependencias "soft").
  // - Si la tarea NO pertenece a un concursante: mantenemos validación estricta
  //   (todas las dependencias deben resolverse).
  const missingDeps: any[] = [];

  const tplNameById = ((input as any)?.taskTemplateNameById ?? {}) as Record<
    number,
    string
  >;
  const tplLabel = (tplId: number) => {
    const nm = tplNameById[tplId];
    return nm ? nm : `Template ${tplId}`;
  };

  const taskLabel = (t: any) => {
    const nm = String(t?.templateName ?? "").trim();
    if (nm) return nm;
    const tplId = Number(t?.templateId);
    if (Number.isFinite(tplId)) return tplLabel(tplId);
    return `Tarea ${String(t?.id ?? "")}`.trim();
  };

  for (const task of tasks as any[]) {
    const depTplIds = getDepTemplateIds(task);
    const depTaskIds = getDepTaskIds(task);

    if (!depTplIds.length) continue;

    const contestantId = Number(task?.contestantId ?? task?.contestant_id ?? 0);
    const existingTplIds = contestantId > 0
      ? (templatesByContestant.get(contestantId) ?? new Set<number>())
      : new Set<number>();

    // templates ya resueltos por tasks reales existentes
    const resolvedTplIds = new Set<number>();
    for (const depTaskId of depTaskIds) {
      const depTask = taskById.get(Number(depTaskId));
      const depTplId = Number(depTask?.templateId);
      if (Number.isFinite(depTplId)) resolvedTplIds.add(depTplId);
    }

    const missingTplIds =
      contestantId > 0
        ? depTplIds.filter(
            (tplId) =>
              existingTplIds.has(Number(tplId)) &&
              !resolvedTplIds.has(Number(tplId)),
          )
        : depTplIds.filter((tplId) => !resolvedTplIds.has(Number(tplId)));
    if (!missingTplIds.length) continue;

    const contestantName = String(task?.contestantName ?? "").trim();
    const who = contestantName
      ? `"${contestantName}"`
      : contestantId
        ? `concursante ${contestantId}`
        : "este concursante";

    const mainTaskName = taskLabel(task);

    // ✅ Un mensaje por prerequisito faltante (mucho más claro y accionable)
    for (const missingTplId of missingTplIds) {
      const missingTemplateId = Number(missingTplId);
      missingDeps.push({
        code: "DEPENDENCY_MISSING",
        taskId: Number(task?.id),

        // ✅ datos para que la UI pueda “autofijarlo”
        contestantId: contestantId || null,
        contestantName: contestantName || null,
        missingTemplateId,
        missingTemplateName: tplLabel(missingTemplateId),
        mainTemplateId: Number(task?.templateId ?? 0) || null,
        mainTaskName,

        message:
          `Para ${who} falta por declarar "${tplLabel(missingTemplateId)}" ` +
          `(prerrequisito de "${mainTaskName}").`,
      });
    }
  }

  if (missingDeps.length)
    return hardInfeasible(missingDeps);

  // ✅ Topological sort estable por dependsOnTaskId
  const originalOrder = new Map<number, number>();
  tasksForSolve.forEach((t: any, idx: number) =>
    originalOrder.set(Number(t.id), idx),
  );

  const indeg = new Map<number, number>();
  const outgoing = new Map<number, number[]>();

  for (const t of tasksForSolve as any[]) {
    const id = Number(t.id);
    indeg.set(id, 0);
    outgoing.set(id, []);
  }

  for (const t of tasksForSolve as any[]) {
    const id = Number(t.id);

    const depIds = getDepTaskIds(t);
    for (const depId of depIds) {
      // edge: depId -> id
      if (!outgoing.has(Number(depId))) continue; // defensivo (por si algo raro entra)
      outgoing.get(Number(depId))?.push(id);
      indeg.set(id, (indeg.get(id) ?? 0) + 1);
    }
  }

  const queue: number[] = [];
  for (const [id, d] of indeg.entries()) {
    if (d === 0) queue.push(id);
  }
  // estable: respeta orden original
  queue.sort(
    (a, b) => (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0),
  );

  const sortedIds: number[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    sortedIds.push(id);

    const outs = outgoing.get(id) ?? [];
    // estable también en salientes
    outs.sort(
      (a, b) => (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0),
    );

    for (const nxt of outs) {
      indeg.set(nxt, (indeg.get(nxt) ?? 0) - 1);
      if ((indeg.get(nxt) ?? 0) === 0) {
        queue.push(nxt);
        queue.sort(
          (a, b) => (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0),
        );
      }
    }
  }

  if (sortedIds.length !== tasksForSolve.length) {
    return hardInfeasible([
      {
        code: "DEPENDENCY_CYCLE",
        message:
          "Hay un ciclo de dependencias entre tareas (A depende de B y B depende de A, o cadena circular). Rompe el ciclo en Task Templates.",
      },
    ]);
  }

  const tasksSorted = sortedIds
    .map((id) => (tasksForSolve as any[]).find((t) => Number(t.id) === id))
    .filter(Boolean) as any[];
  const forcedStartByTaskId = new Map<number, number>();
  const forcedEndByTaskId = new Map<number, number>();
  const startDay = toMinutes(input.workDay.start);
  const endDay = toMinutes(input.workDay.end);
  const mainStartGateMin = Number.isFinite(Number(options?.mainStartGateMin)) ? Number(options?.mainStartGateMin) : startDay;
  const mealStartDefault = toMinutes(input.meal.start);
  const mealEnd = toMinutes(input.meal.end);
  const mealStart = Number.isFinite(Number(options?.mealStartMin))
    ? Math.max(mealStartDefault, Math.min(mealEnd, Math.ceil(Number(options?.mealStartMin) / 5) * 5))
    : mealStartDefault;
  const mainZoneIdForMealResetRaw = (input as any)?.optimizerMainZoneId ?? null;
  const mainZoneIdForMealReset = Number.isFinite(Number(mainZoneIdForMealResetRaw)) && Number(mainZoneIdForMealResetRaw) > 0
    ? Number(mainZoneIdForMealResetRaw)
    : null;
  let mainTemplateResetRequested = false;
  const availabilityByContestant = ((input as any)?.contestantAvailabilityById ?? {}) as Record<number, { start: string; end: string }>;

  const toAvailStart = (contestantId: number | null) => {
    if (!contestantId) return startDay;
    const av = availabilityByContestant[contestantId];
    return av?.start ? Math.max(startDay, toMinutes(av.start)) : startDay;
  };
  const toAvailEnd = (contestantId: number | null) => {
    if (!contestantId) return endDay;
    const av = availabilityByContestant[contestantId];
    return av?.end ? Math.min(endDay, toMinutes(av.end)) : endDay;
  };

  if (arrivalBatchingEnabled) {
    const target = Math.min(vanCapacity, arrivalGroupingTarget);
    const arrivals = tasksSorted
      .filter((t) => isArrivalTask(t) && String(t?.status ?? "pending") === "pending")
      .sort((a, b) => toAvailStart(getContestantId(a)) - toAvailStart(getContestantId(b)));
    for (let i = 0; i < arrivals.length; i += target) {
      const batch = arrivals.slice(i, i + target);
      if (!batch.length) continue;
      let commonStart = Math.ceil(Math.max(...batch.map((t) => toAvailStart(getContestantId(t)))) / 5) * 5;
      for (let step = 0; step < 48; step++) {
        const fits = batch.every((t) => {
          const dur = Math.max(5, Math.floor(Number(t.durationOverrideMin ?? 30)));
          return commonStart + dur <= toAvailEnd(getContestantId(t));
        });
        if (fits) break;
        commonStart += 5;
      }
      for (const t of batch) {
        forcedStartByTaskId.set(Number(t.id), commonStart);
      }
    }
  }

  if (departureBatchingEnabled) {
    const target = Math.min(vanCapacity, departureGroupingTarget);
    const departures = tasksSorted
      .filter((t) => isDepartureTask(t) && String(t?.status ?? "pending") === "pending")
      .sort((a, b) => toAvailEnd(getContestantId(b)) - toAvailEnd(getContestantId(a)));
    for (let i = 0; i < departures.length; i += target) {
      const batch = departures.slice(i, i + target);
      if (!batch.length) continue;
      const commonEnd = Math.floor(Math.min(...batch.map((t) => toAvailEnd(getContestantId(t)))) / 5) * 5;
      for (const t of batch) {
        forcedEndByTaskId.set(Number(t.id), commonEnd);
      }
    }
  }
  if (!Array.isArray(tasksForSolve) || tasksForSolve.length === 0) {
    reasons.push({
      code: "VALIDATION_ERROR",
      message: warnings.length
        ? "No hay tareas planificables (todas requieren configuración)."
        : "No hay tareas para planificar.",
    });
  }

  if (reasons.length) return hardInfeasible(reasons);

  // ✅ Disponibilidad por concursante: usar la ventana más restrictiva (plan ∩ concursante)
  const contestantAvailabilityById = ((input as any)
    ?.contestantAvailabilityById ?? {}) as Record<
    number,
    { start: string; end: string }
  >;

  const getContestantEffectiveWindow = (contestantId: number | null) => {
    if (!contestantId) return null;
    const raw = contestantAvailabilityById[Number(contestantId)] ?? null;
    if (!raw?.start || !raw?.end) return null;

    const cs = toMinutes(String(raw.start));
    const ce = toMinutes(String(raw.end));

    if (!Number.isFinite(cs) || !Number.isFinite(ce)) return null;

    const start = Math.max(startDay, cs);
    const end = Math.min(endDay, ce);

    return { start, end };
  };

  const contestantMealDuration = Number.isFinite(
    Number((input as any)?.contestantMealDurationMinutes),
  )
    ? Math.max(
        5,
        Math.floor(Number((input as any)?.contestantMealDurationMinutes)),
      )
    : 75;

  const contestantMealMaxSim = Number.isFinite(
    Number((input as any)?.contestantMealMaxSimultaneous),
  )
    ? Math.max(
        1,
        Math.floor(Number((input as any)?.contestantMealMaxSimultaneous)),
      )
    : 10;

  const GRID = 5;
  const snapUp = (m: number) => Math.ceil(m / GRID) * GRID;

  const zoneResourceAssignments = (input as any)?.zoneResourceAssignments ?? {};
  const spaceResourceAssignments =
    (input as any)?.spaceResourceAssignments ?? {};

  type Interval = { start: number; end: number; taskId?: number };

  const addIntervalSorted = (arr: Interval[], it: Interval) => {
    arr.push(it);
    arr.sort((a, b) => a.start - b.start);
  };

  const findEarliestGap = (
    arr: Interval[],
    earliest: number,
    duration: number,
  ) => {
    let t = earliest;
    for (const it of arr) {
      if (t + duration <= it.start) return t;
      if (t < it.end) t = it.end;
    }
    return t;
  };

  const findEarliestGapAllowingOverlap = (
    arr: Interval[],
    earliest: number,
    duration: number,
    allowOverlap: (intervalTaskId: number) => boolean,
  ) => {
    let t = earliest;
    const allowedOverlaps = new Set<number>();
    for (const it of arr) {
      if (t + duration <= it.start) return t;
      if (t < it.end) {
        const intervalTaskId = Number(it?.taskId ?? NaN);
        if (
          Number.isFinite(intervalTaskId) &&
          intervalTaskId > 0 &&
          allowOverlap(intervalTaskId)
        ) {
          allowedOverlaps.add(intervalTaskId);
          if (allowedOverlaps.size <= 1) continue;
        }

        t = it.end;
        allowedOverlaps.clear();
      }
    }
    return t;
  };


  const occupiedByContestant = new Map<number, Interval[]>();
  const occupiedBySpace = new Map<number, Interval[]>();
  const occupiedByResource = new Map<number, Interval[]>();
  const occupiedByZoneMeal = new Map<number, Interval[]>(); // bloqueos de “comida plató”
  const occupiedByItinerant = new Map<number, Interval[]>();
  const lastZoneByContestant = new Map<number, number>();
  const lastEndByZone = new Map<number, number>();
  const lastEndByContestant = new Map<number, number>();
  const firstStartByContestant = new Map<number, number>();
  const mealIntervals: Interval[] = []; // solo comidas de concursantes (para max simultáneo)
  let fixedMealCount = 0;
  let fixedMealMinutesInWindow = 0;

  const fixedEndByTaskId = new Map<number, number>();

  // ✅ Locks que fijan TIEMPO (para que el solver NO planifique encima)
  const lockedTaskIds = new Set<number>();
  for (const l of ((input as any)?.locks ?? []) as any[]) {
    const taskId = Number(l?.taskId);
    if (!Number.isFinite(taskId) || taskId <= 0) continue;

    const lt = String(l?.lockType ?? "").toLowerCase();
    if (lt !== "time" && lt !== "full") continue;

    const ls = l?.lockedStart ?? null;
    const le = l?.lockedEnd ?? null;
    if (ls && le) lockedTaskIds.add(taskId);
  }

  // Pre-cargar ocupación de tareas ya en curso/terminadas (inmovibles)
  for (const task of tasks as any[]) {
    const status = String(task?.status ?? "pending");
    const sp = task?.startPlanned ?? null;
    const ep = task?.endPlanned ?? null;
    if (!sp || !ep) continue;

    const isFixed =
      status === "in_progress" ||
      status === "done" ||
      lockedTaskIds.has(Number(task?.id)) ||
      Boolean(task?.isManualBlock);

    if (!isFixed) continue;

    const s = toMinutes(sp);
    const e = toMinutes(ep);
    if (!(Number.isFinite(s) && Number.isFinite(e) && e > s)) continue;

    fixedEndByTaskId.set(Number(task.id), e);

    const contestantId = Number(task?.contestantId ?? 0);
    if (contestantId) {
      const arr = occupiedByContestant.get(contestantId) ?? [];
      addIntervalSorted(arr, { start: s, end: e, taskId: Number(task.id) });
      occupiedByContestant.set(contestantId, arr);

      const firstStart = firstStartByContestant.get(contestantId);
      if (firstStart == null || s < firstStart) firstStartByContestant.set(contestantId, s);
      const lastEnd = lastEndByContestant.get(contestantId);
      if (lastEnd == null || e > lastEnd) lastEndByContestant.set(contestantId, e);

      if (isMealTask(task)) {
        addIntervalSorted(mealIntervals, { start: s, end: e, taskId: Number(task.id) });
        fixedMealCount++;
        const overlapStart = Math.max(s, mealStart);
        const overlapEnd = Math.min(e, mealEnd);
        if (overlapEnd > overlapStart) {
          fixedMealMinutesInWindow += overlapEnd - overlapStart;
        }
      }
    }

    const spaceId = Number(task?.spaceId ?? 0);
    if (spaceId) {
      const arr = occupiedBySpace.get(spaceId) ?? [];
      addIntervalSorted(arr, { start: s, end: e, taskId: Number(task.id) });
      occupiedBySpace.set(spaceId, arr);
    }

    const zoneId = Number(task?.zoneId ?? 0);
    if (contestantId && zoneId) lastZoneByContestant.set(contestantId, zoneId);

    const itinerantTeamId = Number(task?.itinerantTeamId ?? 0);
    if (itinerantTeamId) {
      const arr = occupiedByItinerant.get(itinerantTeamId) ?? [];
      addIntervalSorted(arr, { start: s, end: e, taskId: Number(task.id) });
      occupiedByItinerant.set(itinerantTeamId, arr);
    }

    const assigned =
      (task as any)?.assignedResources ??
      (task as any)?.assignedResourceIds ??
      [];
    if (Array.isArray(assigned)) {
      for (const pidAny of assigned) {
        const pid = Number(pidAny);
        if (!Number.isFinite(pid) || pid <= 0) continue;
        const arr = occupiedByResource.get(pid) ?? [];
        addIntervalSorted(arr, { start: s, end: e, taskId: Number(task.id) });
        occupiedByResource.set(pid, arr);
      }
    }
  }

  const planResourceItems = Array.isArray((input as any)?.planResourceItems)
    ? ((input as any).planResourceItems as any[])
    : [];

  const componentsMap = ((input as any)?.resourceItemComponents ??
    {}) as Record<
    number,
    Array<{ componentResourceItemId: number; quantity: number }>
  >;

  const priById = new Map<number, any>();
  const planIdsByResourceItemId = new Map<number, number[]>();
  const planIdsByTypeId = new Map<number, number[]>();

  for (const r of planResourceItems) {
    const id = Number(r?.id);

    // ✅ Puede ser null en recursos "solo del plan" → lo tratamos como 0
    const resourceItemIdRaw = (r as any)?.resourceItemId ?? null;
    const resourceItemId =
      resourceItemIdRaw === null || resourceItemIdRaw === undefined
        ? 0
        : Number(resourceItemIdRaw);

    const typeId = Number(r?.typeId);

    if (!Number.isFinite(id) || id <= 0) continue;

    // ✅ Permitimos resourceItemId 0 (plan-only). Solo descartamos NaN.
    if (!Number.isFinite(resourceItemId)) continue;

    if (!Number.isFinite(typeId) || typeId <= 0) continue;

    const row = {
      id,
      resourceItemId,
      typeId,
      name: String(r?.name ?? ""),
      isAvailable: r?.isAvailable !== false,
    };
    priById.set(id, row);

    // Solo indexamos por resourceItemId si existe (global / >0)
    if (resourceItemId > 0) {
      if (!planIdsByResourceItemId.has(resourceItemId))
        planIdsByResourceItemId.set(resourceItemId, []);
      planIdsByResourceItemId.get(resourceItemId)!.push(id);
    }

    // ✅ Siempre indexamos por tipo (esto permite byType + pools de espacio/zona)
    if (!planIdsByTypeId.has(typeId)) planIdsByTypeId.set(typeId, []);
    planIdsByTypeId.get(typeId)!.push(id);
  }

  const countAvailable = (planIds: number[]) =>
    planIds.filter((id) => priById.get(id)?.isAvailable !== false).length;

  const pickAvailableDistinct = (
    planIds: number[],
    need: number,
    alreadyPicked: Set<number>,
  ) => {
    const picked: number[] = [];
    for (const id of planIds) {
      if (picked.length >= need) break;
      if (alreadyPicked.has(id)) continue;
      const row = priById.get(id);
      if (!row) continue;
      if (row.isAvailable === false) continue;
      alreadyPicked.add(id);
      picked.push(id);
    }
    return picked;
  };

  const spaceParentById = ((input as any)?.spaceParentById ?? {}) as Record<
    number,
    number | null
  >;

  const getSpacePool = (spaceId: any): number[] => {
    let sid = Number(spaceId);
    if (!Number.isFinite(sid) || sid <= 0) return [];

    const visited = new Set<number>();

    // Herencia: espacio -> padre -> ... (si ninguno tiene pool, devuelve [])
    while (Number.isFinite(sid) && sid > 0) {
      if (visited.has(sid)) break; // evita loops raros
      visited.add(sid);

      const arr = spaceResourceAssignments[sid];
      if (Array.isArray(arr) && arr.length > 0) return arr;

      const parent = spaceParentById[sid];
      const next =
        parent === null || parent === undefined ? null : Number(parent);
      if (next === null || !Number.isFinite(next) || next <= 0) break;

      sid = Number(next);
    }

    return [];
  };

  // Si la tarea requiere un recurso compuesto (tiene componentes),
  // NO debe usar el pool del espacio (regla Reality / compuestos).
  const shouldIgnoreSpacePool = (task: any) => {
    const rr = task?.resourceRequirements ?? null;
    if (!rr) return false;

    const byItem =
      rr?.byItem && typeof rr.byItem === "object" ? rr.byItem : null;
    if (byItem) {
      for (const [ridStr] of Object.entries(byItem)) {
        const rid = Number(ridStr);
        if (
          Number.isFinite(rid) &&
          rid > 0 &&
          (componentsMap[rid]?.length ?? 0) > 0
        )
          return true;
      }
    }

    const anyOf = Array.isArray(rr?.anyOf) ? rr.anyOf : [];
    for (const g of anyOf) {
      const ids = Array.isArray(g?.resourceItemIds) ? g.resourceItemIds : [];
      for (const ridAny of ids) {
        const rid = Number(ridAny);
        if (
          Number.isFinite(rid) &&
          rid > 0 &&
          (componentsMap[rid]?.length ?? 0) > 0
        )
          return true;
      }
    }

    return false;
  };

  const concatPreferSpace = (spacePool: number[], globalPool: number[]) => {
    // Evita duplicados manteniendo preferencia por spacePool
    const seen = new Set<number>();
    const out: number[] = [];
    for (const id of spacePool) {
      const n = Number(id);
      if (!Number.isFinite(n)) continue;
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    for (const id of globalPool) {
      const n = Number(id);
      if (!Number.isFinite(n)) continue;
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  };

  const plannedTasks: Array<{
    taskId: number;
    startPlanned: string;
    endPlanned: string;
    assignedSpace?: number | null;
    assignedResources: number[];
  }> = [];

  const plannedEndByTaskId = new Map<number, number>();

  const isResourceBreakTask = (task: any) =>
    task?.breakKind === "space_meal" || task?.breakKind === "itinerant_meal";

  const getZoneIdForTask = (task: any) => {
    const zidRaw = task?.zoneId ?? null;
    if (Number.isFinite(Number(zidRaw))) return Number(zidRaw);

    const sidRaw = task?.spaceId ?? null;
    const sid = Number(sidRaw);
    if (!Number.isFinite(sid) || sid <= 0) return null;

    // fallback: si hay spaceId pero no zoneId, intentamos inferir mirando spacesParentById (no da zone)
    // En este motor, si no viene zoneId, ya lo tratáis como “requiere configuración”.
    return null;
  };

  const depsEnd = (task: any) => {
    const depIds = getDepTaskIds(task);
    let mx = startDay;
    for (const depId of depIds) {
      const e =
        plannedEndByTaskId.get(Number(depId)) ??
        fixedEndByTaskId.get(Number(depId)) ??
        null;
      if (e !== null && e !== undefined && Number.isFinite(Number(e))) {
        mx = Math.max(mx, Number(e));
      }
    }
    return mx;
  };

  // 1) Comidas de plató: tareas “comida” SIN concursante -> bloquean la zona (plato)
  // Se colocan al principio de la ventana global por defecto (y se apilan si hay varias en el mismo plató).
  for (const task of tasksSorted as any[]) {
    if (!isMealTask(task)) continue;
    const contestantId = getContestantId(task);
    if (contestantId) continue; // esta es comida de concursante (se programa luego)

    const zid = getZoneIdForTask(task);
    if (!zid) {
      // Si no tiene zoneId, lo dejamos como warning de “requiere configuración” (ya lo hacéis arriba)
      continue;
    }

    const duration = contestantMealDuration;
    const zoneArr = occupiedByZoneMeal.get(zid) ?? [];

    let start = snapUp(mealStart);
    // encajar sin solaparse con otro bloque de comida del mismo plató
    start = findEarliestGap(zoneArr, start, duration);
    if (start + duration > mealEnd) {
      return hardInfeasible([
        {
          code: "MEAL_ZONE_NO_FIT",
          message: `No cabe la comida del plató (zona ${zid}) dentro de la ventana global de comida (${toHHMM(mealStart)}–${toHHMM(mealEnd)}).`,
          taskId: Number(task?.id),
        },
      ]);
    }

    const finish = start + duration;

    addIntervalSorted(zoneArr, { start, end: finish, taskId: Number(task.id) });
    occupiedByZoneMeal.set(zid, zoneArr);

    plannedTasks.push({
      taskId: Number(task.id),
      startPlanned: toHHMM(start),
      endPlanned: toHHMM(finish),
      assignedSpace: Number.isFinite(Number(task?.spaceId))
        ? Number(task.spaceId)
        : null,
      assignedResources: [],
    });
    plannedEndByTaskId.set(Number(task.id), finish);
    if (mainZoneIdForMealReset && Number(zid) === Number(mainZoneIdForMealReset)) mainTemplateResetRequested = true;
  }

  for (const task of tasksSorted as any[]) {
    if (!isResourceBreakTask(task)) continue;
    const duration = Math.max(1, Number(task?.durationOverrideMin ?? 45));
    const winStart = toMinutes(task?.fixedWindowStart ?? toHHMM(mealStart));
    const winEnd = toMinutes(task?.fixedWindowEnd ?? toHHMM(mealEnd));

    let start = snapUp(winStart);
    if (task?.breakKind === "space_meal") {
      const spaceId = Number(task?.spaceId ?? 0);
      if (!spaceId) continue;
      const occ = occupiedBySpace.get(spaceId) ?? [];
      start = findEarliestGap(occ, start, duration);
      if (start + duration > winEnd) {
        return hardInfeasible([{ code: "SPACE_BREAK_NO_FIT", message: `No cabe parada de comida en espacio ${spaceId}.` }]);
      }
      const end = start + duration;
      addIntervalSorted(occ, { start, end, taskId: Number(task.id) });
      occupiedBySpace.set(spaceId, occ);
      plannedTasks.push({ taskId: Number(task.id), startPlanned: toHHMM(start), endPlanned: toHHMM(end), assignedSpace: spaceId ?? null, assignedResources: [] });
      if (mainZoneIdForMealReset && Number(getZoneIdForSpace(spaceId)) === Number(mainZoneIdForMealReset)) mainTemplateResetRequested = true;
      continue;
    }

    const teamId = Number(task?.itinerantTeamId ?? 0);
    if (!teamId) continue;
    const occ = occupiedByItinerant.get(teamId) ?? [];
    start = findEarliestGap(occ, start, duration);
    if (start + duration > winEnd) {
      return hardInfeasible([{ code: "ITINERANT_BREAK_NO_FIT", message: `No cabe parada de comida en equipo itinerante ${teamId}.` }]);
    }
    const end = start + duration;
    addIntervalSorted(occ, { start, end, taskId: Number(task.id) });
    occupiedByItinerant.set(teamId, occ);
    plannedTasks.push({ taskId: Number(task.id), startPlanned: toHHMM(start), endPlanned: toHHMM(end), assignedSpace: null, assignedResources: [] });
    if (mainZoneIdForMealReset && Number(task?.zoneId ?? NaN) === Number(mainZoneIdForMealReset)) mainTemplateResetRequested = true;
  }

  // 2) Tareas NO comida (paralelas), respetando: deps + concursante + espacio + recursos + bloqueos de comida de plató

  // ✅ Optimización (global)
  const optMainZoneIdRaw = (input as any)?.optimizerMainZoneId ?? null;
  const optMainZoneId =
    Number.isFinite(Number(optMainZoneIdRaw)) && Number(optMainZoneIdRaw) > 0
      ? Number(optMainZoneIdRaw)
      : null;


  // ✅ niveles (0..3). Si no llegan, hacemos fallback a legacy booleans.
  const optMainZoneLevelRaw = (input as any)?.optimizerMainZonePriorityLevel;
  const optGroupingLevelRaw = (input as any)?.optimizerGroupingLevel;

  const legacyPrioritize = (input as any)?.optimizerPrioritizeMainZone === true;
  const legacyGrouping =
    (input as any)?.optimizerGroupBySpaceAndTemplate !== false;

  const optMainZoneLevel = Number.isFinite(Number(optMainZoneLevelRaw))
    ? Math.max(0, Math.min(3, Number(optMainZoneLevelRaw)))
    : legacyPrioritize
      ? 2
      : 0;

  const optGroupingLevel = Number.isFinite(Number(optGroupingLevelRaw))
    ? Math.max(0, Math.min(3, Number(optGroupingLevelRaw)))
    : legacyGrouping
      ? 2
      : 0;

  // ✅ modos del plató principal (se pueden combinar)
  const optMainZoneOptFinishEarly =
    (input as any)?.optimizerMainZoneOptFinishEarly !== false;
  const optMainZoneOptKeepBusy =
    (input as any)?.optimizerMainZoneOptKeepBusy !== false;

  // ✅ compactar concursantes (0..3)
  const optContestantCompactRaw = (input as any)
    ?.optimizerContestantCompactLevel;
  const optContestantCompactLevel = Number.isFinite(
    Number(optContestantCompactRaw),
  )
    ? Math.max(0, Math.min(3, Number(optContestantCompactRaw)))
    : 0;

  // Pesos por nivel (amigable)
  const finishEarlyWeights = [0, 200_000, 1_000_000, 3_000_000]; // “Terminar cuanto antes”
  const keepBusyWeights = [0, 50_000, 250_000, 900_000]; // “Sin huecos”
  const groupingMatchWeights = [0, 2_000, 10_000, 30_000];
  const groupingActiveSpaceWeights = [0, 50, 200, 600];
  const contestantCompactWeights = [0, 800, 3_000, 9_000];
  const contestantStayInZoneWeights = [0, 600, 1_200, 2_000, 3_000, 4_500, 6_000, 7_500, 9_000, 10_500, 12_000];
  const contestantTotalSpanWeights = [0, 200, 400, 650, 900, 1_200, 1_600, 2_000, 2_400, 2_900, 3_500];

  const weightFromInput = (key: keyof NonNullable<(typeof input)["optimizerWeights"]>, fallback: number) => {
    const raw = (input as any)?.optimizerWeights?.[key];
    if (!Number.isFinite(Number(raw))) return fallback;
    return Math.max(0, Math.min(10, Number(raw)));
  };

  const finishEarlyWeight = optMainZoneOptFinishEarly
    ? (finishEarlyWeights[optMainZoneLevel] ?? 0)
    : 0;

  const keepBusyWeight = optMainZoneOptKeepBusy
    ? (keepBusyWeights[optMainZoneLevel] ?? 0)
    : 0;

  const groupingMatchWeight = groupingMatchWeights[optGroupingLevel] ?? 0;
  const groupingActiveSpaceWeight =
    groupingActiveSpaceWeights[optGroupingLevel] ?? 0;
  const contestantCompactWeight =
    contestantCompactWeights[optContestantCompactLevel] ?? 0;

  const effectiveFinishEarlyWeight = optMainZoneOptFinishEarly
    ? Math.round(weightFromInput("mainZoneFinishEarly", finishEarlyWeight / 300_000) * 300_000)
    : 0;
  const effectiveKeepBusyWeight = optMainZoneOptKeepBusy
    ? Math.round(weightFromInput("mainZoneKeepBusy", keepBusyWeight / 90_000) * 90_000)
    : 0;
  const mainZoneKeepBusyStrength = Math.max(
    0,
    Math.min(
      10,
      Math.round(
        weightFromInput(
          "mainZoneKeepBusy",
          optMainZoneLevel <= 0 ? 0 : optMainZoneLevel === 1 ? 4 : optMainZoneLevel === 2 ? 7 : 10,
        ),
      ),
    ),
  );
  const directorModeEnabled = Boolean(
    optMainZoneId &&
      optMainZoneOptKeepBusy &&
      mainZoneKeepBusyStrength >= DIRECTOR_MODE_KEEP_BUSY_THRESHOLD,
  );

  const effectiveGroupingMatchWeight = Math.round(weightFromInput("groupBySpaceTemplateMatch", groupingMatchWeight / 3_000) * 3_000);
  const effectiveGroupingActiveSpaceWeight = Math.round(weightFromInput("groupBySpaceActive", groupingActiveSpaceWeight / 60) * 60);
  const globalGroupingStrength10 = Math.max(
    0,
    Math.min(
      10,
      Math.round(
        Math.max(
          weightFromInput("groupBySpaceTemplateMatch", 0),
          weightFromInput("groupBySpaceActive", 0),
        ),
      ),
    ),
  );
  const effectiveContestantCompactWeight = Math.round(weightFromInput("contestantCompact", contestantCompactWeight / 900) * 900);
  const effectiveContestantStayInZoneWeight = contestantStayInZoneWeights[Math.round(weightFromInput("contestantStayInZone", 0))] ?? 0;
  const effectiveContestantTotalSpanWeight = contestantTotalSpanWeights[Math.round(weightFromInput("contestantTotalSpan", 0))] ?? 0;
  const feedMainActiveEnabled = Boolean(
    optMainZoneId &&
    mainZoneKeepBusyStrength >= 9 &&
    globalGroupingStrength10 >= 9,
  );

  // “memoria” por clave de contenedor de agrupación (espacio hoja, ancestro o zona)
  const lastTemplateByKey = new Map<string, number>();
  const streakByKey = new Map<string, { templateId: number; streakCount: number }>();
  const activeTemplateByZoneId = new Map<number, number>();
  const templateSwitchesByZoneId = new Map<number, number>();
  let mainTemplateResetArmed = Boolean(mainTemplateResetRequested);
  const maxTemplateChangesByZoneId = (((input as any)?.maxTemplateChangesByZoneId ?? {}) as Record<number, number>);
  const groupingBySpaceIdInput =
    (((input as any)?.groupingBySpaceId ?? (input as any)?.minimizeChangesBySpace ?? {}) as Record<
      number,
      { key?: string; level: number; minChain: number }
    >);

  const getGroupingConfigForSpace = (spaceId: number | null | undefined) => {
    if (!spaceId || !Number.isFinite(Number(spaceId))) return null;
    const raw = groupingBySpaceIdInput[Number(spaceId)] ?? null;
    if (raw && typeof raw === "object") {
      const level = Math.max(0, Math.min(10, Math.floor(Number((raw as any).level ?? 0))));
      const minChain = Math.max(1, Math.min(50, Math.floor(Number((raw as any).minChain ?? 4))));
      if (level <= 0) return null;
      const keyRaw = String((raw as any).key ?? `S:${Number(spaceId)}`).trim();
      const key = keyRaw || `S:${Number(spaceId)}`;
      return { key, level, minChain };
    }

    const zoneId = getZoneIdForSpace(Number(spaceId));
    if (!isGroupingEnabledForZone(zoneId)) return null;
    if (globalGroupingStrength10 <= 0) return null;
    return {
      key: `S:${Number(spaceId)}`,
      level: Math.max(0, Math.min(10, Math.floor(globalGroupingStrength10))),
      minChain: 4,
    };
  };

  const scoreMinimizeChangesBonus = (spaceId: number, tplId: number, options?: { pendingByTemplate?: Map<number, number> | null }) => {
    const cfg = getGroupingConfigForSpace(spaceId);
    if (!cfg) return 0;

    const zoneId = getZoneIdForSpace(spaceId);
    if (!isGroupingEnabledForZone(zoneId)) return 0;

    const lastTpl = lastTemplateByKey.get(cfg.key) ?? null;
    const levelFactor = cfg.level / 10;
    let score = 0;

    const pendingByTemplate = options?.pendingByTemplate ?? null;
    const pendingSameTemplate = Math.max(0, Number(pendingByTemplate?.get(tplId) ?? 0));
    const shouldKeepActiveTemplate =
      lastTpl !== null &&
      pendingByTemplate instanceof Map &&
      Math.max(0, Number(pendingByTemplate.get(lastTpl) ?? 0)) > 0;

    if (lastTpl !== null && lastTpl === tplId) {
      const currentStreakRaw = streakByKey.get(cfg.key)?.streakCount ?? 1;
      const currentStreak = Math.max(1, Number(currentStreakRaw));
      const chainProgress = Math.min(2.8, 1 + (currentStreak - 1) * 0.35);
      score += effectiveGroupingMatchWeight * levelFactor * chainProgress;
      if (pendingSameTemplate > 0) {
        score += effectiveGroupingMatchWeight * levelFactor * Math.min(2.2, 0.7 + pendingSameTemplate * 0.35);
      }
    } else if (lastTpl !== null && shouldKeepActiveTemplate) {
      score -= effectiveGroupingMatchWeight * levelFactor * 1.35;
    }

    if (lastTemplateByKey.has(cfg.key)) {
      score += effectiveGroupingActiveSpaceWeight * levelFactor;
    }

    return Math.round(Number.isFinite(score) ? score : 0);
  };

  const rememberSpaceTemplate = (spaceId: number | null | undefined, tplId: number | null | undefined) => {
    if (!spaceId || !tplId) return;
    const sid = Number(spaceId);
    const tid = Number(tplId);
    if (!Number.isFinite(sid) || sid <= 0 || !Number.isFinite(tid) || tid <= 0) return;
    const cfg = getGroupingConfigForSpace(sid);
    if (!cfg) return;

    const prev = streakByKey.get(cfg.key);
    if (prev && prev.templateId === tid) {
      streakByKey.set(cfg.key, { templateId: tid, streakCount: prev.streakCount + 1 });
    } else {
      streakByKey.set(cfg.key, { templateId: tid, streakCount: 1 });
    }
    lastTemplateByKey.set(cfg.key, tid);
  };

  // ✅ memoria para compactar por zona/concursante

  const depsSatisfied = (task: any) => {
    const depIds = getDepTaskIds(task);
    for (const depId of depIds) {
      const did = Number(depId);
      const ok = plannedEndByTaskId.has(did) || fixedEndByTaskId.has(did);
      if (!ok) return false;
    }
    return true;
  };

  const scheduleNonMealTask = (task: any) => {
    const taskId = Number(task?.id);
    if (!Number.isFinite(taskId)) return null;

    const duration = Math.max(
      5,
      Math.floor(Number(task.durationOverrideMin ?? 30)),
    );

    const contestantId = getContestantId(task);
    const spaceId = getSpaceId(task);
    const zoneId = getZoneId(task);
    const itinerantTeamId = Number(task?.itinerantTeamId ?? 0);
    const taskItinerantTeamId = Number(task?.itinerantTeamId ?? 0);

    const transportTask = isArrivalTask(task) || isDepartureTask(task);
    const canUseItinerantWrapOverlap = Boolean(
      Number(task?.itinerantTeamId ?? 0) > 0 && contestantId && spaceId,
    );

    const canWrapOverlapWithTaskId = (intervalTaskId: number) => {
      if (!canUseItinerantWrapOverlap) return false;
      if (!Number.isFinite(intervalTaskId) || intervalTaskId <= 0) return false;
      if (intervalTaskId === taskId) return false;
      const otherTask = taskById.get(Number(intervalTaskId));
      if (!otherTask) return false;
      return canAllowContestantWrapOverlap(task, otherTask);
    };

    if (!spaceId && !transportTask) {
      const invalidSpaceId = Number(task?._invalidSpaceId ?? NaN);
      return {
        scheduled: false,
        reason: {
          code: "MISSING_SPACE",
          taskId,
          message: Number.isFinite(invalidSpaceId) && invalidSpaceId > 0
            ? `No se puede planificar "${String(task?.templateName ?? `tarea ${taskId}`)}" porque su espacio fue eliminado o no existe.`
            : `No se puede planificar "${String(task?.templateName ?? `tarea ${taskId}`)}" porque no tiene espacio asignado.`,
        },
      } as any;
    }

    // earliest por horario + deps
    let start = snapUp(Math.max(startDay, depsEnd(task)));
    const forcedStart = forcedStartByTaskId.get(taskId);
    const forcedEnd = forcedEndByTaskId.get(taskId);
    if (Number.isFinite(forcedStart)) start = snapUp(Math.max(start, Number(forcedStart)));

    // ✅ Restricción por disponibilidad del concursante (si existe)
    const effWin = getContestantEffectiveWindow(contestantId);
      if (effWin && effWin.start >= effWin.end) {
        return {
          scheduled: false,
          reason: {
            code: "CONTESTANT_NO_AVAILABILITY",
            message:
              `No se puede planificar "${String(task?.templateName ?? `tarea ${taskId}`)}" porque la disponibilidad de ${task?.contestantName ?? `concursante ${contestantId}`} no es válida.`,
            taskId,
            details: {
              availabilityStart: toHHMM(effWin.start),
              availabilityEnd: toHHMM(effWin.end),
              workDayStart: toHHMM(startDay),
              workDayEnd: toHHMM(endDay),
              duration,
            },
          },
        } as any;
      }

    if (effWin) start = snapUp(Math.max(start, effWin.start));
    if (optMainZoneId && Number(zoneId) === Number(optMainZoneId)) start = snapUp(Math.max(start, mainStartGateMin));

    if (canUseItinerantWrapOverlap && contestantId && spaceId) {
      const cOcc = occupiedByContestant.get(contestantId) ?? [];
      let bestWrapInterval: Interval | null = null;
      let bestWrapDistance = Number.POSITIVE_INFINITY;

      for (const it of cOcc) {
        const intervalTaskId = Number(it?.taskId ?? NaN);
        if (!Number.isFinite(intervalTaskId) || intervalTaskId <= 0) continue;
        if (intervalTaskId === taskId) continue;
        const otherTask = taskById.get(intervalTaskId);
        if (!otherTask || Boolean(otherTask?.isManualBlock)) continue;
        if (Number(getSpaceId(otherTask) ?? 0) !== Number(spaceId)) continue;
        const distance = Math.abs(it.start - start);
        if (distance < bestWrapDistance) {
          bestWrapDistance = distance;
          bestWrapInterval = it;
        }
      }

      if (bestWrapInterval) {
        const durA = duration;
        const durB = Math.max(5, bestWrapInterval.end - bestWrapInterval.start);
        const padding = durA > durB ? Math.floor((durA - durB) / 2) : 0;
        const alignedStart = durA > durB
          ? snapUp(bestWrapInterval.start - padding)
          : snapUp(bestWrapInterval.start);
        const boundedStart = effWin ? Math.max(alignedStart, effWin.start) : alignedStart;
        start = snapUp(Math.max(start, startDay, boundedStart));
      }
    }

    // bucle de búsqueda (avanzando GRID) hasta encajar con todas las restricciones
    const maxIter = 20000; // defensivo
    let iter = 0;

    while (iter++ < maxIter) {
      // 2.1) Espacio: hueco libre en space
      const spaceOcc = spaceId ? (occupiedBySpace.get(spaceId) ?? []) : [];
      let candidate = spaceId
        ? (canUseItinerantWrapOverlap
          ? findEarliestGapAllowingOverlap(
            spaceOcc,
            start,
            duration,
            canWrapOverlapWithTaskId,
          )
          : findEarliestGap(spaceOcc, start, duration))
        : start;

      // 2.2) Bloqueo por comida de plató (zona): NO se puede solapar
      if (zoneId) {
        const zOcc = occupiedByZoneMeal.get(zoneId) ?? [];
        candidate = findEarliestGap(zOcc, candidate, duration);
      }

      // 2.3) Concursante: hueco libre
      if (contestantId) {
        const cOcc = occupiedByContestant.get(contestantId) ?? [];
        candidate = canUseItinerantWrapOverlap
          ? findEarliestGapAllowingOverlap(
            cOcc,
            candidate,
            duration,
            canWrapOverlapWithTaskId,
          )
          : findEarliestGap(cOcc, candidate, duration);
      }

      // 2.4) Si movimos candidate, re-chequeamos (porque al mover por concursante podemos caer en espacio ocupado, etc.)
      if (candidate !== start) {
        start = snapUp(candidate);
        continue;
      }

      if (optMainZoneId && Number(zoneId) === Number(optMainZoneId) && start < mainStartGateMin) {
        start = snapUp(Math.max(start + GRID, mainStartGateMin));
        continue;
      }

      // ✅ No permitir que la tarea se salga de la ventana efectiva del concursante
      if (effWin && start + duration > effWin.end) {
        const startsBeforeAvailability = startDay < effWin.start;
        return {
          scheduled: false,
          reason: {
            code: "CONTESTANT_NOT_AVAILABLE",
            message:
              `No hay hueco para "${String(task?.templateName ?? "tarea").trim() || `tarea ${taskId}`}" dentro de la disponibilidad de ${task?.contestantName ?? `concursante ${contestantId}`}.`,
            taskId,
            details: {
              availabilityStart: toHHMM(effWin.start),
              availabilityEnd: toHHMM(effWin.end),
              workDayStart: toHHMM(startDay),
              workDayEnd: toHHMM(endDay),
              duration,
              startsBeforeAvailability,
            },
          },
        } as any;
      }

      const finish = Number.isFinite(forcedEnd) ? Number(forcedEnd) : start + duration;
      if (finish <= start) {
        start = snapUp(start + GRID);
        continue;
      }
      if (finish > endDay) {
        return {
          scheduled: false,
          reason: {
            code: "NO_TIME",
            message: "No queda tiempo suficiente en la jornada para esta tarea.",
            taskId,
          },
        } as any;
      }

      if (taskItinerantTeamId) {
        const teamOcc = occupiedByItinerant.get(taskItinerantTeamId) ?? [];
        const teamStart = findEarliestGap(teamOcc, start, duration);
        if (teamStart !== start) {
          start = snapUp(teamStart);
          continue;
        }
      }

      // 2.5) Asignación de recursos respetando NO solape (comida no usa recursos; aquí sí)
      const assigned: number[] = [];
      const picked = new Set<number>();

      // ✅ Si durante la selección de recursos cambiamos `start`,
      // hay que volver al inicio del while para recalcular huecos (contestante/espacio/zona).
      let retry = false;
      const bumpStartAndRetry = () => {
        start = snapUp(start + GRID);
        retry = true;
      };

      const rr = (task as any)?.resourceRequirements ?? null;

      const ignoreSpacePool = shouldIgnoreSpacePool(task);
      const spacePool = ignoreSpacePool || !spaceId ? [] : getSpacePool(spaceId);
      const zonePool = Number.isFinite(Number(zoneId))
        ? (zoneResourceAssignments[Number(zoneId)] ?? [])
        : [];

      const isResourceFree = (pid: number) => {
        const occ = occupiedByResource.get(pid) ?? [];
        return findEarliestGap(occ, start, duration) === start;
      };

      const tryPick = (candidates: number[], need: number) => {
        const out: number[] = [];
        for (const pidAny of candidates) {
          if (out.length >= need) break;
          const pid = Number(pidAny);
          if (!Number.isFinite(pid) || pid <= 0) continue;
          if (picked.has(pid)) continue;
          const row = priById.get(pid);
          if (!row || row.isAvailable === false) continue;
          if (!isResourceFree(pid)) continue;
          picked.add(pid);
          out.push(pid);
        }
        return out;
      };

      // byItem
      const byItem =
        rr?.byItem && typeof rr.byItem === "object" ? rr.byItem : null;
      if (byItem) {
        for (const [ridStr, qtyRaw] of Object.entries(byItem)) {
          const resourceItemId = Number(ridStr);
          const qty = Number(qtyRaw ?? 0);
          if (!Number.isFinite(resourceItemId) || resourceItemId <= 0) continue;
          if (!Number.isFinite(qty) || qty <= 0) continue;

          const globalCandidates =
            planIdsByResourceItemId.get(resourceItemId) ?? [];
          const zoneCandidates = Array.isArray(zonePool)
            ? zonePool.filter(
                (pid) => priById.get(pid)?.resourceItemId === resourceItemId,
              )
            : [];
          const spaceCandidates = spacePool.filter(
            (pid) => priById.get(pid)?.resourceItemId === resourceItemId,
          );

          const candidates = concatPreferSpace(
            spaceCandidates,
            concatPreferSpace(zoneCandidates, globalCandidates),
          );

          const need = Math.max(0, Math.floor(qty));
          const got = tryPick(candidates, need);

          if (got.length < need) {
            // no hay recursos libres en ESTE start -> reintentar desde el while
            bumpStartAndRetry();
            break;
          }

          assigned.push(...got);
        }
        if (retry) continue;
      }

      // byType
      const byType =
        rr?.byType && typeof rr.byType === "object" ? rr.byType : null;
      if (byType) {
        for (const [tidStr, qtyRaw] of Object.entries(byType)) {
          const typeId = Number(tidStr);
          const qty = Number(qtyRaw ?? 0);
          if (!Number.isFinite(typeId) || typeId <= 0) continue;
          if (!Number.isFinite(qty) || qty <= 0) continue;

          const globalCandidates = planIdsByTypeId.get(typeId) ?? [];
          const zoneCandidates = Array.isArray(zonePool)
            ? zonePool.filter((pid) => priById.get(pid)?.typeId === typeId)
            : [];
          const spaceCandidates = spacePool.filter(
            (pid) => priById.get(pid)?.typeId === typeId,
          );

          const candidates = concatPreferSpace(
            spaceCandidates,
            concatPreferSpace(zoneCandidates, globalCandidates),
          );

          const need = Math.max(0, Math.floor(qty));
          const got = tryPick(candidates, need);

          if (got.length < need) {
            bumpStartAndRetry();
            break;
          }
          assigned.push(...got);
        }
        if (retry) continue;
      }

      // anyOf
      const anyOf = Array.isArray(rr?.anyOf) ? rr.anyOf : [];
      for (const g of anyOf) {
        const quantity = Number(g?.quantity ?? 1);
        const resourceItemIds = Array.isArray(g?.resourceItemIds)
          ? g.resourceItemIds
          : [];
        const need =
          Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;

        const globalCandidatePlanIds = resourceItemIds
          .map((rid: any) => planIdsByResourceItemId.get(Number(rid)) ?? [])
          .flat();

        const zoneCandidatePlanIds = Array.isArray(zonePool)
          ? zonePool.filter((pid) => {
              const row = priById.get(pid);
              if (!row) return false;
              return resourceItemIds.some(
                (rid: any) => Number(rid) === Number(row.resourceItemId),
              );
            })
          : [];

        const spaceCandidatePlanIds = spacePool.filter((pid) => {
          const row = priById.get(pid);
          if (!row) return false;
          return resourceItemIds.some(
            (rid: any) => Number(rid) === Number(row.resourceItemId),
          );
        });

        const candidates = concatPreferSpace(
          spaceCandidatePlanIds,
          concatPreferSpace(zoneCandidatePlanIds, globalCandidatePlanIds),
        );

        const got = tryPick(candidates, need);
        if (got.length < need) {
          bumpStartAndRetry();
          break;
        }

        assigned.push(...got);
      }
      if (retry) continue;

      // ✅ Expandir compuestos (como ya hacías), pero respetando solape también
      const extraComponentsToAdd: number[] = [];
      for (const pid of assigned) {
        const row = priById.get(pid);
        if (!row) continue;

        const comps = componentsMap[row.resourceItemId] ?? [];
        if (!Array.isArray(comps) || comps.length === 0) continue;

        for (const c of comps) {
          const compRid = Number(c?.componentResourceItemId);
          const qty = Number(c?.quantity ?? 1);
          if (!Number.isFinite(compRid) || compRid <= 0) continue;
          if (!Number.isFinite(qty) || qty <= 0) continue;

          const candidates = planIdsByResourceItemId.get(compRid) ?? [];
          for (let k = 0; k < qty; k++) {
            const got = tryPick(candidates, 1);
            if (got.length < 1) {
              bumpStartAndRetry();
              break;
            }
            extraComponentsToAdd.push(...got);
          }
          if (retry) break;
        }
        if (retry) break;
      }
      if (retry) continue;

      assigned.push(...extraComponentsToAdd);

      // ✅ reservar intervalos
      if (spaceId) {
        addIntervalSorted(spaceOcc, { start, end: finish, taskId });
        occupiedBySpace.set(spaceId, spaceOcc);
      }
      if (taskItinerantTeamId) {
        const teamOcc = occupiedByItinerant.get(taskItinerantTeamId) ?? [];
        addIntervalSorted(teamOcc, { start, end: finish, taskId });
        occupiedByItinerant.set(taskItinerantTeamId, teamOcc);
      }

      if (contestantId) {
        const cOcc = occupiedByContestant.get(contestantId) ?? [];
        addIntervalSorted(cOcc, { start, end: finish, taskId });
        occupiedByContestant.set(contestantId, cOcc);
      }

      for (const pid of assigned) {
        const rOcc = occupiedByResource.get(pid) ?? [];
        addIntervalSorted(rOcc, { start, end: finish, taskId });
        occupiedByResource.set(pid, rOcc);
      }

      plannedTasks.push({
        taskId,
        startPlanned: toHHMM(start),
        endPlanned: toHHMM(finish),
        assignedSpace: spaceId ?? null,
        assignedResources: assigned,
      });
      plannedEndByTaskId.set(taskId, finish);

      // ✅ memoria para agrupar tareas iguales en el mismo espacio
      const tplId = Number(task?.templateId ?? 0);
      rememberSpaceTemplate(spaceId, tplId);

      if (isGroupingEnabledForZone(zoneId) && Number.isFinite(tplId) && tplId > 0) {
        const zid = Number(zoneId);
        const prev = activeTemplateByZoneId.get(zid);
        if (!Number.isFinite(Number(prev)) || Number(prev) <= 0) {
          activeTemplateByZoneId.set(zid, tplId);
        } else if (Number(prev) !== tplId) {
          templateSwitchesByZoneId.set(zid, Number(templateSwitchesByZoneId.get(zid) ?? 0) + 1);
          activeTemplateByZoneId.set(zid, tplId);
        }
      }

      // ✅ memoria para “sin huecos” por zona
      const zId = getZoneId(task);
      if (zId) lastEndByZone.set(zId, finish);
      if (optMainZoneId && Number(zId) === Number(optMainZoneId)) {
        mainTemplateResetArmed = false;
      }

      // ✅ memoria para compactar concursantes
      const cId = getContestantId(task);
      if (cId) {
        lastEndByContestant.set(cId, finish);
        const firstStart = firstStartByContestant.get(cId);
        if (firstStart == null || start < firstStart) firstStartByContestant.set(cId, start);
        if (zId) lastZoneByContestant.set(cId, zId);
      }

      return { scheduled: true } as any; // ✅ tarea colocada
    }

    return {
      scheduled: false,
      reason: {
        code: "MAX_ITER",
        message:
          "No se pudo encontrar hueco para esta tarea tras muchos intentos. Revisa bloqueos y disponibilidad.",
        taskId: Number(task?.id),
      },
    } as any;
  };

  // ✅ PRO: “relleno real de huecos” en plató principal (zona)
  // - Detecta el próximo hueco REAL (en minutos) dentro de cualquier espacio del plató principal
  // - Intenta colocar una tarea de ese plató exactamente en ese hueco
  // - Si no hay ninguna que encaje, sigue con el flujo normal

  const getNextStartAfter = (arr: Interval[], t: number) => {
    for (const it of arr) {
      if (it.start > t) return it.start;
    }
    return null;
  };

    const getMainZoneGap = (): {
      spaceId: number;
      zoneId: number;
      gapStart: number;
      gapEnd: number;
    } | null => {
      // ✅ protección: si el escaneo de huecos se alarga, abortamos gap-fill y seguimos flujo normal
      const MAX_GAP_SCAN_ITERS = 200;
    if (!optMainZoneId) return null;

    const spaceIds: number[] = [];
    for (const [sid, zid] of spaceZoneById.entries()) {
      if (zid === optMainZoneId) spaceIds.push(sid);
    }

    let best: {
      spaceId: number;
      zoneId: number;
      gapStart: number;
      gapEnd: number;
    } | null = null;

    const zOcc = occupiedByZoneMeal.get(optMainZoneId) ?? [];

    for (const spaceId of spaceIds) {
      const spaceOcc = occupiedBySpace.get(spaceId) ?? [];

      // Para “relleno”: solo tiene sentido si el espacio ya tiene algo programado/ocupado.
      if (!spaceOcc.length) continue;

      let t = startDay;
      let guard = 0;
      while (guard++ < MAX_GAP_SCAN_ITERS && t + GRID <= endDay) {
        // Primero: hueco de espacio
        const s1 = findEarliestGap(spaceOcc, t, GRID);
        // Segundo: hueco de zona (comida plató)
        const s2 = findEarliestGap(zOcc, s1, GRID);
        if (s2 !== s1) {
          t = snapUp(s2);
          continue;
        }

        const nextSpace = getNextStartAfter(spaceOcc, s1);
        const nextZone = getNextStartAfter(zOcc, s1);
        const gapEnd = Math.min(
          endDay,
          nextSpace ?? endDay,
          nextZone ?? endDay,
        );

        if (gapEnd - s1 >= GRID) {
          const cand = { spaceId, zoneId: optMainZoneId, gapStart: s1, gapEnd };
          if (!best || cand.gapStart < best.gapStart) best = cand;
        }
        break;
      }

      // ✅ si el escaneo se alargó demasiado, ignoramos este espacio (fallback seguro)
      if (guard > MAX_GAP_SCAN_ITERS) continue;
    }

    return best;
  };

  const tryPlaceTaskInExactWindow = (
    task: any,
    spaceId: number,
    zoneId: number,
    start: number,
    windowEnd: number,
  ): boolean => {
    const taskId = Number(task?.id);
    if (!Number.isFinite(taskId)) return false;

    const duration = Math.max(
      5,
      Math.floor(Number(task.durationOverrideMin ?? 30)),
    );
    const contestantId = getContestantId(task);

    // deps
    const earliestByDeps = snapUp(Math.max(startDay, depsEnd(task)));
    if (start < earliestByDeps) return false;

    // concursante ventana efectiva
    const effWin = getContestantEffectiveWindow(contestantId);
    if (effWin) {
      if (start < effWin.start) return false;
      if (start + duration > effWin.end) return false;
    }

    const finish = start + duration;
    if (finish > endDay) return false;
    if (finish > windowEnd) return false;

    // espacio libre
    const spaceOcc = occupiedBySpace.get(spaceId) ?? [];
    if (findEarliestGap(spaceOcc, start, duration) !== start) return false;

    // zona libre (comida plató)
    const zOcc = occupiedByZoneMeal.get(zoneId) ?? [];
    if (findEarliestGap(zOcc, start, duration) !== start) return false;

    // concursante libre
    if (contestantId) {
      const cOcc = occupiedByContestant.get(contestantId) ?? [];
      if (findEarliestGap(cOcc, start, duration) !== start) return false;
    }

    // recursos libres (mismo contrato que scheduleNonMealTask)
    const assigned: number[] = [];
    const picked = new Set<number>();

    const rr = (task as any)?.resourceRequirements ?? null;
    const ignoreSpacePool = shouldIgnoreSpacePool(task);
    const spacePool = ignoreSpacePool || !spaceId ? [] : getSpacePool(spaceId);
    const zonePool = Number.isFinite(Number(zoneId))
      ? (zoneResourceAssignments[Number(zoneId)] ?? [])
      : [];

    const isResourceFree = (pid: number) => {
      const occ = occupiedByResource.get(pid) ?? [];
      return findEarliestGap(occ, start, duration) === start;
    };

    const tryPick = (candidates: number[], need: number) => {
      const out: number[] = [];
      for (const pidAny of candidates) {
        if (out.length >= need) break;
        const pid = Number(pidAny);
        if (!Number.isFinite(pid) || pid <= 0) continue;
        if (picked.has(pid)) continue;
        const row = priById.get(pid);
        if (!row || row.isAvailable === false) continue;
        if (!isResourceFree(pid)) continue;
        picked.add(pid);
        out.push(pid);
      }
      return out;
    };

    // byItem
    const byItem =
      rr?.byItem && typeof rr.byItem === "object" ? rr.byItem : null;
    if (byItem) {
      for (const [ridStr, qtyRaw] of Object.entries(byItem)) {
        const resourceItemId = Number(ridStr);
        const qty = Number(qtyRaw ?? 0);
        if (!Number.isFinite(resourceItemId) || resourceItemId <= 0) continue;
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const globalCandidates =
          planIdsByResourceItemId.get(resourceItemId) ?? [];
        const zoneCandidates = Array.isArray(zonePool)
          ? zonePool.filter(
              (pid) => priById.get(pid)?.resourceItemId === resourceItemId,
            )
          : [];
        const spaceCandidates = spacePool.filter(
          (pid) => priById.get(pid)?.resourceItemId === resourceItemId,
        );

        const pickedIds = [
          ...tryPick(spaceCandidates, qty),
          ...tryPick(zoneCandidates, qty),
          ...tryPick(globalCandidates, qty),
        ];
        if (pickedIds.length < qty) return false;
        assigned.push(...pickedIds.slice(0, qty));
      }
    }

    // byType
    const byType =
      rr?.byType && typeof rr.byType === "object" ? rr.byType : null;
    if (byType) {
      for (const [typeStr, qtyRaw] of Object.entries(byType)) {
        const typeId = Number(typeStr);
        const qty = Number(qtyRaw ?? 0);
        if (!Number.isFinite(typeId) || typeId <= 0) continue;
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const globalCandidates = planIdsByTypeId.get(typeId) ?? [];
        const zoneCandidates = Array.isArray(zonePool)
          ? zonePool.filter((pid) => priById.get(pid)?.typeId === typeId)
          : [];
        const spaceCandidates = spacePool.filter(
          (pid) => priById.get(pid)?.typeId === typeId,
        );

        const pickedIds = [
          ...tryPick(spaceCandidates, qty),
          ...tryPick(zoneCandidates, qty),
          ...tryPick(globalCandidates, qty),
        ];
        if (pickedIds.length < qty) return false;
        assigned.push(...pickedIds.slice(0, qty));
      }
    }

    // anyOf
    const anyOf = Array.isArray(rr?.anyOf) ? rr.anyOf : null;
    if (anyOf) {
      for (const group of anyOf) {
        const qty = Number(group?.quantity ?? 0);
        const ids = Array.isArray(group?.resourceItemIds)
          ? group.resourceItemIds
          : [];
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const candidates: number[] = [];
        for (const ridAny of ids) {
          const rid = Number(ridAny);
          if (!Number.isFinite(rid) || rid <= 0) continue;

          const global = planIdsByResourceItemId.get(rid) ?? [];
          const zoneCandidates = Array.isArray(zonePool)
            ? zonePool.filter((pid) => priById.get(pid)?.resourceItemId === rid)
            : [];
          const spaceCandidates = spacePool.filter(
            (pid) => priById.get(pid)?.resourceItemId === rid,
          );

          candidates.push(...spaceCandidates, ...zoneCandidates, ...global);
        }

        const pickedIds = tryPick(candidates, qty);
        if (pickedIds.length < qty) return false;
        assigned.push(...pickedIds);
      }
    }

    // ✅ reservar intervalos (misma lógica que scheduleNonMealTask)
    addIntervalSorted(spaceOcc, { start, end: finish, taskId });
    occupiedBySpace.set(spaceId, spaceOcc);

    if (contestantId) {
      const cOcc = occupiedByContestant.get(contestantId) ?? [];
      addIntervalSorted(cOcc, { start, end: finish, taskId });
      occupiedByContestant.set(contestantId, cOcc);
    }

    for (const pid of assigned) {
      const rOcc = occupiedByResource.get(pid) ?? [];
      addIntervalSorted(rOcc, { start, end: finish, taskId });
      occupiedByResource.set(pid, rOcc);
    }

    plannedTasks.push({
      taskId,
      startPlanned: toHHMM(start),
      endPlanned: toHHMM(finish),
      assignedSpace: spaceId ?? null,
      assignedResources: assigned,
    });
    plannedEndByTaskId.set(taskId, finish);

    const tplId = Number(task?.templateId ?? 0);
    rememberSpaceTemplate(spaceId, tplId);
    lastEndByZone.set(zoneId, finish);
    if (contestantId) {
      lastEndByContestant.set(contestantId, finish);
      const firstStart = firstStartByContestant.get(contestantId);
      if (firstStart == null || start < firstStart) firstStartByContestant.set(contestantId, start);
      lastZoneByContestant.set(contestantId, zoneId);
    }

    return true;
  };

  // 3) Comidas de concursantes: tareas “comida” CON concursante (antes de no-comida)
  type MealTaskCandidate = {
    task: any;
    taskId: number;
    contestantId: number;
    contestantName: string;
    windowStart: number;
    windowEnd: number;
    windowMinutes: number;
    possibleSlots: number;
    occupancyMinutes: number;
    viableStarts: number[];
  };

  const countConcurrentMealsFrom = (intervals: Interval[], start: number, end: number) => {
    let concurrent = 0;
    for (const it of intervals) {
      if (rangesOverlap(start, end, it.start, it.end)) concurrent++;
    }
    return concurrent;
  };

  const getCandidateStarts = (
    cand: MealTaskCandidate,
    contestantOccupation: Map<number, Interval[]>,
    activeMealIntervals: Interval[],
  ) => {
    const cOcc = contestantOccupation.get(cand.contestantId) ?? [];
    const starts: number[] = [];
    const latestStart = cand.windowEnd - contestantMealDuration;
    for (let start = snapUp(cand.windowStart); start <= latestStart; start += GRID) {
      const end = start + contestantMealDuration;
      if (findEarliestGap(cOcc, start, contestantMealDuration) !== start) continue;
      if (countConcurrentMealsFrom(activeMealIntervals, start, end) >= contestantMealMaxSim) continue;
      starts.push(start);
    }
    return starts;
  };

  const cloneContestantOccupation = () => {
    const clone = new Map<number, Interval[]>();
    for (const [k, v] of occupiedByContestant.entries()) {
      clone.set(k, v.map((it) => ({ ...it })));
    }
    return clone;
  };

  const getMealDiagnosticBase = (candidates: MealTaskCandidate[]) => {
    const windowMinutes = Math.max(0, mealEnd - mealStart);
    const capacityTheoretical = Math.floor((windowMinutes * contestantMealMaxSim) / contestantMealDuration);
    const mealsNeeded = candidates.length;
    return {
      windowStart: toHHMM(mealStart),
      windowEnd: toHHMM(mealEnd),
      durationMinutes: contestantMealDuration,
      maxSimultaneous: contestantMealMaxSim,
      mealsNeeded,
      capacityTheoretical,
      fixedMealCount,
      fixedMealMinutesInWindow,
      isCapacityImpossible: mealsNeeded > capacityTheoretical,
    };
  };

  const pendingMealCandidates: MealTaskCandidate[] = [];
  for (const task of tasksSorted as any[]) {
    if (!isMealTask(task)) continue;
    const contestantId = getContestantId(task);
    if (!contestantId) continue;

    const taskId = Number(task?.id);
    if (!Number.isFinite(taskId)) continue;

    const status = String(task?.status ?? 'pending');
    const isFixed =
      status === 'in_progress' ||
      status === 'done' ||
      lockedTaskIds.has(taskId);
    if (isFixed) continue;

    const effWin = getContestantEffectiveWindow(contestantId);
    const mealWinStart = snapUp(Math.max(mealStart, effWin ? effWin.start : mealStart));
    const mealWinEnd = Math.min(mealEnd, effWin ? effWin.end : mealEnd);
    const windowMinutes = Math.max(0, mealWinEnd - mealWinStart);

    const cOcc = occupiedByContestant.get(contestantId) ?? [];
    let occupancyMinutes = 0;
    for (const it of cOcc) {
      const overlapStart = Math.max(it.start, mealWinStart);
      const overlapEnd = Math.min(it.end, mealWinEnd);
      if (overlapEnd > overlapStart) occupancyMinutes += overlapEnd - overlapStart;
    }

    const candidate: MealTaskCandidate = {
      task,
      taskId,
      contestantId,
      contestantName: String(task?.contestantName ?? `concursante ${contestantId}`),
      windowStart: mealWinStart,
      windowEnd: mealWinEnd,
      windowMinutes,
      possibleSlots: 0,
      occupancyMinutes,
      viableStarts: [],
    };
    pendingMealCandidates.push(candidate);
  }

  const mealBaseOccupation = cloneContestantOccupation();
  for (const candidate of pendingMealCandidates) {
    candidate.viableStarts = getCandidateStarts(candidate, mealBaseOccupation, mealIntervals);
    candidate.possibleSlots = candidate.viableStarts.length;
  }

  const solveMealsByBacktracking = (
    candidates: MealTaskCandidate[],
    mealIntervalsFixed: Interval[],
    maxSim: number,
    duration: number,
    grid: number,
  ) => {
    const orderedCandidates = [...candidates].sort((a, b) => {
      if (a.viableStarts.length !== b.viableStarts.length) return a.viableStarts.length - b.viableStarts.length;
      if (a.windowMinutes !== b.windowMinutes) return a.windowMinutes - b.windowMinutes;
      if (a.occupancyMinutes !== b.occupancyMinutes) return b.occupancyMinutes - a.occupancyMinutes;
      return a.taskId - b.taskId;
    });

    const totalBuckets = Math.max(0, Math.ceil((mealEnd - mealStart) / grid));
    const occ = Array<number>(totalBuckets).fill(0);
    const bucketIdx = (t: number) => Math.floor((t - mealStart) / grid);
    const bucketTime = (idx: number) => mealStart + idx * grid;

    const addIntervalToBuckets = (start: number, end: number, delta: number) => {
      const from = Math.max(start, mealStart);
      const to = Math.min(end, mealEnd);
      if (to <= from) return;
      for (let t = from; t < to; t += grid) {
        const idx = bucketIdx(t);
        if (idx < 0 || idx >= totalBuckets) continue;
        occ[idx] += delta;
      }
    };

    for (const it of mealIntervalsFixed) addIntervalToBuckets(it.start, it.end, 1);

    for (const cand of orderedCandidates) {
      const preferredStarts = [...cand.viableStarts].sort((a, b) => {
        let sumA = 0;
        let sumB = 0;
        for (let t = a; t < a + duration; t += grid) {
          const idx = bucketIdx(t);
          if (idx >= 0 && idx < totalBuckets) sumA += occ[idx];
        }
        for (let t = b; t < b + duration; t += grid) {
          const idx = bucketIdx(t);
          if (idx >= 0 && idx < totalBuckets) sumB += occ[idx];
        }
        if (sumA !== sumB) return sumA - sumB;
        return a - b;
      });
      cand.viableStarts = preferredStarts;
    }

    const fits = (start: number) => {
      for (let t = start; t < start + duration; t += grid) {
        const idx = bucketIdx(t);
        if (idx < 0 || idx >= totalBuckets) return false;
        if (occ[idx] + 1 > maxSim) return false;
      }
      return true;
    };

    const applyStart = (start: number) => addIntervalToBuckets(start, start + duration, 1);
    const undoStart = (start: number) => addIntervalToBuckets(start, start + duration, -1);

    let failingCandidate: MealTaskCandidate | null = null;
    let failingOccSnapshot: number[] | null = null;
    const assignments = new Map<number, number>();

    const findCandidateWithNoSlot = (fromIdx: number) => {
      for (let j = fromIdx; j < orderedCandidates.length; j++) {
        const candidate = orderedCandidates[j];
        let hasSome = false;
        for (const s of candidate.viableStarts) {
          if (fits(s)) {
            hasSome = true;
            break;
          }
        }
        if (!hasSome) return candidate;
      }
      return null;
    };

    const dfs = (i: number): boolean => {
      if (i >= orderedCandidates.length) return true;
      const cand = orderedCandidates[i];
      for (const start of cand.viableStarts) {
        if (!fits(start)) continue;
        assignments.set(cand.taskId, start);
        applyStart(start);

        const blockedNext = findCandidateWithNoSlot(i + 1);
        if (!blockedNext) {
          if (dfs(i + 1)) return true;
        } else if (!failingCandidate) {
          failingCandidate = blockedNext;
          failingOccSnapshot = [...occ];
        }

        undoStart(start);
        assignments.delete(cand.taskId);
      }

      if (!failingCandidate) {
        failingCandidate = cand;
        failingOccSnapshot = [...occ];
      }
      return false;
    };

    const ok = dfs(0);
    if (!ok) {
      const fallbackFailing = orderedCandidates[0] ?? null;
      return {
        ok: false as const,
        failingCandidate: failingCandidate ?? fallbackFailing,
        occSnapshot: failingOccSnapshot ?? [...occ],
        blockedBuckets: (failingOccSnapshot ?? occ)
          .map((v, idx) => ({ idx, v }))
          .filter((x) => x.v >= maxSim)
          .slice(0, 5)
          .map((x) => toHHMM(bucketTime(x.idx))),
      };
    }

    const resolved: Array<{ cand: MealTaskCandidate; start: number; end: number }> = [];
    for (const cand of orderedCandidates) {
      const start = assignments.get(cand.taskId);
      if (start == null) continue;
      resolved.push({ cand, start, end: start + duration });
    }
    resolved.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return a.cand.taskId - b.cand.taskId;
    });
    return { ok: true as const, assignments: resolved };
  };

  const mealSolve = solveMealsByBacktracking(
    pendingMealCandidates,
    mealIntervals,
    contestantMealMaxSim,
    contestantMealDuration,
    GRID,
  );
  if (!mealSolve.ok) {
    const failingMealCandidate = mealSolve.failingCandidate;
    const baseDiagnostic = getMealDiagnosticBase(pendingMealCandidates);
    const effectiveWindowReason = failingMealCandidate
      ? Math.max(0, failingMealCandidate.windowEnd - failingMealCandidate.windowStart) < contestantMealDuration
      : false;
    const blockingFixed = failingMealCandidate
      ? (occupiedByContestant.get(failingMealCandidate.contestantId) ?? [])
          .filter((it) => rangesOverlap(it.start, it.end, failingMealCandidate.windowStart, failingMealCandidate.windowEnd))
          .slice(0, 5)
          .map((it) => {
            const bt = tasks.find((x) => Number(x?.id) === Number(it.taskId));
            const nm = String(bt?.templateName ?? `Tarea ${it.taskId}`).trim();
            return `${nm} ${toHHMM(it.start)}–${toHHMM(it.end)}`;
          })
      : [];
    const blockedByCapacity = failingMealCandidate
      ? (mealSolve.occSnapshot ?? [])
          .map((v, idx) => ({ v, time: mealStart + idx * GRID }))
          .filter(({ v, time }) =>
            v >= contestantMealMaxSim &&
            time >= failingMealCandidate.windowStart &&
            time < failingMealCandidate.windowEnd,
          )
          .slice(0, 5)
          .map(({ time }) => toHHMM(time))
      : ((mealSolve as any)?.blockedBuckets ?? []);

    return hardInfeasible([{
      code: 'MEAL_CONTESTANT_NO_FIT',
        message:
          `No se pudo encajar la comida de "${failingMealCandidate?.contestantName ?? 'concursante'}" (${contestantMealDuration} min) dentro de ${toHHMM(mealStart)}–${toHHMM(mealEnd)} respetando máximo simultáneo (${contestantMealMaxSim}). ` +
          `Motivo principal: ${effectiveWindowReason ? 'ventana efectiva insuficiente' : 'ocupación por tareas fijas/bloqueos'}. ` +
          (blockedByCapacity.length ? `Capacidad al límite en: ${blockedByCapacity.join(', ')}. ` : '') +
          (blockingFixed.length ? `Bloqueos: ${blockingFixed.join(', ')}. ` : '') +
          `Capacidad teórica: ${baseDiagnostic.mealsNeeded}/${baseDiagnostic.capacityTheoretical}.`,
        taskId: failingMealCandidate?.taskId,
        diagnostic: {
          ...baseDiagnostic,
          failingContestantId: failingMealCandidate?.contestantId ?? null,
          failingContestantName: failingMealCandidate?.contestantName ?? null,
          viableSlotsCount: failingMealCandidate?.viableStarts.length ?? 0,
          failReason: effectiveWindowReason ? 'effective_window_insufficient' : 'fixed_occupation_or_blocks',
          blockedByCapacity,
          blockingIntervals: blockingFixed,
        },
      }]);
  }

  for (const row of mealSolve.assignments) {
    plannedTasks.push({
      taskId: row.cand.taskId,
      startPlanned: toHHMM(row.start),
      endPlanned: toHHMM(row.end),
      assignedSpace: null,
      assignedResources: [],
    });
    plannedEndByTaskId.set(row.cand.taskId, row.end);
    const mealTask = taskById.get(Number(row.cand.taskId));
    if (mainZoneIdForMealReset && Number(getZoneId(mealTask)) === Number(mainZoneIdForMealReset)) mainTemplateResetRequested = true;

    const cOcc = occupiedByContestant.get(row.cand.contestantId) ?? [];
    addIntervalSorted(cOcc, { start: row.start, end: row.end, taskId: row.cand.taskId });
    occupiedByContestant.set(row.cand.contestantId, cOcc);
    addIntervalSorted(mealIntervals, { start: row.start, end: row.end, taskId: row.cand.taskId });

    const firstStart = firstStartByContestant.get(row.cand.contestantId);
    if (firstStart == null || row.start < firstStart) firstStartByContestant.set(row.cand.contestantId, row.start);
    const lastEnd = lastEndByContestant.get(row.cand.contestantId);
    if (lastEnd == null || row.end > lastEnd) lastEndByContestant.set(row.cand.contestantId, row.end);
  };

  const validateMealSimultaneity = () => {
    const totalBuckets = Math.max(0, Math.ceil((mealEnd - mealStart) / GRID));
    const occ = Array<number>(totalBuckets).fill(0);
    for (const it of mealIntervals) {
      const from = Math.max(it.start, mealStart);
      const to = Math.min(it.end, mealEnd);
      for (let t = from; t < to; t += GRID) {
        const idx = Math.floor((t - mealStart) / GRID);
        if (idx < 0 || idx >= totalBuckets) continue;
        occ[idx] += 1;
        if (occ[idx] > contestantMealMaxSim) {
          return {
            ok: false as const,
            bucket: t,
            count: occ[idx],
          };
        }
      }
    }
    return { ok: true as const };
  };

  const mealCapacityValidation = validateMealSimultaneity();
  if (!mealCapacityValidation.ok) {
    return hardInfeasible([{
      code: 'MEAL_CONTESTANT_NO_FIT',
        message:
          `Violación interna de simultaneidad en comidas a las ${toHHMM(mealCapacityValidation.bucket)}: ` +
          `${mealCapacityValidation.count} > máximo ${contestantMealMaxSim}.`,
        diagnostic: {
          failReason: 'post_assignment_capacity_violation',
          bucket: toHHMM(mealCapacityValidation.bucket),
          count: mealCapacityValidation.count,
          maxSimultaneous: contestantMealMaxSim,
        },
      }]);
  }

  const pendingNonMeal = (tasksSorted as any[]).filter((task) => {
    if (isMealTask(task) || isResourceBreakTask(task)) return false;

    const taskId = Number(task?.id);
    if (!Number.isFinite(taskId)) return false;

    const status = String(task?.status ?? "pending");
    const isFixed =
      status === "in_progress" ||
      status === "done" ||
      lockedTaskIds.has(taskId) ||
      Boolean(task?.isManualBlock);
    if (isFixed) return false; // no tocar lo ejecutado

    return true;
  });
  

  const plannedByTaskId = new Map<number, any>();
  const rebuildPlannedByTask = () => {
    plannedByTaskId.clear();
    for (const p of plannedTasks as any[]) {
      plannedByTaskId.set(Number(p.taskId), p);
    }
  };
  rebuildPlannedByTask();

  const globalGapRelocationAttemptsByTaskId = new Map<number, { attempted: boolean; succeeded: boolean }>();

  const isImmovableTask = (task: any) => {
    const taskId = Number(task?.id);
    const status = String(task?.status ?? "pending");
    return (
      status === "in_progress" ||
      status === "done" ||
      Boolean(task?.isManualBlock) ||
      lockedTaskIds.has(taskId)
    );
  };

  const removeTaskFromOccupancy = (task: any, planned: any) => {
    const taskId = Number(task?.id);
    const start = toMinutes(String(planned?.startPlanned));
    const end = toMinutes(String(planned?.endPlanned));
    const contestantId = getContestantId(task);
    const spaceId = getSpaceId(task);
    const zoneId = getZoneId(task);
    const itinerantTeamId = Number(task?.itinerantTeamId ?? 0);

    const pull = (arr: Interval[] | undefined) => (arr ?? []).filter((it) => Number(it.taskId) !== taskId || it.start !== start || it.end !== end);

    if (contestantId) occupiedByContestant.set(contestantId, pull(occupiedByContestant.get(contestantId)));
    if (spaceId) occupiedBySpace.set(spaceId, pull(occupiedBySpace.get(spaceId)));
    if (zoneId) occupiedByZoneMeal.set(zoneId, pull(occupiedByZoneMeal.get(zoneId)));
    if (itinerantTeamId > 0) occupiedByItinerant.set(itinerantTeamId, pull(occupiedByItinerant.get(itinerantTeamId)));
    for (const pid of Array.isArray(planned?.assignedResources) ? planned.assignedResources : []) {
      occupiedByResource.set(Number(pid), pull(occupiedByResource.get(Number(pid))));
    }
  };

  const canPlaceTaskAtWithCurrentOccupancy = (task: any, planned: any, start: number) => {
    const duration = Math.max(5, Math.floor(Number(task?.durationOverrideMin ?? 30)));
    const finish = start + duration;
    const contestantId = getContestantId(task);
    const spaceId = getSpaceId(task);
    const zoneId = getZoneId(task);
    if (!spaceId || !zoneId) return null;

    const earliestByDeps = snapUp(Math.max(startDay, depsEnd(task)));
    if (start < earliestByDeps) return null;

    if (optMainZoneId && Number(zoneId) === Number(optMainZoneId) && start < mainStartGateMin) return null;

    const effWin = getContestantEffectiveWindow(contestantId);
    if (effWin) {
      if (start < effWin.start || finish > effWin.end) return null;
    }
    if (finish > endDay) return null;

    const spaceOcc = occupiedBySpace.get(spaceId) ?? [];
    if (findEarliestGap(spaceOcc, start, duration) !== start) return null;
    const zoneOcc = occupiedByZoneMeal.get(zoneId) ?? [];
    if (findEarliestGap(zoneOcc, start, duration) !== start) return null;

    if (contestantId) {
      const cOcc = occupiedByContestant.get(contestantId) ?? [];
      if (findEarliestGap(cOcc, start, duration) !== start) return null;
    }

    const assigned = Array.isArray(planned?.assignedResources) ? planned.assignedResources.map((v:any)=>Number(v)).filter((v:number)=>Number.isFinite(v)&&v>0) : [];
    for (const pid of assigned) {
      const rOcc = occupiedByResource.get(pid) ?? [];
      if (findEarliestGap(rOcc, start, duration) !== start) return null;
    }

    return { start, end: finish, assigned };
  };

  const addTaskToOccupancy = (task: any, placement: { start: number; end: number; assigned: number[] }) => {
    const taskId = Number(task?.id);
    const contestantId = getContestantId(task);
    const spaceId = getSpaceId(task);
    const zoneId = getZoneId(task);
    const itinerantTeamId = Number(task?.itinerantTeamId ?? 0);

    if (contestantId) {
      const arr = occupiedByContestant.get(contestantId) ?? [];
      addIntervalSorted(arr, { start: placement.start, end: placement.end, taskId });
      occupiedByContestant.set(contestantId, arr);
    }
    if (spaceId) {
      const arr = occupiedBySpace.get(spaceId) ?? [];
      addIntervalSorted(arr, { start: placement.start, end: placement.end, taskId });
      occupiedBySpace.set(spaceId, arr);
    }
    if (zoneId) {
      const arr = occupiedByZoneMeal.get(zoneId) ?? [];
      addIntervalSorted(arr, { start: placement.start, end: placement.end, taskId });
      occupiedByZoneMeal.set(zoneId, arr);
    }
    if (itinerantTeamId > 0) {
      const arr = occupiedByItinerant.get(itinerantTeamId) ?? [];
      addIntervalSorted(arr, { start: placement.start, end: placement.end, taskId });
      occupiedByItinerant.set(itinerantTeamId, arr);
    }
    for (const pid of placement.assigned) {
      const arr = occupiedByResource.get(pid) ?? [];
      addIntervalSorted(arr, { start: placement.start, end: placement.end, taskId });
      occupiedByResource.set(pid, arr);
    }
  };

  const runMainZoneNoIdlePass = () => {
    // NOTE: este pase aplica dos estrategias en zona principal:
    // 1) compactación a la izquierda (no-idle), y
    // 2) start gating con desplazamiento a la derecha de bloques previos a tareas inmovibles.
    if (!directorModeEnabled || !optMainZoneId) return;

    rebuildPlannedByTask();
    const targetSpaces = Array.from(spaceZoneById.entries())
      .filter(([, zid]) => Number(zid) === Number(optMainZoneId))
      .map(([sid]) => Number(sid));

    const blockers = new Set<string>();
    let globalAttempts = 0;

    const sortedPlannedRows = () =>
      (plannedTasks as any[])
        .map((p) => ({ p, task: taskById.get(Number(p.taskId)) }))
        .filter(({ task }) => Boolean(task))
        .sort(
          (a, b) =>
            toMinutes(String(a.p.startPlanned)) - toMinutes(String(b.p.startPlanned)) ||
            (toMinutes(String(a.p.endPlanned)) - toMinutes(String(b.p.endPlanned))) ||
            (Number(a.p.taskId) - Number(b.p.taskId)),
        );

    const findBlockingReasonForGap = (gap: MainZoneGap) =>
      explainMainZoneGaps({
        gaps: [gap],
        plannedTasks: plannedTasks as any,
        taskById,
        getContestantId,
        getSpaceId,
        lockedTaskIds,
        relocationAttemptsByTaskId: globalGapRelocationAttemptsByTaskId,
      })[0] ?? null;

    const tryMoveTaskToCandidate = (row: { p: any; task: any }, candidateStart: number, gapStart: number, gapEnd: number) => {
      const task = row.task;
      const planned = row.p;
      const taskId = Number(task?.id);
      const oldStart = toMinutes(String(planned.startPlanned));
      const oldEnd = toMinutes(String(planned.endPlanned));
      const duration = oldEnd - oldStart;
      if (duration <= 0) return false;
      if (rangesOverlap(candidateStart, candidateStart + duration, gapStart, gapEnd)) return false;

      removeTaskFromOccupancy(task, planned);
      const placed = canPlaceTaskAtWithCurrentOccupancy(task, planned, candidateStart);
      if (!placed) {
        addTaskToOccupancy(task, {
          start: oldStart,
          end: oldEnd,
          assigned: Array.isArray(planned?.assignedResources)
            ? planned.assignedResources.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
            : [],
        });
        return false;
      }

      planned.startPlanned = toHHMM(placed.start);
      planned.endPlanned = toHHMM(placed.end);
      addTaskToOccupancy(task, placed);
      return true;
    };

    const tryRelocateBlockerOutsideGap = (blockerTaskId: number, gapStart: number, gapEnd: number) => {
      const row = sortedPlannedRows().find((x) => Number(x.p.taskId) === Number(blockerTaskId));
      if (!row || !row.task) return false;
      if (isImmovableTask(row.task)) return false;

      const oldStart = toMinutes(String(row.p.startPlanned));
      const oldEnd = toMinutes(String(row.p.endPlanned));
      const duration = oldEnd - oldStart;
      if (duration <= 0) return false;

      const minSearch = Math.max(startDay, oldStart - 120);
      const maxSearch = Math.min(endDay, oldEnd + 120);

      const rightCandidates: number[] = [];
      for (let t = snapUp(oldStart + GRID); t + duration <= maxSearch; t += GRID) rightCandidates.push(t);

      const leftCandidates: number[] = [];
      for (let t = snapUp(oldStart - GRID); t >= minSearch; t -= GRID) leftCandidates.push(t);

      const normalizeCandidates = (arr: number[]) =>
        Array.from(new Set(arr))
          .filter((v) => Number.isFinite(v))
          .sort((a, b) => a - b);

      for (const candidateStart of normalizeCandidates(rightCandidates)) {
        if (globalAttempts >= DIRECTOR_MODE_MAX_GLOBAL_ATTEMPTS) break;
        globalAttempts++;
        if (tryMoveTaskToCandidate(row, candidateStart, gapStart, gapEnd)) return true;
      }

      for (const candidateStart of normalizeCandidates(leftCandidates)) {
        if (globalAttempts >= DIRECTOR_MODE_MAX_GLOBAL_ATTEMPTS) break;
        globalAttempts++;
        if (tryMoveTaskToCandidate(row, candidateStart, gapStart, gapEnd)) return true;
      }

      return false;
    };

    const tryMoveSequentialBlock = (block: Array<{ p: any; task: any }>, targetFirstStart: number) => {
      if (!block.length) return false;
      if (!Number.isFinite(targetFirstStart)) return false;

      const snappedTargetStart = snapUp(targetFirstStart);
      const firstCurrentStart = toMinutes(String(block[0].p.startPlanned));
      if (snappedTargetStart <= firstCurrentStart) return false;
      if (snappedTargetStart < startDay || snappedTargetStart >= endDay) return false;

      const snapshots = block.map(({ p, task }) => ({
        p,
        task,
        oldStart: String(p.startPlanned),
        oldEnd: String(p.endPlanned),
        assigned: Array.isArray(p?.assignedResources)
          ? p.assignedResources.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
          : [],
      }));

      for (const { task, p } of block) removeTaskFromOccupancy(task, p);

      let ok = true;
      const placements: Array<{ row: { p: any; task: any }; start: number; end: number; assigned: number[] }> = [];
      let cursorStart = snappedTargetStart;

      for (const row of block) {
        const placed = canPlaceTaskAtWithCurrentOccupancy(row.task, row.p, cursorStart);
        if (!placed || placed.start < startDay || placed.end > endDay) {
          ok = false;
          break;
        }
        placements.push({ row, ...placed });
        addTaskToOccupancy(row.task, placed);
        cursorStart = placed.end;
      }

      if (ok) {
        for (const placement of placements) {
          placement.row.p.startPlanned = toHHMM(placement.start);
          placement.row.p.endPlanned = toHHMM(placement.end);
        }
        return true;
      }

      for (const placement of placements) {
        const prevStart = String(placement.row.p.startPlanned);
        const prevEnd = String(placement.row.p.endPlanned);

        placement.row.p.startPlanned = toHHMM(placement.start);
        placement.row.p.endPlanned = toHHMM(placement.end);

        removeTaskFromOccupancy(placement.row.task, placement.row.p);

        placement.row.p.startPlanned = prevStart;
        placement.row.p.endPlanned = prevEnd;
      }
      for (const snap of snapshots) {
        snap.p.startPlanned = snap.oldStart;
        snap.p.endPlanned = snap.oldEnd;
        addTaskToOccupancy(snap.task, {
          start: toMinutes(snap.oldStart),
          end: toMinutes(snap.oldEnd),
          assigned: snap.assigned,
        });
      }
      return false;
    };

    for (const spaceId of targetSpaces) {
      const spaceTasks = (plannedTasks as any[])
        .map((p) => ({ p, task: taskById.get(Number(p.taskId)) }))
        .filter(({ task }) => task && Number(getSpaceId(task)) === Number(spaceId) && !isMealTask(task))
        .sort((a, b) => toMinutes(a.p.startPlanned) - toMinutes(b.p.startPlanned));

      if (spaceTasks.length <= 1) continue;

      let leftCursor = toMinutes(spaceTasks[0].p.startPlanned);
      for (const row of spaceTasks) {
        const planned = row.p;
        const task = row.task;
        const oldStart = toMinutes(planned.startPlanned);
        if (isImmovableTask(task)) {
          leftCursor = Math.max(leftCursor, toMinutes(planned.endPlanned));
          blockers.add("tasks locked");
          continue;
        }

        removeTaskFromOccupancy(task, planned);

        let placed = canPlaceTaskAtWithCurrentOccupancy(task, planned, snapUp(Math.min(leftCursor, oldStart)));
        if (!placed) {
          const earliest = findEarliestGap(occupiedBySpace.get(spaceId) ?? [], snapUp(Math.min(leftCursor, oldStart)), Math.max(5, Math.floor(Number(task?.durationOverrideMin ?? 30))));
          if (earliest <= oldStart) placed = canPlaceTaskAtWithCurrentOccupancy(task, planned, earliest);
        }

        if (!placed) {
          placed = canPlaceTaskAtWithCurrentOccupancy(task, planned, oldStart);
          blockers.add("resource/availability constraints");
        }

        if (placed) {
          planned.startPlanned = toHHMM(placed.start);
          planned.endPlanned = toHHMM(placed.end);
          addTaskToOccupancy(task, placed);
          leftCursor = Math.max(leftCursor, placed.end);
        } else {
          addTaskToOccupancy(task, {
            start: toMinutes(planned.startPlanned),
            end: toMinutes(planned.endPlanned),
            assigned: Array.isArray(planned?.assignedResources)
              ? planned.assignedResources.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
              : [],
          });
          leftCursor = Math.max(leftCursor, toMinutes(planned.endPlanned));
        }
      }
    }

    const startGatingWarnings: Array<{ spaceId: number; reason: string }> = [];

    if (
      directorModeEnabled &&
      optMainZoneId &&
      mainZoneKeepBusyStrength >= DIRECTOR_MODE_KEEP_BUSY_THRESHOLD &&
      effectiveFinishEarlyWeight === 0
    ) {
      for (const spaceId of targetSpaces) {
        const entries = (plannedTasks as any[])
          .map((p) => ({ p, task: taskById.get(Number(p.taskId)) }))
          .filter(({ task }) => task && Number(getSpaceId(task)) === Number(spaceId) && !isMealTask(task))
          .sort((a, b) => toMinutes(a.p.startPlanned) - toMinutes(b.p.startPlanned));

        if (entries.length <= 1) continue;

        let moved = false;
        for (let i = 0; i < entries.length - 1; i++) {
          const currentEnd = toMinutes(String(entries[i].p.endPlanned));
          const nextStart = toMinutes(String(entries[i + 1].p.startPlanned));
          if (nextStart - currentEnd < GRID) continue;

          const block: Array<{ p: any; task: any }> = [];
          for (let cursor = 0; cursor <= i; cursor++) {
            const candidate = entries[cursor];
            if (isImmovableTask(candidate.task)) {
              block.length = 0;
              break;
            }
            block.push(candidate);
          }
          if (!block.length) continue;

          const totalDuration = block.reduce((acc, row) => {
            const start = toMinutes(String(row.p.startPlanned));
            const end = toMinutes(String(row.p.endPlanned));
            return acc + Math.max(GRID, end - start);
          }, 0);

          const currentFirstStart = toMinutes(String(block[0].p.startPlanned));
          const targetFirstStart = snapUp(nextStart - totalDuration);
          if (targetFirstStart <= currentFirstStart) continue;

          globalAttempts++;
          if (globalAttempts >= DIRECTOR_MODE_MAX_GLOBAL_ATTEMPTS) break;

          if (tryMoveSequentialBlock(block, targetFirstStart)) {
            moved = true;
            break;
          }
        }

        if (moved) rebuildPlannedByTask();
      }
    }

    for (const spaceId of targetSpaces) {
      const entries = (plannedTasks as any[])
        .map((p) => ({ p, task: taskById.get(Number(p.taskId)) }))
        .filter(({ task }) => task && Number(getSpaceId(task)) === Number(spaceId) && !isMealTask(task))
        .sort((a, b) => toMinutes(a.p.startPlanned) - toMinutes(b.p.startPlanned));

      if (entries.length <= 1) continue;

      for (let i = 1; i < entries.length; i++) {
        if (globalAttempts >= DIRECTOR_MODE_MAX_GLOBAL_ATTEMPTS) break;
        const prev = entries[i - 1];
        const next = entries[i];

        const gapStart = toMinutes(prev.p.endPlanned);
        const gapEnd = toMinutes(next.p.startPlanned);
        const rawGap = gapEnd - gapStart;
        const gapMinutes = rawGap - (rawGap % GRID);
        if (gapMinutes < GRID) continue;

        if (!isImmovableTask(next.task)) continue;

        const block: Array<{ p: any; task: any }> = [];
        let cursor = i - 1;
        while (cursor >= 0) {
          const current = entries[cursor];
          if (isImmovableTask(current.task)) break;
          block.unshift(current);
          cursor--;
        }
        if (!block.length) continue;

        const durations = block.map(({ p }) =>
          Math.max(5, toMinutes(String(p.endPlanned)) - toMinutes(String(p.startPlanned))),
        );
        const totalDuration = durations.reduce((acc, d) => acc + d, 0);
        const oldFirstStart = toMinutes(String(block[0].p.startPlanned));
        const targetFirstStart = gapEnd - totalDuration;
        const rawRequiredShift = targetFirstStart - oldFirstStart;
        const requiredShift = rawRequiredShift - (rawRequiredShift % GRID);

        if (requiredShift < GRID) continue;

        let attemptsForGap = 0;
        attemptsForGap++;
        globalAttempts++;
        const moved = tryMoveSequentialBlock(block, targetFirstStart);

        if (!moved || attemptsForGap > DIRECTOR_MODE_MAX_ATTEMPTS_PER_GAP) {
          startGatingWarnings.push({
            spaceId,
            reason: `no se pudo mover un bloque ${requiredShift} min (grid ${GRID}) sin romper dependencias/ventanas/recursos/ocupación`,
          });
        }
      }
    }

    if (mainZoneKeepBusyStrength >= DIRECTOR_MODE_KEEP_BUSY_THRESHOLD) {
      let attemptsByGap = new Map<string, number>();
      let movedAny = true;

      while (movedAny && globalAttempts < DIRECTOR_MODE_MAX_GLOBAL_ATTEMPTS) {
        movedAny = false;
        rebuildPlannedByTask();

        const mainZoneGaps = computeMainZoneGaps({
          zoneId: optMainZoneId,
          plannedTasks: plannedTasks as any,
          taskById,
          getSpaceId,
          getZoneId,
          getZoneIdForSpace,
        }).sort((a, b) => b.durationMin - a.durationMin || a.start - b.start || a.spaceId - b.spaceId);

        if (!mainZoneGaps.length) break;

        for (const gap of mainZoneGaps) {
          if (globalAttempts >= DIRECTOR_MODE_MAX_GLOBAL_ATTEMPTS) break;
          const gapKey = `${gap.spaceId}:${gap.start}:${gap.end}:${gap.nextTaskId ?? 0}`;
          const used = attemptsByGap.get(gapKey) ?? 0;
          if (used >= DIRECTOR_MODE_MAX_ATTEMPTS_PER_GAP) continue;

          const nextTaskId = Number(gap.nextTaskId ?? NaN);
          const nextTask = taskById.get(nextTaskId);
          const nextPlanned = plannedByTaskId.get(nextTaskId);
          if (!nextTask || !nextPlanned || isImmovableTask(nextTask)) continue;

          const originalStart = toMinutes(String(nextPlanned.startPlanned));
          attemptsByGap.set(gapKey, used + 1);
          globalAttempts++;
          if (gap.start < originalStart && tryMoveTaskToCandidate({ p: nextPlanned, task: nextTask }, gap.start, Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER)) {
            movedAny = true;
            break;
          }

          const reason = findBlockingReasonForGap(gap);
          if (!reason?.blockingTaskId) continue;
          if (reason.type !== "CONTESTANT_BUSY" && reason.type !== "RESOURCE_BUSY") continue;

          const blockerTaskId = Number(reason.blockingTaskId);
          const blockerTask = taskById.get(blockerTaskId);
          if (!blockerTask || isImmovableTask(blockerTask)) continue;

          const relocated = tryRelocateBlockerOutsideGap(blockerTaskId, gap.start, gap.end);
          globalGapRelocationAttemptsByTaskId.set(blockerTaskId, { attempted: true, succeeded: relocated });

          if (!relocated) continue;

          rebuildPlannedByTask();
          const refreshedNext = plannedByTaskId.get(nextTaskId);
          if (!refreshedNext) continue;
          const refreshedTask = taskById.get(nextTaskId);
          const refreshedStart = toMinutes(String(refreshedNext.startPlanned));
          globalAttempts++;
          if (gap.start < refreshedStart && tryMoveTaskToCandidate({ p: refreshedNext, task: refreshedTask }, gap.start, Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER)) {
            movedAny = true;
            break;
          }
        }
      }
    }

    const remainingGaps: Array<{ spaceId: number; start: number; end: number }> = [];
    for (const spaceId of targetSpaces) {
      const entries = (plannedTasks as any[])
        .map((p) => ({ p, task: taskById.get(Number(p.taskId)) }))
        .filter(({ task }) => task && Number(getSpaceId(task)) === Number(spaceId) && !isMealTask(task))
        .sort((a, b) => toMinutes(a.p.startPlanned) - toMinutes(b.p.startPlanned));
      for (let i = 1; i < entries.length; i++) {
        if (globalAttempts >= DIRECTOR_MODE_MAX_GLOBAL_ATTEMPTS) break;
        const prevEnd = toMinutes(entries[i - 1].p.endPlanned);
        const nextStart = toMinutes(entries[i].p.startPlanned);
        if (nextStart - prevEnd > 1) remainingGaps.push({ spaceId, start: prevEnd, end: nextStart });
      }
    }

    if (remainingGaps.length > 0) {
      warnings.push({
        code: "MAIN_ZONE_NO_IDLE_NOT_ACHIEVABLE",
        message: `No se pudo garantizar “sin tiempos muertos” en el plató principal por restricciones: ${Array.from(blockers).join(", ") || "ventanas concursantes/recursos/bloqueos"}.`,
      });
    }

    if (startGatingWarnings.length > 0) {
      const sample = startGatingWarnings
        .slice(0, 3)
        .map((w) => `espacio ${w.spaceId}: ${w.reason}`)
        .join("; ");
      warnings.push({
        code: "MAIN_ZONE_START_GATING_LIMITED",
        message:
          `Se detectaron huecos internos antes de tareas inmovibles en el plató principal, pero no fue posible desplazar bloques sin violar restricciones. Causas típicas: dependencias, ventanas de concursantes, recursos o ocupación de espacio. Ejemplos: ${sample}.`,
      });
    }
  };

  const hasOverlapInPlannedTasks = () => {
    const byContestant = new Map<number, Array<{ start: number; end: number }>>();
    const byResource = new Map<number, Array<{ start: number; end: number }>>();

    const normalizeAssigned = (raw: any): number[] => {
      if (!raw) return [];
      let arr: any[] = [];
      if (Array.isArray(raw)) arr = raw;
      else if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) arr = parsed;
        } catch {
          arr = [];
        }
      }
      return Array.from(
        new Set(
          arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0),
        ),
      );
    };

    for (const p of plannedTasks as any[]) {
      const task = taskById.get(Number(p.taskId));
      const start = toMinutes(p.startPlanned);
      const end = toMinutes(p.endPlanned);

      const contestantId = getContestantId(task);
      if (contestantId) {
        const list = byContestant.get(contestantId) ?? [];
        list.push({ start, end });
        byContestant.set(contestantId, list);
      }

      for (const rid of normalizeAssigned(p?.assignedResources ?? null)) {
        const list = byResource.get(rid) ?? [];
        list.push({ start, end });
        byResource.set(rid, list);
      }
    }

    const hasOverlap = (list: Array<{ start: number; end: number }>) => {
      list.sort((a, b) => a.start - b.start);
      for (let i = 1; i < list.length; i++) {
        if (list[i].start < list[i - 1].end) return true;
      }
      return false;
    };

    for (const list of byContestant.values()) {
      if (hasOverlap(list)) return true;
    }
    for (const list of byResource.values()) {
      if (hasOverlap(list)) return true;
    }
    return false;
  };

  let feedMainInsightDetails: { mainTargetTpl: number; topFeedersReady: Array<{ taskId: number; name: string; unlockScore: number; depth1: number; depth2: number }> } | null = null;
  let mainTemplateSwitchInsight:
    | { fromTpl: number; toTpl: number; hadFeedersReady: boolean; feedersReadyCount: number }
    | null = null;
  let scoringDiagnosticDetails: { readyCount: number; mainTargetTpl: number | null; feedersReadyCount: number; usedFallback: boolean } | null = null;

  while (pendingNonMeal.length) {
    const ready = pendingNonMeal.filter((t) => depsSatisfied(t));
    if (!ready.length) {
      const t = pendingNonMeal[0];
      const depIds = getDepTaskIds(t).filter(
        (x) =>
          !plannedEndByTaskId.has(Number(x)) &&
          !fixedEndByTaskId.has(Number(x)),
      );
      const taskId = Number(t?.id);
      const hardLocked = lockedTaskIds.has(taskId) || Number.isFinite(forcedStartByTaskId.get(taskId)) || Number.isFinite(forcedEndByTaskId.get(taskId));
      const missingDependencies = depIds.map((depId) => {
        const depTask = taskById.get(Number(depId));
        const depContestantId = Number(depTask?.contestantId ?? 0);
        return {
          taskId: Number(depId),
          name: String(depTask?.templateName ?? `tarea ${depId}`),
          contestantId: Number.isFinite(depContestantId) && depContestantId > 0 ? depContestantId : undefined,
        };
      });
      const reason = {
        code: "DEPENDENCY_NOT_SCHEDULED",
        message:
          `No se puede planificar "${String(t?.templateName ?? `tarea ${t?.id}`)}" porque faltan tareas previas requeridas.`,
        taskId,
        details: { missingDependencyTaskIds: depIds, missingDependencies },
      };
      if (hardLocked) return hardInfeasible([reason]);
      unplanned.push({ taskId, reason });
      pendingNonMeal.splice(0, 1);
      continue;
    }

    const readyTemplateCountsByZone = new Map<number, Map<number, number>>();
    for (const readyTask of ready) {
      const zid = Number(getZoneId(readyTask) ?? NaN);
      const tpl = Number(readyTask?.templateId ?? NaN);
      if (!Number.isFinite(zid) || zid <= 0 || !Number.isFinite(tpl) || tpl <= 0) continue;
      const byTpl = readyTemplateCountsByZone.get(zid) ?? new Map<number, number>();
      byTpl.set(tpl, (byTpl.get(tpl) ?? 0) + 1);
      readyTemplateCountsByZone.set(zid, byTpl);
    }

    const pendingTemplateCountsByGroupingKey = new Map<string, Map<number, number>>();
    for (const pendingTask of pendingNonMeal as any[]) {
      const pendingSpace = getSpaceId(pendingTask);
      if (!pendingSpace) continue;
      const pendingCfg = getGroupingConfigForSpace(pendingSpace);
      if (!pendingCfg) continue;
      const pendingZoneId = getZoneId(pendingTask) ?? getZoneIdForSpace(pendingSpace);
      if (!isGroupingEnabledForZone(pendingZoneId)) continue;
      const pendingTpl = Number(pendingTask?.templateId ?? 0);
      if (!Number.isFinite(pendingTpl) || pendingTpl <= 0) continue;
      const byTpl = pendingTemplateCountsByGroupingKey.get(pendingCfg.key) ?? new Map<number, number>();
      byTpl.set(pendingTpl, (byTpl.get(pendingTpl) ?? 0) + 1);
      pendingTemplateCountsByGroupingKey.set(pendingCfg.key, byTpl);
    }

    const readyMainBySpaceByTpl = new Map<number, Map<number, { count: number; minutes: number }>>();
    for (const readyTask of ready) {
      if (!optMainZoneId) continue;
      if (Number(getZoneId(readyTask)) !== Number(optMainZoneId)) continue;
      if (isMealTask(readyTask)) continue;
      const readySpaceId = Number(getSpaceId(readyTask) ?? NaN);
      if (!Number.isFinite(readySpaceId) || readySpaceId <= 0) continue;
      const readyTemplateId = Number(readyTask?.templateId ?? NaN);
      if (!Number.isFinite(readyTemplateId) || readyTemplateId <= 0) continue;
      const readyDuration = Math.max(5, Math.floor(Number(readyTask?.durationOverrideMin ?? 30)));
      const byTemplate = readyMainBySpaceByTpl.get(readySpaceId) ?? new Map<number, { count: number; minutes: number }>();
      const current = byTemplate.get(readyTemplateId) ?? { count: 0, minutes: 0 };
      current.count += 1;
      current.minutes += readyDuration;
      byTemplate.set(readyTemplateId, current);
      readyMainBySpaceByTpl.set(readySpaceId, byTemplate);
    }
    const hasNonMainReady = ready.some((t) => Number(getZoneId(t)) !== Number(optMainZoneId));
    const pendingTaskIds = new Set<number>(pendingNonMeal.map((t) => Number(t?.id)).filter((id) => Number.isFinite(id) && id > 0));
    const pendingMainTasks = (pendingNonMeal as any[]).filter((task) => Number(getZoneId(task)) === Number(optMainZoneId));
    const getMainTargetTemplateId = () => {
      if (!optMainZoneId || pendingMainTasks.length === 0) return null;

      const pendingMainByTpl = new Map<number, number>();
      for (const task of pendingMainTasks) {
        const taskId = Number(task?.id ?? 0);
        if (!Number.isFinite(taskId) || taskId <= 0) continue;
        const status = String(task?.status ?? "pending");
        if (status === "in_progress" || status === "done") continue;
        const tpl = Number(task?.templateId ?? NaN);
        if (!Number.isFinite(tpl) || tpl <= 0) continue;
        pendingMainByTpl.set(tpl, (pendingMainByTpl.get(tpl) ?? 0) + 1);
      }

      if (pendingMainByTpl.size === 0) return null;

      const activeMainTpl = activeTemplateByZoneId.get(Number(optMainZoneId));
      if (Number.isFinite(Number(activeMainTpl)) && Number(activeMainTpl) > 0) {
        return Number(activeMainTpl);
      }

      const inferredMainTpl = Array.from(pendingMainByTpl.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
      if (!Number.isFinite(Number(inferredMainTpl)) || Number(inferredMainTpl) <= 0) return null;
      return Number(inferredMainTpl);
    };
    const mainTargetTpl = getMainTargetTemplateId();
    const canFeedMainActive = Boolean(feedMainActiveEnabled && Number.isFinite(Number(mainTargetTpl)) && Number(mainTargetTpl) > 0);
    const canApplyLookahead2 = Boolean(canFeedMainActive && mainZoneKeepBusyStrength >= 9 && globalGroupingStrength10 >= 9);

    const unlockStatsForTask = (candidate: any) => {
      if (!canApplyLookahead2 || !optMainZoneId) return { depth1: 0, depth2: 0, unlockScore: 0 };
      if (Number(getZoneId(candidate)) === Number(optMainZoneId)) return { depth1: 0, depth2: 0, unlockScore: 0 };
      const candidateId = Number(candidate?.id ?? 0);
      if (!Number.isFinite(candidateId) || candidateId <= 0) return { depth1: 0, depth2: 0, unlockScore: 0 };

      let depth1 = 0;
      let depth2 = 0;
      for (const depTaskId of getDependents(candidateId)) {
        if (!pendingTaskIds.has(Number(depTaskId))) continue;
        const depTask = taskById.get(Number(depTaskId));
        if (!depTask) continue;
        if (Number(getZoneId(depTask) ?? depTask?.zoneId ?? 0) !== Number(optMainZoneId)) continue;
        if (Number(depTask?.templateId ?? 0) !== Number(mainTargetTpl)) continue;
        if (String(depTask?.status ?? "pending") !== "pending") continue;
        depth1 += 1;

        for (const prereqId of getDepTaskIds(depTask)) {
          const pId = Number(prereqId);
          if (!Number.isFinite(pId) || pId <= 0 || pId === candidateId) continue;
          if (!pendingTaskIds.has(pId)) continue;
          const prereqTask = taskById.get(pId);
          if (!prereqTask) continue;
          if (Number(getZoneId(prereqTask) ?? prereqTask?.zoneId ?? 0) === Number(optMainZoneId)) continue;
          const status = String(prereqTask?.status ?? "pending");
          if (status === "in_progress" || status === "done") continue;
          depth2 += 1;
        }
      }

      const unlockScore = depth1 * 1.0 + depth2 * 0.5;
      return { depth1, depth2, unlockScore };
    };

    const feederStatsByTaskId = new Map<number, { depth1: number; depth2: number; unlockScore: number }>();
    const feedersReady = ready
      .filter((t) => Number(getZoneId(t)) !== Number(optMainZoneId))
      .map((t) => {
        const stats = unlockStatsForTask(t);
        const taskId = Number(t?.id ?? 0);
        feederStatsByTaskId.set(taskId, stats);
        return {
          taskId,
          name: String(t?.templateName ?? t?.manualTitle ?? `Tarea #${Number(t?.id ?? 0)}`),
          ...stats,
        };
      })
      .filter((x) => x.unlockScore > 0)
      .sort((a, b) => b.unlockScore - a.unlockScore || b.depth1 - a.depth1 || b.depth2 - a.depth2 || a.taskId - b.taskId);

    if (canApplyLookahead2 && mainTargetTpl && feedersReady.length > 0) {
      feedMainInsightDetails = {
        mainTargetTpl: Number(mainTargetTpl),
        topFeedersReady: feedersReady.slice(0, 5),
      };
    }
    const shouldGateMainStart = Boolean(
      optMainZoneId &&
      !lastEndByZone.has(optMainZoneId) &&
      mainZoneKeepBusyStrength >= DIRECTOR_MODE_KEEP_BUSY_THRESHOLD &&
      effectiveFinishEarlyWeight === 0,
    );

    const readyFeedersCount = feedersReady.length;
    const unlockScoreTotal = feedersReady.reduce((acc, feeder) => acc + Number(feeder.unlockScore ?? 0), 0);

    // ✅ Helper: mismo scoring que usamos en ready.sort, pero para 1 tarea
    const scoreTaskForSelection = (t: any, useHeuristics = true) => {
      const space = getSpaceId(t) ?? 0;
      const tpl = Number(t?.templateId ?? 0);
      const zone = getZoneId(t);

      let s = 0;

      if (isGroupingEnabledForZone(zone)) {
        const zid = Number(zone ?? NaN);
        const activeTpl = activeTemplateByZoneId.get(zid);
        const readyByTpl = readyTemplateCountsByZone.get(zid) ?? new Map<number, number>();
        const hasActiveReady = Number(readyByTpl.get(Number(activeTpl ?? NaN)) ?? 0) > 0;
        const switches = Number(templateSwitchesByZoneId.get(zid) ?? 0);
        const maxChangesRaw = Number((maxTemplateChangesByZoneId as any)?.[zid] ?? 4);
        const maxChanges = Number.isFinite(maxChangesRaw) ? Math.max(0, Math.floor(maxChangesRaw)) : 4;

        if (Number.isFinite(Number(activeTpl)) && Number(activeTpl) > 0) {
          if (Number(tpl) === Number(activeTpl)) {
            s += 9_000_000;
          } else {
            if (hasActiveReady) s -= 7_500_000;
            if (switches >= maxChanges && hasActiveReady) s -= 1_000_000_000;
          }
        }
      }

      // 1) Director mode: prioridad global de tareas de plató principal
      if (directorModeEnabled && optMainZoneId && zone === optMainZoneId) {
        let canForceMainStart = true;
        if (shouldGateMainStart) {
          const readyMainByTpl = readyMainBySpaceByTpl.get(Number(space ?? NaN));
          const readyMainStats = Array.from(readyMainByTpl?.values() ?? []).reduce<{ count: number; minutes: number } | null>(
            (best, tplStats) => {
              if (!best) return tplStats;
              if (tplStats.minutes > best.minutes) return tplStats;
              if (tplStats.minutes === best.minutes && tplStats.count > best.count) return tplStats;
              return best;
            },
            null,
          );
          const hasReadyBlock = Boolean(
            readyMainStats && (readyMainStats.minutes >= 60 || readyMainStats.count >= 2),
          );
          canForceMainStart = !hasNonMainReady || hasReadyBlock;
          const candidateTplStats = readyMainByTpl?.get(tpl);
          const candidateTemplateHasBlock = Boolean(
            candidateTplStats && (candidateTplStats.minutes >= 60 || candidateTplStats.count >= 2),
          );
          if (!candidateTemplateHasBlock) canForceMainStart = false;
          if (!canForceMainStart) s -= 10_000_000;
        }
        if (canForceMainStart) s += 5_000_000;
      }

      if (optMainZoneId && zone === optMainZoneId) {
        const gcfg = space ? getGroupingConfigForSpace(space) : null;
        if (gcfg && isGroupingEnabledForZone(zone)) {
          const streak = streakByKey.get(gcfg.key);
          if (
            streak &&
            streak.templateId !== tpl &&
            streak.streakCount < gcfg.minChain
          ) {
            const lastTplReadyStats = readyMainBySpaceByTpl.get(space)?.get(streak.templateId);
            if ((lastTplReadyStats?.count ?? 0) > 0) {
              s -= 8_000_000;
            }
          }
        }
      }

      // 1.b) Plató principal: “Terminar cuanto antes”
      if (effectiveFinishEarlyWeight > 0 && optMainZoneId && zone === optMainZoneId) {
        s += effectiveFinishEarlyWeight;
      }

      // 2) Plató principal: “Sin huecos” (si ya empezó)
      if (
        effectiveKeepBusyWeight > 0 &&
        optMainZoneId &&
        lastEndByZone.has(optMainZoneId) &&
        zone === optMainZoneId
      ) {
        s += effectiveKeepBusyWeight;
      }

      // 3) Compactar concursantes
      if (effectiveContestantCompactWeight > 0) {
        const cId = getContestantId(t);
        if (cId && lastEndByContestant.has(cId)) s += effectiveContestantCompactWeight;
      }

      // 4) Agrupar tareas iguales en el mismo contenedor de agrupación + contenedor activo
      if (optGroupingLevel > 0 && space) {
        const gcfg = getGroupingConfigForSpace(space);
        const groupingZoneId = zone ?? getZoneIdForSpace(space);
        if (gcfg && isGroupingEnabledForZone(groupingZoneId)) {
          const lastTpl = lastTemplateByKey.get(gcfg.key) ?? null;
          if (lastTpl !== null && lastTpl === tpl) s += effectiveGroupingMatchWeight;
          if (lastTemplateByKey.has(gcfg.key)) s += effectiveGroupingActiveSpaceWeight;
        }
      }

      // 4.b) Minimizar cambios por espacio/zona (config local)
      if (space) {
        const gcfg = getGroupingConfigForSpace(space);
        const pendingByTemplate = gcfg ? pendingTemplateCountsByGroupingKey.get(gcfg.key) ?? null : null;
        s += scoreMinimizeChangesBonus(space, tpl, { pendingByTemplate });
      }

      // 5) Mantener concursante en el mismo plató (heurística blanda)
      if (effectiveContestantStayInZoneWeight > 0) {
        const cId = getContestantId(t);
        if (cId && zone && lastZoneByContestant.get(cId) === zone) {
          s += effectiveContestantStayInZoneWeight;
        }
      }

      if (effectiveContestantTotalSpanWeight > 0) {
        const cId = getContestantId(t);
        if (cId) {
          const firstStart = firstStartByContestant.get(cId);
          const lastEnd = lastEndByContestant.get(cId);
          if (Number.isFinite(firstStart) && Number.isFinite(lastEnd) && Number(lastEnd) >= Number(firstStart)) {
            const openSpan = Math.min(240, Math.max(0, Number(lastEnd) - Number(firstStart)));
            s += openSpan * effectiveContestantTotalSpanWeight;
          } else if (firstStartByContestant.size > 0) {
            s -= Math.round(effectiveContestantTotalSpanWeight * 8);
          }
        }
      }

      if (useHeuristics && canApplyLookahead2 && mainTargetTpl && Number(zone) !== Number(optMainZoneId)) {
        const feederStats = feederStatsByTaskId.get(Number(t?.id ?? 0));
        const unlockScore = Number(feederStats?.unlockScore ?? 0);
        if (unlockScore > 0) {
          s += unlockScore * FEED_MAIN_UNLOCK_BONUS;
        }
      }

      if (
        useHeuristics &&
        canApplyLookahead2 &&
        mainTargetTpl &&
        Number(zone) === Number(optMainZoneId) &&
        Number(tpl) !== Number(mainTargetTpl) &&
        readyFeedersCount > 0 &&
        unlockScoreTotal > 0 &&
        !mainTemplateResetArmed
      ) {
        s -= FEED_MAIN_SWITCH_PENALTY;
      }

      return s;
    };

    // ✅ LOTE 6 (PRO): si el plató principal ya “ha empezado” y hay un hueco real,
    // intentamos rellenarlo con una tarea que ENCAJE exacta en ese hueco.
    // (Solo se aplica a tareas del MISMO espacio dentro del plató principal.)
    if (
      directorModeEnabled &&
      optMainZoneId &&
      lastEndByZone.has(optMainZoneId)
    ) {
      const gap = getMainZoneGap();
      if (gap) {
        const gapCandidates = ready.filter((t) => {
          const zid = getZoneId(t);
          const sid = getSpaceId(t);
          return zid === optMainZoneId && sid === gap.spaceId;
        });

        // Orden estable: usa el MISMO scoring global que ready.sort
        gapCandidates.sort((a, b) => {
          const sa = scoreTaskForSelection(a);
          const sb = scoreTaskForSelection(b);

          const oa = originalOrder.get(Number(a?.id)) ?? 0;
          const ob = originalOrder.get(Number(b?.id)) ?? 0;

          if (sb !== sa) return sb - sa;
          return oa - ob;
        });

        let placedInGap = false;
        for (const cand of gapCandidates) {
          const ok = tryPlaceTaskInExactWindow(
            cand,
            gap.spaceId,
            gap.zoneId,
            gap.gapStart,
            gap.gapEnd,
          );
          if (!ok) continue;

          const idx = pendingNonMeal.findIndex(
            (x) => Number(x?.id) === Number(cand?.id),
          );
          if (idx >= 0) pendingNonMeal.splice(idx, 1);

          placedInGap = true;
          break;
        }

        if (placedInGap) continue; // vuelve al while (recalcula ready/score)
      }
    }

    const computeBestTask = (useHeuristics: boolean, allowAnyScore = false) => {
      const scored = ready
        .map((candidate) => {
          const rawScore = scoreTaskForSelection(candidate, useHeuristics);
          const safeScore = Number.isFinite(rawScore) ? rawScore : -1e15;
          return {
            candidate,
            score: safeScore,
            order: originalOrder.get(Number(candidate?.id)) ?? 0,
          };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.order - b.order;
        });

      const top = scored[0];
      if (!top) return null;
      if (!allowAnyScore && top.score <= -1e12) return null;
      return top.candidate;
    };

    let usedScoringFallback = false;
    let task = computeBestTask(true, false);
    if (!task) {
      task = computeBestTask(false, true);
      usedScoringFallback = Boolean(task);
    }

    scoringDiagnosticDetails = {
      readyCount: ready.length,
      mainTargetTpl: mainTargetTpl ?? null,
      feedersReadyCount: readyFeedersCount,
      usedFallback: usedScoringFallback,
    };

    if (!task) {
      break;
    }
    if (
      canApplyLookahead2 &&
      optMainZoneId &&
      Number(getZoneId(task)) === Number(optMainZoneId) &&
      mainTargetTpl &&
      Number(task?.templateId ?? 0) !== Number(mainTargetTpl) &&
      readyFeedersCount > 0 &&
      unlockScoreTotal > 0 &&
      !mainTemplateResetArmed
    ) {
      mainTemplateSwitchInsight = {
        fromTpl: Number(mainTargetTpl),
        toTpl: Number(task?.templateId ?? 0),
        hadFeedersReady: feedersReady.length > 0,
        feedersReadyCount: feedersReady.length,
      };
    }

    // removemos el elegido de pending
    const idx = pendingNonMeal.findIndex(
      (x) => Number(x?.id) === Number(task?.id),
    );
    if (idx >= 0) pendingNonMeal.splice(idx, 1);

    const out = scheduleNonMealTask(task) as any;
    if (out?.scheduled === false && out?.reason) {
      unplanned.push({ taskId: Number(task?.id), reason: out.reason });
      continue;
    }
    if (out?.feasible === false) return out;
  }

  const noIdlePassSnapshot = (plannedTasks as any[]).map((p) => ({
    taskId: Number(p.taskId),
    startPlanned: String(p.startPlanned),
    endPlanned: String(p.endPlanned),
    assignedResources: Array.isArray(p?.assignedResources) ? [...p.assignedResources] : [],
    assignedSpace: Number(p?.assignedSpace ?? 0),
  }));

  rebuildPlannedByTask();
  runMainZoneNoIdlePass();

  const getTaskIntervalMinutes = (task: any) => {
    if (!task) return null;
    const taskId = Number(task?.id ?? 0);
    const planned = plannedByTaskId.get(taskId);
    const sRaw = planned?.startPlanned ?? task?.startPlanned ?? null;
    const eRaw = planned?.endPlanned ?? task?.endPlanned ?? null;
    if (!sRaw || !eRaw) return null;
    const s = toMinutes(String(sRaw));
    const e = toMinutes(String(eRaw));
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
    return { start: s, end: e };
  };

  const classifyWrapPlacementBlocker = (params: {
    wrapTask: any;
    wrapPlanned: any;
    innerTask: any;
    desiredStart: number;
    desiredEnd: number;
  }) => {
    const { wrapTask, wrapPlanned, innerTask, desiredStart, desiredEnd } = params;
    const wrapTaskId = Number(wrapTask?.id ?? 0);
    const innerTaskId = Number(innerTask?.id ?? 0);
    const wrapContestantId = getContestantId(wrapTask);
    const wrapSpaceId = getSpaceId(wrapTask);
    const wrapTeamId = Number(wrapTask?.itinerantTeamId ?? 0);

    const desiredDuration = desiredEnd - desiredStart;
    if (desiredStart < startDay || desiredEnd > endDay || desiredDuration <= 0) {
      return { reason: 'TIME_WINDOW', blockerTaskId: null };
    }

    const effWin = getContestantEffectiveWindow(wrapContestantId);
    if (effWin && (desiredStart < effWin.start || desiredEnd > effWin.end)) {
      return { reason: 'TIME_WINDOW', blockerTaskId: null };
    }

    const assigned = Array.isArray(wrapPlanned?.assignedResources)
      ? wrapPlanned.assignedResources.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
      : [];

    const overlaps = (arr: Interval[]) => arr.find((it) => {
      const otherTaskId = Number(it?.taskId ?? NaN);
      if (!Number.isFinite(otherTaskId) || otherTaskId <= 0) return false;
      if (otherTaskId === wrapTaskId || otherTaskId === innerTaskId) return false;
      return rangesOverlap(desiredStart, desiredEnd, it.start, it.end);
    });

    if (wrapContestantId) {
      const it = overlaps(occupiedByContestant.get(wrapContestantId) ?? []);
      if (it) return { reason: 'CONTESTANT_BUSY', blockerTaskId: Number(it.taskId ?? 0) };
    }

    if (wrapSpaceId) {
      const it = overlaps(occupiedBySpace.get(wrapSpaceId) ?? []);
      if (it) return { reason: 'SPACE_BUSY', blockerTaskId: Number(it.taskId ?? 0) };
    }

    if (wrapTeamId > 0) {
      const it = overlaps(occupiedByItinerant.get(wrapTeamId) ?? []);
      if (it) return { reason: 'ITINERANT_TEAM_BUSY', blockerTaskId: Number(it.taskId ?? 0) };
    }

    for (const pid of assigned) {
      const it = overlaps(occupiedByResource.get(pid) ?? []);
      if (it) return { reason: 'RESOURCE_BUSY', blockerTaskId: Number(it.taskId ?? 0) };
    }

    const wrapZoneId = getZoneId(wrapTask);
    if (wrapZoneId) {
      const it = overlaps(occupiedByZoneMeal.get(wrapZoneId) ?? []);
      if (it) return { reason: 'ZONE_MEAL_BREAK', blockerTaskId: Number(it.taskId ?? 0) };
    }

    return null;
  };

  const emittedWrapWarningKeys = new Set<string>();

  const syncItinerantWrapTasks = () => {
    rebuildPlannedByTask();
    const wrapTasks = tasksSorted.filter((task: any) => isItinerantWrapTask(task));

    for (const wrapTask of wrapTasks) {
      const wrapTaskId = Number(wrapTask?.id ?? 0);
      const wrapPlanned = plannedByTaskId.get(wrapTaskId);
      if (!wrapPlanned) continue;

      const contestantId = getContestantId(wrapTask);
      const spaceId = getSpaceId(wrapTask);
      if (!contestantId || !spaceId) continue;

      const wrapInterval = getTaskIntervalMinutes(wrapTask);
      if (!wrapInterval) continue;

      const innerCandidates = tasksSorted.filter((task: any) => {
        if (!task) return false;
        const taskId = Number(task?.id ?? 0);
        if (taskId === wrapTaskId) return false;
        if (Boolean(task?.isManualBlock)) return false;
        if (isItinerantWrapTask(task)) return false;
        if (isProtectedWrapTask(task)) return false;
        if (Number(getContestantId(task) ?? 0) !== Number(contestantId)) return false;
        if (Number(getSpaceId(task) ?? 0) !== Number(spaceId)) return false;
        return Boolean(getTaskIntervalMinutes(task));
      });

      if (!innerCandidates.length) continue;

      const scored = innerCandidates
        .map((task: any) => {
          const interval = getTaskIntervalMinutes(task)!;
          const overlap = rangesOverlap(wrapInterval.start, wrapInterval.end, interval.start, interval.end);
          const distance = overlap ? 0 : Math.abs(interval.start - wrapInterval.start);
          return { task, interval, overlap, distance };
        })
        .sort((a: any, b: any) => {
          if (Number(b.overlap) !== Number(a.overlap)) return Number(b.overlap) - Number(a.overlap);
          if (a.distance !== b.distance) return a.distance - b.distance;
          return Number(a.task?.id ?? 0) - Number(b.task?.id ?? 0);
        });

      const selected = scored[0];
      const innerTask = selected.task;
      const innerTaskId = Number(innerTask?.id ?? 0);
      const innerInterval = selected.interval;
      wrapInnerByTaskId.set(wrapTaskId, innerTaskId);

      const extra = getWrapExtraMin(wrapTask);
      const pre = Math.floor(extra / 2);
      const post = extra - pre;
      const desiredStart = innerInterval.start - pre;
      const desiredEnd = innerInterval.end + post;

      removeTaskFromOccupancy(wrapTask, wrapPlanned);

      const blocker = classifyWrapPlacementBlocker({
        wrapTask,
        wrapPlanned,
        innerTask,
        desiredStart,
        desiredEnd,
      });

      if (blocker) {
        addTaskToOccupancy(wrapTask, {
          start: toMinutes(String(wrapPlanned.startPlanned)),
          end: toMinutes(String(wrapPlanned.endPlanned)),
          assigned: Array.isArray(wrapPlanned?.assignedResources) ? wrapPlanned.assignedResources : [],
        });

        const innerImmovable = isImmovableTask(innerTask);
        const wrapReason = innerImmovable ? 'LOCKED' : blocker.reason;
        const warningKey = `${wrapTaskId}:${innerTaskId}:${desiredStart}:${desiredEnd}:${wrapReason}:${Number(blocker.blockerTaskId ?? 0)}`;
        if (!emittedWrapWarningKeys.has(warningKey)) {
          emittedWrapWarningKeys.add(warningKey);
          warnings.push({
            code: 'ITINERANT_WRAP_NOT_FEASIBLE',
            taskId: wrapTaskId,
            message: `No se pudo alinear wrap itinerante ${wrapTaskId} envolviendo tarea ${innerTaskId}.`,
            details: {
              wrapTaskId,
              innerTaskId,
              desiredStart: toHHMM(desiredStart),
              desiredEnd: toHHMM(desiredEnd),
              blockerTaskId: blocker.blockerTaskId ?? null,
              reason: wrapReason,
            },
          });
        }
        continue;
      }

      wrapPlanned.startPlanned = toHHMM(desiredStart);
      wrapPlanned.endPlanned = toHHMM(desiredEnd);
      addTaskToOccupancy(wrapTask, {
        start: desiredStart,
        end: desiredEnd,
        assigned: Array.isArray(wrapPlanned?.assignedResources) ? wrapPlanned.assignedResources : [],
      });
    }

    rebuildPlannedByTask();
  };

  syncItinerantWrapTasks();
  if (hasOverlapInPlannedTasks()) {
    const snapshotByTask = new Map(noIdlePassSnapshot.map((p) => [Number(p.taskId), p]));
    for (const planned of plannedTasks as any[]) {
      const snap = snapshotByTask.get(Number(planned.taskId));
      if (!snap) continue;
      planned.startPlanned = snap.startPlanned;
      planned.endPlanned = snap.endPlanned;
      planned.assignedResources = [...snap.assignedResources];
      planned.assignedSpace = snap.assignedSpace;
    }
    rebuildPlannedByTask();
    reasons.push({
      code: "MAIN_ZONE_NO_IDLE_ROLLED_BACK",
      message:
        "Se intentó compactar el plató principal pero generaba solapes; se mantuvo la planificación factible.",
    });
  }

  syncItinerantWrapTasks();

  // Hard rule: un concursante no puede solaparse
  // (Validamos sobre la planificación resultante, y devolvemos razones operativas)
  const byTaskId = new Map<
    number,
    {
      contestantId: number;
      contestantName: string | null;
      start: number;
      end: number;
    }
  >();
  for (const p of plannedTasks) {
    const task = tasks.find((x) => x.id === p.taskId);
    const contestantId = getContestantId(task);
    if (!contestantId) continue;

    byTaskId.set(p.taskId, {
      contestantId,
      contestantName: (task as any)?.contestantName ?? null,
      start: toMinutes(p.startPlanned),
      end: toMinutes(p.endPlanned),
    });
  }

  const overlaps: { code: string; message: string }[] = [];
  const byContestant = new Map<
    number,
    Array<{ taskId: number; start: number; end: number; fixed?: boolean }>
  >();

  // 1) Intervalos fijos ya existentes:
  // ✅ SOLO consideramos “fija” una tarea si:
  // - está in_progress/done, o
  // - tiene un lock con lockedStart/lockedEnd
  for (const task of tasks) {
    const contestantId = getContestantId(task);
    if (!contestantId) continue;

    const status = String((task as any)?.status ?? "pending");
    const isFixed =
      status === "in_progress" ||
      status === "done" ||
      lockedTaskIds.has(Number(task.id));

    if (!isFixed) continue;

    const sp = task.startPlanned ?? null;
    const ep = task.endPlanned ?? null;
    if (!sp || !ep) continue;

    const list = byContestant.get(contestantId) ?? [];
    list.push({
      taskId: task.id,
      start: toMinutes(sp),
      end: toMinutes(ep),
      fixed: true,
    });
    byContestant.set(contestantId, list);
  }

  // 2) Intervalos que el motor acaba de proponer (plannedTasks)
  byTaskId.forEach((info, taskId) => {
    const list = byContestant.get(info.contestantId) ?? [];

    // si ya existe como "fija" (porque tenía startPlanned/endPlanned), no la duplicamos
    if (!list.some((x) => x.taskId === taskId)) {
      list.push({ taskId, start: info.start, end: info.end, fixed: false });
    }

    byContestant.set(info.contestantId, list);
  });

  byContestant.forEach((list, contestantId) => {
    list.sort((a, b) => a.start - b.start);

    for (let i = 0; i < list.length; i++) {
      const curr = list[i];
      const active = list.filter((x, idx) => idx < i && x.end > curr.start);
      if (!active.length) continue;

      const currTask = tasks.find((x) => x.id === curr.taskId) as any;

      if (active.length >= 2) {
        const name =
          (currTask as any)?.contestantName ??
          byTaskId.get(curr.taskId)?.contestantName ??
          null;
        overlaps.push({
          code: "CONTESTANT_OVERLAP",
          message:
            `Solape múltiple de concursante${name ? ` (${name})` : ` (ID ${contestantId})`}: ` +
            `hay 3 o más tareas coincidiendo alrededor de ${toHHMM(curr.start)}.`,
        });
        continue;
      }

      const prev = active[0];
      if (curr.start < prev.end) {
        const prevTask = tasks.find((x) => x.id === prev.taskId) as any;
        const allowWrapOverlap = canAllowContestantWrapOverlap(prevTask, currTask);
        if (allowWrapOverlap && active.length === 1) continue;

        // Nombre (preferimos el del input, y si no, el del byTaskId)
        const prevTaskRow = tasks.find((x) => x.id === prev.taskId);
        const name =
          (prevTaskRow as any)?.contestantName ??
          byTaskId.get(prev.taskId)?.contestantName ??
          null;

        const prevTag = prev.fixed ? "fija" : "planificada";
        const currTag = curr.fixed ? "fija" : "planificada";

        const taskLabel = (id: number) => {
          const t = tasks.find((x) => Number(x.id) === Number(id));
          const nm = String((t as any)?.templateName ?? "").trim();
          return nm ? nm : `Tarea ${id}`;
        };

        overlaps.push({
          code: "CONTESTANT_OVERLAP",
          message:
            `Solape de concursante${name ? ` (${name})` : ` (ID ${contestantId})`}: ` +
            `tarea "${taskLabel(prev.taskId)}" (${prevTag}) (${toHHMM(prev.start)}–${toHHMM(prev.end)}) ` +
            `se solapa con tarea "${taskLabel(curr.taskId)}" (${currTag}) (${toHHMM(curr.start)}–${toHHMM(curr.end)}).`,
        });
      }
    }
  });

  if (overlaps.length) {
    return hardInfeasible(overlaps);
  }

  // ✅ Hard rule: un recurso (plan_resource_item.id) no puede estar en dos tareas a la vez
  // Validamos sobre intervalos fijos (startPlanned/endPlanned) + propuesta del motor.
  // Nota: el motor aún es secuencial, pero esto protege ejecución real y futuros solapes.
  const resourceOverlaps: { code: string; message: string; taskId?: number }[] =
    [];
  const byResource = new Map<
    number,
    Array<{ taskId: number; start: number; end: number; fixed: boolean }>
  >();

  const normalizeAssigned = (raw: any): number[] => {
    if (!raw) return [];
    let arr: any[] = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      } catch {
        arr = [];
      }
    }
    return Array.from(
      new Set(
        arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0),
      ),
    );
  };

  // 1) Recursos en tareas fijas (persistidas) -> task.assignedResourceIds
  for (const task of tasks as any[]) {
    const status = String(task?.status ?? "pending");
    const isFixed =
      status === "in_progress" ||
      status === "done" ||
      lockedTaskIds.has(Number(task?.id));
    if (!isFixed) continue;

    const sp = task?.startPlanned ?? null;
    const ep = task?.endPlanned ?? null;
    if (!sp || !ep) continue;

    const ids = normalizeAssigned(task?.assignedResourceIds ?? null);
    if (!ids.length) continue;

    for (const rid of ids) {
      const list = byResource.get(rid) ?? [];
      list.push({
        taskId: Number(task?.id),
        start: toMinutes(sp),
        end: toMinutes(ep),
        fixed: true,
      });
      byResource.set(rid, list);
    }
  }

  // 2) Recursos en tareas propuestas por el motor -> plannedTasks.assignedResources
  for (const p of plannedTasks as any[]) {
    const ids = normalizeAssigned(p?.assignedResources ?? null);
    if (!ids.length) continue;

    const s = toMinutes(p.startPlanned);
    const e = toMinutes(p.endPlanned);

    for (const rid of ids) {
      const list = byResource.get(rid) ?? [];
      // si ya estaba como fija para ese taskId, no duplicamos
      if (!list.some((x) => x.taskId === Number(p.taskId) && x.fixed)) {
        list.push({ taskId: Number(p.taskId), start: s, end: e, fixed: false });
      }
      byResource.set(rid, list);
    }
  }

  const resourceLabel = (rid: number) => {
    const row = priById.get(rid);
    const name = String(row?.name ?? "").trim();
    if (name) return name;
    return `recurso ${rid}`;
  };

  byResource.forEach((list, rid) => {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const curr = list[i];
      if (curr.start < prev.end) {
        const prevTag = prev.fixed ? "fija" : "planificada";
        const currTag = curr.fixed ? "fija" : "planificada";

        resourceOverlaps.push({
          code: "RESOURCE_OVERLAP",
          taskId: curr.taskId,
          message:
            `Solape de recurso (${resourceLabel(rid)}): ` +
            `tarea ${prev.taskId} (${prevTag}) (${toHHMM(prev.start)}–${toHHMM(prev.end)}) ` +
            `se solapa con tarea ${curr.taskId} (${currTag}) (${toHHMM(curr.start)}–${toHHMM(curr.end)}).`,
        });
      }
    }
  });

  if (resourceOverlaps.length) {
    return hardInfeasible(resourceOverlaps);
  }

  const mainZoneGaps = computeMainZoneGaps({
    zoneId: optMainZoneId,
    plannedTasks: plannedTasks as any,
    taskById,
    getSpaceId,
    getZoneId,
    getZoneIdForSpace,
  });
  const mainZoneGapReasons = explainMainZoneGaps({
    gaps: mainZoneGaps,
    plannedTasks: plannedTasks as any,
    taskById,
    getContestantId,
    getSpaceId,
    lockedTaskIds,
    relocationAttemptsByTaskId: globalGapRelocationAttemptsByTaskId,
  });

  if (optMainZoneId && mainZoneGaps.length > 0) {
    const details = {
      gaps: mainZoneGaps.map((g) => ({
        zoneId: g.zoneId,
        spaceId: g.spaceId,
        start: toHHMM(g.start),
        end: toHHMM(g.end),
        durationMin: g.durationMin,
        prevTaskId: g.prevTaskId,
        nextTaskId: g.nextTaskId,
      })),
      reasons: mainZoneGapReasons,
    };

    if (mainZoneKeepBusyStrength >= DIRECTOR_MODE_KEEP_BUSY_THRESHOLD) {
      warnings.push({
        code: "MAIN_ZONE_GAPS_REMAIN",
        message: `No se pudo eliminar ${mainZoneGaps.length} hueco(s) en plató principal.`,
        details,
      });
    } else {
      warnings.push({
        code: "MAIN_ZONE_GAP_STATS_AVAILABLE",
        message: `Se detectaron ${mainZoneGaps.length} hueco(s) en plató principal. Revisa métricas para diagnóstico.`,
        details,
      });
    }
  }

  const complete = unplanned.length === 0;
  const insights: any[] = [
    {
      code: "MAIN_ZONE_GAP_STATS",
      message: "Métricas de continuidad del plató principal",
      details: {
        zoneId: optMainZoneId,
        spacesConsidered: Array.from(new Set(mainZoneGaps.map((g) => Number(g.spaceId)).filter((n) => Number.isFinite(n) && n > 0))),
        totalGaps: mainZoneGaps.length,
        totalGapMinutes: mainZoneGaps.reduce((acc, g) => acc + Number(g.durationMin || 0), 0),
        gaps: mainZoneGaps.map((g) => ({
          zoneId: g.zoneId,
          spaceId: g.spaceId,
          start: toHHMM(g.start),
          end: toHHMM(g.end),
          durationMin: g.durationMin,
          prevTaskId: g.prevTaskId,
          nextTaskId: g.nextTaskId,
        })),
        gapReasons: mainZoneGapReasons,
      },
    },
  ];

  if (feedMainInsightDetails) {
    insights.push({
      code: "V2_LOOKAHEAD",
      message: "Lookahead depth=2 para alimentar continuidad del plató principal",
      details: feedMainInsightDetails,
    });
  }

  if (mainTemplateSwitchInsight) {
    insights.push({
      code: "V2_MAIN_TEMPLATE_SWITCH",
      message: "Cambio de template detectado en el plató principal",
      details: mainTemplateSwitchInsight,
    });
  }

  insights.push({
    code: "V2_SCORING_DIAGNOSTIC",
    message: "Diagnóstico del scoring de selección en v2",
    details: scoringDiagnosticDetails ?? {
      readyCount: 0,
      mainTargetTpl: null,
      feedersReadyCount: 0,
      usedFallback: false,
    },
  });

  if (plannedTasks.length === 0 && unplanned.length > 0) {
    const counts = new Map<string, { count: number; label: string }>();
    for (const item of unplanned) {
      const reason = item?.reason ?? {};
      const code = String(reason?.code ?? "UNSPECIFIED").trim() || "UNSPECIFIED";
      const message = String((reason as any)?.humanMessage ?? reason?.message ?? code).trim() || code;
      const current = counts.get(code) ?? { count: 0, label: message };
      current.count += 1;
      counts.set(code, current);
    }

    const topReasons = Array.from(counts.entries())
      .map(([code, info]) => ({ code, count: info.count, message: info.label }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
      .slice(0, 10);

    warnings.push({
      code: "NO_TASKS_PLANNED_SUMMARY",
      message: "No se planificó ninguna tarea. Revisa los motivos principales en unplanned.",
      details: { topReasons, totalUnplanned: unplanned.length },
    });
  }

  const dedupeWarnings = (
    warningList: { code: string; message: string; taskId?: number; details?: any }[],
  ) => {
    const grouped = new Map<
      string,
      { code: string; message: string; taskId?: number; details?: any; count: number }
    >();

    for (const warning of warningList) {
      const code = String(warning?.code ?? "UNKNOWN").trim() || "UNKNOWN";
      const task = warning?.taskId != null ? taskById.get(Number(warning.taskId)) : null;
      const templateName = String(task?.templateName ?? "").trim().toLowerCase() || "-";
      const contestantId = Number(task?.contestantId ?? task?.contestant_id ?? 0);
      const contestantKey = Number.isFinite(contestantId) && contestantId > 0 ? String(contestantId) : "-";
      const messageKey = String(warning?.message ?? "").trim();
      const key = `${code}:${templateName}:${contestantKey}:${messageKey}`;

      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { ...warning, count: 1 });
      } else {
        current.count += 1;
        if (current.taskId == null && warning.taskId != null) {
          current.taskId = warning.taskId;
        }
      }
    }

    return Array.from(grouped.values()).map((warning) => {
      if (warning.count <= 1) return warning;
      return {
        ...warning,
        details: {
          ...(warning.details && typeof warning.details === "object" ? warning.details : {}),
          dedupeCount: warning.count,
        },
      };
    });
  };

  const dedupedWarnings = dedupeWarnings(warnings);

  return {
    feasible: complete,
    complete,
    hardFeasible: true,
    plannedTasks,
    warnings: dedupedWarnings,
    unplanned,
    reasons: complete ? [] : unplanned.map((x) => x.reason),
    insights,
  } as any;
}


const GRID_V2 = 5;

function computeMainZoneGapStats(params: {
  plannedTasks: Array<{ taskId: number; startPlanned: string; endPlanned: string; assignedSpace?: number | null }>;
  tasks: any[];
  mainZoneId: number | null | undefined;
}) {
  const mainZoneId = Number(params.mainZoneId ?? NaN);
  if (!Number.isFinite(mainZoneId) || mainZoneId <= 0) return { gapCount: 0, gapMinutes: 0 };

  const taskById = new Map<number, any>();
  for (const t of params.tasks ?? []) taskById.set(Number((t as any)?.id), t);

  const intervals = (params.plannedTasks ?? [])
    .map((p) => {
      const task = taskById.get(Number((p as any)?.taskId));
      const zoneId = Number((task as any)?.zoneId ?? NaN);
      if (zoneId !== mainZoneId) return null;
      const start = toMinutes(String((p as any)?.startPlanned ?? ''));
      const end = toMinutes(String((p as any)?.endPlanned ?? ''));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return { start, end };
    })
    .filter((x): x is { start: number; end: number } => Boolean(x))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (intervals.length < 2) return { gapCount: 0, gapMinutes: 0 };
  let gapCount = 0;
  let gapMinutes = 0;
  for (let i = 1; i < intervals.length; i++) {
    const gap = intervals[i].start - intervals[i - 1].end;
    if (gap >= GRID_V2) {
      gapCount += 1;
      gapMinutes += gap;
    }
  }
  return { gapCount, gapMinutes };
}

export function generatePlanV2(input: EngineInput): EngineOutput {
  const keepBusyStrength = Number((input as any)?.optimizerWeights?.mainZoneKeepBusy ?? 0);
  const hardNoGaps = Boolean((input as any)?.optimizerMainZoneOptKeepBusy === true && keepBusyStrength === 10);
  const startDay = toMinutes(input.workDay.start);
  const endDay = toMinutes(input.workDay.end);
  const mealWindowStart = toMinutes(input.meal.start);
  const mealWindowEnd = toMinutes(input.meal.end);

  if (!hardNoGaps) {
    const baseline = generatePlanV2Single(input, { mainStartGateMin: startDay, mealStartMin: mealWindowStart });
    const baseStats = computeMainZoneGapStats({
      plannedTasks: (baseline as any)?.plannedTasks ?? [],
      tasks: input.tasks ?? [],
      mainZoneId: (input as any)?.optimizerMainZoneId ?? null,
    });
    const baseInsights = Array.isArray((baseline as any)?.insights) ? [...((baseline as any).insights)] : [];
    baseInsights.push({
      code: "V2_MEAL_CHOICE",
      message: "Selección de comida en ventana (modo básico)",
      details: { chosenMealStart: toHHMM(mealWindowStart), attemptsMeal: 1 },
    });
    baseInsights.push({
      code: "V2_GATE_CHOICE",
      message: "Selección de gate principal (modo básico)",
      details: { chosenGateStart: toHHMM(startDay), gapCount: baseStats.gapCount, gapTotal: baseStats.gapMinutes, mainSwitches: null },
    });
    return { ...baseline, insights: baseInsights } as EngineOutput;
  }

  const gateMaxAttempts = 60;
  const mealMaxAttempts = 10;
  const mealStep = Math.max(GRID_V2, Math.floor(Math.max(0, mealWindowEnd - mealWindowStart) / Math.max(1, mealMaxAttempts - 1) / GRID_V2) * GRID_V2 || GRID_V2);
  const mealCandidates: number[] = [];
  for (let meal = mealWindowStart; meal <= mealWindowEnd && mealCandidates.length < mealMaxAttempts; meal += mealStep) {
    mealCandidates.push(Math.ceil(meal / GRID_V2) * GRID_V2);
  }
  if (!mealCandidates.includes(mealWindowEnd)) mealCandidates.push(Math.ceil(mealWindowEnd / GRID_V2) * GRID_V2);

  let bestPlan: EngineOutput | null = null;
  let bestMeta: { gate: number; meal: number; gapCount: number; gapTotal: number; mainSwitches: number } | null = null;
  const countMainSwitches = (plan: EngineOutput) => {
    const mainZoneId = Number((input as any)?.optimizerMainZoneId ?? NaN);
    if (!Number.isFinite(mainZoneId) || mainZoneId <= 0) return 0;
    const taskById = new Map<number, any>();
    for (const t of input.tasks ?? []) taskById.set(Number((t as any)?.id), t);
    const rows = ((plan as any)?.plannedTasks ?? [])
      .map((p: any) => {
        const task = taskById.get(Number(p?.taskId));
        const zoneId = Number(task?.zoneId ?? NaN);
        if (zoneId !== mainZoneId) return null;
        return {
          start: toMinutes(String(p?.startPlanned ?? "")),
          task,
        };
      })
      .filter((x: any) => Boolean(x))
      .sort((a: any, b: any) => a.start - b.start);

    let switches = 0;
    let activeTpl: number | null = null;
    for (const row of rows) {
      const isMeal = Boolean((row.task as any)?.isMeal || (row.task as any)?.breakKind);
      if (isMeal) {
        activeTpl = null;
        continue;
      }
      const tpl = Number((row.task as any)?.templateId ?? NaN);
      if (!Number.isFinite(tpl) || tpl <= 0) continue;
      if (activeTpl === null) {
        activeTpl = tpl;
        continue;
      }
      if (activeTpl !== tpl) {
        switches += 1;
        activeTpl = tpl;
      }
    }
    return switches;
  };

  for (let gate = startDay; gate <= endDay && ((gate - startDay) / GRID_V2) < gateMaxAttempts; gate += GRID_V2) {
    for (const meal of mealCandidates) {
      const plan = generatePlanV2Single(input, { mainStartGateMin: gate, mealStartMin: meal });
      const stats = computeMainZoneGapStats({
        plannedTasks: (plan as any)?.plannedTasks ?? [],
        tasks: input.tasks ?? [],
        mainZoneId: (input as any)?.optimizerMainZoneId ?? null,
      });
      const mainSwitches = countMainSwitches(plan);
      const candidate = { gate, meal, gapCount: stats.gapCount, gapTotal: stats.gapMinutes, mainSwitches };
      if (!bestMeta) {
        bestMeta = candidate;
        bestPlan = plan;
      } else {
        const better =
          (candidate.gapCount === 0 && bestMeta.gapCount !== 0) ||
          (candidate.gapCount === bestMeta.gapCount && candidate.gapTotal < bestMeta.gapTotal) ||
          (candidate.gapCount === bestMeta.gapCount && candidate.gapTotal === bestMeta.gapTotal && candidate.mainSwitches < bestMeta.mainSwitches) ||
          (candidate.gapCount === bestMeta.gapCount && candidate.gapTotal === bestMeta.gapTotal && candidate.mainSwitches === bestMeta.mainSwitches && gate < bestMeta.gate);
        if (better) {
          bestMeta = candidate;
          bestPlan = plan;
        }
      }
      if (bestMeta && bestMeta.gapCount === 0 && bestMeta.mainSwitches === 0) break;
    }
  }

  const fallback = bestPlan ?? generatePlanV2Single(input, { mainStartGateMin: startDay, mealStartMin: mealWindowStart });
  const tasksPendingCount = ((input as any)?.tasks ?? []).filter((task: any) => {
    const status = String(task?.status ?? "pending");
    return status !== "in_progress" && status !== "done";
  }).length;
  if (((fallback as any)?.plannedTasks ?? []).length === 0 && tasksPendingCount > 0) {
    throw new Error("V2_NO_SELECTION_POSSIBLE");
  }
  const selected = bestMeta ?? { gate: startDay, meal: mealWindowStart, gapCount: 0, gapTotal: 0, mainSwitches: 0 };

  const warnings = Array.isArray((fallback as any)?.warnings) ? [...((fallback as any).warnings)] : [];
  if (selected.gapCount > 0) {
    warnings.push({
      code: 'MAIN_ZONE_NO_GAPS_NOT_FULLY_ACHIEVED',
      message: 'No fue posible eliminar todos los huecos del plató principal con keepBusy=10; se devolvió el mejor resultado encontrado.',
      details: { totalGapMinutes: selected.gapTotal },
    });
  }

  const insights = Array.isArray((fallback as any)?.insights) ? [...((fallback as any).insights)] : [];
  insights.push({
    code: "V2_MEAL_CHOICE",
    message: "Selección de slot de comida dentro de ventana",
    details: { chosenMealStart: toHHMM(selected.meal), attemptsMeal: mealCandidates.length },
  });
  insights.push({
    code: "V2_GATE_CHOICE",
    message: "Selección de gate y continuidad del plató principal",
    details: {
      chosenGateStart: toHHMM(selected.gate),
      gapCount: selected.gapCount,
      gapTotal: selected.gapTotal,
      mainSwitches: selected.mainSwitches,
    },
  });

  return { ...fallback, warnings, insights } as EngineOutput;
}
