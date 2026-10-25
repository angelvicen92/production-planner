# Negativos y garantías

Los probes SQL se ejecutan en transacciones descartables, con capturas antes/después y assertions de igualdad material en planes, revisiones y sesiones. Ninguna prueba relaja el endpoint de edición manual ni acepta una propuesta manipulada para preparar un positivo. Los recibos distinguen el rechazo HTTP, el error de permiso SQL y el guard material.

| Contrato | Evidencia |
| --- | --- |
| Tarea desconocida/de otro día, duplicada o no técnica | Validador diario, esquema estricto y probes `*-SQL-unknown/duplicate/nontechnical`; IDs inexistentes no se remapean |
| Orden semántico, dependencias contradictorias, branching/ciclo | Native order T1/T2/T3 con IDs no crecientes; reversed SQL; tests focales de dependencias, U00r e inferred/explicit chain |
| Recurso inexistente/ajeno o no exigido por un miembro | Probes resource, tests de byItem y guard material; nunca se acepta un sustituto nominal |
| Falsa adyacencia, hueco, duración/espacio alterados, solape | `*-certificate-*`, B ordinary-gap y `technicalChainSql.spec.ts`; errores de dominio/contrato, no errores de parsing |
| Actor AUX/VIEWER/sin rol, roles anon/authenticated | Probes de actor y grants; RLS/autorización HTTP existente; ADMIN y PRODUCTION positivos en carrera real |
| CAS stale y dos editores | `*-SQL-cas`, `*-SQL-editors-race`: exactamente un 200 y un 409; revisión posterior releída |
| Fuente concurrente | Otra conexión bloquea una tarea; el writer devuelve 409 STALE_CONFIG_SOURCES, sin cambio parcial |
| Propuesta activa y Draft | Rechazo de retirada mientras hay propuesta; guard transaccional de Draft limpio; tests de workflow/manual delta |
| Ejecución y locks | done/in_progress y locks se prueban mediante probes rollback-only; source/origin y protección rechazan la edición |
| Stage aceptado y rollback | Retirada después de Stage rechazada; S0 y redos conservan sus snapshots/revisiones originales y la autoridad vigente |
| Identidad/replay falsos recalculados | Probes identity, replay, recomputed-identity-and-replay; el candidato sólo puede diferir por la cadena autorizada |
| Ataque U00q | Retirada real dentro de transacción y writer con payload vacío + identidad/replay de cadena: TECHNICAL_CHAIN_AUTHORITY_NOT_MATERIALIZED |
| Snapshot o certificado alterado | Fingerprints de resultado y snapshot se recalculan en los probes; validación/Stage vuelven a contrastar autoridad material y witness |
| 088/perfil congelado/historial | Probes profile-088, frozen-profile e historical-stage: no actualizan configuraciones o checkpoints históricos |
| Ausencia de policy | Inputs originales sin cadenas, propuestas ordinarias con esperas, U00q/U00r y A2 conservados; retirada legal rollback-only |
| Cero dominio vs presupuesto | B tiene MACRO_ZERO_DOMAIN exacto; límite cero en prueba focal devuelve BUDGET_EXHAUSTED, nunca inviabilidad |

El flujo productivo nativo selecciona toda la unidad. Los prefijos iniciales y la revalidación material de su continuación se prueban en PostgreSQL focal; no se afirma haber aceptado un Stage parcial nativo que la UI no ofrece. El Stage futuro de D acepta únicamente la independiente y mantiene un witness explícito íntegro, sin placements técnicos ocultos.
