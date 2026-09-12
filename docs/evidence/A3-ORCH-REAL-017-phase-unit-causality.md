# A3-ORCH-REAL-017 — causalidad de fase y unidad en standalone

## Alcance y reproducción

Diagnóstico **read-only** sobre el HEAD obligatorio `a6c4a1f8df2827239c59b63b41a4adbd90a21ebf`. El árbol estaba limpio. Se ejecutó una sola vez el runner Full A2 canónico con presupuesto 5.000 y diagnóstico causal activo; el runner hizo su replay OFF y se restauró el JSON canónico. No quedó instrumentación ni cambió comportamiento productivo.

Resultado: `BRANCH_BUDGET_EXHAUSTED`, 5.000 ramas exactas (`CORE=1.599`, `STANDALONE=3.401`), una hoja core, frontier standalone 129, fingerprint `f72da22c17114f2b7c4043131824710bab1fcf39eab8ac87adc6459869d71067`. Diagnóstico ON/OFF: `exactMatch=true`, incluida la contabilidad, profundidad, status y fase de agotamiento.

## Contrato contrastado y reconstrucción

La autoridad suministrada exige dos niveles después de main+feeder: (1) elegir por contratos una fase/unidad estructural elegible y crítica con hard/Future Feasibility; (2) aplicar MRV/matching **dentro** de esa unidad. No autoriza una categoría permanente de recurso crítico, una bolsa MRV global entre fases, inferencias por nombre, ni concluir que todos los miembros de una unidad deban ser contiguos.

La reconstrucción se hizo exclusivamente desde autoridades explícitas proyectadas: `technicalChains`, `roundSynchronizations`, `setupPolicies`/`setupFamilyId`, `jointGroupId`, `itinerantUnitId` y operaciones ancladas. Una tarea sin ninguna de ellas queda individual; compartir sólo `requiredResourceIds` no crea unidad. Las dependencias, comidas y transporte siguen siendo autoridades hard/Future Feasibility, pero no inventan identidad de unidad.

## Estado inicial standalone y primera divergencia

Al cerrar core main+feeder, `macroSelectionSteps[0]` presenta simultáneamente **84 macros**: 79 `RESOURCE_TASK`, dos `JOINT`, un `ROUND_SYNCHRONIZATION`, un `SETUP_GROUP` y un `TECHNICAL_CHAIN`. Es una bolsa global: `macroConstrainedness` mide todos y el comparador elige entre clases por exactitud, `domainSize`, disponibilidad de recursos, recursos exclusivos, sincronización, duración, cantidad afectada e ID canónico.

La primera decisión ya diverge del método de dos niveles:

| Dato | Observación |
|---|---|
| candidatos contemporáneos | los 84 del inventario inferior; siguen pendientes round (19 tareas), setup (17), technical chain (3), dos joint (2+2) y las demás tareas con recurso |
| unidad operativa real de la elegida | `itinerantUnitId=reality-unit-combined`; cinco operaciones standalone de esa unidad están contemporáneamente en la bolsa (`task:10041`, `task:10081`, `task:10154`, `task:10169`, `task:10173` son cinco tareas/operaciones explícitas de la unidad) |
| macro elegida | `RESOURCE_TASK resource:task:10169`, una sola tarea, dominio 51 exacto, disponibilidad 720, duración 30, `affectedTaskCount=1` |
| razón registrada | `mixed-domain-semantic-policy`: se anteponen dominios exactos a las cotas conservadoras; dentro de los exactos, el dominio 51 gana por MRV |
| identidad conservada en el dato | la tarea aún porta `itinerantUnitId` y sus `requiredResourceIds`; `canPlaceTask` conserva las restricciones hard |
| identidad conservada en el selector | **no**: la construcción de `resourceItems` sólo excluye joint, chain, round, setup y transporte; no forma ni selecciona una unidad por `itinerantUnitId` |
| fase posterior individual | no hace falta asignarle un ordinal de fase no configurado para demostrar la infracción; sí es una tarea individual compitiendo globalmente y desplazando todas las estructuras contemporáneas |
| elección del método de dos niveles | primero habría elegido una **identidad estructural elegible** mediante hard/Future Feasibility; sólo después habría aplicado MRV/matching dentro de ella. Esta Evidence no inventa criticidad ni afirma cuál unidad concreta ganaría ese primer nivel |

Respuesta crítica: **sí**. Las tareas que comparten `itinerantUnitId` llegan como `RESOURCE_TASK` independientes. En particular, nueve tareas con identidad itinerante explícita aparecen así en el primer estado: cinco de `reality-unit-combined`, dos de `reality-unit-a` y dos de `reality-unit-b`. Esto no prueba ni requiere contigüidad; prueba que el selector ignora la identidad al construir su unidad de decisión.

