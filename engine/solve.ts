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

  // 1) Falta zoneId (no puede heredar recursos por plató ni ubicarse correctamente)
  const mealName = String((input as any)?.mealTaskTemplateName ?? "")
    .trim()
    .toLowerCase();
  for (const task of tasks as any[]) {
    const id = Number(task?.id);
    const zid = task?.zoneId;

    if (!Number.isFinite(id)) continue;

    const taskTemplateName = String(task?.templateName ?? "")
      .trim()
      .toLowerCase();
    const isMealTask = mealName.length > 0 && taskTemplateName === mealName;

    // ✅ EXCEPCIÓN: la tarea "comida" no requiere plató/zona y no debe generar warning
    if (isMealTask) continue;

    if (zid === null || zid === undefined || !Number.isFinite(Number(zid))) {
      excludedTaskIds.add(id);

      const who = task?.contestantName
        ? ` (${task.contestantName})`
        : task?.contestantId
          ? ` (concursante ${task.contestantId})`
          : "";

      const spaceInfo = Number.isFinite(Number(task?.spaceId))
        ? ` (spaceId ${Number(task.spaceId)})`
        : "";

      warnings.push({
        code: "REQUIRES_CONFIGURATION",
        taskId: id,
        message:
          `Requiere configuración: la tarea ${id}${who} no tiene plató/zona (zoneId).` +
          `${spaceInfo} Asigna un plató (zona) en la tarea o en su espacio.`,
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

        warnings.push({
          code: "REQUIRES_CONFIGURATION",
          taskId: id,
          message:
            `Requiere configuración: la tarea ${id} depende de ${Number(blocking)}, ` +
            `pero esa tarea está sin configuración (sin plató/zona) y se ha excluido.`,
        });
      }
    }
  }

  // Lista de tareas que sí entran al solve
  const tasksForSolve = (tasks as any[]).filter(
    (t) => !excludedTaskIds.has(Number(t?.id)),
  );

  // ✅ Validación: si una tarea tiene dependencias pero no podemos resolver TODOS sus prereqs -> infeasible
  const missingDeps: { code: string; message: string; taskId?: number }[] = [];

  const tplNameById = ((input as any)?.taskTemplateNameById ?? {}) as Record<
    number,
    string
  >;
  const tplLabel = (tplId: number) => {
    const nm = tplNameById[tplId];
    return nm ? nm : `Template ${tplId}`;
  };

  const taskById = new Map<number, any>();
  for (const t of tasks as any[]) taskById.set(Number(t?.id), t);

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
  const mealIntervals: Interval[] = []; // solo comidas de concursantes (para max simultáneo)

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
      lockedTaskIds.has(Number(task?.id));

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
    }

    const spaceId = Number(task?.spaceId ?? 0);
    if (spaceId) {
      const arr = occupiedBySpace.get(spaceId) ?? [];
      addIntervalSorted(arr, { start: s, end: e, taskId: Number(task.id) });
      occupiedBySpace.set(spaceId, arr);
    }

    const zoneId = Number(task?.zoneId ?? 0);
    if (contestantId && zoneId) lastZoneByContestant.set(contestantId, zoneId);

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
      if (!Number.isFinite(next) || next <= 0) break;

      sid = next;
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

  const isMealTask = (task: any) => {
    const n = String(task?.templateName ?? "")
      .trim()
      .toLowerCase();
    return mealName.length > 0 && n === mealName;
  };

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

  // “memoria” simple para intentar hacer bloques por espacio+tipo
  const lastTemplateBySpace = new Map<number, number>();

  // ✅ memoria para compactar por zona/concursante
  const lastEndByZone = new Map<number, number>();
  const lastEndByContestant = new Map<number, number>();
  const lastZoneByContestant = new Map<number, number>();

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

    // requisito mínimo para bloquear espacio (tu app es “requiere 1 espacio”)
    if (!spaceId) {
      // si faltase, ya lo filtras como REQUIRES_CONFIGURATION arriba
      return null;
    }

    // earliest por horario + deps
    let start = snapUp(Math.max(startDay, depsEnd(task)));

    // ✅ Restricción por disponibilidad del concursante (si existe)
    const effWin = getContestantEffectiveWindow(contestantId);
    if (effWin && effWin.start >= effWin.end) {
      return {
        feasible: false,
        reasons: [
          {
            code: "CONTESTANT_NO_AVAILABILITY",
            message:
              `El concursante ${task?.contestantName ?? contestantId} no tiene ventana válida ` +
              `al aplicar el cruce Plan ∩ Concursante.`,
            taskId,
          },
        ],
      } as any;
    }

    if (effWin) start = snapUp(Math.max(start, effWin.start));

    // bucle de búsqueda (avanzando GRID) hasta encajar con todas las restricciones
    const maxIter = 20000; // defensivo
    let iter = 0;

    while (iter++ < maxIter) {
      // 2.1) Espacio: hueco libre en space
      const spaceOcc = occupiedBySpace.get(spaceId) ?? [];
      let candidate = findEarliestGap(spaceOcc, start, duration);

      // 2.2) Bloqueo por comida de plató (zona): NO se puede solapar
      if (zoneId) {
        const zOcc = occupiedByZoneMeal.get(zoneId) ?? [];
        candidate = findEarliestGap(zOcc, candidate, duration);
      }

      // 2.3) Concursante: hueco libre
      if (contestantId) {
        const cOcc = occupiedByContestant.get(contestantId) ?? [];
        candidate = findEarliestGap(cOcc, candidate, duration);
      }

      // 2.4) Si movimos candidate, re-chequeamos (porque al mover por concursante podemos caer en espacio ocupado, etc.)
      if (candidate !== start) {
        start = snapUp(candidate);
        continue;
      }

      // ✅ No permitir que la tarea se salga de la ventana efectiva del concursante
      if (effWin && start + duration > effWin.end) {
        return {
          feasible: false,
          reasons: [
            {
              code: "CONTESTANT_NOT_AVAILABLE",
              message:
                `No cabe "${String(task?.templateName ?? "tarea").trim() || `tarea ${taskId}`}" ` +
                `para ${task?.contestantName ?? `concursante ${contestantId}`} dentro de su disponibilidad ` +
                `(${toHHMM(effWin.start)}–${toHHMM(effWin.end)}).`,
              taskId,
            },
          ],
        } as any;
      }

      const finish = start + duration;
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
      const spacePool = ignoreSpacePool ? [] : getSpacePool(spaceId);
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
        assignedSpace: spaceId,
        assignedResources: assigned,
      });
      plannedEndByTaskId.set(taskId, finish);

      // ✅ memoria para agrupar tareas iguales en el mismo espacio
      const tplId = Number(task?.templateId ?? 0);
      if (Number.isFinite(tplId) && tplId > 0)
        lastTemplateBySpace.set(spaceId, tplId);

      // ✅ memoria para “sin huecos” por zona
      const zId = getZoneId(task);
      if (zId) lastEndByZone.set(zId, finish);

      // ✅ memoria para compactar concursantes
      const cId = getContestantId(task);
      if (cId) {
        lastEndByContestant.set(cId, finish);
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
    const spacePool = ignoreSpacePool ? [] : getSpacePool(spaceId);
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
      assignedSpace: spaceId,
      assignedResources: assigned,
    });
    plannedEndByTaskId.set(taskId, finish);

    const tplId = Number(task?.templateId ?? 0);
    if (Number.isFinite(tplId) && tplId > 0)
      lastTemplateBySpace.set(spaceId, tplId);
    lastEndByZone.set(zoneId, finish);
    if (contestantId) {
      lastEndByContestant.set(contestantId, finish);
      lastZoneByContestant.set(contestantId, zoneId);
    }

    return true;
  };

  const pendingNonMeal = (tasksSorted as any[]).filter((task) => {
    if (isMealTask(task)) return false;

    const taskId = Number(task?.id);
    if (!Number.isFinite(taskId)) return false;

    const status = String(task?.status ?? "pending");
    const isFixed = status === "in_progress" || status === "done";
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

      // 4) Agrupar tareas iguales en el mismo espacio + espacio activo
      if (optGroupingLevel > 0) {
        const lastTpl = space ? (lastTemplateBySpace.get(space) ?? null) : null;

        if (space && lastTpl !== null && lastTpl === tpl) s += effectiveGroupingMatchWeight;
        if (space && lastTemplateBySpace.has(space)) s += effectiveGroupingActiveSpaceWeight;
      }

      // 5) Mantener concursante en el mismo plató (heurística blanda)
      if (effectiveContestantStayInZoneWeight > 0) {
        const cId = getContestantId(t);
        if (cId && zone && lastZoneByContestant.get(cId) === zone) {
          s += effectiveContestantStayInZoneWeight;
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

      // 4) Agrupar tareas iguales dentro del mismo espacio (según nivel)
      if (optGroupingLevel > 0) {
        const lastA = aSpace ? (lastTemplateBySpace.get(aSpace) ?? null) : null;
        const lastB = bSpace ? (lastTemplateBySpace.get(bSpace) ?? null) : null;

        if (aSpace && lastA !== null && lastA === aTpl)
          sa += effectiveGroupingMatchWeight;
        if (bSpace && lastB !== null && lastB === bTpl)
          sb += effectiveGroupingMatchWeight;

        // pequeño premio por seguir trabajando en un espacio “ya activo”
        if (aSpace && lastTemplateBySpace.has(aSpace))
          sa += effectiveGroupingActiveSpaceWeight;
        if (bSpace && lastTemplateBySpace.has(bSpace))
          sb += effectiveGroupingActiveSpaceWeight;
      }

      // 5) Mantener concursante en el mismo plató (solo bonus, sin penalización)
      if (effectiveContestantStayInZoneWeight > 0) {
        const aC = getContestantId(a);
        const bC = getContestantId(b);
        if (aC && aZone && lastZoneByContestant.get(aC) === aZone)
          sa += effectiveContestantStayInZoneWeight;
        if (bC && bZone && lastZoneByContestant.get(bC) === bZone)
          sb += effectiveContestantStayInZoneWeight;
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

  // 3) Comidas de concursantes: tareas “comida” CON concursante
  for (const task of tasksSorted as any[]) {
    if (!isMealTask(task)) continue;
    const contestantId = getContestantId(task);
    if (!contestantId) continue; // ✅ solo comidas con concursante

    const taskId = Number(task?.id);
    if (!Number.isFinite(taskId)) continue;

    const status = String(task?.status ?? "pending");
    const isFixed = status === "in_progress" || status === "done";
    if (isFixed) continue;

    const duration = contestantMealDuration;

    const cOcc = occupiedByContestant.get(contestantId) ?? [];
    let placed = false;

    const effWin = getContestantEffectiveWindow(contestantId);
    if (effWin && effWin.start >= effWin.end) {
      return {
        feasible: false,
        reasons: [
          {
            code: "CONTESTANT_NO_AVAILABILITY",
            message:
              `El concursante ${task?.contestantName ?? contestantId} no tiene ventana válida ` +
              `al aplicar el cruce Plan ∩ Concursante.`,
            taskId,
          },
        ],
      } as any;
    }

    const mealWinStart = snapUp(
      Math.max(mealStart, effWin ? effWin.start : mealStart),
    );
    const mealWinEnd = Math.min(mealEnd, effWin ? effWin.end : mealEnd);

    for (
      let start = mealWinStart;
      start + duration <= mealWinEnd;
      start += GRID
    ) {
      const finish = start + duration;

      // concursante libre
      if (findEarliestGap(cOcc, start, duration) !== start) continue;

      // max simultáneo comiendo
      let concurrent = 0;
      for (const it of mealIntervals) {
        if (rangesOverlap(start, finish, it.start, it.end)) concurrent++;
      }
      if (concurrent >= contestantMealMaxSim) continue;

      // OK -> reservar
      addIntervalSorted(cOcc, { start, end: finish, taskId });
      occupiedByContestant.set(contestantId, cOcc);
      addIntervalSorted(mealIntervals, { start, end: finish, taskId });

      plannedTasks.push({
        taskId,
        startPlanned: toHHMM(start),
        endPlanned: toHHMM(finish),
        assignedSpace: null,
        assignedResources: [],
      });
      plannedEndByTaskId.set(taskId, finish);

      placed = true;
      break;
    }

    if (!placed) {
      return {
        feasible: false,
        reasons: [
          {
            code: "MEAL_CONTESTANT_NO_FIT",
            message:
              `No se pudo encajar la comida del concursante dentro de la ventana (${toHHMM(mealStart)}–${toHHMM(mealEnd)}) ` +
              `respetando máximo simultáneo (${contestantMealMaxSim}).`,
            taskId,
          },
        ],
      } as any;
    }
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

    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const curr = list[i];

      if (curr.start < prev.end) {
        // Nombre (preferimos el del input, y si no, el del byTaskId)
        const prevTask = tasks.find((x) => x.id === prev.taskId);
        const name =
          (prevTask as any)?.contestantName ??
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
