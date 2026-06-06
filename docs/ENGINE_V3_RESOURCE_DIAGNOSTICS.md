# ENGINE V3 RESOURCE DIAGNOSTICS — ID 017

## Problema

La producción audiovisual real no opera únicamente con recursos individuales intercambiables. Cámara, sonido, operador, set, sala y coach suelen trabajar como equipos compuestos con afinidades estables, configuraciones conocidas y costes de cambio. El modelo actual puede asignar elementos exclusivos desde pools `anyOf`, pero esa representación no expresa que `Camera 1 + Sound 1` formen habitualmente un mismo equipo, que una sala vocal esté asociada a un coach concreto o que cambiar una combinación implique setup operativo.

ID 017 añade evidencia medible antes de modificar el modelo de datos. El diagnóstico consume el `EngineV3Input` y el `EngineOutput` actuales, es determinista y no participa en factibilidad, validación hard, scoring ni selección de candidatos.

## Qué se diagnostica ahora

El módulo puro `engine/v3/resourceDiagnostics.ts` calcula:

- **Resource bundle conflicts**: identifica combinaciones minoritarias frente a una asociación recurrente entre categorías distintas de recursos. Si la combinación sospechosa coincide temporalmente con el partner habitual en otra tarea, se informa como `RESOURCE_BUNDLE_CONFLICT`; nunca bloquea el plan.
- **AnyOf pool pressure**: por firma de pool registra tareas competidoras, capacidad disponible, pico de concurrencia, demanda pico, utilización máxima y tareas sin margen ante la pérdida de una unidad.
- **Resource switch count**: cuenta cambios entre asignaciones consecutivas de la misma categoría de recurso dentro de cada espacio. Los detalles conservan espacio, categoría y número de cambios.
- **Composite resource candidates**: propone pares recurso-recurso y recurso-espacio que aparecen al menos dos veces. Esto permite observar asociaciones como cámara + sonido, coach + sala vocal o set + equipo recurrente.
- **Resource diagnostic warnings**: expone presión sin redundancia, inconsistencias de asociación y conflictos concurrentes con códigos informativos y task IDs trazables.

El benchmark muestra las métricas:

- `resourcePoolPressureSummary`;
- `maxAnyOfPoolConcurrency`;
- `resourceSwitchCount`;
- `compositeResourceCandidateCount`;
- `resourceDiagnosticWarnings`.

Cuando un escenario no contiene pools ni asignaciones analizables, la métrica se muestra como `n/a`.

## Qué NO hace todavía

- No cambia migraciones, tablas, modelos DB ni RLS.
- No crea una entidad persistida de bundle.
- No convierte candidatos o conflictos en constraints hard.
- No bloquea ni vuelve infeasible ningún plan.
- No altera locks, estados `done`/`in_progress`, comida hard, disponibilidad o dependencias.
- No modifica Phase A, backtracking, neighborhoods, CP-SAT, scoring o selección de candidatos.
- No sustituye el resource model actual ni asegura que una asociación estadística sea un equipo real.
- No modela todavía setup time, operador, compatibilidad técnica, ubicación física o coste de traslado.

## Resultado Q

El escenario **Q — Diagnóstico de recurso compuesto** usa seis tareas y dos sets. `Camera 1 + Sound 1` y `Camera 2 + Sound 2` aparecen dos veces cada una; al final se cruzan simultáneamente como `Camera 1 + Sound 2` y `Camera 2 + Sound 1`.

Resultado reproducible de `npm run benchmark:engine`:

- `status=complete`;
- `plannedTasks=6`;
- `hardConstraintViolations=0`;
- presión de cámara: `tasks=6`, `peak=2`, `demand=2/2`, `fragile=6`;
- presión de sonido: `tasks=6`, `peak=2`, `demand=2/2`, `fragile=6`;
- `maxAnyOfPoolConcurrency=2`;
- `resourceSwitchCount=2`;
- `compositeResourceCandidateCount=6`;
- advertencias `ANYOF_POOL_FRAGILITY` y `RESOURCE_BUNDLE_CONFLICT` presentes;
- `solutionSource=phaseA_greedy` sobre un seed diagnóstico determinista, sin optimización ni cambio de horario.

Q demuestra que una anomalía operativa puede observarse sin convertirla en hard violation ni alterar la completitud.

## Resultado L

La jornada anonimizada tipo La Voz conserva:

- `status=complete` y `plannedTasks=99`;
- `hardConstraintViolations=0`;
- `mainStageGapMinutes=10`;
- `restrictiveTalentAverageStartOffset=103`;
- `coachSwitchCount=15`;
- `selectedCandidateMetricsConsistent=true`.

