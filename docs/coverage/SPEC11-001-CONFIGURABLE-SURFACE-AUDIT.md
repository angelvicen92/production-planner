# SPEC11-001 — Auditoría de superficie configurable

**Clasificación:** Fast Merge documental  
**Baseline auditado:** `main@3ac6b3c3ca0cb0b4ae12a9f87a4cb952e3e4cfaf`  
**Fuente normativa:** SPEC-11 — Configuración Operativa Efectiva, Ocupaciones Derivadas y Coordinación entre Espacios  
**Ámbito:** DB → API → UI → `buildInput` → `EngineInput` → adaptador → Planner Next → validación → Evidence

---

## 1. Objetivo

Esta auditoría identifica qué configuración operativa de OptiPlan:

- existe de forma estructurada;
- posee configuración general;
- queda congelada en un snapshot diario;
- admite override de instancia;
- llega realmente a `EngineInput`;
- puede adaptarse sin pérdida a Planner Next;
- participa en búsqueda y validación;
- deja Evidence reproducible;
- depende todavía de defaults, nombres, JSON opaco o contratos sólo disponibles en fixtures.

No implementa nuevas capacidades.

No modifica:

- DB ni migraciones;
- RLS;
- UI;
- contratos de motor;
- búsqueda exacta;
- SPEC10-021;
- publicación productiva.

---

## 2. Leyenda

| Estado | Significado |
|---|---|
| `COMPLETE` | La capacidad recorre las capas necesarias con semántica efectiva, reproducible y validada. |
| `PARTIAL` | Existe en varias capas, pero pierde origen, snapshot, override, severidad o publicación. |
| `ABSENT` | No existe un contrato operativo estructurado en esa capa. |
| `UNSAFE` | Existe un comportamiento que puede cambiar silenciosamente el día, ocultar una pérdida o depender de inferencia nominal. |
| `N/A` | La capa no corresponde a esa capacidad. |

Un estado `COMPLETE` en una capa no convierte la capacidad completa de extremo a extremo.

---

## 3. Resultado ejecutivo

El repositorio ya contiene una base importante de configuración y snapshots, pero la cobertura es desigual.

### Capacidades mejor cubiertas

- jornada del plan;
- disponibilidad diaria de zonas y espacios;
- disponibilidad diaria de recursos concretos;
- disponibilidad diaria de concursantes;
- asignaciones efectivas de recursos a tarea, espacio y zona;
- comidas y pausas en varias entidades;
- adaptación determinista de un `EngineInput` enriquecido a Planner Next;
- contratos exactos focalizados para setup, operaciones conjuntas, operaciones ancladas y transiciones de coach.

### Defecto estructural principal

La configuración operativa de las plantillas de tarea y la configuración del optimizador no tienen un snapshot diario autoritativo completo.

`buildEngineInput` consulta en cada ejecución:

- `storage.getTaskTemplates()`;
- `storage.getOptimizerSettings()`.

Por ello, modificar una plantilla o el optimizador global puede alterar silenciosamente cómo se interpreta o planifica un día ya creado.

Esto contradice la precedencia oficial:

```text
snapshot del día > configuración general
```

También impide añadir correctamente `TaskTemporalHoldPolicy`: guardar el hold sólo en la plantilla global haría que días históricos adoptasen cambios posteriores.

### Conclusión de rumbo

Antes del primer contrato productivo de hold debe existir una base de **configuración efectiva de tarea congelada por día**.

No es necesario snapshotear datos puramente visuales que no afectan a la planificación. Sí deben congelarse todos los campos que alteran:

- viabilidad;
- ocupación;
- recursos;
- dependencias;
- duración;
- ubicación;
- clasificación;
- orden o agrupación;
- severidad;
- búsqueda;
- validación;
- explicación.

---

## 4. Mapa de capas actual

### 4.1 Persistencia

