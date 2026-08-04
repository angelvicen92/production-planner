# SPEC10-016 — Full A2 canonical template

## Expressed day

The canonical anonymous manifest expands to 19 contestants, 266 contestant tasks, 3 technical tasks and 269 total tasks. It carries durations, spaces, resources, participant ownership, dependencies, anchored Reality Plató operations, joint C06/C10 operations, setup-family rules, Totales synchronization, coach transition rules, transport policy requirements and meal obligations without planned times, locks or a human schedule seed.

## Representability gate

Status: **BLOCKED**. The motor was **not executed** because at least one lossless-representation blocker exists.

- **SOURCE_CONFIGURATION_REQUIRED_DAILY_PARTICIPANT_AVAILABILITY** (SOURCE_CONFIGURATION) — La fuente obliga a configurar este dato al crear el día y no fija un valor productivo. Loss if approximated: Inventarlo convertiría una decisión de producción en dato canónico.
- **SOURCE_CONFIGURATION_REQUIRED_DAILY_RESOURCE_AVAILABILITY** (SOURCE_CONFIGURATION) — La fuente obliga a configurar este dato al crear el día y no fija un valor productivo. Loss if approximated: Inventarlo convertiría una decisión de producción en dato canónico.
- **SOURCE_CONFIGURATION_REQUIRED_DAILY_SPACE_AVAILABILITY** (SOURCE_CONFIGURATION) — La fuente obliga a configurar este dato al crear el día y no fija un valor productivo. Loss if approximated: Inventarlo convertiría una decisión de producción en dato canónico.
- **SOURCE_CONFIGURATION_REQUIRED_EFFECTIVE_DAY_WINDOW** (SOURCE_CONFIGURATION) — La fuente obliga a configurar este dato al crear el día y no fija un valor productivo. Loss if approximated: Inventarlo convertiría una decisión de producción en dato canónico.
- **SOURCE_CONFIGURATION_REQUIRED_EXECUTION_DATE** (SOURCE_CONFIGURATION) — La fuente obliga a configurar este dato al crear el día y no fija un valor productivo. Loss if approximated: Inventarlo convertiría una decisión de producción en dato canónico.
- **SOURCE_CONFIGURATION_REQUIRED_FUTURE_PRODUCTIVE_IDS** (SOURCE_CONFIGURATION) — La fuente obliga a configurar este dato al crear el día y no fija un valor productivo. Loss if approximated: Inventarlo convertiría una decisión de producción en dato canónico.
- **SOURCE_CONFIGURATION_REQUIRED_GENERAL_MEAL_WINDOW** (SOURCE_CONFIGURATION) — La fuente obliga a configurar este dato al crear el día y no fija un valor productivo. Loss if approximated: Inventarlo convertiría una decisión de producción en dato canónico.
- **SOURCE_CONFIGURATION_REQUIRED_OUT_TRANSPORT_POLICY** (SOURCE_CONFIGURATION) — La fuente obliga a configurar este dato al crear el día y no fija un valor productivo. Loss if approximated: Inventarlo convertiría una decisión de producción en dato canónico.
- **ENGINE_INPUT_JOINT_GROUP_NOT_PROJECTED** (ENGINE_INPUT) — Planner Next tiene jointGroupId, pero TaskInput/EngineInput no lo transporta. Loss if approximated: Aproximarlo como dependencias permitiría inicios no simultáneos.
- **ENGINE_INPUT_SETUP_POLICY_NOT_PROJECTED** (ENGINE_INPUT) — Planner Next puede recibir setupFamilyId y Space.setupPolicy, pero EngineInput no proyecta familias ni política de preparación. Loss if approximated: Sin familias/reentry/preparación se pierde el montaje hard de Plató 15.
- **PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED** (PLANNER_NEXT) — No existe contrato equivalente para alinear rondas entre dos espacios independientes. Loss if approximated: Modelarlo con dependencias impondría orden, no simultaneidad de rondas.
- **ADAPTER_COACH_TRANSITION_SCOPE_LOSS** (ADAPTER) — El adaptador sólo emite resourceTransitionMinutes global para recursos genéricos y coach como canal separado; no expresa transición específica Caracola→Estudio 7 por coach. Loss if approximated: Un margen global afectaría recursos no relacionados o no distinguiría origen/destino.

## Not implemented

This iteration does not create EngineInput, does not run preflight/adapter/executePlannerNext, does not write DB data, does not add UI/API/persistence and does not implement the future button.

## Next real blocker

Resolve **SOURCE_CONFIGURATION_REQUIRED_DAILY_PARTICIPANT_AVAILABILITY** from the A2 full-day blocker list before attempting the creation button.
