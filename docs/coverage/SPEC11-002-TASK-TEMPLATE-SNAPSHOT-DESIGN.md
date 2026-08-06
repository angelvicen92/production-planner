# SPEC11-002 — Snapshot efectivo de configuración operativa de plantilla

**Estado:** diseño ejecutable aprobado para implementación  
**Clasificación:** DB Safe Merge  
**Baseline de diseño:** `main@3ac6b3c3ca0cb0b4ae12a9f87a4cb952e3e4cfaf`  
**Depende de:** SPEC-11 y auditoría SPEC11-001  
**No depende de:** rama WIP SPEC10-021

---

## 1. Objetivo único

Garantizar que un plan conserva una copia independiente, tipada y reproducible de la configuración operativa de las plantillas disponible cuando se crea el día.

Después de crear el plan:

- editar `task_templates` no altera la interpretación de ese plan;
- las tareas nuevas del plan heredan su snapshot diario, no el catálogo global actual;
- `buildEngineInput` no reconstruye semántica operativa desde `task_templates` para planes con snapshot;
- los overrides de `daily_tasks` continúan teniendo precedencia;
- la configuración efectiva conserva origen, versión y fingerprint;
- los planes legacy reciben una compatibilidad explícita y auditable.

Esta unidad crea la base necesaria para añadir posteriormente `TaskTemporalHoldPolicy` sin sincronización silenciosa.

---

## 2. Principios normativos aplicados

La precedencia efectiva es:

```text
lock o estado protegido
        > override de daily_task
        > snapshot de plantilla del plan
        > catálogo global sólo durante creación o inicialización explícita
        > compatibilidad legacy documentada
```

Reglas obligatorias:

1. El catálogo global prepara el día, pero no gobierna ejecuciones posteriores del día.
2. No se almacena una bolsa universal de reglas.
3. El snapshot contiene únicamente campos operativos tipados y normalizados.
4. No se copia `rules_json` de forma opaca.
5. Los IDs y relaciones deciden semántica; los nombres sólo sirven para presentación y explicación.
6. Los errores al cargar una entrada hard no se degradan a ausencia configurada.
7. `done` e `in_progress` no se modifican.
8. Esta unidad no ejecuta actualización manual de días existentes; prepara el contrato para una unidad posterior.

---

## 3. Decisión de modelo

### 3.1 Un snapshot por plan y plantilla

Se crea una tabla:

```text
plan_task_template_snapshots
```

con unicidad:

```text
(plan_id, source_template_id)
```

No se duplica toda la configuración dentro de cada `daily_task`.

Motivos:

- todas las instancias de la misma plantilla comparten el valor heredado del día;
- los overrides siguen residiendo en la instancia;
- crear una tarea posterior utiliza exactamente el mismo snapshot;
- se reduce duplicación y deriva;
- una actualización manual futura puede comparar y versionar por plantilla.

### 3.2 Identidad histórica

`source_template_id` conserva el ID que originó el snapshot y no debe depender de una FK que provoque borrado o mutación del snapshot.

La tabla mantiene `template_name` como etiqueta histórica para explicación. El nombre no decide ninguna regla.

### 3.3 Contrato versionado

La primera versión será:

```text
contract_version = 1
```

Toda lectura debe rechazar versiones desconocidas en lugar de reinterpretarlas.

---

## 4. Persistencia propuesta

Migración siguiente libre de la secuencia activa, previsiblemente:

```text
074_plan_task_template_snapshots.sql
```

Antes de crearla se ejecutará `npm run check:migrations` y se confirmará que `074` continúa libre.

Tabla mínima:

```sql
CREATE TABLE public.plan_task_template_snapshots (
  id bigserial PRIMARY KEY,
  plan_id integer NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  source_template_id integer NOT NULL,
  contract_version integer NOT NULL DEFAULT 1,
  source text NOT NULL,
  source_fingerprint text NOT NULL,

  template_name text NOT NULL,
  default_duration integer NOT NULL,
  default_cameras integer NOT NULL,

  default_zone_id integer,
  default_space_id integer,

  auto_create_on_contestant_create boolean NOT NULL,
  requires_auxiliar boolean NOT NULL,
  requires_coach boolean NOT NULL,
  requires_presenter boolean NOT NULL,
  exclusive_auxiliar boolean NOT NULL,

  has_dependency boolean NOT NULL,
  dependency_template_ids jsonb NOT NULL,

  resource_requirements jsonb,

  itinerant_team_requirement text NOT NULL,
  itinerant_team_id integer,
  allowed_itinerant_team_ids jsonb NOT NULL,

  setup_id integer,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (plan_id, source_template_id)
);
```

