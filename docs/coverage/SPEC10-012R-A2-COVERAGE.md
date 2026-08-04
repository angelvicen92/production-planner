# SPEC10-012R2 — Piloto A2 de Evidence real

> Documento generado desde `docs/evidence/SPEC10-012R-focal-a2-capability-audit.json`. Las conclusiones no se editan manualmente.

PR #616 y la primera revisión de este PR aportaron andamiaje provisional, pero sus conteos masivos no eran autoridad. SPEC10-012R2 queda deliberadamente reducido a un piloto reproducible antes de ampliar el catálogo.

## Alcance del piloto

- Capacidades auditadas: **12, 13, 14, 16, 18, 19, 20, 41, 120, 121, 122, 123, 134, 135, 136**.
- Bindings literales: **15**.
- Source assertions revisadas: **26**.
- Probe observations ejecutadas: **56**.
- Test assertions: **15**.
- Benchmark assertions: **15**.
- Resultados de assertions: `{"PASS":110,"FAIL":0,"NOT_FOUND":0,"NOT_EXECUTED":0}`.

Las 15 test references sólo demuestran que existe la definición exacta del test; la ejecución se informa separadamente en la validación local. Los probes y benchmark assertions son la Evidence ejecutable principal.

## Fuentes exactas revisadas

- 12: `SPEC-10 :: 8.1. Protegidas` (OFFICIAL_SPEC) — done es protegida; conserva inicio, final, espacio, recursos, locks y relaciones y no puede reordenarse, desplazarse, reasignarse ni desaparecer.
- 12: `SPEC-07 :: 11. Fase 0 — Estado protegido` (OFFICIAL_SPEC) — done pertenece al estado protegido.
- 13: `SPEC-10 :: 8.1. Protegidas` (OFFICIAL_SPEC) — in_progress es protegida; conserva inicio, final, espacio, recursos, locks y relaciones y no puede reordenarse, desplazarse, reasignarse ni desaparecer.
- 13: `SPEC-07 :: 11. Fase 0 — Estado protegido` (OFFICIAL_SPEC) — in_progress pertenece al estado protegido.
- 14: `SPEC-10 :: 8.3. No planificables` (OFFICIAL_SPEC) — cancelled se excluye o se representa mediante regla explícita; su tratamiento no se infiere del nombre.
- 16: `SPEC-10 :: 9.1. Lock de tiempo` (OFFICIAL_SPEC) — el lock de tiempo fija exactamente el intervalo autorizado.
- 18: `SPEC-10 :: 9.3. Lock de recurso` (OFFICIAL_SPEC) — el lock de recurso conserva el recurso requerido.
- 19: `SPEC-10 :: 9.4. Lock completo` (OFFICIAL_SPEC) — conserva tiempo, espacio y recursos aplicables; una dimensión no representable sin pérdida hace la adaptación unsupported.
- 20: `SPEC-10 :: 9. Locks` (OFFICIAL_SPEC) — cada lock se traduce explícitamente y ninguno se transforma en preferencia soft.
- 20: `SPEC-10 :: 9.1. Lock de tiempo` (OFFICIAL_SPEC) — la dimensión temporal conserva exactamente el intervalo autorizado.
- 20: `SPEC-10 :: 9.3. Lock de recurso` (OFFICIAL_SPEC) — la dimensión de recurso conserva el recurso requerido.
- 41: `SPEC-10 :: 12. Recursos` (OFFICIAL_SPEC) — cada recurso conserva identidad, disponibilidad, tipo o rol y asignaciones; coaches se resuelven por relaciones explícitas.
- 120: `SPEC-07 :: 6.9 Operación técnica` (OFFICIAL_SPEC) — una operación técnica puede no pertenecer a ningún concursante.
- 120: `ENSAYO_A2_LV.pdf p.1 :: PROGRAMACIÓN + PRUEBA` (A2_EXAMPLE) — A2 contiene una operación técnica denominada PROGRAMACIÓN + PRUEBA.
- 121: `SPEC-07 :: 6.9 Operación técnica` (OFFICIAL_SPEC) — las operaciones técnicas son tareas explícitas.
- 121: `SPEC-10 :: 13. Dependencias` (OFFICIAL_SPEC) — las dependencias normalizadas se conservan por identidad de tarea.
- 121: `SPEC-07 :: 13. Fase 2 — Dependencias del flujo principal` (OFFICIAL_SPEC) — una secuencia se deriva de dependencias explícitas y no del nombre.
- 122: `SPEC-10 :: 13. Dependencias` (OFFICIAL_SPEC) — el adaptador conserva todas las dependencias normalizadas por identidad de tarea.
- 122: `SPEC-07 :: 6.9 Operación técnica` (OFFICIAL_SPEC) — la tarea dependiente puede ser una operación técnica.
- 123: `ENSAYO_A2_LV.pdf p.1 :: DESMONTAJE Y TRASLADO` (A2_EXAMPLE) — A2 contiene una obligación denominada DESMONTAJE Y TRASLADO.
- 123: `SPEC-07 :: 18.4 Traslado técnico explícito` (OFFICIAL_SPEC) — desmontar, transportar o volver a montar se modela como tarea explícita con duración y recursos; el nombre no activa un contrato estructurado.
- 134: `SPEC-07 :: 19.5 Concursantes` (OFFICIAL_SPEC) — la comida de concursante es una obligación por participante.
- 134: `DESGLOSE A2.pdf p.1 :: bloques Sodexo individualizados` (A2_EXAMPLE) — A2 muestra bloques individuales de Sodexo.
- 135: `SPEC-10 :: 14. Comidas y pausas protegidas` (OFFICIAL_SPEC) — el adaptador distingue pausa por recurso y rechaza con UNSUPPORTED_BREAK_SCOPE si no puede conservar el ámbito.
- 136: `SPEC-10 :: 14. Comidas y pausas protegidas` (OFFICIAL_SPEC) — el adaptador distingue comida de unidad itinerante y rechaza con UNSUPPORTED_BREAK_SCOPE si no puede conservar el ámbito.
- 136: `SPEC-08 :: 20. Comidas` (OFFICIAL_SPEC) — las comidas itinerantes son obligaciones operativas explícitas.