## Geometría real por macro kind

| kind actual | representación | geometría/matching real |
|---|---|---|
| `SETUP_GROUP` | grupo completo de 17 tareas por política/espacio | **sí**: `createExactSetupBlockExplorer` enumera geometrías compactas completas y luego matching; el primer estado mide 144 geometrías y 191 matchings factibles |
| `ROUND_SYNCHRONIZATION` | política completa, 19 tareas en lanes | **sí**: explora starts de ronda y asignación/matching posterior; el dominio superior 684 es conservador |
| `TECHNICAL_CHAIN` | cadena ordenada completa de 3 tareas | **sí**: explorer de placements completos con adyacencia y continuidad contractuales; dominio 98 exacto |
| `JOINT` | todos los miembros del `jointGroupId` | **parcial pero suficiente para su contrato**: start común y colocación conjunta; no es una bolsa de starts individuales |
| `RESOURCE_TASK` | exactamente una tarea | **no**: sólo ordena y coloca starts individuales. Puede portar `itinerantUnitId`, pero no representa ni selecciona esa unidad |

Por tanto, no se demuestra `BLOCK_GEOMETRY_MISSING` para las unidades ya representadas por setup, round o chain. La falta causal anterior es que itinerant no se representa como unidad en absoluto; decidir su futura geometría sería prematuro y esta auditor no impone contigüidad.

## Primera violación y clasificación

La **primera violación concreta** ocurre antes de probar el primer start: durante la formación de `resourceItems`, `task:10169` y sus pares con unidad itinerante explícita quedan convertidos en macros individuales. A continuación, el MRV global la selecciona frente a unidades estructurales completas pendientes. Se demuestran, en orden causal:

1. **pérdida de identidad de unidad** en la capa de selección (no en los datos ni en hard validation);
2. **MRV global entre identidades/fases** como consecuencia inmediata;
3. **tarea flexible adelantando estructura pendiente**, sin necesitar etiquetar `RESOURCE_TASK` como una fase permanente.

Clasificación obligatoria: **`COMBINATION`**. Orden causal de corrección: **`UNIT_IDENTITY_MISSING` primero, luego `PHASE_SCOPE_ONLY`**. No debe diseñarse geometría de bloque hasta que el selector pueda conservar y elegir la identidad explícita; de lo contrario se optimizaría dentro de la bolsa equivocada.

## Inventario contemporáneo completo

El inventario siguiente es `macroSelectionSteps[0]`, no una regla derivada de nombres. `disp` es `hardResourceAvailabilityMinutes`; `dur` es duración total. “exacto/cota conservadora”, `geom` y `matching` son las métricas actuales serializadas. Participantes y espacios proceden del contrato expandido; `—` significa que el contrato no declara esa identidad. Las tareas de transporte y comidas se gestionan por sus autoridades propias y no son macros de este paso; las tareas individuales sin macro se posponen hasta que se vacía esta cascada, por lo que no tienen `domainSize` contemporáneo en `macroSelectionSteps[0]`.

