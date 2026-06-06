# ENGINE V3 REALISTIC VOICE DAY — ID 012

## Objetivo

El escenario **L — Jornada audiovisual anonimizada tipo La Voz** aproxima la estructura operativa de una jornada de audiciones musicales sin utilizar nombres, horarios ni datos reales de una producción o de sus participantes. Su finalidad es validar si el Motor V3 mantiene factibilidad hard y produce una planificación operativamente legible cuando coinciden plató principal, feeders, vocal coaches, totales, reality, recursos exclusivos, ejecución ya iniciada y restricciones de talents.

El lote es deliberadamente determinista y no cambia el comportamiento funcional del motor. Solo amplía los fixtures, invariantes, métricas impresas y documentación del benchmark.

## Estructura del escenario

### Escala

- **20 talents anónimos:** `Talent 01` a `Talent 20`.
- **104 tareas:** cinco tareas base por talent y una sexta preparación instrumental para cuatro talents.
- **10 espacios:** `Main Stage`, `Vocal Room A`, `Vocal Room B`, `Totals Room 1`, `Totals Room 2`, `Reality Set A`, `Reality Set B`, `Corridor`, `Instrument Prep` y `Holding Area`.
- Jornada de **08:00 a 20:00**.
- Comida global hard de **19:00 a 19:45**. Se sitúa al final de la carga principal para mantener un canario inequívoco de no cruce con el comportamiento actual del motor; no pretende proponer esa hora como estándar de producción.

### Recursos y paralelismo

- Dos recursos exclusivos de coach: `Coach A` y `Coach B`.
- Cinco recursos exclusivos de cámara: `Camera 1` a `Camera 5`.
- Cuatro recursos exclusivos de sonido: `Sound 1` a `Sound 4`.
- Main Stage consume dos cámaras y un sonido.
- Vocal consume su coach asignado y un sonido.
- Totals y Reality consumen una cámara y un sonido, por lo que pueden correr en paralelo cuando no comparten talent, espacio ni recurso asignado.
- Corridor/Holding consume una cámara y funciona como carga flexible.

### Dependencias y feeders

- Todo `Main Stage` depende del vocal del mismo talent.
- Seis talents tienen `Totals pre` como feeder adicional antes de Main Stage; el resto ejecuta `Totals post` después de Main Stage.
- Cuatro talents tienen `Reality pre` antes de Main Stage; el resto ejecuta `Reality post` después.
- `Talent 04`, `Talent 09`, `Talent 14` y `Talent 19` requieren `Instrument setup` antes de Main Stage.
- Las duraciones varían entre 10 y 30 minutos según el tipo de tarea y la condición del talent.

### Disponibilidad, ejecución y locks

- Cinco talents tienen ventanas restrictivas o salida temprana entre 11:30 y 13:00.
- Dos tareas están en estado `done`.
- Una tarea está en estado `in_progress` con coach y sonido ya asignados.
- Dos tareas pending tienen locks manuales de tiempo.
- Los tests verifican no solape de talent, espacio y recurso exclusivo; no movimiento de `done`, `in_progress` y locks; comida; disponibilidad; dependencias; y ausencia de hard violations en un output completo.

## Resultado histórico de ID 012

Resultado resumido de `npm run benchmark:engine` en la ejecución de referencia de ID 012:

| Métrica | Escenario L |
|---|---:|
| status | `complete` |
| totalTasks | 104 |
| plannedTasks | 99 |
| unplannedTasks | 0 |
| runtimeMs | 107 |
| makespan | 642 min |
| mainStageGapMinutes | 10 |
| mainStageGapCount | 1 |
| mainStageUtilizationPercent | 98% |
| restrictiveTalentAverageStartOffset | 106 min |
| restrictiveTalentLatestFinishSlack | 28 min |
| coachSwitchCount | 16 |
| coachSwitchPenalty | 46 |
| hardConstraintViolations | 0 |
| lockedTaskMovedCount | 0 |
| executedTaskMovedCount | 0 |
| candidateSolutionsEvaluated | 1 |
| solutionSource | `phaseA_greedy` |
| candidateSelectionReason | `no operational neighborhood candidate generated` |
| neighborhoodSearchAttempted | `true` |
| neighborhoodCandidatesGenerated | 0 |
| neighborhoodCandidateAccepted | `false` |
| selectedCandidateMetricsConsistent | `true` |

