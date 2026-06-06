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

Los escenarios A-F se diseñan directamente alrededor de esos hallazgos para cubrir ventanas restrictivas, riesgo greedy, continuidad de plató principal, coaches exclusivos, locks/ejecución y comida global. ID 006 añade G, ID 007 añade H e ID 008 añade I como stress sintético realista.

## Escenarios incluidos

| Escenario | Qué simula | Riesgo que cubre | Resultado actual | Observaciones |
|---|---|---|---|---|
| A — Talent con salida temprana | Varios concursantes con uno disponible solo hasta las 10:00 y tarea crítica en plató principal. | Disponibilidad restrictiva + competencia por espacios. | Completo; 4/4 tareas planificadas; 0 violaciones hard; 0 huecos de plató principal en la ejecución de referencia. | No exige hora exacta; mide si el talent restrictivo queda dentro de ventana. |
| B — Falso negativo greedy potencial | Tarea flexible y tarea restrictiva compiten por el mismo espacio en una ventana corta. | Falso negativo por orden greedy temprano. | Completo; 3/3 tareas planificadas; 0 violaciones hard. | El microcaso está mitigado por scoring actual, pero queda como canario reproducible para variantes más compuestas. |
| C — Plató principal sin huecos | Feeders, dependencias y tareas de main stage con ventana restrictiva. | Continuidad de plató principal no garantizada matemáticamente. | Completo; 5/5 tareas planificadas; 0 violaciones hard; 0 huecos en la ejecución de referencia. | Los huecos se miden como soft/diagnóstico, no como hard. |
| D — Coaches encadenados | Dos coaches exclusivos, tareas de coach y tareas relacionadas de plató principal. | Solape de recursos exclusivos y activación tardía de coach restrictivo. | Completo; 5/5 tareas planificadas; 0 violaciones hard; 2 cambios de coach en la ejecución de referencia. | `coachSwitchCount` se calcula desde recursos asignados por el motor. |
| E — Locks y ejecución intocable | Una tarea `done`, una `in_progress`, un lock manual y varias pending. | Movimiento accidental de ejecución o locks. | Completo; el motor devuelve 2/5 tareas movibles/planificables; 0 movimientos de locked/executed según métrica. | Las tareas fijas pueden no aparecer en `plannedTasks`; la métrica solo cuenta movimiento si el motor devuelve una hora distinta. |
| F — Comida / bloque global | Comida global 10:30-11:00 con tareas antes/después y disponibilidad restrictiva. | Tareas cruzando comida si el bloque global deja de ser hard. | Completo; 3/3 tareas planificadas; 0 cruces de comida; 60 minutos de hueco main stage en la ejecución de referencia. | La comida se modela con `input.meal` como bloque global operativo. |
| I — Jornada sintética realista | 16 talents, 80 tareas, 6 espacios, 2 coaches, 6 recursos, comida, locks, `done`/`in_progress` y feeders hacia plató principal. | Escala intermedia, priorización restrictiva, huecos de plató, coaches y efectos de locks/ejecución. | Completo; 77/80 filas planificadas; 0 violaciones hard; 0 huecos de plató principal en la ejecución de referencia. | Stress benchmark ID 008; detalle completo en `docs/ENGINE_V3_STRESS_BENCHMARK.md`. |

## Métricas

Las métricas puras reutilizables se calculan en `engine/v3/metrics.ts`. `engine/v3/benchmarks/metrics.ts` queda como agregador específico de benchmark sobre `EngineV3Input`, `EngineOutput`, `runtimeMs`, blockers estructurados y metadata V3.

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

## Actualización ID 007 — Escenario H y metadata de selección

ID 007 amplía el benchmark con el escenario **H — Elegir mejor entre dos soluciones válidas**. El escenario comprueba que el motor evalúa al menos dos candidatos y selecciona una alternativa backtracking válida cuando reduce huecos del plató principal sin introducir violaciones hard.

El runner imprime nueva metadata compacta: `candidateSolutionsEvaluated`, `bestCandidateSource`, `candidateSelectionReason` y `bestCandidateScore`. Esto permite auditar por qué se eligió una rama sin inspeccionar manualmente todo el calendario.


## Actualización ID 008 — Stress benchmark sintético

ID 008 añade el escenario **I — Jornada sintética realista** y amplía la salida del runner con métricas de stress: latencia, planned/unplanned, huecos de plató, violaciones hard, locks/ejecución movidos, switches de coach, metadata de backtracking/candidate selection, blockers estructurados, warnings, razones infeasible, offset de talents restrictivos, slack de cierre, utilización de plató principal, tareas por concursante y resumen de utilización de recursos.

