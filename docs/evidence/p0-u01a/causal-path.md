# Ruta real y clasificación causal

Lectura sobre el código exacto autorizado, contrastada con ejecución nueva. Los pasos no alcanzados por el PUT se distinguen de la ruta de las propuestas soportadas y de los contrafactuales en memoria.

## Primer rechazo reproducible

`native/receipts.json.gz → api-receipts.json` conserva el PUT completo, con IDs de sus altas reales. En ambos descartables:

1. Autenticar con el Auth local; configurar catálogo/perfil, crear día, participantes y tareas con producto; declarar `jointGroups` y `operationalMealPolicies` mediante PUT con revisión consultada.
2. GET `effective-configuration`; guardar `technicalChains.revisionId`.
3. PUT `day-configuration` con `technicalChains:{contractVersion:1,policies:[{id,orderedTaskIds,phases,adjacency:'REQUIRED',resourceContinuity:'REQUIRED',requiredResourceIds}]}` y esa revisión.
4. **400**, mensaje literal `Unrecognized key(s) in object: 'phases'`. `shared/technicalChainStructure.ts:dailyTechnicalChainPolicySchema` no declara `phases` y es `.strict()`. `shared/dayConfig.ts:dayConfigEditSchema` lo incorpora; el parse en `server/routes.ts` rechaza antes de llamar al servicio.
5. Omitir sólo `phases` da **422 `UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION`** en `validateDailyTechnicalChains → technicalChainCombinationSupported`. Presencia global de conjunta o pausa basta para el rechazo, incluso si la pausa queda fuera del bloque.
6. Comparar filas de día/tareas, revisiones/replay y sesión/Draft antes/después: igualdad exacta. No existe revisión de fases, propuesta, Stage ni búsqueda para el PUT rechazado.

En SELECT de validación SQL, sin escritura, `assert_daily_technical_chains` devuelve `P0001 / UNSUPPORTED_TECHNICAL_CHAIN_STRUCTURE` para fases, y `P0001 / TECHNICAL_CHAIN_INVALID_MEMBER` para el contrato lineal sobre estas tareas con participante. Esos son los primeros rechazos SQL observados, no un hipotético fallo posterior de Stage.

## Call path material

| Frontera / autoridad existente | Comprobación actual y ejecución observada |
| --- | --- |
| UI/API | `TechnicalChainEditor` sólo selecciona tareas técnicas elegibles, lista ordenada y equipo común; `effectiveConfigurationView` marca esta intersección como no soportada. El PUT por fases falla en el schema antes del servicio. |
| Autoridad diaria | `dayConfigurationService.applyDayConfigurationOperation` reconstruye configuración, valida `validateDailyTechnicalChains` y preflight antes del writer. Tras retirar sólo el campo no representable se alcanza el guard 422. El contrato válido usaría `apply_day_config_operation_v5`/CAS y `plans.daily_technical_chains`, sin otra tabla/writer. |
| Revisión/snapshot | `buildCanonicalPlanConfig`, `projectEffectiveAuthoritiesFromEngineInputV1`, `buildEffectivePlanConfigReplaySnapshotV1` incluyen `technicalChains` completas. En baseline sí se materializan conjunta y pausa en revisión y replay; no se inventa revisión de fases. |
| `buildEngineInput` | Línea de retorno aplica, en orden interno→externo, preferencias/rondas/preparaciones, continuidad, cadena diaria, anclajes, ámbitos, conjuntas y pausa. Declarar primero una familia no evade la validación de las demás en la reconstrucción. No se cambió ese orden. |
| Preflight/adapter | `engineInputPreflight` conserva `phases` ordenadas, exige aplanado idéntico a `orderedTaskIds`, identidad/pertenencia y recursos reales. `engineInputAdapter` proyecta ambas a IDs canónicos. `validate.preflight` acepta auxiliares con participantes y representación de conjunta. **SUPPORTED** en la copia en memoria por fases. |
| Scope | `AssistedProposalService.request/run` valida sesión/revisión/fingerprint, usa `resolveAssistedScope` y opcionalmente `expandVisiblePrerequisites`; `buildAssistedProblem` cierra dependencias, peers de conjuntas y cadenas sin crear estado aceptado. La selección de A cierra ocho obligaciones individuales; preparaciones permanecen supporting. Hay una pérdida de cierre visible para el peer no representante, descrita abajo. |
| Geometría/estructura | `executeAssistedPlanning → executePlannerNext → constructExactItinerantPlan`. Perfil STANDALONE_ONLY: no se ejecuta geometría Main/feeder. `pendingTechnicalChains/getTechnicalChains` crean una macro con siete representantes. `jointItems` excluye grupos poseídos por esa macro; `coupledTaskIds` incluye también el peer. La unidad no se duplica como macro conjunta independiente. |
| Alternativas/materialización | `createTechnicalChainExplorer → createContiguousTechnicalChainExplorer`: producto de permutaciones dentro de cada fase y roots de rejilla; fases no se permutan entre sí. `canPlaceTask/canPlaceJointGroup` comprueban autoridades físicas. `scheduleJointGroup` expande dos obligaciones al mismo intervalo; la macro representativa consume 40 minutos y un kit físico. |
| Matching | En este perfil las identidades/recursos son nominales y explícitos. No se ejecutan matching Main/feeder/bundles, ni se presume su equivalencia: todos sus contadores son cero. La asignación temporal de la macro usa la autoridad existente de permutaciones/colocación; inventar otro matcher no solucionaría el PUT. |
| Future Feasibility | Para scopes parciales, `physicalFutureIds/collectiveCoreProjection` conserva todo el día por las autoridades nativas conjunta/pausa. El witness contiene 15 tareas y descanso; sólo persiste el scope autorizado. Los contadores de la reserva técnica especializada son cero porque esta ruta usa el witness físico colectivo, no porque se haya certificado ese subsistema separado. |
| Propuesta/Draft | Baseline nativo: 21 ramas para S1, 20 para S2, 1 y 14 tareas propuestas respectivamente. `assertNominalProposalWitness` revalida todos los canales, `projectDirectResourcesToProduct` conserva IDs reales. API apply → Draft → validate → accept-stage ejecutadas. Fases en memoria: 81 ramas y 15 propuestas; ningún apply. |
| Gate específico de cadenas | `AssistedProposalService.run` llama a `certifyDailyTechnicalChain` antes de emitir `safeProposal`; `technicalChainGate` exige WITNESS. La función valida sólo tareas y pierde la pausa del witness. Con la solución completa auténticamente generada en memoria devuelve INVALID, `OPERATIONAL_MEAL_VIOLATION`, 0 ramas adicionales. Por ello abrir schemas/guards tampoco produciría una propuesta productiva certificada. |
| Stage/SQL | `assisted_accept_stage`, validaciones y triggers conservan la frontera. Helpers de 120/121 revalidan conjuntas, materialización, disponibilidad, pausas y witness físico (`assert_anchored_choice_witness` reutilizado). Los Stages baseline son reales y se comparan con filas SQL. Para fases, 115 exige contrato técnico lineal y valida continuidad siguiendo `orderedTaskIds` y prefijo, no la realización de fases. 120/121 vuelven a excluir cadenas/continuidad en sus autoridades. No se modifica ni salta nada. |
| Continuación | Baseline S2 conserva literalmente la competidora de S1. En memoria, el scope independiente propone una tarea y conserva 15 futuras; continuación propone 14, conserva la decisión fija y valida el witness global. No equivale a continuación SQL de fases. |

