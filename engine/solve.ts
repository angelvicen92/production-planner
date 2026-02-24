import type { EngineInput, EngineOutput } from "./types";

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}
function toHHMM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function generatePlan(input: EngineInput): EngineOutput {
  const reasons: { code: string; message: string }[] = [];

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

  // ✅ NUEVO: tareas que requieren configuración (no rompen el solve, se excluyen)
  const warnings: { code: string; message: string; taskId?: number }[] = [];
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

    return leftItinerantTeamId > 0 || rightItinerantTeamId > 0;
  };

  // 1) Falta zoneId (no puede heredar recursos por plató ni ubicarse correctamente)
  for (const task of tasks as any[]) {
    const id = Number(task?.id);
    const zid = task?.zoneId;

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

  // ✅ Validación: si una tarea tiene dependencias pero no podemos resolver TODOS sus prereqs -> infeasible
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

    // templates ya resueltos por tasks reales existentes
    const resolvedTplIds = new Set<number>();
    for (const depTaskId of depTaskIds) {
      const depTask = taskById.get(Number(depTaskId));
      const depTplId = Number(depTask?.templateId);
      if (Number.isFinite(depTplId)) resolvedTplIds.add(depTplId);
    }

    const missingTplIds = depTplIds.filter(
      (tplId) => !resolvedTplIds.has(Number(tplId)),
    );
    if (!missingTplIds.length) continue;

    const contestantName = String(task?.contestantName ?? "").trim();
    const contestantId = Number(task?.contestantId ?? task?.contestant_id ?? 0);
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
    return { feasible: false, reasons: missingDeps } as any;

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
    return {
      feasible: false,
      reasons: [
        {
          code: "DEPENDENCY_CYCLE",
          message:
            "Hay un ciclo de dependencias entre tareas (A depende de B y B depende de A, o cadena circular). Rompe el ciclo en Task Templates.",
        },
      ],
    } as any;
  }

  const tasksSorted = sortedIds
    .map((id) => (tasksForSolve as any[]).find((t) => Number(t.id) === id))
    .filter(Boolean) as any[];
  const forcedStartByTaskId = new Map<number, number>();
  const forcedEndByTaskId = new Map<number, number>();
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

  if (reasons.length) return { feasible: false, reasons };

  const startDay = toMinutes(input.workDay.start);
  const endDay = toMinutes(input.workDay.end);
  const mealStart = toMinutes(input.meal.start);
  const mealEnd = toMinutes(input.meal.end);

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

  const rangesOverlap = (
    aStart: number,
    aEnd: number,
    bStart: number,
    bEnd: number,
  ) => aStart < bEnd && bStart < aEnd;

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
      return {
        feasible: false,
        reasons: [
          {
            code: "MEAL_ZONE_NO_FIT",
            message: `No cabe la comida del plató (zona ${zid}) dentro de la ventana global de comida (${toHHMM(mealStart)}–${toHHMM(mealEnd)}).`,
            taskId: Number(task?.id),
          },
        ],
      } as any;
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
        return { feasible: false, reasons: [{ code: "SPACE_BREAK_NO_FIT", message: `No cabe parada de comida en espacio ${spaceId}.` }] } as any;
      }
      const end = start + duration;
      addIntervalSorted(occ, { start, end, taskId: Number(task.id) });
      occupiedBySpace.set(spaceId, occ);
      plannedTasks.push({ taskId: Number(task.id), startPlanned: toHHMM(start), endPlanned: toHHMM(end), assignedSpace: spaceId ?? null, assignedResources: [] });
      continue;
    }

    const teamId = Number(task?.itinerantTeamId ?? 0);
    if (!teamId) continue;
    const occ = occupiedByItinerant.get(teamId) ?? [];
    start = findEarliestGap(occ, start, duration);
    if (start + duration > winEnd) {
      return { feasible: false, reasons: [{ code: "ITINERANT_BREAK_NO_FIT", message: `No cabe parada de comida en equipo itinerante ${teamId}.` }] } as any;
    }
    const end = start + duration;
    addIntervalSorted(occ, { start, end, taskId: Number(task.id) });
    occupiedByItinerant.set(teamId, occ);
    plannedTasks.push({ taskId: Number(task.id), startPlanned: toHHMM(start), endPlanned: toHHMM(end), assignedSpace: null, assignedResources: [] });
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
  const effectiveGroupingMatchWeight = Math.round(weightFromInput("groupBySpaceTemplateMatch", groupingMatchWeight / 3_000) * 3_000);
  const effectiveGroupingActiveSpaceWeight = Math.round(weightFromInput("groupBySpaceActive", groupingActiveSpaceWeight / 60) * 60);
  const effectiveContestantCompactWeight = Math.round(weightFromInput("contestantCompact", contestantCompactWeight / 900) * 900);
  const effectiveContestantStayInZoneWeight = contestantStayInZoneWeights[Math.round(weightFromInput("contestantStayInZone", 0))] ?? 0;
  const effectiveContestantTotalSpanWeight = contestantTotalSpanWeights[Math.round(weightFromInput("contestantTotalSpan", 0))] ?? 0;

  // “memoria” por clave de contenedor de agrupación (espacio hoja, ancestro o zona)
  const lastTemplateByKey = new Map<string, number>();
  const streakByKey = new Map<string, { templateId: number; streakCount: number }>();
  const groupingBySpaceIdInput =
    (((input as any)?.groupingBySpaceId ?? (input as any)?.minimizeChangesBySpace ?? {}) as Record<
      number,
      { key?: string; level: number; minChain: number }
    >);

  const getGroupingConfigForSpace = (spaceId: number | null | undefined) => {
    if (!spaceId || !Number.isFinite(Number(spaceId))) return null;
    const raw = groupingBySpaceIdInput[Number(spaceId)] ?? null;
    if (!raw || typeof raw !== "object") return null;
    const level = Math.max(0, Math.min(10, Math.floor(Number((raw as any).level ?? 0))));
    const minChain = Math.max(1, Math.min(50, Math.floor(Number((raw as any).minChain ?? 4))));
    if (level <= 0) return null;
    const keyRaw = String((raw as any).key ?? `S:${Number(spaceId)}`).trim();
    const key = keyRaw || `S:${Number(spaceId)}`;
    return { key, level, minChain };
  };

  const scoreMinimizeChangesBonus = (spaceId: number, tplId: number) => {
    const cfg = getGroupingConfigForSpace(spaceId);
    if (!cfg) return 0;
    const lastTpl = lastTemplateByKey.get(cfg.key) ?? null;
    const levelFactor = cfg.level / 10;
    let bonus = 0;
    const baseMatch = effectiveGroupingMatchWeight > 0 ? effectiveGroupingMatchWeight : 3000;
    const baseActive = effectiveGroupingActiveSpaceWeight > 0 ? effectiveGroupingActiveSpaceWeight : 240;

    if (lastTpl !== null && lastTpl === tplId) {
      const currentStreakRaw = streakByKey.get(cfg.key)?.streakCount ?? 1;
      const currentStreak = Math.max(1, Number(currentStreakRaw));
      const mult =
        currentStreak < cfg.minChain
          ? 1
          : cfg.minChain / Math.max(currentStreak, cfg.minChain);
      bonus += baseMatch * levelFactor * mult;
    }

    if (lastTemplateByKey.has(cfg.key)) {
      bonus += baseActive * levelFactor;
    }

    return Math.round(Number.isFinite(bonus) ? bonus : 0);
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
      return null;
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
        feasible: false,
        reasons: [
          {
            code: "CONTESTANT_NO_AVAILABILITY",
            message:
              `No se puede planificar "${String(task?.templateName ?? `tarea ${taskId}`)}" para ${task?.contestantName ?? `concursante ${contestantId}`}: ` +
              `la ventana de disponibilidad es inválida (${toHHMM(effWin.start)}–${toHHMM(effWin.end)}). ` +
              `Duración: ${duration} min. Jornada del plan: ${toHHMM(startDay)}–${toHHMM(endDay)}. ` +
              `Fija: manual_block=${Boolean(task?.isManualBlock)}, status=${String(task?.status ?? "pending")}, lock=${String(task?.lockType ?? "none")}.`,
            taskId,
          },
        ],
      } as any;
    }

    if (effWin) start = snapUp(Math.max(start, effWin.start));

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

      // ✅ No permitir que la tarea se salga de la ventana efectiva del concursante
      if (effWin && start + duration > effWin.end) {
        const startsBeforeAvailability = startDay < effWin.start;
        return {
          feasible: false,
          reasons: [
            {
              code: "CONTESTANT_NOT_AVAILABLE",
              message:
                `No cabe "${String(task?.templateName ?? "tarea").trim() || `tarea ${taskId}`}" ` +
                `para ${task?.contestantName ?? `concursante ${contestantId}`} dentro de su disponibilidad ` +
                `(${toHHMM(effWin.start)}–${toHHMM(effWin.end)}). ` +
                `Duración: ${duration} min. Jornada del plan: ${toHHMM(startDay)}–${toHHMM(endDay)}. ` +
                `Fija: manual_block=${Boolean(task?.isManualBlock)}, time_lock=${String(task?.lockType ?? "") === "time"}, full_lock=${String(task?.lockType ?? "") === "full"}, status=${String(task?.status ?? "pending")}. ` +
                (startsBeforeAvailability
                  ? `workStart (${toHHMM(startDay)}) es anterior a disponibilidad (${toHHMM(effWin.start)}). Sugerencia: o amplía disponibilidad o mueve la tarea a >=${toHHMM(effWin.start)}.`
                  : ""),
              taskId,
            },
          ],
        } as any;
      }

      const finish = Number.isFinite(forcedEnd) ? Number(forcedEnd) : start + duration;
      if (finish <= start) {
        start = snapUp(start + GRID);
        continue;
      }
      if (finish > endDay) {
        return {
          feasible: false,
          reasons: [
            {
              code: "NO_TIME",
              message: "No cabe todo dentro del horario del día.",
              taskId,
            },
          ],
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

      // ✅ memoria para “sin huecos” por zona
      const zId = getZoneId(task);
      if (zId) lastEndByZone.set(zId, finish);

      // ✅ memoria para compactar concursantes
      const cId = getContestantId(task);
      if (cId) {
        lastEndByContestant.set(cId, finish);
        const firstStart = firstStartByContestant.get(cId);
        if (firstStart == null || start < firstStart) firstStartByContestant.set(cId, start);
        if (zId) lastZoneByContestant.set(cId, zId);
      }

      return null; // ✅ tarea colocada
    }

    return {
      feasible: false,
      reasons: [
        {
          code: "MAX_ITER",
          message:
            "No se pudo encajar una tarea tras demasiados intentos (protección defensiva).",
          taskId: Number(task?.id),
        },
      ],
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

    return {
      feasible: false,
      reasons: [{
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
      }],
    } as any;
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
    return {
      feasible: false,
      reasons: [{
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
      }],
    } as any;
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
  
  // ✅ protección global: el “gap fill” no puede intentarse indefinidamente
  // (si se alcanza el límite, se sigue el solver normal)
  let gapFillTries = 0;
  const MAX_GAP_FILL_TRIES = 80;

  while (pendingNonMeal.length) {
    const ready = pendingNonMeal.filter((t) => depsSatisfied(t));
    if (!ready.length) {
      const t = pendingNonMeal[0];
      const depIds = getDepTaskIds(t).filter(
        (x) =>
          !plannedEndByTaskId.has(Number(x)) &&
          !fixedEndByTaskId.has(Number(x)),
      );
      return {
        feasible: false,
        reasons: [
          {
            code: "DEPENDENCY_NOT_SCHEDULED",
            message:
              `Hay tareas cuyos prerequisitos no se han podido planificar (posible ciclo o datos incoherentes). ` +
              `Tarea: ${String(t?.templateName ?? `tarea ${t?.id}`)}. Prerequisitos pendientes: ${depIds.join(", ") || "?"}.`,
            taskId: Number(t?.id),
          },
        ],
      } as any;
    }

    // ✅ Helper: mismo scoring que usamos en ready.sort, pero para 1 tarea
    const scoreTaskForSelection = (t: any) => {
      const space = getSpaceId(t) ?? 0;
      const tpl = Number(t?.templateId ?? 0);
      const zone = getZoneId(t);

      let s = 0;

      // 1) Plató principal: “Terminar cuanto antes”
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
        if (gcfg) {
          const lastTpl = lastTemplateByKey.get(gcfg.key) ?? null;
          if (lastTpl !== null && lastTpl === tpl) s += effectiveGroupingMatchWeight;
          if (lastTemplateByKey.has(gcfg.key)) s += effectiveGroupingActiveSpaceWeight;
        }
      }

      // 4.b) Minimizar cambios por espacio/zona (config local)
      if (space) {
        s += scoreMinimizeChangesBonus(space, tpl);
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

      return s;
    };

    // ✅ LOTE 6 (PRO): si el plató principal ya “ha empezado” y hay un hueco real,
    // intentamos rellenarlo con una tarea que ENCAJE exacta en ese hueco.
    // (Solo se aplica a tareas del MISMO espacio dentro del plató principal.)
    if (
      effectiveKeepBusyWeight > 0 &&
      optMainZoneId &&
      lastEndByZone.has(optMainZoneId)
    ) {
      // ✅ cap global: si ya hemos intentado demasiadas veces, desactivamos gap-fill
      if (gapFillTries >= MAX_GAP_FILL_TRIES) {
        // no hacemos continue; dejamos que siga el flujo normal (ready.sort + scheduleNonMealTask)
      } else {
        gapFillTries++;

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
    }

    ready.sort((a, b) => {
      const aSpace = getSpaceId(a) ?? 0;
      const bSpace = getSpaceId(b) ?? 0;

      const aTpl = Number(a?.templateId ?? 0);
      const bTpl = Number(b?.templateId ?? 0);

      const aZone = getZoneId(a);
      const bZone = getZoneId(b);

      let sa = 0;
      let sb = 0;

      // 1) Plató principal: “Terminar cuanto antes” (según nivel)
      if (effectiveFinishEarlyWeight > 0 && optMainZoneId) {
        if (aZone === optMainZoneId) sa += effectiveFinishEarlyWeight;
        if (bZone === optMainZoneId) sb += effectiveFinishEarlyWeight;
      }

      // 2) Plató principal: “Sin huecos” (si ya hemos empezado a planificar en ese plató)
      if (
        effectiveKeepBusyWeight > 0 &&
        optMainZoneId &&
        lastEndByZone.has(optMainZoneId)
      ) {
        if (aZone === optMainZoneId) sa += effectiveKeepBusyWeight;
        if (bZone === optMainZoneId) sb += effectiveKeepBusyWeight;
      }

      // 3) Compactar concursantes: si un concursante ya tiene tareas, intenta agruparlas
      if (effectiveContestantCompactWeight > 0) {
        const aC = getContestantId(a);
        const bC = getContestantId(b);

        if (aC && lastEndByContestant.has(aC)) sa += effectiveContestantCompactWeight;
        if (bC && lastEndByContestant.has(bC)) sb += effectiveContestantCompactWeight;
      }

      // 4) Agrupar tareas iguales dentro del mismo contenedor de agrupación (según nivel)
      if (optGroupingLevel > 0) {
        const gA = aSpace ? getGroupingConfigForSpace(aSpace) : null;
        const gB = bSpace ? getGroupingConfigForSpace(bSpace) : null;
        const lastA = gA ? (lastTemplateByKey.get(gA.key) ?? null) : null;
        const lastB = gB ? (lastTemplateByKey.get(gB.key) ?? null) : null;

        if (gA && lastA !== null && lastA === aTpl)
          sa += effectiveGroupingMatchWeight;
        if (gB && lastB !== null && lastB === bTpl)
          sb += effectiveGroupingMatchWeight;

        // pequeño premio por seguir trabajando en un contenedor “ya activo”
        if (gA && lastTemplateByKey.has(gA.key))
          sa += effectiveGroupingActiveSpaceWeight;
        if (gB && lastTemplateByKey.has(gB.key))
          sb += effectiveGroupingActiveSpaceWeight;
      }

      // 4.b) Minimizar cambios por espacio/zona (config local)
      if (aSpace) sa += scoreMinimizeChangesBonus(aSpace, aTpl);
      if (bSpace) sb += scoreMinimizeChangesBonus(bSpace, bTpl);

      // 5) Mantener concursante en el mismo plató (solo bonus, sin penalización)
      if (effectiveContestantStayInZoneWeight > 0) {
        const aC = getContestantId(a);
        const bC = getContestantId(b);
        if (aC && aZone && lastZoneByContestant.get(aC) === aZone)
          sa += effectiveContestantStayInZoneWeight;
        if (bC && bZone && lastZoneByContestant.get(bC) === bZone)
          sb += effectiveContestantStayInZoneWeight;
      }

      if (effectiveContestantTotalSpanWeight > 0) {
        const scoreTotalSpan = (task: any) => {
          const cId = getContestantId(task);
          if (!cId) return 0;
          const firstStart = firstStartByContestant.get(cId);
          const lastEnd = lastEndByContestant.get(cId);
          if (Number.isFinite(firstStart) && Number.isFinite(lastEnd) && Number(lastEnd) >= Number(firstStart)) {
            const openSpan = Math.min(240, Math.max(0, Number(lastEnd) - Number(firstStart)));
            return openSpan * effectiveContestantTotalSpanWeight;
          }
          if (firstStartByContestant.size > 0) return -Math.round(effectiveContestantTotalSpanWeight * 8);
          return 0;
        };
        sa += scoreTotalSpan(a);
        sb += scoreTotalSpan(b);
      }

      // desempate estable: respeta orden original de topo-sort
      const oa = originalOrder.get(Number(a?.id)) ?? 0;
      const ob = originalOrder.get(Number(b?.id)) ?? 0;

      if (sb !== sa) return sb - sa;
      return oa - ob;
    });

    const task = ready[0];

    // removemos el elegido de pending
    const idx = pendingNonMeal.findIndex(
      (x) => Number(x?.id) === Number(task?.id),
    );
    if (idx >= 0) pendingNonMeal.splice(idx, 1);

    const out = scheduleNonMealTask(task);
    if (out) return out;
  }

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
    return { feasible: false, reasons: overlaps } as any;
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
    return { feasible: false, reasons: resourceOverlaps } as any;
  }

  return {
    feasible: true,
    plannedTasks,
    warnings,
  } as any;
}