`plannedTasks=99` con `totalTasks=104` y `unplannedTasks=0` es coherente con la semántica actual: las dos tareas `done`, la tarea `in_progress` y los dos locks ya fijados no aparecen como filas a persistir/mover en `output.plannedTasks`, pero el motor declara el escenario completo.

### Comparativa neighborhoods off/on

| Modo | plannedTasks | mainStageGapMinutes | restrictiveTalentAverageStartOffset | coachSwitchCount | coachSwitchPenalty | runtimeMs |
|---|---:|---:|---:|---:|---:|---:|
| Off | 99 | 10 | 106 | 16 | 46 | 79 |
| On | 99 | 10 | 106 | 16 | 46 | 107 |

Con neighborhoods activos se evalúa la solución greedy, pero no se genera un vecino válido/mejor para L. La comparación no muestra mejora de calidad y sí un coste de runtime aproximado de 28 ms en esta ejecución.

## Lectura operativa

- **El motor completa la jornada** sin tareas unplanned declaradas y sin violaciones hard detectadas.
- **Main Stage queda casi compacto**, con un único hueco de 10 minutos y 98% de utilización dentro de su span. No es una solución perfecta, pero el hueco es pequeño frente a una carga de 20 actuaciones.
- **Los cinco talents restrictivos respetan disponibilidad**, aunque el offset medio de inicio de 106 minutos indica que la prioridad soft todavía deja margen para resolverlos antes. El slack mínimo agregado de referencia es 28 minutos, por lo que no quedan al borde inmediato de incumplimiento.
- **Los coaches son factibles pero no óptimos:** 16 cambios y penalización 46 muestran alternancia operativa relevante. El escenario I sí mejora con el vecindario de compactación, mientras L no produce candidatos; el patrón más rico de recursos/dependencias queda fuera de los movimientos actuales.
- **En ID 012 los neighborhoods no ayudaban en L**: fueron intentados, generaron cero candidatos y se conservó `phaseA_greedy`.
- **El runtime es aceptable para benchmark local:** 107 ms con neighborhoods y 79 ms sin ellos en la ejecución documentada. Estos valores no son SLA y pueden variar por máquina.

## Riesgos detectados

1. El modelo de cámara y sonido representa exclusividad mediante pools `anyOf`, pero no modela operador, kit compuesto, configuración, desplazamiento ni tiempo de setup/strike.
2. En ID 012 los neighborhoods existentes no generaban candidatos para la combinación de feeders, recursos y dependencias de L; solo comparar la solución greedy no mejora la jornada.
3. Queda un hueco de 10 minutos en Main Stage pese a la prioridad fuerte de continuidad.
4. El offset medio de 106 minutos para talents restrictivos es seguro en hard, pero todavía mejorable como criterio operativo.
5. `plannedTasks` excluye filas fijas, por lo que debe leerse junto con `unplannedTasks`, `complete` y las métricas de movimiento.
6. La comida global se coloca tarde para que el escenario sea un canario estable de no cruce; falta validar una pausa central realista con modelado explícito de recursos/equipos y continuidad de plató a ambos lados.
7. El dataset sigue siendo sintético: no captura incidencias, cambios de estado, tiempos de traslado reales ni distribuciones históricas de duración.

## Recomendación histórica previa a ID 013

Prioridad recomendada: **mejorar el modelado de recursos de cámara/sonido** antes de ampliar más vecindarios.

