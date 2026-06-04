# ENGINE V3 AUDIT — ID 003

## Resumen ejecutivo

El motor activo de planificación es un **híbrido parcial**:

- La ruta de producto ejecuta `generatePlanV3` desde `engine/v3/index.ts`.
- La fuente primaria de factibilidad es **Fase A heurística** (`solve_v3_phaseA_attempt` en `engine/v3/phaseAHeuristic.ts`).
- CP-SAT existe como **Fase B de mejora/optimización parcial** (`engine/v3/cpSatOptimizer.ts` + `engine/v3/python/cp_sat_service.py`), pero no sustituye a Fase A como solver global completo.
- El repositorio mantiene motor legacy (`engine/solve.ts`) y tests legacy. No está importado por la ruta principal de generación, pero sigue presente y testeado.
- El comportamiento actual mezcla generaciones: legacy conservado, Phase A heurística extensa, V3 orquestador, CP-SAT parcial y validación posterior de candidatos.

Conclusión principal: **el sistema no es todavía un solver matemático global de producción audiovisual**. Es una ruta V3 real con heurística greedy + reparaciones/local search + una Fase B CP-SAT limitada. Puede dar falsos negativos en escenarios donde una decisión greedy temprana consume un recurso/espacio/ventana que luego necesitaría una tarea más restrictiva, porque Fase A no hace backtracking exhaustivo y CP-SAT depende de una solución previa o parcial.

## Ruta real de ejecución

### App/UI

1. `client/src/pages/plan-details.tsx` fuerza `optimizerEngine: "v3"` si el plan no lo tiene antes de lanzar planificación.
2. La acción principal llama a `generatePlan.mutateAsync({ id, mode: "generate_planning", timeLimitMs })`.
3. La acción de “plan pending” llama a `generatePlan.mutateAsync({ id, mode: "plan_pending", timeLimitMs })`.
4. El panel/timeline también puede invocar `POST /api/plans/:id/generate` con modos compatibles.

### Endpoint principal

`server/routes.ts` registra `app.post(api.plans.generate.path, ...)`, que corresponde a `POST /api/plans/:id/generate` según `shared/routes.ts`.

Cadena real:

1. Parseo de body:
   - `mode`: `full`, `only_unplanned`, `replan_pending_respecting_locks`, `generate_planning`, `plan_pending`.
   - `timeLimitMs` opcional, máximo 300000.
2. Normalización de modos:
   - `generate_planning` → `full`.
   - `plan_pending` → `only_unplanned`.
3. Lee el plan y actualiza `optimizer_engine` a `v3` si no lo está.
4. Calcula tareas pending no bloqueadas y crea fila en `planning_runs` con `engine: "v3"`.
5. Si modo full/replan, limpia `start_planned/end_planned` de pending no bloqueadas.
6. Llama a `buildEngineInput(planId, storage)`.
7. Si modo `only_unplanned`, añade locks virtuales de tiempo para tareas ya planificadas, para no moverlas.
8. Llama a `generatePlanV3(engineInput, { requestId, timeLimitMs, onProgress })`.
9. Si `hardFeasible === false`, responde 422 y guarda estado infeasible/error en `planning_runs`.
10. Si no, persiste cada `plannedTask` con:
    - `storage.savePlannedBreakTimes` para breaks con `taskId < 0`.
    - `storage.updatePlannedTimes` para tareas normales.
11. Guarda warnings/stats en `plans.planning_warnings` y `plans.planning_stats`.
12. Responde JSON con `success`, `complete`, `warnings`, `planningStats`, `reasons`, `unplanned`, `insights` y `runId`.

### Otras rutas que ejecutan V3

- Creación de manual block: después de insertar un bloqueo manual, lanza un `setImmediate` que reconstruye input, ejecuta `generatePlanV3(engineInput)` y persiste si `result.feasible`.
- Debug generate: rutas `/api/debug/...` usan `buildEngineInput` y `generatePlanV3` para inspección.
- Validate/replan debug: también hay rutas de validación que ejecutan V3 para obtener diagnóstico sin pasar por toda la persistencia principal.

## Inventario de archivos

