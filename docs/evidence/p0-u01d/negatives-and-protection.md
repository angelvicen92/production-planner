# Negativos y garantías materiales

Los dos descartables finales contienen 178 rechazos SQL: **142 materiales y 36 de autenticidad/revisión**, además de negativos API. Cada mutación se ejecuta en transacción revertida; sólo se aceptan después las propuestas auténticas originales. No se cuentan estos SELECT ni los probes de liberación como Stages.

`contract-negatives.json` distingue primera frontera API de SELECT SQL independiente: campo omitido/null → HTTP 400 y rechazo SQL; identidad inexistente/falso A universal → HTTP 422 y rechazo SQL. No se atribuye al Stage un error anterior de API. El mínimo no vacío de cadenas lineales se mantiene en schema y en su rama SQL literal.

`*-S*-forgeries.json` recalcula fingerprint del witness, resultado y Draft y sincroniza los placements alterados con su witness. Los canales de pausa y demás autoridades permanecen intactos salvo cuando son el objeto del ataque. Así se prueba el consumidor material, no sólo la autenticidad del hash.

| Ataque | Consumidor / rechazo observado |
| --- | --- |
| Requisito de tarea omitido, falsa liberación o recurso inventado | `ANCHORED_WITNESS_PHYSICAL_RESOURCES` |
| Doble ocupación de recurso por la competidora | `ANCHORED_WITNESS_RESOURCE_CONFLICT` |
| Peer omitido o witness global incompleto | `ANCHORED_FUTURE_STRUCTURAL_WITNESS_REQUIRED` |
| Conjunta separada | `JOINT_SYNCHRONIZATION` |
| Hueco entre operaciones | `TECHNICAL_CHAIN_PHASE_GAP` |
| Fases desordenadas con dependencias conservadas | `TECHNICAL_CHAIN_PHASE_ORDER` |
| Dependencia incumplida | `ANCHORED_WITNESS_DEPENDENCY` |
| Descanso omitido / duración alterada | `OPERATIONAL_MEAL_GLOBAL_WITNESS_REQUIRED` / `OPERATIONAL_MEAL_MATERIAL_INVALID` |
| Alteración de S1 en la continuación | `ANCHORED_PROTECTED_DECISIONS` |
| Revisión obsoleta | `STALE_TECHNICAL_CHAIN_REPLAY` |
| Run distinto | `TECHNICAL_CHAIN_FUTURE_CERTIFICATE_REQUIRED` |
| Fingerprint deliberadamente inconsistente, con formato válido | Rechazo de autenticidad del consumidor; este caso se marca explícitamente como hash inconsistente |

`verification.json` conserva los códigos concretos y conteos. El ataque de fases elige una transposición que conserva todas las dependencias para alcanzar exactamente el consumidor de fases. En la segunda topología las dependencias ya ordenan los dos tramos, por lo que ese ataque específico se omite; los demás ataques se mantienen. La omisión/invención física se comprueba tanto en S1 como en S2.

`mixed-resource-release-sql` acepta A durante la fase final porque ninguna operación final lo consume. `common-resource-release-sql` rechaza el mismo patrón cuando las fuentes reales requieren A en todas las operaciones. Ambos recalculan hashes, conservan los otros canales y revierten la transacción. No se inventa un hold en producto ni se elimina ningún requisito físico.

La UI recarga y edita el mismo ID, con revisión y lista vacía. Los roles viewer/aux/sin rol/anónimo siguen denegados; CAS admin/production produce 200+409, la revisión obsoleta 409, y un fallo inducido al insertar revisión revierte toda la escritura. Las filas Stage rechazan UPDATE por rol de servicio y por su trigger de inmutabilidad. Rollback S2→S0 y redo S0→S1→S2 restauran el snapshot exacto.

La migración poblada 122→123 compara todas las filas y lectores antes/después, todas las políticas RLS y ACL/security/search_path de todas las funciones. No cambia writers, locks, `done/in_progress`, protección ni grants. Las suites focales/globales y regresiones existentes comprueban esas autoridades; esta extensión no crea una excepción para el conjunto vacío.
