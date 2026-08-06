# SPEC11-004 — Contrato productivo de ocupación temporal posterior a tarea

**Estado:** diseño de dominio ejecutable  
**Clasificación futura:** DB Safe Merge  
**Fuente normativa:** SPEC-11  
**Dependencias:** SPEC11-002 para snapshot efectivo y SPEC11-003 para UX  
**Ámbito:** persistencia, herencia, EngineInput, búsqueda, validación, publicación, Evidence y replanificación

---

## 1. Objetivo

Definir una capacidad genérica para expresar que, al terminar una tarea productiva, una o varias entidades deben permanecer ocupadas durante un intervalo adicional configurable.

La capacidad debe aplicarse a cualquier tarea representable, sin nombres especiales, IDs de escenario ni lógica propia de un programa.

Ejemplos:

- despeje del espacio;
- recuperación del participante;
- desmontaje de recursos;
- limpieza inmediata;
- espera técnica obligatoria;
- seguridad posterior a una operación.

El tiempo posterior no aumenta la duración productiva de la tarea.

---

## 2. Diferencias con otros contratos

### 2.1 Hold posterior

Está anclado inmediatamente al final de una tarea concreta:

```text
hold.start = task.end
hold.end = task.end + duration
```

### 2.2 Setup o preparación de siguiente tarea

Está anclado a la siguiente tarea o a un cambio de familia, ronda o configuración. Puede no comenzar al terminar la tarea anterior.

### 2.3 Transición

Representa el tiempo necesario para que una entidad cambie de ubicación o estado entre dos obligaciones.

### 2.4 Operación técnica explícita

Es una tarea real con identidad, recursos, dependencias y flexibilidad propia.

### 2.5 Totales

Los cinco minutos entre rondas de Totales continúan siendo `ScheduledRoundPreparation`, porque preparan la siguiente ronda y están anclados a su inicio.

No se migrarán automáticamente a hold posterior.

---

## 3. Contrato de dominio V1

```ts
interface TaskTemporalHoldPolicyV1 {
  id: string;
  contractVersion: 1;
  phase: "AFTER_TASK";
  durationMinutes: number;
  severity: "REQUIRED" | "PREFERRED" | "OFF";
  occupies: {
    space: boolean;
    participant: boolean;
    requiredResources: boolean;
    explicitResourceItemIds: readonly number[];
  };
  adjacency: "IMMEDIATE";
}
```

Reglas:

- `id` es estable dentro del ámbito de configuración.
- `durationMinutes` es entero no negativo.
- `OFF` equivale a capacidad inactiva.
- una política activa exige duración positiva;
- una política activa exige al menos una entidad seleccionada;
- `explicitResourceItemIds` contiene IDs globales estables, únicos, positivos y ordenados;
- la proyección diaria resuelve esos IDs a inventario del plan;
- la política no contiene nombres operativos.

V1 admite como máximo una política `AFTER_TASK` efectiva por tarea.

No se introduce una lista arbitraria de reglas ni múltiples fases en esta versión.

---

## 4. Aplicabilidad por tipo de tarea

La política puede asociarse a tareas `MAIN`, `VOCAL`, `AUXILIARY` o `TECHNICAL`.

Preflight debe rechazar:

- `occupies.participant=true` para una tarea sin participante;
- `occupies.space=true` para una tarea sin espacio efectivo;
- `requiredResources=true` como única entidad seleccionada cuando la tarea no posee recursos efectivos;
- recursos explícitos inexistentes o ausentes del inventario diario;
- una política activa que, tras resolver entidades, no ocupa ninguna entidad.

La severidad no convierte una referencia rota en una preferencia válida. REQUIRED y PREFERRED necesitan un contrato completo.

---

## 5. Niveles de configuración

### 5.1 Configuración general

Una plantilla puede declarar su política por defecto mediante persistencia tipada.

### 5.2 Snapshot del día

Al crear el plan, la política general se copia al snapshot diario de plantilla.

Cambios generales posteriores no alteran el día.

### 5.3 Override de instancia

Una tarea diaria puede:

- heredar la política;
- reemplazarla por otra política completa;
- desactivarla explícitamente mediante `severity=OFF`.

Restaurar heredado elimina el override; no copia manualmente el valor heredado.

### 5.4 Protección

Tareas `in_progress` y `done` conservan la política efectiva utilizada por su planificación o ejecución.

Una actualización del snapshot no debe reinterpretarlas retroactivamente.

