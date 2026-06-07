# ENGINE V3 RUN DIAGNOSTICS — ID 021

## Problema

El Motor V3 ya toma y compara decisiones mediante greedy, backtracking limitado, vecindarios operativos, CP-SAT pilot/segments y señales de resource bundles. Esa inteligencia estaba disponible en benchmarks y en `v3Meta`, pero no quedaba expuesta de forma compacta y durable para auditar una generación real desde la aplicación.

ID 021 reutiliza `public.planning_runs`, que ya representa cada ejecución de planificación, y añade una proyección diagnóstica pequeña. No modifica factibilidad, hard constraints, scoring, CP-SAT, neighborhoods ni la solución seleccionada por el motor.

## Qué se guarda

La migración `067_planning_run_diagnostics.sql` amplía aditivamente `planning_runs` con:

- `engine_version`: versión diagnóstica (`v3`).
- `solution_source`: fuente final, por ejemplo greedy, backtracking, operational neighborhood, CP-SAT, fallback o infeasible.
- `planned_tasks` / `unplanned_tasks`: cardinalidades del output del motor.
- `hard_constraint_violations`: recálculo mediante las métricas puras existentes.
- `main_stage_gap_minutes` / `main_stage_gap_count`.
- `coach_switch_count`.
- `restrictive_talent_average_start_offset`.
- `selected_candidate_metrics`: snapshot compacto que ya publica `v3Meta`.
- `engine_metadata`: selección de candidato, uso de backtracking, neighborhoods, CP-SAT pilot/segments, razones compactas de fallback y contadores declared/usable/invalid/partial de bundles.
- `diagnostic_warnings`: arrays acotados de warnings de diagnóstico de recursos y validación de bundles.
- `created_at`: fecha de creación estable para consultar el último diagnóstico.

Se conservan los campos anteriores de `planning_runs`, incluido `status`, para el ciclo de vida running/success/infeasible/error. El helper puro `buildRunDiagnostics(input, output)` reutiliza `calculateOperationalMetrics`, `diagnoseCompositeResources` y `validateResourceBundles`; no replica reglas de planificación.

Los warnings se limitan a 50 por grupo, 25 task IDs por warning y 500 caracteres por texto. Las razones de fallback se deduplican y limitan a 10.

## Qué NO se guarda

No se persiste:

- el `EngineInput` completo;
- el `EngineOutput` completo;
- la lista completa de tareas o asignaciones;
- disponibilidades completas de concursantes;
- inventarios o catálogos completos de recursos;
- payloads internos del solver;
- datos personales adicionales;
- trazas o stacks de error.

La persistencia contiene únicamente contadores, flags, métricas seleccionadas, razones cortas y warnings acotados. Así se evita convertir `planning_runs` en un almacén de payloads gigantes o sensibles.

## API

### `GET /api/plans/:id/engine-diagnostics/latest`

Devuelve:

```json
{
  "diagnostics": {
    "id": 123,
    "planId": 45,
    "createdAt": "2026-05-31T00:30:00.000Z",
    "engineVersion": "v3",
    "solutionSource": "operational_neighborhood",
    "status": "success",
    "plannedTasks": 80,
    "unplannedTasks": 0,
    "hardConstraintViolations": 0,
    "mainStageGapMinutes": 0,
    "mainStageGapCount": 0,
    "coachSwitchCount": 12,
    "restrictiveTalentAverageStartOffset": 48,
    "selectedCandidateMetrics": {},
    "engineMetadata": {},
    "diagnosticWarnings": {
      "resourceDiagnosticWarnings": [],
      "resourceBundleValidationWarnings": []
    }
  }
}
```

Si el plan existe pero aún no tiene un diagnóstico V3 persistido, responde `200` con `{ "diagnostics": null }`. IDs inválidos responden `400`; planes inexistentes o no accesibles responden `404`; errores inesperados responden `500` sin filtrar detalles internos.

`POST /api/plans/:id/generate` construye y guarda el resumen inmediatamente después de recibir el output V3. Un fallo al guardar el diagnóstico genera un warning de servidor, pero no cambia ni bloquea el resultado de planificación.

## RLS/permisos

Se reutilizan las policies de `planning_runs`:

