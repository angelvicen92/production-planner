import type { EngineInput } from "../../types";

export interface ORCMainFlowConfigResolution {
  readonly configured: boolean;
  readonly mainFlowId: number | null;
  readonly source: string;
  readonly warnings: string[];
  readonly readOnly: true;
  readonly planningInfluence: "configuration-resolution-only";
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const asNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;
function pickPath(root: unknown, path: readonly string[]): unknown { let cursor = root; for (const part of path) { if (!isRecord(cursor)) return undefined; cursor = cursor[part]; } return cursor; }

export function resolveORCMainFlowConfig(input: EngineInput | Record<string, unknown>): ORCMainFlowConfigResolution {
  const warnings: string[] = [];
  const directPaths = [
    ["constraints", "optimizer", "mainZoneId"],
    ["constraints", "optimizer", "mainFlowSpaceId"],
    ["constraints", "optimizer", "continuousSpaceId"],
    ["optimizer", "mainZoneId"],
    ["optimizer", "mainFlowSpaceId"],
    ["optimizer", "continuousSpaceId"],
    ["settings", "mainZoneId"],
    ["settings", "mainFlowSpaceId"],
    ["settings", "primarySpaceId"],
    ["productionSettings", "mainZoneId"],
    ["productionSettings", "mainFlowSpaceId"],
    ["planSettings", "mainZoneId"],
    ["planSettings", "mainFlowSpaceId"],
    ["optimizerMainZoneId"],
    ["mainFlowSpaceId"],
    ["continuousSpaceId"],
  ];
  for (const path of directPaths) {
    const id = asNumber(pickPath(input, path));
    if (id != null) return { configured: true, mainFlowId: id, source: path.join("."), warnings, readOnly: true, planningInfluence: "configuration-resolution-only" };
  }

  const structuredMaps: Array<{ path: string[]; source: string }> = [
    { path: ["spaceContinuityById"], source: "spaceContinuityById" },
    { path: ["spacesById"], source: "spacesById" },
    { path: ["spaces"], source: "spaces" },
    { path: ["constraints", "spacesById"], source: "constraints.spacesById" },
    { path: ["constraints", "spaces"], source: "constraints.spaces" },
  ];
  const configuredIds: Array<{ id: number; source: string; priority: number }> = [];
  for (const map of structuredMaps) {
    const value = pickPath(input, map.path);
    if (!isRecord(value)) continue;
    for (const [rawId, config] of Object.entries(value)) {
      const id = asNumber(rawId);
      if (id == null || !isRecord(config)) continue;
      const priority = asNumber(config.priority) ?? 0;
      if (config.strictContinuity === true || config.continuous === true || config.mainFlow === true || config.principal === true || config.primary === true) configuredIds.push({ id, source: map.source, priority });
    }
  }
  if (configuredIds.length > 0) {
    const best = configuredIds.sort((a, b) => b.priority - a.priority || a.id - b.id)[0];
    return { configured: true, mainFlowId: best.id, source: best.source, warnings, readOnly: true, planningInfluence: "configuration-resolution-only" };
  }

  const priorities = pickPath(input, ["spacePriorityById"]);
  if (isRecord(priorities)) {
    const numeric = Object.entries(priorities).map(([id, p]) => ({ id: asNumber(id), p: asNumber(p) })).filter((x): x is { id: number; p: number } => x.id != null && x.p != null);
    const max = numeric.length ? Math.max(...numeric.map((x) => x.p)) : null;
    if (max != null && max >= 10) return { configured: true, mainFlowId: numeric.filter((x) => x.p === max).sort((a, b) => a.id - b.id)[0].id, source: "spacePriorityById:max", warnings, readOnly: true, planningInfluence: "configuration-resolution-only" };
  }
  warnings.push("main_flow_not_configured");
  return { configured: false, mainFlowId: null, source: "none", warnings, readOnly: true, planningInfluence: "configuration-resolution-only" };
}
