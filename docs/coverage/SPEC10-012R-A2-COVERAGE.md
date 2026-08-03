# SPEC10-012R2 — Auditoría A2 vinculada a Evidence real

> Documento generado desde `docs/evidence/SPEC10-012R-focal-a2-capability-audit.json`. No editar sus conclusiones manualmente.

- Capacidades: **167**; auditadas: **99**; `NOT_AUDITED`: **62**.
- Requisitos: `{"REQUIRED":4,"NOT_REQUIRED":0,"UNRESOLVED":163}`.
- Estados: `{"EVIDENCED_SUPPORTED":0,"CODE_SUPPORTED_NOT_REPRESENTATIVE_EVIDENCE":0,"PARTIALLY_SUPPORTED":0,"EXPLICITLY_UNSUPPORTED":3,"CONTRACT_GAP":0,"SOURCE_AMBIGUOUS":96,"NOT_AUDITED":62,"PRODUCT_PHASE_NOT_IMPLEMENTED":6}`.
- Familias: `{"SOURCE_UNRESOLVED":9}`.
- `fullA2PlanningCoverage`: **false**.
- `fullA2ProductReadiness`: **false**.
- Recomendación: **CLARIFY_DOMAIN**, capacidad **141**.

PR #616 aportó andamiaje provisional; sus conteos y conclusiones no eran autoridad. Esta revisión deriva bindings, assertions, familias y recomendación. La auditoría es tooling-only, read-only, determinista y no modifica contratos ni comportamiento productivo. El probe end-to-end ejecuta preflight, adaptador, `executePlannerNext` y validación canónica. Los probes de capa ejecutan realmente planificación, autoridad joint o technical-chain y validación; sus límites de integración permanecen explícitos.
