# ENGINE V3 OPERATIONAL NEIGHBORHOODS — ID 010

## Objetivo

ID 010 añade una búsqueda local pequeña y determinista para mejorar **planes completos** de Phase A sin convertir el motor en un solver global. El objetivo es generar algunos candidatos alternativos operativos y dejarlos pasar por la selección comparativa existente, manteniendo hard constraints como filtro absoluto.

## Módulo añadido

El módulo `engine/v3/operationalNeighborhoods.ts` genera candidatos desde un `EngineOutput` completo:

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
