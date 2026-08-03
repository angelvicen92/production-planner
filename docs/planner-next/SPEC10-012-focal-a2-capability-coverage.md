# SPEC10-012 — Auditoría integral de cobertura del planning A2

## 1. Respuesta ejecutiva

**No:** el estado actual no puede demostrar la planificación completa del día A2. `fullA2PlanningCoverage` y `fullA2ProductReadiness` son `false`. El Focal aceptado demuestra 53 tareas (19 main, 19 vocal, 9 standalone itinerantes y 6 segmentos anclados), no el inventario humano completo. No hay familias cubiertas end-to-end: 3 están parcialmente representadas y 17 no están representadas.

Conteos: `CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE`: 66; `CONTRACT_GAP`: 16; `EXPLICITLY_UNSUPPORTED`: 15; `PARTIALLY_SUPPORTED`: 64; `PRODUCT_PHASE_NOT_IMPLEMENTED`: 6. La ausencia de `EVIDENCED_SUPPORTED` es deliberadamente conservadora: ningún benchmark actual atraviesa PDF → EngineInput → preflight → adapter → Planner Next → búsqueda → validación para una capacidad completa del día A2.

## 2. Alcance demostrado por Focal

El validator vigente acredita 33 escenarios, 53 tareas, cero pendientes, hard-validity, determinismo, 3 operaciones ancladas, 6 segmentos, presupuesto máximo de 300.000 ramas, y ausencia de human seed, PartialPlan y fallback. Acredita 12 operaciones itinerantes y 375 minutos de uso itinerante. No acredita automáticamente Plató 14, Plató 15, Totales, Alfombra Roja, setups, comidas individuales, todas las operaciones técnicas, todos los locks ni toda SPEC-07.

## 3. Matriz completa

La Evidence JSON es la fuente machine-readable completa. Esta tabla reproduce sus 167 decisiones; “bloqueo” identifica la primera capa que impide afirmar cobertura.

