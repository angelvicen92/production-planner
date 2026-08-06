# SPEC11-012 — Clasificación productiva de tareas para planificación

**Estado:** contrato productivo documental  
**Clasificación futura de implementación:** DB Safe Merge  
**Depende de:** SPEC11-002 — snapshot efectivo de plantillas  
**No activa:** Planner Next en producto  
**Ámbito:** plantilla general → snapshot diario → override de tarea → EngineInput → preflight → Planner Next → Evidence

---

## 1. Objetivo

Dotar a cada tarea planificable de una clasificación explícita y reproducible compatible con el contrato actual de Planner Next:

```text
MAIN
VOCAL
AUXILIARY
TECHNICAL
UNCLASSIFIED
```

La clasificación no se deduce mediante:

- nombre de tarea;
- plantilla;
- espacio;
- recurso requerido;
- presencia de coach;
- participante ausente;
- IDs conocidos;
- escenario o benchmark.

---

## 2. Problema actual

Planner Next exige:

```ts
kind: "main" | "vocal" | "auxiliary" | "technical"
```

Sin embargo, el flujo productivo actual no materializa de forma general `plannerNextKind` desde DB y UI.

Esto produce una frontera incompleta:

- el motor conoce la semántica;
- fixtures y benchmarks pueden rellenarla;
- el día productivo no tiene fuente autoritativa;
- `buildEngineInput` no puede proyectarla sin inferir;
- activar Planner Next obligaría a adivinar o rechazar.

La opción correcta es configuración efectiva.

---

## 3. Principio de ausencia

La ausencia histórica equivale a:

```text
UNCLASSIFIED
```

No equivale a:

```text
AUXILIARY
```

Motivo:

Asignar `AUXILIARY` por defecto cambiaría:

- fase de búsqueda;
- continuidad;
- recursos;
- dependencias;
- pairing;
- métricas;
- viabilidad.

La ruta legacy puede continuar sin esta clasificación si no la necesita.

Una ruta que afirme soporte productivo de Planner Next deberá rechazar tareas planificables `UNCLASSIFIED`.

---

## 4. Contrato V1

```ts
export type TaskPlanningKindV1 =
  | "MAIN"
  | "VOCAL"
  | "AUXILIARY"
  | "TECHNICAL"
  | "UNCLASSIFIED";
```

```ts
interface EffectiveTaskPlanningClassificationV1 {
  readonly contractVersion: 1;
  readonly taskId: number;
  readonly kind: TaskPlanningKindV1;
  readonly source:
    | "TEMPLATE_SNAPSHOT"
    | "DAILY_TASK_OVERRIDE"
    | "LEGACY_UNCLASSIFIED";
}
```

La clasificación no contiene recursos, espacio, participante, setup o dependencias.

Esas capacidades mantienen contratos separados.

---

## 5. Semántica MAIN

Una tarea MAIN:

- requiere participante efectivo;
- pertenece al flujo principal;
- debe ser compatible con el espacio principal configurado;
- participa en continuidad REQUIRED del flujo principal;
- puede utilizar coach y blockKey según el contrato efectivo;
- conserva dependencias y recursos propios;
- no se convierte en tarea conjunta por su kind;
- no adquiere setup automáticamente.

Preflight deberá rechazar:

- participante ausente;
- espacio distinto del main flow sin representación oficial;
- identidad de coach requerida ausente;
- contrato incompleto de blockKey cuando sea obligatorio;
- tarea técnica clasificada como MAIN.

La clasificación no elige la zona principal.

La zona principal procede del snapshot del optimizador.

---

## 6. Semántica VOCAL

Una tarea VOCAL:

- requiere participante;
- representa un feeder vocal compatible con la arquitectura actual;
- utiliza el coach efectivo cuando el contrato lo exige;
- conserva espacio, duración, dependencias y recursos;
- no pertenece al flujo principal por defecto;
- puede condicionar el inicio de una tarea MAIN mediante dependencia;
- no se identifica porque su nombre contenga vocal, coach o ensayo.

Preflight rechazará:

- participante ausente;
- coach requerido ausente;
- resource projection incompatible;
- clasificación técnica contradictoria.

---

## 7. Semántica AUXILIARY

Una tarea AUXILIARY:

- requiere participante;
- no pertenece al flujo MAIN ni VOCAL;
- puede participar en:
  - setup;
  - joint groups;
  - operaciones ancladas;
  - unidades itinerantes;
  - dependencias;
  - recursos;
- no adquiere ninguna de esas capacidades sólo por ser AUXILIARY.

`AUXILIARY` no significa:

- baja prioridad;
- opcional;
- relleno;
- sin recursos;
- sin dependencia;
- modificable si está done/in_progress.

Puede ser un cuello de botella estructural.

---

## 8. Semántica TECHNICAL

Una tarea TECHNICAL:

