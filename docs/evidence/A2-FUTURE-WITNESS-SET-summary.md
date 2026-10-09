# Future Structural Witness SET — certificación conjunta exacta

Base: PR #1101, rama `codex/implementar-continuidad-estructural-cross-stage-yrqh7u`, commit `186dbb0d1a4bf480949c7c300953a81dbf2df10d`. Rama nueva: `codex/certificar-future-structural-witness-set`. No merge.

## Delta causal implementado

- **X:** S3 agotaba 100.000 ramas y permanecía en 38/266.
- **Y:** el gate cerraba cada explorer al encontrar su primer witness; el explorer siguiente no recibía sus placements, preparaciones ni reservas. Una continuación rechazada tampoco enumeraba todos los matchings alternativos de la misma geometría de rondas. La agenda muestreaba sólo el inicio de cada intervalo exacto.
- **Z:** no se certificaba una combinación conjunta y se repetía la reconstrucción de unidades futuras. Un start interior válido podía desaparecer de la búsqueda.
- **W:** coordinador recursivo por identidad, continuaciones de los explorers existentes, revalidación y fallback de priors, contexto analítico acumulado, gate global exacto, particiones disjuntas de matchings rechazados, `domain.starts()` y pruning incremental con `PreparedOperationalMealAuthority`. Orden barato por deadline/frontier, slack, carga y presión de comidas; ninguna regla por nombre o fixture.
- **M:** S3 PROPOSAL en 46/266 con 21.265 ramas; S4 en 65/266; S5 manual en 69/266 con 180 ramas. S1/S2 conservan exactamente sus snapshots aceptados del baseline.

Las identidades ROUND_SYNCHRONIZATION e ITINERANT_AGENDA permanecen separadas. Sólo los certificados cruzan el gate; las placements analíticas no se convierten en propuestas, locks ni protección. La revalidación PASS del prior sólo implica reuse si pasa la continuación completa. Las autoridades conservan BUDGET_EXHAUSTED/ABSTAIN sin promoverlos a PASS ni infeasibilidad.

## Gates manuales limpios

| Stage | Completed | Branches | Resultado | Tiempo run 1 | Tiempo run 2 |
| --- | ---: | ---: | --- | ---: | ---: |
| S1 Main | 19/266 | 11.632 | PROPOSAL | 39,898 s | 49,969 s |
| S2 Feeders | 38/266 | 5.188 | PROPOSAL | 2,913 s | 6,105 s |
| S3 Reality C + EVA → Alfombra | 46/266 | 21.265 | PROPOSAL | 11,954 s | 20,999 s |
| S4 Totales | 65/266 | 6.225 | PROPOSAL | 5,639 s | 6,594 s |
| S5 Reality A/B | 69/266 | 180 | PROPOSAL | 2,341 s | 1,777 s |

Todos pasan hardValid, requiredValid y globalMealGate. S5 revalida y reutiliza el prior itinerary de S4. Los dos runs coinciden en completed, scopes, fingerprints de Stage, ramas, placements aceptadas, certificados individuales, fingerprint del set, supporting pipeline, preparaciones y comidas operacionales/participantes. El runner comprueba la preservación de cada decisión aceptada.

S3 examina 55 geometrías actuales; el ordering material prueba primero A/B cuando su frontier es más restrictivo. Las geometrías inviables se descartan antes de reconstruir Totales. La geometría aceptada tiene frontier 985, un candidato de agenda y un candidato de rondas, y pasa el gate global. El backtracking entre witnesses incompatibles y entre matchings se demuestra también con tests genéricos, incluidos priors y budget.

Evidence: `A2-FUTURE-WITNESS-SET-manual.json`, con ambos runs completos y traces por geometría.

## Automático y condición de salida A/E

`npm run benchmark:planner-next:a2-assist-8` ejecuta dos recorridos limpios deterministas y alcanza **209/266**, 9 Stages aceptados; el intento 10 se detiene tras 88 ramas. Secuencia: 19 → 38 → 46 → 65 → 75 → 111 → 169 → 207 → 209. El selector automático de S5 incluye diez tareas; el selector manual A/B incluye cuatro, de ahí 75 frente a 69.

