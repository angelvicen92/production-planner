# ENGINE V3 OPERATIONAL PRIORITY — ID 009

## Problema

Una solución factible no siempre es una buena planificación operativa. Tras ID 008, el escenario I completaba sin violaciones hard y sin huecos de plató principal, pero dejaba dos señales claras:

- `restrictiveTalentAverageStartOffset` de referencia: **48 min**.
- `coachSwitchCount` de referencia: **44**.

Eso indica que el motor ya sabía “hacer caber” las tareas, pero aún necesitaba preferir, de forma soft y determinista, talents que salen pronto y continuidad de coaches/feeders que desbloquean el plató principal.

## Cambios

### Urgencia restrictiva

Se añade `engine/v3/operationalPriority.ts` como helper puro y testeable. `calculateRestrictiveTalentUrgency` devuelve 0 para ventanas flexibles y una puntuación finita/determinista para ventanas restrictivas combinando:

- menor `availabilityEnd` → más presión de salida temprana;
- menor slack entre ventana restante y duración pendiente → más presión;
- ventana más corta → más presión;
- tarea feeder de plató principal → bonus soft.

La urgencia se integra en Phase A como bonus de selección de tarea y en candidate scoring como ponderación de `restrictiveTalentLatenessPenalty`. No cambia la validez de candidatos ni convierte preferencias en reglas hard.

### Continuidad de coach/feeders

El motor detecta coaches usando recursos de plan con `typeId=10` o nombre que contiene `Coach`. `calculateCoachSwitchPenalty` penaliza:

- cambios consecutivos de coach;
- alternancias tipo A/B/A;
- switches en feeders que desbloquean plató principal.

Phase A añade un bonus/penalty suave para seguir el mismo coach cuando no bloquea hard constraints. Candidate scoring usa la penalización para escoger entre soluciones equivalentes por factibilidad, cobertura, ventanas y huecos de plató.

### Punto de integración

- Phase A: `engine/v3/phaseAHeuristic.ts` usa la urgencia restrictiva y continuidad de coach en `scoreTaskForSelection`.
- Candidate selection: `engine/v3/solutionScoring.ts` compara `restrictiveTalentLatenessPenalty` y `coachSwitchPenalty` antes de `makespan`.
- Métricas/benchmark: `npm run benchmark:engine` incluye escenario J y mantiene la impresión de `restrictiveTalentAverageStartOffset`, `restrictiveTalentLatestFinishSlack`, `coachSwitchCount`, `candidateSelectionReason`, `solutionSource` y `hardConstraintViolations`.

## Escenario J

**J — Talent restrictivo y continuidad de coach** modela 5 talents, 2 coaches, un talent con salida temprana, feeders de coach y tareas de plató principal dependientes de feeders. Es más pequeño que I, pero fuerza las señales operativas relevantes:

- el feeder restrictivo empieza a las 09:00;
- el main restrictivo termina antes de la salida temprana;
- los switches de coach quedan acotados;
- no hay violaciones hard ni de disponibilidad.

Resultado de referencia ID 009:

- `plannedTasks / totalTasks: 9 / 9`
- `hardConstraintViolations: 0`
- `restrictiveTalentAverageStartOffset: 13`
- `restrictiveTalentLatestFinishSlack: 10`
- `coachSwitchCount: 2`
- `mainStageGapMinutes: 0`
- `solutionSource: phaseA_greedy`
- `runtimeMs: 2`

## Impacto en escenario I

Referencia ID 008 antes del cambio:

- `restrictiveTalentAverageStartOffset: 48`
- `restrictiveTalentLatestFinishSlack: 25`
- `coachSwitchCount: 44`
- `mainStageGapMinutes: 0`
- `hardConstraintViolations: 0`
- `runtimeMs: 57`

Resultado ID 009 después del cambio:

- `restrictiveTalentAverageStartOffset: 48`
- `restrictiveTalentLatestFinishSlack: 25`
- `coachSwitchCount: 44`
- `mainStageGapMinutes: 0`
- `hardConstraintViolations: 0`
- `runtimeMs: 53`

Lectura: en I no baja el offset ni el número de switches porque Phase A ya estaba dominada por la necesidad de mantener 0 huecos de plató principal, locks/ejecución, comida y dependencias. La mejora queda introducida y verificada como criterio soft en helpers, candidate scoring y escenario J sin degradar los invariantes de I.

## Riesgos residuales

- No es un solver global: Phase A sigue siendo greedy con heurísticas locales.
- Puede haber tradeoffs entre salida temprana, continuidad de coach, huecos de plató y makespan.
- CP-SAT sigue siendo parcial y no se ha eliminado ni convertido en solver global en este lote.
- La continuidad de coach depende de la calidad del modelo de recursos: si un coach no está marcado como `typeId=10` ni nombrado como `Coach`, la señal puede no activarse.

## Recomendación para ID 010

La recomendación para ID 010 es **ampliar la búsqueda comparativa con vecindarios operativos acotados** antes de abordar un CP-SAT global completo. Motivo: ID 009 ya da métricas y criterios auditables; el siguiente salto de calidad probablemente vendrá de generar más candidatos deterministas sobre el mismo motor, por ejemplo swaps locales de feeders/coaches y adelantos de talents restrictivos, manteniendo Phase A como fallback rápido y CP-SAT como vía futura.

No implementar ID 010 todavía.

## Actualización ID 010 — Vecindarios operativos acotados

ID 010 implementa la recomendación anterior mediante `engine/v3/operationalNeighborhoods.ts`. La prioridad operativa de ID 009 pasa a tener una segunda vía: además de ordenar decisiones greedy, ahora genera candidatos locales sobre planes completos para que candidate selection pueda elegir una solución mejor.

Los vecindarios implementados son:

- adelanto de talents restrictivos por swap local de slots compatibles;
- compacción local de bloques de coach en patrones A/B/A;
- filtro hard de seguridad que rechaza cualquier candidato con violaciones o con más huecos de plató principal.

En el benchmark ID 010, el escenario K demuestra aceptación de `advance_restrictive_talent`; el escenario I sigue con `hardConstraintViolations: 0` y `mainStageGapMinutes: 0`, y acepta un candidato `coach_block_compaction` sin degradar hard constraints.