- no tiene participante;
- no tiene coach;
- no tiene blockKey de participante;
- no utiliza jointGroupId de tareas de participante;
- no utiliza setupFamilyId en el contrato actual de Planner Next;
- conserva espacio, duración, dependencias, recursos y disponibilidad;
- puede formar cadenas técnicas mediante dependencias.

Preflight rechazará:

- participantId presente;
- coachId presente;
- blockKey presente;
- jointGroupId presente;
- setupFamilyId presente;
- clasificación técnica aplicada para evitar una obligación de participante real.

La ausencia de participante no convierte automáticamente una tarea en TECHNICAL.

---

## 9. UNCLASSIFIED

`UNCLASSIFIED` es un estado explícito de migración o configuración incompleta.

Permite:

- conservar días legacy;
- mostrar tareas pendientes de clasificación;
- no inventar semántica;
- impedir activación falsa de Planner Next.

No permite:

- enviar la tarea a Planner Next;
- ocultarla;
- cancelarla;
- asignarla a auxiliar;
- inferir por nombre;
- eliminarla del recuento de representabilidad.

Reason code objetivo:

```text
MISSING_TASK_PLANNING_CLASSIFICATION
```

---

## 10. Configuración general

La plantilla global incorporará un campo equivalente a:

```text
planner_kind
```

Valores:

- main;
- vocal;
- auxiliary;
- technical;
- null/unclassified para compatibilidad.

La UI deberá:

- mostrar explicación de cada kind;
- validar contradicciones visibles;
- no activar Planner Next;
- indicar que el cambio afecta planes futuros;
- no modificar días existentes.

---

## 11. Snapshot diario

SPEC11-002 deberá incorporar al snapshot de plantilla:

```text
planner_kind
```

El valor se copia al crear el plan.

Después:

- editar la plantilla global no cambia el día;
- tareas nuevas usan el snapshot diario;
- `buildInput` no consulta el global;
- la clasificación participa en fingerprint.

El backfill legacy conserva `UNCLASSIFIED` salvo que exista una fuente estructurada inequívoca.

No se infiere desde nombres o espacios durante la migración.

---

## 12. Override de tarea

Una tarea diaria podrá almacenar:

```text
planner_kind_override
```

Precedencia:

```text
estado protegido y locks
        > override diario
        > snapshot de plantilla
        > legacy unclassified
```

El override:

- es explícito;
- registra autor y timestamp;
- puede restaurarse;
- participa en fingerprint operativo/configuración según modelo final;
- no modifica la plantilla ni otras tareas;
- no se aplica a done/in_progress mediante una edición ordinaria.

---

## 13. Clasificación y estados protegidos

### done

No se reclasifica en una operación normal.

Su clasificación efectiva utilizada por el run anterior permanece auditable.

### in_progress

No se reclasifica.

### pending e interrupted

Pueden recibir override si:

- no existe lock incompatible;
- la configuración resultante es válida;
- no se modifica una operación REQUIRED de forma parcial;
- la acción queda auditada.

---

## 14. Persistencia objetivo

### task_templates

Campo general:

```text
planner_kind
```

### plan_task_template_snapshots

Campo diario:

```text
planner_kind
```

### daily_tasks

Override nullable:

```text
planner_kind_override
```

Constraints:

- enum conocido;
- technical incompatible con requisitos estructurales de participante cuando puedan validarse en DB;
- override nullable;
- snapshot versionado;
- no cascade destructivo desde plantilla global.

La validación completa permanece server-side.

---

## 15. Resolución efectiva

Helper único:

```ts
resolveEffectiveTaskPlanningClassification({
  task,
  templateSnapshot,
}): EffectiveTaskPlanningClassificationV1
```

Requisitos:

- puro;
- determinista;
- no muta input;
- output readonly/frozen;
- valida versión;
- no consulta DB;
- no usa nombres;
- devuelve origen;
- diferencia ausencia de valor inválido.

---

## 16. buildEngineInput

`buildEngineInput` proyectará:

```ts
plannerNextKind?: "main" | "vocal" | "auxiliary" | "technical"
```

sólo desde la clasificación efectiva.

Reglas:

- no inferir;
- no default auxiliary;
- conservar `UNCLASSIFIED` como ausencia explícita diagnosticable;
- no excluir tareas;
- incluir source/fingerprint en metadata;
- no llamar al catálogo global.

La presencia de tareas unclassified no tiene por qué bloquear motores legacy.

Sí bloquea una ruta Planner Next que requiera representabilidad completa.

---

## 17. Preflight de EngineInput

Debe comprobar:

- kind conocido;
- todas las tareas activas que entran en Planner Next están clasificadas;
- MAIN/VOCAL/AUXILIARY tienen participante;
- TECHNICAL no tiene participante;
- coach compatible;
- main space compatible;
- campos prohibidos por kind;
- estados protegidos completos;
- override contradictorio;
- duplicados y versiones.

No producirá un problema parcial.

---

## 18. Adaptador

El adaptador mapeará directamente:

```text
MAIN      → main
VOCAL     → vocal
AUXILIARY → auxiliary
TECHNICAL → technical
```

