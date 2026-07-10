import type { EngineInput, TaskInput, TimeWindow } from "../types";

export interface EngineInputPreflightIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  evidence?: Record<string, unknown>;
}
export type TaskOperationalKind =
  | "productive_task"
  | "contestant_meal"
  | "synthetic_space_meal"
  | "synthetic_itinerant_meal";
export interface EngineInputFacts {
  tasks: number;
  productiveTasks: number;
  syntheticTasks: number;
  pendingTasks: number;
  protectedTasks: number;
  contestants: number;
  contestantsWithAvailability: number;
  spaces: number;
  knownSpaces: number;
  usedSpaces: number;
  zones: number;
  knownZones: number;
  usedZones: number;
  resources: number;
  locks: number;
  dependencyEdgesByTaskId: number;
  dependencyEdgesByTemplateId: number;
  tasksByTemplate: Record<string, number>;
  tasksBySpace: Record<string, number>;
  tasksByZone: Record<string, number>;
  tasksByOperationalKind: Record<TaskOperationalKind, number>;
  meal: {
    contestantMealTasks: number;
    syntheticSpaceMealTasks: number;
    syntheticItinerantMealTasks: number;
    otherMealTasks: number;
    durationMinutesByKind: Record<string, number[]>;
    mealWindow: { start: string | null; end: string | null };
  };
  mainZone: {
    zoneId: number | null;
    spaceIds: number[];
    productiveTaskCount: number;
    productiveDurationMinutes: number;
  };
}
export interface EngineInputConfigurationSummary {
  mainZoneId: number | null;
  prioritizeMainZone: boolean | null;
  mainZonePriorityLevel: number | null;
  mainZoneKeepBusy: boolean | null;
  mainZoneFinishEarly: boolean | null;
  contestantCompactLevel: number | null;
  contestantStayInZoneLevel: number | null;
  groupingLevel: number | null;
  groupingBySpaceAndTemplate: boolean | null;
  optimizerWeights: Record<string, number>;
  mealMode: string | null;
  mealWindow: { start: string | null; end: string | null };
  maxTemplateChangesByZoneId: Record<string, number>;
}
export interface EngineInputPreflightReport {
  version: "ENGINE_INPUT_PREFLIGHT_V1";
  valid: boolean;
  errors: EngineInputPreflightIssue[];
  warnings: EngineInputPreflightIssue[];
  facts: EngineInputFacts;
  configuration: EngineInputConfigurationSummary;
}

const push = (
  list: EngineInputPreflightIssue[],
  code: string,
  severity: "error" | "warning",
  message: string,
  evidence?: Record<string, unknown>,
) => list.push({ code, severity, message, ...(evidence ? { evidence } : {}) });
const isRealId = (v: unknown) =>
  Number.isFinite(Number(v)) && Number(v) > 0 && String(v) !== "<none>";
const ids = (r: unknown) =>
  r && typeof r === "object"
    ? Object.keys(r as any)
        .filter(isRealId)
        .map(Number)
    : [];
const arr = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);
const inc = (r: Record<string, number>, k: unknown) => {
  const key = k == null || k === "" ? "<none>" : String(k);
  r[key] = (r[key] ?? 0) + 1;
};
const minutes = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const timeOk = (w?: Partial<TimeWindow> | null) =>
  !w || !w.start || !w.end || w.end > w.start;
