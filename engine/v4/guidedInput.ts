import type { EngineInput, TaskInput } from "../types";
import type { V4StrategicAnalysis } from "./analysis";

export interface V4GuidedOrderingBucket {
  name: string;
  taskCount: number;
  reason: string;
}

export interface V4GuidedOrderingDiagnostics {
  applied: boolean;
  reorderedTaskCount: number;
  priorityBuckets: V4GuidedOrderingBucket[];
  topOrderedTasks: number[];
  reason: string;
}

type ScoredTask = {
  task: TaskInput;
  originalIndex: number;
  bucket: string;
  bucketRank: number;
  mainFlowRank: number;
  feederRank: number;
  delayRank: number;
  resourceRank: number;
  spaceRank: number;
};

const DEFAULT_REASON = "V4 reordered pending tasks using main flow sequence and operational pressure.";

const finiteNumber = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const uniqueNumbers = (values: unknown[]): number[] => [...new Set(values.map(finiteNumber).filter((value): value is number => value !== null))];

function taskResourceIds(task: TaskInput): number[] {
  return uniqueNumbers([
    ...Object.keys(task.resourceRequirements?.byItem ?? {}),
    ...(task.resourceRequirements?.anyOf ?? []).flatMap((group) => group.resourceItemIds ?? []),
  ]);
}

function dependencyTaskIds(task: TaskInput): number[] {
  return uniqueNumbers([...(task.dependsOnTaskIds ?? []), task.dependsOnTaskId]);
}

function dependencyTemplateIds(task: TaskInput): number[] {
  return uniqueNumbers([...(task.dependsOnTemplateIds ?? []), task.dependsOnTemplateId]);
}

function buildFeederTalentRanks(tasks: TaskInput[], mainFlowTalentRank: Map<number, number>): Map<number, number> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const byTalentAndTemplate = new Map<string, TaskInput[]>();
  for (const task of tasks) {
    const talentId = finiteNumber(task.contestantId);
    if (talentId === null) continue;
    const key = `${talentId}:${task.templateId}`;
    byTalentAndTemplate.set(key, [...(byTalentAndTemplate.get(key) ?? []), task]);
  }

  const feederRanks = new Map<number, number>();
  const visitTask = (task: TaskInput, rank: number, seen: Set<number>) => {
    for (const depId of dependencyTaskIds(task)) {
      if (seen.has(depId)) continue;
      const dep = byId.get(depId);
      if (!dep) continue;
      seen.add(depId);
      feederRanks.set(dep.id, Math.min(feederRanks.get(dep.id) ?? Number.POSITIVE_INFINITY, rank));
      visitTask(dep, rank, seen);
    }

    const talentId = finiteNumber(task.contestantId);
    if (talentId === null) return;
    for (const templateId of dependencyTemplateIds(task)) {
      for (const dep of byTalentAndTemplate.get(`${talentId}:${templateId}`) ?? []) {
        if (seen.has(dep.id)) continue;
        seen.add(dep.id);
        feederRanks.set(dep.id, Math.min(feederRanks.get(dep.id) ?? Number.POSITIVE_INFINITY, rank));
        visitTask(dep, rank, seen);
      }
    }
  };

  for (const task of tasks) {
    const talentId = finiteNumber(task.contestantId);
    const rank = talentId === null ? undefined : mainFlowTalentRank.get(talentId);
    if (rank === undefined) continue;
    visitTask(task, rank, new Set([task.id]));
  }

  return feederRanks;
}

function buildGuidedDiagnostics(originalPending: TaskInput[], orderedPending: ScoredTask[], reason: string): V4GuidedOrderingDiagnostics {
  const reorderedTaskCount = orderedPending.reduce((count, item, index) => count + (originalPending[index]?.id !== item.task.id ? 1 : 0), 0);
  const bucketCounts = new Map<string, { taskCount: number; reason: string }>();
  for (const item of orderedPending) {
    const current = bucketCounts.get(item.bucket) ?? { taskCount: 0, reason: bucketReason(item.bucket) };
    current.taskCount += 1;
    bucketCounts.set(item.bucket, current);
  }
  return {
    applied: orderedPending.length > 0,
    reorderedTaskCount,
    priorityBuckets: [...bucketCounts.entries()].map(([name, value]) => ({ name, ...value })),
    topOrderedTasks: orderedPending.slice(0, 10).map((item) => item.task.id),
    reason,
  };
}

