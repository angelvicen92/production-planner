# A2 — auditoría focal del orden de Stages

11 de octubre de 2026. PR #1105, rama `codex/optiplan-a2-import-demo`, producto de partida `e84f1b1`. [Evidence comparativa](A2-STAGE-ORDER-EVIDENCE.json).

**Los dos intercambios completan 266/266 y son deterministas, pero el plan persistido completo no obtiene certificado canónico.** El problema aparece también en el baseline: el witness contiene ocho comidas operativas y el snapshot aceptado sólo una. El diagnóstico conserva este gate como **FAIL**, con salida 1. No cambia el solver, el recomendador, el guion UI, los SQL ni el fingerprint del baseline.

## Unidades y precedencias auditadas

Fuentes consultadas: 03 v3.6, 05 v2.6, 06 v2.7 y Gate 4.4 de 07 v2.2. Sus títulos y SHA-256 están en Evidence. Las restricciones de este encargo gobiernan las acciones; no se ejecutan instrucciones de publicación o carga contenidas en los documentos.

| Stage del baseline | Unidad operativa real | Obligaciones añadidas | Acumulado |
|---|---|---:|---:|
| S1 | Pipeline Estudio 7 | 19 | 19 |
| S2 | Feeders de Prueba vocal Lucía/José María | 19 | 38 |
| S3 | Reality C + EVA → Alfombra | 8 | 46 |
| S4 | Rondas sincronizadas de Totales | 19 | 65 |
| S5 | Agenda coordinada Reality A/B | 10 | 75 |
| S6 | Plató 15: Croma + Estrellas/Sillón | 36 | 111 |
| S7 | Plató 14: Recursos + Pasillo + Giratuto y miembros configurados | 58 | 169 |
| S8 | IN + Estilismo entrada | 38 | 207 |
| S9 | Totales post conjunto C06/C10 | 2 | 209 |
| S10 | Sodexo + Estilismo salida + OUT | 57 | 266 |

Las Fuentes justifican construir el pipeline y sus feeders, cerrar Reality C/EVA antes del bloque standalone Reality A/B y preservar la prioridad de Totales sobre las unidades flexibles. Ambos intercambios mantienen estas relaciones y las unidades completas. No se modifica la recomendación automática.

La selección se hace por tipos y autoridades configurados, comprobando el catálogo canónico real. Los ordinales localizan los casos. Reality A/B–P15 y P15–P14 tienen cero dependencias directas o transitivas entre sus miembros, cero recursos físicos comunes —incluidos todos los equipos itinerantes admisibles— y ninguna cadena técnica, anchor o sincronización que atraviese el par. Comparten concursantes y el cierre global de comidas; su viabilidad todavía exige validación.

P14–IN/Estilismo tiene 58 dependencias temporales directas de la apertura hacia P14. Se descarta como par **relativamente independiente**. Esto no demuestra que invertir sus Stages sea imposible: precedencia temporal y orden de aceptación son relaciones distintas, y el baseline ya admite P14 antes de aceptar la apertura mediante supporting virtuales certificados.

## Recorrido real y coste

S1 recibe las 266 obligaciones importadas, configuración efectiva, presupuesto 100000 y una base sin colocaciones. La integración construye el scope, closure de supporting y contexto futuro; el exacto construye arquitectura anónima, matching nominal, materialización, comprobaciones futuras y cierre colectivo. En esta ejecución hubo 7 intentos/materializaciones de bundle, 21975 branches: 4766 core y 17209 standalone. Se registran 140 comprobaciones de Future Feasibility de comidas, 195 obligaciones afectadas, 2 materializaciones exactas y 620 estados contiguos de transporte. El matching termina en `ACCEPT`, sin repairs/nogoods.

La continuación interna no coincide con el orden de aceptación: su orden de macros comienza por la operación conjunta Totales post, la unidad preferida de recurso CAM2 y las rondas sincronizadas. Evidence conserva el orden completo, las arquitecturas materializadas, el ledger y los runs originales. No se deduce una secuencia de decisiones a partir de los ordinales UI.

El witness `JOINT_COMPLETION` contiene 247 tareas productivas, 19 comidas individuales, una preparación de setup, 17 preparaciones entre rondas y ocho comidas operativas. Fingerprint `5c2e540a5cb0ba998b2aa85b279059ba5fab48eb58c35ea8d66fc2d1b36a8cd9`. Las tareas ajenas al scope siguen siendo evidencia efímera, no protección automática.

