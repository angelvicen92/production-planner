# SPEC10-012R — Auditoría A2 basada en Evidence

> Documento generado desde `docs/evidence/SPEC10-012R-focal-a2-capability-audit.json`. No editar sus conclusiones manualmente.

- Capacidades: **167**; auditadas: **88**; `NOT_AUDITED`: **79**.
- Requisitos: `{"REQUIRED":97,"NOT_REQUIRED":0,"UNRESOLVED":70}`.
- Estados: `{"EVIDENCED_SUPPORTED":35,"CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE":47,"PARTIALLY_SUPPORTED":2,"EXPLICITLY_UNSUPPORTED":3,"CONTRACT_GAP":0,"SOURCE_AMBIGUOUS":1,"NOT_AUDITED":79,"PRODUCT_PHASE_NOT_IMPLEMENTED":0}`.
- Familias: `{"COVERED_END_TO_END":0,"ENGINE_SUPPORTED_INTEGRATION_MISSING":8,"INTEGRATED_NOT_A2_EVIDENCED":1,"PARTIALLY_REPRESENTED":3,"NOT_REPRESENTED":0,"SOURCE_UNRESOLVED":1,"NOT_AUDITED":8}`.
- `fullA2PlanningCoverage`: **false**.
- `fullA2ProductReadiness`: **false**.
- Recomendación: **CLARIFY_DOMAIN**, capacidad **141**.

La auditoría es tooling-only, read-only, determinista y no modifica contratos ni comportamiento productivo. El probe end-to-end ejecuta preflight, adaptador, `executePlannerNext` y validación canónica. Los probes de capa declaran explícitamente las capas no ejecutadas.
