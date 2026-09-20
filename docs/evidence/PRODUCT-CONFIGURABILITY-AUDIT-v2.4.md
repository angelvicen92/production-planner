# Auditoría de configurabilidad de producto — Fuente 04 v2.4

**Base auditada:** `9f94ee3660e2dfa942ef04b786e2013eea4c2512` (2026-09-20).

La autoridad canónica machine-readable es `shared/configurability.ts`. El inventario anterior de agosto y su schema se retiran porque sus estados no expresaban el recorrido end-to-end exigido por Fuente 04 v2.4.

## Resultado

| Estado | Cantidad |
|---|---:|
| PRODUCTIVE | 11 |
| PARTIAL | 8 |
| MISSING | 2 |
| BLOCKED | 0 |
| NOT_APPLICABLE | 0 |

Un jefe de producción ya puede inspeccionar, sin sesión Assisted, jornada/comidas, participantes, tareas/dependencias, espacios/capacidad, recursos, unidades itinerantes, transporte, optimización y decisiones protegidas. La vista distingue origen, disponibilidad, validación y fingerprints sólo donde la autoridad productiva los demuestra.

Todavía no puede configurar el contrato de bloques `AUTO_MIN_FEASIBLE` / `FIXED_COUNT(n)`, ni el tiempo máximo general/día y `RUN_OVERRIDE` de una ScopeProposal. Setups, operaciones ancladas/conjuntas, rondas y cadenas técnicas siguen siendo PARTIAL: que existan contratos o consumidores de motor no constituye recorrido de producto completo.

## Gaps P0, en orden causal

1. **BLOCK_COUNT_POLICY:** no existe persistencia ni proyección productiva de `AUTO_MIN_FEASIBLE` / `FIXED_COUNT(n)`; por tanto no se puede exigir el conteo fijo sin relajación silenciosa.
2. **SEARCH_POLICY_BUDGET:** el presupuesto del motor no tiene todavía un contrato de producto general/día completo y trazable.
3. **ASSISTED_PROPOSAL_TIME_LIMIT:** faltan default general, override diario y `RUN_OVERRIDE`; hasta implementarlos, `TIME_LIMIT_REACHED`, `BUDGET_EXHAUSTED` e `INFEASIBLE` sólo se representan como resultados causales distintos y no se inventan desde la UI.

## Siguiente slice recomendado (no implementado aquí)

**Política de bloques end-to-end**: persistencia general + snapshot automático + override diario + UI tipada + proyección/validación de `AUTO_MIN_FEASIBLE` y `FIXED_COUNT(n)`. Maximiza paridad producto→Planner Next, tiene una semántica acotada y puede desarrollarse sin modificar los algoritmos ni el trabajo del PR #963.
