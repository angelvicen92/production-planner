import type { EngineInput, TaskInput, TimeWindow } from "../../types";
import type { V4StrategicAnalysis, V4MainFlowCandidate } from "../analysis";

export interface MainFlowSequenceVariant {
  id: string;
  label: string;
  sequence: Array<{ talentId: number; score: number; reasons: string[] }>;
}

export interface MainFlowSequenceSearchDiagnostics {
  applied: boolean;
  variantCount: number;
  variants: Array<{ id: string; label: string; talentCount: number; topTalents: Array<{ talentId: number; score: number; reasons: string[] }> }>;
  selectedVariantId?: string | null;
  warnings: string[];
}

export interface MainFlowSequenceSearchOptions {
  maxSequenceVariants?: number;
  maxTalentsPerVariant?: number;
  maxRuntimeMs?: number;
  weights?: Partial<typeof MAIN_FLOW_SEQUENCE_SEARCH_WEIGHTS>;
}

export const MAIN_FLOW_SEQUENCE_SEARCH_WEIGHTS = {
  pressure: 0.24,
  timeRestrictions: 0.22,
  criticalResources: 0.18,
  costOfDelay: 0.18,
  feedFlow: 0.10,
  criticalPath: 0.08,
} as const;

const DEFAULT_LIMITS = { maxSequenceVariants: 6, maxTalentsPerVariant: 50, maxRuntimeMs: 1500 } as const;
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const uniq = (xs: unknown[]) => [...new Set(xs.map(Number).filter(Number.isFinite))];
const toMin = (v?: string | null): number | null => { const [h, m] = String(v ?? "").split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const windowMinutes = (w?: TimeWindow | null): number | null => { const s = toMin(w?.start); const e = toMin(w?.end); return s === null || e === null ? null : Math.max(0, e - s); };
const taskDuration = (task: TaskInput) => Math.max(5, Number(task.durationOverrideMin ?? 30) || 30);
const taskResources = (task: TaskInput) => uniq([...(task.assignedResourceIds ?? []), ...Object.keys(task.resourceRequirements?.byItem ?? {}), ...(task.resourceRequirements?.anyOf ?? []).flatMap((g) => g.resourceItemIds ?? [])]);
const taskDeps = (task: TaskInput) => uniq([...(task.dependsOnTaskIds ?? []), task.dependsOnTaskId, ...(task.dependsOnTemplateIds ?? []), task.dependsOnTemplateId]);
const protectedTask = (task: TaskInput) => task.status === "done" || task.status === "in_progress";

function talentMetrics(input: EngineInput, analysis: V4StrategicAnalysis) {
  const criticalResourceIds = new Set((analysis.criticalResources ?? []).map((r) => Number(r.id)));
  const pressure = new Map((analysis.criticalTalents ?? []).map((t) => [Number(t.id), Number(t.pressureScore ?? 0)]));
  const cost = new Map((analysis.mainFlowSequence ?? []).map((t) => [Number(t.talentId), Number(t.costOfDelay ?? t.score ?? 0)]));
  const byTalent = new Map((analysis.mainFlowCandidates ?? []).map((c) => [Number(c.talentId), c]));
  return (analysis.mainFlowCandidates ?? []).map((c: V4MainFlowCandidate) => {
    const tasks = (input.tasks ?? []).filter((t) => t.status === "pending" && !protectedTask(t) && Number(t.contestantId) === Number(c.talentId));
    const totalDuration = c.totalDurationMinutes || tasks.reduce((s, t) => s + taskDuration(t), 0);
    const availability = c.effectiveAvailabilityMinutes ?? windowMinutes(input.contestantAvailabilityById?.[c.talentId]) ?? windowMinutes(input.workDay) ?? 480;
    const availabilityEnd = toMin(input.contestantAvailabilityById?.[c.talentId]?.end) ?? toMin(input.workDay.end) ?? 1440;
    const earliestDeadline = Math.min(availabilityEnd, ...tasks.map((t) => toMin(t.fixedWindowEnd) ?? toMin((t as any).latestEnd) ?? 1440));
    const deps = tasks.reduce((s, t) => s + taskDeps(t).length, 0);
    const critical = tasks.reduce((s, t) => s + taskResources(t).filter((id) => criticalResourceIds.has(id)).length, 0);
    const path = Math.max(deps, Number(c.trajectoryComplexity ?? 0) + Number(c.taskCount ?? 0));
    const tightness = clamp((totalDuration / Math.max(1, availability)) * 100);
    return { talentId: c.talentId, pressure: pressure.get(c.talentId) ?? c.pressureScore ?? 0, costOfDelay: cost.get(c.talentId) ?? 0, tightness, earliestDeadline, prereqCount: deps, criticalResourceCount: critical + Number(c.scarceResourceTaskCount ?? 0), criticalPath: path, taskCount: c.taskCount, baseReasons: (analysis.mainFlowSequence ?? []).find((x) => x.talentId === c.talentId)?.reasons ?? [] };
  });
}

function buildVariant(id: string, label: string, rows: ReturnType<typeof talentMetrics>, score: (m: ReturnType<typeof talentMetrics>[number]) => number, reasons: (m: ReturnType<typeof talentMetrics>[number]) => string[]): MainFlowSequenceVariant {
  return { id, label, sequence: [...rows].sort((a, b) => score(b) - score(a) || a.earliestDeadline - b.earliestDeadline || a.talentId - b.talentId).map((m) => ({ talentId: m.talentId, score: clamp(score(m)), reasons: reasons(m).slice(0, 4) })) };
}

export function buildMainFlowSequenceVariants(input: EngineInput, strategicAnalysis: V4StrategicAnalysis, options: MainFlowSequenceSearchOptions = {}): { variants: MainFlowSequenceVariant[]; diagnostics: MainFlowSequenceSearchDiagnostics } {
  const started = Date.now(); const warnings: string[] = [];
  const limits = { ...DEFAULT_LIMITS, ...options };
  const rows = talentMetrics(input, strategicAnalysis).slice(0, limits.maxTalentsPerVariant);
  if ((strategicAnalysis.mainFlowCandidates?.length ?? 0) > limits.maxTalentsPerVariant) warnings.push(`Sequence search truncated talents to ${limits.maxTalentsPerVariant}.`);
  const add = (variants: MainFlowSequenceVariant[], v: MainFlowSequenceVariant) => { if (variants.length < limits.maxSequenceVariants && Date.now() - started <= limits.maxRuntimeMs) variants.push(v); };
  const variants: MainFlowSequenceVariant[] = [];
  add(variants, { id: "pressure_default", label: "Pressure default", sequence: (strategicAnalysis.mainFlowSequence ?? []).slice(0, limits.maxTalentsPerVariant).map((x) => ({ talentId: x.talentId, score: x.score, reasons: x.reasons ?? [] })) });
  add(variants, buildVariant("earliest_deadline_first", "Earliest deadline first", rows, (m) => 100 - clamp((m.earliestDeadline - (toMin(input.workDay.start) ?? 0)) / 8), (m) => ["Early departure or restrictive window", ...m.baseReasons]));
  add(variants, buildVariant("critical_resources_first", "Critical resources first", rows, (m) => m.criticalResourceCount * 25 + m.pressure * 0.25, (m) => ["Critical resource dependency", ...m.baseReasons]));
  add(variants, buildVariant("shortest_prereq_chain_first", "Shortest prereq chain first", rows, (m) => 100 - m.prereqCount * 15 + m.taskCount * 2, (m) => ["Short prerequisite chain", "Can feed main flow earlier", ...m.baseReasons]));
  add(variants, buildVariant("longest_critical_path_first", "Longest critical path first", rows, (m) => m.criticalPath * 12 + m.pressure * 0.2, (m) => ["Long critical path", ...m.baseReasons]));
  const w = { ...MAIN_FLOW_SEQUENCE_SEARCH_WEIGHTS, ...(options.weights ?? {}) };
  add(variants, buildVariant("balanced_hybrid", "Balanced hybrid", rows, (m) => m.pressure * w.pressure + m.tightness * w.timeRestrictions + m.criticalResourceCount * 25 * w.criticalResources + m.costOfDelay * w.costOfDelay + (100 - m.prereqCount * 12) * w.feedFlow + m.criticalPath * 10 * w.criticalPath, (m) => ["Balanced pressure/time/resource/feed-flow score", ...m.baseReasons]));
  if (Date.now() - started > limits.maxRuntimeMs) warnings.push(`Sequence search runtime budget exceeded (${limits.maxRuntimeMs} ms).`);
  if (variants.length >= limits.maxSequenceVariants) warnings.push(`Sequence search capped at ${limits.maxSequenceVariants} variants.`);
  return { variants, diagnostics: { applied: variants.length > 0, variantCount: variants.length, variants: variants.map((v) => ({ id: v.id, label: v.label, talentCount: v.sequence.length, topTalents: v.sequence.slice(0, 5) })), selectedVariantId: null, warnings } };
}