La ejecución de referencia para I es completa, con `77 / 80` filas planificadas, `hardConstraintViolations: 0`, `mainStageGapMinutes: 0`, `coachSwitchCount: 44`, `solutionSource: phaseA_greedy` y backtracking no activado.

El runner falla si un escenario completo presenta violaciones hard o si se detecta movimiento de locks/tareas `done`/`in_progress`; no falla por optimización imperfecta o por un escenario de stress partial/infeasible sin violaciones hard.

## Actualización ID 010 — Vecindarios operativos y escenario K

ID 010 amplía el benchmark con la metadata de vecindarios operativos acotados:

- `neighborhoodSearchAttempted`
- `neighborhoodCandidatesGenerated`
- `neighborhoodCandidateAccepted`
- `neighborhoodAcceptedReason`

También añade **K — Vecindario mejora plan completo**, un caso compacto donde Phase A greedy ya completa, pero un vecindario local mejora el timing de un talent restrictivo sin aumentar `mainStageGapMinutes` ni introducir violaciones hard.

Resultado de referencia de K:

- `plannedTasks / totalTasks: 4 / 4`
- `hardConstraintViolations: 0`
- `mainStageGapMinutes: 0`
- `restrictiveTalentAverageStartOffset: 0`
- `candidateSolutionsEvaluated: 2`
- `neighborhoodCandidatesGenerated: 1`
- `neighborhoodCandidateAccepted: true`
- `neighborhoodAcceptedReason: advance_restrictive_talent`
- `solutionSource: operational_neighborhood`

Resultado de referencia de I tras ID 010:

- `plannedTasks / totalTasks: 77 / 80`
- `hardConstraintViolations: 0`
- `mainStageGapMinutes: 0`
- `restrictiveTalentAverageStartOffset: 48`
- `coachSwitchCount: 44`
- `candidateSolutionsEvaluated: 4`
- `neighborhoodCandidatesGenerated: 3`
- `neighborhoodCandidateAccepted: true`
- `neighborhoodAcceptedReason: coach_block_compaction`
- `solutionSource: operational_neighborhood`

La comparación del runner imprime I con vecindarios off/on. En la referencia ID 010, apagar vecindarios conserva la seguridad (`hardConstraintViolations: 0`, `mainStageGapMinutes: 0`) y encenderlos permite evaluar 3 candidatos locales y aceptar uno sin mover locks ni ejecución.

## ID 011 — Consistencia entre scoring y métricas

### Divergencia corregida

Hasta ID 010, el scoring y el runner etiquetaban dos magnitudes diferentes como si fueran comparables:

- el scoring usaba `coachSwitchPenalty`, limitada a recursos coach y ponderada por alternancias A/B/A y feeders de plató;
- el benchmark calculaba `coachSwitchCount` comparando todos los `assignedResources`, por lo que escenario I imprimía `44` frente a `coachSwitch=32` en `bestCandidateScore`.

ID 011 introduce una fuente única en `engine/v3/metrics.ts`. El benchmark y el scoring calculan sobre el mismo output final:

- `coachSwitchCount` (conteo bruto, solo coaches);
- `coachSwitchPenalty` (penalización ponderada usada para ordenar candidatos);
- timing medio de talents restrictivos;
- huecos de plató principal;
- makespan;
- violaciones hard.

El runner imprime `selectedCandidateMetrics` y `selectedCandidateMetricsConsistent`. Una divergencia entre el snapshot elegido y el output final se muestra con `⚠️ METRICS DIVERGENCE` y hace fallar el benchmark.

### Lectura honesta de `candidateSelectionReason`

- `fewer coach switches`: el conteo bruto de coaches del candidato seleccionado es menor.
- `lower weighted coach-switch penalty (...)`: mejora la función ponderada, pero el conteo bruto no baja; el texto incluye si queda igual o cuál fue la comparación.

### Resultado de referencia de escenario I

Antes de aplicar el vecindario (off): `coachSwitchCount=14`, `coachSwitchPenalty=40`.

Después de seleccionar `operational_neighborhood` (on): `coachSwitchCount=12`, `coachSwitchPenalty=32`, `mainStageGapMinutes=0`, `restrictiveTalentAverageStartOffset=48`, `hardConstraintViolations=0` y `selectedCandidateMetricsConsistent=true`.

El valor histórico `coachSwitchCount=44` queda explicado como conteo de cambios de cualquier recurso asignado y deja de presentarse como métrica de coaches.

