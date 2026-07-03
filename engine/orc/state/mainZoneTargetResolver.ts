import type { EngineInput } from "../../types";
import type { OperationalState } from "../contracts";

export const ORC_MAIN_ZONE_RESOLUTION_CONTRACT_VERSION_ID228 = "ORC-MAIN-ZONE-RESOLUTION-ID228" as const;

export interface ORCMainZoneTargetResolution {
  readonly configured: boolean;
  readonly rawMainZoneId: number | null;
  readonly targetKind: "space" | "zone" | "unknown";
  readonly mainSpaceIds: number[];
  readonly mainZoneIds: number[];
  readonly dominantMainSpaceId: number | null;
  readonly source: string;
  readonly warnings: string[];
  readonly readOnly: true;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null;
const uniq = (xs: number[]) => [...new Set(xs.filter(Number.isFinite))].sort((a, b) => a - b);
function pick(root: unknown, path: readonly string[]): unknown { let c = root; for (const p of path) { if (!isRecord(c)) return undefined; c = c[p]; } return c; }
const recNums = (r: unknown): number[] => isRecord(r) ? Object.keys(r).map(Number).filter(Number.isFinite) : [];

export function resolveORCMainZoneTarget(input: EngineInput | OperationalState | Record<string, unknown>): ORCMainZoneTargetResolution {
  const warnings: string[] = [];
  const explicitSpace = num(pick(input, ["constraints", "optimizer", "mainFlowSpaceId"]) ?? pick(input, ["optimizer", "mainFlowSpaceId"]) ?? pick(input, ["mainFlowSpaceId"]) ?? pick(input, ["continuousSpaceId"]));
  const explicitKind = String(pick(input, ["constraints", "optimizer", "mainZoneKind"]) ?? pick(input, ["constraints", "optimizer", "mainZoneTarget", "kind"]) ?? pick(input, ["optimizerMainZoneKind"]) ?? "").toLowerCase();
  const raw = explicitSpace ?? num(pick(input, ["constraints", "optimizer", "mainZoneId"]) ?? pick(input, ["optimizer", "mainZoneId"]) ?? pick(input, ["settings", "mainZoneId"]) ?? pick(input, ["optimizerMainZoneId"]));
  const zoneBySpace = (pick(input, ["spaces", "zoneIdBySpaceId"]) ?? pick(input, ["zoneIdBySpaceId"]) ?? pick(input, ["spaceZoneById"])) as Record<string, unknown> | undefined;
  const explicitByZone = (pick(input, ["spaces", "spaceIdsByZoneId"]) ?? pick(input, ["spaceIdsByZoneId"]) ?? pick(input, ["spacesByZoneId"])) as Record<string, unknown> | undefined;
  const tasks = (Array.isArray((input as any).tasks) ? (input as any).tasks : []) as Array<Record<string, unknown>>;
  const planning = (Array.isArray((input as any).planning) ? (input as any).planning : []) as Array<Record<string, unknown>>;
  const knownSpaces = uniq([...recNums(pick(input, ["spaces", "nameById"])), ...recNums(pick(input, ["spaceNameById"])), ...recNums(zoneBySpace), ...tasks.map(t => num(t.spaceId)).filter((n): n is number => n != null), ...planning.map(e => num(e.spaceId)).filter((n): n is number => n != null)]);
  const knownZones = uniq([...recNums(explicitByZone), ...Object.values(zoneBySpace ?? {}).map(num).filter((n): n is number => n != null), ...tasks.map(t => num(t.zoneId)).filter((n): n is number => n != null), ...planning.map(e => num((e as any).zoneId)).filter((n): n is number => n != null)]);
  const spacesForZone = (z: number) => uniq([...(Array.isArray(explicitByZone?.[z]) ? (explicitByZone?.[z] as unknown[]).map(num).filter((n): n is number => n != null) : []), ...Object.entries(zoneBySpace ?? {}).filter(([, v]) => num(v) === z).map(([s]) => Number(s)), ...tasks.filter(t => num(t.zoneId) === z).map(t => num(t.spaceId)).filter((n): n is number => n != null), ...planning.filter(e => num((e as any).zoneId) === z).map(e => num(e.spaceId)).filter((n): n is number => n != null)]);
  const dominant = (spaceIds: number[]) => spaceIds[0] ?? null;
  if (raw == null) return { configured: false, rawMainZoneId: null, targetKind: "unknown", mainSpaceIds: [], mainZoneIds: [], dominantMainSpaceId: null, source: "none", warnings: ["main_zone_not_configured"], readOnly: true };
  if (explicitSpace != null || explicitKind === "space") return { configured: true, rawMainZoneId: raw, targetKind: "space", mainSpaceIds: [raw], mainZoneIds: [], dominantMainSpaceId: raw, source: explicitSpace != null ? "mainFlowSpaceId" : "mainZoneKind:space", warnings, readOnly: true };
  if (explicitKind === "zone") { const sp = spacesForZone(raw); return { configured: true, rawMainZoneId: raw, targetKind: "zone", mainSpaceIds: sp, mainZoneIds: [raw], dominantMainSpaceId: dominant(sp), source: "mainZoneKind:zone", warnings, readOnly: true }; }
  const isSpace = knownSpaces.includes(raw); const isZone = knownZones.includes(raw);
  if (isSpace && isZone) warnings.push("ambiguous_main_zone_id_space_and_zone");
  if (isZone && (!isSpace || spacesForZone(raw).length > 0)) { const sp = spacesForZone(raw); return { configured: true, rawMainZoneId: raw, targetKind: "zone", mainSpaceIds: sp, mainZoneIds: [raw], dominantMainSpaceId: dominant(sp), source: "optimizerMainZoneId", warnings, readOnly: true }; }
  if (isSpace) return { configured: true, rawMainZoneId: raw, targetKind: "space", mainSpaceIds: [raw], mainZoneIds: [], dominantMainSpaceId: raw, source: "optimizerMainZoneId", warnings, readOnly: true };
  warnings.push("main_zone_target_unknown");
  return { configured: true, rawMainZoneId: raw, targetKind: "unknown", mainSpaceIds: [], mainZoneIds: [], dominantMainSpaceId: null, source: "optimizerMainZoneId", warnings, readOnly: true };
}
