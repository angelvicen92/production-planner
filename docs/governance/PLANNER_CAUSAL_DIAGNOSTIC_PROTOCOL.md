# OptiPlan — Planner Causal Diagnostic Protocol

Versión 1.0 · 13 de agosto de 2026  
Estado: documento de gobierno operativo del repositorio

## Propósito

Este protocolo conserva como capacidad permanente el diagnóstico causal read-only de Planner Next introducido en #708.

No define reglas de dominio ni heurísticas nuevas. Implementa el principio del Protocolo Maestro de que la Evidence prevalece sobre la intuición y debe convertir comprensión demostrada en aprendizaje reutilizable.

## Cuándo se aplica

Antes de modificar ordering, candidate domains, matching, Future Feasibility, reparto de presupuesto, backtracking o cualquier otra política de búsqueda cuando:

- Full A2 u otro benchmark representativo agota presupuesto o se estanca;
- una optimización libera ramas pero no mejora el progreso estructural;
- varias iteraciones no producen el efecto esperado;
- se necesita explicar qué decisión previa cierra alternativas posteriores.

## Capacidad disponible

Planner Next puede ejecutar el camino exacto con `causalDiagnostic` activado sin cambiar el resultado de búsqueda ni consumir ramas adicionales por la instrumentación.

La Evidence causal incluye, cuando aplica:

- `waterfallByDepth`: ramas ya consumidas por profundidad y fase;
- `feederByDepth`: starts evaluados, válidos e inválidos y choices que llegan a feeder;
- `feederRejections`: causa canónica del rechazo y blocker colocado;
- `diagnosticReport`: agregados derivados del benchmark, incluida la profundidad crítica y blockers dominantes.

La fuente dinámica de referencia para Full A2 es `docs/evidence/A2-FULL-EXEC-001-first-execution.json`, regenerada por el benchmark canónico. Los números, IDs y porcentajes de una ejecución nunca se convierten en reglas permanentes.

## Regla operativa

1. Reconstruir `main` y la Evidence vigente.
2. Si el problema es de búsqueda, leer primero el `causalDiagnostic` existente o regenerarlo mediante el benchmark autoritativo.
3. Localizar la profundidad/fase que concentra el coste o el bloqueo.
4. Identificar rechazo, recurso/autoridad y decisión previa causal.
5. Formular una única hipótesis que actúe sobre ese mecanismo.
6. Cambiar búsqueda sólo si existe una relación causal demostrable y una validación objetiva.
7. Tras el cambio, regenerar la Evidence y comprobar si el blocker se redujo, se desplazó o desapareció.

No se debe optimizar un consumidor sólo porque tenga muchas ramas si la Evidence causal muestra que no es el mecanismo que limita el progreso.

## Invariantes

- Diagnóstico read-only: no cambia orden, dominios, hard constraints, presupuesto ni `ledger.consume`.
- No reevalúa candidatos gratis ni introduce barridos ocultos.
- `canPlaceTask` y las autoridades canónicas siguen gobernando la validez.
- Las recomendaciones se derivan de Evidence actual; nunca hardcodean IDs, conteos o porcentajes de fixtures.
- Activar/desactivar diagnóstico debe preservar status, planificación, fingerprints, branches, profundidad, prunes/backtracks y stop reason.
- El planning humano sigue siendo benchmark, nunca seed o hint.

## Condición de salida

La instrumentación permanece porque aporta comprensión reutilizable y está cubierta por tests de neutralidad. Cada diagnóstico concreto es temporal: sus conclusiones sólo son válidas para el head y benchmark que las produjeron.

El siguiente cambio debe responder a la Evidence vigente, no repetir automáticamente la recomendación de una ejecución anterior.