| Archivo | Estado | Usado por ruta principal | Observaciones |
|---|---:|---:|---|
| `engine/buildInput.ts` | Auxiliar usado por ruta principal | Sí | Construye `EngineInput` desde storage/DB, settings, disponibilidades, recursos, locks y optimizador. |
| `engine/types.ts` | Auxiliar usado por ruta principal | Sí | Contrato DB-agnóstico de entrada/salida. Se añadió `v3Meta` opcional para auditoría no invasiva. |
| `engine/v3/index.ts` | Ruta principal actual | Sí | Orquesta prevalidación, intentos Fase A por niveles soft y Fase B CP-SAT si hay presupuesto. |
| `engine/v3/types.ts` | Auxiliar usado por ruta principal | Sí | Alias de tipos V3 y opciones (`timeLimitMs`, `onProgress`). |
| `engine/v3/phaseAHeuristic.ts` | Ruta principal actual / Fase A | Sí | Heurística principal. Hace ordenación greedy con scoring, ventanas, recursos, locks, comida, continuidad main zone y reparaciones limitadas. |
| `engine/v3/cpSatOptimizer.ts` | Auxiliar usado por ruta principal | Sí, condicionado a `timeLimitMs > 0` | Invoca script Python con warm start y valida retorno en TS. |
| `engine/v3/python/cp_sat_service.py` | Fase B parcial | Sí, si existe Python/OR-Tools y presupuesto | Modelo CP-SAT limitado. Si OR-Tools no está disponible devuelve Fase A. |
| `engine/v3/validateCandidate.ts` | Auxiliar usado por ruta principal | Sí | Valida que candidato CP-SAT no rompa hard relevantes antes de aceptarlo. |
| `engine/v3/PHASE_B_CHECKLIST.md` | Documentación | No directo | Checklist previo de Fase B. |
| `engine/v3/phaseAHeuristic.legacy.ts` | Legacy aparentemente no usado | No en ruta principal | Snapshot/compat de Fase A anterior. |
| `engine/solve.ts` | Legacy usado todavía por tests, no por ruta principal | No en generación principal | Motor legacy `generatePlan`; archivo avisa que V3 real usa `phaseAHeuristic.ts`. |
| `engine/explain.ts` | Legacy/auxiliar mínimo | No visto en ruta principal actual | Stub de explicación antigua. |
| `engine/LEGACY_ENGINE_NOTES.md` | Documentación | No | Ya documenta que `/api/plans/:id/generate` usa V3 y legacy queda para limpieza futura. |
| `engine/solve.spec.ts` | Tests legacy | No runtime | Sigue cubriendo legacy. |
| `engine/v3/phaseA.spec.ts` | Tests V3 existentes | No runtime | Smoke/caracterización de Fase A/V3. |
| `engine/v3/validateCandidate.spec.ts` | Tests V3 existentes | No runtime | Cubre rechazo de movimiento de lock de tiempo. |
| `engine/v3/phaseAHeuristic.legacy.spec.ts` | Test legacy deshabilitado | No runtime | Snapshot intencionalmente deshabilitado. |
| `engine/v3/characterization.spec.ts` | Tests añadidos ID 003 | No runtime | Caracterización de ventanas restrictivas, riesgo greedy, continuidad main zone y metadata CP-SAT. |

## Fase A

### Algoritmo actual

Fase A está implementada en `solve_v3_phaseA_attempt` y `generatePlanV3PhaseASingle`.

Flujo simplificado:

1. Valida estructura mínima (`planId`, workday, meal).
2. Excluye tareas sin configuración operativa suficiente, con warnings.
3. Normaliza dependencias y resuelve dependencias por template/concursante.
4. Pre-carga ocupación de tareas fijas:
   - `in_progress`.
   - `done`.
   - locks de tiempo/full.
   - manual blocks.
5. Construye inventario de recursos y pools por espacio/zona/global.
6. Planifica comidas de concursantes antes de tareas no-comida.
7. Itera sobre tareas no-comida pendientes:
   - Calcula ready set por dependencias satisfechas.
   - Puntúa cada candidata.
   - Elige la mejor por score y orden original.
   - La coloca en el primer hueco factible avanzando en grid de 5 minutos.
   - Si no encaja, la marca unplanned o devuelve hard infeasible en casos específicos.
8. Ejecuta pasadas de continuidad/relocación limitada para plató principal.
9. Emite warnings/insights, incluyendo `MAIN_ZONE_GAP_STATS` y `V3_PHASEA_SCORING_DIAGNOSTIC`.

### Selección de siguiente tarea

La selección es greedy por iteración:

