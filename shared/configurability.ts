/** Canonical product configurability inventory (Fuente 04 v2.4, section 20). */
export const capabilityStatuses = ["PRODUCTIVE", "PARTIAL", "MISSING", "BLOCKED", "NOT_APPLICABLE"] as const;
export type CapabilityStatus = typeof capabilityStatuses[number];
export type ConfigurationLevel = "GENERAL" | "DAY_SNAPSHOT" | "DAY_OVERRIDE" | "INSTANCE_OVERRIDE" | "PROTECTED_DECISION" | "RUN_OVERRIDE";
export type ConfigurationSeverity = "REQUIRED" | "PREFERRED" | "OFF" | "NOT_APPLICABLE";
export type ConfigurationCategory = "Jornada y comidas" | "Participantes" | "Tareas" | "Platós y espacios" | "Recursos" | "Transporte" | "Operaciones y coordinación" | "Reglas de planificación" | "Avanzado";

export interface ConfigurabilityCapability {
  readonly capabilityId: string;
  readonly name: string;
  readonly category: ConfigurationCategory;
  readonly owner: string;
  readonly unit: string;
  readonly severities: readonly ConfigurationSeverity[];
  readonly levels: readonly ConfigurationLevel[];
  readonly generalSource: string;
  readonly dailyPersistence: string;
  readonly override: string;
  readonly generalUi: string;
  readonly dayUi: string;
  readonly engineInputProjection: string;
  readonly preflight: string;
  readonly engineConsumer: string;
  readonly validator: string;
  readonly evidenceFingerprint: string;
  readonly permissionsRls: string;
  readonly tests: readonly string[];
  readonly status: CapabilityStatus;
  readonly blockers: readonly string[];
  readonly p0?: boolean;
  readonly semantics?: readonly string[];
}

const productive = (capability: Omit<ConfigurabilityCapability, "status" | "blockers">): ConfigurabilityCapability => Object.freeze({...capability, status:"PRODUCTIVE", blockers:Object.freeze([])});
const gap = (status: Exclude<CapabilityStatus,"PRODUCTIVE">, blockers: readonly string[], capability: Omit<ConfigurabilityCapability, "status" | "blockers">): ConfigurabilityCapability => Object.freeze({...capability, status, blockers:Object.freeze([...blockers])});
const base = (capabilityId:string,name:string,category:ConfigurationCategory,owner:string,unit:string,levels:readonly ConfigurationLevel[]): Omit<ConfigurabilityCapability,"status"|"blockers"> => ({
  capabilityId,name,category,owner,unit,levels:Object.freeze([...levels]),severities:Object.freeze(["REQUIRED","PREFERRED","OFF"]),
  generalSource:"UNAVAILABLE",dailyPersistence:"UNAVAILABLE",override:"UNAVAILABLE",generalUi:"UNAVAILABLE",dayUi:"Configuración del día (inspección)",
  engineInputProjection:"UNAVAILABLE",preflight:"UNAVAILABLE",engineConsumer:"UNAVAILABLE",validator:"UNAVAILABLE",evidenceFingerprint:"UNAVAILABLE",permissionsRls:"Autorización del plan existente",tests:Object.freeze([]),
});

