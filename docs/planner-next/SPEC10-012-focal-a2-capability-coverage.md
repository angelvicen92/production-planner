# SPEC10-012 — Auditoría ejecutable de cobertura A2

## 1. Respuesta ejecutiva

La respuesta calculada sigue siendo **no**: `fullA2PlanningCoverage=false` y `fullA2ProductReadiness=false`. Esta revisión ejecuta 29 probes reales contra preflight, adapter, búsqueda y validator; ya no asigna estados mediante sets de IDs.

- Requerimientos: `NOT_REQUIRED` 6, `REQUIRED` 81, `UNRESOLVED` 80.
- Cobertura: `CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE` 6, `CONTRACT_GAP` 70, `EXPLICITLY_UNSUPPORTED` 3, `PARTIALLY_SUPPORTED` 31, `PRODUCT_PHASE_NOT_IMPLEMENTED` 6, `SOURCE_AMBIGUOUS` 51.
- Familias: `ENGINE_CAPABLE_NOT_A2_FIXTURE` 7, `NOT_REPRESENTED` 2, `PARTIALLY_REPRESENTED` 5, `SOURCE_UNRESOLVED` 7.

## 2. Fuentes verificadas

El source manifest registra `ENSAYO_A2_LV.pdf` p.1 y `ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf` p.1. Conserva los hechos verificados: domingo 15/06/2025, 19 talents, dos vistas, dos salas vocales, 19 vocales agregadas, 19 main, Reality A/B/combinada, operaciones técnicas, Plató 14/15, Totales, Alfombra Roja y comidas individuales. No infiere setup, tarea o recurso desde nombres.

## 3. Metodología ejecutable

Cada probe congela su fixture, ejecuta autoridades reales y registra funciones, status, reason codes, observación adaptada, ejecución, hard validation, inmutabilidad y repetición. `deriveCoverageStatus` consume esos resultados, tests exactos y benchmarks exactos. La recomendación se calcula sobre requisitos, familias, soporte downstream, capa y riesgo, con desempate por ID.

## 4. Correcciones focales

| Capacidad | Estado derivado | Observación ejecutada |
|---:|---|---|
| 12 — Inmutabilidad de done | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | done-protected: SUPPORTED; adapter=SUPPORTED; preserves=true |
| 13 — Inmutabilidad de in_progress | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | in-progress-protected: SUPPORTED; adapter=SUPPORTED; preserves=true |
| 16 — Lock de tiempo | PARTIALLY_SUPPORTED | time-lock-valid: SUPPORTED; adapter=SUPPORTED; preserves=true<br>time-lock-contradictory: UNSUPPORTED; adapter=UNSUPPORTED; preserves=false |
| 18 — Lock de recurso | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | resource-lock: SUPPORTED; adapter=SUPPORTED; preserves=true |
| 19 — Lock completo | PARTIALLY_SUPPORTED | full-lock: UNSUPPORTED; adapter=UNSUPPORTED; preserves=false |
| 20 — Combinación de locks sobre la misma tarea | PARTIALLY_SUPPORTED | time-lock-valid: SUPPORTED; adapter=SUPPORTED; preserves=true<br>time-lock-contradictory: UNSUPPORTED; adapter=UNSUPPORTED; preserves=false<br>resource-lock: SUPPORTED; adapter=SUPPORTED; preserves=true |
| 41 — Disponibilidad de coach | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | coach-availability: SUPPORTED; adapter=SUPPORTED; preserves=true |
| 115 — Grupo sincronizado | PARTIALLY_SUPPORTED | joint-task: SUPPORTED; adapter=UNSUPPORTED; preserves=true |
| 116 — Mismo inicio y final | PARTIALLY_SUPPORTED | joint-task: SUPPORTED; adapter=UNSUPPORTED; preserves=true |
| 117 — Mismo espacio | PARTIALLY_SUPPORTED | joint-task: SUPPORTED; adapter=UNSUPPORTED; preserves=true |
| 118 — Recursos comunes | PARTIALLY_SUPPORTED | joint-task: SUPPORTED; adapter=UNSUPPORTED; preserves=true |
| 119 — Edición atómica del grupo | PARTIALLY_SUPPORTED | joint-task: SUPPORTED; adapter=UNSUPPORTED; preserves=true |
| 120 — Tarea técnica sin participante | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | technical-task: SUPPORTED; adapter=SUPPORTED; preserves=true<br>technical-operation-engine: SUPPORTED; adapter=UNSUPPORTED; preserves=true |
| 121 — Cadena técnica | PARTIALLY_SUPPORTED | technical-chain: SUPPORTED; adapter=UNSUPPORTED; preserves=true |
| 122 — Dependencia entre operaciones técnicas | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | technical-dependency: SUPPORTED; adapter=SUPPORTED; preserves=true |
| 123 — Desmontaje y traslado explícitos | PARTIALLY_SUPPORTED | transport: UNSUPPORTED; adapter=UNSUPPORTED; preserves=false<br>technical-operation-engine: SUPPORTED; adapter=UNSUPPORTED; preserves=true |

