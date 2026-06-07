# ENGINE V3 OPERATIONAL COMPACTION — ID 031

## Problema real detectado

La ejecución real `runId: 172` demostró que hard-valid no equivale a un día operativo bueno: 219 tareas quedaron planificadas, sin hard violations ni huecos en Main Stage, pero coaches y talents conservaron spans largos, idle elevado, huecos de varias horas y jornadas partidas. La búsqueda había evaluado un único candidato greedy y no había activado neighborhoods ni CP-SAT pilot.

ID 031 incorpora compactación soft y determinista. No modifica DB, RLS ni el modelo de persistencia, no relaja restricciones hard y no introduce CP-SAT global.

## Métricas

El motor calcula intervalos puros a partir de las tareas planificadas:

- **span**: desde el inicio de la primera tarea hasta el final de la última;
- **active**: unión de intervalos ocupados, sin duplicar solapes;
- **idle**: `span - active`;
- **idle ratio**: `idle / span`;
- **max gap**: mayor hueco positivo entre bloques;
- **split day**: bloques separados por al menos 45 minutos.

El scoring expone `coachIdlePenalty`, `coachSpanPenalty`, `coachSplitDayPenalty`, `talentIdlePenalty`, `talentSpanPenalty` y `maxGapPenalty`. El export frontend mantiene su cálculo descriptivo propio; ambos comparten las mismas definiciones de intervalos y el umbral de bloque, pero la detección de coaches del frontend también puede usar nombres/configuración de UI. Esta diferencia deliberada evita acoplar el motor a datos de presentación.

## Estrategia

La comparación sigue siendo lexicográfica. Primero protege hard constraints, número de tareas, ventanas, continuidad de Main Stage, timing restrictivo, feeders y cambios de coach. Solo después usa las métricas de compactación, antes del makespan final.

La búsqueda local añade cuatro familias acotadas:

1. **coach gap compaction**: acerca el bloque tardío de un coach al anterior;
2. **talent day compaction**: acerca el bloque tardío de un talent y, cuando es contiguo, mueve hasta tres tareas del bloque para conservar transporte/dependencias;
3. **late block pull-forward**: adelanta bloques tardíos compatibles;
4. **early block push-later**: retrasa una tarea temprana aislada hacia el bloque siguiente.

Se conservan profundidad máxima 2, máximo 30 evaluaciones totales, intentos acotados por tipo y orden determinista. La compactación se activa cuando el greedy completo es hard-valid y se detecta al menos uno de estos síntomas:

- coach `maxGap >= 90`;
- coach `idleRatio >= 0.4`;
- talent `maxGap >= 120`;
- talent `idleRatio >= 0.6`.

## Límites

Todo candidato pasa por validación hard y se descarta si:

- mueve locks, tareas `done` o `in_progress`;
- incrementa `mainStageGapMinutes`;
- rompe disponibilidad, dependencias, transporte, recursos o espacios;
- no mejora ninguna métrica de compactación;
- duplica un candidato ya evaluado.

La compactación no promete el óptimo global. Solo desplaza uno o varios elementos de un bloque hacia anclas ya existentes, sin aleatoriedad y sin búsqueda exhaustiva.

## Diagnóstico

La metadata incorpora:

- `operationalCompactionAttempted`;
- `operationalCompactionCandidatesGenerated`;
- `operationalCompactionAccepted`;
- `operationalCompactionReason`;
- `operationalCompactionMetricsBefore`;
- `operationalCompactionMetricsAfter`.

Cuando no se acepta una mejora, la razón distingue un plan ya compacto de `kept greedy: no candidate improved operational span`.

## Benchmarks AA y AB

- **AA — Coach split day compaction**: dos sesiones del mismo coach separadas por 150 minutos. La búsqueda acepta `coach_gap_compaction`, elimina el gap y mantiene Main Stage continuo y cero hard violations.
- **AB — Talent idle compaction**: un bloque tardío formado por ensayo + OUT se adelanta junto, conservando `IN -> prep -> ensayo -> OUT`. El span baja de 230 a 80 minutos y el idle de 150 a 0, con cero hard violations.

## Resultado esperado

La próxima prueba real debe comparar como mínimo:

- idle, span y max gap de Lucía antes/después;
- `topTalentIdle` antes/después;
- `mainStageGapMinutes`;
- `hardConstraintViolations`;
- metadata de candidatos generados y razón de aceptación/rechazo.

Los nombres reales solo pertenecen al protocolo de comparación; el motor no contiene nombres hardcodeados.

## Recomendación para ID 032

Tras repetir la prueba real:

- si mejora, ajustar orden/pesos únicamente con evidencia de varios planes;
- si no genera candidatos, ampliar anclas o movimientos de bloques manteniendo límites;
- si empeora plató, restringir aún más la admisión aunque el scoring ya lo proteja;
- si falta información feeder-main, mejorar su detección antes de ampliar búsqueda;
- si el candidato existe pero pierde por un criterio superior, revisar la razón comparativa antes de cambiar prioridades.