## Contabilidad, ramas y parada

`memory/direct-execution.json` usa el problema construido por Assisted y sus mismas opciones (`nominalTaskIds`, fixed context); no usa la ejecución global de optimización como sustituto. Devuelve COMPLETE, 81 ramas de 10.000, 0 core, 0 backtracks, 0 zero-alternative prunes, sin exhaustion. Waterfall suma exactamente 81 (canal `other` del standalone). La macro evalúa 73 root/orden, considera cuatro roots y encuentra uno factible antes de terminar. Las 72 evaluaciones anteriores quedan en placement/continuación; no se inventa una atribución granular de cada rechazo que el diagnóstico no expone. La traza macro conserva competidora primero (dominio 46), cadena después (dominio inicial 984, condicionado 912).

El explorador directo guarda los primeros 30 candidatos reanudables; es una muestra, no enumeración exhaustiva del dominio. Las tres inversiones de orden interno encuentran realizaciones globales diferentes, con 89/81/81 ramas. Desplazar la pausa al interior del antiguo bloque necesita 225 ramas y conserva validez. El contrafactual de poner los dos miembros conjuntos como pasos seriales agota 10.000: se registra **agotamiento de esa representación errónea**, nunca imposibilidad del contrato de siete operaciones.

Cuando una rama descendiente devuelve DEAD_END, la ruta existente de `exactItinerantPlan` vuelve a pedir el siguiente candidato al mismo explorador y aumenta `standaloneBacktracks`; si `explorer.exhausted`/ledger se agota devuelve BUDGET_EXHAUSTED. No ocurrió en la realización representativa positiva. No se probaron todos los órdenes/roots ni se declara optimalidad.

## Clasificación

| Hallazgo | Clase causal | Lo que demuestra |
| --- | --- | --- |
| 400 por `phases` | Contrato diario no representable | Primer blocker real; anterior al motor. |
| 422 cadena × conjunta/pausa | Guard conservador global | No es regla física: contrafactual representativo tiene witness válido. |
| Miembros auxiliares/participantes rechazados | Restricción del productor | Tras quitar conjunta/pausa sólo de una copia diagnóstica aparece `TECHNICAL_CHAIN_INVALID_MEMBER`; también lo confirma SQL. No es necesario convertir esas obligaciones en técnicas ni eliminar participantes. |
| `operationContinuityPreflight` | Contrato distinto e insuficiente | Rechaza múltiples espacios y conjunta; tampoco expresa fases. Incluso una conjunta en un solo espacio es UNSUPPORTED. No sustituye a `technicalChains.phases`. |
| `certifyDailyTechnicalChain` | Pérdida real en certificación | Valida tareas sin canal de pausa y bloquearía `safeProposal`, aunque el witness global completo es válido. |
| SQL 115/120/121 | Certificación no compuesta | Rechazos actuales observados; lectura material demuestra orden lineal, prefijo y exclusiones incompatibles con la extensión. No se afirma haber alcanzado su rechazo de Stage por fases. |
| Peer conjunto no representante | Pérdida de cierre visible | `resolveAssistedScope` expande cadena antes de conjunta: seleccionar sólo el peer devuelve la pareja visible, no las ocho obligaciones de la unidad. `buildAssistedProblem` conserva el resto como supporting y el witness sigue válido. `includePrerequisites=true` puede hacerlos visibles, pero una unidad declarada no debería depender de ese flag para cerrar sus miembros. |
| Agenda/herencia/ocupación × conjunta | Otro guard conservador | PUT independiente `taskOperationScopes` devuelve 422. Las dimensiones físicas existen; su autoría conjunta sigue sin certificarse. |
| Equipo 40 min / carga 70 | Inviabilidad física | Configuración soportada y búsqueda real: NO_PROPOSAL en 6 ramas, sin Stage. |