Hasta que exista actualización manual versionada de snapshots, todos los valores del día permanecen congelados y este problema no aparece en escritura ordinaria.

---

## 6. Persistencia objetivo

### 6.1 Configuración general

Tabla específica equivalente a:

```text
task_template_temporal_hold_policies
```

Campos mínimos:

- id;
- task_template_id;
- contract_version;
- phase;
- duration_minutes;
- severity;
- occupy_space;
- occupy_participant;
- occupy_required_resources;
- created_at;
- updated_at;
- UNIQUE(task_template_id, phase).

Los recursos explícitos se almacenan en una relación equivalente a:

```text
task_template_temporal_hold_resource_items
```

con unicidad por política y recurso.

No se almacenarán dentro de `rules_json`.

### 6.2 Snapshot diario

Tabla equivalente a:

```text
plan_task_temporal_hold_policy_snapshots
```

Identidad mínima:

- plan_id;
- source_template_id;
- policy_id histórico;
- contract_version;
- phase;
- valores normalizados;
- source;
- created_at;
- updated_at;
- UNIQUE(plan_id, source_template_id, phase).

Los recursos explícitos conservan `source_resource_item_id` y se resuelven contra `plan_resource_items` para ejecutar el día.

No se utilizará FK destructiva hacia el catálogo general que altere la historia del plan.

### 6.3 Override de instancia

Tabla equivalente a:

```text
daily_task_temporal_hold_overrides
```

con unicidad por tarea y fase.

Contiene una política completa, no un patch parcial ambiguo.

Eliminar la fila restaura herencia.

### 6.4 Materialización

La planificación publica la ocupación; no es obligatorio persistirla en tablas de dominio durante el primer checkpoint.

Si se persiste en una unidad posterior, deberá vincularse a la planificación o versión de plan que la generó.

---

## 7. Constraints de persistencia

Una política activa debe cumplir:

```text
severity IN (REQUIRED, PREFERRED)
duration_minutes > 0
al menos una entidad seleccionada
```

Una política OFF debe normalizarse de manera única:

```text
duration_minutes = 0
sin recursos explícitos
```

Alternativamente, la ausencia de fila puede representar OFF general; la implementación elegirá una sola semántica y la documentará.

Constraints adicionales:

- versión V1 conocida;
- fase AFTER_TASK;
- duración dentro de un máximo configurable de seguridad de UI y validación, no hardcode de motor;
- IDs de recursos únicos;
- cascade al eliminar plan o tarea diaria;
- sin cascade destructivo desde catálogo general hacia snapshots históricos;
- RLS server-only para snapshots y overrides cuando corresponda.

---

## 8. Resolución efectiva

La resolución canónica sigue:

```text
protección de tarea
      > override completo de instancia
      > snapshot diario
      > configuración general sólo al crear snapshot
      > OFF histórico documentado
```

El helper puro debe devolver:

```ts
interface EffectiveTaskTemporalHoldPolicy {
  policy: TaskTemporalHoldPolicyV1 | null;
  source: "DAY_SNAPSHOT" | "INSTANCE_OVERRIDE" | "PROTECTED" | "LEGACY_OFF";
  fingerprint: string;
}
```

Requisitos:

- no mutar inputs;
- output congelado;
- arrays canónicos;
- fingerprint SHA-256 sobre todos los campos semánticos;
- orden de carga irrelevante;
- versiones desconocidas rechazadas;
- ausencia y OFF no se confunden en diagnostics.

---

## 9. Proyección a EngineInput

Contrato conceptual:

```ts
interface EngineInputTaskTemporalHoldPolicy {
  id: string;
  sourceTaskId: number;
  contractVersion: 1;
  phase: "AFTER_TASK";
  durationMinutes: number;
  severity: "REQUIRED" | "PREFERRED";
  occupySpace: boolean;
  occupyParticipant: boolean;
  occupyRequiredResources: boolean;
  explicitPlanResourceItemIds: readonly number[];
  sourceFingerprint: string;
}
```

`EngineInput.taskTemporalHolds?` contiene únicamente políticas activas.

Proyección:

- usa el valor efectivo de cada tarea;
- resuelve recursos globales a `plan_resource_items`;
- no añade automáticamente recursos no seleccionados;
- `requiredResources` se refiere a los recursos efectivos de la tarea tras herencia y overrides;
- recursos explícitos se unen sin duplicados;
- un recurso explícito ya requerido no se duplica;
- errores de carga o resolución son hard input errors;
- no se usa `safe(..., [])`.

