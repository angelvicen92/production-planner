# Primer rechazo auténtico

Fuente ejecutada: `native/source-manifest.json.gz`; recibos `native/receipts.json.gz`. Los tres planes se crearon mediante UI, conservaron todas sus tareas pendientes y guardaron la pausa. No se parcheó un guard para producir las respuestas.

## Primer día: conjunta antes de fases

`PUT /api/plans/1/day-configuration`, `expectedRevisionId` obtenido de la vista vigente (el recibo API conserva el valor exacto):

```json
{"jointGroups":{"contractVersion":1,"groups":[{"id":"synchronized-operation","taskIds":[6,13]}]}}
```

Respuesta **422** `{"message":"UNSUPPORTED_JOINT_COMBINATION"}`.

Call path: `routes.ts` → `applyDayConfigurationOperation` → reconstrucción base por `buildEngineInput` → `withDailyJointGroups` → `jointCombinationSupported` → `fixedItinerantCompositionSupported`.

Autoridad causal: existen tareas activas consumidoras de la unidad AB específica. El perfil Main real publica `mainFlow`, sin `profile: STANDALONE_ONLY`. El helper rechaza por perfil antes de contrastar el mapping fijo. La conjunta usa sólo B directo: el guard es global por consumidores de unidad del día y también excluye esta conjunta físicamente compatible.

Después se intenta:

```json
{"technicalChains":{"contractVersion":1,"policies":[{"id":"required-unit","orderedTaskIds":[4,11,18,5,12,6,19],"phases":[[4,11,18],[5,12],[6,19]],"adjacency":"REQUIRED","resourceContinuity":"REQUIRED","requiredResourceIds":[]}]}}
```

Respuesta **422** `{"message":"UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION"}`.

Call path: `applyDayConfigurationOperation` → `validateDailyTechnicalChains` → `technicalChainCombinationSupported` → `hasDailyRequiredPhases` → `requiredPhaseCompositionSupported`. La primera conjunción exige standalone y elimina toda alternativa Main antes de preflight o búsqueda.

`SELECT assert_daily_joint_groups(1,payload)` y `SELECT assert_daily_technical_chains(1,payload)` contra esas mismas fuentes devuelven **P0001 con los mismos mensajes**. Son contrastes de los validadores existentes; no modifican cuerpos, filas, revisiones ni permisos. 122 contiene el guard general del escenario por fases; 124 conserva otro guard standalone en la admisión itinerante de ambos validadores.

## Orden inverso y atomicidad

En plan 2 se intenta primero `technicalChains` y después `jointGroups`, cada vez con la revisión actual. Rechazos equivalentes 422/P0001. `beforePlan == afterPlan` en ambos días: las autoridades fallidas no se guardan parcialmente. S0 contiene 24 tareas pendientes; ninguna propuesta/Stage integrado se fabrica.

El encabezado puede mostrar READY para el conjunto de autoridades realmente guardadas, que todavía no contiene fases ni conjunta. Ese READY no es una certificación de la composición intentada; los editores rechazan expresamente su autoría. Las capturas de página conservan ese estado real y `*-ui.json` registra los botones deshabilitados.

La pausa se guardó primero en ambos días. No se ejecutaron las seis permutaciones de tres PUT. Dado que fases y conjunta se rechazan cada una por perfil aun sin la otra, invertirlas ya demuestra que no existe el remedio de «guardar primero la otra estructura». No se atribuye al orden de PUT una diferencia de matching entre IDs de días distintos.

`predicates.json` aísla el booleano: manteniendo todos los datos y cambiando **sólo para evaluar predicados** el discriminante de una copia a standalone, los cinco predicates pasan de false a true. Esa copia incompatible con tareas Main **no se envía al solver ni a persistencia**. La prueba física usa el perfil Main original sin ese cambio.

## Clasificación

| Observación | Clasificación | No significa |
| --- | --- | --- |
| Guard UI/API/SQL Main × macro | `UNSUPPORTED_EXPLICIT` | Inviabilidad o búsqueda agotada |
| Primer intento de técnica sin unidad/cadena | `UNSUPPORTED_EXPLICIT` | Defecto de geometría Main; se corrigió su autoría con unidad física específica, sin eliminarla |
| Copias positivas con autoridades rechazadas | Runtime físicamente válido, Stage `NOT_TESTED` | `PRODUCTIVE_COMPOSED` |
| Capacidad imposible, control U01f | `PHYSICALLY_INFEASIBLE` por cota independiente y rechazo sin agotamiento | Regresión de composición |
| Negativo integrado que consume 10.000 ramas | `SEARCH_EXHAUSTED`; input físicamente imposible por comprobación independiente | Certificado del solver de inviabilidad |
| Pérdida de geometría/matching/supporting/futuro del positivo | No observada en esta intersección | Garantía para todas las topologías |

No hay `CONSUMER_DEFECT` demostrado en el positivo tras las admisiones. La investigación de un límite de búsqueda del negativo se documenta separada; no redefine el próximo delta.
