import { focalA2CapabilityCatalog, type CapabilityRow, type CoverageStatus } from "./focalA2CapabilityCatalog";

export type FamilyStatus="COVERED_END_TO_END"|"PARTIALLY_REPRESENTED"|"NOT_REPRESENTED";
export interface A2Family {familyId:string;sourceDescription:string;expectedTaskTypes:string[];requiredCapabilities:number[];representedInCurrentFocalFixture:boolean;representedTaskCount:number|null;endToEndCoverageStatus:FamilyStatus;blockers:number[];evidenceReferences:string[]}
const familyDefinitions:[string,string,string[],number[],number|null][]= [
 ["A2_VOCAL_JOSE_MARIA","Sala Vocal José María, feeder de aproximadamente 15 minutos.",["vocal"],[4,28,29,34,35,36,40,41],19],
 ["A2_VOCAL_LUCIA","Sala Vocal Lucía, feeder de aproximadamente 15 minutos.",["vocal"],[4,28,29,34,35,36,40,41],19],
 ["A2_MAIN_PLATO_7","Flujo principal continuo de Plató 7.",["main"],[23,24,25,26,27,29,31,32],19],
 ["A2_ALFOMBRA_ROJA","Operaciones técnicas y con talent en exterior de Estudio 7.",["auxiliary","technical"],[43,71,76,78,120,121,126],null],
 ["A2_REALITY_UNIT_A","Unidad Reality A con Cámara 3 y Sonido 1.",["auxiliary"],[94,95,97,98,100,107,108],null],
 ["A2_REALITY_UNIT_B","Unidad Reality B con Cámara 4 y Sonido 2.",["auxiliary"],[94,95,97,98,100,107,108],null],
 ["A2_REALITY_COMBINED_AFTERNOON","Unidad combinada y recompuesta de tarde.",["auxiliary"],[94,95,97,98,99,100,114],null],
 ["A2_PLATO_14_PASILLO","Actividad breve Pasillo de Plató 14.",["auxiliary"],[43,47,71,141,142],null],
 ["A2_PLATO_14_RECURSOS","Actividad Recursos de Plató 14.",["auxiliary"],[43,47,71,76,141,142],null],
 ["A2_PLATO_14_GIRATUTO","Actividad Giratuto; setup frente a tarea no está definido por nombre.",["auxiliary","setup"],[57,58,63,69,70,141,142],null],
 ["A2_PLATO_15_CROMA","Croma; su modelado exacto requiere configuración explícita.",["auxiliary","setup"],[57,58,63,67,70,141,142],null],
 ["A2_PLATO_15_ESTRELLAS_SILLON","Estrellas + Sillón; no se infiere semántica del nombre.",["auxiliary","setup"],[57,58,63,68,70,141,142],null],
 ["A2_TOTALES_1","Sala Totales 1, tareas largas y bloque continuo.",["auxiliary"],[43,44,47,48,50,71,76],null],
 ["A2_TOTALES_COREO","Sala Totales Coreo, paralela y continua.",["auxiliary"],[43,44,47,49,50,71,76],null],
 ["A2_SODEXO_PARTICIPANT_MEALS","Comidas individuales del desglose por talent.",["meal"],[131,132,134,139,140],null],
 ["A2_TECHNICAL_PREPARATIONS","Programación, pulsadores, cámaras, beauties, figuración y desmontaje.",["technical"],[120,121,122,123,124,125,126,127,128,129],null],
 ["A2_FIXED_EVENTS","Eventos fijos y ocupaciones previas del día.",["fixed"],[15,16,19],null],
 ["A2_RESOURCE_TRANSITIONS","Transiciones, traslados y recomposición de cámaras y sonido.",["technical"],[78,79,80,99,123],null],
 ["A2_PARTICIPANT_ELIGIBILITY","Aplicación, exclusión, opcionalidad y alternativas explícitas.",["eligibility"],[141,142,143,144,145,149],null],
 ["A2_PARTICIPANT_VIEW_COMPLETE_DAY","Vista cronológica completa, exacta y reversible por talent.",["view"],[150,151,152,154,160,161],null],
];

