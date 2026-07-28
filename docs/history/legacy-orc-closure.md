# Legacy ORC Closure

## Estado final

- V3 permanece como fallback productivo temporal.
- V4 y ORC quedan congelados.
- Planner Next se desarrolla de forma aislada.
- Planner Next todavía no está integrado en producción.

## Motivo del cierre

La línea anterior acumuló una complejidad excesiva a través de múltiples capas de búsqueda, reparación y Evidence, sin demostrar una mejora operativa. Sus resultados en el benchmark real quedaron incompletos. Este trabajo sirvió para aprender qué enfoques no estaban produciendo el resultado esperado, y la evolución pasa al método constructivo por bloques definido en SPEC-07.

## Evidencia final

- ID 323 alcanzó 132 de 174 tareas productivas.
- Dejó 42 pendientes.
- Agotó 80 ciclos aceptados.
- No recuperó el baseline histórico de 170 de 174.
- ID 324 alcanzó 66 de 174 tareas productivas.
- Dejó 108 pendientes.
- Terminó con `NO_VIABLE_ANCHOR`.
- Fue una regresión y no fue aceptado.

## Decisión

- No se continuarán nuevas iteraciones sobre V4 u ORC.
- Su código permanece disponible por compatibilidad, referencia histórica, tests y fallback.
- Sólo se reabrirá esa línea por una decisión explícita del usuario.
- La nueva evolución se realizará únicamente en `engine/planner-next`.

## Política de artefactos

- Los JSON ORC históricos han sido retirados del árbol actual.
- Permanecen recuperables desde el historial Git.
- Los scripts históricos de validación permanecen.
- No se versionarán artefactos fallidos.
- Se conservará únicamente el artefacto aceptado más reciente de Planner Next.

## Estado de Planner Next

NEXT-001:

- 16 de 16 tareas.
- Hard-valid.
- Flujo principal continuo 13:00–15:00.
- Fingerprint: `070b4d4a2259b629b8e818fd6e34ea4bba63c05f87d60b4b5f4cbfc7b1b6848b`.

NEXT-002:

- Contrato defensivo.
- Presupuestos lógicos explícitos.
- Escenario adversarial completo.
- 2 backtracks reales.
- Con `maxBacktracks = 0` termina en `BACKTRACK_BUDGET_EXHAUSTED`.
- Cero violaciones.
- Determinismo confirmado.

Planner Next todavía sólo cubre el flujo principal y los feeders vocales.
