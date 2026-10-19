# P8 — numeración visible por recorrido activo

Base: `0e7442e4b5ccf4fde6756841b7908b27e87fe1db`.

El ordinal persistido conserva el orden histórico de aceptación. La presentación
ahora calcula la profundidad desde S0 recorriendo `parentStageId` mediante la
autoridad existente `resolveActiveStageLineage`. `projectAssistedStageCycle` comparte
las comprobaciones del historial y sus acumulados. No se modifica el resolver
usado por la herencia de excepciones.

Toolbar, progreso S0/S1/S2, historial, resumen aceptado y presentación de Autopilot
consumen esta proyección. Las etapas fuera del recorrido muestran `Etapa histórica
#ordinal · ID id`; las archivadas indican `Rama archivada · otro recorrido`.
Las relaciones incompletas, ciclos, duplicados, raíz inválida o ancestros archivados
dejan la numeración y los acumulados sin valor y muestran la causa. Ninguna
superficie usa el ordinal histórico como alternativa a una profundidad desconocida.

## Antes y después

`stage-cycle.json` registra los IDs, ordinales históricos y números visibles de
cada caso nativo. En la misma DB desechable y con la misma sesión:

| Estado | Persistencia | Presentación |
| --- | --- | --- |
| Inicial | 0, 1, 2 | S0, S1, S2 |
| Reinicio desde S12 y aceptación | 0, 13 | S0, S1 |
| Segundo reinicio y aceptación | 0, 14 | S0, S1 |
| Caso estructural real, 25 checkpoints | activos 0,14,…,24; 13 archivados | S0,…,S11 |
| Rollback a S4 | activos 0,14,15,16,17 | S0,…,S4 |
| Redo sin divergencia | siguiente histórico 18 | S5 |
| Nueva rama desde S4 | nuevo histórico 25; 26 checkpoints conservados | S5 |

La UI de la base presenta `Etapa 24`; la candidata presenta `Etapa S11` en
toolbar y resumen, doce posiciones en el progreso y doce tarjetas activas.
Las trece tarjetas archivadas conservan su referencia histórica y quedan fuera
de los acumulados. Ver `p8-before.png`, `p8-after.png` y `p8-after-history.png`.

## Ensayo y límites

El runner existente levanta PostgreSQL 17, GoTrue, PostgREST, dos servidores de la
aplicación (base/candidato) y Chromium locales. Se usan identidades reales de Auth
y endpoints HTTP/RPC productivos para aceptación, reinicio, rollback y redo.

Para aislar la numeración de P9 y de la búsqueda, las aceptaciones de esta prueba
usan snapshots S0 idénticos con las 266 obligaciones y metadatos de validación
sembrados exclusivamente en la DB propiedad del runner. El contador muestra
`0/266 con horario`; las 266 identidades persisten aunque S0 no tenga tarjetas
con placement en el timeline. El ensayo no certifica
una validación nueva ni un resultado del solver. La DB real rechaza correctamente
validar S0 sin cambios; ese contrato se conserva. Los tests de los contratos de
persistencia y workflow existentes también pasan.

Se comparan literalmente nueve tablas antes/después de consultar ambas UIs,
incluidos Stages, snapshots, sesiones, tareas, validaciones, excepciones y locks.
Los hashes SQL antes/después figuran en `stage-cycle.json`. También se comprueba
que IDs, padres, ordinales, snapshots y fingerprints anteriores permanecen
idénticos después de las operaciones de branching; sólo se permite el archivado
que ya realiza la aceptación. La jornada histórica A2 de 266 obligaciones y 11
Stages, otra jornada de 333 tareas y sus catálogos se preservan literalmente.

Autopilot conserva su ordinal histórico en el protocolo de progreso y la
publicación de checkpoints verificados. Sólo su vista proyecta `S11` a partir del
checkpoint con ordinal 24. No cambian el controlador, ejecución, contratos,
budgets, SQL, migraciones ni RPC. La prueba nativa usa el observador de checkpoints;
los tests existentes del controlador y los renders completo/compacto completan
la cobertura. Los acumulados exclusivos del lineage, incluidos intervalos positivos
y ramas archivadas, se verifican con fixtures temporales deterministas en
`shared/assistedHistory.test.ts`.

No hay lecturas ni escrituras del ensayo contra Supabase remoto ni resets de
jornadas del usuario. Las capturas muestran datos locales. P9 y la validación
manual quedan fuera del cambio.

## Reproducción

```sh
node --import tsx --test --test-concurrency=1 \
  shared/assistedHistory.test.ts shared/assistedStageTiming.test.ts shared/assistedAutopilot.test.ts \
  client/src/components/planning/assisted-stage-history.test.tsx \
  client/src/components/planning/assisted-autopilot-progress.test.tsx \
  client/src/components/planning/assisted-planning-workspace.test.ts \
  client/src/lib/assisted-autopilot-progress.test.ts client/src/lib/assisted-autopilot-checkpoints.test.ts \
  server/assistedHistoryTimings.spec.ts server/assistedRestart.spec.ts \
  server/assistedPlanningWorkflow.spec.ts server/assistedPlanningStorage.spec.ts
npm run check
npm run build
npm run check:migrations
npx --no-install tsc -p script/demo/tsconfig.integration.json

git worktree add --detach work/p8/base 0e7442e4b5ccf4fde6756841b7908b27e87fe1db
ln -s "$PWD/node_modules" work/p8/base/node_modules
P8_BASELINE_ROOT=work/p8/base node --import tsx script/demo/smokeA2Integration.ts \
  work/p8/native --historical-topology --assisted-stage-cycle
```

Se requiere Docker local y Chromium de Playwright; puede seleccionarse el binario
instalado mediante `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. La CI focal reproduce
estos casos y conserva sólo evidencia pública, excluyendo logs privados.
