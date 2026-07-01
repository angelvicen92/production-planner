import type { EngineInput } from "../../types";
import type { ORCRecord } from "../contracts";

export interface ORCTransportContract { configured: boolean; arrivalTemplateId: number | string | null; departureTemplateId: number | string | null; arrivalTemplateName: string | null; departureTemplateName: string | null; arrivalTargetGroupSize: number | null; departureTargetGroupSize: number | null; arrivalMinGapMinutes: number | null; departureMinGapMinutes: number | null; vehicleCapacity: number | null; transportSpaceId: number | string | null; groupingWeight: number | null; source: string | null; warnings: string[]; readOnly: true; planningInfluence: "validation-semantics-only"; }
const isRecord = (v: unknown): v is ORCRecord => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => { const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN; return Number.isFinite(n) && n > 0 ? n : null; };
const id = (v: unknown): number | string | null => typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? v : null;
const str = (v: unknown): string | null => typeof v === "string" && v.trim() !== "" ? v : null;
const pick = (r: ORCRecord, keys: string[]) => keys.map((k) => r[k]).find((v) => v != null);
const paths: [string, (i: ORCRecord) => unknown][] = [
  ["transportSettings", i => i.transportSettings], ["constraints.transport", i => (i.constraints as any)?.transport],
  ["settings.transport", i => (i.settings as any)?.transport], ["productionSettings.transport", i => (i.productionSettings as any)?.transport], ["transport", i => i.transport],
];
const topLevel = (root: ORCRecord): ORCRecord => ({
  arrivalTemplateName: root.arrivalTaskTemplateName,
  departureTemplateName: root.departureTaskTemplateName,
  arrivalGroupingTarget: root.arrivalGroupingTarget,
  departureGroupingTarget: root.departureGroupingTarget,
  arrivalMinGapMinutes: root.arrivalMinGapMinutes,
  departureMinGapMinutes: root.departureMinGapMinutes,
  vanCapacity: root.vanCapacity,
  transportVanCapacity: root.transportVanCapacity,
  transportSpaceId: root.transportSpaceId,
  groupingWeight: (root.optimizerWeights as any)?.arrivalDepartureGrouping,
});
export function resolveORCTransportContract(input: EngineInput | ORCRecord | null | undefined): ORCTransportContract {
  const root = (input ?? {}) as ORCRecord; let cfg: ORCRecord | null = null; let source: string | null = null;
  for (const [name, get] of paths) { const value = get(root); if (isRecord(value)) { cfg = value; source = name; break; } }
  if (!cfg && (root.arrivalTaskTemplateName != null || root.departureTaskTemplateName != null)) { cfg = topLevel(root); source = "top-level-buildInput-transport"; }
  const warnings: string[] = [];
  const arrivalTemplateId = cfg ? id(pick(cfg, ["arrivalTemplateId", "arrivalTaskTemplateId", "arrival_template_id", "inTemplateId", "inTaskTemplateId"])) : null;
  const departureTemplateId = cfg ? id(pick(cfg, ["departureTemplateId", "departureTaskTemplateId", "departure_template_id", "outTemplateId", "outTaskTemplateId"])) : null;
  const arrivalTemplateName = cfg ? str(pick(cfg, ["arrivalTemplateName", "arrivalTaskTemplateName", "arrival_template_name", "inTemplateName", "inTaskTemplateName"])) : null;
  const departureTemplateName = cfg ? str(pick(cfg, ["departureTemplateName", "departureTaskTemplateName", "departure_template_name", "outTemplateName", "outTaskTemplateName"])) : null;
  const configured = arrivalTemplateId != null || departureTemplateId != null || arrivalTemplateName != null || departureTemplateName != null;
  let vehicleCapacity = cfg ? num(pick(cfg, ["vehicleCapacity", "vanCapacity", "transportVanCapacity", "transportCapacity", "capacity"])) : null;
  if (configured && vehicleCapacity == null) { vehicleCapacity = 1; warnings.push("transport_capacity_missing"); }
  if (!configured) warnings.push("transport_template_occupancy_not_configured");
  return Object.freeze({ configured, arrivalTemplateId, departureTemplateId, arrivalTemplateName, departureTemplateName, arrivalTargetGroupSize: cfg ? num(pick(cfg, ["arrivalTargetGroupSize", "arrivalGroupingTarget", "targetArrivalGroupSize"])) : null, departureTargetGroupSize: cfg ? num(pick(cfg, ["departureTargetGroupSize", "departureGroupingTarget", "targetDepartureGroupSize"])) : null, arrivalMinGapMinutes: cfg ? num(pick(cfg, ["arrivalMinGapMinutes", "minMinutesBetweenArrivals"])) : null, departureMinGapMinutes: cfg ? num(pick(cfg, ["departureMinGapMinutes", "minMinutesBetweenDepartures"])) : null, vehicleCapacity, transportSpaceId: cfg ? id(pick(cfg, ["transportSpaceId", "spaceId"])) : null, groupingWeight: cfg ? num(pick(cfg, ["groupingWeight", "transportGroupingWeight"])) : null, source, warnings, readOnly: true, planningInfluence: "validation-semantics-only" }) as ORCTransportContract;
}