| Área | General | Snapshot diario | Override de instancia | Estado |
|---|---:|---:|---:|---|
| Jornada | `program_settings` | `plans` | plan | `COMPLETE` |
| Disponibilidad de zona | `zones` | `plan_zone_settings` | día | `COMPLETE` |
| Disponibilidad de espacio | `spaces` | `plan_space_settings` | día | `COMPLETE` |
| Disponibilidad de recurso | `resource_items` | `plan_resource_items` | día | `COMPLETE` |
| Disponibilidad de concursante | — | `contestants` del plan | día | `PARTIAL` |
| Plantilla de tarea | `task_templates` | referencia por `template_id` | duración, cámaras y ubicación parciales en `daily_tasks` | `UNSAFE` |
| Optimización | `optimizer_settings` | no existe snapshot equivalente | no | `UNSAFE` |
| Recursos efectivos | defaults globales y catálogos | asignaciones del plan | tarea/espacio/zona | `PARTIAL` |
| Locks | — | `locks` | decisión humana | `PARTIAL` |
| Comidas/pausas | programa, zona y plan | `plans`, `plan_breaks` y contratos derivados | varios ámbitos | `PARTIAL` |
| Setup tipado de Planner Next | no productivo completo | no productivo completo | no | `ABSENT` |
| Operación conjunta tipada | no productivo completo | no productivo completo | no | `ABSENT` |
| Operación anclada tipada | no productivo completo | no productivo completo | no | `ABSENT` |
| Transición direccional de coach | no productivo completo | no productivo completo | no | `ABSENT` |
| Rondas sincronizadas | no productivo completo | no productivo completo | no | `ABSENT` |
| Hold posterior | no | no | no | `ABSENT` |
| Coordinación genérica de espacios | no | no | no | `ABSENT` |
| Versión efectiva de configuración | parcial por `source` en algunos snapshots | no existe versión común | no | `ABSENT` |

### 4.2 Flujo productivo observado

```text
DB global y del plan
        ↓
server/storage.ts
        ↓
engine/buildInput.ts
        ↓
EngineInput legacy/enriquecido parcialmente
        ↓
rutas V3/V4/ORC existentes
```

Planner Next posee una integración explícita distinta:

```text
EngineInput enriquecido
        ↓ preflight
adaptEngineInputToPlannerNextProblem
        ↓
executePlannerNext
        ↓
validación y Evidence focal
```

Sin embargo, el `EngineInput` producido actualmente por `buildEngineInput` no materializa el contrato `plannerNext` ni los contratos exactos recientes. El propio tipo declara que `plannerNext` todavía no es poblado por las rutas productivas actuales.

---

## 5. Matriz de cobertura por capacidad

### 5.1 Configuración base

| Capacidad | DB | API | UI | buildInput | EngineInput | Adapter | Planner Next | Validation | Evidence | Global → snapshot → override | Estado E2E |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Jornada | sí | sí | sí | sí | sí | sí | sí | sí | parcial | sí | `PARTIAL` |
| Disponibilidad zona | sí | sí | sí | sí | sí | sí | sí | sí | parcial | sí | `PARTIAL` |
| Disponibilidad espacio | sí | sí | sí | sí | sí | sí | sí | sí | sí en SPEC10-009 | sí | `COMPLETE` |
| Disponibilidad recurso | sí | sí | sí | sí | sí | sí | sí | sí | sí en SPEC10-006/014 | sí | `COMPLETE` |
| Disponibilidad concursante | plan | sí | sí | sí | sí | sí | sí | sí | parcial | sólo día | `PARTIAL` |
| Capacidad de espacio | catálogo/legacy | parcial | limitada | sí con fallback | sí | preflight | sí | sí | parcial | no trazada | `PARTIAL` |
| Asignación recurso a tarea | relaciones productivas | sí | sí | sí | sí | sí | sí | sí | sí | día/instancia | `COMPLETE` funcional |
| Asignación recurso a espacio | defaults + plan | sí | sí | sí | sí | sí | sí | sí | sí | parcial | `PARTIAL` |
| Asignación recurso a zona | defaults + plan | sí | sí | sí | sí | sí | sí | sí | sí | parcial | `PARTIAL` |
| Requisitos genéricos de recurso | JSON/relaciones | sí | sí | normaliza | sí | sólo representables | parcial | parcial | parcial | sin versión común | `PARTIAL` |

### 5.2 Configuración de tareas