Capacidades visibles en A2: **120, 123, 134**.

## Cobertura derivada

- Técnicamente auditadas: **15**.
- Source-reviewed: **15**.
- `NOT_AUDITED`: **146**.
- Fases de producto: **162, 163, 164, 165, 166, 167**.
- Requisitos: `{"REQUIRED":15,"NOT_REQUIRED":0,"UNRESOLVED":152}`.
- Estados: `{"EVIDENCED_SUPPORTED":10,"CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE":0,"PARTIALLY_SUPPORTED":2,"EXPLICITLY_UNSUPPORTED":3,"CONTRACT_GAP":0,"SOURCE_AMBIGUOUS":0,"NOT_AUDITED":146,"PRODUCT_PHASE_NOT_IMPLEMENTED":6}`.
- Familias piloto: `{"EVIDENCED_SUPPORTED":2,"PARTIALLY_SUPPORTED":2,"EXPLICITLY_UNSUPPORTED":1}`.
- Recomendación: **IMPLEMENT_CAPABILITY**, capacidad **134** — Implement the demonstrated required blocker: participant-scoped meal.

### Estados piloto

- 12: `EVIDENCED_SUPPORTED`.
- 13: `EVIDENCED_SUPPORTED`.
- 14: `EVIDENCED_SUPPORTED`.
- 16: `EVIDENCED_SUPPORTED`.
- 18: `EVIDENCED_SUPPORTED`.
- 19: `PARTIALLY_SUPPORTED`.
- 20: `EVIDENCED_SUPPORTED`.
- 41: `EVIDENCED_SUPPORTED`.
- 120: `EVIDENCED_SUPPORTED`.
- 121: `EVIDENCED_SUPPORTED`.
- 122: `EVIDENCED_SUPPORTED`.
- 123: `PARTIALLY_SUPPORTED`.
- 134: `EXPLICITLY_UNSUPPORTED`.
- 135: `EXPLICITLY_UNSUPPORTED`.
- 136: `EXPLICITLY_UNSUPPORTED`.

La capacidad 121 usa frontera representativa **PLANNER_LAYER**; no se atribuye al boundary EngineInput.

### Comidas observadas desde el input ejecutado

- meal-participant: scope=`"participant"`, entity=`"participant-meal"`, identity=`201`, window=`{"start":"15:00","end":"15:30"}`, reason=`UNSUPPORTED_BREAK_SCOPE`.
- meal-resource: scope=`"resource_meal"`, entity=`"105"`, identity=`503`, window=`{"start":"15:00","end":"15:30"}`, reason=`UNSUPPORTED_BREAK_SCOPE`.
- meal-itinerant-unit: scope=`"itinerant-team"`, entity=`"unit-meal"`, identity=`7`, window=`{"start":"15:00","end":"15:30"}`, reason=`UNSUPPORTED_BREAK_SCOPE`.

Ranking evaluado: `[{"capabilityId":134,"capability":"participant-scoped meal","ranking":[-3,0,134]},{"capabilityId":135,"capability":"resource-scoped meal","ranking":[-1,0,135]},{"capabilityId":136,"capability":"unit-scoped meal","ranking":[-1,0,136]}]`. Decision trace: `["collect REQUIRED capabilities with executed EXPLICITLY_UNSUPPORTED Evidence","evaluate ranked candidates: participant-scoped meal, resource-scoped meal, unit-scoped meal","rank higher A2 visibility before official-only impact","prefer directly observed rejection over inferred contract risk","select participant-scoped meal from the resulting deterministic order"]`.

Todo lo que no pertenece al piloto queda sin binding y `NOT_AUDITED / AUDIT`, salvo 162–167 como `PRODUCT_PHASE_NOT_IMPLEMENTED / PRODUCT`. No se auditan aquí vocal, main, Reality, joint tasks, espacios ni validación completa. La ampliación será incremental.

## Focal y límites

Los datos Focal se leen de `planner-next-focal-a2-itinerant-spec08-foundation-v4.json`: `{"status":"FOCAL_A2_SPEC08_MAIN_ANCHORED_ACCOMPANIMENT_ACCEPTED","scenarioCount":33,"accepted":true,"complete":true,"hardValid":true,"plannedTaskCount":53,"unplannedTaskCount":0,"branchesExplored":28432,"maxBranchExpansions":300000,"humanScheduleUsedAsSeed":false,"anchoredAccompanimentPlannedCount":3,"anchoredAccompanimentScheduledSegmentCount":6,"fallbackUsed":false}`. No se copian expectativas como observaciones. Este PR sólo modifica tooling, Evidence y documentación; no implementa capacidades ni cambia producción.