function mealTemplateName(input: EngineInput) {
  return String(input.mealTaskTemplateName ?? "")
    .trim()
    .toLowerCase();
}
function taskTemplateName(t: TaskInput, input: EngineInput) {
  return String(
    t.templateName ?? input.taskTemplateNameById?.[t.templateId] ?? "",
  )
    .trim()
    .toLowerCase();
}
function isConfiguredMealTemplate(t: TaskInput, input: EngineInput) {
  const configuredId = Number(input.mealTaskTemplateId);
  if (
    Number.isFinite(configuredId) &&
    configuredId > 0 &&
    Number(t.templateId) === configuredId
  )
    return true;
  const configuredName = mealTemplateName(input);
  return (
    configuredName.length > 0 && taskTemplateName(t, input) === configuredName
  );
}
function isMealNameFallback(t: TaskInput, input: EngineInput) {
  const name = taskTemplateName(t, input);
  return (
    name.includes("comida") || name.includes("meal") || name.includes("sodexo")
  );
}
function isContestantMeal(t: TaskInput, input: EngineInput) {
  return (
    t.contestantId != null &&
    (isConfiguredMealTemplate(t, input) || isMealNameFallback(t, input))
  );
}
export function classifyTaskOperationalKind(
  t: TaskInput,
  input: EngineInput,
): TaskOperationalKind {
  if (
    t.breakKind === "space_meal" ||
    (t.operationalRole === "meal_break_placeholder" &&
      t.itinerantTeamId == null)
  )
    return "synthetic_space_meal";
  if (
    t.breakKind === "itinerant_meal" ||
    (t.operationalRole === "meal_break_placeholder" &&
      t.itinerantTeamId != null)
  )
    return "synthetic_itinerant_meal";
  if (isContestantMeal(t, input)) return "contestant_meal";
  return "productive_task";
}
function isSynthetic(t: TaskInput, input: EngineInput) {
  const kind = classifyTaskOperationalKind(t, input);
  return kind === "synthetic_space_meal" || kind === "synthetic_itinerant_meal";
}
function durationOf(t: TaskInput) {
  const n = Number(t.durationOverrideMin);
  return Number.isFinite(n) ? n : 0;
}
function dependencyTaskIds(t: TaskInput) {
  return [
    ...arr(t.dependsOnTaskIds),
    ...(t.dependsOnTaskId != null ? [t.dependsOnTaskId] : []),
  ]
    .map(Number)
    .filter(Number.isFinite);
}
function dependencyTemplateIds(t: TaskInput) {
  return [
    ...arr(t.dependsOnTemplateIds),
    ...(t.dependsOnTemplateId != null ? [t.dependsOnTemplateId] : []),
  ]
    .map(Number)
    .filter(Number.isFinite);
}

