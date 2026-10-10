# A2 CAM1 — consolidación verificable y ASST-010 abierto

> Actualización 2026-10-10: [S2, cache de raíz y retorno explícito](ASST-010-S2-COMPUTATION.md).
> Este documento conserva la consolidación de 5793bc9; la Evidence nueva registra
> las regresiones actuales y sustituye el diagnóstico de ausencia de retorno API.

Mismo PR [#1104](https://github.com/angelvicen92/production-planner/pull/1104),
rama `codex/asst-010-explicit-scope-continuation`, draft, sin merge.
Fecha: 2026-10-09. Baseline de esta consolidación:
`724e2fa12b337e766cb582b426278df9f5beee32`; base:
`5e46168daa35d755bcb9a2573ed81647d8b466a2`. Commit productivo probado:
`8e5875816c292b42b205d8fc9ca3784473d2ef66`. El HEAD final y CI se registran en
el PR; el commit posterior de Evidence no modifica el producto. Datos
regenerados, hashes, observaciones y scripts: [JSON](A2-CAM1-CORE-FAIRNESS.json).

**Dos runs reales desde S0 vacío completan 266/266 en S10 con CAM1 vigente.
S1 tarda 92.196 / 95.705 ms: el objetivo de 120.000 ms pasa en ambos.**
S10 contabiliza correctamente 57 obligaciones visibles: 38 tareas y 19 Sodexo.
Transporte pasa de 22/24 a 24/24. ASST-010 conserva un bloqueo real: S1 se
propone y acepta, el refresh pasa, pero S2 no devuelve propuesta ni certificado
dentro de 300.000 ms. **El PR no está listo para merge.**

## X/Y/Z/W/M

- **X:** S10 acepta 57 y reporta 38; S1 supera 120 s en el primer run del
  baseline; ASST-010 sigue detenido tras el refresh; transporte tiene dos fallos.
- **Y:** el reporter cuenta sólo filas productivas y omite comidas; cada probe
  de precedencias reconstruye un Map; liberar supporting invalida las listas
  proyectadas de prerequisites; la certificación de comidas exige IN antes de
  que lo construya el productor terminal.
- **Z:** Evidence contradice el delta aceptado, la asignación repetida domina
  CPU, los productores futuros carecen de su contexto pendiente y dos fixtures
  nunca alcanzan el productor de transporte.
- **W:** derivar el delta del snapshot realmente aceptado; conservar las
  precedencias mediante búsqueda inversa sin Map; recuperar ancestros supporting
  mediante productores existentes y cierre necesario parcial; aplicar el límite
  Assisted de 100.000 y certificar el contexto completo tras producir IN.
- **M:** dos A2 mantienen el material y todos los contadores previos, S1 cumple
  120 s, S10 cumple la igualdad por Stage y transporte es 24/24. La reparación
  abre productores y acelera un core S2 comparable, pero no cierra ASST-010.

La coordinación justa entre cores del commit `2cc482b` permanece. Cuotas locales
producen `DEFERRED`, conservan raíces y alternativas, y no prueban inviabilidad.
Sus experimentos conservan las cualificaciones originales en
`historicalFairnessExperiments` del JSON y en la
[Evidence de 724e2fa](https://github.com/angelvicen92/production-planner/blob/724e2fa12b337e766cb582b426278df9f5beee32/docs/evidence/A2-CAM1-CORE-FAIRNESS.md).
No se altera el canon, los criterios ni las expectativas del benchmark.

## Accounting visible: productor corregido

`runA2Assist8Evidence` contaba `newPlacements.length`: filas productivas de la
propuesta. Los Sodexo se aplican por otra ruta y también son obligaciones
visibles autorizadas. El error estaba en el reporter, no en el ledger ni en
la aceptación.

`acceptedVisibleObligationCounts` compara los IDs del baseline y del snapshot
posterior a la aceptación real. Exige unicidad, conservación de los IDs previos,
delta exacto igual al scope y correspondencia de tareas propuestas y comidas.
Cada Stage cumple:

```text
acceptedAfter - acceptedBefore === newObligations === visibleScopeCount
newTaskPlacements + newParticipantMealPlacements === newObligations
```

S10 es `266 - 209 = 57 = 38 + 19`. El test nuevo verifica los diez deltas y
rechaza supporting filtrado o una obligación previamente aceptada que desaparece.
`runA2CollectiveClosureEvidence` utiliza los contadores desglosados.

El JSON distingue scope visible, supporting de proyección, obligaciones efímeras
y tamaño del witness completo. Ningún supporting ajeno al scope se acepta o
protege. Los 20 Stages verifican scope exacto e igualdad del delta; todos tienen
`acceptedSupportingCount: 0`. El witness conjunto contiene 247 tareas y 19
comidas, sin convertirlas por ello en obligaciones visibles o protegidas.

## Dos runs productivos completos

Invocación real `runA2Assist8Evidence({reportIterationDurations:true})`, snapshot
inicial vacío, sin seed, hint, hook ni witness recibido. Se recorren
request/run/apply, validación y aceptación hasta S10. Los blobs productivos son
idénticos entre ambas ejecuciones y el commit productivo registrado.

| Stage | Aceptadas run 1 | Aceptadas run 2 | Nuevas visibles | Tareas / Sodexo | Ramas ambos | Tiempo run 1, ms | Tiempo run 2, ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| S1 | 19 | 19 | 19 | 19 / 0 | 21.975 | 92.196 | 95.705 |
| S2 | 38 | 38 | 19 | 19 / 0 | 293 | 184 | 148 |
| S3 | 46 | 46 | 8 | 8 / 0 | 293 | 111 | 125 |
| S4 | 65 | 65 | 19 | 19 / 0 | 293 | 148 | 113 |
| S5 | 75 | 75 | 10 | 10 / 0 | 2.238 | 9.599 | 8.882 |
| S6 | 111 | 111 | 36 | 36 / 0 | 293 | 137 | 130 |
| S7 | 169 | 169 | 58 | 58 / 0 | 1.698 | 7.250 | 7.293 |
| S8 | 207 | 207 | 38 | 38 / 0 | 293 | 264 | 157 |
| S9 | 209 | 209 | 2 | 2 / 0 | 293 | 219 | 184 |
| S10 | 266 | 266 | 57 | 38 / 19 | 293 | 131 | 155 |

Tiempo total observado: 110.450,843 / 113.087,108 ms. S1 consume
`4.766 CORE + 17.209 STANDALONE = 21.975`; los otros Stages no consumen CORE.
Cada request conserva un único ledger de 100.000. Las 20 revalidaciones
independientes del witness cobran 292 decisiones cada una; incluso sumándolas
a la búsqueda, el máximo es 22.267. No hay trabajo de reentrada gratuito.

Los 20 witnesses pasan la autoridad real con 247 tareas, 19 Sodexo, comidas
operativas y preparaciones. CAM1 `plan-resource:4001` afecta 51 tareas con cero
solapamientos. Nuevos HARD/REQUIRED = 0; igualdad literal de placements y
estructuras previamente aceptados; cero IDs duplicados o ajenos al canon;
supporting/witness futuro invisible y no protegido. Determinismo material
entre runs y equivalencia al baseline:

```text
materialDigest   1ce09d49ee3a737a643cbe8e3a66889291be8bbdcef009834b2a34ca85214795
finalFingerprint 9aab3549a93a6d656e1000d09edbe51574b14ec0496d4f9175d8b0cf6a6c1745
```

Todos los contadores de trabajo compartidos con 724e2fa coinciden en cada Stage.
Se añade metadata `branchBudgetLimit`; no se elimina ni descuenta trabajo.

## Latencia: perfil y cambio causal mínimo

Control focal del código previo al cambio de asignación, con `--cpu-prof`:
S1 propuesta y aceptada, 19 obligaciones, 170.896 ms y 21.975 ramas. El status
`BLOCKED` del wrapper corresponde al hook existente de parar después del primer
Stage; no es un fallo de S1. Ningún run productivo usa ese hook.

171.680,602 ms de muestras CPU. Tiempo propio dominante:

| Función | Tiempo propio, ms | Porcentaje |
|---|---:|---:|
| `taskRespectsScheduledDependencies` | 49.278,524 | 28,70% |
| `diagnoseTaskPlacement` | 36.915,788 | 21,50% |
| `canPlaceTask` | 25.316,813 | 14,75% |
| Garbage collector | 4.604,738 | 2,68% |

Desglose inclusivo: coordinador core 165.954,403 ms; continuación 121.493,036;
construcción `structuralBundles` 44.385,544; standalone 97.437,310;
prerequisite closure 101.765,476; probe de ronda/macro 66.846,079;
materialización de matching 64.166,414 y matching canónico 62.190,752;
pipeline nominal 34.927,625, preparación del grafo 1.763,644 y matching
preparado 6.905,360; `validatePlan` 35,565. Son funciones anidadas: sus tiempos
se solapan y **no se suman como fases independientes**. Construcción,
materialización y sus reevaluaciones están incluidas en esas pilas. No se
inventa un coste exclusivo para reconstrucción. El run observa una continuación
aplazada, cero reentradas y una pendiente al certificar en el core 7: no hay una
reentrada que perfilar en esta trayectoria.

`taskRespectsScheduledDependencies` construía un Map de todos los placements
en cada probe, también sin predecessors. Se sustituye por una búsqueda inversa
para cada dependency. Conserva exactamente la semántica de último ID duplicado,
las dependencias pendientes y los checks temporales en ambas direcciones. Cinco
tests comprueban equivalencia al modelo Map, límites, duplicados, precedencias
e input inmutable. No cambia orden, dominios, matching, validación, alternativas
ni reparto entre cores.

Observación focal posterior sin profiler: 92.404 ms, mismas 21.975 ramas y
fingerprints de S1, joint y pipeline. Los dos runs completos prueban el objetivo.
Frente a 147.841 / 117.319 ms del baseline, son 92.196 / 95.705 ms
(aproximadamente −37,64% / −18,42%). Los tiempos dependen del entorno; el control
perfilado no es una comparación directa de latencia con los runs sin profiler.

## ASST-010: dos ciclos y límite de la conclusión

Se invoca `runA2Assist7Evidence()` conservando sus assertions. El primer scope
`TASK_IDS:[10017]` devuelve únicamente ese Main, lo acepta y aplica el refresh
de 19 entradas de 10 a 20 minutos. Las comprobaciones de conservación de S1
pasan. S2 solicita `TASK_IDS:[10015]` y protege literalmente Main 10017 en
`[835,850]`. El input S2 es idéntico en los dos ciclos comparados.

Primera autoridad de la geometría nominal: Hall del cierre futuro, tarea 10004
(C01), espacio 3018, dominio vacío. Un diagnóstico read-only del primer core
real retira únicamente IN/entradas no aceptados y recompone llegadas con la
autoridad existente: devuelve dominio `[765,925]`. Main protegido permanece
literal y el cierre necesario pasa, con 146 ancestros pendientes. Son nueve
cargos diagnósticos. **Ese PASS necesario no certifica S2 ni prueba que el
scope completo sea viable o inviable.**

La reparación liberaba obligaciones consideradas satisfechas al proyectar las
listas de prerequisites. Los productores de cadenas y agendas podían explorar
sin sus entradas. El delta recupera sólo ancestros supporting realmente
liberados, no colocados y no protegidos, desde el canon read-only. Reutiliza
`searchExactPrerequisiteClosure` antes de los productores existentes. Un fixture
reducido con geometría legal independiente prueba el certificado público completo
y conserva protecciones. No se añade scheduler, DFS o matching.

El segundo ciclo conecta a esos prerequisites el cierre necesario parcial
existente. Un Hall sound permite `DEAD_END` de esa geometría; `ABSTAIN` conserva
incertidumbre y no rechaza la rama. Cuota local y ledger global mantienen sus
salidas tipadas; ninguna abstención se transforma en certificado.

| Observación ASST | Control previo | Ciclo 1: prerequisites | Ciclo 2: cierre parcial |
|---|---:|---:|---:|
| Límite efectivo de ramas | 300.000 heredado | 100.000 | 100.000 |
| S1, ms | 108.751 | 109.461 | 102.003 |
| S1, ramas | 32.501 | 21.975 | 21.975 |
| S1 propuesto / aceptado | PASS | PASS | PASS |
| Refresh y conservación S1 | PASS | PASS | PASS |
| Cores S2 entrados | 2 | 4 | 9 |
| Último ledger S2 observado | 17.944 | 18.974 | 35.307 |
| Propuesta / certificado S2 | Ninguno | Ninguno | Ninguno |
| Resultado del gate | TIMEOUT | TIMEOUT | TIMEOUT |

El benchmark heredado configura 300.000 y se mantiene intacto. La frontera
pública Assisted aplica `min(configured, 100.000)` sin modificar el canon ni elevar
límites menores. Nuevos tests públicos verifican 10, 1.000 y 300.000 configurados,
inmutabilidad y ledger compartido. `branchBudgetLimit` expone el límite efectivo.

Los tres intentos S2 se detienen mediante watchdog externo **por request** a
300.000 ms. No hay retorno del solver al detenerlos: los ledgers son últimas
observaciones, **no totales finales**, ni prueba de agotamiento o inviabilidad
global. Tampoco se demuestra que el API devuelva dentro del techo un resultado
de timeout correcto; ese contrato queda abierto.

El core 2 con el mismo fingerprint
`97573ba0567e2554a6f052880a1d35c4ea588024d9ad5484a2e2127b31df013b` pasa de
106.764,515 a 1.615,254 ms con el mismo input y límite efectivo. El ciclo 2 llega
a productores ordinarios (dos invocaciones observadas); el ciclo 1 no los
alcanzaba. El beneficio local está probado, pero otros cores continúan caros y
S2 no se certifica. Se detiene la expansión del solver tras **dos ciclos
causales sin cierre del gate**, conforme al límite solicitado.

Un intento de observación falló por `returnglobalThis` en la inyección read-only.
Se corrigió el observador y se repitió desde S0; ese intento está excluido de
todas las conclusiones de producto y rendimiento.

AcceptedException/provenance, rollback, redo, divergencia y recertificación del
recorrido canónico son **NOT_REACHED**. Los tests de integración aislados pasan,
pero no sustituyen ese recorrido. ASST-010 permanece **OPEN_TIMEOUT**.

## Transporte y verificaciones

Los dos fallos originales tienen la misma primera autoridad:
`ARRIVAL_ID_SET_MISMATCH` durante la certificación de comidas, con cero intentos
del transporte terminal. Ambos fixtures tienen witness independiente HARD válido.
No son pruebas de inviabilidad. Con IN pendiente se utiliza capacidad necesaria
de comidas; el productor terminal existente materializa IN y la autoridad exige
después la certificación suficiente sobre el contexto completo real. Si no la
obtiene, conserva INCONCLUSIVE. Las expectativas originales quedan intactas.

| Comprobación | Resultado |
|---|---|
| A2-ASSIST-8, dos runs completos | PASS, 266/266 y S10 ambos |
| CAM1 / HARD / REQUIRED / comidas / protección / determinismo | PASS, 20 Stages |
| Scope visible, delta e invisibilidad futura | PASS, 20 Stages |
| Ledger 100.000 / techo 300.000 ms A2 | PASS, 20 requests |
| S1 ≤120.000 ms | PASS, ambos runs |
| Tests focales | 236/236 PASS |
| Integración producto, config, exceptions y lineage | 86/86 PASS |
| Transporte original | 24/24 PASS, antes 22/24 |
| Transporte + cierre colectivo | 39/39 PASS, incluye los 24 anteriores |
| Test focal de métricas visibles | 1/1 PASS |
| Tests de migraciones | 8/8 PASS |
| `npm run check` / `build` / `check:migrations` | PASS / PASS / PASS |
| ASST-010 recorrido canónico completo | TIMEOUT S2, abierto |

Total local dirigido: **370/370** (236 + 86 + 39 + 1 + 8), con `npx tsx --test`.
El test costoso del primer Stage no se cuenta como otro test ejecutado: los dos
A2 completos prueban la ruta real. No se declara PASS de una suite global no
ejecutada.

Baseline CI en el HEAD final se registra con enlace en el PR. Ejecuta typecheck,
secuencia de migraciones y build; no ejecuta estos 370 tests ni los gates A2/ASST.
**Merge readiness: no**, por S2 sin certificado dentro del techo y los contratos
canónicos posteriores aún sin recorrer.

## Reproducción

El JSON contiene scripts íntegros en `reproduction.scripts`, comandos y hashes
de resultados/observaciones. Extraer desde la raíz del repositorio:

```sh
mkdir -p work/consolidation
python3 -c "import json,pathlib; x=json.load(open('docs/evidence/A2-CAM1-CORE-FAIRNESS.json')); [(pathlib.Path('work/consolidation')/k).write_text(v) for k,v in x['reproduction']['scripts'].items()]"
timeout 300 node --import tsx work/consolidation/full-run.ts work/consolidation/production-run1
timeout 300 node --import tsx work/consolidation/full-run.ts work/consolidation/production-run2
node --import tsx work/consolidation/verify.ts
python3 work/consolidation/request-watchdog.py work/consolidation/asst-reproduction
node --import tsx work/consolidation/asst-diagnose.ts work/consolidation/asst-reproduction
```

El diagnóstico usa inputs realmente observados por ASST; nunca seeds de A2.
Timeout significa gate abierto. El perfil baseline se reproduce en 724e2fa
antes del cambio de asignación; comando y cualificación del hook S1 en el JSON.
Resultados y logs completos se archivan fuera del checkout; el repositorio
conserva Evidence compacta, hashes y reproducción.