## Actualización ID 012 — escenario L realista anonimizado

ID 012 incorpora **L — Jornada audiovisual anonimizada tipo La Voz** como escenario de escala superior a I: 20 talents, 104 tareas, 10 espacios, 2 coaches, 5 cámaras, 4 sonidos, dos salas de totales, dos sets reality, feeders pre/post, cuatro condiciones instrumentales, cinco disponibilidades restrictivas, dos `done`, un `in_progress` y dos locks.

Resultado de referencia:

- `status: complete`
- `totalTasks: 104`
- `plannedTasks: 99`
- `unplannedTasks: 0`
- `runtimeMs: 107`
- `makespan: 642`
- `mainStageGapMinutes: 10`
- `mainStageGapCount: 1`
- `mainStageUtilizationPercent: 98`
- `restrictiveTalentAverageStartOffset: 106`
- `restrictiveTalentLatestFinishSlack: 28`
- `coachSwitchCount: 16`
- `coachSwitchPenalty: 46`
- `hardConstraintViolations: 0`
- `lockedTaskMovedCount: 0`
- `executedTaskMovedCount: 0`
- `candidateSolutionsEvaluated: 1`
- `solutionSource: phaseA_greedy`
- `candidateSelectionReason: no operational neighborhood candidate generated`
- `neighborhoodSearchAttempted: true`
- `neighborhoodCandidatesGenerated: 0`
- `neighborhoodCandidateAccepted: false`
- `selectedCandidateMetricsConsistent: true`

El runner imprime ahora `totalTasks`, `plannedTasks` y `unplannedTasks` como campos separados y ejecuta una comparación neighborhoods off/on también para L. En la referencia, off/on conserva las mismas métricas de calidad (`planned=99`, hueco de plató 10, offset restrictivo 106, 16 cambios de coach y penalización 46); el runtime fue 79 ms off y 107 ms on.

La descripción completa, lectura operativa, riesgos y recomendación para ID 013 están en `docs/ENGINE_V3_REALISTIC_VOICE_DAY.md`.

## ID 013 — Vecindarios feeder-aware

ID 013 añade el escenario **M — Feeder-aware neighborhood improves Main Stage** y amplía la instrumentación de vecindarios. Las cifras de runtime son orientativas y dependen de la máquina; los invariantes funcionales son los criterios estables.

| Escenario | Candidates | Accepted | Source | Main gap final | Hard violations | Metrics consistent |
|---|---:|---:|---|---:|---:|---:|
| L — Jornada tipo La Voz | 1 | no | `phaseA_greedy` | 10 min | 0 | sí |
| M — Feeder-aware improvement | 2 | sí | `operational_neighborhood` | 0 min | 0 | sí |

### Lectura de L antes/después

| Métrica | ID 012 | ID 013 |
|---|---:|---:|
| neighborhoodCandidatesGenerated | 0 | 1 |
| candidateSolutionsEvaluated | 1 | 2 |
| neighborhoodCandidateAccepted | no | no |
| mainStageGapMinutes | 10 | 10 |
| restrictiveTalentAverageStartOffset | 106 | 106 |
| coachSwitchCount | 16 | 16 |
| hardConstraintViolations | 0 | 0 |

L ya alcanza el objetivo mínimo de generar un vecino hard-válido. No se acepta porque el swap feeder encontrado empata con la solución greedy en gaps, lateness restrictiva, feeders, coaches y makespan. El motor conserva el desempate estable y no fabrica una mejora.

### Escenario M

M contiene una apertura de Main Stage, un Vocal feeder tardío, una actuación dependiente y un talent semi-restrictivo. La solución greedy completa deja una oportunidad local; la búsqueda genera dos vecinos y selecciona uno que compacta Main Stage. El resultado final cumple:

- `neighborhoodSearchAttempted=true`;
- `neighborhoodCandidatesGenerated=2`;
- `neighborhoodCandidateAccepted=true`;
- `solutionSource=operational_neighborhood`;
- `hardConstraintViolations=0`;
- `selectedCandidateMetricsConsistent=true`.

### Riesgos residuales y recomendación para ID 014

El principal límite es que cada vecino parte del mismo plan base. La recomendación para **ID 014** es una búsqueda local de profundidad dos, todavía determinista y con presupuesto estricto, que permita encadenar `feeder_advance` seguido de `main_stage_gap_fill`. Debe conservar el límite hard-first, evitar beam search amplio y medir explícitamente coste de runtime en I, L y M.

## ID 014 — Búsqueda local depth 2