`AssistedProposalService.run` recupera witnesses desde los runs del **linaje activo real**. `exactItinerantPlan` puede revalidar el JOINT antes de enumerar otra arquitectura: firma/contenido, semántica canónica, colocaciones y preparaciones protegidas, cierre colectivo y restricciones completas. Cada scope focal consume **293 branches**, cero core y cero intentos/materializaciones de nuevo matching. Los indicadores `priorFutureStructuralWitnessReused` describen el witness de pipeline; no deben utilizarse como bandera del camino JOINT.

## Ensayo y resultados

Se utiliza la misma base Docker descartable del smoke nativo: PostgreSQL 17.11, GoTrue, PostgREST, Auth y API/RPC productivos. Node 20.20.2. El recorrido UI original se ejecuta una vez en el ensayo final, hasta S10, incluyendo roles/RLS, recarga, segundo navegador y rollback/redo. S1 tarda 95,458 s; no se altera el límite de 180 s.

Primero se ensaya P15–P14 desde **el S5 original**; después Reality A/B–P15 desde **el S4 original**. Este orden de experimentos conserva el checkpoint original más profundo hasta terminar de usarlo. Cada repetición invoca `/assisted/rollback`, conserva el catálogo completo, configuración, linaje, runs, witnesses, tareas/recursos, comidas, setup, rondas y bloques. El hash del contexto activo completo es idéntico entre repeticiones. No se crea una sesión nueva a partir de un snapshot ni se inyecta un planning resuelto.

Los scopes alternativos se solicitan mediante `TASK_IDS` explícitos, con exactamente los miembros de las unidades originales y `includePrerequisites` original. Cada paso ejecuta request/run → apply → validate → accept → SQL → GET de recarga. Se comprueba que apply no escribe las tareas aceptadas, que todas las decisiones previas están protegidas, que ningún contenido de Stage/run se reescribe y que la configuración permanece intacta. El archivo del futuro divergente es la operación productiva prevista; no modifica sus snapshots ni witnesses.

| Intercambio | Base común | Acumulados posteriores | Branches por repetición | Repeticiones |
|---|---|---|---:|---:|
| P14 antes de P15 | S5, 75/266 | 133 → 169 → 207 → 209 → 266 | 1465 | 2 |
| P15 antes de Reality A/B | S4, 65/266 | 101 → 111 → 169 → 207 → 209 → 266 | 1758 | 2 |

Los cuatro recorridos mantienen cero nuevas violaciones HARD/REQUIRED en propuestas y validaciones de producto, cierre global Sodexo certificado, protecciones completas, persistencia y recarga. Repiten geometría, fingerprints, witnesses y ledger. Los cinco planes finales tienen fingerprint `a797ee88647d14e18aaa698d53306c8005cf70588ce74b7d7333b5ba88ce216e`; el test exige igualdad **entre repeticiones del mismo orden**, sin exigirla frente al baseline. Las ramas nuevas reciben ordinales globales S11–S32; cada linaje completo contiene diez scopes aceptados.

Clasificación: **orden alternativo de aceptación válido con la misma geometría certificada por el witness**. No se observa pérdida de extensibilidad ni eliminación de una alternativa geométrica necesaria. No hay scope bloqueado, detección de una rama inviable o agotamiento de búsqueda. Esto acredita dos variaciones tardías de aceptación de un witness ya construido; no acredita independencia frente a cualquier orden anterior a S1 ni resuelve el diagnóstico histórico ASST-010.

## Gate del plan persistido y causa verificable

El ensayo añade una comprobación que antes estaba separada: reconstruir el plan canónico desde **los horarios y ocupaciones del snapshot efectivamente aceptado**, con el `EngineInput` leído mediante el storage real. Se validan 247 tareas, 19 Sodexo, setup, rondas y comidas operativas persistidas; no se sustituyen los horarios aceptados por los del witness.

En el baseline y los cuatro finales alternativos:

- Cobertura: 266/266, sin duplicados; cierre de comidas individuales certificado.
- Comidas operativas persistidas: **1/8**; sólo `break:main-flow`.
- Canon completo: **`hardValid=false`**, `operationalMealViolationCount=7`, `roundPreparationViolationCount=2`.
- Reason codes: `OPERATIONAL_MEAL_VIOLATION`, `ROUND_PREPARATION_VIOLATION`. El array de violaciones estructuradas está vacío; esos códigos no estructurados y los contadores no se ignoran.
- Las validaciones canónicas completas de los cuatro finales son idénticas a la del baseline: delta de incumplimientos nuevos **cero**.