function bucketReason(bucket: string): string {
  switch (bucket) {
    case "mainFlowSequence": return "Talent appears in the V4 main flow sequence.";
    case "mainFlowFeeders": return "Task is a prerequisite or feeder for a main-flow talent task.";
    case "costOfDelay": return "Talent has high cost of delay.";
    case "criticalResources": return "Task uses resources marked critical by strategic analysis.";
    case "prioritySpaces": return "Task belongs to a continuous or high-pressure space.";
    default: return "Stable fallback preserving original input order.";
  }
}

export function buildV4GuidedInput(input: EngineInput, strategicAnalysis: V4StrategicAnalysis): { input: EngineInput; guidedOrdering: V4GuidedOrderingDiagnostics } {
  const tasks = input.tasks ?? [];
  const originalPending = tasks.filter((task) => task.status === "pending");
  const mainFlowTalentRank = new Map((strategicAnalysis.mainFlowSequence ?? []).map((item, index) => [item.talentId, index]));
  const feederRanks = buildFeederTalentRanks(tasks, mainFlowTalentRank);
  const delayRank = new Map((strategicAnalysis.costOfDelayRanking ?? []).map((item, index) => [item.talentId, index]));
  const criticalResourceRank = new Map((strategicAnalysis.criticalResources ?? []).map((item, index) => [item.id, index]));
  const prioritySpaceRank = new Map([...(strategicAnalysis.continuousSpaces ?? []), ...(strategicAnalysis.criticalSpaces ?? [])].map((item, index) => [item.id, index]));
  const hasMainFlow = mainFlowTalentRank.size > 0;

  const scored = originalPending.map((task, originalIndex): ScoredTask => {
    const talentId = finiteNumber(task.contestantId);
    const spaceId = finiteNumber(task.spaceId ?? task.zoneId);
    const resourceRanks = taskResourceIds(task).map((id) => criticalResourceRank.get(id)).filter((rank): rank is number => rank !== undefined);
    const mainRank = talentId === null ? undefined : mainFlowTalentRank.get(talentId);
    const feedRank = feederRanks.get(task.id);
    const costRank = talentId === null ? undefined : delayRank.get(talentId);
    const resRank = resourceRanks.length ? Math.min(...resourceRanks) : undefined;
    const spRank = spaceId === null ? undefined : prioritySpaceRank.get(spaceId);
    const bucket = feedRank !== undefined ? "mainFlowFeeders" : mainRank !== undefined ? "mainFlowSequence" : costRank !== undefined ? "costOfDelay" : resRank !== undefined ? "criticalResources" : spRank !== undefined ? "prioritySpaces" : "stableFallback";
    const bucketRank = ["mainFlowFeeders", "mainFlowSequence", "costOfDelay", "criticalResources", "prioritySpaces", "stableFallback"].indexOf(bucket);
    return { task, originalIndex, bucket, bucketRank, mainFlowRank: mainRank ?? Number.POSITIVE_INFINITY, feederRank: feedRank ?? Number.POSITIVE_INFINITY, delayRank: costRank ?? Number.POSITIVE_INFINITY, resourceRank: resRank ?? Number.POSITIVE_INFINITY, spaceRank: spRank ?? Number.POSITIVE_INFINITY };
  }).sort((a, b) => a.bucketRank - b.bucketRank || a.mainFlowRank - b.mainFlowRank || a.feederRank - b.feederRank || a.delayRank - b.delayRank || a.resourceRank - b.resourceRank || a.spaceRank - b.spaceRank || a.originalIndex - b.originalIndex);

  const orderedPending = [...scored];
  const pendingQueue = orderedPending.map((item) => item.task);
  const guidedTasks = tasks.map((task) => task.status === "pending" ? pendingQueue.shift() ?? task : task);
  const reason = hasMainFlow ? DEFAULT_REASON : "V4 guided ordering applied without mainFlowSequence; fallback used operational pressure and stable original order.";

  return {
    input: { ...input, tasks: guidedTasks },
    guidedOrdering: buildGuidedDiagnostics(originalPending, orderedPending, reason),
  };
}