| macro kind/id | task IDs | participantes | espacios | requiredResourceIds | itinerantUnitId | jointGroupId | setupFamilyId | round policy | technical-chain identity | secondaryContinuity/blockKey | dominio y métricas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| JOINT `joint:joint-group:joint.alfombra-roja.C06-C10` | `task:10069`, `task:10129` | C06, C10 | alfombra-roja | — | — | joint.alfombra-roja.C06-C10 | — | — | — | — | 99; exacto; disp=720; dur=20; tasks=2 |
| JOINT `joint:joint-group:joint.totales-post.C06-C10` | `task:10085`, `task:10144` | C06, C10 | totales-post | — | — | joint.totales-post.C06-C10 | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=2 |
| RESOURCE_TASK `resource:task:10001` | `task:10001` | C01 | p15-croma | — | — | — | — | — | — | — | 63; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10008` | `task:10008` | C01 | p14-pasillo | — | — | — | — | — | — | — | 65; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10012` | `task:10012` | C01 | p14-recursos | — | — | — | — | — | — | — | 65; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10015` | `task:10015` | C02 | p14-recursos | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10016` | `task:10016` | C02 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10023` | `task:10023` | C02 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10025` | `task:10025` | C02 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10029` | `task:10029` | C03 | p14-recursos | — | — | — | — | — | — | — | 101; exacto; disp=720; dur=15; tasks=1 |
| RESOURCE_TASK `resource:task:10030` | `task:10030` | C03 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10036` | `task:10036` | C03 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10038` | `task:10038` | C03 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10041` | `task:10041` | C04 | alfombra-roja | cam-3, cam-4, eva, son-1 | reality-unit-combined | — | — | — | — | — | 66; exacto; disp=720; dur=15; tasks=1 |
| RESOURCE_TASK `resource:task:10042` | `task:10042` | C04 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10049` | `task:10049` | C04 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10051` | `task:10051` | C04 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10054` | `task:10054` | C05 | p14-recursos | — | — | — | — | — | — | — | 98; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10055` | `task:10055` | C05 | p15-croma | — | — | — | — | — | — | — | 98; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10062` | `task:10062` | C05 | p14-pasillo | — | — | — | — | — | — | — | 101; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10070` | `task:10070` | C06 | p14-recursos | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10071` | `task:10071` | C06 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10079` | `task:10079` | C06 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10081` | `task:10081` | C06 | reality-hall-p14 | cam-3, cam-4, son-1 | reality-unit-combined | — | — | — | — | — | 59; exacto; disp=720; dur=30; tasks=1 |
| RESOURCE_TASK `resource:task:10082` | `task:10082` | C06 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10086` | `task:10086` | C07 | p14-recursos | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10087` | `task:10087` | C07 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10094` | `task:10094` | C07 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10096` | `task:10096` | C07 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10100` | `task:10100` | C08 | p14-recursos | — | — | — | — | — | — | — | 95; exacto; disp=720; dur=15; tasks=1 |
| RESOURCE_TASK `resource:task:10101` | `task:10101` | C08 | p15-croma | — | — | — | — | — | — | — | 98; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10107` | `task:10107` | C08 | p14-pasillo | — | — | — | — | — | — | — | 101; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10111` | `task:10111` | C08 | p14-recursos | — | — | — | — | — | — | — | 101; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10114` | `task:10114` | C09 | p14-recursos | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10115` | `task:10115` | C09 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10122` | `task:10122` | C09 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10124` | `task:10124` | C09 | reality-influencer | cam-3, son-1 | reality-unit-a | — | — | — | — | — | 68; exacto; disp=720; dur=30; tasks=1 |
| RESOURCE_TASK `resource:task:10125` | `task:10125` | C09 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10130` | `task:10130` | C10 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10137` | `task:10137` | C10 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10139` | `task:10139` | C10 | reality-manzano | cam-4, son-2 | reality-unit-b | — | — | — | — | — | 76; exacto; disp=720; dur=30; tasks=1 |
| RESOURCE_TASK `resource:task:10140` | `task:10140` | C10 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10145` | `task:10145` | C11 | p14-recursos | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10146` | `task:10146` | C11 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10152` | `task:10152` | C11 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10154` | `task:10154` | C11 | reality-buggy | cam-3, cam-4, son-1 | reality-unit-combined | — | — | — | — | — | 54; exacto; disp=720; dur=30; tasks=1 |
| RESOURCE_TASK `resource:task:10155` | `task:10155` | C11 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10159` | `task:10159` | C12 | p14-recursos | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10160` | `task:10160` | C12 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10167` | `task:10167` | C12 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10169` | `task:10169` | C12 | reality-control | cam-3, cam-4, eva, son-1 | reality-unit-combined | — | — | — | — | — | 51; exacto; disp=720; dur=30; tasks=1 |
| RESOURCE_TASK `resource:task:10170` | `task:10170` | C12 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10173` | `task:10173` | C13 | alfombra-roja | cam-3, cam-4, eva, son-1 | reality-unit-combined | — | — | — | — | — | 66; exacto; disp=720; dur=15; tasks=1 |
| RESOURCE_TASK `resource:task:10174` | `task:10174` | C13 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10182` | `task:10182` | C13 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10184` | `task:10184` | C13 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10188` | `task:10188` | C14 | p14-recursos | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10189` | `task:10189` | C14 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10196` | `task:10196` | C14 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10198` | `task:10198` | C14 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10201` | `task:10201` | C15 | p14-recursos | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10202` | `task:10202` | C15 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10209` | `task:10209` | C15 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10211` | `task:10211` | C15 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10216` | `task:10216` | C16 | p14-recursos | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10217` | `task:10217` | C16 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10223` | `task:10223` | C16 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10225` | `task:10225` | C16 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10228` | `task:10228` | C17 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10235` | `task:10235` | C17 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10237` | `task:10237` | C17 | reality-hall-p14 | cam-4, son-2 | reality-unit-b | — | — | — | — | — | 76; exacto; disp=720; dur=30; tasks=1 |
| RESOURCE_TASK `resource:task:10238` | `task:10238` | C17 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10241` | `task:10241` | C18 | p14-recursos | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10242` | `task:10242` | C18 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10248` | `task:10248` | C18 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10250` | `task:10250` | C18 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10254` | `task:10254` | C19 | p14-recursos | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10255` | `task:10255` | C19 | p15-croma | — | — | — | — | — | — | — | 104; exacto; disp=720; dur=10; tasks=1 |
| RESOURCE_TASK `resource:task:10261` | `task:10261` | C19 | p14-pasillo | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| RESOURCE_TASK `resource:task:10263` | `task:10263` | C19 | reality-corner-music | cam-3, son-1 | reality-unit-a | — | — | — | — | — | 63; exacto; disp=720; dur=30; tasks=1 |
| RESOURCE_TASK `resource:task:10264` | `task:10264` | C19 | p14-recursos | — | — | — | — | — | — | — | 107; exacto; disp=720; dur=5; tasks=1 |
| ROUND_SYNCHRONIZATION `round:round-synchronization:a2-totales-rounds` | `task:10014`, `task:10028`, `task:10040`, `task:10053`, `task:10068`, `task:10084`, `task:10099`, `task:10113`, `task:10128`, `task:10143`, `task:10158`, `task:10172`, `task:10187`, `task:10200`, `task:10214`, `task:10227`, `task:10240`, `task:10253`, `task:10266` | C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C15, C16, C17, C18, C19 | totales-1, totales-coreo | — | — | — | — | START_TOGETHER_WHILE_ALL_LANES_ACTIVE; 5 min preparación entre rondas | — | — | 684; cota conservadora; disp=720; dur=570; tasks=19 |
| SETUP_GROUP `setup:space:3009` | `task:10020`, `task:10026`, `task:10059`, `task:10066`, `task:10075`, `task:10091`, `task:10097`, `task:10119`, `task:10126`, `task:10134`, `task:10141`, `task:10156`, `task:10178`, `task:10185`, `task:10212`, `task:10232`, `task:10251` | C02, C05, C06, C07, C09, C10, C11, C13, C15, C17, C18 | p15-estrellas-sillon | — | — | — | estrellas, sillon | — | — | secondaryContinuity=REQUIRED (espacio); bloque por familia | 191; cota conservadora; disp=720; dur=85; tasks=17; geom=144; matching=191 |
| TECHNICAL_CHAIN `technical-chain:task:10268` | `task:10267`, `task:10268`, `task:10269` | — | reality-control, technical-transfer, totales-post | cam-3, cam-4, eva, son-1 | — | — | — | — | technical.reality-eva-transfer-totales-post | — | 98; exacto; disp=720; dur=30; tasks=3 |

## Cierre requerido y delta A3-018

- **Primera decisión incorrecta demostrada:** seleccionar `resource:task:10169` por MRV global (`mixed-domain-semantic-policy`) antes de escoger fase/unidad estructural; la incorrección nace al construirla como macro individual.
- **Identidad/unidad perdida o desplazada:** se pierde para selección la identidad `itinerantUnitId=reality-unit-combined`; quedan además desplazadas las unidades contemporáneas round, setup, technical chain y joint. No se afirma que sus tareas deban ser contiguas.
- **Infraestructura reutilizable:** campos contractuales ya proyectados (`itinerantUnitId`, `jointGroupId`, `setupFamilyId`), registros `technicalChains` y `roundSynchronizations`, `macroSelectionSteps`, medidas hard/Future Feasibility existentes y explorers de setup/round/chain con separación geometría→matching.
- **Delta productivo mínimo recomendado para A3-018:** hacer que la construcción del universo de decisión conserve una clave de unidad operativa explícita y que el selector elija primero entre unidades/fases elegibles usando únicamente autoridades hard/Future Feasibility existentes; después reutilizar el dominio/MRV actual dentro de la unidad elegida. El primer delta debe cubrir la identidad itinerante hoy perdida y mantener como unidades las identidades ya representadas. La geometría concreta de itinerant queda fuera hasta demostrar su contrato.
- **Qué NO debe hacerse:** no convertir `RESOURCE_TASK` en “fase 3”; no hardcodear IDs, nombres, orden A2 ni una categoría de recurso crítico; no agrupar por recurso compartido; no inventar threshold/scoring; no implementar todavía `activeUnit`, phase gate o nuevo scoring; no imponer contigüidad; no modificar domains, hard constraints, matching, meals, transport, presupuesto o publicación a partir de este diagnóstico.

No se hizo merge.