| Capacidad | General | Snapshot diario | Override de instancia | UI | EngineInput productivo | Planner Next | Estado |
|---|---:|---:|---:|---:|---:|---:|---|
| Duración | sí | sólo referencia a plantilla | sí | sí | sí | sí | `UNSAFE` por lectura global |
| Cámaras | sí | sólo referencia | sí | sí | sí | no representadas como contrato exacto genérico | `PARTIAL` |
| Ubicación | sí | no congelada como semántica de plantilla | sí | parcial | sí | sí si representable | `UNSAFE` |
| Dependencias | sí | no congeladas | no estructurado por instancia | sí general | se reconstruyen desde plantilla global | sí | `UNSAFE` |
| Clasificación `main/vocal/auxiliary/technical` | no productiva normalizada | no | no | no | campo opcional no poblado por `buildInput` | obligatoria | `ABSENT` productivo |
| Recursos de plantilla | JSON | no congelados | asignaciones directas aparte | sí | se leen de plantilla global | parcial | `UNSAFE` |
| Setup/familia | parcial/JSON/contratos focales | no | no | parcial | contrato no poblado productivamente | sí en exact route | `PARTIAL` no productivo |
| Joint group | contrato focal | no | no | no | no poblado productivamente | sí | `PARTIAL` no productivo |
| Operación anclada | contrato focal | no | no | no | no poblado productivamente | sí | `PARTIAL` no productivo |
| Operación técnica sin concursante | modelo parcial | no efectivo tipado | parcial | limitada | clasificación ausente | sí si llega tipada | `PARTIAL` |
| Hold posterior | no | no | no | no | no | no | `ABSENT` |
| Origen/severidad del valor | no común | no | no | no | no | no | `ABSENT` |

### 5.3 Configuración de búsqueda y calidad

| Capacidad | General | Snapshot del día | EngineInput productivo | Planner Next | Evidence | Estado |
|---|---:|---:|---:|---:|---:|---|
| Política de búsqueda | contrato de tipo | no | no poblada | sí | sí focal | `ABSENT` productivo |
| Presupuesto exacto | contrato de tipo | no | no poblado | sí | sí focal | `ABSENT` productivo |
| Rejilla temporal | contrato de tipo | no | no poblada | sí | parcial | `ABSENT` productivo |
| Transición participante | contrato de tipo | no | no poblada | sí | parcial | `ABSENT` productivo |
| Transición recurso | contrato de tipo | no | no poblada | sí | parcial | `ABSENT` productivo |
| Transición direccional coach | contrato focal | no | no poblada | sí | sí focal | `PARTIAL` no productivo |
| Flujo principal | optimizer global y contrato focal | no | legacy global | sí | sí focal | `UNSAFE` |
| Pesos de calidad | optimizer global | no | sí para motores legacy | no equivalencia completa | diagnósticos legacy | `UNSAFE` |
| Agrupación/transporte | optimizer global, nombres y valores | no | sí legacy | no equivalencia completa | parcial | `UNSAFE` |
| Coordinación PREFERRED de espacios | no | no | no | no | no | `ABSENT` |

### 5.4 Capacidades exactas recientes

| Capacidad | Contrato EngineInput | Preflight | Adaptador | Exact search | Validación | Fingerprint/Evidence | Persistencia/UI productiva | Estado |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Operaciones conjuntas | sí | sí | sí | sí | sí | sí | no | `PARTIAL` |
| Setup explícito | sí | sí | sí | sí | sí | sí | no | `PARTIAL` |
| Orden setup flexible | sí | sí | sí | sí | sí | sí | no | `PARTIAL` |
| Transición coach origen→destino | sí | sí | sí | sí | sí | sí | no | `PARTIAL` |
| Operaciones ancladas | sí | sí | sí | sí | sí | sí | no | `PARTIAL` |
| Rondas sincronizadas | WIP en rama SPEC10-021 | WIP | WIP | todavía bloqueada | WIP | parcial | no | `PARTIAL/WIP` |
| Hold posterior | no | no | no | no | no | no | no | `ABSENT` |
| Coordinación genérica PREFERRED | no | no | no | no | no | no | no | `ABSENT` |

---

## 6. Puntos exactos de pérdida o riesgo

### CFS-001 — Plantillas globales reinterpretan días existentes

**Severidad:** P0  
**Estado:** `UNSAFE`

`daily_tasks` conserva `template_id`, pero no un snapshot tipado de los campos operativos efectivos de la plantilla.

En cada ejecución, `buildEngineInput` vuelve a consultar `getTaskTemplates()` y reconstruye desde el catálogo actual:

- duración por defecto;
- dependencias;
- requisitos de recursos;
- equipo itinerante;
- reglas auxiliares contenidas en `rulesJson`;
- ubicación fallback;
- metadatos utilizados por motores.

