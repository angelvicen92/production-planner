# PR #1004 — diagnóstico de identidad de bundle para C01

Head diagnosticado: `9feb88d87a2953697dbc1a181ba5d00e9763bdb2`. Arquitectura de referencia: la primera arquitectura autorizada que en el padre `bd3a8c761dc616224dac6cecd5fde05b029efdc7` produjo la propuesta de Stage 1.

## Resultado de la pregunta de decisión

**No.** En esa misma arquitectura y en ese mismo bloque no existe una posición cronológicamente anterior, compatible y future-safe a la que C01 pueda desplazarse intercambiándose con otro participante. Por contrato de la tarea no se añade una heurística de matching.

## Traza causal

- `task:10002` (C01, `participant:201`) pertenece al bloque `plan-resource:4005`.
- La arquitectura fija los slots cronológicos de ese bloque en `900`, `915`, `930`, `990`, `1005`, `1020`, `1035` y `1050`. El resto de slots anteriores (`705`–`885`) pertenece a `plan-resource:4004`; no es un dominio intercambiable para C01.
- Antes de participant Future Feasibility, el grafo nominal de bundles contiene para C01 una sola arista estructuralmente válida: la posición interna `17`, cuyo Main spot es `900`–`915`. No hay otra posición de ese bloque para C01, anterior o posterior, que sobreviva a las autoridades estructurales del bundle.
- Compiten por ese mismo spot nominal `task:10017`, `task:10031`, `task:10043`, `task:10161`, `task:10175`, `task:10190` y `task:10203`. Esos participantes tienen además otras aristas en el bloque; C01 no.
- En el padre, el matching asigna C01 a `900` porque es su única arista válida, no por el desempate estable entre identidades. Aunque `900` es tarde respecto al día completo, es el primer slot del bloque `plan-resource:4005` en esta arquitectura.
- Después del filtro participant Future Feasibility no queda ninguna posición para C01: la arista `task:10002@17` (`900`–`915`) se rechaza como `FUTURE_PARTICIPANT_TASK_MEAL_INCOMPATIBLE`, por incompatibilidad conjunta entre `task:10001` (CROMA) y `task:10013` (SODEXO). Se conserva así el rechazo requerido de C01 @900.

La autoridad que impide una posición anterior es primero **pertenencia al bloque**: los slots anteriores a `900` pertenecen a `plan-resource:4004`. Dentro de `plan-resource:4005`, `900` ya es el primer slot. Las demás autoridades estructurales reducen el grafo de C01 a esa única arista y Future Feasibility la elimina; no existe un empate nominal sobre el que pueda actuar la criticidad.

## Reproducción y siguiente blocker

La inspección se realizó sobre el fixture canónico de Stage 1 enumerando `authorizedPipelineArchitectures`, preparando la primera arquitectura con `preparePipelineBundleGraph` y leyendo las aristas de `task:10002` y sus competidores. La misma inspección se ejecutó en un worktree detached del padre para separar el grafo nominal anterior al filtro del grafo actual.

`A2-ASSIST-1` y `A2-ASSIST-8` se regeneraron sin alterar arquitectura ni presupuesto. Ambos permanecen sin propuesta. Tras conservar el rechazo future-safe de C01 @900, el siguiente blocker observable es `CORE_BRANCH_BUDGET_EXHAUSTED` en `constructExactMainAndFeederCore` (`99,475` ramas core y `525` standalone de `100,000`). Conforme al alcance, no se intenta corregir ese segundo problema.

## Enumeración focal de arquitecturas (continuación en `1eb175d`)

Se repitió el diagnóstico con el fixture canónico de Stage 1, sin usar horarios humanos como semilla o witness. El probe fue temporal y no forma parte del producto. Para separar límite de generación y validez se ejecutó el generador con `maximumPatterns = 1_000_000`; devolvió **75.582 patrones** y `exhausted = false`. La distribución completa por número de runs fue:

| runs | patrones |
|---:|---:|
| 2 | 2 |
| 3 | 17 |
| 4 | 140 |
| 5 | 525 |
| 6 | 1.890 |
| 7 | 4.095 |
| 8 | 8.400 |
| 9 | 11.550 |
| 10 | 14.700 |
| 11 | 13.230 |
| 12 | 10.584 |
| 13 | 6.174 |
| 14 | 2.940 |
| 15 | 1.050 |
| 16 | 240 |
| 17 | 45 |

Con el límite productivo `maxPatterns = 200`, el generador devuelve 200 y `exhausted = true`, pero el prefijo accidental contiene sólo **1/2** patrones de 2 runs, **4/17** de 3 runs y **24/140** de 4 runs; además intercala familias de 5 a 9 runs. Por tanto el límite actual no representa el mejor frontier estructural.

La familia mínima que llega a producir un witness nominal en Stage 1 es la de **4 runs** (2 y 3 runs quedan descartados por las autoridades estructurales/nominales). La enumeración exhaustiva de sus 140 patrones y de sus timelines autorizados encontró un único witness nominal completo: el patrón de runs

`4004×8 → 4005×3 → 4004×3 → 4005×5`

con slots

`705, 720, 735, 750, 765, 855, 870, 885, 900, 915, 930, 945, 960, 975, 990, 1005, 1020, 1035, 1050`.

Ese patrón ya pertenece al prefijo productivo de 200. Es exactamente la arquitectura diagnosticada arriba: el primer slot del blockKey `plan-resource:4005` es 900; `task:10002` sólo conserva nominalmente la posición 17 y Participant Future Feasibility la elimina por `FUTURE_PARTICIPANT_TASK_MEAL_INCOMPATIBLE`. Ninguno de los otros 139 patrones de 4 runs alcanza un witness nominal completo: la primera autoridad que los descarta es `proveMainFeederArchitectureImpossible` cuando existe una prueba estructural concluyente y, para los que superan esa prueba, `materializeNominalPipelineWitness` (capacidad/geometría de feeder, matching de perfiles Main, geometría conjunta de llegada u Operational Meal Future Feasibility). Por ello no llegan a existir aristas participant-future-safe de C01 ni un perfect matching posterior que registrar.

### Decisión

El resultado es **CASO C**: la familia mínima relevante está completamente explorada y no contiene otra arquitectura que adelante el bloque de C01 y conserve una arista future-safe. El hecho de que 116 de sus 140 patrones queden fuera del prefijo de 200 demuestra un defecto real del frontier, pero corregirlo no resuelve el bloqueo causal de C01: todos esos patrones omitidos son invalidados antes de producir el grafo nominal completo. Por la regla de no arreglar un segundo problema distinto, **no se modifica `generateMainFlowPatterns` en este delta**.

La siguiente familia admitida por la configuración es la de **5 runs**: `maxBlocksByKey = 19` no impone un techo de cuatro runs. Investigar esa familia sería la siguiente opción estructural, pero queda expresamente fuera de esta iteración; no se aumenta `maxPatterns`, no se debilita Future Feasibility y no se introduce criticidad especial para C01.