Los nombres concretos podrán adaptarse a convenciones existentes, pero no se reducirá la semántica.

### 4.1 Constraints mínimos

- `contract_version = 1` para filas creadas por esta unidad;
- `default_duration > 0`;
- `default_cameras >= 0`;
- `source IN ('inherited', 'legacy_backfill', 'ad_hoc_from_default')`;
- `itinerant_team_requirement IN ('none', 'any', 'specific')`;
- `specific` exige `itinerant_team_id` válido;
- `none` no conserva un `itinerant_team_id` operativo;
- arrays JSON compuestos sólo por enteros positivos sin duplicados;
- `source_fingerprint` no vacío;
- unicidad por plan y plantilla.

La validación profunda de JSON se realizará también en helpers TypeScript puros antes de persistir.

### 4.2 RLS y privilegios

La tabla será server-only, siguiendo el patrón de snapshots espaciales:

- habilitar RLS;
- revocar tabla y secuencia a `anon` y `authenticated`;
- mantener acceso de `service_role`;
- autorización de usuario en rutas antes de `supabaseAdmin`.

### 4.3 Backfill legacy

La migración debe crear una fila para cada combinación existente:

```text
plans × task_templates
```

con `source = 'legacy_backfill'` y `ON CONFLICT DO NOTHING`.

Razón para copiar todo el catálogo y no sólo plantillas ya usadas:

- un plan legacy debe conservar también la semántica de una plantilla que todavía no haya instanciado;
- crear una tarea después de la migración no puede leer una versión global modificada posteriormente.

El backfill representa la mejor reconstrucción disponible en el momento de migración; no se presentará como snapshot histórico exacto previo.

Si el volumen real hiciera inviable el cross join, la implementación debe demostrarlo con datos y proponer una inicialización tardía atómica que congele todo el catálogo antes de permitir nuevas tareas. No se acepta snapshot por primer uso silencioso.

---

## 5. Contrato TypeScript

Crear un helper puro, por ejemplo:

```text
server/taskTemplateSnapshot.ts
```

con tipos equivalentes a:

```ts
export type TaskTemplateSnapshotSource =
  | "inherited"
  | "legacy_backfill"
  | "ad_hoc_from_default";

export interface TaskTemplateOperationalSnapshotV1 {
  contractVersion: 1;
  sourceTemplateId: number;
  source: TaskTemplateSnapshotSource;
  sourceFingerprint: string;
  templateName: string;
  defaultDuration: number;
  defaultCameras: number;
  defaultZoneId: number | null;
  defaultSpaceId: number | null;
  autoCreateOnContestantCreate: boolean;
  requiresAuxiliar: boolean;
  requiresCoach: boolean;
  requiresPresenter: boolean;
  exclusiveAuxiliar: boolean;
  hasDependency: boolean;
  dependencyTemplateIds: readonly number[];
  resourceRequirements: ResourceRequirementsInput | null;
  itinerantTeamRequirement: "none" | "any" | "specific";
  itinerantTeamId: number | null;
  allowedItinerantTeamIds: readonly number[];
  setupId: number | null;
}
```

### 5.1 Normalización

El helper será la única autoridad para:

- camelCase y snake_case de entrada;
- arrays únicos, positivos y ordenados;
- dependencias legacy `depends_on_template_id` + array actual;
- normalización de `resource_requirements` al contrato existente;
- extracción explícita de `itinerantTeamAllowedIds` desde `rules_json`;
- coherencia de `itinerant_team_requirement`;
- valores booleanos;
- duración y cámaras;
- fingerprint canónico SHA-256.

No conservará otras claves de `rules_json`.

Una clave operativa desconocida en `rules_json` no debe incorporarse silenciosamente al snapshot. La implementación debe mantener compatibilidad histórica, pero añadir nuevas capacidades requerirá ampliar el contrato versionado.

### 5.2 Pureza

Los helpers deben:

- no mutar inputs;
- devolver estructuras congeladas o tratadas como readonly;
- ser invariantes al orden de arrays y claves;
- producir el mismo fingerprint para semántica equivalente;
- producir distinto fingerprint cuando cambie un dato operativo.

---

## 6. Creación del plan

`SupabaseStorage.createPlan` debe:

1. cargar el catálogo completo de `task_templates` antes o inmediatamente después de crear el plan, según el patrón de compensación existente;
2. normalizar y validar todo el catálogo en memoria;
3. construir el lote completo de snapshots;
4. insertar el lote con `source = 'inherited'`;
5. si falla cualquier snapshot, eliminar el plan creado y comprobar la compensación;
6. no dejar un plan parcialmente inicializado.