export const configurabilityRegistry: readonly ConfigurabilityCapability[] = Object.freeze([
  productive({...base("WORKDAY_GRID","Jornada y grid","Jornada y comidas","PLAN","HH:mm / minutos",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]),generalSource:"program_settings",dailyPersistence:"plans.work_start/work_end",override:"PATCH plan",generalUi:"Configuración general",engineInputProjection:"workDay",preflight:"buildEngineInput",engineConsumer:"V3/V4",validator:"updatePlanSchema",evidenceFingerprint:"effective revision cuando existe",tests:["engine/buildInput.operationalSnapshotGate.spec.ts"]}),
  productive({...base("MEALS_BY_SCOPE","Comidas y pausas por ámbito","Jornada y comidas","PLAN","minutos",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE","INSTANCE_OVERRIDE"]),generalSource:"program_settings y catálogos",dailyPersistence:"plan + snapshots por ámbito",override:"plan/entidad",generalUi:"Configuración general",engineInputProjection:"meal/protectedBreaks/operationalMealPolicies",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"updatePlanSchema",evidenceFingerprint:"config revision",tests:["engine/buildInput.operationalSnapshotGate.spec.ts"]}),
  productive({...base("PARTICIPANTS","Participantes y disponibilidad","Participantes","PARTICIPANT","personas / HH:mm",["DAY_SNAPSHOT","INSTANCE_OVERRIDE"]),dailyPersistence:"contestants + plan availability",override:"participante",generalUi:"Catálogo de participantes",engineInputProjection:"contestantAvailabilityById/tasks",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"schemas de participante",evidenceFingerprint:"effective authorities",tests:["engine/buildInput.spec.ts"]}),
  productive({...base("TASKS_DEPENDENCIES","Tareas y dependencias","Tareas","DAILY_TASK","tareas / minutos",["GENERAL","DAY_SNAPSHOT","INSTANCE_OVERRIDE","PROTECTED_DECISION"]),generalSource:"task_templates",dailyPersistence:"plan_task_template_snapshots + daily_tasks",override:"tarea diaria",generalUi:"Plantillas",engineInputProjection:"tasks.dependsOnTaskIds",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"dependencias y estados",evidenceFingerprint:"taskTemplateSnapshotFingerprint",tests:["engine/buildInput.taskTemplateSnapshot.spec.ts"]}),
  productive({...base("SPACES_CAPACITY","Platós, espacios, zonas y capacidad","Platós y espacios","SPACE","espacios / capacidad",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE","INSTANCE_OVERRIDE"]),generalSource:"zones/spaces",dailyPersistence:"plan spatial snapshots",override:"zona/espacio",generalUi:"Espacios",engineInputProjection:"planZoneSettings/planSpaceSettings/spaceCapacityById",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"spatial availability",evidenceFingerprint:"effective authorities",tests:["engine/buildInput.spatialAvailability.spec.ts"]}),
  productive({...base("RESOURCES","Recursos, disponibilidad y asignaciones","Recursos","RESOURCE","unidades",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE","INSTANCE_OVERRIDE"]),generalSource:"resource catalog/defaults",dailyPersistence:"plan_resource_items y asignaciones",override:"plan/zona/espacio/tarea",generalUi:"Recursos",engineInputProjection:"planResourceItems/resource requirements",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"resource availability",evidenceFingerprint:"effective authorities",tests:["engine/buildInput.resourceAvailability.spec.ts"]}),
  productive({...base("ITINERANT_UNITS","Unidades itinerantes","Recursos","ITINERANT_UNIT","unidades / HH:mm",["GENERAL","DAY_SNAPSHOT","INSTANCE_OVERRIDE"]),generalSource:"itinerant teams",dailyPersistence:"plan assignments",override:"tarea",generalUi:"Unidades itinerantes",engineInputProjection:"itinerantTeamAvailability/tasks",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"availability",evidenceFingerprint:"effective authorities",tests:["engine/buildInput.spec.ts"]}),
  productive({...base("TRANSPORT","Transporte","Transporte","PLAN","personas / minutos",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]),generalSource:"optimizer_settings",dailyPersistence:"plan_optimizer_snapshot",override:"snapshot diario",generalUi:"Transporte",engineInputProjection:"transportSettings",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"snapshot validator",evidenceFingerprint:"optimizerSnapshotFingerprint",tests:["server/planOptimizerSnapshot.spec.ts"]}),
  productive({...base("TRANSITIONS","Transiciones globales","Reglas de planificación","PLANNER","minutos",["GENERAL","DAY_SNAPSHOT"]),generalSource:"program/optimizer settings",dailyPersistence:"snapshot diario",override:"UNAVAILABLE",generalUi:"Optimización",engineInputProjection:"participantTransitionMinutes/resourceTransitionMinutes",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"input validation",evidenceFingerprint:"config revision",tests:["engine/buildInput.spec.ts"]}),
  gap("PARTIAL",["No hay una superficie diaria lossless para todas las reglas de flujo."],{...base("MAIN_FLOW","Flujo principal","Reglas de planificación","PLANNER","política",["GENERAL","DAY_SNAPSHOT"]),generalSource:"optimizer settings",dailyPersistence:"optimizer snapshot",generalUi:"Optimización",engineInputProjection:"plannerNext/main flow (parcial)",preflight:"contratos existentes",engineConsumer:"consumidor existente",validator:"preflight existente",evidenceFingerprint:"optimizer fingerprint",tests:["server/planOptimizerSnapshot.spec.ts"]}),
  gap("MISSING",["Faltan persistencia, proyección productiva y validador de AUTO/FIXED."],{...base("BLOCK_COUNT_POLICY","Número de bloques","Reglas de planificación","PLANNER","bloques",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]),semantics:["AUTO_MIN_FEASIBLE","FIXED_COUNT(n)"] ,p0:true}),
  gap("PARTIAL",["La capacidad del motor no dispone de edición diaria productiva completa."],{...base("SETUPS","Setups","Operaciones y coordinación","SPACE","familias / minutos",["GENERAL","DAY_SNAPSHOT","INSTANCE_OVERRIDE"]),engineInputProjection:"setupPolicies",preflight:"Planner Next preflight",engineConsumer:"Planner Next",validator:"Planner Next validator",evidenceFingerprint:"Planner Next fingerprint",tests:["engine/planner-next/setupGrouping.spec.ts"]}),
  gap("PARTIAL",["Faltan persistencia y UI productivas."],{...base("ANCHORED_OPERATIONS","Operaciones ancladas","Operaciones y coordinación","DAILY_TASK","operaciones",["DAY_SNAPSHOT","INSTANCE_OVERRIDE"]),engineInputProjection:"anchoredAccompaniments",preflight:"Planner Next preflight",engineConsumer:"Planner Next",validator:"Planner Next validator",evidenceFingerprint:"Planner Next fingerprint",tests:["engine/planner-next/anchoredAccompaniment.spec.ts"]}),
  gap("PARTIAL",["Falta configuración productiva end-to-end."],{...base("JOINT_OPERATIONS","Operaciones conjuntas","Operaciones y coordinación","DAILY_TASK","grupos",["DAY_SNAPSHOT","INSTANCE_OVERRIDE"]),engineInputProjection:"tasks.jointGroupId",preflight:"Planner Next preflight",engineConsumer:"Planner Next",validator:"Planner Next validator",evidenceFingerprint:"Planner Next fingerprint",tests:["engine/planner-next/jointTasks.spec.ts"]}),
  gap("PARTIAL",["Falta configuración productiva end-to-end."],{...base("SYNCHRONIZED_ROUNDS","Rondas sincronizadas","Operaciones y coordinación","SPACE","rondas",["DAY_SNAPSHOT","INSTANCE_OVERRIDE"]),engineInputProjection:"roundSynchronizations",preflight:"Planner Next preflight",engineConsumer:"Planner Next",validator:"Planner Next validator",evidenceFingerprint:"Planner Next fingerprint",tests:["engine/planner-next/roundSynchronization.spec.ts"]}),
  gap("PARTIAL",["Falta configuración productiva end-to-end."],{...base("TECHNICAL_CHAINS","Cadenas técnicas","Operaciones y coordinación","DAILY_TASK","cadenas",["DAY_SNAPSHOT","INSTANCE_OVERRIDE"]),engineInputProjection:"technicalChains",preflight:"Planner Next preflight",engineConsumer:"Planner Next",validator:"Planner Next validator",evidenceFingerprint:"Planner Next fingerprint",tests:["engine/planner-next/technicalChains.spec.ts"]}),
  productive({...base("OPTIMIZATION","Optimización","Reglas de planificación","PLANNER","niveles/pesos",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]),generalSource:"optimizer_settings",dailyPersistence:"plan_optimizer_snapshots",override:"DAY_OVERRIDE",generalUi:"Optimización",engineInputProjection:"optimizer*",preflight:"snapshot normalization",engineConsumer:"motores productivos",validator:"optimizer snapshot",evidenceFingerprint:"optimizerSnapshotFingerprint",tests:["server/planOptimizerSnapshot.spec.ts"]}),
  gap("PARTIAL",["Planner Next dispone de presupuesto, pero falta contrato de producto general/día completo."],{...base("SEARCH_POLICY_BUDGET","Política y presupuesto de búsqueda","Avanzado","PLANNER","nodos/intentos",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]),engineInputProjection:"plannerNext.searchBudget",preflight:"Planner Next preflight",engineConsumer:"Planner Next",validator:"Planner Next validator",evidenceFingerprint:"search ledger",tests:["engine/planner-next/searchPolicy.spec.ts"],p0:true}),
  gap("MISSING",["No existe aún persistencia general/día ni RUN_OVERRIDE de ScopeProposal."],{...base("ASSISTED_PROPOSAL_TIME_LIMIT","Tiempo máximo por propuesta Assisted","Avanzado","PLANNER","milisegundos",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE","RUN_OVERRIDE"]),semantics:["RUN_OVERRIDE","TIME_LIMIT_REACHED","BUDGET_EXHAUSTED","INFEASIBLE"],p0:true}),
  gap("PARTIAL",["La revisión efectiva existe sólo cuando hay sesión Assisted; esta vista no la inventa."],{...base("EFFECTIVE_CONFIG_REVIEW","Configuración y revisión efectiva","Avanzado","GOVERNANCE","revisión/fingerprint",["DAY_SNAPSHOT"]),dailyPersistence:"plan config revisions",engineInputProjection:"buildEngineInput",evidenceFingerprint:"revision/fingerprints",tests:["server/effectivePlanConfigRevision.spec.ts"]}),
  productive({...base("PROTECTED_STATE_LOCKS","Locks y estado protegido","Avanzado","PLAN","decisiones",["PROTECTED_DECISION"]),dailyPersistence:"tasks/locks",override:"No configurable: invariante",generalUi:"No aplica",engineInputProjection:"tasks.status/locks",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"hard validation",evidenceFingerprint:"input fingerprint",tests:["engine/buildInput.spec.ts"],semantics:["done e in_progress son inmutables","locks son hard"]}),
]);

export const configurabilityCounts = Object.freeze(capabilityStatuses.reduce((counts,status)=>({...counts,[status]:configurabilityRegistry.filter(item=>item.status===status).length}),{} as Record<CapabilityStatus,number>));

