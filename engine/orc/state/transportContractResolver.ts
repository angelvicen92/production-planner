import type { EngineInput } from "../../types";
import type { ORCRecord } from "../contracts";

export interface ORCTransportContract { configured: boolean; arrivalTemplateId: number | string | null; departureTemplateId: number | string | null; arrivalTargetGroupSize: number | null; departureTargetGroupSize: number | null; arrivalMinGapMinutes: number | null; departureMinGapMinutes: number | null; vehicleCapacity: number | null; groupingWeight: number | null; source: string | null; warnings: string[]; readOnly: true; planningInfluence: "validation-semantics-only"; }
const isRecord = (v: unknown): v is ORCRecord => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => { const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN; return Number.isFinite(n) && n > 0 ? n : null; };
const id = (v: unknown): number | string | null => typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? v : null;
const pick = (r: ORCRecord, keys: string[]) => keys.map((k) => r[k]).find((v) => v != null);
const paths: [string, (i: ORCRecord) => unknown][] = [
  ["settings.transport", i => (i.settings as any)?.transport], ["productionSettings.transport", i => (i.productionSettings as any)?.transport],
  ["constraints.transport", i => (i.constraints as any)?.transport], ["transportSettings", i => i.transportSettings], ["transport", i => i.transport],
];
export function resolveORCTransportContract(input: EngineInput | ORCRecord | null | undefined): ORCTransportContract {
  const root = (input ?? {}) as ORCRecord; let cfg: ORCRecord | null = null; let source: string | null = null;
  for (const [name, get] of paths) { const value = get(root); if (isRecord(value)) { cfg = value; source = name; break; } }
  const warnings: string[] = [];
  const arrivalTemplateId = cfg ? id(pick(cfg, ["arrivalTemplateId", "arrivalTaskTemplateId", "arrival_template_id", "inTemplateId", "inTaskTemplateId"])) : null;
  const departureTemplateId = cfg ? id(pick(cfg, ["departureTemplateId", "departureTaskTemplateId", "departure_template_id", "outTemplateId", "outTaskTemplateId"])) : null;
  const configured = arrivalTemplateId != null || departureTemplateId != null;
  let vehicleCapacity = cfg ? num(pick(cfg, ["vehicleCapacity", "vanCapacity", "transportCapacity", "capacity"])) : null;
  if (configured && vehicleCapacity == null) { vehicleCapacity = 1; warnings.push("transport_capacity_missing"); }
  if (!configured) warnings.push("transport_template_occupancy_not_configured");
  return Object.freeze({ configured, arrivalTemplateId, departureTemplateId, arrivalTargetGroupSize: cfg ? num(pick(cfg, ["arrivalTargetGroupSize", "arrivalGroupingTarget", "targetArrivalGroupSize"])) : null, departureTargetGroupSize: cfg ? num(pick(cfg, ["departureTargetGroupSize", "departureGroupingTarget", "targetDepartureGroupSize"])) : null, arrivalMinGapMinutes: cfg ? num(pick(cfg, ["arrivalMinGapMinutes", "minMinutesBetweenArrivals"])) : null, departureMinGapMinutes: cfg ? num(pick(cfg, ["departureMinGapMinutes", "minMinutesBetweenDepartures"])) : null, vehicleCapacity, groupingWeight: cfg ? num(pick(cfg, ["groupingWeight", "transportGroupingWeight"])) : null, source, warnings, readOnly: true, planningInfluence: "validation-semantics-only" }) as ORCTransportContract;
}
