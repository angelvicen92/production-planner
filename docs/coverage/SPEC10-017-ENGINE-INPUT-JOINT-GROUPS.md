# SPEC10-017 — EngineInput joint groups A2

## Objetivo operativo

Representar sin pérdida las operaciones conjuntas C06/C10 de Alfombra Roja y Totales Post desde `TaskInput` hasta Planner Next.

## Identidad de grupo vs dependencia

`jointGroupId` identifica la operación conjunta y sincroniza miembros compatibles. No expresa orden. La precedencia se conserva en `dependsOnTaskIds`: cada Totales Post depende de la Alfombra Roja del mismo concursante y el grupo sólo se coloca cuando todos los predecesores terminaron.

## Por qué proyectar sólo el campo era insuficiente

Antes, Planner Next exigía grupos conjuntos sin dependencias. Eso permitía Alfombra Roja, pero perdía la secuencia real de Totales Post. SPEC10-017 permite dependencias externas distintas y rechaza dependencias internas al mismo grupo.

## Flujo end-to-end

El probe ejecuta EngineInput preflight, `adaptEngineInputToPlannerNextProblem`, preflight Planner Next, `planMainFlowAndFeeders` y `validatePlan` usando exclusivamente `adapter.problem`. La Evidence muestra dos grupos fuente, dos IDs canónicos `joint-group:*`, cuatro miembros adaptados y planificados, sincronización por grupo y secuencia Alfombra Roja → Totales Post sobre el mismo problema adaptado.

## Casos negativos

Se rechazan valores runtime no string/null/undefined, strings vacíos o con espacios de borde, tareas técnicas, tareas sin concursante, tareas no auxiliary y dependencias internas del grupo.

## Evidence

- `docs/evidence/SPEC10-017-engine-input-joint-groups.json`.
- `docs/evidence/SPEC10-016-full-a2-canonical-template.json` actualizado.

## Blockers restantes

- `ENGINE_INPUT_SETUP_POLICY_NOT_PROJECTED`.
- `ADAPTER_COACH_ROUTE_TRANSITION_SCOPE_LOSS`.
- `PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED`.
- `PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED`.

## Siguiente paso

El siguiente blocker técnico es `ENGINE_INPUT_SETUP_POLICY_NOT_PROJECTED`.
