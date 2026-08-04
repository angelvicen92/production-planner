# SPEC10-016 — Plantilla canónica completa A2

## Día expresado

La plantilla anónima expresa 19 concursantes, 266 tareas de concursante, 3 tareas técnicas y 269 tareas totales. La expansión conserva semántica operativa de transporte, comida individual, flujo principal, pruebas vocales, segmentos anclados, operaciones conjuntas, cadena técnica, espacios, recursos conocidos, setup, sincronización de Totales y transición de coaches sin horarios seed, locks ni nombres reales.

## Required creation inputs

- **daily_participant_availability**: La fuente exige este dato al crear el día, pero no fija un valor productivo.
- **daily_resource_availability**: La fuente exige este dato al crear el día, pero no fija un valor productivo.
- **daily_space_availability**: La fuente exige este dato al crear el día, pero no fija un valor productivo.
- **effective_day_window**: La fuente exige este dato al crear el día, pero no fija un valor productivo.
- **execution_date**: La fuente exige este dato al crear el día, pero no fija un valor productivo.
- **future_productive_ids**: La fuente exige este dato al crear el día, pero no fija un valor productivo.
- **general_meal_window**: La fuente exige este dato al crear el día, pero no fija un valor productivo.
- **out_transport_policy**: La fuente exige este dato al crear el día, pero no fija un valor productivo.

Estos datos son inputs de creación del futuro día y no se seleccionan como siguiente capacidad técnica.

## Implementation blockers

Estado de representabilidad: **BLOCKED**. La puerta ejecutada devuelve **REJECTED_BLOCKED**, con executorCallCount=0, sin EngineInput parcial, sin preflight, sin adaptador y sin executePlannerNext.

- **ENGINE_INPUT_JOINT_GROUP_NOT_PROJECTED** (ENGINE_INPUT): Planner Next ya entiende jointGroupId, pero TaskInput/EngineInput no tiene el campo y el adaptador no puede proyectarlo. Pérdida si se aproxima: Sustituirlo por dependencias preservaría orden, pero no mismo inicio y final.
- **ENGINE_INPUT_SETUP_POLICY_NOT_PROJECTED** (ENGINE_INPUT): Planner Next tiene setupFamilyId y Space.setupPolicy, pero EngineInput no transporta la familia ni la política de preparación/reentrada. Pérdida si se aproxima: Sin ese contrato se perderían el bloque de montaje, los 10 minutos entre familias o la prohibición de reentrada.
- **PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED** (PLANNER_NEXT): No existe contrato PlannerNextProblem equivalente para rondas simultáneas entre dos espacios independientes. Pérdida si se aproxima: Las dependencias impondrían precedencia, no sincronización de arranque entre salas.
- **ADAPTER_COACH_ROUTE_TRANSITION_SCOPE_LOSS** (ADAPTER): El probe del adaptador demuestra que sólo se proyecta resourceTransitionMinutes global; no hay canal para una transición específica por origen/destino y por coach. Pérdida si se aproxima: Un margen global sobrerrestringe recursos no afectados o no distingue la ruta Caracola→Estudio 7.

## Siguiente blocker técnico razonado

El siguiente paso de menor riesgo es **ENGINE_INPUT_JOINT_GROUP_NOT_PROJECTED**: Planner Next ya soporta grupos conjuntos mediante jointGroupId, no requiere nuevas reglas de búsqueda, exige una ampliación contractual menor en EngineInput/adaptador y desbloquea semántica real de C06/C10 que hoy se perdería si se aproximara con dependencias.

## No implementado

No se implementa botón, DB, API, UI, persistencia, contratos productivos, preflight productivo, adaptador productivo ni ejecución del motor para un subconjunto parcial.
