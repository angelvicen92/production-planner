# ENGINE V3 BENCHMARK — ID 004

## Objetivo

Este lote crea una suite objetiva de benchmark operativo para el motor V3 antes de tocar más lógica de planificación. La intención es medir comportamiento actual con escenarios pequeños, legibles y reproducibles, de forma que ID 005 y lotes posteriores puedan comparar mejoras sin depender de impresiones subjetivas.

El alcance es deliberadamente no funcional: no cambia reglas hard, reglas soft, función objetivo, locks, migraciones, RLS, UI ni código de persistencia. La suite llama a `generatePlanV3` como caja negra y calcula métricas puras sobre su salida.

## Relación con auditoría ID 003

La auditoría ID 003 documentó que la ruta principal ejecuta `generatePlanV3`, que Phase A es la fuente primaria de factibilidad y que CP-SAT existe como Fase B parcial, no como solver global completo. También dejó explícitos estos riesgos operativos:

- Phase A usa heurística greedy con reparaciones/local search limitadas.
- CP-SAT depende de una solución previa o parcial y no sustituye a Phase A como solver global.
- Puede existir falso negativo si una decisión greedy temprana consume una ventana, espacio o recurso que una tarea más restrictiva necesitaba después.
- La continuidad de plató principal se intenta mediante heurísticas, warnings y reparaciones, pero no está garantizada globalmente.
- La disponibilidad restrictiva de concursantes es una fuente central de factibilidad.
- Locks, tareas `done` y tareas `in_progress` son intocables para producto.

Los escenarios A-F se diseñan directamente alrededor de esos hallazgos para cubrir ventanas restrictivas, riesgo greedy, continuidad de plató principal, coaches exclusivos, locks/ejecución y comida global.

## Escenarios incluidos

| Escenario | Qué simula | Riesgo que cubre | Resultado actual | Observaciones |
|---|---|---|---|---|
| A — Talent con salida temprana | Varios concursantes con uno disponible solo hasta las 10:00 y tarea crítica en plató principal. | Disponibilidad restrictiva + competencia por espacios. | Completo; 4/4 tareas planificadas; 0 violaciones hard; 0 huecos de plató principal en la ejecución de referencia. | No exige hora exacta; mide si el talent restrictivo queda dentro de ventana. |
| B — Falso negativo greedy potencial | Tarea flexible y tarea restrictiva compiten por el mismo espacio en una ventana corta. | Falso negativo por orden greedy temprano. | Completo; 3/3 tareas planificadas; 0 violaciones hard. | El microcaso está mitigado por scoring actual, pero queda como canario reproducible para variantes más compuestas. |
| C — Plató principal sin huecos | Feeders, dependencias y tareas de main stage con ventana restrictiva. | Continuidad de plató principal no garantizada matemáticamente. | Completo; 5/5 tareas planificadas; 0 violaciones hard; 0 huecos en la ejecución de referencia. | Los huecos se miden como soft/diagnóstico, no como hard. |
| D — Coaches encadenados | Dos coaches exclusivos, tareas de coach y tareas relacionadas de plató principal. | Solape de recursos exclusivos y activación tardía de coach restrictivo. | Completo; 5/5 tareas planificadas; 0 violaciones hard; 2 cambios de coach en la ejecución de referencia. | `coachSwitchCount` se calcula desde recursos asignados por el motor. |
| E — Locks y ejecución intocable | Una tarea `done`, una `in_progress`, un lock manual y varias pending. | Movimiento accidental de ejecución o locks. | Completo; el motor devuelve 2/5 tareas movibles/planificables; 0 movimientos de locked/executed según métrica. | Las tareas fijas pueden no aparecer en `plannedTasks`; la métrica solo cuenta movimiento si el motor devuelve una hora distinta. |
| F — Comida / bloque global | Comida global 10:30-11:00 con tareas antes/después y disponibilidad restrictiva. | Tareas cruzando comida si el bloque global deja de ser hard. | Completo; 3/3 tareas planificadas; 0 cruces de comida; 60 minutos de hueco main stage en la ejecución de referencia. | La comida se modela con `input.meal` como bloque global operativo. |

## Métricas