Las métricas nuevas muestran:

- pool cámara quantity 1: 60 tareas, pico 5, demanda `5/5`, utilización 100%, 12 tareas frágiles;
- pool sonido quantity 1: 84 tareas, pico 5, demanda nominal `5/4`, utilización 125%, 54 tareas frágiles;
- pool cámara quantity 2 de Main Stage: 20 tareas, pico 1, demanda `2/5`, utilización 40%, 0 tareas frágiles;
- `maxAnyOfPoolConcurrency=5`;
- `resourceSwitchCount=67`;
- `compositeResourceCandidateCount=54`;
- 16 warnings diagnósticos, incluidos 38 usos clasificados como conflictos concurrentes de bundle.

La demanda nominal `5/4` de sonido no se reinterpreta como hard violation en ID 017. Es evidencia de que medir requisitos de pool y medir asignaciones exclusivas no equivale todavía a representar un equipo técnico compuesto completo; precisamente justifica evolucionar el modelo con datos reales.

## Recomendación para ID 018

Priorizar un **modelo DB explícito de resource bundles**, precedido por validación de los candidatos de ID 017 con producción. El bundle debería poder declarar componentes, cantidades, nombre operativo, disponibilidad, compatibilidad por espacio y setup/cambio, manteniendo los recursos individuales como inventario trazable.

Orden recomendado:

1. validar y depurar asociaciones recurrentes con un dataset real anonimizado;
2. diseñar bundle + componentes sin eliminar `resource_items` ni los pools actuales;
3. migrar de forma aditiva y mantener compatibilidad hacia atrás;
4. usar bundles primero como soft scoring auditable;
5. solo después modelarlos en CP-SAT y decidir qué relaciones merecen ser hard;
6. dejar la UI admin para cuando el contrato y las reglas de validación estén estabilizados.

No se recomienda saltar directamente a CP-SAT con bundles inferidos: una coocurrencia estadística puede responder a disponibilidad circunstancial y no a una regla operativa real.

## ID 018 — Modelo persistente disponible, diagnóstico aún informativo

ID 018 añade el catálogo persistente `resource_bundles`, sus componentes y afinidades por espacio mediante `supabase/migrations/066_resource_bundles.sql`. Es un modelo aditivo: no sustituye recursos, items, componentes históricos, pools o availability, y ninguna tarea queda obligada a referenciar un bundle.

Los `compositeResourceCandidates` del diagnóstico exponen ahora una forma preparada para revisión y persistencia futura:

- `suggestedBundleName`;
- `componentResourceIds`, usando IDs globales de `resource_items` cuando están disponibles y nunca IDs del snapshot del plan;
- `componentRoles`, inferidos por categoría nominal/tipo;
- `observedCount`;
- `confidence` entre 0 y 1 como consistencia informativa de la observación.

Se conserva `occurrenceCount` como alias compatible para consumidores y benchmarks existentes. El diagnóstico no lee las tablas nuevas, no crea bundles automáticamente y no participa en hard constraints, scoring, selección de candidatos, Phase A o CP-SAT. El contrato y los riesgos del modelo persistente se documentan en `docs/RESOURCE_BUNDLES_MODEL.md`.

## ID 019 — Bundles declarados en diagnóstico

El diagnóstico mantiene los candidatos inferidos de ID 017 y añade la comparación con el catálogo declarado. Para cada tarea planificada traduce sus `assignedResources` del snapshot a `resourceItemId`, identifica bundles usados y calcula:

- `declaredResourceBundleCount`;
- `bundleComponentUsageCount`;
- `partialBundleUsageWarnings`;
- `bundleSpaceAffinityMatches`;
- `bundleSpaceAffinityMismatches`;
- `bundleSwitchPenalty`;
- `declaredBundleCandidateMatches`.

Las advertencias `PARTIAL_DECLARED_BUNDLE` y `BUNDLE_SPACE_AFFINITY_MISMATCH` son informativas. La primera aparece cuando se usa al menos un componente de un bundle pero faltan componentes requeridos; la segunda, cuando un bundle usado tiene afinidades declaradas pero el espacio actual no tiene afinidad positiva. Los switches se cuentan determinísticamente entre tareas consecutivas del mismo espacio que usan firmas de bundle distintas.

El diagnóstico sigue sin modificar el output. Los bundles inferidos y declarados pueden coincidir (`declaredBundleCandidateMatches`) o divergir; esa diferencia sirve para revisión operativa, no para crear reglas automáticamente.