| ID | Capacidad | Área | Estado | Bloqueo | Reason codes |
|---:|---|---|---|---|---|
| 1 | Jornada e intervalo temporal | Origen y estado operativo | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 2 | Granularidad configurable | Origen y estado operativo | PARTIALLY_SUPPORTED | ADAPTER | — |
| 3 | Snapshot independiente de configuración del día | Origen y estado operativo | CONTRACT_GAP | ENGINE_INPUT | — |
| 4 | Disponibilidad de participantes | Origen y estado operativo | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 5 | Disponibilidad de espacios y jerarquía zona-espacio | Origen y estado operativo | PARTIALLY_SUPPORTED | ADAPTER | — |
| 6 | Disponibilidad de recursos | Origen y estado operativo | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 7 | Disponibilidad propia de composiciones itinerantes | Origen y estado operativo | PARTIALLY_SUPPORTED | ADAPTER | — |
| 8 | Ventanas propias de tareas | Origen y estado operativo | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 9 | Construcción inicial desde tareas sin horas | Origen y estado operativo | PARTIALLY_SUPPORTED | ADAPTER | — |
| 10 | Replanificación de pending | Origen y estado operativo | PARTIALLY_SUPPORTED | ADAPTER | — |
| 11 | Replanificación de interrupted | Origen y estado operativo | PARTIALLY_SUPPORTED | ADAPTER | — |
| 12 | Inmutabilidad de done | Origen y estado operativo | CONTRACT_GAP | ENGINE_INPUT | — |
| 13 | Inmutabilidad de in_progress | Origen y estado operativo | CONTRACT_GAP | ENGINE_INPUT | — |
| 14 | Exclusión de cancelled | Origen y estado operativo | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 15 | Eventos fijos y ocupaciones previas | Origen y estado operativo | PARTIALLY_SUPPORTED | ADAPTER | — |
| 16 | Lock de tiempo | Locks | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNREPRESENTABLE_TIME_LOCK |
| 17 | Lock de espacio | Locks | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNREPRESENTABLE_SPACE_LOCK |
| 18 | Lock de recurso | Locks | PARTIALLY_SUPPORTED | ADAPTER | — |
| 19 | Lock completo | Locks | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_LOCK_TYPE |
| 20 | Combinación de locks sobre la misma tarea | Locks | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_LOCK_TYPE |
| 21 | Locks sobre tareas protegidas | Locks | PARTIALLY_SUPPORTED | ADAPTER | — |
| 22 | Locks sobre tareas canceladas | Locks | PARTIALLY_SUPPORTED | ADAPTER | — |
| 23 | Continuidad REQUIRED del plató principal | Flujo principal y feeders | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 24 | Hora preferida de finalización de mañana | Flujo principal y feeders | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 25 | División mañana-tarde por comida | Flujo principal y feeders | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 26 | Comida autorizada sin romper continuidad | Flujo principal y feeders | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 27 | Main task | Flujo principal y feeders | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 28 | Vocal feeder | Flujo principal y feeders | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 29 | Dependencias feeder-main | Flujo principal y feeders | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 30 | Dependencias transitivas | Flujo principal y feeders | PARTIALLY_SUPPORTED | ADAPTER | — |
| 31 | Feeder anterior al primer segmento anclado | Flujo principal y feeders | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 32 | Backtracking ante elección main incorrecta | Flujo principal y feeders | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 33 | Presupuesto único y stop reason explícito | Flujo principal y feeders | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 34 | Dos o más coaches | Coaches y bloques | PARTIALLY_SUPPORTED | ADAPTER | — |
| 35 | Coach compartido por varios participantes | Coaches y bloques | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 36 | Coach proyectado sólo con asignación efectiva | Coaches y bloques | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 37 | Orden de bloques por coach | Coaches y bloques | PARTIALLY_SUPPORTED | ADAPTER | — |
| 38 | Máximo de bloques | Coaches y bloques | PARTIALLY_SUPPORTED | ADAPTER | — |
| 39 | Mínimo de tareas por bloque | Coaches y bloques | PARTIALLY_SUPPORTED | ADAPTER | — |
| 40 | Transición entre tareas de coach | Coaches y bloques | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 41 | Disponibilidad de coach | Coaches y bloques | CONTRACT_GAP | ENGINE_INPUT | — |
| 42 | Comida de coach o recurso asignado | Coaches y bloques | PARTIALLY_SUPPORTED | ADAPTER | — |
| 43 | Espacios paralelos | Espacios y bloques secundarios | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 44 | Continuidad REQUIRED de espacio secundario | Espacios y bloques secundarios | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 45 | Continuidad PREFERRED | Espacios y bloques secundarios | PARTIALLY_SUPPORTED | ADAPTER | — |
| 46 | Continuidad OFF | Espacios y bloques secundarios | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 47 | Tareas largas | Espacios y bloques secundarios | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 48 | Bloques continuos de Totales 1 | Espacios y bloques secundarios | PARTIALLY_SUPPORTED | ADAPTER | — |
| 49 | Bloques continuos de Totales Coreo | Espacios y bloques secundarios | PARTIALLY_SUPPORTED | ADAPTER | — |
| 50 | Dos salas de Totales en paralelo | Espacios y bloques secundarios | PARTIALLY_SUPPORTED | ADAPTER | — |
| 51 | Capacidad de espacio igual a uno | Espacios y bloques secundarios | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 52 | Capacidad superior a uno | Espacios y bloques secundarios | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_SPACE_CAPACITY |
| 53 | Espacio exclusivo | Espacios y bloques secundarios | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 54 | Espacio compartido o no exclusivo | Espacios y bloques secundarios | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_SPACE_OCCUPANCY |
| 55 | Alternativas de espacio | Espacios y bloques secundarios | PARTIALLY_SUPPORTED | ADAPTER | — |
| 56 | Relación zona-espacio sin colapso silencioso | Espacios y bloques secundarios | PARTIALLY_SUPPORTED | ADAPTER | — |
| 57 | Familia de setup | Setups | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_SETUP_MAPPING |
| 58 | Orden configurado de setups | Setups | PARTIALLY_SUPPORTED | ADAPTER | — |
| 59 | Selección libre de orden sin configuración | Setups | PARTIALLY_SUPPORTED | ADAPTER | — |
| 60 | Máximo de bloques por setup | Setups | PARTIALLY_SUPPORTED | ADAPTER | — |
| 61 | Mínimo de tareas por bloque | Setups | PARTIALLY_SUPPORTED | ADAPTER | — |
| 62 | Excepción de resto configurable | Setups | PARTIALLY_SUPPORTED | ADAPTER | — |
| 63 | Preparación inicial de setup | Setups | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_SETUP_MAPPING |
| 64 | Repetición de preparación al reentrar | Setups | PARTIALLY_SUPPORTED | ADAPTER | — |
| 65 | Bloqueo del espacio durante preparación | Setups | PARTIALLY_SUPPORTED | ADAPTER | — |
| 66 | Recursos participantes en preparación | Setups | PARTIALLY_SUPPORTED | ADAPTER | — |
| 67 | Proyección de Croma | Setups | PARTIALLY_SUPPORTED | ADAPTER | — |
| 68 | Proyección de Estrellas + Sillón | Setups | PARTIALLY_SUPPORTED | ADAPTER | — |
| 69 | Proyección de Giratuto | Setups | PARTIALLY_SUPPORTED | ADAPTER | — |
| 70 | Ausencia de inferencia por nombre | Setups | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 71 | Recurso concreto asignado directamente | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 72 | Recurso heredado de espacio | Recursos | PARTIALLY_SUPPORTED | ADAPTER | — |
| 73 | Recurso heredado de zona | Recursos | PARTIALLY_SUPPORTED | ADAPTER | — |
| 74 | Composición de asignaciones | Recursos | PARTIALLY_SUPPORTED | ADAPTER | — |
| 75 | Resource lock | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 76 | Recurso compartido sin solape | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 77 | Capacidad de recurso | Recursos | PARTIALLY_SUPPORTED | ADAPTER | — |
| 78 | Transición de recurso | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 79 | Margen diferenciado de participante | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 80 | Margen diferenciado de recurso | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 81 | Requisito genérico por tipo | Recursos | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_RESOURCE_REQUIREMENT |
| 82 | Requisito por cantidad | Recursos | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_RESOURCE_REQUIREMENT |
| 83 | Recursos alternativos | Recursos | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_RESOURCE_REQUIREMENT |
| 84 | Sustitución explícita de recurso | Recursos | PARTIALLY_SUPPORTED | ADAPTER | — |
| 85 | requiresBand | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 86 | usesInstrument informativo | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 87 | Política de presencia OFF | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 88 | Política de presencia PREFERRED | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 89 | Política de presencia REQUIRED | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 90 | Intervalo de presencia | Recursos | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 91 | Bloques operativos de recurso | Recursos | CONTRACT_GAP | ENGINE_INPUT | — |
| 92 | Comida de recurso asignado | Recursos | PARTIALLY_SUPPORTED | ADAPTER | — |
| 93 | Comida única de recurso compartido | Recursos | PARTIALLY_SUPPORTED | ADAPTER | — |
| 94 | Unidad itinerante con identidad propia | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 95 | Miembros concretos de la unidad | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 96 | Unidad no duplicada como recurso hard | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 97 | Ventana de composición | Reality e itinerantes | PARTIALLY_SUPPORTED | ADAPTER | — |
| 98 | Intersección con ventanas de miembros | Reality e itinerantes | PARTIALLY_SUPPORTED | ADAPTER | — |
| 99 | Recomposición posterior | Reality e itinerantes | PARTIALLY_SUPPORTED | ADAPTER | — |
| 100 | Operación standalone | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 101 | Operación anclada | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 102 | Varios segmentos before | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 103 | Varios segmentos after | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 104 | Adyacencia exacta | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 105 | Transición interna incluida | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 106 | Margen externo conservado | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 107 | Participante ocupado durante toda la operación | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 108 | Recurso continuo durante todas las fases | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 109 | Recurso adicional específico de una fase | Reality e itinerantes | PARTIALLY_SUPPORTED | ADAPTER | — |
| 110 | Espacios propios de cada segmento | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 111 | Segmentos sin bloquear falsamente plató principal | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 112 | Operación atómica | Reality e itinerantes | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 113 | Comida no atravesada por operación indivisible | Reality e itinerantes | PARTIALLY_SUPPORTED | ADAPTER | — |
| 114 | Unidad combinada de tarde no disponible por la mañana | Reality e itinerantes | PARTIALLY_SUPPORTED | ADAPTER | — |
| 115 | Grupo sincronizado | Tareas conjuntas y técnicas | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 116 | Mismo inicio y final | Tareas conjuntas y técnicas | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 117 | Mismo espacio | Tareas conjuntas y técnicas | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 118 | Recursos comunes | Tareas conjuntas y técnicas | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 119 | Edición atómica del grupo | Tareas conjuntas y técnicas | PARTIALLY_SUPPORTED | ADAPTER | — |
| 120 | Tarea técnica sin participante | Tareas conjuntas y técnicas | CONTRACT_GAP | ENGINE_INPUT | — |
| 121 | Cadena técnica | Tareas conjuntas y técnicas | CONTRACT_GAP | ENGINE_INPUT | — |
| 122 | Dependencia entre operaciones técnicas | Tareas conjuntas y técnicas | CONTRACT_GAP | ENGINE_INPUT | — |
| 123 | Desmontaje y traslado explícitos | Tareas conjuntas y técnicas | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_TRANSPORT_CONTRACT |
| 124 | Preparación de pulsadores | Tareas conjuntas y técnicas | CONTRACT_GAP | ENGINE_INPUT | — |
| 125 | Programación y prueba | Tareas conjuntas y técnicas | CONTRACT_GAP | ENGINE_INPUT | — |
| 126 | Preparación de cámaras | Tareas conjuntas y técnicas | CONTRACT_GAP | ENGINE_INPUT | — |
| 127 | Figuración | Tareas conjuntas y técnicas | CONTRACT_GAP | ENGINE_INPUT | — |
| 128 | Beauties | Tareas conjuntas y técnicas | CONTRACT_GAP | ENGINE_INPUT | — |
| 129 | Operaciones generadas sin inventar task IDs productivos | Tareas conjuntas y técnicas | PARTIALLY_SUPPORTED | ADAPTER | — |
| 130 | Pausa global hard | Comidas y pausas | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 131 | Ventana flexible de comida | Comidas y pausas | PARTIALLY_SUPPORTED | ADAPTER | — |
| 132 | Comida ya asignada | Comidas y pausas | PARTIALLY_SUPPORTED | ADAPTER | — |
| 133 | Comida de espacio | Comidas y pausas | PARTIALLY_SUPPORTED | ADAPTER | — |
| 134 | Comida de participante | Comidas y pausas | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_BREAK_SCOPE |
| 135 | Comida de recurso | Comidas y pausas | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_BREAK_SCOPE |
| 136 | Comida de unidad itinerante | Comidas y pausas | EXPLICITLY_UNSUPPORTED | PREFLIGHT | UNSUPPORTED_BREAK_SCOPE |
| 137 | Comida de zona | Comidas y pausas | PARTIALLY_SUPPORTED | ADAPTER | — |
| 138 | Una única comida para recurso compartido | Comidas y pausas | PARTIALLY_SUPPORTED | ADAPTER | — |
| 139 | Capacidad y concurrencia en comida de participantes | Comidas y pausas | PARTIALLY_SUPPORTED | ADAPTER | — |
| 140 | Comida que no rompe bloque operativo autorizado | Comidas y pausas | PARTIALLY_SUPPORTED | ADAPTER | — |
| 141 | Tarea aplicable | Elegibilidad y simultaneidad | CONTRACT_GAP | ENGINE_INPUT | — |
| 142 | Tarea excluida | Elegibilidad y simultaneidad | CONTRACT_GAP | ENGINE_INPUT | — |
| 143 | Tarea opcional | Elegibilidad y simultaneidad | PARTIALLY_SUPPORTED | ADAPTER | — |
| 144 | Tareas alternativas | Elegibilidad y simultaneidad | PARTIALLY_SUPPORTED | ADAPTER | — |
| 145 | Elegibilidad por atributo explícito | Elegibilidad y simultaneidad | PARTIALLY_SUPPORTED | ADAPTER | — |
| 146 | Simultaneidad permitida | Elegibilidad y simultaneidad | PARTIALLY_SUPPORTED | ADAPTER | — |
| 147 | Simultaneidad prohibida | Elegibilidad y simultaneidad | CONTRACT_GAP | ENGINE_INPUT | — |
| 148 | Placeholders no operativos | Elegibilidad y simultaneidad | PARTIALLY_SUPPORTED | ADAPTER | — |
| 149 | Ausencia de creación u omisión por nombre | Elegibilidad y simultaneidad | PARTIALLY_SUPPORTED | ADAPTER | — |
| 150 | Set exacto de tareas | Validación y producto | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 151 | Cero tareas perdidas | Validación y producto | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 152 | Cero tareas inventadas | Validación y producto | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 153 | Hard-validity canónica | Validación y producto | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 154 | Completitud | Validación y producto | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 155 | No publicación de parciales | Validación y producto | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 156 | Determinismo | Validación y producto | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 157 | Invariancia al orden | Validación y producto | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 158 | Input inmutable | Validación y producto | CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE | EVIDENCE | — |
| 159 | Evidence explicable | Validación y producto | PARTIALLY_SUPPORTED | ADAPTER | — |
| 160 | Identidad reversible | Validación y producto | PARTIALLY_SUPPORTED | ADAPTER | — |
| 161 | Tiempo reversible | Validación y producto | PARTIALLY_SUPPORTED | ADAPTER | — |
| 162 | Adaptador de publicación | Validación y producto | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — |
| 163 | Shadow mode | Validación y producto | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — |
| 164 | Revisión humana | Validación y producto | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — |
| 165 | Activación opt-in | Validación y producto | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — |
| 166 | Consolidación atómica | Validación y producto | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — |
| 167 | Rollback | Validación y producto | PRODUCT_PHASE_NOT_IMPLEMENTED | PRODUCT | — |

