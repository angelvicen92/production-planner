# SPEC11-010 — Snapshot diario de configuración del optimizador

**Estado:** contrato productivo documental  
**Clasificación futura de implementación:** DB Safe Merge  
**Depende de:** SPEC11-002 para identidad diaria de plantillas, SPEC11-003 para UX de origen y override, SPEC11-006 para gobernanza  
**No activa:** Planner Next en producto, búsqueda exacta, ORC ni publicación automática  
**Ámbito:** configuración global → snapshot del plan → override explícito → buildInput → EngineInput → Evidence

---

## 1. Objetivo único

Garantizar que un plan conserva la política de optimización efectiva con la que fue creado y que cambios posteriores en `optimizer_settings` no alteran silenciosamente:

- prioridades;
- pesos;
- agrupación;
- transporte;
- compactación;
- selección de zona principal;
- tolerancias de calidad;
- comportamiento de motores legacy;
- futura proyección a Planner Next.

Después de crear el plan:

```text
editar configuración global
        ≠
modificar el día existente
```

Una actualización del día requerirá acción explícita, diff, validación y nueva versión efectiva.

---

## 2. Problema actual

`buildEngineInput` llama a:

```ts
storage.getOptimizerSettings()
```

cada vez que construye el input.

La lectura global participa en decisiones como:

- `mainZoneId`;
- modo básico o avanzado;
- mantener ocupado el plató principal;
- terminar temprano;
- agrupar por espacio o plantilla;
- compactar concursantes;
- permanencia en zona;
- span total;
- transporte IN/OUT;
- gaps mínimos;
- capacidad de van;
- peso de agrupación;
- límites near-hard;
- zonas sujetas a agrupación.

Consecuencia:

> El mismo plan persistido puede producir un EngineInput distinto después de editar los ajustes globales.

---

## 3. Decisión de arquitectura

Se creará un único snapshot de política por plan:

```text
plan_optimizer_snapshots
```

con relaciones estructuradas para:

```text
plan_optimizer_snapshot_heuristics
plan_optimizer_snapshot_grouping_zones
```

No se copiará un objeto JSON opaco completo.

No se almacenará la configuración dentro de cada tarea.

No se reutilizará `optimizer_settings` como si fuera snapshot.

---

## 4. Frontera del contrato V1

V1 congela la configuración operativa global que hoy consume `buildEngineInput`.

Incluye:

- modo de edición básico/avanzado;
- zona principal;
- heurísticas normalizadas;
- zonas de agrupación;
- identidad de plantillas de llegada y salida;
- objetivos de agrupación de transporte;
- gaps mínimos;
- capacidad de van;
- peso de transporte;
- límite near-hard;
- origen, versión y timestamps.

No incluye todavía:

- presupuesto exacto de Planner Next;
- política `FIRST_COMPLETE` o `BEST_DOMINATING_WITHIN_BUDGET`;
- grid temporal de Planner Next;
- límites de ramas;
- feature flags de activación;
- selección de motor;
- parámetros internos sin contrato oficial;
- configuración ORC;
- weights nuevos no persistidos hoy.

Esas capacidades deberán tener contratos separados.

---

## 5. Contrato canónico V1

El resolvedor server-side producirá una forma equivalente a:

