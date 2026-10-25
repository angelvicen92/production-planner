# Geometría, matching, continuidad y Future Feasibility

## Lo ejecutado

Estos días fijan un kit físico byItem en cada miembro. No hay elección entre recursos equivalentes que un matching deba resolver. El adapter conserva `requiredResourceIds` y `nonSubstitutableResourceIds`; A usa `plan-resource:2`, B usa `plan-resource:7`. La sustitución disponible no es una arista autorizada por esos requisitos. Afirmar que un “matching nominal” eligió el kit aquí sería falso.

`getTechnicalChains` infiere la macro T1→T2→T3. `probeExactTechnicalChainMacroDomain` y el explorer comparten el dominio de candidatos completos. Para una cadena inferida, cada sucesora puede comenzar después del fin de la anterior; `canPlaceTask` verifica recursos, espacios y ventanas. Para una policy REQUIRED, `createContiguousTechnicalChainExplorer` avanza un cursor exacto y comprueba que cada miembro tenga todos los recursos requeridos por la policy. Si T2 tiene sólo el sustituto, **el candidato completo se descarta**. Ni se elimina T2, ni se acepta T1/T3 como solución parcial de esa unidad.

En B, la macro inferida produce 10:00–10:20, 10:40–10:55 y 11:00–11:25. La macro explícita recorre 85 raíces de rejilla sin candidato completo. La causa no es un coste o una preferencia: T1 termina necesariamente a 10:20, pero T2 no puede empezar hasta 10:40. La modificación única de ventana de T1 restaura dominio y solución. No hace falta algoritmo nuevo para ese contrato.

`validatePlan` comprueba identidad de cada miembro, duración, espacio, dependencias y recursos exactos; la policy añade `predecessor.end===successor.start` y pertenencia de los recursos REQUIRED en cada miembro. La misma validación de A bajo ausencia de policy no permite deducir que una solución sin huecos esté gobernada por REQUIRED.

## Futuro sin materialización

`buildAssistedProblem` con eligibility del servicio conserva la policy y sus tres tareas como `analyticalFutureTechnicalChains` cuando sólo se pide la independiente. El futuro no se añade a tareas ejecutables ni al scope visible. Sin policy no existe esa unidad futura explícita REQUIRED.

En A, la propuesta independiente nativa es 09:00–09:20; con policy es **09:45–10:05**, 99 ramas, 11 checks, 9 podas y 2 passes de reserva de cadena. Sólo aparece `task:4` en la propuesta. El array genérico `futureStructuralWitnesses` está vacío en este camino; **no se usa ese contador para afirmar ausencia de reserva**. La autoridad técnica tiene su Evidence propia `technicalChainFutureReservation.preparedAuthority` y su cursor `nextExactReservation`.

El diagnóstico extrae una reserva exacta con las tres identidades y `productiveInterval`, firma estructural, orden y coste/ledger; `reservationRemainsValid` la confirma frente a la propuesta independiente. `A-future-exact-reservation.json` deja explícito `contextOnly: true`. Es observación en memoria; no escritura ni tareas aceptadas.

El probe causal separado coloca la misma independiente real a 09:10–09:30: la cadena tiene dominio cero completo, `certifiedCausingTaskId=task:4`, clasificación SINGLE_DECISION_ZERO_DOMAIN, 88 ramas. Al situarla 10:00–10:20 queda witness, 13 ramas. Al dar allowance cero devuelve ABSTAIN/BUDGET_EXHAUSTED sin acusar a una tarea. En B la cadena ya es imposible antes del independiente; el probe no debe inventar culpable y su Evidence muestra FIXED_CONTEXT_ZERO_DOMAIN.

Una reserva no congela una hora nominal futura: el explorer puede buscar/reutilizar/reparar otro witness si una decisión cambia. Sólo garantiza al menos una continuación compatible dentro del dominio probado. No se atribuye a la jornada nativa una reserva REQUIRED que no declaró.

## Qué harían otros matching, sin confundirlos

El recorrido main/pipeline agrupa geometría y bundles: `exactMainAndFeederCore.ts` incluye el perfil de cadena analítica en equivalencias de matching; `exactItinerantPlan.ts` recibe conflictos de `PreparedFutureTechnicalChainAuthority`. Un conflicto certificado puede producir CERTIFIED_BACKJUMP con profundidades y tareas causales; sin profundidad atribuible rechaza la rama, y ABSTAIN se propaga como presupuesto agotado. No elimina permanentemente al participante ni un miembro de la cadena.

El matching de rondas (`exactRoundSynchronization.ts`) tiene otro protocolo: sólo `matchingReject.causalTaskIds` o un probe exacto atribuible autoriza vetar aristas; la continuación colectiva usa particiones de la conjunción rechazada. No es un mecanismo nominal genérico que deba invocarse en estos días sin rondas. Los 21 tests existentes de `residualMatchingCertificate.spec.ts` se ejecutan como regresión focal; no constituyen Evidence de una mezcla de rondas/cadenas creada desde UI.

El soporte ordinary de anyOf/byType tiene su certificado físico y límites; no se reutiliza cambiando el rol técnico para fingir una cadena. Los tests de witness nominal existentes pasan. Los futuros del experimento y la asignación byItem sí son nativos de estos contratos.
