import type { AssistedConfigRefreshChangeV1 } from "../../../shared/assistedConfigRefreshContracts";

const record = (value: unknown): Record<string, any> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
const listChanged = (left: unknown, right: unknown) => JSON.stringify(left ?? []) !== JSON.stringify(right ?? []);

/** Human-facing, deterministic summary. It deliberately exposes no raw snapshot or solver keys. */
export function summarizeConfigRefreshChange(change: AssistedConfigRefreshChangeV1): readonly string[] {
  if (change.kind === "NEW") return ["Se incorporará esta plantilla al día."];
  if (change.kind === "REMOVED") return ["Esta plantilla dejará de estar disponible para el día."];
  const current=record(change.currentValue), candidate=record(change.candidateValue);
  if(!current||!candidate)return ["La configuración efectiva cambiará."];
  const summaries:string[]=[];
  if(change.authority==="task_templates"){
    if(current.defaultDuration!==candidate.defaultDuration)summaries.push(`Duración: ${current.defaultDuration} → ${candidate.defaultDuration} min`);
    if(current.defaultZoneId!==candidate.defaultZoneId)summaries.push("Cambia la zona habitual.");
    if(current.defaultSpaceId!==candidate.defaultSpaceId)summaries.push("Cambia el espacio habitual.");
    if(listChanged(current.dependencyTemplateIds,candidate.dependencyTemplateIds)||current.hasDependency!==candidate.hasDependency)summaries.push("Cambian sus dependencias.");
    if(current.requiresAuxiliar!==candidate.requiresAuxiliar||current.requiresCoach!==candidate.requiresCoach||current.requiresPresenter!==candidate.requiresPresenter||listChanged(current.resourceRequirements,candidate.resourceRequirements)||current.itinerantTeamRequirement!==candidate.itinerantTeamRequirement)summaries.push("Cambian los requisitos de personal o recursos.");
  }else if(change.authority==="optimizer"){
    if(current.editingMode!==candidate.editingMode)summaries.push(`Modo de configuración: ${candidate.editingMode==="ADVANCED"?"avanzado":"básico"}.`);
    if(current.mainZoneId!==candidate.mainZoneId)summaries.push("Cambia la zona principal.");
    if(listChanged(current.groupingZoneIds,candidate.groupingZoneIds))summaries.push("Cambian las zonas que se agrupan.");
    if(listChanged(current.heuristics,candidate.heuristics))summaries.push("Cambian las prioridades de optimización.");
    if(listChanged(current.transport,candidate.transport))summaries.push("Cambian las preferencias de agrupación de transporte.");
  }
  return summaries.length?summaries:["La configuración efectiva cambiará."];
}