Las métricas se calculan en `engine/v3/benchmarks/metrics.ts` como funciones puras sobre `EngineV3Input`, `EngineOutput` y `runtimeMs` medido por el runner.

| Métrica | Significado |
|---|---|
| `totalTasks` | Número de tareas de entrada del escenario. |
| `plannedTasks` | Número de filas devueltas en `output.plannedTasks`. En escenarios con ejecución/locks puede representar solo tareas que el motor necesita persistir o mover. |
| `unplannedTasks` | Número de `output.unplanned`; si no existe, fallback conservador a diferencia entre total y planned. |
| `makespan` | Minutos entre el primer inicio y el último fin de las tareas devueltas. Devuelve `null` si no puede calcularse. |
| `runtimeMs` | Tiempo de ejecución medido por el runner en milisegundos. |
| `mainStageGapMinutes` | Minutos de hueco entre tareas planificadas del `optimizerMainZoneId`. Devuelve `null` si no hay main zone. |
| `mainStageGapCount` | Número de huecos entre tareas planificadas del `optimizerMainZoneId`. Devuelve `null` si no hay main zone. |
| `contestantWindowViolations` | Tareas planificadas fuera de disponibilidad de concursante o ventana fija. |
| `hardConstraintViolations` | Suma diagnóstica de violaciones hard detectables por benchmark: ventanas, locks movidos, ejecución movida, solapes de concursante, espacio, recursos exclusivos, comida y dependencias. |
| `lockedTaskMovedCount` | Locks de tiempo/full devueltos por el motor con horario distinto al lock. Si no se devuelven, se interpretan como no movidos. |
| `executedTaskMovedCount` | Tareas `done`/`in_progress` devueltas con horario distinto al original. Si no se devuelven, se interpretan como no movidas. |
| `coachSwitchCount` | Cambios secuenciales entre recursos asignados, cuando hay recursos asignados; `null` si no hay datos de recursos. |
| `cpSatAttempted` | `output.v3Meta.cpSatAttempted` si existe; `null` si no hay metadata. |
| `cpSatAccepted` | `output.v3Meta.cpSatAccepted` si existe; `null` si no hay metadata. |
| `phaseAUsed` | `output.v3Meta.phaseAUsed` si existe; `null` si no hay metadata. |
| `backtrackingAttempted` | `output.v3Meta.backtrackingAttempted` si existe; desde ID 005 indica si se activó la búsqueda limitada. |
| `backtrackingAccepted` | `output.v3Meta.backtrackingAccepted` si existe; indica si una rama alternativa sustituyó al resultado greedy. |
| `backtrackingAttempts` | Número de intentos de ramas alternativas reportado por `v3Meta`. |
| `backtrackingBranchesExplored` | Número de ramas exploradas por la búsqueda limitada. |
| `solutionSource` | Fuente final declarada por V3: `phaseA_greedy`, `phaseA_backtracking`, `cp_sat`, `fallback` o `infeasible`. |
| `warningsCount` | Número de warnings devueltos por el motor. |
| `infeasibleReasonCount` | Número de reasons devueltos por el motor. |

Si una métrica requiere datos que no existen en el output, devuelve `null` en lugar de inventar información. La excepción son contadores hard donde la ausencia de una fila fija (`done`, `in_progress` o lock) se interpreta como “no movida”, porque el endpoint principal solo persiste filas que el motor devuelve.

## Resultado actual del motor

Ejecución de referencia con `npm run benchmark:engine`:

- Los seis escenarios A-F terminan en estado completo sin violaciones hard detectadas por la suite.
- Phase A aparece como usada en todos los escenarios (`phaseAUsed: true`).
- Desde ID 005 el runner muestra metadata de backtracking si está presente (`backtrackingAttempted`, `backtrackingAccepted`, `backtrackingAttempts`, `backtrackingBranchesExplored`, `solutionSource`) sin romper la salida anterior.
- CP-SAT no se intenta en esta suite porque el runner usa `timeLimitMs: 0` para mantener un benchmark rápido, determinista y centrado en la ruta Phase A caracterizada por ID 003.
- El riesgo greedy potencial del escenario B no se manifiesta en el microcaso actual: el scoring de ventanas restrictivas encuentra solución.
- La continuidad de plató principal queda bien en A-C-D, pero F muestra un hueco main stage esperado por comida/disponibilidad; ese hueco se reporta y no se transforma en hard.
- El escenario E confirma que locks y ejecución permanecen intocables según la métrica del benchmark; las tareas fijas no necesariamente aparecen en `plannedTasks`, lo cual es compatible con la semántica de persistir solo cambios planificables.
- Los tiempos observados son bajos en todos los escenarios pequeños; D y C son más costosos que B/E por recursos y dependencias, pero no hay señal de timeout.

