import type { V4PlanQualityEvaluation } from "../quality";

export type V4ComparisonVerdict = "V4_BETTER" | "V4_EQUAL" | "V4_WORSE";

export interface V3V4QualityComparison {
  verdict: V4ComparisonVerdict;
  deltas: {
    qualityScore: number;
    mainFlowGapMinutes: number;
    makespanMinutes: number;
    totalTalentStayMinutes: number;
    unplannedTasks: number;
  };
  reasons: string[];
}

const minutesFromHHMM = (value?: string | null): number => {
  const [h, m] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

const makespan = (quality: V4PlanQualityEvaluation): number =>
  quality.makespan.fromWorkDayStartMinutes ?? minutesFromHHMM(quality.makespan.lastTaskEnd);

export function compareV3AndV4Quality(v3Quality: V4PlanQualityEvaluation, v4Quality: V4PlanQualityEvaluation): V3V4QualityComparison {
  const deltas = {
    qualityScore: v4Quality.qualityScore - v3Quality.qualityScore,
    mainFlowGapMinutes: (v4Quality.mainFlowQuality?.internalGapMinutes ?? 0) - (v3Quality.mainFlowQuality?.internalGapMinutes ?? 0),
    makespanMinutes: makespan(v4Quality) - makespan(v3Quality),
    totalTalentStayMinutes: v4Quality.talentStayTime.totalStayMinutes - v3Quality.talentStayTime.totalStayMinutes,
    unplannedTasks: v4Quality.risk.unplannedTasks - v3Quality.risk.unplannedTasks,
  };
  const reasons: string[] = [];
  if (deltas.unplannedTasks > 0) reasons.push(`V4 leaves ${deltas.unplannedTasks} more unplanned task(s).`);
  if (deltas.unplannedTasks < 0) reasons.push(`V4 plans ${Math.abs(deltas.unplannedTasks)} more task(s).`);
  if (deltas.mainFlowGapMinutes > 0) reasons.push(`V4 worsens main-flow continuity by ${deltas.mainFlowGapMinutes} min.`);
  if (deltas.mainFlowGapMinutes < 0) reasons.push(`V4 improves main-flow continuity by ${Math.abs(deltas.mainFlowGapMinutes)} min.`);
  if (deltas.makespanMinutes < 0) reasons.push(`V4 reduces makespan by ${Math.abs(deltas.makespanMinutes)} min.`);
  if (deltas.makespanMinutes > 0) reasons.push(`V4 increases makespan by ${deltas.makespanMinutes} min.`);
  if (deltas.qualityScore > 0) reasons.push(`V4 quality score improves by ${deltas.qualityScore}.`);
  if (deltas.qualityScore < 0) reasons.push(`V4 quality score drops by ${Math.abs(deltas.qualityScore)}.`);

  const worse = deltas.unplannedTasks > 0 || deltas.mainFlowGapMinutes > 0 || deltas.makespanMinutes > 45 && deltas.qualityScore <= 0;
  const better = deltas.unplannedTasks <= 0 && deltas.mainFlowGapMinutes <= 0 && (deltas.makespanMinutes < 0 || deltas.qualityScore > 0);
  const verdict: V4ComparisonVerdict = worse ? "V4_WORSE" : better ? "V4_BETTER" : "V4_EQUAL";
  if (!reasons.length) reasons.push("V4 matches the V3 baseline on the comparison metrics.");
  return { verdict, deltas, reasons };
}
