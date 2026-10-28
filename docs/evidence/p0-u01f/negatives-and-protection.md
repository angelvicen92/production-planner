# Negativos SQL, protección y continuación

Los recibos `*-S1/S2-forgeries` y `*-unit-forgeries` conservan modo, consumidor y rechazo material. Se parte de planning_runs y Draft auténticos; se recalculan hash de witness, snapshot, selección de pausa y resultado SQL cuando procede. Las transacciones se revierten siempre. Los errores de harness y los intentos anteriores se enumeran en `attempts.json`; no se contabilizan como rechazos SQL.

| Intervención | Consumidor/resultado material |
| --- | --- |
| Miembro obligatorio omitido / miembro inventado | `ANCHORED_WITNESS_PHYSICAL_RESOURCES` |
| Unidad inexistente / identidad cambiada a otra unidad real | `ANCHORED_UNIT_NOT_ELIGIBLE` |
| Dominio de unidad falsificado | `ANCHORED_WITNESS_DOMAIN` |
| Unidad fuera de su disponibilidad propia, con persona y recurso aún disponibles | `ANCHORED_UNIT_UNAVAILABLE`, perfil common-unit |
| Recurso individual no disponible | `ANCHORED_WITNESS_RESOURCE_AVAILABILITY` |
| AB y AC simultáneas compartiendo A, con distintos espacios/unidades | `ANCHORED_WITNESS_RESOURCE_CONFLICT`, B-segments |
| Peers con unidad común pero recursos efectivos distintos | `assert_daily_joint_groups` → `JOINT_RESOURCE_MISMATCH` |
| Peers con iguales miembros pero distinta identidad de unidad | `assert_daily_joint_groups` → `JOINT_UNIT_MISMATCH`, fuentes diarias reales |
| Peer omitido / asíncrono | Futuro completo / `JOINT_SYNCHRONIZATION` |
| Pausa ausente / alterada | Witness de pausa/identidad física real, no sólo hash |
| Competidora A en pausa, en su espacio independiente | `OPERATIONAL_MEAL_PHYSICAL_CONFLICT`, D S1 |
| Hueco en cadena / fases desordenadas sin violar dependencias | `TECHNICAL_CHAIN_PHASE_GAP` / `TECHNICAL_CHAIN_PHASE_ORDER` |
| Universal C falsamente declarado | Autoría API/SQL → `TECHNICAL_CHAIN_RESOURCE_NOT_REQUIRED` |
| Universal A real aportado por unidad omitido del witness | `ANCHORED_WITNESS_PHYSICAL_RESOURCES` |
| Draft con recursos distintos del witness | Rechazo de decisión física persistida |
| Decisión aceptada S1 modificada | `ANCHORED_PROTECTED_DECISIONS` |
| Permutar dos operaciones de unidad ya aceptadas sin perder viabilidad | `ANCHORED_PROTECTED_DECISIONS`, segunda topología S2 |
| Revisión obsoleta | Rechazo de revisión/replay; CAS API 409 |
| Fingerprint falso / run ajeno | Consumidores de autenticidad existentes |
| Stage histórico actualizado, incluso con hash recalculado | service_role: 42501; propietario: trigger P0001 |

Los ataques de fuentes conjuntas usan las filas diarias y snapshots auténticos dentro de una transacción revertida, antes del Stage. No sustituyen snapshots ni desactivan triggers. En la segunda topología, S1 ya protege toda la macro: los ataques de estructura se prueban antes de esa protección, en S1; S2 prueba explícitamente su preservación. No se atribuye al sincronizador un rechazo anterior de protección.

## Liberación y recursos declarados

`A-fixed-resource-release-sql`: desplazar la competidora A al comienzo de III sigue siendo aceptable para el consumidor SQL, pues esa fase sólo exige B/C. `common-unit-resource-release-sql`: la misma competencia falla cuando la fuente real conserva A en todas las operaciones. Se altera únicamente el witness/placement de la competidora y sus hashes dentro de un rollback. No se fabrica un Stage.

El control common-unit mantiene AB también en el final que declara C: el resultado es ABC, no C. La selección de una unidad por tramo no cambia la composición interna de ninguna identidad. La disponibilidad colectiva se prueba independientemente de la individual.

`requiredResourceIds: []` sigue siendo explícito y válido sólo con fases. Omitido/null se rechazan en API y SQL; una lista no vacía se verifica contra los requisitos efectivos, también si llegan por unidad. La rama lineal y sus contratos inválidos mantienen sus controles históricos.

## Pausa y protección

En la segunda topología, S1 acepta la macro y dos preparaciones, dejando cierres y competidoras pendientes. No hay pausa inicial. Una nueva pausa A en el espacio independiente de competencia C se rechaza por `OPERATIONAL_MEAL_PROTECTED_DECISIONS`: ninguna tarea aceptada consume A por byItem y ningún espacio de la pausa coincide con los aceptados.

El contrafactual con el helper previo conserva el rechazo: al aceptar Stage, los miembros también quedaron materializados en assigned_resource_ids. Esto es una protección redundante ya existente, **no evidencia de que el helper antiguo permitiera esa edición**. 124 completa la autoridad física en autoría, igualdad y continuidad; el probe demuestra que conserva además la protección productiva. No se oculta este resultado ni se atribuye una vulnerabilidad de Stage que no fue observada.

Rollback/redo conserva literalmente el snapshot completo, incluyendo unidades, recursos y pausas materializadas. Los updates directos de Stage están prohibidos. El upgrade conserva los Stages anteriores sin adoptarles la nueva composición.

## Futuro y supporting

S1 de A–D acepta únicamente la competidora A; el futuro tiene las 17 obligaciones y la pausa. S2 acepta las otras 16 sin alterar S1. Los scopes de representante y peer sin includePrerequisites proponen sólo la macro; las tres preparaciones son supporting, sin placements aceptados automáticamente. `supporting-repair.json` permuta dos preparaciones del witness de una propuesta API real: mantiene validación hard y certificado WITNESS, con propuesta intacta y búsqueda cero.

El imposible conserva demanda A = 25 de fases + 15 de competencia + 15 de pausa = 55 frente a 40 disponibles: NO_PROPOSAL, sin Stage, sin BUDGET_EXHAUSTED, sin aumentar límites.