## 4. Matriz por familias del PDF

| Familia | Representada | Tareas derivables | Estado end-to-end | Blockers |
|---|---:|---:|---|---|
| A2_ALFOMBRA_ROJA | no | null | NOT_REPRESENTED | 43, 71, 76, 78, 120, 121, 126 |
| A2_FIXED_EVENTS | no | null | NOT_REPRESENTED | 15, 16, 19 |
| A2_MAIN_PLATO_7 | sí | 19 | PARTIALLY_REPRESENTED | 23, 24, 25, 26, 27, 29, 31, 32 |
| A2_PARTICIPANT_ELIGIBILITY | no | null | NOT_REPRESENTED | 141, 142, 143, 144, 145, 149 |
| A2_PARTICIPANT_VIEW_COMPLETE_DAY | no | null | NOT_REPRESENTED | 150, 151, 152, 154, 160, 161 |
| A2_PLATO_14_GIRATUTO | no | null | NOT_REPRESENTED | 57, 58, 63, 69, 70, 141, 142 |
| A2_PLATO_14_PASILLO | no | null | NOT_REPRESENTED | 43, 47, 71, 141, 142 |
| A2_PLATO_14_RECURSOS | no | null | NOT_REPRESENTED | 43, 47, 71, 76, 141, 142 |
| A2_PLATO_15_CROMA | no | null | NOT_REPRESENTED | 57, 58, 63, 67, 70, 141, 142 |
| A2_PLATO_15_ESTRELLAS_SILLON | no | null | NOT_REPRESENTED | 57, 58, 63, 68, 70, 141, 142 |
| A2_REALITY_COMBINED_AFTERNOON | no | null | NOT_REPRESENTED | 94, 95, 97, 98, 99, 100, 114 |
| A2_REALITY_UNIT_A | no | null | NOT_REPRESENTED | 94, 95, 97, 98, 100, 107, 108 |
| A2_REALITY_UNIT_B | no | null | NOT_REPRESENTED | 94, 95, 97, 98, 100, 107, 108 |
| A2_RESOURCE_TRANSITIONS | no | null | NOT_REPRESENTED | 78, 79, 80, 99, 123 |
| A2_SODEXO_PARTICIPANT_MEALS | no | null | NOT_REPRESENTED | 131, 132, 134, 139, 140 |
| A2_TECHNICAL_PREPARATIONS | no | null | NOT_REPRESENTED | 120, 121, 122, 123, 124, 125, 126, 127, 128, 129 |
| A2_TOTALES_1 | no | null | NOT_REPRESENTED | 43, 44, 47, 48, 50, 71, 76 |
| A2_TOTALES_COREO | no | null | NOT_REPRESENTED | 43, 44, 47, 49, 50, 71, 76 |
| A2_VOCAL_JOSE_MARIA | sí | 19 | PARTIALLY_REPRESENTED | 4, 28, 29, 34, 35, 36, 40, 41 |
| A2_VOCAL_LUCIA | sí | 19 | PARTIALLY_REPRESENTED | 4, 28, 29, 34, 35, 36, 40, 41 |