- Calcula `ready = pendingNonMeal.filter(depsSatisfied)`.
- Evalúa `scoreTaskForSelection(candidate)`.
- Ordena por score descendente y después por orden original.
- Toma el primer candidato.
- Lo elimina de `pendingNonMeal` antes de intentar planificarlo.

No hay búsqueda global del orden completo de tareas.

### Scoring relevante

El score combina múltiples señales:

- Peso base `priority/weight`.
- Main zone finish early.
- Main zone keep busy si ya empezó.
- Compactación de concursante.
- Agrupación por template/espacio/zona.
- Mantener concursante en la misma zona.
- Penalización/bonus por span total del concursante.
- Bonus por ventana corta y salida temprana.
- Bonus a “feeders” que desbloquean tareas del plató principal.
- Penalizaciones por cambios de template/actividad en main space.
- Penalizaciones por ventanas protegidas en reparaciones.

### Disponibilidad de concursante

La ventana efectiva de concursante es `workDay ∩ contestantAvailabilityById[contestantId]`. En `scheduleNonMealTask`:

- Si la ventana es inválida, devuelve `CONTESTANT_NO_AVAILABILITY`.
- El start mínimo se sube a `effWin.start`.
- El end máximo permitido es `min(endDay, effWin.end)`.
- Si no cabe, devuelve razón `CONTESTANT_NOT_AVAILABLE`, `SPACE_BUSY`, `RESOURCE_NOT_AVAILABLE` u otra última causa según el bump.

### Salida temprana

Hay priorización explícita:

- Concursantes con `candidateEffWin.end <= 16:00` reciben `earlyContestantChainBonus` y score por urgencia/slack.
- Ventanas cortas reciben bonus por longitud efectiva: `<180`, `<240`, `<300`, `<360` minutos.
- Se calcula `contestantUrgency` por concursante, ordenada por fin de ventana y slack.

Esto reduce falsos negativos simples por ventanas cortas, pero no equivale a una prueba global de factibilidad.

### Plató principal

El plató principal se trata como heurística/near-hard según configuración:

- `optimizerMainZoneId` identifica zona principal.
- `mainZoneKeepBusy` y `mainZoneFinishEarly` afectan score.
- Hay lógica de “start gate” para evitar falsos arranques que generen huecos al inicio.
- Hay `getMainZoneGap`, `tryPlaceTaskInExactWindow` y `runMainZoneNoIdlePass` para rellenar/reducir huecos.
- Si no se consigue continuidad, se emiten warnings/insights (`MAIN_ZONE_NO_IDLE_NOT_ACHIEVABLE`, `MAIN_ZONE_GAP_STATS_AVAILABLE`, `MAIN_ZONE_GAP_STATS`).

Conclusión: continuidad del plató principal **no es hard global por defecto**. Es una mezcla de score, reparaciones y diagnóstico.

### Coaches, equipos itinerantes y recursos críticos

- Recursos se modelan por `resourceRequirements.byItem`, `byType` y `anyOf`.
- Pools se prefieren en orden espacio → zona → global.
- Recursos asignados se reservan en `occupiedByResource` y no solapan.
- Equipos itinerantes se reservan en `occupiedByItinerant`.
- Wrap/inner itinerante permite solapes controlados alrededor de una tarea inner.
- Coaches se tratan como recursos/tipos/items según input; no hay modelo semántico CP global específico de “coach” salvo disponibilidad/ocupación del recurso asignado.

### Backtracking/lookahead

Fase A no tiene backtracking exhaustivo.

Sí tiene:

- Lookahead de feeders al plató principal.
- Reparaciones derivadas de diagnóstico (`solve_v3_phaseA_with_repairs`) para algunos escenarios.
- Reubicación local limitada de gaps del plató principal.
- Búsquedas locales con límites (`maxIterations`, `beamWidth`, `maxMoves`, `maxSteps`).

No tiene:

- Enumeración global de órdenes.
- Deshacer una secuencia completa de decisiones si una tarea tardía queda bloqueada.
- Prueba de completitud tipo CP/MIP para todos los hard constraints.

### Riesgo de falso negativo

Sí, Fase A puede dar falso negativo aunque exista solución.

Ejemplo conceptual:

1. Hay una tarea flexible F con disponibilidad 09:00–18:00 y una tarea restrictiva R con disponibilidad 09:00–09:30.
2. Ambas requieren el mismo espacio/recurso durante 30 minutos.
3. Si scoring/orden coloca F a las 09:00, R ya no cabe.
4. La solución existe: R 09:00–09:30 y F después.
5. Si el bonus de urgencia no gana en ese caso concreto, o si la restricción viene por combinación de recurso/coach/dependencia más compleja, Fase A puede marcar R como unplanned sin reconstruir globalmente el orden.

Los tests ID 003 capturan el caso simple como comportamiento actual mitigado: hoy el motor sí prioriza la ventana restrictiva en ese escenario pequeño. Eso no prueba ausencia de falsos negativos en escenarios compuestos.

## CP-SAT

### Papel real

`generatePlanV3` llama a CP-SAT solo después de tener un resultado de Fase A (`output` completo o `fallback` parcial) y solo si `timeLimitMs > 0`.

La Fase B:

1. Recibe `engineInput`, `warmStart` y `timeLimitSeconds`.
2. Invoca `engine/v3/python/cp_sat_service.py` vía `python3`.
3. Si falta script, falla Python, no está OR-Tools o no hay solución CP, conserva Fase A.
4. Si devuelve candidato, TypeScript llama a `validateOptimizedCandidate`.
5. Solo acepta CP-SAT si no hay errores de validación.
6. Añade insight `V3_PHASE_B_QUALITY`.

### Variables que crea

En Python crea para cada tarea:

- `s_<tid>` start slot.
- `e_<tid>` end slot.
- `iv_<tid>` interval var.
- Duración discretizada en slots de 5 minutos.
- Variables de distancia absoluta al warm start.
- Variables de ocupación para slots cercanos a main zone warm start.
- Makespan.
- Span por concursante.
- Dispersión proxy por template/espacio en main zone.
- Bool de degradación para near-hard level 10.

### Constraints modeladas

Modela realmente:

- Dominio por jornada y disponibilidad de concursante.
- Tareas fijas por status `in_progress`, `done`, `cancelled` y locks time/full.
- No overlap por espacio.
- No overlap por concursante.
- No overlap por recursos ya asignados en warm/planning rows.
- Dependencias `dependsOnTaskIds`.
- Límite de rupturas near-hard level 10 por grouping.

### Constraints no modeladas o parciales

No modela de forma global completa:

- Asignación nueva de recursos. Usa `assignedResources` del warm start/tarea; no resuelve pools `byType/byItem/anyOf` desde cero.
- Selección de coaches alternativos desde pools.
- Equipos itinerantes/WRAP con toda la semántica de Fase A.
- Comidas de concursantes con capacidad simultánea completa.
- Bloques globales de comida de plató tal como Fase A los maneja.
- Tareas manual block como entidad especial más allá de tiempos fijos si aparecen como fijas.
- Excepciones de meal template/space missing como Fase A.
- Main-zone continuity como hard global; usa objetivo/proxy de ocupación alrededor del warm start.
- Cambios de espacio o reasignación de espacio. El espacio viene de la tarea/warm row.

### Warm start y dependencia de Fase A

CP-SAT depende fuertemente de Fase A:

- Recibe `warmStart` desde Fase A.
- Usa hints de inicio si caen en dominio.
- Usa `assignedResources` del warm start.
- Su objetivo penaliza distancia al warm start.
- La ocupación de main zone se construye alrededor de slots del warm start.
- Si no hay warm rows válidas, puede crear variables, pero pierde mucha información y no reconstruye recursos/semántica completa.

### ¿Puede construir solución desde cero?

Parcialmente para tiempos de tareas, pero **no globalmente**:

- Puede asignar starts dentro de dominios y respetar algunos no-overlap/dependencias.
- No puede reconstruir asignación completa de recursos/coaches/pools ni varias reglas operativas de Fase A.
- Si Fase A no asignó recursos o omitió semántica, CP-SAT no la inventa correctamente.

### Qué ocurre si CP-SAT mejora o falla

- Si CP-SAT devuelve candidato válido y aceptado: se usa `optimized.output`.
- Si no optimiza, falla, OR-Tools no existe, o candidato rompe validación: se conserva Fase A.
- El insight `V3_PHASE_B_QUALITY` y `v3Meta` indican intento/aceptación/motivo.

### Conclusión obligatoria

CP-SAT actual es fuente de verdad global: **no**.

Es una fuente parcial de mejora temporal y calidad sobre warm start, validada por TypeScript.

Para ser fuente global faltaría:

1. Modelar todos los hard constraints de Fase A.
2. Resolver asignación de recursos/coaches/equipos alternativos, no solo conservar los asignados.
3. Modelar comidas, locks, tareas ejecutadas, manual blocks y disponibilidad de forma equivalente a Fase A.
4. Modelar continuidad main zone como objetivo/hard/near-hard explícito y trazable.
5. Aceptar solución CP como verdad primaria solo tras validación completa y explicación.
6. Crear benchmark de escenarios reales y tests de equivalencia hard entre Fase A y CP.

## Riesgos actuales

1. **Falso negativo por greedy**: Fase A elige una tarea por score y no deshace globalmente decisiones tempranas.
2. **CP-SAT parcial**: no cubre recursos/coaches/pools/equipos/comidas con la misma semántica que Fase A.
3. **Dependencia de warm start**: CP-SAT no es independiente; mejora o conserva una solución previa/parcial.
4. **Continuidad main zone no hard**: hay heurísticas y warnings, pero no garantía global.
5. **Legacy vivo**: `engine/solve.ts` sigue existiendo y testeándose; aunque no está en ruta principal, puede confundir futuras integraciones.
6. **Explicabilidad fragmentada**: hay insights/warnings, pero hasta ID 003 faltaba metadata compacta de fases ejecutadas.
7. **Divergencia TS/Python**: reglas hard evolucionan en Fase A, pero CP-SAT debe mantenerse manualmente en paralelo.
8. **Tests insuficientes históricos**: había tests V3, pero faltaban caracterizaciones explícitas de salida temprana, peligro greedy, huecos main zone y metadata CP-SAT.

## Tests añadidos

Se añadió `engine/v3/characterization.spec.ts` con cuatro bloques:

1. **Talent con salida temprana**
   - Verifica que la ventana de disponibilidad se respeta.
   - Caracteriza que la tarea restrictiva no queda detrás de una flexible del mismo main space.

2. **Orden greedy potencialmente peligroso**
   - Crea escenario donde una tarea flexible por orden/id podría bloquear una restrictiva.
   - El comportamiento actual encuentra solución y coloca la restrictiva primero.
   - El test no afirma que el motor sea global; solo captura el comportamiento actual.

3. **Continuidad de plató principal**
   - Crea hueco obligado por disponibilidad.
   - Verifica que `MAIN_ZONE_GAP_STATS` se emite.
   - Verifica que el hueco no convierte el plan en hard infeasible.

4. **CP-SAT execution metadata**
   - Ejecuta con `timeLimitMs > 0`.
   - Verifica `v3Meta.prevalidationRun`, `phaseAUsed`, `phaseAFoundSolution`, `cpSatAttempted` y `cpSatReason`.
   - Mantiene también el insight `V3_PHASE_B_QUALITY`.

## Instrumentación añadida

Se añadió metadata opcional `v3Meta` a `EngineOutput`:

- `prevalidationRun`
- `prevalidationOk`
- `phaseAUsed`
- `phaseAFoundSolution`
- `cpSatAttempted`
- `cpSatFoundSolution`
- `cpSatAccepted`
- `cpSatReason`
- `fallbackReason`
- `plannedCount`
- `unplannedCount`
- `makespanMinutes`
- `warningsTop`

Esta metadata es opcional, no cambia reglas hard/soft, no cambia objetivo, no modifica locks, no toca UI y no altera persistencia. Solo acompaña el resultado para auditoría y tests.

## Recomendación técnica — ID 004

Recomendación prioritaria: **crear benchmark de escenarios reales + convertir CP-SAT en solver global por etapas**.

Orden sugerido para ID 004:

1. Crear suite de benchmark con escenarios reales anonimizados:
   - ventanas cortas/salida temprana,
   - coaches compartidos,
   - main zone con continuidad exigente,
   - locks/manual blocks,
   - tareas ejecutadas/in progress,
   - comidas y equipos itinerantes.
2. Definir contrato único de hard constraints en tests compartidos.
3. Ampliar CP-SAT para modelar recursos desde pools (`byType`, `byItem`, `anyOf`) y comidas.
4. Comparar Fase A vs CP-SAT en benchmark y registrar falsos negativos.
5. Solo después decidir si:
   - CP-SAT pasa a fuente global,
   - o Fase A incorpora backtracking limitado para escenarios críticos.

No se recomienda limpiar legacy antes de tener benchmark y trazabilidad, porque el legacy puede servir como referencia histórica durante la transición.