**Consecuencia:** editar una plantilla general puede cambiar silenciosamente un día ya creado.

**Decisión:** crear una configuración efectiva de tarea por día antes de añadir nuevas políticas de plantilla.

### CFS-002 — Optimizador global sin snapshot de jornada

**Severidad:** P0  
**Estado:** `UNSAFE`

`buildEngineInput` consulta `getOptimizerSettings()` durante cada ejecución.

Afecta, entre otros, a:

- flujo principal;
- pesos;
- agrupación;
- continuidad;
- transporte;
- nombres de plantillas IN/OUT;
- límites y defaults legacy.

**Consecuencia:** un cambio global puede modificar un plan existente sin comparación ni actualización explícita.

**Decisión:** la futura integración productiva de Planner Next debe consumir configuración diaria versionada. No debe leer el optimizador global durante la ejecución.

### CFS-003 — Contrato Planner Next no poblado productivamente

**Severidad:** P0  
**Estado:** `ABSENT`

`EngineInput.plannerNext` contiene un contrato tipado, pero se declara expresamente no poblado por las rutas productivas actuales.

También faltan en `buildEngineInput` los contratos productivos de:

- operaciones ancladas;
- setup policies;
- joint groups;
- transiciones direccionales de coach;
- rondas sincronizadas.

**Consecuencia:** la Evidence focal demuestra representabilidad del adaptador y del motor, no activación productiva de extremo a extremo.

### CFS-004 — Errores de carga degradados a colecciones vacías

**Severidad:** P0  
**Estado:** `UNSAFE`

El helper `safe()` de `buildEngineInput` sustituye algunos errores de almacenamiento por fallbacks como:

- `{}` para asignaciones de recursos de zona o espacio;
- `{}` para requisitos de tipos;
- `[]` para recursos del plan;
- catálogos vacíos para señales complementarias.

Para información que pueda ser hard, una carga fallida no es equivalente a ausencia configurada.

**Consecuencia:** el motor puede recibir menos restricciones que las persistidas.

**Decisión:** clasificar cada fuente como `REQUIRED_INPUT` o `OPTIONAL_SIGNAL`. Sólo las señales verdaderamente soft pueden degradarse a neutral con warning.

### CFS-005 — Inferencias nominales y defaults semánticos

**Severidad:** P0/P1  
**Estado:** `UNSAFE`

Se han localizado dependencias de nombres o textos visibles:

| Lugar | Inferencia/default | Riesgo |
|---|---|---|
| `engine/buildInput.ts` | espacio llamado `transporte` | relación física inferida por nombre |
| `engine/buildInput.ts` | zona llamada `otros` | fallback de ubicación inferido por nombre |
| `engine/buildInput.ts` | nombres configurados de plantillas IN/OUT | identidad operativa no basada exclusivamente en ID |
| `engine/buildInput.ts` | plantilla de comida por nombre | clasificación inferida si falta ID |
| `engine/buildInput.ts` | default `Comer` | semántica de dominio embebida en código |
| `client/src/pages/settings.tsx` | tipo Vocal Coach por código y, como fallback, texto que contiene `coach` | tipo de recurso inferido nominalmente |

Los nombres pueden mantenerse para presentación, pero no deben decidir semántica operativa.

### CFS-006 — Defaults de ejecución no trazados

**Severidad:** P1  
**Estado:** `PARTIAL/UNSAFE`

Ejemplos observados:

- duración de tarea fallback: 30 minutos;
- duración de bloqueo manual fallback: 15 minutos;
- comida de concursante: 75 minutos;
- máximo simultáneo de comidas: 10;
- duración de break fallback: 75;
- máximos y mínimos de agrupación con valores de código.

Algunos coinciden con defaults de DB, pero el resultado no conserva de forma uniforme:

- origen;
- versión;
- si fue heredado;
- si fue fallback de emergencia;
- si fue override.

Un fallback técnico no debe aparecer como configuración válida sin Evidence.

### CFS-007 — JSON opaco en configuración de tareas

**Severidad:** P1  
**Estado:** `UNSAFE`

`task_templates.rules_json` y `resource_requirements` utilizan tipos amplios.

La UI conserva y combina propiedades internas, por ejemplo IDs de equipos itinerantes permitidos.

**Consecuencia:** una nueva capacidad podría añadirse dentro del JSON sin:

