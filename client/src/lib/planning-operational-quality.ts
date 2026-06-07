export const OPERATIONAL_QUALITY_LIMITS = {
  talent: 15,
  coach: 10,
  feeder: 10,
  transportGroups: 12,
  concerns: 5,
  positiveSignals: 4,
} as const;

export const OPERATIONAL_QUALITY_THRESHOLDS = {
  largeGapMinutes: 45,
  highIdleRatio: 0.5,
  longSpanMinutes: 360,
  highFeederGapMinutes: 90,
} as const;

type UnknownRecord = Record<string, unknown>;

export type OperationalQualityInput = {
  tasks?: unknown[] | null;
  contestants?: unknown[] | null;
  resourceNamesById?: Record<number, string> | Record<string, string> | null;
  vanCapacity?: number | null;
  arrivalTaskTemplateName?: string | null;
  departureTaskTemplateName?: string | null;
};

type ScheduledTask = {
  contestantId: number | null;
  start: number;
  end: number;
  startTime: string;
  endTime: string;
  label: string;
  searchText: string;
  resourceIds: number[];
};

export type OperationalPersonMetric = {
  name: string;
  taskCount: number;
  firstTaskStart: string;
  lastTaskEnd: string;
  spanMinutes: number;
  activeMinutes: number;
  idleMinutes: number;
  idleRatio: number;
  maxGapMinutes: number;
  largeGapCount: number;
  mainStageTaskCount: number;
  transportInTime: string | null;
  transportOutTime: string | null;
  warnings: string[];
};

export type OperationalCoachMetric = {
  coachName: string;
  firstTaskStart: string;
  lastTaskEnd: string;
  spanMinutes: number;
  activeMinutes: number;
  idleMinutes: number;
  idleRatio: number;
  maxGapMinutes: number;
  sessionBlocks: number;
  taskCount: number;
  warnings: string[];
};

