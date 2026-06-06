# ENGINE V3 STRESS BENCHMARK — ID 008 + ID 009

## Objetivo

ID 008 introduce un dataset operativo sintético realista para medir el Motor V3 en una jornada audiovisual de escala intermedia. El objetivo no es optimizar contra un microcaso, sino detectar falsos negativos, latencia, priorización de talents restrictivos, huecos de plató principal, uso de coaches, locks/ejecución y límites actuales antes de abordar un CP-SAT global.

El lote no toca migraciones, RLS, UI, modelos de base de datos ni reglas hard. La única reorganización de código productivo es un refactor puro: las métricas reutilizables pasan a `engine/v3/metrics.ts` para que `solutionScoring.ts` deje de depender conceptualmente de `engine/v3/benchmarks/metrics.ts`.

## Escenario I

**I — Jornada sintética realista** modela una jornada determinista con datos ficticios:

- **16 talents**: `Talent 01` a `Talent 16`.
- **80 tareas**: 5 tareas por talent.
- **6 espacios**: `Plató Principal`, `Sala Vocal A`, `Sala Vocal B`, `Sala Coaching`, `Sala Totales` y `Pasillo`.
- **2 coaches**: `Coach A` y `Coach B`, modelados como recursos exclusivos.
- **6 recursos de plan**: 2 coaches, 2 kits de micro y 2 packs de cámara.
- **1 plató principal**: zona principal `optimizerMainZoneId` con tareas `Main take` dependientes de feeders.
- **Comida global hard**: 17:00-17:30, incluida para verificar que el benchmark detecta cruces.
- **Disponibilidad restrictiva**: `Talent 01` sale a las 11:00 y `Talent 02` está disponible 09:15-12:00.
- **Estado operativo fijo**: una tarea `done`, una tarea `in_progress` y un lock manual de tiempo.
- **Dependencias**: las tareas de plató principal dependen de feeder de coach y feeder vocal; las tareas de totales dependen de la toma principal.
- **Tareas flexibles**: tareas de `Pasillo flexible` sin dependencias, diseñadas para competir con tareas restrictivas si el greedy prioriza mal.

## Métricas de stress

Además de las métricas históricas A-H, el benchmark imprime para todos los escenarios:

- `restrictiveTalentAverageStartOffset`
- `restrictiveTalentLatestFinishSlack`
- `mainStageUtilizationPercent`
- `tasksPerContestantMinMax`
- `resourceUtilizationSummary`

Las métricas puras viven en `engine/v3/metrics.ts`; `engine/v3/benchmarks/metrics.ts` queda como agregador benchmark que añade runtime, blockers estructurados y metadata V3.

## Resultado actual

Resultado de referencia de `npm run benchmark:engine` para escenario I en ID 008:

- `status: complete`
- `plannedTasks / totalTasks: 77 / 80`
- `runtimeMs: 57`
- `makespan: 395`
- `mainStageGapMinutes: 0`
- `mainStageGapCount: 0`
- `contestantWindowViolations: 0`
- `hardConstraintViolations: 0`
- `lockedTaskMovedCount: 0`
- `executedTaskMovedCount: 0`
- `coachSwitchCount: 44`
- `restrictiveTalentAverageStartOffset: 48`
- `restrictiveTalentLatestFinishSlack: 25`
- `mainStageUtilizationPercent: 100`
- `tasksPerContestantMinMax: 5-5`
- `resourceUtilizationSummary: 505:320m, 501:160m, 502:160m, 503:160m, 504:140m`
- `backtrackingAttempted: false`
- `backtrackingAccepted: false`
- `candidateSolutionsEvaluated: n/a`
- `solutionSource: phaseA_greedy`
- `warningsCount: 0`
- `infeasibleReasonCount: 0`

Comparativa segura con/sin backtracking:

- Backtracking off: `planned=77`, `mainStageGapMinutes=0`, `runtimeMs=60`, `candidateSolutionsEvaluated=n/a`, `solutionSource=phaseA_greedy`.
- Backtracking on: `planned=77`, `mainStageGapMinutes=0`, `runtimeMs=57`, `candidateSolutionsEvaluated=n/a`, `solutionSource=phaseA_greedy`.

En este dataset el backtracking no se activa porque Phase A greedy ya devuelve una solución completa sin señales comparativas de riesgo según la activación actual.

## Lectura operativa

