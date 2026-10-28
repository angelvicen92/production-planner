# P0-U01b — composición nativa REQUIRED por fases

Base autorizada: `main @ 1c6014f9afde59230ff1d4073ff76eae907c3909` (U01a, #1206). Una unidad funcional, migración incremental **122**, sin cambios en 001–121, sin migración real, publicación ni merge.

El editor diario existente permite declarar fases de operaciones reales: fases consecutivas REQUIRED y orden interno libre sujeto a las dependencias HARD. Una conjunta ocupa un paso físico y conserva todas sus obligaciones. La jornada integrada de U01a se crea por UI/API, guarda y recarga **3/2/2 operaciones, 15 obligaciones individuales, conjunta, recurso nominal compartido, competidora y pausa física**, y alcanza S1 parcial y S2 completo por SQL auténtico. Otra topología tiene **dos fases 2/3, 11 obligaciones y un segundo recurso exclusivo de las operaciones intermedias**. El orden nominal de su segunda fase comienza por la conjunta: las dependencias obligan a realizarla después de sus otros miembros.

La clasificación `PRODUCTIVE_COMPOSED` se limita a esos cruces y al perfil físico descrito en la [matriz](composition-matrix.md). No equivale a soporte general de todas las autoridades ni a creación completa del A2 desde UI.

## Prueba reproducible

```sh
npm run check
npm run check:migrations
npm run build
npx --no-install tsc -p docs/evidence/p0-u01b/tsconfig.json
node --import tsx --test --test-concurrency=1 server/requiredPhaseComposition.spec.ts server/technicalChainStructure.spec.ts server/technicalChainSql.spec.ts server/assistedScopeResolver.spec.ts engine/planner-next/integration/nativeJointGroups.spec.ts engine/planner-next/integration/nativeOperationalMeals.spec.ts script/demo/assistedSQLContracts.spec.ts script/demo/a2Preflight.spec.ts
node --import tsx docs/evidence/p0-u01b/upgrade122.ts work/u01b-upgrade
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01b/run.ts work/u01b-native
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01b/run.ts work/u01b-repeat
python3 docs/evidence/p0-u01b/verify.py work/u01b-native/native work/u01b-repeat/native work/u01b-verification.json
node --import tsx docs/evidence/p0-u00n/a2.ts work/u01b-a2
node --import tsx docs/evidence/p0-u00n/a2.ts work/u01b-a2-repeat
```

Cada runner elimina variables Supabase heredadas, usa sólo loopback y crea/elimina sus propios PostgreSQL 17.11/Auth/PostgREST/Chromium. Aplica el ledger íntegro, sin seed A2 para las jornadas nuevas. `run.ts` archiva el checkout y superpone los archivos actuales con hashes: sólo cambia dispatch y caché de Vite en la copia descartable. No se altera ninguna función de producto en el harness. El script de upgrade sí importa deliberadamente el histórico, exclusivamente para comprobar su conservación.

`native/receipts.json.gz` y `repeat/receipts.json.gz` contienen configuración, EngineInput, propuesta, witness con todos sus canales, Draft, validación, Stage SQL, negativos, scopes y rollback/redo. Sus manifiestos fijan fuentes e imágenes; `*-required-phases.png` captura directamente el editor guardado. Tras la captura se detiene el polling de Chromium antes de las pruebas API de transacciones y rollback, conservando los locks NOWAIT del producto. Sólo se empaquetan JSON/PNG públicos; quedan fuera logs privados, tokens y contraseñas. `verification.json` comprueba física, fases y determinismo exacto sin normalizar IDs ni tiempos. `upgrade/` contiene la prueba 121→122 sobre 599 tareas y 11 Stages. `a2/` contiene dos regresiones canónicas independientes y 22 certificados. Véanse [validación](validation.json), [causalidad y reutilización](causal-path.md), [perfil](profile.md) y [complejidad/frontera](complexity-and-boundary.md).

La CI del candidato está definida en `.github/workflows/p0-u01b-required-phase-composition.yml`, con Node 20; la ejecución local usa Node 24.19.0. El estado vivo del PR prevalece sobre esta fotografía.