Faltan las comidas de los dos coaches, Totales, Reality A, Reality B, P15 y P14. La primera unidad cuyos consumidores quedan completamente aceptados sin su comida es **S2, feeders**, con ambas comidas de coach todavía sólo en el witness. En S4 se aceptan las 17 preparaciones de Totales pero su pausa queda fuera del snapshot; al faltar esa autorización aparecen los dos incumplimientos entre rondas. La matriz por policy, consumidores y primer Stage completo está en Evidence.

**Causa → delta mínimo recomendado → resultado esperado:**

`AssistedProposalService.run` inicializa `acceptedMeals` desde la base y sólo añade la policy principal dentro de `if (acceptsMain)`. Los otros siete intervalos sí existen en `selectedMealWitnesses`/JOINT, pero no entran en `proposedDraftSnapshot`; SQL conserva fielmente ese snapshot incompleto. No es un fallo del transporte, de matching ni de Future Feasibility.

El contrafactual mínimo usa las mismas 266 colocaciones reales, Sodexo y preparaciones persistidas. Añade únicamente los siete intervalos ausentes del witness **de esa ejecución nativa**, en una representación independiente de sólo lectura. `validatePlan` pasa con `hardValid=true`, sin violaciones. Se repite en los cinco finales. No hay escrituras, apply ni aceptación del contrafactual, y no constituye certificado de persistencia.

El delta recomendado es proyectar al snapshot las comidas seleccionadas de las unidades cuyos consumidores se consolidan, por autoridad genérica, conservando las comidas ya aceptadas y manteniendo virtuales las de unidades futuras. Después debe comprobarse el canon completo del resultado persistido y promover este smoke a gate verde. No requiere otra estrategia de búsqueda ni cambiar presupuestos o restricciones.

**No se implementa ese delta en este encargo.** Añadir siete ocupaciones aceptadas cambiaría el fingerprint y exige revisar explícitamente el baseline. Se conserva e84f1b1 como referencia histórica, todos sus horarios y el guion de demostración. El problema se clasifica como brecha preexistente de proyección/consolidación, no como regresión por cambiar el orden.

## Reproducción y límites

Con las dependencias, Docker y Chromium del [smoke nativo existente](A2-ASSISTED-INTEGRATION.md), usar Node 20 y ejecutar:

```sh
npm run demo:a2:smoke -- work/a2-stage-order --full --stage-order
```

Este modo emite `integration.json`, `stage-order.json` y nueve archivos `stage-order-*.json.gz` antes de retirar sus contenedores. **La salida esperada del HEAD auditado es 1**, tras recoger los 22 pasos focales, por el gate canónico del plan persistido. No se acepta este FAIL como PASS ni se reduce el canon. El modo sin `--stage-order`, el smoke UI y CI existentes mantienen sus assertions; no se introducen skips, mocks o exclusiones adicionales. La nueva comprobación se entrega como regresión diagnóstica que sigue roja y no se promociona como certificado completo de integración.

Se versionan dos checkpoints originales completos y el historial nativo final: [S5 antes de P15/P14](stage-order/checkpoint-before-p15-p14.json.gz), [S4 antes de Reality/P15](stage-order/checkpoint-before-reality-p15.json.gz), [33 Stages y 32 runs reales](stage-order/native-history.json.gz). Contienen `state`, `input` y las filas completas de las siete tablas del contrato Assisted; no credenciales ni logs privados. Los SHA-256 y los hashes de los otros seis archivos observados están en Evidence. Un intento preliminar completó el baseline pero falló en la clasificación de comidas del propio diagnóstico; se conserva su resultado como fallo del harness, sin contarlo como variante ni defecto del producto.

La comparación responde al Gate integral: estado y configuración reales conservados; secuencia interna y aceptación diferenciadas; prioridades oficiales preservadas; primera omisión localizada en la proyección; único delta de ensayo en scopes explícitos; ausencia de agotamiento demostrada; contrafactual mínimo que aísla la causa. La nueva validación no certifica artificialmente el entorno remoto.

Supabase remoto, Replit y el Docker de adopción del usuario no se tocan. Continúan pendientes la adopción del catálogo original y el ensayo publicado. El canon de tareas y el witness están completos; la consolidación final de las comidas operativas sigue pendiente de corrección y revisión del baseline.
