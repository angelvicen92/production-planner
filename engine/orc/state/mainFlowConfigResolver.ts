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
  const directPaths = [["constraints", "optimizer", "mainZoneId"], ["optimizer", "mainZoneId"], ["optimizerMainZoneId"], ["mainFlowSpaceId"], ["continuousSpaceId"], ["optimizer", "optimizerMainZoneId"], ["optimizer", "mainFlowSpaceId"], ["optimizer", "continuousSpaceId"], ["v4Diagnostics", "optimizerMainZoneId"], ["v4Diagnostics", "mainFlowSpaceId"], ["v4Diagnostics", "continuousSpaceId"]];
  for (const path of directPaths) { const id = asNumber(pickPath(input, path)); if (id != null) return { configured: true, mainFlowId: id, source: path.join("."), warnings, readOnly: true, planningInfluence: "configuration-resolution-only" }; }
  const strictBySpace = pickPath(input, ["spaceContinuityById"]);
  if (isRecord(strictBySpace)) { const ids = Object.entries(strictBySpace).filter(([, config]) => config === true || (isRecord(config) && (config.strict === true || config.continuous === true || config.priority === "max" || config.priority === "maximum"))).map(([id]) => asNumber(id)).filter((id): id is number => id != null).sort((a, b) => a - b); if (ids.length > 0) return { configured: true, mainFlowId: ids[0], source: "spaceContinuityById", warnings, readOnly: true, planningInfluence: "configuration-resolution-only" }; }
  const priorities = pickPath(input, ["spacePriorityById"]);
  if (isRecord(priorities)) { const numeric = Object.entries(priorities).map(([id, p]) => ({ id: asNumber(id), p: asNumber(p) })).filter((x): x is { id: number; p: number } => x.id != null && x.p != null); const max = numeric.length ? Math.max(...numeric.map((x) => x.p)) : null; if (max != null && max >= 10) return { configured: true, mainFlowId: numeric.filter((x) => x.p === max).sort((a, b) => a.id - b.id)[0].id, source: "spacePriorityById:max", warnings, readOnly: true, planningInfluence: "configuration-resolution-only" }; }
  warnings.push("main_flow_not_configured");
  return { configured: false, mainFlowId: null, source: "none", warnings, readOnly: true, planningInfluence: "configuration-resolution-only" };
}
