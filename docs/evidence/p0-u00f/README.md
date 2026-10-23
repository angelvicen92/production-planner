# P0-U00f — transporte configurable para jornadas nuevas

**Candidato productivo del mismo PR #1184; sin merge ni despliegue.** Extiende el perfil existente para seleccionar plantillas IN/OUT por ID y reutilizar el transporte de Planner Next en `MAIN_WITH_VOCAL_FEEDER` y `STANDALONE_ONLY`. Las jornadas históricas `transport: NONE` conservan su contrato. Capacidad, mínimos/máximos, target, separación y peso siguen perteneciendo al snapshot de optimización existente.

La [auditoría causal del candidato](implementation/causal-audit.md) reconstruye los tres recorridos y sus primeras decisiones incorrectas. No se crea otro solver, scheduler, política de transporte, migración, presupuesto ni timeout. No se añaden Main/styling ficticios ni se relajan solapes HARD.

## Resultado y gate verificable

Los recibos finales y sus límites se registran en [validación](implementation/validation.json), [verificación del producto](implementation/product-verification.json) y [comparación de regresiones](implementation/regression-comparison.json). La integración requiere CI verde del head remoto; consultar el PR, no deducirlo del resultado histórico del diagnóstico.

- Main+Vocal+IN/OUT, creado por UI real: 8/8 hasta Stage.
- Standalone+IN/OUT, tres participantes: el motor encuentra 9/9 hasta Stage.
- IN y OUT conservan parámetros diferentes, identidad diaria, configuración y revisión propias.
- Continuación con seis tareas protegidas y dos OUT pendientes: Stage final, preservación literal, replay frío y con JOINT_COMPLETION comprobados separadamente.
- Negativos: permisos, CAS obsoleto, IDs desconocidos/duplicados, contrato incompleto, cardinalidad/separación/ventanas inviables, dependencias y recursos ausentes; sin propuesta parcial ni degradación a tareas ordinarias.
- Regresión obligatoria: U00a–U00e y A2 aislado desde S0, con comparación de obligaciones, Stages, fingerprints, certificados, ramas, tiempo y determinismo. Los recibos del candidato son distintos del baseline histórico.

## Reproducción

Node 20.20.2, dependencias del lockfile, Docker local y Chromium. Todos los stacks son descartables; el harness fija Auth/PostgREST y la aplicación a loopback y aplica el ledger real completo. SQL sólo inicializa la plataforma/ledger y lee recibos; los catálogos, parámetros, perfiles, jornadas y decisiones se operan mediante UI/API reales.

```sh
npm ci
npm run check
npm run check:migrations
npm run build
node node_modules/typescript/bin/tsc -p script/demo/tsconfig.new-day.json
node node_modules/typescript/bin/tsc -p script/diagnostics/tsconfig.u00f.json
node --import tsx --test engine/planner-next/integration/newDayTransport.spec.ts server/newDayPlannerConfiguration.spec.ts server/planOptimizerSnapshotPersistence.spec.ts script/diagnostics/u00fTransportGate.spec.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx script/demo/smokeNewDayIntegration.ts work/u00f-native --transport
node --import tsx script/diagnostics/verifyU00fTransportProduct.ts work/u00f-native work/u00f-native/verification.json
```

Los workflows mantienen los gates existentes de Planner y jornadas nuevas y añaden una prueba nativa de transporte independiente. El verificador offline también comprueba que los hashes del recibo coinciden con las fuentes ejecutadas.

Para U00a–U00e se reutiliza `smokeNewDayIntegration.ts`, en serie, con `--post-bootstrap-additions`, `--standalone-only --post-bootstrap-additions`, `--itinerant-consumption` y `--setup-families`. Se compara con la Evidence integrada de U00e mediante [verify-regressions.mjs](implementation/verify-regressions.mjs); las políticas v2 se revalidan con `../p0-u00e/v2/verify-native.ts`. A2 reutiliza `../STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts` sobre una copia archivada exacta de `793d4873`, candidato y repetición, seguida de `../config-u06c/verify.ts`. No se ejecutan builds, UI ni suites concurrentes durante esas tres mediciones.

U00a–U00d conservan literalmente problemas, mapas y snapshots históricos. En U00e, la UI genera IDs de familia aleatorios para cada alta: los de una jornada nueva no deben declararse idénticos a los de otra jornada histórica. `script/diagnostics/replayU00fSpaceRegression.ts` ejecuta las **mismas entradas UI congeladas** en base archivada y candidato, conservando IDs, políticas, fingerprints, propuestas, preparaciones, certificados y ramas. Para reproducirlo, copia únicamente ese verificador nuevo al mismo path de la base archivada y ejecútalo allí y en el candidato con el mismo directorio `regression-setup`; guarda `u00e-base-replay.json` y `u00e-candidate-replay.json` en la raíz entregada a `verify-regressions.mjs`. No se normalizan identidades para forzar igualdad.

## Diagnóstico original preservado

El [commit inicial 793d4873](https://github.com/angelvicen92/production-planner/commit/793d48733c4565cc49f434f86179b2016025fdf0) sólo era diagnóstico BLOCKED. Su [análisis original](causal-analysis.json), [contrafactual](counterfactual.patch), [intervención](intervention.json), `native/`, `result.json`, `validation.json` y `artifact-hashes.json` permanecen como Evidence histórica de ese commit. Sus checks verdes no acreditaban funcionalidad; el manifest original corresponde a los bytes de aquel commit, incluido su README original. No se reescriben resultados históricos para aparentar una ejecución productiva.

El análisis ejecutable actual comprueba la reparación del motor contra aquellas mismas entradas nativas y emite `ENGINE_GATE_PASS`; la aceptación productiva procede de `implementation/native/`, sin contrafactual. El testigo manual original sigue siendo exclusivamente diagnóstico y nunca se proporciona a búsqueda, Draft o Stage.

No se modifica Supabase productivo, Replit, los datos A2 reales ni la demo del 23/10/2026. ChatGPT revisa este candidato; no se realiza merge.
