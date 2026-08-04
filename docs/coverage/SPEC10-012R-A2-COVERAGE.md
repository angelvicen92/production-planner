# SPEC10-012R2 — Piloto A2 de Evidence real

> Documento generado desde `docs/evidence/SPEC10-012R-focal-a2-capability-audit.json`. Las conclusiones no se editan manualmente.

PR #616 y la primera revisión de este PR aportaron andamiaje provisional, pero sus conteos masivos no eran autoridad. SPEC10-012R2 queda deliberadamente reducido a un piloto reproducible antes de ampliar el catálogo.

## Alcance del piloto

- Capacidades auditadas: **12, 13, 14, 16, 18, 19, 20, 41, 120, 121, 122, 123, 134, 135, 136**.
- Bindings literales: **15**.
- Source assertions revisadas: **15**.
- Probe observations ejecutadas: **50**.
- Test assertions: **15**.
- Benchmark assertions: **15**.
- Resultados de assertions: `{"PASS":93,"FAIL":0,"NOT_FOUND":0,"NOT_EXECUTED":0}`.

## Cobertura derivada

- Técnicamente auditadas: **15**.
- Source-reviewed: **15**.
- `NOT_AUDITED`: **146**.
- Fases de producto: **162, 163, 164, 165, 166, 167**.
- Requisitos: `{"REQUIRED":15,"NOT_REQUIRED":0,"UNRESOLVED":152}`.
- Estados: `{"EVIDENCED_SUPPORTED":9,"CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE":1,"PARTIALLY_SUPPORTED":2,"EXPLICITLY_UNSUPPORTED":3,"CONTRACT_GAP":0,"SOURCE_AMBIGUOUS":0,"NOT_AUDITED":146,"PRODUCT_PHASE_NOT_IMPLEMENTED":6}`.
- Familias piloto: `{"EVIDENCED_SUPPORTED":2,"PARTIALLY_SUPPORTED":2,"EXPLICITLY_UNSUPPORTED":1}`.
- Recomendación: **IMPLEMENT_CAPABILITY**, capacidad **134** — Implement the demonstrated required blocker: participant-scoped meal.

Todo lo que no pertenece al piloto queda sin binding y `NOT_AUDITED / AUDIT`, salvo 162–167 como `PRODUCT_PHASE_NOT_IMPLEMENTED / PRODUCT`. No se auditan aquí vocal, main, Reality, joint tasks, espacios ni validación completa. La ampliación será incremental.

## Focal y límites

Los datos Focal se leen de `planner-next-focal-a2-itinerant-spec08-foundation-v4.json`: `{"status":"FOCAL_A2_SPEC08_MAIN_ANCHORED_ACCOMPANIMENT_ACCEPTED","scenarioCount":33,"accepted":true,"complete":true,"hardValid":true,"plannedTaskCount":53,"unplannedTaskCount":0,"branchesExplored":28432,"maxBranchExpansions":300000,"humanScheduleUsedAsSeed":false,"anchoredAccompanimentPlannedCount":3,"anchoredAccompanimentScheduledSegmentCount":6,"fallbackUsed":false}`. No se copian expectativas como observaciones. Este PR sólo modifica tooling, Evidence y documentación; no implementa capacidades ni cambia producción.
