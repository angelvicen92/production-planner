export const optimizerHeuristicKeys = [
  "mainZoneFinishEarly",
  "mainZoneKeepBusy",
  "contestantCompact",
  "groupBySpaceTemplateMatch",
  "groupBySpaceActive",
  "contestantStayInZone",
  "contestantTotalSpan",
] as const;

export type OptimizerHeuristicKey = (typeof optimizerHeuristicKeys)[number];
export type OptimizationMode = "basic" | "advanced";

export type HeuristicSetting = {
  basicLevel?: number | null;
  advancedValue?: number | null;
};

export const BASIC_TO_ADVANCED: Readonly<Record<number, number>> = {
  0: 0,
  1: 3,
  2: 6,
  3: 9,
};

export const BASIC_LEVELS = [0, 1, 2, 3] as const;
export const ADVANCED_ANCHORS = [0, 3, 6, 9] as const;

export function clampBasicLevel(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, Math.round(n)));
}

export function clampAdvancedValue(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}

export function mapBasicToAdvanced(level: unknown): number {
  const basic = clampBasicLevel(level);
  return BASIC_TO_ADVANCED[basic] ?? 0;
}

export function mapAdvancedToBasic(value: unknown): number {
  const adv = clampAdvancedValue(value);
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const anchor of ADVANCED_ANCHORS) {
    const distance = Math.abs(adv - anchor);
    if (distance < bestDistance || (distance === bestDistance && anchor < ADVANCED_ANCHORS[best])) {
      bestDistance = distance;
      best = ADVANCED_ANCHORS.indexOf(anchor);
    }
  }

  return best;
}

export function coerceOptimizationMode(value: unknown): OptimizationMode {
  return value === "advanced" ? "advanced" : "basic";
}

export function resolveWeight(
  mode: unknown,
  setting?: HeuristicSetting | null,
  legacy?: unknown,
): number {
  const resolvedMode = coerceOptimizationMode(mode);
  const basicLevel = clampBasicLevel(setting?.basicLevel ?? legacy ?? 0);
  const advancedValue = clampAdvancedValue(
    setting?.advancedValue ?? mapBasicToAdvanced(basicLevel),
  );

  if (resolvedMode === "advanced") return advancedValue;
  return mapBasicToAdvanced(basicLevel);
}

export function normalizeHeuristicSetting(
  input?: HeuristicSetting | null,
  fallbackBasic?: unknown,
): Required<HeuristicSetting> {
  const basicLevel = clampBasicLevel(input?.basicLevel ?? fallbackBasic ?? 0);
  const advancedValue = clampAdvancedValue(
    input?.advancedValue ?? mapBasicToAdvanced(basicLevel),
  );
  return { basicLevel, advancedValue };
}
