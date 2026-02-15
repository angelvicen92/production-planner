// Engine Inputs (DB-agnostic)
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'interrupted' | 'cancelled';
export type ResourceType = 'auxiliar' | 'coach' | 'presenter';
export type LockType = 'time' | 'space' | 'resource' | 'full';

export interface TimeWindow {
  start: string; // HH:mm
  end: string;   // HH:mm
}

export interface ResourceRequirementsInput {
  // Normalizado: resourceTypeId -> quantity
  byType?: Record<number, number>;

  // Normalizado: resourceItemId -> quantity
  byItem?: Record<number, number>;

  // Alternativas: “1 de estos items” (o quantity > 1 en el futuro)
  anyOf?: Array<{
    quantity: number;
    resourceItemIds: number[];
  }>;
}

  export interface TaskInput {
    id: number;
    planId: number;
    templateId: number;
    // Para excepciones operativas (ej. tarea "comida")
    templateName?: string | null;

    // ✅ Requisitos de recursos de la plantilla (aún NO resueltos)
    resourceRequirements?: ResourceRequirementsInput | null;

    // Ubicación (para motor y explicabilidad)
    zoneId?: number | null;
    spaceId?: number | null;

    contestantId?: number | null;
    contestantName?: string | null;
    status: TaskStatus;

  durationOverrideMin?: number | null;
  camerasOverride?: 0 | 1 | 2 | null;

    // ✅ Dependencias (N prerequisitos)
    // - Los arrays son el “nuevo contrato”.
    // - Los campos legacy se mantienen por compatibilidad (primer elemento).
    hasDependency?: boolean;

    dependsOnTemplateIds?: number[] | null;
    dependsOnTaskIds?: number[] | null; // resuelto en buildInput (por concursante)

    // Legacy (compat)
    dependsOnTemplateId?: number | null;
    dependsOnTaskId?: number | null; // resuelto en buildInput (por concursante)

      startPlanned?: string | null;
      endPlanned?: string | null;
      startReal?: string | null;
      endReal?: string | null;

      // ✅ Recursos ya asignados/persistidos (plan_resource_items.id)
      // Útil para validar solapes con tareas fijas (in_progress/done) y locks.
      assignedResourceIds?: number[] | null;
    }

export interface LockInput {
  id: number;
  planId: number;
  taskId: number;
  lockType: LockType;
  lockedStart?: string | null;
  lockedEnd?: string | null;
  lockedResourceId?: number | null;
}

export interface PlanResourceItemInput {
  id: number; // plan_resource_items.id
  resourceItemId: number; // resource_items.id
  typeId: number; // resource_types.id
  name: string;
  isAvailable: boolean;
}

export interface ResourceItemComponentInput {
  componentResourceItemId: number; // resource_items.id
  quantity: number;
}

export interface EngineInput {
  planId: number;
  workDay: TimeWindow;
  meal: TimeWindow;
  // Nombre de la plantilla que representa "comida" (ej. "Sodexo")
  mealTaskTemplateName?: string;

  // ✅ Comida concursantes (por plan)
  contestantMealDurationMinutes?: number;
  contestantMealMaxSimultaneous?: number;

  camerasAvailable: number;

  tasks: TaskInput[];
  locks: LockInput[];

  // ✅ Para mensajes explicables (dependencias, etc.)
  // Key: templateId -> templateName
  taskTemplateNameById?: Record<number, string>;

  // Recursos anclados a ZONAS (PLATÓS) dentro del plan (override del snapshot)
  // Key: zoneId -> planResourceItemIds
  zoneResourceAssignments: Record<number, number[]>;

  // Recursos anclados a ESPACIOS dentro del plan (override del snapshot)
  // Key: spaceId -> planResourceItemIds
  spaceResourceAssignments: Record<number, number[]>;

  // ✅ Jerarquía de espacios para herencia de pools
  // Key: spaceId -> parentSpaceId (o null si no tiene)
  spaceParentById?: Record<number, number | null>;

  // ✅ Requisitos genéricos por tipo (override por plan)
  // Key: zoneId -> (resourceTypeId -> quantity)
  zoneResourceTypeRequirements: Record<number, Record<number, number>>;

  // ✅ Requisitos genéricos por tipo (override por plan)
  // Key: spaceId -> (resourceTypeId -> quantity)
  spaceResourceTypeRequirements: Record<number, Record<number, number>>;

  // ✅ Inventario del plan (snapshot de resource_items -> plan_resource_items)
  planResourceItems: PlanResourceItemInput[];

  // ✅ Componentes de recursos compuestos (por resource_item_id)
  // Key: parent resourceItemId -> components
  resourceItemComponents: Record<number, ResourceItemComponentInput[]>;

  // ✅ Disponibilidad por concursante (override del plan)
  // Key: contestantId -> ventana HH:mm
  contestantAvailabilityById?: Record<number, TimeWindow>;

  // ✅ Optimización (global, viene de Settings)
  // mainZone = “Plató principal”
  optimizerMainZoneId?: number | null;
  optimizerPrioritizeMainZone?: boolean;
  optimizerGroupBySpaceAndTemplate?: boolean;

  // ✅ niveles amigables (0=Off, 1=Suave, 2=Medio, 3=Fuerte)
  optimizerMainZonePriorityLevel?: number;
  optimizerGroupingLevel?: number;

  // ✅ modos del plató principal (se pueden combinar)
  optimizerMainZoneOptFinishEarly?: boolean;
  optimizerMainZoneOptKeepBusy?: boolean;

  // ✅ compactar concursantes (0=Off..3=Fuerte)
  optimizerContestantCompactLevel?: number;

  // v-next: resources, spaces, zones, availability
}

export interface TaskOutput {
  taskId: number;
  start: string;
  end: string;
  assignedResources: number[];
  assignedSpace?: number;
}

export interface InfeasibleReason {
  code: string;
  message: string; // mensaje operativo
  taskId?: number;
  blockingLockIds?: number[];
}

export interface EngineOutput {
  feasible: boolean;
  schedule?: TaskOutput[];
  reasons?: InfeasibleReason[];
}
