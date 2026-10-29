# P0-G03b — auditoría previa (Fuente 07 §4.4)

Base autorizada: `78e6a9dc0941d50b0046e95b341591ad0232331e`. El checkout inicial era G01 `7302a333`; se recuperó la base material correcta antes de modificar producto. Fuentes oficiales 00–07 sin cambios.

**X:** G03 conserva 19 participantes, 19 comidas de 40 minutos, ventana 13:00–16:30, Main/Vocal y tres operaciones Reality con unidad C fija. El editor de fases está deshabilitado. **Y:** `requiredPhaseCompositionSupported` exige `mealMode === global_hard_break`; `technicalChainCombinationSupported`, `buildEffectiveConfigurationView` y `TechnicalChainEditor` propagan esa exclusión. `assert_daily_technical_chains` reproduce el rechazo en SQL. **Z:** no se puede guardar la autoridad de fases, aunque la proyección parcial de comidas es válida. **W:** admitir fases nativas con comidas flexibles representables, sin conjunta; extender el canal de comidas del validador físico global existente. **M:** contratos guardados por Chromium, propuesta auténtica de la fase con todas las comidas futuras, S1/S2 SQL y continuación exacta.

## Recorrido reconstruido antes de implementar

1. Settings declara plantilla de comida por identidad, duración, ventana y capacidad; crear día captura snapshots; crear participante produce su obligación individual. `applyNewDayPlannerConfiguration` conserva `mealTaskTemplateId` y el rol `meal_break_placeholder` en `buildEngineInput`.
2. `resolveFlexibleParticipantMealTasks` intersecta jornada, disponibilidad personal, ventana global y ventana propia cuando existe; resuelve duración, dependencias y ejecución. `engineInputAdapter` separa comidas de tareas productivas y publica `participantMeals` y `participantMealCapacity`. No crea una pausa global.
3. `resolveAssistedScope` cierra la fase completa desde un representante. `buildAssistedProblem` conserva supporting efímero, comidas analíticas y la proyección física colectiva de las fases nativas. `executeAssistedPlanning` incorpora las comidas analíticas al problema que consume el solver existente.
4. El core de Main construye arquitectura, geometría y matching de feeders/bundles; `exactItinerantPlan` usa el mismo ledger para unidades/fases y `probeParticipantMealFutureFeasibility` como prueba necesaria individual/colectiva. `assessParticipantMealFutureFeasibility` construye el witness conjunto exacto; una prueba individual positiva nunca certifica el futuro global.
5. `executeAssistedPlanning` filtra la propuesta visible y emite `nominalPhysicalFutureWitness` con tareas y todos sus canales de ocupación. `certifyGlobalParticipantMealGate` y `certifyDailyTechnicalChain` validan el mismo resultado; el certificado de fases llama `validatePlan` con comidas y consume cero ramas adicionales.
6. `AssistedProposalService.request/run` materializa únicamente el scope en `proposedDraftSnapshot`. Aplicar, validar y aceptar conservan revisión, hash, CAS y contexto protegido. `assertNominalProposalWitness` revalida el witness persistido, sin redescubrir otra solución.
7. SQL: `assert_daily_technical_chain_snapshot` llama `assert_anchored_choice_witness` y valida orden/continuidad REQUIRED. `assisted_record_proposal_clean_validation`, `assisted_accept_stage` y triggers mantienen autenticidad, fuentes, revisión y protección. La proyección de comidas aceptadas pertenece a 108; las futuras quedan pendientes en Draft/Stage.

## Lo probado y la primera pérdida posterior

G03 probó la exclusión de autoría y su contrafactual de un solo campo; no ejecutó esta intersección. U02d probó las autoridades físicas con pausa global, sin comidas individuales. Ninguna de esas evidencias acredita por sí sola Stage de G03b.

Un probe diagnóstico sobre el input real G03, añadiendo la autoridad únicamente **en memoria**, obtuvo la fase de tres operaciones en 859 ramas: 41 tareas productivas + 19 comidas, certificado `WITNESS`, `consumed=0`. No se presenta como autoría ni Stage.

La primera incompatibilidad de representación posterior está en SQL 121: `assert_anchored_choice_witness` descuenta las comidas del número de tareas y valida sus ocupaciones sólo si hay `daily_operational_meal_policies`. Sin pausa explícita, una fase con comidas flexibles enviaría 41 tareas a un consumidor que exige 60. La migración 128 amplía exactamente las tres condiciones de entrada al canal existente para fases; conserva las comprobaciones materiales de identidad, completitud, ventanas, duración, locks, dependencias, capacidad y competencia. No añade otra búsqueda, scheduler o witness.

La admisión nueva excluye conjuntas flexibles; `jointCombinationSupported` y su SQL conservan su frontera global. Las alternativas itinerantes, transición positiva, transporte, rondas, setup, recursos no admitidos y requiresBand mantienen los guards de sus consumidores. Una configuración guardable sigue necesitando propuesta y certificación física antes de Stage.

## Primera validación nativa y corrección del consumidor

El tercer intento (los dos primeros eran errores de harness) produjo y aplicó una propuesta auténtica de tres operaciones y sus 19 comidas futuras. Los negativos materiales rechazaron omisión, duplicación, ventana, duración, capacidad y conflicto del participante con hashes recalculados. La validación genuina encontró `ANCHORED_WITNESS_PARTICIPANT_CONFLICT`: por ejemplo C01 termina Vocal a 14:15 y come 14:15–14:55, con margen productivo diario de cinco minutos. El SQL había añadido las comidas virtuales al loop de tareas y les aplicaba ese margen; `participantMeals`, `validatePlan`, SQL 108 y Fuente 05 §A2-ASSIST-8 exigen su ventana/duración, dependencias, capacidad y no solapamiento. No tienen ubicación física ni transición productiva.

128 reconoce exclusivamente el `kind=participant-meal` estampado internamente por el consumidor autenticado y conserva `gap>=0`. Las parejas de tareas productivas conservan exactamente el cálculo de margen efectivo y su guard. No se cambia el scheduler, duración, configuración ni witness para forzar la aceptación. Los recibos del intento anterior identifican el primer rechazo y no se cuentan como Stage certificado.
