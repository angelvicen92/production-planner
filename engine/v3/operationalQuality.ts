import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { getPlannedViews, toMinutes } from "./metrics";
import { detectCoachAssignments } from "./coachDetection";

export const OPERATIONAL_COMPACTION_THRESHOLDS = {
  splitGapMinutes: 45,
  coachMaxGapMinutes: 90,
  coachIdleRatio: 0.4,
  talentMaxGapMinutes: 120,
  talentIdleRatio: 0.6,
} as const;

export interface OperationalIntervalMetric {
  id: number;
  taskIds: number[];
  taskCount: number;
  firstStart: number;
  lastEnd: number;
  spanMinutes: number;
  activeMinutes: number;
  idleMinutes: number;
  idleRatio: number;
  maxGapMinutes: number;
  sessionBlocks: number;
}

export interface EngineOperationalCompactionMetrics {
  coaches: OperationalIntervalMetric[];
  talents: OperationalIntervalMetric[];
  coachIdlePenalty: number;
  coachSpanPenalty: number;
  coachSplitDayPenalty: number;
  talentIdlePenalty: number;
  talentSpanPenalty: number;
  maxGapPenalty: number;
  maxCoachGapMinutes: number;
  maxCoachIdleRatio: number;
  maxTalentGapMinutes: number;
  maxTalentIdleRatio: number;
  needsCompaction: boolean;
}

type Interval = { taskId: number; start: number; end: number };

const intervalMetric = (id: number, intervals: Interval[]): OperationalIntervalMetric | null => {
  const sorted = intervals
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.taskId - b.taskId);
  if (!sorted.length) return null;

  let blockStart = sorted[0].start;
  let blockEnd = sorted[0].end;
  let activeMinutes = 0;
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index++) {
    const interval = sorted[index];
    if (interval.start > blockEnd) {
      activeMinutes += blockEnd - blockStart;
      gaps.push(interval.start - blockEnd);
      blockStart = interval.start;
      blockEnd = interval.end;
    } else {
      blockEnd = Math.max(blockEnd, interval.end);
    }
  }
  activeMinutes += blockEnd - blockStart;
  const firstStart = sorted[0].start;
  const lastEnd = Math.max(...sorted.map((item) => item.end));
  const spanMinutes = lastEnd - firstStart;
  const idleMinutes = Math.max(0, spanMinutes - activeMinutes);
  const splitGaps = gaps.filter((gap) => gap >= OPERATIONAL_COMPACTION_THRESHOLDS.splitGapMinutes);
  return {
    id,
    taskIds: sorted.map((item) => item.taskId),
    taskCount: sorted.length,
    firstStart,
    lastEnd,
    spanMinutes,
    activeMinutes,
    idleMinutes,
    idleRatio: spanMinutes > 0 ? idleMinutes / spanMinutes : 0,
    maxGapMinutes: gaps.length ? Math.max(...gaps) : 0,
    sessionBlocks: splitGaps.length + 1,
  };
};

const metricsById = (rows: Array<Interval & { ids: number[] }>): OperationalIntervalMetric[] => {
  const grouped = new Map<number, Interval[]>();
  for (const row of rows) {
    for (const id of row.ids) {
      const bucket = grouped.get(id) ?? [];
      bucket.push(row);
      grouped.set(id, bucket);
    }
  }
  return [...grouped.entries()]
    .map(([id, intervals]) => intervalMetric(id, intervals))
    .filter((metric): metric is OperationalIntervalMetric => metric !== null)
    .sort((a, b) => b.idleMinutes - a.idleMinutes || b.maxGapMinutes - a.maxGapMinutes || a.id - b.id);
};

const maxOrZero = (values: number[]): number => values.length ? Math.max(...values) : 0;
const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

export const calculateEngineOperationalCompactionMetrics = (
  input: EngineV3Input,
  output: EngineOutput,
): EngineOperationalCompactionMetrics => {
  const coachAssignments = detectCoachAssignments(input, output);
  const coachIdsByTask = new Map<number, number[]>();
  for (const group of coachAssignments) {
    if (group.coachId === null) continue;
    for (const taskId of group.taskIds) coachIdsByTask.set(taskId, [...(coachIdsByTask.get(taskId) ?? []), group.coachId]);
  }
  const rows = getPlannedViews(input, output).flatMap((view) => {
    const start = toMinutes(view.startPlanned);
    const end = toMinutes(view.endPlanned);
    if (start === null || end === null || end <= start) return [];
    const contestantId = Number(view.task.contestantId ?? NaN);
    return [{
      taskId: view.taskId,
      start,
      end,
      coachIds: coachIdsByTask.get(view.taskId) ?? [],
      talentIds: Number.isFinite(contestantId) && contestantId > 0 ? [contestantId] : [],
    }];
  });
  const coaches = metricsById(rows.map((row) => ({ ...row, ids: row.coachIds })));
  const talents = metricsById(rows.map((row) => ({ ...row, ids: row.talentIds })));
  const maxCoachGapMinutes = maxOrZero(coaches.map((metric) => metric.maxGapMinutes));
  const maxCoachIdleRatio = maxOrZero(coaches.map((metric) => metric.idleRatio));
  const maxTalentGapMinutes = maxOrZero(talents.map((metric) => metric.maxGapMinutes));
  const maxTalentIdleRatio = maxOrZero(talents.map((metric) => metric.idleRatio));

  return {
    coaches,
    talents,
    coachIdlePenalty: sum(coaches.map((metric) => metric.idleMinutes)),
    coachSpanPenalty: sum(coaches.map((metric) => metric.spanMinutes)),
    coachSplitDayPenalty: sum(coaches.map((metric) => Math.max(0, metric.sessionBlocks - 1))),
    talentIdlePenalty: sum(talents.map((metric) => metric.idleMinutes)),
    talentSpanPenalty: sum(talents.map((metric) => metric.spanMinutes)),
    maxGapPenalty: sum([...coaches, ...talents].map((metric) => metric.maxGapMinutes)),
    maxCoachGapMinutes,
    maxCoachIdleRatio,
    maxTalentGapMinutes,
    maxTalentIdleRatio,
    needsCompaction: maxCoachGapMinutes >= OPERATIONAL_COMPACTION_THRESHOLDS.coachMaxGapMinutes
      || maxCoachIdleRatio >= OPERATIONAL_COMPACTION_THRESHOLDS.coachIdleRatio
      || maxTalentGapMinutes >= OPERATIONAL_COMPACTION_THRESHOLDS.talentMaxGapMinutes
      || maxTalentIdleRatio >= OPERATIONAL_COMPACTION_THRESHOLDS.talentIdleRatio,
  };
};

export const compactOperationalMetrics = (metrics: EngineOperationalCompactionMetrics) => ({
  coachIdlePenalty: metrics.coachIdlePenalty,
  coachSpanPenalty: metrics.coachSpanPenalty,
  coachSplitDayPenalty: metrics.coachSplitDayPenalty,
  talentIdlePenalty: metrics.talentIdlePenalty,
  talentSpanPenalty: metrics.talentSpanPenalty,
  maxGapPenalty: metrics.maxGapPenalty,
  maxCoachGapMinutes: metrics.maxCoachGapMinutes,
  maxCoachIdleRatio: Number(metrics.maxCoachIdleRatio.toFixed(4)),
  maxTalentGapMinutes: metrics.maxTalentGapMinutes,
  maxTalentIdleRatio: Number(metrics.maxTalentIdleRatio.toFixed(4)),
});