```ts
interface PlanOptimizerSnapshotV1 {
  readonly contractVersion: 1;
  readonly planId: number;
  readonly source: "INHERITED" | "LEGACY_BACKFILL" | "DAY_OVERRIDE";
  readonly editingMode: "BASIC" | "ADVANCED";
  readonly mainZoneId: number | null;
  readonly heuristics: Readonly<Record<OptimizerHeuristicKeyV1, {
    readonly basicLevel: 0 | 1 | 2 | 3;
    readonly advancedValue: number;
    readonly effectiveWeight: number;
  }>>;
  readonly groupingZoneIds: readonly number[];
  readonly transport: {
    readonly arrivalPlanTemplateSnapshotId: number | null;
    readonly departurePlanTemplateSnapshotId: number | null;
    readonly arrivalGroupingTarget: number;
    readonly departureGroupingTarget: number;
    readonly arrivalMinGapMinutes: number;
    readonly departureMinGapMinutes: number;
    readonly vanCapacity: number;
    readonly groupingWeight: number;
  };
  readonly nearHardBreaksMax: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

`effectiveWeight` se deriva canónicamente.

No se persistirá como una tercera fuente independiente si puede divergir de `editingMode`, `basicLevel` y `advancedValue`.

El fingerprint se deriva; no se almacena como autoridad redundante.

---

## 6. Heurísticas V1

El conjunto canónico inicial deberá incluir todas las heurísticas operativas actuales que afecten a la selección de solución.

Como mínimo:

```text
MAIN_ZONE_PRIORITY
MAIN_ZONE_FINISH_EARLY
MAIN_ZONE_KEEP_BUSY
CONTESTANT_COMPACT
GROUP_BY_SPACE_TEMPLATE_MATCH
GROUP_BY_SPACE_ACTIVE
CONTESTANT_STAY_IN_ZONE
CONTESTANT_TOTAL_SPAN
ARRIVAL_DEPARTURE_GROUPING
```

La implementación deberá auditar si existe alguna heurística global consumida por motores legacy que no aparezca en esta lista.

No se omitirán campos porque no estén visibles en el componente UI actual.

No se añadirán claves futuras sin:

- capability ID;
- migración de contrato;
- default/ausencia;
- UI o justificación N/A;
- buildInput;
- fingerprint;
- Evidence.

---

## 7. Modo básico y avanzado

El modo pertenece a la experiencia de configuración y a la reproducibilidad.

### Básico

- nivel 0..3;
- conversión oficial a peso efectivo;
- valor avanzado almacenado para conservar edición coherente, si el contrato así lo decide;
- el peso efectivo se deriva mediante helper compartido.

### Avanzado

- valor 0..10;
- nivel básico conservado como representación auxiliar de UI;
- el valor avanzado gobierna el peso efectivo.

### Conversión

La tabla actual:

```text
0 → 0
1 → 3
2 → 6
3 → 9
```

se tratará como parte versionada del contrato de configuración V1.

No será una constante invisible.

Deberá:

- estar en un helper compartido;
- tener tests;
- formar parte de la versión del contrato;
- aparecer en documentación de UI;
- no cambiar dentro de V1.

Una conversión distinta requiere V2 o migración explícita.

---

## 8. Normalización de campos legacy

La configuración global actual contiene combinaciones de:

- booleanos legacy;
- niveles básicos;
- valores avanzados;
- flags de modo;
- pesos específicos.

El snapshot no copiará todas las representaciones sin decidir autoridad.

Flujo:

1. leer la fila global;
2. normalizar mediante un helper V1 único;
3. resolver contradicciones según reglas documentadas;
4. producir heurísticas canónicas;
5. validar el candidato completo;
6. persistir el snapshot.

Ejemplos de campos legacy:

```text
prioritizeMainZone
mainZonePriorityLevel
mainZonePriorityAdvancedValue
mainZoneOptFinishEarly
mainZoneFinishEarlyLevel
mainZoneFinishEarlyAdvancedValue
mainZoneOptKeepBusy
mainZoneKeepBusyLevel
mainZoneKeepBusyAdvancedValue
groupBySpaceAndTemplate
groupingLevel
groupingAdvancedValue
```

No se permitirá que cada motor vuelva a resolver estas contradicciones por su cuenta.

---

## 9. Regla de autoridad legacy

La autoridad dependerá de `optimizationMode` y de la presencia de valores válidos.

Contrato objetivo:

1. normalizar modo;
2. normalizar niveles 0..3;
3. normalizar valores 0..10;
4. en modo avanzado, utilizar el valor avanzado;
5. en modo básico, utilizar la conversión oficial del nivel;
6. utilizar booleanos legacy únicamente para reconstrucción marcada cuando faltan los campos canónicos;
7. registrar warning de reconstrucción;
8. no permitir contradicciones silenciosas dentro del snapshot final.

El helper deberá producir Evidence de origen por campo durante backfill o inicialización.

---

## 10. Zona principal

`mainZoneId` es una identidad estructurada.

El snapshot deberá validar que:

- la zona existe;
- existe su snapshot diario en `plan_zone_settings`;
- pertenece al plan efectivo;
- no está duplicada;
- la ausencia `null` significa que no existe zona principal configurada.

No se resolverá por nombre.

Una zona global renombrada no cambia la identidad del día.

Una zona eliminada del catálogo no debe destruir el snapshot histórico del plan.

La estrategia de FK deberá preservar la independencia histórica.

---

## 11. Zonas de agrupación

`groupingZoneIds` representa un conjunto.

Persistencia:

```text
plan_optimizer_snapshot_grouping_zones
```

con unicidad por:

```text
(snapshot_id, zone_id)
```

Reglas:

- IDs positivos;
- sin duplicados;
- orden canónico;
- cada zona debe existir en el snapshot espacial del plan;
- cambios globales posteriores no modifican el conjunto;
- ausencia significa conjunto vacío, no error;
- fallo de carga es hard.

No se almacenará como lista JSON si existe una relación estructurada simple.

---

## 12. Identidad de transporte

Los campos globales actuales utilizan nombres:

```text
arrivalTaskTemplateName
departureTaskTemplateName
```

El snapshot diario no conservará esos nombres como autoridad.

Utilizará:

```text
arrivalPlanTemplateSnapshotId
departurePlanTemplateSnapshotId
```

Por tanto, SPEC11-010 depende de SPEC11-002.

### Resolución al crear el plan

1. normalizar nombre legacy global;
2. buscar coincidencia inequívoca en el catálogo global usado para crear snapshots de plantilla;
3. mapear al snapshot diario correspondiente;
4. si no hay coincidencia y la función está OFF, persistir `null`;
5. si la función está activa y no hay coincidencia inequívoca, rechazar inicialización;
6. publicar warning de migración nominal;
7. no volver a usar el nombre durante planificación.

### Evolución global futura

La configuración general deberá migrar también a IDs/roles estructurados.

El uso de nombres sólo será compatibilidad de entrada, no contrato objetivo.

---

## 13. Configuración de transporte

Campos V1:

- `arrivalGroupingTarget`;
- `departureGroupingTarget`;
- `arrivalMinGapMinutes`;
- `departureMinGapMinutes`;
- `vanCapacity`;
- `groupingWeight`.

Reglas mínimas:

- targets enteros no negativos;
- gaps enteros no negativos;
- capacidad entera no negativa;
- peso 0..10;
- peso cero equivale a OFF para la preferencia;
- una plantilla `null` no puede participar en agrupación activa;
- no se inventa capacidad de van;
- no se infiere transporte por nombre de espacio;
- todos los valores forman parte del fingerprint.

La semántica exacta de targets y capacidad deberá conservar la documentación actual; SPEC11-010 no la redefine.

---

## 14. Near-hard breaks

`nearHardBreaksMax` deberá:

- ser entero;
- estar dentro del rango oficial actual;
- conservarse en el snapshot;
- incluirse en fingerprint;
- mostrarse en UI avanzada;
- dejar Evidence si afecta selección.

El nombre near-hard no autoriza a convertir una restricción hard en soft.

La implementación deberá documentar exactamente qué contador limita.

---

## 15. Persistencia objetivo

### Tabla principal

```text
plan_optimizer_snapshots
```

Campos mínimos:

- `id`;
- `plan_id` único;
- `contract_version`;
- `source`;
- `editing_mode`;
- `main_zone_id` nullable;
- referencias a snapshots de plantilla de llegada/salida;
- targets y gaps de transporte;
- capacidad de van;
- peso de transporte;
- near-hard max;
- `created_at`;
- `updated_at`;
- `updated_by` nullable cuando exista usuario.

### Heurísticas

```text
plan_optimizer_snapshot_heuristics
```

Campos:

- `snapshot_id`;
- `heuristic_key`;
- `basic_level`;
- `advanced_value`;
- timestamps si son necesarios.

Unicidad:

```text
(snapshot_id, heuristic_key)
```

### Zonas

```text
plan_optimizer_snapshot_grouping_zones
```

Campos:

- `snapshot_id`;
- `zone_id`.

---

## 16. Constraints

Como mínimo:

- un snapshot por plan;
- `contract_version = 1`;
- `source` limitado;
- modo BASIC/ADVANCED;
- niveles 0..3;
- advanced 0..10;
- claves de heurística permitidas;
- targets, gaps y capacidades no negativas;
- peso 0..10;
- near-hard dentro de rango;
- no duplicados;
- cascade al eliminar plan;
- sin dependencia destructiva del catálogo global;
- relaciones diarias coherentes con el mismo plan.

Los constraints no reemplazan la validación completa del candidato.

---

## 17. RLS

Patrón server-only equivalente a snapshots espaciales:

- RLS habilitada;
- acceso de usuario mediante rutas autorizadas;
- revocación a `anon` y `authenticated` cuando corresponda;
- `service_role` conservado;
- secuencias protegidas;
- pruebas SQL estáticas;
- no se afirma despliegue sin aplicar migración real.

---

## 18. Creación de plan

Flujo objetivo:

1. cargar configuración global;
2. cargar catálogo necesario;
3. construir snapshots de plantilla;
4. resolver referencias de transporte a snapshots diarios;
5. normalizar heurísticas;
6. validar el candidato completo;
7. crear plan;
8. insertar snapshot del optimizador y relaciones;
9. insertar demás snapshots del plan;
10. ante fallo, compensar y comprobar cleanup.

No se dejará un plan con snapshots espaciales pero sin snapshot de política.

No se afirmará transacción SQL multi-tabla si no existe.

---

## 19. Backfill legacy

Los planes existentes recibirán:

```text
source = LEGACY_BACKFILL
```

El backfill utiliza la configuración global vigente en el momento de migración.

No se presentará como captura histórica exacta.

Reglas:

- idempotente;
- `ON CONFLICT DO NOTHING`;
- normalización V1;
- warnings por nombres ambiguos;
- si una referencia activa no puede resolverse, el plan queda marcado para revisión o unsupported;
- no elegir la primera coincidencia;
- no inferir por nombres de espacio;
- no ocultar campos inválidos con cero salvo compatibilidad oficial documentada.

---

## 20. Actualización explícita del día

Una unidad posterior implementará:

```text
Comparar con configuración global actual
```

La acción deberá mostrar:

- heurísticas modificadas;
- zona principal;
- zonas de agrupación;
- plantillas de transporte;
- targets, gaps y capacidad;
- near-hard;
- impacto potencial;
- tareas protegidas;
- versión actual y candidata.

El usuario podrá:

- cancelar;
- aplicar todo;
- aplicar campos permitidos;
- conservar overrides.

No se sincronizará al abrir el plan.

---

## 21. Override diario

En V1 el propio snapshot es la configuración diaria efectiva.

Un cambio explícito actualiza el snapshot con:

```text
source = DAY_OVERRIDE
```

y nueva versión de fila/timestamp.

La implementación deberá decidir control de concurrencia:

- `updated_at` esperado;
- versión incremental;
- ETag;
- fingerprint previo.

Una escritura concurrente obsoleta se rechaza.

---

## 22. buildEngineInput

Después de implementar SPEC11-010:

```ts
storage.getOptimizerSettings()
```

queda prohibido dentro de `buildEngineInput`.

La nueva fuente será equivalente a:

```ts
storage.getPlanOptimizerSnapshot(planId)
```

Requisitos:

- fuente hard;
- versión soportada;
- sin duplicados;
- heurísticas completas;
- relaciones válidas;
- orden canónico;
- input frozen o readonly;
- sin consultas globales posteriores;
- error tipado si falta en plan no legacy;
- compatibilidad legacy marcada.

---

## 23. EngineInput

El contrato podrá incorporar:

```ts
interface EngineInputOptimizerSnapshotV1 {
  readonly contractVersion: 1;
  readonly source: "INHERITED" | "LEGACY_BACKFILL" | "DAY_OVERRIDE";
  readonly editingMode: "BASIC" | "ADVANCED";
  readonly mainZoneId: number | null;
  readonly heuristicWeights: Readonly<Record<string, number>>;
  readonly groupingZoneIds: readonly number[];
  readonly transport: {
    readonly arrivalTemplateId: number | null;
    readonly departureTemplateId: number | null;
    readonly arrivalGroupingTarget: number;
    readonly departureGroupingTarget: number;
    readonly arrivalMinGapMinutes: number;
    readonly departureMinGapMinutes: number;
    readonly vanCapacity: number;
    readonly groupingWeight: number;
  };
  readonly nearHardBreaksMax: number;
  readonly configurationFingerprint: string;
}
```

Los IDs de plantilla serán IDs diarios reversibles, no nombres globales.

---

## 24. Relación con motores legacy

V3/V4 pueden continuar consumiendo campos legacy derivados temporalmente.

Pero la derivación tendrá una única autoridad:

```text
PlanOptimizerSnapshotV1
        ↓ adapter legacy puro