Los locks temporales exactos se preservan; el conflicto produce `UNREPRESENTABLE_TIME_LOCK`. Done e in_progress conservan intervalo/duración. Coach availability se proyecta. Technical task atraviesa EngineInput y adapter; cadenas conjuntas/técnicas tienen soporte Planner Next, pero la ruta de integración o Evidence A2 sigue parcial donde corresponde. “Desmontaje y traslado” separa tarea técnica genérica del contrato especial de transporte rechazado.

## 5. Matriz completa

| ID | Capacidad | Requisito A2 | Estado | Capa | Probes | Reason codes |
|---:|---|---|---|---|---|---|
| 1 | Jornada e intervalo temporal | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 2 | Granularidad configurable | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 3 | Snapshot independiente de configuración del día | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 4 | Disponibilidad de participantes | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 5 | Disponibilidad de espacios y jerarquía zona-espacio | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 6 | Disponibilidad de recursos | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 7 | Disponibilidad propia de composiciones itinerantes | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 8 | Ventanas propias de tareas | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 9 | Construcción inicial desde tareas sin horas | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 10 | Replanificación de pending | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 11 | Replanificación de interrupted | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 12 | Inmutabilidad de done | UNRESOLVED | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | done-protected | — |
| 13 | Inmutabilidad de in_progress | UNRESOLVED | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | in-progress-protected | — |
| 14 | Exclusión de cancelled | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 15 | Eventos fijos y ocupaciones previas | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 16 | Lock de tiempo | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | time-lock-valid, time-lock-contradictory | UNREPRESENTABLE_TIME_LOCK |
| 17 | Lock de espacio | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | space-lock | UNREPRESENTABLE_SPACE_LOCK |
| 18 | Lock de recurso | UNRESOLVED | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | resource-lock | — |
| 19 | Lock completo | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | full-lock | UNREPRESENTABLE_SPACE_LOCK |
| 20 | Combinación de locks sobre la misma tarea | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | time-lock-valid, time-lock-contradictory, resource-lock | UNREPRESENTABLE_TIME_LOCK |
| 21 | Locks sobre tareas protegidas | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 22 | Locks sobre tareas canceladas | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 23 | Continuidad REQUIRED del plató principal | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 24 | Hora preferida de finalización de mañana | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 25 | División mañana-tarde por comida | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 26 | Comida autorizada sin romper continuidad | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 27 | Main task | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 28 | Vocal feeder | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 29 | Dependencias feeder-main | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 30 | Dependencias transitivas | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 31 | Feeder anterior al primer segmento anclado | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 32 | Backtracking ante elección main incorrecta | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 33 | Presupuesto único y stop reason explícito | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 34 | Dos o más coaches | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 35 | Coach compartido por varios participantes | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 36 | Coach proyectado sólo con asignación efectiva | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 37 | Orden de bloques por coach | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 38 | Máximo de bloques | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 39 | Mínimo de tareas por bloque | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 40 | Transición entre tareas de coach | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 41 | Disponibilidad de coach | REQUIRED | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | coach-availability | — |
| 42 | Comida de coach o recurso asignado | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 43 | Espacios paralelos | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 44 | Continuidad REQUIRED de espacio secundario | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | secondary-continuity | — |
| 45 | Continuidad PREFERRED | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 46 | Continuidad OFF | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 47 | Tareas largas | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 48 | Bloques continuos de Totales 1 | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 49 | Bloques continuos de Totales Coreo | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 50 | Dos salas de Totales en paralelo | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 51 | Capacidad de espacio igual a uno | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 52 | Capacidad superior a uno | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | space-capacity | UNSUPPORTED_SPACE_CAPACITY |
| 53 | Espacio exclusivo | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 54 | Espacio compartido o no exclusivo | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | non-exclusive-space | UNSUPPORTED_SPACE_OCCUPANCY |
| 55 | Alternativas de espacio | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 56 | Relación zona-espacio sin colapso silencioso | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 57 | Familia de setup | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | setup | UNSUPPORTED_SETUP_MAPPING |
| 58 | Orden configurado de setups | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | setup-grouping | — |
| 59 | Selección libre de orden sin configuración | REQUIRED | PARTIALLY_SUPPORTED | ADAPTER | setup-grouping | — |
| 60 | Máximo de bloques por setup | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | setup-grouping | — |
| 61 | Mínimo de tareas por bloque | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | setup-grouping | — |
| 62 | Excepción de resto configurable | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | setup-grouping | — |
| 63 | Preparación inicial de setup | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | setup-preparation | — |
| 64 | Repetición de preparación al reentrar | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | setup-preparation | — |
| 65 | Bloqueo del espacio durante preparación | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | setup-preparation | — |
| 66 | Recursos participantes en preparación | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | setup-preparation | — |
| 67 | Proyección de Croma | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 68 | Proyección de Estrellas + Sillón | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 69 | Proyección de Giratuto | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 70 | Ausencia de inferencia por nombre | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 71 | Recurso concreto asignado directamente | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 72 | Recurso heredado de espacio | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 73 | Recurso heredado de zona | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 74 | Composición de asignaciones | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 75 | Resource lock | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 76 | Recurso compartido sin solape | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 77 | Capacidad de recurso | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 78 | Transición de recurso | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 79 | Margen diferenciado de participante | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 80 | Margen diferenciado de recurso | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 81 | Requisito genérico por tipo | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | resource-by-type | UNSUPPORTED_RESOURCE_REQUIREMENT |
| 82 | Requisito por cantidad | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | resource-quantity | UNSUPPORTED_RESOURCE_REQUIREMENT |
| 83 | Recursos alternativos | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | resource-alternatives | UNSUPPORTED_RESOURCE_REQUIREMENT |
| 84 | Sustitución explícita de recurso | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 85 | requiresBand | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 86 | usesInstrument informativo | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 87 | Política de presencia OFF | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 88 | Política de presencia PREFERRED | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 89 | Política de presencia REQUIRED | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 90 | Intervalo de presencia | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 91 | Bloques operativos de recurso | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 92 | Comida de recurso asignado | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 93 | Comida única de recurso compartido | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 94 | Unidad itinerante con identidad propia | REQUIRED | PARTIALLY_SUPPORTED | ADAPTER | itinerant-composition-window | — |
| 95 | Miembros concretos de la unidad | REQUIRED | PARTIALLY_SUPPORTED | ADAPTER | itinerant-composition-window | — |
| 96 | Unidad no duplicada como recurso hard | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 97 | Ventana de composición | REQUIRED | PARTIALLY_SUPPORTED | ADAPTER | itinerant-composition-window | — |
| 98 | Intersección con ventanas de miembros | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | itinerant-composition-window | — |
| 99 | Recomposición posterior | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 100 | Operación standalone | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 101 | Operación anclada | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 102 | Varios segmentos before | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 103 | Varios segmentos after | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 104 | Adyacencia exacta | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 105 | Transición interna incluida | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 106 | Margen externo conservado | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 107 | Participante ocupado durante toda la operación | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 108 | Recurso continuo durante todas las fases | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 109 | Recurso adicional específico de una fase | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 110 | Espacios propios de cada segmento | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 111 | Segmentos sin bloquear falsamente plató principal | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 112 | Operación atómica | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 113 | Comida no atravesada por operación indivisible | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 114 | Unidad combinada de tarde no disponible por la mañana | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 115 | Grupo sincronizado | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | joint-task | — |
| 116 | Mismo inicio y final | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | joint-task | — |
| 117 | Mismo espacio | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | joint-task | — |
| 118 | Recursos comunes | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | joint-task | — |
| 119 | Edición atómica del grupo | UNRESOLVED | PARTIALLY_SUPPORTED | ADAPTER | joint-task | — |
| 120 | Tarea técnica sin participante | REQUIRED | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | technical-task, technical-operation-engine | — |
| 121 | Cadena técnica | REQUIRED | PARTIALLY_SUPPORTED | ADAPTER | technical-chain | — |
| 122 | Dependencia entre operaciones técnicas | REQUIRED | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | technical-dependency | — |
| 123 | Desmontaje y traslado explícitos | REQUIRED | PARTIALLY_SUPPORTED | ADAPTER | transport, technical-operation-engine | UNSUPPORTED_TRANSPORT_CONTRACT |
| 124 | Preparación de pulsadores | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 125 | Programación y prueba | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 126 | Preparación de cámaras | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 127 | Figuración | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 128 | Beauties | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 129 | Operaciones generadas sin inventar task IDs productivos | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 130 | Pausa global hard | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 131 | Ventana flexible de comida | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 132 | Comida ya asignada | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 133 | Comida de espacio | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 134 | Comida de participante | REQUIRED | EXPLICITLY_UNSUPPORTED | PREFLIGHT | participant-meal | UNSUPPORTED_BREAK_SCOPE |
| 135 | Comida de recurso | REQUIRED | EXPLICITLY_UNSUPPORTED | PREFLIGHT | resource-meal | UNSUPPORTED_BREAK_SCOPE |
| 136 | Comida de unidad itinerante | REQUIRED | EXPLICITLY_UNSUPPORTED | PREFLIGHT | unit-meal | UNSUPPORTED_BREAK_SCOPE |
| 137 | Comida de zona | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 138 | Una única comida para recurso compartido | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 139 | Capacidad y concurrencia en comida de participantes | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 140 | Comida que no rompe bloque operativo autorizado | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 141 | Tarea aplicable | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | eligibility | — |
| 142 | Tarea excluida | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | eligibility | — |
| 143 | Tarea opcional | UNRESOLVED | CONTRACT_GAP | ENGINE_INPUT | optional-task | — |
| 144 | Tareas alternativas | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 145 | Elegibilidad por atributo explícito | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | eligibility | — |
| 146 | Simultaneidad permitida | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 147 | Simultaneidad prohibida | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 148 | Placeholders no operativos | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 149 | Ausencia de creación u omisión por nombre | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 150 | Set exacto de tareas | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 151 | Cero tareas perdidas | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 152 | Cero tareas inventadas | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 153 | Hard-validity canónica | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 154 | Completitud | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 155 | No publicación de parciales | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 156 | Determinismo | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 157 | Invariancia al orden | UNRESOLVED | SOURCE_AMBIGUOUS | SOURCE | — | — |
| 158 | Input inmutable | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 159 | Evidence explicable | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 160 | Identidad reversible | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 161 | Tiempo reversible | REQUIRED | CONTRACT_GAP | ENGINE_INPUT | — | — |
| 162 | Adaptador de publicación | NOT_REQUIRED | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — | — |
| 163 | Shadow mode | NOT_REQUIRED | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — | — |
| 164 | Revisión humana | NOT_REQUIRED | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — | — |
| 165 | Activación opt-in | NOT_REQUIRED | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — | — |
| 166 | Consolidación atómica | NOT_REQUIRED | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — | — |
| 167 | Rollback | NOT_REQUIRED | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — | — |

## 6. Familias A2

| Familia | Fixture explícito | Conteo | Estado | Limitación |
|---|---:|---:|---|---|
| A2_ALFOMBRA_ROJA | no | null | ENGINE_CAPABLE_NOT_A2_FIXTURE | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_FIXED_EVENTS | no | null | SOURCE_UNRESOLVED | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_MAIN_PLATO_7 | sí | 19 | PARTIALLY_REPRESENTED | — |
| A2_PARTICIPANT_ELIGIBILITY | no | null | SOURCE_UNRESOLVED | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_PARTICIPANT_VIEW_COMPLETE_DAY | no | null | NOT_REPRESENTED | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_PLATO_14_GIRATUTO | no | null | SOURCE_UNRESOLVED | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_PLATO_14_PASILLO | no | null | ENGINE_CAPABLE_NOT_A2_FIXTURE | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_PLATO_14_RECURSOS | no | null | ENGINE_CAPABLE_NOT_A2_FIXTURE | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_PLATO_15_CROMA | no | null | SOURCE_UNRESOLVED | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_PLATO_15_ESTRELLAS_SILLON | no | null | SOURCE_UNRESOLVED | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_REALITY_COMBINED_AFTERNOON | sí | null | PARTIALLY_REPRESENTED | La operación se representa; la identidad productiva completa de unidad y recomposición sigue parcial. |
| A2_REALITY_UNIT_A | sí | null | PARTIALLY_REPRESENTED | La operación se representa; la identidad productiva completa de unidad y recomposición sigue parcial. |
| A2_REALITY_UNIT_B | sí | null | PARTIALLY_REPRESENTED | La operación se representa; la identidad productiva completa de unidad y recomposición sigue parcial. |
| A2_RESOURCE_TRANSITIONS | no | null | ENGINE_CAPABLE_NOT_A2_FIXTURE | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_SODEXO_PARTICIPANT_MEALS | no | null | NOT_REPRESENTED | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_TECHNICAL_PREPARATIONS | no | null | ENGINE_CAPABLE_NOT_A2_FIXTURE | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_TOTALES_1 | no | null | SOURCE_UNRESOLVED | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_TOTALES_COREO | no | null | SOURCE_UNRESOLVED | No hay tareas identificables de esta familia en el fixture Focal. |
| A2_VOCAL_FLOW_TOTAL | sí | 19 | PARTIALLY_REPRESENTED | No demuestra el reparto por sala. |
| A2_VOCAL_JOSE_MARIA | no | null | ENGINE_CAPABLE_NOT_A2_FIXTURE | El fixture conserva 19 vocales agregadas, no identidad reversible por sala. |
| A2_VOCAL_LUCIA | no | null | ENGINE_CAPABLE_NOT_A2_FIXTURE | El fixture conserva 19 vocales agregadas, no identidad reversible por sala. |

