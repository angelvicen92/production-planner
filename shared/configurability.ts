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
  productive({...base("WORKDAY_WINDOW","Horario de la jornada","Jornada y comidas","PLAN","HH:mm",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]),generalSource:"program_settings.default_work_start/default_work_end",dailyPersistence:"plans effective + immutable work baseline + explicit source",override:"Typed edit/restore/refresh operations",generalUi:"Ajustes generales del programa > Horario habitual de la jornada",dayUi:"Exception-first creation and effective configuration review",engineInputProjection:"workDay (effective only)",preflight:"buildEngineInput + spatial hierarchy validation",engineConsumer:"V3/V4",validator:"dayConfig schemas + DB constraints",evidenceFingerprint:"plan_config_revisions",permissionsRls:"plans RLS + service-only atomic RPC",tests:["server/dayConfiguration.spec.ts","engine/buildInput.operationalSnapshotGate.spec.ts"]}),
  gap("PARTIAL",["El intervalo de jornada existe, pero no hay contrato productivo end-to-end para una granularidad de grid independiente."],{...base("TIME_GRID","Granularidad temporal","Jornada y comidas","PLAN","minutos",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]),engineInputProjection:"intervalMinutes parcial"}),
  productive({...base("GLOBAL_MEAL_BREAK","Pausa global de comida","Jornada y comidas","PLAN","HH:mm",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]),generalSource:"program_settings",dailyPersistence:"plans effective + immutable meal baseline + explicit source",override:"Typed edit/restore/refresh operations",generalUi:"Configuración general",dayUi:"Exception-first creation and effective configuration review",engineInputProjection:"meal/mealMode (effective only)",preflight:"buildEngineInput",engineConsumer:"V3/V4",validator:"dayConfig schemas + DB constraints",evidenceFingerprint:"plan_config_revisions",permissionsRls:"plans RLS + service-only atomic RPC",tests:["server/dayConfiguration.spec.ts","engine/buildInput.operationalSnapshotGate.spec.ts"]}),
  gap("PARTIAL",["operationalMealPolicies no tiene recorrido productivo completo ni provenance diaria demostrable."],{...base("OPERATIONAL_MEAL_POLICIES","Comidas por participante/ámbito","Jornada y comidas","PLAN","minutos",["DAY_SNAPSHOT","INSTANCE_OVERRIDE"]),engineInputProjection:"operationalMealPolicies parcial"}),
  gap("BLOCKED",["daily_tasks participa en la proyección y tiene RLS desactivada."],{...base("PARTICIPANTS","Participantes y disponibilidad","Participantes","PARTICIPANT","personas / HH:mm",["DAY_SNAPSHOT","INSTANCE_OVERRIDE"]),dailyPersistence:"contestants + daily_tasks",engineInputProjection:"contestantAvailabilityById/tasks",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"schemas existentes",permissionsRls:"BLOCKED: daily_tasks RLS desactivada",tests:["engine/buildInput.sourceCriticality.spec.ts"]}),
  gap("BLOCKED",["daily_tasks tiene RLS desactivada."],{...base("TASKS_DEPENDENCIES","Tareas y dependencias","Tareas","DAILY_TASK","tareas / minutos",["GENERAL","DAY_SNAPSHOT","INSTANCE_OVERRIDE","PROTECTED_DECISION"]),generalSource:"task_templates",dailyPersistence:"plan_task_template_snapshots + daily_tasks",engineInputProjection:"tasks.dependsOnTaskIds",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"dependencias y estados",permissionsRls:"BLOCKED: daily_tasks RLS desactivada",evidenceFingerprint:"taskTemplateSnapshotFingerprint",tests:["engine/buildInput.taskTemplateSnapshot.spec.ts"]}),
  gap("BLOCKED",["spaces tiene RLS desactivada."],{...base("SPATIAL_AVAILABILITY","Espacios, zonas y disponibilidad","Platós y espacios","SPACE","espacios / HH:mm",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE","INSTANCE_OVERRIDE"]),generalSource:"zones/spaces",dailyPersistence:"plan spatial settings",engineInputProjection:"planZoneSettings/planSpaceSettings",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"spatial availability",permissionsRls:"BLOCKED: spaces RLS desactivada",tests:["engine/buildInput.spatialAvailability.spec.ts"]}),
  gap("MISSING",["La base de datos productiva no persiste capacidad espacial."],{...base("SPACE_CAPACITY","Capacidad de espacios","Platós y espacios","SPACE","personas",["GENERAL","DAY_SNAPSHOT","INSTANCE_OVERRIDE"]),engineInputProjection:"spaceCapacityById no respaldado por persistencia productiva"}),
  gap("BLOCKED",["resource_items tiene RLS desactivada."],{...base("RESOURCE_CATALOG","Catálogo y disponibilidad de recursos","Recursos","RESOURCE","unidades",["GENERAL","DAY_SNAPSHOT"]),generalSource:"resource_items",engineInputProjection:"resource catalog",permissionsRls:"BLOCKED: resource_items RLS desactivada"}),
  gap("BLOCKED",["plan_resource_items tiene RLS desactivada."],{...base("PLAN_RESOURCE_ASSIGNMENTS","Asignaciones y necesidades de recursos","Recursos","RESOURCE","unidades",["DAY_SNAPSHOT","DAY_OVERRIDE","INSTANCE_OVERRIDE"]),dailyPersistence:"plan_resource_items",engineInputProjection:"planResourceItems/resourceRequirements",preflight:"buildEngineInput",engineConsumer:"motores productivos",validator:"resource availability",permissionsRls:"BLOCKED: plan_resource_items RLS desactivada",tests:["engine/buildInput.resourceAvailability.spec.ts"]}),
  gap("PARTIAL",["buildEngineInput no proyecta itinerantTeamAvailability desde autoridades productivas."],{...base("ITINERANT_UNITS","Unidades itinerantes","Recursos","ITINERANT_UNIT","unidades / HH:mm",["GENERAL","DAY_SNAPSHOT","INSTANCE_OVERRIDE"]),engineInputProjection:"tasks únicamente; falta itinerantTeamAvailability",tests:[]}),
  gap("PARTIAL",["targetGroupSize se normaliza como mínimo, pero falta recorrido de producto completo."],{...base("TRANSPORT_TARGET_GROUP_SIZE","Objetivo/mínimo de agrupación","Transporte","PLAN","personas",["GENERAL","DAY_SNAPSHOT"]),generalSource:"optimizer_settings",dailyPersistence:"plan_optimizer_snapshot",engineInputProjection:"transportSettings.minimumGroupSize"}),
  gap("PARTIAL",["maximumGroupSize procede del límite diario, pero el soporte consumidor no es universal."],{...base("TRANSPORT_MAXIMUM_GROUP_SIZE","Máximo de agrupación","Transporte","PLAN","personas",["GENERAL","DAY_SNAPSHOT"]),generalSource:"optimizer_settings",dailyPersistence:"plan_optimizer_snapshot",engineInputProjection:"transportSettings.maximumGroupSize"}),
  gap("MISSING",["No existe autoridad productiva independiente para vehicleCapacity."],{...base("TRANSPORT_VEHICLE_CAPACITY","Capacidad física del vehículo","Transporte","PLAN","personas/vehículo",["GENERAL","DAY_SNAPSHOT"])}),
  gap("MISSING",["buildEngineInput no proyecta transiciones de participante ni de recurso."],{...base("TRANSITIONS","Transiciones de participante y recurso","Reglas de planificación","PLANNER","minutos",["GENERAL","DAY_SNAPSHOT"]),engineInputProjection:"UNAVAILABLE"}),
  gap("PARTIAL",["No hay una superficie diaria lossless para todas las reglas de flujo."],{...base("MAIN_FLOW","Flujo principal","Reglas de planificación","PLANNER","política",["GENERAL","DAY_SNAPSHOT"]),engineInputProjection:"planner parcial"}),
  gap("MISSING",["Faltan persistencia, proyección productiva y validador de AUTO/FIXED."],{...base("BLOCK_COUNT_POLICY","Número de bloques","Reglas de planificación","PLANNER","bloques",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]),semantics:["AUTO_MIN_FEASIBLE","FIXED_COUNT(n)"],p0:true}),
  gap("PARTIAL",["Existe capacidad de motor sin edición diaria productiva completa."],{...base("SETUPS","Setups","Operaciones y coordinación","SPACE","familias / minutos",["GENERAL","DAY_SNAPSHOT","INSTANCE_OVERRIDE"])}),
  gap("PARTIAL",["Falta configuración productiva end-to-end."],{...base("ANCHORED_OPERATIONS","Operaciones ancladas","Operaciones y coordinación","DAILY_TASK","operaciones",["DAY_SNAPSHOT","INSTANCE_OVERRIDE"])}),
  gap("PARTIAL",["Falta configuración productiva end-to-end."],{...base("JOINT_OPERATIONS","Operaciones conjuntas","Operaciones y coordinación","DAILY_TASK","grupos",["DAY_SNAPSHOT","INSTANCE_OVERRIDE"])}),
  gap("PARTIAL",["Falta configuración productiva end-to-end."],{...base("SYNCHRONIZED_ROUNDS","Rondas sincronizadas","Operaciones y coordinación","SPACE","rondas",["DAY_SNAPSHOT","INSTANCE_OVERRIDE"])}),
  gap("PARTIAL",["Falta configuración productiva end-to-end."],{...base("TECHNICAL_CHAINS","Cadenas técnicas","Operaciones y coordinación","DAILY_TASK","cadenas",["DAY_SNAPSHOT","INSTANCE_OVERRIDE"])}),
  gap("PARTIAL",["El snapshot versionado conserva provenance explícita INHERITED, DAY_OVERRIDE o LEGACY_BACKFILL y llega al motor con fingerprint.","No existe una operación Restore inherited que elimine semánticamente un DAY_OVERRIDE; el refresh genera otro candidato DAY_OVERRIDE."],{...base("OPTIMIZATION","Optimización","Reglas de planificación","PLANNER","niveles/pesos",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]),generalSource:"optimizer_settings",dailyPersistence:"plan_optimizer_snapshots con source explícito",override:"DAY_OVERRIDE; sin Restore inherited",generalUi:"Optimización",engineInputProjection:"optimizer snapshot + optimizerSnapshotSource",preflight:"snapshot normalization",engineConsumer:"motores productivos",validator:"optimizer snapshot",evidenceFingerprint:"optimizerSnapshotFingerprint",tests:["server/planOptimizerSnapshot.spec.ts","server/planOptimizerSnapshotRefreshPreview.spec.ts","server/assistedConfigRefresh.spec.ts"]}),
  gap("PARTIAL",["Falta contrato de producto general/día completo."],{...base("SEARCH_POLICY_BUDGET","Política y presupuesto de búsqueda","Avanzado","PLANNER","nodos/intentos",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE"]),p0:true}),
  gap("MISSING",["No existe persistencia general/día ni RUN_OVERRIDE."],{...base("ASSISTED_PROPOSAL_TIME_LIMIT","Tiempo máximo por propuesta Assisted","Avanzado","PLANNER","milisegundos",["GENERAL","DAY_SNAPSHOT","DAY_OVERRIDE","RUN_OVERRIDE"]),semantics:["RUN_OVERRIDE","TIME_LIMIT_REACHED","BUDGET_EXHAUSTED","INFEASIBLE"],p0:true}),
  gap("PARTIAL",["La revisión efectiva sólo tiene revision cuando existe sesión Assisted."],{...base("EFFECTIVE_CONFIG_REVIEW","Configuración y revisión efectiva","Avanzado","GOVERNANCE","revisión/fingerprint",["DAY_SNAPSHOT"]),evidenceFingerprint:"revision/fingerprints"}),
  gap("NOT_APPLICABLE",["Es un invariante hard, no una opción configurable."],{...base("PROTECTED_STATE_LOCKS","Locks y estado protegido","Avanzado","PLAN","decisiones",["PROTECTED_DECISION"]),dailyPersistence:"tasks/locks",override:"No configurable: invariante",engineInputProjection:"tasks.status/locks",validator:"hard validation",semantics:["done e in_progress son inmutables","locks son hard"]}),
]);

export const configurabilityCounts = Object.freeze(capabilityStatuses.reduce((counts,status)=>({...counts,[status]:configurabilityRegistry.filter(item=>item.status===status).length}),{} as Record<CapabilityStatus,number>));
