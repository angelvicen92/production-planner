# ENGINE V3 OPERATIONAL NEIGHBORHOODS — ID 010

## Objetivo

ID 010 añade una búsqueda local pequeña y determinista para mejorar **planes completos** de Phase A sin convertir el motor en un solver global. El objetivo es generar algunos candidatos alternativos operativos y dejarlos pasar por la selección comparativa existente, manteniendo hard constraints como filtro absoluto.

## Módulo añadido

En la versión histórica de ID 010, el módulo `engine/v3/operationalNeighborhoods.ts` generaba candidatos desde un `EngineOutput` completo con:

- máximo 20 candidatos;
- máximo 5 intentos por vecindario;
- orden estable por hora/tarea;
- sin aleatoriedad;
- sin tocar DB, UI, migraciones, RLS ni modelos persistidos.

## Vecindarios implementados

### 1. Advance restrictive talent

Detecta tareas planificadas de talents con disponibilidad más restrictiva que el día de trabajo y prueba intercambios con slots anteriores compatibles.

El intercambio solo se emite si:

- ambas tareas son movibles;
- no son `done`, `in_progress`, manual blocks ni tienen lock `time/full`;
- las duraciones coinciden;
- no se invierten dependencias directas;
- el candidato final no tiene violaciones hard.

### 2. Coach block compaction

Detecta patrones locales de coach `A/B/A` y prueba mover el tercer bloque junto al primero mediante swap local con el bloque intermedio.

El candidato solo se acepta en generación si conserva hard constraints y no empeora el plató principal.

### 3. Main-stage safe only

Todos los candidatos se filtran con dos reglas antes de entrar a candidate selection:

- `hardConstraintViolations === 0`;
- `mainStageGapMinutes` no aumenta respecto del plan base.

Por tanto, los vecindarios pueden mejorar timing restrictivo o switches de coach, pero no compran esa mejora creando huecos nuevos de plató principal ni relajando restricciones.

## Integración con candidate selection

`generatePlanV3` ejecuta la búsqueda local cuando Phase A/backtracking ya produjo un plan completo y hay señales operativas:

- talents restrictivos;
- bloques de coach suficientes para compacción;
- o main-stage/feeders detectables.

Los candidatos se comparan con `solutionScoring.ts`. Si uno gana por las reglas existentes, el output queda marcado como `solutionSource: "operational_neighborhood"`.

Metadata nueva:

- `neighborhoodSearchAttempted`
- `neighborhoodCandidatesGenerated`
- `neighborhoodCandidateAccepted`
- `neighborhoodAcceptedReason`
- `neighborhoodSearchTimeMs`

La metadata existente de backtracking y candidate selection se conserva cuando no hay vecindario aplicable.

## Escenario K

Se añade **K — Vecindario mejora plan completo**. El greedy se fuerza de forma determinista a completar el plan dejando tarde a un talent restrictivo; con backtracking desactivado para aislar el caso, el vecindario `advance_restrictive_talent` intercambia slots compatibles.

Resultado de referencia ID 010:

- `plannedTasks / totalTasks: 4 / 4`
- `hardConstraintViolations: 0`
- `mainStageGapMinutes: 0`
- `restrictiveTalentAverageStartOffset: 0`
- `neighborhoodCandidatesGenerated: 1`
- `neighborhoodCandidateAccepted: true`
- `neighborhoodAcceptedReason: advance_restrictive_talent`
- `solutionSource: operational_neighborhood`

## Impacto en escenario I

Referencia ID 009:

- `restrictiveTalentAverageStartOffset: 48`
- `coachSwitchCount: 44`
- `mainStageGapMinutes: 0`
- `hardConstraintViolations: 0`
- `solutionSource: phaseA_greedy`

Resultado ID 010:

- `restrictiveTalentAverageStartOffset: 48`
- `coachSwitchCount: 44` como métrica simple de cambios de recursos; el score operativo interno baja `coachSwitchPenalty` de forma local.
- `mainStageGapMinutes: 0`
- `hardConstraintViolations: 0`
- `neighborhoodCandidatesGenerated: 3`
- `neighborhoodCandidateAccepted: true`
- `neighborhoodAcceptedReason: coach_block_compaction`
- `solutionSource: operational_neighborhood`

Lectura: I sigue seguro, completo y sin huecos de plató. El vecindario encuentra una mejora local según el scoring de continuidad de coach/feeders, aunque la métrica agregada `coachSwitchCount` permanece en 44.

## Riesgos residuales

- Sigue sin ser un solver global; solo evalúa swaps locales de igual duración.
- Puede no mejorar escenarios donde las mejores alternativas requieran desplazar cadenas de varias duraciones o reoptimizar recursos.
- La métrica `coachSwitchCount` es más simple que `coachSwitchPenalty`; una mejora aceptada por penalty puede no cambiar el contador agregado.
- CP-SAT global sigue siendo recomendación futura para optimización amplia.