- lectura autenticada: `admin`, `production`, `aux` y `viewer`, coherente con la observabilidad operativa existente;
- escritura autenticada: `admin` y `production` según la policy histórica;
- el backend usa el cliente administrativo/service role para actualizar el run creado por la generación;
- `anon` no recibe acceso y la migración revoca explícitamente sus privilegios sobre la tabla;
- RLS permanece habilitado.

El endpoint también pasa por la autenticación global y valida que el plan exista antes de devolver el diagnóstico.

## Riesgos residuales

- La UI solo muestra el último diagnóstico y un resumen acotado; no ofrece histórico ni drill-down por tarea.
- La calidad del resumen depende de las métricas y de `v3Meta` existentes; campos ausentes usan defaults defensivos.
- Los errores de persistencia diagnóstica no bloquean la planificación, por diseño, por lo que una ejecución puede completar sin dejar resumen.
- La lectura expone el último run con `engine_version`; runs históricos anteriores a ID 021 no se reinterpretan ni rellenan artificialmente.
- No hay todavía retención, agregación temporal ni export de diagnósticos.

## Recomendación original para ID 022 (implementada)

Priorizar una **UI admin de diagnóstico del motor** que consuma el endpoint latest y muestre fuente de solución, hard violations, planned/unplanned, decisiones de backtracking/neighborhoods/CP-SAT y warnings de recursos sin exponer JSON crudo.

Como segunda fase dentro de esa UI, añadir un panel de salud de resource bundles basado en declared/usable/invalid/partial y sus warnings. El export de benchmark puede quedar después: la necesidad operativa inmediata es explicar una ejecución real de un plan, no solo comparar escenarios offline.

## Panel UI — ID 022

El último diagnóstico del Motor V3 aparece en la pestaña **Planning** de la vista de detalle del plan, inmediatamente antes del timeline. Se eligió esta ubicación porque conecta el resumen técnico con la acción de generar/recalcular y con el resultado visual, sin añadir navegación ni alterar el flujo operativo.

El panel está orientado preferentemente a roles `admin` y `production`, reutilizando el helper de rol existente. Mientras el rol no pueda resolverse, el panel no se oculta de forma agresiva; el acceso real al plan y al endpoint sigue bajo control del backend.

La vista resume, sin mostrar el JSON crudo:

- fuente y estado de la solución, tareas planificadas/sin planificar y hard violations;
- gaps de Main Stage, cambios de coach y offset medio de talento restrictivo;
- candidatos evaluados y uso/aceptación de backtracking, neighborhoods y CP-SAT pilot/segments/global;
- bundles declarados, utilizables, inválidos y parcialmente utilizables;
- hasta 8 warnings combinados de recursos y validación de bundles, con código, severidad, mensaje recortado y número de tareas afectadas cuando existe.

El hook frontend consume `GET /api/plans/:id/engine-diagnostics/latest`, trata campos anidados como opcionales y vuelve a invalidar el diagnóstico después de una generación o al detectar que el planning run esperado ha terminado.

Estados defensivos:

- **loading**: skeleton compacto mientras se consulta el último diagnóstico;
- **empty**: “Aún no hay diagnóstico del motor para este plan.” cuando la API responde `{ diagnostics: null }`, por ejemplo en planes históricos o ejecuciones cuya persistencia diagnóstica falló;
- **error**: “No se pudo cargar el diagnóstico del motor.” sin bloquear la planificación ni el timeline;
- **success**: valores ausentes se representan con `—`, arrays ausentes se tratan como vacíos y mensajes largos se recortan.

Limitaciones: solo se enseña la ejecución V3 más reciente; no hay histórico, export, drill-down de tareas, payload completo de solver ni refresco realtime específico de `planning_runs`. Los warnings se limitan visualmente para mantener el panel operativo y compacto. No se modifican motor, reglas, migraciones, RLS ni persistencia.

## Recomendación para ID 023

Añadir un histórico acotado de ejecuciones por plan con comparación de métricas clave y duración, manteniendo el detalle bajo demanda y sin persistir payloads completos. Antes de ello conviene validar con Producción qué diferencias entre runs aportan decisiones operativas reales.