## Riesgos detectados

1. **Falso negativo greedy en escenarios compuestos**: B pasa hoy, pero no prueba completitud. Sigue existiendo el riesgo identificado en ID 003 si recursos, dependencias y ventanas se combinan de forma menos favorable.
2. **Continuidad de plató principal como heurística**: C pasa y F reporta hueco esperado, pero no hay garantía matemática global de “sin huecos”.
3. **CP-SAT no observable en benchmark rápido**: el runner fija `timeLimitMs: 0` para reproducibilidad; por tanto las métricas CP-SAT quedan en `false` o `null` según metadata y no validan una Fase B global.
4. **Semántica de tareas fijas en `plannedTasks`**: E evidencia que `plannedTasks` no equivale necesariamente a “todas las tareas del plan”; las métricas deben tratar locks/ejecución por movimiento explícito, no por ausencia.
5. **Coach switches medidos desde recursos asignados**: `coachSwitchCount` solo es fiable cuando el output incluye `assignedResources`; si un escenario no modela recursos, se devuelve `null`.

## Nota ID 005

ID 005 implementa backtracking limitado mediante retry determinista de candidatos alternativos sobre Phase A. El benchmark conserva los escenarios A-F de ID 004 y añade visibilidad de metadata de backtracking; un cambio de metadata no implica por sí mismo regresión operativa si las métricas hard permanecen en cero.

## Recomendación histórica para ID 005

Recomendación concreta: **implementar backtracking limitado sobre Phase A**.

Justificación:

- Es la opción más alineada con el riesgo principal confirmado por ID 003: falsos negativos por decisiones greedy tempranas.
- Tiene menor coste y menor riesgo de integración que convertir CP-SAT en solver global real de una sola vez.
- Permite mantener las reglas hard/soft actuales y usar la suite ID 004 para comparar si disminuyen falsos negativos sin deteriorar locks, ejecución, comida, dependencias ni recursos exclusivos.
- Puede acotarse a casos de fallo o bloqueo tardío, por ejemplo reintentando un pequeño conjunto de órdenes alternativos para tareas con ventanas más restrictivas, recursos exclusivos o dependencias críticas.

ID 005 queda implementado en este lote mediante retry determinista de candidatos alternativos con metadata observable.

## Actualización ID 006 — Escenario G y métricas de blockers

ID 006 amplía el benchmark con el escenario **G — Backtracking activa y recupera solución**.

### Escenario G

El caso modela un plató principal compartido por:

- una tarea flexible de rehearsal con disponibilidad 09:00-11:00;
- una tarea restrictiva de un talent con salida temprana, disponible solo 09:00-10:00.

La pasada greedy de diagnóstico reproduce una decisión temprana que deja fuera a la tarea restrictiva. El backtracking limitado usa los blockers estructurados de disponibilidad/espacio para probar una rama alternativa y retrasa la tarea flexible a las 10:00.

Resultado de referencia de `npm run benchmark:engine` en ID 006:

- `status: complete`
- `plannedTasks / totalTasks: 2 / 2`
- `hardConstraintViolations: 0`
- `backtrackingAttempted: true`
- `backtrackingAccepted: true`
- `backtrackingAttempts: 1`
- `backtrackingBranchesExplored: 1`
- `solutionSource: phaseA_backtracking`

### Nuevas métricas

El runner imprime ahora:

- `structuredBlockersCount`
- `movableBlockersCount`
- `immovableBlockersCount`
- `unknownBlockersCount`

Cuando el output final no contiene blockers (por ejemplo porque el backtracking aceptó una solución completa), los contadores se muestran como `0`.