Las tareas canceladas no generan obligaciones futuras.

---

## 10. Adaptación a Planner Next

La política puede proyectarse dentro de `Task`:

```ts
interface TaskTemporalHoldPolicy {
  id: string;
  duration: Minute;
  severity: "REQUIRED" | "PREFERRED";
  occupySpace: boolean;
  occupyParticipant: boolean;
  occupyRequiredResources: boolean;
  explicitResourceIds: readonly string[];
}
```

La adaptación usa identidades canónicas.

Preflight rechaza:

- duración fuera de grid si el contrato exige alineación exacta;
- tarea inexistente;
- referencias de espacio, participante o recurso no representables;
- ID duplicado;
- política activa sin entidad resuelta;
- recurso explícito no disponible para el plan;
- contradicción con tarea protegida.

No se infiere política desde nombres o duración.

---

## 11. Semántica temporal

Para una tarea programada `[start, end)`:

```text
requestedHold = [end, end + duration)
```

El intervalo es inmediato y no puede desplazarse.

Cada entidad seleccionada debe permanecer libre de obligaciones incompatibles durante el intervalo.

El hold puede:

- comenzar exactamente al terminar la tarea;
- terminar exactamente al inicio de otra obligación;
- terminar exactamente al inicio de una pausa compatible.

No puede:

- cruzar el final de disponibilidad de una entidad;
- solaparse con tarea, comida, lock, setup, preparación o transición incompatible;
- comenzar más tarde para encontrar hueco;
- utilizar capacidad compartida no declarada.

---

## 12. REQUIRED

Una posición de tarea es hard-valid sólo si todas las entidades seleccionadas están libres durante el hold completo.

Para REQUIRED:

```text
fulfilledMinutes = duration
violationMinutes = 0
```

El candidato se rechaza antes de scoring si no puede materializar el intervalo completo.

El rechazo debe explicar:

- tarea origen;
- política;
- entidad;
- intervalo solicitado;
- conflicto o disponibilidad que lo impide.

---

## 13. PREFERRED

PREFERRED no invalida por sí mismo el plan.

Se define:

```text
entityFreeMinutes(e) = minutos continuos libres desde task.end
fulfilledMinutes = min(duration, mínimo entityFreeMinutes entre entidades seleccionadas)
violationMinutes = duration - fulfilledMinutes
```

Esto mide el tramo común realmente respetado por todas las entidades.

La penalización inicial debe ser proporcional a `violationMinutes`, con peso configurado por la política de calidad del día.

No se introducirá un peso hardcodeado dentro del generador.

Evidence registra bloqueadores por entidad, aunque la penalización temporal no duplique el mismo minuto varias veces.

Una referencia inexistente sigue siendo contrato inválido, no violación preferente.

---

## 14. Interacción con transiciones

Para cada entidad:

- si está ocupada por el hold, su siguiente transición comienza al terminar el tramo materializado;
- si no está ocupada, puede iniciar transición al terminar la tarea;
- los márgenes de transición existentes se aplican después del hold correspondiente;
- no se suman dos veces.

Ejemplo para participante ocupado:

```text
task.end + hold.duration + participantTransition <= nextTask.start
```

Ejemplo para espacio no ocupado:

```text
space queda libre en task.end
```

---

## 15. Interacción con comidas y pausas

Una pausa que ocupa una entidad entra en conflicto con el hold de esa entidad.

REQUIRED debe caber íntegramente antes de la pausa o comenzar después porque la tarea termina después; no se parte.

PREFERRED calcula cumplimiento continuo hasta el primer conflicto.

El hold no sustituye ni desplaza comidas.

Una comida global que bloquea toda producción se comporta como conflicto para todas las entidades pertinentes.

---

## 16. Interacción con recursos

### 16.1 Recursos efectivos requeridos

`occupyRequiredResources=true` ocupa exclusivamente los recursos finalmente asignados a la tarea.

No ocupa:

- todo el tipo de recurso;
- todos los recursos candidatos;
- recursos del espacio no usados por la tarea.

### 16.2 Recursos explícitos

Se añaden a la ocupación aunque no sean recursos productivos de la tarea.

Deben existir y estar disponibles en el día.

### 16.3 Recursos compuestos

La implementación debe respetar la resolución efectiva ya autoritativa de componentes y bundles.

No se inventará una segunda expansión dentro del hold.

El hold recibe la lista efectiva final que deba bloquearse.

---

## 17. Tareas protegidas y replanificación

### 17.1 Pending e interrupted

