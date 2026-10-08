# Capacidad colectiva del cierre participante

Base obligatoria: `codex/implementar-margenes-especificos-de-participante` @ `c00bb3d0b6211badad8d3b1352741b3dac1672ee`.
Rama nueva: `codex/preservar-cierre-colectivo-cross-stage`. Un PR; sin merge ni cherry-pick.

## Resultado y límite

**Condición de salida C.** El recorrido limpio conserva S1/S2 (38/266), rechaza S3 y agota sus 92 geometrías exactas bajo ese S2. No alcanza >209 ni 266/266. No se demuestra imposibilidad global de A2 ni se descartan otros S1/S2.

S3 consume 14.884 de 100.000 ramas, sin budget exhaustion ni abstenciones del cierre. Las 42 geometrías que conservan capacidad llegan al coordinador de futuros: todas agotan la agenda A/B sin producir candidato; ninguna llega a una combinación conjunta completa. Las otras geometrías tienen Hall o dominio individual imposible. La Evidence incluye las 92 trazas y su clasificación read-only.

Dos recorridos automáticos limpios coinciden en scopes, fingerprints, ramas, placements, preparaciones, comidas, futuros, cierres y HARD/REQUIRED. S1/S2 mantienen exactamente los snapshots y fingerprints del baseline. Cada aceptación utiliza los servicios request/run → apply → validate → accept; el runner comprueba preservación de filas y decisiones estructurales.

## Primer estado causal, medido antes de producción

| Stage baseline | Completadas | Matching directo de cierre | Directo compatible con OUT | Con releases pendientes y OUT |
| --- | ---: | ---: | ---: | ---: |
| S1 | 19 | 19/19 | 19/19 | 19/19 |
| S2 | 38 | 19/19 | 19/19 | 19/19 |
| S3 | 46 | 19/19 | 19/19 | 17/19 |
| S4 | 65 | 19/19 | 19/19 | 17/19 |
| S5 | 75 | 19/19 | 19/19 | 17/19 |
| S6 | 111 | 19/19 | 19/19 | 17/19 |
| S7 | 169 | 19/19 | 19/19 | 17/19 |
| S8 | 207 | 19/19 | 19/19 | 17/19 |
| S9 | 209 | 18/19 | 17/19 | 17/19 |

El dominio directo omite los predecesores no materializados; es insuficiente como prueba de continuación. El primer Hall necesario se encuentra en **S3**, no S9. La primera decisión causal es el joint `task:10069` + `task:10129`, colocado en 1105–1115. Sus descendientes `task:10085` / `task:10144` no pueden comenzar antes de 1120 y terminan como mínimo en 1125. Los cierres `task:10074` / `task:10133` sólo conservan 1130 compatible con OUT: 19/19 → 18/19. `task:10215` (1115–1125) incorpora `task:10220` al mismo slot y deja 17/19. El joint se analiza como decisión conjunta, sin inventar aceptaciones secuenciales.

El Hall observado inicialmente en S9 tiene tres cierres y dos starts directos (1130, 1135). El override efectivo cierre→OUT es **0**, respetado mediante `participantGapMinutes`. Aun así, un cierre iniciado en 1135 termina en 1140 y no permite completar el OUT de cinco minutos antes del deadline 1140. El Hall con continuación OUT es tres obligaciones → un slot.

`A2-COLLECTIVE-CLOSURE.json` conserva por snapshot: dominios directos y de continuación, releases y predecessor IDs, disponibilidad, starts de OUT, política de transporte y comida pendiente/materializada. La proyección y las identidades productivas proceden de contratos, nunca de nombres ni IDs del fixture.

## Delta causal X/Y/Z/W/M