### Límites y cadenas

La búsqueda parte del greedy completo, genera hasta 10 candidatos depth 1 y expande cada candidato elegible con hasta 5 hijos. El presupuesto global es de 30 soluciones evaluadas incluyendo el greedy base. El orden es estable y no usa aleatoriedad ni cortes por runtime exacto.

Cadenas habilitadas: `feeder_advance -> main_stage_gap_fill`, `restrictive_talent_bundle -> feeder_advance`, `coach_block_compaction -> main_stage_gap_fill` y `feeder_advance -> coach_block_compaction`.

### Escenario L

| Métrica | ID 013 | ID 014 |
|---|---:|---:|
| Candidatos depth 1 | 1 | 2 |
| Candidatos depth 2 | 0 | 1 |
| Cadenas evaluadas | 0 | 1 |
| Main Stage gap | 10 min | 10 min |
| Coach switches | 16 | 16 |
| Inicio medio talent restrictivo | 106 min | 105 min |
| Hard violations | 0 | 0 |
| Métricas seleccionadas consistentes | true | true |

La cadena depth 2 no gana en L; el candidato depth 1 aceptado mejora un minuto el timing restrictivo sin empeorar el hueco. No se fuerza una mejora falsa de Main Stage.

### Escenario N

N aísla la búsqueda local sobre un plan completo determinista. El greedy seed tiene un hueco de Main Stage de 10 minutos. `feeder_advance` por sí solo mantiene ese hueco; `main_stage_gap_fill` solo es hard-válido después del swap de feeders.

Resultado ID 014:

- `neighborhoodSearchAttempted=true`;
- `neighborhoodSearchDepth=2`;
- `neighborhoodDepth1Candidates=1`;
- `neighborhoodDepth2Candidates=1`;
- `neighborhoodChainsEvaluated=1`;
- `neighborhoodAcceptedChain=feeder_advance -> main_stage_gap_fill`;
- `solutionSource=operational_neighborhood`;
- `mainStageGapMinutes: 10 -> 0`;
- `hardConstraintViolations=0`;
- `selectedCandidateMetricsConsistent=true`.

### Riesgos residuales y siguiente paso

La cobertura sigue siendo local y las cadenas están enumeradas explícitamente. ID 015 debería estudiar movimientos compactos de 2-3 tareas con duraciones distintas y telemetría de cadenas rechazadas; CP-SAT global debe reservarse para cuando estos operadores acotados dejen de producir mejoras medibles.

## ID 015 — CP-SAT pilot Main Stage + feeders

El runner añade `cpSatPilotAttempted`, `cpSatPilotAccepted`, `cpSatPilotTaskCount`, `cpSatPilotRuntimeMs`, `cpSatPilotReason` y `cpSatPilotImprovementSummary`.

| Escenario | Attempted | Accepted | Task count | Razón | Main gap | Hard | Source |
|---|---:|---:|---:|---|---:|---:|---|
| O — CP-SAT pilot | sí | sí | 5 | `accepted` | 20 → 0 | 0 | `cp_sat_pilot` |
| L — Jornada tipo La Voz | no | no | 52 | `task_limit_exceeded` | 10 | 0 | `operational_neighborhood` |

O demuestra que el candidato adicional pasa por el comparador común y mejora un warm start válido. L documenta el límite en vez de ejecutar un subproblema excesivo. En el entorno CI de referencia OR-Tools no está instalado y O usa el fallback determinista del seam; la ruta Python queda preparada para fijar únicamente los IDs seleccionados cuando OR-Tools está disponible.

## ID 016 — Segmentación CP-SAT

ID 016 sustituye la puerta monolítica del piloto por selección determinista de bloques críticos, sin cambiar hard constraints ni elevar el límite global. Los tipos evaluables son `gap`, `restrictive_talent` y `coach_block`, en ese orden. Cada bloque tiene un máximo de 18 tareas, cada plan evalúa como máximo tres y cada llamada usa un presupuesto bajo de 0,5 segundos. El benchmark imprime `cpSatSegmentsAttempted`, `cpSatSegmentsAccepted`, razones, tamaños, mejor tipo y resumen de resultados.

### L antes/después