Pueden moverse; el hold se recalcula con cada candidato.

### 17.2 In progress

La tarea no se mueve.

El hold se ancla al final protegido resuelto por el helper temporal autoritativo.

Si no existe un final representable, la ruta no puede inventarlo y debe devolver un issue explícito.

### 17.3 Done

La tarea no se mueve.

Su hold histórico se conserva según la configuración/fingerprint utilizado. Si el intervalo todavía afecta al horizonte de replanificación, continúa ocupando entidades.

### 17.4 Locks

Un lock sobre la tarea o entidad puede hacer inviable el hold. No se desplaza la tarea protegida para repararlo.

### 17.5 Actualización de configuración

Una futura actualización manual del snapshot sólo afecta a tareas pendientes seleccionadas.

No modifica el contrato efectivo de tareas `in_progress` o `done`.

---

## 18. Materialización del resultado

Contrato conceptual:

```ts
interface ScheduledTaskTemporalHold {
  id: string;
  kind: "TASK_TEMPORAL_HOLD";
  policyId: string;
  sourceTaskId: string;
  severity: "REQUIRED" | "PREFERRED";
  requestedStart: Minute;
  requestedEnd: Minute;
  honoredEnd: Minute;
  configuredDuration: Minute;
  fulfilledMinutes: Minute;
  violationMinutes: Minute;
  occupiedSpaceId?: string;
  occupiedParticipantId?: string;
  occupiedResourceIds: readonly string[];
  compliance: "FULL" | "PARTIAL" | "NONE";
}
```

Para REQUIRED aceptado:

```text
honoredEnd = requestedEnd
compliance = FULL
```

Para PREFERRED, `honoredEnd` representa el tramo continuo realmente libre desde el fin de la tarea.

La identidad canónica incluye política y tarea origen. No depende de nombres.

OFF no publica entidad.

---

## 19. Validación canónica

El validador no confía en la ocupación publicada.

Debe recomputar desde:

- problema;
- tareas programadas;
- asignaciones efectivas;
- comidas;
- locks;
- preparaciones;
- transiciones;
- políticas.

Comprueba:

- identidad;
- adyacencia;
- duración configurada;
- entidades correctas;
- disponibilidad;
- solapes;
- cumplimiento REQUIRED;
- métricas PREFERRED;
- ausencia de duplicados;
- coherencia de materialización.

Cualquier diferencia entre recomputación y resultado es invalidación o error de contrato.

---

## 20. Fingerprint

El fingerprint del problema incluye todas las políticas efectivas activas y sus campos semánticos.

El fingerprint del plan incluye:

- tareas;
- holds materializados;
- cumplimiento PREFERRED;
- entidades ocupadas.

La ausencia del nuevo campo conserva fingerprints históricos cuando no existe ninguna política.

El orden de arrays no modifica el fingerprint.

---

## 21. Evidence

Métricas mínimas:

- `taskTemporalHoldPolicyCount`;
- `requiredTaskTemporalHoldPolicyCount`;
- `preferredTaskTemporalHoldPolicyCount`;
- `scheduledTaskTemporalHoldCount`;
- `requestedTaskTemporalHoldMinutes`;
- `fulfilledTaskTemporalHoldMinutes`;
- `violatedTaskTemporalHoldMinutes`;
- `taskTemporalHoldRejectedCandidateCount`;
- `taskTemporalHoldConflictCountsByEntityType`;
- `taskTemporalHoldConflictCountsByReason`;
- `protectedTaskTemporalHoldCount`;
- `selectedTaskTemporalHoldIds`;
- `taskTemporalHoldConfigurationFingerprint`.

Para cada incumplimiento PREFERRED se conserva explicación estructurada.

No se publicará una métrica de “cumplido” si la ocupación no fue validada.

---

## 22. Diagnósticos operativos

Códigos conceptuales:

- `TASK_TEMPORAL_HOLD_VERSION_UNSUPPORTED`;
- `TASK_TEMPORAL_HOLD_INVALID_DURATION`;
- `TASK_TEMPORAL_HOLD_NO_OCCUPIED_ENTITY`;
- `TASK_TEMPORAL_HOLD_MISSING_SPACE`;
- `TASK_TEMPORAL_HOLD_MISSING_PARTICIPANT`;
- `TASK_TEMPORAL_HOLD_MISSING_RESOURCE`;
- `TASK_TEMPORAL_HOLD_AVAILABILITY_CONFLICT`;
- `TASK_TEMPORAL_HOLD_TASK_CONFLICT`;
- `TASK_TEMPORAL_HOLD_BREAK_CONFLICT`;
- `TASK_TEMPORAL_HOLD_LOCK_CONFLICT`;
- `TASK_TEMPORAL_HOLD_PREPARATION_CONFLICT`;
- `TASK_TEMPORAL_HOLD_PROTECTED_END_UNKNOWN`.