## Recomendación para ID 011

Antes de CP-SAT global completo, ampliar el vecindario con movimientos de cadena acotados de 2-3 tareas y swaps no necesariamente de igual duración, siempre manteniendo validación hard y presupuesto determinista. Si eso no mueve I de forma observable en métricas agregadas, el siguiente paso debería ser modelar una Fase B CP-SAT global con ventanas, locks, dependencias, comida y recursos exclusivos como constraints de primer nivel.

## ID 011 — Consistencia entre scoring y métricas

La divergencia de ID 010 no era un cambio oculto del plan seleccionado, sino dos definiciones distintas bajo nombres demasiado parecidos: `bestCandidateScore` mostraba la penalización ponderada de coaches (`coachSwitchPenalty=32`), mientras el benchmark contaba cualquier cambio del conjunto completo de `assignedResources` (`coachSwitchCount=44`), incluyendo recursos que no eran coaches.

ID 011 centraliza en `engine/v3/metrics.ts` las métricas operativas del output: violaciones hard, huecos de plató principal, makespan, timing medio de talents restrictivos y métricas de coaches. `coachSwitchCount` cuenta ahora exclusivamente transiciones entre coaches; `coachSwitchPenalty` conserva la función objetivo ponderada de ID 009 (switch base, coste extra A/B/A y coste extra cuando el cambio afecta a un feeder de plató). Scoring y benchmark consumen el mismo cálculo puro.

El output guarda además `selectedCandidateMetrics`, un snapshot compacto de las métricas de la solución seleccionada. El benchmark recalcula las métricas sobre el output final, imprime el snapshot y marca/falla una ejecución si ambos divergen.

### Escenario I después de ID 011

Comparación reproducible con vecindarios off/on:

- `coachSwitchCount`: **14 → 12**.
- `coachSwitchPenalty`: **40 → 32**.
- `restrictiveTalentAverageStartOffset`: **48 → 48**.
- `mainStageGapMinutes`: **0 → 0**.
- `hardConstraintViolations`: **0 → 0**.
- `selectedCandidateMetricsConsistent`: **true**.

Por tanto, en I la razón `operational_neighborhood selected: fewer coach switches` sí describe una mejora real del conteo bruto de coaches. Si en otro escenario solo baja la penalización ponderada y no el conteo, la razón pasa a decir explícitamente `lower weighted coach-switch penalty` e indica la comparación del conteo bruto; ya no afirma una reducción inexistente.

## ID 013 — Vecindarios feeder-aware

ID 013 amplía la búsqueda local para jornadas ricas en dependencias sin convertirla en un solver global. Los candidatos siguen pasando por el comparador único de soluciones y por validación hard antes de ser expuestos.

### Nuevos movimientos

- **`main_stage_gap_fill`**: detecta huecos de Main Stage de hasta 30 minutos e intenta colocar una tarea posterior que quepa completa. Un movimiento que adelanta una tarea antes de sus feeders se rechaza por dependencia.
- **`feeder_advance`**: prioriza dependencias directas de Main Stage y prueba tanto swaps de igual duración dentro del mismo espacio como adelantos a fronteras temporales ya existentes. Los swaps permiten encontrar vecinos en jornadas densas donde no existe un hueco totalmente vacío.
- **`coach_block_compaction`**: conserva el patrón local A/B/A y prueba el swap B/C solo cuando ambas tareas son movibles; `done`, `in_progress`, manual blocks y locks quedan fuera del movimiento.
- **`restrictive_talent_bundle`**: adelanta conjuntamente dos o tres feeders directos de un talent restrictivo, manteniendo sus offsets relativos y dejando que el validador hard compruebe orden, disponibilidad, espacios, recursos y comida.
- **`advance_restrictive_talent`** se mantiene por compatibilidad como movimiento unitario conservador y como respaldo para tareas restrictivas que aún no forman un bundle feeder.

### Límites y seguridad

- Máximo global: **30 candidatos**.
- Máximo por tipo: **10 intentos**.
- Máximo por candidato: **3 tareas movidas**.
- Orden y anchors deterministas; no hay aleatoriedad.
- Deduplicación por firma completa `taskId@start-end`.
- Rechazo si aumentan las violaciones hard, se mueve un lock o una tarea ejecutada, o aumenta `mainStageGapMinutes`.
- La metadata añade `neighborhoodTypesAttempted`, `neighborhoodTypesGenerated` y un mapa agregado `neighborhoodRejectedReasons`, sin retirar los campos previos.

### Resultado de referencia

- **L**: genera 1 candidato válido (`feeder_advance`), mantiene 0 violaciones hard, 10 minutos de hueco y métricas seleccionadas consistentes. El candidato empata con greedy y no se acepta; evita una aceptación artificial.
- **M**: genera 2 candidatos, acepta uno, reduce el hueco de Main Stage de la solución base y termina con `solutionSource=operational_neighborhood`, 0 violaciones hard y métricas consistentes.

