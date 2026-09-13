# A3-ORCH-REAL-024 — orquestador jerárquico post-core

## Resultado

Se sustituyó la selección MRV sobre la bolsa global por la secuencia `descriptor dinámico → scope elegible → MRV del scope → agenda/geometría contractual → Future Feasibility → recurse`. Un dominio exacto cero sigue siendo la única excepción con precedencia global. La identidad de `kind` sólo selecciona geometría contractual; no se persiste una fase ni se deriva una fase de nombres, IDs o duración.

Las tareas ya pertenecientes a joint, setup, round, chain o itinerant se excluyen antes de agrupar recursos. Las restantes se asignan, como máximo, a un único recurso explícito compartido. No se construyen componentes conexas: una tarea multirrecurso elige determinísticamente la autoridad con menor capacidad disponible y sigue siendo una sola tarea.

## Gate Full A2 — 5.000 ramas

Comando:

```text
PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000 PLANNER_NEXT_FULL_A2_CAUSAL_DIAGNOSTIC=true npx tsx engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts
```

- Estado: `BRANCH_BUDGET_EXHAUSTED`; `CORE=1599`, `STANDALONE=3401`, total `5000`; wall-clock observado: aproximadamente 110 s.
- Inventario del primer scope elegible: `SCARCE_OPERATION=2`: `plan-resource:4002` (51 miembros, dominio conservador 65) y `plan-resource:4003` (19 miembros, dominio conservador 63). Los restantes scopes no compiten en ese MRV.
- Primera transición: `SCARCE_OPERATION/resource-scope:4002` → `SCARCE_OPERATION/resource-scope:4003` → `CONTINUOUS_STRUCTURE/round-synchronization:a2-totales-rounds`.
- Unidades cerradas completamente antes de avanzar: dos `RESOURCE_SCOPE`, con 51 + 19 = **70 tareas**. El frontier post-core material alcanzado es 70 asignaciones; quedan 98 obligaciones post-core en el frontier diagnóstico más profundo.
- Ramas por scope: las 3.401 ramas standalone se consumen en los dos resource scopes y la entrada al round; 306 backtracks standalone. El ledger vigente no desglosa aún contadores por scope.
- First blocker: `PENDING_ARRIVAL_DEADLINE`, al explorar geometrías/asignaciones del primer resource scope (deadline 530). En el frontier profundo, los rechazos dominantes al intentar la geometría de round son `OVERLAP_COACH` y `TRANSITION_COACH`.
- Primeras decisiones internas del primer scope (unidad `plan-resource:4002`, MRV exacto por tarea): `10008(66)`, `10012(65)`, `10100(94)`, `10054(95)`, `10062(97)`, `10107(96)`, `10111(95)`, `10029(95)`, `10070(92)`, `10086(90)`, `10114(87)`, `10145(84)`, `10216(82)`, `10241(80)`, `10254(78)`, `10015(79)`, `10159(78)`, `10137(79)`, `10140(78)`, `10223(77)`. Cada número entre paréntesis es el número de starts de la tarea al construir esa asignación; cada start se valida con hard constraints, comidas, transporte/prerrequisitos y Future Feasibility antes de recurse.
- Geometría: para los resource scopes la agenda se construye dentro de la disponibilidad explícita del recurso, respetando disponibilidad individual, transiciones, comidas y participantes. `PREFERRED` conserva el orden de compactación existente sin hacerlo hard; `OFF` no añade contigüidad y `REQUIRED` sigue gobernado por su validador hard existente. Round, setup, chain, joint e itinerant reutilizan sus exploradores previos.
- CAM1/CAM2, Reality, Totales, setup, coaches, comidas y transport: no se alcanza hoja completa, por lo que no existe certificación terminal. Se alcanzó Totales (round) después de cerrar ambos scopes de cámara. Los probes de comida y transporte permanecieron activos; hubo 94 checks de reserva operacional, 9 podas y 4 reparaciones.
- Determinismo: replay diagnóstico ON/OFF idéntico (`exactMatch=true`), ambos con 1599/3401 ramas y mismo estado terminal.
- Publicación: `COMPLETE=0`, `FULL_HARD_VALID=0`, cero obligaciones publicadas.

No se ejecutó 20k: aunque existe cambio cualitativo y cierre de scopes, esta iteración está limitada a validar primero el nuevo gate de 5k y su causalidad.

## Comparación causal y riesgo residual

Baseline: una bolsa de 78 macros seleccionaba primero `itinerant-team:5003` y llegaba al frontier 129 intercalando unidades. Candidate: el primer MRV sólo ve dos resources scopes; cierra de forma consecutiva sus 70 tareas y entra después en Totales. No es la misma secuencia ni un mero cambio nominal.

La geometría de resource scope se representa como agenda de starts exactos construida incrementalmente, no como un intervalo contiguo obligatorio: esto es necesario para `OFF` y para permitir split con `PREFERRED`. La selección interna todavía materializa la geometría y la identidad conjuntamente mediante MRV en vez de enumerar por adelantado todas las combinaciones completas; enumerarlas sería prohibitivamente grande. El conjunto de starts sigue siendo completo y el backtracking permanece dentro de la unidad antes de volver a decisiones anteriores.

`QUALITATIVE_PROGRESS = YES`: criterio C, cierre completo y no intercalado de dos scopes explícitos (70 tareas), seguido de entrada demostrada en la capa constructiva de sincronización de rondas. No se reclama solución completa.