- **Complete** significa que el motor no devuelve un plan parcial/infeasible, pero `plannedTasks` puede ser menor que `totalTasks` cuando tareas `done`, `in_progress` o locks no necesitan persistirse como movimientos nuevos.
- **Partial o infeasible** serían aceptables para el stress benchmark solo si no hay violaciones hard; deberían leerse como límite operativo actual, no como fallo técnico.
- **Backtracking no usado** en I indica que el comparador no encontró necesidad de explorar ramas: es una señal útil, no una garantía global.
- **Candidate selection** sigue demostrada por H; I confirma que en escala intermedia no se evalúan candidatos si no se activa la búsqueda.
- **Plató principal compacto**: I queda con 0 huecos y 100% de utilización dentro del span planificado del main stage.
- **Talents restrictivos**: quedan dentro de disponibilidad, aunque el offset medio de 48 minutos sugiere margen de mejora para priorizarlos antes.
- **Coaches**: 44 cambios secuenciales de recurso muestran que el dataset ya expone coste operativo de alternancia de coaches/recursos.

## Riesgos detectados

1. `plannedTasks` no equivale literalmente a `totalTasks` en presencia de tareas fijas; la documentación y métricas deben conservar esa semántica.
2. El escenario I no activa backtracking, por lo que el impacto comparativo real en escala queda pendiente para datasets con bloqueo greedy observable.
3. `coachSwitchCount` alto sugiere que la función objetivo todavía no modela suficientemente la continuidad de coaches.
4. La comida se valida por benchmark como bloque hard; conviene mantener canarios porque el motor puede tratar distintos tipos de comida de forma específica.
5. CP-SAT sigue omitido con `timeLimitMs: 0` en benchmark y no actúa como solver global.

## Recomendación para ID 009

Prioridad recomendada: **mejorar heurística de talents restrictivos y continuidad de coaches/feeders antes de CP-SAT global**.

Justificación:

- I ya completa sin hard violations, por lo que el primer cuello no es factibilidad bruta.
- Las señales operativas más visibles son `restrictiveTalentAverageStartOffset=48` y `coachSwitchCount=44`.
- Mejorar estas heurísticas dará criterios más sólidos y auditables para una futura función objetivo CP-SAT global.

ID 009 implementa esa recomendación como prioridad soft y añade el escenario J; el siguiente paso recomendado queda documentado en `docs/ENGINE_V3_OPERATIONAL_PRIORITY.md`.


## Actualización ID 009 — escenario J e impacto en I

ID 009 añade **J — Talent restrictivo y continuidad de coach** al benchmark. Resultado de referencia:

- `plannedTasks / totalTasks: 9 / 9`
- `runtimeMs: 2`
- `mainStageGapMinutes: 0`
- `hardConstraintViolations: 0`
- `coachSwitchCount: 2`
- `restrictiveTalentAverageStartOffset: 13`
- `restrictiveTalentLatestFinishSlack: 10`
- `solutionSource: phaseA_greedy`

El escenario I se mantiene seguro tras ID 009:

- Antes ID 008: `restrictiveTalentAverageStartOffset=48`, `restrictiveTalentLatestFinishSlack=25`, `coachSwitchCount=44`, `mainStageGapMinutes=0`, `hardConstraintViolations=0`, `runtimeMs=57`.
- Después ID 009: `restrictiveTalentAverageStartOffset=48`, `restrictiveTalentLatestFinishSlack=25`, `coachSwitchCount=44`, `mainStageGapMinutes=0`, `hardConstraintViolations=0`, `runtimeMs=53`.

La ausencia de mejora numérica en I se documenta como tradeoff operativo: el plan ya estaba dominado por 0 huecos de plató principal y restricciones hard. La mejora medible queda demostrada en J y en tests unitarios de scoring, sin romper A-I.

## Actualización ID 012 — siguiente nivel de stress realista

El escenario I se conserva como stress sintético intermedio y sigue siendo útil para medir la mejora de neighborhoods sobre coaches (`coachSwitchCount` 14 → 12 y `coachSwitchPenalty` 40 → 32 en la ejecución de referencia ID 012).

ID 012 añade el escenario L, que eleva la escala a 20 talents, 104 tareas, 10 espacios y recursos exclusivos de cámara/sonido. L completa con 0 hard violations, un hueco de Main Stage de 10 minutos, 98% de utilización y runtime de referencia de 107 ms. A diferencia de I, sus neighborhoods no generan candidatos, lo que delimita el alcance actual de la búsqueda operacional ante cadenas de dependencias y pools de recursos más ricos.

El análisis completo de L vive en `docs/ENGINE_V3_REALISTIC_VOICE_DAY.md`; I no se sustituye porque ambos escenarios observan riesgos distintos y complementarios.