### Riesgos residuales

1. Los anchors proceden de fronteras de la solución actual; no se enumeran todos los minutos del día.
2. Los bundles solo consideran feeders directos de Main Stage y un máximo de tres tareas.
3. La compactación de coach sigue limitada a patrones locales A/B/A y tareas de igual duración.
4. Los candidatos se generan respecto de la misma solución base; todavía no se encadenan iterativamente feeder advance + gap fill.
5. Un candidato hard-válido puede empatar en todas las métricas actuales, como ocurre en L, y se conserva correctamente la solución base.

## ID 014 — Búsqueda local depth 2

ID 013 dejaba casos donde un movimiento seguro era preparatorio pero no suficiente: adelantar un feeder podía conservar exactamente el mismo hueco de Main Stage, y solo después de ese movimiento una tarea de plató podía ocupar el hueco sin romper su dependencia. La selección depth 1 no podía observar la mejora conjunta.

ID 014 mantiene el plan greedy completo como raíz y añade una expansión determinista de profundidad máxima 2:

- hasta 10 candidatos depth 1;
- hasta 5 candidatos depth 2 por padre;
- hasta 30 soluciones evaluadas contando el greedy base (29 candidatos de vecindario como máximo);
- orden estable por score, tipo de vecindario y firma `taskId@start-end`;
- sin aleatoriedad y sin decisiones dependientes del runtime exacto;
- validación hard después de cada movimiento y otra vez contra la raíz greedy.

Cadenas activas:

1. `feeder_advance -> main_stage_gap_fill`;
2. `restrictive_talent_bundle -> feeder_advance`;
3. `coach_block_compaction -> main_stage_gap_fill`;
4. `feeder_advance -> coach_block_compaction`.

La búsqueda rechaza candidatos que aumentan violaciones hard, mueven `done`/`in_progress`/locks, aumentan huecos de Main Stage o conservan metadata `selectedCandidateMetrics` inconsistente con el horario que contienen. Las hard constraints agregadas incluyen dependencias, solapes, comida hard y disponibilidad. El segundo movimiento tampoco puede comprar una mejora rompiendo la seguridad alcanzada por el primero.

Metadata añadida, toda opcional y retrocompatible:

- `neighborhoodSearchDepth`;
- `neighborhoodDepth1Candidates`;
- `neighborhoodDepth2Candidates`;
- `neighborhoodChainsEvaluated`;
- `neighborhoodAcceptedChain`;
- `neighborhoodRejectedReasons` (se conserva y agrega rechazos de ambos niveles).

### Resultado en L

Referencia ID 013: 1 candidato, sin aceptación, `mainStageGapMinutes=10`, `coachSwitchCount=16` y `restrictiveTalentAverageStartOffset=106`.

ID 014: 2 candidatos depth 1, 1 candidato depth 2 y 1 cadena evaluada. Se mantiene `mainStageGapMinutes=10`, `coachSwitchCount=16` y `hardConstraintViolations=0`; se acepta una mejora segura que reduce `restrictiveTalentAverageStartOffset` de 106 a 105. La cadena depth 2 se evalúa, pero no supera al mejor candidato depth 1 según el orden lexicográfico del scoring. `selectedCandidateMetricsConsistent=true`.

### Resultado en N

El escenario N usa un seed completo y determinista para aislar el operador local: el feeder objetivo termina después del inicio del hueco, por lo que `main_stage_gap_fill` aislado viola la dependencia. `feeder_advance` intercambia los feeders sin reducir todavía los 10 minutos de hueco; después, `main_stage_gap_fill` mueve la tarea objetivo de `09:40` a `09:30`.

Resultado: 1 candidato depth 1, 1 candidato depth 2, cadena aceptada `feeder_advance -> main_stage_gap_fill`, hueco de 10 a 0 minutos, `hardConstraintViolations=0` y métricas seleccionadas consistentes.

### Riesgos residuales

- El operador sigue limitado a movimientos locales y swaps de duraciones compatibles; no reprograma una jornada global.
- Solo se expanden las cuatro cadenas explícitas; otros órdenes potencialmente útiles no se exploran.
- El presupuesto por número de candidatos evita variabilidad por reloj, pero una validación hard sigue teniendo coste proporcional al tamaño del plan.
- N aísla el componente con un seed completo; L continúa siendo la prueba end-to-end realista desde Phase A.

### Recomendación para ID 015

Medir qué cadenas quedan bloqueadas por movimientos de una sola tarea y añadir, si los datos lo justifican, desplazamientos compactos de 2-3 tareas con duraciones distintas. Mantener el mismo filtro hard y presupuesto determinista antes de considerar una Fase B CP-SAT global.
