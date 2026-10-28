# Primer rechazo y ruta causal

Los recibos de `mixed-first-rejections.json`, dentro de cada archivo comprimido, conservan payloads e IDs reales. SQL es una llamada SELECT al helper productivo `assert_daily_technical_chains`, con el ledger completo aplicado. **No se llama rechazo de Stage a un rechazo anterior de autoría.**

| Intervención solicitada | API real | SQL real | Clasificación |
| --- | --- | --- | --- |
| `requiredResourceIds: []` | 400 `Array must contain at least 1 element(s)` | P0001 `TECHNICAL_CHAIN_INVALID_PHASES` | Contrato diario no representable. |
| A, B, C o A+B como conjunto común | 422 `TECHNICAL_CHAIN_RESOURCE_NOT_REQUIRED` | P0001 mismo mensaje | Garantía universal falsa para esos miembros; endurecimiento correcto del contrato vigente. No demuestra inviabilidad temporal. |
| Omitir el campo o poner `resourceContinuity: OFF` | 400 | No se insiste por SQL | No existe modalidad diaria equivalente. |
| Dividir en tres cadenas | 400, máximo una policy | No se insiste por SQL | Ni compone la macro ni representa la frontera entre fases. |
| Ámbitos de operación propios sobre este día con conjunta | 422 `UNSUPPORTED_TASK_SCOPE_COMBINATION` | No alcanzado | Guard de autoría distinto; no resuelve continuidad temporal. |

El editor existente permite seleccionar los siete representantes en tres fases, pero ofrece **cero recursos comunes y Guardar deshabilitado**. `mixed-ui-boundary.json` registra ambas comprobaciones del DOM. `mixed-no-common-resource.png` es sólo una captura parcial de la selección de fases; el recorte del contenedor no muestra el botón inferior. Es anterior a una petición API válida. No se añade editor alternativo.

Las filas completas del plan y el Draft son idénticos antes/después de los intentos principales. No existe revisión/snapshot guardado para las fases mixtas. Las revisiones de conjunta y pausa sí existen. No se emite propuesta por un PUT rechazado, ni se consume presupuesto de búsqueda para ese PUT.

