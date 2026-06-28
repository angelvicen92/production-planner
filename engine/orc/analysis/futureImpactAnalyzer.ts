import type { Evidence, ORCRecord, SimulatedState } from "../contracts";
import { deepFreeze } from "../immutability";

export interface FutureImpactIndicators {
  readonly remainingOperationalFreedom: number;
  readonly temporalFlexibility: number;
  readonly criticalWindowConsumption: number;
  readonly futureResourceConcentration: number;
  readonly dependencyBlockingRisk: number;
  readonly delayAbsorptionCapacity: number;
}

export interface FutureImpactAssessment {
  readonly simulatedStateId: string;
  readonly candidateStateId: string;
  readonly impactScore: number;
  readonly freedomDelta: number;
  readonly robustnessContribution: number;
  readonly indicators: FutureImpactIndicators;
  readonly explanation: string;
  readonly evidenceId: string;
}

export interface FutureImpactAnalysisResult {
  readonly impacts: FutureImpactAssessment[];
  readonly evidence: Evidence[];
  readonly summary: { readonly analyzedCount: number; readonly averageImpactScore: number };
}

const SOURCE = "orc-future-impact-analyzer";
const round = (value: number): number => Number(value.toFixed(6));
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const minutes = (time: string | null | undefined): number | null => {
  if (typeof time !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const record = (value: unknown): ORCRecord => (value != null && typeof value === "object" ? (value as ORCRecord) : {});
const finite = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

function stateIndicators(simulatedState: SimulatedState): FutureImpactIndicators {
  const snapshot = simulatedState.operationalStateSnapshot;
  const planning = [...(snapshot.planning ?? [])].sort((a, b) => (minutes(a.startPlanned) ?? 0) - (minutes(b.startPlanned) ?? 0) || a.taskId - b.taskId);
  const workStart = minutes(snapshot.workDay?.start ?? snapshot.availability.workDay?.start ?? null);
  const workEnd = minutes(snapshot.workDay?.end ?? snapshot.availability.workDay?.end ?? null);
  const horizon = workStart !== null && workEnd !== null && workEnd > workStart ? workEnd - workStart : Math.max(1, planning.length * 60);
  const occupied = planning.reduce((sum, item) => {
    const start = minutes(item.startPlanned);
    const end = minutes(item.endPlanned);
    return start !== null && end !== null && end > start ? sum + (end - start) : sum;
  }, 0);
  const starts = planning.map((item) => minutes(item.startPlanned)).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const ends = planning.map((item) => minutes(item.endPlanned)).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const firstStart = starts[0] ?? workStart ?? 0;
  const lastEnd = ends[ends.length - 1] ?? workEnd ?? firstStart;
  const edgeSlack = Math.max(0, firstStart - (workStart ?? firstStart)) + Math.max(0, (workEnd ?? lastEnd) - lastEnd);
  const gaps = planning.slice(1).map((item, index) => Math.max(0, (minutes(item.startPlanned) ?? 0) - (minutes(planning[index].endPlanned) ?? 0)));
  const totalGap = gaps.reduce((sum, gap) => sum + gap, 0) + edgeSlack;
  const largeGaps = gaps.filter((gap) => gap >= 15).length + (edgeSlack >= 15 ? 1 : 0);

  const resources = new Map<number, number>();
  for (const item of planning) for (const id of item.assignedResourceIds ?? []) resources.set(id, (resources.get(id) ?? 0) + 1);
  const maxResourceUse = Math.max(0, ...resources.values());
  const avgResourceUse = resources.size > 0 ? planning.reduce((sum, item) => sum + (item.assignedResourceIds?.length ?? 0), 0) / resources.size : 0;
  const depCount = (snapshot.dependencies ?? []).reduce((sum, dep) => sum + (dep.dependsOnTaskIds?.length ?? 0) + (dep.dependsOnTemplateIds?.length ?? 0), 0);
  const explicitCritical = finite(record(snapshot.operationalMetrics).criticalWindowCount) + finite(record(snapshot.constraints).criticalWindowCount);

  const utilization = clamp01(occupied / horizon);
  const remainingOperationalFreedom = round(clamp01(1 - utilization + clamp01(largeGaps / 8) * 0.2));
  const temporalFlexibility = round(clamp01((totalGap / horizon) * 0.75 + clamp01(largeGaps / Math.max(1, planning.length + 1)) * 0.25));
  const criticalWindowConsumption = round(clamp01(utilization * 0.7 + explicitCritical / Math.max(1, planning.length + explicitCritical) * 0.3));
  const futureResourceConcentration = round(clamp01((maxResourceUse / Math.max(1, planning.length)) * 0.65 + (avgResourceUse / Math.max(1, planning.length)) * 0.35));
  const dependencyBlockingRisk = round(clamp01(depCount / Math.max(1, planning.length + depCount)));
  const delayAbsorptionCapacity = round(clamp01(temporalFlexibility * 0.65 + remainingOperationalFreedom * 0.35));

  return { remainingOperationalFreedom, temporalFlexibility, criticalWindowConsumption, futureResourceConcentration, dependencyBlockingRisk, delayAbsorptionCapacity };
}

function assess(simulatedState: SimulatedState): FutureImpactAssessment {
  const indicators = stateIndicators(simulatedState);
  const positive = indicators.remainingOperationalFreedom * 0.28 + indicators.temporalFlexibility * 0.22 + indicators.delayAbsorptionCapacity * 0.24;
  const negative = indicators.criticalWindowConsumption * 0.12 + indicators.futureResourceConcentration * 0.08 + indicators.dependencyBlockingRisk * 0.06;
  const impactScore = round(clamp01(0.5 + positive - negative));
  const freedomDelta = round((indicators.remainingOperationalFreedom + indicators.temporalFlexibility + indicators.delayAbsorptionCapacity) / 3 - (indicators.criticalWindowConsumption + indicators.futureResourceConcentration + indicators.dependencyBlockingRisk) / 3);
  const robustnessContribution = round((impactScore - 0.5) * 0.1);
  const evidenceId = `evidence:orc-future-impact-analyzer:simulated-state:${simulatedState.id}`;
  return deepFreeze({
    simulatedStateId: simulatedState.id,
    candidateStateId: simulatedState.candidateStateId,
    impactScore,
    freedomDelta,
    robustnessContribution,
    indicators,
    explanation: `Future impact ${impactScore.toFixed(6)} from freedom=${indicators.remainingOperationalFreedom.toFixed(6)}, temporalFlexibility=${indicators.temporalFlexibility.toFixed(6)}, criticalWindowConsumption=${indicators.criticalWindowConsumption.toFixed(6)}, resourceConcentration=${indicators.futureResourceConcentration.toFixed(6)}, dependencyRisk=${indicators.dependencyBlockingRisk.toFixed(6)}, delayAbsorption=${indicators.delayAbsorptionCapacity.toFixed(6)}.`,
    evidenceId,
  }) as FutureImpactAssessment;
}

export function analyzeFutureImpact(simulatedStates: readonly SimulatedState[]): FutureImpactAnalysisResult {
  const impacts = (simulatedStates ?? []).map(assess);
  const evidence = impacts.map((impact) => deepFreeze({
    id: impact.evidenceId,
    source: SOURCE,
    kind: "future-impact-analyzed",
    subjectId: impact.simulatedStateId,
    createdAt: null,
    data: {
      simulatedStateId: impact.simulatedStateId,
      candidateStateId: impact.candidateStateId,
      indicators: impact.indicators,
      impactScore: impact.impactScore,
      freedomDelta: impact.freedomDelta,
      robustnessContribution: impact.robustnessContribution,
      explanation: impact.explanation,
      contribution: "additional-shadow-signal-only",
      readOnly: true,
      mutatesOperationalState: false,
      commitsPlanning: false,
    },
  }) as Evidence);
  const averageImpactScore = round(impacts.reduce((sum, impact) => sum + impact.impactScore, 0) / Math.max(1, impacts.length));
  return deepFreeze({ impacts, evidence, summary: { analyzedCount: impacts.length, averageImpactScore } }) as FutureImpactAnalysisResult;
}