Las salas José Mª y Lucía usan `null`: el total vocal demostrado es 19, pero el reparto por sala no es reversible en el fixture. `A2_VOCAL_FLOW_TOTAL` conserva ese total sin duplicarlo. Reality A/B/combinada se marca parcialmente representada porque existen recursos y ventanas operativas, no como ausente; la identidad productiva y recomposición completa siguen pendientes. Technical preparations se distingue entre capacidad genérica existente y ausencia de operaciones PDF identificables en Focal.

## 7. Recomendación calculada

La selección resultante es **141 — Tarea aplicable**, score 670. Familias afectadas: A2_PARTICIPANT_ELIGIBILITY, A2_PLATO_14_GIRATUTO, A2_PLATO_14_PASILLO, A2_PLATO_14_RECURSOS, A2_PLATO_15_CROMA, A2_PLATO_15_ESTRELLAS_SILLON.

Top del decision trace:

| ID | Familias | Downstream | Riesgo | Score | Exclusión |
|---:|---:|---:|---|---:|---|
| 141 | 6 | sí | MEDIUM | 670 | — |
| 43 | 5 | no | MEDIUM | 550 | — |
| 29 | 4 | no | MEDIUM | 450 | — |
| 47 | 4 | no | MEDIUM | 450 | — |
| 71 | 4 | no | MEDIUM | 450 | — |
| 120 | 4 | sí | LOW | 430 | — |
| 94 | 3 | sí | MEDIUM | 360 | — |
| 95 | 3 | sí | MEDIUM | 360 | — |
| 97 | 3 | sí | MEDIUM | 360 | — |
| 123 | 3 | sí | MEDIUM | 360 | — |

## 8. Focal y Evidence

El Focal vigente permanece aceptado: 33 escenarios, 53 tareas (19 main, 19 vocal, 9 standalone, 6 segmentos), 3 anchors, 12 operaciones itinerantes, 375 minutos, cero pendientes, hard-valid, determinista, máximo 300.000 ramas, sin human seed, PartialPlan ni fallback. Esto no acredita automáticamente las familias ausentes.

Evidence JSON pura: `engine/planner-next/benchmarks/fixtures/spec10-012-focal-a2-capability-coverage-evidence.json`; **371525 bytes**; SHA-256 `3ff68ac95528eee806fd2f529f6e3df109482952340d1f4623fc5c9f76e8e854`. Dos ejecuciones fueron byte-identical y no contienen runtime, timestamp, logs ni paths locales.

## 9. Límites

No se implementó ninguna capacidad ni se modificaron contratos, preflight, adapter, búsqueda, placement, validator, ORC, V3/V4, DB, API, UI, publicación o RLS. Los 80 requisitos `UNRESOLVED` impiden cobertura completa de forma deliberada.