export function inspectEngineInput(
  input: EngineInput,
): EngineInputPreflightReport {
  const errors: EngineInputPreflightIssue[] = [],
    warnings: EngineInputPreflightIssue[] = [];
  const tasks = arr(input.tasks);
  const taskIds = new Set<number>();
  const dup: number[] = [];
  for (const t of tasks) taskIds.has(t.id) ? dup.push(t.id) : taskIds.add(t.id);
  if (dup.length)
    push(errors, "DUPLICATE_TASK_ID", "error", "Duplicate task ids found.", {
      taskIds: dup,
    });
  const resourceIds = new Set(arr(input.planResourceItems).map((r) => r.id));
  const usedSpaceIds = new Set(
    tasks
      .map((t) => t.spaceId)
      .filter(isRealId)
      .map(Number),
  );
  const usedZoneIds = new Set(
    tasks
      .map((t) => t.zoneId)
      .filter(isRealId)
      .map(Number),
  );
  const catalogSpaceIds = new Set([
    ...ids(input.spaceNameById),
    ...ids(input.spaceParentById),
    ...ids(input.zoneIdBySpaceId),
    ...ids(input.spaceResourceAssignments),
  ]);
  const spaceIds = new Set([...catalogSpaceIds, ...usedSpaceIds]);
  const zoneIds = new Set([
    ...ids(input.spaceIdsByZoneId),
    ...ids(input.zoneResourceAssignments),
    ...ids(input.zoneResourceTypeRequirements),
    ...usedZoneIds,
  ]);
  const contestantTaskIds = new Set<number>();
  const graph = new Map<number, number[]>();
  let depTask = 0,
    depTemplate = 0;
  for (const t of tasks) {
    if (t.contestantId != null && Number.isFinite(Number(t.contestantId)))
      contestantTaskIds.add(Number(t.contestantId));
    const deps = dependencyTaskIds(t);
    depTask += deps.length;
    depTemplate += dependencyTemplateIds(t).length;
    graph.set(t.id, deps);
    for (const d of deps) {
      if (!taskIds.has(d))
        push(
          errors,
          "DEPENDENCY_TASK_NOT_FOUND",
          "error",
          "Task depends on missing task.",
          { taskId: t.id, dependsOnTaskId: d },
        );
      if (d === t.id)
        push(errors, "SELF_DEPENDENCY", "error", "Task depends on itself.", {
          taskId: t.id,
        });
    }
    if (
      !!t.hasDependency !== deps.length + dependencyTemplateIds(t).length > 0 &&
      t.hasDependency != null
    )
      push(
        warnings,
        "HAS_DEPENDENCY_INCONSISTENT",
        "warning",
        "hasDependency does not match dependency arrays.",
        { taskId: t.id },
      );
    if (
      t.spaceId != null &&
      Number(t.spaceId) !== 0 &&
      !catalogSpaceIds.has(Number(t.spaceId))
    )
      push(
        errors,
        "SPACE_NOT_FOUND",
        "error",
        "Task references missing space.",
        { taskId: t.id, spaceId: t.spaceId },
      );
    if (
      classifyTaskOperationalKind(t, input) === "productive_task" &&
      !isRealId(t.spaceId)
    )
      push(
        errors,
        "PRODUCTIVE_TASK_WITHOUT_SPACE",
        "error",
        "Productive task has no real space.",
        { taskId: t.id },
      );
    for (const r of arr(t.assignedResourceIds))
      if (!resourceIds.has(Number(r)))
        push(
          errors,
          "RESOURCE_NOT_FOUND",
          "error",
          "Task references missing assigned resource.",
          { taskId: t.id, resourceId: r },
        );
    const dur = t.durationOverrideMin;
    if (dur != null && (!Number.isFinite(Number(dur)) || Number(dur) <= 0))
      push(
        errors,
        "INVALID_TASK_DURATION",
        "error",
        "Task duration must be positive and finite.",
        { taskId: t.id, durationOverrideMin: dur },
      );
    if (
      ["in_progress", "done"].includes(t.status) &&
      (!t.startPlanned || !t.endPlanned)
    )
      push(
        warnings,
        "PROTECTED_TASK_WITHOUT_PROTECTED_TIMES",
        "warning",
        "Protected task is missing planned times.",
        { taskId: t.id, status: t.status },
      );
    if (
      !timeOk({
        start: t.fixedWindowStart ?? undefined,
        end: t.fixedWindowEnd ?? undefined,
      })
    )
      push(
        errors,
        "INVALID_TIME_WINDOW",
        "error",
        "Task fixed window ends before or at start.",
        { taskId: t.id },
      );
    for (const tid of dependencyTemplateIds(t))
      if (!input.taskTemplateNameById?.[tid])
        push(
          warnings,
          "UNKNOWN_DEPENDENCY_TEMPLATE_NAME",
          "warning",
          "Dependency template id has no known name.",
          { taskId: t.id, templateId: tid },
        );
  }
  for (const l of arr(input.locks))
    if (!taskIds.has(l.taskId))
      push(
        errors,
        "LOCK_TASK_NOT_FOUND",
        "error",
        "Lock references missing task.",
        { lockId: l.id, taskId: l.taskId },
      );
  for (const [cid, w] of Object.entries(
    input.contestantAvailabilityById ?? {},
  )) {
    if (!contestantTaskIds.has(Number(cid)))
      push(
        warnings,
        "CONTESTANT_AVAILABILITY_WITHOUT_TASKS",
        "warning",
        "Contestant has availability but no tasks.",
        { contestantId: Number(cid) },
      );
    if (!timeOk(w))
      push(
        errors,
        "INVALID_CONTESTANT_AVAILABILITY",
        "error",
        "Contestant availability window is invalid.",
        { contestantId: Number(cid) },
      );
  }
  for (const cid of contestantTaskIds)
    if (!input.contestantAvailabilityById?.[cid])
      push(
        warnings,
        "CONTESTANT_TASKS_WITHOUT_AVAILABILITY",
        "warning",
        "Contestant has tasks but no availability.",
        { contestantId: cid },
      );
  const visiting = new Set<number>(),
    visited = new Set<number>();
  const cycle: number[] = [];
  const dfs = (id: number, path: number[]) => {
    if (visiting.has(id)) {
      cycle.push(...path.slice(path.indexOf(id)), id);
      return;
    }
    if (visited.has(id) || cycle.length) return;
    visiting.add(id);
    for (const d of graph.get(id) ?? [])
      if (taskIds.has(d)) dfs(d, [...path, d]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of taskIds) dfs(id, [id]);
  if (cycle.length)
    push(errors, "DEPENDENCY_CYCLE", "error", "Dependency cycle found.", {
      cycle,
    });

  const tasksByTemplate: Record<string, number> = {},
    tasksBySpace: Record<string, number> = {},
    tasksByZone: Record<string, number> = {};
  const tasksByOperationalKind: Record<TaskOperationalKind, number> = {
    productive_task: 0,
    contestant_meal: 0,
    synthetic_space_meal: 0,
    synthetic_itinerant_meal: 0,
  };
  const mealDur: Record<string, number[]> = {};
  let productiveTasks = 0,
    syntheticTasks = 0,
    contestantMealTasks = 0,
    syntheticSpaceMealTasks = 0,
    syntheticItinerantMealTasks = 0,
    otherMealTasks = 0;
  for (const t of tasks) {
    const kind = classifyTaskOperationalKind(t, input);
    tasksByOperationalKind[kind]++;
    if (kind === "productive_task") productiveTasks++;
    else if (kind === "contestant_meal") contestantMealTasks++;
    else {
      syntheticTasks++;
      if (kind === "synthetic_space_meal") syntheticSpaceMealTasks++;
      else syntheticItinerantMealTasks++;
    }
    inc(tasksByTemplate, t.templateName ?? t.templateId);
    inc(tasksBySpace, t.spaceId);
    inc(tasksByZone, t.zoneId);
    if (kind !== "productive_task") {
      const k =
        kind === "contestant_meal"
          ? "contestant"
          : kind === "synthetic_space_meal"
            ? "synthetic_space"
            : "synthetic_itinerant";
      mealDur[k] ??= [];
      mealDur[k].push(durationOf(t));
    }
  }
  if (
    tasks.length !==
    productiveTasks +
      contestantMealTasks +
      syntheticSpaceMealTasks +
      syntheticItinerantMealTasks +
      otherMealTasks
  )
    push(
      errors,
      "TASK_CLASSIFICATION_COUNT_MISMATCH",
      "error",
      "Task classification counts do not add up.",
      {
        tasks: tasks.length,
        productiveTasks,
        contestantMealTasks,
        syntheticSpaceMealTasks,
        syntheticItinerantMealTasks,
        otherMealTasks,
      },
    );
  const mainZoneId = input.optimizerMainZoneId ?? null;
  const mainSpaces =
    mainZoneId == null
      ? []
      : (
          input.spaceIdsByZoneId?.[mainZoneId] ??
          [...spaceIds].filter((s) => input.zoneIdBySpaceId?.[s] === mainZoneId)
        ).sort((a, b) => a - b);
  let mainCount = 0,
    mainDur = 0;
  for (const t of tasks)
    if (
      classifyTaskOperationalKind(t, input) === "productive_task" &&
      (t.zoneId === mainZoneId ||
        (t.spaceId != null && mainSpaces.includes(t.spaceId)))
    ) {
      mainCount++;
      mainDur += durationOf(t);
    }
  const configuration: EngineInputConfigurationSummary = {
    mainZoneId,
    prioritizeMainZone: input.optimizerPrioritizeMainZone ?? null,
    mainZonePriorityLevel: input.optimizerMainZonePriorityLevel ?? null,
    mainZoneKeepBusy: input.optimizerMainZoneOptKeepBusy ?? null,
    mainZoneFinishEarly: input.optimizerMainZoneOptFinishEarly ?? null,
    contestantCompactLevel: input.optimizerContestantCompactLevel ?? null,
    contestantStayInZoneLevel: input.optimizerContestantStayInZoneLevel ?? null,
    groupingLevel: input.optimizerGroupingLevel ?? null,
    groupingBySpaceAndTemplate: input.optimizerGroupBySpaceAndTemplate ?? null,
    optimizerWeights: Object.fromEntries(
      Object.entries(input.optimizerWeights ?? {})
        .filter(([, v]) => Number.isFinite(Number(v)))
        .map(([k, v]) => [k, Number(v)]),
    ),
    mealMode: input.mealMode ?? null,
    mealWindow: {
      start:
        input.mealWindow?.start ??
        input.mealWindowStart ??
        input.meal?.start ??
        null,
      end:
        input.mealWindow?.end ?? input.mealWindowEnd ?? input.meal?.end ?? null,
    },
    maxTemplateChangesByZoneId: Object.fromEntries(
      Object.entries(input.maxTemplateChangesByZoneId ?? {}).map(([k, v]) => [
        k,
        Number(v),
      ]),
    ),
  };
  if (
    configuration.mainZoneId != null &&
    configuration.prioritizeMainZone === false
  )
    push(
      warnings,
      "MAIN_ZONE_IDENTIFIED_BUT_NOT_PRIORITIZED",
      "warning",
      "Main zone is configured but prioritization is disabled.",
    );
  if (
    configuration.mainZoneKeepBusy &&
    Number(configuration.mainZonePriorityLevel ?? 0) === 0
  )
    push(
      warnings,
      "MAIN_ZONE_KEEP_BUSY_ENABLED_WITH_PRIORITY_LEVEL_ZERO",
      "warning",
      "Main-zone keep-busy is enabled with priority level zero.",
    );
  if (configuration.mainZoneFinishEarly === false)
    push(
      warnings,
      "MAIN_ZONE_FINISH_EARLY_DISABLED",
      "warning",
      "Main-zone finish-early is disabled.",
    );
  if (Number(configuration.contestantCompactLevel ?? 0) === 0)
    push(
      warnings,
      "CONTESTANT_COMPACTNESS_DISABLED",
      "warning",
      "Contestant compactness is disabled.",
    );
  if (Number(configuration.contestantStayInZoneLevel ?? 0) === 0)
    push(
      warnings,
      "CONTESTANT_ZONE_STABILITY_DISABLED",
      "warning",
      "Contestant zone stability is disabled.",
    );
  if (
    configuration.groupingBySpaceAndTemplate &&
    Number(configuration.groupingLevel ?? 0) === 0
  )
    push(
      warnings,
      "GROUPING_LEVEL_ZERO_WITH_GROUPING_FLAG_ENABLED",
      "warning",
      "Grouping flag is enabled with grouping level zero.",
    );
  const facts: EngineInputFacts = {
    tasks: tasks.length,
    productiveTasks,
    syntheticTasks,
    pendingTasks: tasks.filter((t) => t.status === "pending").length,
    protectedTasks: tasks.filter(
      (t) =>
        t.status === "in_progress" ||
        t.status === "done" ||
        t.seedSource === "protected_existing_planning",
    ).length,
    contestants: contestantTaskIds.size,
    contestantsWithAvailability: Object.keys(
      input.contestantAvailabilityById ?? {},
    ).length,
    spaces: spaceIds.size,
    knownSpaces: spaceIds.size,
    usedSpaces: usedSpaceIds.size,
    zones: zoneIds.size,
    knownZones: zoneIds.size,
    usedZones: usedZoneIds.size,
    resources: arr(input.planResourceItems).length,
    locks: arr(input.locks).length,
    dependencyEdgesByTaskId: depTask,
    dependencyEdgesByTemplateId: depTemplate,
    tasksByTemplate,
    tasksBySpace,
    tasksByZone,
    tasksByOperationalKind,
    meal: {
      contestantMealTasks,
      syntheticSpaceMealTasks,
      syntheticItinerantMealTasks,
      otherMealTasks,
      durationMinutesByKind: mealDur,
      mealWindow: configuration.mealWindow,
    },
    mainZone: {
      zoneId: mainZoneId,
      spaceIds: mainSpaces,
      productiveTaskCount: mainCount,
      productiveDurationMinutes: mainDur,
    },
  };
  return {
    version: "ENGINE_INPUT_PREFLIGHT_V1",
    valid: errors.length === 0,
    errors,
    warnings,
    facts,
    configuration,
  };
}