- migración estructurada;
- contrato estable;
- validación de DB;
- snapshot;
- versionado;
- RLS específico;
- trazabilidad de origen.

**Decisión:** no introducir `TaskTemporalHoldPolicy` dentro de `rulesJson`.

### CFS-008 — Overrides de instancia incompletos

**Severidad:** P1  
**Estado:** `PARTIAL`

El editor de creación de una tarea diaria expone principalmente:

- plantilla;
- concursante;
- duración;
- cámaras;
- comentarios.

No expone de forma unificada:

- valor heredado frente a override;
- origen del valor;
- dependencias efectivas;
- recursos efectivos;
- rol de Planner Next;
- setup;
- severidad;
- hold posterior;
- coordinación.

### CFS-009 — Trazabilidad fragmentada

**Severidad:** P1  
**Estado:** `PARTIAL`

`plan_zone_settings`, `plan_space_settings` y `plan_resource_items` poseen `source` en distintos grados, pero no existe un contrato común para:

- versión de configuración del día;
- autor del override;
- instante de modificación;
- valor heredado;
- valor efectivo;
- planificaciones que consumieron esa versión.

### CFS-010 — Evidence de capacidades, no de configuración efectiva completa

**Severidad:** P1  
**Estado:** `PARTIAL`

Las Evidence recientes demuestran muy bien capacidades aisladas de Planner Next.

Todavía no existe una Evidence productiva que pruebe simultáneamente:

```text
DB efectiva
→ snapshot
→ override
→ EngineInput
→ PlannerNextProblem
→ plan publicado
```

con igualdad de fingerprints de configuración y sin consultas posteriores al catálogo general.

### CFS-011 — Locks con representación productiva incompleta

**Severidad:** P1  
**Estado:** `PARTIAL`

El esquema admite locks de tiempo, espacio, recurso y completos. La extracción inspeccionada de `buildInput` construye el mapa fijo principalmente para locks de tiempo y completos, mientras otros campos viajan por la colección general de locks.

La integración productiva de Planner Next deberá demostrar que cada tipo se representa sin pérdida antes de activar replanificación.

### CFS-012 — Capacidad de espacios no claramente gobernada por snapshot

**Severidad:** P2  
**Estado:** `PARTIAL`

`buildInput` intenta leer distintos aliases de capacidad del catálogo de espacios y aplica exclusividad por defecto.

No se observó un snapshot diario tipado y trazable de capacidad equivalente a las disponibilidades espaciales.

---

## 7. Registro permanente de superficie configurable

A partir de SPEC11-001, toda capacidad nueva deberá añadir o actualizar una fila con este contrato mínimo:

| Campo | Contenido obligatorio |
|---|---|
| `capabilityId` | identidad estable, por ejemplo `TASK_TEMPORAL_HOLD_AFTER` |
| Propietario | plan, tarea, plantilla, espacio, zona, participante, recurso o unidad |
| Semántica | definición operativa inequívoca |
| Unidad | minutos, cantidad, enum, booleano, lista o relación |
| Severidad | REQUIRED, PREFERRED, OFF o N/A |
| General | tabla/campo/relación autoritativa |
| Snapshot | copia efectiva del día |
| Override | nivel y precedencia |
| API | lectura y mutación tipadas |
| UI | editor, valor heredado y origen |
| EngineInput | campo efectivo y reversible |
| Preflight | errores y contradicciones rechazadas |
| Motor | placement, búsqueda, scoring o N/A |
| Validación | autoridad canónica |
| Publicación | entidad o campo resultante |
| Fingerprint | datos semánticos incluidos |
| Evidence | valor efectivo, impacto y cumplimiento |
| Compatibilidad | semántica de ausencia |
| Replanificación | efecto sobre `done`, `in_progress`, locks y pending |
| Tests | determinismo, invariancia, inmutabilidad y negativos |

Una capacidad permanece `PARTIAL` mientras falte una capa material.

---

## 8. Contrato documental objetivo para el hold posterior

Esta auditoría ratifica el contrato de SPEC-11 sin implementarlo todavía:

```ts
interface TaskTemporalHoldPolicy {
  id: string;
  phase: "AFTER_TASK";
  durationMinutes: number;
  severity: "REQUIRED" | "PREFERRED" | "OFF";
  occupies: {
    space: boolean;
    participant: boolean;
    requiredResources: boolean;
    explicitResourceIds?: string[];
  };
  adjacency: "IMMEDIATE";
}
```