| Tramo | Autoridad / función responsable y Evidence |
| --- | --- |
| UI/API | `TechnicalChainEditor`: `common` intersecta recursos efectivos de miembros; `valid` exige `resources.length > 0`. `shared/technicalChainStructure.ts`: schema estricto, `min(1)` y literal REQUIRED. `dayConfigEditSchema` y parse de `server/routes.ts` producen el primer 400. |
| Autoridad diaria | `applyDayConfigurationOperation → validateDailyTechnicalChains → technicalChainCombinationSupported → validatePhasedMembers`. Este último exige cada recurso de policy en `resolveEffectiveTaskResourceAssignments` para cada representante. Con ∅ físico no hay lista no vacía verdadera. El 422 es de aquí, antes del writer. |
| Snapshot/revisión | En contratos aceptados: `buildCanonicalPlanConfig`, proyección de autoridades/replay, writer `apply_day_config_operation_v5`, CAS y `plans.daily_technical_chains`. `common` tiene fases, `mixed` sólo conjunta/pausa. Las copias en memoria nunca se usan para reconstruir una revisión SQL. |
| EngineInput | `buildEngineInput` aplica composición itinerante, preferencias/estructuras, cadena diaria, anclajes, ámbitos, conjunta y pausa según su wiring actual. `applyDailyTechnicalChains` volvería a exigir la autoridad diaria. El contrafactual se incorpora **después** de capturar input de producto, en una copia. |
| Preflight/adapter | `preflightEngineInputForPlannerNext` valida IDs, fases/aplanado, pertenencia y recursos reales; no exige lista común no vacía. `adaptEngineInputToPlannerNextProblem` preserva fases y canonicaliza IDs; `nativeTechnicalChainPhasesVersion=1` activa futuro físico colectivo. `preflight` core admite esta descripción interna. SUPPORTED observado. |
| Scope | `resolveAssistedScope` cierra representantes y peers de conjunta; `expandVisiblePrerequisites` sólo cuando se solicita. `buildAssistedProblem` distingue scope de supporting y contexto fijo. El scope competidora A propone una tarea; no acepta las otras 16 porque aparezcan en su witness. |
| Geometría y asignación | `executeAssistedPlanning → executePlannerNext → constructExactItinerantPlan`; standalone no ejecuta geometría/matching Main. `pendingTechnicalChains/getTechnicalChains → createTechnicalChainExplorer → createContiguousTechnicalChainExplorer` explora roots y permutaciones internas; no permuta fases. `canPlaceTask` valida personas, espacio, recursos, ventanas, dependencias y transiciones configuradas. Ningún nuevo solver. |
| Conjuntas | La macro posee un representante; `jointGroupMembers/canPlaceJointGroup/scheduleJointGroup` materializan ambas obligaciones en un intervalo indivisible. La igualdad de recursos del grupo se conserva. No se serializan peers ni se reserva el recurso dos veces. |
| Futuro | `physicalFutureIds/collectiveCoreProjection` conserva el día entero. `nominalPhysicalFutureWitness` incluye 17 tareas y canal de descanso. La continuación mantiene la decisión A aceptada/simulada; los otros tiempos del witness siguen siendo reparables. Matching Main, bundles y futuras rondas: cero, no ejecutados por este perfil. |
| Propuesta/certificado | `certifyDailyTechnicalChain` valida el witness con todos sus canales y devuelve WITNESS/`consumed:0`. No hay pérdida de pausa de U01a. `assertNominalProposalWitness` comprueba fuente material, recursos exactos, contexto protegido, fingerprint y `validatePlan` antes de persistir/aplicar propuestas productivas. Se mantiene sin cambios. |
| Draft/Stage SQL | Producto real usa apply→Draft→validate→accept-stage. 115 es la autoridad previa lineal; 120 conjunta y witness material; 121 pausa física; 122 admite fases y reutiliza esos consumidores. `assert_daily_technical_chain_snapshot` exige revisión y run auténticos, witness global, orden de fases, adyacencia y recursos comunes. Reinvoca `assert_daily_technical_chains`, que rechaza ∅. El contrafactual **no alcanza** este Stage. |
| Continuación | `common` y el control `mixed` sin fases conservan S1 literalmente en S2. La secuencia mixta REQUIRED sólo conserva esa propiedad en memoria. Nunca se confunden ambos resultados. |

## Control itinerante

`itinerant-control.json`: unidad configurada, correspondencia diaria inequívoca y recursos efectivos AB→AB→C. El primer PUT devuelve 422 `UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION`; SQL P0001 idéntico. Causa concreta: `requiredPhaseCompositionSupported` rechaza cualquier `itinerantTeamAvailability.length`; además rechaza requisitos de equipo en tareas. SQL 122 replica la exclusión por existencia de snapshot y requisito itinerante. Ocurre antes de comprobar el conjunto común.

Con la misma unidad/recursos, la copia interna con conjunto común vacío es SUPPORTED y tiene witness/certificado válido. Esto refuta la interpretación de ese primer guard como prueba física universal. Es una **combinación no certificada por producto**, conservadoramente excluida. No autoriza retirar el guard: no se ensayaron SQL con fases itinerantes, selección alternativa, conjunta itinerante, transición positiva ni recomposición de miembros de una misma unidad.

## Integridad frente a falsa simplificación

Mantener una policy común A sobre el witness mixto devuelve `TECHNICAL_CHAIN_VIOLATION`: es correcto. Borrar un recurso efectivo de una operación, introducir un hueco, separar la conjunta o borrar la pausa producen invalidación material en memoria. La libertad física no procede de desproteger recursos.

El SELECT `*-sql-empty-subset-semantics` registra `jsonb_agg` de ∅ = NULL y su contención = NULL. Si se habilita la modalidad vacía en otra unidad, habrá que expresar esa semántica explícitamente en el consumidor existente, sin depender de que `IF NOT NULL` no entre. Este hallazgo por lectura/SELECT **no es un certificado SQL de la extensión**.