Los mensajes deben incluir entidad, intervalo y acción posible.

---

## 23. UI

SPEC11-003 es la autoridad UX.

La implementación deberá ofrecer:

- editor general en plantilla;
- valor heredado en el día;
- override completo en instancia;
- restaurar heredado;
- severidad explícita;
- selección independiente de entidades;
- recursos por selector estructurado;
- preview de impacto;
- ocupación diferenciada en planning;
- detalle de cumplimiento PREFERRED.

No se añadirá un formulario antes de que persistencia y API puedan devolver el valor efectivo.

---

## 24. Compatibilidad

Para planes y tareas sin política:

```text
capacidad OFF
```

No se generan holds ni cambia el plan.

Legacy no puede inferirse desde duración, nombre, comentarios o espacio.

Una futura migración podrá crear filas OFF explícitas o conservar ausencia; deberá elegir una semántica única.

---

## 25. Estrategia de implementación futura

### Checkpoint 1 — Contrato y persistencia

- tablas generales, snapshots y overrides;
- helpers puros;
- RLS;
- fingerprints de configuración;
- sin motor.

### Checkpoint 2 — EngineInput y preflight

- resolución efectiva;
- proyección;
- diagnostics;
- validación estructural;
- ruta de planificación aún bloqueada explícitamente si no soporta holds.

### Checkpoint 3 — REQUIRED

- generación de candidatos;
- ocupación hard;
- materialización;
- validación;
- replanificación protegida.

### Checkpoint 4 — PREFERRED

- cumplimiento parcial;
- scoring configurable;
- Evidence;
- dominancia y regresión.

### Checkpoint 5 — UI y publicación productiva

- componentes SPEC11-003;
- planning;
- actualización de producto.

No mezclar varios checkpoints en una iteración.

---

## 26. Tests futuros obligatorios

### Contrato

- OFF;
- duración;
- entidades;
- recursos únicos;
- versión;
- canonicalización;
- determinismo;
- invariancia;
- input inmutable.

### Persistencia

- general;
- snapshot;
- override;
- restore inherited;
- RLS;
- legacy;
- independencia frente a cambios globales.

### REQUIRED

- sólo espacio;
- sólo participante;
- sólo recursos;
- combinación;
- disponibilidad;
- comidas;
- locks;
- transiciones;
- setup y rondas;
- rechazo antes de scoring.

### PREFERRED

- cumplimiento completo;
- parcial;
- ninguno;
- cálculo de minutos;
- peso configurable;
- explicación.

### Replanificación

- pending se mueve;
- interrupted se mueve;
- in_progress no se mueve;
- done no se mueve;
- hold protegido sigue ocupando;
- final protegido desconocido bloquea.

### Regresión

- ausencia conserva plan y fingerprints;
- no cambia recursos efectivos;
- no cambia Totales;
- no cambia setup;
- no cambia joint groups;
- no cambia operaciones ancladas;
- no modifica SPEC10-021.

---

## 27. Criterios de aceptación documental

SPEC11-004 queda completa cuando:

- representa cualquier tarea sin nombres especiales;
- separa duración productiva y ocupación;
- distingue hold, setup, transición y operación técnica;
- define configuración general, snapshot y override;
- resuelve espacio, participante y recursos independientemente;
- define REQUIRED y PREFERRED sin ambigüedad;
- conserva tareas protegidas;
- define materialización, validación y Evidence;
- conserva compatibilidad OFF;
- mantiene Totales como preparación entre rondas;
- divide implementación futura en checkpoints verificables.

---

## 28. Siguiente decisión

Mientras no exista capacidad fiable de ejecutar y probar código, no debe comenzar el checkpoint de persistencia.

El siguiente trabajo documental de mayor valor será definir el contrato productivo de `SpaceCoordinationPolicy`, separando:

- coordinación REQUIRED;
- coordinación PREFERRED;
- elegibilidad;
- emparejamiento ordinal dinámico;
- persistencia general y diaria;
- búsqueda;
- validación;
- Evidence;
- relación con Totales sin convertir todas las coordinaciones en rondas exactas.
