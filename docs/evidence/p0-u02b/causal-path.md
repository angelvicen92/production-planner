# Call path de entrada a Stage

| Frontera | Autoridad/consumidor | Comprobación |
| --- | --- | --- |
| General y día nuevo | `NewDayPlannerEditor`, `newDayPlannerConfigurationSchema`, `storage.createPlan` | Main/Vocal explícito; snapshots de plantillas, espacios, recursos y unidades |
| Tareas y dependencias | Formularios de participantes/plantillas, API `daily-tasks` | Tres Vocal→Main con dos coaches; macro, técnica y competidoras reales |
| Autoría diaria | `applyDayConfigurationOperation`, `validateDailyTechnicalChains`, `withDailyJointGroups`, `withDailyOperationalMeals` | Ambos órdenes de fases/conjunta; pausa UI y recarga |
| Vista | `buildEffectiveConfigurationView`, `requiredPhaseCompositionSupported`, `fixedItinerantCompositionSupported`, `technicalChainCombinationSupported`, `jointCombinationSupported`, `operationalMealsCombinationSupported` | Autoridades efectivas y editores habilitados; los mismos predicados gobiernan reconstrucción |
| Revisión | `buildCanonicalPlanConfig`, writer v5, CAS, `assert_joint_revision` | Replay materializado contra tareas y plantillas auténticas; fuente falsificada rechazada |
| Builder | `buildEngineInput`, `applyNewDayPlannerConfiguration`, `applyDailyItinerantComposition`, aplicaciones diarias | Main real; unidades diarias y recursos independientes; dependencias por participante; conjunta/fases/pausa |
| Adapter y scope | Preflight, `adaptEngineInputToPlannerNextProblem`, `resolveAssistedScope`, `buildAssistedProblem` | Macro/peer cierran ocho obligaciones; Main y Vocal conservan futuro y coaches |
| Construcción | `executeAssistedPlanning` → `executePlannerNext` → exact itinerant → `constructExactMainAndFeederCore` → continuación standalone | Geometría Main/feeder, matching residual y fases contiguas existentes |
| Futuro | Witness físico nominal global y `certifyDailyTechnicalChain` | 24 obligaciones más pausa incluso al proponer una; WITNESS consume cero ramas adicionales |
| Propuesta | `AssistedProposalService`, codec y autenticación del witness | Run real; ninguna propuesta ni EngineInput importados |
| Draft | Apply de run, snapshot y validación real | Sólo selección visible pasa al Draft; supporting no se acepta automáticamente |
| SQL | `assert_daily_technical_chains`, `assert_daily_joint_groups`, `assert_joint_revision`, `assert_anchored_choice_witness`, `assert_operational_meal_snapshot`, `assert_daily_technical_chain_snapshot` | Fuentes/replay, recursos y unidades, disponibilidad, conflictos, dependencias, conjunta, Main, pausa y fases |
| Aceptación | `assisted_accept_stage` por servicio/RPC | S1 parcial y S2 completos; relectura SQL de filas y fingerprints |
| Continuación/historia | Contexto protegido, rollback/redo, triggers de Stage | S1 literal en S2; relectura fría; checkpoints inmutables |

La primera pérdida estaba en admisión, antes de búsqueda. Tras el delta no se observa otra pérdida indispensable en el consumidor SQL de esta intersección: no se añade un resolver físico ni se altera `joint_task_resources`.