La persistencia futura deberá separar:

1. definición general asociada a plantilla;
2. copia efectiva del día;
3. override de la instancia;
4. ocupación materializada del resultado.

No se almacenará en `rulesJson`.

No se sumará a `durationOverride`.

No reemplazará:

- setup de siguiente familia;
- preparación de siguiente ronda;
- transición entre espacios;
- operación técnica explícita.

---

## 9. Deuda priorizada

### P0 — Bloquea la configuración efectiva fiable

1. Snapshot diario tipado de configuración operativa de tarea.
2. Snapshot diario versionado de configuración de Planner Next/optimizador.
3. Clasificación de entradas hard frente a señales opcionales; eliminar degradación silenciosa.
4. Sustituir inferencias nominales por IDs y relaciones estructuradas.
5. Conectar productivamente `plannerNext` sólo después de representar todos los contratos requeridos sin pérdida.

### P1 — Necesario para nuevas capacidades

1. Origen, versión, autor y timestamp comunes para configuración efectiva.
2. Overrides de instancia visibles y restaurables.
3. Sustitución progresiva de JSON opaco por contratos tipados.
4. Cobertura productiva DB/UI para capacidades ya demostradas en Planner Next.
5. Evidence de cadena completa desde snapshot hasta publicación.

### P2 — Consolidación

1. Snapshot diario de capacidad y demás propiedades operativas de espacio.
2. Limpieza de campos legacy duplicados y aliases defensivos.
3. Separación visual entre configuración operativa y metadata.
4. Homogeneización de nombres, idioma y ayudas de UI.

### P3 — Evolución posterior

1. `TaskTemporalHoldPolicy` en motor y publicación.
2. Coordinación `PREFERRED` genérica entre espacios.
3. Unificación controlada de helpers sin fusionar semánticas distintas.

---

## 10. Siguiente unidad lógica recomendada

### SPEC11-002 — Snapshot efectivo de configuración operativa de tarea

**Clasificación prevista:** DB Safe Merge.

Objetivo único:

> Garantizar que una tarea del día conserva la configuración operativa efectiva que heredó al crearse y que cambios posteriores en `task_templates` no alteran silenciosamente ese día.

El cambio deberá decidir y probar, como mínimo:

- qué campos operativos de plantilla se copian;
- versión del contrato;
- origen heredado;
- override de instancia;
- restauración del valor heredado;
- actualización manual con comparación;
- lectura exclusiva del snapshot durante `buildInput`;
- compatibilidad de días legacy;
- migración idempotente;
- RLS;
- tests de independencia entre catálogo global y día existente.

No deberá añadir todavía:

- hold posterior;
- coordinación de espacios;
- búsqueda exacta de Totales;
- activación productiva de Planner Next;
- rediseño completo del editor de tareas;
- migración de toda la configuración legacy de una vez.

Una vez demostrada esta base, `TaskTemporalHoldPolicy` podrá añadirse sin romper la reproducibilidad del día.

---

## 11. Criterios de aceptación de la auditoría

SPEC11-001 queda completa cuando:

- la matriz cubre todas las capas exigidas por SPEC-11;
- distingue capacidades completas, parciales, ausentes e inseguras;
- identifica pérdidas concretas con archivos y consecuencias;
- separa estado productivo de capacidad demostrada sólo en fixtures/benchmarks;
- no convierte supuestos en requisitos;
- no modifica código productivo;
- define un único siguiente cambio de mayor valor y menor riesgo;
- mantiene SPEC10-021 aislada;
- no propone implementar hold sobre una plantilla global mutable.

---

## 12. Decisión final

OptiPlan no necesita una tabla universal de reglas ni más excepciones en el motor.

Necesita una cadena fiable de configuración efectiva:

```text
catálogo general
        ↓ snapshot explícito y versionado
día
        ↓ override visible
instancia
        ↓ proyección sin pérdida
EngineInput
        ↓ adaptación y preflight
motor
        ↓ validación y publicación
Evidence reproducible
```

El siguiente paso no es programar los cinco minutos de Totales como un caso genérico.

El siguiente paso es garantizar que cualquier política futura —incluido el hold posterior— pueda existir en un día sin depender de que el catálogo global permanezca congelado para siempre.
