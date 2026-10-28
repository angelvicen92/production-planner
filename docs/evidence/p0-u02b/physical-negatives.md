# Validación física y negativos

`verify.py` no llama al producto ni construye horarios: contrasta recibos de las dos bases. Comprueba 24 identidades, 23 operaciones físicas, duración, ventanas de participantes/espacios/recursos/unidades, recursos exactos incluidos coaches y miembros, dependencias, exclusión compartida, conjunta deduplicada, fases consecutivas y Main continuo. Compara SQL `joint_task_resources` con la asignación efectiva TypeScript.

Los ataques usan runs/revisiones/Drafts auténticos. Clonan sólo el resultado que se ataca, recalculan hashes de witness, resultado JSONB y Draft cuando corresponde, actualizan las copias transaccionales y llaman al validador real bajo `service_role`. Siempre ROLLBACK. Los errores de permisos, hashes, run inexistente o montaje no cuentan como prueba física.

| Ataque material | Rechazo SQL observado |
| --- | --- |
| Miembro obligatorio omitido, recurso inventado o recurso real no consumido añadido | `ANCHORED_WITNESS_PHYSICAL_RESOURCES` |
| Unidad inexistente o específica cambiada | `ANCHORED_UNIT_NOT_ELIGIBLE` |
| Dominio de unidad falsificado | `ANCHORED_WITNESS_DOMAIN` |
| Recurso/coach no disponible | `ANCHORED_WITNESS_RESOURCE_AVAILABILITY` |
| Unidad fuera de su ventana, conservando disponibilidad de persona/recurso | `ANCHORED_UNIT_UNAVAILABLE` |
| AB y AC simultáneas por A compartido | `ANCHORED_WITNESS_RESOURCE_CONFLICT` |
| Coach doble entre Vocal y Main de otra persona, en espacios diferentes y dependencias preservadas | `ANCHORED_WITNESS_RESOURCE_CONFLICT` |
| Vocal no termina antes de Main | `ANCHORED_WITNESS_DEPENDENCY` |
| Participante superpuesto en Vocal y preparación | `ANCHORED_WITNESS_PARTICIPANT_CONFLICT` |
| Peer omitido / desincronizado | `ANCHORED_FUTURE_STRUCTURAL_WITNESS_REQUIRED` / `JOINT_SYNCHRONIZATION` |
| Pausa eliminada / alterada / invadida | `OPERATIONAL_MEAL_GLOBAL_WITNESS_REQUIRED` / `OPERATIONAL_MEAL_MATERIAL_INVALID` / `OPERATIONAL_MEAL_PHYSICAL_CONFLICT` |
| Fase fuera de orden / hueco, con el resto de física intacta | `TECHNICAL_CHAIN_PHASE_ORDER` / `TECHNICAL_CHAIN_PHASE_GAP` |
| Recurso universal falso en la declaración de fases | `TECHNICAL_CHAIN_RESOURCE_NOT_REQUIRED` en el guard de fuentes |
| Draft materializado difiere de unidad/recursos del witness | `ANCHORED_SELECTION_SNAPSHOT_MISMATCH` |

El ataque phase-order/gap se demuestra en los dos perfiles originales. En la variante heterogénea, la primera tentativa de gap agotaba la ventana de pausa y alcanzaba antes su validador; ese intento no se cuenta como prueba del guard de fases. La variante acredita sus miembros compartidos, unidad conjunta y ventana de unidad con ataques específicos.

Se conservan separadamente los controles de autenticidad (`ANCHORED_AUTHENTIC_PROPOSAL_REQUIRED`), revisión obsoleta (`STALE_TECHNICAL_CHAIN_REPLAY`), certificado/run incorrecto y fingerprint deliberadamente falso. No se llaman conflictos físicos. Los negativos del RPC completo de aceptación y de protección se describen en `protection-and-continuation.md`.

## Imposible frente a agotamiento

El control standalone U01f conserva su cota independiente **55 > 40**, NO_PROPOSAL y rechazo sin agotar búsqueda. El integrado conserva **10.000 ramas**, NO_PROPOSAL y `STANDALONE_BRANCH_BUDGET_EXHAUSTED`; se clasifica **SEARCH_EXHAUSTED**, no certificado de inviabilidad. Su disponibilidad A hasta 08:40 es además incompatible con la pausa que requiere A después, por autoridad independiente. Ambos conservan S0 sin Stage nuevo. No se sube presupuesto/timeout ni se cambia matching/búsqueda para estos negativos.