Los `null` evitan inventar conteos que los dos PDFs y el fixture focal no permiten derivar con seguridad.

## 5. Gaps por capa

- **ADAPTER:** 64.
- **ENGINE_INPUT:** 16.
- **EVIDENCE:** 66.
- **PREFLIGHT:** 15.
- **PRODUCT:** 6.

Los gaps de SOURCE se conservan como ambigüedad; los de ENGINE_INPUT/PREFLIGHT/ADAPTER impiden representación o integración; EVIDENCE significa código probado sintéticamente sin benchmark A2 representativo; PRODUCT cubre publicación y operación posterior.

## 6. Orden de desbloqueo

1. Cerrar el contrato de tareas técnicas sin participante (120) y su cadena mínima (121–122).
2. Integrar elegibilidad explícita (141–145), sin inferencia por nombre.
3. Integrar setups y preparación (57–69) con semántica oficial explícita.
4. Modelar comidas por participante, recurso y unidad (134–140).
5. Completar capacidades, exclusividad y alternativas de recursos/espacios (52, 54, 81–83).
6. Sólo después abordar las fases de producto 162–167.

## 7. Próxima iteración recomendada

- **recommendedNextCapabilityId:** 120.
- **recommendedNextIterationTitle:** SPEC10-013: integrate participant-free technical tasks into EngineInput adaptation.
- **Rationale:** Las operaciones técnicas aparecen en Alfombra Roja y preparaciones, el contrato Planner Next ya tiene Task.kind=technical y escenarios específicos, pero EngineInput no ofrece una adaptación completa. Integrar una unidad contractual desbloquea varias familias sin tocar publicación.
- **Familias desbloqueadas:** A2_ALFOMBRA_ROJA, A2_TECHNICAL_PREPARATIONS.
- **Dependencias:** Semántica oficial de identidad y duración de tareas técnicas; Adaptación read-only EngineInput a Task.kind=technical.
- **Riesgo:** MEDIUM.
- **Evidence de aceptación:** preflight positivo y negativo; round-trip de identidad y tiempo; benchmark A2 representativo con tareas sin participante; hard-validity, determinismo e inmutabilidad.

## Fuentes, probes y límites

Se contrastaron el inventario normalizado de los dos PDFs entregado en SPEC10-012, la documentación oficial consolidada en `attached_assets/Pasted-ACT-A-COMO-UN-ARQUITECTO-DE-SOFTWARE-SENIOR-ESPECIALIST_1769468151111.txt`, los contratos y tests actuales, y las Evidence SPEC10-010/011 y Focal SPEC-08. Los 20 probes negativos registran el comportamiento del head sin modificar fixtures. La auditoría no implementa capacidad, publicación, DB, Supabase, API ni UI.

Evidence determinista: `engine/planner-next/benchmarks/fixtures/spec10-012-focal-a2-capability-coverage-evidence.json`; 326708 bytes; SHA-256 `b8f96fcd1e4cc3ec6c1aa18153da5c07dba82e34e5fac9e6a18e5722536461c3`.