No se afirmará transacción SQL multi-tabla si no existe.

El snapshot de plantillas se integra en la misma política de compensación que recursos y disponibilidad espacial.

---

## 7. Creación de tareas y concursantes

### 7.1 Tarea manual

`createDailyTask` no debe consultar `task_templates` para heredar:

- ubicación;
- colores operativos si afectasen al flujo;
- duración efectiva;
- requisitos;
- dependencias;
- equipo itinerante.

Debe cargar el snapshot mediante:

```text
(plan_id, template_id)
```

Si falta:

- para un plan correctamente inicializado: error hard `MISSING_PLAN_TASK_TEMPLATE_SNAPSHOT`;
- para compatibilidad ad hoc explícita autorizada: crear primero un snapshot completo con `source = 'ad_hoc_from_default'`, nunca usar el global sólo durante esa ejecución.

La compatibilidad ad hoc debe estar encapsulada en un único método storage y dejar Evidence/metadata de origen.

### 7.2 Autocreación al añadir concursante

La selección de plantillas `auto_create_on_contestant_create` debe proceder del snapshot del plan.

No debe volver a consultar la bandera global.

Una modificación posterior de `task_templates.auto_create_on_contestant_create` no cambia qué tareas autocrea un día existente.

---

## 8. Lectura autoritativa en buildInput

Añadir a `IStorage` una lectura tipada equivalente a:

```ts
getPlanTaskTemplateSnapshots(planId: number): Promise<readonly TaskTemplateOperationalSnapshotV1[]>;
```

`buildEngineInput` debe:

1. cargar snapshots del plan como entrada hard;
2. rechazar error de carga; no usar `safe(..., [])`;
3. construir mapa por `sourceTemplateId`;
4. rechazar duplicados, versiones desconocidas o snapshot ausente para tareas activas;
5. usar exclusivamente el snapshot para los campos operativos de plantilla;
6. aplicar después los overrides efectivos de `daily_tasks`;
7. conservar nombres sólo para mensajes;
8. no llamar `storage.getTaskTemplates()` para interpretar tareas del plan.

Puede mantenerse una lectura global separada sólo en flujos administrativos de comparación o creación de snapshots, nunca en la planificación de un día ya inicializado.

### 8.1 Dependencias

Las dependencias del snapshot se resuelven por concursante exactamente como el flujo actual, pero a partir de `dependencyTemplateIds` congelados.

No se reconstruyen desde la plantilla global.

### 8.2 Recursos

`resourceRequirements` procede del snapshot, pero las asignaciones efectivas directas, de espacio y de zona continúan gobernando la obligación real según los addenda oficiales.

Esta unidad no añade automáticamente el vocal coach del concursante.

---

## 9. API y UI de esta unidad

Para mantener una sola unidad lógica, esta primera implementación expone únicamente lectura diagnóstica del snapshot cuando exista ya un endpoint de detalles del plan reutilizable.

No añade todavía:

- actualización manual desde defaults;
- comparación visual;
- restauración individual;
- editor completo de origen.

La respuesta del plan o endpoint dedicado deberá poder mostrar como mínimo:

- `sourceTemplateId`;
- `contractVersion`;
- `source`;
- `sourceFingerprint`;
- `templateName`;
- campos operativos efectivos.

La UI final de comparación se implementará en una unidad posterior. Esta limitación deberá quedar documentada y no se declarará SPEC11-002 completa a nivel de producto hasta esa unidad.

---

## 10. Compatibilidad

### 10.1 Planes nuevos

Siempre poseen snapshot completo creado junto al plan.

### 10.2 Planes legacy migrados

Reciben snapshot `legacy_backfill`.

La UI o API debe poder distinguir que no se trata de una captura histórica exacta.

### 10.3 Campo ausente

Tras aplicar la migración y completar inicialización, un snapshot ausente no significa “usar global”.

Significa estado inválido o inicialización ad hoc explícita.

### 10.4 Plantillas eliminadas o renombradas

El snapshot conserva identidad y etiqueta histórica.

La planificación no depende del nombre actual ni de la existencia posterior del catálogo global.

---

## 11. Evidence y diagnósticos

El `EngineInput` o sus diagnostics deben poder incluir:

```text
taskTemplateSnapshotContractVersion
taskTemplateSnapshotCount
taskTemplateSnapshotSources
taskTemplateSnapshotFingerprint
missingTaskTemplateSnapshotTaskIds
unknownTaskTemplateSnapshotVersionIds
```

El fingerprint de configuración debe incorporar todos los campos semánticos del snapshot.

