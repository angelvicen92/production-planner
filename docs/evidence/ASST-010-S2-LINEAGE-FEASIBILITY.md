# ASST-010: lineage fiel y viabilidad del S2 protegido

PR #1104; base de esta iteración: `ae491d283cc9f7adf6d0f2c90e7245d7c200a288`. 10 de octubre de 2026.

**El canon post-refresh protegido es FEASIBLE. ASST-010 continúa bloqueado en S2.** Se conserva la corrección del harness, una regresión de recuperación de lineage y la prueba positiva reproducible. La única alternativa productiva ensayada se revirtió al no alcanzar ninguna hoja completa ni certificado.

Datos comparados y patch descartado: [Evidence JSON](ASST-010-S2-LINEAGE-FEASIBILITY.json). Canon, decisiones protegidas y witness completo: [prueba positiva](ASST-010-S2-PROTECTED-FEASIBLE.json).

## X / Y / Z / W / M

- **X:** S2 solicita exclusivamente `TASK_IDS:[10015]` después de aceptar Main 10017 y actualizar las 19 entradas de Estilismo de 10 a 20 minutos. El productor no devuelve propuesta.
- **Y:** El fake de aceptación omitía `proposalRunId`. Corregirlo recupera los witnesses reales de S1, cuyo joint replay resulta `STALE` con la configuración vigente. Existe además una incompatibilidad de la geometría nominal de entradas consecutivas con el cierre de C01; su reparación vuelve a descomponer capacidad compartida entre prerequisites, cadenas, agendas y residual.
- **Z:** ASST llega hasta S1 aceptado y refresh verificado. Excepciones, provenance, rollback, redo, divergencia y recertificación posterior siguen `NOT_REACHED` en ese ensayo completo.
- **W:** Persistir `proposalRunId`, comprobar la recuperación efectiva en S2 y conservar una auditoría independiente con witness canónico completo. Descartar las geometrías con hueco ensayadas: no aportan progreso funcional.
- **M:** Estado protegido `FEASIBLE`, gate ASST `BLOCKED`, dos A2 limpios 266/266 con material idéntico, 408 tests y checks requeridos PASS.

## Fidelidad del harness

El fake `assisted_accept_stage` copia ahora `draftScopeJson.proposalRunId`, igual que la persistencia real. Las nuevas assertions comprueban el vínculo al aceptar y que el runner de S2 recibe los fingerprints de los witnesses producidos y almacenados por S1. Se mantienen todas las assertions originales, S0, selectores, refresh, configuración, timeout y ledger.

La entrada real de S2 sólo difiere del control anterior en `priorFutureStructuralWitness` y `priorFutureStructuralWitnesses`. El canon, scope y protecciones coinciden exactamente; también coinciden los primeros nueve fingerprints de core. Se recuperan `FIXED_SUPPORTING_PIPELINE` y `JOINT_COMPLETION` mediante `AssistedProposalService`. El joint anterior devuelve `STALE` en nueve cargos por las duraciones vigentes: no permite aceptar una solución obsoleta.

`priorFutureStructuralWitnessFound=false` no prueba ausencia de recuperación: describe el camino supporting con todos los Main fijados. Además, el timeout impide la copia final de parte de la Evidence del core. La comparación usa los inputs reales y observaciones read-only del productor, además de las assertions de persistencia y recuperación.

| S2 | Tiempo | Ramas CORE + STANDALONE | Checks cierre | Cache hits | Traversals | Hojas / certificados |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Control anterior sin lineage | 300,045 s | 4.504 + 54.298 = 58.802 | 21.673 | 43.998 | 446.219 | 0 / 0 |
| Harness fiel inicial | 300,112 s | 4.240 + 42.551 = 46.791 | 13.729 | 42.309 | 248.819 | 0 / 0 |
| Geometría con hueco, descartada | 69,711 s | 5.358 + 94.642 = 100.000 | 2.488 | 32 | 69.534 | 0 / 0 |
| Control final fiel, productor restaurado | 300,061 s | 4.240 + 44.503 = 48.743 | 15.254 | 42.730 | 286.393 | 0 / 0 |