| Métrica | ID 015 | ID 016 |
|---|---:|---:|
| Scope global detectado | 52 | 52 |
| Motivo/resultado CP-SAT | `task_limit_exceeded` | `accepted` |
| Segmentos intentados/aceptados | 0 / 0 | 3 / 1 |
| Tamaños de segmento | n/a | 18, 15, 11 |
| Main Stage gap | 10 | 10 |
| Offset restrictivo medio | 105 | 103 |
| Coach switches | 16 | 15 |
| Coach penalty | 46 | 42 |
| Hard violations | 0 | 0 |
| Métricas seleccionadas consistentes | true | true |
| Solution source | `operational_neighborhood` | `cp_sat_pilot` |

El gap segment de L no fue aceptado; la mejora procede de un restrictive talent segment. No se atribuye al solver una eliminación del hueco que no ocurrió.

### Escenario P — CP-SAT segment mejora hueco local

P modela 32 tareas relacionadas (16 Main Stage y 16 feeders), por encima del límite global de 30. El selector encuentra un gap segment de 8 tareas y un restrictive talent segment de 4. Se intentan ambos y se acepta el gap segment:

- `mainStageGapMinutes: 10 → 0`;
- `cpSatPilotAttempted=true`;
- `cpSatSegmentsAttempted=2`;
- `cpSatSegmentsAccepted=1`;
- `cpSatBestSegmentKind=gap`;
- `solutionSource=cp_sat_pilot`;
- `hardConstraintViolations=0`;
- `selectedCandidateMetricsConsistent=true`.

### Riesgos residuales

La segmentación sigue siendo local, no decide recursos alternativos complejos y no combina todavía mejoras de varios segmentos sobre estados sucesivos. Los runtimes impresos dependen del entorno y no forman parte de los asserts. Para ID 017 se recomienda medir OR-Tools instalado por tipo/tamaño y probar composición de dos segmentos con validación hard completa después de cada candidato; no se recomienda subir el límite global.

## ID 017 — Diagnóstico operativo de recursos compuestos

El benchmark incorpora un diagnóstico puro posterior al solve. No modifica el output seleccionado ni la factibilidad y añade `resourcePoolPressureSummary`, `maxAnyOfPoolConcurrency`, `resourceSwitchCount`, `compositeResourceCandidateCount` y `resourceDiagnosticWarnings`. Los escenarios sin recursos analizables muestran `n/a`.

Resultados de referencia:

| Escenario | Estado | Hard | Presión anyOf | Pico | Switches | Candidatos | Warnings |
|---|---:|---:|---|---:|---:|---:|---|
| I | complete, 77/77 | 0 | mic `2/2`; camera `1/2` | 2 | 14 | 5 | fragilidad de mic |
| L | complete, 99/104 | 0 | camera `5/5`; sound nominal `5/4`; Main Stage camera `2/5` | 5 | 67 | 54 | fragilidad + asociaciones inconsistentes/concurrentes |
| P | complete, 32/32 | 0 | `n/a` | `n/a` | `n/a` | `n/a` | `n/a` |
| Q | complete, 6/6 | 0 | camera `2/2`; sound `2/2` | 2 | 2 | 6 | fragilidad + dos cruces de bundle |

Q está construido para que dos parejas cámara/sonido sean recurrentes y una última franja use combinaciones cruzadas simultáneas. El benchmark termina con 17 escenarios completos, cero escenarios completos con hard violations, cero movimientos de locks/ejecución y cero divergencias de métricas seleccionadas.

La presión nominal de L no es una nueva constraint: hace visible la diferencia entre pools individuales y equipos técnicos reales. La especificación completa, límites y recomendación para ID 018 están en `docs/ENGINE_V3_RESOURCE_DIAGNOSTICS.md`.

## ID 019 — Escenario R: Resource bundles soft scoring

R declara dos bundles cámara/sonido y afinidades distintas por espacio. El benchmark expone dos outputs completos y hard-válidos con el mismo número de tareas, ventanas, huecos, prioridades, coach penalty y makespan:

- candidato coherente: mantiene `Camera A + Sound A` durante las dos tareas en el espacio afín;
- candidato alternativo: cambia a `Camera B + Sound B` en la segunda tarea, provocando un switch y un mismatch de afinidad.

El comparador común selecciona el candidato coherente únicamente después de empatar los criterios críticos. El resultado esperado y verificado es:

- `complete=true`;
- `hardConstraintViolations=0`;
- `declaredResourceBundleCount=2`;
- `bundleSpaceAffinityMatches=2`;
- `candidateSelectionReason` explica mejor coherencia de bundle/recurso;
- `selectedCandidateMetricsConsistent=true`.

El runner imprime también uso de componentes, parciales, matches/mismatches, switch penalty y coincidencias entre bundles declarados y candidatos inferidos. R no prueba enforcement: prueba un desempate soft determinista.