Editar una plantilla global después de crear el plan debe demostrar:

- snapshot sin cambios;
- EngineInput sin cambios;
- fingerprint sin cambios;
- resultado del planificador sin cambios, cuando las demás entradas son iguales.

---

## 12. Tests obligatorios

### 12.1 Helper puro

- normalización camel/snake;
- dependencias legacy y múltiples;
- arrays ordenados y sin duplicados;
- requisitos de recursos normalizados;
- extracción única de IDs itinerantes conocidos;
- rechazo de duración inválida;
- rechazo de requisito itinerante contradictorio;
- fingerprint determinista;
- invariancia al orden;
- input inmutable;
- output readonly/frozen.

### 12.2 Migración y RLS

- tabla y constraints;
- unicidad;
- cascade por plan;
- ausencia de cascade desde plantilla;
- backfill idempotente;
- `legacy_backfill` explícito;
- RLS server-only;
- privilegios de secuencia;
- secuencia de migraciones válida.

### 12.3 Creación del plan

- copia completa del catálogo;
- source `inherited`;
- fallo de normalización antes de persistencia parcial;
- fallo de inserción con compensación comprobada;
- independencia frente a edición global posterior.

### 12.4 Creación de tareas

- hereda ubicación desde snapshot;
- override de ubicación prevalece;
- duración override prevalece;
- snapshot ausente bloquea;
- nueva plantilla ad hoc crea snapshot antes de tarea;
- no consulta la plantilla global cuando existe snapshot.

### 12.5 Autocreación

- utiliza flag diario;
- cambio global posterior no altera el día;
- dependencias y recursos de tareas autocreadas se resuelven desde snapshot.

### 12.6 buildInput

- no llama `getTaskTemplates`;
- carga snapshot como hard input;
- snapshot ausente genera error tipado;
- versión desconocida genera error tipado;
- edición del catálogo global no cambia EngineInput;
- overrides de instancia sí cambian EngineInput;
- determinismo;
- invariancia al orden;
- input inmutable;
- tareas `done` e `in_progress` conservadas;
- tareas `cancelled` no introducen obligaciones nuevas.

### 12.7 Regresión

- `npm run check:migrations`;
- `npm run check`;
- tests focales nuevos;
- suite completa;
- build;
- `git diff --check`;
- benchmarks protegidos de Planner Next y Focal A2 sin cambio semántico.

---

## 13. Archivos previstos

La implementación deberá confirmar el listado tras lectura dirigida. Previsión:

```text
supabase/migrations/074_plan_task_template_snapshots.sql
shared/schema.ts
shared/routes.ts                         # sólo si se expone lectura contractual
server/taskTemplateSnapshot.ts
server/taskTemplateSnapshot.spec.ts
server/taskTemplateSnapshotMigration.spec.ts
server/storage.ts
server/routes.ts                         # sólo si se expone lectura
engine/buildInput.ts
engine/buildInput.taskTemplateSnapshot.spec.ts
README.md
```

Podrán existir tests de contrato adicionales. No se tocarán archivos de SPEC10-021.

---

## 14. Qué no modificar

- búsqueda de Planner Next;
- `ExactSearchLedger`;
- rondas sincronizadas;
- hold posterior;
- coordinación entre espacios;
- contratos de setup;
- operaciones conjuntas;
- operaciones ancladas;
- transiciones de coach;
- scoring;
- publicación productiva;
- semántica de recursos efectivos;
- tareas `done` o `in_progress`;
- fingerprints históricos cuando el nuevo snapshot representa la misma semántica.

---

## 15. Criterios de aceptación del checkpoint

El checkpoint es aceptable cuando:

1. cada plan nuevo contiene un snapshot completo y versionado del catálogo de plantillas;
2. los planes legacy quedan marcados explícitamente como backfill;
3. crear tareas y concursantes usa el snapshot del plan;
4. `buildEngineInput` deja de interpretar tareas desde el catálogo global;
5. un cambio global posterior no cambia el EngineInput de un plan existente;
6. los overrides de instancia conservan precedencia;
7. no existe fallback silencioso a catálogo global durante planificación;
8. RLS, migración, compensación y tests están cubiertos;
9. no se han añadido holds ni capacidades de motor;
10. SPEC10-021 permanece aislada.

---

## 16. Siguiente paso después de este checkpoint

Una unidad posterior añadirá:

- comparación snapshot ↔ default actual;
- actualización manual explícita;
- restauración de heredado;
- metadata de autor y timestamp de override;
- UI de origen.

Sólo después se añadirá la persistencia de `TaskTemporalHoldPolicy` sobre esta base versionada.