No mapeará `UNCLASSIFIED`.

Mantendrá:

- identidad reversible;
- recursos;
- dependencias;
- disponibilidad;
- espacio;
- itinerant unit;
- overrides efectivos.

La clasificación no decide el placement.

---

## 19. Interacción con recursos

Kind y recursos son ortogonales.

Ejemplos:

- AUXILIARY puede requerir coach si el dominio lo permite y el contrato lo representa;
- TECHNICAL puede requerir recursos genéricos;
- MAIN no obtiene coach por nombre;
- VOCAL no selecciona coach arbitrario;
- recursos faltantes continúan siendo hard input.

El preflight de recursos conserva autoridad.

---

## 20. Interacción con operaciones tipadas

### Setup

Sólo tareas compatibles con el contrato actual pueden recibir setupFamilyId.

### Joint groups

Sólo tareas de participante compatibles.

### Anchored operations

La clasificación de cada segmento se conserva.

### Rondas sincronizadas

La política efectiva define membresía; el kind no crea sincronización.

### Holds

Pueden aplicarse a cualquier kind representable según su contrato.

### Coordinación PREFERRED

La elegibilidad es explícita; no se deriva del kind.

---

## 21. UI del día

La tarea mostrará:

```text
Rol de planificación
```

Con:

- valor heredado;
- valor efectivo;
- origen;
- explicación;
- compatibilidades;
- restaurar heredado;
- indicador unclassified;
- impacto sobre representabilidad;
- protección done/in_progress.

No se mostrará como prioridad.

---

## 22. Auditoría y Evidence

Evidence mínima:

- contract version;
- counts por kind;
- task IDs por kind;
- unclassified IDs;
- source por task;
- override count;
- protected classification count;
- configuration fingerprint;
- representability result;
- reason codes.

No es necesario repetir nombres visibles.

---

## 23. Fingerprint

Incluye:

- versión;
- task ID;
- kind efectivo;
- source cuando sea semántico;
- override.

Invertir el orden de tareas no cambia el fingerprint compuesto.

Cambiar kind sí lo cambia.

---

## 24. Compatibilidad productiva

### Motores legacy

Pueden continuar sin consumir kind mientras no afirmen Planner Next.

### Planner Next

Sólo se activa cuando:

- todas las tareas relevantes están clasificadas;
- los contratos restantes son representables;
- preflight completo pasa;
- no hay fallback silencioso.

### Días legacy

Se muestran como unclassified y requieren revisión antes de activar Planner Next.

No se modifica automáticamente el planning existente.

---

## 25. Tests obligatorios

### Resolvedor

- herencia;
- override;
- restore;
- unclassified;
- versión desconocida;
- input inmutable;
- output frozen.

### Contradicciones

- main sin participante;
- vocal sin participante;
- auxiliary sin participante;
- technical con participante;
- technical con coach;
- technical con joint/setup;
- main fuera de main flow;
- kind inválido.

### Snapshot

- cambio global no cambia día;
- tarea nueva usa snapshot;
- override sólo cambia tarea;
- backfill no infiere nombres.

### buildInput

- no consulta global;
- proyecta kind exacto;
- unclassified conservado;
- motores legacy no bloqueados;
- metadata determinista.

### Adapter

- mapping exacto;
- no mapping unclassified;
- identidades reversibles;
- orden invariante.

### Regresión

- tareas protegidas intactas;
- recursos intactos;
- setup/joint/anchored intactos;
- SPEC10-021 intacta;
- Focal A2 determinista.

---

## 26. Fases futuras

### Checkpoint 1

Contrato, helper y tests puros.

### Checkpoint 2

DB general, snapshot y override.

### Checkpoint 3

UI y origen.

### Checkpoint 4

buildInput y preflight.

### Checkpoint 5

Evidence y activación opt-in de representabilidad.

No se mezclará con búsqueda exacta.

---

## 27. Qué no hacer

- no inferir por nombre;
- no usar espacio como clasificación;
- no usar participante ausente para technical;
- no default auxiliary;
- no reclasificar protegidas;
- no mezclar recursos dentro del kind;
- no convertir kind en prioridad;
- no activar Planner Next sólo porque exista el campo;
- no tocar SPEC10-021.

---

## 28. Criterios de aceptación

SPEC11-012 queda documentalmente completa cuando:

- define cinco estados explícitos;
- conserva unclassified;
- define semántica de cada kind;
- define general, snapshot y override;
- protege estados;
- define resolvedor;
- define buildInput y preflight;
- separa recursos y operaciones;
- define UI, fingerprint y Evidence;
- mantiene motores legacy;
- divide implementación en checkpoints;
- no afirma activación productiva.

---

## 29. Regla final

> Clasificar no es priorizar.  
> Clasificar no es inferir.  
> El rol explica qué contrato utiliza el planificador.  
> La tarea conserva sus recursos, dependencias y realidad.  
> Lo desconocido permanece desconocido hasta una decisión explícita.