La razón concreta es que L ya completa y conserva todos los hard constraints, pero su aproximación más débil está en los equipos técnicos: una cámara o sonido se trata como un recurso individual intercambiable. Modelar kits/equipos compuestos, compatibilidades y tiempos de cambio permitiría que el siguiente benchmark mida decisiones realmente operativas y evitaría optimizar vecindarios sobre una representación demasiado simplificada.

Esta recomendación cerraba el lote ID 012; la sección posterior documenta la implementación efectiva de ID 013.

## ID 013 — Resultado feeder-aware en L

La ejecución de referencia posterior a ID 013 conserva la jornada completa y sus invariantes:

| Métrica | L con ID 013 |
|---|---:|
| status | `complete` |
| plannedTasks | 99 |
| unplannedTasks | 0 |
| mainStageGapMinutes | 10 |
| mainStageGapCount | 1 |
| restrictiveTalentAverageStartOffset | 106 min |
| coachSwitchCount | 16 |
| hardConstraintViolations | 0 |
| lockedTaskMovedCount | 0 |
| executedTaskMovedCount | 0 |
| neighborhoodSearchAttempted | `true` |
| neighborhoodCandidatesGenerated | 1 |
| neighborhoodCandidateAccepted | `false` |
| candidateSolutionsEvaluated | 2 |
| solutionSource | `phaseA_greedy` |
| selectedCandidateMetricsConsistent | `true` |

El cambio relevante frente a ID 012 es que L pasa de **0 a 1 candidato válido**. El candidato procede del vecindario `feeder_advance`, pero empata con greedy en la jerarquía completa del comparador; por ello no se acepta. Esto demuestra cobertura real sobre feeders densos sin forzar una mejora inexistente ni relajar constraints.

El hueco de 10 minutos y los 16 cambios de coach permanecen como objetivos residuales. Para mejorarlos hará falta combinar movimientos secuenciales o incorporar una evaluación local que permita preparar un feeder y, en un segundo paso, rellenar Main Stage.

## ID 014 — Búsqueda local depth 2

Sobre el escenario L completo de ID 013, la expansión depth 2 genera 2 candidatos de primer nivel, 1 de segundo nivel y evalúa 1 cadena. El resultado conserva `hardConstraintViolations=0`, `mainStageGapMinutes=10`, `coachSwitchCount=16` y `selectedCandidateMetricsConsistent=true`.

El mejor candidato aceptado es depth 1 (`main_stage_gap_fill` como tipo operativo) y no elimina el hueco; mejora el timing restrictivo agregado de 106 a 105 minutos. La alternativa depth 2 fue validada, pero no superó ese candidato en el scoring lexicográfico. Por tanto, ID 014 no fuerza una aceptación de cadena en L: demuestra expansión real y conserva seguridad.

Como contraste controlado, N sí necesita la cadena `feeder_advance -> main_stage_gap_fill`: el primer movimiento prepara la dependencia y el segundo reduce el hueco de 10 a 0 minutos sin violaciones hard.

## ID 015 — Resultado del CP-SAT pilot en L

El selector del piloto identifica 52 tareas relacionadas con Main Stage, sus feeders directos, talents restrictivos y coaches ya asignados. Como el límite seguro es 30, L no invoca el solver y reporta `cpSatPilotReason=task_limit_exceeded`, `cpSatPilotAttempted=false` y `cpSatPilotAccepted=false`.

La solución final permanece en `operational_neighborhood`: 99 tareas planificadas, cero unplanned, `mainStageGapMinutes=10`, `restrictiveTalentAverageStartOffset=105`, `coachSwitchCount=16`, `hardConstraintViolations=0`, locks y tareas ejecutadas sin movimiento, y métricas seleccionadas consistentes. Este resultado es deliberadamente conservador: ID 015 no amplía el límite para fabricar una mejora en L.

Para ID 016 se recomienda recortar el subproblema por una ventana crítica alrededor del hueco de Main Stage, manteniendo feeders transitivos necesarios y el entorno restante fijo. Eso permitiría probar optimización matemática real sobre L sin saltar todavía a un solver global.