El control sin lineage procede de la iteración anterior sobre el mismo source productivo y HEAD inicial; no se repitió en esta iteración. La carga del entorno varió, y hubo trabajo diagnóstico breve durante algunas ejecuciones. Los tiempos y throughput son descriptivos; no se atribuye una mejora de rendimiento a la corrección. El timeout final devuelve `NO_PROPOSAL/SEARCH_TIME_LIMIT_REACHED`, con propuesta y draft nulos.

## Prueba independiente de FEASIBLE

Un modelo CP-SAT diagnóstico, separado del producto, permite mover las tareas no aceptadas. Conserva restricciones adicionales de layouts, asignaciones itinerantes, rondas, cadenas, grupos de transporte, comidas y posiciones de Main derivadas del witness real de S1. El solve positivo permite reasignar esas posiciones entre Main no aceptados y mantiene Main 10017 en `[835,850]`. Sus negativos con Main o Main/Vocal fijados sólo prueban inviabilidad de esos modelos restringidos.

La primera candidata externa falló la validación canónica y se excluyó. Se corrigió el modelo antes de declarar `FEASIBLE`. El witness definitivo y su reproducción independiente pasan:

- 247 IDs de tarea exactos, 19 Sodexo y las 19 entradas a 20 minutos.
- Main 10017 y la pausa aceptada `[865,940]` literalmente iguales a S1.
- 51 tareas con recurso CAM1, cero solapes.
- `validatePlan`: `hardValid=true`, cero reason codes y cero violaciones, incluyendo transporte, comidas, itinerantes, márgenes, preparaciones, rondas, cadenas y continuidad REQUIRED.
- Replay `JOINT_COMPLETION=PASS`, 292 cargos; cierre suficiente `PASS`, certificado, un cargo. Junto al replay obsoleto anterior, la auditoría consume 302 cargos de un único límite de 100.000.

Fingerprint positivo: `6a50fa0daa3a954b5489b54879de6591300af3840ddc0f845eb53db58e493489`. Digest del canon: `4305c2a3a73a08eee523879db1555b9ea2185f5332365cf1e1a4ee1d0b784141`, idéntico al source real de S2 del control final.

La solución positiva cambia asignaciones no aceptadas de Main/Vocal. Esto demuestra existencia; no demuestra que toda continuación válida necesite esos mismos cambios. El artifact diagnóstico no entra en ningún request/run/apply, scope o protección.

## Causa contrastada y alternativa descartada

El pipeline nominal ya hace matching conjunto de entradas. La hipótesis de que nunca coordina entradas queda refutada. Su geometría densa, sin embargo, es insuficiente tras el refresh: todas las entradas tienen release mínimo 550; 19 × 20 ocupan al menos `[550,930]`. C01 necesita después de su propia entrada un cierre de cinco minutos en el mismo espacio y su disponibilidad termina en 930. Ese cierre no cabe antes, dentro ni después del bloque denso. Esta prueba excluye esa geometría; el canon protegido completo sigue siendo viable.

El replay focal mantiene los dos conflictos anteriores. Los prefixes son legalmente colocables, pero C05 vacía el dominio de 10057 y deja Hall 1/0 en 10058; C08 vacía 10103 y deja Hall 1/0 en 10104. Cada check consume un cargo, con 27 y 25 traversals. La detección ya es inmediata. Los antecedentes están en [el diagnóstico anterior](ASST-010-S2-CONFLICTS.md).

La alternativa ofrecía al matching geometrías con un hueco de la duración de un cierre futuro pendiente, conservando la geometría original como alternativa. El hueco era una elección geométrica, sin colocar ni proteger una tarea futura. La certificación seguía en los productores y autoridades existentes; no añadía cache global ni podas por ABSTAIN.

