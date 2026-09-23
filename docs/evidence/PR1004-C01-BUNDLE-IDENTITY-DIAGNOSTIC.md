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