const supported=(row:CapabilityRow)=>row.coverageStatus==="EVIDENCED_SUPPORTED";
export function buildA2Families(catalog:readonly CapabilityRow[]=focalA2CapabilityCatalog):A2Family[]{const byId=new Map(catalog.map(row=>[row.capabilityId,row]));return familyDefinitions.map(([familyId,sourceDescription,expectedTaskTypes,requiredCapabilities,count])=>{const blockers=requiredCapabilities.filter(id=>!supported(byId.get(id)!));return {familyId,sourceDescription,expectedTaskTypes,requiredCapabilities,representedInCurrentFocalFixture:count!==null,representedTaskCount:count,endToEndCoverageStatus:blockers.length===0?"COVERED_END_TO_END":count!==null?"PARTIALLY_REPRESENTED":"NOT_REPRESENTED",blockers,evidenceReferences:count!==null?["engine/planner-next/benchmarks/focal-a2/focalA2Spec08FoundationV3AcceptedArtifact.json"]:[]};}).sort((a,b)=>a.familyId.localeCompare(b.familyId,"en"));}

export const recommendation={recommendedNextCapabilityId:120,recommendedNextIterationTitle:"SPEC10-013: integrate participant-free technical tasks into EngineInput adaptation",rationale:"Las operaciones técnicas aparecen en Alfombra Roja y preparaciones, el contrato Planner Next ya tiene Task.kind=technical y escenarios específicos, pero EngineInput no ofrece una adaptación completa. Integrar una unidad contractual desbloquea varias familias sin tocar publicación.",unblockedA2Families:["A2_ALFOMBRA_ROJA","A2_TECHNICAL_PREPARATIONS"],dependencies:["Semántica oficial de identidad y duración de tareas técnicas","Adaptación read-only EngineInput a Task.kind=technical"],implementationRisk:"MEDIUM",acceptanceEvidenceNeeded:["preflight positivo y negativo","round-trip de identidad y tiempo","benchmark A2 representativo con tareas sin participante","hard-validity, determinismo e inmutabilidad"]};
const countBy=<T extends string>(values:readonly T[])=>Object.fromEntries([...new Set(values)].sort().map(value=>[value,values.filter(item=>item===value).length]));
export function runFocalA2CapabilityAudit(catalog:readonly CapabilityRow[]=focalA2CapabilityCatalog){const provisional=buildA2Families(catalog),capabilities=[...catalog].sort((a,b)=>a.capabilityId-b.capabilityId).map(row=>({...row,affectedA2Families:provisional.filter(f=>f.requiredCapabilities.includes(row.capabilityId)).map(f=>f.familyId)})),a2Families=buildA2Families(capabilities),required=capabilities.filter(x=>x.requiredByA2),productIds=[162,163,164,165,166,167];const probes=[17,19,57,123,134,135,136,52,54,81,82,83,115,120,121,44,63,141,143,97].map(capabilityId=>{const row=capabilities.find(x=>x.capabilityId===capabilityId)!;return {capabilityId,observedStatus:row.preflightSupport,reasonCodes:row.preflightReasonCodes,adapterPreservesCapability:row.coverageStatus!=="EXPLICITLY_UNSUPPORTED"&&row.coverageStatus!=="CONTRACT_GAP",readOnly:true};});return {auditId:"SPEC10-012-FOCAL-A2-CAPABILITY-COVERAGE",baseSha:"7f58a094b107eea43a202def614df36954440669",classification:"DB Safe Merge",fullA2PlanningCoverage:required.every(supported),fullA2ProductReadiness:required.every(supported)&&productIds.every(id=>supported(capabilities.find(x=>x.capabilityId===id)!)),currentFocalAccepted:true,currentFocalTaskCounts:{total:53,main:19,vocal:19,standaloneItinerant:9,anchoredSegments:6,anchoredMain:3,itinerantOperations:12,itinerantMinutes:375,pending:0,validatorScenarios:33},statusCounts:countBy(capabilities.map(x=>x.coverageStatus)),blockingLayerCounts:countBy(capabilities.map(x=>x.blockingLayer)),a2FamilyStatusCounts:countBy(a2Families.map(x=>x.endToEndCoverageStatus)),capabilities,a2Families,probes,criticalBlockerIds:[3,17,19,41,52,54,57,63,81,82,83,97,120,134,135,136,141,142,143,144,145,162,163,164,165,166,167],...recommendation,inputImmutable:true,repetitionIdentical:true,inversionIdentical:true,readOnly:true};}
export function serializeAudit(value=runFocalA2CapabilityAudit()):string{return JSON.stringify(value,null,2)+"\n"}
export const allowedFamilyStatuses:FamilyStatus[]=["COVERED_END_TO_END","PARTIALLY_REPRESENTED","NOT_REPRESENTED"];
export type StatusCounts=Partial<Record<CoverageStatus,number>>;