- **X:** el recorrido aceptaba S3 y continuaba a 209/266, aunque ya no podía cerrar conjuntamente a todos los participantes.
- **Y:** la proyección ejecutable descartaba salidas futuras; el cierre tardío y los dominios de colocación directa ignoraban la capacidad colectiva y los releases de predecesores pendientes.
- **Z:** el matching directo 19/19 ocultaba el Hall hasta el cierre terminal. Las comidas no pueden reparar una contradicción necesaria sin comidas.
- **W:** proyección read-only de tareas, comidas y política departure; autoridad preparada/cacheada con dominios canónicos, límites necesarios de dependencias, matching exacto, Hall, filtro OUT y certificación por transporte existente. El solver exacto de comidas recibe continuación parcial/terminal; cada candidate puede rechazar Hall y buscar otra comida. El gate se aplica a hojas del scope y al contexto conjunto de futuros.
- **M:** el joint dañino deja de aceptarse; se observa el prune 19/19 → 18/19. El Stage backtrackea, visita las 92 geometrías y concluye sin alternativa bajo S2. El resultado seguro es 38/266, con decisiones aceptadas inmutables.

## Precedentes #1083 / #1084

Se revisaron ambos PR cerrados y sus diffs. Se reutilizaron conceptualmente matching bipartito, certificado alternante Hall, preparación/cache, separación PASS/INFEASIBLE/ABSTAIN y continuación del meal solver. No se importaron commits ni código por cherry-pick.

Se descartaron sus benchmarks/conclusiones A2 (línea previa a disponibilidad y overrides actuales), la promoción de geometrías no certificadas a aceptación, y los cambios de ordering/setup/preferred-unit. Aquí el transporte final usa `materializeTerminalTransportDetailed`; una continuación fallida de un matching no se convierte en prueba universal de infeasibilidad.

## Siguiente frontera distinta: cadena técnica C/EVA frente a agenda A/B

- **X:** S3 no produce propuesta bajo S2, aunque existen 42 geometrías que preservan capacidad de cierre.
- **Y:** esas geometrías adelantan el comienzo de la cadena técnica; su frontera sobre recursos compartidos queda entre 960 y 975. La agenda A/B exacta no encuentra candidato antes de esas fronteras bajo las decisiones protegidas de S2. El prior de S2 termina una de sus tareas en 985, pero no se usa como prueba de límite mínimo; la prueba procede de la búsqueda exacta agotada para cada geometría.
- **Z:** cero candidatos de agenda, cero combinaciones completas y rechazo de todas las geometrías restantes.
- **W propuesto, no implementado:** evaluar la compatibilidad conjunta de la cadena técnica y la agenda A/B al elegir la geometría anterior de supporting pipeline, manteniendo ambas autoridades y sus continuaciones. Requiere una unidad lógica distinta; no autoriza mover S1/S2 ya aceptados en este recorrido.
- **M:** 92/92 candidatos visitados; 42 invocaciones de futuros, 1.080 ramas del set, cero candidatos A/B, cero abstenciones de cierre y ninguna ampliación de budget.

Call path: `recommendNextAssistedScope` → `AssistedProposalService.request/run` → `buildAssistedProblem` → `executeAssistedPlanning` → `runExactItinerantPlanSearch` → `searchStandaloneForCoreCandidate` → macro `TECHNICAL_CHAIN` / `createTechnicalChainExplorer` → hoja exacta → capacidad/comidas/cierre → `certifyFutureStructuralWitnessSet` → `searchExactPrerequisiteClosure` → `searchExactItinerantAgenda` con `itinerantAgendaStructuralFrontier` → `DEAD_END` → siguiente geometría.

## Validación

- `npm run check`: PASS.
- 156 tests focales: PASS. Cubren los once requisitos genéricos, incluyendo M1→M2, releases pendientes, backtracking de Stage, inmutabilidad, cache, budget, fuente incompleta y testigos no visibles.
- Dos runs limpios mediante `node --import tsx server/benchmarks/runA2CollectiveClosureEvidence.ts`: material determinista; condición C.
- `git diff --check`: PASS.

La autoridad certifica únicamente geometrías uniformes de slots disjuntos en un espacio exclusivo. Otras geometrías o un único matching sin continuación transportable producen ABSTAIN, no false INFEASIBLE. Los límites de dependencias son condiciones necesarias; no son un scheduler de los predecesores ni certifican por sí solos todas las estructuras pendientes. El witness no crea propuestas, locks, protecciones ni placements persistidas. No se cambió ninguna Fuente, DB, schema, UI, API, budget ni timeout.