export type OperationalQuality = {
  summary: {
    status: "good" | "review" | "poor" | "unknown";
    score: number | null;
    mainConcerns: string[];
    positiveSignals: string[];
  };
  topTalentIdle: OperationalPersonMetric[];
  topCoachIdle: OperationalCoachMetric[];
  feederToMainGaps: {
    averageFeederToMainGap: number | null;
    maxFeederToMainGap: number | null;
    topCases: Array<{
      talentName: string;
      feederTask: string;
      feederEnd: string;
      mainStageStart: string;
      gapMinutes: number;
    }>;
  };
  transportSummary: {
    analysisAvailable: boolean;
    vanCapacity: number | null;
    maxObservedConcurrency: number | null;
    capacityExceeded: boolean | null;
    averageSpacingMinutes: number | null;
    groups: Array<{ direction: "IN" | "OUT"; time: string; taskCount: number }>;
    warnings: string[];
  };
  analysisAvailability: {
    talentAnalysisAvailable: boolean;
    coachAnalysisAvailable: boolean;
    coachExplanation: string | null;
    feederAnalysisAvailable: boolean;
    feederExplanation: string | null;
    transportAnalysisAvailable: boolean;
  };
  counts: {
    scheduledTasksAnalyzed: number;
    talentsAnalyzed: number;
    coachesAnalyzed: number;
    feederCasesAnalyzed: number;
    transportTasksAnalyzed: number;
  };
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function minutesFromTime(value: unknown): number | null {
  const text = cleanString(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 47 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function displayTime(value: unknown, minutes: number): string {
  const text = cleanString(value);
  if (text) return text.slice(0, 5);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function taskLabel(task: UnknownRecord): string {
  const template = record(task.template ?? task.taskTemplate ?? task.task_template);
  return cleanString(task.manualTitle ?? task.manual_title)
    ?? cleanString(template.name ?? template.title)
    ?? cleanString(task.name ?? task.title)
    ?? "Tarea sin nombre";
}

function taskSearchText(task: UnknownRecord, label: string): string {
  const template = record(task.template ?? task.taskTemplate ?? task.task_template);
  return normalize([
    label,
    task.locationLabel,
    task.location_label,
    task.spaceName,
    task.space_name,
    template.name,
    template.abbrev,
    template.category,
    template.type,
  ].filter(Boolean).join(" "));
}

function resourceIds(task: UnknownRecord): number[] {
  const raw = task.assignedResources ?? task.assigned_resources ?? task.assigned_resource_ids;
  return Array.isArray(raw)
    ? [...new Set(raw.map(finiteNumber).filter((id): id is number => id !== null && id > 0))]
    : [];
}

function scheduledTasks(input: OperationalQualityInput): ScheduledTask[] {
  if (!Array.isArray(input.tasks)) return [];
  return input.tasks.flatMap((value) => {
    const task = record(value);
    const startValue = task.startPlanned ?? task.start_planned;
    const endValue = task.endPlanned ?? task.end_planned;
    const start = minutesFromTime(startValue);
    const end = minutesFromTime(endValue);
    if (start === null || end === null || end <= start) return [];
    const label = taskLabel(task);
    return [{
      contestantId: finiteNumber(task.contestantId ?? task.contestant_id),
      start,
      end,
      startTime: displayTime(startValue, start),
      endTime: displayTime(endValue, end),
      label,
      searchText: taskSearchText(task, label),
      resourceIds: resourceIds(task),
    }];
  });
}

function isMainStage(task: ScheduledTask): boolean {
  return /\bmain\s*stage\b|\bplato\s*7\b/.test(task.searchText);
}

function isFeeder(task: ScheduledTask): boolean {
  return /prueba\s*vocal|\bcoach\b|\bensayo\b|\btotales?\b|\breality\b|preparacion/.test(task.searchText);
}

function transportDirection(task: ScheduledTask, input: OperationalQualityInput): "IN" | "OUT" | null {
  const arrival = normalize(input.arrivalTaskTemplateName);
  const departure = normalize(input.departureTaskTemplateName);
  if ((arrival && task.searchText.includes(arrival)) || /(^|\s)(in|llegada|recogida)(\s|$)/.test(task.searchText)) return "IN";
  if ((departure && task.searchText.includes(departure)) || /(^|\s)(out|salida|vuelta)(\s|$)/.test(task.searchText)) return "OUT";
  return null;
}

function intervalMetrics(tasks: ScheduledTask[]) {
  const sorted = [...tasks].sort((a, b) => a.start - b.start || a.end - b.end);
  const first = sorted[0];
  const lastEnd = Math.max(...sorted.map((task) => task.end));
  let activeMinutes = 0;
  let currentStart = first.start;
  let currentEnd = first.end;
  const gaps: number[] = [];

  for (const task of sorted.slice(1)) {
    if (task.start > currentEnd) {
      activeMinutes += currentEnd - currentStart;
      gaps.push(task.start - currentEnd);
      currentStart = task.start;
      currentEnd = task.end;
    } else {
      currentEnd = Math.max(currentEnd, task.end);
    }
  }
  activeMinutes += currentEnd - currentStart;

  const spanMinutes = lastEnd - first.start;
  const idleMinutes = Math.max(0, spanMinutes - activeMinutes);
  const largeGaps = gaps.filter((gap) => gap >= OPERATIONAL_QUALITY_THRESHOLDS.largeGapMinutes);
  return {
    firstTaskStart: first.startTime,
    lastTaskEnd: displayTime(null, lastEnd),
    spanMinutes,
    activeMinutes,
    idleMinutes,
    idleRatio: spanMinutes > 0 ? Number((idleMinutes / spanMinutes).toFixed(2)) : 0,
    maxGapMinutes: gaps.length ? Math.max(...gaps) : 0,
    largeGapCount: largeGaps.length,
    sessionBlocks: largeGaps.length + 1,
  };
}

function metricWarnings(name: string, metric: ReturnType<typeof intervalMetrics>): string[] {
  const warnings: string[] = [];
  if (metric.spanMinutes >= OPERATIONAL_QUALITY_THRESHOLDS.longSpanMinutes) warnings.push(`${name}: jornada larga (${metric.spanMinutes} min)`);
  if (metric.idleRatio >= OPERATIONAL_QUALITY_THRESHOLDS.highIdleRatio) warnings.push(`${name}: idle alto (${Math.round(metric.idleRatio * 100)}%)`);
  if (metric.maxGapMinutes >= OPERATIONAL_QUALITY_THRESHOLDS.largeGapMinutes) warnings.push(`${name}: hueco máximo ${metric.maxGapMinutes} min`);
  return warnings;
}

function contestantNames(input: OperationalQualityInput): Map<number, string> {
  const names = new Map<number, string>();
  for (const value of Array.isArray(input.contestants) ? input.contestants : []) {
    const contestant = record(value);
    const id = finiteNumber(contestant.id ?? contestant.contestantId ?? contestant.contestant_id);
    if (id === null) continue;
    names.set(id, cleanString(contestant.name) ?? `Talent ${id}`);
  }
  return names;
}

function calculateTalentMetrics(tasks: ScheduledTask[], names: Map<number, string>, input: OperationalQualityInput) {
  const byContestant = new Map<number, ScheduledTask[]>();
  for (const task of tasks) {
    if (task.contestantId === null) continue;
    const bucket = byContestant.get(task.contestantId) ?? [];
    bucket.push(task);
    byContestant.set(task.contestantId, bucket);
  }

  return [...byContestant.entries()].map(([id, contestantTasks]) => {
    const name = names.get(id) ?? `Talent ${id}`;
    const metric = intervalMetrics(contestantTasks);
    const { sessionBlocks: _sessionBlocks, ...talentMetric } = metric;
    const inbound = contestantTasks.filter((task) => transportDirection(task, input) === "IN").sort((a, b) => a.start - b.start)[0];
    const outbound = contestantTasks.filter((task) => transportDirection(task, input) === "OUT").sort((a, b) => b.end - a.end)[0];
    return {
      id,
      tasks: contestantTasks,
      exportMetric: {
        name,
        taskCount: contestantTasks.length,
        ...talentMetric,
        mainStageTaskCount: contestantTasks.filter(isMainStage).length,
        transportInTime: inbound?.startTime ?? null,
        transportOutTime: outbound?.endTime ?? null,
        warnings: metricWarnings(name, metric),
      } satisfies OperationalPersonMetric,
    };
  });
}

function calculateCoachMetrics(tasks: ScheduledTask[], input: OperationalQualityInput): OperationalCoachMetric[] {
  const configuredCoachIds = new Set((Array.isArray(input.contestants) ? input.contestants : []).flatMap((value) => {
    const contestant = record(value);
    const id = finiteNumber(
      contestant.vocalCoachPlanResourceItemId
      ?? contestant.vocal_coach_plan_resource_item_id,
    );
    return id !== null && id > 0 ? [id] : [];
  }));
  const resourceNames = Object.entries(input.resourceNamesById ?? {}).flatMap(([rawId, rawName]) => {
    const id = finiteNumber(rawId);
    const name = cleanString(rawName);
    if (id === null || !name || (!configuredCoachIds.has(id) && !/coach|vocal/.test(normalize(name)))) return [];
    return [{ id, name }];
  });

  return resourceNames.flatMap(({ id, name }) => {
    const coachTasks = tasks.filter((task) => task.resourceIds.includes(id));
    if (!coachTasks.length) return [];
    const metric = intervalMetrics(coachTasks);
    const warnings = metricWarnings(name, metric);
    if (metric.sessionBlocks > 1) warnings.push(`${name}: jornada partida (${metric.sessionBlocks} bloques)`);
    return [{
      coachName: name,
      firstTaskStart: metric.firstTaskStart,
      lastTaskEnd: metric.lastTaskEnd,
      spanMinutes: metric.spanMinutes,
      activeMinutes: metric.activeMinutes,
      idleMinutes: metric.idleMinutes,
      idleRatio: metric.idleRatio,
      maxGapMinutes: metric.maxGapMinutes,
      sessionBlocks: metric.sessionBlocks,
      taskCount: coachTasks.length,
      warnings,
    }];
  });
}

function calculateFeeders(talents: ReturnType<typeof calculateTalentMetrics>) {
  const cases = talents.flatMap(({ exportMetric, tasks }) => tasks.filter(isMainStage).flatMap((mainTask) => {
    const feeder = tasks
      .filter((task) => isFeeder(task) && task.end <= mainTask.start)
      .sort((a, b) => b.end - a.end)[0];
    if (!feeder) return [];
    return [{
      talentName: exportMetric.name,
      feederTask: feeder.label,
      feederEnd: feeder.endTime,
      mainStageStart: mainTask.startTime,
      gapMinutes: mainTask.start - feeder.end,
    }];
  }));
  const sorted = cases.sort((a, b) => b.gapMinutes - a.gapMinutes);
  return {
    available: cases.length > 0,
    average: cases.length ? Math.round(cases.reduce((sum, item) => sum + item.gapMinutes, 0) / cases.length) : null,
    max: cases.length ? Math.max(...cases.map((item) => item.gapMinutes)) : null,
    cases: sorted.slice(0, OPERATIONAL_QUALITY_LIMITS.feeder),
    count: cases.length,
  };
}

function calculateTransport(tasks: ScheduledTask[], input: OperationalQualityInput) {
  const transportTasks = tasks.flatMap((task) => {
    const direction = transportDirection(task, input);
    return direction ? [{ task, direction }] : [];
  });
  const groupsMap = new Map<string, { direction: "IN" | "OUT"; time: string; minute: number; taskCount: number }>();
  for (const { task, direction } of transportTasks) {
    const minute = direction === "IN" ? task.end : task.start;
    const time = displayTime(null, minute);
    const key = `${direction}:${minute}`;
    const group = groupsMap.get(key) ?? { direction, time, minute, taskCount: 0 };
    group.taskCount += 1;
    groupsMap.set(key, group);
  }
  const allGroups = [...groupsMap.values()].sort((a, b) => a.minute - b.minute || a.direction.localeCompare(b.direction));
  const spacings = (["IN", "OUT"] as const).flatMap((direction) => {
    const directional = allGroups.filter((group) => group.direction === direction);
    return directional.slice(1).map((group, index) => group.minute - directional[index].minute);
  });
  const concurrencyEvents = transportTasks
    .flatMap(({ task }) => [{ minute: task.start, delta: 1 }, { minute: task.end, delta: -1 }])
    .sort((a, b) => a.minute - b.minute || a.delta - b.delta);
  let currentConcurrency = 0;
  let maxObservedConcurrency: number | null = transportTasks.length ? 0 : null;
  for (const event of concurrencyEvents) {
    currentConcurrency += event.delta;
    maxObservedConcurrency = Math.max(maxObservedConcurrency ?? 0, currentConcurrency);
  }
  const vanCapacity = finiteNumber(input.vanCapacity);
  const capacityExceeded = maxObservedConcurrency === null || vanCapacity === null || vanCapacity <= 0
    ? null
    : maxObservedConcurrency > vanCapacity;
  const warnings: string[] = [];
  if (capacityExceeded) warnings.push(`Concurrencia de transporte ${maxObservedConcurrency} supera capacidad ${vanCapacity}`);
  for (const group of allGroups.filter((group) => vanCapacity !== null && vanCapacity > 0 && group.taskCount > vanCapacity).slice(0, 3)) {
    warnings.push(`Grupo ${group.direction} ${group.time}: ${group.taskCount} personas para capacidad ${vanCapacity}`);
  }
  if (allGroups.some((group) => group.taskCount === 1) && allGroups.length >= 4) warnings.push("Hay grupos de transporte aislados de una sola persona");
  return {
    taskCount: transportTasks.length,
    summary: {
      analysisAvailable: transportTasks.length > 0,
      vanCapacity: vanCapacity !== null && vanCapacity > 0 ? vanCapacity : null,
      maxObservedConcurrency,
      capacityExceeded,
      averageSpacingMinutes: spacings.length ? Math.round(spacings.reduce((sum, gap) => sum + gap, 0) / spacings.length) : null,
      groups: allGroups.slice(0, OPERATIONAL_QUALITY_LIMITS.transportGroups).map(({ direction, time, taskCount }) => ({ direction, time, taskCount })),
      warnings: warnings.slice(0, 5),
    },
  };
}

export function calculatePlanningOperationalQuality(input: OperationalQualityInput = {}): OperationalQuality {
  const tasks = scheduledTasks(input);
  const names = contestantNames(input);
  const talents = calculateTalentMetrics(tasks, names, input);
  const coaches = calculateCoachMetrics(tasks, input)
    .sort((a, b) => b.idleMinutes - a.idleMinutes || b.spanMinutes - a.spanMinutes)
    .slice(0, OPERATIONAL_QUALITY_LIMITS.coach);
  const feeders = calculateFeeders(talents);
  const transport = calculateTransport(tasks, input);
  const topTalentIdle = talents
    .map(({ exportMetric }) => exportMetric)
    .sort((a, b) => b.idleMinutes - a.idleMinutes || b.spanMinutes - a.spanMinutes)
    .slice(0, OPERATIONAL_QUALITY_LIMITS.talent);

  const concerns = [
    ...coaches.flatMap((coach) => coach.warnings.slice(0, 1)),
    ...topTalentIdle.flatMap((talent) => talent.warnings.slice(0, 1)),
    ...feeders.cases.filter((item) => item.gapMinutes >= OPERATIONAL_QUALITY_THRESHOLDS.highFeederGapMinutes)
      .map((item) => `${item.talentName}: feeder a Main Stage ${item.gapMinutes} min`),
    ...transport.summary.warnings,
  ].slice(0, OPERATIONAL_QUALITY_LIMITS.concerns);

  const positiveSignals: string[] = [];
  if (talents.length && !topTalentIdle.some((talent) => talent.idleRatio >= OPERATIONAL_QUALITY_THRESHOLDS.highIdleRatio)) positiveSignals.push("Idle de talents por debajo del 50%");
  if (coaches.length && !coaches.some((coach) => coach.sessionBlocks > 1)) positiveSignals.push("Coaches sin jornadas partidas");
  if (feeders.available && (feeders.max ?? 0) < OPERATIONAL_QUALITY_THRESHOLDS.highFeederGapMinutes) positiveSignals.push("Feeders próximos al Main Stage");
  if (transport.summary.analysisAvailable && transport.summary.capacityExceeded !== true) positiveSignals.push("Transporte sin exceso de capacidad detectado");

  const severeCount = coaches.filter((coach) => coach.idleRatio >= 0.65 || coach.spanMinutes >= 540).length
    + topTalentIdle.filter((talent) => talent.idleRatio >= 0.65 || talent.spanMinutes >= 540).length
    + feeders.cases.filter((item) => item.gapMinutes >= 180).length
    + (transport.summary.capacityExceeded ? 1 : 0);
  const available = tasks.length > 0;
  const status = !available ? "unknown" : severeCount >= 3 ? "poor" : concerns.length ? "review" : "good";
  const score = !available ? null : Math.max(0, 100 - concerns.length * 8 - severeCount * 12);

  return {
    summary: {
      status,
      score,
      mainConcerns: concerns,
      positiveSignals: positiveSignals.slice(0, OPERATIONAL_QUALITY_LIMITS.positiveSignals),
    },
    topTalentIdle,
    topCoachIdle: coaches,
    feederToMainGaps: {
      averageFeederToMainGap: feeders.average,
      maxFeederToMainGap: feeders.max,
      topCases: feeders.cases,
    },
    transportSummary: transport.summary,
    analysisAvailability: {
      talentAnalysisAvailable: talents.length > 0,
      coachAnalysisAvailable: coaches.length > 0,
      coachExplanation: coaches.length > 0 ? null : "No se detectaron recursos asignados configurados como vocal coach ni con nombres que contengan coach o vocal.",
      feederAnalysisAvailable: feeders.available,
      feederExplanation: feeders.available ? null : "No se pudo emparejar de forma conservadora un feeder previo con una tarea Main Stage/Plató 7 del mismo talent.",
      transportAnalysisAvailable: transport.summary.analysisAvailable,
    },
    counts: {
      scheduledTasksAnalyzed: tasks.length,
      talentsAnalyzed: talents.length,
      coachesAnalyzed: coaches.length,
      feederCasesAnalyzed: feeders.count,
      transportTasksAnalyzed: transport.taskCount,
    },
  };
}