### Siguiente blocker — X/Y/Z/W/M

- **X:** no puede materializarse el cierre pendiente de 57 obligaciones tras aceptar 209.
- **Y:** decisiones anteriores dejan tres tareas de ESTILISMO_SALIDA, de 5 minutos cada una y en el mismo espacio, con sólo dos starts exactos: 1130 y 1135. Sus predecesores aceptados terminan en 1125; el margen de participante exige cinco minutos antes del cambio de espacio.
- **Z:** contradicción de capacidad colectiva: tres tareas necesitan tres slots distintos y sólo existen dos. El primer prune observado es una comida de C01, pero no explica por sí solo el fallo completo; la prueba Hall de C06/C10/C16 sí demuestra la imposibilidad del cierre bajo este snapshot.
- **W propuesto, no implementado:** una autoridad de capacidad colectiva del cierre pendiente que reserve dominios compatibles de estilismo, comidas y OUT antes de aceptar las decisiones que los restringen. Esta es una arquitectura distinta del coupling entre ROUND_SYNCHRONIZATION e ITINERANT_AGENDA.
- **M observado / criterio del siguiente delta:** Hall 3 > 2 con las placements actuales; una futura corrección deberá rechazar esa pérdida de capacidad antes de aceptación y demostrar una continuación completa con los HARD/REQUIRED existentes. No se ha demostrado todavía una planificación completa de 266/266.

Prueba concreta:

| Cierre | Predecesor aceptado | Intervalo del predecesor | Starts del cierre |
| --- | --- | --- | --- |
| task:10074 (C06) | task:10085, joint post-Totales, S9 | 1120–1125 | 1130, 1135 |
| task:10133 (C10) | task:10144, joint post-Totales, S9 | 1120–1125 | 1130, 1135 |
| task:10220 (C16) | task:10215, Reality C, S3 | 1115–1125 | 1130, 1135 |

Call path reconstruido:

`recommendNextAssistedScope(PARTICIPANT_CLOSURE)` → `AssistedProposalService.request/run` → `resolveAssistedScope` → `buildAssistedProblem` → `executeAssistedPlanning` → `executePlannerNext` → `runExactItinerantPlanSearch` → `searchStandalone` → `completeAfterOrdinary` → materialización exacta de prerequisites de departure → `assessFutureAuthorities` → `probeParticipantMealFutureFeasibility` → `analyticParticipantMealDomain`.

El intento tiene cero complete leaves, cero materializaciones exactas terminales de comida y **cero invocaciones de futureWitnessSet**. El coordinador no participa en este bloqueo. No se implementa otra arquitectura.

Evidence: `A2-ASSIST-8-assisted-completion.json` y `A2-FUTURE-WITNESS-SET-next-blocker.json`. La prueba Hall enumera subconjuntos únicamente en el diagnóstico read-only de benchmark; no cambia decisiones ni presupuestos del planner.

## Validación y reproducción

- `npm run check`: PASS.
- 255 tests en 14 archivos: PASS. Cubren exactItinerantPlan, memoization, exactRoundSynchronization, assistedPlanning, assistedProposalService, operational meals, itinerant authority/assignment/meals, resource/participant meals, anonymousPipelineWitness y los nuevos tests de witness-set.
- `git diff --check`: PASS.
- Preservación del input y del contexto aceptado, counterexample del start interior, incompatibilidad conjunta, exhaustion exacto, priors compatibles/incompatibles, budget, ephemeral e invariancia de orden: cubiertos.

```sh
node --import tsx server/benchmarks/runA2Assist8ManualEvidence.ts --determinism
npm run benchmark:planner-next:a2-assist-8
node --import tsx server/benchmarks/runA2FutureWitnessSetClosureDiagnosis.ts
```

No se aumentaron budgets ni timeouts. No se modificaron scope ordering, DB, UI ni HARD/REQUIRED/meals.