En el fixture reducido evita el rechazo inicial por capacidad, pero el resultado completo requiere 52 ramas en ambos casos. No demuestra una mejora de eficiencia. En ASST desde S0 alcanza 27 cores y agota 100.000 ramas, sin invocación residual completa, hoja ni certificado. Al retirar IN y entradas provisionales, esos cores representan sólo dos contextos distintos de reparación: 25 repeticiones. La reparación pierde el hueco que motivaba la alternativa. Se detuvo la expansión después de este único candidato y se restauró íntegramente el source del productor.

La descomposición observada sigue siendo una limitación; no se ha demostrado todavía una intervención general suficiente para cerrar S2. La próxima acción concreta es probar un productor efímero del componente de capacidad compartida que coordine entradas y cierres con Main/Vocal no aceptados revisables. Debe obtener una hoja canónica completa en el fixture reducido antes de otra ejecución extensa y conservar las alternativas posteriores a frontiers ajenos, sin tratar ABSTAIN como rechazo.

## Regresiones y alcance del resultado

Dos ejecuciones limpias A2 desde S0 completan diez stages y 266/266. S1: **67,446 y 70,417 segundos**, ambos ≤120; total: 85,844 y 88,902 segundos. Conteos: 19, 38, 46, 65, 75, 111, 169, 207, 209, 266.

Material digest idéntico al baseline: `1ce09d49ee3a737a643cbe8e3a66889291be8bbdcef009834b2a34ca85214795`. Fingerprint final: `9aab3549a93a6d656e1000d09edbe51574b14ec0496d4f9175d8b0cf6a6c1745`. Los 1.140 contadores de trabajo comparados con los runs anteriores permanecen iguales. Los veinte replays completos pasan, con 292 cargos cada uno y máximo búsqueda + auditoría de 22.267. Scope exacto, protección literal, futures efímeros, comidas y cero nuevos HARD/REQUIRED se verifican en cada stage.

**408/408**: 269 focales, 88 producto, 41 transporte/cierre, dos métricas y ocho migraciones. `npm run check`, `npm run build` y `npm run check:migrations` PASS. La secuencia incluye hasta 087; no se cambian migraciones, dependencias productivas, configuración canónica, budgets ni timeouts. La nueva regresión prueba recuperación de joint lineage desde `result_json` tras cambio de revisión y el control sin `proposalRunId`.

El máximo stage real de ASST permanece **S1**. Las regresiones de producto pasan por separado; no sustituyen los contratos posteriores sin alcanzar en el gate completo. El PR continúa abierto y draft, sin merge. Su descripción recoge el HEAD publicado y la CI correspondiente.

## Reproducción

Auditar el artifact positivo no necesita OR-Tools:

```sh
node --import tsx script/diagnostics/auditAsst010ProtectedWitness.ts
```

Recrear la candidata externa, sin tocar dependencias del proyecto:

```sh
python3 -m venv work/asst010-oracle-venv
work/asst010-oracle-venv/bin/python -m pip install ortools==9.15.6755
node --import tsx script/diagnostics/asst010ProtectedOracleModel.ts
work/asst010-oracle-venv/bin/python script/diagnostics/asst010ProtectedOracle.py permuted-core
node --import tsx script/diagnostics/materializeAsst010ProtectedOracle.ts
node --import tsx script/diagnostics/auditAsst010ProtectedWitness.ts work/asst010-protected-oracle/candidate.json
```

El diagnóstico tiene su propio timeout de 60 segundos y un worker; no modifica el timeout de 300 segundos ni el ledger productivo. Sólo la auditoría canónica positiva acredita FEASIBLE. `fixed-core` y `fixed-main` son modelos restringidos: su resultado negativo no se promociona a inviabilidad global.

`npm run benchmark:planner-next:a2-assist-7` conserva el fallo original de S2 y su assertion. A2 se ejecuta con `runA2Assist8Evidence({reportIterationDurations:true})` dos veces desde S0, sin snapshots ni witness diagnóstico. Los archivos concretos de las suites figuran en el JSON asociado.