campos actuales de EngineInput
```

No:

```text
optimizer_settings global
        ↓
cada motor interpreta a su manera
```

El adapter deberá:

- ser puro;
- tener tests de equivalencia;
- conservar resultados históricos para snapshots equivalentes;
- publicar warning cuando use compatibilidad;
- no consultar DB.

---

## 25. Relación con Planner Next

SPEC11-010 no activa Planner Next.

El snapshot será una fuente para una futura política productiva que deberá decidir qué campos se proyectan a:

- main flow;
- preferencias;
- transición;
- búsqueda;
- presupuesto;
- scoring.

No todas las heurísticas legacy tienen por qué tener traducción uno-a-uno.

Opciones permitidas:

- proyección exacta;
- declaración N/A;
- blocker unsupported.

Opción prohibida:

- ignorar silenciosamente una preferencia activa.

---

## 26. Fingerprint

El fingerprint canónico incluirá:

- versión;
- source cuando sea semántico;
- modo;
- zona principal;
- todas las claves de heurística;
- niveles y valores;
- pesos efectivos derivados o la versión de derivación;
- zonas de agrupación ordenadas;
- IDs diarios de plantillas de transporte;
- targets;
- gaps;
- capacidad;
- peso;
- near-hard.

No incluirá:

- nombres visibles;
- orden de filas;
- timestamps;
- autor;
- campos globales no consumidos;
- valores legacy redundantes.

---

## 27. Evidence

Evidence mínima:

- `contractVersion`;
- `source`;
- `configurationFingerprint`;
- `editingMode`;
- `mainZoneId`;
- pesos efectivos por heurística;
- zonas de agrupación;
- identidad diaria de plantillas de transporte;
- targets, gaps, capacidad y peso;
- near-hard;
- warnings legacy;
- campos ignorados con razón;
- motor y versión que consumieron el snapshot.

No se publicarán sólo los settings globales actuales.

---

## 28. UI general

La pantalla global conserva su función:

> definir defaults para planes nuevos.

Deberá mostrar:

- que los cambios no afectan días existentes;
- versión de contrato;
- campos legacy en proceso de retirada;
- identidades estructuradas de plantillas;
- validación de referencias;
- modo y valores efectivos;
- conversiones básico/avanzado.

---

## 29. UI del día

Se añadirá una sección:

```text
Política de optimización de este día
```

Mostrará:

- valor efectivo;
- origen;
- fecha de snapshot;
- fingerprint abreviado;
- diferencias frente al global actual;
- estado legacy;
- acción de actualizar;
- impacto sobre tareas protegidas;
- qué motor puede representar cada capacidad.

No se mostrará una simple copia del editor global sin origen.

---

## 30. Estados protegidos y replanificación

Cambiar la política diaria:

- no modifica `done`;
- no modifica `in_progress`;
- no elimina locks;
- sólo afecta a trabajo pendiente/interrumpido en una replanificación posterior;
- no ejecuta planificación automáticamente salvo acción separada;
- conserva plan previo hasta publicar uno nuevo completo.

La UI deberá advertir si el cambio no puede mejorar partes ya ejecutadas.

---

## 31. Tests obligatorios

### Normalización

- modo básico;
- modo avanzado;
- tabla 0/3/6/9;
- clamps;
- booleanos legacy;
- contradicciones;
- todas las heurísticas;
- input inmutable;
- output frozen.

### Persistencia

- un snapshot por plan;
- heurísticas completas;
- zonas sin duplicados;
- constraints;
- RLS;
- cascade de plan;
- independencia del global;
- migración idempotente.

### Creación

- snapshot completo;
- referencias de transporte inequívocas;
- error por ambigüedad activa;
- compensación;
- no plan parcial.

### Backfill

- source legacy;
- no afirma historia exacta;
- no elige primera coincidencia;
- idempotencia;
- warnings.

### buildInput

- no llama `getOptimizerSettings`;
- snapshot hard;
- versión desconocida;
- ausencia;
- determinismo;
- orden invertido;
- mismo snapshot produce mismo EngineInput aunque cambie global;
- override diario sí cambia fingerprint.

### Regresión

- adapter legacy conserva resultados equivalentes;
- tareas protegidas intactas;
- Focal A2 protegido;
- Planner Next sigue desconectado si no es el objetivo;
- SPEC10-021 intacta.

---

## 32. Fases futuras

### Checkpoint 1 — Contrato y helper puro

- tipos;
- normalizador;
- heurísticas completas;
- fingerprint;
- tests.

### Checkpoint 2 — DB y snapshot

- migración;
- tablas;
- RLS;
- creación;
- backfill.

### Checkpoint 3 — buildInput legacy adapter

- lectura hard;
- eliminar global read;
- adapter a campos actuales;
- regression.

### Checkpoint 4 — UI de origen y diff

- global;
- día;
- actualización explícita;
- concurrencia.

### Checkpoint 5 — Evidence productiva

- metadata;
- fingerprint;
- comparación;
- gates.

No se mezclará con la activación de Planner Next.

---

## 33. Qué no hacer

- no copiar la fila global como JSON opaco;
- no snapshotear nombres como identidad;
- no conservar booleanos legacy como segunda autoridad;
- no recalcular desde global al planificar;
- no actualizar días automáticamente;
- no elegir la primera plantilla por nombre;
- no convertir peso cero en hard;
- no traducir heurísticas a Planner Next sin contrato;
- no mezclar presupuesto exacto en V1;
- no modificar tareas protegidas;
- no mezclar SPEC10-021.

---

## 34. Criterios de aceptación

SPEC11-010 queda documentalmente completa cuando:

- define un snapshot único por plan;
- enumera el alcance V1;
- normaliza modo y heurísticas;
- trata mappings como contrato versionado;
- sustituye nombres de transporte por IDs diarios;
- define persistencia estructurada;
- define backfill y RLS;
- prohíbe lectura global en buildInput;
- define adapter legacy;
- separa Planner Next;
- define fingerprint, Evidence y UI;
- protege estados y locks;
- divide implementación en checkpoints;
- no afirma que el snapshot ya exista.

---

## 35. Regla final

> La configuración global prepara futuros días.  
> El snapshot gobierna el día existente.  
> El modo explica cómo se editó.  
> El peso efectivo explica cómo se evaluó.  
> Los nombres explican al humano.  
> Los IDs y la versión gobiernan al motor.